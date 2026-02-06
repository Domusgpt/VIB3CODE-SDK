/**
 * Foveated traversal policy tests
 */

import { describe, it, expect } from 'vitest';
import { FoveatedTraversalPolicy } from '../../src/render/FoveatedTraversalPolicy.js';

describe('FoveatedTraversalPolicy', () => {
    it('increases depth with higher focus', () => {
        const policy = new FoveatedTraversalPolicy({ baseDepth: 2, maxDepth: 6 });
        const low = policy.compute({ focus: 0.1, motion: 0 });
        const high = policy.compute({ focus: 1, motion: 0 });
        expect(high.maxDepth).toBeGreaterThanOrEqual(low.maxDepth);
        expect(high.batchSize).toBeGreaterThanOrEqual(low.batchSize);
    });

    it('reduces depth with higher motion', () => {
        const policy = new FoveatedTraversalPolicy({ baseDepth: 2, maxDepth: 6 });
        const stable = policy.compute({ focus: 1, motion: 0 });
        const fast = policy.compute({ focus: 1, motion: 4 });
        expect(fast.maxDepth).toBeLessThanOrEqual(stable.maxDepth);
        expect(fast.batchSize).toBeLessThanOrEqual(stable.batchSize);
    });
});

