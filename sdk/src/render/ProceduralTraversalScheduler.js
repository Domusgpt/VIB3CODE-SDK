/**
 * ProceduralTraversalScheduler
 *
 * Couples a procedural stream with a traversal policy and seed encoder.
 */

import { FoveatedTraversalPolicy } from './FoveatedTraversalPolicy.js';
import { encodeGaussianSeeds } from './GaussianSeedBuffer.js';

export class ProceduralTraversalScheduler {
    /**
     * @param {Object} options
     * @param {Object} options.stream
     * @param {FoveatedTraversalPolicy} [options.policy]
     */
    constructor({ stream, policy = new FoveatedTraversalPolicy() } = {}) {
        if (!stream) {
            throw new Error('ProceduralTraversalScheduler requires a stream.');
        }
        this.stream = stream;
        this.policy = policy;
        this.lastDepth = null;
    }

    /**
     * @param {Object} params
     * @param {number} [params.focus=1]
     * @param {number} [params.motion=0]
     * @returns {{ buffer: Float32Array, seeds: Object[], done: boolean, maxDepth: number, batchSize: number }}
     */
    nextFrame({ focus = 1, motion = 0 } = {}) {
        const { maxDepth, batchSize } = this.policy.compute({ focus, motion });

        if (this.lastDepth !== maxDepth) {
            this.stream.regenerate({ maxDepth });
            this.lastDepth = maxDepth;
        }

        const { seeds, done } = this.stream.nextBatch(batchSize);
        const buffer = encodeGaussianSeeds(seeds);
        return { buffer, seeds, done, maxDepth, batchSize };
    }
}

export default ProceduralTraversalScheduler;
