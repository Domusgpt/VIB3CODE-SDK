# VIB3+ Flutter Demo

A complete Flutter demonstration of the VIB3+ 4D visualization engine integration.

## Features

- **24 Geometry Variants** - 8 base shapes × 3 core types
  - Base: Tetrahedron, Hypercube, Sphere, Torus, Klein Bottle, Fractal, Wave, Crystal
  - Cores: Base, Hypersphere, Hypertetrahedron

- **3 Visualization Systems**
  - Quantum (particle-based)
  - Faceted (clean 2D patterns)
  - Holographic (5-layer audio-reactive)

- **6D Rotation Controls**
  - 3D space: XY, XZ, YZ planes
  - 4D hyperspace: XW, YW, ZW planes

- **Animated Background** - Responsive gradient that shifts with parameters

- **Preset System** - Quick access to common configurations

## Project Structure

```
flutter_demo/
├── lib/
│   ├── main.dart           # App entry point
│   ├── vib3_demo.dart      # Main demo screen
│   └── vib3_controller.dart # VIB3+ state management
├── pubspec.yaml            # Dependencies
└── README.md               # This file
```

## Running the Demo

### Prerequisites

- Flutter SDK 3.10+
- Dart SDK 3.0+

### Setup

```bash
cd examples/flutter_demo
flutter pub get
flutter run
```

### Platforms

- **iOS/Android**: Full native support
- **Web**: Requires webview_flutter_web
- **Desktop**: macOS, Windows, Linux supported

## Usage

### System Selector
Choose between Quantum, Faceted, or Holographic visualization systems.

### Geometry Selector
- **Top row**: Select base geometry (8 options)
- **Bottom row**: Select core type (Base, Hypersphere, Hypertetrahedron)
- Combined formula: `geometry = coreIndex * 8 + baseIndex`

### Presets
- **Calm**: Low rotation, smooth animation
- **Spin**: Active 4D rotation
- **Chaos**: Maximum entropy
- **Reset**: Return to defaults

### Advanced Controls
Toggle to show:
- XW/YW/ZW rotation sliders
- Dimension (3.0 - 4.5)
- Hue (0 - 360)
- Intensity (0 - 1)

## Integration with VIB3+ Core

This demo uses the VIB3+ cross-platform command buffer system:

```dart
// Generate command buffer
final buffer = controller.generateCommandBuffer(
  width: 800,
  height: 600,
);

// Serialize for FFI
final binary = buffer.toBinary(); // VCB1 format
final json = buffer.serialize();  // JSON format
```

### Command Buffer Format

Commands are serialized with:
- Magic header: `VCB1` (0x56434231)
- Version number
- JSON-encoded command list

### VIB3+ Specific Commands

- `SET_ROTOR (0x11)`: 8-component 4D rotor
- `SET_PROJECTION (0x12)`: Stereographic/perspective projection

## Code Examples

### Change Geometry
```dart
// Set to Hypercube + Hypersphere Core
controller.setGeometry(Vib3Geometry.hypercubeHypersphere); // 9
```

### Rotate in 4D
```dart
controller.setRotation(
  xw: 1.5,
  yw: 0.8,
  zw: 0.5,
);
```

### Apply Preset
```dart
controller.applyPreset('chaos');
```

### Export State
```dart
final json = controller.exportState();
// Save to file or share
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Flutter UI                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   System    │  │  Geometry   │  │  Rotation   │  │
│  │  Selector   │  │  Selector   │  │   Sliders   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
└─────────┼────────────────┼────────────────┼─────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────┐
│                 Vib3Controller                       │
│  ┌─────────────────────────────────────────────┐    │
│  │                 Vib3Params                   │    │
│  │  system, geometry, rot4d*, dimension, etc.  │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              Vib3CommandBuffer                       │
│  clear → viewport → pipeline → uniforms → rotor →   │
│  projection → draw                                   │
└─────────────────────────┬───────────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
     ┌─────────────┐             ┌─────────────┐
     │   WebView   │             │  FFI/WASM   │
     │  (JS Core)  │             │  (Native)   │
     └─────────────┘             └─────────────┘
```

## License

© 2025 Paul Phillips - Clear Seas Solutions LLC
All Rights Reserved - Proprietary Technology

---

**VIB3+ SDK v1.9.0**
