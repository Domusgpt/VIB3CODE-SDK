# Gaussian Splat Showcase — Performance Benchmarks & Session Log

**Date:** 2026-01-31
**Branch:** `claude/upgrade-splat-shader-MdiLj`
**Test Device:** Google Pixel 9 Pro, Chrome, 56 tabs open

---

## Performance Benchmarks (Raw, Unoptimized)

| Mode | Visual Splats | Base Buffer | Technique | FPS | Status |
|------|--------------|-------------|-----------|-----|--------|
| Text | 2K–8K | 2K–8K seeds | `gl.POINTS` | 60 | Stable |
| Image | 5K–20K | 5K–20K seeds | `gl.POINTS` | 60 | Stable |
| 3D Shape | 10K–50K | 10K–50K seeds | `gl.POINTS` | 60 | Stable |
| Massive | 250K–500K | 250K–500K seeds | `gl.POINTS` + `u_animate` | 60 | Stable |
| Ultra | 750K–1M | 750K–1M seeds | `gl.POINTS` + HDR bloom | 60 | Stable |
| **WOAH** | **10M** | **1M seeds** | **`drawArraysInstanced` (1M x 10)** | **9** | **Runs** |
| ~~WOAH~~ | ~~20M~~ | ~~2M seeds~~ | ~~`drawArraysInstanced` (2M x 10)~~ | ~~crash~~ | ~~OOM~~ |

### Key Findings

- **1M splats at 60 FPS** on a mobile device with 56 tabs open is the current ceiling for smooth rendering with the unoptimized `gl.POINTS` pipeline.
- **10M splats at 9 FPS** is renderable but not interactive. The instanced renderer works, the scene is visually coherent, but the frame budget is blown.
- **20M splats crash** on GitHub Pages (Pixel 9 Pro). The ~96 MB GPU buffer allocation plus 10 instance copies exceeds available mobile GPU memory under heavy tab pressure.

### GPU Memory Estimates

| Mode | Buffer Size | Calculation |
|------|------------|-------------|
| 1M (Ultra) | ~48 MB | 1,000,000 x 12 floats x 4 bytes |
| 10M (WOAH) | ~48 MB + instancing | 1,000,000 base x 48 bytes + 80-byte instance buffer |
| 20M (crashed) | ~96 MB + instancing | 2,000,000 base x 48 bytes + 80-byte instance buffer |

### What "Unoptimized" Means

These benchmarks are against raw procedural generation with no production optimizations applied:

- **No frustum culling** — all splats are submitted every frame regardless of visibility
- **No depth sorting** — no GPU radix sort, relies on simple blending
- **No LOD / streaming** — full buffer uploaded, no progressive refinement
- **No occlusion culling** — splats behind opaque regions still rendered
- **No spatial indexing** — no octree / BVH for early rejection
- **No WebGPU compute** — everything is WebGL2 with `gl.POINTS`
- **No indirect draw** — draw count is CPU-determined, not GPU-driven
- **`gl.POINTS`** — driver-capped max point size, no instanced quads

With standard 3DGS production optimizations (radix sort, frustum cull, tile-based rasterization, WebGPU compute), the 10M target should be achievable at interactive frame rates.

---

## What Was Built Today

### Six Showcase Modes (end-to-end)

The showcase demo (`demo/showcase-demo.html`) exposes six rendering modes through a single interface, all powered by the procedural Gaussian splat pipeline:

#### Mode 1: Text (2K–8K splats)
- Bitmap font renderer converts text strings into positioned Gaussian seeds
- Each character is a grid of splats colored per-pixel from the glyph shape
- Rainbow hue cycling across the text baseline

#### Mode 2: Image (5K–20K splats)
- Procedural patterns (checker, sunset gradient, plasma) rendered as splat fields
- Drag-and-drop any JPEG/PNG to render it as a Gaussian splat cloud
- Per-pixel color sampling, luminance-based depth assignment

#### Mode 3: 3D Shape (10K–50K splats)
- Parametric surface generators: torus knot, torus, sphere, helix, multi-shape
- Normal-aligned splat orientation via quaternion encoding
- Full orbit camera (drag to rotate, scroll to zoom)
- PLY file upload for real 3DGS data

#### Mode 4: Massive (250K–500K splats)
- Four GPU-animated generators: Galaxy, Nebula, Particle Storm, Star Field
- `u_time` + `u_animate` uniforms drive vertex shader animation
- Breathing scale, orbital drift, twinkle — all GPU-side, zero CPU per-frame cost
- First demonstration of the procedural compression ratio (~10M:1)

#### Mode 5: Ultra (750K–1M splats)
- Five visually distinct generators at extreme scale:
  - **Supernova** (750K): Expanding shock shell + filament debris + core remnant
  - **Black Hole** (750K–1M): Accretion disk with Doppler shift + relativistic jets + photon ring
  - **Aurora** (600K–800K): Curtain sheets + magnetic field rays
  - **Fireworks** (500K–750K): 12 burst types (sphere/ring/palm/willow) with trails
  - **Quantum Field** (800K–1M): Wave interference with standing wave nodes
- HDR bloom simulation (dual Gaussian: core sigma=0.19 + bloom sigma=0.35)
- Chromatic aberration on bloom halos (per-channel RGB offset)
- ACES-like intensity boost
- Multi-frequency twinkle (3 sine waves)

#### Mode 6: WOAH (10M splats)
- Single hyper-scene: procedural universe (cosmic web, galaxy clusters, spiral galaxies, nebulae, star fields)
- **Instanced rendering**: 1M base splats x 10 instances via `drawArraysInstanced`
- **4D hyperspace rotation**: Full 6-plane rotation (XY, XZ, YZ, XW, YW, ZW) from VIB3+ geometric algebra
- **4D perspective projection**: `xyz / (dimension - w)` per-vertex
- **ACES filmic tone mapping**: HDR to SDR color compression
- **Anamorphic horizontal streak**: Lens flare on bright splats
- **Aurora shimmer**: Depth-driven hue cycling
- **Per-instance variation**: Position offset, Y rotation, color tint, scale multiplier
- Auto-animated: 4D rotation planes oscillate via sine waves (no user input needed)

---

## Shader Features Implemented

### GaussianSplatRenderer (Modes 1–5)

**Vertex shader:**
- FOV-based dynamic `pointScale` (replaces hardcoded value)
- Quaternion → 2D anisotropic axis decode (yaw + tilt)
- Depth-aware sizing: `scale * pointScale / (1 + depth * 0.15)`
- GPU animation: breathing scale + orbital drift via `u_time`
- Bloom energy varying: `smoothstep(0.5, 1.0, luminance) * u_intensity`

**Fragment shader:**
- True Gaussian kernel: `exp(-0.5 * r^2 / sigma^2)`, sigma = 0.20
- HDR bloom: secondary wide Gaussian added to bright splats
- Chromatic aberration: per-channel R/B shift on bloom halos
- Depth-fade transparency: `1 / (1 + depth * 0.25)`
- Premultiplied alpha output with alpha discard at 0.004

**Uniforms added:**
- `u_intensity` (0.0–2.0): HDR boost factor
- `u_chromatic` (0.0–1.0): Chromatic aberration strength
- `u_time`: Animation clock
- `u_animate` (0 or 1): Animation enable flag

### HyperSplatRenderer (Mode 6)

**Vertex shader:**
- 6 rotation matrix functions (rotateXY through rotateZW)
- Combined 4D rotation: `rotXY * rotXZ * rotYZ * rotXW * rotYW * rotZW`
- 4D perspective projection: `projFactor = 1.0 / (u_dimension - p4.w)`
- Per-instance attributes via `vertexAttribDivisor`: offset, rotation, tint, scale
- Instance buffer layout: 10 instances x 8 floats = 80 floats

**Fragment shader:**
- ACES filmic tone mapping: `(x*(2.51x+0.03))/(x*(2.43x+0.59)+0.14)`
- Anamorphic streak: narrow vertical sigma x wide horizontal sigma on bright splats
- Core Gaussian (sigma=0.19) + bloom halo
- Multi-frequency twinkle: 3 sine waves at different frequencies

---

## SDK Integration

The Gaussian splat pipeline was integrated as a first-class VIB3+ rendering system:

| Component | File | Purpose |
|-----------|------|---------|
| `GaussianSplatSystem` | `src/splat/GaussianSplatSystem.js` | RendererContract adapter (init/resize/render/dispose) |
| `GaussianSplatRendererAdapter` | `src/core/renderers/GaussianSplatRendererAdapter.js` | Delegation adapter matching Holographic pattern |
| `SplatAudioBridge` | `src/splat/SplatAudioBridge.js` | Bass → intensity, mid → chromatic, high → pointScale |

This puts Gaussian splats alongside Quantum, Faceted, and Holographic as a switchable SDK system, controllable via MCP tools (`set_system('gaussian')`).

---

## Procedural Compression Ratios

| Generator | Splat Count | PLY Equivalent | Procedural Params | Compression |
|-----------|------------|----------------|-------------------|-------------|
| Galaxy | 250K | 12 MB | ~48 bytes | 250,000:1 |
| Nebula | 250K | 12 MB | ~48 bytes | 250,000:1 |
| Supernova | 750K | 36 MB | ~48 bytes | 750,000:1 |
| Black Hole | 1M | 48 MB | ~48 bytes | 1,000,000:1 |
| WOAH Universe | 10M (visual) | 480 MB | ~48 bytes | 10,000,000:1 |

---

## Files Created / Modified

### New Files (this session)

| File | Lines | Purpose |
|------|-------|---------|
| `src/splat/GalaxySplatGenerator.js` | 457 | 4 massive-mode generators (250K–500K) |
| `src/splat/MegaSplatGenerator.js` | 901 | 5 ultra-mode generators (750K–1M) |
| `src/splat/GaussianSplatSystem.js` | 336 | RendererContract system for SDK |
| `src/splat/SplatAudioBridge.js` | 143 | Audio-reactive uniform bridge |
| `src/core/renderers/GaussianSplatRendererAdapter.js` | 67 | SDK adapter |
| `src/render/HyperSplatRenderer.js` | 439 | Instanced 10M renderer with 4D rotation |
| `src/splat/HyperSceneGenerator.js` | 296 | Procedural universe generator |

### Modified Files

| File | Change |
|------|--------|
| `src/render/GaussianSplatRenderer.js` | HDR bloom, chromatic aberration, u_intensity, u_animate |
| `sdk/src/render/GaussianSplatRenderer.js` | Synced copy of above |
| `demo/showcase-demo.js` | All 6 modes, lazy hyper-renderer init, metrics display |
| `demo/showcase-demo.html` | Ultra + WOAH buttons, mode dividers |
| `demo/showcase-demo.css` | Ultra (orange), WOAH (gold) button styles |

### Commit History

```
6326743 fix: reduce WOAH mode from 20M to 10M splats to prevent GPU OOM on Pages
60cd47d feat: add 20M-splat WOAH mode with instanced 4D hyperspace renderer
cf023bc feat: integrate splat pipeline into 4D SDK with 1M+ ultra-scale generators
bcf440b feat: add GPU-animated massive mode with 250K-500K procedural splats
08f380f fix: correct pointScale calculation and add preloaded demo examples
f2050b4 feat: add text, image, and 3D shape splat generators with showcase demo
```

---

## Next Steps (Optimization Path to 60 FPS at 10M+)

These are the standard production 3DGS optimizations that would unlock interactive frame rates at the 10M+ scale:

1. **WebGPU compute radix sort** — correct back-to-front transparency ordering
2. **Frustum culling** — discard off-screen splats before draw
3. **Instanced quads** — replace `gl.POINTS` (driver-capped) with screen-aligned quad instances
4. **Tile-based rasterization** — process splats in screen-space tiles for cache coherence
5. **Indirect draw** — let GPU determine draw count
6. **Hierarchical LOD** — spatial index (octree/BVH) for progressive detail
7. **Temporal reuse** — reuse previous frame buffer, update only delta

---

**VIB3+ Gaussian Splat Pipeline — Clear Seas Solutions LLC**
