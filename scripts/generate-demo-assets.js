#!/usr/bin/env node
/**
 * VIB3+ SDK Asset Generator
 * Generates sample configurations and asset files demonstrating the SDK capabilities
 *
 * Usage: node scripts/generate-demo-assets.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Output directory
const OUTPUT_DIR = './demo-assets';

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎨 VIB3+ SDK Asset Generator\n');
console.log('=' .repeat(50));

// ============================================
// 1. Generate JSON Configurations for All 24 Geometries
// ============================================

console.log('\n📦 Generating geometry configurations...\n');

const BASE_GEOMETRIES = [
    'Tetrahedron', 'Hypercube', 'Sphere', 'Torus',
    'Klein Bottle', 'Fractal', 'Wave', 'Crystal'
];

const CORE_TYPES = ['Base', 'Hypersphere', 'Hypertetrahedron'];

const configurations = [];

for (let coreIndex = 0; coreIndex < 3; coreIndex++) {
    for (let baseIndex = 0; baseIndex < 8; baseIndex++) {
        const geometryIndex = coreIndex * 8 + baseIndex;
        const config = {
            version: '2.0',
            type: 'vib3-sdk-config',
            name: `${CORE_TYPES[coreIndex]} ${BASE_GEOMETRIES[baseIndex]}`,
            geometryIndex,
            encoding: {
                formula: 'geometry = coreIndex * 8 + baseIndex',
                coreIndex,
                baseIndex,
                coreType: CORE_TYPES[coreIndex],
                baseGeometry: BASE_GEOMETRIES[baseIndex]
            },
            parameters: {
                geometry: geometryIndex,
                gridDensity: 15,
                morphFactor: 1.0,
                chaos: 0.2,
                speed: 1.0,
                hue: (geometryIndex * 15) % 360,
                intensity: 0.7,
                saturation: 0.8,
                rot4dXY: 0,
                rot4dXZ: 0,
                rot4dYZ: 0,
                rot4dXW: geometryIndex * 0.1,
                rot4dYW: geometryIndex * 0.05,
                rot4dZW: geometryIndex * 0.08
            },
            timestamp: Date.now(),
            metadata: {
                sdk: 'VIB3+ SDK v1.9.0',
                author: 'Demo Generator'
            }
        };

        configurations.push(config);

        const filename = `geometry-${String(geometryIndex).padStart(2, '0')}-${CORE_TYPES[coreIndex].toLowerCase()}-${BASE_GEOMETRIES[baseIndex].toLowerCase().replace(' ', '-')}.json`;
        writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(config, null, 2));
        console.log(`  ✅ ${filename}`);
    }
}

// ============================================
// 2. Generate Gallery Collection
// ============================================

console.log('\n📚 Generating gallery collection...\n');

const galleryCollection = {
    name: 'VIB3+ Complete Geometry Gallery',
    description: 'All 24 geometry variants with 6D rotation',
    version: '1.0',
    type: 'vib3-gallery-collection',
    totalVariations: 24,
    created: new Date().toISOString(),
    systems: ['quantum', 'faceted', 'holographic'],
    variations: configurations.map((config, index) => ({
        id: index,
        name: config.name,
        geometryIndex: config.geometryIndex,
        encoding: config.encoding,
        parameters: config.parameters,
        system: index % 3 === 0 ? 'quantum' : (index % 3 === 1 ? 'faceted' : 'holographic')
    }))
};

writeFileSync(
    join(OUTPUT_DIR, 'gallery-collection.json'),
    JSON.stringify(galleryCollection, null, 2)
);
console.log('  ✅ gallery-collection.json');

// ============================================
// 3. Generate SVG Previews
// ============================================

console.log('\n🎨 Generating SVG previews...\n');

function generateSVGPreview(config) {
    const { geometryIndex, parameters, encoding } = config;
    const hue = parameters.hue;
    const coreType = encoding.coreType;

    // Generate geometry path based on type
    let path = '';
    const baseType = encoding.baseIndex;

    switch (baseType) {
        case 0: // Tetrahedron
            path = 'M50 20 L80 70 L20 70 Z M50 20 L50 50 L80 70 M50 50 L20 70';
            break;
        case 1: // Hypercube
            path = 'M25 25 L75 25 L75 75 L25 75 Z M35 35 L85 35 L85 85 L35 85 Z M25 25 L35 35 M75 25 L85 35 M75 75 L85 85 M25 75 L35 85';
            break;
        case 2: // Sphere
            path = 'M50 10 A40 40 0 1 1 49.99 10 M10 50 A40 20 0 1 1 90 50 A40 20 0 1 1 10 50';
            break;
        case 3: // Torus
            path = 'M50 30 A30 15 0 1 1 49.99 30 M50 70 A30 15 0 1 1 49.99 70 M20 50 Q20 30 50 30 Q80 30 80 50 Q80 70 50 70 Q20 70 20 50';
            break;
        case 4: // Klein Bottle
            path = 'M30 80 Q10 50 30 20 Q50 0 70 20 Q90 50 70 80 Q60 90 50 70 Q40 50 50 30 Q60 20 70 30 Q75 40 70 50';
            break;
        case 5: // Fractal
            path = 'M50 10 L90 90 L10 90 Z M50 40 L70 80 L30 80 Z M50 55 L60 75 L40 75 Z';
            break;
        case 6: // Wave
            path = 'M10 50 Q25 20 40 50 Q55 80 70 50 Q85 20 100 50 M10 60 Q25 30 40 60 Q55 90 70 60 Q85 30 100 60';
            break;
        case 7: // Crystal
            path = 'M50 10 L80 40 L80 60 L50 90 L20 60 L20 40 Z M50 10 L50 90 M20 40 L80 60 M80 40 L20 60';
            break;
    }

    // Core type modifiers
    let coreOverlay = '';
    if (coreType === 'Hypersphere') {
        coreOverlay = `<circle cx="50" cy="50" r="45" fill="none" stroke="hsl(${hue}, 70%, 60%)" stroke-width="1" stroke-dasharray="5,3" opacity="0.5"/>`;
    } else if (coreType === 'Hypertetrahedron') {
        coreOverlay = `<path d="M50 5 L95 90 L5 90 Z" fill="none" stroke="hsl(${hue}, 70%, 60%)" stroke-width="1" stroke-dasharray="3,5" opacity="0.5"/>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <defs>
    <linearGradient id="grad${geometryIndex}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(${hue}, 70%, 40%);stop-opacity:1" />
      <stop offset="100%" style="stop-color:hsl(${(hue + 60) % 360}, 70%, 60%);stop-opacity:1" />
    </linearGradient>
    <filter id="glow${geometryIndex}">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100" height="100" fill="#0a0a0f"/>
  ${coreOverlay}
  <path d="${path}" fill="none" stroke="url(#grad${geometryIndex})" stroke-width="2" filter="url(#glow${geometryIndex})"/>
  <text x="50" y="96" text-anchor="middle" fill="white" font-size="6" font-family="monospace">${config.name}</text>
</svg>`;

    return svg;
}

// Generate SVGs for each geometry
for (const config of configurations) {
    const svg = generateSVGPreview(config);
    const filename = `preview-${String(config.geometryIndex).padStart(2, '0')}.svg`;
    writeFileSync(join(OUTPUT_DIR, filename), svg);
    console.log(`  ✅ ${filename}`);
}

// ============================================
// 4. Generate HTML Gallery Page
// ============================================

console.log('\n🌐 Generating HTML gallery...\n');

const htmlGallery = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VIB3+ SDK - 24 Geometry Gallery</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0a0a0f;
            color: white;
            padding: 20px;
        }
        h1 {
            text-align: center;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #00ffff, #ff00ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 30px;
        }
        .encoding-info {
            background: #1a1a2e;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            text-align: center;
            font-family: monospace;
        }
        .encoding-info code {
            color: #00ff88;
            font-size: 16px;
        }
        .core-section {
            margin-bottom: 40px;
        }
        .core-title {
            font-size: 18px;
            color: #00ffff;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 1px solid #333;
        }
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
        }
        .card {
            background: #12121a;
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.3s, box-shadow 0.3s;
            border: 1px solid #333;
        }
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,255,255,0.2);
        }
        .card img {
            width: 100%;
            height: 200px;
            object-fit: contain;
            background: #0a0a0f;
        }
        .card-info {
            padding: 15px;
        }
        .card-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .card-meta {
            font-size: 11px;
            color: #666;
        }
        .geometry-badge {
            display: inline-block;
            background: #00ff88;
            color: #000;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            margin-top: 8px;
        }
        footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #333;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>VIB3+ SDK Geometry Gallery</h1>
    <p class="subtitle">24 Geometries = 8 Base × 3 Core Types</p>

    <div class="encoding-info">
        <code>geometry_index = core_index × 8 + base_index</code>
        <br><br>
        <span style="color:#888">Base (0-7): Tetrahedron, Hypercube, Sphere, Torus, Klein Bottle, Fractal, Wave, Crystal</span>
        <br>
        <span style="color:#888">Core (0-2): Base, Hypersphere, Hypertetrahedron</span>
    </div>

    ${CORE_TYPES.map((coreType, coreIndex) => `
    <div class="core-section">
        <h2 class="core-title">${coreType} Core (${coreIndex * 8}-${coreIndex * 8 + 7})</h2>
        <div class="gallery">
            ${BASE_GEOMETRIES.map((baseName, baseIndex) => {
                const geoIndex = coreIndex * 8 + baseIndex;
                return `
            <div class="card">
                <img src="preview-${String(geoIndex).padStart(2, '0')}.svg" alt="${coreType} ${baseName}">
                <div class="card-info">
                    <div class="card-title">${baseName}</div>
                    <div class="card-meta">Core: ${coreType} | Base: ${baseIndex}</div>
                    <span class="geometry-badge">Geometry ${geoIndex}</span>
                </div>
            </div>`;
            }).join('')}
        </div>
    </div>`).join('')}

    <footer>
        VIB3+ SDK v1.9.0 | Generated ${new Date().toISOString()}
        <br>
        6D Rotation: XY, XZ, YZ (3D) + XW, YW, ZW (4D Hyperspace)
    </footer>
</body>
</html>`;

writeFileSync(join(OUTPUT_DIR, 'geometry-gallery.html'), htmlGallery);
console.log('  ✅ geometry-gallery.html');

// ============================================
// 5. Generate API Usage Examples
// ============================================

console.log('\n📝 Generating API examples...\n');

const apiExamples = `// VIB3+ SDK API Usage Examples
// Generated: ${new Date().toISOString()}

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
`;

writeFileSync(join(OUTPUT_DIR, 'api-examples.js'), apiExamples);
console.log('  ✅ api-examples.js');

// ============================================
// 6. Summary Report
// ============================================

console.log('\n' + '=' .repeat(50));
console.log('\n✨ DEMO ASSET GENERATION COMPLETE\n');
console.log(`Output directory: ${OUTPUT_DIR}/`);
console.log(`
Files generated:
  📦 24 geometry configuration JSONs
  📚 1 gallery collection (gallery-collection.json)
  🎨 24 SVG preview images
  🌐 1 HTML gallery page (geometry-gallery.html)
  📝 1 API examples file (api-examples.js)

Total files: 51

Key numbers:
  • 24 geometries (8 base × 3 core types)
  • 6 rotation planes (XY, XZ, YZ, XW, YW, ZW)
  • 5 canvas layers per system
  • 3 active visualization systems

Open ${OUTPUT_DIR}/geometry-gallery.html to view the gallery!
`);
