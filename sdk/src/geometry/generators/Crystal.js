/**
 * Crystal Geometry Generator
 *
 * Generates crystalline structures in 4D space.
 * Includes octahedral, cubic, and higher-dimensional lattice structures.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate 4D octahedral cross-polytope (16-cell)
 * The 4D analog of an octahedron
 * @param {number} size - Scale factor
 * @returns {Vec4[]} 8 vertices
 */
export function generate16CellVertices(size = 1) {
    return [
        new Vec4(size, 0, 0, 0),
        new Vec4(-size, 0, 0, 0),
        new Vec4(0, size, 0, 0),
        new Vec4(0, -size, 0, 0),
        new Vec4(0, 0, size, 0),
        new Vec4(0, 0, -size, 0),
        new Vec4(0, 0, 0, size),
        new Vec4(0, 0, 0, -size)
    ];
}

/**
 * Generate 16-cell edges
 * Each vertex connects to all others except its opposite
 * @returns {number[][]} 24 edges
 */
export function generate16CellEdges() {
    const edges = [];
    // Pairs: (0,1), (2,3), (4,5), (6,7) are opposite vertices
    for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
            // Skip opposite vertices (differ by 1 and i is even)
            if (j === i + 1 && i % 2 === 0) continue;
            edges.push([i, j]);
        }
    }
    return edges;
}

/**
 * Generate 24-cell vertices (self-dual 4D polytope)
 * @param {number} size - Scale factor
 * @returns {Vec4[]} 24 vertices
 */
export function generate24CellVertices(size = 1) {
    const vertices = [];
    const s = size / Math.sqrt(2);

    // 16 vertices from tesseract edges
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            const signs = [
                [1, 1], [1, -1], [-1, 1], [-1, -1]
            ];
            for (const [s1, s2] of signs) {
                const v = new Vec4(0, 0, 0, 0);
                v.data[i] = s1 * s;
                v.data[j] = s2 * s;
                vertices.push(v);
            }
        }
    }

    return vertices;
}

/**
 * Generate 24-cell edges
 * @returns {number[][]} 96 edges
 */
export function generate24CellEdges() {
    const vertices = generate24CellVertices(1);
    const edges = [];
    const edgeLength = 1; // Normalized edge length

    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (Math.abs(dist - edgeLength) < 0.01) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * Generate cubic lattice in 4D
 * @param {number} size - Lattice extent
 * @param {number} spacing - Point spacing
 * @returns {Vec4[]} Lattice points
 */
export function generateCubicLattice4D(size = 2, spacing = 0.5) {
    const vertices = [];
    const n = Math.floor(size / spacing);

    for (let x = -n; x <= n; x++) {
        for (let y = -n; y <= n; y++) {
            for (let z = -n; z <= n; z++) {
                for (let w = -n; w <= n; w++) {
                    vertices.push(new Vec4(
                        x * spacing,
                        y * spacing,
                        z * spacing,
                        w * spacing
                    ));
                }
            }
        }
    }

    return vertices;
}

/**
 * Generate FCC (face-centered cubic) lattice extended to 4D
 * @param {number} size - Lattice extent
 * @param {number} spacing - Base spacing
 * @returns {Vec4[]} Lattice points
 */
export function generateFCCLattice4D(size = 1.5, spacing = 1) {
    const vertices = [];
    const n = Math.floor(size / spacing);
    const half = spacing / 2;

    for (let x = -n; x <= n; x++) {
        for (let y = -n; y <= n; y++) {
            for (let z = -n; z <= n; z++) {
                for (let w = -n; w <= n; w++) {
                    // Corner positions
                    vertices.push(new Vec4(
                        x * spacing,
                        y * spacing,
                        z * spacing,
                        w * spacing
                    ));

                    // Face centers (4D has 6 2-faces meeting at each vertex)
                    if (x < n && y < n) {
                        vertices.push(new Vec4(
                            x * spacing + half,
                            y * spacing + half,
                            z * spacing,
                            w * spacing
                        ));
                    }
                    if (x < n && z < n) {
                        vertices.push(new Vec4(
                            x * spacing + half,
                            y * spacing,
                            z * spacing + half,
                            w * spacing
                        ));
                    }
                    if (x < n && w < n) {
                        vertices.push(new Vec4(
                            x * spacing + half,
                            y * spacing,
                            z * spacing,
                            w * spacing + half
                        ));
                    }
                }
            }
        }
    }

    return vertices;
}

/**
 * Generate diamond crystal structure in 4D
 * @param {number} size - Crystal size
 * @param {number} spacing - Lattice spacing
 * @returns {object} Vertices and edges
 */
export function generateDiamondCrystal4D(size = 1.5, spacing = 1) {
    const vertices = [];
    const edges = [];
    const n = Math.floor(size / spacing);
    const offset = spacing / 4;

    // Base FCC lattice
    const fcc = generateFCCLattice4D(size, spacing);

    // Add offset positions (diamond has two interpenetrating FCC lattices)
    for (const v of fcc) {
        vertices.push(v);
        vertices.push(new Vec4(
            v.x + offset,
            v.y + offset,
            v.z + offset,
            v.w + offset
        ));
    }

    // Connect nearest neighbors
    const bondLength = spacing * Math.sqrt(3) / 4 * 1.1; // With tolerance

    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (dist < bondLength && dist > 0.01) {
                edges.push([i, j]);
            }
        }
    }

    return { vertices, edges };
}

/**
 * Generate quasicrystal pattern in 4D (Penrose-like)
 * Uses projection from higher-dimensional lattice
 * @param {number} size - Pattern size
 * @param {number} density - Point density
 * @returns {Vec4[]} Vertices
 */
export function generateQuasicrystal4D(size = 2, density = 10) {
    const vertices = [];
    const n = density;

    // Golden ratio for quasicrystal symmetry
    const phi = (1 + Math.sqrt(5)) / 2;

    // Generate points using icosahedral projection
    for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
            for (let k = -n; k <= n; k++) {
                // Project from 6D to 4D using golden ratio
                const x = (i + phi * j) / n * size;
                const y = (j + phi * k) / n * size;
                const z = (k + phi * i) / n * size;
                const w = (i - j + k) / (n * 2) * size;

                // Keep points within bounds
                const len = Math.sqrt(x * x + y * y + z * z + w * w);
                if (len <= size * 1.5) {
                    vertices.push(new Vec4(x, y, z, w));
                }
            }
        }
    }

    return vertices;
}

/**
 * Generate crystal unit cell with specified symmetry
 * @param {string} type - 'cubic', 'tetragonal', 'orthorhombic', 'hexagonal'
 * @param {number} size - Cell size
 * @returns {object} Vertices and edges
 */
export function generateUnitCell4D(type = 'cubic', size = 1) {
    const vertices = [];
    const edges = [];

    switch (type) {
        case 'cubic':
            // Regular 4D hypercube unit cell
            for (let x = 0; x <= 1; x++) {
                for (let y = 0; y <= 1; y++) {
                    for (let z = 0; z <= 1; z++) {
                        for (let w = 0; w <= 1; w++) {
                            vertices.push(new Vec4(
                                x * size, y * size, z * size, w * size
                            ));
                        }
                    }
                }
            }
            break;

        case 'tetragonal':
            // Stretched in W direction
            for (let x = 0; x <= 1; x++) {
                for (let y = 0; y <= 1; y++) {
                    for (let z = 0; z <= 1; z++) {
                        for (let w = 0; w <= 1; w++) {
                            vertices.push(new Vec4(
                                x * size, y * size, z * size, w * size * 1.5
                            ));
                        }
                    }
                }
            }
            break;

        case 'hexagonal':
            // Hexagonal base with W extension
            const angles = [0, Math.PI / 3, 2 * Math.PI / 3,
                Math.PI, 4 * Math.PI / 3, 5 * Math.PI / 3];
            for (const angle of angles) {
                for (let z = 0; z <= 1; z++) {
                    for (let w = 0; w <= 1; w++) {
                        vertices.push(new Vec4(
                            Math.cos(angle) * size,
                            Math.sin(angle) * size,
                            z * size,
                            w * size
                        ));
                    }
                }
            }
            // Center vertices
            for (let z = 0; z <= 1; z++) {
                for (let w = 0; w <= 1; w++) {
                    vertices.push(new Vec4(0, 0, z * size, w * size));
                }
            }
            break;

        default:
            // Default to cubic
            return generateUnitCell4D('cubic', size);
    }

    // Generate edges for unit cell (connect nearest neighbors)
    const maxEdge = size * 1.1;
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (dist <= maxEdge && dist > 0.01) {
                edges.push([i, j]);
            }
        }
    }

    return { vertices, edges };
}

/**
 * Generate crystal edges based on nearest neighbors
 * @param {Vec4[]} vertices
 * @param {number} bondLength - Maximum bond length
 * @returns {number[][]} Edge pairs
 */
export function generateCrystalEdges(vertices, bondLength = 0.6) {
    const edges = [];

    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dist = vertices[i].distanceTo(vertices[j]);
            if (dist <= bondLength && dist > 0.001) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * Generate complete crystal geometry
 * @param {string} type - '16cell', '24cell', 'cubic', 'fcc', 'diamond', 'quasicrystal'
 * @param {number} scale - Overall scale
 * @param {object} params - Additional parameters
 * @returns {object} Geometry
 */
export function generateCrystal(type = '16cell', scale = 1, params = {}) {
    let vertices, edges;

    switch (type) {
        case '16cell':
            vertices = generate16CellVertices(scale);
            edges = generate16CellEdges();
            break;

        case '24cell':
            vertices = generate24CellVertices(scale);
            edges = generate24CellEdges();
            break;

        case 'cubic':
            vertices = generateCubicLattice4D(scale, params.spacing || 0.5);
            edges = generateCrystalEdges(vertices, (params.spacing || 0.5) * 1.1);
            break;

        case 'fcc':
            vertices = generateFCCLattice4D(scale, params.spacing || 1);
            edges = generateCrystalEdges(vertices, (params.spacing || 1) * 0.8);
            break;

        case 'diamond':
            const diamond = generateDiamondCrystal4D(scale, params.spacing || 1);
            vertices = diamond.vertices;
            edges = diamond.edges;
            break;

        case 'quasicrystal':
            vertices = generateQuasicrystal4D(scale, params.density || 10);
            edges = generateCrystalEdges(vertices, scale * 0.3);
            break;

        default:
            vertices = generate16CellVertices(scale);
            edges = generate16CellEdges();
    }

    return {
        name: `crystal_${type}`,
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0,
        crystalType: type
    };
}

export default generateCrystal;
