/**
 * VIB3+ SDK BUG REPORT: Rotor4D.rotate() produces incorrect results
 *
 * ISSUE: When rotating a vector by an XY plane rotation, the output is incorrect.
 *
 * EXPECTED BEHAVIOR:
 * - Rotating (1,0,0,0) by 45° in XY plane should give (0.7071, 0.7071, 0, 0)
 * - This is basic 2D rotation: x' = cos(θ), y' = sin(θ)
 *
 * ACTUAL BEHAVIOR:
 * - Rotating (1,0,0,0) by 45° in XY plane gives (1.0000, -0.7071, 0, 0)
 * - The X component doesn't change and Y has wrong sign
 */

import { Rotor4D } from './src/math/Rotor4D.js';
import { Vec4 } from './src/math/Vec4.js';

console.log('═══════════════════════════════════════════════════════════');
console.log('  VIB3+ SDK BUG REPORT: Rotor4D.rotate() INCORRECT RESULTS');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Test 1: 45° rotation in XY plane
console.log('TEST 1: Rotate (1,0,0,0) by 45° in XY plane');
console.log('─────────────────────────────────────────────');

const angle45 = Math.PI / 4;
const rotor45 = Rotor4D.fromPlaneAngle('XY', angle45);

console.log('Rotor components:');
console.log(`  s  = ${rotor45.s.toFixed(6)} (expected: cos(22.5°) = 0.923880)`);
console.log(`  xy = ${rotor45.xy.toFixed(6)} (expected: -sin(22.5°) = -0.382683)`);
console.log('');

const v1 = new Vec4(1, 0, 0, 0);
const rotated1 = rotor45.rotate(v1);

console.log('Input vector:  (1, 0, 0, 0)');
console.log('Rotated result:');
console.log(`  x = ${rotated1.x.toFixed(6)} (EXPECTED: 0.707107 = cos(45°))`);
console.log(`  y = ${rotated1.y.toFixed(6)} (EXPECTED: 0.707107 = sin(45°))`);
console.log(`  z = ${rotated1.z.toFixed(6)} (EXPECTED: 0.000000)`);
console.log(`  w = ${rotated1.w.toFixed(6)} (EXPECTED: 0.000000)`);
console.log('');

// Verify with matrix
const matrix = rotor45.toMatrix();
console.log('Rotation matrix (column-major):');
console.log(`  m[0] (X→X) = ${matrix[0].toFixed(6)} (EXPECTED: 0.707107)`);
console.log(`  m[1] (X→Y) = ${matrix[1].toFixed(6)} (EXPECTED: 0.707107)`);
console.log(`  m[4] (Y→X) = ${matrix[4].toFixed(6)} (EXPECTED: -0.707107)`);
console.log(`  m[5] (Y→Y) = ${matrix[5].toFixed(6)} (EXPECTED: 0.707107)`);
console.log('');

// Check if the issue is in the sign of the bivector
console.log('═══════════════════════════════════════════════════════════');
console.log('  ANALYSIS');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('The issue appears to be in the toMatrix() formula.');
console.log('');
console.log('For pure XY rotation (only s and xy non-zero):');
console.log('  s² + xy² should give something other than 1.0 for m[0]');
console.log('');
console.log('The current m[0] formula:');
console.log('  s² + xy² + xz² - yz² + xw² - yw² - zw² - xyzw²');
console.log(`  = ${(rotor45.s**2).toFixed(4)} + ${(rotor45.xy**2).toFixed(4)} = ${(rotor45.s**2 + rotor45.xy**2).toFixed(4)}`);
console.log('');
console.log('This equals 1.0, but for rotation in XY plane,');
console.log('the X→X coefficient should be cos(θ) = 0.7071');
console.log('');
console.log('BUG LOCATION: sdk/src/math/Rotor4D.js:441-466 (toMatrix method)');
console.log('');

// Test 2: 90° rotation should map (1,0,0,0) to (0,1,0,0)
console.log('═══════════════════════════════════════════════════════════');
console.log('  TEST 2: 90° rotation verification');
console.log('═══════════════════════════════════════════════════════════');

const angle90 = Math.PI / 2;
const rotor90 = Rotor4D.fromPlaneAngle('XY', angle90);
const v2 = new Vec4(1, 0, 0, 0);
const rotated2 = rotor90.rotate(v2);

console.log('');
console.log('Rotate (1,0,0,0) by 90° in XY plane:');
console.log(`  Result: (${rotated2.x.toFixed(4)}, ${rotated2.y.toFixed(4)}, ${rotated2.z.toFixed(4)}, ${rotated2.w.toFixed(4)})`);
console.log('  EXPECTED: (0, 1, 0, 0)');
console.log('');

const isCorrect = Math.abs(rotated2.x) < 0.01 && Math.abs(rotated2.y - 1) < 0.01;
console.log(`  STATUS: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
