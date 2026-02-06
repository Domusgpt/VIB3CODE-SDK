/**
 * Plastic Ratio Math Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
    PLASTIC_CONSTANT,
    PLASTIC_CONSTANT_INV,
    PLASTIC_CONSTANT_SQ,
    PLASTIC_CONSTANT_CUBE,
    PLASTIC_ALPHA_1,
    PLASTIC_ALPHA_2,
    getPadovanSequence,
    getPadovanNumber,
    getPlasticSamplingPoint,
    getPlasticSamplingPoint3D,
    generatePlasticSamplingGrid,
    getPlasticPower,
    getPlasticScaleFactor,
    packRGB565,
    unpackRGB565,
    hasSufficientCoverage
} from '../../src/math/Plastic.js';

describe('Plastic Constants', () => {
    it('defines PLASTIC_CONSTANT correctly', () => {
        expect(PLASTIC_CONSTANT).toBeCloseTo(1.324717957244746, 10);
    });

    it('defines PLASTIC_CONSTANT_INV as reciprocal', () => {
        expect(PLASTIC_CONSTANT * PLASTIC_CONSTANT_INV).toBeCloseTo(1, 10);
    });

    it('defines PLASTIC_CONSTANT_SQ correctly', () => {
        expect(PLASTIC_CONSTANT_SQ).toBeCloseTo(PLASTIC_CONSTANT * PLASTIC_CONSTANT, 10);
    });

    it('satisfies x³ = x + 1 (defining property of Plastic Ratio)', () => {
        const cubed = Math.pow(PLASTIC_CONSTANT, 3);
        const xPlusOne = PLASTIC_CONSTANT + 1;
        expect(cubed).toBeCloseTo(xPlusOne, 10);
    });

    it('defines PLASTIC_CONSTANT_CUBE as ρ + 1', () => {
        expect(PLASTIC_CONSTANT_CUBE).toBeCloseTo(PLASTIC_CONSTANT + 1, 10);
    });

    it('defines alpha constants for sampling', () => {
        expect(PLASTIC_ALPHA_1).toBeCloseTo(1 / PLASTIC_CONSTANT, 10);
        expect(PLASTIC_ALPHA_2).toBeCloseTo(1 / PLASTIC_CONSTANT_SQ, 10);
    });
});

describe('getPadovanSequence', () => {
    it('generates correct Padovan sequence for known values', () => {
        const sequence = getPadovanSequence(10);
        expect(sequence).toEqual([1, 1, 1, 2, 2, 3, 4, 5, 7, 9]);
    });

    it('handles n=1', () => {
        expect(getPadovanSequence(1)).toEqual([1]);
    });

    it('handles n=2', () => {
        expect(getPadovanSequence(2)).toEqual([1, 1]);
    });

    it('handles n=3', () => {
        expect(getPadovanSequence(3)).toEqual([1, 1, 1]);
    });

    it('generates longer sequences correctly', () => {
        const sequence = getPadovanSequence(20);
        expect(sequence.length).toBe(20);

        // Verify Padovan recurrence: P(n) = P(n-2) + P(n-3)
        for (let i = 3; i < sequence.length; i++) {
            expect(sequence[i]).toBe(sequence[i - 2] + sequence[i - 3]);
        }
    });

    it('throws error for n < 1', () => {
        expect(() => getPadovanSequence(0)).toThrow();
        expect(() => getPadovanSequence(-1)).toThrow();
    });

    it('converges to Plastic Ratio', () => {
        const sequence = getPadovanSequence(50);
        const ratio = sequence[49] / sequence[48];
        expect(ratio).toBeCloseTo(PLASTIC_CONSTANT, 3);
    });
});

describe('getPadovanNumber', () => {
    it('returns correct values for small indices', () => {
        expect(getPadovanNumber(0)).toBe(1);
        expect(getPadovanNumber(1)).toBe(1);
        expect(getPadovanNumber(2)).toBe(1);
        expect(getPadovanNumber(3)).toBe(2);
        expect(getPadovanNumber(4)).toBe(2);
        expect(getPadovanNumber(5)).toBe(3);
        expect(getPadovanNumber(6)).toBe(4);
        expect(getPadovanNumber(7)).toBe(5);
    });

    it('throws error for negative index', () => {
        expect(() => getPadovanNumber(-1)).toThrow();
    });

    it('matches getPadovanSequence output', () => {
        const sequence = getPadovanSequence(15);
        for (let i = 0; i < 15; i++) {
            expect(getPadovanNumber(i)).toBe(sequence[i]);
        }
    });
});

describe('getPlasticSamplingPoint', () => {
    it('returns point in unit square', () => {
        for (let i = 0; i < 100; i++) {
            const point = getPlasticSamplingPoint(i);
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThan(1);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThan(1);
        }
    });

    it('generates different points for different indices', () => {
        const p0 = getPlasticSamplingPoint(0);
        const p1 = getPlasticSamplingPoint(1);
        const p2 = getPlasticSamplingPoint(2);

        expect(p0.x).not.toBeCloseTo(p1.x, 5);
        expect(p1.x).not.toBeCloseTo(p2.x, 5);
    });

    it('uses seed parameter correctly', () => {
        const p1 = getPlasticSamplingPoint(5, 0.0);
        const p2 = getPlasticSamplingPoint(5, 0.5);
        const p3 = getPlasticSamplingPoint(5, 0.25);

        expect(p1.x).not.toBeCloseTo(p2.x, 5);
        expect(p2.x).not.toBeCloseTo(p3.x, 5);
    });

    it('produces low-discrepancy distribution', () => {
        // Check that points don't cluster by verifying minimum distance
        const points = [];
        for (let i = 0; i < 50; i++) {
            points.push(getPlasticSamplingPoint(i));
        }

        let minDistance = Infinity;
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const dx = points[i].x - points[j].x;
                const dy = points[i].y - points[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                minDistance = Math.min(minDistance, dist);
            }
        }

        // For 50 points in unit square, minimum distance should be reasonable
        expect(minDistance).toBeGreaterThan(0.01);
    });
});

describe('getPlasticSamplingPoint3D', () => {
    it('returns point in unit cube', () => {
        for (let i = 0; i < 50; i++) {
            const point = getPlasticSamplingPoint3D(i);
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThan(1);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeLessThan(1);
            expect(point.z).toBeGreaterThanOrEqual(0);
            expect(point.z).toBeLessThan(1);
        }
    });

    it('has x and y matching 2D version', () => {
        for (let i = 0; i < 10; i++) {
            const p2d = getPlasticSamplingPoint(i);
            const p3d = getPlasticSamplingPoint3D(i);
            expect(p3d.x).toBeCloseTo(p2d.x, 10);
            expect(p3d.y).toBeCloseTo(p2d.y, 10);
        }
    });
});

describe('generatePlasticSamplingGrid', () => {
    it('generates correct number of points', () => {
        const points = generatePlasticSamplingGrid(100);
        expect(points.length).toBe(100);
    });

    it('all points are in unit square', () => {
        const points = generatePlasticSamplingGrid(50);
        for (const p of points) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThan(1);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThan(1);
        }
    });

    it('matches individual sampling calls', () => {
        const grid = generatePlasticSamplingGrid(20);
        for (let i = 0; i < 20; i++) {
            const individual = getPlasticSamplingPoint(i);
            expect(grid[i].x).toBeCloseTo(individual.x, 10);
            expect(grid[i].y).toBeCloseTo(individual.y, 10);
        }
    });
});

describe('getPlasticPower', () => {
    it('returns 1 for power 0', () => {
        expect(getPlasticPower(0)).toBe(1);
    });

    it('returns PLASTIC_CONSTANT for power 1', () => {
        expect(getPlasticPower(1)).toBeCloseTo(PLASTIC_CONSTANT, 10);
    });

    it('returns PLASTIC_CONSTANT_SQ for power 2', () => {
        expect(getPlasticPower(2)).toBeCloseTo(PLASTIC_CONSTANT_SQ, 10);
    });

    it('returns reciprocal for power -1', () => {
        expect(getPlasticPower(-1)).toBeCloseTo(PLASTIC_CONSTANT_INV, 10);
    });

    it('handles fractional powers', () => {
        const half = getPlasticPower(0.5);
        expect(half * half).toBeCloseTo(PLASTIC_CONSTANT, 10);
    });
});

describe('getPlasticScaleFactor', () => {
    it('returns maxScale at depth 0', () => {
        const scale = getPlasticScaleFactor(0, 0.1, 2.0);
        expect(scale).toBeCloseTo(2.0, 5);
    });

    it('returns value between min and max', () => {
        for (let d = 0; d <= 1; d += 0.1) {
            const scale = getPlasticScaleFactor(d, 0.1, 2.0);
            expect(scale).toBeGreaterThanOrEqual(0.1);
            expect(scale).toBeLessThanOrEqual(2.0);
        }
    });

    it('decreases as depth increases', () => {
        const s0 = getPlasticScaleFactor(0, 0.1, 2.0);
        const s1 = getPlasticScaleFactor(0.5, 0.1, 2.0);
        const s2 = getPlasticScaleFactor(1.0, 0.1, 2.0);
        expect(s0).toBeGreaterThan(s1);
        expect(s1).toBeGreaterThan(s2);
    });
});

describe('RGB565 Packing', () => {
    describe('packRGB565', () => {
        it('packs pure red correctly', () => {
            const packed = packRGB565(255, 0, 0);
            expect(packed).toBe(0xF800); // 5 bits red = 11111
        });

        it('packs pure green correctly', () => {
            const packed = packRGB565(0, 255, 0);
            expect(packed).toBe(0x07E0); // 6 bits green = 111111
        });

        it('packs pure blue correctly', () => {
            const packed = packRGB565(0, 0, 255);
            expect(packed).toBe(0x001F); // 5 bits blue = 11111
        });

        it('packs white correctly', () => {
            const packed = packRGB565(255, 255, 255);
            expect(packed).toBe(0xFFFF);
        });

        it('packs black correctly', () => {
            const packed = packRGB565(0, 0, 0);
            expect(packed).toBe(0x0000);
        });
    });

    describe('unpackRGB565', () => {
        it('unpacks pure red correctly', () => {
            const unpacked = unpackRGB565(0xF800);
            expect(unpacked.r).toBe(255);
            expect(unpacked.g).toBe(0);
            expect(unpacked.b).toBe(0);
        });

        it('unpacks pure green correctly', () => {
            const unpacked = unpackRGB565(0x07E0);
            expect(unpacked.r).toBe(0);
            expect(unpacked.g).toBeCloseTo(255, 0);
            expect(unpacked.b).toBe(0);
        });

        it('unpacks pure blue correctly', () => {
            const unpacked = unpackRGB565(0x001F);
            expect(unpacked.r).toBe(0);
            expect(unpacked.g).toBe(0);
            expect(unpacked.b).toBe(255);
        });

        it('unpacks white correctly', () => {
            const unpacked = unpackRGB565(0xFFFF);
            expect(unpacked.r).toBe(255);
            expect(unpacked.g).toBeCloseTo(255, 0);
            expect(unpacked.b).toBe(255);
        });
    });

    describe('round-trip', () => {
        it('preserves colors reasonably well', () => {
            const testColors = [
                { r: 255, g: 128, b: 64 },
                { r: 100, g: 200, b: 150 },
                { r: 50, g: 100, b: 200 }
            ];

            for (const color of testColors) {
                const packed = packRGB565(color.r, color.g, color.b);
                const unpacked = unpackRGB565(packed);

                // RGB565 loses some precision, allow tolerance
                expect(Math.abs(unpacked.r - color.r)).toBeLessThan(8);
                expect(Math.abs(unpacked.g - color.g)).toBeLessThan(4);
                expect(Math.abs(unpacked.b - color.b)).toBeLessThan(8);
            }
        });
    });
});

describe('hasSufficientCoverage', () => {
    it('returns false for too few samples', () => {
        expect(hasSufficientCoverage(10, 100)).toBe(false);
    });

    it('returns true for enough samples', () => {
        expect(hasSufficientCoverage(5000, 100)).toBe(true);
    });

    it('scales with resolution', () => {
        expect(hasSufficientCoverage(100, 10)).toBe(true);
        expect(hasSufficientCoverage(100, 100)).toBe(false);
    });
});
