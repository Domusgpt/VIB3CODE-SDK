/**
 * TextureToSplatConverter
 *
 * Converts traditional texture maps (diffuse, normal, specular) into Gaussian
 * seed data suitable for the VIB3+ splat rendering pipeline.  Unlike the
 * existing ImageSplatGenerator (which works on flat 2D images), this converter
 * is mesh-surface-aware:
 *
 *   1. **Surface Sampling**  — Given mesh geometry (positions, normals, UVs,
 *      indices), samples the texture at triangle surface points and emits
 *      splats positioned in 3D on the mesh surface.
 *
 *   2. **Edge-Aware Density** — Uses Sobel gradient magnitude on the texture
 *      to concentrate more splats at edges, details, and high-frequency
 *      regions.  Flat areas get fewer splats (level-of-detail aware).
 *
 *   3. **Normal-Map Integration** — When a normal map is provided, splat
 *      orientations are derived from the combined surface + tangent-space
 *      normal, producing oriented elliptical splats that follow surface
 *      microstructure.
 *
 *   4. **Specular → Bloom Mapping** — Specular/roughness map values are
 *      mapped to the splat `depth` field, which controls bloom energy
 *      in the Gaussian renderer.
 *
 * The output is an array of seed objects compatible with encodeGaussianSeeds().
 *
 * Usage:
 *   const converter = new TextureToSplatConverter();
 *   const seeds = converter.convert({
 *       positions, normals, uvs, indices,
 *       diffusePixels, diffuseWidth, diffuseHeight,
 *       normalPixels, normalWidth, normalHeight,      // optional
 *       specularPixels, specularWidth, specularHeight, // optional
 *   });
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Sobel magnitude at (x, y) over a single-channel buffer. */
function sobelMag(buf, w, h, x, y) {
    const g = (dx, dy) => {
        const cx = Math.min(w - 1, Math.max(0, x + dx));
        const cy = Math.min(h - 1, Math.max(0, y + dy));
        return buf[cy * w + cx];
    };
    const gx = -g(-1,-1) + g(1,-1) - 2*g(-1,0) + 2*g(1,0) - g(-1,1) + g(1,1);
    const gy = -g(-1,-1) - 2*g(0,-1) - g(1,-1) + g(-1,1) + 2*g(0,1) + g(1,1);
    return Math.sqrt(gx * gx + gy * gy);
}

/** Barycentric interpolation of a vec3 across a triangle. */
function baryLerp3(a, b, c, u, v) {
    const w = 1 - u - v;
    return [
        a[0] * w + b[0] * u + c[0] * v,
        a[1] * w + b[1] * u + c[1] * v,
        a[2] * w + b[2] * u + c[2] * v,
    ];
}

/** Barycentric interpolation of a vec2 across a triangle. */
function baryLerp2(a, b, c, u, v) {
    const w = 1 - u - v;
    return [
        a[0] * w + b[0] * u + c[0] * v,
        a[1] * w + b[1] * u + c[1] * v,
    ];
}

/** Sample RGBA pixel data at (u, v) with bilinear interpolation. */
function sampleTexture(pixels, w, h, u, v) {
    // Wrap UVs
    u = u - Math.floor(u);
    v = v - Math.floor(v);

    const fx = u * (w - 1);
    const fy = v * (h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const dx = fx - x0;
    const dy = fy - y0;

    const idx = (px, py) => (py * w + px) * 4;
    const i00 = idx(x0, y0);
    const i10 = idx(x1, y0);
    const i01 = idx(x0, y1);
    const i11 = idx(x1, y1);

    const r = (pixels[i00] * (1-dx)*(1-dy) + pixels[i10] * dx*(1-dy) +
               pixels[i01] * (1-dx)*dy + pixels[i11] * dx*dy) / 255;
    const g = (pixels[i00+1] * (1-dx)*(1-dy) + pixels[i10+1] * dx*(1-dy) +
               pixels[i01+1] * (1-dx)*dy + pixels[i11+1] * dx*dy) / 255;
    const b = (pixels[i00+2] * (1-dx)*(1-dy) + pixels[i10+2] * dx*(1-dy) +
               pixels[i01+2] * (1-dx)*dy + pixels[i11+2] * dx*dy) / 255;
    const a = (pixels[i00+3] * (1-dx)*(1-dy) + pixels[i10+3] * dx*(1-dy) +
               pixels[i01+3] * (1-dx)*dy + pixels[i11+3] * dx*dy) / 255;

    return [r, g, b, a];
}

/** Normalize a vec3 in place, returns the same array. */
function normalize3(v) {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if (len > 1e-8) { v[0] /= len; v[1] /= len; v[2] /= len; }
    return v;
}

/** Cross product of two vec3. */
function cross3(a, b) {
    return [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    ];
}

/** Convert a direction vector to a quaternion representing rotation from +Z. */
function dirToQuaternion(dir) {
    const d = normalize3([...dir]);
    const up = [0, 0, 1];

    // If direction is nearly parallel to Z, use a different reference
    const dot = d[0]*up[0] + d[1]*up[1] + d[2]*up[2];
    let ref = up;
    if (Math.abs(dot) > 0.999) {
        ref = [0, 1, 0];
    }

    const axis = normalize3(cross3(ref, d));
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    const ha = angle * 0.5;
    const sinHa = Math.sin(ha);
    return [
        Math.cos(ha),          // w
        axis[0] * sinHa,       // x
        axis[1] * sinHa,       // y
        axis[2] * sinHa,       // z
    ];
}

/* ------------------------------------------------------------------ */
/*  Converter class                                                    */
/* ------------------------------------------------------------------ */

export class TextureToSplatConverter {
    constructor() {
        // Configuration
        this.samplesPerTriangle = 8;      // base samples per triangle
        this.edgeBoostFactor = 4;         // extra samples at high-detail edges
        this.edgeThreshold = 0.10;        // Sobel threshold for edge detection
        this.baseScale = 0.04;            // base splat scale
        this.jitter = 0.3;               // positional noise in barycentric space
        this.alphaThreshold = 0.1;        // skip near-transparent samples
        this.normalInfluence = 0.8;       // how much normal map affects orientation
        this.specularToDepth = 2.0;       // specular brightness → depth/bloom
    }

    /**
     * Convert mesh + texture data into Gaussian seeds.
     *
     * @param {object} params
     * @param {Float32Array} params.positions     Flat xyz (3 floats/vertex)
     * @param {Float32Array} params.normals       Flat xyz (3 floats/vertex)
     * @param {Float32Array} params.uvs           Flat uv  (2 floats/vertex)
     * @param {Uint16Array|Uint32Array} params.indices   Triangle indices
     * @param {Uint8ClampedArray} params.diffusePixels   RGBA diffuse texture
     * @param {number} params.diffuseWidth
     * @param {number} params.diffuseHeight
     * @param {Uint8ClampedArray} [params.normalPixels]  RGBA normal map (tangent space)
     * @param {number} [params.normalWidth]
     * @param {number} [params.normalHeight]
     * @param {Uint8ClampedArray} [params.specularPixels] RGBA specular/roughness
     * @param {number} [params.specularWidth]
     * @param {number} [params.specularHeight]
     * @returns {Object[]}  Array of GaussianSeed objects
     */
    convert({
        positions, normals, uvs, indices,
        diffusePixels, diffuseWidth, diffuseHeight,
        normalPixels = null, normalWidth = 0, normalHeight = 0,
        specularPixels = null, specularWidth = 0, specularHeight = 0,
    }) {
        // Pre-compute luminance buffer for edge detection on the diffuse map
        const lumBuf = new Float32Array(diffuseWidth * diffuseHeight);
        for (let i = 0; i < diffuseWidth * diffuseHeight; i++) {
            lumBuf[i] = luminance(
                diffusePixels[i * 4] / 255,
                diffusePixels[i * 4 + 1] / 255,
                diffusePixels[i * 4 + 2] / 255
            );
        }

        // Pre-compute edge map (Sobel gradient magnitude at each texel)
        const edgeMap = new Float32Array(diffuseWidth * diffuseHeight);
        for (let y = 0; y < diffuseHeight; y++) {
            for (let x = 0; x < diffuseWidth; x++) {
                edgeMap[y * diffuseWidth + x] = sobelMag(lumBuf, diffuseWidth, diffuseHeight, x, y);
            }
        }

        const seeds = [];
        const triCount = indices.length / 3;

        for (let t = 0; t < triCount; t++) {
            const i0 = indices[t * 3];
            const i1 = indices[t * 3 + 1];
            const i2 = indices[t * 3 + 2];

            // Extract vertex data
            const p0 = [positions[i0*3], positions[i0*3+1], positions[i0*3+2]];
            const p1 = [positions[i1*3], positions[i1*3+1], positions[i1*3+2]];
            const p2 = [positions[i2*3], positions[i2*3+1], positions[i2*3+2]];

            const n0 = [normals[i0*3], normals[i0*3+1], normals[i0*3+2]];
            const n1 = [normals[i1*3], normals[i1*3+1], normals[i1*3+2]];
            const n2 = [normals[i2*3], normals[i2*3+1], normals[i2*3+2]];

            const uv0 = [uvs[i0*2], uvs[i0*2+1]];
            const uv1 = [uvs[i1*2], uvs[i1*2+1]];
            const uv2 = [uvs[i2*2], uvs[i2*2+1]];

            // Triangle area → scale sample count proportionally
            const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
            const e2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
            const cx = cross3(e1, e2);
            const triArea = 0.5 * Math.sqrt(cx[0]*cx[0] + cx[1]*cx[1] + cx[2]*cx[2]);
            const areaSamples = Math.max(1, Math.round(this.samplesPerTriangle * Math.sqrt(triArea)));

            // Centre UV for edge density estimation
            const centreUV = baryLerp2(uv0, uv1, uv2, 1/3, 1/3);
            const txU = Math.min(diffuseWidth - 1, Math.max(0, Math.floor(centreUV[0] * diffuseWidth)));
            const txV = Math.min(diffuseHeight - 1, Math.max(0, Math.floor(centreUV[1] * diffuseHeight)));
            const edgeStrength = edgeMap[txV * diffuseWidth + txU];
            const extraSamples = edgeStrength > this.edgeThreshold
                ? Math.round(this.edgeBoostFactor * (edgeStrength / 1.0))
                : 0;

            const totalSamples = areaSamples + extraSamples;

            for (let s = 0; s < totalSamples; s++) {
                // Random barycentric coordinates (uniform in triangle)
                let bu = Math.random();
                let bv = Math.random();
                if (bu + bv > 1) { bu = 1 - bu; bv = 1 - bv; }

                // Add jitter
                bu += (Math.random() - 0.5) * this.jitter * 0.1;
                bv += (Math.random() - 0.5) * this.jitter * 0.1;
                bu = Math.max(0, Math.min(1, bu));
                bv = Math.max(0, Math.min(1 - bu, bv));

                // Interpolate position, normal, UV
                const pos = baryLerp3(p0, p1, p2, bu, bv);
                const nrm = normalize3(baryLerp3(n0, n1, n2, bu, bv));
                const uv  = baryLerp2(uv0, uv1, uv2, bu, bv);

                // Sample diffuse texture
                const [dr, dg, db, da] = sampleTexture(
                    diffusePixels, diffuseWidth, diffuseHeight, uv[0], uv[1]
                );
                if (da < this.alphaThreshold) continue;

                // Orientation from surface normal (+ optional normal map)
                let finalNormal = [...nrm];
                if (normalPixels) {
                    const [nr, ng, nb] = sampleTexture(
                        normalPixels, normalWidth, normalHeight, uv[0], uv[1]
                    );
                    // Tangent-space normal → world blend
                    const tnx = nr * 2.0 - 1.0;
                    const tny = ng * 2.0 - 1.0;
                    const tnz = nb * 2.0 - 1.0;
                    finalNormal[0] += tnx * this.normalInfluence;
                    finalNormal[1] += tny * this.normalInfluence;
                    finalNormal[2] += tnz * this.normalInfluence;
                    normalize3(finalNormal);
                }

                const orientation = dirToQuaternion(finalNormal);

                // Specular → depth/bloom
                let depth = 0;
                if (specularPixels) {
                    const [sr, sg, sb] = sampleTexture(
                        specularPixels, specularWidth, specularHeight, uv[0], uv[1]
                    );
                    depth = luminance(sr, sg, sb) * this.specularToDepth;
                }

                // Scale — smaller at edges for more detail, larger in flat areas
                const lum = luminance(dr, dg, db);
                const edgeAtSample = sobelMag(
                    lumBuf, diffuseWidth, diffuseHeight,
                    Math.floor(uv[0] * diffuseWidth) % diffuseWidth,
                    Math.floor(uv[1] * diffuseHeight) % diffuseHeight
                );
                const edgeScale = 1.0 - Math.min(1.0, edgeAtSample * 2.0);
                const scale = this.baseScale * (0.5 + lum * 0.5) * (0.4 + edgeScale * 0.6);

                // Offset position slightly along normal to prevent z-fighting
                const offset = scale * 0.1;
                seeds.push({
                    position: [
                        pos[0] + finalNormal[0] * offset,
                        pos[1] + finalNormal[1] * offset,
                        pos[2] + finalNormal[2] * offset,
                    ],
                    orientation,
                    scale,
                    color: [dr, dg, db],
                    depth,
                });
            }
        }

        return seeds;
    }

    /**
     * Convenience: convert from HTMLImageElement + mesh data.
     *
     * @param {object} params
     * @param {Float32Array} params.positions
     * @param {Float32Array} params.normals
     * @param {Float32Array} params.uvs
     * @param {Uint16Array|Uint32Array} params.indices
     * @param {HTMLImageElement|HTMLCanvasElement} params.diffuseImage
     * @param {HTMLImageElement|HTMLCanvasElement} [params.normalImage]
     * @param {HTMLImageElement|HTMLCanvasElement} [params.specularImage]
     * @returns {Object[]}
     */
    convertFromImages({ positions, normals, uvs, indices, diffuseImage, normalImage, specularImage }) {
        const extract = (img) => {
            if (!img) return null;
            const c = document.createElement('canvas');
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            return { pixels: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
        };

        const diffuse = extract(diffuseImage);
        const normal = extract(normalImage);
        const specular = extract(specularImage);

        return this.convert({
            positions, normals, uvs, indices,
            diffusePixels: diffuse.pixels,
            diffuseWidth: diffuse.width,
            diffuseHeight: diffuse.height,
            ...(normal ? {
                normalPixels: normal.pixels,
                normalWidth: normal.width,
                normalHeight: normal.height,
            } : {}),
            ...(specular ? {
                specularPixels: specular.pixels,
                specularWidth: specular.width,
                specularHeight: specular.height,
            } : {}),
        });
    }

    /**
     * Convert a flat 2D texture into splats (no mesh required).
     * Extends ImageSplatGenerator with orientation and specular support.
     *
     * @param {Uint8ClampedArray} pixels  RGBA
     * @param {number} width
     * @param {number} height
     * @param {object} [opts]
     * @returns {Object[]}
     */
    convertFlat(pixels, width, height, opts = {}) {
        const gridStep = opts.gridStep || 3;
        const scale = opts.scale || this.baseScale;
        const depthFromLum = opts.depthFromLum || 1.0;

        const lumBuf = new Float32Array(width * height);
        for (let i = 0; i < width * height; i++) {
            lumBuf[i] = luminance(pixels[i*4]/255, pixels[i*4+1]/255, pixels[i*4+2]/255);
        }

        const aspect = width / height;
        const seeds = [];

        for (let py = 0; py < height; py += gridStep) {
            for (let px = 0; px < width; px += gridStep) {
                const idx = (py * width + px) * 4;
                if (pixels[idx + 3] / 255 < this.alphaThreshold) continue;

                const r = pixels[idx] / 255;
                const g = pixels[idx+1] / 255;
                const b = pixels[idx+2] / 255;
                const lum = luminance(r, g, b);
                const edge = sobelMag(lumBuf, width, height, px, py);

                const count = 1 + (edge > this.edgeThreshold ? this.edgeBoostFactor : 0);
                const baseZ = (1 - lum) * depthFromLum;

                const worldX = (px / width - 0.5) * 2 * aspect;
                const worldY = -(py / height - 0.5) * 2;

                for (let s = 0; s < count; s++) {
                    const jx = (Math.random() - 0.5) * this.jitter * (gridStep / width) * 2 * aspect;
                    const jy = (Math.random() - 0.5) * this.jitter * (gridStep / height) * 2;

                    seeds.push({
                        position: [worldX + jx, worldY + jy, baseZ + (Math.random()-0.5)*0.05],
                        orientation: [1, 0, 0, 0],
                        scale: scale * (0.5 + lum * 0.5) * (1.0 - Math.min(1, edge) * 0.5),
                        color: [r, g, b],
                        depth: baseZ * 0.3,
                    });
                }
            }
        }

        return seeds;
    }
}

export default TextureToSplatConverter;
