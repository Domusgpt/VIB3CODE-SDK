/**
 * FoveatedTraversalPolicy
 *
 * Calculates traversal depth and batch size based on focus + motion.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class FoveatedTraversalPolicy {
    /**
     * @param {Object} options
     * @param {number} [options.baseDepth=2]
     * @param {number} [options.maxDepth=6]
     * @param {number} [options.minBatch=32]
     * @param {number} [options.maxBatch=256]
     * @param {number} [options.focusExponent=1.4]
     * @param {number} [options.motionExponent=1.0]
     */
    constructor({
        baseDepth = 2,
        maxDepth = 6,
        minBatch = 32,
        maxBatch = 256,
        focusExponent = 1.4,
        motionExponent = 1.0
    } = {}) {
        this.baseDepth = baseDepth;
        this.maxDepth = maxDepth;
        this.minBatch = minBatch;
        this.maxBatch = maxBatch;
        this.focusExponent = focusExponent;
        this.motionExponent = motionExponent;
    }

    /**
     * @param {Object} params
     * @param {number} [params.focus=1]
     * @param {number} [params.motion=0]
     * @returns {{ maxDepth: number, batchSize: number, focusWeight: number }}
     */
    compute({ focus = 1, motion = 0 } = {}) {
        const focusWeight = clamp(Math.pow(clamp(focus, 0, 1), this.focusExponent), 0, 1);
        const motionWeight = 1 / (1 + this.motionExponent * Math.max(0, motion));
        const combined = clamp(focusWeight * motionWeight, 0, 1);

        const minDepth = Math.max(0, this.baseDepth - 1);
        const depth = Math.round(minDepth + (this.maxDepth - minDepth) * combined);
        const batchSize = Math.round(this.minBatch + (this.maxBatch - this.minBatch) * combined);

        return { maxDepth: depth, batchSize, focusWeight: combined };
    }
}

export default FoveatedTraversalPolicy;
