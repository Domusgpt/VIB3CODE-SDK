/**
 * Hypersphere Core Warp
 *
 * Warps base geometry onto a 4D hypersphere surface.
 * Creates geometries 8-15 in the 24-variant encoding system.
 *
 * The warp projects points onto the 3-sphere (S³), which is the
 * set of all unit vectors in 4D space.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Project a point onto the 3-sphere (hypersphere surface)
 * @param {Vec4} point - Input point
 * @param {number} radius - Hypersphere radius
 * @returns {Vec4} Point on hypersphere
 */
export function projectToHypersphere(point, radius = 1) {
    const len = point.length();
    if (len < 0.0001) {
        // Handle origin - project to north pole
        return new Vec4(0, 0, 0, radius);
    }
    return point.scale(radius / len);
}

/**
 * Inverse stereographic projection from R³ to S³
 * Maps all of 3D space onto the 4D hypersphere
 * @param {Vec4} point - Input point (uses x, y, z)
 * @param {number} radius - Hypersphere radius
 * @returns {Vec4} Point on hypersphere
 */
export function stereographicToHypersphere(point, radius = 1) {
    const x = point.x;
    const y = point.y;
    const z = point.z;

    const sumSq = x * x + y * y + z * z;
    const denom = sumSq + 1;

    return new Vec4(
        (2 * x) / denom * radius,
        (2 * y) / denom * radius,
        (2 * z) / denom * radius,
        (sumSq - 1) / denom * radius
    );
}

/**
 * Hopf fibration mapping
 * Maps points on S² × [0, 2π] to S³
 * Creates beautiful toroidal structures on the hypersphere
 * @param {number} theta - Angle on base S² (0 to π)
 * @param {number} phi - Azimuth on base S² (0 to 2π)
 * @param {number} psi - Fiber angle (0 to 2π)
 * @param {number} radius - Hypersphere radius
 * @returns {Vec4} Point on hypersphere
 */
export function hopfFibration(theta, phi, psi, radius = 1) {
    const cosTheta2 = Math.cos(theta / 2);
    const sinTheta2 = Math.sin(theta / 2);

    return new Vec4(
        cosTheta2 * Math.cos((phi + psi) / 2) * radius,
        cosTheta2 * Math.sin((phi + psi) / 2) * radius,
        sinTheta2 * Math.cos((phi - psi) / 2) * radius,
        sinTheta2 * Math.sin((phi - psi) / 2) * radius
    );
}

/**
 * Warp a geometry onto the hypersphere using radial projection
 * @param {Vec4[]} vertices - Input vertices
 * @param {number} radius - Hypersphere radius
 * @param {number} blendFactor - How much to blend (0=original, 1=full sphere)
 * @returns {Vec4[]} Warped vertices
 */
export function warpRadial(vertices, radius = 1, blendFactor = 1) {
    return vertices.map(v => {
        const onSphere = projectToHypersphere(v, radius);
        return v.lerp(onSphere, blendFactor);
    });
}

/**
 * Warp geometry using stereographic projection
 * Maps the entire geometry onto the hypersphere
 * @param {Vec4[]} vertices - Input vertices
 * @param {number} radius - Hypersphere radius
 * @param {number} scale - Pre-scale factor before projection
 * @returns {Vec4[]} Warped vertices
 */
export function warpStereographic(vertices, radius = 1, scale = 1) {
    return vertices.map(v => {
        const scaled = v.scale(scale);
        return stereographicToHypersphere(scaled, radius);
    });
}

/**
 * Warp geometry along Hopf fibers
 * Creates twisted, fibered structures
 * @param {Vec4[]} vertices - Input vertices
 * @param {number} radius - Hypersphere radius
 * @param {number} twist - Twist factor along fiber
 * @returns {Vec4[]} Warped vertices
 */
export function warpHopf(vertices, radius = 1, twist = 1) {
    return vertices.map(v => {
        // Convert to spherical-like coordinates
        const r = v.length();
        if (r < 0.0001) {
            return new Vec4(0, 0, 0, radius);
        }

        // Use original angles but apply to Hopf structure
        const theta = Math.acos(v.z / r);
        const phi = Math.atan2(v.y, v.x);
        const psi = v.w * twist + phi * 0.5;

        return hopfFibration(theta, phi, psi, radius);
    });
}

/**
 * Main hypersphere core warp function
 * Wraps base geometry in a 4D hypersphere structure
 *
 * @param {object} geometry - Base geometry with vertices and edges
 * @param {object} options - Warp options
 * @param {string} options.method - 'radial', 'stereographic', 'hopf'
 * @param {number} options.radius - Hypersphere radius (default 1)
 * @param {number} options.blend - Blend factor (default 1)
 * @param {number} options.scale - Pre-scale factor (default 1)
 * @param {number} options.twist - Hopf twist factor (default 1)
 * @returns {object} Warped geometry
 */
export function warpHypersphereCore(geometry, options = {}) {
    const {
        method = 'radial',
        radius = 1,
        blend = 1,
        scale = 1,
        twist = 1
    } = options;

    let warpedVertices;

    // Pre-scale vertices
    const scaledVertices = geometry.vertices.map(v => v.scale(scale));

    switch (method) {
        case 'stereographic':
            warpedVertices = warpStereographic(scaledVertices, radius, 1);
            break;

        case 'hopf':
            warpedVertices = warpHopf(scaledVertices, radius, twist);
            break;

        case 'radial':
        default:
            warpedVertices = warpRadial(scaledVertices, radius, blend);
            break;
    }

    return {
        ...geometry,
        name: `${geometry.name}_hypersphere`,
        vertices: warpedVertices,
        vertexCount: warpedVertices.length,
        coreType: 'hypersphere',
        warpMethod: method,
        warpRadius: radius
    };
}

/**
 * Generate pure hypersphere surface (for reference)
 * @param {number} radius - Hypersphere radius
 * @param {number} segments - Resolution per angle
 * @returns {Vec4[]} Vertices on hypersphere
 */
export function generateHypersphereSurface(radius = 1, segments = 16) {
    const vertices = [];

    // Use 3 angular parameters for S³
    for (let i = 0; i <= segments; i++) {
        const psi = (i / segments) * Math.PI;
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * Math.PI;
            for (let k = 0; k <= segments * 2; k++) {
                const phi = (k / (segments * 2)) * Math.PI * 2;

                // Hyperspherical coordinates
                const x = radius * Math.sin(psi) * Math.sin(theta) * Math.cos(phi);
                const y = radius * Math.sin(psi) * Math.sin(theta) * Math.sin(phi);
                const z = radius * Math.sin(psi) * Math.cos(theta);
                const w = radius * Math.cos(psi);

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    return vertices;
}

export default warpHypersphereCore;
