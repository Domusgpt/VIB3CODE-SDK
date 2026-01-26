/**
 * Fractal Geometry Generator
 *
 * Generates recursive fractal structures in 4D space.
 * Uses Menger sponge and Sierpinski-like constructions extended to 4D.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate 4D Sierpinski simplex (pentatope fractal)
 * @param {number} depth - Recursion depth (0-4 recommended)
 * @param {number} scale - Overall scale
 * @returns {Vec4[]} Vertices
 */
export function generateSierpinskiPentatope(depth = 2, scale = 1) {
    // Base pentatope vertices (5-cell)
    const baseVertices = [
        new Vec4(1, 1, 1, -1 / Math.sqrt(5)).scale(scale),
        new Vec4(1, -1, -1, -1 / Math.sqrt(5)).scale(scale),
        new Vec4(-1, 1, -1, -1 / Math.sqrt(5)).scale(scale),
        new Vec4(-1, -1, 1, -1 / Math.sqrt(5)).scale(scale),
        new Vec4(0, 0, 0, Math.sqrt(5) - 1 / Math.sqrt(5)).scale(scale)
    ];

    if (depth === 0) {
        return baseVertices;
    }

    const vertices = [];

    // Recursive subdivision
    function subdivide(verts, d) {
        if (d === 0) {
            vertices.push(...verts);
            return;
        }

        // Find midpoints and create 5 smaller pentatopes
        const midpoints = [];
        for (let i = 0; i < 5; i++) {
            for (let j = i + 1; j < 5; j++) {
                midpoints.push(verts[i].lerp(verts[j], 0.5));
            }
        }

        // Create 5 sub-pentatopes at each vertex
        for (let i = 0; i < 5; i++) {
            const subVerts = [verts[i]];
            // Find midpoints connected to vertex i
            let idx = 0;
            for (let j = 0; j < 5; j++) {
                for (let k = j + 1; k < 5; k++) {
                    if (j === i || k === i) {
                        subVerts.push(midpoints[idx]);
                    }
                    idx++;
                }
            }
            if (subVerts.length >= 5) {
                subdivide(subVerts.slice(0, 5), d - 1);
            }
        }
    }

    subdivide(baseVertices, depth);
    return vertices;
}

/**
 * Generate 4D Menger sponge analog
 * @param {number} depth - Recursion depth (0-3 recommended)
 * @param {number} scale - Overall scale
 * @returns {Vec4[]} Vertices
 */
export function generateMengerHypersponge(depth = 1, scale = 1) {
    const vertices = [];

    function addCube(center, size, d) {
        if (d === 0) {
            // Add 16 vertices of this hypercube
            for (let x = -1; x <= 1; x += 2) {
                for (let y = -1; y <= 1; y += 2) {
                    for (let z = -1; z <= 1; z += 2) {
                        for (let w = -1; w <= 1; w += 2) {
                            vertices.push(new Vec4(
                                center.x + x * size,
                                center.y + y * size,
                                center.z + z * size,
                                center.w + w * size
                            ));
                        }
                    }
                }
            }
            return;
        }

        // Subdivide into 3x3x3x3 = 81 sub-cubes
        // Remove center and face-adjacent cubes (Menger rule extended to 4D)
        const subSize = size / 3;

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    for (let w = -1; w <= 1; w++) {
                        // Count how many coordinates are 0 (center)
                        const zeros = (x === 0 ? 1 : 0) +
                                     (y === 0 ? 1 : 0) +
                                     (z === 0 ? 1 : 0) +
                                     (w === 0 ? 1 : 0);

                        // Skip if 2 or more coordinates are 0 (hollow center)
                        if (zeros >= 2) continue;

                        const subCenter = new Vec4(
                            center.x + x * subSize * 2,
                            center.y + y * subSize * 2,
                            center.z + z * subSize * 2,
                            center.w + w * subSize * 2
                        );

                        addCube(subCenter, subSize, d - 1);
                    }
                }
            }
        }
    }

    addCube(Vec4.zero(), scale, depth);
    return vertices;
}

/**
 * Generate fractal tree in 4D
 * @param {number} depth - Recursion depth
 * @param {number} length - Initial branch length
 * @param {number} angle - Branch angle
 * @returns {object} Vertices and edges
 */
export function generateFractalTree4D(depth = 4, length = 1, angle = Math.PI / 6) {
    const vertices = [Vec4.zero()];
    const edges = [];

    function branch(startIdx, dir, len, d) {
        if (d === 0 || len < 0.01) return;

        const startVert = vertices[startIdx];
        const endVert = startVert.add(dir.scale(len));
        const endIdx = vertices.length;
        vertices.push(endVert);
        edges.push([startIdx, endIdx]);

        // Branch in all 4D rotation planes
        const planes = [
            { cos: Math.cos(angle), sin: Math.sin(angle), axes: ['x', 'y'] },
            { cos: Math.cos(angle), sin: Math.sin(angle), axes: ['x', 'z'] },
            { cos: Math.cos(angle), sin: Math.sin(angle), axes: ['x', 'w'] },
            { cos: Math.cos(-angle), sin: Math.sin(-angle), axes: ['y', 'z'] }
        ];

        const decay = 0.7;

        for (const plane of planes) {
            const newDir = rotateVector(dir, plane);
            branch(endIdx, newDir, len * decay, d - 1);
        }
    }

    function rotateVector(v, plane) {
        const result = v.clone();
        const a1 = plane.axes[0];
        const a2 = plane.axes[1];
        const v1 = v[a1];
        const v2 = v[a2];
        result[a1] = v1 * plane.cos - v2 * plane.sin;
        result[a2] = v1 * plane.sin + v2 * plane.cos;
        return result;
    }

    // Start branches in positive W direction
    branch(0, new Vec4(0, 1, 0, 0.5).normalize(), length, depth);

    return { vertices, edges };
}

/**
 * Generate Cantor dust in 4D (hypercube subdivision)
 * @param {number} depth - Recursion depth
 * @param {number} scale - Overall scale
 * @returns {Vec4[]} Point cloud
 */
export function generateCantorDust4D(depth = 3, scale = 1) {
    const points = [];

    function subdivide(center, size, d) {
        if (d === 0) {
            points.push(center);
            return;
        }

        const subSize = size / 3;

        // Only keep corners (Cantor rule: remove middle third)
        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    for (let w = -1; w <= 1; w += 2) {
                        const subCenter = new Vec4(
                            center.x + x * subSize * 2,
                            center.y + y * subSize * 2,
                            center.z + z * subSize * 2,
                            center.w + w * subSize * 2
                        );
                        subdivide(subCenter, subSize, d - 1);
                    }
                }
            }
        }
    }

    subdivide(Vec4.zero(), scale, depth);
    return points;
}

/**
 * Generate fractal edges for a vertex set
 * @param {Vec4[]} vertices
 * @param {number} maxDistance - Maximum edge distance
 * @returns {number[][]} Edge pairs
 */
export function generateFractalEdges(vertices, maxDistance = 0.5) {
    const edges = [];
    const n = vertices.length;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (dist < maxDistance && dist > 0.001) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * Generate complete fractal geometry
 * @param {string} type - 'sierpinski', 'menger', 'tree', 'cantor'
 * @param {number} depth - Recursion depth
 * @param {number} scale - Overall scale
 * @returns {object} Geometry
 */
export function generateFractal(type = 'sierpinski', depth = 2, scale = 1) {
    let vertices, edges;

    switch (type) {
        case 'sierpinski':
            vertices = generateSierpinskiPentatope(depth, scale);
            edges = generateFractalEdges(vertices, scale * 0.8);
            break;

        case 'menger':
            vertices = generateMengerHypersponge(depth, scale);
            edges = generateFractalEdges(vertices, scale * 0.4 / Math.pow(3, depth));
            break;

        case 'tree':
            const tree = generateFractalTree4D(depth, scale);
            vertices = tree.vertices;
            edges = tree.edges;
            break;

        case 'cantor':
            vertices = generateCantorDust4D(depth, scale);
            edges = generateFractalEdges(vertices, scale * 0.3);
            break;

        default:
            vertices = generateSierpinskiPentatope(depth, scale);
            edges = generateFractalEdges(vertices, scale * 0.8);
    }

    return {
        name: `fractal_${type}`,
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0,
        fractalDepth: depth,
        fractalType: type
    };
}

export default generateFractal;
