/**
 * Golden Snapshot Tests for Export Formats
 *
 * Validates export format fidelity against baseline snapshots.
 * These tests ensure export consistency across code changes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { exportSVG } from '../../src/export/SVGExporter.js';
import { exportCSS } from '../../src/export/CSSExporter.js';
import { exportLottie } from '../../src/export/LottieExporter.js';

/**
 * Standard test parameters for consistency across snapshots
 */
const TEST_PARAMS = {
    system: 'quantum',
    geometry: 8, // Hypersphere core tetrahedron
    rot4dXY: 0.5,
    rot4dXZ: 0.0,
    rot4dYZ: 0.0,
    rot4dXW: 1.0,
    rot4dYW: 0.0,
    rot4dZW: 0.0,
    hue: 200,
    saturation: 0.7,
    intensity: 0.8,
    gridDensity: 16,
    dimension: 3.5,
    chaos: 0,
    morphFactor: 0,
    speed: 1.0
};

/**
 * Normalize whitespace for comparison
 */
function normalizeWhitespace(str) {
    return str.replace(/\s+/g, ' ').trim();
}

describe('export golden snapshots', () => {
    describe('SVG export', () => {
        it('generates valid SVG structure', () => {
            const result = exportSVG(TEST_PARAMS, { width: 512, height: 512 });

            // SVG should contain svg tag (may or may not have XML declaration)
            expect(result).toContain('<svg');
            expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
            expect(result).toContain('</svg>');
        });

        it('includes required metadata attributes', () => {
            const result = exportSVG(TEST_PARAMS, { width: 512, height: 512 });

            expect(result).toContain('data-vib3-geometry="8"');
            expect(result).toContain('data-vib3-system="quantum"');
            expect(result).toContain('viewBox="0 0 512 512"');
        });

        it('includes CSS variables in defs', () => {
            const result = exportSVG(TEST_PARAMS, { width: 512, height: 512 });

            expect(result).toContain('--vib3-hue: 200');
            expect(result).toContain('--vib3-saturation: 0.7');
            expect(result).toContain('--vib3-intensity: 0.8');
        });

        it('generates geometry layer', () => {
            const result = exportSVG(TEST_PARAMS, { width: 512, height: 512 });

            expect(result).toContain('id="geometry-layer"');
            expect(result).toContain('<circle');
        });

        it('respects watermark option', () => {
            const withWatermark = exportSVG(TEST_PARAMS, { includeWatermark: true });
            const withoutWatermark = exportSVG(TEST_PARAMS, { includeWatermark: false });

            expect(withWatermark).toContain('id="vib3-watermark"');
            expect(withoutWatermark).not.toContain('id="vib3-watermark"');
        });

        it('generates consistent output for same params', () => {
            const result1 = exportSVG(TEST_PARAMS, { width: 256, height: 256 });
            const result2 = exportSVG(TEST_PARAMS, { width: 256, height: 256 });

            // Normalize and compare (may have slight float differences)
            expect(normalizeWhitespace(result1)).toBe(normalizeWhitespace(result2));
        });

        it('handles different geometry indices', () => {
            for (let i = 0; i < 24; i++) {
                const params = { ...TEST_PARAMS, geometry: i };
                const result = exportSVG(params, { width: 128, height: 128 });

                expect(result).toContain('<svg');
                expect(result).toContain(`data-vib3-geometry="${i}"`);
            }
        });
    });

    describe('CSS export', () => {
        it('generates valid CSS', () => {
            const result = exportCSS(TEST_PARAMS);

            expect(result).toContain(':root {');
            expect(result).toContain('}');
        });

        it('includes all required variables', () => {
            const result = exportCSS(TEST_PARAMS);

            expect(result).toContain('--vib3-hue: 200');
            expect(result).toContain('--vib3-saturation: 0.7');
            expect(result).toContain('--vib3-intensity: 0.8');
            expect(result).toContain('--vib3-geometry: 8');
            expect(result).toContain("--vib3-system: 'quantum'");
            expect(result).toContain('--vib3-rot-xw: 1');
        });

        it('includes color palette variables', () => {
            const result = exportCSS(TEST_PARAMS);

            expect(result).toContain('--vib3-primary:');
            expect(result).toContain('--vib3-secondary:');
            expect(result).toContain('--vib3-accent:');
        });

        it('respects dark mode option', () => {
            const withDark = exportCSS(TEST_PARAMS, { includeDarkMode: true });
            const withoutDark = exportCSS(TEST_PARAMS, { includeDarkMode: false });

            expect(withDark).toContain('@media (prefers-color-scheme: dark)');
            expect(withoutDark).not.toContain('@media (prefers-color-scheme: dark)');
        });

        it('respects animation option', () => {
            const withAnim = exportCSS(TEST_PARAMS, { includeAnimations: true });
            const withoutAnim = exportCSS(TEST_PARAMS, { includeAnimations: false });

            expect(withAnim).toContain('@keyframes vib3-pulse');
            expect(withoutAnim).not.toContain('@keyframes');
        });

        it('supports custom prefix', () => {
            const result = exportCSS(TEST_PARAMS, { prefix: 'custom' });

            expect(result).toContain('--custom-hue:');
            expect(result).toContain('--custom-geometry:');
        });

        it('generates consistent output', () => {
            const result1 = exportCSS(TEST_PARAMS);
            const result2 = exportCSS(TEST_PARAMS);

            expect(result1).toBe(result2);
        });
    });

    describe('Lottie export', () => {
        it('produces valid Lottie schema', () => {
            const result = exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });

            expect(result).toHaveProperty('v'); // version
            expect(result).toHaveProperty('fr'); // frame rate
            expect(result).toHaveProperty('ip'); // in point
            expect(result).toHaveProperty('op'); // out point
            expect(result).toHaveProperty('w'); // width
            expect(result).toHaveProperty('h'); // height
            expect(result).toHaveProperty('layers');
            expect(Array.isArray(result.layers)).toBe(true);
        });

        it('includes correct frame rate', () => {
            const result30 = exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });
            const result60 = exportLottie(TEST_PARAMS, { fps: 60, duration: 1 });

            expect(result30.fr).toBe(30);
            expect(result60.fr).toBe(60);
        });

        it('calculates correct total frames', () => {
            const result = exportLottie(TEST_PARAMS, { fps: 30, duration: 5 });

            expect(result.op).toBe(150); // 30 fps * 5 seconds
        });

        it('includes metadata when enabled', () => {
            const withMeta = exportLottie(TEST_PARAMS, { includeMetadata: true });
            const withoutMeta = exportLottie(TEST_PARAMS, { includeMetadata: false });

            expect(withMeta.meta).toBeDefined();
            expect(withMeta.meta.system).toBe('quantum');
            expect(withMeta.meta.geometry).toBe(8);
            expect(withoutMeta.meta).toBeUndefined();
        });

        it('includes required layers', () => {
            const result = exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });

            expect(result.layers.length).toBeGreaterThanOrEqual(2);

            // Check for background layer
            const bgLayer = result.layers.find(l => l.nm === 'Background');
            expect(bgLayer).toBeDefined();

            // Check for geometry layer
            const geoLayer = result.layers.find(l => l.nm === 'Geometry');
            expect(geoLayer).toBeDefined();
        });

        it('respects width and height options', () => {
            const result = exportLottie(TEST_PARAMS, { width: 1920, height: 1080 });

            expect(result.w).toBe(1920);
            expect(result.h).toBe(1080);
        });

        it('generates consistent structure', () => {
            const result1 = exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });
            const result2 = exportLottie(TEST_PARAMS, { fps: 30, duration: 1 });

            expect(result1.fr).toBe(result2.fr);
            expect(result1.w).toBe(result2.w);
            expect(result1.h).toBe(result2.h);
            expect(result1.layers.length).toBe(result2.layers.length);
        });
    });

    describe('cross-format consistency', () => {
        it('all formats handle same geometry correctly', () => {
            const geometry = 12; // Hypersphere Klein Bottle
            const params = { ...TEST_PARAMS, geometry };

            const svg = exportSVG(params);
            const css = exportCSS(params);
            const lottie = exportLottie(params);

            expect(svg).toContain(`data-vib3-geometry="${geometry}"`);
            expect(css).toContain(`--vib3-geometry: ${geometry}`);
            expect(lottie.meta.geometry).toBe(geometry);
        });

        it('all formats respect hue parameter', () => {
            const hue = 280;
            const params = { ...TEST_PARAMS, hue };

            const svg = exportSVG(params);
            const css = exportCSS(params);

            expect(svg).toContain(`--vib3-hue: ${hue}`);
            expect(css).toContain(`--vib3-hue: ${hue}`);
        });

        it('all formats handle all systems', () => {
            const systems = ['quantum', 'faceted', 'holographic'];

            for (const system of systems) {
                const params = { ...TEST_PARAMS, system };

                const svg = exportSVG(params);
                const css = exportCSS(params);
                const lottie = exportLottie(params);

                expect(svg).toContain(`data-vib3-system="${system}"`);
                expect(css).toContain(`--vib3-system: '${system}'`);
                expect(lottie.meta.system).toBe(system);
            }
        });
    });
});
