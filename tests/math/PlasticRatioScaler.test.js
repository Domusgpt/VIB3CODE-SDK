/**
 * Plastic ratio scaler tests
 */

import { describe, it, expect } from 'vitest';
import { PLASTIC_RATIO } from '../../src/math/constants.js';
import { PlasticRatioScaler } from '../../src/math/PlasticRatioScaler.js';

describe('PlasticRatioScaler', () => {
    it('scales scalars by rho^depth', () => {
        const depth = 2;
        const value = 3;
        const expected = value * (PLASTIC_RATIO ** depth);
        expect(PlasticRatioScaler.scaleScalar(value, depth)).toBeCloseTo(expected, 8);
    });

    it('scales vectors consistently', () => {
        const vector = [1, 2, 3];
        const scaled = PlasticRatioScaler.scaleVector(vector, 1);
        scaled.forEach((value, index) => {
            expect(value).toBeCloseTo(vector[index] * PLASTIC_RATIO, 8);
        });
    });

    it('scales covariance matrices', () => {
        const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const scaled = PlasticRatioScaler.scaleMatrix3(matrix, 3);
        scaled.forEach((value, index) => {
            expect(value).toBeCloseTo(matrix[index] * (PLASTIC_RATIO ** 3), 8);
        });
    });
});

