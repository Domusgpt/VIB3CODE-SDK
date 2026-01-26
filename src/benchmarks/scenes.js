/**
 * Benchmark Scenes - Standardized test scenarios for VIB3+ performance testing
 *
 * Each scene represents a different performance profile:
 * - simple: Baseline with minimal geometry
 * - medium: Moderate complexity with rotation
 * - complex: High complexity holographic system
 * - stress: Maximum settings for stress testing
 */

/**
 * Benchmark scene definitions
 */
export const BENCHMARK_SCENES = {
    simple: {
        name: 'Simple Tetrahedron',
        description: 'Minimal geometry for baseline performance',
        params: {
            system: 'quantum',
            geometry: 0, // Tetrahedron
            gridDensity: 16,
            chaos: 0,
            speed: 1.0,
            morphFactor: 0,
            hue: 200,
            saturation: 0.7,
            intensity: 0.8,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0,
            dimension: 3.5
        }
    },

    simpleRotating: {
        name: 'Simple Tetrahedron (Rotating)',
        description: 'Minimal geometry with 4D rotation',
        params: {
            system: 'quantum',
            geometry: 0,
            gridDensity: 16,
            chaos: 0,
            speed: 1.0,
            morphFactor: 0,
            hue: 200,
            saturation: 0.7,
            intensity: 0.8,
            rot4dXY: 0.5,
            rot4dXZ: 0.3,
            rot4dYZ: 0,
            rot4dXW: 1.0,
            rot4dYW: 0.5,
            rot4dZW: 0,
            dimension: 3.5
        }
    },

    medium: {
        name: 'Medium Hypersphere',
        description: 'Hypersphere core with moderate grid density',
        params: {
            system: 'quantum',
            geometry: 8, // Hypersphere Core Tetrahedron
            gridDensity: 32,
            chaos: 0.3,
            speed: 1.0,
            morphFactor: 0.5,
            hue: 180,
            saturation: 0.8,
            intensity: 0.85,
            rot4dXY: 0.3,
            rot4dXZ: 0.2,
            rot4dYZ: 0.1,
            rot4dXW: 0.8,
            rot4dYW: 0.4,
            rot4dZW: 0.2,
            dimension: 3.8
        }
    },

    mediumFaceted: {
        name: 'Medium Faceted',
        description: 'Faceted system with moderate complexity',
        params: {
            system: 'faceted',
            geometry: 4, // Klein Bottle
            gridDensity: 24,
            chaos: 0.2,
            speed: 1.2,
            morphFactor: 0.3,
            hue: 280,
            saturation: 0.75,
            intensity: 0.8,
            rot4dXY: 0.4,
            rot4dXZ: 0.3,
            rot4dYZ: 0.2,
            rot4dXW: 0.6,
            rot4dYW: 0.3,
            rot4dZW: 0.1,
            dimension: 3.6
        }
    },

    complex: {
        name: 'Complex Holographic',
        description: '5-layer holographic with hypertetrahedron core',
        params: {
            system: 'holographic',
            geometry: 16, // Hypertetrahedron Core
            gridDensity: 48,
            chaos: 0.5,
            speed: 1.5,
            morphFactor: 1.0,
            hue: 220,
            saturation: 0.85,
            intensity: 0.9,
            rot4dXY: 0.5,
            rot4dXZ: 0.4,
            rot4dYZ: 0.3,
            rot4dXW: 1.2,
            rot4dYW: 0.8,
            rot4dZW: 0.4,
            dimension: 4.0
        }
    },

    complexQuantum: {
        name: 'Complex Quantum',
        description: 'High-density quantum visualization',
        params: {
            system: 'quantum',
            geometry: 17, // Hypertetrahedron Hypercube
            gridDensity: 56,
            chaos: 0.6,
            speed: 1.3,
            morphFactor: 1.2,
            hue: 160,
            saturation: 0.9,
            intensity: 0.92,
            rot4dXY: 0.6,
            rot4dXZ: 0.5,
            rot4dYZ: 0.4,
            rot4dXW: 1.0,
            rot4dYW: 0.7,
            rot4dZW: 0.5,
            dimension: 4.2
        }
    },

    stress: {
        name: 'Stress Test',
        description: 'Maximum complexity for stress testing',
        params: {
            system: 'quantum',
            geometry: 23, // Hypertetrahedron Crystal (max)
            gridDensity: 100,
            chaos: 1.0,
            speed: 3.0,
            morphFactor: 2.0,
            hue: 0,
            saturation: 1.0,
            intensity: 1.0,
            rot4dXY: 1.0,
            rot4dXZ: 0.8,
            rot4dYZ: 0.6,
            rot4dXW: 1.5,
            rot4dYW: 1.2,
            rot4dZW: 1.0,
            dimension: 4.5
        }
    },

    stressHolographic: {
        name: 'Stress Holographic',
        description: 'Maximum holographic layers and effects',
        params: {
            system: 'holographic',
            geometry: 23,
            gridDensity: 80,
            chaos: 0.9,
            speed: 2.5,
            morphFactor: 1.8,
            hue: 300,
            saturation: 1.0,
            intensity: 1.0,
            rot4dXY: 0.8,
            rot4dXZ: 0.7,
            rot4dYZ: 0.6,
            rot4dXW: 1.3,
            rot4dYW: 1.1,
            rot4dZW: 0.9,
            dimension: 4.3
        }
    }
};

/**
 * Get scene by name
 * @param {string} name
 * @returns {object|undefined}
 */
export function getScene(name) {
    return BENCHMARK_SCENES[name];
}

/**
 * Get all scene names
 * @returns {string[]}
 */
export function getSceneNames() {
    return Object.keys(BENCHMARK_SCENES);
}

/**
 * Get scenes by complexity tier
 * @param {'simple'|'medium'|'complex'|'stress'} tier
 * @returns {object}
 */
export function getScenesByTier(tier) {
    const tierPrefixes = {
        simple: ['simple'],
        medium: ['medium'],
        complex: ['complex'],
        stress: ['stress']
    };

    const prefixes = tierPrefixes[tier] || [];
    const result = {};

    for (const [name, scene] of Object.entries(BENCHMARK_SCENES)) {
        if (prefixes.some(p => name.startsWith(p))) {
            result[name] = scene;
        }
    }

    return result;
}

/**
 * Get scenes for specific system
 * @param {'quantum'|'faceted'|'holographic'} system
 * @returns {object}
 */
export function getScenesBySystem(system) {
    const result = {};

    for (const [name, scene] of Object.entries(BENCHMARK_SCENES)) {
        if (scene.params.system === system) {
            result[name] = scene;
        }
    }

    return result;
}

export default BENCHMARK_SCENES;
