/// VIB3+ Flutter Platform Channel Interface
///
/// Alternative to FFI using Flutter's MethodChannel for WebView integration.
/// This approach embeds the JS-based VIB3+ renderer in a WebView and
/// communicates via message passing.
///
/// Usage:
/// ```dart
/// final vib3 = Vib3Channel();
/// await vib3.initialize();
///
/// // Set visualization parameters
/// await vib3.setParams(Vib3Params(
///   system: Vib3System.quantum,
///   geometry: Vib3Geometry.hypercubeHypersphere,
///   rot4dXW: 0.5,
/// ));
///
/// // Execute command buffer
/// final cmdBuffer = Vib3CommandBuffer()..draw(vertexCount: 36);
/// await vib3.execute(cmdBuffer);
/// ```

import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';

import 'vib3_bindings.dart';

/// Platform channel for VIB3+ WebView communication
class Vib3Channel {
  static const MethodChannel _channel = MethodChannel('com.vib3plus/renderer');
  static const EventChannel _events = EventChannel('com.vib3plus/events');

  bool _initialized = false;
  StreamSubscription? _eventSubscription;

  /// Telemetry event handlers
  final List<void Function(Map<String, dynamic>)> _eventHandlers = [];

  /// Check if initialized
  bool get isInitialized => _initialized;

  /// Initialize the VIB3+ renderer
  Future<bool> initialize({
    int width = 800,
    int height = 600,
    bool debug = false,
  }) async {
    try {
      final result = await _channel.invokeMethod<bool>('initialize', {
        'width': width,
        'height': height,
        'debug': debug,
      });

      _initialized = result ?? false;

      if (_initialized) {
        // Start listening for events
        _eventSubscription = _events.receiveBroadcastStream().listen(
          (event) {
            if (event is Map) {
              final eventMap = Map<String, dynamic>.from(event);
              for (final handler in _eventHandlers) {
                handler(eventMap);
              }
            }
          },
          onError: (error) {
            print('VIB3+ event error: $error');
          },
        );
      }

      return _initialized;
    } on PlatformException catch (e) {
      print('VIB3+ initialization failed: ${e.message}');
      return false;
    }
  }

  /// Set visualization parameters
  Future<void> setParams(Vib3Params params) async {
    _checkInitialized();

    await _channel.invokeMethod('setParams', params.toJson());
  }

  /// Get current parameters
  Future<Vib3Params> getParams() async {
    _checkInitialized();

    final result = await _channel.invokeMethod<Map>('getParams');
    if (result == null) {
      return Vib3Params();
    }

    return Vib3Params.fromJson(Map<String, dynamic>.from(result));
  }

  /// Set visualization system
  Future<void> setSystem(Vib3System system) async {
    _checkInitialized();

    await _channel.invokeMethod('setSystem', {'system': system.name});
  }

  /// Set geometry (0-23)
  Future<void> setGeometry(int geometry) async {
    _checkInitialized();

    if (geometry < 0 || geometry > 23) {
      throw RangeError('Geometry must be 0-23');
    }

    await _channel.invokeMethod('setGeometry', {'geometry': geometry});
  }

  /// Set 6D rotation
  Future<void> setRotation({
    double? xy,
    double? xz,
    double? yz,
    double? xw,
    double? yw,
    double? zw,
  }) async {
    _checkInitialized();

    final rotations = <String, double>{};
    if (xy != null) rotations['rot4dXY'] = xy;
    if (xz != null) rotations['rot4dXZ'] = xz;
    if (yz != null) rotations['rot4dYZ'] = yz;
    if (xw != null) rotations['rot4dXW'] = xw;
    if (yw != null) rotations['rot4dYW'] = yw;
    if (zw != null) rotations['rot4dZW'] = zw;

    await _channel.invokeMethod('setRotation', rotations);
  }

  /// Execute a command buffer
  Future<Map<String, dynamic>> execute(Vib3CommandBuffer buffer) async {
    _checkInitialized();

    buffer.seal();

    final result = await _channel.invokeMethod<Map>('execute', {
      'commands': buffer.serialize(),
    });

    return result != null ? Map<String, dynamic>.from(result) : {};
  }

  /// Render a single frame
  Future<void> renderFrame() async {
    _checkInitialized();

    await _channel.invokeMethod('renderFrame');
  }

  /// Start animation loop
  Future<void> startAnimation() async {
    _checkInitialized();

    await _channel.invokeMethod('startAnimation');
  }

  /// Stop animation loop
  Future<void> stopAnimation() async {
    _checkInitialized();

    await _channel.invokeMethod('stopAnimation');
  }

  /// Resize the renderer
  Future<void> resize(int width, int height) async {
    _checkInitialized();

    await _channel.invokeMethod('resize', {
      'width': width,
      'height': height,
    });
  }

  /// Export current state to SVG
  Future<String> exportSVG({
    int width = 800,
    int height = 600,
  }) async {
    _checkInitialized();

    final result = await _channel.invokeMethod<String>('exportSVG', {
      'width': width,
      'height': height,
    });

    return result ?? '';
  }

  /// Export current state to CSS
  Future<String> exportCSS({bool darkMode = false}) async {
    _checkInitialized();

    final result = await _channel.invokeMethod<String>('exportCSS', {
      'darkMode': darkMode,
    });

    return result ?? '';
  }

  /// Export current state to Lottie JSON
  Future<String> exportLottie({
    int frames = 60,
    int fps = 30,
  }) async {
    _checkInitialized();

    final result = await _channel.invokeMethod<String>('exportLottie', {
      'frames': frames,
      'fps': fps,
    });

    return result ?? '';
  }

  /// Get render statistics
  Future<Map<String, dynamic>> getStats() async {
    _checkInitialized();

    final result = await _channel.invokeMethod<Map>('getStats');
    return result != null ? Map<String, dynamic>.from(result) : {};
  }

  /// Save current state to gallery slot
  Future<void> saveToGallery(int slot, {String? name}) async {
    _checkInitialized();

    await _channel.invokeMethod('saveToGallery', {
      'slot': slot,
      'name': name,
    });
  }

  /// Load state from gallery slot
  Future<void> loadFromGallery(int slot) async {
    _checkInitialized();

    await _channel.invokeMethod('loadFromGallery', {'slot': slot});
  }

  /// Register event handler
  void onEvent(void Function(Map<String, dynamic>) handler) {
    _eventHandlers.add(handler);
  }

  /// Remove event handler
  void removeEventHandler(void Function(Map<String, dynamic>) handler) {
    _eventHandlers.remove(handler);
  }

  /// Dispose resources
  Future<void> dispose() async {
    _eventSubscription?.cancel();
    _eventHandlers.clear();

    if (_initialized) {
      await _channel.invokeMethod('dispose');
      _initialized = false;
    }
  }

  void _checkInitialized() {
    if (!_initialized) {
      throw StateError('VIB3+ renderer not initialized');
    }
  }
}

/// VIB3+ WebView Widget
///
/// Renders VIB3+ visualizations in a platform WebView.
/// Note: Requires webview_flutter package.
///
/// Usage in widget tree:
/// ```dart
/// Vib3WebView(
///   params: Vib3Params(
///     system: Vib3System.holographic,
///     geometry: 12,
///   ),
///   onReady: (controller) {
///     controller.startAnimation();
///   },
/// )
/// ```
class Vib3WebViewConfig {
  final Vib3Params initialParams;
  final bool autoStart;
  final bool debug;
  final String? customJsPath;

  const Vib3WebViewConfig({
    Vib3Params? initialParams,
    this.autoStart = true,
    this.debug = false,
    this.customJsPath,
  }) : initialParams = initialParams ?? const Vib3Params() as Vib3Params;

  /// Generate HTML for WebView
  String generateHtml() {
    final jsPath = customJsPath ?? 'assets/vib3/vib3-core.js';

    return '''
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    canvas { width: 100vw; height: 100vh; display: block; }
  </style>
</head>
<body>
  <canvas id="vib3-canvas"></canvas>
  <script src="$jsPath"></script>
  <script>
    // Initialize VIB3+ engine
    const canvas = document.getElementById('vib3-canvas');
    const engine = new VIB3Engine({
      canvas: canvas,
      system: '${initialParams.system.name}',
      geometry: ${initialParams.geometry},
      debug: $debug
    });

    // Set initial parameters
    engine.setParams(${jsonEncode(initialParams.toJson())});

    // Platform channel bridge
    window.vib3Bridge = {
      setParams: (json) => engine.setParams(JSON.parse(json)),
      getParams: () => JSON.stringify(engine.getParams()),
      setSystem: (system) => engine.setSystem(system),
      setGeometry: (g) => engine.setGeometry(g),
      setRotation: (json) => engine.setRotation(JSON.parse(json)),
      execute: (json) => engine.executeCommandBuffer(JSON.parse(json)),
      renderFrame: () => engine.renderFrame(),
      startAnimation: () => engine.startAnimation(),
      stopAnimation: () => engine.stopAnimation(),
      resize: (w, h) => engine.resize(w, h),
      exportSVG: (w, h) => engine.exportSVG({ width: w, height: h }),
      exportCSS: (dark) => engine.exportCSS({ darkMode: dark }),
      exportLottie: (frames, fps) => engine.exportLottie({ frames, fps }),
      getStats: () => JSON.stringify(engine.getStats()),
      saveToGallery: (slot, name) => engine.saveToGallery(slot, name),
      loadFromGallery: (slot) => engine.loadFromGallery(slot),
      dispose: () => engine.dispose()
    };

    // Event forwarding
    engine.on('frame', (stats) => {
      window.flutter?.postMessage(JSON.stringify({ type: 'frame', data: stats }));
    });

    engine.on('error', (error) => {
      window.flutter?.postMessage(JSON.stringify({ type: 'error', data: error }));
    });

    ${autoStart ? 'engine.startAnimation();' : ''}

    // Signal ready
    window.flutter?.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>
''';
  }
}
