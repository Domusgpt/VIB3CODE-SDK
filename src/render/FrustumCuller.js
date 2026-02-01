/**
 * FrustumCuller - Frustum Culling + LOD System
 * VIB3+ Hybrid Render Pipeline v2
 *
 * AABB frustum test (6-plane extraction from VP matrix).
 * 2-level LOD: full mesh when close, simplified when far.
 * Inscription layer count scales with LOD level.
 */

export class FrustumCuller {
    constructor() {
        // 6 frustum planes: [nx, ny, nz, d] each
        this.planes = new Float32Array(24); // 6 * 4
    }

    /**
     * Extract frustum planes from view-projection matrix
     * @param {Float32Array} vp - 4x4 view-projection matrix (column-major)
     */
    extractPlanes(vp) {
        const p = this.planes;

        // Left: row3 + row0
        p[0] = vp[3] + vp[0]; p[1] = vp[7] + vp[4]; p[2] = vp[11] + vp[8]; p[3] = vp[15] + vp[12];
        // Right: row3 - row0
        p[4] = vp[3] - vp[0]; p[5] = vp[7] - vp[4]; p[6] = vp[11] - vp[8]; p[7] = vp[15] - vp[12];
        // Bottom: row3 + row1
        p[8] = vp[3] + vp[1]; p[9] = vp[7] + vp[5]; p[10] = vp[11] + vp[9]; p[11] = vp[15] + vp[13];
        // Top: row3 - row1
        p[12] = vp[3] - vp[1]; p[13] = vp[7] - vp[5]; p[14] = vp[11] - vp[9]; p[15] = vp[15] - vp[13];
        // Near: row3 + row2
        p[16] = vp[3] + vp[2]; p[17] = vp[7] + vp[6]; p[18] = vp[11] + vp[10]; p[19] = vp[15] + vp[14];
        // Far: row3 - row2
        p[20] = vp[3] - vp[2]; p[21] = vp[7] - vp[6]; p[22] = vp[11] - vp[10]; p[23] = vp[15] - vp[14];

        // Normalize each plane
        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            const len = Math.sqrt(p[o] * p[o] + p[o + 1] * p[o + 1] + p[o + 2] * p[o + 2]) || 1;
            p[o] /= len; p[o + 1] /= len; p[o + 2] /= len; p[o + 3] /= len;
        }
    }

    /**
     * Test AABB against frustum
     * @param {object} aabb - { min: [x,y,z], max: [x,y,z] }
     * @returns {number} 0=outside, 1=intersect, 2=inside
     */
    testAABB(aabb) {
        const p = this.planes;
        let result = 2; // Assume inside

        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            const nx = p[o], ny = p[o + 1], nz = p[o + 2], d = p[o + 3];

            // Positive vertex (furthest along plane normal)
            const px = nx > 0 ? aabb.max[0] : aabb.min[0];
            const py = ny > 0 ? aabb.max[1] : aabb.min[1];
            const pz = nz > 0 ? aabb.max[2] : aabb.min[2];

            // Negative vertex (closest to plane normal)
            const qx = nx > 0 ? aabb.min[0] : aabb.max[0];
            const qy = ny > 0 ? aabb.min[1] : aabb.max[1];
            const qz = nz > 0 ? aabb.min[2] : aabb.max[2];

            // If positive vertex is behind plane → fully outside
            if (nx * px + ny * py + nz * pz + d < 0) return 0;

            // If negative vertex is behind plane → partially inside (intersecting)
            if (nx * qx + ny * qy + nz * qz + d < 0) result = 1;
        }

        return result;
    }

    /**
     * Test sphere against frustum
     * @param {number[]} center - [x, y, z]
     * @param {number} radius
     * @returns {number} 0=outside, 1=intersect, 2=inside
     */
    testSphere(center, radius) {
        const p = this.planes;
        let result = 2;

        for (let i = 0; i < 6; i++) {
            const o = i * 4;
            const dist = p[o] * center[0] + p[o + 1] * center[1] + p[o + 2] * center[2] + p[o + 3];
            if (dist < -radius) return 0;
            if (dist < radius) result = 1;
        }

        return result;
    }

    /**
     * Cull an array of scene objects
     * @param {Array} objects - Array of objects with aabb property
     * @param {Float32Array} vpMatrix - View-projection matrix
     * @returns {Array} Visible objects
     */
    cull(objects, vpMatrix) {
        this.extractPlanes(vpMatrix);
        return objects.filter(obj => {
            if (!obj.aabb) return true; // No AABB = always visible
            return this.testAABB(obj.aabb) > 0;
        });
    }
}

/**
 * LODManager - Level of Detail system
 */
export class LODManager {
    /**
     * @param {object} [opts]
     * @param {number[]} [opts.distances=[10, 30, 60]] - LOD switch distances
     * @param {number[]} [opts.inscriptionLayers=[16, 4, 2, 1]] - Inscription layers per LOD level
     * @param {number[]} [opts.vertexReduction=[1.0, 0.5, 0.25, 0.1]] - Vertex reduction factors
     */
    constructor(opts = {}) {
        this.distances = opts.distances ?? [10, 30, 60];
        this.inscriptionLayers = opts.inscriptionLayers ?? [16, 4, 2, 1];
        this.vertexReduction = opts.vertexReduction ?? [1.0, 0.5, 0.25, 0.1];

        // LOD mesh cache: objectName → [lod0, lod1, lod2, ...]
        this._lodCache = new Map();
    }

    /**
     * Determine LOD level based on distance to camera
     * @param {number} distance - World-space distance from camera
     * @returns {number} LOD level (0=highest detail, N=lowest)
     */
    getLODLevel(distance) {
        for (let i = 0; i < this.distances.length; i++) {
            if (distance < this.distances[i]) return i;
        }
        return this.distances.length;
    }

    /**
     * Get recommended inscription layer count for LOD level
     * @param {number} lodLevel
     * @returns {number}
     */
    getInscriptionLayerCount(lodLevel) {
        return this.inscriptionLayers[Math.min(lodLevel, this.inscriptionLayers.length - 1)];
    }

    /**
     * Compute distance from camera to object
     * @param {Float32Array} cameraPos - [x, y, z]
     * @param {object} aabb - { min: [x,y,z], max: [x,y,z] }
     * @returns {number}
     */
    computeDistance(cameraPos, aabb) {
        // Distance to AABB center
        const cx = (aabb.min[0] + aabb.max[0]) * 0.5;
        const cy = (aabb.min[1] + aabb.max[1]) * 0.5;
        const cz = (aabb.min[2] + aabb.max[2]) * 0.5;
        const dx = cameraPos[0] - cx;
        const dy = cameraPos[1] - cy;
        const dz = cameraPos[2] - cz;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Generate simplified LOD mesh via edge collapse
     * @param {Float32Array} positions - Original positions
     * @param {Float32Array} normals - Original normals
     * @param {Uint32Array} indices - Original indices
     * @param {number} targetRatio - Target vertex ratio (0.5 = half vertices)
     * @returns {{positions: Float32Array, normals: Float32Array, indices: Uint32Array}}
     */
    simplifyMesh(positions, normals, indices, targetRatio) {
        if (targetRatio >= 1.0) return { positions, normals, indices };

        const vertexCount = positions.length / 3;
        const targetCount = Math.max(3, Math.floor(vertexCount * targetRatio));

        // Quadric error metric simplified mesh decimation
        // For each triangle, compute face quadric
        const triCount = indices.length / 3;
        const quadrics = new Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            quadrics[i] = new Float64Array(10); // Symmetric 4x4 → 10 unique elements
        }

        // Compute per-face quadrics and accumulate to vertices
        for (let t = 0; t < triCount; t++) {
            const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
            const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3;

            // Face normal
            const ax = positions[p1] - positions[p0], ay = positions[p1 + 1] - positions[p0 + 1], az = positions[p1 + 2] - positions[p0 + 2];
            const bx = positions[p2] - positions[p0], by = positions[p2 + 1] - positions[p0 + 1], bz = positions[p2 + 2] - positions[p0 + 2];
            let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;
            const d = -(nx * positions[p0] + ny * positions[p0 + 1] + nz * positions[p0 + 2]);

            // Plane quadric: Q = [a b c d]^T [a b c d] → 10 unique elements
            const q = [
                nx * nx, nx * ny, nx * nz, nx * d,
                ny * ny, ny * nz, ny * d,
                nz * nz, nz * d,
                d * d
            ];

            for (const vi of [i0, i1, i2]) {
                for (let j = 0; j < 10; j++) quadrics[vi][j] += q[j];
            }
        }

        // Build edge list and compute edge collapse costs
        const edges = new Map(); // "i0-i1" → { cost, targetPos }
        for (let t = 0; t < triCount; t++) {
            const verts = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
            for (let e = 0; e < 3; e++) {
                const v0 = Math.min(verts[e], verts[(e + 1) % 3]);
                const v1 = Math.max(verts[e], verts[(e + 1) % 3]);
                const key = `${v0}-${v1}`;
                if (!edges.has(key)) {
                    const cost = this._edgeCollapseCost(quadrics[v0], quadrics[v1], positions, v0, v1);
                    edges.set(key, { v0, v1, cost });
                }
            }
        }

        // Sort edges by cost
        const sortedEdges = Array.from(edges.values()).sort((a, b) => a.cost - b.cost);

        // Collapse edges (simplified greedy approach)
        const collapsed = new Map(); // vertex → replacement vertex
        const getRoot = (v) => {
            while (collapsed.has(v)) v = collapsed.get(v);
            return v;
        };

        let currentVertexCount = vertexCount;
        for (const edge of sortedEdges) {
            if (currentVertexCount <= targetCount) break;

            const v0 = getRoot(edge.v0);
            const v1 = getRoot(edge.v1);
            if (v0 === v1) continue;

            // Collapse v1 into v0 (midpoint position)
            const o0 = v0 * 3, o1 = v1 * 3;
            positions[o0] = (positions[o0] + positions[o1]) * 0.5;
            positions[o0 + 1] = (positions[o0 + 1] + positions[o1 + 1]) * 0.5;
            positions[o0 + 2] = (positions[o0 + 2] + positions[o1 + 2]) * 0.5;

            if (normals) {
                normals[o0] = (normals[o0] + normals[o1]) * 0.5;
                normals[o0 + 1] = (normals[o0 + 1] + normals[o1 + 1]) * 0.5;
                normals[o0 + 2] = (normals[o0 + 2] + normals[o1 + 2]) * 0.5;
                // Renormalize
                const nl = Math.sqrt(normals[o0] ** 2 + normals[o0 + 1] ** 2 + normals[o0 + 2] ** 2) || 1;
                normals[o0] /= nl; normals[o0 + 1] /= nl; normals[o0 + 2] /= nl;
            }

            collapsed.set(v1, v0);
            currentVertexCount--;
        }

        // Rebuild index buffer (remap collapsed vertices, remove degenerate triangles)
        const newIndices = [];
        for (let t = 0; t < triCount; t++) {
            const i0 = getRoot(indices[t * 3]);
            const i1 = getRoot(indices[t * 3 + 1]);
            const i2 = getRoot(indices[t * 3 + 2]);
            if (i0 !== i1 && i1 !== i2 && i0 !== i2) {
                newIndices.push(i0, i1, i2);
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: normals ? new Float32Array(normals) : null,
            indices: new Uint32Array(newIndices),
        };
    }

    /**
     * Register LOD meshes for an object
     * @param {string} name - Object name
     * @param {object} fullMesh - { positions, normals, indices }
     */
    registerLODs(name, fullMesh) {
        const lods = [fullMesh];

        for (let i = 1; i < this.vertexReduction.length; i++) {
            const simplified = this.simplifyMesh(
                new Float32Array(fullMesh.positions),
                fullMesh.normals ? new Float32Array(fullMesh.normals) : null,
                new Uint32Array(fullMesh.indices),
                this.vertexReduction[i]
            );
            lods.push(simplified);
        }

        this._lodCache.set(name, lods);
    }

    /**
     * Get LOD mesh for object at given level
     * @param {string} name
     * @param {number} level
     * @returns {object|null}
     */
    getLODMesh(name, level) {
        const lods = this._lodCache.get(name);
        if (!lods) return null;
        return lods[Math.min(level, lods.length - 1)];
    }

    /**
     * Apply culling and LOD to scene objects
     * @param {Array} objects - Scene objects with aabb
     * @param {Float32Array} vpMatrix - View-projection matrix
     * @param {Float32Array} cameraPos - Camera world position
     * @param {FrustumCuller} culler - Frustum culler instance
     * @returns {Array<{object, lodLevel, inscriptionLayers, distance}>}
     */
    processScene(objects, vpMatrix, cameraPos, culler) {
        culler.extractPlanes(vpMatrix);

        const results = [];
        for (const obj of objects) {
            if (obj.aabb && culler.testAABB(obj.aabb) === 0) continue; // Culled

            const distance = obj.aabb ? this.computeDistance(cameraPos, obj.aabb) : 0;
            const lodLevel = this.getLODLevel(distance);
            const inscriptionLayers = this.getInscriptionLayerCount(lodLevel);

            results.push({ object: obj, lodLevel, inscriptionLayers, distance });
        }

        return results;
    }

    // ─── Internal ────────────────────────────────────────────────────

    _edgeCollapseCost(q0, q1, positions, v0, v1) {
        // Sum quadrics
        const q = new Float64Array(10);
        for (let i = 0; i < 10; i++) q[i] = q0[i] + q1[i];

        // Evaluate at midpoint
        const o0 = v0 * 3, o1 = v1 * 3;
        const x = (positions[o0] + positions[o1]) * 0.5;
        const y = (positions[o0 + 1] + positions[o1 + 1]) * 0.5;
        const z = (positions[o0 + 2] + positions[o1 + 2]) * 0.5;

        // v^T Q v (symmetric matrix)
        return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
               q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
               q[7] * z * z + 2 * q[8] * z +
               q[9];
    }
}
