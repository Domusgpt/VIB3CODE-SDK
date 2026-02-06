/**
 * QuaternionAdjacencyGraph
 *
 * Encodes adjacency traversal using a 6-generator quaternion set (S_5).
 * Provides deterministic Cayley-graph walking for procedural traversal.
 */

import { EPSILON_NORMAL } from './constants.js';

const SQRT_5 = Math.sqrt(5);

const DEFAULT_GENERATORS = Object.freeze({
    'i+': [1 / SQRT_5, 2 / SQRT_5, 0, 0],
    'i-': [1 / SQRT_5, -2 / SQRT_5, 0, 0],
    'j+': [1 / SQRT_5, 0, 2 / SQRT_5, 0],
    'j-': [1 / SQRT_5, 0, -2 / SQRT_5, 0],
    'k+': [1 / SQRT_5, 0, 0, 2 / SQRT_5],
    'k-': [1 / SQRT_5, 0, 0, -2 / SQRT_5],
});

const DEFAULT_LATERAL_KEYS = Object.freeze(['i+', 'i-', 'j+', 'j-']);
const DEFAULT_DEPTH_KEYS = Object.freeze(['k+', 'k-']);

export class QuaternionAdjacencyGraph {
    /**
     * @param {Object} options
     * @param {Record<string, number[]>} [options.generators]
     * @param {string[]} [options.lateralKeys]
     * @param {string[]} [options.depthKeys]
     */
    constructor({
        generators = QuaternionAdjacencyGraph.createS5Generators(),
        lateralKeys = DEFAULT_LATERAL_KEYS,
        depthKeys = DEFAULT_DEPTH_KEYS,
    } = {}) {
        this.generators = new Map(Object.entries(generators));
        this.lateralKeys = [...lateralKeys];
        this.depthKeys = [...depthKeys];
    }

    static createS5Generators() {
        return { ...DEFAULT_GENERATORS };
    }

    static identity() {
        return [1, 0, 0, 0];
    }

    /**
     * Normalize quaternion to unit length.
     * @param {number[]} q
     * @returns {number[]}
     */
    static normalize(q) {
        const [w, x, y, z] = q;
        const length = Math.hypot(w, x, y, z);
        if (length < EPSILON_NORMAL) {
            return QuaternionAdjacencyGraph.identity();
        }
        return [w / length, x / length, y / length, z / length];
    }

    /**
     * Multiply two quaternions.
     * @param {number[]} a
     * @param {number[]} b
     * @returns {number[]}
     */
    static multiply(a, b) {
        const [aw, ax, ay, az] = a;
        const [bw, bx, by, bz] = b;
        return [
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        ];
    }

    /**
     * Conjugate quaternion.
     * @param {number[]} q
     * @returns {number[]}
     */
    static conjugate([w, x, y, z]) {
        return [w, -x, -y, -z];
    }

    /**
     * Rotate a 3D vector using quaternion q.
     * @param {number[]} q
     * @param {number[]} v
     * @returns {number[]}
     */
    static rotateVector(q, v) {
        const [vx, vy, vz] = v;
        const vQuat = [0, vx, vy, vz];
        const qConj = QuaternionAdjacencyGraph.conjugate(q);
        const qv = QuaternionAdjacencyGraph.multiply(q, vQuat);
        const rotated = QuaternionAdjacencyGraph.multiply(qv, qConj);
        return [rotated[1], rotated[2], rotated[3]];
    }

    getGenerator(key) {
        const generator = this.generators.get(key);
        if (!generator) {
            throw new Error(`Unknown generator key: ${key}`);
        }
        return generator;
    }

    /**
     * Step to adjacent quaternion by generator key.
     * @param {number[]} current
     * @param {string} key
     * @returns {number[]}
     */
    step(current, key) {
        const generator = this.getGenerator(key);
        const stepped = QuaternionAdjacencyGraph.multiply(current, generator);
        return QuaternionAdjacencyGraph.normalize(stepped);
    }

    /**
     * Walk a sequence of generator keys from a starting quaternion.
     * @param {string[]} keys
     * @param {number[]} [start]
     * @returns {number[]}
     */
    walk(keys, start = QuaternionAdjacencyGraph.identity()) {
        return keys.reduce((current, key) => this.step(current, key), start);
    }

    /**
     * Return neighbors for the current quaternion.
     * @param {number[]} current
     * @returns {Record<string, number[]>}
     */
    neighbors(current) {
        const entries = Array.from(this.generators.keys()).map((key) => [key, this.step(current, key)]);
        return Object.fromEntries(entries);
    }
}

