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

| Count       | Technique                                          |
|-------------|----------------------------------------------------|
| 1K          | Current PoC (maxDepth 4, 6 generators)             |
| 10K–50K     | Deeper traversal + culling.  No arch change needed |
| 100K–500K   | Instanced quad rendering (replace gl.POINTS)       |
| 1M+         | Tile-based radix sort on GPU (WebGPU compute)      |
| 10M+        | Hierarchical LOD streaming + frustum culling        |

**gl.POINTS** caps out around 50–100K because each splat is a square sprite
with a fixed max size (usually 256px or less, driver-dependent).  The standard
production approach is to replace points with instanced screen-aligned quads
where each instance is a single splat, and to sort splats by depth on the GPU
using a radix sort compute shader.

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

### Track A: Text Rendering ("Hello World" Benchmark)

**Goal:** Render the text "Hello World" as Gaussian splats on the canvas.

| Phase | Milestone | What to build |
|-------|-----------|---------------|
| A.1   | SDF text atlas | Load a signed-distance-field font atlas (e.g. msdf-atlas-gen output). Each glyph is a grid of distance samples. |
| A.2   | Glyph → seed mapper | For each glyph, sample the SDF on a grid. Where `distance < threshold`, emit a GaussianSeed at that grid position. Scale and colour come from the distance value (closer to edge → smaller, brighter). |
| A.3   | Layout engine | Compute glyph positions using advance widths and kerning from the font metrics. Translate each glyph's seeds into world space along a baseline. |
| A.4   | PCG integration | Package the text seeds as a PCG JSON (`seeds` array with pre-computed positions). The CLI flow still works: `pcg validate` / `pcg render`. |
| A.5   | Camera + projection | Add a simple orbit camera with a perspective projection matrix. Pass `u_viewProjection` to the vertex shader and multiply `a_position` by it. |
| A.6   | Polish | Anti-alias edges by modulating σ per splat based on SDF distance. Add glow by using additive blending on a second pass. |

**Estimated complexity:** ~300–500 lines of new code (SDF sampler, layout,
camera uniform).  No architectural changes needed.

### Track B: Image-to-Splat (Adapting Other Media)

**Goal:** Load a JPEG/PNG and render it as a field of Gaussian splats.

| Phase | Milestone | What to build |
|-------|-----------|---------------|
| B.1   | Image loader | Load an image onto a hidden canvas, read pixel data via `getImageData()`. |
| B.2   | Pixel → seed sampler | For each pixel (or a downsampled grid), emit a GaussianSeed: position from pixel coordinates (mapped to clip space), colour from RGB, scale from luminance or a fixed value, orientation = identity. |
| B.3   | Importance sampling | Instead of a uniform grid, use Poisson-disc or blue-noise sampling weighted by edge density (Sobel filter). Edges get more splats → sharper detail. Flat regions get fewer → fewer draws. |
| B.4   | Depth from structure | Use luminance or a pretrained monocular depth estimator (e.g. MiDaS ONNX via onnxruntime-web) to assign depth per splat. Feed this into the existing `a_depth` attribute. |
| B.5   | 3D parallax | With per-splat depth, add a view matrix so the user can orbit the "image" and see parallax — flat photos become pseudo-3D dioramas. |
| B.6   | Video frames | Replace the static image with `requestVideoFrame()` on a `<video>` element. Re-sample splats every N frames. This gives a "video rendered as splats" effect. |

**Estimated complexity:** B.1–B.3 is ~200 lines. B.4–B.6 adds ~400 more.

### Track C: Point Cloud / PLY Import (Real 3DGS Data)

**Goal:** Load a `.ply` file from a real 3DGS training run and render it.

| Phase | Milestone | What to build |
|-------|-----------|---------------|
| C.1   | PLY parser | Parse the PLY binary format. Extract positions (3 floats), spherical harmonics (SH) coefficients or direct RGB, scales (3 floats), rotation quaternion (4 floats), opacity (1 float). |
| C.2   | SH → RGB | Evaluate degree-0 spherical harmonics to get view-independent base colour. (Higher degrees give view-dependent colour, but degree-0 is the fast path.) |
| C.3   | Covariance decode | Compute the 3D covariance Σ = R·S·Sᵀ·Rᵀ from the per-splat scale + quaternion. Project Σ into 2D screen space using the Jacobian of the projection: Σ₂D = J·Σ·Jᵀ. This replaces our current simple tilt-based anisotropy with the real thing. |
| C.4   | Full splat shader | Upgrade the fragment shader to take the projected 2D covariance (passed as 3 floats: σ_xx, σ_xy, σ_yy) and compute the Gaussian via the inverse covariance matrix. |
| C.5   | Radix sort | Implement a GPU radix sort (WebGPU compute shader) to sort splats by depth every frame. Required for correct transparency with 100K+ splats. |
| C.6   | Streaming | For large scenes (1M+ splats), implement tile-based streaming: load only the splats visible in the current frustum from a spatial index. |

**Estimated complexity:** C.1–C.2 is ~300 lines. C.3–C.4 is ~200 lines of
shader math. C.5–C.6 is a significant effort (1000+ lines, WebGPU compute).

### Recommended Order

**Ship fast:**  A.1 → A.3 → A.5 gives a readable "Hello World" in a day.

**Impress visually:**  B.1 → B.3 turns any image into a splat field and looks
striking.  Good for demos and social media.

**Production path:**  C.1 → C.4 is the real 3DGS renderer.  This is what lets
you load trained scenes from tools like gsplat, nerfstudio, or INRIA's original
code.

### Quick Win: Hardcoded "Hello" Seed Generator

The fastest path to a visible "hello world" without any font atlas:

```
Create a JS function that maps pixel coordinates from a 2D bitmap font
(hard-coded as a boolean grid) into GaussianSeed objects.  Feed the
resulting seed array into encodeGaussianSeeds() → SplatRenderPipeline.run().
No new dependencies, no font loading, works today.
```

This could be added as a `demo/hello-splat.js` alongside the existing PCG demo,
reusing the same HTML/CSS template and SplatRenderPipeline.

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

The current demo is a **working minimum viable pipeline**: PCG JSON in →
procedural seed expansion → GPU buffer encoding → CommandBuffer recording →
WebGL2 point-sprite rendering with per-splat colour, quaternion anisotropy,
true Gaussian falloff, and depth-aware compositing.

The dots are intentional — they prove the pipeline works.  The next step is
feeding it real content (text, images, or trained 3DGS point clouds) through
the same `GaussianSeed[]` → `encodeGaussianSeeds()` → `SplatRenderPipeline`
path that already exists.
