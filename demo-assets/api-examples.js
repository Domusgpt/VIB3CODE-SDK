// VIB3+ SDK API Usage Examples
// Generated: 2026-01-25T05:57:04.425Z

// ============================================
// 1. Basic Engine Initialization
// ============================================

import { VIB3Engine } from './src/core/VIB3Engine.js';

const engine = new VIB3Engine();
await engine.init({ canvas: document.getElementById('myCanvas') });
engine.setActive(true);

// ============================================
// 2. Switch Between Systems
// ============================================

// Switch to Quantum system (complex 3D lattices)
engine.switchSystem('quantum');

// Switch to Faceted system (clean 2D patterns)
engine.switchSystem('faceted');

// Switch to Holographic system (5-layer audio-reactive)
engine.switchSystem('holographic');

// ============================================
// 3. Set Geometry (0-23)
// ============================================

// Geometry encoding: geometry = coreType * 8 + baseGeometry
// Base geometries (0-7): Tetrahedron, Hypercube, Sphere, Torus, Klein Bottle, Fractal, Wave, Crystal
// Core types (0-2): Base, Hypersphere, Hypertetrahedron

// Set to Hypersphere Torus (1*8 + 3 = 11)
engine.setGeometry(11);

// Or use helper
engine.setGeometry(1 * 8 + 3); // core=Hypersphere, base=Torus

// ============================================
// 4. Apply 6D Rotation
// ============================================

engine.updateParameters({
    // 3D space rotations
    rot4dXY: Math.PI / 4,
    rot4dXZ: Math.PI / 6,
    rot4dYZ: Math.PI / 3,
    // 4D hyperspace rotations
    rot4dXW: 0.5,
    rot4dYW: 0.3,
    rot4dZW: 0.2
});

// ============================================
// 5. Visual Parameters
// ============================================

engine.updateParameters({
    hue: 200,           // Base color (0-360)
    intensity: 0.7,     // Brightness (0-1)
    saturation: 0.8,    // Color saturation (0-1)
    gridDensity: 15,    // Grid detail level (4-100)
    morphFactor: 1.0,   // Shape morphing (0-2)
    chaos: 0.2,         // Randomness (0-1)
    speed: 1.0          // Animation speed (0.1-3)
});

// ============================================
// 6. RendererContract Methods (All Systems)
// ============================================

// All systems implement these standard methods:
engine.currentEngine.init({ canvas });      // Initialize
engine.currentEngine.resize(800, 600, 2);   // Resize (width, height, pixelRatio)
engine.currentEngine.render({ time: 1.5 }); // Render frame
engine.currentEngine.setActive(true);       // Activate
engine.currentEngine.dispose();             // Clean up

// ============================================
// 7. WebGPU Backend (Experimental)
// ============================================

import { WebGPURenderer, enableWebGPU, checkWebGPUSupport } from './webgpu';

// Check and enable WebGPU
const support = await checkWebGPUSupport();
if (support.supported) {
    enableWebGPU();
    const gpuRenderer = new WebGPURenderer();
    await gpuRenderer.init({ canvas });
}

// ============================================
// 8. MCP Agent Integration
// ============================================

// Get SDK context for AI agents
const context = await mcpClient.call('get_sdk_context');

// Verify agent knowledge
const result = await mcpClient.call('verify_knowledge', {
    q1_rotation_planes: 'c',  // 6 planes
    q2_geometry_formula: 'b', // core*8+base
    q3_canvas_layers: 'c'     // 5 layers
});

// ============================================
// 9. Export Configurations
// ============================================

// Export current state as JSON
const config = {
    version: '2.0',
    type: 'vib3-sdk-config',
    parameters: engine.getParameters(),
    timestamp: Date.now()
};

// Save to gallery
engine.exportManager.saveToGallery('My Custom Variation');

// Export as PNG
engine.exportManager.exportPNG();

// Export as standalone HTML
engine.exportManager.exportHTML();
