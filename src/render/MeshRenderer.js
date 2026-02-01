/**
 * MeshRenderer (v2 — Morph Targets + Object ID GBuffer)
 *
 * Traditional triangle-mesh renderer for the VIB3+ hybrid pipeline.
 *
 * v2 Enhancements:
 *   - **Morph targets**: Blend between two vertex position/normal sets
 *     for animation (character poses, shape keys, vertex animation)
 *   - **Object ID output**: 3rd GBuffer MRT encodes per-object integer ID
 *     for cross-object edge inscription routing
 *   - **Uint32 index support**: Large meshes > 65K vertices
 *   - **Multi-draw**: Submit multiple meshes to shared GBuffer in one pass
 *
 * GBuffer layout:
 *   Attachment 0: RGBA8   — Lit surface color
 *   Attachment 1: RGBA16F — View-space normals (RGB) + linear depth (A)
 *   Attachment 2: RGBA8   — Object ID (R), reserved (GBA)
 */

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const MESH_VERTEX = `#version 300 es
precision highp float;

in vec3  a_position;
in vec3  a_normal;
in vec2  a_uv;
in vec4  a_color;

// Morph target attributes
in vec3  a_morphPosition;
in vec3  a_morphNormal;

uniform mat4  u_modelView;
uniform mat4  u_projection;
uniform mat4  u_normalMatrix;
uniform mat4  u_rotation4D;
uniform float u_projDistance;
uniform float u_use4D;
uniform float u_morphWeight;    // 0.0 = base, 1.0 = fully morphed
uniform float u_hasMorphTarget; // 0.0 = no morph, 1.0 = blend

out vec3  v_position;
out vec3  v_normal;
out vec2  v_uv;
out vec4  v_color;
out float v_depth;

void main() {
    // Morph target blending
    vec3 pos = a_position;
    vec3 nrm = a_normal;
    if (u_hasMorphTarget > 0.5) {
        pos = mix(a_position, a_morphPosition, u_morphWeight);
        nrm = normalize(mix(a_normal, a_morphNormal, u_morphWeight));
    }

    // Optional 4D rotation
    if (u_use4D > 0.5) {
        vec4 p4 = u_rotation4D * vec4(pos, 0.0);
        float w  = u_projDistance - p4.w;
        if (abs(w) < 0.0001) w = 0.0001;
        pos = p4.xyz / w;

        vec4 n4 = u_rotation4D * vec4(nrm, 0.0);
        nrm = normalize(n4.xyz);
    }

    vec4 viewPos = u_modelView * vec4(pos, 1.0);
    v_position = viewPos.xyz;
    v_normal   = normalize((u_normalMatrix * vec4(nrm, 0.0)).xyz);
    v_uv       = a_uv;
    v_color    = a_color;
    v_depth    = -viewPos.z;

    gl_Position = u_projection * viewPos;
}
`;

const MESH_FRAGMENT = `#version 300 es
precision highp float;

in vec3  v_position;
in vec3  v_normal;
in vec2  v_uv;
in vec4  v_color;
in float v_depth;

uniform sampler2D u_diffuseMap;
uniform float     u_hasTexture;
uniform vec3      u_lightDir;
uniform vec3      u_lightColor;
uniform vec3      u_ambientColor;
uniform float     u_specularPower;
uniform float     u_opacity;
uniform float     u_objectID;       // per-object ID (0-255 encoded as float)

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;
layout(location = 2) out vec4 outObjectID;

void main() {
    vec4 baseColor = v_color;
    if (u_hasTexture > 0.5) {
        baseColor *= texture(u_diffuseMap, v_uv);
    }

    // Blinn-Phong
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightDir);
    vec3 V = normalize(-v_position);
    vec3 H = normalize(L + V);

    float NdotL = max(dot(N, L), 0.0);
    float NdotH = max(dot(N, H), 0.0);
    float spec  = pow(NdotH, u_specularPower);

    vec3 diffuse  = u_lightColor * NdotL;
    vec3 specular = u_lightColor * spec * 0.3;
    vec3 ambient  = u_ambientColor;

    vec3 finalColor = baseColor.rgb * (ambient + diffuse) + specular;

    outColor    = vec4(finalColor, baseColor.a * u_opacity);
    outNormal   = vec4(N * 0.5 + 0.5, v_depth / 100.0);
    outObjectID = vec4(u_objectID / 255.0, 0.0, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/*  GBuffer helper (3 MRT: color + normal/depth + objectID)            */
/* ------------------------------------------------------------------ */

function createGBuffer(gl, w, h) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    // Attachment 0: Color (RGBA8)
    const colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);

    // Attachment 1: Normals + Depth (RGBA16F preferred)
    const normalTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, normalTex);
    let normalFormat = gl.RGBA8;
    let normalType = gl.UNSIGNED_BYTE;
    if (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')) {
        normalFormat = gl.RGBA16F;
        normalType = gl.HALF_FLOAT;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, normalFormat, w, h, 0, gl.RGBA, normalType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTex, 0);

    // Attachment 2: Object ID (RGBA8)
    const objectIDTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, objectIDTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, objectIDTex, 0);

    // Depth renderbuffer
    const depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);

    // Draw to all 3 attachments
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        framebuffer: fb,
        colorTexture: colorTex,
        normalTexture: normalTex,
        objectIDTexture: objectIDTex,
        depthRenderbuffer: depthRb,
        width: w, height: h,
    };
}

function destroyGBuffer(gl, gb) {
    gl.deleteFramebuffer(gb.framebuffer);
    gl.deleteTexture(gb.colorTexture);
    gl.deleteTexture(gb.normalTexture);
    gl.deleteTexture(gb.objectIDTexture);
    gl.deleteRenderbuffer(gb.depthRenderbuffer);
}

/* ------------------------------------------------------------------ */
/*  MeshRenderer                                                       */
/* ------------------------------------------------------------------ */

export class MeshRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, {
        lightDir = [0.4, 0.8, 0.3],
        lightColor = [1.0, 0.98, 0.95],
        ambientColor = [0.12, 0.12, 0.18],
        specularPower = 32,
    } = {}) {
        this.gl = gl;
        this.lightDir = lightDir;
        this.lightColor = lightColor;
        this.ambientColor = ambientColor;
        this.specularPower = specularPower;
        this.opacity = 1.0;
        this.objectID = 0;

        // Morph target state
        this.morphWeight = 0.0;
        this._hasMorphTarget = false;

        this._program = null;
        this._vao = null;
        this._posBuf = null;
        this._nrmBuf = null;
        this._uvBuf = null;
        this._colBuf = null;
        this._morphPosBuf = null;
        this._morphNrmBuf = null;
        this._idxBuf = null;
        this._indexCount = 0;
        this._vertexCount = 0;
        this._indexType = 0; // gl.UNSIGNED_SHORT or gl.UNSIGNED_INT
        this._diffuseTexture = null;
        this._hasTexture = false;

        this._gbuffer = null;
        this._gbufferWidth = 0;
        this._gbufferHeight = 0;
        this._uniforms = {};

        this._init();
    }

    _init() {
        const gl = this.gl;

        this._program = this._createProgram(MESH_VERTEX, MESH_FRAGMENT);

        const u = (n) => gl.getUniformLocation(this._program, n);
        this._uniforms = {
            modelView:     u('u_modelView'),
            projection:    u('u_projection'),
            normalMatrix:  u('u_normalMatrix'),
            rotation4D:    u('u_rotation4D'),
            projDistance:  u('u_projDistance'),
            use4D:         u('u_use4D'),
            morphWeight:   u('u_morphWeight'),
            hasMorphTarget: u('u_hasMorphTarget'),
            diffuseMap:    u('u_diffuseMap'),
            hasTexture:    u('u_hasTexture'),
            lightDir:      u('u_lightDir'),
            lightColor:    u('u_lightColor'),
            ambientColor:  u('u_ambientColor'),
            specularPower: u('u_specularPower'),
            opacity:       u('u_opacity'),
            objectID:      u('u_objectID'),
        };

        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);

        // Position (loc 0)
        this._posBuf = gl.createBuffer();
        const posLoc = gl.getAttribLocation(this._program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        // Normal (loc 1)
        this._nrmBuf = gl.createBuffer();
        const nrmLoc = gl.getAttribLocation(this._program, 'a_normal');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
        gl.enableVertexAttribArray(nrmLoc);
        gl.vertexAttribPointer(nrmLoc, 3, gl.FLOAT, false, 0, 0);

        // UV (loc 2)
        this._uvBuf = gl.createBuffer();
        const uvLoc = gl.getAttribLocation(this._program, 'a_uv');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

        // Color (loc 3)
        this._colBuf = gl.createBuffer();
        const colLoc = gl.getAttribLocation(this._program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);

        // Morph position (loc 4)
        this._morphPosBuf = gl.createBuffer();
        const morphPosLoc = gl.getAttribLocation(this._program, 'a_morphPosition');
        if (morphPosLoc >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._morphPosBuf);
            gl.enableVertexAttribArray(morphPosLoc);
            gl.vertexAttribPointer(morphPosLoc, 3, gl.FLOAT, false, 0, 0);
        }

        // Morph normal (loc 5)
        this._morphNrmBuf = gl.createBuffer();
        const morphNrmLoc = gl.getAttribLocation(this._program, 'a_morphNormal');
        if (morphNrmLoc >= 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._morphNrmBuf);
            gl.enableVertexAttribArray(morphNrmLoc);
            gl.vertexAttribPointer(morphNrmLoc, 3, gl.FLOAT, false, 0, 0);
        }

        // Index buffer
        this._idxBuf = gl.createBuffer();

        gl.bindVertexArray(null);
    }

    /* -------------------------------------------------------------- */
    /*  Geometry upload                                                 */
    /* -------------------------------------------------------------- */

    /**
     * Upload triangle mesh data.
     * @param {object} geometry
     * @param {Float32Array} geometry.positions
     * @param {Float32Array} [geometry.normals]
     * @param {Float32Array} [geometry.uvs]
     * @param {Float32Array} [geometry.colors]
     * @param {Uint16Array|Uint32Array} [geometry.indices]
     */
    uploadGeometry({ positions, normals, uvs, colors, indices }) {
        const gl = this.gl;
        const vertexCount = positions.length / 3;
        this._vertexCount = vertexCount;

        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

        if (normals) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
        } else {
            const def = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount; i++) def[i * 3 + 1] = 1.0;
            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
            gl.bufferData(gl.ARRAY_BUFFER, def, gl.DYNAMIC_DRAW);
        }

        if (uvs) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexCount * 2), gl.DYNAMIC_DRAW);
        }

        if (colors) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        } else {
            const white = new Float32Array(vertexCount * 4);
            for (let i = 0; i < vertexCount; i++) {
                white[i*4] = 1; white[i*4+1] = 1; white[i*4+2] = 1; white[i*4+3] = 1;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, white, gl.DYNAMIC_DRAW);
        }

        // Initialize morph buffers to match base (zero displacement)
        gl.bindBuffer(gl.ARRAY_BUFFER, this._morphPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._morphNrmBuf);
        gl.bufferData(gl.ARRAY_BUFFER, normals || new Float32Array(vertexCount * 3), gl.DYNAMIC_DRAW);

        if (indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            this._indexCount = indices.length;
            this._indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        } else {
            this._indexCount = 0;
        }
    }

    /**
     * Upload morph target data for animation/shape keys.
     * @param {Float32Array} morphPositions  Target positions (same vertex count)
     * @param {Float32Array} [morphNormals]  Target normals
     */
    uploadMorphTarget(morphPositions, morphNormals) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this._morphPosBuf);
        gl.bufferData(gl.ARRAY_BUFFER, morphPositions, gl.DYNAMIC_DRAW);

        if (morphNormals) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._morphNrmBuf);
            gl.bufferData(gl.ARRAY_BUFFER, morphNormals, gl.DYNAMIC_DRAW);
        }

        this._hasMorphTarget = true;
    }

    /* -------------------------------------------------------------- */
    /*  Texture upload                                                  */
    /* -------------------------------------------------------------- */

    uploadTexture(source) {
        const gl = this.gl;
        if (!this._diffuseTexture) this._diffuseTexture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, this._diffuseTexture);
        if (source instanceof ImageData) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height,
                0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        }

        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        this._hasTexture = true;
    }

    /* -------------------------------------------------------------- */
    /*  GBuffer                                                        */
    /* -------------------------------------------------------------- */

    _ensureGBuffer(w, h) {
        if (this._gbuffer && this._gbufferWidth === w && this._gbufferHeight === h) return;
        if (this._gbuffer) destroyGBuffer(this.gl, this._gbuffer);
        this._gbuffer = createGBuffer(this.gl, w, h);
        this._gbufferWidth = w;
        this._gbufferHeight = h;
    }

    get gbuffer() { return this._gbuffer; }

    /* -------------------------------------------------------------- */
    /*  Render                                                          */
    /* -------------------------------------------------------------- */

    /**
     * Render the mesh into the internal GBuffer.
     * @param {Float32Array} modelView
     * @param {Float32Array} projection
     * @param {object} [opts]
     * @returns {{ colorTexture, normalTexture, objectIDTexture, depthRenderbuffer, framebuffer }}
     */
    render(modelView, projection, {
        rotation4D = null,
        projDistance = 2.0,
        width = 0,
        height = 0,
        clearBuffer = true,
    } = {}) {
        const gl = this.gl;
        const w = width || gl.canvas.width;
        const h = height || gl.canvas.height;

        this._ensureGBuffer(w, h);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._gbuffer.framebuffer);
        gl.viewport(0, 0, w, h);

        if (clearBuffer) {
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        if (this._vertexCount === 0 && this._indexCount === 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return this._gbuffer;
        }

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.disable(gl.BLEND);

        gl.useProgram(this._program);
        gl.bindVertexArray(this._vao);

        if (this._indexCount > 0) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);
        }

        const u = this._uniforms;
        const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

        gl.uniformMatrix4fv(u.modelView, false, modelView || IDENTITY);
        gl.uniformMatrix4fv(u.projection, false, projection || IDENTITY);
        gl.uniformMatrix4fv(u.normalMatrix, false, modelView || IDENTITY);
        gl.uniformMatrix4fv(u.rotation4D, false, rotation4D || IDENTITY);
        gl.uniform1f(u.projDistance, projDistance);
        gl.uniform1f(u.use4D, rotation4D ? 1.0 : 0.0);

        // Morph target
        gl.uniform1f(u.morphWeight, this.morphWeight);
        gl.uniform1f(u.hasMorphTarget, this._hasMorphTarget ? 1.0 : 0.0);

        gl.uniform3fv(u.lightDir, this.lightDir);
        gl.uniform3fv(u.lightColor, this.lightColor);
        gl.uniform3fv(u.ambientColor, this.ambientColor);
        gl.uniform1f(u.specularPower, this.specularPower);
        gl.uniform1f(u.opacity, this.opacity);
        gl.uniform1f(u.objectID, this.objectID);

        if (this._hasTexture && this._diffuseTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._diffuseTexture);
            gl.uniform1i(u.diffuseMap, 0);
            gl.uniform1f(u.hasTexture, 1.0);
        } else {
            gl.uniform1f(u.hasTexture, 0.0);
        }

        if (this._indexCount > 0) {
            gl.drawElements(gl.TRIANGLES, this._indexCount, this._indexType, 0);
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, this._vertexCount);
        }

        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.CULL_FACE);

        return this._gbuffer;
    }

    /* -------------------------------------------------------------- */
    /*  Helpers                                                        */
    /* -------------------------------------------------------------- */

    _createProgram(vertSrc, fragSrc) {
        const gl = this.gl;
        const p = gl.createProgram();
        const v = this._compile(gl.VERTEX_SHADER, vertSrc);
        const f = this._compile(gl.FRAGMENT_SHADER, fragSrc);
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error('MeshRenderer link error: ' + gl.getProgramInfoLog(p));
        }
        return p;
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('MeshRenderer compile error: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteProgram(this._program);
        gl.deleteVertexArray(this._vao);
        gl.deleteBuffer(this._posBuf);
        gl.deleteBuffer(this._nrmBuf);
        gl.deleteBuffer(this._uvBuf);
        gl.deleteBuffer(this._colBuf);
        gl.deleteBuffer(this._morphPosBuf);
        gl.deleteBuffer(this._morphNrmBuf);
        gl.deleteBuffer(this._idxBuf);
        if (this._diffuseTexture) gl.deleteTexture(this._diffuseTexture);
        if (this._gbuffer) destroyGBuffer(gl, this._gbuffer);
    }
}

export default MeshRenderer;
