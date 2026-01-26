/**
 * Rotation stability tests
 */

import { describe, it, expect } from 'vitest';
import { Rotor4D } from '../../src/math/Rotor4D.js';
import { Vec4 } from '../../src/math/Vec4.js';

describe('rotation stability', () => {
    it('reduces rotor drift with periodic renormalization', () => {
        const step = Rotor4D.fromEuler6({ xy: 0.003, xw: 0.002, zw: -0.001 });
        const iterations = 4000;
        let rotorNoRenorm = Rotor4D.identity();
        let rotorRenorm = Rotor4D.identity();

        for (let i = 1; i <= iterations; i += 1) {
            rotorNoRenorm = rotorNoRenorm.multiply(step);
            rotorRenorm = rotorRenorm.multiply(step);
            if (i % 25 === 0) {
                rotorRenorm.normalizeInPlace();
            }
        }

        const driftNoRenorm = Math.abs(rotorNoRenorm.norm() - 1);
        const driftRenorm = Math.abs(rotorRenorm.norm() - 1);
        expect(driftRenorm).toBeLessThan(driftNoRenorm);
        expect(driftRenorm).toBeLessThan(1e-3);
    });

    it('keeps vector lengths stable under repeated rotations', () => {
        const step = Rotor4D.fromPlaneAngle('XW', 0.01);
        let vector = new Vec4(0.2, -0.7, 1.1, 0.4);
        const baseline = vector.length();

        for (let i = 1; i <= 2000; i += 1) {
            vector = step.rotate(vector);
        }

        // Float32Array-based Vec4 accumulates ~2.4e-6 drift over 2000 rotations.
        // Use 5 decimal places (5e-6 tolerance) which is appropriate for Float32 arithmetic.
        expect(vector.length()).toBeCloseTo(baseline, 5);
    });
});
