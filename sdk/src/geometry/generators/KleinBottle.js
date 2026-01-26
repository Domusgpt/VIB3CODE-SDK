/**
 * Klein Bottle Generator
 *
 * The Klein bottle is a non-orientable surface that cannot exist
 * in 3D without self-intersection, but can be properly embedded in 4D.
 *
 * In 4D, it's a closed surface with no boundary and no inside/outside.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate Klein Bottle vertices using 4D embedding
 * The "figure-8" immersion extended to 4D to remove self-intersection
 *
 * @param {number} radius - Overall scale
 * @param {number} uSegments - Segments around length
 * @param {number} vSegments - Segments around circumference
 * @returns {Vec4[]} Array of vertices
 */
export function generateKleinBottleVertices(radius = 1, uSegments = 32, vSegments = 16) {
    const vertices = [];
    const r = radius;

    for (let i = 0; i <= uSegments; i++) {
        const u = (i / uSegments) * Math.PI * 2;
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        const cos2U = Math.cos(2 * u);
        const sin2U = Math.sin(2 * u);

        for (let j = 0; j <= vSegments; j++) {
            const v = (j / vSegments) * Math.PI * 2;
            const cosV = Math.cos(v);
            const sinV = Math.sin(v);

            // Klein bottle parametric equations in 4D
            // This is the "figure-8" Klein bottle lifted to 4D
            const x = r * (cosU * (cosU * cosV + 1) - sinU * sin2U * cosV / 2);
            const y = r * (sinU * (cosU * cosV + 1) + cosU * sin2U * cosV / 2);
            const z = r * sinV * (1 + cos2U / 2);
            const w = r * sinV * sin2U / 2;

            vertices.push(new Vec4(x, y, z, w));
        }
    }

    return vertices;
}

/**
 * Generate Klein Bottle using "bottle" parameterization
 * @param {number} scale - Overall scale
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices
 */
export function generateKleinBottleBottle(scale = 1, segments = 24) {
    const vertices = [];
    const a = scale * 2;
    const b = scale;

    for (let i = 0; i <= segments; i++) {
        const u = (i / segments) * Math.PI * 2;

        for (let j = 0; j <= segments; j++) {
            const v = (j / segments) * Math.PI * 2;

            let x, y, z, w;

            if (u < Math.PI) {
                // First half: bottle body
                x = (a + b * Math.cos(u)) * Math.cos(v);
                y = (a + b * Math.cos(u)) * Math.sin(v);
                z = b * Math.sin(u);
                w = b * Math.sin(u) * Math.sin(v / 2);
            } else {
                // Second half: handle that passes through
                const uShift = u - Math.PI;
                x = a * Math.cos(v) + b * Math.cos(uShift) * Math.cos(v);
                y = a * Math.sin(v) + b * Math.cos(uShift) * Math.sin(v);
                z = -b * Math.sin(uShift);
                w = -b * Math.sin(uShift) * Math.cos(v / 2);
            }

            vertices.push(new Vec4(x, y, z, w));
        }
    }

    return vertices;
}

/**
 * Generate Klein Bottle edges
 * @param {number} uSegments
 * @param {number} vSegments
 * @returns {number[][]} Edge pairs
 */
export function generateKleinBottleEdges(uSegments = 32, vSegments = 16) {
    const edges = [];

    for (let i = 0; i < uSegments; i++) {
        for (let j = 0; j < vSegments; j++) {
            const idx = i * (vSegments + 1) + j;
            const nextU = (i + 1) * (vSegments + 1) + j;
            const nextV = i * (vSegments + 1) + j + 1;

            edges.push([idx, nextU]);
            edges.push([idx, nextV]);
        }
    }

    // Close the surface by connecting last to first
    // Note: Klein bottle has twisted identification
    for (let j = 0; j < vSegments; j++) {
        const lastU = uSegments * (vSegments + 1) + j;
        // Connect to reversed v on first u
        const firstU = (vSegments - j);
        edges.push([lastU, firstU]);
    }

    return edges;
}

/**
 * Generate Möbius strip (related to Klein bottle)
 * A Möbius strip is a one-sided surface that can be embedded in 4D
 * @param {number} radius - Major radius
 * @param {number} width - Strip width
 * @param {number} segments - Resolution
 * @returns {object} Geometry
 */
export function generateMobiusStrip(radius = 1, width = 0.3, segments = 32) {
    const vertices = [];
    const edges = [];

    for (let i = 0; i <= segments; i++) {
        const u = (i / segments) * Math.PI * 2;
        const halfU = u / 2;

        for (let j = 0; j <= 4; j++) {
            const v = (j / 4) * 2 - 1; // -1 to 1

            const x = (radius + width * v * Math.cos(halfU)) * Math.cos(u);
            const y = (radius + width * v * Math.cos(halfU)) * Math.sin(u);
            const z = width * v * Math.sin(halfU);
            const w = width * v * Math.sin(halfU) * 0.5; // Lift to 4D

            vertices.push(new Vec4(x, y, z, w));
        }
    }

    // Generate grid edges
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < 4; j++) {
            const idx = i * 5 + j;
            edges.push([idx, idx + 1]);      // Along width
            edges.push([idx, idx + 5]);      // Along length
        }
        edges.push([i * 5 + 4, (i + 1) * 5 + 4]); // Last row
    }

    return {
        name: 'mobius_strip',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0
    };
}

/**
 * Generate complete Klein Bottle geometry
 * @param {number} scale - Overall scale
 * @param {number} density - Vertex density
 * @returns {object} Geometry
 */
export function generateKleinBottle(scale = 1, density = 24) {
    const uSeg = density;
    const vSeg = Math.floor(density / 2);
    const vertices = generateKleinBottleVertices(scale, uSeg, vSeg);
    const edges = generateKleinBottleEdges(uSeg, vSeg);

    return {
        name: 'klein_bottle',
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0,
        nonOrientable: true
    };
}

export default generateKleinBottle;
