/**
 * GaussianSeedBuffer
 *
 * Encodes Gaussian seeds into an interleaved Float32Array for GPU upload.
 */

const DEFAULT_ORIENTATION = Object.freeze([1, 0, 0, 0]);
const DEFAULT_COLOR = Object.freeze([1, 1, 1]);

export const GAUSSIAN_SEED_STRIDE = 12;
export const GAUSSIAN_SEED_LAYOUT = Object.freeze([
    'position.x',
    'position.y',
    'position.z',
    'scale',
    'orientation.w',
    'orientation.x',
    'orientation.y',
    'orientation.z',
    'color.r',
    'color.g',
    'color.b',
    'depth'
]);

/**
 * @param {Object[]} seeds
 * @returns {Float32Array}
 */
export function encodeGaussianSeeds(seeds) {
    const buffer = new Float32Array(seeds.length * GAUSSIAN_SEED_STRIDE);
    seeds.forEach((seed, index) => {
        const offset = index * GAUSSIAN_SEED_STRIDE;
        const position = seed.position ?? [0, 0, 0];
        const orientation = seed.orientation ?? DEFAULT_ORIENTATION;
        const color = seed.color ?? DEFAULT_COLOR;
        const scale = seed.scale ?? 1;
        const depth = seed.depth ?? 0;

        buffer[offset + 0] = position[0] ?? 0;
        buffer[offset + 1] = position[1] ?? 0;
        buffer[offset + 2] = position[2] ?? 0;
        buffer[offset + 3] = scale;
        buffer[offset + 4] = orientation[0] ?? 1;
        buffer[offset + 5] = orientation[1] ?? 0;
        buffer[offset + 6] = orientation[2] ?? 0;
        buffer[offset + 7] = orientation[3] ?? 0;
        buffer[offset + 8] = color[0] ?? 1;
        buffer[offset + 9] = color[1] ?? 1;
        buffer[offset + 10] = color[2] ?? 1;
        buffer[offset + 11] = depth;
    });
    return buffer;
}

export default encodeGaussianSeeds;

