/**
 * SplatPostProcess
 *
 * Cinematic post-processing pipeline for Gaussian splat renderers.
 * Captures splat output to an offscreen FBO, then composites to screen with:
 *
 *  1. Pseudo-bloom (multi-sample bright-area glow)
 *  2. Sobel edge detection → silhouette edges with VIB3 inscription
 *  3. Chromatic aberration (RGB channel separation at screen edges)
 *  4. Vignette (radial darkening)
 *  5. Film grain (animated noise overlay)
 *  6. HDR tonemap (Reinhard + gamma)
 *
 * Usage:
 *   const pp = new SplatPostProcess(gl, { edgeColor: [0.3, 0.7, 1.0] });
 *   pp.beginCapture();          // bind offscreen FBO
 *   renderer.render(...);       // splats go to FBO
 *   pp.endCaptureAndComposite(time);  // full pipeline to screen
 */

/* ------------------------------------------------------------------ */
/*  Fullscreen triangle vertex shader (attribute-less)                 */
/* ------------------------------------------------------------------ */

const FS_VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}`;

/* ------------------------------------------------------------------ */
/*  Composite fragment — full cinematic pipeline                       */
/* ------------------------------------------------------------------ */

const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_splatColor;
uniform vec2  u_texelSize;
uniform vec2  u_resolution;
uniform float u_time;

// Bloom
uniform float u_enableBloom;
uniform float u_bloomThreshold;
uniform float u_bloomIntensity;
uniform float u_bloomRadius;

// Edge detection
uniform float u_enableEdges;
uniform float u_edgeSensitivity;
uniform vec3  u_edgeColor;
uniform float u_edgeIntensity;

// Inscription pattern on edges
uniform float u_enableInscription;
uniform float u_inscGeometry;
uniform float u_inscScale;
uniform float u_inscSpeed;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;

// Chromatic aberration
uniform float u_enableChroma;
uniform float u_chromaIntensity;

// Vignette
uniform float u_enableVignette;
uniform float u_vignetteIntensity;
uniform float u_vignetteSoftness;

// Film grain
uniform float u_enableGrain;
uniform float u_grainIntensity;

// Tonemap
uniform float u_enableTonemap;
uniform float u_exposure;
uniform float u_gamma;

out vec4 outColor;

/* ---- Helpers ---------------------------------------------------- */
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float lumAt(vec2 uv) { return lum(texture(u_splatColor, uv).rgb); }

// Hash for film grain
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/* ---- 4D rotation matrices --------------------------------------- */
mat4 rXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

/* ---- VIB3 procedural patterns ----------------------------------- */
float sdTorus(vec3 p, float R, float r) {
    vec2 q = vec2(length(p.xz) - R, p.y);
    return length(q) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float getPattern(vec3 p, float g) {
    float t = u_time * u_inscSpeed;
    float b = mod(g, 8.0);
    float pat = 0.0;

    if (b < 0.5) {
        pat = abs(max(abs(p.x+p.y)-p.z, abs(p.x-p.y)+p.z)*0.5 - 0.2);
    } else if (b < 1.5) {
        vec3 q = fract(p*4.0+t*0.1)-0.5;
        pat = sdBox(q, vec3(0.3));
    } else if (b < 2.5) {
        float r = length(p), th = atan(p.y,p.x)+t*0.3;
        float ph = acos(clamp(p.z/max(r,0.001),-1.0,1.0));
        pat = abs(sin(th*3.0)*sin(ph*4.0+t));
    } else if (b < 3.5) {
        pat = abs(sdTorus(p, 0.5, 0.15+sin(t)*0.05));
    } else if (b < 4.5) {
        float a = atan(p.y,p.x)+t*0.2;
        pat = abs(sin(a*3.0+p.z*5.0+t));
    } else if (b < 5.5) {
        vec3 q = p*2.0; float s = 1.0;
        for(int i=0;i<4;i++){q=abs(q)-1.0;q*=2.0;s*=2.0;q-=1.0;}
        pat = length(q)/s;
    } else if (b < 6.5) {
        pat = abs(sin(p.x*8.0+t)*sin(p.y*8.0+t*0.7)*sin(p.z*8.0+t*1.3));
    } else {
        vec3 q = abs(fract(p*3.0+t*0.05)-0.5);
        pat = min(min(q.x,q.y),q.z);
    }

    if (g >= 8.0 && g < 16.0) {
        pat *= smoothstep(0.0, 1.0, 1.0 - abs(length(p)-0.5));
    } else if (g >= 16.0) {
        pat *= smoothstep(0.2, 0.0, abs(max(abs(p.x+p.y)-p.z, abs(p.x-p.y)+p.z)*0.5));
    }

    return clamp(pat, 0.0, 1.0);
}

/* ---- Bloom (single-pass multi-sample approximation) ------------- */
vec3 sampleBloom() {
    vec3 bloom = vec3(0.0);
    float total = 0.0;

    // 13-tap cross pattern at increasing radii
    for (int i = 1; i <= 8; i++) {
        float r = float(i) * u_bloomRadius;
        float w = 1.0 / float(i); // falloff
        vec2 ox = vec2(r * u_texelSize.x, 0.0);
        vec2 oy = vec2(0.0, r * u_texelSize.y);
        // Diagonal samples for richer coverage
        vec2 od = vec2(r * u_texelSize.x * 0.707, r * u_texelSize.y * 0.707);

        vec3 s = texture(u_splatColor, v_uv + ox).rgb
               + texture(u_splatColor, v_uv - ox).rgb
               + texture(u_splatColor, v_uv + oy).rgb
               + texture(u_splatColor, v_uv - oy).rgb
               + texture(u_splatColor, v_uv + od).rgb
               + texture(u_splatColor, v_uv - od).rgb
               + texture(u_splatColor, v_uv + vec2(od.x, -od.y)).rgb
               + texture(u_splatColor, v_uv + vec2(-od.x, od.y)).rgb;
        s *= 0.125;

        // Threshold: only bright areas contribute
        vec3 bright = max(s - vec3(u_bloomThreshold), vec3(0.0));
        bloom += bright * w;
        total += w;
    }

    return bloom / max(total, 1.0) * u_bloomIntensity;
}

void main() {
    vec3 color = texture(u_splatColor, v_uv).rgb;

    // ---- 1. Bloom ------------------------------------------------
    if (u_enableBloom > 0.5) {
        color += sampleBloom();
    }

    // ---- 2. Edge detection + inscription -------------------------
    if (u_enableEdges > 0.5) {
        vec2 ts = u_texelSize;

        float d00 = lumAt(v_uv + vec2(-ts.x,-ts.y));
        float d10 = lumAt(v_uv + vec2(  0.0,-ts.y));
        float d20 = lumAt(v_uv + vec2( ts.x,-ts.y));
        float d01 = lumAt(v_uv + vec2(-ts.x,  0.0));
        float d21 = lumAt(v_uv + vec2( ts.x,  0.0));
        float d02 = lumAt(v_uv + vec2(-ts.x, ts.y));
        float d12 = lumAt(v_uv + vec2(  0.0, ts.y));
        float d22 = lumAt(v_uv + vec2( ts.x, ts.y));

        float sx = -d00+d20 - 2.0*d01+2.0*d21 - d02+d22;
        float sy = -d00-2.0*d10-d20 + d02+2.0*d12+d22;
        float edge = sqrt(sx*sx + sy*sy) * u_edgeSensitivity;
        edge = smoothstep(0.05, 0.6, edge);

        if (u_enableInscription > 0.5 && edge > 0.01) {
            vec2 asp = vec2(1.0, u_resolution.y / u_resolution.x);
            vec3 pp = vec3((v_uv*2.0-1.0) * asp * u_inscScale, 0.0);
            vec4 p4 = rXW(u_rot4dXW)*rYW(u_rot4dYW)*rZW(u_rot4dZW)*vec4(pp,0.0);
            vec3 proj = p4.xyz / (2.0 - p4.w);

            float pat = getPattern(proj, u_inscGeometry);
            pat = 0.6 + 0.4 * pat;

            float hs = u_time * 0.08;
            vec3 eCol = u_edgeColor;
            eCol.r *= 0.8+0.2*sin(hs*6.2832);
            eCol.g *= 0.8+0.2*sin(hs*6.2832+2.094);
            eCol.b *= 0.8+0.2*sin(hs*6.2832+4.189);

            color += eCol * edge * pat * u_edgeIntensity;
        } else {
            color += u_edgeColor * edge * u_edgeIntensity;
        }
    }

    // ---- 3. Chromatic aberration ---------------------------------
    if (u_enableChroma > 0.5) {
        vec2 center = v_uv - 0.5;
        float dist = length(center);
        float strength = dist * dist * u_chromaIntensity;
        vec2 dir = normalize(center + 0.0001) * strength;

        color.r = texture(u_splatColor, v_uv + dir).r;
        // green stays at center (sharpest channel)
        color.b = texture(u_splatColor, v_uv - dir).b;
    }

    // ---- 4. Vignette ---------------------------------------------
    if (u_enableVignette > 0.5) {
        vec2 vc = v_uv * (1.0 - v_uv);
        float vf = vc.x * vc.y * 16.0;
        vf = pow(vf, u_vignetteSoftness);
        color *= mix(1.0 - u_vignetteIntensity, 1.0, vf);
    }

    // ---- 5. Film grain -------------------------------------------
    if (u_enableGrain > 0.5) {
        float noise = hash(v_uv * u_resolution + fract(u_time * 43.758));
        noise = (noise - 0.5) * u_grainIntensity;
        // Apply more grain to darker areas (filmic)
        float l = lum(color);
        color += noise * (1.0 - l * 0.7);
    }

    // ---- 6. Tonemap: exposure, Reinhard, gamma -------------------
    if (u_enableTonemap > 0.5) {
        color *= u_exposure;
        color = color / (color + vec3(1.0));
        color = pow(max(color, vec3(0.0)), vec3(1.0 / u_gamma));
    }

    outColor = vec4(color, 1.0);
}`;

/* ------------------------------------------------------------------ */
/*  SplatPostProcess class                                             */
/* ------------------------------------------------------------------ */

export class SplatPostProcess {
    constructor(gl, options = {}) {
        this.gl = gl;

        // Bloom
        this.enableBloom = options.enableBloom ?? true;
        this.bloomThreshold = options.bloomThreshold ?? 0.35;
        this.bloomIntensity = options.bloomIntensity ?? 0.8;
        this.bloomRadius = options.bloomRadius ?? 3.0;

        // Edge detection
        this.enableEdges = options.enableEdges ?? true;
        this.edgeColor = options.edgeColor ?? [0.3, 0.7, 1.0];
        this.edgeIntensity = options.edgeIntensity ?? 1.5;
        this.edgeSensitivity = options.edgeSensitivity ?? 6.0;

        // Inscription
        this.enableInscription = options.enableInscription ?? true;
        this.inscGeometry = options.inscGeometry ?? 3;
        this.inscScale = options.inscScale ?? 3.0;
        this.inscSpeed = options.inscSpeed ?? 0.3;
        this.rot4dXW = 0;
        this.rot4dYW = 0;
        this.rot4dZW = 0;

        // Chromatic aberration
        this.enableChroma = options.enableChroma ?? false;
        this.chromaIntensity = options.chromaIntensity ?? 0.005;

        // Vignette
        this.enableVignette = options.enableVignette ?? false;
        this.vignetteIntensity = options.vignetteIntensity ?? 0.5;
        this.vignetteSoftness = options.vignetteSoftness ?? 0.3;

        // Film grain
        this.enableGrain = options.enableGrain ?? false;
        this.grainIntensity = options.grainIntensity ?? 0.06;

        // Tonemap
        this.enableTonemap = options.enableTonemap ?? true;
        this.exposure = options.exposure ?? 1.2;
        this.gamma = options.gamma ?? 2.2;

        this._fbo = null;
        this._fboWidth = 0;
        this._fboHeight = 0;
        this._program = null;
        this._vao = null;
        this._uniforms = {};
        this._init();
    }

    _init() {
        const gl = this.gl;
        this._vao = gl.createVertexArray();
        this._program = this._createProgram(FS_VERT, COMPOSITE_FRAG);

        const u = n => gl.getUniformLocation(this._program, n);
        this._uniforms = {
            splatColor:        u('u_splatColor'),
            texelSize:         u('u_texelSize'),
            resolution:        u('u_resolution'),
            time:              u('u_time'),
            enableBloom:       u('u_enableBloom'),
            bloomThreshold:    u('u_bloomThreshold'),
            bloomIntensity:    u('u_bloomIntensity'),
            bloomRadius:       u('u_bloomRadius'),
            enableEdges:       u('u_enableEdges'),
            edgeSensitivity:   u('u_edgeSensitivity'),
            edgeColor:         u('u_edgeColor'),
            edgeIntensity:     u('u_edgeIntensity'),
            enableInscription: u('u_enableInscription'),
            inscGeometry:      u('u_inscGeometry'),
            inscScale:         u('u_inscScale'),
            inscSpeed:         u('u_inscSpeed'),
            rot4dXW:           u('u_rot4dXW'),
            rot4dYW:           u('u_rot4dYW'),
            rot4dZW:           u('u_rot4dZW'),
            enableChroma:      u('u_enableChroma'),
            chromaIntensity:   u('u_chromaIntensity'),
            enableVignette:    u('u_enableVignette'),
            vignetteIntensity: u('u_vignetteIntensity'),
            vignetteSoftness:  u('u_vignetteSoftness'),
            enableGrain:       u('u_enableGrain'),
            grainIntensity:    u('u_grainIntensity'),
            enableTonemap:     u('u_enableTonemap'),
            exposure:          u('u_exposure'),
            gamma:             u('u_gamma'),
        };
    }

    _ensureFBO(w, h) {
        if (this._fbo && this._fboWidth === w && this._fboHeight === h) return;
        const gl = this.gl;
        if (this._fbo) this._destroyFBO();

        // Use RGBA16F for HDR bloom to work properly
        const colorTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const depthRb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);

        // Fallback to RGBA8 if float textures not supported as render targets
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.bindTexture(gl.TEXTURE_2D, colorTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this._fbo = { framebuffer: fb, colorTexture: colorTex, depthRenderbuffer: depthRb };
        this._fboWidth = w;
        this._fboHeight = h;
    }

    _destroyFBO() {
        if (!this._fbo) return;
        const gl = this.gl;
        gl.deleteFramebuffer(this._fbo.framebuffer);
        gl.deleteTexture(this._fbo.colorTexture);
        gl.deleteRenderbuffer(this._fbo.depthRenderbuffer);
        this._fbo = null;
    }

    get colorTexture() { return this._fbo ? this._fbo.colorTexture : null; }

    beginCapture() {
        const gl = this.gl;
        const w = gl.canvas.width, h = gl.canvas.height;
        this._ensureFBO(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.framebuffer);
    }

    endCaptureAndComposite(time = 0) {
        const gl = this.gl;
        const w = this._fboWidth, h = this._fboHeight;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);

        gl.useProgram(this._program);
        gl.bindVertexArray(this._vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._fbo.colorTexture);
        gl.uniform1i(this._uniforms.splatColor, 0);

        gl.uniform2f(this._uniforms.texelSize, 1.0 / w, 1.0 / h);
        gl.uniform2f(this._uniforms.resolution, w, h);
        gl.uniform1f(this._uniforms.time, time);

        // Bloom
        gl.uniform1f(this._uniforms.enableBloom, this.enableBloom ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.bloomThreshold, this.bloomThreshold);
        gl.uniform1f(this._uniforms.bloomIntensity, this.bloomIntensity);
        gl.uniform1f(this._uniforms.bloomRadius, this.bloomRadius);

        // Edges
        gl.uniform1f(this._uniforms.enableEdges, this.enableEdges ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.edgeSensitivity, this.edgeSensitivity);
        gl.uniform3fv(this._uniforms.edgeColor, this.edgeColor);
        gl.uniform1f(this._uniforms.edgeIntensity, this.edgeIntensity);

        // Inscription
        gl.uniform1f(this._uniforms.enableInscription, this.enableInscription ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.inscGeometry, this.inscGeometry);
        gl.uniform1f(this._uniforms.inscScale, this.inscScale);
        gl.uniform1f(this._uniforms.inscSpeed, this.inscSpeed);
        gl.uniform1f(this._uniforms.rot4dXW, this.rot4dXW);
        gl.uniform1f(this._uniforms.rot4dYW, this.rot4dYW);
        gl.uniform1f(this._uniforms.rot4dZW, this.rot4dZW);

        // Chromatic aberration
        gl.uniform1f(this._uniforms.enableChroma, this.enableChroma ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.chromaIntensity, this.chromaIntensity);

        // Vignette
        gl.uniform1f(this._uniforms.enableVignette, this.enableVignette ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.vignetteIntensity, this.vignetteIntensity);
        gl.uniform1f(this._uniforms.vignetteSoftness, this.vignetteSoftness);

        // Film grain
        gl.uniform1f(this._uniforms.enableGrain, this.enableGrain ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.grainIntensity, this.grainIntensity);

        // Tonemap
        gl.uniform1f(this._uniforms.enableTonemap, this.enableTonemap ? 1.0 : 0.0);
        gl.uniform1f(this._uniforms.exposure, this.exposure);
        gl.uniform1f(this._uniforms.gamma, this.gamma);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _createProgram(vsrc, fsrc) {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsrc); gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
            throw new Error('SplatPostProcess VS: ' + gl.getShaderInfoLog(vs));

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsrc); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
            throw new Error('SplatPostProcess FS: ' + gl.getShaderInfoLog(fs));

        const p = gl.createProgram();
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error('SplatPostProcess link: ' + gl.getProgramInfoLog(p));
        return p;
    }

    dispose() {
        const gl = this.gl;
        this._destroyFBO();
        if (this._program) gl.deleteProgram(this._program);
        if (this._vao) gl.deleteVertexArray(this._vao);
    }
}
