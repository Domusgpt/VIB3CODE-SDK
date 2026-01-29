/**
 * Procedural Gaussian Seeder
 *
 * Generates deterministic Gaussian seed points using quaternion adjacency traversal
 * and plastic-ratio scaling. Intended as the first step in procedural splat/field
 * generation.
 */

import { QuaternionAdjacencyGraph } from '../../math/QuaternionAdjacencyGraph.js';
import { PlasticRatioScaler } from '../../math/PlasticRatioScaler.js';

const DEFAULT_COLOR = Object.freeze([1, 1, 1]);
const DEFAULT_ORIGIN = Object.freeze([0, 0, 0]);
const DEFAULT_BASIS = Object.freeze([1, 0, 0]);

/**
 * @typedef {Object} GaussianSeed
 * @property {number[]} position
 * @property {number[]} orientation
 * @property {number} scale
 * @property {number[]} color
 * @property {number} depth
 * @property {string} generatorKey
 */

/**
 * Generate Gaussian seeds via quaternion adjacency traversal.
 * @param {Object} options
 * @param {number} [options.maxDepth=2]
 * @param {number} [options.stepDistance=1]
 * @param {number} [options.baseScale=1]
 * @param {number[]} [options.baseColor]
 * @param {number[]} [options.origin]
 * @param {QuaternionAdjacencyGraph} [options.adjacencyGraph]
 * @param {boolean} [options.includeRoot=true]
 * @returns {GaussianSeed[]}
 */
export function generateProceduralGaussianSeeds({
    maxDepth = 2,
    stepDistance = 1,
    baseScale = 1,
    baseColor = DEFAULT_COLOR,
    origin = DEFAULT_ORIGIN,
    adjacencyGraph = new QuaternionAdjacencyGraph(),
    includeRoot = true,
} = {}) {
    const seeds = [];
    const generatorKeys = Array.from(adjacencyGraph.generators.keys());

    const rootOrientation = QuaternionAdjacencyGraph.identity();

    const enqueue = [{
        position: [...origin],
        orientation: rootOrientation,
        depth: 0,
        generatorKey: 'root',
    }];

    if (includeRoot) {
        seeds.push({
            position: [...origin],
            orientation: rootOrientation,
            scale: baseScale,
            color: [...baseColor],
            depth: 0,
            generatorKey: 'root',
        });
    }

    while (enqueue.length > 0) {
        const current = enqueue.shift();
        if (current.depth >= maxDepth) {
            continue;
        }

        const childDepth = current.depth + 1;
        const childDistance = stepDistance * PlasticRatioScaler.scaleScalar(1, childDepth);
        const childScale = PlasticRatioScaler.scaleScalar(baseScale, childDepth);

        generatorKeys.forEach((key) => {
            const orientation = adjacencyGraph.step(current.orientation, key);
            const direction = QuaternionAdjacencyGraph.rotateVector(orientation, DEFAULT_BASIS);
            const position = [
                current.position[0] + direction[0] * childDistance,
                current.position[1] + direction[1] * childDistance,
                current.position[2] + direction[2] * childDistance,
            ];

            const seed = {
                position,
                orientation,
                scale: childScale,
                color: [...baseColor],
                depth: childDepth,
                generatorKey: key,
            };

            seeds.push(seed);
            enqueue.push({
                position,
                orientation,
                depth: childDepth,
                generatorKey: key,
            });
        });
    }

    return seeds;
}

export default generateProceduralGaussianSeeds;

