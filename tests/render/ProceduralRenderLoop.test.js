/**
 * Procedural render loop tests
 */

import { describe, it, expect } from 'vitest';
import { ProceduralRenderLoop } from '../../src/render/ProceduralRenderLoop.js';

describe('ProceduralRenderLoop', () => {
    it('ticks scheduler and renderer with provided raf', () => {
        const calls = { update: 0, render: 0, tick: 0 };
        const scheduler = {
            nextFrame: ({ focus, motion }) => {
                calls.tick += 1;
                expect(focus).toBe(0.5);
                expect(motion).toBe(0.25);
                return {
                    buffer: new Float32Array([1, 2, 3]),
                    seeds: [{}, {}],
                    maxDepth: 2,
                    batchSize: 3,
                    done: false
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
            focusProvider: () => 0.5,
            motionProvider: () => 0.25,
            onFrame: ({ maxDepth, batchSize, seeds, done, focus, motion }) => {
                expect(maxDepth).toBe(2);
                expect(batchSize).toBe(3);
                expect(seeds).toHaveLength(2);
                expect(done).toBe(false);
                expect(focus).toBe(0.5);
                expect(motion).toBe(0.25);
            }
        });
        loop.start();
        loop.stop();

        expect(calls.tick).toBeGreaterThan(0);
        expect(calls.update).toBeGreaterThan(0);
        expect(calls.render).toBeGreaterThan(0);
    });
});
