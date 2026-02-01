/**
 * PBRSplatConverter
 *
 * Extends the TextureToSplatConverter concept to full PBR material
 * decomposition. Converts physically-based material maps into Gaussian
 * splat distributions with material-aware properties.
 *
 * PBR Material Map Decomposition:
 *   - Roughness   -> Splat scale (rough = larger/diffuse, smooth = tight/sharp)
 *   - Metallic    -> Splat blend mode (metallic = screen-blend reflective)
 *   - AO          -> Splat density modulation (occluded = fewer, darker)
 *   - Emissive    -> Inscription color override + additive splats
 *   - Normal Map  -> Splat orientation quaternion
 *   - Diffuse/Albedo -> Splat base color
 *
 * Sampling strategy:
 *   1. Surface-aware barycentric sampling across mesh triangles
 *   2. Sobel edge detection concentrates splats at detail regions
 *   3. Material properties modulate per-splat parameters
 */

export class PBRSplatConverter {
    /**
     * @param {object} [opts]
     */
    constructor({
        baseDensity = 10000,       // Base number of splats to generate
        edgeDensityMultiplier = 3, // Extra splat concentration at edges
        minSplatScale = 0.005,
        maxSplatScale = 0.05,
        useNormalOrientation = true,
    } = {}) {
        this.baseDensity = baseDensity;
        this.edgeDensityMultiplier = edgeDensityMultiplier;
        this.minSplatScale = minSplatScale;
        this.maxSplatScale = maxSplatScale;
        this.useNormalOrientation = useNormalOrientation;
    }

    /**
     * Convert a PBR-textured mesh into a Gaussian splat seed array.
     *
     * @param {object} params
     * @param {Float32Array}  params.positions     Flat xyz (3/vertex)
     * @param {Float32Array}  params.normals       Flat xyz (3/vertex)
     * @param {Float32Array}  params.uvs           Flat uv (2/vertex)
     * @param {Uint16Array|Uint32Array} params.indices
     *
     * PBR texture maps (RGBA pixel arrays):
     * @param {Uint8Array}    params.albedoPixels     Diffuse/albedo (required)
     * @param {number}        params.albedoWidth
     * @param {number}        params.albedoHeight
     * @param {Uint8Array}    [params.normalPixels]   Tangent-space normal map
     * @param {number}        [params.normalWidth]
     * @param {number}        [params.normalHeight]
     * @param {Uint8Array}    [params.roughnessPixels] Roughness (R channel)
     * @param {number}        [params.roughnessWidth]
     * @param {number}        [params.roughnessHeight]
     * @param {Uint8Array}    [params.metallicPixels]  Metallic (R channel)
     * @param {number}        [params.metallicWidth]
     * @param {number}        [params.metallicHeight]
     * @param {Uint8Array}    [params.aoPixels]        Ambient Occlusion (R channel)
     * @param {number}        [params.aoWidth]
     * @param {number}        [params.aoHeight]
     * @param {Uint8Array}    [params.emissivePixels]  Emissive (RGB)
     * @param {number}        [params.emissiveWidth]
     * @param {number}        [params.emissiveHeight]
     *
     * @returns {object[]} Array of splat seed objects
     */
    convert({
        positions, normals, uvs, indices,
        albedoPixels, albedoWidth, albedoHeight,
        normalPixels, normalWidth, normalHeight,
        roughnessPixels, roughnessWidth, roughnessHeight,
        metallicPixels, metallicWidth, metallicHeight,
        aoPixels, aoWidth, aoHeight,
        emissivePixels, emissiveWidth, emissiveHeight,
    }) {
        if (!positions || !normals || !uvs || !indices) {
            throw new Error('PBRSplatConverter: positions, normals, uvs, and indices are required');
        }
        if (!albedoPixels) {
            throw new Error('PBRSplatConverter: albedoPixels is required');
        }

        // Compute per-triangle areas for importance sampling
        const triCount = indices.length / 3;
        const triAreas = new Float32Array(triCount);
        let totalArea = 0;

        for (let t = 0; t < triCount; t++) {
            const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
            const ax = positions[i1*3] - positions[i0*3];
            const ay = positions[i1*3+1] - positions[i0*3+1];
            const az = positions[i1*3+2] - positions[i0*3+2];
            const bx = positions[i2*3] - positions[i0*3];
            const by = positions[i2*3+1] - positions[i0*3+1];
            const bz = positions[i2*3+2] - positions[i0*3+2];
            // Cross product magnitude = 2 * triangle area
            const cx = ay*bz - az*by;
            const cy = az*bx - ax*bz;
            const cz = ax*by - ay*bx;
            const area = Math.sqrt(cx*cx + cy*cy + cz*cz) * 0.5;
            triAreas[t] = area;
            totalArea += area;
        }

        // Build CDF for area-weighted random triangle selection
        const cdf = new Float32Array(triCount);
        let cumulative = 0;
        for (let t = 0; t < triCount; t++) {
            cumulative += triAreas[t] / totalArea;
            cdf[t] = cumulative;
        }

        // Compute edge map on albedo for detail concentration
        const edgeMap = this._computeEdgeMap(albedoPixels, albedoWidth, albedoHeight);

        const seeds = [];
        const splatCount = this.baseDensity;

        for (let s = 0; s < splatCount; s++) {
            // Pick random triangle weighted by area
            const r = Math.random();
            let tri = 0;
            for (let t = 0; t < triCount; t++) {
                if (r <= cdf[t]) { tri = t; break; }
            }

            // Random barycentric coordinates
            let u1 = Math.random(), u2 = Math.random();
            if (u1 + u2 > 1) { u1 = 1 - u1; u2 = 1 - u2; }
            const w0 = 1 - u1 - u2, w1 = u1, w2 = u2;

            const i0 = indices[tri*3], i1 = indices[tri*3+1], i2 = indices[tri*3+2];

            // Interpolate position
            const px = positions[i0*3]*w0 + positions[i1*3]*w1 + positions[i2*3]*w2;
            const py = positions[i0*3+1]*w0 + positions[i1*3+1]*w1 + positions[i2*3+1]*w2;
            const pz = positions[i0*3+2]*w0 + positions[i1*3+2]*w1 + positions[i2*3+2]*w2;

            // Interpolate normal
            let nx = normals[i0*3]*w0 + normals[i1*3]*w1 + normals[i2*3]*w2;
            let ny = normals[i0*3+1]*w0 + normals[i1*3+1]*w1 + normals[i2*3+1]*w2;
            let nz = normals[i0*3+2]*w0 + normals[i1*3+2]*w1 + normals[i2*3+2]*w2;
            const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
            nx /= nLen; ny /= nLen; nz /= nLen;

            // Interpolate UV
            const su = uvs[i0*2]*w0 + uvs[i1*2]*w1 + uvs[i2*2]*w2;
            const sv = uvs[i0*2+1]*w0 + uvs[i1*2+1]*w1 + uvs[i2*2+1]*w2;

            // Sample PBR maps at interpolated UV
            const albedo = this._sampleTexture(albedoPixels, albedoWidth, albedoHeight, su, sv);
            const roughness = roughnessPixels
                ? this._sampleChannel(roughnessPixels, roughnessWidth, roughnessHeight, su, sv, 0)
                : 0.5;
            const metallic = metallicPixels
                ? this._sampleChannel(metallicPixels, metallicWidth, metallicHeight, su, sv, 0)
                : 0.0;
            const ao = aoPixels
                ? this._sampleChannel(aoPixels, aoWidth, aoHeight, su, sv, 0)
                : 1.0;
            const emissive = emissivePixels
                ? this._sampleTexture(emissivePixels, emissiveWidth, emissiveHeight, su, sv)
                : [0, 0, 0, 0];

            // Edge strength at this UV (for density concentration)
            const edgeX = Math.floor(su * albedoWidth) % albedoWidth;
            const edgeY = Math.floor(sv * albedoHeight) % albedoHeight;
            const edgeStrength = edgeMap[edgeY * albedoWidth + edgeX] || 0;

            // Skip low-density regions (AO-based culling)
            if (ao < 0.1 && Math.random() > ao * 10) continue;

            // PBR -> Splat property mapping

            // Scale: roughness drives splat size
            //   rough = large, fuzzy splats; smooth = small, sharp splats
            const scale = this.minSplatScale + roughness * (this.maxSplatScale - this.minSplatScale);

            // Orientation from normal (normal -> quaternion)
            const quat = this._normalToQuaternion(nx, ny, nz);

            // Apply normal map perturbation if available
            if (normalPixels && this.useNormalOrientation) {
                const tn = this._sampleTexture(normalPixels, normalWidth, normalHeight, su, sv);
                const tnx = tn[0] * 2 - 1;
                const tny = tn[1] * 2 - 1;
                const tnz = tn[2] * 2 - 1;
                // Perturb quaternion slightly by tangent-space normal
                const perturbStrength = 0.2;
                quat[1] += tnx * perturbStrength;
                quat[2] += tny * perturbStrength;
                quat[3] += tnz * perturbStrength;
                // Re-normalize quaternion
                const ql = Math.sqrt(quat[0]*quat[0]+quat[1]*quat[1]+quat[2]*quat[2]+quat[3]*quat[3])||1;
                quat[0]/=ql; quat[1]/=ql; quat[2]/=ql; quat[3]/=ql;
            }

            // Color: albedo * AO, with metallic influence on saturation
            let cr = albedo[0] * ao;
            let cg = albedo[1] * ao;
            let cb = albedo[2] * ao;

            // Metallic surfaces: desaturate and brighten (reflective)
            if (metallic > 0.5) {
                const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
                const metallicBlend = (metallic - 0.5) * 2;
                cr = cr * (1 - metallicBlend * 0.5) + lum * metallicBlend * 0.5 + metallicBlend * 0.1;
                cg = cg * (1 - metallicBlend * 0.5) + lum * metallicBlend * 0.5 + metallicBlend * 0.1;
                cb = cb * (1 - metallicBlend * 0.5) + lum * metallicBlend * 0.5 + metallicBlend * 0.1;
            }

            // Blend mode based on metallic
            const blendMode = metallic > 0.7 ? 'screen' : metallic > 0.3 ? 'additive' : 'alpha';

            // Emissive contribution
            const emissiveStrength = (emissive[0] + emissive[1] + emissive[2]) / 3;
            const isEmissive = emissiveStrength > 0.1;

            seeds.push({
                position: [px, py, pz],
                normal: [nx, ny, nz],
                scale,
                orientation: quat,
                color: [
                    Math.min(1, cr + emissive[0]),
                    Math.min(1, cg + emissive[1]),
                    Math.min(1, cb + emissive[2]),
                ],
                opacity: Math.min(1, ao * (0.8 + roughness * 0.2)),
                blendMode,
                isEmissive,
                emissiveColor: isEmissive ? [emissive[0], emissive[1], emissive[2]] : null,
                metallic,
                roughness,
                edgeStrength,
                depth: 0,
            });
        }

        // Extra splats at edges (detail concentration)
        const edgeSplats = Math.floor(splatCount * 0.3);
        for (let s = 0; s < edgeSplats; s++) {
            // Sample a random UV position with high edge strength
            const attempts = 10;
            let bestEdge = 0, bestU = 0, bestV = 0;
            for (let a = 0; a < attempts; a++) {
                const tu = Math.random();
                const tv = Math.random();
                const ex = Math.floor(tu * albedoWidth) % albedoWidth;
                const ey = Math.floor(tv * albedoHeight) % albedoHeight;
                const e = edgeMap[ey * albedoWidth + ex] || 0;
                if (e > bestEdge) {
                    bestEdge = e;
                    bestU = tu;
                    bestV = tv;
                }
            }

            if (bestEdge < 0.1) continue;

            // Find closest triangle to this UV
            let bestTri = 0, bestDist = Infinity;
            for (let t = 0; t < Math.min(triCount, 1000); t++) {
                const i0 = indices[t*3];
                const du = uvs[i0*2] - bestU;
                const dv = uvs[i0*2+1] - bestV;
                const d = du*du + dv*dv;
                if (d < bestDist) { bestDist = d; bestTri = t; }
            }

            const i0 = indices[bestTri*3], i1 = indices[bestTri*3+1], i2 = indices[bestTri*3+2];
            const px = (positions[i0*3] + positions[i1*3] + positions[i2*3]) / 3;
            const py = (positions[i0*3+1] + positions[i1*3+1] + positions[i2*3+1]) / 3;
            const pz = (positions[i0*3+2] + positions[i1*3+2] + positions[i2*3+2]) / 3;

            const albedo = this._sampleTexture(albedoPixels, albedoWidth, albedoHeight, bestU, bestV);

            seeds.push({
                position: [px, py, pz],
                normal: [0, 1, 0],
                scale: this.minSplatScale * 0.5,  // Small detail splats
                orientation: [1, 0, 0, 0],
                color: [albedo[0], albedo[1], albedo[2]],
                opacity: bestEdge * 0.8,
                blendMode: 'alpha',
                isEmissive: false,
                emissiveColor: null,
                metallic: 0,
                roughness: 0.5,
                edgeStrength: bestEdge,
                depth: 0,
            });
        }

        return seeds;
    }

    /* -------------------------------------------------------------- */
    /*  Edge detection (Sobel on luminance)                            */
    /* -------------------------------------------------------------- */

    _computeEdgeMap(pixels, w, h) {
        const lum = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
            lum[i] = (pixels[i*4] * 0.299 + pixels[i*4+1] * 0.587 + pixels[i*4+2] * 0.114) / 255;
        }

        const edges = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const gx = -lum[(y-1)*w+x-1] + lum[(y-1)*w+x+1]
                          -2*lum[y*w+x-1] + 2*lum[y*w+x+1]
                          -lum[(y+1)*w+x-1] + lum[(y+1)*w+x+1];
                const gy = -lum[(y-1)*w+x-1] - 2*lum[(y-1)*w+x] - lum[(y-1)*w+x+1]
                          +lum[(y+1)*w+x-1] + 2*lum[(y+1)*w+x] + lum[(y+1)*w+x+1];
                edges[idx] = Math.min(1, Math.sqrt(gx*gx + gy*gy) * 4);
            }
        }
        return edges;
    }

    /* -------------------------------------------------------------- */
    /*  Texture sampling helpers                                       */
    /* -------------------------------------------------------------- */

    _sampleTexture(pixels, w, h, u, v) {
        const x = Math.floor(((u % 1 + 1) % 1) * w) % w;
        const y = Math.floor(((v % 1 + 1) % 1) * h) % h;
        const i = (y * w + x) * 4;
        return [pixels[i]/255, pixels[i+1]/255, pixels[i+2]/255, pixels[i+3]/255];
    }

    _sampleChannel(pixels, w, h, u, v, channel) {
        const x = Math.floor(((u % 1 + 1) % 1) * w) % w;
        const y = Math.floor(((v % 1 + 1) % 1) * h) % h;
        return pixels[(y * w + x) * 4 + channel] / 255;
    }

    _normalToQuaternion(nx, ny, nz) {
        // Convert normal direction to quaternion (rotation from +Y to normal)
        const up = [0, 1, 0];
        const dot = ny; // dot(up, normal)

        if (dot > 0.9999) return [1, 0, 0, 0];
        if (dot < -0.9999) return [0, 0, 0, 1]; // 180 flip

        const cx = up[1]*nz - up[2]*ny;
        const cy = up[2]*nx - up[0]*nz;
        const cz = up[0]*ny - up[1]*nx;
        const s = Math.sqrt((1 + dot) * 2);
        const invS = 1 / s;

        return [s * 0.5, cx * invS, cy * invS, cz * invS];
    }

    /**
     * Generate a simple material-colored procedural texture for testing.
     * @param {number} w
     * @param {number} h
     * @param {string} type  'checker', 'gradient', 'noise'
     * @returns {Uint8Array} RGBA pixels
     */
    static generateTestTexture(w, h, type = 'checker') {
        const pixels = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (type === 'checker') {
                    const check = ((Math.floor(x/16) + Math.floor(y/16)) % 2) === 0;
                    pixels[i] = check ? 200 : 50;
                    pixels[i+1] = check ? 200 : 80;
                    pixels[i+2] = check ? 200 : 120;
                } else if (type === 'gradient') {
                    pixels[i] = Math.floor(x / w * 255);
                    pixels[i+1] = Math.floor(y / h * 255);
                    pixels[i+2] = 128;
                } else {
                    const n = Math.random();
                    pixels[i] = Math.floor(n * 255);
                    pixels[i+1] = Math.floor(n * 200 + 55);
                    pixels[i+2] = Math.floor(n * 150 + 105);
                }
                pixels[i+3] = 255;
            }
        }
        return pixels;
    }
}

export default PBRSplatConverter;
