/**
 * ProceduralGaussianStream
 *
 * Provides on-demand batching of procedurally generated Gaussian seeds.
 */

import { generateProceduralGaussianSeeds } from '../geometry/generators/ProceduralGaussianSeeder.js';

export class ProceduralGaussianStream {
    /**
     * @param {Object} options
     * @param {Function} [options.seedGenerator]
     * @param {number} [options.maxDepth]
     * @param {number} [options.stepDistance]
     * @param {number} [options.baseScale]
     * @param {number[]} [options.baseColor]
     * @param {number[]} [options.origin]
     * @param {Object} [options.adjacencyGraph]
     */
    constructor({
        seedGenerator = generateProceduralGaussianSeeds,
        ...options
    } = {}) {
        this.seedGenerator = seedGenerator;
        this.options = { ...options };
        this.reset();
    }

    reset() {
        this.seeds = this.seedGenerator(this.options);
        this.cursor = 0;
    }

    regenerate(overrides = {}) {
        this.options = { ...this.options, ...overrides };
        this.reset();
    }

    hasNext() {
        return this.cursor < this.seeds.length;
    }

    /**
     * Return the next batch of seeds.
     * @param {number} [batchSize=64]
     * @returns {{ seeds: Object[], done: boolean }}
     */
    nextBatch(batchSize = 64) {
        if (!this.hasNext()) {
            return { seeds: [], done: true };
        }
        const batch = this.seeds.slice(this.cursor, this.cursor + batchSize);
        this.cursor += batch.length;
        return { seeds: batch, done: !this.hasNext() };
    }
}

export default ProceduralGaussianStream;

