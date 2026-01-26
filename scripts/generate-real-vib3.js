#!/usr/bin/env node
/**
 * VIB3+ Real Shader Export Generator
 *
 * This script demonstrates agentic control of VIB3+ by:
 * 1. Using MCP tools to configure visualizations
 * 2. Exporting REAL shaders (Quantum, Faceted, Holographic)
 * 3. Generating standalone HTML with full reactivity
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

// Import the real ShaderExporter
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import for ShaderExporter
const ShaderExporter = (await import('../src/export/ShaderExporter.js')).default;

console.log('═'.repeat(70));
console.log('  VIB3+ REAL SHADER EXPORT GENERATOR');
console.log('  Generating ACTUAL Quantum/Faceted/Holographic visualizations');
console.log('═'.repeat(70));
console.log();

// Output directory
const outputDir = join(__dirname, '../docs/vib3-exports');
if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
}

// Visualization configurations - demonstrating the 24 geometry system
const visualizations = [
    // QUANTUM SYSTEM - Complex lattice with holographic effects
    {
        name: 'Quantum Tetrahedron Lattice',
        description: 'Base tetrahedron geometry with quantum lattice shader - 4D rotation creates volumetric interference patterns',
        system: 'quantum',
        geometry: 0,
        parameters: {
            gridDensity: 18,
            morphFactor: 1.2,
            chaos: 0.15,
            speed: 0.8,
            hue: 180,
            intensity: 0.75,
            saturation: 0.85,
            dimension: 3.6,
            rot4dXW: 0.3,
            rot4dYW: 0.5,
            rot4dZW: 0.2
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.5 } }
    },
    {
        name: 'Quantum Hypersphere Matrix',
        description: 'Hypersphere-warped hypercube - creates complex 4D projection effects with S³ manifold topology',
        system: 'quantum',
        geometry: 9, // Hypersphere + Hypercube
        parameters: {
            gridDensity: 22,
            morphFactor: 1.5,
            chaos: 0.2,
            speed: 0.6,
            hue: 280,
            intensity: 0.8,
            saturation: 0.9,
            dimension: 3.8,
            rot4dXW: 0.8,
            rot4dYW: 0.4,
            rot4dZW: 0.6
        },
        reactivity: { audio: { enabled: true, sensitivity: 2.0 } }
    },
    {
        name: 'Quantum Hypertetra Fractal',
        description: 'Hypertetrahedron core with fractal base - 5-cell pentatope projection creates recursive self-similar structures',
        system: 'quantum',
        geometry: 21, // Hypertetra + Fractal
        parameters: {
            gridDensity: 25,
            morphFactor: 1.8,
            chaos: 0.35,
            speed: 0.5,
            hue: 60,
            intensity: 0.85,
            saturation: 0.75,
            dimension: 4.0,
            rot4dXW: 1.2,
            rot4dYW: 0.9,
            rot4dZW: 1.5
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.8 } }
    },

    // FACETED SYSTEM - Clean SDF geometry
    {
        name: 'Faceted Crystal Structure',
        description: 'Clean SDF crystal geometry - sharp faceted edges with 4D rotation projection',
        system: 'faceted',
        geometry: 7, // Crystal
        parameters: {
            gridDensity: 12,
            morphFactor: 1.0,
            chaos: 0.1,
            speed: 1.0,
            hue: 220,
            intensity: 0.9,
            rot4dXW: 0.4,
            rot4dYW: 0.6,
            rot4dZW: 0.3
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.2 } }
    },
    {
        name: 'Faceted Klein Bottle',
        description: 'Non-orientable surface with faceted rendering - mathematically impossible 4D object projected to screen',
        system: 'faceted',
        geometry: 12, // Hypersphere + Klein Bottle
        parameters: {
            gridDensity: 15,
            morphFactor: 1.3,
            chaos: 0.25,
            speed: 0.7,
            hue: 320,
            intensity: 0.8,
            rot4dXW: 0.7,
            rot4dYW: 0.5,
            rot4dZW: 0.8
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.5 } }
    },
    {
        name: 'Faceted Hypertetra Torus',
        description: 'Hypertetrahedron-warped torus - creates complex toroidal structures through 5-cell projection',
        system: 'faceted',
        geometry: 19, // Hypertetra + Torus
        parameters: {
            gridDensity: 18,
            morphFactor: 1.6,
            chaos: 0.2,
            speed: 0.8,
            hue: 45,
            intensity: 0.85,
            rot4dXW: 1.0,
            rot4dYW: 0.8,
            rot4dZW: 1.2
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.6 } }
    },

    // HOLOGRAPHIC SYSTEM - 5-layer glassmorphic effects
    {
        name: 'Holographic Wave Field',
        description: 'Holographic wave interference patterns - 5-layer glassmorphic rendering with shimmer effects',
        system: 'holographic',
        geometry: 6, // Wave
        parameters: {
            gridDensity: 20,
            morphFactor: 1.1,
            chaos: 0.3,
            speed: 1.2,
            hue: 160,
            intensity: 0.7,
            rot4dXW: 0.5,
            rot4dYW: 0.7,
            rot4dZW: 0.4
        },
        reactivity: { audio: { enabled: true, sensitivity: 2.0 } }
    },
    {
        name: 'Holographic Hypersphere Sphere',
        description: 'Hypersphere-warped sphere - creates S³ manifold projection with holographic depth layers',
        system: 'holographic',
        geometry: 10, // Hypersphere + Sphere
        parameters: {
            gridDensity: 16,
            morphFactor: 1.4,
            chaos: 0.15,
            speed: 0.9,
            hue: 200,
            intensity: 0.8,
            rot4dXW: 0.6,
            rot4dYW: 0.4,
            rot4dZW: 0.5
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.8 } }
    },
    {
        name: 'Holographic Hypertetra Crystal',
        description: 'Hypertetrahedron crystal lattice - 5-cell pentatope projection with crystalline holographic shimmer',
        system: 'holographic',
        geometry: 23, // Hypertetra + Crystal
        parameters: {
            gridDensity: 24,
            morphFactor: 1.7,
            chaos: 0.25,
            speed: 0.6,
            hue: 300,
            intensity: 0.85,
            rot4dXW: 1.1,
            rot4dYW: 0.9,
            rot4dZW: 1.3
        },
        reactivity: { audio: { enabled: true, sensitivity: 1.5 } }
    }
];

console.log(`Generating ${visualizations.length} real VIB3+ visualizations...\n`);

const generated = [];

visualizations.forEach((config, index) => {
    const num = String(index + 1).padStart(2, '0');
    const filename = `${num}-${config.system}-${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    const filepath = join(outputDir, filename);

    console.log(`[${num}/${visualizations.length}] ${config.name}`);
    console.log(`    System: ${config.system.toUpperCase()}`);
    console.log(`    Geometry: ${config.geometry} (${config.geometry < 8 ? 'Base' : config.geometry < 16 ? 'Hypersphere Core' : 'Hypertetra Core'})`);
    console.log(`    Parameters: gridDensity=${config.parameters.gridDensity}, morph=${config.parameters.morphFactor}, hue=${config.parameters.hue}`);
    console.log(`    4D Rotation: XW=${config.parameters.rot4dXW}, YW=${config.parameters.rot4dYW}, ZW=${config.parameters.rot4dZW}`);

    // Generate using REAL ShaderExporter
    const html = ShaderExporter.exportHTML(config);
    writeFileSync(filepath, html);

    console.log(`    ✓ Written: ${filename} (${(html.length / 1024).toFixed(1)} KB)\n`);

    generated.push({
        name: config.name,
        description: config.description,
        system: config.system,
        geometry: config.geometry,
        filename
    });
});

// Generate index page
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VIB3+ Real Shader Exports</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a1a1a 100%);
            min-height: 100vh;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: #fff;
            padding: 40px;
        }
        h1 {
            font-size: 2.5rem;
            background: linear-gradient(90deg, #64ff96, #00ffff, #ff64ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #888;
            margin-bottom: 40px;
            font-size: 1.1rem;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 30px;
        }
        .card {
            background: rgba(20, 20, 40, 0.8);
            border: 1px solid rgba(100, 255, 150, 0.2);
            border-radius: 16px;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        .card:hover {
            border-color: rgba(100, 255, 150, 0.5);
            transform: translateY(-5px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        .preview {
            width: 100%;
            height: 250px;
            border: none;
            background: #000;
        }
        .info {
            padding: 20px;
        }
        .info h3 {
            font-size: 1.2rem;
            color: #64ff96;
            margin-bottom: 8px;
        }
        .info p {
            font-size: 0.9rem;
            color: #aaa;
            line-height: 1.5;
            margin-bottom: 12px;
        }
        .meta {
            display: flex;
            gap: 15px;
            font-size: 0.8rem;
        }
        .meta span {
            background: rgba(100, 255, 150, 0.15);
            padding: 4px 10px;
            border-radius: 4px;
            color: #64ff96;
        }
        .meta .system { background: rgba(0, 255, 255, 0.15); color: #00ffff; }
        .meta .geo { background: rgba(255, 100, 255, 0.15); color: #ff64ff; }
        a.view {
            display: inline-block;
            margin-top: 15px;
            padding: 10px 20px;
            background: linear-gradient(90deg, #64ff96, #00ffff);
            color: #000;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            transition: opacity 0.2s;
        }
        a.view:hover { opacity: 0.8; }
        .footer {
            margin-top: 60px;
            text-align: center;
            color: #555;
            font-size: 0.9rem;
        }
        .footer a { color: #64ff96; text-decoration: none; }
    </style>
</head>
<body>
    <h1>VIB3+ Real Shader Exports</h1>
    <p class="subtitle">
        ${generated.length} visualizations using ACTUAL Quantum, Faceted, and Holographic shaders<br>
        Full 24-geometry system with 6D rotation and audio reactivity
    </p>

    <div class="grid">
        ${generated.map(v => `
        <div class="card">
            <iframe class="preview" src="${v.filename}" loading="lazy"></iframe>
            <div class="info">
                <h3>${v.name}</h3>
                <p>${v.description}</p>
                <div class="meta">
                    <span class="system">${v.system.toUpperCase()}</span>
                    <span class="geo">Geometry ${v.geometry}</span>
                </div>
                <a href="${v.filename}" class="view" target="_blank">View Fullscreen →</a>
            </div>
        </div>
        `).join('')}
    </div>

    <div class="footer">
        <p>
            Generated by VIB3+ ShaderExporter •
            <a href="https://github.com/Domusgpt/Vib3-CORE-Documented01-">GitHub</a>
        </p>
        <p style="margin-top: 10px;">
            Each visualization uses the REAL shader code from VIB3+ systems:<br>
            Quantum (complex lattice), Faceted (clean SDF), Holographic (5-layer glassmorphic)
        </p>
    </div>
</body>
</html>`;

writeFileSync(join(outputDir, 'index.html'), indexHtml);
console.log('✓ Index page written: index.html\n');

console.log('═'.repeat(70));
console.log('  GENERATION COMPLETE');
console.log('═'.repeat(70));
console.log();
console.log(`Output directory: ${outputDir}`);
console.log(`Total files: ${generated.length + 1}`);
console.log();
console.log('Files generated:');
generated.forEach(v => console.log(`  • ${v.filename}`));
console.log('  • index.html');
console.log();
console.log('These are REAL VIB3+ shaders with:');
console.log('  ✓ Actual Quantum/Faceted/Holographic fragment shaders');
console.log('  ✓ Full 24-geometry system (8 base × 3 cores)');
console.log('  ✓ Complete 6D rotation (XY, XZ, YZ, XW, YW, ZW)');
console.log('  ✓ Audio reactivity (bass, mid, high frequency bands)');
console.log('  ✓ Mouse interaction and click effects');
console.log();
