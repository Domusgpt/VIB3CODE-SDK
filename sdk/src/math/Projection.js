/**
 * Projection - 4D to 3D Projection Functions
 *
 * Various methods for projecting 4-dimensional geometry
 * into 3-dimensional space for rendering.
 *
 * Projection Types:
 * - Perspective: P = v.xyz / (d - v.w), creates depth-like 4D effect
 * - Stereographic: P = v.xyz / (1 - v.w), conformal (preserves angles)
 * - Orthographic: P = v.xyz, simple parallel projection
 *
 * @example
 * const projected = Projection.perspective(vec4, 2.0);
 * const conformal = Projection.stereographic(vec4);
 */

import { Vec4 } from './Vec4.js';

const DEFAULT_EPSILON = 1e-5;

function clampDenominator(value, epsilon) {
    if (Math.abs(value) < epsilon) {
        return value >= 0 ? epsilon : -epsilon;
    }
    return value;
}

export class Projection {
    /**
     * Perspective projection from 4D to 3D
     *
     * Projects by dividing XYZ by (d - W), where d is the distance
     * from the 4D camera to the projection hyperplane.
     *
     * Formula: P = (x, y, z) / (d - w)
     *
     * @param {Vec4} v - 4D point
     * @param {number} d - Distance parameter (typically 1.5-5)
     * @returns {Vec4} Projected point (w=0)
     */
    static perspective(v, d = 2, options = {}) {
        if (typeof d === 'object') {
            options = d;
            d = options.d ?? 2;
        }
        const epsilon = options.epsilon ?? DEFAULT_EPSILON;
        const denom = clampDenominator(d - v.w, epsilon);
        const scale = 1 / denom;
        return new Vec4(v.x * scale, v.y * scale, v.z * scale, 0);
    }

    /**
     * Stereographic projection from 4D to 3D
     *
     * Projects from the 4D hypersphere to 3D space.
     * This is conformal (preserves angles locally).
     *
     * Formula: P = (x, y, z) / (1 - w)
     *
     * The projection point is at (0, 0, 0, 1) - the "north pole"
     *
     * @param {Vec4} v - 4D point (ideally on unit hypersphere)
     * @returns {Vec4} Projected point (w=0)
     */
    static stereographic(v, options = {}) {
        const epsilon = options.epsilon ?? DEFAULT_EPSILON;
        const denom = clampDenominator(1 - v.w, epsilon);
        const scale = 1 / denom;
        return new Vec4(v.x * scale, v.y * scale, v.z * scale, 0);
    }

    /**
     * Inverse stereographic projection (3D to 4D hypersphere)
     *
     * Maps a 3D point back onto the unit 4D hypersphere
     *
     * @param {Vec4} v - 3D point (w component ignored)
     * @returns {Vec4} Point on unit hypersphere
     */
    static stereographicInverse(v) {
        const r2 = v.x * v.x + v.y * v.y + v.z * v.z;
        const denom = 1 + r2;
        return new Vec4(
            (2 * v.x) / denom,
            (2 * v.y) / denom,
            (2 * v.z) / denom,
            (r2 - 1) / denom
        );
    }

    /**
     * Orthographic projection from 4D to 3D
     *
     * Simply drops the W component.
     * Parallel projection - no perspective distortion.
     *
     * @param {Vec4} v - 4D point
     * @returns {Vec4} Projected point (w=0)
     */
    static orthographic(v) {
        return new Vec4(v.x, v.y, v.z, 0);
    }

    /**
     * Oblique projection from 4D to 3D
     *
     * Projects with W component adding a sheared offset to XYZ.
     * Creates a cavalier or cabinet-like projection effect.
     *
     * @param {Vec4} v - 4D point
     * @param {number} shearX - X shear factor for W
     * @param {number} shearY - Y shear factor for W
     * @param {number} shearZ - Z shear factor for W
     * @returns {Vec4} Projected point (w=0)
     */
    static oblique(v, shearX = 0.5, shearY = 0.5, shearZ = 0) {
        return new Vec4(
            v.x + shearX * v.w,
            v.y + shearY * v.w,
            v.z + shearZ * v.w,
            0
        );
    }

    /**
     * Project array of Vec4s using perspective projection
     * @param {Vec4[]} vectors
     * @param {number} d
     * @returns {Vec4[]}
     */
    static perspectiveArray(vectors, d = 2, options = {}) {
        return vectors.map(v => Projection.perspective(v, d, options));
    }

    /**
     * Project array of Vec4s using stereographic projection
     * @param {Vec4[]} vectors
     * @returns {Vec4[]}
     */
    static stereographicArray(vectors, options = {}) {
        return vectors.map(v => Projection.stereographic(v, options));
    }

    /**
     * Project array of Vec4s using orthographic projection
     * @param {Vec4[]} vectors
     * @returns {Vec4[]}
     */
    static orthographicArray(vectors) {
        return vectors.map(v => Projection.orthographic(v));
    }

    /**
     * Project packed Float32Array using perspective projection
     *
     * @param {Float32Array} packed - Packed vec4s (x,y,z,w,...)
     * @param {number} d - Distance parameter
     * @param {Float32Array} [output] - Optional output buffer
     * @returns {Float32Array} Projected points (as vec3s: x,y,z,...)
     */
    static perspectivePacked(packed, d = 2, output = null, options = {}) {
        const count = packed.length / 4;
        const result = output || new Float32Array(count * 3);
        const epsilon = options.epsilon ?? DEFAULT_EPSILON;

        for (let i = 0; i < count; i++) {
            const srcIdx = i * 4;
            const dstIdx = i * 3;

            const x = packed[srcIdx];
            const y = packed[srcIdx + 1];
            const z = packed[srcIdx + 2];
            const w = packed[srcIdx + 3];

            const denom = clampDenominator(d - w, epsilon);
            const scale = 1 / denom;
            result[dstIdx] = x * scale;
            result[dstIdx + 1] = y * scale;
            result[dstIdx + 2] = z * scale;
        }

        return result;
    }

    /**
     * Project using named projection type
     * @param {Vec4} v - 4D point
     * @param {string} type - 'perspective', 'stereographic', 'orthographic', 'oblique'
     * @param {object} options - Type-specific options
     * @returns {Vec4}
     */
    static project(v, type, options = {}) {
        switch (type.toLowerCase()) {
            case 'perspective':
                return Projection.perspective(v, options.d || 2, options);
            case 'stereographic':
                return Projection.stereographic(v, options);
            case 'orthographic':
                return Projection.orthographic(v);
            case 'oblique':
                return Projection.oblique(v, options.shearX || 0.5, options.shearY || 0.5, options.shearZ || 0);
            default:
                throw new Error(`Unknown projection type: ${type}`);
        }
    }

    /**
     * Create a projection function with pre-set options
     * @param {string} type - Projection type
     * @param {object} options - Type-specific options
     * @returns {function(Vec4): Vec4}
     */
    static createProjector(type, options = {}) {
        return (v) => Projection.project(v, type, options);
    }
}

/**
 * SliceProjection - Cross-sectional slicing of 4D objects
 *
 * Instead of projecting, take a 3D cross-section of 4D geometry
 * at a specific W value.
 */
export class SliceProjection {
    /**
     * Check if a 4D point is within slice tolerance of W plane
     * @param {Vec4} v - 4D point
     * @param {number} wPlane - W value of slice plane
     * @param {number} tolerance - Slice thickness
     * @returns {boolean}
     */
    static isInSlice(v, wPlane = 0, tolerance = 0.1) {
        return Math.abs(v.w - wPlane) <= tolerance;
    }

    /**
     * Interpolate edge crossing through W slice plane
     *
     * Given two points on opposite sides of the slice plane,
     * find where the edge crosses the plane.
     *
     * @param {Vec4} v1 - First point
     * @param {Vec4} v2 - Second point
     * @param {number} wPlane - W value of slice plane
     * @returns {Vec4|null} Intersection point or null if no crossing
     */
    static edgeCrossing(v1, v2, wPlane = 0) {
        const w1 = v1.w - wPlane;
        const w2 = v2.w - wPlane;

        // Check if edge crosses plane
        if (w1 * w2 > 0) {
            return null; // Both on same side
        }

        if (Math.abs(w2 - w1) < 1e-10) {
            return null; // Edge parallel to plane
        }

        // Linear interpolation to find crossing
        const t = -w1 / (w2 - w1);
        return v1.lerp(v2, t);
    }

    /**
     * Filter points within slice tolerance
     * @param {Vec4[]} points
     * @param {number} wPlane
     * @param {number} tolerance
     * @returns {Vec4[]}
     */
    static filterSlice(points, wPlane = 0, tolerance = 0.1) {
        return points.filter(p => SliceProjection.isInSlice(p, wPlane, tolerance));
    }

    /**
     * Create slice intersection of edges with W plane
     *
     * @param {Vec4[]} vertices - 4D vertices
     * @param {number[][]} edges - Edge indices [[i, j], ...]
     * @param {number} wPlane - W value of slice plane
     * @returns {Vec4[]} Intersection points
     */
    static sliceEdges(vertices, edges, wPlane = 0) {
        const intersections = [];

        for (const [i, j] of edges) {
            const crossing = SliceProjection.edgeCrossing(vertices[i], vertices[j], wPlane);
            if (crossing) {
                intersections.push(crossing);
            }
        }

        return intersections;
    }
}

/**
 * AnimatedProjection - Time-varying projections
 */
export class AnimatedProjection {
    /**
     * Create an animated perspective projection
     * D value oscillates between min and max
     *
     * @param {number} minD - Minimum D value
     * @param {number} maxD - Maximum D value
     * @param {number} period - Period in seconds
     * @returns {function(Vec4, number): Vec4}
     */
    static oscillatingPerspective(minD = 1.5, maxD = 4, period = 4) {
        return (v, time) => {
            const t = (Math.sin(time * Math.PI * 2 / period) + 1) / 2;
            const d = minD + t * (maxD - minD);
            return Projection.perspective(v, d);
        };
    }

    /**
     * Create animated W-slice projection
     * Slice plane oscillates through the 4D object
     *
     * @param {number} minW - Minimum W plane
     * @param {number} maxW - Maximum W plane
     * @param {number} period - Period in seconds
     * @returns {function(Vec4, number): Vec4|null}
     */
    static oscillatingSlice(minW = -1, maxW = 1, period = 4) {
        const tolerance = 0.15;
        return (v, time) => {
            const t = (Math.sin(time * Math.PI * 2 / period) + 1) / 2;
            const wPlane = minW + t * (maxW - minW);
            if (SliceProjection.isInSlice(v, wPlane, tolerance)) {
                return Projection.orthographic(v);
            }
            return null;
        };
    }
}

export default Projection;
