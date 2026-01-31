/**
 * EdgeInscriptionLayer
 *
 * Holographic edge-inscription system that detects geometric edges and surface
 * boundaries from the MeshRenderer's GBuffer (depth + normals), then renders
 * VIB3+ procedural patterns along those edges using multi-layer compositing.
 *
 * The effect creates a "holographic inscription" appearance where:
 *   - Object silhouettes get luminous procedural detail
 *   - Surface creases and hard edges receive inner glow
 *   - Multiple inscription layers at varying thicknesses produce depth
 *   - VIB3 4D rotation can animate the inscription patterns
 *   - The patterns can use any of the 24 VIB3 geometry variants
 *
 * Architecture:
 *   1. Read MeshRenderer GBuffer (normal + depth textures)
 *   2. Compute edge strength via Sobel on depth + Laplacian on normals
 *   3. For each inscription layer:
 *      a. Mask the edge region at this layer's thickness
 *      b. Render VIB3 procedural pattern into the masked region
 *      c. Apply layer-specific color/opacity/blend
 *   4. Output composited inscription texture for HybridRenderPipeline
 *
 * This is the key system that makes traditional meshes "come alive" with
 * the VIB3+ procedural vocabulary — the edges of any polygon model gain
 * the same holographic quality as the native VIB3 systems.
 */

/* ------------------------------------------------------------------ */
/*  Edge detection shader                                              */
/* ------------------------------------------------------------------ */

const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/**
 * Edge detection: combines depth-based Sobel with normal-based discontinuity.
 * Outputs edge strength in R, depth edge in G, normal edge in B.
 */
const EDGE_DETECT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_normalDepth;  // GBuffer: rgb = normal*0.5+0.5, a = depth/100
uniform vec2      u_texelSize;
uniform float     u_depthSensitivity;
uniform float     u_normalSensitivity;

out vec4 outEdge;

float sampleDepth(vec2 uv) {
    return texture(u_normalDepth, uv).a;
}

vec3 sampleNormal(vec2 uv) {
    return texture(u_normalDepth, uv).rgb * 2.0 - 1.0;
}

void main() {
    vec2 ts = u_texelSize;

    // Sobel on depth
    float d00 = sampleDepth(v_uv + vec2(-ts.x, -ts.y));
    float d10 = sampleDepth(v_uv + vec2( 0.0,  -ts.y));
    float d20 = sampleDepth(v_uv + vec2( ts.x, -ts.y));
    float d01 = sampleDepth(v_uv + vec2(-ts.x,  0.0));
    float d21 = sampleDepth(v_uv + vec2( ts.x,  0.0));
    float d02 = sampleDepth(v_uv + vec2(-ts.x,  ts.y));
    float d12 = sampleDepth(v_uv + vec2( 0.0,   ts.y));
    float d22 = sampleDepth(v_uv + vec2( ts.x,  ts.y));

    float sobelX = -d00 + d20 - 2.0*d01 + 2.0*d21 - d02 + d22;
    float sobelY = -d00 - 2.0*d10 - d20 + d02 + 2.0*d12 + d22;
    float depthEdge = sqrt(sobelX * sobelX + sobelY * sobelY) * u_depthSensitivity;

    // Normal discontinuity (dot product difference from neighbors)
    vec3 nc = sampleNormal(v_uv);
    float normalEdge = 0.0;
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2( ts.x, 0.0))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(-ts.x, 0.0))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(0.0,  ts.y))));
    normalEdge += 1.0 - max(0.0, dot(nc, sampleNormal(v_uv + vec2(0.0, -ts.y))));
    normalEdge *= u_normalSensitivity * 0.25;

    // Combined edge strength
    float edge = clamp(depthEdge + normalEdge, 0.0, 1.0);

    outEdge = vec4(edge, depthEdge, normalEdge, 1.0);
}
`;

/**
 * Inscription pattern shader — renders a VIB3 procedural pattern
 * masked by edge strength, with per-layer thickness and color.
 */
const INSCRIPTION_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_edgeMap;      // from edge detection pass
uniform sampler2D u_normalDepth;  // GBuffer normals for pattern orientation
uniform float     u_time;
uniform float     u_geometry;     // VIB3 geometry index (0-23)
uniform float     u_layerIndex;   // which inscription layer (0-3)
uniform float     u_layerCount;   // total layers
uniform float     u_thickness;    // edge thickness for this layer
uniform float     u_opacity;
uniform vec3      u_layerColor;   // base color tint for this layer
uniform float     u_patternScale; // procedural pattern scale
uniform float     u_patternSpeed; // animation speed
uniform vec2      u_resolution;

// 4D rotation uniforms
uniform float u_rot4dXY;
uniform float u_rot4dXZ;
uniform float u_rot4dYZ;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;

out vec4 outColor;

// --- 4D rotation matrices ---
mat4 rotateXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotateXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 rotateYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotateXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotateYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotateZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

mat4 rotate4D() {
    return rotateXY(u_rot4dXY) * rotateXZ(u_rot4dXZ) * rotateYZ(u_rot4dYZ) *
           rotateXW(u_rot4dXW) * rotateYW(u_rot4dYW) * rotateZW(u_rot4dZW);
}

// --- Procedural SDF patterns (from VIB3 geometry vocabulary) ---
float sdTorus(vec3 p, float R, float r) {
    vec2 q = vec2(length(p.xz) - R, p.y);
    return length(q) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdTetrahedron(vec3 p) {
    float d = max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) * 0.5;
    return max(d, -p.z - 0.5) - 0.2;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float getPattern(vec3 p, float geom) {
    float t = u_time * u_patternSpeed;

    // Base geometry (0-7)
    float base = mod(geom, 8.0);
    float pattern = 0.0;

    if (base < 0.5) {
        // Tetrahedron lattice
        pattern = abs(sdTetrahedron(p * 3.0 + vec3(sin(t), cos(t*0.7), 0.0)));
    } else if (base < 1.5) {
        // Hypercube grid
        vec3 q = fract(p * 4.0 + t * 0.1) - 0.5;
        pattern = sdBox(q, vec3(0.3));
    } else if (base < 2.5) {
        // Sphere harmonics
        float r = length(p);
        float theta = atan(p.y, p.x) + t * 0.3;
        float phi = acos(clamp(p.z / max(r, 0.001), -1.0, 1.0));
        pattern = abs(sin(theta * 3.0) * sin(phi * 4.0 + t));
    } else if (base < 3.5) {
        // Torus rings
        pattern = abs(sdTorus(p, 0.5, 0.15 + sin(t) * 0.05));
    } else if (base < 4.5) {
        // Klein bottle twist
        float a = atan(p.y, p.x) + t * 0.2;
        float r = length(p.xy);
        pattern = abs(sin(a * 3.0 + p.z * 5.0 + t));
    } else if (base < 5.5) {
        // Fractal (Sierpinski-like)
        vec3 q = p * 2.0;
        float s = 1.0;
        for (int i = 0; i < 4; i++) {
            q = abs(q) - vec3(1.0, 1.0, 1.0);
            q *= 2.0; s *= 2.0;
            q -= vec3(1.0, 1.0, 1.0);
        }
        pattern = length(q) / s;
    } else if (base < 6.5) {
        // Wave interference
        pattern = sin(p.x * 8.0 + t) * sin(p.y * 8.0 + t * 0.7) * sin(p.z * 8.0 + t * 1.3);
        pattern = abs(pattern);
    } else {
        // Crystal lattice
        vec3 q = abs(fract(p * 3.0 + t * 0.05) - 0.5);
        pattern = min(min(q.x, q.y), q.z);
    }

    // Core type warp (8-15: hypersphere, 16-23: hypertetrahedron)
    if (geom >= 8.0 && geom < 16.0) {
        float r = length(p);
        pattern *= smoothstep(0.0, 1.0, 1.0 - abs(r - 0.5));
    } else if (geom >= 16.0) {
        float d = sdTetrahedron(p * 1.5);
        pattern *= smoothstep(0.2, 0.0, abs(d));
    }

    return clamp(pattern, 0.0, 1.0);
}

void main() {
    vec4 edgeData = texture(u_edgeMap, v_uv);
    float edge = edgeData.r;

    // Layer-specific edge thickness: inner layers thinner, outer thicker
    float layerT = u_layerIndex / max(1.0, u_layerCount - 1.0);
    float innerThreshold = layerT * u_thickness;
    float outerThreshold = (layerT + 1.0 / u_layerCount) * u_thickness;

    // Edge mask for this layer
    float mask = smoothstep(innerThreshold, innerThreshold + 0.02, edge)
               * (1.0 - smoothstep(outerThreshold, outerThreshold + 0.02, edge));

    if (mask < 0.001) {
        outColor = vec4(0.0);
        return;
    }

    // Generate procedural pattern in edge-aligned UV space
    // Use GBuffer normal to orient the pattern
    vec3 normal = texture(u_normalDepth, v_uv).rgb * 2.0 - 1.0;

    vec2 aspect = vec2(1.0, u_resolution.y / u_resolution.x);
    vec3 patternPos = vec3(
        (v_uv * 2.0 - 1.0) * aspect * u_patternScale,
        u_layerIndex * 0.5
    );

    // Apply 4D rotation to pattern coordinates
    vec4 p4 = rotate4D() * vec4(patternPos, 0.0);
    vec3 projected = p4.xyz / (2.0 - p4.w);

    // Evaluate VIB3 procedural pattern
    float pattern = getPattern(projected, u_geometry);

    // Layer-specific color: shift hue per layer for holographic iridescence
    float hueShift = layerT * 0.3 + u_time * 0.05;
    vec3 iridescentColor = u_layerColor;
    iridescentColor.r *= 0.8 + 0.2 * sin(hueShift * 6.2832);
    iridescentColor.g *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 2.094);
    iridescentColor.b *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 4.189);

    // Final composited inscription
    float alpha = mask * pattern * u_opacity;
    vec3 color = iridescentColor * (0.6 + pattern * 0.4);

    // Add glow at edge peak
    float glowStrength = smoothstep(0.3, 0.8, edge) * pattern * 0.5;
    color += vec3(glowStrength) * u_layerColor;

    outColor = vec4(color * alpha, alpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Blit shader (for compositing)                                      */
/* ------------------------------------------------------------------ */

const BLIT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 outColor;
void main() {
    vec4 c = texture(u_texture, v_uv);
    outColor = vec4(c.rgb, c.a * u_opacity);
}
`;

/* ------------------------------------------------------------------ */
/*  FBO helper                                                         */
/* ------------------------------------------------------------------ */

function createFBO(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer: fb, texture: tex, width: w, height: h };
}

function destroyFBO(gl, fbo) {
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
}

/* ------------------------------------------------------------------ */
/*  EdgeInscriptionLayer                                               */
/* ------------------------------------------------------------------ */

export class EdgeInscriptionLayer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, {
        layerCount = 4,
        geometry = 3,             // VIB3 geometry index (default: Torus)
        thickness = 0.6,          // edge thickness
        patternScale = 3.0,       // procedural pattern scale
        patternSpeed = 0.3,       // pattern animation speed
        depthSensitivity = 8.0,   // depth edge sensitivity
        normalSensitivity = 2.0,  // normal edge sensitivity
        baseColor = [0.3, 0.7, 1.0], // holographic base color (cyan-ish)
        opacity = 0.8,
    } = {}) {
        this.gl = gl;
        this.layerCount = layerCount;
        this.geometry = geometry;
        this.thickness = thickness;
        this.patternScale = patternScale;
        this.patternSpeed = patternSpeed;
        this.depthSensitivity = depthSensitivity;
        this.normalSensitivity = normalSensitivity;
        this.baseColor = baseColor;
        this.opacity = opacity;

        // 4D rotation angles (radians)
        this.rot4dXY = 0;
        this.rot4dXZ = 0;
        this.rot4dYZ = 0;
        this.rot4dXW = 0;
        this.rot4dYW = 0;
        this.rot4dZW = 0;

        // Layer-specific colors (iridescent holographic palette)
        this.layerColors = [
            [0.2, 0.6, 1.0],   // cyan
            [0.8, 0.3, 1.0],   // violet
            [1.0, 0.5, 0.2],   // amber
            [0.3, 1.0, 0.6],   // mint
        ];
        this.layerOpacities = [0.9, 0.7, 0.5, 0.3];

        // Programs
        this._edgeProgram = null;
        this._inscriptionProgram = null;
        this._blitProgram = null;
        this._quadVao = null;

        // FBOs
        this._edgeFBO = null;
        this._layerFBO = null;
        this._compositeFBO = null;
        this._width = 0;
        this._height = 0;

        this._init();
    }

    _init() {
        const gl = this.gl;

        this._edgeProgram = this._createProgram(FULLSCREEN_VERT, EDGE_DETECT_FRAGMENT);
        this._inscriptionProgram = this._createProgram(FULLSCREEN_VERT, INSCRIPTION_FRAGMENT);
        this._blitProgram = this._createProgram(FULLSCREEN_VERT, BLIT_FRAGMENT);
        this._quadVao = gl.createVertexArray();
    }

    _ensureFBOs(w, h) {
        if (this._width === w && this._height === h) return;

        const gl = this.gl;
        if (this._edgeFBO) destroyFBO(gl, this._edgeFBO);
        if (this._layerFBO) destroyFBO(gl, this._layerFBO);
        if (this._compositeFBO) destroyFBO(gl, this._compositeFBO);

        this._edgeFBO = createFBO(gl, w, h);
        this._layerFBO = createFBO(gl, w, h);
        this._compositeFBO = createFBO(gl, w, h);
        this._width = w;
        this._height = h;
    }

    /* -------------------------------------------------------------- */
    /*  Main render                                                    */
    /* -------------------------------------------------------------- */

    /**
     * Render inscription layers from a MeshRenderer's GBuffer.
     *
     * @param {WebGLTexture} normalDepthTexture  GBuffer attachment 1
     *        (rgb = normal*0.5+0.5, a = depth/100)
     * @param {number} time  Elapsed seconds
     * @param {object} [opts]
     * @param {number} [opts.width]
     * @param {number} [opts.height]
     * @returns {{ texture: WebGLTexture, framebuffer: WebGLFramebuffer }}
     *   The composited inscription layer
     */
    render(normalDepthTexture, time, { width = 0, height = 0 } = {}) {
        const gl = this.gl;
        const w = width || gl.canvas.width;
        const h = height || gl.canvas.height;

        this._ensureFBOs(w, h);

        // --- Pass 1: Edge detection ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._edgeFBO.framebuffer);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.useProgram(this._edgeProgram);
        gl.bindVertexArray(this._quadVao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, normalDepthTexture);
        gl.uniform1i(gl.getUniformLocation(this._edgeProgram, 'u_normalDepth'), 0);
        gl.uniform2f(gl.getUniformLocation(this._edgeProgram, 'u_texelSize'), 1/w, 1/h);
        gl.uniform1f(gl.getUniformLocation(this._edgeProgram, 'u_depthSensitivity'), this.depthSensitivity);
        gl.uniform1f(gl.getUniformLocation(this._edgeProgram, 'u_normalSensitivity'), this.normalSensitivity);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // --- Pass 2: Render inscription layers ---
        // Clear composite buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        for (let layer = 0; layer < this.layerCount; layer++) {
            // Render this inscription layer into layerFBO
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._layerFBO.framebuffer);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.BLEND);

            gl.useProgram(this._inscriptionProgram);
            gl.bindVertexArray(this._quadVao);

            // Bind textures
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._edgeFBO.texture);
            gl.uniform1i(gl.getUniformLocation(this._inscriptionProgram, 'u_edgeMap'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, normalDepthTexture);
            gl.uniform1i(gl.getUniformLocation(this._inscriptionProgram, 'u_normalDepth'), 1);

            // Uniforms
            const prog = this._inscriptionProgram;
            gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), time);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_geometry'), this.geometry);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_layerIndex'), layer);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_layerCount'), this.layerCount);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_thickness'), this.thickness);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_opacity'),
                this.layerOpacities[layer] !== undefined ? this.layerOpacities[layer] : this.opacity);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_patternScale'), this.patternScale);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_patternSpeed'), this.patternSpeed);
            gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), w, h);

            const lc = this.layerColors[layer] || this.baseColor;
            gl.uniform3fv(gl.getUniformLocation(prog, 'u_layerColor'), lc);

            // 4D rotation
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dXY'), this.rot4dXY);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dXZ'), this.rot4dXZ);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dYZ'), this.rot4dYZ);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dXW'), this.rot4dXW);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dYW'), this.rot4dYW);
            gl.uniform1f(gl.getUniformLocation(prog, 'u_rot4dZW'), this.rot4dZW);

            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Composite this layer into the composite buffer (additive)
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.framebuffer);
            gl.viewport(0, 0, w, h);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);    // additive blending for holographic glow

            gl.useProgram(this._blitProgram);
            gl.bindVertexArray(this._quadVao);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._layerFBO.texture);
            gl.uniform1i(gl.getUniformLocation(this._blitProgram, 'u_texture'), 0);
            gl.uniform1f(gl.getUniformLocation(this._blitProgram, 'u_opacity'), 1.0);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return this._compositeFBO;
    }

    /** Access the edge detection output (useful for debugging). */
    get edgeTexture() {
        return this._edgeFBO ? this._edgeFBO.texture : null;
    }

    /** Access the final composited inscription. */
    get compositeTexture() {
        return this._compositeFBO ? this._compositeFBO.texture : null;
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
            throw new Error('EdgeInscriptionLayer link error: ' + gl.getProgramInfoLog(p));
        }
        return p;
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('EdgeInscriptionLayer compile error: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteProgram(this._edgeProgram);
        gl.deleteProgram(this._inscriptionProgram);
        gl.deleteProgram(this._blitProgram);
        gl.deleteVertexArray(this._quadVao);
        if (this._edgeFBO) destroyFBO(gl, this._edgeFBO);
        if (this._layerFBO) destroyFBO(gl, this._layerFBO);
        if (this._compositeFBO) destroyFBO(gl, this._compositeFBO);
    }
}

export default EdgeInscriptionLayer;
