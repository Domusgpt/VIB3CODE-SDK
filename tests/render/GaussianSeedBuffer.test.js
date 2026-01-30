/**
 * Gaussian seed buffer tests
 */

import { describe, it, expect } from 'vitest';
import { encodeGaussianSeeds, GAUSSIAN_SEED_STRIDE } from '../../src/render/GaussianSeedBuffer.js';

describe('encodeGaussianSeeds', () => {
    it('encodes seeds into a flat buffer', () => {
        const seeds = [
            {
                position: [1, 2, 3],
                scale: 2,
                orientation: [1, 0, 0, 0],
                color: [0.2, 0.4, 0.6],
                depth: 1
            }
        ];

        const buffer = encodeGaussianSeeds(seeds);
        expect(buffer).toHaveLength(GAUSSIAN_SEED_STRIDE);
        expect(Array.from(buffer.slice(0, 4))).toEqual([1, 2, 3, 2]);
        const colorSlice = Array.from(buffer.slice(8, 11));
        colorSlice.forEach((value, index) => {
            expect(value).toBeCloseTo([0.2, 0.4, 0.6][index], 5);
        });
    });

    it('fills defaults when data is missing', () => {
        const buffer = encodeGaussianSeeds([{}]);
        expect(buffer[0]).toBe(0);
        expect(buffer[3]).toBe(1);
        expect(buffer[4]).toBe(1);
    });
});
