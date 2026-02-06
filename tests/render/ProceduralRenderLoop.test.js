/**
 * Procedural render loop tests
 */

import { describe, it, expect } from 'vitest';
import { ProceduralRenderLoop } from '../../src/render/ProceduralRenderLoop.js';

describe('ProceduralRenderLoop', () => {
    it('ticks scheduler and renderer with provided raf', () => {
        const calls = { update: 0, render: 0, tick: 0 };
        const scheduler = {
            nextFrame: () => {
                calls.tick += 1;
                return {
                    buffer: new Float32Array([1, 2, 3]),
                    seeds: [{}, {}],
                    maxDepth: 2,
                    batchSize: 3
                };
            }
        };
        const renderer = {
            updateSeeds: () => {
                calls.update += 1;
            },
            render: () => {
                calls.render += 1;
            }
        };
        let frames = 0;
        const raf = (cb) => {
            if (frames >= 2) {
                return null;
            }
            frames += 1;
            return cb();
        };

        const loop = new ProceduralRenderLoop({
            scheduler,
            renderer,
            raf,
            onFrame: ({ maxDepth, batchSize, seeds }) => {
                expect(maxDepth).toBe(2);
                expect(batchSize).toBe(3);
                expect(seeds).toHaveLength(2);
            }
        });
        loop.start();
        loop.stop();

        expect(calls.tick).toBeGreaterThan(0);
        expect(calls.update).toBeGreaterThan(0);
        expect(calls.render).toBeGreaterThan(0);
    });
});
