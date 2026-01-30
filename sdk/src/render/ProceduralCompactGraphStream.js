/**
 * ProceduralCompactGraphStream
 *
 * Creates a ProceduralGaussianStream backed by a Procedural Compact Graph payload.
 */

import { ProceduralGaussianStream } from './ProceduralGaussianStream.js';
import { expandProceduralCompactGraph, validateProceduralCompactGraph } from '../geometry/ProceduralCompactGraph.js';

/**
 * @param {object} pcg
 * @param {object} [options]
 * @returns {ProceduralGaussianStream}
 */
export function createProceduralGaussianStreamFromPCG(pcg, options = {}) {
    const validation = validateProceduralCompactGraph(pcg);
    if (!validation.valid) {
        throw new Error(`Invalid procedural compact graph: ${JSON.stringify(validation.errors)}`);
    }

    const seedGenerator = () => expandProceduralCompactGraph(pcg, options);
    return new ProceduralGaussianStream({ seedGenerator });
}

