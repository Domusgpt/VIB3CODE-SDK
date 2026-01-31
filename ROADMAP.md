# VIB3+ Development Roadmap

Three development tracks running in parallel, ordered by impact and dependency.

---

## Track 1 — Pipeline Hardening

Stabilize what exists, close gaps in the current v2 implementation, make it production-deployable.

### 1.1 glTF / OBJ Model Import

**Current state:** MeshRenderer accepts raw `{positions, normals, uvs, indices}`. Users must generate geometry procedurally or write their own loader.

**Target:** Drop a `.glb` file and get automatic VIB3 treatment — GBuffer, inscription, splat halo.

**Work:**
- Write a `ModelLoader` class wrapping the glTF 2.0 binary parser (accessor/buffer/mesh extraction)
- Map glTF PBR materials (baseColorTexture, metallicRoughnessTexture, normalTexture, occlusionTexture, emissiveTexture) through PBRSplatConverter
- Support multi-mesh glTF scenes → SceneRenderer with per-mesh inscription routing
- OBJ/MTL as secondary format (simpler parser, widely available test assets)
- Draco/meshopt decompression for compressed glTF (optional, behind dynamic import)

**Output:** `const scene = await ModelLoader.load(gl, 'model.glb')` returns a populated SceneRenderer.

### 1.2 Skeletal Animation

**Current state:** MeshRenderer supports morph targets (two-pose GPU blending). No bone/joint system.

**Target:** Animated characters with VIB3 inscription that responds to joint movement.

**Work:**
- Joint hierarchy parser from glTF skin data
- Bone matrix palette uploaded as texture (avoids uniform count limits)
- Vertex shader: `skinned = sum(weight[i] * boneMatrix[joint[i]] * position)` for up to 4 influences
- Morph targets + skeletal can coexist (morph applied before skinning)
- InscriptionChannel gets `animation_state` input — joint velocity drives edge intensity

### 1.3 Shadow Map Integration

**Current state:** MeshRenderer does single-directional Blinn-Phong with no shadows.

**Target:** Shadow mapping that the inscription layer can also read — shadowed edges get different treatment than lit edges.

**Work:**
- Depth-only shadow pass from light's perspective
- PCF or VSM filtering for soft shadows
- Shadow factor written to a 4th MRT channel or packed into existing GBuffer
- EdgeInscriptionLayer reads shadow factor: shadowed edges → cooler/dimmer inscription, lit edges → warmer/brighter

### 1.4 Frustum Culling + LOD

**Current state:** SceneRenderer renders all objects every frame. No spatial culling.

**Target:** Scenes with 50+ objects at interactive frame rates.

**Work:**
- AABB frustum test (6-plane extraction from VP matrix) — already have AABB on SceneObject, just need the test
- 2-level LOD: full mesh when close, simplified when far (vertex count reduction via edge collapse)
- Inscription layer count scales with LOD — distant objects get 1-2 layers, close objects get full 4-16

---

## Track 2 — Visual Experience

New rendering features that expand what the pipeline can produce.

### 2.1 Inscription Texturing

**Current state:** Inscription patterns are purely procedural (24 geometry variants via math).

**Target:** User-supplied textures as inscription source — logos, text, circuit patterns, artistic masks.

**Work:**
- Add `u_inscriptionTexture` sampler to the inscription fragment shader
- Pattern evaluation: `mix(proceduralPattern, texture2D(inscTex, uv).r, u_textureBlend)`
- UV mapping options: screen-space, object-space (from GBuffer), or cylindrical/spherical projection
- Per-layer texture override — layer 0 procedural, layer 1 logo, layer 2 circuit, etc.

### 2.2 Volumetric Inscription

**Current state:** Inscription only appears on detected edges (2D screen-space).

**Target:** Inscription that fills the interior of objects as a volumetric effect — visible when objects are transparent or sliced.

**Work:**
- Raymarched inscription pass: cast rays from camera through object bounding volume
- Sample procedural pattern at 3D points along the ray (using the same 4D rotation system)
- Accumulate color/opacity along ray (emission-absorption model)
- Composited between mesh and inscription layers
- Performance: limit ray steps (16-32), early termination on opacity saturation

### 2.3 Screen-Space Reflections (SSR)

**Current state:** No reflections. Metallic surfaces are flat.

**Target:** GBuffer-based SSR that reflects inscription — the holographic edges visible in reflective surfaces.

**Work:**
- Hi-Z depth buffer from GBuffer normal/depth
- Ray march in screen space using depth buffer
- Reflect the full compositor output (including inscription) — not just the mesh color
- Roughness from PBR → cone angle for glossy vs. blurry reflections
- Fallback: environment map cube for misses

### 2.4 Particle System Integration

**Current state:** Gaussian splats are static (or procedurally generated). No dynamic particle emission.

**Target:** Splats as particles — emit from mesh surfaces, react to state changes, form trails.

**Work:**
- `ParticleEmitter` class: spawn position/velocity/lifetime from mesh surface or scene points
- Update loop: GPU transform feedback or compute shader for position integration
- Death → respawn cycle with configurable lifetime distribution
- InscriptionChannel state triggers: `powered` → particle burst, `damaged` → debris scatter, `destroyed` → dissolution
- Trails: keep last N positions per particle as splat chain

### 2.5 Deferred Inscription Lighting

**Current state:** Inscription is flat color + glow. No surface-aware lighting.

**Target:** Inscription that catches light — brightens facing the light source, dims in shadow.

**Work:**
- Read light direction + GBuffer normal at inscription pixels
- Apply `NdotL * inscriptionColor` for diffuse lighting on inscription
- Specular highlight on inscription edges (thin specular from edge tangent)
- This makes inscription feel physically attached to the surface rather than painted on top

---

## Track 3 — Platform and Integration

Expanding where and how the pipeline can be used.

### 3.1 React/Three.js Integration Layer

**Target:** `<VIB3HybridPipeline>` React component wrapping the pipeline for web app integration.

**Work:**
- `@vib3/react` package with `useHybridPipeline` hook
- Props for mesh source, splat data, inscription config, audio input
- Three.js interop: accept `THREE.BufferGeometry` as mesh input, share WebGL context
- R3F (React Three Fiber) custom renderer that composites VIB3 inscription onto three.js scenes

### 3.2 Video/Stream Export

**Target:** Record the pipeline output as MP4/WebM video for sharing.

**Work:**
- `MediaRecorder` API on the canvas with configurable bitrate/codec
- Frame-accurate recording mode: render at fixed timestep regardless of wall clock
- GIF export for short loops (inscription animations)
- Sequence export: numbered PNGs for post-production compositing

### 3.3 glTF Extension Export

**Target:** Export a VIB3-inscribed scene as a glTF with custom extension.

**Work:**
- Define `VIB3_inscription` glTF extension schema
- Serialize: mesh geometry + inscription layer configs + semantic states + audio mapping
- The extension describes *how* to render inscription, not the inscription pixels
- Any viewer with the extension can reproduce the effect; standard viewers see just the mesh

### 3.4 MCP Tool Expansion

**Current state:** 14 MCP tools for engine control. No pipeline-specific tools.

**Target:** AI agents can compose scenes, set inscription states, and trigger animations via MCP.

**Work:**
- `set_inscription_state(objectId, state)` — change semantic state
- `add_scene_object(name, modelUrl)` — load and add model to scene
- `set_audio_reactive(band, target, intensity)` — configure audio mapping
- `capture_frame(format)` — export current frame as PNG/SVG
- `set_morph_weight(objectId, weight)` — animate morph targets
- `configure_inscription_layers(objectId, layers[])` — per-object inscription config

### 3.5 WebXR / Immersive Mode

**Target:** The hybrid pipeline rendering in VR/AR headsets.

**Work:**
- WebXR session setup with `immersive-vr` or `immersive-ar`
- Stereo rendering: two viewports into the same GBuffer (or two GBuffers)
- Inscription in VR: depth-correct overlay visible from both eyes
- Hand tracking → inscription state: pointed-at objects → `selected`, grabbed → `active`
- AR pass-through: inscription overlaid on real-world objects via depth estimation

---

## Sequencing

**Near term** (Track 1): 1.1 glTF Import → 1.4 Frustum Culling → 1.2 Skeletal Animation → 1.3 Shadows

**Medium term** (Track 2): 2.1 Inscription Texturing → 2.5 Inscription Lighting → 2.4 Particles → 2.2 Volumetric → 2.3 SSR

**Parallel** (Track 3): 3.1 React wrapper and 3.4 MCP tools can start anytime. 3.2 Video export is standalone. 3.3 and 3.5 depend on Track 1 maturity.

---

## What Not To Build

- **Polychora system** — Currently 3.8K lines of dead code. Remove or archive rather than invest further. The 24-geometry system with 3 warp types already covers the 4D polytope visualization space effectively.
- **Custom physics engine** — Integrate with existing solutions (Rapier, cannon-es) rather than building from scratch. Physics only needs to feed transforms into SceneRenderer.
- **Full PBR renderer** — The pipeline's value is in the inscription/splat/procedural compositing, not in competing with three.js or Babylon on PBR fidelity. Keep mesh rendering utilitarian and lean.
- **Node.js server-side rendering** — The pipeline is fundamentally GPU-bound. Headless rendering via Puppeteer/Playwright for CI screenshots is sufficient; don't build a custom headless GL path.

---

**VIB3+ CORE — Clear Seas Solutions LLC**
