/**
 * GaussianSplatRenderer
 *
 * WebGL2 point-sprite renderer for Gaussian splats.
 *
 * Buffer layout per seed (12 floats, see GaussianSeedBuffer.js):
 *   [0-2]  position   (vec3)
 *   [3]    scale      (float)
 *   [4-7]  orientation (vec4 quaternion w,x,y,z)
 *   [8-10] color      (vec3 r,g,b)
 *   [11]   depth      (float — animation amplitude when animated,
 *                       traversal fade when static)
 *
 * Features:
 *  - Anisotropic Gaussian falloff via quaternion → 2D ellipse projection
 *  - GPU-driven animation (u_time + u_animate): per-splat orbital motion,
 *    scale pulsing, and twinkle — zero CPU cost per frame
 *  - Dual blend modes: premultiplied-alpha (solid scenes) or
 *    additive (emissive / galaxy / particle scenes)
 *  - Perspective-correct point sizing via u_viewProjection
 */

import { GAUSSIAN_SEED_STRIDE } from './GaussianSeedBuffer.js';

const IDENTITY_MATRIX = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);

/* ------------------------------------------------------------------ */
/*  Shader sources                                                     */
/* ------------------------------------------------------------------ */

const SPLAT_VERTEX = `#version 300 es
precision highp float;

// Per-seed attributes (interleaved, stride = 12 floats)
in vec3  a_position;      // offset  0
in float a_scale;         // offset  3
in vec4  a_orientation;   // offset  4  (quaternion w,x,y,z)
in vec3  a_color;         // offset  8
in float a_depth;         // offset 11

uniform float u_pointScale;
uniform float u_time;
uniform float u_animate;  // 0.0 = static, 1.0 = GPU-animated
uniform mat4  u_viewProjection;

flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;
flat out vec2  v_axisV;
flat out float v_hash;    // per-splat hash for fragment twinkle

void main() {
    // ---- per-splat deterministic hash ------------------------------
    float h1 = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(a_position.yz, vec2(45.164, 93.721))) * 23456.789);
    v_hash = h1;

    // ---- GPU animation (zero CPU cost) -----------------------------
    // When u_animate > 0, each splat orbits slightly around its rest
    // position, with amplitude controlled by a_depth.
    float animAmp = a_depth * u_animate * 0.06;
    float animSpd = 0.4 + h1 * 0.6;
    vec3 pos = a_position + vec3(
        sin(u_time * animSpd + h1 * 6.2832) * animAmp,
        cos(u_time * animSpd * 0.7 + h2 * 6.2832) * animAmp * 0.4,
        cos(u_time * animSpd + h1 * 6.2832) * animAmp
    );

    vec4 clipPos = u_viewProjection * vec4(pos, 1.0);
    gl_Position = clipPos;

    // ---- depth-aware point size ------------------------------------
    float projDist = max(0.5, clipPos.w);

    // Scale pulse (animated) vs depth fade (static)
    float pulse = 1.0 + sin(u_time * 1.5 + h1 * 6.2832)
                        * 0.12 * min(1.0, a_depth) * u_animate;
    float depthFade = 1.0 / (1.0 + a_depth * 0.15 * (1.0 - u_animate));

    gl_PointSize = clamp(
        a_scale * pulse * u_pointScale * depthFade / projDist,
        1.0,
        2048.0
    );

    // ---- quaternion -> 2D ellipse ----------------------------------
    float qw = a_orientation.x;
    float qx = a_orientation.y;
    float qy = a_orientation.z;
    float qz = a_orientation.w;

    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen;
    cosA *= invLen;

    float tilt   = abs(2.0 * (qw * qx + qy * qz));
    float aspect = 1.0 + tilt * 0.6;

    v_axisU = vec2(cosA, sinA) * aspect;
    v_axisV = vec2(-sinA, cosA);

    v_color = a_color;
    v_depth = a_depth;
}
`;

const SPLAT_FRAGMENT = `#version 300 es
precision highp float;

flat in vec3  v_color;
flat in float v_depth;
flat in vec2  v_axisU;
flat in vec2  v_axisV;
flat in float v_hash;

uniform float u_time;
uniform float u_animate;

out vec4 outColor;

void main() {
    vec2 d = gl_PointCoord - vec2(0.5);

    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    // True Gaussian falloff
    float r2    = u * u + v * v;
    float sigma = 0.20;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // Twinkle (animated) vs depth fade (static)
    float twinkle = mix(
        1.0,
        0.80 + 0.20 * (sin(u_time * 3.0 + v_hash * 6.2832) * 0.5 + 0.5),
        u_animate * min(1.0, v_depth)
    );
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.25 * (1.0 - u_animate));

    float alpha = gauss * depthAlpha * twinkle;

    if (alpha < 0.003) discard;

    // Premultiplied output (works for both blend modes)
    outColor = vec4(v_color * alpha, alpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Renderer class                                                     */
/* ------------------------------------------------------------------ */

export class GaussianSplatRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     * @param {number}  [options.pointScale=14]
     * @param {string}  [options.blendMode='premultiplied'] 'premultiplied'|'additive'
     * @param {boolean} [options.animate=false]
     */
    constructor(gl, { pointScale = 14, blendMode = 'premultiplied', animate = false } = {}) {
        if (!gl) {
            throw new Error('GaussianSplatRenderer requires a WebGL2 context.');
        }
        this.gl = gl;
        this.pointScale = pointScale;
        this.blendMode = blendMode;
        this.animate = animate;
        this.program = null;
        this.vao = null;
        this.buffer = null;
        this.count = 0;
        this.uniforms = {};
        this._init();
    }

    /* -------------------------------------------------------------- */
    /*  Initialisation                                                 */
    /* -------------------------------------------------------------- */

    /** @private */
    _init() {
        const gl = this.gl;

        const program = gl.createProgram();
        const vert = this._compileShader(gl.VERTEX_SHADER, SPLAT_VERTEX);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, SPLAT_FRAGMENT);
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        this.program = program;

        // VAO & interleaved buffer
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        const stride = GAUSSIAN_SEED_STRIDE * 4;

        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);

        const sclLoc = gl.getAttribLocation(program, 'a_scale');
        gl.enableVertexAttribArray(sclLoc);
        gl.vertexAttribPointer(sclLoc, 1, gl.FLOAT, false, stride, 3 * 4);

        const oriLoc = gl.getAttribLocation(program, 'a_orientation');
        gl.enableVertexAttribArray(oriLoc);
        gl.vertexAttribPointer(oriLoc, 4, gl.FLOAT, false, stride, 4 * 4);

        const colLoc = gl.getAttribLocation(program, 'a_color');
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, 8 * 4);

        const depLoc = gl.getAttribLocation(program, 'a_depth');
        gl.enableVertexAttribArray(depLoc);
        gl.vertexAttribPointer(depLoc, 1, gl.FLOAT, false, stride, 11 * 4);

        gl.bindVertexArray(null);

        // Uniform locations
        this.uniforms.pointScale = gl.getUniformLocation(program, 'u_pointScale');
        this.uniforms.viewProjection = gl.getUniformLocation(program, 'u_viewProjection');
        this.uniforms.time = gl.getUniformLocation(program, 'u_time');
        this.uniforms.animate = gl.getUniformLocation(program, 'u_animate');
    }

    /** @private */
    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    /* -------------------------------------------------------------- */
    /*  Data upload                                                    */
    /* -------------------------------------------------------------- */

    /**
     * Upload an encoded seed buffer to the GPU.
     * @param {Float32Array} buffer
     * @param {number} count  Number of splats (not bytes/floats).
     */
    updateSeeds(buffer, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
        this.count = count;
    }

    /* -------------------------------------------------------------- */
    /*  Draw                                                           */
    /* -------------------------------------------------------------- */

    /**
     * Render all uploaded splats.
     *
     * @param {Float32Array} [viewProjection] 4x4 column-major VP matrix.
     * @param {number} [time=0]  Elapsed seconds for GPU animation.
     */
    render(viewProjection, time = 0) {
        const gl = this.gl;
        if (!this.count) return;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clearColor(0.012, 0.02, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Depth test ON, depth write OFF
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        // Blend mode
        gl.enable(gl.BLEND);
        if (this.blendMode === 'additive') {
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniform1f(this.uniforms.pointScale, this.pointScale);
        gl.uniform1f(this.uniforms.time, time);
        gl.uniform1f(this.uniforms.animate, this.animate ? 1.0 : 0.0);
        gl.uniformMatrix4fv(
            this.uniforms.viewProjection,
            false,
            viewProjection || IDENTITY_MATRIX
        );

        gl.drawArrays(gl.POINTS, 0, this.count);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

export default GaussianSplatRenderer;
