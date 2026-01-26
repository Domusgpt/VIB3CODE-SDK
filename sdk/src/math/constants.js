/**
 * Mathematical Constants for 4D Geometry
 */

// Basic constants
export const PI = Math.PI;
export const TAU = Math.PI * 2;        // Full rotation (2π)
export const HALF_PI = Math.PI / 2;    // Quarter rotation
export const QUARTER_PI = Math.PI / 4; // Eighth rotation

// Conversion factors
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

// Numerical tolerance
export const EPSILON = 1e-10;
export const EPSILON_NORMAL = 1e-6;    // For normalization checks
export const EPSILON_EQUAL = 1e-6;     // For equality checks

// 4D Geometry constants
export const TESSERACT_VERTICES = 16;
export const TESSERACT_EDGES = 32;
export const TESSERACT_FACES = 24;
export const TESSERACT_CELLS = 8;

// 24-cell (Icositetrachoron)
export const CELL24_VERTICES = 24;
export const CELL24_EDGES = 96;
export const CELL24_FACES = 96;
export const CELL24_CELLS = 24;

// 120-cell (Hecatonicosachoron)
export const CELL120_VERTICES = 600;
export const CELL120_EDGES = 1200;
export const CELL120_FACES = 720;
export const CELL120_CELLS = 120;

// 600-cell (Hexacosichoron)
export const CELL600_VERTICES = 120;
export const CELL600_EDGES = 720;
export const CELL600_FACES = 1200;
export const CELL600_CELLS = 600;

// Golden ratio (used in many 4D polytopes)
export const PHI = (1 + Math.sqrt(5)) / 2;  // ≈ 1.618
export const PHI_INV = 1 / PHI;              // ≈ 0.618

// Rotation plane indices
export const PLANE_XY = 0;
export const PLANE_XZ = 1;
export const PLANE_YZ = 2;
export const PLANE_XW = 3;
export const PLANE_YW = 4;
export const PLANE_ZW = 5;

// Plane names
export const PLANE_NAMES = ['XY', 'XZ', 'YZ', 'XW', 'YW', 'ZW'];

// Geometry type indices (base geometries)
export const GEOMETRY_TETRAHEDRON = 0;
export const GEOMETRY_HYPERCUBE = 1;
export const GEOMETRY_SPHERE = 2;
export const GEOMETRY_TORUS = 3;
export const GEOMETRY_KLEIN = 4;
export const GEOMETRY_FRACTAL = 5;
export const GEOMETRY_WAVE = 6;
export const GEOMETRY_CRYSTAL = 7;

// Core type indices
export const CORE_BASE = 0;
export const CORE_HYPERSPHERE = 1;
export const CORE_HYPERTETRAHEDRON = 2;

/**
 * Encode geometry index from base and core type
 * @param {number} baseIndex - 0-7
 * @param {number} coreIndex - 0-2
 * @returns {number} - 0-23
 */
export function encodeGeometry(baseIndex, coreIndex) {
    return coreIndex * 8 + baseIndex;
}

/**
 * Decode geometry index to base and core type
 * @param {number} geometryIndex - 0-23
 * @returns {{baseIndex: number, coreIndex: number}}
 */
export function decodeGeometry(geometryIndex) {
    return {
        baseIndex: geometryIndex % 8,
        coreIndex: Math.floor(geometryIndex / 8)
    };
}

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number}
 */
export function toRadians(degrees) {
    return degrees * DEG_TO_RAD;
}

/**
 * Convert radians to degrees
 * @param {number} radians
 * @returns {number}
 */
export function toDegrees(radians) {
    return radians * RAD_TO_DEG;
}

/**
 * Clamp value to range
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Factor (0-1)
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Smooth step interpolation
 * @param {number} t - Factor (0-1)
 * @returns {number}
 */
export function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Smoother step interpolation (quintic)
 * @param {number} t - Factor (0-1)
 * @returns {number}
 */
export function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

export default {
    PI, TAU, HALF_PI, QUARTER_PI,
    DEG_TO_RAD, RAD_TO_DEG,
    EPSILON, EPSILON_NORMAL, EPSILON_EQUAL,
    PHI, PHI_INV,
    PLANE_XY, PLANE_XZ, PLANE_YZ, PLANE_XW, PLANE_YW, PLANE_ZW,
    PLANE_NAMES,
    encodeGeometry, decodeGeometry,
    toRadians, toDegrees,
    clamp, lerp, smoothstep, smootherstep
};
