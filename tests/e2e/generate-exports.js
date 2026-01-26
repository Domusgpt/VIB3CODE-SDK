#!/usr/bin/env node
/**
 * VIB3+ Export Generator
 * Generates actual exports from the SDK for documentation
 */

import { ParameterManager } from '../../src/core/Parameters.js';
import { GeometryFactory, generateGeometry, decodeGeometry, encodeGeometry } from '../../src/geometry/GeometryFactory.js';
import { Rotor4D } from '../../src/math/Rotor4D.js';
import { Vec4 } from '../../src/math/Vec4.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = join(__dirname, 'exports');

// Ensure exports directory exists
if (!existsSync(EXPORTS_DIR)) {
    mkdirSync(EXPORTS_DIR, { recursive: true });
}

console.log('🎯 VIB3+ Export Generator\n');

// 1. Generate Parameter State Exports
console.log('📊 Generating Parameter State Exports...\n');

const params = new ParameterManager();

// Default state
const defaultState = params.exportConfiguration();
writeFileSync(
    join(EXPORTS_DIR, 'state-default.json'),
    JSON.stringify(defaultState, null, 2)
);
console.log('  ✓ state-default.json');

// Randomized state
params.randomizeAll();
const randomState = params.exportConfiguration();
writeFileSync(
    join(EXPORTS_DIR, 'state-randomized.json'),
    JSON.stringify(randomState, null, 2)
);
console.log('  ✓ state-randomized.json');

// 6D rotation showcase
params.resetToDefaults();
params.setParameters({
    rot4dXY: 1.57,  // π/2
    rot4dXZ: 0.785, // π/4
    rot4dYZ: 0.523, // π/6
    rot4dXW: 1.0,
    rot4dYW: 0.5,
    rot4dZW: 0.25,
    geometry: 12,   // Torus + Hypersphere Core
    hue: 180
});
const rotation6DState = params.exportConfiguration();
writeFileSync(
    join(EXPORTS_DIR, 'state-6d-rotation.json'),
    JSON.stringify(rotation6DState, null, 2)
);
console.log('  ✓ state-6d-rotation.json');

// 2. Generate Geometry Data Exports
console.log('\n📐 Generating Geometry Data Exports...\n');

const factory = new GeometryFactory();
const geometryExports = [];

for (let i = 0; i < 24; i++) {
    const { baseIndex, coreIndex } = decodeGeometry(i);
    const baseNames = ['Tetrahedron', 'Hypercube', 'Sphere', 'Torus', 'Klein Bottle', 'Fractal', 'Wave', 'Crystal'];
    const coreNames = ['Base', 'Hypersphere Core', 'Hypertetrahedron Core'];

    const geometry = factory.generate(i);

    geometryExports.push({
        index: i,
        name: `${baseNames[baseIndex]} + ${coreNames[coreIndex]}`,
        baseIndex,
        coreIndex,
        encoding: `${coreIndex} * 8 + ${baseIndex} = ${i}`,
        vertexCount: geometry.vertices.length,
        hasIndices: !!geometry.indices,
        indexCount: geometry.indices?.length || 0
    });
}

writeFileSync(
    join(EXPORTS_DIR, 'geometry-catalog.json'),
    JSON.stringify(geometryExports, null, 2)
);
console.log('  ✓ geometry-catalog.json (24 geometries)');

// Sample geometry vertices for geometry 0 (Tetrahedron Base)
const sampleGeometry = factory.generate(0);
writeFileSync(
    join(EXPORTS_DIR, 'geometry-0-tetrahedron-vertices.json'),
    JSON.stringify({
        index: 0,
        name: 'Tetrahedron Base',
        vertexCount: sampleGeometry.vertices.length,
        vertices: sampleGeometry.vertices.slice(0, 50), // First 50 vertices
        truncated: sampleGeometry.vertices.length > 50
    }, null, 2)
);
console.log('  ✓ geometry-0-tetrahedron-vertices.json');

// 3. Generate Rotor4D Exports
console.log('\n🔄 Generating Rotor4D Exports...\n');

const rotorExports = {
    identity: Rotor4D.identity(),
    rotations: {}
};

const planes = ['xy', 'xz', 'yz', 'xw', 'yw', 'zw'];
const angle = Math.PI / 4; // 45 degrees

planes.forEach(plane => {
    const rotor = Rotor4D.fromPlaneAngle(plane, angle);
    rotorExports.rotations[plane] = {
        angle: angle,
        angleDegrees: 45,
        components: {
            s: rotor.s,
            xy: rotor.xy,
            xz: rotor.xz,
            yz: rotor.yz,
            xw: rotor.xw,
            yw: rotor.yw,
            zw: rotor.zw,
            xyzw: rotor.xyzw
        }
    };
});

// Composed rotation example
const r1 = Rotor4D.fromPlaneAngle('xy', Math.PI / 4);
const r2 = Rotor4D.fromPlaneAngle('xw', Math.PI / 6);
const composed = r1.multiply(r2);

rotorExports.composedExample = {
    description: 'XY(45°) × XW(30°)',
    result: {
        s: composed.s,
        xy: composed.xy,
        xz: composed.xz,
        yz: composed.yz,
        xw: composed.xw,
        yw: composed.yw,
        zw: composed.zw,
        xyzw: composed.xyzw
    }
};

// Vector rotation example
const v = new Vec4(1, 0, 0, 0);
const rotor = Rotor4D.fromPlaneAngle('xy', Math.PI / 2);
const rotated = rotor.rotate(v);

rotorExports.vectorRotationExample = {
    description: 'Rotate (1,0,0,0) by 90° in XY plane',
    input: { x: v.x, y: v.y, z: v.z, w: v.w },
    output: { x: rotated.x, y: rotated.y, z: rotated.z, w: rotated.w },
    expected: { x: 0, y: 1, z: 0, w: 0 }
};

writeFileSync(
    join(EXPORTS_DIR, 'rotor4d-examples.json'),
    JSON.stringify(rotorExports, null, 2)
);
console.log('  ✓ rotor4d-examples.json');

// 4. Generate SVG Visualizations
console.log('\n🎨 Generating SVG Visualizations...\n');

function generateGeometrySVG(geometryIndex) {
    const { baseIndex, coreIndex } = decodeGeometry(geometryIndex);
    const baseNames = ['Tetra', 'Cube', 'Sphere', 'Torus', 'Klein', 'Fractal', 'Wave', 'Crystal'];
    const coreColors = ['#00FF88', '#00FFFF', '#FF00FF'];

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.35;

    let shapePath = '';
    const color = coreColors[coreIndex];

    switch (baseIndex) {
        case 0: // Tetrahedron
            const pts = [];
            for (let i = 0; i < 3; i++) {
                const angle = (i * 2 * Math.PI / 3) - Math.PI / 2;
                pts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
            }
            shapePath = `<polygon points="${pts.join(' ')}" fill="${color}22" stroke="${color}" stroke-width="2"/>`;
            break;
        case 1: // Cube
            shapePath = `<rect x="${cx-r}" y="${cy-r}" width="${r*2}" height="${r*2}" fill="${color}22" stroke="${color}" stroke-width="2"/>`;
            break;
        case 2: // Sphere
            shapePath = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}22" stroke="${color}" stroke-width="2"/>`;
            break;
        case 3: // Torus
            shapePath = `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r*0.5}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;
        case 4: // Klein
            shapePath = `<path d="M${cx-r},${cy} Q${cx},${cy-r} ${cx+r},${cy} Q${cx},${cy+r} ${cx-r},${cy}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;
        case 5: // Fractal
            shapePath = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1"/>
                         <circle cx="${cx}" cy="${cy}" r="${r*0.6}" fill="none" stroke="${color}" stroke-width="1"/>
                         <circle cx="${cx}" cy="${cy}" r="${r*0.3}" fill="none" stroke="${color}" stroke-width="1"/>`;
            break;
        case 6: // Wave
            shapePath = `<path d="M${cx-r},${cy} Q${cx-r/2},${cy-r/2} ${cx},${cy} Q${cx+r/2},${cy+r/2} ${cx+r},${cy}" fill="none" stroke="${color}" stroke-width="2"/>`;
            break;
        case 7: // Crystal
            const cpts = [];
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI / 2);
                cpts.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
            }
            shapePath = `<polygon points="${cpts.join(' ')}" fill="${color}22" stroke="${color}" stroke-width="2"/>`;
            break;
    }

    // Add core overlay for non-base types
    let coreOverlay = '';
    if (coreIndex === 1) { // Hypersphere
        coreOverlay = `<circle cx="${cx}" cy="${cy}" r="${r*1.1}" fill="none" stroke="#00FFFF44" stroke-width="1" stroke-dasharray="4,4"/>`;
    } else if (coreIndex === 2) { // Hypertetra
        coreOverlay = `<polygon points="${cx},${cy-r*1.1} ${cx-r*0.95},${cy+r*0.55} ${cx+r*0.95},${cy+r*0.55}" fill="none" stroke="#FF00FF44" stroke-width="1" stroke-dasharray="4,4"/>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="#111"/>
  ${coreOverlay}
  ${shapePath}
  <text x="${cx}" y="${size-10}" text-anchor="middle" fill="#888" font-size="10" font-family="monospace">
    ${baseNames[baseIndex]} ${coreIndex > 0 ? '+ ' + ['', 'Hypersphere', 'Hypertetra'][coreIndex] : ''}
  </text>
  <text x="${cx}" y="15" text-anchor="middle" fill="#666" font-size="8" font-family="monospace">
    Geometry ${geometryIndex}
  </text>
</svg>`;
}

// Generate SVGs for key geometries
const keyGeometries = [0, 1, 8, 9, 16, 17]; // Base, Hypersphere, Hypertetra versions of Tetra and Cube
keyGeometries.forEach(i => {
    const svg = generateGeometrySVG(i);
    writeFileSync(join(EXPORTS_DIR, `geometry-${i}.svg`), svg);
    console.log(`  ✓ geometry-${i}.svg`);
});

// 5. Generate Summary Report
console.log('\n📋 Generating Summary Report...\n');

const summary = {
    generatedAt: new Date().toISOString(),
    sdkVersion: '1.9.0',
    exports: {
        parameterStates: [
            'state-default.json',
            'state-randomized.json',
            'state-6d-rotation.json'
        ],
        geometryData: [
            'geometry-catalog.json',
            'geometry-0-tetrahedron-vertices.json'
        ],
        rotorData: [
            'rotor4d-examples.json'
        ],
        visualizations: keyGeometries.map(i => `geometry-${i}.svg`)
    },
    coverage: {
        parameterSystem: {
            rotationPlanes: 6,
            geometryVariants: 24,
            systems: ['quantum', 'faceted', 'holographic']
        },
        rotor4D: {
            planesSupported: planes,
            operationsVerified: ['identity', 'fromPlaneAngle', 'multiply', 'rotate']
        },
        geometryFactory: {
            totalVariants: 24,
            baseGeometries: 8,
            coreTypes: 3
        }
    }
};

writeFileSync(
    join(EXPORTS_DIR, 'export-summary.json'),
    JSON.stringify(summary, null, 2)
);
console.log('  ✓ export-summary.json');

console.log('\n✅ Export generation complete!');
console.log(`   Output directory: ${EXPORTS_DIR}`);
console.log(`   Total files: ${3 + 2 + 1 + keyGeometries.length + 1}`);
