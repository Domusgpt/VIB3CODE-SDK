/**
 * DeferredInscriptionLighting - Surface-Aware Inscription Lighting
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Makes inscription catch light: brightens facing light, dims in shadow.
 * Reads GBuffer normals + light direction at inscription pixels.
 * NdotL diffuse + thin specular from edge tangent.
 */

export class DeferredInscriptionLighting {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number[]} [opts.lightDir=[0.5, 1.0, 0.3]] - Light direction
     * @param {number[]} [opts.lightColor=[1.0, 0.95, 0.9]] - Light color
     * @param {number} [opts.ambientStrength=0.15] - Ambient factor
     * @param {number} [opts.specularPower=64] - Specular exponent
     * @param {number} [opts.specularStrength=0.5] - Specular intensity
     * @param {number} [opts.inscriptionEmission=0.3] - Self-emission base
     * @param {number} [opts.fresnelPower=3.0] - Fresnel rim strength
     */
    constructor(gl, opts = {}) {
        this.gl = gl;

        this.lightDir = new Float32Array(opts.lightDir || [0.5, 1.0, 0.3]);
        this.lightColor = new Float32Array(opts.lightColor || [1.0, 0.95, 0.9]);
        this.ambientStrength = opts.ambientStrength ?? 0.15;
        this.specularPower = opts.specularPower ?? 64;
        this.specularStrength = opts.specularStrength ?? 0.5;
        this.inscriptionEmission = opts.inscriptionEmission ?? 0.3;
        this.fresnelPower = opts.fresnelPower ?? 3.0;

        // Shadow integration
        this.shadowEnabled = false;
        this.shadowTexture = null;
        this.lightSpaceMatrix = null;

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
     * Set shadow map for inscription shadow modulation
     * @param {WebGLTexture} shadowTex
     * @param {Float32Array} lightSpaceMatrix
     */
    setShadow(shadowTex, lightSpaceMatrix) {
        this.shadowEnabled = true;
        this.shadowTexture = shadowTex;
        this.lightSpaceMatrix = lightSpaceMatrix;
    }

    /**
     * Apply deferred lighting to inscription layer
     * @param {WebGLTexture} inscriptionTexture - Raw inscription output
     * @param {WebGLTexture} normalDepthTexture - GBuffer normals + depth
     * @param {object} opts
     * @param {number} opts.width
     * @param {number} opts.height
     * @param {Float32Array} [opts.viewDir] - Camera view direction (normalized)
     * @returns {{texture: WebGLTexture}}
     */
    render(inscriptionTexture, normalDepthTexture, opts) {
        if (!this._initialized) this.init();
        const gl = this.gl;
        const { width, height } = opts;

        this._ensureTexture(width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this._program.program);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inscriptionTexture);
        gl.uniform1i(this._program.u_inscriptionTex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalDepthTexture);
        gl.uniform1i(this._program.u_normalDepthTex, 1);

        // Shadow map (optional)
        gl.uniform1i(this._program.u_shadowEnabled, this.shadowEnabled ? 1 : 0);
        if (this.shadowEnabled && this.shadowTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
            gl.uniform1i(this._program.u_shadowTex, 2);
            if (this.lightSpaceMatrix) {
                gl.uniformMatrix4fv(this._program.u_lightSpaceMatrix, false, this.lightSpaceMatrix);
            }
        }

        // Uniforms
        gl.uniform2f(this._program.u_resolution, width, height);

        // Normalize light direction
        const ld = this.lightDir;
        const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]) || 1;
        gl.uniform3f(this._program.u_lightDir, ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen);
        gl.uniform3fv(this._program.u_lightColor, this.lightColor);
        gl.uniform1f(this._program.u_ambientStrength, this.ambientStrength);
        gl.uniform1f(this._program.u_specularPower, this.specularPower);
        gl.uniform1f(this._program.u_specularStrength, this.specularStrength);
        gl.uniform1f(this._program.u_inscriptionEmission, this.inscriptionEmission);
        gl.uniform1f(this._program.u_fresnelPower, this.fresnelPower);

        if (opts.viewDir) {
            gl.uniform3fv(this._program.u_viewDir, opts.viewDir);
        } else {
            gl.uniform3f(this._program.u_viewDir, 0, 0, -1);
        }

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

uniform sampler2D u_inscriptionTex;
uniform sampler2D u_normalDepthTex;
uniform sampler2D u_shadowTex;

uniform vec2 u_resolution;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_viewDir;
uniform float u_ambientStrength;
uniform float u_specularPower;
uniform float u_specularStrength;
uniform float u_inscriptionEmission;
uniform float u_fresnelPower;

uniform int u_shadowEnabled;
uniform mat4 u_lightSpaceMatrix;

void main() {
    vec4 inscription = texture(u_inscriptionTex, v_uv);

    // Skip empty inscription pixels
    if (inscription.a < 0.01) {
        fragColor = vec4(0.0);
        return;
    }

    // Get surface normal from GBuffer
    vec4 normalDepth = texture(u_normalDepthTex, v_uv);
    vec3 normal = normalize(normalDepth.xyz * 2.0 - 1.0);
    float depth = normalDepth.a;

    if (depth <= 0.0) {
        fragColor = inscription;
        return;
    }

    // Diffuse lighting (NdotL)
    float NdotL = max(dot(normal, u_lightDir), 0.0);

    // Edge tangent for thin specular (perpendicular to normal in screen space)
    vec2 texelSize = 1.0 / u_resolution;
    vec3 normalRight = texture(u_normalDepthTex, v_uv + vec2(texelSize.x, 0.0)).xyz * 2.0 - 1.0;
    vec3 normalUp = texture(u_normalDepthTex, v_uv + vec2(0.0, texelSize.y)).xyz * 2.0 - 1.0;
    vec3 edgeTangent = normalize(cross(normalRight - normal, normalUp - normal));

    // Anisotropic specular along edge tangent
    vec3 halfVec = normalize(u_lightDir + normalize(-u_viewDir));
    float TdotH = dot(edgeTangent, halfVec);
    float anisotropicSpec = pow(sqrt(max(1.0 - TdotH * TdotH, 0.0)), u_specularPower);

    // Fresnel rim effect
    float fresnel = pow(1.0 - max(dot(normal, normalize(-u_viewDir)), 0.0), u_fresnelPower);

    // Shadow factor
    float shadow = 1.0;
    if (u_shadowEnabled == 1) {
        // Approximate shadow lookup (would need world pos reconstruction for accuracy)
        shadow = mix(0.3, 1.0, NdotL);
    }

    // Combine lighting
    vec3 ambient = inscription.rgb * u_ambientStrength;
    vec3 diffuse = inscription.rgb * NdotL * u_lightColor * shadow;
    vec3 specular = u_lightColor * anisotropicSpec * u_specularStrength * shadow;
    vec3 emission = inscription.rgb * u_inscriptionEmission;
    vec3 rim = inscription.rgb * fresnel * 0.3;

    // Shadow modulation: shadowed inscription gets cooler tint
    vec3 shadowTint = mix(vec3(0.5, 0.6, 1.0), vec3(1.0), shadow);

    vec3 litInscription = (ambient + diffuse + specular + emission + rim) * shadowTint;

    fragColor = vec4(litInscription, inscription.a);
}`;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertSrc);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragSrc);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.warn('DeferredInscriptionLighting fragment shader error:', gl.getShaderInfoLog(fs));
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
            u_inscriptionTex: u('u_inscriptionTex'),
            u_normalDepthTex: u('u_normalDepthTex'),
            u_shadowTex: u('u_shadowTex'),
            u_resolution: u('u_resolution'),
            u_lightDir: u('u_lightDir'),
            u_lightColor: u('u_lightColor'),
            u_viewDir: u('u_viewDir'),
            u_ambientStrength: u('u_ambientStrength'),
            u_specularPower: u('u_specularPower'),
            u_specularStrength: u('u_specularStrength'),
            u_inscriptionEmission: u('u_inscriptionEmission'),
            u_fresnelPower: u('u_fresnelPower'),
            u_shadowEnabled: u('u_shadowEnabled'),
            u_lightSpaceMatrix: u('u_lightSpaceMatrix'),
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
