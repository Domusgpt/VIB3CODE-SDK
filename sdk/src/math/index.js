/**
 * VIB3+ Math Module
 *
 * Complete 4D mathematics library for the VIB3+ visualization engine.
 *
 * Core Classes:
 * - Vec4: 4D vectors with standard operations
 * - Rotor4D: 8-component rotors for proper 4D rotations
 * - Mat4x4: 4x4 matrices with all 6 rotation planes
 * - Projection: 4D to 3D projection functions
 *
 * @example
 * import { Vec4, Rotor4D, Mat4x4, Projection } from '@vib3/sdk/math';
 *
 * // Create a tesseract vertex
 * const vertex = new Vec4(1, 1, 1, 1);
 *
 * // Rotate in XW plane (4D "inside-out" effect)
 * const rotor = Rotor4D.fromPlaneAngle('XW', Math.PI / 4);
 * const rotated = rotor.rotate(vertex);
 *
 * // Project to 3D for rendering
 * const projected = Projection.perspective(rotated, 2.5);
 */

// Core classes
export { Vec4 } from './Vec4.js';
export { Rotor4D } from './Rotor4D.js';
export { Mat4x4 } from './Mat4x4.js';

// Projections
export { Projection, SliceProjection, AnimatedProjection } from './Projection.js';

// Constants and utilities
export {
    // Basic constants
    PI, TAU, HALF_PI, QUARTER_PI,
    DEG_TO_RAD, RAD_TO_DEG,
    EPSILON, EPSILON_NORMAL, EPSILON_EQUAL,
    PHI, PHI_INV,

    // Plane indices
    PLANE_XY, PLANE_XZ, PLANE_YZ,
    PLANE_XW, PLANE_YW, PLANE_ZW,
    PLANE_NAMES,

    // Geometry constants
    GEOMETRY_TETRAHEDRON, GEOMETRY_HYPERCUBE, GEOMETRY_SPHERE, GEOMETRY_TORUS,
    GEOMETRY_KLEIN, GEOMETRY_FRACTAL, GEOMETRY_WAVE, GEOMETRY_CRYSTAL,
    CORE_BASE, CORE_HYPERSPHERE, CORE_HYPERTETRAHEDRON,

    // Polytope constants
    TESSERACT_VERTICES, TESSERACT_EDGES, TESSERACT_FACES, TESSERACT_CELLS,
    CELL24_VERTICES, CELL24_EDGES, CELL24_FACES, CELL24_CELLS,

    // Utility functions
    encodeGeometry, decodeGeometry,
    toRadians, toDegrees,
    clamp, lerp, smoothstep, smootherstep
} from './constants.js';

// Default export for convenience
export default {
    Vec4: (await import('./Vec4.js')).Vec4,
    Rotor4D: (await import('./Rotor4D.js')).Rotor4D,
    Mat4x4: (await import('./Mat4x4.js')).Mat4x4,
    Projection: (await import('./Projection.js')).Projection
};
