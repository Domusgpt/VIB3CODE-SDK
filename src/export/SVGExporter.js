/**
 * SVGExporter - Export VIB3+ visualizations as SVG
 *
 * Generates optimized SVG output from geometry data with
 * embedded metadata for validation and theming.
 */

import { Vec4 } from '../math/Vec4.js';
import { Rotor4D } from '../math/Rotor4D.js';

/**
 * Default export options
 */
const DEFAULT_OPTIONS = {
    width: 512,
    height: 512,
    strokeWidth: 1.5,
    includeMetadata: true,
    includeWatermark: false,
    watermarkText: 'Created with VIB3+ Community',
    backgroundColor: 'transparent',
    precision: 3
};

/**
 * Geometry names for metadata
 */
const GEOMETRY_NAMES = [
    'Tetrahedron', 'Hypercube', 'Sphere', 'Torus',
    'Klein Bottle', 'Fractal', 'Wave', 'Crystal'
];

/**
 * Core type names
 */
const CORE_TYPES = ['Base', 'Hypersphere', 'Hypertetrahedron'];

/**
 * Export parameters to SVG format
 *
 * @param {object} params - VIB3+ parameters
 * @param {object} options - Export options
 * @returns {string} SVG content
 */
export function exportSVG(params, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { width, height, precision } = opts;

    // Extract parameters
    const system = params.system || 'quantum';
    const geometry = params.geometry ?? 0;
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const gridDensity = params.gridDensity ?? 16;
    const dimension = params.dimension ?? 3.5;

    // Calculate derived values
    const baseIndex = geometry % 8;
    const coreIndex = Math.floor(geometry / 8);
    const geometryName = GEOMETRY_NAMES[baseIndex] || 'Unknown';
    const coreType = CORE_TYPES[coreIndex] || 'Base';

    // Build rotation from parameters
    const rotor = Rotor4D.fromParameters(params);

    // Generate geometry points
    const points = generateGeometryPoints(params, opts);

    // Project to 2D
    const projectedPoints = projectPoints(points, rotor, dimension, width, height);

    // Generate SVG paths
    const paths = generatePaths(projectedPoints, params, opts);

    // Build SVG
    const svg = buildSVG({
        width,
        height,
        paths,
        params,
        opts,
        metadata: {
            system,
            geometry,
            geometryName,
            coreType,
            hue,
            saturation,
            intensity
        }
    });

    return svg;
}

/**
 * Generate geometry points based on parameters
 */
function generateGeometryPoints(params, opts) {
    const points = [];
    const density = params.gridDensity ?? 16;
    const geometry = params.geometry ?? 0;
    const baseIndex = geometry % 8;

    // Generate base geometry points
    switch (baseIndex) {
        case 0: // Tetrahedron
            generateTetrahedronPoints(points, density);
            break;
        case 1: // Hypercube
            generateHypercubePoints(points, density);
            break;
        case 2: // Sphere
            generateSpherePoints(points, density);
            break;
        case 3: // Torus
            generateTorusPoints(points, density);
            break;
        case 4: // Klein Bottle
            generateKleinBottlePoints(points, density);
            break;
        case 5: // Fractal
            generateFractalPoints(points, density);
            break;
        case 6: // Wave
            generateWavePoints(points, density);
            break;
        case 7: // Crystal
            generateCrystalPoints(points, density);
            break;
        default:
            generateSpherePoints(points, density);
    }

    return points;
}

/**
 * Generate tetrahedron vertices and edges
 */
function generateTetrahedronPoints(points, density) {
    // Regular tetrahedron vertices in 4D
    const vertices = [
        new Vec4(1, 1, 1, 0),
        new Vec4(1, -1, -1, 0),
        new Vec4(-1, 1, -1, 0),
        new Vec4(-1, -1, 1, 0)
    ];

    // Normalize to unit sphere
    vertices.forEach(v => v.normalizeInPlace());

    // Add edge midpoints for smoother curves
    for (let i = 0; i < vertices.length; i++) {
        points.push(vertices[i].clone());
        for (let j = i + 1; j < vertices.length; j++) {
            const steps = Math.max(2, Math.floor(density / 4));
            for (let t = 1; t < steps; t++) {
                const lerped = vertices[i].lerp(vertices[j], t / steps);
                lerped.normalizeInPlace();
                points.push(lerped);
            }
        }
    }
}

/**
 * Generate hypercube (tesseract) points
 */
function generateHypercubePoints(points, density) {
    const scale = 0.5;
    // All 16 vertices of a tesseract
    for (let x = -1; x <= 1; x += 2) {
        for (let y = -1; y <= 1; y += 2) {
            for (let z = -1; z <= 1; z += 2) {
                for (let w = -1; w <= 1; w += 2) {
                    points.push(new Vec4(x * scale, y * scale, z * scale, w * scale));
                }
            }
        }
    }

    // Add edge points
    const steps = Math.max(2, Math.floor(density / 8));
    const vertices = [...points];
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            // Only connect adjacent vertices (differ in one coordinate)
            const diff = Math.abs(vertices[i].x - vertices[j].x) +
                        Math.abs(vertices[i].y - vertices[j].y) +
                        Math.abs(vertices[i].z - vertices[j].z) +
                        Math.abs(vertices[i].w - vertices[j].w);
            if (Math.abs(diff - 1) < 0.1) {
                for (let t = 1; t < steps; t++) {
                    points.push(vertices[i].lerp(vertices[j], t / steps));
                }
            }
        }
    }
}

/**
 * Generate sphere points
 */
function generateSpherePoints(points, density) {
    const latSteps = Math.max(4, density);
    const lonSteps = Math.max(8, density * 2);

    for (let lat = 0; lat <= latSteps; lat++) {
        const theta = (lat / latSteps) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon < lonSteps; lon++) {
            const phi = (lon / lonSteps) * Math.PI * 2;
            const x = sinTheta * Math.cos(phi);
            const y = sinTheta * Math.sin(phi);
            const z = cosTheta;
            points.push(new Vec4(x * 0.8, y * 0.8, z * 0.8, 0));
        }
    }
}

/**
 * Generate torus points
 */
function generateTorusPoints(points, density) {
    const majorRadius = 0.6;
    const minorRadius = 0.25;
    const majorSteps = Math.max(8, density);
    const minorSteps = Math.max(6, Math.floor(density * 0.75));

    for (let i = 0; i < majorSteps; i++) {
        const theta = (i / majorSteps) * Math.PI * 2;
        for (let j = 0; j < minorSteps; j++) {
            const phi = (j / minorSteps) * Math.PI * 2;
            const x = (majorRadius + minorRadius * Math.cos(phi)) * Math.cos(theta);
            const y = (majorRadius + minorRadius * Math.cos(phi)) * Math.sin(theta);
            const z = minorRadius * Math.sin(phi);
            points.push(new Vec4(x, y, z, 0));
        }
    }
}

/**
 * Generate Klein bottle points (immersion in 3D)
 */
function generateKleinBottlePoints(points, density) {
    const steps = Math.max(8, density);

    for (let u = 0; u < steps; u++) {
        const uAngle = (u / steps) * Math.PI * 2;
        for (let v = 0; v < steps; v++) {
            const vAngle = (v / steps) * Math.PI * 2;

            // Figure-8 immersion
            const r = 0.4;
            const x = (r + Math.cos(uAngle / 2) * Math.sin(vAngle) - Math.sin(uAngle / 2) * Math.sin(2 * vAngle)) * Math.cos(uAngle);
            const y = (r + Math.cos(uAngle / 2) * Math.sin(vAngle) - Math.sin(uAngle / 2) * Math.sin(2 * vAngle)) * Math.sin(uAngle);
            const z = Math.sin(uAngle / 2) * Math.sin(vAngle) + Math.cos(uAngle / 2) * Math.sin(2 * vAngle);

            points.push(new Vec4(x * 0.8, y * 0.8, z * 0.5, 0));
        }
    }
}

/**
 * Generate fractal points (Sierpinski-like)
 */
function generateFractalPoints(points, density) {
    const iterations = Math.min(4, Math.floor(Math.log2(density)));
    const vertices = [
        new Vec4(0, 0.8, 0, 0),
        new Vec4(-0.7, -0.4, 0, 0),
        new Vec4(0.7, -0.4, 0, 0),
        new Vec4(0, 0, 0.7, 0)
    ];

    function subdivide(v1, v2, v3, v4, depth) {
        if (depth === 0) {
            points.push(v1.clone(), v2.clone(), v3.clone(), v4.clone());
            return;
        }

        const m12 = v1.lerp(v2, 0.5);
        const m13 = v1.lerp(v3, 0.5);
        const m14 = v1.lerp(v4, 0.5);
        const m23 = v2.lerp(v3, 0.5);
        const m24 = v2.lerp(v4, 0.5);
        const m34 = v3.lerp(v4, 0.5);

        subdivide(v1, m12, m13, m14, depth - 1);
        subdivide(m12, v2, m23, m24, depth - 1);
        subdivide(m13, m23, v3, m34, depth - 1);
        subdivide(m14, m24, m34, v4, depth - 1);
    }

    subdivide(vertices[0], vertices[1], vertices[2], vertices[3], iterations);
}

/**
 * Generate wave points
 */
function generateWavePoints(points, density) {
    const steps = Math.max(8, density);
    const amplitude = 0.3;
    const frequency = 3;

    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
            const u = (i / steps - 0.5) * 2;
            const v = (j / steps - 0.5) * 2;
            const r = Math.sqrt(u * u + v * v);
            const z = amplitude * Math.sin(r * frequency * Math.PI) * Math.exp(-r);
            points.push(new Vec4(u * 0.8, v * 0.8, z, 0));
        }
    }
}

/**
 * Generate crystal (octahedron) points
 */
function generateCrystalPoints(points, density) {
    const vertices = [
        new Vec4(0, 0.8, 0, 0),
        new Vec4(0, -0.8, 0, 0),
        new Vec4(0.8, 0, 0, 0),
        new Vec4(-0.8, 0, 0, 0),
        new Vec4(0, 0, 0.8, 0),
        new Vec4(0, 0, -0.8, 0)
    ];

    vertices.forEach(v => points.push(v.clone()));

    const steps = Math.max(2, Math.floor(density / 4));
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            // Connect non-opposite vertices
            if (vertices[i].dot(vertices[j]) !== -vertices[i].lengthSquared()) {
                for (let t = 1; t < steps; t++) {
                    points.push(vertices[i].lerp(vertices[j], t / steps));
                }
            }
        }
    }
}

/**
 * Project 4D points to 2D screen coordinates
 */
function projectPoints(points, rotor, dimension, width, height) {
    const projected = [];
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) * 0.4;

    for (const point of points) {
        // Apply 4D rotation
        const rotated = rotor.rotate(point);

        // Project to 3D (perspective from W)
        const proj3d = rotated.projectPerspective(dimension);

        // Project to 2D (simple orthographic for clean SVG)
        const x = centerX + proj3d.x * scale;
        const y = centerY - proj3d.y * scale; // Flip Y for SVG coordinates
        const depth = proj3d.z; // Keep depth for styling

        projected.push({ x, y, depth, original: point });
    }

    return projected;
}

/**
 * Generate SVG path elements from projected points
 */
function generatePaths(projectedPoints, params, opts) {
    const { precision } = opts;
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const chaos = params.chaos ?? 0;

    // Sort by depth for proper layering
    const sorted = [...projectedPoints].sort((a, b) => a.depth - b.depth);

    const paths = [];

    // Generate circles for each point
    for (let i = 0; i < sorted.length; i++) {
        const point = sorted[i];
        const depthFactor = (point.depth + 1) / 2; // Normalize depth to 0-1
        const radius = 2 + depthFactor * 3 + chaos * Math.random() * 2;
        const pointHue = (hue + depthFactor * 60) % 360;
        const lightness = 40 + intensity * 30 + depthFactor * 20;
        const alpha = 0.5 + depthFactor * 0.5;

        paths.push({
            type: 'circle',
            cx: point.x.toFixed(precision),
            cy: point.y.toFixed(precision),
            r: radius.toFixed(precision),
            fill: `hsla(${pointHue.toFixed(0)}, ${(saturation * 100).toFixed(0)}%, ${lightness.toFixed(0)}%, ${alpha.toFixed(2)})`
        });
    }

    // Connect nearby points with lines
    const strokeHue = (hue + 180) % 360;
    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < Math.min(i + 5, sorted.length); j++) {
            const p1 = sorted[i];
            const p2 = sorted[j];
            const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

            if (dist < 50 && dist > 5) {
                const alpha = Math.max(0.1, 0.4 - dist / 150);
                paths.push({
                    type: 'line',
                    x1: p1.x.toFixed(precision),
                    y1: p1.y.toFixed(precision),
                    x2: p2.x.toFixed(precision),
                    y2: p2.y.toFixed(precision),
                    stroke: `hsla(${strokeHue}, ${(saturation * 80).toFixed(0)}%, 60%, ${alpha.toFixed(2)})`,
                    strokeWidth: (opts.strokeWidth * alpha).toFixed(precision)
                });
            }
        }
    }

    return paths;
}

/**
 * Build final SVG string
 */
function buildSVG({ width, height, paths, params, opts, metadata }) {
    const { includeMetadata, includeWatermark, watermarkText, backgroundColor, precision } = opts;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`;

    if (includeMetadata) {
        svg += ` data-vib3-geometry="${metadata.geometry}"`;
        svg += ` data-vib3-system="${metadata.system}"`;
        svg += ` data-vib3-core-type="${metadata.coreType}"`;
    }

    svg += `>\n`;

    // Defs section with CSS variables
    svg += `  <defs>\n`;
    svg += `    <style>\n`;
    svg += `      :root {\n`;
    svg += `        --vib3-hue: ${metadata.hue};\n`;
    svg += `        --vib3-saturation: ${metadata.saturation};\n`;
    svg += `        --vib3-intensity: ${metadata.intensity};\n`;
    svg += `      }\n`;
    svg += `    </style>\n`;
    svg += `  </defs>\n`;

    // Background
    if (backgroundColor !== 'transparent') {
        svg += `  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>\n`;
    }

    // Geometry layer
    svg += `  <g id="geometry-layer">\n`;

    // Render lines first (behind circles)
    for (const path of paths) {
        if (path.type === 'line') {
            svg += `    <line x1="${path.x1}" y1="${path.y1}" x2="${path.x2}" y2="${path.y2}" `;
            svg += `stroke="${path.stroke}" stroke-width="${path.strokeWidth}" stroke-linecap="round"/>\n`;
        }
    }

    // Render circles on top
    for (const path of paths) {
        if (path.type === 'circle') {
            svg += `    <circle cx="${path.cx}" cy="${path.cy}" r="${path.r}" fill="${path.fill}"/>\n`;
        }
    }

    svg += `  </g>\n`;

    // Watermark (Community tier)
    if (includeWatermark) {
        svg += `  <g id="vib3-watermark" opacity="0.3" transform="translate(10, ${height - 20})">\n`;
        svg += `    <text font-size="10" fill="#666" font-family="sans-serif">${watermarkText}</text>\n`;
        svg += `  </g>\n`;
    }

    svg += `</svg>`;

    return svg;
}

/**
 * Export SVG to file (browser environment)
 */
export function downloadSVG(params, options = {}, filename = 'vib3-export.svg') {
    const svg = exportSVG(params, options);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
    return svg;
}

export default {
    exportSVG,
    downloadSVG
};
