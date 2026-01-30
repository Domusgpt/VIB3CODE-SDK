/**
 * Procedural compact graph expansion tests
 */

import { describe, it, expect } from 'vitest';
import { expandProceduralCompactGraph } from '../../src/geometry/ProceduralCompactGraph.js';
import { QuaternionAdjacencyGraph } from '../../src/math/QuaternionAdjacencyGraph.js';
import { PLASTIC_RATIO } from '../../src/math/constants.js';

const generators = QuaternionAdjacencyGraph.createS5Generators();

const buildPCG = () => ({
    version: '0.1.0',
    seeds: [
        {
            id: 'root',
            position: [0, 0, 0],
            orientation: [1, 0, 0, 0],
            scale: 1,
            color: [0.5, 0.5, 0.5]
        }
    ],
    adjacency: {
        generators,
        lateralKeys: ['i+', 'i-', 'j+', 'j-'],
        depthKeys: ['k+', 'k-']
    },
    scaling: {
        ratio: PLASTIC_RATIO,
        maxDepth: 1,
        stepDistance: 1
    }
});

describe('expandProceduralCompactGraph', () => {
    it('expands PCG into deterministic seed counts', () => {
        const expanded = expandProceduralCompactGraph(buildPCG());
        expect(expanded).toHaveLength(7);
    });
});

