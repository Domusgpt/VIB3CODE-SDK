/**
 * Tesseract (Hypercube) Generator
 *
 * The tesseract is the 4D analog of a cube.
 * - 16 vertices (2^4)
 * - 32 edges
 * - 24 square faces
 * - 8 cubic cells
 *
 * Vertices are at all combinations of (±1, ±1, ±1, ±1)
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate tesseract vertices
 * @param {number} size - Half-edge length (default 1)
 * @returns {Vec4[]} Array of 16 vertices
 */
export function generateTesseractVertices(size = 1) {
    const vertices = [];

    // Generate all 16 vertices at (±size, ±size, ±size, ±size)
    for (let i = 0; i < 16; i++) {
        const x = (i & 1) ? size : -size;
        const y = (i & 2) ? size : -size;
        const z = (i & 4) ? size : -size;
        const w = (i & 8) ? size : -size;
        vertices.push(new Vec4(x, y, z, w));
    }

    return vertices;
}

/**
 * Generate tesseract edges
 * Two vertices are connected if they differ in exactly one coordinate
 * @returns {number[][]} Array of [i, j] index pairs
 */
export function generateTesseractEdges() {
    const edges = [];

    for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) {
            // Count differing bits (Hamming distance)
            const diff = i ^ j;
            // If exactly one bit differs, they're connected
            if (diff && !(diff & (diff - 1))) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * Generate tesseract faces (squares)
 * Each face is defined by fixing 2 coordinates and varying 2
 * @returns {number[][]} Array of [a, b, c, d] vertex indices (counterclockwise)
 */
export function generateTesseractFaces() {
    const faces = [];

    // For each pair of dimensions, and each combination of fixed values
    for (let dim1 = 0; dim1 < 4; dim1++) {
        for (let dim2 = dim1 + 1; dim2 < 4; dim2++) {
            // Fixed dimensions
            const fixedDims = [];
            for (let d = 0; d < 4; d++) {
                if (d !== dim1 && d !== dim2) fixedDims.push(d);
            }

            // For each combination of fixed dimension values
            for (let fixed0 = 0; fixed0 < 2; fixed0++) {
                for (let fixed1 = 0; fixed1 < 2; fixed1++) {
                    // Build the 4 vertices of this face
                    const faceVertices = [];
                    for (let v1 = 0; v1 < 2; v1++) {
                        for (let v2 = 0; v2 < 2; v2++) {
                            let idx = 0;
                            // Set varying dimensions
                            if (v1) idx |= (1 << dim1);
                            if (v2) idx |= (1 << dim2);
                            // Set fixed dimensions
                            if (fixed0) idx |= (1 << fixedDims[0]);
                            if (fixed1) idx |= (1 << fixedDims[1]);
                            faceVertices.push(idx);
                        }
                    }
                    // Reorder for counterclockwise winding
                    faces.push([faceVertices[0], faceVertices[1], faceVertices[3], faceVertices[2]]);
                }
            }
        }
    }

    return faces;
}

/**
 * Generate complete tesseract geometry
 * @param {number} size - Half-edge length
 * @returns {object} { vertices, edges, faces, cells }
 */
export function generateTesseract(size = 1) {
    return {
        name: 'tesseract',
        vertices: generateTesseractVertices(size),
        edges: generateTesseractEdges(),
        faces: generateTesseractFaces(),
        cells: 8,
        vertexCount: 16,
        edgeCount: 32,
        faceCount: 24
    };
}

/**
 * Generate tesseract with subdivided edges for smoother rendering
 * @param {number} size - Half-edge length
 * @param {number} subdivisions - Points per edge (default 1 = no subdivision)
 * @returns {object} Geometry with subdivided edges
 */
export function generateTesseractSubdivided(size = 1, subdivisions = 1) {
    const baseGeom = generateTesseract(size);
    const vertices = [...baseGeom.vertices];
    const edges = [];

    if (subdivisions <= 1) {
        return baseGeom;
    }

    // For each edge, add intermediate points
    for (const [i, j] of baseGeom.edges) {
        const v1 = baseGeom.vertices[i];
        const v2 = baseGeom.vertices[j];

        let prevIdx = i;
        for (let s = 1; s < subdivisions; s++) {
            const t = s / subdivisions;
            const intermediate = v1.lerp(v2, t);
            const newIdx = vertices.length;
            vertices.push(intermediate);
            edges.push([prevIdx, newIdx]);
            prevIdx = newIdx;
        }
        edges.push([prevIdx, j]);
    }

    return {
        ...baseGeom,
        vertices,
        edges,
        vertexCount: vertices.length,
        edgeCount: edges.length
    };
}

export default generateTesseract;
