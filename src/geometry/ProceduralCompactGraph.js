/**
 * ProceduralCompactGraph
 *
 * Utilities for validating and expanding a procedural compact graph (PCG)
 * into Gaussian seeds using quaternion adjacency traversal.
 */

import { schemaRegistry } from '../schemas/index.js';
import { QuaternionAdjacencyGraph } from '../math/QuaternionAdjacencyGraph.js';
import { generateProceduralGaussianSeeds } from './generators/ProceduralGaussianSeeder.js';

/**
 * @param {object} pcg
 * @returns {{ valid: boolean, errors: any[] | null }}
 */
export function validateProceduralCompactGraph(pcg) {
    return schemaRegistry.validate('proceduralCompactGraph', pcg);
}

/**
 * Expand a PCG into Gaussian seeds.
 * @param {object} pcg
 * @param {object} [options]
 * @param {boolean} [options.includeRoot=true]
 * @returns {object[]}
 */
export function expandProceduralCompactGraph(pcg, { includeRoot = true } = {}) {
    const validation = validateProceduralCompactGraph(pcg);
    if (!validation.valid) {
        throw new Error(`Invalid procedural compact graph: ${JSON.stringify(validation.errors)}`);
    }

    const { seeds, adjacency, scaling } = pcg;
    const adjacencyGraph = new QuaternionAdjacencyGraph({
        generators: adjacency.generators,
        lateralKeys: adjacency.lateralKeys,
        depthKeys: adjacency.depthKeys
    });

    const expanded = [];
    seeds.forEach((seed) => {
        const origin = seed.position;
        const rootOrientation = seed.orientation;
        const baseColor = seed.color;
        const baseScale = seed.scale;

        const seedBatch = generateProceduralGaussianSeeds({
            maxDepth: scaling.maxDepth ?? 0,
            stepDistance: scaling.stepDistance ?? 1,
            baseScale,
            baseColor,
            origin,
            rootOrientation,
            adjacencyGraph,
            includeRoot
        });

        expanded.push(...seedBatch);
    });

    return expanded;
}

