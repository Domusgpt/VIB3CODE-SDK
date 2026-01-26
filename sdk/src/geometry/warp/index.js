/**
 * Geometry Warp Functions
 *
 * Core transformations that wrap base geometries in 4D structures.
 * Part of the 24-variant encoding system:
 * - geometries 0-7: Base geometries (no warp)
 * - geometries 8-15: Hypersphere core warp
 * - geometries 16-23: Hypertetrahedron core warp
 */

export {
    warpHypersphereCore,
    projectToHypersphere,
    stereographicToHypersphere,
    hopfFibration,
    warpRadial,
    warpStereographic,
    warpHopf,
    generateHypersphereSurface
} from './HypersphereCore.js';

export {
    warpHypertetraCore,
    getPentatopeVertices,
    getPentatopeEdges,
    getPentatopeFaces,
    getPentatopeCells,
    toBarycentricCoords,
    fromBarycentricCoords,
    warpTetrahedral,
    warpToEdges,
    warpToCells,
    generatePentatope
} from './HypertetraCore.js';

/**
 * Core type constants
 */
export const CORE_TYPES = {
    BASE: 0,
    HYPERSPHERE: 1,
    HYPERTETRAHEDRON: 2
};

/**
 * Get core type name from index
 * @param {number} coreIndex
 * @returns {string}
 */
export function getCoreTypeName(coreIndex) {
    switch (coreIndex) {
        case 0: return 'base';
        case 1: return 'hypersphere';
        case 2: return 'hypertetrahedron';
        default: return 'unknown';
    }
}
