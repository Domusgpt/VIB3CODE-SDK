# VIB3+ SDK

**General-purpose 4D rotation visualization SDK** for plugins, extensions, wearables, and agentic AI integration.

[![Tests](https://img.shields.io/badge/tests-693%2B%20passing-brightgreen)](#testing)
[![Version](https://img.shields.io/badge/version-1.9.0-blue)](#)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

---

## Quick Reference

| Metric | Value |
|--------|-------|
| **Active Systems** | 3 (Quantum, Faceted, Holographic) |
| **Rotation Planes** | 6 (XY, XZ, YZ + XW, YW, ZW) |
| **Geometries** | 24 per system (8 base × 3 cores) |
| **Canvas Layers** | 5 per system |
| **MCP Tools** | 14 agent-accessible tools |

---

## Features

- **3 Active Visualization Systems:** Quantum lattices, Faceted patterns, Holographic effects
- **24 Geometry Variants:** 8 base shapes × 3 core warp types (Base, Hypersphere, Hypertetrahedron)
- **6D Rotation:** Full control over 3D planes (XY/XZ/YZ) and 4D hyperspace planes (XW/YW/ZW)
- **Audio Reactivity:** Real-time visualization response to audio input
- **Agentic Integration:** MCP server with 14 tools for AI agent control
- **Cross-Platform:** Web, WASM, Flutter support

---

## Installation

```bash
# Install dependencies
npm install

# Start dev server
npm run dev:web

# Build for production
npm run build:web

# Run tests
npm test
```

**Requirements:** Node.js 18.19+

---

## Visualization Systems

### Active Systems

| System | Description | Geometries |
|--------|-------------|------------|
| **Quantum** | Complex lattice visualizations with quantum-inspired patterns | 24 |
| **Faceted** | Clean 2D geometric patterns with 4D rotation projection | 24 |
| **Holographic** | 5-layer audio-reactive holographic effects | 24 |

### Placeholder (TBD)

| System | Status | Description |
|--------|--------|-------------|
| **Polychora** | TBD | 4D polytopes - not production ready |

---

## Geometry Encoding

```
geometry_index = core_index * 8 + base_index
```

### Base Geometries (0-7)
| Index | Name | Description |
|-------|------|-------------|
| 0 | Tetrahedron | 4-vertex lattice |
| 1 | Hypercube | 4D cube (16 vertices, 32 edges) |
| 2 | Sphere | Radial harmonic sphere |
| 3 | Torus | Toroidal field |
| 4 | Klein Bottle | Non-orientable surface |
| 5 | Fractal | Recursive subdivision |
| 6 | Wave | Sinusoidal interference |
| 7 | Crystal | Octahedral structure |

### Core Warp Types
| Index | Name | Geometry Range | Effect |
|-------|------|----------------|--------|
| 0 | Base | 0-7 | No warp |
| 1 | Hypersphere | 8-15 | 4D sphere wrap |
| 2 | Hypertetrahedron | 16-23 | 4D tetrahedron wrap |

---

## 6D Rotation System

| Plane | Type | Parameter | Range |
|-------|------|-----------|-------|
| XY | 3D Space | `rot4dXY` | -6.28 to 6.28 |
| XZ | 3D Space | `rot4dXZ` | -6.28 to 6.28 |
| YZ | 3D Space | `rot4dYZ` | -6.28 to 6.28 |
| XW | 4D Hyperspace | `rot4dXW` | -6.28 to 6.28 |
| YW | 4D Hyperspace | `rot4dYW` | -6.28 to 6.28 |
| ZW | 4D Hyperspace | `rot4dZW` | -6.28 to 6.28 |

---

## API Reference

### JavaScript API

```javascript
import { VIB3Engine } from '@vib3/sdk/core';

// Initialize engine
const engine = new VIB3Engine();
await engine.initialize();

// Switch visualization system
await engine.switchSystem('quantum'); // 'quantum' | 'faceted' | 'holographic'

// Set geometry (0-23)
engine.setParameter('geometry', 10); // hypersphere + sphere

// Set 6D rotation
engine.setParameter('rot4dXW', 1.57);
engine.setParameter('rot4dYW', 0.5);

// Set visual parameters
engine.setParameter('hue', 200);
engine.setParameter('speed', 1.5);
engine.setParameter('chaos', 0.3);

// Get all parameters
const params = engine.getAllParameters();

// Randomize
engine.randomizeAll();

// Reset to defaults
engine.resetAll();
```

### Parameter Reference

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `geometry` | 0-23 | 0 | Geometry index (coreIndex * 8 + baseIndex) |
| `rot4dXY` | -6.28 to 6.28 | 0 | XY plane rotation (radians) |
| `rot4dXZ` | -6.28 to 6.28 | 0 | XZ plane rotation |
| `rot4dYZ` | -6.28 to 6.28 | 0 | YZ plane rotation |
| `rot4dXW` | -6.28 to 6.28 | 0 | XW hyperplane rotation |
| `rot4dYW` | -6.28 to 6.28 | 0 | YW hyperplane rotation |
| `rot4dZW` | -6.28 to 6.28 | 0 | ZW hyperplane rotation |
| `gridDensity` | 5-100 | 15 | Grid resolution |
| `morphFactor` | 0-2 | 1.0 | Shape morph blend |
| `chaos` | 0-1 | 0.2 | Noise/turbulence |
| `speed` | 0.1-3 | 1.0 | Animation speed |
| `hue` | 0-360 | 200 | Color hue (degrees) |
| `saturation` | 0-1 | 0.8 | Color saturation |
| `intensity` | 0-1 | 0.5 | Brightness |

---

## MCP Server API (Agentic Integration)

The SDK includes an MCP (Model Context Protocol) server for AI agent integration.

### Tools

| Tool | Description |
|------|-------------|
| `get_sdk_context` | Get SDK overview and onboarding quiz |
| `verify_knowledge` | Multiple choice quiz to verify understanding |
| `create_4d_visualization` | Create new visualization scene |
| `set_rotation` | Set 6D rotation values |
| `set_visual_parameters` | Adjust visual properties |
| `switch_system` | Change visualization system |
| `change_geometry` | Change geometry type (0-23) |
| `get_state` | Get current engine state |
| `randomize_parameters` | Randomize all parameters |
| `reset_parameters` | Reset to defaults |
| `save_to_gallery` | Save to gallery slot |
| `load_from_gallery` | Load from gallery slot |
| `search_geometries` | Query available geometries |
| `get_parameter_schema` | Get parameter validation schema |

### Example MCP Usage

```json
// Get SDK context (call first)
{ "tool": "get_sdk_context" }

// Verify understanding
{
  "tool": "verify_knowledge",
  "args": {
    "q1_rotation_planes": "c",
    "q2_geometry_formula": "b",
    "q3_canvas_layers": "c",
    "q4_active_systems": "a",
    "q5_base_geometries": "b",
    "q6_core_types": "b"
  }
}

// Create visualization
{
  "tool": "create_4d_visualization",
  "args": {
    "system": "quantum",
    "geometry_index": 10
  }
}

// Set rotation
{
  "tool": "set_rotation",
  "args": {
    "XW": 1.57,
    "YW": 0.5,
    "ZW": 0.3
  }
}
```

---

## CLI API

```bash
# Start CLI in streaming mode
echo '{"type":"ping"}' | node src/cli/index.js

# Set parameter
echo '{"type":"set_parameter","param":"hue","value":200}' | node src/cli/index.js

# Get metrics
echo '{"type":"get_metrics"}' | node src/cli/index.js

# Simple text commands
echo 'ping' | node src/cli/index.js
echo 'status' | node src/cli/index.js
echo 'set hue 200' | node src/cli/index.js
echo 'geometry 10' | node src/cli/index.js
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `ping` | Health check |
| `status` | Get engine status |
| `help` | List commands |
| `set <param> <value>` | Set parameter |
| `get <param>` | Get parameter |
| `rotate <plane> <angle>` | Rotate on plane |
| `geometry <index>` | Set geometry (0-23) |
| `system <name>` | Switch system |
| `metrics` | Get telemetry |

---

## Project Structure

```
├── src/                      # Core SDK
│   ├── core/                 # Engine orchestration
│   │   ├── VIB3Engine.js     # Main unified engine
│   │   └── RendererContracts.js
│   ├── quantum/              # Quantum visualization
│   ├── faceted/              # Faceted visualization
│   ├── holograms/            # Holographic visualization
│   ├── geometry/             # 24-geometry system
│   ├── math/                 # 4D math utilities
│   ├── render/               # Rendering pipeline
│   ├── agent/                # MCP/CLI/Telemetry
│   │   ├── mcp/              # MCP server
│   │   ├── cli/              # CLI interface
│   │   └── telemetry/        # Instrumentation
│   └── export/               # Export generators
├── cpp/                      # C++ math core (WASM)
├── js/                       # Client-side integration
├── tests/                    # Test suite (693+ tests)
├── DOCS/                     # Documentation
│   ├── SYSTEM_INVENTORY.md   # Complete system reference
│   ├── CLI_ONBOARDING.md     # Agent CLI setup
│   └── CONTROL_REFERENCE.md  # UI parameters
└── types/                    # TypeScript definitions
```

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test
npm test -- tests/agent/AgentCLI.test.js
```

**Current Status:** 693+ tests passing

---

## Documentation

| Document | Description |
|----------|-------------|
| [`DOCS/SYSTEM_INVENTORY.md`](DOCS/SYSTEM_INVENTORY.md) | Complete technical reference |
| [`DOCS/CLI_ONBOARDING.md`](DOCS/CLI_ONBOARDING.md) | Agent CLI setup guide |
| [`DOCS/CONTROL_REFERENCE.md`](DOCS/CONTROL_REFERENCE.md) | UI parameter reference |
| [`24-GEOMETRY-6D-ROTATION-SUMMARY.md`](24-GEOMETRY-6D-ROTATION-SUMMARY.md) | Geometry encoding details |
| [`DOCS/GPU_DISPOSAL_GUIDE.md`](DOCS/GPU_DISPOSAL_GUIDE.md) | Resource management |

---

## Agent Onboarding Quiz

When connecting via MCP, agents should call `get_sdk_context` then `verify_knowledge`:

```
Q1: How many rotation planes? → c) 6
Q2: Geometry formula? → b) core*8+base
Q3: Canvas layers per system? → c) 5
Q4: Active systems? → a) quantum, faceted, holographic
Q5: Base geometries? → b) 8
Q6: Core types? → b) base, hypersphere, hypertetrahedron
```

---

## License

**Proprietary** - © 2025 Paul Phillips - Clear Seas Solutions LLC

All Rights Reserved

---

## Contact

- **Email:** Paul@clearseassolutions.com
- **Website:** [Parserator.com](https://parserator.com)

> *"The Revolution Will Not be in a Structured Format"*
