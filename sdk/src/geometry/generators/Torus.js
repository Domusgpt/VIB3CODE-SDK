/**
 * 4D Torus Generators
 *
 * In 4D, there are several types of tori:
 * - Clifford Torus: flat torus embedded in 3-sphere
 * - Duocylinder: product of two circles S¹ × S¹
 * - 3-Torus: S¹ × S¹ × S¹
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate Clifford Torus vertices
 * The Clifford torus is a flat torus embedded in the 3-sphere.
 * Parameterized by two angles: x = cos(θ), y = sin(θ), z = cos(φ), w = sin(φ)
 *
 * @param {number} radius - Overall radius
 * @param {number} segments - Points per angle dimension
 * @returns {Vec4[]} Array of vertices
 */
export function generateCliffordTorusVertices(radius = 1, segments = 16) {
    const vertices = [];
    const scale = radius / Math.sqrt(2);

    for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        for (let j = 0; j < segments; j++) {
            const phi = (j / segments) * Math.PI * 2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            vertices.push(new Vec4(
                scale * cosTheta,
                scale * sinTheta,
                scale * cosPhi,
                scale * sinPhi
            ));
        }
    }

    return vertices;
}

/**
 * Generate Clifford Torus edges
 * @param {number} segments - Points per dimension
 * @returns {number[][]} Edge pairs
 */
export function generateCliffordTorusEdges(segments = 16) {
    const edges = [];

    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
            const idx = i * segments + j;
            const nextI = ((i + 1) % segments) * segments + j;
            const nextJ = i * segments + ((j + 1) % segments);

            edges.push([idx, nextI]);
            edges.push([idx, nextJ]);
        }
    }

    return edges;
}

/**
 * Generate standard 3D torus embedded in 4D
 * @param {number} majorRadius - Distance from center to tube center
 * @param {number} minorRadius - Tube radius
 * @param {number} majorSegments - Segments around major circle
 * @param {number} minorSegments - Segments around minor circle
 * @param {number} wOffset - W coordinate (default 0)
 * @returns {Vec4[]} Vertices
 */
export function generateTorusVertices(majorRadius = 1, minorRadius = 0.4, majorSegments = 16, minorSegments = 8, wOffset = 0) {
    const vertices = [];

    for (let i = 0; i < majorSegments; i++) {
        const theta = (i / majorSegments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        for (let j = 0; j < minorSegments; j++) {
            const phi = (j / minorSegments) * Math.PI * 2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);

            const x = (majorRadius + minorRadius * cosPhi) * cosTheta;
            const y = (majorRadius + minorRadius * cosPhi) * sinTheta;
            const z = minorRadius * sinPhi;

            vertices.push(new Vec4(x, y, z, wOffset));
        }
    }

    return vertices;
}

/**
 * Generate torus edges
 * @param {number} majorSegments
 * @param {number} minorSegments
 * @returns {number[][]} Edge pairs
 */
export function generateTorusEdges(majorSegments = 16, minorSegments = 8) {
    const edges = [];

    for (let i = 0; i < majorSegments; i++) {
        for (let j = 0; j < minorSegments; j++) {
            const idx = i * minorSegments + j;
            const nextI = ((i + 1) % majorSegments) * minorSegments + j;
            const nextJ = i * minorSegments + ((j + 1) % minorSegments);

            edges.push([idx, nextI]);
            edges.push([idx, nextJ]);
        }
    }

    return edges;
}

/**
 * Generate 4D torus extending in W dimension
 * Creates a torus that also loops in W
 * @param {number} radius - Base radius
 * @param {number} segments - Segments per dimension
 * @returns {object} Geometry
 */
export function generateTorus4D(radius = 1, segments = 12) {
    const vertices = [];
    const edges = [];

    const r1 = radius;
    const r2 = radius * 0.4;
    const r3 = radius * 0.2;

    for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);

        for (let j = 0; j < segments; j++) {
            const phi = (j / segments) * Math.PI * 2;
            const cp = Math.cos(phi);
            const sp = Math.sin(phi);

            for (let k = 0; k < segments / 2; k++) {
                const psi = (k / (segments / 2)) * Math.PI * 2;
                const cps = Math.cos(psi);
                const sps = Math.sin(psi);

                const x = (r1 + r2 * cp + r3 * cps) * ct;
                const y = (r1 + r2 * cp + r3 * cps) * st;
                const z = r2 * sp;
                const w = r3 * sps;

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    // Generate edges connecting neighbors
    const halfSeg = segments / 2;
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
            for (let k = 0; k < halfSeg; k++) {
                const idx = i * segments * halfSeg + j * halfSeg + k;
                const nextI = ((i + 1) % segments) * segments * halfSeg + j * halfSeg + k;
                const nextJ = i * segments * halfSeg + ((j + 1) % segments) * halfSeg + k;
                const nextK = i * segments * halfSeg + j * halfSeg + ((k + 1) % halfSeg);

                edges.push([idx, nextI]);
                edges.push([idx, nextJ]);
                edges.push([idx, nextK]);
            }
        }
    }

    return {
        name: 'torus4d',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0
    };
}

/**
 * Generate complete torus geometry (Clifford Torus)
 * @param {number} radius - Radius
 * @param {number} density - Vertex density
 * @returns {object} Geometry
 */
export function generateTorus(radius = 1, density = 16) {
    const vertices = generateCliffordTorusVertices(radius, density);
    const edges = generateCliffordTorusEdges(density);

    return {
        name: 'clifford_torus',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0
    };
}

export default generateTorus;
