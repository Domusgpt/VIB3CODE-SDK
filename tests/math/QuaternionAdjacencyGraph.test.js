/**
 * Quaternion adjacency graph tests
 */

import { describe, it, expect } from 'vitest';
import { QuaternionAdjacencyGraph } from '../../src/math/QuaternionAdjacencyGraph.js';

const magnitude = (q) => Math.hypot(q[0], q[1], q[2], q[3]);

describe('QuaternionAdjacencyGraph', () => {
    it('builds normalized S_5 generators', () => {
        const generators = QuaternionAdjacencyGraph.createS5Generators();
        Object.values(generators).forEach((generator) => {
            expect(magnitude(generator)).toBeCloseTo(1, 6);
        });
    });

    it('steps through adjacency while maintaining normalization', () => {
        const graph = new QuaternionAdjacencyGraph();
        const start = QuaternionAdjacencyGraph.identity();
        const stepped = graph.step(start, 'i+');
        expect(magnitude(stepped)).toBeCloseTo(1, 6);
    });

    it('walks deterministic sequences', () => {
        const graph = new QuaternionAdjacencyGraph();
        const path = ['i+', 'j+', 'k-'];
        const a = graph.walk(path);
        const b = graph.walk(path);
        expect(a).toEqual(b);
    });
});

