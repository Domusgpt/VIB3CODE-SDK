/**
 * ModelLoader - glTF 2.0 / OBJ Model Import
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Loads .glb/.gltf/.obj files and returns populated SceneRenderer
 * with automatic inscription routing and PBR splat generation.
 */

export class ModelLoader {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {boolean} [opts.generateSplats=false] - Auto-generate splats from PBR maps
     * @param {boolean} [opts.autoInscription=true] - Auto-assign inscription per mesh
     * @param {number} [opts.splatDensity=8000] - Splat density when generating
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.generateSplats = opts.generateSplats ?? false;
        this.autoInscription = opts.autoInscription ?? true;
        this.splatDensity = opts.splatDensity ?? 8000;
    }

    /**
     * Load a model from URL or ArrayBuffer
     * @param {string|ArrayBuffer} source - URL string or raw binary
     * @param {object} [opts] - Override per-load options
     * @returns {Promise<ModelData>}
     */
    async load(source, opts = {}) {
        let buffer;
        let format;

        if (source instanceof ArrayBuffer) {
            buffer = source;
            format = opts.format || this._detectFormat(new Uint8Array(buffer));
        } else if (typeof source === 'string') {
            const url = source;
            format = opts.format || this._detectFormatFromURL(url);

            if (format === 'gltf') {
                return this._loadGLTFJson(url, opts);
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`ModelLoader: fetch failed ${response.status} ${url}`);
            buffer = await response.arrayBuffer();
        } else {
            throw new Error('ModelLoader: source must be URL string or ArrayBuffer');
        }

        switch (format) {
            case 'glb': return this._parseGLB(buffer, opts);
            case 'obj': return this._parseOBJ(new TextDecoder().decode(buffer), opts);
            default: throw new Error(`ModelLoader: unknown format "${format}"`);
        }
    }

    /**
     * Load and directly populate a SceneRenderer
     * @param {string|ArrayBuffer} source
     * @param {object} [opts]
     * @returns {Promise<{scene: SceneRenderer, modelData: ModelData, splats: Array|null}>}
     */
    async loadScene(source, opts = {}) {
        const { SceneRenderer } = await import('./SceneRenderer.js');
        const modelData = await this.load(source, opts);
        const scene = new SceneRenderer(this.gl);
        const splatSeeds = [];

        for (let i = 0; i < modelData.meshes.length; i++) {
            const mesh = modelData.meshes[i];
            const name = mesh.name || `mesh_${i}`;
            const obj = scene.addObject(name, {
                positions: mesh.positions,
                normals: mesh.normals,
                uvs: mesh.uvs,
                indices: mesh.indices,
                colors: mesh.colors || null,
            });

            if (mesh.transform) {
                obj.setTransform(mesh.transform);
            }

            // Auto-generate splats from PBR
            if ((this.generateSplats || opts.generateSplats) && mesh.material) {
                try {
                    const { PBRSplatConverter } = await import('./PBRSplatConverter.js');
                    const converter = new PBRSplatConverter({ baseDensity: this.splatDensity });
                    const convertInput = {
                        positions: mesh.positions,
                        normals: mesh.normals,
                        uvs: mesh.uvs,
                        indices: mesh.indices,
                    };

                    if (mesh.material.albedoPixels) {
                        convertInput.albedoPixels = mesh.material.albedoPixels;
                        convertInput.albedoWidth = mesh.material.albedoWidth;
                        convertInput.albedoHeight = mesh.material.albedoHeight;
                    }
                    if (mesh.material.roughnessPixels) {
                        convertInput.roughnessPixels = mesh.material.roughnessPixels;
                        convertInput.roughnessWidth = mesh.material.roughnessWidth;
                        convertInput.roughnessHeight = mesh.material.roughnessHeight;
                    }
                    if (mesh.material.metallicPixels) {
                        convertInput.metallicPixels = mesh.material.metallicPixels;
                        convertInput.metallicWidth = mesh.material.metallicWidth;
                        convertInput.metallicHeight = mesh.material.metallicHeight;
                    }
                    if (mesh.material.emissivePixels) {
                        convertInput.emissivePixels = mesh.material.emissivePixels;
                        convertInput.emissiveWidth = mesh.material.emissiveWidth;
                        convertInput.emissiveHeight = mesh.material.emissiveHeight;
                    }

                    const seeds = converter.convert(convertInput);
                    splatSeeds.push(...seeds);
                } catch (e) {
                    console.warn(`ModelLoader: splat generation failed for ${name}:`, e);
                }
            }
        }

        return {
            scene,
            modelData,
            splats: splatSeeds.length > 0 ? splatSeeds : null,
            animations: modelData.animations || [],
            skins: modelData.skins || [],
        };
    }

    // ─── glTF Binary (.glb) Parser ───────────────────────────────────

    _parseGLB(buffer, opts) {
        const view = new DataView(buffer);

        // GLB header: magic (4) + version (4) + length (4)
        const magic = view.getUint32(0, true);
        if (magic !== 0x46546C67) throw new Error('ModelLoader: not a valid GLB file');

        const version = view.getUint32(4, true);
        if (version !== 2) throw new Error(`ModelLoader: unsupported glTF version ${version}`);

        // Parse chunks
        let jsonChunk = null;
        let binChunk = null;
        let offset = 12;

        while (offset < buffer.byteLength) {
            const chunkLength = view.getUint32(offset, true);
            const chunkType = view.getUint32(offset + 4, true);
            const chunkData = buffer.slice(offset + 8, offset + 8 + chunkLength);

            if (chunkType === 0x4E4F534A) { // JSON
                jsonChunk = JSON.parse(new TextDecoder().decode(chunkData));
            } else if (chunkType === 0x004E4942) { // BIN
                binChunk = chunkData;
            }

            offset += 8 + chunkLength;
        }

        if (!jsonChunk) throw new Error('ModelLoader: no JSON chunk in GLB');

        return this._parseGLTFData(jsonChunk, binChunk ? [binChunk] : [], opts);
    }

    async _loadGLTFJson(url, opts) {
        const response = await fetch(url);
        const json = await response.json();
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // Load external buffers
        const buffers = [];
        if (json.buffers) {
            for (const bufDef of json.buffers) {
                if (bufDef.uri) {
                    const bufUrl = bufDef.uri.startsWith('data:')
                        ? bufDef.uri
                        : baseUrl + bufDef.uri;
                    const resp = await fetch(bufUrl);
                    buffers.push(await resp.arrayBuffer());
                }
            }
        }

        return this._parseGLTFData(json, buffers, opts);
    }

    _parseGLTFData(json, buffers, opts) {
        const result = {
            meshes: [],
            animations: [],
            skins: [],
            scenes: [],
            nodes: json.nodes || [],
        };

        // Parse accessors helper
        const getAccessorData = (accessorIndex) => {
            const accessor = json.accessors[accessorIndex];
            const bufferView = json.bufferViews[accessor.bufferView];
            const buffer = buffers[bufferView.buffer || 0];
            const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);

            const TypedArray = {
                5120: Int8Array,
                5121: Uint8Array,
                5122: Int16Array,
                5123: Uint16Array,
                5125: Uint32Array,
                5126: Float32Array,
            }[accessor.componentType] || Float32Array;

            const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type] || 1;
            const stride = bufferView.byteStride || 0;

            if (stride && stride !== componentCount * TypedArray.BYTES_PER_ELEMENT) {
                // Interleaved - deinterleave
                const out = new TypedArray(accessor.count * componentCount);
                const src = new DataView(buffer, byteOffset);
                for (let i = 0; i < accessor.count; i++) {
                    for (let c = 0; c < componentCount; c++) {
                        out[i * componentCount + c] = src.getFloat32(i * stride + c * 4, true);
                    }
                }
                return { data: out, count: accessor.count, componentCount, min: accessor.min, max: accessor.max };
            }

            const data = new TypedArray(buffer, byteOffset, accessor.count * componentCount);
            return { data, count: accessor.count, componentCount, min: accessor.min, max: accessor.max };
        };

        // Parse meshes
        if (json.meshes) {
            for (let mi = 0; mi < json.meshes.length; mi++) {
                const meshDef = json.meshes[mi];

                for (let pi = 0; pi < meshDef.primitives.length; pi++) {
                    const prim = meshDef.primitives[pi];
                    const mesh = { name: meshDef.name || `mesh_${mi}_${pi}` };

                    // Attributes
                    if (prim.attributes.POSITION !== undefined) {
                        const acc = getAccessorData(prim.attributes.POSITION);
                        mesh.positions = new Float32Array(acc.data);
                        mesh.vertexCount = acc.count;
                    }
                    if (prim.attributes.NORMAL !== undefined) {
                        mesh.normals = new Float32Array(getAccessorData(prim.attributes.NORMAL).data);
                    }
                    if (prim.attributes.TEXCOORD_0 !== undefined) {
                        mesh.uvs = new Float32Array(getAccessorData(prim.attributes.TEXCOORD_0).data);
                    }
                    if (prim.attributes.COLOR_0 !== undefined) {
                        mesh.colors = new Float32Array(getAccessorData(prim.attributes.COLOR_0).data);
                    }

                    // Joints and weights for skeletal animation
                    if (prim.attributes.JOINTS_0 !== undefined) {
                        const jAcc = getAccessorData(prim.attributes.JOINTS_0);
                        mesh.joints = new Uint16Array(jAcc.data.length);
                        for (let i = 0; i < jAcc.data.length; i++) mesh.joints[i] = jAcc.data[i];
                    }
                    if (prim.attributes.WEIGHTS_0 !== undefined) {
                        mesh.weights = new Float32Array(getAccessorData(prim.attributes.WEIGHTS_0).data);
                    }

                    // Morph targets
                    if (prim.targets) {
                        mesh.morphTargets = [];
                        for (const target of prim.targets) {
                            const mt = {};
                            if (target.POSITION !== undefined) {
                                mt.positions = new Float32Array(getAccessorData(target.POSITION).data);
                            }
                            if (target.NORMAL !== undefined) {
                                mt.normals = new Float32Array(getAccessorData(target.NORMAL).data);
                            }
                            mesh.morphTargets.push(mt);
                        }
                    }

                    // Indices
                    if (prim.indices !== undefined) {
                        const iAcc = getAccessorData(prim.indices);
                        mesh.indices = new Uint32Array(iAcc.data);
                    }

                    // Material reference
                    if (prim.material !== undefined && json.materials) {
                        mesh.materialIndex = prim.material;
                        mesh.material = this._parseMaterial(json.materials[prim.material], json, buffers);
                    }

                    result.meshes.push(mesh);
                }
            }
        }

        // Parse node transforms
        if (json.nodes) {
            for (let ni = 0; ni < json.nodes.length; ni++) {
                const node = json.nodes[ni];
                if (node.mesh !== undefined) {
                    const transform = this._getNodeTransform(node);
                    // Apply transform to corresponding mesh(es)
                    const meshDef = json.meshes[node.mesh];
                    for (let pi = 0; pi < meshDef.primitives.length; pi++) {
                        const idx = this._findMeshIndex(result.meshes, node.mesh, pi);
                        if (idx >= 0) result.meshes[idx].transform = transform;
                    }
                }
            }
        }

        // Parse animations
        if (json.animations) {
            for (const animDef of json.animations) {
                const animation = {
                    name: animDef.name || 'animation',
                    channels: [],
                    duration: 0,
                };

                for (const channel of animDef.channels) {
                    const sampler = animDef.samplers[channel.sampler];
                    const inputAcc = getAccessorData(sampler.input);
                    const outputAcc = getAccessorData(sampler.output);

                    const ch = {
                        targetNode: channel.target.node,
                        targetPath: channel.target.path, // translation, rotation, scale, weights
                        interpolation: sampler.interpolation || 'LINEAR',
                        times: new Float32Array(inputAcc.data),
                        values: new Float32Array(outputAcc.data),
                    };

                    animation.duration = Math.max(animation.duration, ch.times[ch.times.length - 1]);
                    animation.channels.push(ch);
                }

                result.animations.push(animation);
            }
        }

        // Parse skins (skeletal data)
        if (json.skins) {
            for (const skinDef of json.skins) {
                const ibmAcc = skinDef.inverseBindMatrices !== undefined
                    ? getAccessorData(skinDef.inverseBindMatrices) : null;

                result.skins.push({
                    name: skinDef.name || 'skin',
                    joints: skinDef.joints,
                    skeleton: skinDef.skeleton,
                    inverseBindMatrices: ibmAcc ? new Float32Array(ibmAcc.data) : null,
                });
            }
        }

        return result;
    }

    _parseMaterial(matDef, json, buffers) {
        const material = {
            name: matDef.name || 'material',
            doubleSided: matDef.doubleSided || false,
            alphaMode: matDef.alphaMode || 'OPAQUE',
            alphaCutoff: matDef.alphaCutoff ?? 0.5,
        };

        if (matDef.pbrMetallicRoughness) {
            const pbr = matDef.pbrMetallicRoughness;
            material.baseColorFactor = pbr.baseColorFactor || [1, 1, 1, 1];
            material.metallicFactor = pbr.metallicFactor ?? 1.0;
            material.roughnessFactor = pbr.roughnessFactor ?? 1.0;

            if (pbr.baseColorTexture) {
                material.albedoTextureIndex = this._getTextureSource(pbr.baseColorTexture.index, json);
            }
            if (pbr.metallicRoughnessTexture) {
                material.metallicRoughnessTextureIndex = this._getTextureSource(pbr.metallicRoughnessTexture.index, json);
            }
        }

        if (matDef.normalTexture) {
            material.normalTextureIndex = this._getTextureSource(matDef.normalTexture.index, json);
            material.normalScale = matDef.normalTexture.scale ?? 1.0;
        }

        if (matDef.occlusionTexture) {
            material.occlusionTextureIndex = this._getTextureSource(matDef.occlusionTexture.index, json);
        }

        if (matDef.emissiveTexture) {
            material.emissiveTextureIndex = this._getTextureSource(matDef.emissiveTexture.index, json);
        }

        material.emissiveFactor = matDef.emissiveFactor || [0, 0, 0];

        return material;
    }

    _getTextureSource(textureIndex, json) {
        if (!json.textures || !json.textures[textureIndex]) return null;
        const tex = json.textures[textureIndex];
        return tex.source;
    }

    _getNodeTransform(node) {
        if (node.matrix) {
            return new Float32Array(node.matrix);
        }

        // TRS decomposition
        const t = node.translation || [0, 0, 0];
        const r = node.rotation || [0, 0, 0, 1]; // quaternion xyzw
        const s = node.scale || [1, 1, 1];

        // Build matrix from TRS
        const m = new Float32Array(16);
        const x = r[0], y = r[1], z = r[2], w = r[3];
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;

        m[0] = (1 - (yy + zz)) * s[0];
        m[1] = (xy + wz) * s[0];
        m[2] = (xz - wy) * s[0];
        m[3] = 0;
        m[4] = (xy - wz) * s[1];
        m[5] = (1 - (xx + zz)) * s[1];
        m[6] = (yz + wx) * s[1];
        m[7] = 0;
        m[8] = (xz + wy) * s[2];
        m[9] = (yz - wx) * s[2];
        m[10] = (1 - (xx + yy)) * s[2];
        m[11] = 0;
        m[12] = t[0];
        m[13] = t[1];
        m[14] = t[2];
        m[15] = 1;

        return m;
    }

    _findMeshIndex(meshes, meshIndex, primIndex) {
        let count = 0;
        for (let i = 0; i < meshes.length; i++) {
            const name = meshes[i].name;
            if (name.startsWith(`mesh_${meshIndex}_`) || count === meshIndex) {
                if (count === meshIndex) return i + primIndex;
            }
            count++;
        }
        return -1;
    }

    // ─── OBJ Parser ──────────────────────────────────────────────────

    _parseOBJ(text, opts) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const meshPositions = [];
        const meshNormals = [];
        const meshUvs = [];
        const meshIndices = [];
        const vertexCache = new Map();
        let indexCount = 0;

        const lines = text.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0 || trimmed[0] === '#') continue;

            const parts = trimmed.split(/\s+/);
            const cmd = parts[0];

            switch (cmd) {
                case 'v':
                    positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                    break;
                case 'vn':
                    normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
                    break;
                case 'vt':
                    uvs.push(parseFloat(parts[1]), parseFloat(parts[2]));
                    break;
                case 'f': {
                    const faceVerts = [];
                    for (let i = 1; i < parts.length; i++) {
                        const key = parts[i];
                        if (vertexCache.has(key)) {
                            faceVerts.push(vertexCache.get(key));
                        } else {
                            const indices = key.split('/');
                            const vi = (parseInt(indices[0]) - 1) * 3;
                            meshPositions.push(positions[vi], positions[vi + 1], positions[vi + 2]);

                            if (indices[1] && indices[1] !== '') {
                                const ti = (parseInt(indices[1]) - 1) * 2;
                                meshUvs.push(uvs[ti], uvs[ti + 1]);
                            }

                            if (indices[2]) {
                                const ni = (parseInt(indices[2]) - 1) * 3;
                                meshNormals.push(normals[ni], normals[ni + 1], normals[ni + 2]);
                            }

                            vertexCache.set(key, indexCount);
                            faceVerts.push(indexCount);
                            indexCount++;
                        }
                    }

                    // Triangulate fan
                    for (let i = 1; i < faceVerts.length - 1; i++) {
                        meshIndices.push(faceVerts[0], faceVerts[i], faceVerts[i + 1]);
                    }
                    break;
                }
            }
        }

        const mesh = {
            name: 'obj_mesh',
            positions: new Float32Array(meshPositions),
            normals: meshNormals.length > 0 ? new Float32Array(meshNormals) : this._generateNormals(meshPositions, meshIndices),
            uvs: meshUvs.length > 0 ? new Float32Array(meshUvs) : null,
            indices: new Uint32Array(meshIndices),
            vertexCount: indexCount,
        };

        return { meshes: [mesh], animations: [], skins: [], scenes: [], nodes: [] };
    }

    _generateNormals(positions, indices) {
        const normals = new Float32Array(positions.length);
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
            const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
            const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
            const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;

            normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
            normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
            normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
        }
        // Normalize
        for (let i = 0; i < normals.length; i += 3) {
            const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2) || 1;
            normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
        }
        return normals;
    }

    // ─── Format Detection ────────────────────────────────────────────

    _detectFormat(bytes) {
        if (bytes[0] === 0x67 && bytes[1] === 0x6C && bytes[2] === 0x54 && bytes[3] === 0x46) return 'glb';
        return 'obj';
    }

    _detectFormatFromURL(url) {
        const lower = url.toLowerCase();
        if (lower.endsWith('.glb')) return 'glb';
        if (lower.endsWith('.gltf')) return 'gltf';
        if (lower.endsWith('.obj')) return 'obj';
        return 'glb';
    }
}

/**
 * @typedef {object} ModelData
 * @property {Array<MeshData>} meshes
 * @property {Array<AnimationData>} animations
 * @property {Array<SkinData>} skins
 * @property {Array} scenes
 * @property {Array} nodes
 */

/**
 * @typedef {object} MeshData
 * @property {string} name
 * @property {Float32Array} positions
 * @property {Float32Array} normals
 * @property {Float32Array} [uvs]
 * @property {Float32Array} [colors]
 * @property {Uint32Array} [indices]
 * @property {Uint16Array} [joints] - Joint indices for skinning
 * @property {Float32Array} [weights] - Joint weights for skinning
 * @property {Array} [morphTargets]
 * @property {Float32Array} [transform] - 4x4 column-major matrix
 * @property {object} [material]
 * @property {number} vertexCount
 */
