/**
 * HiFiSplatRenderer
 *
 * Production-quality Gaussian splat renderer that addresses every limitation
 * of the PoC GaussianSplatRenderer:
 *
 *  1. INSTANCED QUADS instead of gl.POINTS — no driver point-size cap,
 *     proper per-splat clipping, sub-pixel precision.
 *
 *  2. FULL 3D→2D COVARIANCE PROJECTION — the quaternion + 3-axis anisotropic
 *     scale are combined into a 3×3 covariance matrix Σ, which is projected
 *     through the Jacobian of the perspective transform to produce a 2D conic
 *     rendered per-fragment with a true Gaussian kernel.
 *
 *  3. CPU DEPTH SORTING + FRUSTUM CULLING — correct back-to-front alpha
 *     blending via 16-bit radix sort; frustum planes extracted from the VP
 *     matrix remove ~50% of splats per frame.
 *
 *  4. EXPLICIT OPACITY — per-splat alpha stored in the buffer, not baked
 *     into color.
 *
 * Buffer layout: hi-fi 16-float (see GaussianSeedBuffer.js):
 *   [0-2]   position xyz
 *   [3-5]   scale xyz (anisotropic)
 *   [6-9]   quaternion wxyz
 *   [10-12] color rgb
 *   [13]    opacity
 *   [14]    depth
 *   [15]    padding
 */

import { GAUSSIAN_HIFI_STRIDE } from './GaussianSeedBuffer.js';
import { sortAndCullSeeds, reorderBuffer } from './SplatSorter.js';

/* ------------------------------------------------------------------ */
/*  Shader sources                                                     */
/* ------------------------------------------------------------------ */

const HIFI_VERTEX = `#version 300 es
precision highp float;

// Per-vertex: unit quad corners (instanced geometry)
in vec2 a_quadCorner;   // [-1,-1], [1,-1], [1,1], [-1,1]

// Per-instance: splat data (16-float hi-fi layout)
in vec3  a_position;    // offset 0
in vec3  a_scale3;      // offset 3  (anisotropic sx, sy, sz)
in vec4  a_orientation; // offset 6  (quaternion w, x, y, z)
in vec3  a_color;       // offset 10
in float a_opacity;     // offset 13

uniform mat4  u_viewMatrix;
uniform mat4  u_projMatrix;
uniform vec2  u_viewport;      // canvas width, height in pixels
uniform float u_time;
uniform float u_animate;       // 0.0 = static, 1.0 = animated

// Outputs to fragment shader
out vec2  v_uv;        // pixel offset from splat centre within quad
out vec3  v_color;
out float v_opacity;
out float v_conic_a;   // 2D inverse covariance (symmetric 2×2, 1/pixel² units)
out float v_conic_b;   // packed as (a, b, c) where M = [[a,b],[b,c]]
out float v_conic_c;

// Quaternion to rotation matrix (column-major 3×3)
mat3 quatToMat3(vec4 q) {
    float w = q.x, x = q.y, y = q.z, z = q.w;
    float x2 = x+x, y2 = y+y, z2 = z+z;
    float xx = x*x2, xy = x*y2, xz = x*z2;
    float yy = y*y2, yz = y*z2, zz = z*z2;
    float wx = w*x2, wy = w*y2, wz = w*z2;
    return mat3(
        1.0-(yy+zz), xy+wz,       xz-wy,
        xy-wz,       1.0-(xx+zz), yz+wx,
        xz+wy,       yz-wx,       1.0-(xx+yy)
    );
}

void main() {
    // ---- Build 3D covariance Σ = R·S·S^T·R^T ----------------------
    mat3 R = quatToMat3(a_orientation);
    mat3 S = mat3(
        a_scale3.x, 0.0,        0.0,
        0.0,        a_scale3.y, 0.0,
        0.0,        0.0,        a_scale3.z
    );
    mat3 RS = R * S;

    // ---- Transform splat centre to view space ----------------------
    vec4 viewPos = u_viewMatrix * vec4(a_position, 1.0);
    float tz = -viewPos.z;  // camera looks down -Z, so tz > 0 is in front

    if (tz < 0.1) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // ---- Focal lengths in PIXEL space ------------------------------
    // proj[0][0] = 1/tan(fovX/2) in NDC; multiply by viewport/2 → pixels
    float fx = u_projMatrix[0][0] * u_viewport.x * 0.5;
    float fy = u_projMatrix[1][1] * u_viewport.y * 0.5;
    float tz2 = tz * tz;

    // Clamp view-space position to prevent extreme Jacobian at edges
    float tx = clamp(viewPos.x, -1.3 * tz, 1.3 * tz);
    float ty = clamp(viewPos.y, -1.3 * tz, 1.3 * tz);

    // ---- Jacobian of perspective projection (pixel space) ----------
    // J = [[fx/tz, 0,     fx*tx/tz²],
    //      [0,     fy/tz, fy*ty/tz²]]
    //
    // Applied to columns of RS_view = ViewRot * R * S
    mat3 viewRot = mat3(u_viewMatrix);
    mat3 RS_view = viewRot * RS;

    // M = J * RS_view → 2×3 matrix, columns j0, j1, j2
    vec2 j0 = vec2(
        fx * (RS_view[0].x / tz + tx * RS_view[0].z / tz2),
        fy * (RS_view[0].y / tz + ty * RS_view[0].z / tz2)
    );
    vec2 j1 = vec2(
        fx * (RS_view[1].x / tz + tx * RS_view[1].z / tz2),
        fy * (RS_view[1].y / tz + ty * RS_view[1].z / tz2)
    );
    vec2 j2 = vec2(
        fx * (RS_view[2].x / tz + tx * RS_view[2].z / tz2),
        fy * (RS_view[2].y / tz + ty * RS_view[2].z / tz2)
    );

    // Σ_2D = M * M^T = Σ(j_i · j_i^T) — pixel² space, symmetric 2×2
    float sig_a = j0.x*j0.x + j1.x*j1.x + j2.x*j2.x;
    float sig_b = j0.x*j0.y + j1.x*j1.y + j2.x*j2.y;
    float sig_c = j0.y*j0.y + j1.y*j1.y + j2.y*j2.y;

    // Low-pass filter: 0.3 pixel² prevents singularities when
    // a splat is viewed edge-on (matches reference 3DGS implementation)
    sig_a += 0.3;
    sig_c += 0.3;

    // ---- Invert Σ_2D for fragment shader conic (1/pixel² units) ---
    float det = sig_a * sig_c - sig_b * sig_b;
    if (det < 1e-6) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    float inv_det = 1.0 / det;
    v_conic_a =  sig_c * inv_det;
    v_conic_b = -sig_b * inv_det;
    v_conic_c =  sig_a * inv_det;

    // ---- Compute quad extent from eigenvalues of Σ_2D (pixels²) ---
    float mid = 0.5 * (sig_a + sig_c);
    float disc = sqrt(max(0.0, (sig_a - sig_c) * (sig_a - sig_c) + 4.0 * sig_b * sig_b));
    float lambda_max = mid + 0.5 * disc;

    // 3-sigma radius in pixels
    float radius = 3.0 * sqrt(max(0.1, lambda_max));
    radius = clamp(radius, 2.0, 1024.0);

    // ---- Project centre to clip space ------------------------------
    vec4 clipPos = u_projMatrix * viewPos;

    // Offset quad corners: convert pixel radius to clip-space offset
    vec2 offset_clip = a_quadCorner * radius * 2.0 / u_viewport * clipPos.w;
    gl_Position = clipPos + vec4(offset_clip, 0.0, 0.0);

    // UV for fragment: pixel offset from splat centre
    v_uv = a_quadCorner * radius;

    // ---- Pass colour and opacity -----------------------------------
    v_color = a_color;
    v_opacity = a_opacity;

    // Optional animation
    if (u_animate > 0.5) {
        float h = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float twinkle = 0.85 + 0.15 * sin(u_time * 3.0 + h * 6.2832);
        v_opacity *= twinkle;
    }
}
`;

const HIFI_FRAGMENT = `#version 300 es
precision highp float;

in vec2  v_uv;
in vec3  v_color;
in float v_opacity;
in float v_conic_a;
in float v_conic_b;
in float v_conic_c;

uniform float u_intensity;

out vec4 outColor;

void main() {
    // Evaluate 2D Gaussian using the inverse covariance (conic)
    // power = -0.5 * [u,v] · Σ⁻¹ · [u,v]^T
    //       = -0.5 * (a*u² + 2*b*u*v + c*v²)
    float power = -0.5 * (v_conic_a * v_uv.x * v_uv.x +
                           2.0 * v_conic_b * v_uv.x * v_uv.y +
                           v_conic_c * v_uv.y * v_uv.y);

    if (power > 0.0) discard;  // outside the ellipse (shouldn't happen, but safety)
    if (power < -8.0) discard; // negligible contribution (exp(-8) ≈ 0.00034)

    float alpha = v_opacity * exp(power);
    if (alpha < 0.002) discard;

    // Saturate alpha (clamp to [0, 0.99] to prevent fully opaque splats
    // from blocking everything behind them due to floating-point issues)
    alpha = min(alpha, 0.99);

    vec3 color = v_color * (0.5 + u_intensity * 0.5);

    // Premultiplied alpha output
    outColor = vec4(color * alpha, alpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Renderer class                                                     */
/* ------------------------------------------------------------------ */

export class HiFiSplatRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     * @param {string}  [options.blendMode='premultiplied']
     * @param {boolean} [options.animate=false]
     * @param {number}  [options.intensity=1.0]
     * @param {boolean} [options.frustumCull=true]
     * @param {boolean} [options.depthSort=true]
     */
    constructor(gl, {
        blendMode = 'premultiplied',
        animate = false,
        intensity = 1.0,
        frustumCull = true,
        depthSort = true,
    } = {}) {
        this.gl = gl;
        this.blendMode = blendMode;
        this.animate = animate;
        this.intensity = intensity;
        this.frustumCull = frustumCull;
        this.depthSort = depthSort;

        this.program = null;
        this.vao = null;
        this.quadVBO = null;
        this.quadIBO = null;
        this.instanceVBO = null;
        this.count = 0;
        this.uniforms = {};

        // Keep raw seeds for CPU sorting
        this._seeds = [];
        this._hifiBuffer = null;

        // Stats
        this.stats = {
            totalSplats: 0,
            visibleSplats: 0,
            culledSplats: 0,
            sortTimeMs: 0,
        };

        this._init();
    }

    /* -------------------------------------------------------------- */
    /*  Initialisation                                                 */
    /* -------------------------------------------------------------- */

    _init() {
        const gl = this.gl;

        // Compile shaders
        const program = gl.createProgram();
        const vert = this._compileShader(gl.VERTEX_SHADER, HIFI_VERTEX);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, HIFI_FRAGMENT);
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('HiFiSplatRenderer link error: ' + gl.getProgramInfoLog(program));
        }
        this.program = program;

        // Create VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // ---- Quad geometry (shared across all instances) ----
        // Unit quad: 4 vertices, 2 triangles
        const quadVerts = new Float32Array([
            -1, -1,
             1, -1,
             1,  1,
            -1,  1,
        ]);
        const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

        const cornerLoc = gl.getAttribLocation(program, 'a_quadCorner');
        gl.enableVertexAttribArray(cornerLoc);
        gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(cornerLoc, 0); // per-vertex

        this.quadIBO = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIBO);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices, gl.STATIC_DRAW);

        // ---- Instance buffer (per-splat data) ----
        this.instanceVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);

        const stride = GAUSSIAN_HIFI_STRIDE * 4; // bytes

        // a_position: vec3 at offset 0
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(posLoc, 1);

        // a_scale3: vec3 at offset 3*4=12
        const sclLoc = gl.getAttribLocation(program, 'a_scale3');
        gl.enableVertexAttribArray(sclLoc);
        gl.vertexAttribPointer(sclLoc, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.vertexAttribDivisor(sclLoc, 1);

        // a_orientation: vec4 at offset 6*4=24
        const oriLoc = gl.getAttribLocation(program, 'a_orientation');
        gl.enableVertexAttribArray(oriLoc);
        gl.vertexAttribPointer(oriLoc, 4, gl.FLOAT, false, stride, 6 * 4);
        gl.vertexAttribDivisor(oriLoc, 1);

        // a_color: vec3 at offset 10*4=40
        const colLoc = gl.getAttribLocation(program, 'a_color');
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, 10 * 4);
        gl.vertexAttribDivisor(colLoc, 1);

        // a_opacity: float at offset 13*4=52
        const opaLoc = gl.getAttribLocation(program, 'a_opacity');
        gl.enableVertexAttribArray(opaLoc);
        gl.vertexAttribPointer(opaLoc, 1, gl.FLOAT, false, stride, 13 * 4);
        gl.vertexAttribDivisor(opaLoc, 1);

        // a_depth not used by shader (sort is CPU-side), but skip gracefully
        const depLoc = gl.getAttribLocation(program, 'a_depth');
        if (depLoc >= 0) {
            gl.enableVertexAttribArray(depLoc);
            gl.vertexAttribPointer(depLoc, 1, gl.FLOAT, false, stride, 14 * 4);
            gl.vertexAttribDivisor(depLoc, 1);
        }

        gl.bindVertexArray(null);

        // Uniform locations
        this.uniforms = {
            viewMatrix:  gl.getUniformLocation(program, 'u_viewMatrix'),
            projMatrix:  gl.getUniformLocation(program, 'u_projMatrix'),
            viewport:    gl.getUniformLocation(program, 'u_viewport'),
            time:        gl.getUniformLocation(program, 'u_time'),
            animate:     gl.getUniformLocation(program, 'u_animate'),
            intensity:   gl.getUniformLocation(program, 'u_intensity'),
        };
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error('HiFiSplatRenderer shader error: ' + gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    /* -------------------------------------------------------------- */
    /*  Data upload                                                    */
    /* -------------------------------------------------------------- */

    /**
     * Upload hi-fi encoded seed buffer to the GPU.
     *
     * @param {Float32Array} buffer  Encoded hi-fi buffer (16 floats/splat)
     * @param {number} count         Number of splats
     * @param {Object[]} [seeds]     Original seed objects (needed for CPU sort)
     */
    updateSeeds(buffer, count, seeds = null) {
        const gl = this.gl;
        this._hifiBuffer = buffer;
        this.count = count;
        if (seeds) this._seeds = seeds;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
    }

    /* -------------------------------------------------------------- */
    /*  Draw                                                           */
    /* -------------------------------------------------------------- */

    /**
     * Render all uploaded splats with depth sorting and frustum culling.
     *
     * @param {Float32Array} viewMatrix       4×4 column-major view matrix
     * @param {Float32Array} projMatrix       4×4 column-major projection matrix
     * @param {Float32Array} viewProjection   4×4 column-major VP matrix (for sorting)
     * @param {number} [time=0]               Elapsed seconds
     * @returns {{ visibleSplats: number, culledSplats: number, sortTimeMs: number }}
     */
    render(viewMatrix, projMatrix, viewProjection, time = 0) {
        const gl = this.gl;
        if (!this.count) return this.stats;

        // ---- CPU sort + cull ----------------------------------------
        let uploadCount = this.count;
        let sortTime = 0;

        if ((this.depthSort || this.frustumCull) && this._seeds.length > 0 && viewProjection) {
            const t0 = performance.now();
            const { indices, count: visCount, culledCount } = sortAndCullSeeds(
                this._seeds, viewProjection,
                { frustumCull: this.frustumCull }
            );

            if (visCount > 0 && visCount < this.count) {
                const sorted = reorderBuffer(this._hifiBuffer, indices, visCount, GAUSSIAN_HIFI_STRIDE);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
                gl.bufferData(gl.ARRAY_BUFFER, sorted, gl.DYNAMIC_DRAW);
                uploadCount = visCount;
            }

            sortTime = performance.now() - t0;
            this.stats.culledSplats = culledCount;
            this.stats.visibleSplats = visCount;
        } else {
            this.stats.visibleSplats = this.count;
            this.stats.culledSplats = 0;
        }

        this.stats.totalSplats = this.count;
        this.stats.sortTimeMs = sortTime;

        // ---- GL state -----------------------------------------------
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.012, 0.02, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // No depth test — back-to-front alpha blending handles ordering
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);

        gl.enable(gl.BLEND);
        if (this.blendMode === 'additive') {
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        // ---- Draw ---------------------------------------------------
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniformMatrix4fv(this.uniforms.viewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.projMatrix, false, projMatrix);
        gl.uniform2f(this.uniforms.viewport, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(this.uniforms.time, time);
        gl.uniform1f(this.uniforms.animate, this.animate ? 1.0 : 0.0);
        gl.uniform1f(this.uniforms.intensity, this.intensity);

        // Instanced draw: 6 indices per quad × uploadCount instances
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, uploadCount);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);

        return this.stats;
    }

    /* -------------------------------------------------------------- */
    /*  Cleanup                                                        */
    /* -------------------------------------------------------------- */

    dispose() {
        const gl = this.gl;
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
        if (this.quadIBO) gl.deleteBuffer(this.quadIBO);
        if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
    }
}

export default HiFiSplatRenderer;
