/**
 * Procedural Gaussian seeder tests
 */

import { describe, it, expect } from 'vitest';
import { generateProceduralGaussianSeeds } from '../../src/geometry/generators/ProceduralGaussianSeeder.js';

const countNodes = (depth) => {
    let total = 0;
    for (let level = 0; level <= depth; level += 1) {
        total += 6 ** level;
    }
    return total;
};

describe('generateProceduralGaussianSeeds', () => {
    it('generates deterministic seed counts', () => {
        const depth = 2;
        const seeds = generateProceduralGaussianSeeds({ maxDepth: depth });
        expect(seeds).toHaveLength(countNodes(depth));
    });

    it('generates deterministic positions for a fixed depth', () => {
        const seedsA = generateProceduralGaussianSeeds({ maxDepth: 1, stepDistance: 1.5 });
        const seedsB = generateProceduralGaussianSeeds({ maxDepth: 1, stepDistance: 1.5 });
        expect(seedsA).toEqual(seedsB);
    });
});

