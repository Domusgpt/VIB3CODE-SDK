/**
 * VolumetricInscription - Raymarched 3D Interior Inscription
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Inscription that fills the interior of objects as a volumetric effect.
 * Visible when objects are transparent or sliced.
 * Uses the same 4D rotation system as edge inscription.
 */

export class VolumetricInscription {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.maxSteps=24] - Max raymarch steps (performance vs quality)
     * @param {number} [opts.stepSize=0.05] - Ray step size
     * @param {number} [opts.density=2.0] - Inscription density
     * @param {number} [opts.absorption=1.5] - Light absorption rate
     * @param {number} [opts.emissionStrength=1.0] - Emission intensity
     * @param {number} [opts.noiseScale=3.0] - 3D noise frequency
     * @param {number} [opts.geometry=0] - VIB3 geometry variant (0-23)
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxSteps = opts.maxSteps ?? 24;
        this.stepSize = opts.stepSize ?? 0.05;
        this.density = opts.density ?? 2.0;
        this.absorption = opts.absorption ?? 1.5;
        this.emissionStrength = opts.emissionStrength ?? 1.0;
        this.noiseScale = opts.noiseScale ?? 3.0;
        this.geometry = opts.geometry ?? 0;

        // Colors
        this.primaryColor = new Float32Array(opts.primaryColor || [0.0, 1.0, 1.0]);
        this.secondaryColor = new Float32Array(opts.secondaryColor || [1.0, 0.0, 1.0]);

        // 4D rotation
        this.rot4dXY = 0; this.rot4dXZ = 0; this.rot4dYZ = 0;
        this.rot4dXW = 0; this.rot4dYW = 0; this.rot4dZW = 0;

        // Audio
        this.bass = 0; this.mid = 0; this.high = 0; this.energy = 0;

        // Slice plane (for cutaway views)
        this.sliceEnabled = false;
        this.slicePlane = new Float32Array([0, 1, 0, 0]); // normal + distance

        // GL resources
        this._program = null;
        this._fbo = null;
        this._texture = null;
        this._vao = null;
        this._initialized = false;
    }

    init() {
        if (this._initialized) return;
        const gl = this.gl;

        this._program = this._createProgram();
        this._fbo = gl.createFramebuffer();
        this._texture = gl.createTexture();

        // Fullscreen triangle VAO
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        const vbuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this._initialized = true;
    }

    /**
     * Set audio inputs
     */
    setAudio(bass, mid, high, energy) {
        this.bass = bass; this.mid = mid; this.high = high; this.energy = energy;
    }

    /**
     * Render volumetric inscription
     * @param {WebGLTexture} depthTexture - GBuffer depth (for ray start/end)
     * @param {WebGLTexture} normalTexture - GBuffer normals
     * @param {number} time
     * @param {object} opts
     * @param {number} opts.width
     * @param {number} opts.height
     * @param {Float32Array} opts.invViewProj - Inverse view-projection matrix
     * @param {Float32Array} opts.cameraPos - Camera world position
     * @returns {{texture: WebGLTexture, framebuffer: WebGLFramebuffer}}
     */
    render(depthTexture, normalTexture, time, opts) {
        if (!this._initialized) this.init();
        const gl = this.gl;
        const { width, height } = opts;

        // Resize FBO texture if needed
        this._ensureTexture(width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this._program.program);

        // Bind inputs
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        gl.uniform1i(this._program.u_depthTex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalTexture);
        gl.uniform1i(this._program.u_normalTex, 1);

        // Uniforms
        gl.uniform1f(this._program.u_time, time);
        gl.uniform2f(this._program.u_resolution, width, height);
        gl.uniform1i(this._program.u_maxSteps, this.maxSteps);
        gl.uniform1f(this._program.u_stepSize, this.stepSize);
        gl.uniform1f(this._program.u_density, this.density);
        gl.uniform1f(this._program.u_absorption, this.absorption);
        gl.uniform1f(this._program.u_emissionStrength, this.emissionStrength);
        gl.uniform1f(this._program.u_noiseScale, this.noiseScale);
        gl.uniform1f(this._program.u_geometry, this.geometry);
        gl.uniform3fv(this._program.u_primaryColor, this.primaryColor);
        gl.uniform3fv(this._program.u_secondaryColor, this.secondaryColor);

        // 4D rotation
        gl.uniform1f(this._program.u_rot4dXY, this.rot4dXY);
        gl.uniform1f(this._program.u_rot4dXZ, this.rot4dXZ);
        gl.uniform1f(this._program.u_rot4dYZ, this.rot4dYZ);
        gl.uniform1f(this._program.u_rot4dXW, this.rot4dXW + this.bass * 0.3);
        gl.uniform1f(this._program.u_rot4dYW, this.rot4dYW + this.mid * 0.2);
        gl.uniform1f(this._program.u_rot4dZW, this.rot4dZW + this.high * 0.4);

        // Slice plane
        gl.uniform1i(this._program.u_sliceEnabled, this.sliceEnabled ? 1 : 0);
        gl.uniform4fv(this._program.u_slicePlane, this.slicePlane);

        // Camera
        if (opts.invViewProj) gl.uniformMatrix4fv(this._program.u_invViewProj, false, opts.invViewProj);
        if (opts.cameraPos) gl.uniform3fv(this._program.u_cameraPos, opts.cameraPos);

        // Draw
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return { texture: this._texture, framebuffer: this._fbo };
    }

    // ─── Internal ────────────────────────────────────────────────────

    _ensureTexture(w, h) {
        const gl = this.gl;
        if (this._texW === w && this._texH === h) return;
        this._texW = w; this._texH = h;

        gl.bindTexture(gl.TEXTURE_2D, this._texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _createProgram() {
        const gl = this.gl;

        const vertSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

        const fragSrc = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_depthTex;
uniform sampler2D u_normalTex;
uniform float u_time;
uniform vec2 u_resolution;

uniform int u_maxSteps;
uniform float u_stepSize;
uniform float u_density;
uniform float u_absorption;
uniform float u_emissionStrength;
uniform float u_noiseScale;
uniform float u_geometry;

uniform vec3 u_primaryColor;
uniform vec3 u_secondaryColor;

uniform float u_rot4dXY, u_rot4dXZ, u_rot4dYZ;
uniform float u_rot4dXW, u_rot4dYW, u_rot4dZW;

uniform int u_sliceEnabled;
uniform vec4 u_slicePlane;

uniform mat4 u_invViewProj;
uniform vec3 u_cameraPos;

// 3D hash
float hash3(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

// 3D value noise
float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
            mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
            mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

// Apply 4D rotation and project to 3D pattern value
float sample4DPattern(vec3 pos, float geometry) {
    // Lift to 4D
    vec4 p4 = vec4(pos, 0.0);

    // Apply 4D rotations (simplified for performance)
    float cXW = cos(u_rot4dXW), sXW = sin(u_rot4dXW);
    float cYW = cos(u_rot4dYW), sYW = sin(u_rot4dYW);
    float cZW = cos(u_rot4dZW), sZW = sin(u_rot4dZW);

    // XW rotation
    float tmpX = p4.x * cXW - p4.w * sXW;
    float tmpW = p4.x * sXW + p4.w * cXW;
    p4.x = tmpX; p4.w = tmpW;

    // YW rotation
    float tmpY = p4.y * cYW - p4.w * sYW;
    tmpW = p4.y * sYW + p4.w * cYW;
    p4.y = tmpY; p4.w = tmpW;

    // ZW rotation
    float tmpZ = p4.z * cZW - p4.w * sZW;
    tmpW = p4.z * sZW + p4.w * cZW;
    p4.z = tmpZ; p4.w = tmpW;

    // Project back to 3D with perspective
    float projDist = 3.5;
    vec3 proj = p4.xyz / (projDist - p4.w);

    // Geometry-dependent pattern
    int geomType = int(mod(geometry, 8.0));
    float pattern;

    if (geomType == 0) {
        // Tetrahedral lattice
        pattern = abs(sin(proj.x * 5.0) * sin(proj.y * 5.0) * sin(proj.z * 5.0));
    } else if (geomType == 1) {
        // Hypercube grid
        vec3 g = abs(fract(proj * 3.0) - 0.5);
        pattern = 1.0 - smoothstep(0.0, 0.1, min(min(g.x, g.y), g.z));
    } else if (geomType == 2) {
        // Sphere harmonics
        float r = length(proj);
        pattern = abs(sin(r * 10.0 + u_time * 0.5));
    } else if (geomType == 3) {
        // Toroidal
        float r = length(proj.xy) - 1.0;
        pattern = abs(sin(atan(proj.y, proj.x) * 8.0 + proj.z * 6.0 + u_time));
    } else if (geomType == 4) {
        // Klein-like twist
        float twist = atan(proj.y, proj.x) + proj.z * 2.0;
        pattern = abs(sin(twist * 4.0 + u_time * 0.3));
    } else if (geomType == 5) {
        // Fractal noise
        pattern = noise3D(proj * 2.0) * 0.5 + noise3D(proj * 4.0) * 0.25 + noise3D(proj * 8.0) * 0.125;
    } else if (geomType == 6) {
        // Wave interference
        pattern = sin(proj.x * 8.0 + u_time) * sin(proj.y * 6.0 - u_time * 0.7) * sin(proj.z * 10.0 + u_time * 0.3);
        pattern = abs(pattern);
    } else {
        // Crystal lattice
        vec3 g = abs(sin(proj * 4.0));
        pattern = max(max(g.x * g.y, g.y * g.z), g.x * g.z);
    }

    // Core type warp (hypersphere / hypertetra)
    float coreType = floor(geometry / 8.0);
    if (coreType == 1.0) {
        // Hypersphere warp
        float r = length(proj);
        pattern *= smoothstep(1.5, 0.5, r);
        pattern += abs(sin(r * 15.0 + u_time)) * 0.3;
    } else if (coreType == 2.0) {
        // Hypertetra warp
        float tetra = abs(proj.x + proj.y + proj.z) + abs(proj.x - proj.y - proj.z);
        pattern *= smoothstep(3.0, 1.0, tetra);
    }

    return clamp(pattern, 0.0, 1.0);
}

void main() {
    // Reconstruct world position from depth
    vec4 ndcInfo = texture(u_normalTex, v_uv);
    float depth = ndcInfo.a; // Linear depth

    if (depth <= 0.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec3 normal = ndcInfo.xyz * 2.0 - 1.0;

    // Reconstruct world position (approximate from depth)
    vec2 ndc = v_uv * 2.0 - 1.0;
    vec4 clipPos = vec4(ndc, depth, 1.0);
    vec4 worldPos = u_invViewProj * clipPos;
    vec3 rayEnd = worldPos.xyz / worldPos.w;

    // Ray setup
    vec3 rayDir = normalize(rayEnd - u_cameraPos);
    vec3 rayStart = u_cameraPos;

    // Scale the position for pattern evaluation
    vec3 pos = rayEnd * u_noiseScale;

    // Raymarch from surface inward
    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;
    float t = 0.0;

    for (int i = 0; i < 32; i++) {
        if (i >= u_maxSteps) break;
        if (accumAlpha > 0.95) break;

        vec3 samplePos = pos - rayDir * t * u_noiseScale;

        // Slice plane test
        if (u_sliceEnabled == 1) {
            float planeDist = dot(samplePos / u_noiseScale, u_slicePlane.xyz) + u_slicePlane.w;
            if (planeDist > 0.0) {
                t += u_stepSize;
                continue;
            }
        }

        // Sample 4D inscription pattern
        float pattern = sample4DPattern(samplePos + u_time * 0.1, u_geometry);

        // Apply density
        float sampleDensity = pattern * u_density * u_stepSize;

        // Emission-absorption model
        vec3 emission = mix(u_primaryColor, u_secondaryColor, pattern) * u_emissionStrength * pattern;
        accumColor += emission * sampleDensity * (1.0 - accumAlpha);
        accumAlpha += sampleDensity * u_absorption * (1.0 - accumAlpha);

        t += u_stepSize;
    }

    accumAlpha = clamp(accumAlpha, 0.0, 1.0);
    fragColor = vec4(accumColor * accumAlpha, accumAlpha);
}`;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertSrc);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragSrc);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.warn('VolumetricInscription fragment shader error:', gl.getShaderInfoLog(fs));
        }

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        const u = (name) => gl.getUniformLocation(program, name);
        return {
            program,
            u_depthTex: u('u_depthTex'), u_normalTex: u('u_normalTex'),
            u_time: u('u_time'), u_resolution: u('u_resolution'),
            u_maxSteps: u('u_maxSteps'), u_stepSize: u('u_stepSize'),
            u_density: u('u_density'), u_absorption: u('u_absorption'),
            u_emissionStrength: u('u_emissionStrength'),
            u_noiseScale: u('u_noiseScale'), u_geometry: u('u_geometry'),
            u_primaryColor: u('u_primaryColor'), u_secondaryColor: u('u_secondaryColor'),
            u_rot4dXY: u('u_rot4dXY'), u_rot4dXZ: u('u_rot4dXZ'), u_rot4dYZ: u('u_rot4dYZ'),
            u_rot4dXW: u('u_rot4dXW'), u_rot4dYW: u('u_rot4dYW'), u_rot4dZW: u('u_rot4dZW'),
            u_sliceEnabled: u('u_sliceEnabled'), u_slicePlane: u('u_slicePlane'),
            u_invViewProj: u('u_invViewProj'), u_cameraPos: u('u_cameraPos'),
        };
    }

    dispose() {
        const gl = this.gl;
        if (this._program) gl.deleteProgram(this._program.program);
        if (this._fbo) gl.deleteFramebuffer(this._fbo);
        if (this._texture) gl.deleteTexture(this._texture);
        if (this._vao) gl.deleteVertexArray(this._vao);
    }
}
