/// VIB3+ Controller
///
/// Manages VIB3+ visualization state and provides methods for
/// manipulating parameters, applying presets, and generating
/// command buffers for cross-platform execution.

import 'dart:convert';
import 'dart:typed_data';

/// VIB3+ visualization systems
enum Vib3System {
  quantum,
  faceted,
  holographic,
}

/// 24 VIB3+ geometry variants
/// Formula: geometry = coreIndex * 8 + baseIndex
class Vib3Geometry {
  // Base geometries (coreIndex 0)
  static const int tetrahedron = 0;
  static const int hypercube = 1;
  static const int sphere = 2;
  static const int torus = 3;
  static const int kleinBottle = 4;
  static const int fractal = 5;
  static const int wave = 6;
  static const int crystal = 7;

  // Hypersphere Core (coreIndex 1)
  static const int tetrahedronHypersphere = 8;
  static const int hypercubeHypersphere = 9;
  static const int sphereHypersphere = 10;
  static const int torusHypersphere = 11;
  static const int kleinBottleHypersphere = 12;
  static const int fractalHypersphere = 13;
  static const int waveHypersphere = 14;
  static const int crystalHypersphere = 15;

  // Hypertetrahedron Core (coreIndex 2)
  static const int tetrahedronHypertetra = 16;
  static const int hypercubeHypertetra = 17;
  static const int sphereHypertetra = 18;
  static const int torusHypertetra = 19;
  static const int kleinBottleHypertetra = 20;
  static const int fractalHypertetra = 21;
  static const int waveHypertetra = 22;
  static const int crystalHypertetra = 23;

  /// Base geometry names
  static const List<String> baseNames = [
    'Tetra',
    'Cube',
    'Sphere',
    'Torus',
    'Klein',
    'Fractal',
    'Wave',
    'Crystal',
  ];

  /// Core type names
  static const List<String> coreNames = [
    'Base',
    'Hypersphere',
    'Hypertetra',
  ];

  /// Get geometry ID from base and core indices
  static int encode(int baseIndex, int coreIndex) {
    return coreIndex * 8 + baseIndex;
  }

  /// Decode geometry ID to base and core indices
  static (int baseIndex, int coreIndex) decode(int geometry) {
    return (geometry % 8, geometry ~/ 8);
  }

  /// Get full name for a geometry
  static String getName(int geometry) {
    final (baseIndex, coreIndex) = decode(geometry);
    if (coreIndex == 0) {
      return baseNames[baseIndex];
    }
    return '${baseNames[baseIndex]} + ${coreNames[coreIndex]}';
  }
}

/// VIB3+ scene parameters
class Vib3Params {
  Vib3System system;
  int variation;
  int geometry;

  // 6D rotation (all planes)
  double rot4dXY;
  double rot4dXZ;
  double rot4dYZ;
  double rot4dXW;
  double rot4dYW;
  double rot4dZW;

  // Visual properties
  int gridDensity;
  double morphFactor;
  double chaos;
  double speed;
  double hue;
  double intensity;
  double saturation;
  double dimension;

  Vib3Params({
    this.system = Vib3System.quantum,
    this.variation = 0,
    this.geometry = 0,
    this.rot4dXY = 0.0,
    this.rot4dXZ = 0.0,
    this.rot4dYZ = 0.0,
    this.rot4dXW = 0.0,
    this.rot4dYW = 0.0,
    this.rot4dZW = 0.0,
    this.gridDensity = 20,
    this.morphFactor = 1.0,
    this.chaos = 0.0,
    this.speed = 1.0,
    this.hue = 180.0,
    this.intensity = 1.0,
    this.saturation = 1.0,
    this.dimension = 3.5,
  });

  /// Create a copy with modified values
  Vib3Params copyWith({
    Vib3System? system,
    int? variation,
    int? geometry,
    double? rot4dXY,
    double? rot4dXZ,
    double? rot4dYZ,
    double? rot4dXW,
    double? rot4dYW,
    double? rot4dZW,
    int? gridDensity,
    double? morphFactor,
    double? chaos,
    double? speed,
    double? hue,
    double? intensity,
    double? saturation,
    double? dimension,
  }) {
    return Vib3Params(
      system: system ?? this.system,
      variation: variation ?? this.variation,
      geometry: geometry ?? this.geometry,
      rot4dXY: rot4dXY ?? this.rot4dXY,
      rot4dXZ: rot4dXZ ?? this.rot4dXZ,
      rot4dYZ: rot4dYZ ?? this.rot4dYZ,
      rot4dXW: rot4dXW ?? this.rot4dXW,
      rot4dYW: rot4dYW ?? this.rot4dYW,
      rot4dZW: rot4dZW ?? this.rot4dZW,
      gridDensity: gridDensity ?? this.gridDensity,
      morphFactor: morphFactor ?? this.morphFactor,
      chaos: chaos ?? this.chaos,
      speed: speed ?? this.speed,
      hue: hue ?? this.hue,
      intensity: intensity ?? this.intensity,
      saturation: saturation ?? this.saturation,
      dimension: dimension ?? this.dimension,
    );
  }

  Map<String, dynamic> toJson() => {
        'system': system.name,
        'variation': variation,
        'geometry': geometry,
        'rot4dXY': rot4dXY,
        'rot4dXZ': rot4dXZ,
        'rot4dYZ': rot4dYZ,
        'rot4dXW': rot4dXW,
        'rot4dYW': rot4dYW,
        'rot4dZW': rot4dZW,
        'gridDensity': gridDensity,
        'morphFactor': morphFactor,
        'chaos': chaos,
        'speed': speed,
        'hue': hue,
        'intensity': intensity,
        'saturation': saturation,
        'dimension': dimension,
      };

  factory Vib3Params.fromJson(Map<String, dynamic> json) {
    return Vib3Params(
      system: Vib3System.values.firstWhere(
        (s) => s.name == json['system'],
        orElse: () => Vib3System.quantum,
      ),
      variation: json['variation'] as int? ?? 0,
      geometry: json['geometry'] as int? ?? 0,
      rot4dXY: (json['rot4dXY'] as num?)?.toDouble() ?? 0.0,
      rot4dXZ: (json['rot4dXZ'] as num?)?.toDouble() ?? 0.0,
      rot4dYZ: (json['rot4dYZ'] as num?)?.toDouble() ?? 0.0,
      rot4dXW: (json['rot4dXW'] as num?)?.toDouble() ?? 0.0,
      rot4dYW: (json['rot4dYW'] as num?)?.toDouble() ?? 0.0,
      rot4dZW: (json['rot4dZW'] as num?)?.toDouble() ?? 0.0,
      gridDensity: json['gridDensity'] as int? ?? 20,
      morphFactor: (json['morphFactor'] as num?)?.toDouble() ?? 1.0,
      chaos: (json['chaos'] as num?)?.toDouble() ?? 0.0,
      speed: (json['speed'] as num?)?.toDouble() ?? 1.0,
      hue: (json['hue'] as num?)?.toDouble() ?? 180.0,
      intensity: (json['intensity'] as num?)?.toDouble() ?? 1.0,
      saturation: (json['saturation'] as num?)?.toDouble() ?? 1.0,
      dimension: (json['dimension'] as num?)?.toDouble() ?? 3.5,
    );
  }

  @override
  String toString() => jsonEncode(toJson());
}

/// Command type constants (matches JS CommandType)
class CommandType {
  static const int clear = 0x01;
  static const int setViewport = 0x02;
  static const int setPipeline = 0x03;
  static const int setUniforms = 0x04;
  static const int bindVertexBuffer = 0x05;
  static const int bindIndexBuffer = 0x06;
  static const int draw = 0x07;
  static const int drawIndexed = 0x08;
  static const int drawInstanced = 0x09;
  static const int setBlendMode = 0x0A;
  static const int setDepthState = 0x0B;
  static const int pushState = 0x0C;
  static const int popState = 0x0D;
  static const int setScissor = 0x0E;
  static const int setStencil = 0x0F;
  static const int bindTexture = 0x10;
  static const int setRotor = 0x11;
  static const int setProjection = 0x12;
}

/// Single render command
class Vib3Command {
  final int type;
  final Map<String, dynamic> data;
  final double timestamp;

  Vib3Command(this.type, this.data)
      : timestamp = DateTime.now().microsecondsSinceEpoch / 1000.0;

  Map<String, dynamic> toJson() => {
        'type': type,
        'data': data,
        'timestamp': timestamp,
      };
}

/// Serializable command buffer
class Vib3CommandBuffer {
  final List<Vib3Command> _commands = [];
  bool _sealed = false;
  int _version = 1;

  bool get isSealed => _sealed;
  int get length => _commands.length;
  int get version => _version;

  void reset() {
    _commands.clear();
    _sealed = false;
    _version++;
  }

  void seal() {
    _sealed = true;
  }

  void _record(int type, Map<String, dynamic> data) {
    if (_sealed) {
      throw StateError('Cannot record to sealed command buffer');
    }
    _commands.add(Vib3Command(type, data));
    _version++;
  }

  // Recording API
  void clear({List<double>? color}) {
    _record(CommandType.clear, {
      'color': color ?? [0.0, 0.0, 0.0, 1.0],
      'clearColor': true,
      'clearDepth': true,
    });
  }

  void setViewport(int x, int y, int width, int height) {
    _record(CommandType.setViewport, {
      'x': x,
      'y': y,
      'width': width,
      'height': height,
    });
  }

  void setPipeline(String pipelineId) {
    _record(CommandType.setPipeline, {'pipelineId': pipelineId});
  }

  void setUniforms(Map<String, dynamic> uniforms) {
    _record(CommandType.setUniforms, {'values': uniforms});
  }

  void setRotor(List<double> rotor) {
    if (rotor.length != 8) {
      throw ArgumentError('Rotor must have 8 components');
    }
    _record(CommandType.setRotor, {'rotor': rotor});
  }

  void setProjection({
    required String type,
    required double dimension,
    double fov = 0.785398,
    double near = 0.1,
    double far = 100.0,
  }) {
    _record(CommandType.setProjection, {
      'type': type,
      'dimension': dimension,
      'fov': fov,
      'near': near,
      'far': far,
    });
  }

  void draw({required int vertexCount, int firstVertex = 0}) {
    _record(CommandType.draw, {
      'vertexCount': vertexCount,
      'firstVertex': firstVertex,
      'topology': 3, // TRIANGLE_LIST
    });
  }

  // Serialization
  Map<String, dynamic> toJson() => {
        'version': _version,
        'sealed': _sealed,
        'commands': _commands.map((c) => c.toJson()).toList(),
      };

  String serialize() => jsonEncode(toJson());

  Uint8List toBinary() {
    final json = serialize();
    final data = utf8.encode(json);

    final buffer = Uint8List(12 + data.length);
    final view = ByteData.view(buffer.buffer);

    // Magic: 'VCB1'
    view.setUint32(0, 0x56434231, Endian.big);
    view.setUint32(4, _version, Endian.big);
    view.setUint32(8, data.length, Endian.big);

    buffer.setRange(12, 12 + data.length, data);

    return buffer;
  }
}

/// VIB3+ Controller
///
/// Manages visualization state and provides high-level control methods.
class Vib3Controller {
  Vib3Params params;

  /// Event listeners
  final List<void Function(Vib3Params)> _listeners = [];

  Vib3Controller({Vib3Params? initialParams})
      : params = initialParams ?? Vib3Params();

  /// Add listener for parameter changes
  void addListener(void Function(Vib3Params) listener) {
    _listeners.add(listener);
  }

  /// Remove listener
  void removeListener(void Function(Vib3Params) listener) {
    _listeners.remove(listener);
  }

  /// Notify listeners of changes
  void _notifyListeners() {
    for (final listener in _listeners) {
      listener(params);
    }
  }

  /// Set visualization system
  void setSystem(Vib3System system) {
    params.system = system;
    _notifyListeners();
  }

  /// Set geometry (0-23)
  void setGeometry(int geometry) {
    if (geometry < 0 || geometry > 23) {
      throw RangeError('Geometry must be 0-23');
    }
    params.geometry = geometry;
    _notifyListeners();
  }

  /// Set 6D rotation
  void setRotation({
    double? xy,
    double? xz,
    double? yz,
    double? xw,
    double? yw,
    double? zw,
  }) {
    if (xy != null) params.rot4dXY = xy;
    if (xz != null) params.rot4dXZ = xz;
    if (yz != null) params.rot4dYZ = yz;
    if (xw != null) params.rot4dXW = xw;
    if (yw != null) params.rot4dYW = yw;
    if (zw != null) params.rot4dZW = zw;
    _notifyListeners();
  }

  /// Apply a preset
  void applyPreset(String presetName) {
    switch (presetName) {
      case 'calm':
        params.rot4dXW = 0.0;
        params.rot4dYW = 0.0;
        params.rot4dZW = 0.0;
        params.speed = 0.5;
        params.chaos = 0.0;
        params.intensity = 0.7;
        break;
      case 'spin':
        params.rot4dXW = 1.5;
        params.rot4dYW = 0.8;
        params.rot4dZW = 0.5;
        params.speed = 1.5;
        params.chaos = 0.2;
        break;
      case 'chaos':
        params.rot4dXW = 3.14;
        params.rot4dYW = 2.5;
        params.rot4dZW = 1.8;
        params.speed = 2.0;
        params.chaos = 0.8;
        params.intensity = 1.0;
        break;
      case 'quantum':
        params.system = Vib3System.quantum;
        params.geometry = Vib3Geometry.hypercubeHypersphere;
        params.dimension = 3.8;
        break;
      case 'holographic':
        params.system = Vib3System.holographic;
        params.geometry = Vib3Geometry.torusHypertetra;
        params.dimension = 4.0;
        params.hue = 280;
        break;
    }
    _notifyListeners();
  }

  /// Reset to defaults
  void reset() {
    params = Vib3Params();
    _notifyListeners();
  }

  /// Generate command buffer for current state
  Vib3CommandBuffer generateCommandBuffer({
    required int width,
    required int height,
  }) {
    final buffer = Vib3CommandBuffer();

    // Clear
    buffer.clear(color: [0.0, 0.0, 0.0, 1.0]);

    // Viewport
    buffer.setViewport(0, 0, width, height);

    // Pipeline based on system
    buffer.setPipeline(params.system.name);

    // Uniforms
    buffer.setUniforms({
      'time': DateTime.now().millisecondsSinceEpoch / 1000.0,
      'geometry': params.geometry,
      'morphFactor': params.morphFactor,
      'chaos': params.chaos,
      'speed': params.speed,
      'hue': params.hue,
      'intensity': params.intensity,
      'saturation': params.saturation,
    });

    // 4D Rotor (construct from plane angles)
    // Simplified rotor from 6 plane angles
    final rotor = _constructRotor();
    buffer.setRotor(rotor);

    // Projection
    buffer.setProjection(
      type: 'stereographic',
      dimension: params.dimension,
    );

    // Draw (vertex count depends on geometry)
    buffer.draw(vertexCount: _getVertexCount(params.geometry));

    buffer.seal();
    return buffer;
  }

  /// Construct 4D rotor from plane angles
  List<double> _constructRotor() {
    // Simplified rotor construction
    // Full implementation would use geometric algebra multiplication
    final c1 = _cos(params.rot4dXY / 2);
    final s1 = _sin(params.rot4dXY / 2);
    final c2 = _cos(params.rot4dXZ / 2);
    final s2 = _sin(params.rot4dXZ / 2);
    final c3 = _cos(params.rot4dXW / 2);
    final s3 = _sin(params.rot4dXW / 2);

    // Approximated combined rotor
    return [
      c1 * c2 * c3, // scalar
      s1 * c2, // xy
      s2 * c1, // xz
      s1 * s2 * 0.5, // yz
      s3 * c1 * c2, // xw
      s3 * s1 * 0.5, // yw
      s3 * s2 * 0.5, // zw
      s1 * s2 * s3 * 0.25, // xyzw
    ];
  }

  double _cos(double x) => x.abs() < 0.001 ? 1.0 : (1.0 - x * x / 2);
  double _sin(double x) => x.abs() < 0.001 ? x : x - x * x * x / 6;

  /// Get vertex count for geometry
  int _getVertexCount(int geometry) {
    final baseIndex = geometry % 8;
    // Simplified vertex counts
    const baseCounts = [12, 36, 192, 576, 288, 486, 200, 48];
    return baseCounts[baseIndex];
  }

  /// Export current state as JSON
  String exportState() => params.toString();

  /// Import state from JSON
  void importState(String json) {
    params = Vib3Params.fromJson(jsonDecode(json));
    _notifyListeners();
  }

  /// Dispose resources
  void dispose() {
    _listeners.clear();
  }
}
