/// VIB3+ Flutter Demo
///
/// Demonstrates the VIB3+ 4D visualization engine integration with Flutter.
/// Features:
/// - 24 geometry variants (8 base × 3 core types)
/// - 6D rotation controls (XY, XZ, YZ, XW, YW, ZW)
/// - 3 visualization systems (Quantum, Faceted, Holographic)
/// - Responsive layout with animated background

import 'package:flutter/material.dart';
import 'vib3_demo.dart';

void main() {
  runApp(const Vib3DemoApp());
}

class Vib3DemoApp extends StatelessWidget {
  const Vib3DemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VIB3+ Flutter Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF00FF88),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: Colors.black,
      ),
      home: const Vib3DemoScreen(),
    );
  }
}
