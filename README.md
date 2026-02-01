# VIB3+ Hybrid Render Pipeline

**A compositing engine that unifies traditional mesh rendering, Gaussian splat fields, procedural 4D shaders, and holographic edge inscription into a single depth-coherent output.**

[![Tests](https://img.shields.io/badge/tests-693%2B%20passing-brightgreen)](#testing)
[![Version](https://img.shields.io/badge/version-2.0-blue)](#)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

---

## What It Does

Four rendering paradigms composited per-frame with shared depth, configurable blending, and cross-layer interaction:

```
Layer 0  MESH           Traditional triangles → 3-MRT GBuffer
Layer 1  SPLAT           Gaussian point-sprite splats, depth-tested against mesh
Layer 2  PROCEDURAL      VIB3 fullscreen fragment shader (24 geometry variants)
Layer 3  INSCRIPTION     N-layer holographic edge overlay driven by GBuffer
         ─── COMPOSITOR ───
         Per-layer opacity · blend modes · tone mapping · gamma
```

Each layer is independently toggleable, its opacity and blend mode adjustable at runtime. The inscription layer reads depth/normal/objectID from the mesh GBuffer to stamp animated 4D procedural patterns onto detected edges — silhouettes, creases, and cross-object boundaries.

**[Live Demo](docs/hybrid-demo.html)** — runs in any WebGL2 browser, no build step.

---

## Key Capabilities

| Capability | What It Means |
|-----------|--------------|
| **Multi-object scene compositing** | Multiple meshes into a shared GBuffer with per-object inscription routing |
| **3-MRT GBuffer** | Color + Normal/Depth + Object ID — one render pass, three textures |
| **Morph target animation** | GPU-side vertex blending between base and deformed meshes |
| **PBR material → splat decomposition** | Roughness, metallic, AO, emissive maps converted to oriented Gaussian distributions |
| **N-layer batched inscription** | 1–16 procedural layers in a single draw call via uniform arrays |
| **Semantic state system** | 6 object states (idle/active/selected/powered/damaged/destroyed) with smooth transitions |
| **Audio-reactive 4D modulation** | Bass→XW rotation, Mid→YW, High→ZW, Energy→all planes + glow |
| **Per-object identity** | Deterministic hash → unique inscription pattern per object (no artist config needed) |
| **Resolution-independent edges** | DPR-aware thickness scaling — same visual weight on 1x and 3x displays |
| **WebGPU compute path** | WGSL shared-memory edge detection + single-dispatch inscription (falls back to WebGL) |

---

## Quick Start

```bash
npm install
npm run dev:web        # Local dev server with hot reload
```

Open `demo/hybrid-demo.html` in browser. Drag to orbit, scroll to zoom. Use the Layers panel to toggle layers, adjust blend modes, switch semantic states, and simulate audio input.

For the pre-built GitHub Pages version (no build step):
```bash
# Serve docs/ directly
npx serve docs
```

---

## Architecture

### Render Pipeline

```
Scene Objects ──► SceneRenderer ──► Shared GBuffer (3 MRT)
                                        │
                  ┌─────────────────────┤
                  │ Color (RGBA8)       │ Normal/Depth (RGBA16F)     │ ObjectID (RGBA8)
                  └──────┬──────────────┴────────────┬───────────────┘
                         │                           │
                         ▼                           ▼
                  Compositor L0             EdgeInscriptionLayer
                                                    │
                                           InscriptionChannel
                                           (semantic state + audio)
                                                    │
                                                    ▼
                                           Compositor L3

PBR Textures ──► PBRSplatConverter ──► Splats ──► Compositor L1
VIB3 Systems ──► Procedural Callback ─────────► Compositor L2
```

### Module Map

| Module | Purpose |
|--------|---------|
| `HybridRenderPipeline` | Orchestrates all 4 layers, composites to canvas |
| `MeshRenderer` | Blinn-Phong mesh with 3-MRT GBuffer, morph targets, per-object ID |
| `SceneRenderer` | Multi-object scene into shared GBuffer with draw-order sorting |
| `GaussianSplatRenderer` | Point-sprite Gaussian splats with depth testing |
| `PBRSplatConverter` | PBR material maps → Gaussian splat distributions |
| `EdgeInscriptionLayer` | Batched N-layer inscription from GBuffer edge detection |
| `InscriptionChannel` | Semantic state → inscription parameter mapping + audio |
| `WebGPUInscription` | WGSL compute alternative (shared memory tiling) |
| `TextureToSplatConverter` | Diffuse texture → surface splats |

### VIB3 Visualization Systems

Three procedural shader systems feed Layer 2 and influence inscription patterns:

| System | Style | Key Feature |
|--------|-------|-------------|
| **Quantum** | Complex lattice patterns | Audio-reactive field distortion |
| **Faceted** | Clean geometric projections | Precise 4D rotation artifacts |
| **Holographic** | 5-layer glassmorphic effects | Per-layer depth parallax |

Each supports 24 geometry variants (8 base shapes × 3 core warps) and full 6D rotation.

### 6D Rotation

Six independent rotation planes — three in 3D space, three crossing into the 4th dimension:

| Plane | Type | Effect |
|-------|------|--------|
| XY, XZ, YZ | 3D | Standard rotation around Z, Y, X axes |
| XW, YW, ZW | 4D | Hyperspace rotation — produces "impossible" perspective shifts |

Implemented three ways: WASM Clifford algebra rotors (exact), GLSL matrices (GPU per-pixel), WGSL matrices (compute).

---

## API

### Pipeline Setup

```javascript
import { MeshRenderer, GaussianSplatRenderer, EdgeInscriptionLayer,
         HybridRenderPipeline, SceneRenderer, InscriptionChannel } from './src/render/index.js';

const pipeline = new HybridRenderPipeline(gl, { exposure: 1.2, gamma: 2.2 });

// Layer 0: Mesh
const mesh = new MeshRenderer(gl);
pipeline.setMeshRenderer(mesh);

// Layer 1: Splats
const splats = new GaussianSplatRenderer(gl);
pipeline.setSplatRenderer(splats);

// Layer 3: Inscription
const inscription = new EdgeInscriptionLayer(gl, { layerCount: 4 });
pipeline.setEdgeInscription(inscription);

// Per-layer control
pipeline.meshLayer.opacity = 1.0;
pipeline.meshLayer.blendMode = BlendModes.ALPHA;
pipeline.inscriptionLayer.opacity = 0.8;
pipeline.inscriptionLayer.blendMode = BlendModes.ADDITIVE;
```

### Multi-Object Scene

```javascript
const scene = new SceneRenderer(gl);
scene.addObject('hero', heroGeometry);
scene.addObject('terrain', terrainGeometry);
pipeline.setSceneRenderer(scene);
```

### Semantic States

```javascript
const channel = new InscriptionChannel({ layerCount: 4 });
channel.registerObject(1, 'active');
channel.setObjectState(1, 'powered');   // smooth transition
channel.setAudio(bass, mid, high, energy);
channel.update(deltaTime);
pipeline.setInscriptionChannel(channel);
```

### Morph Targets

```javascript
mesh.uploadGeometry(baseGeometry);
mesh.uploadMorphTarget(deformedPositions, deformedNormals);
mesh.morphWeight = 0.5;  // GPU-blended
```

---

## Project Structure

```
src/render/                        # Hybrid pipeline core
    HybridRenderPipeline.js        # 4-layer compositor
    MeshRenderer.js                # 3-MRT GBuffer mesh renderer
    SceneRenderer.js               # Multi-object scene manager
    EdgeInscriptionLayer.js        # Batched N-layer inscription
    InscriptionChannel.js          # Semantic state + audio mapping
    PBRSplatConverter.js           # PBR → Gaussian splats
    WebGPUInscription.js           # WGSL compute path
    GaussianSplatRenderer.js       # Splat renderer
    TextureToSplatConverter.js     # Texture → splat

src/core/                          # Engine orchestration
    VIB3Engine.js                  # Main entry point
src/quantum/                       # Quantum visualization system
src/faceted/                       # Faceted visualization system
src/holograms/                     # Holographic visualization system
src/geometry/                      # 24-geometry library + warps
src/math/                          # Vec4, Mat4x4, Rotor4D, projections
src/agent/                         # MCP server + CLI + telemetry
src/export/                        # Trading card + SVG + Lottie exporters

cpp/                               # C++ WASM core (Clifford algebra)
demo/                              # Interactive demos (hybrid, showcase, PCG)
docs/                              # GitHub Pages (pre-built demo + gallery)
tests/                             # 693+ tests (Vitest + Playwright)
```

---

## Testing

```bash
npm test                # Unit tests (Vitest)
npm run test:e2e        # Browser tests (Playwright)
npm run test:all        # Both
npm run bench           # Performance benchmarks
```

---

## Documentation

| Document | Contents |
|----------|---------|
| [`HYBRID_PIPELINE.md`](HYBRID_PIPELINE.md) | Full v2 pipeline technical reference — all 9 capabilities, module API, data flow |
| [`ROADMAP.md`](ROADMAP.md) | Development tracks and expansion plan |
| [`CLAUDE.md`](CLAUDE.md) | Codebase reference for AI-assisted development |
| [`DOCS/SYSTEM_INVENTORY.md`](DOCS/SYSTEM_INVENTORY.md) | Complete system inventory |

---

## License

**Proprietary** — © 2025 Paul Phillips — Clear Seas Solutions LLC

All Rights Reserved

---

**Contact:** Paul@clearseassolutions.com | [Parserator.com](https://parserator.com)
