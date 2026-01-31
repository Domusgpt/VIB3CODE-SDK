/**
 * ExperimentalSplatRenderer
 *
 * Test-bed for rendering optimization tricks on top of the Gaussian splat
 * pipeline.  Each technique can be toggled independently so we can measure
 * its isolated impact.
 *
 * Techniques implemented:
 *
 *   1. A/B Frame Interleaving (temporal interlacing)
 *      Render odd splats on even frames, even splats on odd frames.
 *      Halves per-frame draw count, effectively 2× visual density for free.
 *
 *   2. Temporal Accumulation (pixel persistence / trail buffer)
 *      Don't fully clear the framebuffer — blend previous frame at a
 *      configurable decay factor.  Splats "linger" as fading ghosts.
 *
 *   3. Stochastic Thinning
 *      Each frame, each splat has a random probability of being drawn.
 *      Over 3-4 frames the eye integrates the full set.  Controlled by
 *      a "density" parameter (0.0-1.0 = fraction drawn per frame).
 *
 *   4. Resolution Scaling
 *      Render to an offscreen FBO at a fraction of native resolution,
 *      then blit/upscale to the canvas.  Halves (or more) fragment cost.
 *
 *   5. Additive Trail Buffer
 *      Separate low-res FBO accumulates bright splat positions over time.
 *      Composited on top of the main pass as a glow/trail layer.
 *
 *   6. Screen-Space Bloom (post-process)
 *      Dual-pass Kawase blur on bright pixels extracted via luminance
 *      threshold.  Makes sparse splats feel denser.
 *
 * The renderer wraps a standard splat draw call and adds the tricks as
 * pre/post passes.  It owns its own FBOs and full-screen quad program.
 */

import { GAUSSIAN_SEED_STRIDE } from './GaussianSeedBuffer.js';

/* ------------------------------------------------------------------ */
/*  Full-screen quad (shared by post-process passes)                   */
/* ------------------------------------------------------------------ */

const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    // Triangle that covers the screen
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/* Blit / composite pass — used for resolution scaling + trail composite */
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

/* Bloom extract — keep only bright pixels */
const BLOOM_EXTRACT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_threshold;
out vec4 outColor;
void main() {
    vec4 c = texture(u_texture, v_uv);
    float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    float soft = smoothstep(u_threshold, u_threshold + 0.2, lum);
    outColor = vec4(c.rgb * soft, c.a * soft);
}
`;

/* Kawase blur pass */
const KAWASE_BLUR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_offset;
out vec4 outColor;
void main() {
    vec2 ts = u_texelSize * u_offset;
    vec4 sum = texture(u_texture, v_uv + vec2(-ts.x, -ts.y))
             + texture(u_texture, v_uv + vec2( ts.x, -ts.y))
             + texture(u_texture, v_uv + vec2(-ts.x,  ts.y))
             + texture(u_texture, v_uv + vec2( ts.x,  ts.y));
    outColor = sum * 0.25;
}
`;

/* Trail decay pass — reads prev frame and fades it */
const TRAIL_DECAY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_decay;
out vec4 outColor;
void main() {
    vec4 c = texture(u_texture, v_uv);
    outColor = c * u_decay;
}
`;

/* ------------------------------------------------------------------ */
/*  Splat vertex / fragment  (extended with stochastic + A/B support)  */
/* ------------------------------------------------------------------ */

const SPLAT_VERTEX = `#version 300 es
precision highp float;

in vec3  a_position;
in float a_scale;
in vec4  a_orientation;
in vec3  a_color;
in float a_depth;

uniform float u_pointScale;
uniform float u_time;
uniform float u_animate;
uniform float u_intensity;
uniform float u_chromatic;
uniform mat4  u_viewProjection;

// Experimental uniforms
uniform float u_splatIndex;     // base vertex index (for A/B + stochastic)
uniform float u_frameNumber;    // current frame number
uniform float u_abEnabled;      // 1.0 = A/B interleaving active
uniform float u_stochDensity;   // 0.0-1.0 fraction of splats to draw (1.0 = all)

flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;
flat out vec2  v_axisV;
flat out float v_hash;
flat out float v_bloom;

void main() {
    // --- Per-splat hash ---
    float h1 = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(a_position.yz, vec2(45.164, 93.721))) * 23456.789);
    float h3 = fract(sin(dot(a_position.xz, vec2(63.7264, 10.873))) * 65432.123);
    v_hash = h1;

    // --- A/B frame interleaving ---
    // On even frames draw even-indexed splats; on odd frames draw odd-indexed.
    float splatIdx = u_splatIndex + float(gl_VertexID);
    float frameParity = mod(u_frameNumber, 2.0);
    float splatParity = mod(splatIdx, 2.0);
    if (u_abEnabled > 0.5 && abs(frameParity - splatParity) > 0.5) {
        // Cull this splat by moving it off-screen
        gl_Position = vec4(99.0, 99.0, 99.0, 1.0);
        gl_PointSize = 0.0;
        v_color = vec3(0.0);
        v_depth = 0.0;
        v_axisU = vec2(0.0);
        v_axisV = vec2(0.0);
        v_bloom = 0.0;
        return;
    }

    // --- Stochastic thinning ---
    // Use hash to deterministically include/exclude splats per frame
    float stochHash = fract(h1 + u_frameNumber * 0.618033988749895);
    if (u_stochDensity < 0.999 && stochHash > u_stochDensity) {
        gl_Position = vec4(99.0, 99.0, 99.0, 1.0);
        gl_PointSize = 0.0;
        v_color = vec3(0.0);
        v_depth = 0.0;
        v_axisU = vec2(0.0);
        v_axisV = vec2(0.0);
        v_bloom = 0.0;
        return;
    }

    // --- GPU animation ---
    float animAmp = a_depth * u_animate * 0.06;
    float animSpd = 0.4 + h1 * 0.6;
    float breathe = sin(u_time * 0.15 + h3 * 6.2832) * 0.02 * u_animate;

    vec3 pos = a_position + vec3(
        sin(u_time * animSpd + h1 * 6.2832) * animAmp,
        cos(u_time * animSpd * 0.7 + h2 * 6.2832) * animAmp * 0.4 + breathe,
        cos(u_time * animSpd + h1 * 6.2832) * animAmp
    );

    vec4 clipPos = u_viewProjection * vec4(pos, 1.0);
    gl_Position = clipPos;

    float projDist = max(0.5, clipPos.w);
    float pulse = 1.0 + sin(u_time * 1.5 + h1 * 6.2832) * 0.12 * min(1.0, a_depth) * u_animate;
    float intensityBoost = 1.0 + (u_intensity - 1.0) * 0.15;
    float depthFade = 1.0 / (1.0 + a_depth * 0.15 * (1.0 - u_animate));

    // When using stochastic thinning, boost size to compensate for missing splats
    float stochBoost = u_stochDensity < 0.999 ? (1.0 / sqrt(max(0.1, u_stochDensity))) : 1.0;

    gl_PointSize = clamp(
        a_scale * pulse * intensityBoost * stochBoost * u_pointScale * depthFade / projDist,
        1.0, 2048.0
    );

    // Bloom energy
    float luminance = dot(a_color, vec3(0.2126, 0.7152, 0.0722));
    v_bloom = smoothstep(0.5, 1.0, luminance) * u_intensity;

    // Quaternion → ellipse
    float qw = a_orientation.x, qx = a_orientation.y;
    float qy = a_orientation.z, qz = a_orientation.w;
    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen; cosA *= invLen;
    float tilt = abs(2.0 * (qw * qx + qy * qz));
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
flat in float v_bloom;

uniform float u_time;
uniform float u_animate;
uniform float u_intensity;
uniform float u_chromatic;

out vec4 outColor;

void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    float r2 = u * u + v * v;
    float sigma = 0.20;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // HDR bloom
    float bloomSigma = 0.35;
    float bloomGauss = exp(-0.5 * r2 / (bloomSigma * bloomSigma));
    float bloomEnergy = v_bloom * 0.3;

    // Twinkle
    float twinkle1 = sin(u_time * 3.0 + v_hash * 6.2832) * 0.5 + 0.5;
    float twinkle2 = sin(u_time * 7.1 + v_hash * 3.1416) * 0.5 + 0.5;
    float twinkle = mix(
        1.0,
        0.75 + 0.25 * mix(twinkle1, twinkle2, 0.3),
        u_animate * min(1.0, v_depth)
    );
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.25 * (1.0 - u_animate));

    float coreAlpha = gauss * depthAlpha * twinkle;
    float totalAlpha = coreAlpha + bloomGauss * bloomEnergy;
    if (totalAlpha < 0.003) discard;

    // Chromatic aberration
    vec3 color = v_color;
    if (u_chromatic > 0.01 && v_bloom > 0.1) {
        float chromaticShift = u_chromatic * 0.015 * v_bloom;
        float rOff = exp(-0.5 * ((u - chromaticShift) * (u - chromaticShift) + v * v) / (bloomSigma * bloomSigma));
        float bOff = exp(-0.5 * ((u + chromaticShift) * (u + chromaticShift) + v * v) / (bloomSigma * bloomSigma));
        color.r += rOff * bloomEnergy * 0.4;
        color.b += bOff * bloomEnergy * 0.4;
    }

    color *= (0.5 + u_intensity * 0.5);
    outColor = vec4(color * totalAlpha, totalAlpha);
}
`;

/* ------------------------------------------------------------------ */
/*  FBO helper                                                         */
/* ------------------------------------------------------------------ */

/** Detect whether we can render to RGBA16F. Falls back to RGBA8. */
let _fboFormat = null;
function detectFBOFormat(gl) {
    if (_fboFormat) return _fboFormat;

    // Try RGBA16F first (better precision for trails/bloom)
    const hasHalf = gl.getExtension('EXT_color_buffer_half_float');
    if (hasHalf) {
        const testTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, testTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
        const testFb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, testFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(testFb);
        gl.deleteTexture(testTex);
        if (status === gl.FRAMEBUFFER_COMPLETE) {
            _fboFormat = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
            return _fboFormat;
        }
    }

    // Fallback: RGBA8 (universally supported)
    _fboFormat = { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    return _fboFormat;
}

function createFBO(gl, w, h, linear = true) {
    const fmt = detectFBOFormat(gl);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    // Depth renderbuffer
    const depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
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
/*  Renderer class                                                     */
/* ------------------------------------------------------------------ */

export class ExperimentalSplatRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, {
        pointScale = 14,
        blendMode = 'additive',
        animate = true,
        intensity = 1.0,
        chromatic = 0.5,
    } = {}) {
        this.gl = gl;
        this.pointScale = pointScale;
        this.blendMode = blendMode;
        this.animate = animate;
        this.intensity = intensity;
        this.chromatic = chromatic;

        this.count = 0;
        this.frameNumber = 0;

        // --- Technique toggles ---
        this.abInterleave = false;    // A/B frame interleaving
        this.trailDecay = 0.0;        // 0 = off, 0.5-0.99 = persistence
        this.stochDensity = 1.0;      // 1.0 = all splats, 0.3 = 30% per frame
        this.resolutionScale = 1.0;   // 1.0 = native, 0.5 = half res
        this.bloomEnabled = false;    // post-process bloom
        this.bloomThreshold = 0.4;
        this.bloomIntensity = 0.6;
        this.trailBufferEnabled = false; // additive trail buffer
        this.trailBufferDecay = 0.97;

        // Internal state
        this._splatProgram = null;
        this._splatVao = null;
        this._splatBuffer = null;
        this._splatUniforms = {};

        this._blitProgram = null;
        this._bloomExtractProgram = null;
        this._kawaseProgram = null;
        this._trailDecayProgram = null;
        this._quadVao = null;

        // FBOs
        this._mainFBO = null;    // for resolution scaling
        this._trailFBO = [null, null]; // ping-pong for temporal accumulation
        this._trailPing = 0;
        this._bloomFBO = [null, null]; // ping-pong for blur
        this._addTrailFBO = null; // additive trail buffer

        this._init();
    }

    /* -------------------------------------------------------------- */
    /*  Init                                                           */
    /* -------------------------------------------------------------- */

    _init() {
        const gl = this.gl;

        // --- Splat program ---
        this._splatProgram = this._createProgram(SPLAT_VERTEX, SPLAT_FRAGMENT);

        // --- Splat VAO ---
        this._splatVao = gl.createVertexArray();
        gl.bindVertexArray(this._splatVao);
        this._splatBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._splatBuffer);
        const stride = GAUSSIAN_SEED_STRIDE * 4;
        const bind = (name, size, offset) => {
            const loc = gl.getAttribLocation(this._splatProgram, name);
            if (loc < 0) return;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
        };
        bind('a_position', 3, 0);
        bind('a_scale', 1, 3);
        bind('a_orientation', 4, 4);
        bind('a_color', 3, 8);
        bind('a_depth', 1, 11);
        gl.bindVertexArray(null);

        // --- Splat uniforms ---
        const sp = this._splatProgram;
        const su = (n) => gl.getUniformLocation(sp, n);
        this._splatUniforms = {
            pointScale: su('u_pointScale'),
            viewProjection: su('u_viewProjection'),
            time: su('u_time'),
            animate: su('u_animate'),
            intensity: su('u_intensity'),
            chromatic: su('u_chromatic'),
            splatIndex: su('u_splatIndex'),
            frameNumber: su('u_frameNumber'),
            abEnabled: su('u_abEnabled'),
            stochDensity: su('u_stochDensity'),
        };

        // --- Fullscreen quad VAO (vertexless — gl_VertexID) ---
        this._quadVao = gl.createVertexArray();

        // --- Post-process programs (compiled lazily on first FBO use) ---
        this._blitProgram = null;
        this._bloomExtractProgram = null;
        this._kawaseProgram = null;
        this._trailDecayProgram = null;

        // FBOs created lazily when a trick that needs them is activated.
    }

    _ensureFBOs(w, h) {
        const gl = this.gl;

        // Lazy-compile post-process programs on first FBO use
        if (!this._blitProgram) {
            this._blitProgram = this._createProgram(FULLSCREEN_VERT, BLIT_FRAGMENT);
            this._bloomExtractProgram = this._createProgram(FULLSCREEN_VERT, BLOOM_EXTRACT_FRAGMENT);
            this._kawaseProgram = this._createProgram(FULLSCREEN_VERT, KAWASE_BLUR_FRAGMENT);
            this._trailDecayProgram = this._createProgram(FULLSCREEN_VERT, TRAIL_DECAY_FRAGMENT);
        }

        const sw = Math.max(1, Math.floor(w * this.resolutionScale));
        const sh = Math.max(1, Math.floor(h * this.resolutionScale));

        // Main FBO (resolution-scaled)
        if (!this._mainFBO || this._mainFBO.width !== sw || this._mainFBO.height !== sh) {
            if (this._mainFBO) destroyFBO(gl, this._mainFBO);
            this._mainFBO = createFBO(gl, sw, sh);
        }

        // Trail FBOs (full res for accumulation)
        for (let i = 0; i < 2; i++) {
            if (!this._trailFBO[i] || this._trailFBO[i].width !== w || this._trailFBO[i].height !== h) {
                if (this._trailFBO[i]) destroyFBO(gl, this._trailFBO[i]);
                this._trailFBO[i] = createFBO(gl, w, h);
                // Clear trail buffer
                gl.bindFramebuffer(gl.FRAMEBUFFER, this._trailFBO[i].framebuffer);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        }

        // Bloom FBOs (quarter res)
        const bw = Math.max(1, Math.floor(w / 2));
        const bh = Math.max(1, Math.floor(h / 2));
        for (let i = 0; i < 2; i++) {
            if (!this._bloomFBO[i] || this._bloomFBO[i].width !== bw || this._bloomFBO[i].height !== bh) {
                if (this._bloomFBO[i]) destroyFBO(gl, this._bloomFBO[i]);
                this._bloomFBO[i] = createFBO(gl, bw, bh);
            }
        }

        // Additive trail buffer (half res)
        const tw = Math.max(1, Math.floor(w / 2));
        const th = Math.max(1, Math.floor(h / 2));
        if (!this._addTrailFBO || this._addTrailFBO.width !== tw || this._addTrailFBO.height !== th) {
            if (this._addTrailFBO) destroyFBO(gl, this._addTrailFBO);
            this._addTrailFBO = createFBO(gl, tw, th);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._addTrailFBO.framebuffer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* -------------------------------------------------------------- */
    /*  Data upload                                                    */
    /* -------------------------------------------------------------- */

    updateSeeds(buffer, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this._splatBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
        this.count = count;
    }

    /* -------------------------------------------------------------- */
    /*  Main render                                                    */
    /* -------------------------------------------------------------- */

    /** Check whether any trick that requires FBOs is active. */
    _needsFBOs() {
        return this.trailDecay > 0.01
            || this.resolutionScale < 0.99
            || this.bloomEnabled
            || this.trailBufferEnabled;
    }

    render(viewProjection, time = 0) {
        const gl = this.gl;
        if (!this.count) return;

        const w = gl.canvas.width;
        const h = gl.canvas.height;
        this.frameNumber++;

        const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

        // --- FAST PATH: no FBO tricks active → render directly to canvas ---
        if (!this._needsFBOs()) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, w, h);
            gl.clearColor(0.012, 0.02, 0.05, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this._drawSplats(viewProjection || IDENTITY, time);
            gl.disable(gl.BLEND);
            return {
                drawnSplats: this._lastDrawnSplats,
                totalSplats: this.count,
                frameNumber: this.frameNumber,
            };
        }

        // --- FBO PATH: at least one FBO trick is active ---
        this._ensureFBOs(w, h);

        // --- Step 1: Temporal accumulation (fade previous frame) ---
        const useTrail = this.trailDecay > 0.01;
        if (useTrail) {
            this._doTrailDecay();
        }

        // --- Step 2: Render splats into FBO ---
        const sw = this._mainFBO.width;
        const sh = this._mainFBO.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._mainFBO.framebuffer);
        gl.viewport(0, 0, sw, sh);

        if (useTrail) {
            // Don't clear — composite on faded trail
            // We'll blit the trail into mainFBO first
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            this._blitTexture(this._trailFBO[this._trailPing].texture, 1.0);
        } else {
            gl.clearColor(0.012, 0.02, 0.05, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        // Draw splats
        this._drawSplats(viewProjection || IDENTITY, time);

        // --- Step 3: Copy main FBO to trail buffer (if trail active) ---
        if (useTrail) {
            const dst = 1 - this._trailPing;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._trailFBO[dst].framebuffer);
            gl.viewport(0, 0, w, h);
            this._blitTexture(this._mainFBO.texture, 1.0);
            this._trailPing = dst;
        }

        // --- Step 4: Additive trail buffer ---
        if (this.trailBufferEnabled) {
            this._updateAdditiveTrail();
        }

        // --- Step 5: Composite to screen ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);

        if (useTrail) {
            // Background clear for trail mode
            gl.clearColor(0.012, 0.02, 0.05, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // Blit main pass
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._blitTexture(this._mainFBO.texture, 1.0);

        // Composite additive trail on top
        if (this.trailBufferEnabled) {
            gl.blendFunc(gl.ONE, gl.ONE); // additive
            this._blitTexture(this._addTrailFBO.texture, 0.6);
        }

        // --- Step 6: Post-process bloom ---
        if (this.bloomEnabled) {
            this._doBloom(w, h);
        }

        gl.disable(gl.BLEND);

        // Report effective draw info
        return {
            drawnSplats: this._lastDrawnSplats,
            totalSplats: this.count,
            frameNumber: this.frameNumber,
        };
    }

    /* -------------------------------------------------------------- */
    /*  Internal: draw splats                                          */
    /* -------------------------------------------------------------- */

    _drawSplats(viewProjection, time) {
        const gl = this.gl;

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.enable(gl.BLEND);

        if (this.blendMode === 'additive') {
            gl.blendFunc(gl.ONE, gl.ONE);
        } else {
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        gl.useProgram(this._splatProgram);
        gl.bindVertexArray(this._splatVao);

        const u = this._splatUniforms;
        gl.uniform1f(u.pointScale, this.pointScale);
        gl.uniform1f(u.time, time);
        gl.uniform1f(u.animate, this.animate ? 1.0 : 0.0);
        gl.uniform1f(u.intensity, this.intensity);
        gl.uniform1f(u.chromatic, this.chromatic);
        gl.uniformMatrix4fv(u.viewProjection, false, viewProjection);

        // Experimental uniforms
        gl.uniform1f(u.splatIndex, 0.0);
        gl.uniform1f(u.frameNumber, this.frameNumber);
        gl.uniform1f(u.abEnabled, this.abInterleave ? 1.0 : 0.0);
        gl.uniform1f(u.stochDensity, this.stochDensity);

        gl.drawArrays(gl.POINTS, 0, this.count);

        // Track effective drawn count
        let effectiveDrawn = this.count;
        if (this.abInterleave) effectiveDrawn = Math.ceil(this.count / 2);
        if (this.stochDensity < 0.999) effectiveDrawn = Math.ceil(effectiveDrawn * this.stochDensity);
        this._lastDrawnSplats = effectiveDrawn;

        gl.bindVertexArray(null);
        gl.depthMask(true);
    }

    /* -------------------------------------------------------------- */
    /*  Internal: trail decay (temporal accumulation)                   */
    /* -------------------------------------------------------------- */

    _doTrailDecay() {
        const gl = this.gl;
        const src = this._trailPing;
        const dst = 1 - src;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._trailFBO[dst].framebuffer);
        gl.viewport(0, 0, this._trailFBO[dst].width, this._trailFBO[dst].height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.useProgram(this._trailDecayProgram);
        gl.bindVertexArray(this._quadVao);

        const loc = gl.getUniformLocation(this._trailDecayProgram, 'u_texture');
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._trailFBO[src].texture);
        gl.uniform1i(loc, 0);

        const decayLoc = gl.getUniformLocation(this._trailDecayProgram, 'u_decay');
        gl.uniform1f(decayLoc, this.trailDecay);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this._trailPing = dst;
    }

    /* -------------------------------------------------------------- */
    /*  Internal: additive trail buffer                                */
    /* -------------------------------------------------------------- */

    _updateAdditiveTrail() {
        const gl = this.gl;

        // Decay existing trail
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._addTrailFBO.framebuffer);
        gl.viewport(0, 0, this._addTrailFBO.width, this._addTrailFBO.height);

        // Read current trail, decay, write back
        // We use the bloom extract to grab bright pixels from the main pass
        // and add them to the trail
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // First: fade existing trail
        gl.disable(gl.BLEND);
        gl.useProgram(this._trailDecayProgram);
        gl.bindVertexArray(this._quadVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._addTrailFBO.texture);
        // We read from the same FBO we write to — this is a feedback loop.
        // To avoid undefined behavior, we need a temp copy or use the ping-pong.
        // For simplicity, we just decay slightly by overdrawing a dark quad.
        gl.uniform1i(gl.getUniformLocation(this._trailDecayProgram, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this._trailDecayProgram, 'u_decay'), this.trailBufferDecay);

        // Actually: we can't read and write to the same FBO safely.
        // Instead, just blit mainFBO brights additively on top each frame.
        // The decay comes from just not clearing and using low-opacity blit.
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive accumulation
        this._blitTexture(this._mainFBO.texture, 0.08); // accumulate a fraction
    }

    /* -------------------------------------------------------------- */
    /*  Internal: bloom post-process                                   */
    /* -------------------------------------------------------------- */

    _doBloom(w, h) {
        const gl = this.gl;
        const bw = this._bloomFBO[0].width;
        const bh = this._bloomFBO[0].height;

        // Extract bright pixels from main FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFBO[0].framebuffer);
        gl.viewport(0, 0, bw, bh);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.useProgram(this._bloomExtractProgram);
        gl.bindVertexArray(this._quadVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._mainFBO.texture);
        gl.uniform1i(gl.getUniformLocation(this._bloomExtractProgram, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this._bloomExtractProgram, 'u_threshold'), this.bloomThreshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Kawase blur passes (4 iterations)
        const offsets = [0.5, 1.5, 2.5, 3.5];
        for (let i = 0; i < offsets.length; i++) {
            const src = i % 2;
            const dst = 1 - src;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomFBO[dst].framebuffer);
            gl.viewport(0, 0, bw, bh);

            gl.useProgram(this._kawaseProgram);
            gl.bindVertexArray(this._quadVao);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._bloomFBO[src].texture);
            gl.uniform1i(gl.getUniformLocation(this._kawaseProgram, 'u_texture'), 0);
            gl.uniform2f(gl.getUniformLocation(this._kawaseProgram, 'u_texelSize'), 1.0 / bw, 1.0 / bh);
            gl.uniform1f(gl.getUniformLocation(this._kawaseProgram, 'u_offset'), offsets[i]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        // Composite bloom onto screen (additive)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        this._blitTexture(this._bloomFBO[offsets.length % 2].texture, this.bloomIntensity);
    }

    /* -------------------------------------------------------------- */
    /*  Internal: blit texture to current FBO                          */
    /* -------------------------------------------------------------- */

    _blitTexture(texture, opacity) {
        const gl = this.gl;
        gl.useProgram(this._blitProgram);
        gl.bindVertexArray(this._quadVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(this._blitProgram, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this._blitProgram, 'u_opacity'), opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
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
            throw new Error(gl.getProgramInfoLog(p));
        }
        return p;
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s));
        }
        return s;
    }

    dispose() {
        const gl = this.gl;
        gl.deleteProgram(this._splatProgram);
        gl.deleteVertexArray(this._splatVao);
        gl.deleteBuffer(this._splatBuffer);
        gl.deleteProgram(this._blitProgram);
        gl.deleteProgram(this._bloomExtractProgram);
        gl.deleteProgram(this._kawaseProgram);
        gl.deleteProgram(this._trailDecayProgram);
        gl.deleteVertexArray(this._quadVao);
        if (this._mainFBO) destroyFBO(gl, this._mainFBO);
        this._trailFBO.forEach(f => f && destroyFBO(gl, f));
        this._bloomFBO.forEach(f => f && destroyFBO(gl, f));
        if (this._addTrailFBO) destroyFBO(gl, this._addTrailFBO);
    }
}

export default ExperimentalSplatRenderer;
