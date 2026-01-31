/**
 * MeshRenderer
 *
 * Traditional triangle-mesh renderer that integrates with the VIB3+ hybrid
 * pipeline.  Renders indexed triangle geometry with:
 *
 *   - Position / Normal / UV / Color vertex attributes
 *   - Blinn-Phong lighting with configurable light direction
 *   - Texture map support (diffuse sampler)
 *   - GBuffer output: color (RGBA), depth, view-space normals
 *   - Optional 4D rotation via the VIB3 6-plane system
 *
 * The renderer writes to an FBO so the HybridRenderPipeline can composite
 * the mesh layer with splat, procedural, and edge-inscription layers.
 *
 * Usage:
 *   const mesh = new MeshRenderer(gl);
 *   mesh.uploadGeometry({ positions, normals, uvs, indices });
 *   mesh.uploadTexture(imageOrCanvas);        // optional diffuse map
 *   mesh.render(viewProjection, {
 *       lightDir: [0.5, 1.0, 0.3],
 *       rotation4D: rotate4DMatrix,           // optional 4D rotation
 *   });
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

uniform mat4  u_modelView;
uniform mat4  u_projection;
uniform mat4  u_normalMatrix;
uniform mat4  u_rotation4D;     // identity when no 4D rotation
uniform float u_projDistance;   // 4D perspective distance (default 2.0)
uniform float u_use4D;         // 0.0 = bypass 4D, 1.0 = apply 4D rotation

out vec3  v_position;     // view-space position
out vec3  v_normal;       // view-space normal
out vec2  v_uv;
out vec4  v_color;
out float v_depth;        // linear view-space depth (for edge detection)

void main() {
    vec3 pos = a_position;
    vec3 nrm = a_normal;

    // --- Optional 4D rotation path ---
    if (u_use4D > 0.5) {
        vec4 p4 = u_rotation4D * vec4(a_position, 0.0);
        float w  = u_projDistance - p4.w;
        if (abs(w) < 0.0001) w = 0.0001;
        pos = p4.xyz / w;

        vec4 n4 = u_rotation4D * vec4(a_normal, 0.0);
        nrm = normalize(n4.xyz);
    }

    vec4 viewPos = u_modelView * vec4(pos, 1.0);
    v_position = viewPos.xyz;
    v_normal   = normalize((u_normalMatrix * vec4(nrm, 0.0)).xyz);
    v_uv       = a_uv;
    v_color    = a_color;
    v_depth    = -viewPos.z;    // positive linear depth

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
uniform float     u_hasTexture;    // 1.0 = sample texture, 0.0 = vertex color
uniform vec3      u_lightDir;
uniform vec3      u_lightColor;
uniform vec3      u_ambientColor;
uniform float     u_specularPower;
uniform float     u_opacity;

layout(location = 0) out vec4 outColor;    // RGBA color
layout(location = 1) out vec4 outNormal;   // view-space normal + depth

void main() {
    // Material color
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

    outColor  = vec4(finalColor, baseColor.a * u_opacity);
    outNormal = vec4(N * 0.5 + 0.5, v_depth / 100.0);   // encode normal + depth
}
`;

/* ------------------------------------------------------------------ */
/*  FBO helper (GBuffer: color + normal/depth)                         */
/* ------------------------------------------------------------------ */

function createGBuffer(gl, w, h) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    // Color attachment 0 — RGBA8
    const colorTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);

    // Color attachment 1 — normal + depth (RGBA16F if available, else RGBA8)
    const normalTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, normalTex);
    let normalFormat = gl.RGBA8;
    let normalType = gl.UNSIGNED_BYTE;
    if (gl.getExtension('EXT_color_buffer_half_float')) {
        normalFormat = gl.RGBA16F;
        normalType = gl.HALF_FLOAT;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, normalFormat, w, h, 0, gl.RGBA, normalType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTex, 0);

    // Depth renderbuffer
    const depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);

    // Draw to both color attachments
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
        framebuffer: fb,
        colorTexture: colorTex,
        normalTexture: normalTex,
        depthRenderbuffer: depthRb,
        width: w,
        height: h,
    };
}

function destroyGBuffer(gl, gb) {
    gl.deleteFramebuffer(gb.framebuffer);
    gl.deleteTexture(gb.colorTexture);
    gl.deleteTexture(gb.normalTexture);
    gl.deleteRenderbuffer(gb.depthRenderbuffer);
}

/* ------------------------------------------------------------------ */
/*  MeshRenderer                                                       */
/* ------------------------------------------------------------------ */

export class MeshRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number[]} [opts.lightDir]       Default light direction
     * @param {number[]} [opts.lightColor]     Default light color
     * @param {number[]} [opts.ambientColor]   Default ambient color
     * @param {number}   [opts.specularPower]  Blinn-Phong exponent
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

        this._program = null;
        this._vao = null;
        this._posBuf = null;
        this._nrmBuf = null;
        this._uvBuf = null;
        this._colBuf = null;
        this._idxBuf = null;
        this._indexCount = 0;
        this._vertexCount = 0;
        this._diffuseTexture = null;
        this._hasTexture = false;

        this._gbuffer = null;
        this._gbufferWidth = 0;
        this._gbufferHeight = 0;

        this._uniforms = {};

        this._init();
    }

    /* -------------------------------------------------------------- */
    /*  Init                                                           */
    /* -------------------------------------------------------------- */

    _init() {
        const gl = this.gl;

        // Compile program
        this._program = this._createProgram(MESH_VERTEX, MESH_FRAGMENT);

        // Uniform locations
        const u = (n) => gl.getUniformLocation(this._program, n);
        this._uniforms = {
            modelView:     u('u_modelView'),
            projection:    u('u_projection'),
            normalMatrix:  u('u_normalMatrix'),
            rotation4D:    u('u_rotation4D'),
            projDistance:   u('u_projDistance'),
            use4D:         u('u_use4D'),
            diffuseMap:    u('u_diffuseMap'),
            hasTexture:    u('u_hasTexture'),
            lightDir:      u('u_lightDir'),
            lightColor:    u('u_lightColor'),
            ambientColor:  u('u_ambientColor'),
            specularPower: u('u_specularPower'),
            opacity:       u('u_opacity'),
        };

        // VAO
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);

        // Position buffer (location 0)
        this._posBuf = gl.createBuffer();
        const posLoc = gl.getAttribLocation(this._program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

        // Normal buffer (location 1)
        this._nrmBuf = gl.createBuffer();
        const nrmLoc = gl.getAttribLocation(this._program, 'a_normal');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
        gl.enableVertexAttribArray(nrmLoc);
        gl.vertexAttribPointer(nrmLoc, 3, gl.FLOAT, false, 0, 0);

        // UV buffer (location 2)
        this._uvBuf = gl.createBuffer();
        const uvLoc = gl.getAttribLocation(this._program, 'a_uv');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

        // Color buffer (location 3)
        this._colBuf = gl.createBuffer();
        const colLoc = gl.getAttribLocation(this._program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);

        // Index buffer
        this._idxBuf = gl.createBuffer();

        gl.bindVertexArray(null);
    }

    /* -------------------------------------------------------------- */
    /*  Geometry upload                                                 */
    /* -------------------------------------------------------------- */

    /**
     * Upload triangle mesh data.
     *
     * @param {object} geometry
     * @param {Float32Array} geometry.positions   Flat xyz (3 floats/vertex)
     * @param {Float32Array} [geometry.normals]   Flat xyz (3 floats/vertex)
     * @param {Float32Array} [geometry.uvs]       Flat uv (2 floats/vertex)
     * @param {Float32Array} [geometry.colors]    Flat rgba (4 floats/vertex)
     * @param {Uint16Array|Uint32Array} [geometry.indices]  Triangle indices
     */
    uploadGeometry({ positions, normals, uvs, colors, indices }) {
        const gl = this.gl;
        const vertexCount = positions.length / 3;
        this._vertexCount = vertexCount;

        gl.bindBuffer(gl.ARRAY_BUFFER, this._posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        // Default normals: up
        if (normals) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
            gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        } else {
            const def = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount; i++) { def[i * 3 + 1] = 1.0; }
            gl.bindBuffer(gl.ARRAY_BUFFER, this._nrmBuf);
            gl.bufferData(gl.ARRAY_BUFFER, def, gl.STATIC_DRAW);
        }

        // Default UVs: 0,0
        if (uvs) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._uvBuf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexCount * 2), gl.STATIC_DRAW);
        }

        // Default colors: white
        if (colors) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
        } else {
            const white = new Float32Array(vertexCount * 4);
            for (let i = 0; i < vertexCount; i++) {
                white[i * 4]     = 1.0;
                white[i * 4 + 1] = 1.0;
                white[i * 4 + 2] = 1.0;
                white[i * 4 + 3] = 1.0;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this._colBuf);
            gl.bufferData(gl.ARRAY_BUFFER, white, gl.STATIC_DRAW);
        }

        if (indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            this._indexCount = indices.length;
        } else {
            this._indexCount = 0;
        }
    }

    /* -------------------------------------------------------------- */
    /*  Texture upload                                                  */
    /* -------------------------------------------------------------- */

    /**
     * Upload a diffuse texture from an image, canvas, or ImageData.
     *
     * @param {HTMLImageElement|HTMLCanvasElement|ImageData} source
     */
    uploadTexture(source) {
        const gl = this.gl;

        if (!this._diffuseTexture) {
            this._diffuseTexture = gl.createTexture();
        }

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
    /*  GBuffer management                                              */
    /* -------------------------------------------------------------- */

    _ensureGBuffer(w, h) {
        if (this._gbuffer && this._gbufferWidth === w && this._gbufferHeight === h) {
            return;
        }
        if (this._gbuffer) destroyGBuffer(this.gl, this._gbuffer);
        this._gbuffer = createGBuffer(this.gl, w, h);
        this._gbufferWidth = w;
        this._gbufferHeight = h;
    }

    /** @returns {{ colorTexture, normalTexture, width, height }} */
    get gbuffer() {
        return this._gbuffer;
    }

    /* -------------------------------------------------------------- */
    /*  Render                                                          */
    /* -------------------------------------------------------------- */

    /**
     * Render the mesh into the internal GBuffer.
     *
     * @param {Float32Array} modelView      4x4 model-view matrix (column-major)
     * @param {Float32Array} projection     4x4 projection matrix (column-major)
     * @param {object} [opts]
     * @param {Float32Array} [opts.rotation4D]   4x4 rotation matrix for 4D transform
     * @param {number}       [opts.projDistance]  4D projection distance
     * @param {number}       [opts.width]         Override canvas width
     * @param {number}       [opts.height]        Override canvas height
     * @returns {{ colorTexture, normalTexture, depthRenderbuffer, framebuffer }}
     */
    render(modelView, projection, {
        rotation4D = null,
        projDistance = 2.0,
        width = 0,
        height = 0,
    } = {}) {
        const gl = this.gl;
        const w = width || gl.canvas.width;
        const h = height || gl.canvas.height;

        this._ensureGBuffer(w, h);

        // Bind GBuffer FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._gbuffer.framebuffer);
        gl.viewport(0, 0, w, h);

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (this._vertexCount === 0 && this._indexCount === 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return this._gbuffer;
        }

        // Render state
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.disable(gl.BLEND);

        gl.useProgram(this._program);
        gl.bindVertexArray(this._vao);

        // Bind index buffer inside VAO
        if (this._indexCount > 0) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._idxBuf);
        }

        const u = this._uniforms;
        const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

        // Matrices
        gl.uniformMatrix4fv(u.modelView, false, modelView || IDENTITY);
        gl.uniformMatrix4fv(u.projection, false, projection || IDENTITY);

        // Normal matrix (inverse transpose of modelView — for uniform scaling
        // we can approximate with the upper-left 3x3 of modelView)
        // For now pass modelView; proper normal matrix would need inverse transpose.
        gl.uniformMatrix4fv(u.normalMatrix, false, modelView || IDENTITY);

        // 4D rotation
        gl.uniformMatrix4fv(u.rotation4D, false, rotation4D || IDENTITY);
        gl.uniform1f(u.projDistance, projDistance);
        gl.uniform1f(u.use4D, rotation4D ? 1.0 : 0.0);

        // Lighting
        gl.uniform3fv(u.lightDir, this.lightDir);
        gl.uniform3fv(u.lightColor, this.lightColor);
        gl.uniform3fv(u.ambientColor, this.ambientColor);
        gl.uniform1f(u.specularPower, this.specularPower);
        gl.uniform1f(u.opacity, this.opacity);

        // Texture
        if (this._hasTexture && this._diffuseTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._diffuseTexture);
            gl.uniform1i(u.diffuseMap, 0);
            gl.uniform1f(u.hasTexture, 1.0);
        } else {
            gl.uniform1f(u.hasTexture, 0.0);
        }

        // Draw
        if (this._indexCount > 0) {
            gl.drawElements(gl.TRIANGLES, this._indexCount, gl.UNSIGNED_SHORT, 0);
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
        gl.deleteBuffer(this._idxBuf);
        if (this._diffuseTexture) gl.deleteTexture(this._diffuseTexture);
        if (this._gbuffer) destroyGBuffer(gl, this._gbuffer);
    }
}

export default MeshRenderer;
