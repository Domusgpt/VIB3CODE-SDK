/**
 * Procedural traversal scheduler tests
 */

import { describe, it, expect } from 'vitest';
import { ProceduralTraversalScheduler } from '../../src/render/ProceduralTraversalScheduler.js';
import { ProceduralGaussianStream } from '../../src/render/ProceduralGaussianStream.js';

const sumDepths = (seeds) => seeds.reduce((sum, seed) => sum + (seed.depth ?? 0), 0);

describe('ProceduralTraversalScheduler', () => {
    it('regenerates stream when depth changes', () => {
        const stream = new ProceduralGaussianStream({ maxDepth: 1 });
        const scheduler = new ProceduralTraversalScheduler({ stream });

        const low = scheduler.nextFrame({ focus: 0.1, motion: 0 });
        const high = scheduler.nextFrame({ focus: 1, motion: 0 });

        expect(high.maxDepth).toBeGreaterThanOrEqual(low.maxDepth);
        expect(sumDepths(high.seeds)).toBeGreaterThanOrEqual(sumDepths(low.seeds));
    });

    it('returns an encoded buffer for batches', () => {
        const stream = new ProceduralGaussianStream({ maxDepth: 1 });
        const scheduler = new ProceduralTraversalScheduler({ stream });
        const result = scheduler.nextFrame({ focus: 1, motion: 0 });
        expect(result.buffer).toBeInstanceOf(Float32Array);
        expect(result.buffer.length).toBeGreaterThan(0);
    });
});

