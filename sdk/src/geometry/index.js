/**
 * Geometry Module
 *
 * Complete 4D geometry generation system with 24 variants.
 *
 * Encoding: geometry = coreIndex * 8 + baseIndex
 *
 * Base Geometries (0-7):
 *   0: Tetrahedron - 5-cell (pentatope)
 *   1: Hypercube - Tesseract
 *   2: Sphere - 4D hypersphere
 *   3: Torus - Clifford torus
 *   4: Klein Bottle - Non-orientable 4D surface
 *   5: Fractal - Recursive 4D structures
 *   6: Wave - Sinusoidal 4D patterns
 *   7: Crystal - Crystalline lattices
 *
 * Core Types:
 *   0: Base (0-7) - Pure geometry
 *   1: Hypersphere (8-15) - Wrapped in 4D sphere
 *   2: Hypertetrahedron (16-23) - Wrapped in 5-cell
 */

// Main factory
export {
    GeometryFactory,
    defaultFactory,
    generateGeometry,
    generateBaseGeometry,
    applyWarp,
    decodeGeometry,
    encodeGeometry,
    getGeometryName,
    getAllGeometryNames,
    BASE_GEOMETRIES,
    CORE_TYPES
} from './GeometryFactory.js';

// Base generators
export { default as generateTesseract } from './generators/Tesseract.js';
export {
    generateTesseractVertices,
    generateTesseractEdges,
    generateTesseractFaces
} from './generators/Tesseract.js';

export {
    generate5Cell,
    generate5CellVertices,
    generate5CellEdges,
    generateTetrahedronLattice
} from './generators/Tetrahedron.js';

export {
    default as generateHypersphere,
    generateHypersphereVertices,
    generateHypersphereFibonacci,
    generateHypersphereLatitudes
} from './generators/Sphere.js';

export {
    generateCliffordTorus,
    generate4DTorus,
    generateTorusEdges
} from './generators/Torus.js';

export {
    default as generateKleinBottle,
    generateKleinBottleVertices,
    generateKleinBottleBottle,
    generateKleinBottleEdges,
    generateMobiusStrip
} from './generators/KleinBottle.js';

export {
    default as generateFractal,
    generateSierpinskiPentatope,
    generateMengerHypersponge,
    generateFractalTree4D,
    generateCantorDust4D
} from './generators/Fractal.js';

export {
    default as generateWave,
    generateStandingWave4D,
    generateInterferencePattern,
    generateRippleSurface,
    generateWaveHelix4D,
    generatePlaneWave4D,
    generateSphericalWave4D
} from './generators/Wave.js';

export {
    default as generateCrystal,
    generate16CellVertices,
    generate16CellEdges,
    generate24CellVertices,
    generate24CellEdges,
    generateCubicLattice4D,
    generateFCCLattice4D,
    generateDiamondCrystal4D,
    generateQuasicrystal4D,
    generateUnitCell4D
} from './generators/Crystal.js';

// Warp functions
export {
    warpHypersphereCore,
    projectToHypersphere,
    stereographicToHypersphere,
    hopfFibration,
    warpRadial,
    warpStereographic,
    warpHopf,
    generateHypersphereSurface
} from './warp/HypersphereCore.js';

export {
    warpHypertetraCore,
    getPentatopeVertices,
    getPentatopeEdges,
    getPentatopeFaces,
    getPentatopeCells,
    warpTetrahedral,
    warpToEdges,
    warpToCells,
    generatePentatope
} from './warp/HypertetraCore.js';

export { CORE_TYPES as WARP_CORE_TYPES, getCoreTypeName } from './warp/index.js';

// Buffer utilities
export {
    buildVertexBuffer,
    buildEdgeIndexBuffer,
    buildFaceIndexBuffer,
    buildInterleavedBuffer,
    buildNormalBuffer,
    generateWDepthColors,
    generateRainbowColors,
    buildGeometryBuffers
} from './buffers/BufferBuilder.js';
