export const HOLOGRAPHIC_CORE_TYPES = {
    BASE: 0,
    HYPERSPHERE: 1,
    HYPERTETRA: 2
};

export const HOLOGRAPHIC_VARIANT_GEOMETRY_MAP = [
    // Legacy 30 variants mapped to base geometries
    0, 0, 0, 0,
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
    4, 4, 4, 4,
    5, 5, 5,
    6, 6, 6,
    7, 7, 7, 7,
    // Hypersphere core expansion (variants 30-37)
    0, 1, 2, 3, 4, 5, 6, 7,
    // Hypertetra core expansion (variants 38-45)
    0, 1, 2, 3, 4, 5, 6, 7
];

export const HOLOGRAPHIC_VARIANT_CORE_MAP = [
    // Base system uses the hypercube-oriented core
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0, 0,
    // Hypersphere core block
    1, 1, 1, 1, 1, 1, 1, 1,
    // Hypertetra core block
    2, 2, 2, 2, 2, 2, 2, 2
];

export const HOLOGRAPHIC_VARIANT_NAMES = [
    // Original catalogue
    'TETRAHEDRON LATTICE', 'TETRAHEDRON FIELD', 'TETRAHEDRON MATRIX', 'TETRAHEDRON RESONANCE',
    'HYPERCUBE LATTICE', 'HYPERCUBE FIELD', 'HYPERCUBE MATRIX', 'HYPERCUBE QUANTUM',
    'SPHERE LATTICE', 'SPHERE FIELD', 'SPHERE MATRIX', 'SPHERE RESONANCE',
    'TORUS LATTICE', 'TORUS FIELD', 'TORUS MATRIX', 'TORUS QUANTUM',
    'KLEIN BOTTLE LATTICE', 'KLEIN BOTTLE FIELD', 'KLEIN BOTTLE MATRIX', 'KLEIN BOTTLE QUANTUM',
    'FRACTAL LATTICE', 'FRACTAL FIELD', 'FRACTAL QUANTUM',
    'WAVE LATTICE', 'WAVE FIELD', 'WAVE QUANTUM',
    'CRYSTAL LATTICE', 'CRYSTAL FIELD', 'CRYSTAL MATRIX', 'CRYSTAL QUANTUM',
    // Hypersphere core additions
    'TETRAHEDRON • HYPERSPHERE CORE',
    'HYPERCUBE • HYPERSPHERE CORE',
    'SPHERE • HYPERSPHERE CORE',
    'TORUS • HYPERSPHERE CORE',
    'KLEIN BOTTLE • HYPERSPHERE CORE',
    'FRACTAL • HYPERSPHERE CORE',
    'WAVE • HYPERSPHERE CORE',
    'CRYSTAL • HYPERSPHERE CORE',
    // Hypertetra core additions
    'TETRAHEDRON • HYPERTETRA CORE',
    'HYPERCUBE • HYPERTETRA CORE',
    'SPHERE • HYPERTETRA CORE',
    'TORUS • HYPERTETRA CORE',
    'KLEIN BOTTLE • HYPERTETRA CORE',
    'FRACTAL • HYPERTETRA CORE',
    'WAVE • HYPERTETRA CORE',
    'CRYSTAL • HYPERTETRA CORE'
];

export const HOLOGRAPHIC_TOTAL_VARIANTS = HOLOGRAPHIC_VARIANT_NAMES.length;
