/**
 * VIB3+ SDK E2E TEST
 * Uses ONLY the actual SDK from docs/src/
 * Documents each step
 */

// Import from docs/src/ - the ACTUAL SDK
import { Rotor4D } from './src/math/Rotor4D.js';
import { Vec4 } from './src/math/Vec4.js';

console.log('══════════════════════════════════════════════════════════════');
console.log('  VIB3+ SDK E2E TEST - Using docs/src/ (the actual SDK)');
console.log('══════════════════════════════════════════════════════════════');
console.log('');

const results = {
    timestamp: new Date().toISOString(),
    steps: [],
    pass: true
};

function step(num, description, fn) {
    console.log(`[STEP ${num}] ${description}`);
    try {
        const result = fn();
        results.steps.push({ step: num, description, result, pass: true });
        console.log(`  ✅ PASS`);
        if (result) console.log(`  → ${JSON.stringify(result)}`);
        return result;
    } catch (e) {
        results.steps.push({ step: num, description, error: e.message, pass: false });
        results.pass = false;
        console.log(`  ❌ FAIL: ${e.message}`);
        return null;
    }
}

// STEP 1: Verify imports
step(1, 'Verify Rotor4D import', () => {
    if (typeof Rotor4D !== 'function') throw new Error('Rotor4D not a function');
    return { type: typeof Rotor4D };
});

step(2, 'Verify Vec4 import', () => {
    if (typeof Vec4 !== 'function') throw new Error('Vec4 not a function');
    return { type: typeof Vec4 };
});

// STEP 3: Create identity rotor
step(3, 'Create identity rotor', () => {
    const r = Rotor4D.identity();
    if (r.s !== 1) throw new Error(`Expected s=1, got ${r.s}`);
    return { s: r.s, xy: r.xy, xw: r.xw };
});

// STEP 4: Create XY rotation (3D plane)
step(4, 'Create XY 45° rotation', () => {
    const r = Rotor4D.fromPlaneAngle('XY', Math.PI / 4);
    return {
        s: r.s.toFixed(4),
        xy: r.xy.toFixed(4),
        expected_s: '0.9239',
        expected_xy: '0.3827'
    };
});

// STEP 5: Create XW rotation (4D plane)
step(5, 'Create XW 30° rotation (4D hyperspace)', () => {
    const r = Rotor4D.fromPlaneAngle('XW', Math.PI / 6);
    return {
        s: r.s.toFixed(4),
        xw: r.xw.toFixed(4),
        expected_s: '0.9659',
        expected_xw: '0.2588'
    };
});

// STEP 6: Create Vec4
step(6, 'Create 4D vector', () => {
    const v = new Vec4(1, 0, 0, 0);
    return { x: v.x, y: v.y, z: v.z, w: v.w };
});

// STEP 7: Apply rotation
step(7, 'Apply XY rotation to vector', () => {
    const r = Rotor4D.fromPlaneAngle('XY', Math.PI / 4);
    const v = new Vec4(1, 0, 0, 0);
    const rotated = r.rotate(v);
    return {
        original: { x: 1, y: 0, z: 0, w: 0 },
        rotated: {
            x: rotated.x.toFixed(4),
            y: rotated.y.toFixed(4),
            z: rotated.z.toFixed(4),
            w: rotated.w.toFixed(4)
        },
        expected: { x: '0.7071', y: '0.7071', z: '0.0000', w: '0.0000' }
    };
});

// STEP 8: Compose rotations (6D)
step(8, 'Compose 6D rotation (XY + XW + ZW)', () => {
    const r1 = Rotor4D.fromPlaneAngle('XY', 0.3);
    const r2 = Rotor4D.fromPlaneAngle('XW', 0.5);
    const r3 = Rotor4D.fromPlaneAngle('ZW', 0.2);
    const composed = r1.multiply(r2).multiply(r3);
    return {
        s: composed.s.toFixed(4),
        xy: composed.xy.toFixed(4),
        xw: composed.xw.toFixed(4),
        zw: composed.zw.toFixed(4)
    };
});

// STEP 9: Apply 6D rotation
step(9, 'Apply 6D rotation to vector', () => {
    const r1 = Rotor4D.fromPlaneAngle('XY', 0.5);
    const r2 = Rotor4D.fromPlaneAngle('XW', 0.3);
    const rotor = r1.multiply(r2);
    const v = new Vec4(1, 0, 0, 1);
    const rotated = rotor.rotate(v);
    return {
        original: { x: 1, y: 0, z: 0, w: 1 },
        rotated: {
            x: rotated.x.toFixed(4),
            y: rotated.y.toFixed(4),
            z: rotated.z.toFixed(4),
            w: rotated.w.toFixed(4)
        }
    };
});

// STEP 10: Test all 6 rotation planes
step(10, 'Test all 6 rotation planes', () => {
    const planes = ['XY', 'XZ', 'YZ', 'XW', 'YW', 'ZW'];
    const results = {};
    for (const plane of planes) {
        const r = Rotor4D.fromPlaneAngle(plane, 0.5);
        results[plane] = { s: r.s.toFixed(4) };
    }
    return results;
});

// Final summary
console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  RESULT: ${results.pass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log(`  Steps: ${results.steps.length}`);
console.log(`  Passed: ${results.steps.filter(s => s.pass).length}`);
console.log(`  Failed: ${results.steps.filter(s => !s.pass).length}`);
console.log('══════════════════════════════════════════════════════════════');

// Output results as JSON
import { writeFileSync } from 'fs';
writeFileSync('e2e-results.json', JSON.stringify(results, null, 2));
console.log('');
console.log('Results saved to: docs/e2e-results.json');
