# VIB3+ Hybrid Render Pipeline — Technical Documentation

**Version 2.0** | Multi-Object Scene Compositing with Semantic Inscription

---

## Architecture Overview

The Hybrid Render Pipeline unifies four rendering paradigms into a single composited output:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     HYBRID RENDER PIPELINE v2                        │
│                                                                      │
│  Layer 0: MESH         Traditional triangles → 3-MRT GBuffer        │
│                        MeshRenderer / SceneRenderer                  │
│                                                                      │
│  Layer 1: SPLAT        Gaussian splats (depth-tested against mesh)   │
│                        GaussianSplatRenderer / PBRSplatConverter     │
│                                                                      │
│  Layer 2: PROCEDURAL   VIB3 fullscreen shader (24 geometry variants) │
│                        Quantum / Faceted / Holographic systems       │
│                                                                      │
│  Layer 3: INSCRIPTION  Holographic edge overlay from GBuffer         │
│                        EdgeInscriptionLayer / WebGPUInscription      │
│                        InscriptionChannel (semantic state routing)   │
│                                                                      │
│  ─── COMPOSITOR ───                                                  │
│  Mathematical blending with per-layer opacity, blend mode,           │
│  depth interaction, and post-process (bloom, tone mapping, gamma)    │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Scene Objects ─┐
               ├──► SceneRenderer ──► Shared GBuffer (3 MRT)
               │                          │
               │    ┌─────────────────────┤
               │    │ Color (RGBA8)       │ Normal/Depth (RGBA16F)   │ ObjectID (RGBA8)
               │    └──────┬──────────────┴────────────┬─────────────┘
               │           │                           │
               │           ▼                           ▼
               │    Compositor Layer 0          EdgeInscriptionLayer
               │                                       │
               │                          InscriptionChannel
               │                          (semantic state + audio)
               │                                       │
               │                                       ▼
               │                              Compositor Layer 3
               │
PBR Textures ──► PBRSplatConverter ──► Splats ──► Compositor Layer 1
               │
VIB3 Systems ──► Procedural Callback ──────────► Compositor Layer 2
```

---

## Module Reference

### 1. MeshRenderer (`src/render/MeshRenderer.js`)

GPU-accelerated mesh renderer with 3-MRT GBuffer output, morph targets, and 4D rotation support.

#### GBuffer Layout (3 Render Targets)

| Attachment | Format | Contents |
|------------|--------|----------|
| 0 — Color | RGBA8 | Blinn-Phong shaded color with diffuse texture |
| 1 — Normal/Depth | RGBA16F | World-space normal (RGB) + linear depth (A) |
| 2 — Object ID | RGBA8 | Per-object identifier (R channel, 0-255) |

#### Morph Targets

```javascript
const mesh = new MeshRenderer(gl);
mesh.uploadGeometry({ positions, normals, indices });

// Upload a morph target (e.g., deformed version)
mesh.uploadMorphTarget(deformedPositions, deformedNormals);

// Blend between base (0.0) and morph (1.0) on GPU
mesh.morphWeight = 0.5;
```

The vertex shader performs GPU-side blending:
```glsl
vec3 pos = mix(a_position, a_morphPosition, u_morphWeight);
vec3 nrm = normalize(mix(a_normal, a_morphNormal, u_morphWeight));
```

#### Multi-Object Rendering

```javascript
mesh.objectID = 42;  // Unique integer per object (0-255)
mesh.render(modelView, projection, {
    clearBuffer: false,  // Don't clear — append to existing GBuffer
});
```

The `clearBuffer: false` option allows multiple meshes to render into the same GBuffer. Object IDs are written to MRT attachment 2 for cross-object edge detection.

---

### 2. SceneRenderer (`src/render/SceneRenderer.js`)

Multi-object scene management with shared GBuffer, frustum culling, and draw-order sorting.

#### Usage

```javascript
const scene = new SceneRenderer(gl, {
    lightDir: [0.4, 0.8, 0.3],
    lightColor: [1.0, 0.98, 0.95],
});

// Add objects — each gets a unique integer ID (1-255)
const hero = scene.addObject('hero', { positions, normals, indices });
const terrain = scene.addObject('terrain', terrainGeometry);

// Per-object transforms
hero.setTransform(heroModelMatrix);
terrain.setTransform(terrainModelMatrix);

// Per-object inscription config
hero.setInscriptionConfig({ layers: [...], glowIntensity: 0.8 });

// Render all objects into shared GBuffer
const result = scene.render(viewMatrix, projMatrix, {
    rotation4D: rot4DMatrix,   // Optional 4D rotation
    projDistance: 2.0,
});
// result.gbuffer has colorTexture, normalTexture, objectIDTexture
```

#### Draw Ordering

- **Opaque objects**: Sorted front-to-back (minimizes overdraw)
- **Transparent objects**: Sorted back-to-front (correct alpha compositing)
- Sorting uses AABB center depth projected into view space

---

### 3. EdgeInscriptionLayer (`src/render/EdgeInscriptionLayer.js`)

Holographic edge inscription system that renders N layers of procedural 4D patterns onto detected mesh edges in a **single GPU draw call**.

#### Architecture

```
GBuffer (Normal/Depth + ObjectID)
         │
         ▼
   Edge Detection Pass
   (Sobel depth + normal discontinuity + object ID boundaries)
         │
         ▼
   Inscription Pass (single draw, all layers in fragment shader)
   ┌─────────────────────────────────────────┐
   │  for each layer (1..N):                 │
   │    1. Compute edge mask (thickness band) │
   │    2. Apply 4D rotation to pattern UV    │
   │    3. Evaluate procedural pattern (24)   │
   │    4. Iridescent color + glow            │
   │    5. Accumulate with alpha              │
   └─────────────────────────────────────────┘
         │
         ▼
   Output Texture → Compositor Layer 3
```

#### Configuration

```javascript
const inscription = new EdgeInscriptionLayer(gl, {
    layerCount: 4,        // 1-16 simultaneous layers
    depthSensitivity: 8.0,
    normalSensitivity: 2.0,
});

// Per-layer configuration
inscription.setLayerConfig(0, {
    geometry: 3,           // 0-23 (VIB3 geometry variant)
    thickness: 0.6,
    opacity: 0.8,
    color: [0.5, 0.7, 1.0],
    patternScale: 3.0,
    patternSpeed: 0.3,
    rotOffset: 0.0,
});

// Audio reactivity
inscription.setAudio(bass, mid, high, energy);

// 4D rotation
inscription.rot4dXW = 0.5;
inscription.rot4dYW = 0.3;
inscription.rot4dZW = 0.2;

// Render
const result = inscription.render(normalDepthTexture, time, {
    width, height,
    objectIDTexture,      // Optional: enables cross-object edge detection
    dpr: devicePixelRatio, // Resolution-independent inscription detail
});
```

#### 24 Procedural Patterns

| Index | Name | Description |
|-------|------|-------------|
| 0 | Tetrahedron | Radial simplex lattice |
| 1 | Hypercube | Tesseract projection grid |
| 2 | Sphere | Polar harmonic circles |
| 3 | Torus | Toroidal distance field |
| 4 | Klein Bottle | Non-orientable surface warp |
| 5 | Fractal | Recursive subdivision (Menger) |
| 6 | Wave | Sinusoidal interference |
| 7 | Crystal | Octahedral lattice |
| 8-15 | Hypersphere variants | Patterns 0-7 with spherical warp |
| 16-23 | Hypertetra variants | Patterns 0-7 with tetrahedral warp |

#### Adaptive Edge Detection

Three edge sources are combined:
1. **Depth Sobel** — silhouette edges (high sensitivity for sharp depth changes)
2. **Normal discontinuity** — crease edges (where surface normals diverge)
3. **Object ID boundaries** — cross-object edges (when objectIDTexture provided)

Edge thickness adapts: silhouettes are wider, creases are tighter.

---

### 4. InscriptionChannel (`src/render/InscriptionChannel.js`)

Maps semantic object state, per-object identity, and audio input into EdgeInscriptionLayer configurations.

#### Semantic States

| State | Priority | Visual Effect |
|-------|----------|---------------|
| `idle` | 0 | Low opacity, thin edges, minimal glow |
| `active` | 1 | Medium opacity, normal thickness, slight blue |
| `selected` | 2 | Full opacity, thick edges, cyan highlight, crystal lattice pattern |
| `powered` | 2 | Full opacity, thick pulsing edges, purple glow, wave interference |
| `damaged` | 3 | High opacity, thin jittery edges, red warning, fractal dissolution |
| `destroyed` | 4 | Fading edges, thick erratic patterns, fractal |

#### Per-Object Identity

Each object gets a deterministic, visually distinct inscription based on its integer ID:
- **Pattern selection**: Hash(objectID) selects from 24 geometries per layer
- **Color palette**: Hash distributes across the full hue spectrum
- **Animation offset**: Each object's inscription animates at a unique phase

```javascript
const channel = new InscriptionChannel({ layerCount: 4 });

// Register objects
channel.registerObject(1, 'idle');
channel.registerObject(2, 'active');

// Change state (smooth transition)
channel.setObjectState(1, 'powered');

// Audio input
channel.setAudio(bass, mid, high, energy);

// Update transitions
channel.update(deltaTime);

// Apply to EdgeInscriptionLayer
channel.applyToLayer(inscriptionLayer, objectID);
```

#### Audio Mapping

| Audio Band | Inscription Effect |
|-----------|-------------------|
| **Bass** | XW rotation + edge thickness + glow intensity |
| **Mid** | YW rotation + pattern speed + opacity |
| **High** | ZW rotation + pattern scale + hue shift |
| **Energy** | All rotation planes + overall intensity + glow |

---

### 5. PBRSplatConverter (`src/render/PBRSplatConverter.js`)

Decomposes PBR material maps (albedo, normal, roughness, metallic, AO, emissive) into Gaussian splat distributions on a mesh surface.

#### PBR → Splat Mapping

| PBR Property | Splat Property | Mapping |
|-------------|---------------|---------|
| Albedo (RGB) | Splat color | Direct color transfer |
| Roughness | Splat scale | High roughness → larger, diffuse splats |
| Metallic | Blend mode | 0.0 = additive, 1.0 = alpha (reflective) |
| AO | Density | Low AO → fewer splats (shadows) |
| Emissive | Color override | Emissive regions glow (color boosted) |
| Normal Map | Orientation | Normal → quaternion for splat alignment |

#### Usage

```javascript
const converter = new PBRSplatConverter({
    splatsPerTriangle: 8,
    baseScale: 0.02,
    edgeBoost: true,
});

const splats = converter.convert({
    positions, normals, uvs, indices,
    albedoPixels, albedoWidth, albedoHeight,
    normalPixels, normalWidth, normalHeight,
    roughnessPixels, roughnessWidth, roughnessHeight,
    metallicPixels, metallicWidth, metallicHeight,
    aoPixels, aoWidth, aoHeight,
    emissivePixels, emissiveWidth, emissiveHeight,
});
// splats: Array<{ position, orientation, scale, color, depth }>
```

#### Sampling Strategy

1. **Area-weighted triangle selection** — Larger triangles get proportionally more splats
2. **Barycentric interpolation** — Smooth UV/position/normal sampling within triangles
3. **Sobel edge detection on albedo** — 30% extra splats concentrated at texture edges
4. **Normal map → quaternion** — Splat orientation matches surface micro-detail

---

### 6. WebGPUInscription (`src/render/WebGPUInscription.js`)

WebGPU compute shader implementation of the inscription pipeline. Performance advantage over WebGL path through shared memory tiling and single-dispatch batched layers.

#### Architecture

```
Pass 1: Edge Detection Compute (16x16 workgroups)
  ┌─────────────────────────────┐
  │ Shared memory tile: 18x18   │  (16x16 + 1-pixel halo)
  │   Load normal/depth         │
  │   Barrier sync              │
  │   Sobel kernel              │
  │   Normal discontinuity      │
  │   Output: edge map texture  │
  └─────────────────────────────┘

Pass 2: Inscription Compute (16x16 workgroups)
  ┌─────────────────────────────┐
  │ Read edge map               │
  │ Early-out if edge < 0.01    │
  │ For each layer (1..N):      │
  │   6-plane 4D rotation       │
  │   Perspective projection    │
  │   Procedural pattern eval   │
  │   Iridescent color          │
  │   Alpha accumulation        │
  │ Output: inscription texture │
  └─────────────────────────────┘
```

#### Fallback

```javascript
import { createWebGPUInscription } from './WebGPUInscription.js';
import { EdgeInscriptionLayer } from './EdgeInscriptionLayer.js';

// Try WebGPU first, fall back to WebGL
const inscription = await createWebGPUInscription({ layerCount: 4 })
    || new EdgeInscriptionLayer(gl, { layerCount: 4 });
```

---

### 7. HybridRenderPipeline (`src/render/HybridRenderPipeline.js`)

Orchestrates all layers and composites to the canvas.

#### v2 Integration Points

```javascript
const pipeline = new HybridRenderPipeline(gl);

// Option A: Single mesh
pipeline.setMeshRenderer(meshRenderer);

// Option B: Multi-object scene (overrides single mesh)
pipeline.setSceneRenderer(sceneRenderer);

// Inscription
pipeline.setEdgeInscription(edgeInscription);
pipeline.setInscriptionChannel(inscriptionChannel);  // semantic states
pipeline.setDPR(window.devicePixelRatio);             // resolution scaling

// Splats + Procedural
pipeline.setSplatRenderer(splatRenderer);
pipeline.setProceduralRenderer((fbo, time) => { /* VIB3 shader */ });

// Per-layer configuration
pipeline.meshLayer.enabled = true;
pipeline.meshLayer.opacity = 1.0;
pipeline.meshLayer.blendMode = BlendModes.ALPHA;

pipeline.inscriptionLayer.enabled = true;
pipeline.inscriptionLayer.opacity = 0.8;
pipeline.inscriptionLayer.blendMode = BlendModes.ADDITIVE;

// Render
const stats = pipeline.render(time, modelView, projection, {
    rotation4D: rot4DMatrix,
    projDistance: 2.0,
    viewProjection: vpMatrix,
});
```

#### Blend Modes

| Mode | Enum | Formula |
|------|------|---------|
| Alpha | `BlendModes.ALPHA` | `mix(base, layer, alpha)` |
| Additive | `BlendModes.ADDITIVE` | `base + layer * alpha` |
| Multiply | `BlendModes.MULTIPLY` | `mix(base, base * layer, alpha)` |
| Screen | `BlendModes.SCREEN` | `1 - (1-base) * (1-layer)` blended by alpha |

---

## Capability Matrix

| Capability | Module | Status |
|-----------|--------|--------|
| Arbitrary 3D mesh rendering | MeshRenderer | Production |
| Morph target animation | MeshRenderer | Production |
| Multi-object scene compositing | SceneRenderer | Production |
| Cross-object edge inscription | EdgeInscriptionLayer + ObjectID MRT | Production |
| N-layer batched inscription (1-16) | EdgeInscriptionLayer | Production |
| Per-object inscription identity | InscriptionChannel | Production |
| Semantic state system (6 states) | InscriptionChannel | Production |
| Audio-reactive 4D inscription | InscriptionChannel + EdgeInscriptionLayer | Production |
| PBR material → Gaussian splats | PBRSplatConverter | Production |
| Resolution-independent inscription | EdgeInscriptionLayer (DPR-aware) | Production |
| WebGPU compute shader path | WebGPUInscription | Experimental |
| Depth-shared splat-mesh occlusion | HybridRenderPipeline | Production |
| 4-layer compositing with blend modes | HybridRenderPipeline | Production |

---

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `EdgeInscriptionLayer.js` | ~790 | Batched N-layer inscription with edge detection |
| `MeshRenderer.js` | ~570 | 3-MRT GBuffer mesh renderer with morph targets |
| `SceneRenderer.js` | ~360 | Multi-object scene manager |
| `PBRSplatConverter.js` | ~340 | PBR material decomposition to splats |
| `InscriptionChannel.js` | ~430 | Semantic state → inscription parameter mapping |
| `WebGPUInscription.js` | ~560 | WGSL compute shader inscription path |
| `HybridRenderPipeline.js` | ~630 | 4-layer compositor with post-processing |
| `TextureToSplatConverter.js` | ~200 | Basic texture → splat conversion |
| `index.js` | ~350 | Module exports |

---

## Performance Characteristics

### Single-Pass Batched Inscription

Previous: N draw calls (one per inscription layer), each binding FBO + program.

Current: **1 draw call** for all layers. The fragment shader loops over N layer configs via uniform arrays. This eliminates N-1 FBO binds and program switches.

### Shared Memory Tiling (WebGPU)

The edge detection compute shader uses 16x16 workgroups with an 18x18 shared memory tile (1-pixel halo). Each thread loads one texel plus halo contributions, then a workgroup barrier synchronizes before the Sobel kernel reads neighbors from shared memory rather than global texture reads.

### Multi-Object GBuffer Sharing

SceneRenderer renders the first object with `clearBuffer: true`, then subsequent objects render into the same framebuffer with depth testing. This avoids per-object FBO allocation and enables cross-object depth-correct compositing.

---

**VIB3+ CORE — Clear Seas Solutions LLC**
