# Quaternion Adjacency Geometric Engine Proposal

This document reframes quaternion-driven adjacency + plastic-ratio scaling as a **procedural
geometric field engine** aligned with the VIB3CODE SDK’s shader, quaternion, and translucent
layering infrastructure. The goal is to move from **static datasets** (Lagrangian splats) to
**continuous discovery** (Eulerian field sampling), enabling infinite-resolution synthesis,
coherent zoom, and programmable geometric semantics.

## Design Goals (Paradigm Shift Targets)
- **Infinite-resolution synthesis** via recursive subdivision using the plastic ratio (ρ ≈ 1.324718).
- **Quaternion-encoded adjacency** to define “next-pixel” traversal as group action over S³.
- **Procedural compact graph (PCG)** storing transformation rules instead of dense splat buffers.
- **Deterministic coherence** across scale transitions (no popping, no LOD discontinuity).
- **Differentiable traversal** enabling inverse procedural modeling and AI-native editing.
- **Hardware-favorable compute** (ALU-heavy, cache-light) for modern GPU/IPU pipelines.

## Conceptual Core
### Quaternion-driven adjacency (Cayley Graph Traversal)
Define a generator set for adjacency using six quaternion rotations:

```
S_5 = {
  (1 ± 2i)/√5,
  (1 ± 2j)/√5,
  (1 ± 2k)/√5
}
```

Each generator encodes a rotational step on S³. Four generators map to lateral traversal; two map to
scale/depth traversal. The renderer **walks a Cayley graph** instead of indexing a static pixel grid,
so adjacency becomes **group action** rather than Euclidean stepping.

### Plastic-ratio scaling (Recursive Volume Closure)
Use the plastic ratio (ρ ≈ 1.324718) as the recursive scale constant. The identity **ρ³ = ρ + 1**
enables subdividing a parent Gaussian into child Gaussians that **tile the same volumetric envelope**
with stable overlap. This yields a **scale-consistent fractal** where zooms are continuous rather than
discrete.

### Quaternion Color Encoding (Channel Coherence)
Encode color as a pure quaternion (0 + Ri + Gj + Bk). This preserves inter-channel relationships under
rotational traversal and scaling, preventing color drift from naïve linear interpolation.

## Engine Architecture
### 1) Algebraic Core (Rule Layer)
- **Quaternion generator set**: defines adjacency steps and directionality.
- **Adjacency kernel**: converts generator steps into local frame transforms.
- **Scale module**: applies ρ-scaling to Gaussian covariance matrices.
- **Color quaternion encoding**: preserves channel coherence under traversal.

### 2) Procedural Compact Graph (PCG)
- **Scene rules**: anchored “seed” Gaussians + rule-based transformations.
- **Traversal policy**: depth-first + foveated culling (viewport center first).
- **Deterministic hashing**: rule nodes hashed to enable caching + stable reproduction.
- **Semantic tags**: optional labels for LLM-driven editing (material density, harmonic tension).

### 3) Differentiable Render Pipeline
- **Differentiable rasterization**: makes traversal + scaling optimizable from data.
- **Temporal coherence module**: stabilizes between scale levels to avoid popping.
- **Scheduler**: prioritizes traversal depth per pixel based on focus + motion.
- **Hardware path**: compute-oriented backend targeting high quaternion throughput.

### 4) Runtime Orchestration
- **Procedural stream**: emits Gaussians on-demand for the renderer.
- **Traversal budgeter**: caps depth per frame, distributes work across tiles.
- **Telemetry hooks**: measures traversal depth, cache hits, and temporal stability.

## Implementation Plan (Aligned to Repo)
### Phase 1: Math & Core Traversal
- Implement a `QuaternionAdjacencyGraph` primitive in `src/math/` exposing:
  - generator set creation
  - deterministic walk functions
  - depth-limited traversal with foveated ordering
- Build a `PlasticRatioScaler` in `src/math/` to apply ρ-scaling to Gaussian covariance.
- Create a `FractalGaussianSeeder` in `src/geometry/` for seed + recursive child generation.
- Add a **telemetry baseline** in `src/testing/` to log traversal depth + cache stats.

### Phase 2: Renderer Integration
- Add a `ProceduralGaussianStream` in `src/render/` that yields Gaussians on-demand.
- Add a `FoveatedTraversalPolicy` in `src/ui/adaptive/` adjusting depth based on focus.
- Extend shader inputs with quaternion adjacency metadata (aligned with existing shader pipeline).
- Integrate a **scale transition stabilizer** to remove popping.

### Phase 3: Differentiable & AI Editing
- Add a `ProceduralCompactGraphSchema` in `src/schemas/` for PCG rules.
- Expose editing hooks in `src/llm/` to mutate traversal weights and scaling parameters.
- Integrate telemetry to measure traversal depth, hit rate, and memory consumption.
- Add **inverse procedural modeling** to infer rules from input frames.

## Integration Notes
- **Quaternion vs Rotor4D**: the SDK already supports rotor math for 4D. The adjacency walk uses
  3D quaternions and can coexist with `Rotor4D` for 4D transformations.
- **Existing shader backbone**: the shader pipeline already handles rotation and translucent
  layering; the procedural stream replaces static Gaussian buffers.
- **Scene compatibility**: existing scenes can be treated as seed Gaussians to bootstrap PCG rules.

## Benchmarks & Verification
- **Scene size**: <1MB PCG rule set for synthetic fractal scene.
- **Zoom consistency**: no visual popping across five LOD depth changes.
- **Performance target**: 30+ FPS at 1080p for a depth=6 traversal.
- **Determinism**: same traversal seed produces identical outputs across runs.

## Next Actions
1. Implement math primitives and traversal utilities.
2. Add renderer integration for on-demand procedural Gaussian emission.
3. Validate visual continuity under deep zoom and rotational navigation.
4. Map PCG rule parameters to LLM-editable attributes.
