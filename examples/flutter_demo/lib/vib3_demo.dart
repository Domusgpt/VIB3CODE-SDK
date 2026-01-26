/// VIB3+ Demo Screen
///
/// Complete demonstration of VIB3+ visualization with:
/// - Animated gradient background
/// - Geometry selector (24 variants)
/// - System selector (Quantum/Faceted/Holographic)
/// - 6D rotation sliders
/// - Real-time parameter display

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'vib3_controller.dart';

class Vib3DemoScreen extends StatefulWidget {
  const Vib3DemoScreen({super.key});

  @override
  State<Vib3DemoScreen> createState() => _Vib3DemoScreenState();
}

class _Vib3DemoScreenState extends State<Vib3DemoScreen>
    with TickerProviderStateMixin {
  late final Vib3Controller _controller;
  late final AnimationController _bgAnimController;
  late final AnimationController _pulseController;

  bool _showControls = true;
  bool _showAdvanced = false;

  @override
  void initState() {
    super.initState();
    _controller = Vib3Controller();

    // Background animation
    _bgAnimController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
    )..repeat();

    // Pulse animation for active elements
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _bgAnimController.dispose();
    _pulseController.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Animated gradient background
          _buildAnimatedBackground(),

          // Main content
          SafeArea(
            child: Column(
              children: [
                // Header
                _buildHeader(),

                // Visualization area (placeholder - would be WebView in production)
                Expanded(
                  child: _buildVisualizationArea(),
                ),

                // Controls panel
                if (_showControls) _buildControlsPanel(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _showControls = !_showControls),
        backgroundColor: const Color(0xFF00FF88).withOpacity(0.8),
        child: Icon(
          _showControls ? Icons.visibility_off : Icons.visibility,
          color: Colors.black,
        ),
      ),
    );
  }

  Widget _buildAnimatedBackground() {
    return AnimatedBuilder(
      animation: _bgAnimController,
      builder: (context, child) {
        final hue = (_bgAnimController.value * 360 +
                _controller.params.hue) %
            360;

        return Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(
                math.sin(_bgAnimController.value * math.pi * 2) * 0.3,
                math.cos(_bgAnimController.value * math.pi * 2) * 0.3,
              ),
              radius: 1.5,
              colors: [
                HSLColor.fromAHSL(1.0, hue, 0.8, 0.15).toColor(),
                HSLColor.fromAHSL(1.0, (hue + 60) % 360, 0.6, 0.05).toColor(),
                Colors.black,
              ],
              stops: const [0.0, 0.5, 1.0],
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          // Logo/Title
          const Text(
            'VIB3+',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: Color(0xFF00FF88),
              letterSpacing: 2,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'v1.9.0',
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withOpacity(0.5),
            ),
          ),
          const Spacer(),
          // System indicator
          _buildSystemChip(),
          const SizedBox(width: 8),
          // Geometry indicator
          _buildGeometryChip(),
        ],
      ),
    );
  }

  Widget _buildSystemChip() {
    final systemColors = {
      Vib3System.quantum: const Color(0xFF00FFFF),
      Vib3System.faceted: const Color(0xFFFF00FF),
      Vib3System.holographic: const Color(0xFFFFFF00),
    };

    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: systemColors[_controller.params.system]!
                .withOpacity(0.1 + _pulseController.value * 0.1),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: systemColors[_controller.params.system]!.withOpacity(0.5),
            ),
          ),
          child: Text(
            _controller.params.system.name.toUpperCase(),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: systemColors[_controller.params.system],
              letterSpacing: 1,
            ),
          ),
        );
      },
    );
  }

  Widget _buildGeometryChip() {
    final (baseIndex, coreIndex) =
        Vib3Geometry.decode(_controller.params.geometry);
    final baseName = Vib3Geometry.baseNames[baseIndex];
    final coreName = Vib3Geometry.coreNames[coreIndex];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            baseName,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          if (coreIndex > 0) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF00FF88).withOpacity(0.3),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                coreName,
                style: const TextStyle(
                  fontSize: 10,
                  color: Color(0xFF00FF88),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildVisualizationArea() {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF00FF88).withOpacity(0.3),
          width: 2,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF00FF88).withOpacity(0.1),
            blurRadius: 20,
            spreadRadius: 5,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          children: [
            // Placeholder visualization
            Center(
              child: _buildPlaceholderVisualization(),
            ),

            // Parameter overlay
            Positioned(
              left: 12,
              bottom: 12,
              child: _buildParameterOverlay(),
            ),

            // FPS counter (simulated)
            Positioned(
              right: 12,
              top: 12,
              child: _buildFpsCounter(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceholderVisualization() {
    // This would be replaced with actual WebView/Canvas in production
    return AnimatedBuilder(
      animation: _bgAnimController,
      builder: (context, child) {
        final rotation = _bgAnimController.value * math.pi * 2;

        return CustomPaint(
          size: const Size(300, 300),
          painter: _GeometryPainter(
            geometry: _controller.params.geometry,
            rotation: rotation,
            hue: _controller.params.hue,
            rot4dXW: _controller.params.rot4dXW,
            rot4dYW: _controller.params.rot4dYW,
            rot4dZW: _controller.params.rot4dZW,
          ),
        );
      },
    );
  }

  Widget _buildParameterOverlay() {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.7),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _paramRow('Geometry', '${_controller.params.geometry}'),
          _paramRow('Dimension', _controller.params.dimension.toStringAsFixed(2)),
          _paramRow('XW', _controller.params.rot4dXW.toStringAsFixed(2)),
          _paramRow('YW', _controller.params.rot4dYW.toStringAsFixed(2)),
          _paramRow('ZW', _controller.params.rot4dZW.toStringAsFixed(2)),
        ],
      ),
    );
  }

  Widget _paramRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 10,
              color: Colors.white.withOpacity(0.6),
              fontFamily: 'monospace',
            ),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 10,
              color: Color(0xFF00FF88),
              fontFamily: 'monospace',
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFpsCounter() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.7),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        '60 FPS',
        style: TextStyle(
          fontSize: 12,
          color: Color(0xFF00FF88),
          fontFamily: 'monospace',
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildControlsPanel() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withOpacity(0.1),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // System selector
          _buildSystemSelector(),
          const SizedBox(height: 16),

          // Geometry selector
          _buildGeometrySelector(),
          const SizedBox(height: 16),

          // Quick rotation presets
          _buildRotationPresets(),

          // Advanced controls toggle
          TextButton(
            onPressed: () => setState(() => _showAdvanced = !_showAdvanced),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _showAdvanced ? 'Hide Advanced' : 'Show Advanced',
                  style: TextStyle(color: Colors.white.withOpacity(0.7)),
                ),
                Icon(
                  _showAdvanced ? Icons.expand_less : Icons.expand_more,
                  color: Colors.white.withOpacity(0.7),
                ),
              ],
            ),
          ),

          // Advanced controls
          if (_showAdvanced) _buildAdvancedControls(),
        ],
      ),
    );
  }

  Widget _buildSystemSelector() {
    return Row(
      children: [
        const Text(
          'System',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: SegmentedButton<Vib3System>(
            segments: const [
              ButtonSegment(
                value: Vib3System.quantum,
                label: Text('Quantum'),
                icon: Icon(Icons.blur_on, size: 16),
              ),
              ButtonSegment(
                value: Vib3System.faceted,
                label: Text('Faceted'),
                icon: Icon(Icons.hexagon_outlined, size: 16),
              ),
              ButtonSegment(
                value: Vib3System.holographic,
                label: Text('Holo'),
                icon: Icon(Icons.auto_awesome, size: 16),
              ),
            ],
            selected: {_controller.params.system},
            onSelectionChanged: (selected) {
              setState(() {
                _controller.setSystem(selected.first);
              });
            },
            style: ButtonStyle(
              backgroundColor: MaterialStateProperty.resolveWith((states) {
                if (states.contains(MaterialState.selected)) {
                  return const Color(0xFF00FF88).withOpacity(0.2);
                }
                return Colors.transparent;
              }),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGeometrySelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Geometry',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 12,
                fontWeight: FontWeight.bold,
              ),
            ),
            const Spacer(),
            Text(
              '${_controller.params.geometry}/23',
              style: const TextStyle(
                color: Color(0xFF00FF88),
                fontSize: 12,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Base geometry buttons
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: List.generate(8, (baseIndex) {
            final isSelected =
                _controller.params.geometry % 8 == baseIndex;
            return _GeometryButton(
              label: Vib3Geometry.baseNames[baseIndex],
              isSelected: isSelected,
              onTap: () {
                setState(() {
                  final coreIndex = _controller.params.geometry ~/ 8;
                  _controller.setGeometry(Vib3Geometry.encode(baseIndex, coreIndex));
                });
              },
            );
          }),
        ),
        const SizedBox(height: 8),
        // Core type buttons
        Row(
          children: [
            const Text(
              'Core:',
              style: TextStyle(color: Colors.white54, fontSize: 11),
            ),
            const SizedBox(width: 8),
            ...List.generate(3, (coreIndex) {
              final isSelected =
                  _controller.params.geometry ~/ 8 == coreIndex;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _CoreButton(
                  label: Vib3Geometry.coreNames[coreIndex],
                  isSelected: isSelected,
                  onTap: () {
                    setState(() {
                      final baseIndex = _controller.params.geometry % 8;
                      _controller.setGeometry(Vib3Geometry.encode(baseIndex, coreIndex));
                    });
                  },
                ),
              );
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildRotationPresets() {
    return Row(
      children: [
        const Text(
          'Presets',
          style: TextStyle(
            color: Colors.white70,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Wrap(
            spacing: 8,
            children: [
              _PresetButton(
                label: 'Calm',
                onTap: () => setState(() => _controller.applyPreset('calm')),
              ),
              _PresetButton(
                label: 'Spin',
                onTap: () => setState(() => _controller.applyPreset('spin')),
              ),
              _PresetButton(
                label: 'Chaos',
                onTap: () => setState(() => _controller.applyPreset('chaos')),
              ),
              _PresetButton(
                label: 'Reset',
                onTap: () => setState(() => _controller.reset()),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAdvancedControls() {
    return Column(
      children: [
        const Divider(color: Colors.white24),
        const SizedBox(height: 8),

        // 4D Rotation sliders
        _buildSlider(
          label: 'XW Rotation',
          value: _controller.params.rot4dXW,
          onChanged: (v) => setState(() => _controller.params.rot4dXW = v),
        ),
        _buildSlider(
          label: 'YW Rotation',
          value: _controller.params.rot4dYW,
          onChanged: (v) => setState(() => _controller.params.rot4dYW = v),
        ),
        _buildSlider(
          label: 'ZW Rotation',
          value: _controller.params.rot4dZW,
          onChanged: (v) => setState(() => _controller.params.rot4dZW = v),
        ),

        const SizedBox(height: 8),

        // Visual parameters
        _buildSlider(
          label: 'Dimension',
          value: _controller.params.dimension,
          min: 3.0,
          max: 4.5,
          onChanged: (v) => setState(() => _controller.params.dimension = v),
        ),
        _buildSlider(
          label: 'Hue',
          value: _controller.params.hue,
          min: 0,
          max: 360,
          onChanged: (v) => setState(() => _controller.params.hue = v),
        ),
        _buildSlider(
          label: 'Intensity',
          value: _controller.params.intensity,
          min: 0,
          max: 1,
          onChanged: (v) => setState(() => _controller.params.intensity = v),
        ),
      ],
    );
  }

  Widget _buildSlider({
    required String label,
    required double value,
    double min = 0,
    double max = 6.28,
    required ValueChanged<double> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 11,
              ),
            ),
          ),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: const Color(0xFF00FF88),
                inactiveTrackColor: Colors.white24,
                thumbColor: const Color(0xFF00FF88),
                overlayColor: const Color(0xFF00FF88).withOpacity(0.2),
                trackHeight: 2,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              ),
              child: Slider(
                value: value.clamp(min, max),
                min: min,
                max: max,
                onChanged: onChanged,
              ),
            ),
          ),
          SizedBox(
            width: 50,
            child: Text(
              value.toStringAsFixed(2),
              style: const TextStyle(
                color: Color(0xFF00FF88),
                fontSize: 11,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Custom button widgets

class _GeometryButton extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _GeometryButton({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFF00FF88).withOpacity(0.2)
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF00FF88)
                : Colors.white.withOpacity(0.2),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: isSelected ? const Color(0xFF00FF88) : Colors.white70,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}

class _CoreButton extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _CoreButton({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected
              ? const Color(0xFFFF00FF).withOpacity(0.2)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? const Color(0xFFFF00FF)
                : Colors.white.withOpacity(0.3),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: isSelected ? const Color(0xFFFF00FF) : Colors.white54,
          ),
        ),
      ),
    );
  }
}

class _PresetButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _PresetButton({
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white.withOpacity(0.1),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }
}

// Custom painter for placeholder visualization
class _GeometryPainter extends CustomPainter {
  final int geometry;
  final double rotation;
  final double hue;
  final double rot4dXW;
  final double rot4dYW;
  final double rot4dZW;

  _GeometryPainter({
    required this.geometry,
    required this.rotation,
    required this.hue,
    required this.rot4dXW,
    required this.rot4dYW,
    required this.rot4dZW,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final baseIndex = geometry % 8;
    final coreIndex = geometry ~/ 8;

    // Base color from hue
    final color = HSLColor.fromAHSL(1.0, hue, 0.8, 0.5).toColor();

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final fillPaint = Paint()
      ..color = color.withOpacity(0.1)
      ..style = PaintingStyle.fill;

    // Apply 4D rotation effect to size
    final w4d = 1.0 + math.sin(rot4dXW) * 0.2 + math.cos(rot4dYW) * 0.15;
    final radius = 80.0 * w4d;

    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate(rotation + rot4dZW);

    // Draw different shapes based on base geometry
    switch (baseIndex) {
      case 0: // Tetrahedron
        _drawTetrahedron(canvas, radius, paint, fillPaint);
        break;
      case 1: // Hypercube
        _drawHypercube(canvas, radius, paint, fillPaint, rot4dXW);
        break;
      case 2: // Sphere
        _drawSphere(canvas, radius, paint, fillPaint);
        break;
      case 3: // Torus
        _drawTorus(canvas, radius, paint, coreIndex);
        break;
      case 4: // Klein Bottle
        _drawKleinBottle(canvas, radius, paint);
        break;
      case 5: // Fractal
        _drawFractal(canvas, radius, paint, 4);
        break;
      case 6: // Wave
        _drawWave(canvas, radius, paint, rotation);
        break;
      case 7: // Crystal
        _drawCrystal(canvas, radius, paint, fillPaint);
        break;
    }

    // Add core type overlay
    if (coreIndex > 0) {
      _drawCoreOverlay(canvas, radius, coreIndex, paint);
    }

    canvas.restore();
  }

  void _drawTetrahedron(Canvas canvas, double r, Paint paint, Paint fill) {
    final path = Path();
    for (int i = 0; i < 3; i++) {
      final angle = i * math.pi * 2 / 3 - math.pi / 2;
      final x = math.cos(angle) * r;
      final y = math.sin(angle) * r;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();
    canvas.drawPath(path, fill);
    canvas.drawPath(path, paint);

    // Draw lines to center
    for (int i = 0; i < 3; i++) {
      final angle = i * math.pi * 2 / 3 - math.pi / 2;
      canvas.drawLine(
        Offset.zero,
        Offset(math.cos(angle) * r, math.sin(angle) * r),
        paint,
      );
    }
  }

  void _drawHypercube(Canvas canvas, double r, Paint paint, Paint fill, double w) {
    final inner = r * 0.5;
    final outer = r;

    // Outer square
    canvas.drawRect(
      Rect.fromCenter(center: Offset.zero, width: outer * 2, height: outer * 2),
      paint,
    );

    // Inner square (rotated by 4D projection)
    canvas.save();
    canvas.rotate(w * 0.5);
    canvas.drawRect(
      Rect.fromCenter(center: Offset.zero, width: inner * 2, height: inner * 2),
      paint,
    );
    canvas.restore();

    // Connect corners
    for (int i = 0; i < 4; i++) {
      final outerAngle = i * math.pi / 2 + math.pi / 4;
      final innerAngle = outerAngle + w * 0.5;
      canvas.drawLine(
        Offset(math.cos(outerAngle) * outer * 1.414, math.sin(outerAngle) * outer * 1.414),
        Offset(math.cos(innerAngle) * inner * 1.414, math.sin(innerAngle) * inner * 1.414),
        paint,
      );
    }
  }

  void _drawSphere(Canvas canvas, double r, Paint paint, Paint fill) {
    canvas.drawCircle(Offset.zero, r, fill);
    canvas.drawCircle(Offset.zero, r, paint);

    // Latitude lines
    for (int i = 1; i < 4; i++) {
      final lat = r * i / 4;
      canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: r * 2, height: lat * 2),
        paint..color = paint.color.withOpacity(0.3),
      );
    }
    paint.color = paint.color.withOpacity(1);
  }

  void _drawTorus(Canvas canvas, double r, Paint paint, int core) {
    final majorR = r;
    final minorR = r * 0.3;

    for (int i = 0; i < 24; i++) {
      final angle = i * math.pi * 2 / 24;
      final x = math.cos(angle) * majorR;
      final y = math.sin(angle) * majorR * 0.3;
      canvas.drawCircle(Offset(x, y), minorR * (0.5 + math.sin(angle) * 0.5), paint);
    }
  }

  void _drawKleinBottle(Canvas canvas, double r, Paint paint) {
    final path = Path();
    for (int i = 0; i <= 100; i++) {
      final t = i / 100 * math.pi * 2;
      final x = math.cos(t) * (r + math.sin(t * 2) * r * 0.3);
      final y = math.sin(t) * r * 0.8 + math.cos(t * 3) * r * 0.2;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);
  }

  void _drawFractal(Canvas canvas, double r, Paint paint, int depth) {
    if (depth <= 0) return;

    canvas.drawCircle(Offset.zero, r, paint);

    if (depth > 1) {
      for (int i = 0; i < 6; i++) {
        final angle = i * math.pi / 3;
        canvas.save();
        canvas.translate(math.cos(angle) * r * 0.7, math.sin(angle) * r * 0.7);
        _drawFractal(canvas, r * 0.35, paint, depth - 1);
        canvas.restore();
      }
    }
  }

  void _drawWave(Canvas canvas, double r, Paint paint, double phase) {
    final path = Path();
    for (int i = 0; i <= 100; i++) {
      final t = i / 100 * math.pi * 4 - math.pi * 2;
      final x = t / math.pi * r / 2;
      final y = math.sin(t + phase * 3) * r * 0.5;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(path, paint);

    // Second wave
    final path2 = Path();
    for (int i = 0; i <= 100; i++) {
      final t = i / 100 * math.pi * 4 - math.pi * 2;
      final x = t / math.pi * r / 2;
      final y = math.cos(t + phase * 2) * r * 0.3;
      if (i == 0) {
        path2.moveTo(x, y);
      } else {
        path2.lineTo(x, y);
      }
    }
    canvas.drawPath(path2, paint..color = paint.color.withOpacity(0.5));
    paint.color = paint.color.withOpacity(1);
  }

  void _drawCrystal(Canvas canvas, double r, Paint paint, Paint fill) {
    // Octahedron projection
    final path = Path();
    for (int i = 0; i < 4; i++) {
      final angle = i * math.pi / 2;
      final x = math.cos(angle) * r;
      final y = math.sin(angle) * r;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();
    canvas.drawPath(path, fill);
    canvas.drawPath(path, paint);

    // Draw to top and bottom points
    for (int i = 0; i < 4; i++) {
      final angle = i * math.pi / 2;
      canvas.drawLine(
        Offset(math.cos(angle) * r, math.sin(angle) * r),
        const Offset(0, 0),
        paint,
      );
    }
  }

  void _drawCoreOverlay(Canvas canvas, double r, int core, Paint paint) {
    final overlayPaint = Paint()
      ..color = core == 1
          ? const Color(0xFF00FFFF).withOpacity(0.3)
          : const Color(0xFFFF00FF).withOpacity(0.3)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    if (core == 1) {
      // Hypersphere - concentric circles
      for (int i = 1; i <= 3; i++) {
        canvas.drawCircle(Offset.zero, r * i / 3, overlayPaint);
      }
    } else {
      // Hypertetrahedron - triangular pattern
      for (int i = 0; i < 3; i++) {
        final angle = i * math.pi * 2 / 3 + math.pi / 6;
        canvas.drawLine(
          Offset.zero,
          Offset(math.cos(angle) * r * 1.2, math.sin(angle) * r * 1.2),
          overlayPaint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GeometryPainter oldDelegate) {
    return geometry != oldDelegate.geometry ||
        rotation != oldDelegate.rotation ||
        hue != oldDelegate.hue ||
        rot4dXW != oldDelegate.rot4dXW ||
        rot4dYW != oldDelegate.rot4dYW ||
        rot4dZW != oldDelegate.rot4dZW;
  }
}
