#!/usr/bin/env node
/**
 * VIB3+ Visualization Renderer
 * Uses the actual SDK to render SVG visualizations
 */

import { exportSVG } from '../../src/export/SVGExporter.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDERS_DIR = join(__dirname, 'renders');

// Ensure renders directory exists
if (!existsSync(RENDERS_DIR)) {
    mkdirSync(RENDERS_DIR, { recursive: true });
}

console.log('🎨 VIB3+ Visualization Renderer\n');
console.log('Using actual SDK: SVGExporter with Rotor4D and Vec4\n');

// Define visualizations to render
const visualizations = [
    // Base geometries with different rotations
    {
        name: 'tetrahedron-base',
        params: {
            system: 'quantum',
            geometry: 0,
            hue: 120,
            saturation: 0.8,
            intensity: 0.9,
            gridDensity: 16,
            dimension: 3.5,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0
        }
    },
    {
        name: 'tetrahedron-rotated-XY',
        params: {
            system: 'quantum',
            geometry: 0,
            hue: 120,
            saturation: 0.8,
            intensity: 0.9,
            gridDensity: 16,
            dimension: 3.5,
            rot4dXY: Math.PI / 4,  // 45° XY rotation
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0
        }
    },
    {
        name: 'tetrahedron-rotated-XW',
        params: {
            system: 'quantum',
            geometry: 0,
            hue: 120,
            saturation: 0.8,
            intensity: 0.9,
            gridDensity: 16,
            dimension: 3.5,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0.5,  // 4D hyperspace rotation
            rot4dYW: 0,
            rot4dZW: 0
        }
    },
    {
        name: 'hypercube-base',
        params: {
            system: 'quantum',
            geometry: 1,
            hue: 200,
            saturation: 0.7,
            intensity: 0.8,
            gridDensity: 12,
            dimension: 3.5,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0
        }
    },
    {
        name: 'hypercube-full-6D',
        params: {
            system: 'faceted',
            geometry: 1,
            hue: 280,
            saturation: 0.8,
            intensity: 0.9,
            gridDensity: 12,
            dimension: 3.8,
            rot4dXY: 0.3,
            rot4dXZ: 0.2,
            rot4dYZ: 0.4,
            rot4dXW: 0.5,
            rot4dYW: 0.3,
            rot4dZW: 0.2
        }
    },
    {
        name: 'sphere-holographic',
        params: {
            system: 'holographic',
            geometry: 2,
            hue: 180,
            saturation: 0.9,
            intensity: 0.95,
            gridDensity: 20,
            dimension: 3.5,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0
        }
    },
    {
        name: 'torus-hypersphere-core',
        params: {
            system: 'quantum',
            geometry: 11,  // Torus + Hypersphere Core (1*8+3)
            hue: 60,
            saturation: 0.85,
            intensity: 0.9,
            gridDensity: 18,
            dimension: 3.7,
            rot4dXY: 0.5,
            rot4dXZ: 0,
            rot4dYZ: 0.3,
            rot4dXW: 0.4,
            rot4dYW: 0,
            rot4dZW: 0.2
        }
    },
    {
        name: 'klein-bottle-hypertetra-core',
        params: {
            system: 'faceted',
            geometry: 20,  // Klein + Hypertetra Core (2*8+4)
            hue: 320,
            saturation: 0.75,
            intensity: 0.85,
            gridDensity: 14,
            dimension: 4.0,
            rot4dXY: 0.2,
            rot4dXZ: 0.3,
            rot4dYZ: 0.1,
            rot4dXW: 0.6,
            rot4dYW: 0.4,
            rot4dZW: 0.3
        }
    },
    {
        name: 'wave-quantum',
        params: {
            system: 'quantum',
            geometry: 6,
            hue: 240,
            saturation: 0.8,
            intensity: 0.9,
            gridDensity: 16,
            dimension: 3.5,
            chaos: 0.2,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0.3,
            rot4dYW: 0.2,
            rot4dZW: 0.1
        }
    },
    {
        name: 'crystal-all-rotations',
        params: {
            system: 'holographic',
            geometry: 7,
            hue: 30,
            saturation: 0.9,
            intensity: 1.0,
            gridDensity: 12,
            dimension: 3.8,
            rot4dXY: Math.PI / 6,
            rot4dXZ: Math.PI / 8,
            rot4dYZ: Math.PI / 10,
            rot4dXW: 0.7,
            rot4dYW: 0.5,
            rot4dZW: 0.3
        }
    }
];

// Render options
const renderOptions = {
    width: 512,
    height: 512,
    strokeWidth: 1.5,
    includeMetadata: true,
    backgroundColor: '#111111',
    precision: 2
};

console.log('Rendering visualizations...\n');

const results = [];

for (const viz of visualizations) {
    console.log(`  📐 ${viz.name}`);
    console.log(`     Geometry: ${viz.params.geometry} (${['Tetra','Cube','Sphere','Torus','Klein','Fractal','Wave','Crystal'][viz.params.geometry % 8]})`);
    console.log(`     Rotations: XY=${viz.params.rot4dXY?.toFixed(2)||0} XZ=${viz.params.rot4dXZ?.toFixed(2)||0} YZ=${viz.params.rot4dYZ?.toFixed(2)||0} XW=${viz.params.rot4dXW?.toFixed(2)||0} YW=${viz.params.rot4dYW?.toFixed(2)||0} ZW=${viz.params.rot4dZW?.toFixed(2)||0}`);

    try {
        const svg = exportSVG(viz.params, renderOptions);
        const filename = `${viz.name}.svg`;
        writeFileSync(join(RENDERS_DIR, filename), svg);
        console.log(`     ✅ Saved: ${filename}\n`);

        results.push({
            name: viz.name,
            file: filename,
            params: viz.params,
            success: true
        });
    } catch (error) {
        console.log(`     ❌ Error: ${error.message}\n`);
        results.push({
            name: viz.name,
            error: error.message,
            success: false
        });
    }
}

// Write results summary
const summary = {
    timestamp: new Date().toISOString(),
    sdkVersion: '1.9.0',
    renderer: 'SVGExporter',
    renderOptions,
    totalRendered: results.filter(r => r.success).length,
    totalFailed: results.filter(r => !r.success).length,
    renders: results
};

writeFileSync(
    join(RENDERS_DIR, 'render-summary.json'),
    JSON.stringify(summary, null, 2)
);

console.log('=== RENDER SUMMARY ===\n');
console.log(`Total: ${visualizations.length} visualizations`);
console.log(`Success: ${summary.totalRendered}`);
console.log(`Failed: ${summary.totalFailed}`);
console.log(`\nOutput: ${RENDERS_DIR}`);
console.log('\nThe SVG files use REAL Rotor4D 6D rotations from the SDK.');
console.log('Open the SVG files in a browser to view the visualizations.\n');
