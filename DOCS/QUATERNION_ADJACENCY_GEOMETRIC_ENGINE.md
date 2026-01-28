# Quaternion Adjacency Geometric Engine Proposal

This document translates the quaternion-driven adjacency and plastic-ratio scaling concept into
an actionable architecture aligned with the existing VIB3CODE SDK rendering stack. It focuses on
procedural scene traversal, infinite-resolution refinement, and integration points with the
current shader + quaternion tooling.

## Goals
- **Infinite-resolution synthesis** by recursive subdivision using the plastic ratio (ρ ≈ 1.32).
- **Quaternion-encoded adjacency** for deterministic navigation across a 6-regular Cayley graph.
- **Procedural compact graph (PCG)** that stores rules instead of large splat datasets.
- **Differentiable path** for inverse procedural modeling and AI-driven editing.

## Conceptual Core
### Quaternion-driven adjacency
Define a generator set for adjacency using six quaternion rotations:

```
S_5 = {
  (1 ± 2i)/√5,
  (1 ± 2j)/√5,
  (1 ± 2k)/√5
}
```

Each generator encodes a rotational step on S³. Four generators map to lateral traversal; two map to
scale/depth traversal. The renderer walks this Cayley graph instead of indexing a static pixel grid.

### Plastic-ratio scaling
Use the plastic ratio (ρ ≈ 1.324718) as the recursive scale constant. The property ρ³ = ρ + 1
allows child Gaussians to fill the parent volume without discontinuities. A depth-limited traversal
provides continuous LOD across zoom levels.

## Engine Architecture
### 1) Algebraic Core (Rule Layer)
- **Quaternion generator set**: defines adjacency steps and directionality.
- **Scale module**: applies ρ-scaling to Gaussian covariance matrices.
- **Color quaternion encoding**: color stored as pure quaternion (0 + Ri + Gj + Bk) to maintain
  channel coherence during traversal.

### 2) Procedural Compact Graph (PCG)
- **Scene rules**: anchored “seed” Gaussians plus adjacency rules.
- **Traversal policy**: depth-first with foveated culling (viewport center first).
- **Deterministic hashing**: rule graph nodes hashed to avoid duplication and to enable caching.

### 3) Differentiable Render Pipeline
- **Differentiable rasterization**: makes traversal and scaling optimizable from data.
- **Temporal coherence module**: stabilizes between scale levels to avoid popping.
- **Hardware path**: compute-oriented backend targeting high quaternion throughput.

## Implementation Plan (Aligned to Repo)
### Phase 1: Math & Core Traversal
- Implement a `QuaternionAdjacencyGraph` primitive in `src/math/` that exposes:
  - generator set creation
  - deterministic walk functions
  - depth-limited traversal
- Build a `PlasticRatioScaler` to apply ρ-based scaling to Gaussian covariance in `src/math/`.
- Create a `FractalGaussianSeeder` in `src/geometry/` for seed + recursive child generation.

### Phase 2: Renderer Integration
- Add a `ProceduralGaussianStream` in `src/render/` that yields Gaussian primitives on-demand.
- Add a `FoveatedTraversalPolicy` in `src/ui/adaptive/` that adjusts depth based on focus.
- Extend shader inputs with quaternion adjacency metadata (aligned with existing shader pipeline).

### Phase 3: Differentiable & AI Editing
- Add a `ProceduralCompactGraphSchema` in `src/schemas/` for PCG rules.
- Expose editing hooks in `src/llm/` to mutate traversal weights and scaling parameters.
- Integrate telemetry to measure traversal depth, hit rate, and memory consumption.

## Integration Notes
- **Quaternion vs Rotor4D**: the current SDK already supports rotor math for 4D. The adjacency
  walk uses 3D quaternions, which can coexist with `Rotor4D` for 4D transformations.
- **Existing shader backbone**: the shader pipeline already handles rotation and translucent
  layering; the procedural stream simply replaces static Gaussian buffers.

## Benchmarks & Verification
- **Scene size**: <1MB PCG rule set for synthetic fractal scene.
- **Zoom consistency**: no visual popping across five LOD depth changes.
- **Performance target**: 30+ FPS at 1080p for a depth=6 traversal.

## Next Actions
1. Implement math primitives and traversal utilities.
2. Add renderer integration for on-demand procedural Gaussian emission.
3. Validate visual continuity under deep zoom and rotational navigation.

