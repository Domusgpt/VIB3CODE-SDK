/**
 * ShadowMap - Directional Shadow Mapping
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Depth-only shadow pass from light's perspective.
 * PCF soft shadows with inscription-aware shadow factor.
 * Shadow factor written to GBuffer for inscription layer to read:
 * - Shadowed edges → cooler/dimmer inscription
 * - Lit edges → warmer/brighter inscription
 */

export class ShadowMap {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.resolution=1024] - Shadow map resolution
     * @param {number} [opts.bias=0.005] - Depth bias to reduce acne
     * @param {number} [opts.normalBias=0.02] - Normal-based bias
     * @param {number} [opts.pcfRadius=2] - PCF filter radius (0=hard, 1-3=soft)
     * @param {string} [opts.filterMode='pcf'] - 'hard', 'pcf', or 'vsm'
     * @param {number} [opts.frustumSize=10] - Orthographic frustum half-size
     * @param {number} [opts.near=0.1] - Near plane
     * @param {number} [opts.far=50] - Far plane
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.resolution = opts.resolution ?? 1024;
        this.bias = opts.bias ?? 0.005;
        this.normalBias = opts.normalBias ?? 0.02;
        this.pcfRadius = opts.pcfRadius ?? 2;
        this.filterMode = opts.filterMode ?? 'pcf';
        this.frustumSize = opts.frustumSize ?? 10;
        this.near = opts.near ?? 0.1;
        this.far = opts.far ?? 50;

        // Light direction (normalized, pointing TO light)
        this.lightDir = new Float32Array(opts.lightDir || [0.5, 1.0, 0.3]);
        this._normalizeLightDir();

        // Shadow matrices
        this.lightViewMatrix = new Float32Array(16);
        this.lightProjMatrix = new Float32Array(16);
        this.lightSpaceMatrix = new Float32Array(16); // proj * view

        // GL resources
        this._fbo = null;
        this._depthTexture = null;
        this._shadowProgram = null;
        this._initialized = false;
    }

    /**
     * Initialize GL resources
     */
    init() {
        if (this._initialized) return;
        const gl = this.gl;

        // Depth FBO
        this._fbo = gl.createFramebuffer();
        this._depthTexture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, this._depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F,
            this.resolution, this.resolution, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._depthTexture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Depth-only shader
        this._shadowProgram = this._createShadowProgram();

        this._initialized = true;
    }

    /**
     * Set light direction (will normalize)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setLightDirection(x, y, z) {
        this.lightDir[0] = x;
        this.lightDir[1] = y;
        this.lightDir[2] = z;
        this._normalizeLightDir();
    }

    /**
     * Update light matrices (call before render pass)
     * @param {Float32Array} [sceneCenter] - Center of scene AABB
     */
    updateMatrices(sceneCenter) {
        const cx = sceneCenter ? sceneCenter[0] : 0;
        const cy = sceneCenter ? sceneCenter[1] : 0;
        const cz = sceneCenter ? sceneCenter[2] : 0;

        const lx = this.lightDir[0], ly = this.lightDir[1], lz = this.lightDir[2];

        // Light position = scene center + lightDir * distance
        const dist = this.far * 0.5;
        const eyeX = cx + lx * dist, eyeY = cy + ly * dist, eyeZ = cz + lz * dist;

        // lookAt(eye, center, up)
        this._lookAt(this.lightViewMatrix, eyeX, eyeY, eyeZ, cx, cy, cz);

        // Orthographic projection
        const s = this.frustumSize;
        this._ortho(this.lightProjMatrix, -s, s, -s, s, this.near, this.far);

        // Combined
        this._multiplyMat4(this.lightSpaceMatrix, this.lightProjMatrix, this.lightViewMatrix);
    }

    /**
     * Begin shadow render pass (binds FBO, sets viewport)
     */
    beginShadowPass() {
        if (!this._initialized) this.init();
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, this.resolution, this.resolution);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);

        // Cull front faces to reduce peter-panning
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
    }

    /**
     * Render geometry into shadow map (depth-only)
     * @param {Float32Array} positions - Vertex positions
     * @param {Uint32Array|Uint16Array} indices - Index buffer
     * @param {Float32Array} modelMatrix - 4x4 model transform
     */
    renderShadowCaster(positions, indices, modelMatrix) {
        const gl = this.gl;
        const prog = this._shadowProgram;

        gl.useProgram(prog.program);

        // Upload matrices
        gl.uniformMatrix4fv(prog.u_lightSpaceMatrix, false, this.lightSpaceMatrix);
        gl.uniformMatrix4fv(prog.u_modelMatrix, false, modelMatrix || IDENTITY_MAT4);

        // Create and bind VAO
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        if (indices) {
            const idxBuf = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STREAM_DRAW);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
            gl.deleteBuffer(idxBuf);
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
        }

        gl.bindVertexArray(null);
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(posBuf);
    }

    /**
     * End shadow pass (unbind FBO, restore state)
     */
    endShadowPass() {
        const gl = this.gl;
        gl.cullFace(gl.BACK);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Get shadow map texture for binding in lit shaders
     * @returns {WebGLTexture}
     */
    getShadowTexture() {
        return this._depthTexture;
    }

    /**
     * Get light-space matrix for shader
     * @returns {Float32Array}
     */
    getLightSpaceMatrix() {
        return this.lightSpaceMatrix;
    }

    /**
     * Get GLSL shadow sampling code for injection into fragment shaders
     * @returns {string}
     */
    static getShadowSamplerSrc() {
        return `
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_lightSpaceMatrix;
uniform float u_shadowBias;
uniform float u_shadowNormalBias;
uniform int u_pcfRadius;

float computeShadow(vec3 worldPos, vec3 worldNormal) {
    // Apply normal bias
    vec3 biasedPos = worldPos + worldNormal * u_shadowNormalBias;
    vec4 lightSpacePos = u_lightSpaceMatrix * vec4(biasedPos, 1.0);
    vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5;

    if (projCoords.z > 1.0) return 1.0;

    float currentDepth = projCoords.z - u_shadowBias;

    // PCF soft shadows
    float shadow = 0.0;
    vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0));
    int radius = u_pcfRadius;
    float sampleCount = 0.0;

    for (int x = -radius; x <= radius; x++) {
        for (int y = -radius; y <= radius; y++) {
            vec3 sampleCoord = vec3(projCoords.xy + vec2(x, y) * texelSize, currentDepth);
            shadow += texture(u_shadowMap, sampleCoord);
            sampleCount += 1.0;
        }
    }

    return shadow / sampleCount;
}
`;
    }

    /**
     * Get GLSL code for inscription shadow modulation
     * @returns {string}
     */
    static getInscriptionShadowSrc() {
        return `
// Shadow-aware inscription: shadowed edges get cooler tint, lit edges get warmer
vec3 modulateInscriptionByShadow(vec3 inscriptionColor, float shadowFactor) {
    // shadowFactor: 1.0 = fully lit, 0.0 = fully shadowed
    vec3 coolTint = vec3(0.4, 0.6, 1.0);   // Blue-ish for shadow
    vec3 warmTint = vec3(1.0, 0.9, 0.7);   // Warm for lit
    vec3 tint = mix(coolTint, warmTint, shadowFactor);
    float intensity = mix(0.3, 1.0, shadowFactor);
    return inscriptionColor * tint * intensity;
}
`;
    }

    // ─── Internal ────────────────────────────────────────────────────

    _normalizeLightDir() {
        const d = this.lightDir;
        const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
        d[0] /= len; d[1] /= len; d[2] /= len;
    }

    _createShadowProgram() {
        const gl = this.gl;

        const vertSrc = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_lightSpaceMatrix;
uniform mat4 u_modelMatrix;
void main() {
    gl_Position = u_lightSpaceMatrix * u_modelMatrix * vec4(a_position, 1.0);
}`;

        const fragSrc = `#version 300 es
precision highp float;
void main() {
    // Depth is written automatically
}`;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertSrc);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragSrc);
        gl.compileShader(fs);

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        return {
            program,
            u_lightSpaceMatrix: gl.getUniformLocation(program, 'u_lightSpaceMatrix'),
            u_modelMatrix: gl.getUniformLocation(program, 'u_modelMatrix'),
        };
    }

    _lookAt(out, eyeX, eyeY, eyeZ, centerX, centerY, centerZ) {
        let fx = centerX - eyeX, fy = centerY - eyeY, fz = centerZ - eyeZ;
        let len = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
        fx /= len; fy /= len; fz /= len;

        // Up = (0, 1, 0)
        let sx = fy * 0 - fz * 1, sy = fz * 0 - fx * 0, sz = fx * 1 - fy * 0;
        // Handle degenerate case (light pointing straight up/down)
        if (Math.abs(sx) + Math.abs(sy) + Math.abs(sz) < 0.001) {
            sx = 1; sy = 0; sz = 0;
        }
        len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        sx /= len; sy /= len; sz /= len;

        const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;

        out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0;
        out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0;
        out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
        out[12] = -(sx * eyeX + sy * eyeY + sz * eyeZ);
        out[13] = -(ux * eyeX + uy * eyeY + uz * eyeZ);
        out[14] = -(-fx * eyeX + -fy * eyeY + -fz * eyeZ);
        out[15] = 1;
    }

    _ortho(out, left, right, bottom, top, near, far) {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
    }

    _multiplyMat4(out, a, b) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] =
                    a[0 * 4 + j] * b[i * 4 + 0] +
                    a[1 * 4 + j] * b[i * 4 + 1] +
                    a[2 * 4 + j] * b[i * 4 + 2] +
                    a[3 * 4 + j] * b[i * 4 + 3];
            }
        }
    }

    dispose() {
        const gl = this.gl;
        if (this._fbo) gl.deleteFramebuffer(this._fbo);
        if (this._depthTexture) gl.deleteTexture(this._depthTexture);
        if (this._shadowProgram) gl.deleteProgram(this._shadowProgram.program);
        this._fbo = null;
        this._depthTexture = null;
        this._shadowProgram = null;
        this._initialized = false;
    }
}

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
