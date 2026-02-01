/**
 * GLTFInscriptionExporter - glTF Extension Export (VIB3_inscription)
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Export a VIB3-inscribed scene as glTF with custom extension.
 * Serializes: mesh geometry + inscription layer configs + semantic states + audio mapping.
 * Any viewer with the extension reproduces the effect; standard viewers see just the mesh.
 */

export class GLTFInscriptionExporter {
    /**
     * Extension identifier
     */
    static EXTENSION_NAME = 'VIB3_inscription';

    /**
     * Extension schema version
     */
    static SCHEMA_VERSION = '1.0.0';

    /**
     * Export a VIB3 scene as glTF binary (.glb) with inscription extension
     *
     * @param {object} sceneData
     * @param {Array<object>} sceneData.objects - Scene objects with geometry + inscription
     * @param {object} [sceneData.globalConfig] - Global pipeline config
     * @param {object} [sceneData.audioMapping] - Audio reactivity config
     * @param {object} [opts]
     * @param {boolean} [opts.embedTextures=true] - Embed textures in GLB
     * @param {boolean} [opts.includeMetadata=true]
     * @returns {ArrayBuffer} GLB binary
     */
    export(sceneData, opts = {}) {
        const embedTextures = opts.embedTextures ?? true;
        const includeMetadata = opts.includeMetadata ?? true;

        const gltf = {
            asset: {
                version: '2.0',
                generator: 'VIB3+ Hybrid Render Pipeline',
            },
            extensionsUsed: [GLTFInscriptionExporter.EXTENSION_NAME],
            extensionsRequired: [],
            scene: 0,
            scenes: [{ nodes: [] }],
            nodes: [],
            meshes: [],
            materials: [],
            accessors: [],
            bufferViews: [],
            buffers: [],
        };

        const binChunks = []; // Binary data segments
        let binOffset = 0;

        // Process each scene object
        for (let i = 0; i < sceneData.objects.length; i++) {
            const obj = sceneData.objects[i];

            // Create mesh
            const meshIndex = gltf.meshes.length;
            const primitive = { attributes: {} };

            // Positions
            if (obj.positions) {
                const { accessorIndex, viewIndex } = this._addAccessor(
                    gltf, binChunks, obj.positions, 'VEC3', 5126, binOffset
                );
                binOffset += obj.positions.byteLength;
                primitive.attributes.POSITION = accessorIndex;

                // Compute AABB for accessor
                const acc = gltf.accessors[accessorIndex];
                acc.min = [Infinity, Infinity, Infinity];
                acc.max = [-Infinity, -Infinity, -Infinity];
                for (let v = 0; v < obj.positions.length; v += 3) {
                    for (let c = 0; c < 3; c++) {
                        acc.min[c] = Math.min(acc.min[c], obj.positions[v + c]);
                        acc.max[c] = Math.max(acc.max[c], obj.positions[v + c]);
                    }
                }
            }

            // Normals
            if (obj.normals) {
                const { accessorIndex } = this._addAccessor(
                    gltf, binChunks, obj.normals, 'VEC3', 5126, binOffset
                );
                binOffset += obj.normals.byteLength;
                primitive.attributes.NORMAL = accessorIndex;
            }

            // UVs
            if (obj.uvs) {
                const { accessorIndex } = this._addAccessor(
                    gltf, binChunks, obj.uvs, 'VEC2', 5126, binOffset
                );
                binOffset += obj.uvs.byteLength;
                primitive.attributes.TEXCOORD_0 = accessorIndex;
            }

            // Indices
            if (obj.indices) {
                const { accessorIndex } = this._addAccessor(
                    gltf, binChunks, obj.indices, 'SCALAR', 5125, binOffset
                );
                binOffset += obj.indices.byteLength;
                primitive.indices = accessorIndex;
            }

            gltf.meshes.push({
                name: obj.name || `object_${i}`,
                primitives: [primitive],
            });

            // Create node
            const nodeIndex = gltf.nodes.length;
            const node = {
                name: obj.name || `object_${i}`,
                mesh: meshIndex,
            };

            // Transform
            if (obj.transform) {
                node.matrix = Array.from(obj.transform);
            }

            // VIB3 inscription extension on node
            node.extensions = {
                [GLTFInscriptionExporter.EXTENSION_NAME]: this._buildInscriptionExtension(obj),
            };

            gltf.nodes.push(node);
            gltf.scenes[0].nodes.push(nodeIndex);
        }

        // Root-level extension data
        if (sceneData.globalConfig || sceneData.audioMapping) {
            if (!gltf.extensions) gltf.extensions = {};
            gltf.extensions[GLTFInscriptionExporter.EXTENSION_NAME] = {
                version: GLTFInscriptionExporter.SCHEMA_VERSION,
                pipeline: this._buildPipelineConfig(sceneData.globalConfig),
                audioMapping: sceneData.audioMapping || null,
            };
        }

        // Metadata
        if (includeMetadata) {
            gltf.asset.extras = {
                vib3Version: '2.0',
                exportDate: new Date().toISOString(),
                inscription: true,
            };
        }

        // Build binary buffer
        const totalBinSize = binChunks.reduce((sum, c) => sum + c.byteLength, 0);
        const binBuffer = new Uint8Array(totalBinSize);
        let offset = 0;
        for (const chunk of binChunks) {
            binBuffer.set(new Uint8Array(chunk.buffer || chunk), offset);
            offset += chunk.byteLength;
        }

        gltf.buffers.push({ byteLength: totalBinSize });

        // Encode as GLB
        return this._encodeGLB(gltf, binBuffer);
    }

    /**
     * Export inscription config only (JSON) for existing glTF
     * Can be applied as a sidecar file.
     *
     * @param {Array<object>} objects - Objects with inscription configs
     * @returns {string} JSON string
     */
    exportSidecar(objects) {
        const sidecar = {
            extension: GLTFInscriptionExporter.EXTENSION_NAME,
            version: GLTFInscriptionExporter.SCHEMA_VERSION,
            objects: objects.map(obj => ({
                name: obj.name,
                inscription: this._buildInscriptionExtension(obj),
            })),
        };
        return JSON.stringify(sidecar, null, 2);
    }

    /**
     * Get the extension schema definition
     * @returns {object}
     */
    static getSchema() {
        return {
            name: GLTFInscriptionExporter.EXTENSION_NAME,
            version: GLTFInscriptionExporter.SCHEMA_VERSION,
            description: 'VIB3+ holographic edge inscription overlay',
            nodeProperties: {
                layerCount: { type: 'integer', minimum: 1, maximum: 16, default: 4 },
                layers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            geometry: { type: 'integer', minimum: 0, maximum: 23 },
                            thickness: { type: 'number', minimum: 0, maximum: 1 },
                            opacity: { type: 'number', minimum: 0, maximum: 1 },
                            color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                            patternScale: { type: 'number' },
                            patternSpeed: { type: 'number' },
                            rotOffset: { type: 'number' },
                            blendMode: { type: 'string', enum: ['alpha', 'additive', 'screen', 'multiply'] },
                        },
                    },
                },
                semanticState: { type: 'string', enum: ['idle', 'active', 'selected', 'powered', 'damaged', 'destroyed'] },
                edgeDetection: {
                    type: 'object',
                    properties: {
                        depthSensitivity: { type: 'number' },
                        normalSensitivity: { type: 'number' },
                        globalThickness: { type: 'number' },
                    },
                },
                rotation4D: {
                    type: 'object',
                    properties: {
                        xy: { type: 'number' }, xz: { type: 'number' }, yz: { type: 'number' },
                        xw: { type: 'number' }, yw: { type: 'number' }, zw: { type: 'number' },
                    },
                },
            },
            pipelineProperties: {
                exposure: { type: 'number' },
                gamma: { type: 'number' },
                blendModes: { type: 'object' },
                layerOpacities: { type: 'object' },
            },
        };
    }

    // ─── Internal ────────────────────────────────────────────────────

    _buildInscriptionExtension(obj) {
        const ext = {};

        if (obj.inscriptionConfig) {
            const ic = obj.inscriptionConfig;
            ext.layerCount = ic.layerCount ?? ic.layers?.length ?? 4;

            if (ic.layers) {
                ext.layers = ic.layers.map(l => ({
                    geometry: l.geometry ?? 0,
                    thickness: l.thickness ?? 0.5,
                    opacity: l.opacity ?? 0.8,
                    color: l.color ? Array.from(l.color) : [0, 1, 1],
                    patternScale: l.patternScale ?? 1.0,
                    patternSpeed: l.patternSpeed ?? 1.0,
                    rotOffset: l.rotOffset ?? 0,
                    blendMode: l.blendMode ?? 'additive',
                }));
            }

            if (ic.depthSensitivity || ic.normalSensitivity || ic.globalThickness) {
                ext.edgeDetection = {
                    depthSensitivity: ic.depthSensitivity ?? 8.0,
                    normalSensitivity: ic.normalSensitivity ?? 2.0,
                    globalThickness: ic.globalThickness ?? 0.6,
                };
            }
        }

        if (obj.semanticState) {
            ext.semanticState = obj.semanticState;
        }

        if (obj.rotation4D) {
            ext.rotation4D = { ...obj.rotation4D };
        }

        return ext;
    }

    _buildPipelineConfig(config) {
        if (!config) return {};
        return {
            exposure: config.exposure ?? 1.2,
            gamma: config.gamma ?? 2.2,
            meshLayerOpacity: config.meshLayerOpacity ?? 1.0,
            splatLayerOpacity: config.splatLayerOpacity ?? 0.6,
            proceduralLayerOpacity: config.proceduralLayerOpacity ?? 0.3,
            inscriptionLayerOpacity: config.inscriptionLayerOpacity ?? 0.8,
        };
    }

    _addAccessor(gltf, binChunks, typedArray, type, componentType, offset) {
        const viewIndex = gltf.bufferViews.length;
        gltf.bufferViews.push({
            buffer: 0,
            byteOffset: offset,
            byteLength: typedArray.byteLength,
        });

        const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
        const accessorIndex = gltf.accessors.length;
        gltf.accessors.push({
            bufferView: viewIndex,
            componentType,
            count: typedArray.length / componentCount,
            type,
        });

        binChunks.push(typedArray);

        return { accessorIndex, viewIndex };
    }

    _encodeGLB(gltf, binBuffer) {
        const jsonStr = JSON.stringify(gltf);
        const jsonBytes = new TextEncoder().encode(jsonStr);

        // Pad JSON to 4-byte boundary
        const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
        const jsonLength = jsonBytes.length + jsonPadding;

        // Pad BIN to 4-byte boundary
        const binPadding = (4 - (binBuffer.length % 4)) % 4;
        const binLength = binBuffer.length + binPadding;

        // Total GLB size
        const totalLength = 12 + 8 + jsonLength + 8 + binLength;

        const glb = new ArrayBuffer(totalLength);
        const view = new DataView(glb);
        const bytes = new Uint8Array(glb);

        let offset = 0;

        // GLB header
        view.setUint32(offset, 0x46546C67, true); offset += 4; // magic
        view.setUint32(offset, 2, true); offset += 4;          // version
        view.setUint32(offset, totalLength, true); offset += 4; // length

        // JSON chunk
        view.setUint32(offset, jsonLength, true); offset += 4;
        view.setUint32(offset, 0x4E4F534A, true); offset += 4;
        bytes.set(jsonBytes, offset); offset += jsonBytes.length;
        for (let i = 0; i < jsonPadding; i++) bytes[offset++] = 0x20; // Space padding

        // BIN chunk
        view.setUint32(offset, binLength, true); offset += 4;
        view.setUint32(offset, 0x004E4942, true); offset += 4;
        bytes.set(binBuffer, offset); offset += binBuffer.length;
        for (let i = 0; i < binPadding; i++) bytes[offset++] = 0x00; // Zero padding

        return glb;
    }
}
