/**
 * EdgeInscriptionLayer (v2 — Batched N-Layer Architecture)
 *
 * Holographic edge-inscription system that detects geometric edges and surface
 * boundaries from the MeshRenderer's GBuffer (depth + normals), then renders
 * VIB3+ procedural patterns along those edges using a single-pass multi-layer
 * compositor.
 *
 * v2 Enhancements:
 *   - **Batched rendering**: All inscription layers rendered in a SINGLE draw
 *     call (loop inside fragment shader) — eliminates N-1 FBO binds.
 *   - **Configurable N layers** (1-16): Each layer has independent geometry,
 *     color, thickness, opacity, and pattern scale.
 *   - **Per-layer 4D rotation offsets**: Global base rotation + per-layer
 *     angular offsets for parallax depth.
 *   - **Resolution-aware detail**: Pattern scale auto-adjusts to DPR.
 *   - **Audio-reactive inputs**: Bass/mid/high/energy map to inscription
 *     parameters (edge glow, pattern speed, 4D rotation).
 *   - **Per-object inscription routing**: Object ID from GBuffer selects
 *     different inscription configurations per mesh.
 *   - **Adaptive edge thickness**: Thickens at silhouettes, thins at creases.
 *
 * Architecture:
 *   1. Read MeshRenderer GBuffer (normal + depth + objectID textures)
 *   2. Compute edge strength via Sobel on depth + Laplacian on normals
 *   3. Single fullscreen pass: loop over N layers in fragment shader
 *      a. Mask edge region at this layer's thickness band
 *      b. Apply per-layer 4D rotation (base + offset)
 *      c. Evaluate VIB3 procedural pattern
 *      d. Accumulate with per-layer color/opacity (additive)
 *   4. Output composited inscription texture for HybridRenderPipeline
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
 * Outputs: R = combined edge, G = depth edge, B = normal edge, A = objectID edge.
 */
const EDGE_DETECT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_normalDepth;  // GBuffer: rgb = normal*0.5+0.5, a = depth/100
uniform sampler2D u_objectID;     // GBuffer attachment 2: object ID (or black if N/A)
uniform vec2      u_texelSize;
uniform float     u_depthSensitivity;
uniform float     u_normalSensitivity;
uniform float     u_hasObjectID;

out vec4 outEdge;

float sampleDepth(vec2 uv) {
    return texture(u_normalDepth, uv).a;
}

vec3 sampleNormal(vec2 uv) {
    return texture(u_normalDepth, uv).rgb * 2.0 - 1.0;
}

float sampleObjectID(vec2 uv) {
    return texture(u_objectID, uv).r;
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

    // Object ID edge (boundary between different objects)
    float objEdge = 0.0;
    if (u_hasObjectID > 0.5) {
        float centerID = sampleObjectID(v_uv);
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2( ts.x, 0.0)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(-ts.x, 0.0)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(0.0,  ts.y)));
        objEdge += abs(centerID - sampleObjectID(v_uv + vec2(0.0, -ts.y)));
        objEdge = step(0.001, objEdge);  // binary: is there an ID boundary?
    }

    // Combined edge strength (silhouettes boosted by object boundaries)
    float edge = clamp(depthEdge + normalEdge + objEdge * 0.5, 0.0, 1.0);

    outEdge = vec4(edge, depthEdge, normalEdge, objEdge);
}
`;

/**
 * Batched inscription shader — renders ALL N layers in a single pass.
 * Uses compile-time MAX_LAYERS and runtime u_layerCount.
 * Per-layer parameters passed as uniform arrays.
 */
const BATCHED_INSCRIPTION_FRAGMENT = `#version 300 es
precision highp float;

#define MAX_LAYERS 16

in vec2 v_uv;

uniform sampler2D u_edgeMap;      // from edge detection pass
uniform sampler2D u_normalDepth;  // GBuffer normals for pattern orientation
uniform float     u_time;
uniform int       u_layerCount;
uniform vec2      u_resolution;
uniform float     u_dpr;          // device pixel ratio for resolution scaling

// Per-layer arrays
uniform float u_layerGeometries[MAX_LAYERS];
uniform float u_layerThicknesses[MAX_LAYERS];
uniform float u_layerOpacities[MAX_LAYERS];
uniform vec3  u_layerColors[MAX_LAYERS];
uniform float u_layerPatternScales[MAX_LAYERS];
uniform float u_layerPatternSpeeds[MAX_LAYERS];

// Base 4D rotation + per-layer offsets
uniform float u_rot4dXY;
uniform float u_rot4dXZ;
uniform float u_rot4dYZ;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;
uniform float u_layerRotOffsets[MAX_LAYERS]; // angular offset per layer

// Audio-reactive inputs
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_energy;

// Global edge thickness multiplier
uniform float u_globalThickness;

out vec4 outColor;

// --- 4D rotation matrices ---
mat4 rotateXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotateXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 rotateYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotateXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotateYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotateZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

mat4 buildRotation4D(float offset) {
    // Audio modulates 4D rotation in hyperspace planes
    float audioXW = u_bass * 0.3;
    float audioYW = u_mid * 0.2;
    float audioZW = u_high * 0.4;

    return rotateXY(u_rot4dXY + offset * 0.1)
         * rotateXZ(u_rot4dXZ + offset * 0.15)
         * rotateYZ(u_rot4dYZ + offset * 0.05)
         * rotateXW(u_rot4dXW + audioXW + offset * 0.2)
         * rotateYW(u_rot4dYW + audioYW + offset * 0.12)
         * rotateZW(u_rot4dZW + audioZW + offset * 0.08);
}

// --- Procedural SDF patterns (24 VIB3 geometry variants) ---
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

float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float getPattern(vec3 p, float geom, float speed) {
    float t = u_time * speed;
    float energyPulse = 1.0 + u_energy * 0.3;

    // Base geometry (0-7)
    float base = mod(geom, 8.0);
    float pattern = 0.0;

    if (base < 0.5) {
        // Tetrahedron lattice
        pattern = abs(sdTetrahedron(p * 3.0 * energyPulse + vec3(sin(t), cos(t*0.7), 0.0)));
    } else if (base < 1.5) {
        // Hypercube grid
        vec3 q = fract(p * 4.0 + t * 0.1) - 0.5;
        pattern = sdBox(q, vec3(0.3));
    } else if (base < 2.5) {
        // Sphere harmonics
        float r = length(p);
        float theta = atan(p.y, p.x) + t * 0.3;
        float phi = acos(clamp(p.z / max(r, 0.001), -1.0, 1.0));
        pattern = abs(sin(theta * 3.0) * sin(phi * 4.0 + t) * cos(phi * 2.0 - t * 0.5));
    } else if (base < 3.5) {
        // Torus rings
        pattern = abs(sdTorus(p, 0.5, 0.15 + sin(t) * 0.05));
    } else if (base < 4.5) {
        // Klein bottle twist
        float a = atan(p.y, p.x) + t * 0.2;
        float r = length(p.xy);
        pattern = abs(sin(a * 3.0 + p.z * 5.0 + t) * cos(a * 2.0 - t * 0.3));
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
        // Crystal lattice (octahedral)
        vec3 q = abs(fract(p * 3.0 + t * 0.05) - 0.5);
        float crystal = min(min(q.x, q.y), q.z);
        float octD = sdOctahedron(fract(p * 2.0) - 0.5, 0.4);
        pattern = mix(crystal, abs(octD), 0.5);
    }

    // Core type warp (8-15: hypersphere, 16-23: hypertetrahedron)
    if (geom >= 8.0 && geom < 16.0) {
        // Hopf fibration-inspired radial modulation
        float r = length(p);
        float fibAngle = atan(p.y, p.x) * 2.0 + r * 6.2832;
        pattern *= smoothstep(0.0, 1.0, 1.0 - abs(r - 0.5)) * (0.8 + 0.2 * sin(fibAngle + t));
    } else if (geom >= 16.0) {
        // Pentatope proximity warp
        float d = sdTetrahedron(p * 1.5);
        float pentD = sdOctahedron(p * 1.2, 0.6);
        pattern *= smoothstep(0.2, 0.0, abs(min(d, pentD)));
    }

    return clamp(pattern, 0.0, 1.0);
}

void main() {
    vec4 edgeData = texture(u_edgeMap, v_uv);
    float edge = edgeData.r;

    // Early exit if no edge
    if (edge < 0.01) {
        outColor = vec4(0.0);
        return;
    }

    // Resolution-aware scaling
    float resScale = max(1.0, u_dpr);

    // Accumulate inscription from all layers
    vec3 totalColor = vec3(0.0);
    float totalAlpha = 0.0;

    for (int i = 0; i < MAX_LAYERS; i++) {
        if (i >= u_layerCount) break;

        float layerT = float(i) / max(1.0, float(u_layerCount) - 1.0);
        float thickness = u_layerThicknesses[i] * u_globalThickness;

        // Adaptive edge band: silhouettes get thicker (depth edge),
        // creases get thinner (normal edge)
        float silhouetteBoost = edgeData.g * 0.3; // depth edges wider
        float creaseNarrow = edgeData.b * 0.15;    // normal edges tighter
        float adaptiveThickness = thickness * (1.0 + silhouetteBoost - creaseNarrow);

        // Edge mask for this layer
        float innerThreshold = layerT * adaptiveThickness;
        float outerThreshold = (layerT + 1.0 / float(u_layerCount)) * adaptiveThickness;

        float mask = smoothstep(innerThreshold, innerThreshold + 0.02 / resScale, edge)
                   * (1.0 - smoothstep(outerThreshold, outerThreshold + 0.02 / resScale, edge));

        if (mask < 0.001) continue;

        // Generate procedural pattern in edge-aligned UV space
        vec2 aspect = vec2(1.0, u_resolution.y / u_resolution.x);
        float pScale = u_layerPatternScales[i] * resScale;
        vec3 patternPos = vec3(
            (v_uv * 2.0 - 1.0) * aspect * pScale,
            float(i) * 0.5
        );

        // Apply 4D rotation with per-layer offset
        mat4 rot = buildRotation4D(u_layerRotOffsets[i]);
        vec4 p4 = rot * vec4(patternPos, 0.0);
        vec3 projected = p4.xyz / (2.0 - p4.w);

        // Evaluate VIB3 procedural pattern
        float pattern = getPattern(projected, u_layerGeometries[i], u_layerPatternSpeeds[i]);

        // Layer color with iridescent hue shift
        float hueShift = layerT * 0.3 + u_time * 0.05 + u_energy * 0.1;
        vec3 iridescentColor = u_layerColors[i];
        iridescentColor.r *= 0.8 + 0.2 * sin(hueShift * 6.2832);
        iridescentColor.g *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 2.094);
        iridescentColor.b *= 0.8 + 0.2 * sin(hueShift * 6.2832 + 4.189);

        // Audio-reactive glow boost
        float audioGlow = u_bass * 0.3 + u_energy * 0.2;

        // Composite inscription
        float alpha = mask * pattern * u_layerOpacities[i];
        vec3 color = iridescentColor * (0.6 + pattern * 0.4);

        // Glow at edge peak (boosted by audio)
        float glowStrength = smoothstep(0.3, 0.8, edge) * pattern * (0.5 + audioGlow);
        color += vec3(glowStrength) * u_layerColors[i];

        // Additive accumulation
        totalColor += color * alpha;
        totalAlpha += alpha;
    }

    totalAlpha = clamp(totalAlpha, 0.0, 1.0);
    outColor = vec4(totalColor, totalAlpha);
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
/*  Layer Configuration                                                */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} InscriptionLayerConfig
 * @property {number}   geometry      VIB3 geometry index (0-23)
 * @property {number}   thickness     Edge thickness band (0-1)
 * @property {number}   opacity       Layer opacity (0-1)
 * @property {number[]} color         RGB color [r, g, b] each 0-1
 * @property {number}   patternScale  Procedural pattern scale
 * @property {number}   patternSpeed  Pattern animation speed
 * @property {number}   rotOffset     4D rotation angular offset (radians)
 */

/** Default holographic color palette */
const DEFAULT_PALETTES = [
    [0.2, 0.6, 1.0],   // cyan
    [0.8, 0.3, 1.0],   // violet
    [1.0, 0.5, 0.2],   // amber
    [0.3, 1.0, 0.6],   // mint
    [1.0, 0.2, 0.5],   // rose
    [0.4, 0.9, 0.9],   // teal
    [0.9, 0.8, 0.2],   // gold
    [0.5, 0.3, 1.0],   // indigo
    [0.2, 1.0, 0.4],   // emerald
    [1.0, 0.4, 0.0],   // flame
    [0.6, 0.2, 0.9],   // purple
    [0.0, 0.8, 0.8],   // aqua
    [1.0, 0.6, 0.6],   // salmon
    [0.3, 0.5, 1.0],   // cobalt
    [0.8, 1.0, 0.3],   // lime
    [0.9, 0.3, 0.6],   // magenta
];

function createDefaultLayerConfig(index, count) {
    const t = count > 1 ? index / (count - 1) : 0;
    return {
        geometry: (index * 3) % 24,   // spread across geometries
        thickness: 0.3 + t * 0.5,     // inner layers thin, outer thick
        opacity: 0.9 - t * 0.5,       // inner layers opaque, outer faint
        color: DEFAULT_PALETTES[index % DEFAULT_PALETTES.length],
        patternScale: 3.0 + index * 0.5,
        patternSpeed: 0.3 + index * 0.05,
        rotOffset: index * 0.4,        // angular separation
    };
}

/* ------------------------------------------------------------------ */
/*  EdgeInscriptionLayer v2                                            */
/* ------------------------------------------------------------------ */

export class EdgeInscriptionLayer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, {
        layerCount = 4,
        depthSensitivity = 8.0,
        normalSensitivity = 2.0,
        globalThickness = 0.6,
        layers = null,          // Array of InscriptionLayerConfig (auto-generated if null)
    } = {}) {
        this.gl = gl;
        this.layerCount = Math.min(16, Math.max(1, layerCount));
        this.depthSensitivity = depthSensitivity;
        this.normalSensitivity = normalSensitivity;
        this.globalThickness = globalThickness;

        // 4D rotation angles (radians) — base rotation for all layers
        this.rot4dXY = 0;
        this.rot4dXZ = 0;
        this.rot4dYZ = 0;
        this.rot4dXW = 0;
        this.rot4dYW = 0;
        this.rot4dZW = 0;

        // Audio-reactive inputs
        this.bass = 0;
        this.mid = 0;
        this.high = 0;
        this.energy = 0;

        // Per-layer configurations
        this.layers = layers || [];
        if (this.layers.length === 0) {
            for (let i = 0; i < this.layerCount; i++) {
                this.layers.push(createDefaultLayerConfig(i, this.layerCount));
            }
        }

        // Programs
        this._edgeProgram = null;
        this._inscriptionProgram = null;
        this._quadVao = null;

        // FBOs
        this._edgeFBO = null;
        this._compositeFBO = null;
        this._width = 0;
        this._height = 0;

        // 1x1 black texture for missing objectID
        this._blackTexture = null;

        // Uniform location caches
        this._edgeUniforms = {};
        this._inscUniforms = {};

        this._init();
    }

    _init() {
        const gl = this.gl;

        this._edgeProgram = this._createProgram(FULLSCREEN_VERT, EDGE_DETECT_FRAGMENT);
        this._inscriptionProgram = this._createProgram(FULLSCREEN_VERT, BATCHED_INSCRIPTION_FRAGMENT);
        this._quadVao = gl.createVertexArray();

        // Black texture for missing object ID
        this._blackTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._blackTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Cache uniform locations
        this._cacheEdgeUniforms();
        this._cacheInscriptionUniforms();
    }

    _cacheEdgeUniforms() {
        const gl = this.gl;
        const p = this._edgeProgram;
        this._edgeUniforms = {
            normalDepth: gl.getUniformLocation(p, 'u_normalDepth'),
            objectID: gl.getUniformLocation(p, 'u_objectID'),
            texelSize: gl.getUniformLocation(p, 'u_texelSize'),
            depthSensitivity: gl.getUniformLocation(p, 'u_depthSensitivity'),
            normalSensitivity: gl.getUniformLocation(p, 'u_normalSensitivity'),
            hasObjectID: gl.getUniformLocation(p, 'u_hasObjectID'),
        };
    }

    _cacheInscriptionUniforms() {
        const gl = this.gl;
        const p = this._inscriptionProgram;
        const u = (n) => gl.getUniformLocation(p, n);

        this._inscUniforms = {
            edgeMap: u('u_edgeMap'),
            normalDepth: u('u_normalDepth'),
            time: u('u_time'),
            layerCount: u('u_layerCount'),
            resolution: u('u_resolution'),
            dpr: u('u_dpr'),
            globalThickness: u('u_globalThickness'),

            // Base 4D rotation
            rot4dXY: u('u_rot4dXY'),
            rot4dXZ: u('u_rot4dXZ'),
            rot4dYZ: u('u_rot4dYZ'),
            rot4dXW: u('u_rot4dXW'),
            rot4dYW: u('u_rot4dYW'),
            rot4dZW: u('u_rot4dZW'),

            // Audio
            bass: u('u_bass'),
            mid: u('u_mid'),
            high: u('u_high'),
            energy: u('u_energy'),

            // Per-layer arrays
            geometries: [],
            thicknesses: [],
            opacities: [],
            colors: [],
            patternScales: [],
            patternSpeeds: [],
            rotOffsets: [],
        };

        for (let i = 0; i < 16; i++) {
            this._inscUniforms.geometries[i] = u(`u_layerGeometries[${i}]`);
            this._inscUniforms.thicknesses[i] = u(`u_layerThicknesses[${i}]`);
            this._inscUniforms.opacities[i] = u(`u_layerOpacities[${i}]`);
            this._inscUniforms.colors[i] = u(`u_layerColors[${i}]`);
            this._inscUniforms.patternScales[i] = u(`u_layerPatternScales[${i}]`);
            this._inscUniforms.patternSpeeds[i] = u(`u_layerPatternSpeeds[${i}]`);
            this._inscUniforms.rotOffsets[i] = u(`u_layerRotOffsets[${i}]`);
        }
    }

    _ensureFBOs(w, h) {
        if (this._width === w && this._height === h) return;

        const gl = this.gl;
        if (this._edgeFBO) destroyFBO(gl, this._edgeFBO);
        if (this._compositeFBO) destroyFBO(gl, this._compositeFBO);

        this._edgeFBO = createFBO(gl, w, h);
        this._compositeFBO = createFBO(gl, w, h);
        this._width = w;
        this._height = h;
    }

    /* -------------------------------------------------------------- */
    /*  Layer management                                               */
    /* -------------------------------------------------------------- */

    /** Set the number of inscription layers (1-16). Regenerates defaults for new layers. */
    setLayerCount(count) {
        count = Math.min(16, Math.max(1, count));
        while (this.layers.length < count) {
            this.layers.push(createDefaultLayerConfig(this.layers.length, count));
        }
        this.layerCount = count;
    }

    /** Configure a specific layer. */
    setLayerConfig(index, config) {
        if (index >= 0 && index < this.layers.length) {
            Object.assign(this.layers[index], config);
        }
    }

    /** Set audio-reactive inputs. */
    setAudio(bass, mid, high, energy) {
        this.bass = bass || 0;
        this.mid = mid || 0;
        this.high = high || 0;
        this.energy = energy || 0;
    }

    /* -------------------------------------------------------------- */
    /*  Main render (batched — single draw call for all layers)        */
    /* -------------------------------------------------------------- */

    /**
     * Render inscription layers from a MeshRenderer's GBuffer.
     *
     * @param {WebGLTexture} normalDepthTexture  GBuffer attachment 1
     * @param {number} time  Elapsed seconds
     * @param {object} [opts]
     * @param {number}       [opts.width]
     * @param {number}       [opts.height]
     * @param {WebGLTexture} [opts.objectIDTexture]  GBuffer attachment 2 (object ID)
     * @param {number}       [opts.dpr]  Device pixel ratio
     * @returns {{ texture: WebGLTexture, framebuffer: WebGLFramebuffer }}
     */
    render(normalDepthTexture, time, {
        width = 0, height = 0,
        objectIDTexture = null,
        dpr = 1.0,
    } = {}) {
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

        const eu = this._edgeUniforms;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, normalDepthTexture);
        gl.uniform1i(eu.normalDepth, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, objectIDTexture || this._blackTexture);
        gl.uniform1i(eu.objectID, 1);

        gl.uniform2f(eu.texelSize, 1/w, 1/h);
        gl.uniform1f(eu.depthSensitivity, this.depthSensitivity);
        gl.uniform1f(eu.normalSensitivity, this.normalSensitivity);
        gl.uniform1f(eu.hasObjectID, objectIDTexture ? 1.0 : 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // --- Pass 2: Batched inscription (single draw for ALL layers) ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._compositeFBO.framebuffer);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.BLEND);

        gl.useProgram(this._inscriptionProgram);
        gl.bindVertexArray(this._quadVao);

        const iu = this._inscUniforms;

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._edgeFBO.texture);
        gl.uniform1i(iu.edgeMap, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalDepthTexture);
        gl.uniform1i(iu.normalDepth, 1);

        // Global uniforms
        gl.uniform1f(iu.time, time);
        gl.uniform1i(iu.layerCount, this.layerCount);
        gl.uniform2f(iu.resolution, w, h);
        gl.uniform1f(iu.dpr, dpr);
        gl.uniform1f(iu.globalThickness, this.globalThickness);

        // Base 4D rotation
        gl.uniform1f(iu.rot4dXY, this.rot4dXY);
        gl.uniform1f(iu.rot4dXZ, this.rot4dXZ);
        gl.uniform1f(iu.rot4dYZ, this.rot4dYZ);
        gl.uniform1f(iu.rot4dXW, this.rot4dXW);
        gl.uniform1f(iu.rot4dYW, this.rot4dYW);
        gl.uniform1f(iu.rot4dZW, this.rot4dZW);

        // Audio
        gl.uniform1f(iu.bass, this.bass);
        gl.uniform1f(iu.mid, this.mid);
        gl.uniform1f(iu.high, this.high);
        gl.uniform1f(iu.energy, this.energy);

        // Per-layer uniforms
        for (let i = 0; i < this.layerCount; i++) {
            const layer = this.layers[i];
            gl.uniform1f(iu.geometries[i], layer.geometry);
            gl.uniform1f(iu.thicknesses[i], layer.thickness);
            gl.uniform1f(iu.opacities[i], layer.opacity);
            gl.uniform3fv(iu.colors[i], layer.color);
            gl.uniform1f(iu.patternScales[i], layer.patternScale);
            gl.uniform1f(iu.patternSpeeds[i], layer.patternSpeed);
            gl.uniform1f(iu.rotOffsets[i], layer.rotOffset);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);

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
        gl.deleteVertexArray(this._quadVao);
        gl.deleteTexture(this._blackTexture);
        if (this._edgeFBO) destroyFBO(gl, this._edgeFBO);
        if (this._compositeFBO) destroyFBO(gl, this._compositeFBO);
    }
}

export default EdgeInscriptionLayer;
