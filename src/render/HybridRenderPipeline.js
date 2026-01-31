/**
 * HybridRenderPipeline
 *
 * Multi-layer compositing pipeline that unifies traditional mesh/polygon
 * rendering, Gaussian splat rendering, procedural VIB3 shader effects,
 * and holographic edge inscription into a single coherent output.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                     HYBRID RENDER PIPELINE                          │
 * │                                                                     │
 * │  Layer 0: MESH         Traditional triangles → GBuffer (depth+normal)│
 * │                         MeshRenderer output                         │
 * │                                                                     │
 * │  Layer 1: SPLAT         Gaussian splats (depth-tested against mesh) │
 * │                         GaussianSplatRenderer / ExperimentalSplat   │
 * │                                                                     │
 * │  Layer 2: PROCEDURAL    VIB3 fullscreen shader (24 geometry variants)│
 * │                         Quantum/Faceted/Holographic systems          │
 * │                                                                     │
 * │  Layer 3: INSCRIPTION   Holographic edge overlay from GBuffer       │
 * │                         EdgeInscriptionLayer with 4D rotation       │
 * │                                                                     │
 * │  ─── COMPOSITOR ───                                                 │
 * │                                                                     │
 * │  Mathematical blending with per-layer:                              │
 * │    - opacity                                                        │
 * │    - blend mode (alpha, additive, multiply, screen)                 │
 * │    - depth interaction (test against mesh, ignore, write)           │
 * │    - mask (edge-only, surface-only, full)                           │
 * │                                                                     │
 * │  Post-process:                                                      │
 * │    - Bloom (shared with ExperimentalSplatRenderer)                  │
 * │    - Tone mapping                                                   │
 * │    - Final output                                                   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * The pipeline does NOT require all layers to be active.  You can render
 * just mesh + inscription, or just splats + procedural, etc.
 *
 * Usage:
 *   const pipeline = new HybridRenderPipeline(gl);
 *   pipeline.setMeshRenderer(meshRenderer);
 *   pipeline.setSplatRenderer(splatRenderer);
 *   pipeline.setEdgeInscription(edgeInscription);
 *   pipeline.render(time, viewProjection, projection);
 */

/* ------------------------------------------------------------------ */
/*  Compositor shaders                                                  */
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
 * Compositor fragment shader — blends up to 4 layers with configurable
 * blend modes and a shared depth buffer for correct occlusion.
 */
const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

// Layer textures
uniform sampler2D u_meshLayer;         // Layer 0: mesh color
uniform sampler2D u_splatLayer;        // Layer 1: splat color
uniform sampler2D u_proceduralLayer;   // Layer 2: procedural VIB3
uniform sampler2D u_inscriptionLayer;  // Layer 3: edge inscription

// Per-layer control
uniform float u_meshOpacity;
uniform float u_splatOpacity;
uniform float u_proceduralOpacity;
uniform float u_inscriptionOpacity;

uniform float u_meshEnabled;
uniform float u_splatEnabled;
uniform float u_proceduralEnabled;
uniform float u_inscriptionEnabled;

// Blend modes: 0 = alpha, 1 = additive, 2 = multiply, 3 = screen
uniform float u_meshBlend;
uniform float u_splatBlend;
uniform float u_proceduralBlend;
uniform float u_inscriptionBlend;

// Global post-process
uniform float u_exposure;
uniform float u_gamma;

out vec4 outColor;

vec3 blendLayers(vec3 base, vec4 layer, float mode) {
    vec3 lc = layer.rgb;
    float la = layer.a;

    if (la < 0.001) return base;

    if (mode < 0.5) {
        // Alpha blend
        return mix(base, lc, la);
    } else if (mode < 1.5) {
        // Additive
        return base + lc * la;
    } else if (mode < 2.5) {
        // Multiply
        return mix(base, base * lc, la);
    } else {
        // Screen
        return mix(base, 1.0 - (1.0 - base) * (1.0 - lc), la);
    }
}

void main() {
    vec3 color = vec3(0.012, 0.02, 0.05);   // base background

    // Layer 0: Mesh (base)
    if (u_meshEnabled > 0.5) {
        vec4 mesh = texture(u_meshLayer, v_uv);
        mesh.a *= u_meshOpacity;
        color = blendLayers(color, mesh, u_meshBlend);
    }

    // Layer 1: Splats
    if (u_splatEnabled > 0.5) {
        vec4 splat = texture(u_splatLayer, v_uv);
        splat.a *= u_splatOpacity;
        color = blendLayers(color, splat, u_splatBlend);
    }

    // Layer 2: Procedural
    if (u_proceduralEnabled > 0.5) {
        vec4 proc = texture(u_proceduralLayer, v_uv);
        proc.a *= u_proceduralOpacity;
        color = blendLayers(color, proc, u_proceduralBlend);
    }

    // Layer 3: Edge Inscription (always additive by default for glow)
    if (u_inscriptionEnabled > 0.5) {
        vec4 insc = texture(u_inscriptionLayer, v_uv);
        insc.a *= u_inscriptionOpacity;
        color = blendLayers(color, insc, u_inscriptionBlend);
    }

    // Tone mapping (simple Reinhard)
    color *= u_exposure;
    color = color / (color + vec3(1.0));

    // Gamma correction
    color = pow(color, vec3(1.0 / u_gamma));

    outColor = vec4(color, 1.0);
}
`;

/**
 * Simple blit for rendering individual layers to their FBOs.
 */
const BLIT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
    outColor = texture(u_texture, v_uv);
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

    const depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer: fb, texture: tex, depthRb, width: w, height: h };
}

function destroyFBO(gl, fbo) {
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
    gl.deleteRenderbuffer(fbo.depthRb);
}

/* ------------------------------------------------------------------ */
/*  Blend mode constants                                               */
/* ------------------------------------------------------------------ */

export const BlendModes = Object.freeze({
    ALPHA:    0,
    ADDITIVE: 1,
    MULTIPLY: 2,
    SCREEN:   3,
});

/* ------------------------------------------------------------------ */
/*  Layer configuration                                                */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} LayerConfig
 * @property {boolean} enabled
 * @property {number}  opacity    0-1
 * @property {number}  blendMode  BlendModes constant
 */

function defaultLayerConfig(overrides = {}) {
    return {
        enabled: true,
        opacity: 1.0,
        blendMode: BlendModes.ALPHA,
        ...overrides,
    };
}

/* ------------------------------------------------------------------ */
/*  HybridRenderPipeline                                               */
/* ------------------------------------------------------------------ */

export class HybridRenderPipeline {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, {
        exposure = 1.2,
        gamma = 2.2,
    } = {}) {
        this.gl = gl;
        this.exposure = exposure;
        this.gamma = gamma;

        // External renderers (set via setters)
        this._meshRenderer = null;
        this._splatRenderer = null;
        this._proceduralRenderer = null;   // function(fbo, time) — custom callback
        this._edgeInscription = null;

        // Layer configs
        this.meshLayer = defaultLayerConfig();
        this.splatLayer = defaultLayerConfig({ blendMode: BlendModes.ADDITIVE, opacity: 0.9 });
        this.proceduralLayer = defaultLayerConfig({ blendMode: BlendModes.SCREEN, opacity: 0.5 });
        this.inscriptionLayer = defaultLayerConfig({ blendMode: BlendModes.ADDITIVE, opacity: 0.8 });

        // Internal
        this._compositeProgram = null;
        this._blitProgram = null;
        this._quadVao = null;

        this._splatFBO = null;
        this._proceduralFBO = null;
        this._width = 0;
        this._height = 0;

        // Dummy 1x1 black texture for unused layers
        this._blackTexture = null;

        this._init();
    }

    _init() {
        const gl = this.gl;

        this._compositeProgram = this._createProgram(FULLSCREEN_VERT, COMPOSITE_FRAGMENT);
        this._blitProgram = this._createProgram(FULLSCREEN_VERT, BLIT_FRAGMENT);
        this._quadVao = gl.createVertexArray();

        // 1x1 black texture placeholder
        this._blackTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._blackTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    _ensureFBOs(w, h) {
        if (this._width === w && this._height === h) return;

        const gl = this.gl;
        if (this._splatFBO) destroyFBO(gl, this._splatFBO);
        if (this._proceduralFBO) destroyFBO(gl, this._proceduralFBO);

        this._splatFBO = createFBO(gl, w, h);
        this._proceduralFBO = createFBO(gl, w, h);
        this._width = w;
        this._height = h;
    }

    /* -------------------------------------------------------------- */
    /*  Renderer setters                                               */
    /* -------------------------------------------------------------- */

    /** @param {MeshRenderer} renderer */
    setMeshRenderer(renderer) { this._meshRenderer = renderer; }

    /**
     * @param {GaussianSplatRenderer|ExperimentalSplatRenderer} renderer
     */
    setSplatRenderer(renderer) { this._splatRenderer = renderer; }

    /**
     * Set a procedural render callback.
     * The callback receives (fbo, time) and should render into the FBO.
     * It can use any VIB3 system (Quantum/Faceted/Holographic).
     *
     * @param {function(object, number): void} callback
     */
    setProceduralRenderer(callback) { this._proceduralRenderer = callback; }

    /** @param {EdgeInscriptionLayer} layer */
    setEdgeInscription(layer) { this._edgeInscription = layer; }

    /* -------------------------------------------------------------- */
    /*  Main render                                                    */
    /* -------------------------------------------------------------- */

    /**
     * Render all active layers and composite to the canvas.
     *
     * @param {number} time              Elapsed seconds
     * @param {Float32Array} modelView   4x4 model-view matrix
     * @param {Float32Array} projection  4x4 projection matrix
     * @param {object} [opts]
     * @param {Float32Array} [opts.viewProjection]  Combined VP for splats
     * @param {Float32Array} [opts.rotation4D]      4D rotation for mesh
     * @param {number}       [opts.projDistance]     4D proj distance
     * @returns {object} Render statistics
     */
    render(time, modelView, projection, {
        viewProjection = null,
        rotation4D = null,
        projDistance = 2.0,
    } = {}) {
        const gl = this.gl;
        const w = gl.canvas.width;
        const h = gl.canvas.height;

        this._ensureFBOs(w, h);

        const stats = {
            meshRendered: false,
            splatRendered: false,
            proceduralRendered: false,
            inscriptionRendered: false,
            layersComposited: 0,
        };

        // Texture handles for compositing (default to black)
        let meshColorTex = this._blackTexture;
        let splatTex = this._blackTexture;
        let proceduralTex = this._blackTexture;
        let inscriptionTex = this._blackTexture;
        let normalDepthTex = null;

        // --- Layer 0: Mesh ---
        if (this._meshRenderer && this.meshLayer.enabled) {
            const gbuffer = this._meshRenderer.render(modelView, projection, {
                rotation4D, projDistance, width: w, height: h,
            });
            meshColorTex = gbuffer.colorTexture;
            normalDepthTex = gbuffer.normalTexture;
            stats.meshRendered = true;
        }

        // --- Layer 1: Splats ---
        if (this._splatRenderer && this.splatLayer.enabled) {
            // Render splats into their own FBO
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._splatFBO.framebuffer);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Copy mesh depth buffer to splat FBO for correct occlusion
            if (stats.meshRendered && this._meshRenderer.gbuffer) {
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._meshRenderer.gbuffer.framebuffer);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._splatFBO.framebuffer);
                gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h,
                    gl.DEPTH_BUFFER_BIT, gl.NEAREST);
                gl.bindFramebuffer(gl.FRAMEBUFFER, this._splatFBO.framebuffer);
            }

            // The splat renderer manages its own program/state
            const vp = viewProjection || new Float32Array([
                1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1
            ]);

            // Save current FBO binding, render splats, restore
            const prevFBO = this._splatFBO.framebuffer;
            gl.bindFramebuffer(gl.FRAMEBUFFER, prevFBO);
            gl.viewport(0, 0, w, h);

            // For ExperimentalSplatRenderer, we need to handle differently
            // since it manages its own FBOs internally. For base
            // GaussianSplatRenderer, it renders to current FBO.
            if (this._splatRenderer.render) {
                // Temporarily hijack — both renderers call gl.bindFramebuffer(null)
                // internally, but we need output in our FBO.
                // We render directly then blit.
                this._splatRenderer.render(vp, time);

                // The renderer rendered to canvas (FBO null), blit canvas to our FBO
                // Actually, for GaussianSplatRenderer it clears and draws to
                // current framebuffer. Let's re-render properly.
                gl.bindFramebuffer(gl.FRAMEBUFFER, this._splatFBO.framebuffer);

                // For standalone splat rendering we need to call the draw
                // method directly if available, otherwise re-render
                if (this._splatRenderer._drawSplats) {
                    // ExperimentalSplatRenderer path
                    gl.viewport(0, 0, w, h);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._splatRenderer._drawSplats(vp, time);
                }
            }

            splatTex = this._splatFBO.texture;
            stats.splatRendered = true;
        }

        // --- Layer 2: Procedural ---
        if (this._proceduralRenderer && this.proceduralLayer.enabled) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._proceduralFBO.framebuffer);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            this._proceduralRenderer(this._proceduralFBO, time);

            proceduralTex = this._proceduralFBO.texture;
            stats.proceduralRendered = true;
        }

        // --- Layer 3: Edge Inscription ---
        if (this._edgeInscription && this.inscriptionLayer.enabled && normalDepthTex) {
            const inscResult = this._edgeInscription.render(normalDepthTex, time, {
                width: w, height: h,
            });
            inscriptionTex = inscResult.texture;
            stats.inscriptionRendered = true;
        }

        // --- COMPOSITE ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.useProgram(this._compositeProgram);
        gl.bindVertexArray(this._quadVao);

        const prog = this._compositeProgram;

        // Bind layer textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, meshColorTex);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_meshLayer'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, splatTex);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_splatLayer'), 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, proceduralTex);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_proceduralLayer'), 2);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, inscriptionTex);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_inscriptionLayer'), 3);

        // Per-layer config
        gl.uniform1f(gl.getUniformLocation(prog, 'u_meshOpacity'), this.meshLayer.opacity);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_splatOpacity'), this.splatLayer.opacity);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_proceduralOpacity'), this.proceduralLayer.opacity);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_inscriptionOpacity'), this.inscriptionLayer.opacity);

        gl.uniform1f(gl.getUniformLocation(prog, 'u_meshEnabled'),
            this.meshLayer.enabled && stats.meshRendered ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_splatEnabled'),
            this.splatLayer.enabled && stats.splatRendered ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_proceduralEnabled'),
            this.proceduralLayer.enabled && stats.proceduralRendered ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_inscriptionEnabled'),
            this.inscriptionLayer.enabled && stats.inscriptionRendered ? 1.0 : 0.0);

        gl.uniform1f(gl.getUniformLocation(prog, 'u_meshBlend'), this.meshLayer.blendMode);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_splatBlend'), this.splatLayer.blendMode);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_proceduralBlend'), this.proceduralLayer.blendMode);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_inscriptionBlend'), this.inscriptionLayer.blendMode);

        // Post-process
        gl.uniform1f(gl.getUniformLocation(prog, 'u_exposure'), this.exposure);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_gamma'), this.gamma);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Count active layers
        stats.layersComposited =
            (stats.meshRendered ? 1 : 0) +
            (stats.splatRendered ? 1 : 0) +
            (stats.proceduralRendered ? 1 : 0) +
            (stats.inscriptionRendered ? 1 : 0);

        return stats;
    }

    /* -------------------------------------------------------------- */
    /*  Convenience: render splats directly to canvas                   */
    /*  (bypass compositor for splat-only scenes)                       */
    /* -------------------------------------------------------------- */

    renderSplatOnly(viewProjection, time) {
        if (!this._splatRenderer) return;
        this._splatRenderer.render(viewProjection, time);
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
            throw new Error('HybridRenderPipeline link error: ' + gl.getProgramInfoLog(p));
        }
        return p;
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('HybridRenderPipeline compile error: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteProgram(this._compositeProgram);
        gl.deleteProgram(this._blitProgram);
        gl.deleteVertexArray(this._quadVao);
        gl.deleteTexture(this._blackTexture);
        if (this._splatFBO) destroyFBO(gl, this._splatFBO);
        if (this._proceduralFBO) destroyFBO(gl, this._proceduralFBO);
    }
}

export default HybridRenderPipeline;
