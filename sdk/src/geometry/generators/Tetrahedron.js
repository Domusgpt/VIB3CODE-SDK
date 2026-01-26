/**
 * 4D Tetrahedron (5-cell / Pentatope) Generator
 *
 * The 5-cell is the 4D analog of a tetrahedron.
 * - 5 vertices
 * - 10 edges
 * - 10 triangular faces
 * - 5 tetrahedral cells
 *
 * Also generates simpler 4D-embedded 3D tetrahedron variants.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate 5-cell (pentatope) vertices
 * Regular 5-cell inscribed in unit 4-sphere
 * @param {number} size - Scale factor (default 1)
 * @returns {Vec4[]} Array of 5 vertices
 */
export function generatePentatopeVertices(size = 1) {
    // Coordinates for regular 5-cell centered at origin
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    const a = size / Math.sqrt(10);
    const b = a * Math.sqrt(5);
    const c = a * 2;

    return [
        new Vec4(b, 0, -a, 0),
        new Vec4(-b, 0, -a, 0),
        new Vec4(0, b, a, 0),
        new Vec4(0, -b, a, 0),
        new Vec4(0, 0, 0, c * Math.sqrt(5))
    ];
}

/**
 * Generate simple 4D tetrahedron (3D tetrahedron embedded in 4D at w=0)
 * @param {number} size - Scale factor
 * @returns {Vec4[]} Array of 4 vertices
 */
export function generateTetrahedronVertices(size = 1) {
    // Regular tetrahedron centered at origin, embedded at w=0
    const a = size / Math.sqrt(2);

    return [
        new Vec4(a, a, a, 0),
        new Vec4(a, -a, -a, 0),
        new Vec4(-a, a, -a, 0),
        new Vec4(-a, -a, a, 0)
    ];
}

/**
 * Generate 5-cell edges
 * All pairs of vertices are connected in a 5-cell
 * @returns {number[][]} Array of [i, j] index pairs
 */
export function generatePentatopeEdges() {
    const edges = [];
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            edges.push([i, j]);
        }
    }
    return edges;
}

/**
 * Generate tetrahedron edges
 * @returns {number[][]} Array of [i, j] index pairs
 */
export function generateTetrahedronEdges() {
    return [
        [0, 1], [0, 2], [0, 3],
        [1, 2], [1, 3], [2, 3]
    ];
}

/**
 * Generate 5-cell faces (triangles)
 * @returns {number[][]} Array of [a, b, c] vertex indices
 */
export function generatePentatopeFaces() {
    const faces = [];
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
                faces.push([i, j, k]);
            }
        }
    }
    return faces;
}

/**
 * Generate tetrahedron faces
 * @returns {number[][]} Array of [a, b, c] vertex indices
 */
export function generateTetrahedronFaces() {
    return [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3]
    ];
}

/**
 * Generate complete 5-cell geometry
 * @param {number} size - Scale factor
 * @returns {object} Geometry object
 */
export function generatePentatope(size = 1) {
    return {
        name: 'pentatope',
        vertices: generatePentatopeVertices(size),
        edges: generatePentatopeEdges(),
        faces: generatePentatopeFaces(),
        cells: 5,
        vertexCount: 5,
        edgeCount: 10,
        faceCount: 10
    };
}

/**
 * Generate complete tetrahedron geometry (4D embedded)
 * @param {number} size - Scale factor
 * @returns {object} Geometry object
 */
export function generateTetrahedron(size = 1) {
    return {
        name: 'tetrahedron',
        vertices: generateTetrahedronVertices(size),
        edges: generateTetrahedronEdges(),
        faces: generateTetrahedronFaces(),
        cells: 1,
        vertexCount: 4,
        edgeCount: 6,
        faceCount: 4
    };
}

/**
 * Generate tetrahedron lattice in 4D
 * Creates a grid of tetrahedra along W axis
 * @param {number} size - Individual tetrahedron size
 * @param {number} count - Number of layers along W
 * @param {number} wSpacing - Spacing between layers
 * @returns {object} Combined geometry
 */
export function generateTetrahedronLattice(size = 0.5, count = 4, wSpacing = 0.8) {
    const vertices = [];
    const edges = [];

    for (let layer = 0; layer < count; layer++) {
        const baseVerts = generateTetrahedronVertices(size);
        const wOffset = (layer - (count - 1) / 2) * wSpacing;
        const vertexOffset = vertices.length;

        // Add vertices with W offset
        for (const v of baseVerts) {
            vertices.push(new Vec4(v.x, v.y, v.z, wOffset));
        }

        // Add intra-layer edges
        for (const [i, j] of generateTetrahedronEdges()) {
            edges.push([vertexOffset + i, vertexOffset + j]);
        }

        // Connect to previous layer
        if (layer > 0) {
            const prevOffset = vertexOffset - 4;
            for (let i = 0; i < 4; i++) {
                edges.push([prevOffset + i, vertexOffset + i]);
            }
        }
    }

    return {
        name: 'tetrahedron_lattice',
        vertices,
        edges,
        faces: [],
        cells: count,
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0
    };
}

export default generateTetrahedron;
