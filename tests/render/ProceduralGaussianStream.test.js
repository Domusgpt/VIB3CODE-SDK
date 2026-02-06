/**
 * Procedural Gaussian stream tests
 */

import { describe, it, expect } from 'vitest';
import { ProceduralGaussianStream } from '../../src/render/ProceduralGaussianStream.js';

const totalForDepth = (depth) => {
    let total = 0;
    for (let level = 0; level <= depth; level += 1) {
        total += 6 ** level;
    }
    return total;
};

describe('ProceduralGaussianStream', () => {
    it('batches deterministic seeds', () => {
        const stream = new ProceduralGaussianStream({ maxDepth: 1 });
        const first = stream.nextBatch(3);
        const second = stream.nextBatch(3);
        const third = stream.nextBatch(3);

        expect(first.seeds).toHaveLength(3);
        expect(second.seeds).toHaveLength(3);
        expect(third.seeds).toHaveLength(1);
        expect(third.done).toBe(true);
        expect(first.seeds[0]).toEqual(stream.seeds[0]);
    });

    it('regenerates with new options', () => {
        const stream = new ProceduralGaussianStream({ maxDepth: 1 });
        const initialCount = stream.seeds.length;
        stream.regenerate({ maxDepth: 2 });
        expect(stream.seeds.length).toBe(totalForDepth(2));
        expect(stream.seeds.length).toBeGreaterThan(initialCount);
    });
});

