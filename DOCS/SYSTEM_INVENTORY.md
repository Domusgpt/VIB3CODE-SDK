# VIB3+ SDK System Inventory

**Document Version:** 1.0.0
**Last Updated:** 2026-01-24
**Purpose:** Complete technical inventory for developers and AI agents

---

## Executive Summary

VIB3+ is a **general-purpose 4D rotation visualization SDK** designed for:
- Plugin marketplaces and browser extensions
- Wearable devices and XR platforms
- Agentic AI integration (MCP protocol)
- Cross-platform deployment (Web, Flutter, WASM)

The SDK provides 4 visualization systems with shared 6D rotation mathematics, unified rendering contracts, and comprehensive telemetry for monitoring and automation.

---

## Quick Reference Card

| Metric | Value |
|--------|-------|
| **Visualization Systems** | 4 (Quantum, Faceted, Holographic, Polychora) |
| **Rotation Planes** | 6 (XY, XZ, YZ for 3D; XW, YW, ZW for 4D) |
| **Base Geometries** | 8 per system |
| **Core Warp Types** | 3 (Base, Hypersphere, Hypertetrahedron) |
| **Total Geometries** | 24 per system (8 base × 3 cores) |
| **Canvas Layers** | 5 per system (background, shadow, content, highlight, accent) |
| **MCP Tools** | 12 agent-accessible tools |
| **Test Coverage** | 694+ tests passing |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      VIB3+ SDK Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   MCP Server │  │  Agent CLI   │  │  Telemetry   │           │
│  │   (12 tools) │  │   (JSONL)    │  │  (Prometheus)│           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    VIB3Engine                            │    │
│  │  - System switching (quantum/faceted/holographic/poly)   │    │
│  │  - Parameter management (ParameterManager)               │    │
│  │  - Canvas orchestration (CanvasManager)                  │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              RendererLifecycleManager                    │    │
│  │  - Renderer registration and activation                  │    │
│  │  - Context transitions                                   │    │
│  │  - Contract enforcement                                  │    │
│  └──────┬──────────┬──────────┬──────────┬─────────────────┘    │
│         ▼          ▼          ▼          ▼                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Quantum  │ │ Faceted  │ │Holograph │ │Polychora │            │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       ▼            ▼            ▼            ▼                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Quantum  │ │ Faceted  │ │  Holo    │ │Polychora │            │
│  │ Engine   │ │ System   │ │ System   │ │ System   │            │
│  │ (588 LOC)│ │(~400 LOC)│ │(652 LOC) │ │(1065 LOC)│            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       │            │            │            │                   │
│       └────────────┴────────────┴────────────┘                   │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              5-Layer Canvas System                       │    │
│  │  [background] [shadow] [content] [highlight] [accent]    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              WebGL / WebGPU Backend                      │    │
│  │  - Resource tracking (UnifiedResourceManager)            │    │
│  │  - Command buffers (RenderCommandBuffer)                 │    │
│  │  - Shader programs (ShaderProgram.js)                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The 4 Visualization Systems

### 1. Quantum Engine
**File:** `src/quantum/QuantumEngine.js` (588 LOC)
**Purpose:** Complex quantum lattice visualizations with 24 geometry variants

| Property | Value |
|----------|-------|
| Canvas IDs | `quantum-background-canvas`, `quantum-shadow-canvas`, `quantum-content-canvas`, `quantum-highlight-canvas`, `quantum-accent-canvas` |
| Geometries | 24 (8 base × 3 cores) |
| Audio Reactive | Yes |
| Physics | No |

**Core Features:**
- Uses `QuantumHolographicVisualizer` for rendering
- Full 6D rotation support in shader
- `warpHypersphereCore()` and `warpHypertetraCore()` for geometry variants

### 2. Faceted System
**File:** `src/faceted/FacetedSystem.js`
**Purpose:** Clean 2D geometric patterns with 4D rotation projection

| Property | Value |
|----------|-------|
| Canvas IDs | `background-canvas`, `shadow-canvas`, `content-canvas`, `highlight-canvas`, `accent-canvas` |
| Geometries | 24 (8 base × 3 cores) |
| Audio Reactive | Yes (via global) |
| Physics | No |

**Core Features:**
- Single WebGL context on `content-canvas`
- Geometry functions in fragment shader
- Core warp applied via `applyCoreWarp()` shader function

### 3. Holographic System
**File:** `src/holograms/RealHolographicSystem.js` (652 LOC)
**Purpose:** 5-layer audio-reactive holographic effects

| Property | Value |
|----------|-------|
| Canvas IDs | `holo-background-canvas`, `holo-shadow-canvas`, `holo-content-canvas`, `holo-highlight-canvas`, `holo-accent-canvas` |
| Variants | 30 named variants |
| Audio Reactive | Yes (native) |
| Physics | No |

**Core Features:**
- Each layer has its own `HolographicVisualizer` instance
- Native microphone input for audio reactivity
- Beat detection (bass), melody detection (mid/high)
- Per-layer reactivity multipliers

### 4. Polychora System
**File:** `src/core/PolychoraSystem.js` (1065 LOC)
**Purpose:** 4D polytope visualization with glassmorphic effects

| Property | Value |
|----------|-------|
| Canvas IDs | `polychora-background-canvas`, `polychora-shadow-canvas`, `polychora-content-canvas`, `polychora-highlight-canvas`, `polychora-accent-canvas` |
| Polytopes | 6 (5-Cell, Tesseract, 16-Cell, 24-Cell, 600-Cell, 120-Cell) |
| Audio Reactive | Yes |
| Physics | Yes (4D physics engine) |

**Core Features:**
- 4D polytope distance functions in shader
- Complete 6D rotation matrices
- Advanced glass effects (refraction, chromatic aberration)
- 4D physics simulation with `Polychora4DPhysics.js`

---

## The 24 Geometry System

### Encoding Formula
```
geometry_index = core_index * 8 + base_index

Where:
- core_index: 0 (Base), 1 (Hypersphere), 2 (Hypertetrahedron)
- base_index: 0-7 (one of 8 base geometries)
```

### Base Geometries (base_index 0-7)
| Index | Name | Description |
|-------|------|-------------|
| 0 | Tetrahedron | Simple 4-vertex lattice, fundamental polytope |
| 1 | Hypercube | 4D cube projection with 16 vertices, 32 edges |
| 2 | Sphere | Radial harmonic sphere with smooth surfaces |
| 3 | Torus | Toroidal field with continuous surface |
| 4 | Klein Bottle | Non-orientable surface with topological twist |
| 5 | Fractal | Recursive subdivision with self-similar structure |
| 6 | Wave | Sinusoidal interference patterns |
| 7 | Crystal | Octahedral crystal lattice structure |

### Core Warp Types (core_index 0-2)
| Index | Name | Effect |
|-------|------|--------|
| 0 | Base | Pure geometry, no warp applied |
| 1 | Hypersphere | Wraps base in 4D sphere using `warpHypersphereCore()` |
| 2 | Hypertetrahedron | Wraps base in 4D tetrahedron using `warpHypertetraCore()` |

### Full Geometry Table
| Index | Base | Core | Full Name |
|-------|------|------|-----------|
| 0-7 | 0-7 | Base | Tetrahedron, Hypercube, Sphere, Torus, Klein, Fractal, Wave, Crystal |
| 8-15 | 0-7 | Hypersphere | Hypersphere(Tetrahedron), Hypersphere(Hypercube), ... |
| 16-23 | 0-7 | Hypertetrahedron | Hypertetra(Tetrahedron), Hypertetra(Hypercube), ... |

---

## The 6D Rotation System

### Rotation Planes

| Plane | Axes | Type | Parameter |
|-------|------|------|-----------|
| XY | X ↔ Y | 3D Space | `rot4dXY` |
| XZ | X ↔ Z | 3D Space | `rot4dXZ` |
| YZ | Y ↔ Z | 3D Space | `rot4dYZ` |
| XW | X ↔ W | 4D Hyperspace | `rot4dXW` |
| YW | Y ↔ W | 4D Hyperspace | `rot4dYW` |
| ZW | Z ↔ W | 4D Hyperspace | `rot4dZW` |

### Application Order
Rotations are applied sequentially in shaders:
1. XY (3D)
2. XZ (3D)
3. YZ (3D)
4. XW (4D)
5. YW (4D)
6. ZW (4D)

### Parameter Range
All rotation parameters: `-6.28` to `6.28` (radians, ±2π)

---

## MCP Server & Agent Tools

### Available Tools (12 total)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_4d_visualization` | Create new visualization scene | `system`, `geometry_index`, `projection` |
| `set_rotation` | Set 6D rotation values | `XY`, `XZ`, `YZ`, `XW`, `YW`, `ZW` |
| `set_visual_parameters` | Set visual properties | Any parameter object |
| `switch_system` | Change visualization system | `system` |
| `change_geometry` | Change geometry type | `geometry_index` OR `base_type` + `core_type` |
| `get_state` | Get current engine state | (none) |
| `randomize_parameters` | Randomize all parameters | (none) |
| `reset_parameters` | Reset to defaults | (none) |
| `save_to_gallery` | Save to gallery slot | `slot`, `name` |
| `load_from_gallery` | Load from gallery slot | `slot` |
| `search_geometries` | Search available geometries | `core_type` |
| `get_parameter_schema` | Get parameter validation schema | (none) |

### Tool Response Format
```json
{
  "success": true,
  "operation": "tool_name",
  "timestamp": "2026-01-24T12:00:00.000Z",
  "duration_ms": 5.2,
  "suggested_next_actions": ["next_tool_1", "next_tool_2"],
  ...tool_specific_data
}
```

---

## Agent CLI Commands

### Command Types
| Command | Description |
|---------|-------------|
| `ping` | Health check |
| `status` | Get engine status |
| `help` | List available commands |
| `quit` / `exit` | Stop CLI |
| `set <param> <value>` | Set parameter value |
| `get <param>` | Get parameter value |
| `rotate <plane> <angle>` | Rotate on plane |
| `geometry <index>` | Set geometry (0-23) |
| `system <name>` | Switch system |
| `metrics` | Get telemetry metrics |

### Input/Output Formats
- **JSONL** (default): One JSON object per line
- **JSON**: Pretty-printed JSON
- **Text**: Human-readable text

---

## Renderer Contracts

### RendererContract Interface
```javascript
class RendererContract {
  init(context)                    // Initialize with WebGL/WebGPU context
  resize(width, height, pixelRatio) // Handle viewport changes
  render(frameState)               // Main render loop
  setActive(active)                // Activate/deactivate renderer
  dispose()                        // Clean up GPU resources
}
```

### ResourceManagerContract Interface
```javascript
class ResourceManagerContract {
  registerResource(type, id, resource, bytes) // Track GPU resource
  releaseResource(type, id)                   // Free GPU resource
  disposeAll()                                // Clean all resources
  getStats()                                  // Memory usage telemetry
}
```

---

## File Structure Summary

```
/home/user/Vib3-CORE-Documented01-/
├── src/                          # Core SDK (56,922 LOC)
│   ├── core/                     # Engine orchestration
│   │   ├── VIB3Engine.js         # Main unified engine
│   │   ├── RendererContracts.js  # Shared interfaces
│   │   └── renderers/            # System adapters
│   ├── quantum/                  # Quantum visualization
│   ├── faceted/                  # Faceted visualization
│   ├── holograms/                # Holographic visualization
│   ├── geometry/                 # 24-geometry system
│   ├── math/                     # 4D math utilities
│   ├── render/                   # Rendering pipeline
│   ├── scene/                    # Scene graph
│   ├── agent/                    # MCP/CLI/Telemetry
│   ├── export/                   # Export generators
│   └── wasm/                     # WASM loader
├── cpp/                          # C++ math core (1,783 LOC)
├── js/                           # Client-side integration
├── tests/                        # Test suite (60 files)
├── DOCS/                         # Documentation
└── types/                        # TypeScript definitions
```

---

## Agent Onboarding Quiz

Before proceeding with development tasks, verify understanding by answering these questions:

### Required Knowledge Check

**Q1: How many rotation planes does the system support?**
Expected: 6 (XY, XZ, YZ for 3D; XW, YW, ZW for 4D)

**Q2: What is the geometry encoding formula?**
Expected: `geometry = coreIndex * 8 + baseIndex`

**Q3: How many canvas layers does each visualization system use?**
Expected: 5 (background, shadow, content, highlight, accent)

**Q4: What are the 4 visualization systems?**
Expected: Quantum, Faceted, Holographic, Polychora

**Q5: What are the 3 core warp types?**
Expected: Base (0), Hypersphere (1), Hypertetrahedron (2)

**Q6: What are the 8 base geometry types?**
Expected: Tetrahedron, Hypercube, Sphere, Torus, Klein Bottle, Fractal, Wave, Crystal

**Q7: Which system has 4D physics support?**
Expected: Polychora

**Q8: What MCP tool changes the geometry?**
Expected: `change_geometry`

### If answers are incomplete:
- Review this document
- Check `DOCS/CONTROL_REFERENCE.md` for parameter details
- Read `src/agent/mcp/tools.js` for MCP tool definitions

---

## Current Development Status

### Phase Status (as of Session 014)
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation | ✅ Complete | Math, geometry, parameters |
| Phase 2: Rendering | ✅ Mostly Complete | Contracts exist, adapters implemented |
| Phase 3: Agentic | ✅ Complete | MCP, CLI, Telemetry working |
| Phase 4: WebGPU | 🔄 In Progress | Scaffold exists, needs shader pipeline |
| Phase 5: Hardening | 🔄 In Progress | 694 tests passing |

### Known Gaps
1. WebGPU backend needs full shader pipeline
2. Some systems don't fully implement RendererContract
3. Documentation could use consolidation
4. Need agent context absorption verification

---

## Cross-Platform Support

| Platform | Status | Implementation |
|----------|--------|----------------|
| Web (Browser) | ✅ Production | index.html + JS modules |
| WASM | ✅ Working | cpp/ → Emscripten → vib3.wasm |
| Flutter | 🔄 Scaffold | src/platforms/flutter/ |
| Node.js CLI | ✅ Working | src/agent/cli/ |

---

## Next Steps for Development

### Immediate Priorities
1. Verify all 4 systems pass RendererContract compliance
2. Complete WebGPU shader pipeline
3. Add agent onboarding quiz to MCP initial response
4. Consolidate documentation into single source of truth

### Phase 2 Consolidation Tasks
- [ ] Audit RendererContract compliance for all 4 systems
- [ ] Extract remaining shared code to contracts
- [ ] Document lifecycle rules in code comments
- [ ] Add contract compliance tests

---

## Document References

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Development instructions |
| `DEV_TRACK.md` | Session-by-session progress |
| `DOCS/CLI_ONBOARDING.md` | Agent CLI setup |
| `DOCS/CONTROL_REFERENCE.md` | UI control parameters |
| `DOCS/RENDERER_LIFECYCLE.md` | Renderer architecture |
| `DOCS/GPU_DISPOSAL_GUIDE.md` | Memory management |
| `24-GEOMETRY-6D-ROTATION-SUMMARY.md` | Geometry encoding |

---

*This document is the canonical system inventory. Update after significant changes.*
