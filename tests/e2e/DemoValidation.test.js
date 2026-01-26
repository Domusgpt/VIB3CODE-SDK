/**
 * VIB3+ Demo Validation Tests
 * Validates that demos correctly implement SDK features
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXAMPLES_DIR = join(process.cwd(), 'examples');

describe('Demo File Validation', () => {

    describe('vib3-real-demo.html - SDK Integration Demo', () => {
        let demoContent;

        beforeAll(() => {
            const path = join(EXAMPLES_DIR, 'vib3-real-demo.html');
            expect(existsSync(path)).toBe(true);
            demoContent = readFileSync(path, 'utf-8');
        });

        it('imports VIB3Engine from SDK', () => {
            expect(demoContent).toContain("import { VIB3Engine }");
            expect(demoContent).toContain("from '../src/core/VIB3Engine.js'");
        });

        it('has all 6 rotation parameter controls', () => {
            // 3D Space rotations
            expect(demoContent).toContain('id="rot4dXY"');
            expect(demoContent).toContain('id="rot4dXZ"');
            expect(demoContent).toContain('id="rot4dYZ"');

            // 4D Hyperspace rotations
            expect(demoContent).toContain('id="rot4dXW"');
            expect(demoContent).toContain('id="rot4dYW"');
            expect(demoContent).toContain('id="rot4dZW"');
        });

        it('calls engine.setParameter for rotations', () => {
            // Demo uses array iteration: ['rot4dXY', 'rot4dXZ', ...].forEach(param => engine.setParameter(param, value))
            expect(demoContent).toContain("'rot4dXY'");
            expect(demoContent).toContain("'rot4dXZ'");
            expect(demoContent).toContain("'rot4dYZ'");
            expect(demoContent).toContain("'rot4dXW'");
            expect(demoContent).toContain("'rot4dYW'");
            expect(demoContent).toContain("'rot4dZW'");
            expect(demoContent).toContain("engine.setParameter(param, value)");
        });

        it('has system switching buttons', () => {
            expect(demoContent).toContain('data-system="quantum"');
            expect(demoContent).toContain('data-system="faceted"');
            expect(demoContent).toContain('data-system="holographic"');
        });

        it('calls engine.switchSystem', () => {
            expect(demoContent).toContain('engine.switchSystem');
        });

        it('has geometry controls for 24 variants', () => {
            expect(demoContent).toContain('data-core="0"');
            expect(demoContent).toContain('data-core="1"');
            expect(demoContent).toContain('data-core="2"');
            expect(demoContent).toContain('coreIndex * 8 + baseIndex');
        });

        it('has export state functionality', () => {
            expect(demoContent).toContain('engine.exportState');
        });

        it('has randomize functionality', () => {
            expect(demoContent).toContain('engine.randomizeAll');
        });

        it('initializes engine with container ID', () => {
            expect(demoContent).toContain("engine.initialize('vib3-container')");
        });
    });

    describe('vib3-demo-standalone.html - Preview Demo', () => {
        let demoContent;

        beforeAll(() => {
            const path = join(EXAMPLES_DIR, 'vib3-demo-standalone.html');
            expect(existsSync(path)).toBe(true);
            demoContent = readFileSync(path, 'utf-8');
        });

        it('has all 6 rotation state variables', () => {
            // 3D Space rotations
            expect(demoContent).toContain('xy:');
            expect(demoContent).toContain('xz:');
            expect(demoContent).toContain('yz:');

            // 4D Hyperspace rotations
            expect(demoContent).toContain('xw:');
            expect(demoContent).toContain('yw:');
            expect(demoContent).toContain('zw:');
        });

        it('has sliders for all 6 rotation planes', () => {
            expect(demoContent).toContain('id="xySlider"');
            expect(demoContent).toContain('id="xzSlider"');
            expect(demoContent).toContain('id="yzSlider"');
            expect(demoContent).toContain('id="xwSlider"');
            expect(demoContent).toContain('id="ywSlider"');
            expect(demoContent).toContain('id="zwSlider"');
        });

        it('has presets with all 6D rotation values', () => {
            // Calm preset sets all to zero
            expect(demoContent).toMatch(/state\.xy\s*=\s*0.*state\.xw\s*=\s*0/s);

            // Chaos preset sets all planes active
            expect(demoContent).toMatch(/case\s*'chaos'[\s\S]*state\.xy[\s\S]*state\.xw/);
        });

        it('uses correct geometry encoding formula', () => {
            expect(demoContent).toContain('state.coreIndex * 8 + state.baseIndex');
        });

        it('has all 8 base geometry buttons', () => {
            expect(demoContent).toContain("'Tetra'");
            expect(demoContent).toContain("'Cube'");
            expect(demoContent).toContain("'Sphere'");
            expect(demoContent).toContain("'Torus'");
            expect(demoContent).toContain("'Klein'");
            expect(demoContent).toContain("'Fractal'");
            expect(demoContent).toContain("'Wave'");
            expect(demoContent).toContain("'Crystal'");
        });

        it('has 3 core type buttons', () => {
            expect(demoContent).toContain('data-core="0"');
            expect(demoContent).toContain('data-core="1"');
            expect(demoContent).toContain('data-core="2"');
        });

        it('has system selection', () => {
            expect(demoContent).toContain('data-system="quantum"');
            expect(demoContent).toContain('data-system="faceted"');
            expect(demoContent).toContain('data-system="holographic"');
        });
    });

    describe('Flutter Demo Files', () => {

        it('vib3_demo.dart exists', () => {
            const path = join(EXAMPLES_DIR, 'flutter_demo/lib/vib3_demo.dart');
            expect(existsSync(path)).toBe(true);
        });

        it('vib3_controller.dart exists', () => {
            const path = join(EXAMPLES_DIR, 'flutter_demo/lib/vib3_controller.dart');
            expect(existsSync(path)).toBe(true);
        });

        it('Flutter demo has 6D rotation parameters', () => {
            const path = join(EXAMPLES_DIR, 'flutter_demo/lib/vib3_controller.dart');
            const content = readFileSync(path, 'utf-8');

            expect(content).toContain('rot4dXY');
            expect(content).toContain('rot4dXZ');
            expect(content).toContain('rot4dYZ');
            expect(content).toContain('rot4dXW');
            expect(content).toContain('rot4dYW');
            expect(content).toContain('rot4dZW');
        });

        it('Flutter demo uses MaterialStateProperty (3.16 compatible)', () => {
            const path = join(EXAMPLES_DIR, 'flutter_demo/lib/vib3_demo.dart');
            const content = readFileSync(path, 'utf-8');

            // Should use MaterialState, not WidgetState (Flutter 3.22+)
            expect(content).toContain('MaterialStateProperty');
            expect(content).not.toContain('WidgetStateProperty');
        });
    });
});

describe('SDK Source Validation', () => {

    describe('Parameters.js', () => {
        let content;

        beforeAll(() => {
            const path = join(process.cwd(), 'src/core/Parameters.js');
            content = readFileSync(path, 'utf-8');
        });

        it('defines all 6 rotation parameters', () => {
            expect(content).toContain('rot4dXY:');
            expect(content).toContain('rot4dXZ:');
            expect(content).toContain('rot4dYZ:');
            expect(content).toContain('rot4dXW:');
            expect(content).toContain('rot4dYW:');
            expect(content).toContain('rot4dZW:');
        });

        it('has parameter definitions with ranges', () => {
            expect(content).toContain('rot4dXY: { min:');
            expect(content).toContain('rot4dXW: { min:');
        });

        it('exports ParameterManager class', () => {
            expect(content).toContain('export class ParameterManager');
        });
    });

    describe('VIB3Engine.js', () => {
        let content;

        beforeAll(() => {
            const path = join(process.cwd(), 'src/core/VIB3Engine.js');
            content = readFileSync(path, 'utf-8');
        });

        it('exports VIB3Engine class', () => {
            expect(content).toContain('export class VIB3Engine');
        });

        it('has switchSystem method', () => {
            expect(content).toContain('switchSystem');
        });

        it('has setParameter method', () => {
            expect(content).toContain('setParameter');
        });

        it('supports quantum, faceted, holographic systems', () => {
            expect(content).toContain("'quantum'");
            expect(content).toContain("'faceted'");
            expect(content).toContain("'holographic'");
        });

        it('has 24 geometry names', () => {
            expect(content).toContain('Hypersphere Core');
            expect(content).toContain('Hypertetrahedron Core');
        });
    });
});
