# CLAUDE.md - VIB3+ CORE Technical Reference

**VIB3+ Unified 4D Visualization Engine**

---

## Overview

VIB3+ is a **4D visualization engine** with three rendering systems (Quantum, Faceted, Holographic), each supporting **24 geometry variants** through a unified **6D rotation system**. The architecture combines:

- **C++ WASM Core** - Mathematically rigorous 4D geometric algebra
- **WebGL/WebGPU Shaders** - GPU-accelerated rendering
- **MCP Protocol** - Agentic/programmatic control

**Active Systems**: Quantum, Faceted, Holographic
**Polychora**: TBD placeholder (not production ready)

---

## Shader System Architecture

### Layer Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                            │
│  index.html → VIB3Engine.js → System Visualizers               │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                    SHADER ABSTRACTION                           │
│  ShaderProgram.js (uniforms, attributes, caching)              │
└───────────────────────────┬────────────────────────────────────┘
                            │
           ┌────────────────┴────────────────┐
           │                                 │
┌──────────▼──────────┐          ┌───────────▼───────────┐
│    WebGL Backend    │          │    WebGPU Backend     │
│    (GLSL shaders)   │          │    (WGSL shaders)     │
└──────────┬──────────┘          └───────────┬───────────┘
           │                                 │
           └────────────────┬────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                    C++ WASM CORE                                │
│  Rotor4D (Clifford algebra) | Mat4x4 | Vec4 | Projections      │
└────────────────────────────────────────────────────────────────┘
```

---

## C++ WASM Core (`cpp/`)

The mathematical foundation using Clifford algebra Cl(4,0).

### Key Files

| File | Purpose |
|------|---------|
| `vib3_ffi.h/cpp` | C Foreign Function Interface |
| `Rotor4D.hpp/cpp` | 4D rotation via geometric algebra |
| `Mat4x4.hpp/cpp` | Traditional 4x4 matrix operations |
| `embind.cpp` | JavaScript bindings via Emscripten |

### Core Types

```cpp
// 4-component vector
struct Vib3Vec4 { float x, y, z, w; };

// 8-component rotor (scalar + 6 bivectors + pseudoscalar)
struct Vib3Rotor4D {
    float s;                    // Scalar
    float xy, xz, yz;           // 3D rotation bivectors
    float xw, yw, zw;           // 4D rotation bivectors
    float xyzw;                 // Pseudoscalar (4D volume)
};

// Column-major 4x4 matrix
struct Vib3Mat4x4 { float m[16]; };
```

### Rotor Rotation (Sandwich Product)

```cpp
// Proper 4D rotation: v' = R * v * R†
Vib3Vec4 vib3_rotor4d_rotate(Vib3Rotor4D r, Vib3Vec4 v);

// Create rotor from 6 plane angles
Vib3Rotor4D vib3_rotor4d_from_euler6(
    float xy, float xz, float yz,  // 3D rotations
    float xw, float yw, float zw   // 4D rotations
);
```

### Projection Functions

```cpp
// 4D → 3D projections
Vib3Vec4 vib3_project_perspective(Vib3Vec4 v, float distance);
// P = v.xyz / (distance - v.w)

Vib3Vec4 vib3_project_stereographic(Vib3Vec4 v);
// P = v.xyz / (1 - v.w)  [conformal]

Vib3Vec4 vib3_project_orthographic(Vib3Vec4 v);
// P = v.xyz  [parallel, drops W]
```

### Using WASM from JavaScript

```javascript
// After WASM loads, available on window.Vib3Core
const rotor = Vib3Core.vib3_rotor4d_from_euler6(
    0.5, 0.3, 0.2,  // XY, XZ, YZ
    0.1, 0.4, 0.6   // XW, YW, ZW
);
const rotated = Vib3Core.vib3_rotor4d_rotate(rotor, { x: 1, y: 0, z: 0, w: 0 });
```

---

## WebGL Shaders (Primary Renderer)

### Shader Locations

| System | File | Shader Type |
|--------|------|-------------|
| Quantum | `src/quantum/QuantumVisualizer.js` | Fragment (procedural) |
| Faceted | `src/faceted/FacetedSystem.js` | Fragment (procedural) |
| Holographic | `src/holograms/HolographicVisualizer.js` | Fragment (5-layer) |

### Standard Uniforms (All Systems)

```glsl
// Time & Resolution
uniform float u_time;
uniform vec2 u_resolution;

// Geometry Selection (0-23)
uniform float u_geometry;

// 6D Rotation (radians, 0 to 2π)
uniform float u_rot4dXY;  // 3D: rotation around Z axis
uniform float u_rot4dXZ;  // 3D: rotation around Y axis
uniform float u_rot4dYZ;  // 3D: rotation around X axis
uniform float u_rot4dXW;  // 4D: XW plane
uniform float u_rot4dYW;  // 4D: YW plane
uniform float u_rot4dZW;  // 4D: ZW plane

// Visual Parameters
uniform float u_gridDensity;   // 4-100
uniform float u_morphFactor;   // 0-2
uniform float u_chaos;         // 0-1
uniform float u_speed;         // 0.1-3
uniform float u_hue;           // 0-360
uniform float u_intensity;     // 0-1
uniform float u_saturation;    // 0-1
uniform float u_dimension;     // 3.0-4.5 (projection distance)

// Reactivity
uniform float u_mouseIntensity;
uniform float u_clickIntensity;
uniform float u_bass, u_mid, u_high;  // Audio
```

### 6D Rotation in GLSL

```glsl
// Individual rotation matrices
mat4 rotateXY(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat4(
        c, -s, 0, 0,
        s,  c, 0, 0,
        0,  0, 1, 0,
        0,  0, 0, 1
    );
}
// Similar for XZ, YZ, XW, YW, ZW...

// Combined 6D rotation (order matters!)
mat4 rotate4D(float xy, float xz, float yz, float xw, float yw, float zw) {
    return rotateXY(xy) * rotateXZ(xz) * rotateYZ(yz) *
           rotateXW(xw) * rotateYW(yw) * rotateZW(zw);
}

// Usage in fragment shader
vec4 p = vec4(uv * 2.0 - 1.0, 0.0, 0.0);
vec4 rotated = rotate4D(u_rot4dXY, u_rot4dXZ, u_rot4dYZ,
                        u_rot4dXW, u_rot4dYW, u_rot4dZW) * p;
vec3 projected = rotated.xyz / (u_dimension - rotated.w);
```

### 4D Projection in Shaders

```glsl
// Perspective (most common)
float projFactor = 1.0 / (u_dimension - position.w);
vec3 projected = position.xyz * projFactor;

// Stereographic (conformal, preserves angles)
vec3 projected = position.xyz / (1.0 - position.w);

// Orthographic (parallel projection)
vec3 projected = position.xyz;
```

---

## WebGPU Backend (`src/render/backends/WebGPUBackend.js`)

Modern GPU API with WGSL shaders.

### WGSL Uniforms Structure

```wgsl
struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    time: f32,
    dimension: f32,
    _padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
```

### Pipeline Setup

```javascript
// WebGPU initialization
const device = await adapter.requestDevice();
const pipeline = device.createRenderPipeline({
    vertex: { module: vertexShader, entryPoint: 'main' },
    fragment: { module: fragmentShader, entryPoint: 'main' },
    primitive: { topology: 'triangle-list' }
});
```

---

## Visualization Systems

### 1. Quantum System (`src/quantum/`)

**Purpose**: Complex lattice visualizations with quantum-inspired patterns

**Key Files**:
- `QuantumEngine.js` - System manager
- `QuantumVisualizer.js` - WebGL renderer

**Characteristics**:
- Procedural fragment shader
- 24 geometry variants
- Full 6D rotation support
- Audio reactivity (bass/mid/high → parameters)

### 2. Faceted System (`src/faceted/`)

**Purpose**: Clean 2D geometric patterns with 4D rotation projection

**Key Files**:
- `FacetedSystem.js` - Complete system with shader

**Characteristics**:
- Precise geometric patterns
- 24 geometry variants
- Clean visual aesthetic
- Mouse/touch interaction

### 3. Holographic System (`src/holograms/`)

**Purpose**: 5-layer glassmorphic audio-reactive effects

**Key Files**:
- `RealHolographicSystem.js` - System manager
- `HolographicVisualizer.js` - Per-layer renderer

**Layer Architecture**:
```
background-canvas  ← Base layer, lowest opacity
shadow-canvas      ← Depth/shadow effects
content-canvas     ← Primary visual content
highlight-canvas   ← Bright accents
accent-canvas      ← Top layer effects
```

**Layer-Specific Uniforms**:
```glsl
uniform float u_layerScale;
uniform float u_layerOpacity;
uniform vec3 u_layerColor;
uniform float u_densityMult;
uniform float u_speedMult;
```

---

## 24 Geometry System

### Encoding Formula

```
geometry_index = core_type * 8 + base_geometry

Where:
  core_type: 0=Base, 1=Hypersphere, 2=Hypertetrahedron
  base_geometry: 0-7
```

### Base Geometries (0-7)

| Index | Name | Description |
|-------|------|-------------|
| 0 | Tetrahedron | 4-vertex simplex lattice |
| 1 | Hypercube | 4D cube projection (tesseract) |
| 2 | Sphere | Radial harmonic sphere |
| 3 | Torus | Toroidal field structure |
| 4 | Klein Bottle | Non-orientable surface |
| 5 | Fractal | Recursive subdivision |
| 6 | Wave | Sinusoidal interference |
| 7 | Crystal | Octahedral structure |

### Core Type Warps

| Core | Index Range | Warp Function |
|------|-------------|---------------|
| Base | 0-7 | None (pure geometry) |
| Hypersphere | 8-15 | `warpHypersphereCore()` |
| Hypertetrahedron | 16-23 | `warpHypertetraCore()` |

### Warp Functions (`src/geometry/`)

**HypersphereCore.js**:
```javascript
// Project onto 3-sphere (S³)
projectToHypersphere(point4D, radius)

// Inverse stereographic projection
stereographicToHypersphere(point3D)

// Creates toroidal structures
hopfFibration(point4D)
```

**HypertetraCore.js**:
```javascript
// 5 vertices of regular 5-cell (pentatope)
getPentatopeVertices()

// Map points based on proximity to pentatope
warpTetrahedral(point4D)

// Project onto pentatope edges
warpToEdges(point4D)
```

---

## 6D Rotation System

### Rotation Planes

| Plane | Type | Effect |
|-------|------|--------|
| XY | 3D | Rotation around Z axis |
| XZ | 3D | Rotation around Y axis |
| YZ | 3D | Rotation around X axis |
| XW | 4D | Hyperspace rotation |
| YW | 4D | Hyperspace rotation |
| ZW | 4D | Hyperspace rotation |

### Application Order (Critical)

```
Combined = Rxy × Rxz × Ryz × Rxw × Ryw × Rzw
```

### Three Implementations

1. **WASM Rotor** (C++): Clifford algebra, mathematically exact
2. **GLSL Matrices** (WebGL): GPU-accelerated, per-pixel
3. **WGSL Matrices** (WebGPU): Modern GPU path

---

## MCP Agentic Control (`sdk/src/agent/mcp/`)

### Available Tools

```javascript
// System control
set_parameter(name, value)      // Set any parameter
get_parameter(name)             // Get current value
set_system(system)              // Switch visualization system
randomize_all()                 // Randomize all parameters

// Gallery
save_to_gallery(name)           // Save current state
load_from_gallery(id)           // Load saved state

// Export
export_trading_card()           // Generate trading card
export_package()                // Full VIB3Package export
```

### Programmatic Usage

```javascript
// Via MCP protocol
const result = await mcpClient.callTool('set_parameter', {
    name: 'geometry',
    value: 16  // Hypertetrahedron + Tetrahedron
});
```

---

## Project Structure

```
Vib3-CORE-Documented01-/
├── cpp/                          # C++ WASM core
│   ├── vib3_ffi.cpp/h           # FFI interface
│   ├── Rotor4D.cpp/hpp          # 4D rotation math
│   ├── Mat4x4.cpp/hpp           # Matrix operations
│   └── embind.cpp               # JS bindings
│
├── src/
│   ├── core/                    # Engine core
│   │   ├── Engine.js            # Main VIB34D engine
│   │   ├── CanvasManager.js     # Canvas lifecycle
│   │   ├── UnifiedReactivityManager.js
│   │   └── ParameterMapper.js
│   │
│   ├── quantum/                 # Quantum system
│   │   ├── QuantumEngine.js
│   │   └── QuantumVisualizer.js
│   │
│   ├── faceted/                 # Faceted system
│   │   └── FacetedSystem.js
│   │
│   ├── holograms/               # Holographic system
│   │   ├── RealHolographicSystem.js
│   │   └── HolographicVisualizer.js
│   │
│   ├── geometry/                # Geometry library
│   │   ├── GeometryLibrary.js
│   │   ├── HypersphereCore.js
│   │   └── HypertetraCore.js
│   │
│   ├── render/                  # Render backends
│   │   ├── ShaderProgram.js
│   │   └── backends/
│   │       ├── WebGLBackend.js
│   │       └── WebGPUBackend.js
│   │
│   ├── reactivity/              # Reactivity config
│   │   ├── ReactivityConfig.js
│   │   └── ReactivityManager.js
│   │
│   └── export/                  # Export system
│       ├── VIB3PackageExporter.js
│       └── TradingCardGenerator.js
│
├── sdk/src/agent/mcp/           # MCP agentic interface
│   └── MCPServer.js
│
├── js/                          # UI layer
│   ├── core/app.js
│   ├── controls/
│   └── gallery/
│
├── tests/                       # Playwright tests
│   ├── sdk-browser.spec.js
│   └── e2e/
│
└── index.html                   # Main entry point
```

---

## Quick Reference

### Run Development Server
```bash
npm install
npm run dev
```

### Run Tests
```bash
npm test              # All tests
npm run test:e2e      # E2E browser tests
```

### Build WASM Core
```bash
cd cpp && ./build.sh
```

### Parameter Ranges

| Parameter | Range | Description |
|-----------|-------|-------------|
| geometry | 0-23 | Geometry variant |
| rot4dXY/XZ/YZ | 0-2π | 3D rotation |
| rot4dXW/YW/ZW | 0-2π | 4D rotation |
| gridDensity | 4-100 | Pattern density |
| morphFactor | 0-2 | Shape interpolation |
| chaos | 0-1 | Randomness |
| speed | 0.1-3 | Animation speed |
| hue | 0-360 | Color hue |
| intensity | 0-1 | Brightness |
| dimension | 3.0-4.5 | Projection distance |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1 | Switch to Faceted |
| 2 | Switch to Quantum |
| 3 | Switch to Holographic |
| A | Toggle audio |
| T | Toggle device tilt |
| I | Toggle interactivity |
| F | Toggle fullscreen |
| Ctrl+S | Save to gallery |
| Ctrl+G | Open gallery |
| Alt+1/2/3 | Core type (Base/Hypersphere/Hypertetra) |

---

## Important Notes

1. **Polychora is TBD** - Not production ready, disabled in UI
2. **Three active systems only** - Quantum, Faceted, Holographic
3. **6D rotation order matters** - Always XY→XZ→YZ→XW→YW→ZW
4. **WASM optional** - Falls back to JS math if unavailable
5. **WebGPU optional** - Falls back to WebGL

---

**VIB3+ CORE - Clear Seas Solutions LLC**
