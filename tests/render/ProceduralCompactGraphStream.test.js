/**
 * Procedural compact graph stream tests
 */

import { describe, it, expect } from 'vitest';
import { createProceduralGaussianStreamFromPCG } from '../../src/render/ProceduralCompactGraphStream.js';
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
            color: [1, 1, 1]
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

describe('createProceduralGaussianStreamFromPCG', () => {
    it('creates a stream with deterministic seeds', () => {
        const stream = createProceduralGaussianStreamFromPCG(buildPCG());
        const batch = stream.nextBatch(10);
        expect(batch.seeds).toHaveLength(7);
        expect(batch.done).toBe(true);
    });
});

