/**
 * GaussianSeedBuffer
 *
 * Encodes Gaussian seeds into an interleaved Float32Array for GPU upload.
 *
 * Two formats are supported:
 *
 *  STANDARD (12 floats, 48 bytes) — original layout, single scalar scale:
 *    [0-2]  position xyz
 *    [3]    scale (uniform)
 *    [4-7]  orientation (quaternion w,x,y,z)
 *    [8-10] color (rgb)
 *    [11]   depth
 *
 *  HIFI (16 floats, 64 bytes) — anisotropic scale, opacity:
 *    [0-2]  position xyz
 *    [3-5]  scale xyz (3-axis anisotropic)
 *    [6-9]  orientation (quaternion w,x,y,z)
 *    [10-12] color (rgb)
 *    [13]   opacity (0-1)
 *    [14]   depth
 *    [15]   _padding
 */

const DEFAULT_ORIENTATION = Object.freeze([1, 0, 0, 0]);
const DEFAULT_COLOR = Object.freeze([1, 1, 1]);

export const GAUSSIAN_SEED_STRIDE = 12;
export const GAUSSIAN_HIFI_STRIDE = 16;

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

export const GAUSSIAN_HIFI_LAYOUT = Object.freeze([
    'position.x',
    'position.y',
    'position.z',
    'scale.x',
    'scale.y',
    'scale.z',
    'orientation.w',
    'orientation.x',
    'orientation.y',
    'orientation.z',
    'color.r',
    'color.g',
    'color.b',
    'opacity',
    'depth',
    '_padding'
]);

/**
 * Encode seeds into the standard 12-float layout.
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

/**
 * Encode seeds into the hi-fi 16-float layout with 3-axis anisotropic scale
 * and explicit opacity.
 *
 * Seeds may use either:
 *   seed.scale3  — [sx, sy, sz] array
 *   seed.scale   — scalar (expanded to [s, s, s])
 *
 * @param {Object[]} seeds
 * @returns {Float32Array}
 */
export function encodeHiFiSeeds(seeds) {
    const buffer = new Float32Array(seeds.length * GAUSSIAN_HIFI_STRIDE);
    for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        const offset = i * GAUSSIAN_HIFI_STRIDE;
        const position = seed.position ?? [0, 0, 0];
        const orientation = seed.orientation ?? DEFAULT_ORIENTATION;
        const color = seed.color ?? DEFAULT_COLOR;
        const opacity = seed.opacity ?? 1.0;
        const depth = seed.depth ?? 0;

        // 3-axis scale: prefer scale3, fall back to uniform scalar
        let sx, sy, sz;
        if (seed.scale3) {
            sx = seed.scale3[0] ?? 1;
            sy = seed.scale3[1] ?? 1;
            sz = seed.scale3[2] ?? 1;
        } else {
            const s = seed.scale ?? 1;
            sx = sy = sz = s;
        }

        buffer[offset + 0]  = position[0] ?? 0;
        buffer[offset + 1]  = position[1] ?? 0;
        buffer[offset + 2]  = position[2] ?? 0;
        buffer[offset + 3]  = sx;
        buffer[offset + 4]  = sy;
        buffer[offset + 5]  = sz;
        buffer[offset + 6]  = orientation[0] ?? 1;
        buffer[offset + 7]  = orientation[1] ?? 0;
        buffer[offset + 8]  = orientation[2] ?? 0;
        buffer[offset + 9]  = orientation[3] ?? 0;
        buffer[offset + 10] = color[0] ?? 1;
        buffer[offset + 11] = color[1] ?? 1;
        buffer[offset + 12] = color[2] ?? 1;
        buffer[offset + 13] = opacity;
        buffer[offset + 14] = depth;
        buffer[offset + 15] = 0; // padding for 16-byte alignment
    }
    return buffer;
}

export default encodeGaussianSeeds;

