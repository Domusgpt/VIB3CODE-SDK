/**
 * Plastic Ratio Mathematical Foundations
 *
 * Implements the Plastic Ratio (ρ ≈ 1.3247) and related mathematical constructs
 * for the Phillips Rendering System. The Plastic Ratio is the unique real solution
 * to x³ = x + 1, analogous to the Golden Ratio but with distinct geometric properties.
 *
 * Used for low-discrepancy sampling to prevent moiré patterns in Gaussian Flat rendering.
 *
 * @module math/Plastic
 * @example
 * import { PLASTIC_CONSTANT, getPadovanSequence, getPlasticSamplingPoint } from './Plastic.js';
 *
 * // Generate Padovan sequence
 * const sequence = getPadovanSequence(10);
 * // [1, 1, 1, 2, 2, 3, 4, 5, 7, 9]
 *
 * // Get low-discrepancy sampling points
 * for (let i = 0; i < 100; i++) {
 *     const point = getPlasticSamplingPoint(i);
 *     // point.x and point.y are uniformly distributed without clustering
 * }
 */

/**
 * The Plastic Constant (ρ)
 * The unique real solution to x³ = x + 1
 * Also known as the Plastic Number or Plastic Ratio
 * @type {number}
 */
export const PLASTIC_CONSTANT = 1.324717957244746;

/**
 * Inverse of the Plastic Constant (1/ρ)
 * @type {number}
 */
export const PLASTIC_CONSTANT_INV = 1 / PLASTIC_CONSTANT;

/**
 * Square of the Plastic Constant (ρ²)
 * Useful for 2D sampling distributions
 * @type {number}
 */
export const PLASTIC_CONSTANT_SQ = PLASTIC_CONSTANT * PLASTIC_CONSTANT;

/**
 * Cube of the Plastic Constant (ρ³)
 * Note: ρ³ = ρ + 1 by definition
 * @type {number}
 */
export const PLASTIC_CONSTANT_CUBE = PLASTIC_CONSTANT + 1;

/**
 * Alpha constant for 2D Plastic sampling
 * α₁ = 1 / ρ for the first dimension
 * @type {number}
 */
export const PLASTIC_ALPHA_1 = 0.7548776662466927;

/**
 * Alpha constant for 2D Plastic sampling
 * α₂ = 1 / ρ² for the second dimension
 * @type {number}
 */
export const PLASTIC_ALPHA_2 = 0.5698402909980532;

/**
 * Generate the Padovan Sequence up to n terms
 *
 * The Padovan sequence is defined by:
 * P(0) = P(1) = P(2) = 1
 * P(n) = P(n-2) + P(n-3) for n > 2
 *
 * The ratio of successive terms converges to the Plastic Constant.
 *
 * @param {number} n - Number of terms to generate (must be > 0)
 * @returns {number[]} Array of n Padovan numbers starting with [1, 1, 1, ...]
 * @throws {Error} If n is less than 1
 * @example
 * getPadovanSequence(10);
 * // Returns: [1, 1, 1, 2, 2, 3, 4, 5, 7, 9]
 */
export function getPadovanSequence(n) {
    if (n < 1) {
        throw new Error('Padovan sequence length must be at least 1');
    }

    if (n === 1) return [1];
    if (n === 2) return [1, 1];
    if (n === 3) return [1, 1, 1];

    const sequence = [1, 1, 1];

    for (let i = 3; i < n; i++) {
        sequence.push(sequence[i - 2] + sequence[i - 3]);
    }

    return sequence;
}

/**
 * Get the nth Padovan number (0-indexed)
 *
 * @param {number} n - Index of the Padovan number to retrieve
 * @returns {number} The nth Padovan number
 * @example
 * getPadovanNumber(7); // Returns: 5
 */
export function getPadovanNumber(n) {
    if (n < 0) {
        throw new Error('Padovan index must be non-negative');
    }
    if (n < 3) return 1;

    let a = 1, b = 1, c = 1;
    for (let i = 3; i <= n; i++) {
        const next = a + b;
        a = b;
        b = c;
        c = next;
    }
    return c;
}

/**
 * Generate a 2D low-discrepancy sampling point using the Plastic Ratio
 *
 * Similar to the Golden Ratio sequence (R₂) but using the Plastic Ratio
 * for potentially better distribution in certain geometric contexts.
 * Each successive point is distributed to avoid clustering.
 *
 * @param {number} index - The sample index (0, 1, 2, ...)
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {{x: number, y: number}} Point in [0, 1) × [0, 1)
 * @example
 * const point = getPlasticSamplingPoint(42);
 * // Returns { x: 0.xxx, y: 0.yyy } uniformly distributed
 */
export function getPlasticSamplingPoint(index, seed = 0.5) {
    // Use Plastic-based low-discrepancy sequence
    // Similar to R₂ sequence but with Plastic constants
    const x = (seed + PLASTIC_ALPHA_1 * index) % 1;
    const y = (seed + PLASTIC_ALPHA_2 * index) % 1;

    return { x, y };
}

/**
 * Generate a 3D low-discrepancy sampling point using the Plastic Ratio
 *
 * Extended to 3D for volumetric sampling applications.
 *
 * @param {number} index - The sample index (0, 1, 2, ...)
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {{x: number, y: number, z: number}} Point in [0, 1)³
 * @example
 * const point = getPlasticSamplingPoint3D(42);
 */
export function getPlasticSamplingPoint3D(index, seed = 0.5) {
    // Alpha constants for 3D: powers of 1/ρ
    const alpha3 = PLASTIC_ALPHA_2 * PLASTIC_CONSTANT_INV;

    const x = (seed + PLASTIC_ALPHA_1 * index) % 1;
    const y = (seed + PLASTIC_ALPHA_2 * index) % 1;
    const z = (seed + alpha3 * index) % 1;

    return { x, y, z };
}

/**
 * Generate an array of 2D sampling points using Plastic distribution
 *
 * @param {number} count - Number of points to generate
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {Array<{x: number, y: number}>} Array of 2D points
 * @example
 * const points = generatePlasticSamplingGrid(100);
 * // Returns 100 uniformly distributed points
 */
export function generatePlasticSamplingGrid(count, seed = 0.5) {
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push(getPlasticSamplingPoint(i, seed));
    }
    return points;
}

/**
 * Calculate the Plastic power for scale modulation
 *
 * Returns ρ^n for use in scale calculations in the Phillips Renderer.
 *
 * @param {number} n - The power (can be negative or fractional)
 * @returns {number} ρ^n
 * @example
 * getPlasticPower(2);  // Returns ρ² ≈ 1.7549
 * getPlasticPower(-1); // Returns 1/ρ ≈ 0.7549
 */
export function getPlasticPower(n) {
    return Math.pow(PLASTIC_CONSTANT, n);
}

/**
 * Calculate scale factor based on Plastic Ratio for splat sizing
 *
 * Maps a depth or distance value to a scale factor using Plastic powers.
 * Useful for the Phillips Renderer's u_plasticScale uniform.
 *
 * @param {number} depth - Depth value (0 = near, 1 = far)
 * @param {number} [minScale=0.1] - Minimum scale factor
 * @param {number} [maxScale=2.0] - Maximum scale factor
 * @returns {number} Scale factor modulated by Plastic Ratio
 */
export function getPlasticScaleFactor(depth, minScale = 0.1, maxScale = 2.0) {
    // Use inverse Plastic power for natural depth falloff
    const plasticFactor = getPlasticPower(-depth);
    return minScale + (maxScale - minScale) * plasticFactor;
}

/**
 * Convert an RGB color to RGB565 format (16-bit)
 *
 * Used for the ~17 bytes/splat compression target in the Phillips system.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} 16-bit RGB565 color value
 * @example
 * const packed = packRGB565(255, 128, 64);
 */
export function packRGB565(r, g, b) {
    const r5 = (r >> 3) & 0x1F;  // 5 bits for red
    const g6 = (g >> 2) & 0x3F;  // 6 bits for green
    const b5 = (b >> 3) & 0x1F;  // 5 bits for blue
    return (r5 << 11) | (g6 << 5) | b5;
}

/**
 * Unpack RGB565 to RGB components
 *
 * @param {number} packed - 16-bit RGB565 color value
 * @returns {{r: number, g: number, b: number}} RGB components (0-255)
 */
export function unpackRGB565(packed) {
    const r5 = (packed >> 11) & 0x1F;
    const g6 = (packed >> 5) & 0x3F;
    const b5 = packed & 0x1F;

    return {
        r: (r5 << 3) | (r5 >> 2),  // Expand 5 bits to 8 bits
        g: (g6 << 2) | (g6 >> 4),  // Expand 6 bits to 8 bits
        b: (b5 << 3) | (b5 >> 2)   // Expand 5 bits to 8 bits
    };
}

/**
 * Estimate if the Plastic sampling has reached sufficient coverage
 *
 * Based on the discrepancy theory, determines if n samples provide
 * adequate coverage of the unit square.
 *
 * @param {number} sampleCount - Number of samples placed
 * @param {number} targetResolution - Target resolution (pixels per dimension)
 * @returns {boolean} True if coverage is sufficient
 */
export function hasSufficientCoverage(sampleCount, targetResolution) {
    // Plastic sequence has O(1/n) discrepancy
    // For a grid of targetResolution², we need roughly that many samples
    const minSamples = targetResolution * targetResolution * 0.5;
    return sampleCount >= minSamples;
}

export default {
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
};
