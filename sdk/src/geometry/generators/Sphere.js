/**
 * 4D Hypersphere Generator
 *
 * Generates points on a 4D hypersphere using various sampling methods.
 * The 3-sphere (hypersphere) is the set of points equidistant from origin in 4D.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate hypersphere vertices using spherical coordinates
 * Uses 3 angles (θ, φ, ψ) to parameterize the 3-sphere
 *
 * @param {number} radius - Sphere radius
 * @param {number} segments - Points per dimension
 * @returns {Vec4[]} Array of vertices on hypersphere
 */
export function generateHypersphereVertices(radius = 1, segments = 8) {
    const vertices = [];

    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let j = 0; j <= segments; j++) {
            const phi = (j / segments) * Math.PI;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            for (let k = 0; k <= segments * 2; k++) {
                const psi = (k / (segments * 2)) * Math.PI * 2;
                const sinPsi = Math.sin(psi);
                const cosPsi = Math.cos(psi);

                // Hyperspherical coordinates
                const x = radius * sinTheta * sinPhi * cosPsi;
                const y = radius * sinTheta * sinPhi * sinPsi;
                const z = radius * sinTheta * cosPhi;
                const w = radius * cosTheta;

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    return vertices;
}

/**
 * Generate hypersphere using Fibonacci lattice (more uniform distribution)
 * @param {number} radius - Sphere radius
 * @param {number} count - Number of points
 * @returns {Vec4[]} Array of uniformly distributed vertices
 */
export function generateHypersphereFibonacci(radius = 1, count = 200) {
    const vertices = [];
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio

    for (let i = 0; i < count; i++) {
        // Use 4D Fibonacci-like sequence
        const t1 = i / phi;
        const t2 = i / (phi * phi);
        const t3 = i / (phi * phi * phi);

        // Convert to angles
        const theta = Math.acos(1 - 2 * (i + 0.5) / count);
        const phi1 = 2 * Math.PI * (t1 % 1);
        const phi2 = 2 * Math.PI * (t2 % 1);

        // Map to 4D sphere
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const sinPhi1 = Math.sin(phi1);
        const cosPhi1 = Math.cos(phi1);
        const sinPhi2 = Math.sin(phi2);
        const cosPhi2 = Math.cos(phi2);

        const x = radius * sinTheta * cosPhi1;
        const y = radius * sinTheta * sinPhi1 * cosPhi2;
        const z = radius * sinTheta * sinPhi1 * sinPhi2;
        const w = radius * cosTheta;

        vertices.push(new Vec4(x, y, z, w));
    }

    return vertices;
}

/**
 * Generate hypersphere edges connecting nearby vertices
 * @param {Vec4[]} vertices - Vertices to connect
 * @param {number} threshold - Distance threshold for connection
 * @returns {number[][]} Edge pairs
 */
export function generateHypersphereEdges(vertices, threshold = 0.5) {
    const edges = [];

    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (dist < threshold) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * Generate latitude circles on hypersphere
 * @param {number} radius - Sphere radius
 * @param {number} latitudes - Number of latitude circles
 * @param {number} pointsPerCircle - Points per circle
 * @returns {object} Geometry with latitude circles
 */
export function generateHypersphereLatitudes(radius = 1, latitudes = 8, pointsPerCircle = 16) {
    const vertices = [];
    const edges = [];

    // Generate latitude circles at different W values
    for (let lat = 0; lat <= latitudes; lat++) {
        const w = radius * Math.cos((lat / latitudes) * Math.PI);
        const circleRadius = Math.sqrt(radius * radius - w * w);

        if (circleRadius < 0.001) {
            // Just a point at poles
            vertices.push(new Vec4(0, 0, 0, w));
            continue;
        }

        const startIdx = vertices.length;

        // Generate circle at this latitude
        for (let i = 0; i < pointsPerCircle; i++) {
            const angle1 = (i / pointsPerCircle) * Math.PI * 2;

            // Inner loop for the 3D circle at this W slice
            for (let j = 0; j < pointsPerCircle / 2; j++) {
                const angle2 = (j / (pointsPerCircle / 2)) * Math.PI * 2;

                const x = circleRadius * Math.cos(angle1) * Math.cos(angle2);
                const y = circleRadius * Math.cos(angle1) * Math.sin(angle2);
                const z = circleRadius * Math.sin(angle1);

                vertices.push(new Vec4(x, y, z, w));
            }
        }

        // Connect points in this latitude
        const endIdx = vertices.length;
        for (let i = startIdx; i < endIdx - 1; i++) {
            edges.push([i, i + 1]);
        }
        if (endIdx > startIdx + 1) {
            edges.push([endIdx - 1, startIdx]);
        }
    }

    return {
        name: 'hypersphere_latitudes',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length
    };
}

/**
 * Generate complete hypersphere geometry
 * @param {number} radius - Sphere radius
 * @param {number} density - Vertex density
 * @returns {object} Geometry object
 */
export function generateSphere(radius = 1, density = 8) {
    const vertices = generateHypersphereFibonacci(radius, density * density * 4);
    const edges = generateHypersphereEdges(vertices, radius * 0.4);

    return {
        name: 'hypersphere',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0
    };
}

export default generateSphere;
