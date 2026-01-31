# VIB3+ Gaussian Splat Pipeline — Technical Report & Dev Track

## Part 1 — What We Built

### The Problem

Gaussian splatting (3DGS) is a rendering technique where a scene is represented
as thousands of small, oriented, semi-transparent blobs ("splats"). Each splat
carries its own position, shape (via a covariance matrix or quaternion), colour,
and opacity.  The original VIB3+ renderer had a stub shader that ignored most of
this data — it drew uniform blue circles with a linear fade.  None of the
per-splat colour, orientation, or depth information reached the GPU.

### What Changed

We delivered three things end-to-end:

1. **Upgraded Gaussian splat shader** — the renderer now binds all six vertex
   attributes from the 12-float seed buffer and produces visually correct
   anisotropic, depth-aware Gaussian splats.

2. **SplatRenderPipeline** — a new module that wires the renderer into the
   engine's `CommandBuffer` system, validating the full procedural-to-GPU
   pipeline.

3. **PCG authoring CLI** — two new subcommands (`pcg edit`, `pcg render`) that
   complete the template → edit → validate → render authoring loop, all
   drivable from the command line or an agent.

---

## Part 2 — How It Works

### 2.1  Data Flow

```
PCG JSON ──► expandProceduralCompactGraph()
                │
                │  BFS over QuaternionAdjacencyGraph (S₅ generators)
                │  PlasticRatioScaler shrinks children at each depth
                │
                ▼
         GaussianSeed[]          (JS objects)
                │
                │  encodeGaussianSeeds()
                │  packs each seed into 12 contiguous floats
                │
                ▼
         Float32Array            (GPU-ready interleaved buffer)
                │
                │  SplatRenderPipeline.submit()
                │  records Clear → SetState → SetViewport → Draw
                │  into a CommandBuffer sorted back-to-front
                │
                ▼
         CommandBuffer.execute() → WebGL2 draw call
```

### 2.2  Seed Buffer Layout (per splat, 48 bytes)

| Offset | Count | Attribute      | GPU variable     |
|--------|-------|----------------|------------------|
| 0      | 3     | position xyz   | `a_position`     |
| 3      | 1     | scale          | `a_scale`        |
| 4      | 4     | orientation    | `a_orientation`  |
| 8      | 3     | colour rgb     | `a_color`        |
| 11     | 1     | traversal depth| `a_depth`        |

All attributes are interleaved in a single VBO with `stride = 48`.

### 2.3  Shader Pipeline

**Vertex shader** — runs once per splat (one GL point each):

- **Depth-aware sizing**: `gl_PointSize = scale * pointScale / (1 + depth * 0.15)`.
  Deeper splats in the traversal hierarchy render smaller.
- **Quaternion decode**: extracts the Z-rotation (yaw) and a tilt component
  from the quaternion `[w, x, y, z]` to produce two 2D axis vectors
  (`v_axisU`, `v_axisV`). The tilt stretches the major axis up to 1.6×,
  turning circles into oriented ellipses.
- All varyings are `flat` — they do not interpolate across the point sprite.

**Fragment shader** — runs per pixel of each point sprite:

- Centres `gl_PointCoord` to `[-0.5, 0.5]` and projects into the
  quaternion-derived ellipse frame via `dot(d, axisU/V)`.
- Computes a true Gaussian kernel: `exp(-0.5 * r² / σ²)` with σ = 0.20.
  This is mathematically correct 3DGS falloff — not a smoothstep hack.
- Multiplies by a depth-fade term `1 / (1 + depth * 0.25)` so deeper
  splats are more transparent.
- Outputs **premultiplied alpha** (`rgb * α, α`).
- Fragments below α = 0.004 are discarded for early-out.

**Blend state**: `gl.blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` with depth test ON
but depth write OFF — standard for back-to-front transparent compositing.

### 2.4  Procedural Content Generation

Seeds don't come from a mesh or a point cloud scan.  They come from a
**Procedural Compact Graph** — a small JSON file (~40 lines) that encodes:

| Field         | Purpose                                              |
|---------------|------------------------------------------------------|
| `seeds`       | Root seed(s) with position, orientation, scale, colour |
| `adjacency`   | Map of named quaternion generators (S₅ group)        |
| `scaling`     | Plastic ratio (φ₃ ≈ 1.3247), max depth, step distance |

The `expandProceduralCompactGraph()` function does a BFS walk:

1. Start at the root seed.
2. For each generator key, multiply the current quaternion by the generator
   quaternion → get a new orientation.
3. Rotate a basis vector `[1,0,0]` by that orientation → get a direction.
4. Place the child at `parent.position + direction * stepDistance * φ₃^depth`.
5. Shrink scale by `φ₃^depth`.
6. Repeat up to `maxDepth`.

At `maxDepth = 4` with 6 generators, this produces **1,555 seeds** from a
single root.  The structure is self-similar (fractal) because the plastic ratio
is an algebraic number related to the golden ratio.

### 2.5  Foveated Traversal (Runtime LOD)

The demo doesn't expand the full graph once.  Instead:

- `FoveatedTraversalPolicy` reads pointer distance (focus) and velocity
  (motion) and computes an adaptive `maxDepth` and `batchSize`.
- When the pointer is close to centre and still → `maxDepth` increases → more
  splats → higher detail.
- When the pointer is far or moving fast → `maxDepth` drops → fewer splats →
  cheaper frames.

This is the runtime LOD system.  In production it would drive GPU budget
allocation, culling, and streaming.

### 2.6  CommandBuffer Integration

`SplatRenderPipeline.submit(seeds)` records four commands:

1. `ClearCommand` — colour + depth clear.
2. `SetStateCommand` — premultiplied-alpha blend, depth read, no cull.
3. `SetViewportCommand` — match canvas size.
4. `CustomCommand` — binds the GaussianSplatRenderer's own program/VAO and
   issues `drawArrays(POINTS, 0, count)`.

The CommandBuffer sorts these by priority (setup commands first, draw last)
and can optionally sort draw commands by depth for correct transparency order.
This validates that the full deferred-command architecture works end-to-end.

### 2.7  CLI Authoring Flow

The complete loop, all executable from a terminal or an agent:

```bash
# 1. Generate a starter PCG
vib3 pcg template --json > scene.json

# 2. Edit it (dot-path overrides, re-validates before writing)
vib3 pcg edit scene.json \
  --set seeds.0.color=0.2,0.8,1.0 \
  --set scaling.maxDepth=4

# 3. Validate against schema
vib3 pcg validate scene.json --json

# 4. Headless pipeline run — expand, encode, report stats
vib3 pcg render scene.json --json
# → { seeds_expanded: 1555, buffer_bytes: 74640, expand_ms: 10.3, ... }
```

---

## Part 3 — What You See (and Why It Looks Minimal)

The dots you see are real Gaussian splats — each one uses per-seed colour,
quaternion-derived anisotropic shape, and depth-modulated opacity and size.
But they look minimal because:

1. **The PCG template is a single white root seed.**  The BFS walk produces a
   symmetric fractal — interesting mathematically, but visually just a cluster
   of dots fanning out along quaternion-rotated axes.

2. **There is no scene data.**  We're not loading a mesh, a point cloud, or an
   image.  Every splat is procedurally placed by the S₅ Cayley graph walk.

3. **No camera / projection matrix.**  Positions are in clip space (–1 to +1).
   There is no view matrix, no perspective projection, no orbit controls.

4. **No per-splat covariance.**  Real 3DGS stores a full 3×3 covariance (or 3
   scales + quaternion).  We use a single scalar scale per splat plus a
   quaternion for the 2D orientation, which limits the visual richness.

This is exactly what a proof-of-concept should look like: the pipeline works
end-to-end, every attribute reaches the GPU, the math is correct, and the next
steps are about feeding it real data.

---

## Part 4 — How It Scales

### 4.1  Splat Count

| Count       | Technique                             | Measured FPS (Pixel 9 Pro) |
|-------------|---------------------------------------|---------------------------|
| 1K          | PCG BFS (maxDepth 4, 6 generators)    | 60                        |
| 10K–50K     | Procedural generators, `gl.POINTS`    | 60                        |
| 250K–500K   | GPU-animated `gl.POINTS` + `u_time`   | 60                        |
| 750K–1M     | `gl.POINTS` + HDR bloom + chromatic   | 60                        |
| 10M         | `drawArraysInstanced` (1M x 10)      | 9                         |
| 20M         | `drawArraysInstanced` (2M x 10)      | crash (GPU OOM)           |

> **Benchmark conditions (2026-01-31):** Pixel 9 Pro, Chrome, 56 tabs open,
> GitHub Pages deployment. Raw unoptimized WebGL2 — no frustum culling, no
> radix sort, no LOD, no WebGPU compute. See
> `DOCS/SPLAT_SHOWCASE_BENCHMARKS_2026-01-31.md` for full details.

**gl.POINTS** scales further than the original 50–100K estimate suggested.
With dynamic FOV-based `pointScale`, GPU-driven animation, and procedural
seed generation, 1M splats at 60 FPS on mobile is achievable in the current
unoptimized pipeline. The standard production approach for 10M+ is instanced
screen-aligned quads with GPU radix sort and tile-based rasterization.

### 4.2  WebGPU Path

The codebase already has a `WebGPUBackend`.  Porting the splat renderer to
WebGPU unlocks:

- **Compute-shader radix sort** for correct back-to-front order at 1M+ splats.
- **Indirect draw** so the GPU controls how many splats to render.
- **Storage buffers** for the full covariance matrix (6 floats per splat).
- **Subgroups** for tile-based splatting (future WebGPU extension).

### 4.3  Streaming & LOD

The `FoveatedTraversalPolicy` already implements attention-based LOD.  To scale:

1. **Frustum culling** — discard splats outside the view frustum before encoding.
2. **Octree / BVH** — spatial index over splats for O(log n) culling.
3. **Level-of-detail streaming** — fetch higher-depth PCG expansions on demand,
   similar to how Google Earth streams terrain tiles.
4. **Temporal reuse** — keep the previous frame's buffer and only update the
   delta (new/removed splats) to reduce per-frame encode cost.

---

## Part 5 — Dev Track: From Dots to "Hello World"

> **Status (2026-01-31):** All three tracks completed and shipped. The showcase
> demo at `demo/showcase-demo.html` implements all tracks plus three additional
> scale tiers (Massive, Ultra, WOAH). See
> `DOCS/SPLAT_SHOWCASE_BENCHMARKS_2026-01-31.md` for performance data.

### Track A: Text Rendering — COMPLETED

Implemented in `src/splat/TextSplatGenerator.js`. Bitmap font grid with
rainbow hue cycling. Renders 2K–8K splats per text string. Integrated into
showcase demo as Mode 1.

### Track B: Image-to-Splat — COMPLETED

Implemented in `src/splat/ImageSplatGenerator.js`. Supports procedural
patterns (checker, sunset, plasma) and drag-and-drop user images via
`getImageData()` sampling. Renders 5K–20K splats. Integrated as Mode 2.

### Track C: 3D Shape / PLY Import — COMPLETED

Implemented in `src/splat/ShapeSplatGenerator.js` (torus knot, torus,
sphere, helix, multi-shape) and `src/splat/PlySplatLoader.js` (binary PLY
parser). Orbit camera via `src/splat/SplatCamera.js`. Renders 10K–50K splats.
Integrated as Mode 3.

### Beyond the Original Tracks

| Mode | File | Splats | What it proves |
|------|------|--------|----------------|
| Massive | `GalaxySplatGenerator.js` | 250K–500K | GPU animation at scale |
| Ultra | `MegaSplatGenerator.js` | 750K–1M | HDR bloom + chromatic at 60 FPS |
| WOAH | `HyperSplatRenderer.js` + `HyperSceneGenerator.js` | 10M (instanced) | 4D rotation + ACES tone mapping |

---

## Part 6 — Architecture Decisions & Trade-offs

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| `gl.POINTS` instead of instanced quads | Simplest path for PoC. Zero index buffers, zero geometry. | Max splat size is driver-capped (often 256px). Can't do per-splat clipping. |
| Premultiplied alpha | Correct compositing for overlapping transparent splats. No order-dependent artifacts for splats at the same depth. | Requires `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` everywhere — easy to forget. |
| Flat varyings | Point sprites have only one vertex, so standard interpolation is meaningless. `flat` makes the intent explicit and avoids driver quirks. | None. This is strictly correct for point sprites. |
| Single scalar scale | Simpler buffer layout (12 floats). | Cannot represent anisotropic scale (3 independent axes). Real 3DGS needs 3 scales. |
| Quaternion → 2D yaw+tilt | Practical for PoC. Captures the most visible rotation component. | Loses roll and full 3D→2D covariance projection. Tracks B and C fix this. |
| CommandBuffer with CustomCommand | Validates the deferred-command architecture without rewriting the renderer to use abstract draw commands. | The renderer still manages its own GL state inside the callback. Full integration would make it a "proper" render pass. |

---

## Summary

The Gaussian splat pipeline is a **complete, shipping system** with six
rendering modes spanning 2K to 10M visual splats. All three original dev
tracks (Text, Image, 3D Shape/PLY) are implemented, plus three additional
scale tiers (Massive, Ultra, WOAH) that push the unoptimized WebGL2
pipeline to its limits.

**Current ceiling (2026-01-31):** 1M splats at 60 FPS on mobile (Pixel 9
Pro, Chrome, 56 tabs). 10M splats render at 9 FPS via instanced drawing.
20M splats crash from GPU memory pressure. All numbers are raw /
unoptimized — standard 3DGS production techniques (radix sort, frustum
cull, WebGPU compute, tile rasterization) would push the interactive
ceiling significantly higher.
