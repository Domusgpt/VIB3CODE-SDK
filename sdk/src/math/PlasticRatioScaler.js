/**
 * PlasticRatioScaler
 *
 * Applies recursive plastic-ratio scaling (ρ ≈ 1.324718) to scalars,
 * vectors, and covariance matrices.
 */

import { PLASTIC_RATIO } from './constants.js';

export class PlasticRatioScaler {
    static ratio = PLASTIC_RATIO;

    /**
     * Scale a scalar by ρ^depth.
     * @param {number} value
     * @param {number} [depth=1]
     * @returns {number}
     */
    static scaleScalar(value, depth = 1) {
        return value * (PLASTIC_RATIO ** depth);
    }

    /**
     * Scale a vector by ρ^depth.
     * @param {number[]} vector
     * @param {number} [depth=1]
     * @returns {number[]}
     */
    static scaleVector(vector, depth = 1) {
        const scale = PLASTIC_RATIO ** depth;
        return vector.map((value) => value * scale);
    }

    /**
     * Scale a 3x3 covariance matrix (flat length-9 array).
     * @param {number[]} matrix
     * @param {number} [depth=1]
     * @returns {number[]}
     */
    static scaleMatrix3(matrix, depth = 1) {
        if (matrix.length !== 9) {
            throw new Error('Covariance matrix must have 9 elements (3x3).');
        }
        const scale = PLASTIC_RATIO ** depth;
        return matrix.map((value) => value * scale);
    }

    /**
     * Alias for covariance scaling.
     * @param {number[]} covariance
     * @param {number} [depth=1]
     * @returns {number[]}
     */
    static scaleCovariance(covariance, depth = 1) {
        return PlasticRatioScaler.scaleMatrix3(covariance, depth);
    }
}

