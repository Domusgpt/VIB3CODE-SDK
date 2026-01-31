# Hybrid Pipeline Integration Analysis

Comparison of the Hi-Fi splat branch (`claude/analyze-vib3code-shader-QQDM6`) and the hybrid render pipeline branch (`claude/gaussian-traditional-graphics-HaBhf`), with concrete integration recommendations.

---

## Architecture Comparison

### Hi-Fi Splat Branch (this branch)

Single-purpose Gaussian splat renderer with production-grade internals:

| Component | Implementation |
|-----------|---------------|
| **Splat rendering** | Instanced quads via `drawElementsInstanced` (no gl.POINTS cap) |
| **Covariance** | Full 3D->2D anisotropic: J(perspective) * R*S*S^T*R^T * J^T in pixel space |
| **Buffer layout** | 16-float hi-fi: position(3) + scale3(3) + quaternion(4) + color(3) + opacity(1) + depth(1) + pad(1) |
| **Depth sorting** | 16-bit radix sort, O(n), CPU-side |
| **Frustum culling** | 6-plane extraction from VP matrix |
| **Post-processing** | Sobel edge detection + VIB3 inscription overlay + Reinhard tonemap |

**Missing**: No triangle mesh renderer, no GBuffer, no multi-layer compositor.

### Hybrid Branch

Multi-layer compositing pipeline with 4 render stages:

| Component | Implementation |
|-----------|---------------|
| **Mesh rendering** | Blinn-Phong with GBuffer (2 MRT: color + normal/depth) |
| **Splat rendering** | gl.POINTS with fixed sigma, 12-float isotropic buffer |
| **Procedural layer** | Fullscreen VIB3 24-geometry shader |
| **Edge inscription** | Sobel on GBuffer normal+depth -> multi-layer VIB3 patterns masked to edges |
| **Compositor** | 4-layer blend (alpha/additive/multiply/screen) + exposure + Reinhard + gamma |
| **Semantic states** | InscriptionChannel: 6 states (idle/active/selected/powered/damaged/destroyed) |
| **Audio** | Bass/mid/high/energy -> 4D rotation + inscription parameters |
| **Texture-to-splat** | Surface sampling with edge-aware density boost |

**Missing**: Instanced quads, anisotropic covariance, depth sorting, frustum culling.

---

## Integration Opportunities

### 1. Replace hybrid's GaussianSplatRenderer with HiFiSplatRenderer

**Impact: High. Effort: Low.**

The hybrid branch's `GaussianSplatRenderer` uses `gl.POINTS` with a fixed-sigma Gaussian kernel. It has no depth sorting (relies on mesh depth buffer via `blitFramebuffer`), no frustum culling, and no anisotropic scale. Replacing it with `HiFiSplatRenderer` gives:

- Instanced quads (no driver point-size cap, better clipping)
- Proper 2D covariance projection (anisotropic ellipses, not circles)
- Back-to-front ordering within the splat layer
- Frustum culling (~50% fewer splats drawn per frame)

**Integration path**:
```javascript
// In hybrid-bundle.js, replace:
const splatRenderer = new GaussianSplatRenderer(gl, {...});

// With:
const splatRenderer = new HiFiSplatRenderer(gl, {
    blendMode: 'premultiplied',
    frustumCull: true,
    depthSort: true,
});

// The HybridRenderPipeline.render() already calls splatRenderer.render(vp, time)
// but HiFiSplatRenderer.render() takes (viewMatrix, projMatrix, vp, time).
// A thin adapter or API alignment is needed.
```

**Buffer upgrade**: The hybrid's `TextureToSplatConverter` outputs 12-float isotropic seeds. To use the hi-fi layout, it should output `scale3` (surface-tangent anisotropy) and separate `opacity`. The tangent and bitangent from the mesh face provide natural anisotropic axes.

### 2. Feed HiFiSplatRenderer output into the hybrid compositor

**Impact: High. Effort: Medium.**

Currently the hybrid pipeline renders splats into an FBO and composites 4 layers. The hi-fi renderer can render to a bound FBO:

```javascript
// Bind the pipeline's splat FBO
gl.bindFramebuffer(gl.FRAMEBUFFER, splatFBO.framebuffer);
// HiFiSplatRenderer renders to whatever FBO is currently bound
hifiRenderer.render(viewMatrix, projMatrix, vp, time);
// The compositor reads splatFBO.texture as u_splatLayer
```

This works because `HiFiSplatRenderer.render()` doesn't call `gl.bindFramebuffer` — it renders to whatever's bound.

### 3. Use GBuffer normal+depth for higher-quality edge detection

**Impact: Medium. Effort: Medium.**

Our `SplatPostProcess` currently runs Sobel on luminance (since splats don't produce normals). The hybrid branch's `MeshRenderer` outputs a GBuffer with per-pixel normals and depth. In a combined pipeline:

- Mesh renders to GBuffer (normal + depth)
- Splats render to separate FBO (color)
- Edge detection uses GBuffer normal+depth (geometric edges) instead of luminance
- Inscription overlay applies to both mesh and splat regions

This gives true surface-aware edge detection rather than color-based approximation.

### 4. InscriptionChannel as a shared state system

**Impact: Medium. Effort: Low.**

The hybrid branch's `InscriptionChannel` maps semantic states to visual parameters with smooth transitions. This can drive both the edge inscription layer AND the splat renderer:

- `powered` state -> increase splat `intensity`, enable animation
- `damaged` state -> add noise to splat positions, shift hue
- `selected` state -> boost edge glow, increase inscription layers

```javascript
const channel = new InscriptionChannel({ layerCount: 4 });
channel.registerObject(1, 'active');

// Apply to edge inscription (hybrid's system)
channel.applyToLayer(edgeInscription, 1);

// Apply to splat post-processing (our system)
const cfg = channel.getInscriptionConfig(1);
postProcess.edgeIntensity = cfg.glowIntensity * 2.0;
postProcess.inscGeometry = cfg.layers[0].geometry;
postProcess.rot4dXW = cfg.rot4dXW;
```

### 5. TextureToSplatConverter with anisotropic output

**Impact: Medium. Effort: Medium.**

The hybrid branch's `TextureToSplatConverter` samples mesh triangles to create surface splats. Currently it outputs isotropic (uniform scale) splats. With the hi-fi buffer layout, it can output anisotropic splats aligned to the surface:

```javascript
// In TextureToSplatConverter.convert(), after computing position and normal:
const tangent = normalize(cross(normal, [0, 1, 0]));
const bitangent = cross(normal, tangent);

seeds.push({
    position: [pos[0] + nrm[0]*off, pos[1] + nrm[1]*off, pos[2] + nrm[2]*off],
    orientation: tangentFrameToQuaternion(tangent, bitangent, normal),
    scale3: [scale * 2.0, scale * 2.0, scale * 0.2], // flat on surface
    color: [dr, dg, db],
    opacity: da,
    depth: 0,
});
```

This produces surface-conforming splats that look like paint strokes rather than floating spheres.

---

## Recommended Merge Sequence

### Phase 1: Drop-in splat upgrade
1. Add `HiFiSplatRenderer` and `SplatSorter` to the hybrid branch
2. Add `encodeHiFiSeeds` for the 16-float buffer layout
3. Wire `HiFiSplatRenderer` into `HybridRenderPipeline` as the splat layer
4. Keep existing `TextureToSplatConverter` output (it falls back to uniform scale)

### Phase 2: Shared post-processing
1. Port `SplatPostProcess` edge detection into `EdgeInscriptionLayer`
2. When no GBuffer is available (splat-only scenes), fall back to luminance Sobel
3. Add tonemap controls to the hybrid compositor

### Phase 3: Anisotropic surface splats
1. Upgrade `TextureToSplatConverter` to output `scale3` + quaternion
2. Compute tangent frame per triangle for surface-aligned splats
3. Edge-aware density boost now creates anisotropic splats at texture edges

### Phase 4: Unified state system
1. `InscriptionChannel` drives both edge inscription and splat rendering
2. Audio reactivity maps to splat animation parameters
3. Semantic states affect both layers simultaneously

---

## What Each Branch Should Keep

**Hi-Fi branch keeps**:
- Production splat internals (instanced quads, covariance projection, radix sort, frustum culling)
- Hi-fi 16-float buffer layout with anisotropic scale
- Pixel-space Jacobian math (reference 3DGS-correct)

**Hybrid branch keeps**:
- Multi-layer compositor architecture (mesh + splat + procedural + inscription)
- GBuffer with MRT (the only way to get proper normal-based edge detection)
- EdgeInscriptionLayer (multi-layer VIB3 patterns on edges)
- InscriptionChannel semantic state system
- TextureToSplatConverter
- Audio reactivity mapping

**Shared new module**:
- `SplatPostProcess` (this branch's new addition) — demonstrates how splat output can feed into post-processing without requiring a full GBuffer. Useful for splat-only scenes.

---

## API Alignment Needed

The two branches have slightly different render() signatures:

```javascript
// Hybrid's GaussianSplatRenderer:
render(viewProjection, time)

// Hi-Fi's HiFiSplatRenderer:
render(viewMatrix, projMatrix, viewProjection, time)
```

The hi-fi renderer needs separate view and projection matrices for the Jacobian computation. The hybrid pipeline passes only `viewProjection`. Options:
1. Store view/proj separately in the camera and pass them through the pipeline
2. Decompose VP into V and P (lossy, not recommended)
3. Add a `setMatrices(view, proj)` method to HiFiSplatRenderer called before render()

Option 1 is cleanest — the hybrid pipeline's `render()` already receives `modelView` and `projection` separately. Just thread them through to the splat layer.

---

**VIB3+ CORE — Clear Seas Solutions LLC**
