/**
 * Procedural compact graph schema tests
 */

import { describe, it, expect } from 'vitest';
import { schemaRegistry } from '../../src/schemas/index.js';
import { QuaternionAdjacencyGraph } from '../../src/math/QuaternionAdjacencyGraph.js';
import { PLASTIC_RATIO } from '../../src/math/constants.js';

const generators = QuaternionAdjacencyGraph.createS5Generators();

describe('procedural compact graph schema', () => {
    it('validates a minimal procedural compact graph payload', () => {
        const payload = {
            version: '0.1.0',
            seeds: [
                {
                    id: 'root',
                    position: [0, 0, 0],
                    orientation: [1, 0, 0, 0],
                    scale: 1,
                    color: [1, 1, 1],
                    tags: ['seed']
                }
            ],
            adjacency: {
                generators,
                lateralKeys: ['i+', 'i-', 'j+', 'j-'],
                depthKeys: ['k+', 'k-']
            },
            scaling: {
                ratio: PLASTIC_RATIO,
                maxDepth: 2,
                stepDistance: 1
            },
            metadata: {
                author: 'test'
            }
        };

        const result = schemaRegistry.validate('proceduralCompactGraph', payload);
        expect(result.valid).toBe(true);
        expect(result.errors).toBeNull();
    });
});

