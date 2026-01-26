/**
 * LottieExporter - Export VIB3+ animations as Lottie JSON
 *
 * Generates Lottie-compatible JSON for use in After Effects,
 * web players, and mobile applications.
 */

import { Vec4 } from '../math/Vec4.js';
import { Rotor4D } from '../math/Rotor4D.js';

/**
 * Default export options
 */
const DEFAULT_OPTIONS = {
    fps: 60,
    duration: 5, // seconds
    width: 512,
    height: 512,
    quality: 'normal', // 'draft', 'normal', 'high'
    includeMetadata: true
};

/**
 * Geometry names for metadata
 */
const GEOMETRY_NAMES = [
    'Tetrahedron', 'Hypercube', 'Sphere', 'Torus',
    'Klein Bottle', 'Fractal', 'Wave', 'Crystal'
];

/**
 * Export parameters to Lottie JSON format
 *
 * @param {object} params - VIB3+ parameters
 * @param {object} options - Export options
 * @returns {object} Lottie JSON object
 */
export function exportLottie(params, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { fps, duration, width, height, quality, includeMetadata } = opts;

    const totalFrames = fps * duration;

    // Extract parameters
    const system = params.system || 'quantum';
    const geometry = params.geometry ?? 0;
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const speed = params.speed ?? 1;
    const chaos = params.chaos ?? 0;
    const morphFactor = params.morphFactor ?? 0;
    const dimension = params.dimension ?? 3.5;

    // Generate keyframes based on rotation
    const rotationKeyframes = generateRotationKeyframes(params, totalFrames, speed);

    // Generate geometry shapes
    const shapes = generateLottieShapes(params, opts);

    // Build Lottie structure
    const lottie = {
        v: '5.7.0',
        fr: fps,
        ip: 0,
        op: totalFrames,
        w: width,
        h: height,
        nm: `VIB3+ ${GEOMETRY_NAMES[geometry % 8] || 'Geometry'}`,
        ddd: 0,
        assets: [],
        layers: [
            // Background layer
            {
                ddd: 0,
                ind: 1,
                ty: 1, // Solid
                nm: 'Background',
                sr: 1,
                ks: {
                    o: { a: 0, k: 100 },
                    r: { a: 0, k: 0 },
                    p: { a: 0, k: [width / 2, height / 2, 0] },
                    a: { a: 0, k: [width / 2, height / 2, 0] },
                    s: { a: 0, k: [100, 100, 100] }
                },
                ao: 0,
                sw: width,
                sh: height,
                sc: hslToHex(hue, saturation * 30, 10 + intensity * 5),
                ip: 0,
                op: totalFrames,
                st: 0,
                bm: 0
            },
            // Geometry layer
            {
                ddd: 0,
                ind: 2,
                ty: 4, // Shape layer
                nm: 'Geometry',
                sr: 1,
                ks: {
                    o: { a: 0, k: 100 },
                    r: rotationKeyframes,
                    p: { a: 0, k: [width / 2, height / 2, 0] },
                    a: { a: 0, k: [0, 0, 0] },
                    s: generateScaleKeyframes(morphFactor, totalFrames)
                },
                ao: 0,
                shapes: shapes,
                ip: 0,
                op: totalFrames,
                st: 0,
                bm: 0
            },
            // Glow effect layer
            {
                ddd: 0,
                ind: 3,
                ty: 4,
                nm: 'Glow',
                sr: 1,
                ks: {
                    o: generateOpacityKeyframes(chaos, totalFrames),
                    r: { a: 0, k: 0 },
                    p: { a: 0, k: [width / 2, height / 2, 0] },
                    a: { a: 0, k: [0, 0, 0] },
                    s: { a: 0, k: [120, 120, 100] }
                },
                ao: 0,
                shapes: generateGlowShapes(params, opts),
                ip: 0,
                op: totalFrames,
                st: 0,
                bm: 1 // Add blend mode
            }
        ],
        markers: []
    };

    // Add metadata
    if (includeMetadata) {
        lottie.meta = {
            generator: '@vib3/sdk',
            version: '1.9.0',
            system: system,
            geometry: geometry,
            exportedAt: new Date().toISOString()
        };
    }

    return lottie;
}

/**
 * Generate rotation keyframes
 */
function generateRotationKeyframes(params, totalFrames, speed) {
    const rotations = (params.rot4dXW ?? 0) + (params.rot4dYW ?? 0);

    if (Math.abs(rotations) < 0.01) {
        // Static rotation
        return { a: 0, k: 0 };
    }

    // Animated rotation
    return {
        a: 1,
        k: [
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: 0,
                s: [0]
            },
            {
                t: totalFrames,
                s: [360 * speed]
            }
        ]
    };
}

/**
 * Generate scale keyframes for morph effect
 */
function generateScaleKeyframes(morphFactor, totalFrames) {
    if (morphFactor < 0.01) {
        return { a: 0, k: [100, 100, 100] };
    }

    const scalePulse = 100 + morphFactor * 10;

    return {
        a: 1,
        k: [
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: 0,
                s: [100, 100, 100]
            },
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: totalFrames / 2,
                s: [scalePulse, scalePulse, 100]
            },
            {
                t: totalFrames,
                s: [100, 100, 100]
            }
        ]
    };
}

/**
 * Generate opacity keyframes for glow
 */
function generateOpacityKeyframes(chaos, totalFrames) {
    if (chaos < 0.01) {
        return { a: 0, k: 30 };
    }

    return {
        a: 1,
        k: [
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: 0,
                s: [20]
            },
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: totalFrames * 0.25,
                s: [40 + chaos * 30]
            },
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: totalFrames * 0.5,
                s: [20]
            },
            {
                i: { x: [0.667], y: [1] },
                o: { x: [0.333], y: [0] },
                t: totalFrames * 0.75,
                s: [50 + chaos * 20]
            },
            {
                t: totalFrames,
                s: [20]
            }
        ]
    };
}

/**
 * Generate Lottie shape groups from geometry
 */
function generateLottieShapes(params, opts) {
    const { width, height, quality } = opts;
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const geometry = params.geometry ?? 0;
    const gridDensity = params.gridDensity ?? 16;

    const shapes = [];
    const centerX = 0;
    const centerY = 0;

    // Determine point count based on quality
    const pointMultiplier = quality === 'high' ? 2 : quality === 'draft' ? 0.5 : 1;
    const pointCount = Math.floor(gridDensity * pointMultiplier);

    // Generate base geometry shape
    const baseIndex = geometry % 8;

    // Create shape group
    const shapeGroup = {
        ty: 'gr',
        it: [],
        nm: 'Geometry Group',
        np: 3,
        cix: 2,
        bm: 0,
        ix: 1,
        mn: 'ADBE Vector Group'
    };

    // Add ellipses for each geometry point
    const scale = Math.min(width, height) * 0.35;
    const points = generateGeometryVertices(baseIndex, pointCount);

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const pointHue = (hue + i * 10) % 360;

        // Add ellipse shape
        shapeGroup.it.push({
            ty: 'el',
            s: { a: 0, k: [10, 10] },
            p: { a: 0, k: [point.x * scale, point.y * scale] },
            nm: `Point ${i}`,
            mn: 'ADBE Vector Shape - Ellipse'
        });
    }

    // Add fill
    shapeGroup.it.push({
        ty: 'fl',
        c: { a: 0, k: hslToRgbArray(hue, saturation, 0.4 + intensity * 0.3) },
        o: { a: 0, k: 80 },
        r: 1,
        bm: 0,
        nm: 'Fill',
        mn: 'ADBE Vector Graphic - Fill'
    });

    // Add stroke
    shapeGroup.it.push({
        ty: 'st',
        c: { a: 0, k: hslToRgbArray((hue + 180) % 360, saturation, 0.6) },
        o: { a: 0, k: 50 },
        w: { a: 0, k: 1.5 },
        lc: 2,
        lj: 2,
        bm: 0,
        nm: 'Stroke',
        mn: 'ADBE Vector Graphic - Stroke'
    });

    // Add transform
    shapeGroup.it.push({
        ty: 'tr',
        p: { a: 0, k: [0, 0] },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 },
        o: { a: 0, k: 100 },
        sk: { a: 0, k: 0 },
        sa: { a: 0, k: 0 },
        nm: 'Transform'
    });

    shapes.push(shapeGroup);

    return shapes;
}

/**
 * Generate glow shapes
 */
function generateGlowShapes(params, opts) {
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const { width, height } = opts;

    return [
        {
            ty: 'gr',
            it: [
                {
                    ty: 'el',
                    s: { a: 0, k: [width * 0.6, height * 0.6] },
                    p: { a: 0, k: [0, 0] },
                    nm: 'Glow Ellipse'
                },
                {
                    ty: 'gf',
                    o: { a: 0, k: 100 },
                    r: 1,
                    bm: 0,
                    g: {
                        p: 3,
                        k: {
                            a: 0,
                            k: [
                                0, ...hslToRgbArray(hue, saturation, 0.5 + intensity * 0.3),
                                0.5, ...hslToRgbArray((hue + 30) % 360, saturation * 0.8, 0.4),
                                1, 0, 0, 0, 0
                            ]
                        }
                    },
                    s: { a: 0, k: [0, 0] },
                    e: { a: 0, k: [width * 0.3, height * 0.3] },
                    t: 2, // Radial gradient
                    nm: 'Gradient Fill'
                },
                {
                    ty: 'tr',
                    p: { a: 0, k: [0, 0] },
                    a: { a: 0, k: [0, 0] },
                    s: { a: 0, k: [100, 100] },
                    r: { a: 0, k: 0 },
                    o: { a: 0, k: 100 },
                    nm: 'Transform'
                }
            ],
            nm: 'Glow Group',
            bm: 0
        }
    ];
}

/**
 * Generate geometry vertices for shapes
 */
function generateGeometryVertices(baseIndex, count) {
    const vertices = [];

    switch (baseIndex) {
        case 0: // Tetrahedron
            vertices.push({ x: 0, y: -0.8 });
            vertices.push({ x: -0.7, y: 0.4 });
            vertices.push({ x: 0.7, y: 0.4 });
            break;

        case 1: // Hypercube (square projection)
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
                vertices.push({
                    x: Math.cos(angle) * 0.6,
                    y: Math.sin(angle) * 0.6
                });
            }
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
                vertices.push({
                    x: Math.cos(angle) * 0.3,
                    y: Math.sin(angle) * 0.3
                });
            }
            break;

        case 2: // Sphere (circle of points)
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                vertices.push({
                    x: Math.cos(angle) * 0.7,
                    y: Math.sin(angle) * 0.7
                });
            }
            break;

        case 3: // Torus (double ring)
            for (let i = 0; i < count / 2; i++) {
                const angle = (i / (count / 2)) * Math.PI * 2;
                vertices.push({
                    x: Math.cos(angle) * 0.5,
                    y: Math.sin(angle) * 0.5
                });
            }
            for (let i = 0; i < count / 2; i++) {
                const angle = (i / (count / 2)) * Math.PI * 2;
                vertices.push({
                    x: Math.cos(angle) * 0.3,
                    y: Math.sin(angle) * 0.3
                });
            }
            break;

        default: // Generic radial pattern
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const radius = 0.4 + (i % 3) * 0.15;
                vertices.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                });
            }
    }

    return vertices;
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/**
 * Convert HSL to RGB array [0-1]
 */
function hslToRgbArray(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgb;
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h, s, l) {
    h = h / 360;
    s = Math.min(1, Math.max(0, s));
    l = Math.min(1, Math.max(0, l));

    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r, g, b];
}

/**
 * Export Lottie to file (browser environment)
 */
export function downloadLottie(params, options = {}, filename = 'vib3-animation.json') {
    const lottie = exportLottie(params, options);
    const json = JSON.stringify(lottie, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
    return lottie;
}

export default {
    exportLottie,
    downloadLottie
};
