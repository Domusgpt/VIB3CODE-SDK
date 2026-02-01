/**
 * PipelineTools - MCP Tool Expansion for Hybrid Pipeline
 * VIB3+ Hybrid Render Pipeline v2
 *
 * New MCP tools for AI agents to compose scenes, set inscription states,
 * trigger animations, and capture output.
 */

export class PipelineTools {
    /**
     * @param {object} pipeline - HybridRenderPipeline instance
     * @param {object} [deps] - Optional dependencies
     * @param {object} [deps.sceneRenderer] - SceneRenderer
     * @param {object} [deps.inscriptionChannel] - InscriptionChannel
     * @param {object} [deps.modelLoader] - ModelLoader
     * @param {object} [deps.particleSystem] - ParticleSystem
     * @param {object} [deps.videoExporter] - VideoExporter
     * @param {object} [deps.skeletalAnimator] - SkeletalAnimator
     */
    constructor(pipeline, deps = {}) {
        this.pipeline = pipeline;
        this.scene = deps.sceneRenderer || null;
        this.inscription = deps.inscriptionChannel || null;
        this.loader = deps.modelLoader || null;
        this.particles = deps.particleSystem || null;
        this.video = deps.videoExporter || null;
        this.animator = deps.skeletalAnimator || null;
        this.canvas = deps.canvas || null;
    }

    /**
     * Get all pipeline tool definitions for MCP registration
     * @returns {Array<object>} MCP tool definitions
     */
    getToolDefinitions() {
        return [
            {
                name: 'set_inscription_state',
                description: 'Change the semantic state of an object, affecting its inscription pattern. States: idle, active, selected, powered, damaged, destroyed.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectId: { type: 'number', description: 'Object ID (1-255)' },
                        state: { type: 'string', enum: ['idle', 'active', 'selected', 'powered', 'damaged', 'destroyed'] },
                    },
                    required: ['objectId', 'state'],
                },
            },
            {
                name: 'add_scene_object',
                description: 'Load a 3D model and add it to the scene with automatic inscription.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Object name' },
                        modelUrl: { type: 'string', description: 'URL to .glb/.gltf/.obj file' },
                        position: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
                        scale: { type: 'number', description: 'Uniform scale factor', default: 1.0 },
                        initialState: { type: 'string', enum: ['idle', 'active', 'selected', 'powered'], default: 'idle' },
                    },
                    required: ['name', 'modelUrl'],
                },
            },
            {
                name: 'remove_scene_object',
                description: 'Remove an object from the scene.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Object name to remove' },
                    },
                    required: ['name'],
                },
            },
            {
                name: 'set_audio_reactive',
                description: 'Configure audio-reactive mapping for inscription.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        band: { type: 'string', enum: ['bass', 'mid', 'high', 'energy'] },
                        target: { type: 'string', enum: ['rotation', 'thickness', 'glow', 'speed', 'scale'] },
                        intensity: { type: 'number', minimum: 0, maximum: 2, description: 'Mapping strength' },
                    },
                    required: ['band', 'target', 'intensity'],
                },
            },
            {
                name: 'set_audio_levels',
                description: 'Set current audio levels for inscription reactivity.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        bass: { type: 'number', minimum: 0, maximum: 1 },
                        mid: { type: 'number', minimum: 0, maximum: 1 },
                        high: { type: 'number', minimum: 0, maximum: 1 },
                        energy: { type: 'number', minimum: 0, maximum: 1 },
                    },
                },
            },
            {
                name: 'capture_frame',
                description: 'Export the current rendered frame as an image.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        format: { type: 'string', enum: ['png', 'jpeg', 'dataurl'], default: 'png' },
                        quality: { type: 'number', minimum: 0, maximum: 1, default: 0.92 },
                    },
                },
            },
            {
                name: 'start_recording',
                description: 'Begin recording video from the pipeline output.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        format: { type: 'string', enum: ['webm', 'mp4'], default: 'webm' },
                        duration: { type: 'number', description: 'Auto-stop after N seconds (0=manual stop)' },
                        fps: { type: 'number', default: 30 },
                    },
                },
            },
            {
                name: 'stop_recording',
                description: 'Stop video recording and return the result.',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'set_morph_weight',
                description: 'Set morph target weight for shape animation.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectId: { type: 'number', description: 'Object ID or 0 for primary mesh' },
                        weight: { type: 'number', minimum: 0, maximum: 1, description: 'Morph blend weight' },
                    },
                    required: ['weight'],
                },
            },
            {
                name: 'configure_inscription_layers',
                description: 'Configure inscription layers for an object.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        objectId: { type: 'number', description: 'Object ID (0 for global)' },
                        layers: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    geometry: { type: 'number', minimum: 0, maximum: 23 },
                                    thickness: { type: 'number', minimum: 0, maximum: 1 },
                                    opacity: { type: 'number', minimum: 0, maximum: 1 },
                                    color: { type: 'array', items: { type: 'number' } },
                                    patternScale: { type: 'number' },
                                    patternSpeed: { type: 'number' },
                                },
                            },
                        },
                    },
                    required: ['layers'],
                },
            },
            {
                name: 'set_pipeline_config',
                description: 'Configure the overall pipeline rendering parameters.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        exposure: { type: 'number', minimum: 0, maximum: 5 },
                        gamma: { type: 'number', minimum: 1, maximum: 3 },
                        meshOpacity: { type: 'number', minimum: 0, maximum: 1 },
                        splatOpacity: { type: 'number', minimum: 0, maximum: 1 },
                        inscriptionOpacity: { type: 'number', minimum: 0, maximum: 1 },
                        proceduralOpacity: { type: 'number', minimum: 0, maximum: 1 },
                        meshBlendMode: { type: 'string', enum: ['alpha', 'additive', 'screen', 'multiply'] },
                        inscriptionBlendMode: { type: 'string', enum: ['alpha', 'additive', 'screen', 'multiply'] },
                    },
                },
            },
            {
                name: 'emit_particles',
                description: 'Trigger a particle burst at a position.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        position: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
                        count: { type: 'number', default: 50 },
                        speed: { type: 'number', default: 2.0 },
                        color: { type: 'array', items: { type: 'number' }, description: '[r, g, b]' },
                        state: { type: 'string', enum: ['powered', 'damaged', 'destroyed', 'selected', 'active'] },
                    },
                },
            },
            {
                name: 'play_animation',
                description: 'Play a skeletal animation on the scene.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Animation clip name' },
                        loop: { type: 'boolean', default: true },
                        speed: { type: 'number', default: 1.0 },
                    },
                    required: ['name'],
                },
            },
            {
                name: 'get_pipeline_state',
                description: 'Get the current state of all pipeline components.',
                inputSchema: { type: 'object', properties: {} },
            },
        ];
    }

    /**
     * Handle a tool call
     * @param {string} toolName
     * @param {object} args
     * @returns {Promise<object>} Tool result
     */
    async handleToolCall(toolName, args) {
        switch (toolName) {
            case 'set_inscription_state':
                return this._setInscriptionState(args);
            case 'add_scene_object':
                return this._addSceneObject(args);
            case 'remove_scene_object':
                return this._removeSceneObject(args);
            case 'set_audio_reactive':
                return this._setAudioReactive(args);
            case 'set_audio_levels':
                return this._setAudioLevels(args);
            case 'capture_frame':
                return this._captureFrame(args);
            case 'start_recording':
                return this._startRecording(args);
            case 'stop_recording':
                return this._stopRecording(args);
            case 'set_morph_weight':
                return this._setMorphWeight(args);
            case 'configure_inscription_layers':
                return this._configureInscriptionLayers(args);
            case 'set_pipeline_config':
                return this._setPipelineConfig(args);
            case 'emit_particles':
                return this._emitParticles(args);
            case 'play_animation':
                return this._playAnimation(args);
            case 'get_pipeline_state':
                return this._getPipelineState();
            default:
                return { error: `Unknown tool: ${toolName}` };
        }
    }

    // ─── Tool Implementations ────────────────────────────────────────

    _setInscriptionState({ objectId, state }) {
        if (!this.inscription) return { error: 'InscriptionChannel not available' };
        this.inscription.registerObject(objectId, state);
        this.inscription.setObjectState(objectId, state);
        return { success: true, objectId, state };
    }

    async _addSceneObject({ name, modelUrl, position, scale, initialState }) {
        if (!this.loader || !this.scene) return { error: 'ModelLoader or SceneRenderer not available' };

        try {
            const modelData = await this.loader.load(modelUrl);
            if (modelData.meshes.length === 0) return { error: 'No meshes in model' };

            const mesh = modelData.meshes[0];
            const obj = this.scene.addObject(name, {
                positions: mesh.positions,
                normals: mesh.normals,
                uvs: mesh.uvs,
                indices: mesh.indices,
            });

            if (position) {
                const transform = new Float32Array(16);
                transform[0] = scale || 1; transform[5] = scale || 1; transform[10] = scale || 1; transform[15] = 1;
                transform[12] = position[0]; transform[13] = position[1]; transform[14] = position[2];
                obj.setTransform(transform);
            }

            if (initialState && this.inscription) {
                this.inscription.registerObject(obj.objectID, initialState);
            }

            return { success: true, name, objectID: obj.objectID, meshes: modelData.meshes.length };
        } catch (e) {
            return { error: e.message };
        }
    }

    _removeSceneObject({ name }) {
        if (!this.scene) return { error: 'SceneRenderer not available' };
        this.scene.removeObject(name);
        return { success: true, name };
    }

    _setAudioReactive({ band, target, intensity }) {
        // Store mapping config (applied during update loop)
        if (!this._audioMappings) this._audioMappings = {};
        if (!this._audioMappings[band]) this._audioMappings[band] = {};
        this._audioMappings[band][target] = intensity;
        return { success: true, band, target, intensity };
    }

    _setAudioLevels({ bass, mid, high, energy }) {
        if (this.inscription) {
            this.inscription.setAudio(bass ?? 0, mid ?? 0, high ?? 0, energy ?? 0);
        }
        return { success: true, levels: { bass, mid, high, energy } };
    }

    _captureFrame({ format, quality }) {
        if (!this.canvas) return { error: 'No canvas available' };
        const fmt = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        if (format === 'dataurl') {
            return { success: true, dataUrl: this.canvas.toDataURL(fmt, quality ?? 0.92) };
        }
        // Return as base64 for MCP transport
        const dataUrl = this.canvas.toDataURL(fmt, quality ?? 0.92);
        return { success: true, format, dataUrl };
    }

    _startRecording({ format, duration, fps }) {
        if (!this.video) return { error: 'VideoExporter not available' };
        this.video.format = format ?? 'webm';
        this.video.fps = fps ?? 30;
        const started = this.video.startRecording({ duration });
        return { success: started, format: this.video.format };
    }

    async _stopRecording() {
        if (!this.video) return { error: 'VideoExporter not available' };
        const blob = await this.video.stopRecording();
        if (!blob) return { error: 'No recording in progress' };

        // Convert to base64 for MCP transport
        const reader = new FileReader();
        return new Promise(resolve => {
            reader.onloadend = () => {
                resolve({ success: true, dataUrl: reader.result, size: blob.size });
            };
            reader.readAsDataURL(blob);
        });
    }

    _setMorphWeight({ objectId, weight }) {
        if (this.pipeline && this.pipeline._meshRenderer) {
            this.pipeline._meshRenderer.morphWeight = weight;
        }
        return { success: true, objectId: objectId ?? 0, weight };
    }

    _configureInscriptionLayers({ objectId, layers }) {
        if (!this.pipeline || !this.pipeline._edgeInscription) {
            return { error: 'EdgeInscriptionLayer not available' };
        }

        const layer = this.pipeline._edgeInscription;
        for (let i = 0; i < layers.length; i++) {
            const config = layers[i];
            layer.setLayerConfig(i, {
                geometry: config.geometry,
                thickness: config.thickness,
                opacity: config.opacity,
                color: config.color,
                patternScale: config.patternScale,
                patternSpeed: config.patternSpeed,
            });
        }
        return { success: true, layersConfigured: layers.length };
    }

    _setPipelineConfig(args) {
        if (!this.pipeline) return { error: 'Pipeline not available' };

        if (args.exposure !== undefined) this.pipeline.exposure = args.exposure;
        if (args.gamma !== undefined) this.pipeline.gamma = args.gamma;
        if (args.meshOpacity !== undefined && this.pipeline.meshLayer) this.pipeline.meshLayer.opacity = args.meshOpacity;
        if (args.splatOpacity !== undefined && this.pipeline.splatLayer) this.pipeline.splatLayer.opacity = args.splatOpacity;
        if (args.inscriptionOpacity !== undefined && this.pipeline.inscriptionLayer) this.pipeline.inscriptionLayer.opacity = args.inscriptionOpacity;
        if (args.proceduralOpacity !== undefined && this.pipeline.proceduralLayer) this.pipeline.proceduralLayer.opacity = args.proceduralOpacity;

        return { success: true, applied: Object.keys(args) };
    }

    _emitParticles({ position, count, speed, color, state }) {
        if (!this.particles) return { error: 'ParticleSystem not available' };

        if (state) {
            this.particles.burst(state, position ? new Float32Array(position) : undefined);
        } else {
            const pos = position ? new Float32Array(position) : this.particles.emitterPosition;
            for (let i = 0; i < (count ?? 50); i++) {
                this.particles._emitOne(pos, speed ?? 2.0, 0.5, color);
            }
        }
        return { success: true, particles: this.particles.getAliveCount() };
    }

    _playAnimation({ name, loop, speed }) {
        if (!this.animator) return { error: 'SkeletalAnimator not available' };
        this.animator.play(name, { loop: loop !== false, speed: speed ?? 1.0 });
        return { success: true, animation: name };
    }

    _getPipelineState() {
        const state = {
            pipeline: {
                exposure: this.pipeline?.exposure,
                gamma: this.pipeline?.gamma,
            },
            scene: {
                objectCount: this.scene ? Object.keys(this.scene._objects || {}).length : 0,
            },
            inscription: {
                layerCount: this.pipeline?._edgeInscription?.layers?.length ?? 0,
            },
            particles: {
                alive: this.particles?.getAliveCount() ?? 0,
            },
            animation: {
                activeClip: this.animator?.activeClip?.name ?? null,
                clipTime: this.animator?.clipTime ?? 0,
            },
            recording: {
                active: this.video?.isRecording() ?? false,
                duration: this.video?.getRecordingDuration() ?? 0,
            },
        };
        return { success: true, state };
    }
}
