/**
 * Geometry Factory
 *
 * Central factory for generating all 24 geometry variants.
 * Uses the encoding formula: geometry = coreIndex * 8 + baseIndex
 *
 * Base Geometries (0-7):
 *   0: Tetrahedron, 1: Hypercube, 2: Sphere, 3: Torus,
 *   4: Klein Bottle, 5: Fractal, 6: Wave, 7: Crystal
 *
 * Core Types (0-2):
 *   0: Base (geometries 0-7)
 *   1: Hypersphere Core (geometries 8-15)
 *   2: Hypertetrahedron Core (geometries 16-23)
 */

// Base geometry generators
import generateTesseract from './generators/Tesseract.js';
import { generate5Cell, generateTetrahedronLattice } from './generators/Tetrahedron.js';
import generateHypersphere from './generators/Sphere.js';
import { generateCliffordTorus, generate4DTorus } from './generators/Torus.js';
import generateKleinBottle from './generators/KleinBottle.js';
import generateFractal from './generators/Fractal.js';
import generateWave from './generators/Wave.js';
import generateCrystal from './generators/Crystal.js';

// Warp functions
import { warpHypersphereCore } from './warp/HypersphereCore.js';
import { warpHypertetraCore } from './warp/HypertetraCore.js';

/**
 * Base geometry names
 */
export const BASE_GEOMETRIES = [
    'tetrahedron',
    'hypercube',
    'sphere',
    'torus',
    'klein_bottle',
    'fractal',
    'wave',
    'crystal'
];

/**
 * Core type names
 */
export const CORE_TYPES = [
    'base',
    'hypersphere',
    'hypertetrahedron'
];

/**
 * Decode geometry index to base and core indices
 * @param {number} geometryIndex - Geometry index (0-23)
 * @returns {object} { baseIndex, coreIndex }
 */
export function decodeGeometry(geometryIndex) {
    const index = Math.max(0, Math.min(23, Math.floor(geometryIndex)));
    const coreIndex = Math.floor(index / 8);
    const baseIndex = index % 8;
    return { baseIndex, coreIndex };
}

/**
 * Encode base and core indices to geometry index
 * @param {number} baseIndex - Base geometry index (0-7)
 * @param {number} coreIndex - Core type index (0-2)
 * @returns {number} Geometry index (0-23)
 */
export function encodeGeometry(baseIndex, coreIndex) {
    return coreIndex * 8 + baseIndex;
}

/**
 * Get geometry name from index
 * @param {number} geometryIndex
 * @returns {string}
 */
export function getGeometryName(geometryIndex) {
    const { baseIndex, coreIndex } = decodeGeometry(geometryIndex);
    const baseName = BASE_GEOMETRIES[baseIndex];
    const coreName = CORE_TYPES[coreIndex];

    if (coreIndex === 0) {
        return baseName;
    }
    return `${baseName}_${coreName}`;
}

/**
 * Get all 24 geometry names
 * @returns {string[]}
 */
export function getAllGeometryNames() {
    return Array.from({ length: 24 }, (_, i) => getGeometryName(i));
}

/**
 * Generate base geometry by index
 * @param {number} baseIndex - Base geometry index (0-7)
 * @param {object} options - Generation options
 * @returns {object} Geometry
 */
export function generateBaseGeometry(baseIndex, options = {}) {
    const {
        scale = 1,
        density = 24,
        type = 'default'
    } = options;

    switch (baseIndex) {
        case 0: // Tetrahedron (5-cell)
            return generate5Cell(scale);

        case 1: // Hypercube (Tesseract)
            return generateTesseract(scale);

        case 2: // Sphere (Hypersphere)
            return generateHypersphere(scale, density);

        case 3: // Torus (Clifford Torus)
            return generateCliffordTorus(scale, scale * 0.3, density);

        case 4: // Klein Bottle
            return generateKleinBottle(scale, density);

        case 5: // Fractal
            return generateFractal(type === 'default' ? 'sierpinski' : type, 2, scale);

        case 6: // Wave
            return generateWave(type === 'default' ? 'standing' : type, {
                amplitude: scale * 0.5,
                frequency: 2,
                segments: density,
                radius: scale
            });

        case 7: // Crystal
            return generateCrystal(type === 'default' ? '16cell' : type, scale);

        default:
            return generateTesseract(scale);
    }
}

/**
 * Apply core warp to geometry
 * @param {object} geometry - Base geometry
 * @param {number} coreIndex - Core type index (0-2)
 * @param {object} options - Warp options
 * @returns {object} Warped geometry (or original if coreIndex is 0)
 */
export function applyWarp(geometry, coreIndex, options = {}) {
    switch (coreIndex) {
        case 0: // Base - no warp
            return geometry;

        case 1: // Hypersphere
            return warpHypersphereCore(geometry, {
                method: options.method || 'radial',
                radius: options.radius || 1,
                blend: options.blend || 1
            });

        case 2: // Hypertetrahedron
            return warpHypertetraCore(geometry, {
                method: options.method || 'tetrahedral',
                size: options.size || 1,
                blend: options.blend || 1
            });

        default:
            return geometry;
    }
}

/**
 * Main geometry generation function
 * @param {number} geometryIndex - Geometry index (0-23)
 * @param {object} options - Generation options
 * @returns {object} Complete geometry
 */
export function generateGeometry(geometryIndex, options = {}) {
    const { baseIndex, coreIndex } = decodeGeometry(geometryIndex);

    // Generate base geometry
    const baseGeometry = generateBaseGeometry(baseIndex, options);

    // Apply core warp
    const finalGeometry = applyWarp(baseGeometry, coreIndex, options);

    // Add metadata
    return {
        ...finalGeometry,
        geometryIndex,
        baseIndex,
        coreIndex,
        baseName: BASE_GEOMETRIES[baseIndex],
        coreName: CORE_TYPES[coreIndex],
        fullName: getGeometryName(geometryIndex)
    };
}

/**
 * Geometry Factory class for stateful generation
 */
export class GeometryFactory {
    constructor(defaultOptions = {}) {
        this.options = {
            scale: 1,
            density: 24,
            ...defaultOptions
        };

        this.cache = new Map();
        this.cacheEnabled = defaultOptions.cacheEnabled !== false;
    }

    /**
     * Generate geometry by index
     * @param {number} index - Geometry index (0-23)
     * @param {object} options - Override options
     * @returns {object} Geometry
     */
    generate(index, options = {}) {
        const mergedOptions = { ...this.options, ...options };
        const cacheKey = `${index}_${JSON.stringify(mergedOptions)}`;

        if (this.cacheEnabled && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const geometry = generateGeometry(index, mergedOptions);

        if (this.cacheEnabled) {
            this.cache.set(cacheKey, geometry);
        }

        return geometry;
    }

    /**
     * Generate geometry by name
     * @param {string} name - Geometry name (e.g., 'hypercube', 'torus_hypersphere')
     * @param {object} options - Override options
     * @returns {object} Geometry
     */
    generateByName(name, options = {}) {
        const index = this.getIndexByName(name);
        if (index === -1) {
            throw new Error(`Unknown geometry name: ${name}`);
        }
        return this.generate(index, options);
    }

    /**
     * Get geometry index by name
     * @param {string} name
     * @returns {number} Index or -1 if not found
     */
    getIndexByName(name) {
        const allNames = getAllGeometryNames();
        return allNames.indexOf(name);
    }

    /**
     * Generate all 24 geometries
     * @param {object} options - Generation options
     * @returns {object[]} Array of 24 geometries
     */
    generateAll(options = {}) {
        return Array.from({ length: 24 }, (_, i) => this.generate(i, options));
    }

    /**
     * Generate geometries for a specific core type
     * @param {number} coreIndex - Core type (0, 1, or 2)
     * @param {object} options - Generation options
     * @returns {object[]} Array of 8 geometries
     */
    generateByCore(coreIndex, options = {}) {
        const startIndex = coreIndex * 8;
        return Array.from({ length: 8 }, (_, i) =>
            this.generate(startIndex + i, options)
        );
    }

    /**
     * Clear the geometry cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {object} Cache stats
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            enabled: this.cacheEnabled
        };
    }
}

/**
 * Default factory instance
 */
export const defaultFactory = new GeometryFactory();

export default GeometryFactory;
