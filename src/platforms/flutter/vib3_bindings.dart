/// VIB3+ Flutter FFI Bindings
///
/// Provides Dart/Flutter interface to VIB3+ rendering core via FFI.
/// Command buffers are serialized to JSON and passed through FFI
/// to the WASM/native core for execution.
///
/// Usage:
/// ```dart
/// final vib3 = Vib3Core();
/// await vib3.initialize();
///
/// final cmdBuffer = Vib3CommandBuffer()
///   ..clear(color: [0, 0, 0, 1])
///   ..setViewport(0, 0, width, height)
///   ..setRotor(rotor)
///   ..draw(vertexCount: 36);
///
/// await vib3.execute(cmdBuffer);
/// ```

import 'dart:ffi';
import 'dart:convert';
import 'dart:typed_data';

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

/// Blend mode presets
class BlendMode {
  static const int none = 0;
  static const int alpha = 1;
  static const int additive = 2;
  static const int multiply = 3;
  static const int screen = 4;
  static const int premultiplied = 5;
}

/// Depth compare functions
class DepthFunc {
  static const int never = 0;
  static const int less = 1;
  static const int equal = 2;
  static const int lequal = 3;
  static const int greater = 4;
  static const int notEqual = 5;
  static const int gequal = 6;
  static const int always = 7;
}

/// Primitive topology
class Topology {
  static const int pointList = 0;
  static const int lineList = 1;
  static const int lineStrip = 2;
  static const int triangleList = 3;
  static const int triangleStrip = 4;
  static const int triangleFan = 5;
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

  /// Get geometry ID from base and core indices
  static int encode(int baseIndex, int coreIndex) {
    return coreIndex * 8 + baseIndex;
  }

  /// Decode geometry ID to base and core indices
  static (int baseIndex, int coreIndex) decode(int geometry) {
    return (geometry % 8, geometry ~/ 8);
  }
}

/// VIB3+ visualization systems
enum Vib3System {
  quantum,
  faceted,
  holographic,
}

/// Single render command
class Vib3Command {
  final int type;
  final Map<String, dynamic> data;
  final double timestamp;

  Vib3Command(this.type, this.data) : timestamp = DateTime.now().microsecondsSinceEpoch / 1000.0;

  Map<String, dynamic> toJson() => {
    'type': type,
    'data': data,
    'timestamp': timestamp,
  };

  factory Vib3Command.fromJson(Map<String, dynamic> json) {
    return Vib3Command(json['type'] as int, json['data'] as Map<String, dynamic>);
  }
}

/// Serializable command buffer
class Vib3CommandBuffer {
  final List<Vib3Command> _commands = [];
  bool _sealed = false;
  int _version = 1;

  bool get isSealed => _sealed;
  int get length => _commands.length;
  int get version => _version;

  /// Reset buffer for reuse
  void reset() {
    _commands.clear();
    _sealed = false;
    _version++;
  }

  /// Seal buffer (no more recording)
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

  // ========== Recording API ==========

  /// Clear buffers
  void clear({
    List<double>? color,
    double depth = 1.0,
    int stencil = 0,
    bool clearColor = true,
    bool clearDepth = true,
    bool clearStencil = false,
  }) {
    _record(CommandType.clear, {
      'color': color ?? [0.0, 0.0, 0.0, 1.0],
      'depth': depth,
      'stencil': stencil,
      'clearColor': clearColor,
      'clearDepth': clearDepth,
      'clearStencil': clearStencil,
    });
  }

  /// Set viewport
  void setViewport(int x, int y, int width, int height) {
    _record(CommandType.setViewport, {
      'x': x, 'y': y, 'width': width, 'height': height,
    });
  }

  /// Set scissor rect
  void setScissor(int x, int y, int width, int height) {
    _record(CommandType.setScissor, {
      'x': x, 'y': y, 'width': width, 'height': height,
    });
  }

  /// Set pipeline
  void setPipeline(String pipelineId) {
    _record(CommandType.setPipeline, {'pipelineId': pipelineId});
  }

  /// Set uniforms
  void setUniforms(Map<String, dynamic> uniforms) {
    _record(CommandType.setUniforms, {'values': uniforms});
  }

  /// Set 4D rotor (8-component bivector: [s, xy, xz, yz, xw, yw, zw, xyzw])
  void setRotor(List<double> rotor) {
    if (rotor.length != 8) {
      throw ArgumentError('Rotor must have 8 components');
    }
    _record(CommandType.setRotor, {'rotor': rotor});
  }

  /// Set projection parameters
  void setProjection({
    required String type,
    required double dimension,
    double fov = 0.785398, // PI/4
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

  /// Bind vertex buffer
  void bindVertexBuffer(int slot, dynamic bufferId, {int offset = 0}) {
    _record(CommandType.bindVertexBuffer, {
      'slot': slot, 'bufferId': bufferId, 'offset': offset,
    });
  }

  /// Bind index buffer
  void bindIndexBuffer(dynamic bufferId, {String format = 'uint16', int offset = 0}) {
    _record(CommandType.bindIndexBuffer, {
      'bufferId': bufferId, 'format': format, 'offset': offset,
    });
  }

  /// Bind texture
  void bindTexture(int slot, dynamic textureId, {dynamic samplerId}) {
    _record(CommandType.bindTexture, {
      'slot': slot, 'textureId': textureId, 'samplerId': samplerId,
    });
  }

  /// Set blend mode
  void setBlendMode(int mode) {
    _record(CommandType.setBlendMode, {'mode': mode});
  }

  /// Set depth state
  void setDepthState({bool enabled = true, bool write = true, int func = DepthFunc.less}) {
    _record(CommandType.setDepthState, {
      'enabled': enabled, 'write': write, 'func': func,
    });
  }

  /// Draw primitives
  void draw({
    required int vertexCount,
    int firstVertex = 0,
    int topology = Topology.triangleList,
  }) {
    _record(CommandType.draw, {
      'vertexCount': vertexCount,
      'firstVertex': firstVertex,
      'topology': topology,
    });
  }

  /// Draw indexed primitives
  void drawIndexed({
    required int indexCount,
    int firstIndex = 0,
    int baseVertex = 0,
    int topology = Topology.triangleList,
  }) {
    _record(CommandType.drawIndexed, {
      'indexCount': indexCount,
      'firstIndex': firstIndex,
      'baseVertex': baseVertex,
      'topology': topology,
    });
  }

  /// Draw instanced primitives
  void drawInstanced({
    required int vertexCount,
    required int instanceCount,
    int firstVertex = 0,
    int firstInstance = 0,
    int topology = Topology.triangleList,
  }) {
    _record(CommandType.drawInstanced, {
      'vertexCount': vertexCount,
      'instanceCount': instanceCount,
      'firstVertex': firstVertex,
      'firstInstance': firstInstance,
      'topology': topology,
    });
  }

  /// Push render state
  void pushState() {
    _record(CommandType.pushState, {});
  }

  /// Pop render state
  void popState() {
    _record(CommandType.popState, {});
  }

  // ========== Serialization ==========

  /// Serialize to JSON map
  Map<String, dynamic> toJson() => {
    'version': _version,
    'sealed': _sealed,
    'commands': _commands.map((c) => c.toJson()).toList(),
  };

  /// Serialize to JSON string
  String serialize() => jsonEncode(toJson());

  /// Serialize to binary format
  Uint8List toBinary() {
    final json = serialize();
    final data = utf8.encode(json);

    // Header: magic (4) + version (4) + length (4) = 12 bytes
    final buffer = Uint8List(12 + data.length);
    final view = ByteData.view(buffer.buffer);

    // Magic: 'VCB1'
    view.setUint32(0, 0x56434231, Endian.big);
    view.setUint32(4, _version, Endian.big);
    view.setUint32(8, data.length, Endian.big);

    // Command data
    buffer.setRange(12, 12 + data.length, data);

    return buffer;
  }

  /// Create from JSON map
  factory Vib3CommandBuffer.fromJson(Map<String, dynamic> json) {
    final buffer = Vib3CommandBuffer();
    buffer._version = json['version'] as int? ?? 1;
    buffer._sealed = json['sealed'] as bool? ?? false;

    final commands = json['commands'] as List<dynamic>? ?? [];
    for (final cmd in commands) {
      buffer._commands.add(Vib3Command.fromJson(cmd as Map<String, dynamic>));
    }

    return buffer;
  }

  /// Deserialize from JSON string
  factory Vib3CommandBuffer.deserialize(String json) {
    return Vib3CommandBuffer.fromJson(jsonDecode(json) as Map<String, dynamic>);
  }

  /// Deserialize from binary format
  factory Vib3CommandBuffer.fromBinary(Uint8List data) {
    final view = ByteData.view(data.buffer);

    // Verify magic
    final magic = view.getUint32(0, Endian.big);
    if (magic != 0x56434231) {
      throw FormatException('Invalid command buffer magic');
    }

    // Read length
    final length = view.getUint32(8, Endian.big);

    // Decode JSON
    final jsonBytes = data.sublist(12, 12 + length);
    final json = utf8.decode(jsonBytes);

    return Vib3CommandBuffer.deserialize(json);
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
}

/// FFI function signatures (for native/WASM binding)
typedef Vib3InitNative = Int32 Function();
typedef Vib3InitDart = int Function();

typedef Vib3ExecuteNative = Int32 Function(Pointer<Utf8> commands, Int32 length);
typedef Vib3ExecuteDart = int Function(Pointer<Utf8> commands, int length);

typedef Vib3DisposeNative = Void Function();
typedef Vib3DisposeDart = void Function();

/// VIB3+ Core FFI Interface
///
/// Note: This is a stub for Flutter platform integration.
/// Actual FFI binding requires the compiled WASM/native library.
class Vib3CoreFFI {
  late DynamicLibrary _lib;
  late Vib3InitDart _init;
  late Vib3ExecuteDart _execute;
  late Vib3DisposeDart _dispose;

  bool _initialized = false;

  /// Load native library
  Future<void> load(String libraryPath) async {
    _lib = DynamicLibrary.open(libraryPath);

    _init = _lib
        .lookup<NativeFunction<Vib3InitNative>>('vib3_init')
        .asFunction();

    _execute = _lib
        .lookup<NativeFunction<Vib3ExecuteNative>>('vib3_execute')
        .asFunction();

    _dispose = _lib
        .lookup<NativeFunction<Vib3DisposeNative>>('vib3_dispose')
        .asFunction();
  }

  /// Initialize renderer
  Future<bool> initialize() async {
    if (_initialized) return true;

    final result = _init();
    _initialized = result == 0;
    return _initialized;
  }

  /// Execute command buffer
  Future<int> execute(Vib3CommandBuffer buffer) async {
    if (!_initialized) {
      throw StateError('VIB3 core not initialized');
    }

    // Note: Actual implementation would use ffi package
    // to allocate and pass the string pointer
    final json = buffer.serialize();
    // return _execute(json.toNativeUtf8(), json.length);
    return 0; // Stub
  }

  /// Dispose resources
  void dispose() {
    if (_initialized) {
      _dispose();
      _initialized = false;
    }
  }
}
