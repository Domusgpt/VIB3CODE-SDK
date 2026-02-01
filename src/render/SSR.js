/**
 * SSR - Screen-Space Reflections
 * VIB3+ Hybrid Render Pipeline v2
 *
 * GBuffer-based SSR that reflects inscription.
 * Hi-Z ray march in screen space using depth buffer.
 * Roughness from PBR → cone angle for glossy vs blurry reflections.
 */

export class SSR {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.maxSteps=64] - Ray march steps
     * @param {number} [opts.maxDistance=10] - Max reflection distance
     * @param {number} [opts.thickness=0.1] - Depth thickness for hit detection
     * @param {number} [opts.stride=2] - Initial stride (pixels)
     * @param {number} [opts.jitter=0.5] - Temporal jitter amount
     * @param {number} [opts.fadeEdge=0.1] - Edge fade factor
     * @param {number} [opts.reflectionStrength=0.8] - Global reflection intensity
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxSteps = opts.maxSteps ?? 64;
        this.maxDistance = opts.maxDistance ?? 10;
        this.thickness = opts.thickness ?? 0.1;
        this.stride = opts.stride ?? 2;
        this.jitter = opts.jitter ?? 0.5;
        this.fadeEdge = opts.fadeEdge ?? 0.1;
        this.reflectionStrength = opts.reflectionStrength ?? 0.8;

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
     * Render SSR pass
     * @param {object} inputs
     * @param {WebGLTexture} inputs.colorTexture - Composited scene (including inscription)
     * @param {WebGLTexture} inputs.normalDepthTexture - GBuffer normals + depth
     * @param {Float32Array} inputs.projMatrix - Projection matrix
     * @param {Float32Array} inputs.invProjMatrix - Inverse projection
     * @param {Float32Array} inputs.viewMatrix - View matrix
     * @param {number} inputs.width
     * @param {number} inputs.height
     * @param {number} inputs.time
     * @returns {{texture: WebGLTexture}}
     */
    render(inputs) {
        if (!this._initialized) this.init();
        const gl = this.gl;
        const { width, height } = inputs;

        this._ensureTexture(width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this._program.program);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputs.colorTexture);
        gl.uniform1i(this._program.u_colorTex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, inputs.normalDepthTexture);
        gl.uniform1i(this._program.u_normalDepthTex, 1);

        // Uniforms
        gl.uniform2f(this._program.u_resolution, width, height);
        gl.uniform1f(this._program.u_time, inputs.time || 0);
        gl.uniform1i(this._program.u_maxSteps, this.maxSteps);
        gl.uniform1f(this._program.u_maxDistance, this.maxDistance);
        gl.uniform1f(this._program.u_thickness, this.thickness);
        gl.uniform1f(this._program.u_stride, this.stride);
        gl.uniform1f(this._program.u_jitter, this.jitter);
        gl.uniform1f(this._program.u_fadeEdge, this.fadeEdge);
        gl.uniform1f(this._program.u_reflectionStrength, this.reflectionStrength);

        if (inputs.projMatrix) gl.uniformMatrix4fv(this._program.u_projMatrix, false, inputs.projMatrix);
        if (inputs.invProjMatrix) gl.uniformMatrix4fv(this._program.u_invProjMatrix, false, inputs.invProjMatrix);
        if (inputs.viewMatrix) gl.uniformMatrix4fv(this._program.u_viewMatrix, false, inputs.viewMatrix);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return { texture: this._texture };
    }

    _ensureTexture(w, h) {
        if (this._texW === w && this._texH === h) return;
        const gl = this.gl;
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

uniform sampler2D u_colorTex;
uniform sampler2D u_normalDepthTex;
uniform vec2 u_resolution;
uniform float u_time;

uniform int u_maxSteps;
uniform float u_maxDistance;
uniform float u_thickness;
uniform float u_stride;
uniform float u_jitter;
uniform float u_fadeEdge;
uniform float u_reflectionStrength;

uniform mat4 u_projMatrix;
uniform mat4 u_invProjMatrix;
uniform mat4 u_viewMatrix;

// Hash for jitter
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Reconstruct view-space position from UV + depth
vec3 viewPosFromUV(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = u_invProjMatrix * clip;
    return view.xyz / view.w;
}

void main() {
    vec4 normalDepth = texture(u_normalDepthTex, v_uv);
    vec3 normal = normalDepth.xyz * 2.0 - 1.0;
    float depth = normalDepth.a;

    if (depth <= 0.0 || length(normal) < 0.5) {
        fragColor = vec4(0.0);
        return;
    }

    normal = normalize(normal);

    // View-space position
    vec3 viewPos = viewPosFromUV(v_uv, depth);
    vec3 viewNormal = normalize(mat3(u_viewMatrix) * normal);

    // Reflect view direction
    vec3 viewDir = normalize(viewPos);
    vec3 reflectDir = reflect(viewDir, viewNormal);

    // March in screen space
    vec3 startPos = viewPos;
    vec3 endPos = viewPos + reflectDir * u_maxDistance;

    // Project to screen
    vec4 startClip = u_projMatrix * vec4(startPos, 1.0);
    vec4 endClip = u_projMatrix * vec4(endPos, 1.0);

    vec2 startScreen = (startClip.xy / startClip.w) * 0.5 + 0.5;
    vec2 endScreen = (endClip.xy / endClip.w) * 0.5 + 0.5;

    vec2 delta = endScreen - startScreen;
    float maxLen = max(abs(delta.x) * u_resolution.x, abs(delta.y) * u_resolution.y);

    if (maxLen < 1.0) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 step = delta / maxLen * u_stride;

    // Jitter start position for temporal stability
    float jitterOffset = hash12(v_uv * u_resolution + vec2(u_time * 1000.0)) * u_jitter;

    vec2 marchUV = startScreen + step * jitterOffset;
    float marchDepth = startClip.w;
    float depthStep = (endClip.w - startClip.w) / maxLen * u_stride;

    vec3 hitColor = vec3(0.0);
    float hitAlpha = 0.0;

    for (int i = 0; i < 128; i++) {
        if (i >= u_maxSteps) break;

        marchUV += step;
        marchDepth += depthStep;

        // Bounds check
        if (marchUV.x < 0.0 || marchUV.x > 1.0 || marchUV.y < 0.0 || marchUV.y > 1.0) break;

        // Sample depth at march position
        float sampleDepth = texture(u_normalDepthTex, marchUV).a;
        if (sampleDepth <= 0.0) continue;

        float depthDiff = marchDepth - sampleDepth;

        // Hit test
        if (depthDiff > 0.0 && depthDiff < u_thickness) {
            hitColor = texture(u_colorTex, marchUV).rgb;

            // Edge fade
            vec2 edgeFade = smoothstep(vec2(0.0), vec2(u_fadeEdge), marchUV) *
                           smoothstep(vec2(0.0), vec2(u_fadeEdge), 1.0 - marchUV);
            float fade = edgeFade.x * edgeFade.y;

            // Distance fade
            float marchDist = float(i) / float(u_maxSteps);
            fade *= 1.0 - marchDist;

            hitAlpha = fade * u_reflectionStrength;
            break;
        }
    }

    fragColor = vec4(hitColor * hitAlpha, hitAlpha);
}`;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertSrc);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragSrc);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.warn('SSR fragment shader error:', gl.getShaderInfoLog(fs));
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
            u_colorTex: u('u_colorTex'), u_normalDepthTex: u('u_normalDepthTex'),
            u_resolution: u('u_resolution'), u_time: u('u_time'),
            u_maxSteps: u('u_maxSteps'), u_maxDistance: u('u_maxDistance'),
            u_thickness: u('u_thickness'), u_stride: u('u_stride'),
            u_jitter: u('u_jitter'), u_fadeEdge: u('u_fadeEdge'),
            u_reflectionStrength: u('u_reflectionStrength'),
            u_projMatrix: u('u_projMatrix'), u_invProjMatrix: u('u_invProjMatrix'),
            u_viewMatrix: u('u_viewMatrix'),
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
