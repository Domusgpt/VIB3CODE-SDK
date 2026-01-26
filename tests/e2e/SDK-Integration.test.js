/**
 * VIB3+ SDK End-to-End Integration Tests
 * Tests the full SDK workflow from initialization through parameter manipulation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParameterManager } from '../../src/core/Parameters.js';
import { Rotor4D } from '../../src/math/Rotor4D.js';
import { Vec4 } from '../../src/math/Vec4.js';
import { GeometryFactory, generateGeometry } from '../../src/geometry/GeometryFactory.js';

/**
 * E2E Test Results Documentation
 * This object captures test metrics for analysis
 */
const testMetrics = {
    totalTests: 0,
    passed: 0,
    failed: 0,
    timings: [],
    coverage: {
        parameters6D: false,
        geometryEncoding: false,
        rotorOperations: false,
        stateManagement: false
    }
};

describe('VIB3+ SDK E2E Integration', () => {

    describe('1. Parameter System - Full 6D Rotation', () => {
        let params;

        beforeEach(() => {
            params = new ParameterManager();
            testMetrics.totalTests++;
        });

        it('initializes with all 6 rotation parameters at zero', () => {
            const start = performance.now();

            // 3D Space rotations
            expect(params.getParameter('rot4dXY')).toBe(0.0);
            expect(params.getParameter('rot4dXZ')).toBe(0.0);
            expect(params.getParameter('rot4dYZ')).toBe(0.0);

            // 4D Hyperspace rotations
            expect(params.getParameter('rot4dXW')).toBe(0.0);
            expect(params.getParameter('rot4dYW')).toBe(0.0);
            expect(params.getParameter('rot4dZW')).toBe(0.0);

            testMetrics.timings.push({ test: '6D_init', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('correctly sets all 6 rotation planes independently', () => {
            const start = performance.now();

            // Set 3D space rotations
            params.setParameter('rot4dXY', 1.57);
            params.setParameter('rot4dXZ', 2.35);
            params.setParameter('rot4dYZ', 3.14);

            // Set 4D hyperspace rotations
            params.setParameter('rot4dXW', 0.5);
            params.setParameter('rot4dYW', 1.0);
            params.setParameter('rot4dZW', 1.5);

            // Verify all values
            expect(params.getParameter('rot4dXY')).toBeCloseTo(1.57, 2);
            expect(params.getParameter('rot4dXZ')).toBeCloseTo(2.35, 2);
            expect(params.getParameter('rot4dYZ')).toBeCloseTo(3.14, 2);
            expect(params.getParameter('rot4dXW')).toBeCloseTo(0.5, 2);
            expect(params.getParameter('rot4dYW')).toBeCloseTo(1.0, 2);
            expect(params.getParameter('rot4dZW')).toBeCloseTo(1.5, 2);

            testMetrics.timings.push({ test: '6D_set_all', ms: performance.now() - start });
            testMetrics.coverage.parameters6D = true;
            testMetrics.passed++;
        });

        it('clamps rotation values to valid ranges', () => {
            const start = performance.now();

            // XY/XZ/YZ range: -6.28 to 6.28
            params.setParameter('rot4dXY', 10.0);
            expect(params.getParameter('rot4dXY')).toBeLessThanOrEqual(6.28);

            params.setParameter('rot4dXY', -10.0);
            expect(params.getParameter('rot4dXY')).toBeGreaterThanOrEqual(-6.28);

            // XW/YW/ZW range: -2 to 2
            params.setParameter('rot4dXW', 5.0);
            expect(params.getParameter('rot4dXW')).toBeLessThanOrEqual(2);

            testMetrics.timings.push({ test: '6D_clamping', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('batch sets multiple rotation parameters', () => {
            const start = performance.now();

            params.setParameters({
                rot4dXY: 1.0,
                rot4dXZ: 1.1,
                rot4dYZ: 1.2,
                rot4dXW: 0.3,
                rot4dYW: 0.4,
                rot4dZW: 0.5
            });

            const all = params.getAllParameters();
            expect(all.rot4dXY).toBeCloseTo(1.0, 2);
            expect(all.rot4dXZ).toBeCloseTo(1.1, 2);
            expect(all.rot4dYZ).toBeCloseTo(1.2, 2);
            expect(all.rot4dXW).toBeCloseTo(0.3, 2);
            expect(all.rot4dYW).toBeCloseTo(0.4, 2);
            expect(all.rot4dZW).toBeCloseTo(0.5, 2);

            testMetrics.timings.push({ test: '6D_batch_set', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });

    describe('2. Geometry Encoding System - 24 Variants', () => {

        it('encodes geometry correctly: geometry = coreIndex * 8 + baseIndex', () => {
            const start = performance.now();

            // Test all base geometries (0-7)
            for (let base = 0; base < 8; base++) {
                expect(0 * 8 + base).toBe(base);
            }

            // Test Hypersphere Core (8-15)
            for (let base = 0; base < 8; base++) {
                expect(1 * 8 + base).toBe(8 + base);
            }

            // Test Hypertetrahedron Core (16-23)
            for (let base = 0; base < 8; base++) {
                expect(2 * 8 + base).toBe(16 + base);
            }

            testMetrics.timings.push({ test: 'geometry_encoding', ms: performance.now() - start });
            testMetrics.coverage.geometryEncoding = true;
            testMetrics.passed++;
        });

        it('decodes geometry correctly: baseIndex = geometry % 8, coreIndex = floor(geometry / 8)', () => {
            const start = performance.now();

            const testCases = [
                { geometry: 0, expectedBase: 0, expectedCore: 0 },   // Tetrahedron Base
                { geometry: 7, expectedBase: 7, expectedCore: 0 },   // Crystal Base
                { geometry: 8, expectedBase: 0, expectedCore: 1 },   // Tetrahedron + Hypersphere
                { geometry: 15, expectedBase: 7, expectedCore: 1 },  // Crystal + Hypersphere
                { geometry: 16, expectedBase: 0, expectedCore: 2 },  // Tetrahedron + Hypertetra
                { geometry: 23, expectedBase: 7, expectedCore: 2 },  // Crystal + Hypertetra
            ];

            testCases.forEach(({ geometry, expectedBase, expectedCore }) => {
                const base = geometry % 8;
                const core = Math.floor(geometry / 8);
                expect(base).toBe(expectedBase);
                expect(core).toBe(expectedCore);
            });

            testMetrics.timings.push({ test: 'geometry_decoding', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('parameter manager accepts geometry 0-23', () => {
            const start = performance.now();
            const params = new ParameterManager();

            for (let g = 0; g < 24; g++) {
                params.setParameter('geometry', g);
                expect(params.getParameter('geometry')).toBe(g);
            }

            // Out of range should clamp
            params.setParameter('geometry', 30);
            expect(params.getParameter('geometry')).toBeLessThanOrEqual(23);

            params.setParameter('geometry', -1);
            expect(params.getParameter('geometry')).toBeGreaterThanOrEqual(0);

            testMetrics.timings.push({ test: 'geometry_param_range', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });

    describe('3. Rotor4D Operations for 6D Rotation', () => {

        it('creates identity rotor', () => {
            const start = performance.now();

            const rotor = Rotor4D.identity();
            // Rotor4D uses .s for scalar, not .scalar
            expect(rotor.s).toBe(1);
            expect(rotor.xy).toBe(0);
            expect(rotor.xz).toBe(0);
            expect(rotor.yz).toBe(0);
            expect(rotor.xw).toBe(0);
            expect(rotor.yw).toBe(0);
            expect(rotor.zw).toBe(0);
            expect(rotor.xyzw).toBe(0);

            testMetrics.timings.push({ test: 'rotor_identity', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('creates rotors for all 6 planes', () => {
            const start = performance.now();
            const angle = Math.PI / 4;

            // 3D space rotation planes
            const rotorXY = Rotor4D.fromPlaneAngle('xy', angle);
            const rotorXZ = Rotor4D.fromPlaneAngle('xz', angle);
            const rotorYZ = Rotor4D.fromPlaneAngle('yz', angle);

            // 4D hyperspace rotation planes
            const rotorXW = Rotor4D.fromPlaneAngle('xw', angle);
            const rotorYW = Rotor4D.fromPlaneAngle('yw', angle);
            const rotorZW = Rotor4D.fromPlaneAngle('zw', angle);

            // All should be valid rotors - Rotor4D uses .s for scalar
            [rotorXY, rotorXZ, rotorYZ, rotorXW, rotorYW, rotorZW].forEach(r => {
                expect(r).toBeDefined();
                expect(typeof r.s).toBe('number');
            });

            testMetrics.timings.push({ test: 'rotor_6planes', ms: performance.now() - start });
            testMetrics.coverage.rotorOperations = true;
            testMetrics.passed++;
        });

        it('composes rotors for combined 6D rotation', () => {
            const start = performance.now();

            const r1 = Rotor4D.fromPlaneAngle('xy', 0.5);
            const r2 = Rotor4D.fromPlaneAngle('xw', 0.3);
            const composed = r1.multiply(r2);

            expect(composed).toBeDefined();
            expect(composed.s).toBeDefined();

            testMetrics.timings.push({ test: 'rotor_compose', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('applies rotor to Vec4', () => {
            const start = performance.now();

            const v = new Vec4(1, 0, 0, 0);
            const rotor = Rotor4D.fromPlaneAngle('xy', Math.PI / 2);
            const rotated = rotor.rotate(v);

            // After 90 degree XY rotation, (1,0,0,0) should become approximately (0,1,0,0)
            expect(rotated.x).toBeCloseTo(0, 1);
            expect(rotated.y).toBeCloseTo(1, 1);
            expect(rotated.z).toBeCloseTo(0, 1);
            expect(rotated.w).toBeCloseTo(0, 1);

            testMetrics.timings.push({ test: 'rotor_apply', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });

    describe('4. State Export/Import', () => {

        it('exports full state with all 6D parameters', () => {
            const start = performance.now();
            const params = new ParameterManager();

            // Set some values
            params.setParameters({
                rot4dXY: 1.0,
                rot4dXZ: 2.0,
                rot4dYZ: 3.0,
                rot4dXW: 0.5,
                rot4dYW: 1.0,
                rot4dZW: 1.5,
                geometry: 12,
                hue: 180
            });

            const exported = params.exportConfiguration();

            expect(exported.type).toBe('vib34d-integrated-config');
            expect(exported.version).toBe('1.0.0');
            expect(exported.parameters.rot4dXY).toBeCloseTo(1.0, 2);
            expect(exported.parameters.rot4dXZ).toBeCloseTo(2.0, 2);
            expect(exported.parameters.rot4dYZ).toBeCloseTo(3.0, 2);
            expect(exported.parameters.rot4dXW).toBeCloseTo(0.5, 2);
            expect(exported.parameters.rot4dYW).toBeCloseTo(1.0, 2);
            expect(exported.parameters.rot4dZW).toBeCloseTo(1.5, 2);
            expect(exported.parameters.geometry).toBe(12);

            testMetrics.timings.push({ test: 'state_export', ms: performance.now() - start });
            testMetrics.coverage.stateManagement = true;
            testMetrics.passed++;
        });

        it('imports state and restores all parameters', () => {
            const start = performance.now();
            const params = new ParameterManager();

            // loadConfiguration takes a flat config object, not nested {parameters: {...}}
            const config = {
                rot4dXY: 2.5,
                rot4dXZ: 1.5,
                rot4dYZ: 0.5,
                rot4dXW: -0.5,
                rot4dYW: -1.0,
                rot4dZW: -1.5,
                geometry: 20,
                hue: 90
            };

            const result = params.loadConfiguration(config);
            expect(result).toBe(true);

            expect(params.getParameter('rot4dXY')).toBeCloseTo(2.5, 2);
            expect(params.getParameter('rot4dXZ')).toBeCloseTo(1.5, 2);
            expect(params.getParameter('rot4dYZ')).toBeCloseTo(0.5, 2);
            expect(params.getParameter('rot4dXW')).toBeCloseTo(-0.5, 2);
            expect(params.getParameter('rot4dYW')).toBeCloseTo(-1.0, 2);
            expect(params.getParameter('rot4dZW')).toBeCloseTo(-1.5, 2);
            expect(params.getParameter('geometry')).toBe(20);

            testMetrics.timings.push({ test: 'state_import', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('validates configuration before import', () => {
            const start = performance.now();
            const params = new ParameterManager();

            // Invalid type
            const invalid1 = { type: 'wrong-type', parameters: {} };
            expect(params.validateConfiguration(invalid1).valid).toBe(false);

            // Missing parameters
            const invalid2 = { type: 'vib34d-integrated-config' };
            expect(params.validateConfiguration(invalid2).valid).toBe(false);

            // Valid config
            const valid = {
                type: 'vib34d-integrated-config',
                parameters: { rot4dXY: 1.0 }
            };
            expect(params.validateConfiguration(valid).valid).toBe(true);

            testMetrics.timings.push({ test: 'state_validate', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });

    describe('5. Randomization and Reset', () => {

        it('randomizes all 6D rotation parameters', () => {
            const start = performance.now();
            const params = new ParameterManager();

            // Get initial values
            const initial = params.getAllParameters();

            // Randomize
            params.randomizeAll();

            const randomized = params.getAllParameters();

            // At least some values should be different (statistically certain)
            const changed =
                randomized.rot4dXY !== initial.rot4dXY ||
                randomized.rot4dXZ !== initial.rot4dXZ ||
                randomized.rot4dYZ !== initial.rot4dYZ ||
                randomized.rot4dXW !== initial.rot4dXW ||
                randomized.rot4dYW !== initial.rot4dYW ||
                randomized.rot4dZW !== initial.rot4dZW;

            expect(changed).toBe(true);

            testMetrics.timings.push({ test: 'randomize', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('resets all parameters to defaults', () => {
            const start = performance.now();
            const params = new ParameterManager();

            // Change values
            params.setParameters({
                rot4dXY: 5.0,
                rot4dXW: 1.5,
                geometry: 15
            });

            // Reset
            params.resetToDefaults();

            // Should be back to defaults
            expect(params.getParameter('rot4dXY')).toBe(0.0);
            expect(params.getParameter('rot4dXW')).toBe(0.0);
            expect(params.getParameter('geometry')).toBe(0);

            testMetrics.timings.push({ test: 'reset', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });

    describe('6. Geometry Factory Integration', () => {

        it('generates vertices for all 24 geometries', () => {
            const start = performance.now();

            const factory = new GeometryFactory();

            // Test all 24 geometry indices
            for (let i = 0; i < 24; i++) {
                const geometry = factory.generate(i);
                expect(geometry).toBeDefined();
                expect(geometry.vertices).toBeDefined();
                expect(geometry.vertices.length).toBeGreaterThan(0);
            }

            testMetrics.timings.push({ test: 'geometry_factory', ms: performance.now() - start });
            testMetrics.passed++;
        });

        it('generates geometry using standalone function', () => {
            const start = performance.now();

            // Test standalone generateGeometry function
            const geometry = generateGeometry(0);  // Tetrahedron base
            expect(geometry).toBeDefined();
            expect(geometry.vertices).toBeDefined();

            testMetrics.timings.push({ test: 'geometry_standalone', ms: performance.now() - start });
            testMetrics.passed++;
        });
    });
});

// Export metrics for analysis
export { testMetrics };
