/**
 * VIB3+ MCP Server
 * Model Context Protocol server for agentic integration
 */

import { toolDefinitions, getToolList, validateToolInput } from './tools.js';
import { schemaRegistry } from '../../schemas/index.js';
import { telemetry, EventType, withTelemetry } from '../telemetry/index.js';

/**
 * Generate unique IDs
 */
function generateId(prefix = 'scene') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Geometry metadata lookup
 */
const BASE_GEOMETRIES = [
    { name: 'tetrahedron', vertices: 4, edges: 6, faces: 4 },
    { name: 'hypercube', vertices: 16, edges: 32, faces: 24 },
    { name: 'sphere', vertices: 'variable', edges: 'variable', faces: 'variable' },
    { name: 'torus', vertices: 'variable', edges: 'variable', faces: 'variable' },
    { name: 'klein_bottle', vertices: 'variable', edges: 'variable', faces: 'variable' },
    { name: 'fractal', vertices: 'variable', edges: 'variable', faces: 'variable' },
    { name: 'wave', vertices: 'variable', edges: 'variable', faces: 'variable' },
    { name: 'crystal', vertices: 8, edges: 12, faces: 6 }
];

const CORE_TYPES = ['base', 'hypersphere', 'hypertetrahedron'];

/**
 * MCP Server implementation
 */
export class MCPServer {
    constructor(engine = null) {
        this.engine = engine;
        this.sceneId = null;
        this.initialized = false;
    }

    buildResponse(operation, data, options = {}) {
        const response = {
            success: options.success ?? true,
            operation,
            timestamp: new Date().toISOString(),
            duration_ms: options.duration_ms ?? 0,
            ...data
        };
        return this.validateToolResponse(response);
    }

    validateToolResponse(response) {
        const validation = schemaRegistry.validate('toolResponse', response);
        if (!validation.valid) {
            telemetry.recordEvent(EventType.TOOL_INVOCATION_ERROR, {
                tool: response.operation,
                error: 'TOOL_RESPONSE_INVALID'
            });
            return {
                ...response,
                validation_errors: validation.errors
            };
        }
        return response;
    }

    /**
     * Set the VIB3 engine instance
     */
    setEngine(engine) {
        this.engine = engine;
        this.initialized = !!engine;
    }

    /**
     * Handle MCP tool call
     */
    async handleToolCall(toolName, args = {}) {
        const startTime = performance.now();

        // Validate input
        const validation = validateToolInput(toolName, args);
        if (!validation.valid) {
            telemetry.recordEvent(EventType.TOOL_INVOCATION_ERROR, {
                tool: toolName,
                error: validation.error.code
            });
            return this.buildResponse(toolName, { error: validation.error }, {
                success: false,
                duration_ms: performance.now() - startTime
            });
        }

        // Record start
        telemetry.recordEvent(EventType.TOOL_INVOCATION_START, { tool: toolName });

        try {
            let result;

            switch (toolName) {
                case 'create_4d_visualization':
                    result = await this.createVisualization(args);
                    break;
                case 'set_rotation':
                    result = this.setRotation(args);
                    break;
                case 'set_visual_parameters':
                    result = this.setVisualParameters(args);
                    break;
                case 'switch_system':
                    result = await this.switchSystem(args);
                    break;
                case 'change_geometry':
                    result = this.changeGeometry(args);
                    break;
                case 'get_state':
                    result = this.getState();
                    break;
                case 'randomize_parameters':
                    result = this.randomizeParameters(args);
                    break;
                case 'reset_parameters':
                    result = this.resetParameters();
                    break;
                case 'save_to_gallery':
                    result = this.saveToGallery(args);
                    break;
                case 'load_from_gallery':
                    result = this.loadFromGallery(args);
                    break;
                case 'search_geometries':
                    result = this.searchGeometries(args);
                    break;
                case 'get_parameter_schema':
                    result = this.getParameterSchema();
                    break;
                case 'get_sdk_context':
                    result = this.getSDKContext();
                    break;
                case 'verify_knowledge':
                    result = this.verifyKnowledge(args);
                    break;
                // Reactivity tools (Phase 6.5)
                case 'set_reactivity_config':
                    result = this.setReactivityConfig(args);
                    break;
                case 'get_reactivity_config':
                    result = this.getReactivityConfig();
                    break;
                case 'configure_audio_band':
                    result = this.configureAudioBand(args);
                    break;
                // Export tools (Phase 6.5)
                case 'export_package':
                    result = this.exportPackage(args);
                    break;
                // Preset tools (Phase 6.6)
                case 'apply_behavior_preset':
                    result = this.applyBehaviorPreset(args);
                    break;
                case 'list_behavior_presets':
                    result = this.listBehaviorPresets();
                    break;
                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }

            // Record success
            const duration = performance.now() - startTime;
            telemetry.recordEvent(EventType.TOOL_INVOCATION_END, {
                tool: toolName,
                duration_ms: duration,
                success: true
            });

            return this.buildResponse(toolName, result, { duration_ms: duration });

        } catch (error) {
            const duration = performance.now() - startTime;
            telemetry.recordEvent(EventType.TOOL_INVOCATION_ERROR, {
                tool: toolName,
                duration_ms: duration,
                error: error.message
            });

            return this.buildResponse(toolName, {
                error: {
                    type: 'SystemError',
                    code: 'TOOL_EXECUTION_FAILED',
                    message: error.message,
                    suggestion: 'Check engine initialization and parameters',
                    retry_possible: true
                }
            }, { success: false, duration_ms: duration });
        }
    }

    /**
     * Create a new visualization
     */
    async createVisualization(args) {
        const { system = 'quantum', geometry_index = 0, projection = 'perspective' } = args;

        if (this.engine) {
            await this.engine.switchSystem(system);
            if (geometry_index !== undefined) {
                this.engine.setParameter('geometry', geometry_index);
            }
        }

        this.sceneId = generateId('scene_4d');

        const baseIndex = geometry_index % 8;
        const coreIndex = Math.floor(geometry_index / 8);

        return {
            scene_id: this.sceneId,
            geometry: {
                index: geometry_index,
                base_type: BASE_GEOMETRIES[baseIndex].name,
                core_type: CORE_TYPES[coreIndex],
                vertex_count: BASE_GEOMETRIES[baseIndex].vertices,
                edge_count: BASE_GEOMETRIES[baseIndex].edges
            },
            system,
            projection,
            render_info: {
                complexity: geometry_index > 15 ? 'high' : geometry_index > 7 ? 'medium' : 'low',
                estimated_fps: 60
            },
            suggested_next_actions: ['set_rotation', 'set_visual_parameters', 'render_preview']
        };
    }

    /**
     * Set rotation parameters
     */
    setRotation(args) {
        if (this.engine) {
            if (args.XY !== undefined) this.engine.setParameter('rot4dXY', args.XY);
            if (args.XZ !== undefined) this.engine.setParameter('rot4dXZ', args.XZ);
            if (args.YZ !== undefined) this.engine.setParameter('rot4dYZ', args.YZ);
            if (args.XW !== undefined) this.engine.setParameter('rot4dXW', args.XW);
            if (args.YW !== undefined) this.engine.setParameter('rot4dYW', args.YW);
            if (args.ZW !== undefined) this.engine.setParameter('rot4dZW', args.ZW);

            telemetry.recordEvent(EventType.PARAMETER_CHANGE, { type: 'rotation' });
        }

        return {
            rotation_state: {
                XY: args.XY ?? 0,
                XZ: args.XZ ?? 0,
                YZ: args.YZ ?? 0,
                XW: args.XW ?? 0,
                YW: args.YW ?? 0,
                ZW: args.ZW ?? 0
            },
            suggested_next_actions: ['set_visual_parameters', 'render_preview']
        };
    }

    /**
     * Set visual parameters
     */
    setVisualParameters(args) {
        if (this.engine) {
            for (const [key, value] of Object.entries(args)) {
                this.engine.setParameter(key, value);
            }
            telemetry.recordEvent(EventType.PARAMETER_BATCH_CHANGE, {
                count: Object.keys(args).length
            });
        }

        return {
            parameters_updated: Object.keys(args),
            suggested_next_actions: ['render_preview', 'save_to_gallery']
        };
    }

    /**
     * Switch visualization system
     */
    async switchSystem(args) {
        const { system } = args;

        if (this.engine) {
            await this.engine.switchSystem(system);
            telemetry.recordEvent(EventType.SYSTEM_SWITCH, { system });
        }

        return {
            active_system: system,
            available_geometries: 24,
            suggested_next_actions: ['change_geometry', 'set_visual_parameters']
        };
    }

    /**
     * Change geometry
     */
    changeGeometry(args) {
        let geometryIndex = args.geometry_index;

        // Convert from base_type + core_type if provided
        if (args.base_type !== undefined) {
            const baseIndex = BASE_GEOMETRIES.findIndex(g => g.name === args.base_type);
            if (baseIndex === -1) {
                return {
                    error: {
                        type: 'ValidationError',
                        code: 'INVALID_BASE_TYPE',
                        message: `Unknown base type: ${args.base_type}`,
                        valid_options: BASE_GEOMETRIES.map(g => g.name),
                        suggestion: 'Use one of the valid base geometry types'
                    }
                };
            }

            const coreIndex = CORE_TYPES.indexOf(args.core_type || 'base');
            geometryIndex = coreIndex * 8 + baseIndex;
        }

        if (this.engine && geometryIndex !== undefined) {
            this.engine.setParameter('geometry', geometryIndex);
            telemetry.recordEvent(EventType.GEOMETRY_CHANGE, { geometry: geometryIndex });
        }

        const baseIndex = geometryIndex % 8;
        const coreIndex = Math.floor(geometryIndex / 8);

        return {
            geometry: {
                index: geometryIndex,
                base_type: BASE_GEOMETRIES[baseIndex].name,
                core_type: CORE_TYPES[coreIndex]
            },
            suggested_next_actions: ['set_rotation', 'set_visual_parameters']
        };
    }

    /**
     * Get current state
     */
    getState() {
        let params = {};
        let system = 'quantum';

        if (this.engine) {
            params = this.engine.getAllParameters();
            system = this.engine.getCurrentSystem();
        }

        const geometryIndex = params.geometry || 0;
        const baseIndex = geometryIndex % 8;
        const coreIndex = Math.floor(geometryIndex / 8);

        return {
            scene_id: this.sceneId,
            system,
            geometry: {
                index: geometryIndex,
                base_type: BASE_GEOMETRIES[baseIndex].name,
                core_type: CORE_TYPES[coreIndex]
            },
            rotation_state: {
                XY: params.rot4dXY || 0,
                XZ: params.rot4dXZ || 0,
                YZ: params.rot4dYZ || 0,
                XW: params.rot4dXW || 0,
                YW: params.rot4dYW || 0,
                ZW: params.rot4dZW || 0
            },
            visual: {
                dimension: params.dimension,
                gridDensity: params.gridDensity,
                morphFactor: params.morphFactor,
                chaos: params.chaos,
                speed: params.speed,
                hue: params.hue,
                intensity: params.intensity,
                saturation: params.saturation
            },
            suggested_next_actions: ['set_rotation', 'set_visual_parameters', 'save_to_gallery']
        };
    }

    /**
     * Randomize parameters
     */
    randomizeParameters(args) {
        if (this.engine) {
            this.engine.randomizeAll();
            telemetry.recordEvent(EventType.PARAMETER_RANDOMIZE, {});
        }

        return {
            ...this.getState(),
            randomized: true
        };
    }

    /**
     * Reset parameters
     */
    resetParameters() {
        if (this.engine) {
            this.engine.resetAll();
            telemetry.recordEvent(EventType.PARAMETER_RESET, {});
        }

        return {
            ...this.getState(),
            reset: true
        };
    }

    /**
     * Save to gallery
     */
    saveToGallery(args) {
        const { slot, name } = args;

        telemetry.recordEvent(EventType.GALLERY_SAVE, { slot });

        return {
            slot,
            name: name || `Variation ${slot}`,
            saved_at: new Date().toISOString(),
            suggested_next_actions: ['load_from_gallery', 'randomize_parameters']
        };
    }

    /**
     * Load from gallery
     */
    loadFromGallery(args) {
        const { slot } = args;

        if (this.engine) {
            // Apply variation
            const params = this.engine.parameters?.generateVariationParameters?.(slot) || {};
            this.engine.setParameters(params);
        }

        telemetry.recordEvent(EventType.GALLERY_LOAD, { slot });

        return {
            slot,
            loaded_at: new Date().toISOString(),
            ...this.getState()
        };
    }

    /**
     * Search geometries
     */
    searchGeometries(args) {
        const { core_type = 'all' } = args;

        const geometries = [];
        for (let i = 0; i < 24; i++) {
            const baseIndex = i % 8;
            const coreIndex = Math.floor(i / 8);
            const coreTypeName = CORE_TYPES[coreIndex];

            if (core_type !== 'all' && coreTypeName !== core_type) continue;

            geometries.push({
                index: i,
                base_type: BASE_GEOMETRIES[baseIndex].name,
                core_type: coreTypeName,
                vertex_count: BASE_GEOMETRIES[baseIndex].vertices,
                edge_count: BASE_GEOMETRIES[baseIndex].edges,
                description: this.getGeometryDescription(baseIndex, coreIndex)
            });
        }

        return {
            count: geometries.length,
            geometries,
            encoding_formula: 'geometry_index = core_index * 8 + base_index'
        };
    }

    /**
     * Get geometry description
     */
    getGeometryDescription(baseIndex, coreIndex) {
        const baseDesc = {
            0: 'Simple 4-vertex lattice, fundamental polytope',
            1: '4D cube projection with 16 vertices and 32 edges',
            2: 'Radial harmonic sphere with smooth surfaces',
            3: 'Toroidal field with continuous surface',
            4: 'Non-orientable surface with topological twist',
            5: 'Recursive subdivision with self-similar structure',
            6: 'Sinusoidal interference patterns',
            7: 'Octahedral crystal structure'
        };

        const coreDesc = {
            0: 'Pure base geometry',
            1: 'Wrapped in 4D hypersphere using warpHypersphereCore()',
            2: 'Wrapped in 4D hypertetrahedron using warpHypertetraCore()'
        };

        return `${baseDesc[baseIndex]}. ${coreDesc[coreIndex]}`;
    }

    /**
     * Get parameter schema
     */
    getParameterSchema() {
        return {
            schema: schemaRegistry.getSchema('parameters'),
            usage: 'Validate parameters using this schema before setting them',
            suggested_next_actions: ['set_rotation', 'set_visual_parameters']
        };
    }

    /**
     * Get SDK context for agent onboarding
     */
    getSDKContext() {
        return {
            sdk_name: 'VIB3+ SDK',
            version: '1.9.0',
            purpose: 'General-purpose 4D rotation visualization SDK for plugins, extensions, wearables, and agentic use',

            quick_reference: {
                active_visualization_systems: 3,
                placeholder_systems: 1,
                rotation_planes: 6,
                base_geometries: 8,
                core_warp_types: 3,
                total_geometries: 24,
                canvas_layers_per_system: 5
            },

            systems: {
                ACTIVE: [
                    { name: 'quantum', description: 'Complex quantum lattice visualizations with 24 geometries' },
                    { name: 'faceted', description: 'Clean 2D geometric patterns with 4D rotation' },
                    { name: 'holographic', description: '5-layer audio-reactive holographic effects' }
                ],
                PLACEHOLDER_TBD: [
                    { name: 'polychora', status: 'TBD', description: '4D polytopes - placeholder, not production ready' }
                ]
            },

            geometry_encoding: {
                formula: 'geometry_index = core_index * 8 + base_index',
                base_geometries: ['tetrahedron', 'hypercube', 'sphere', 'torus', 'klein_bottle', 'fractal', 'wave', 'crystal'],
                core_types: ['base (0)', 'hypersphere (1)', 'hypertetrahedron (2)'],
                example: 'geometry 10 = hypersphere(sphere) because 1*8+2=10'
            },

            rotation_planes: {
                total: 6,
                '3D_space': ['XY', 'XZ', 'YZ'],
                '4D_hyperspace': ['XW', 'YW', 'ZW'],
                range: '-6.28 to 6.28 radians'
            },

            canvas_layers: {
                count: 5,
                names: ['background', 'shadow', 'content', 'highlight', 'accent']
            },

            knowledge_quiz: {
                IMPORTANT: 'Call verify_knowledge with multiple choice answers (a/b/c/d) to confirm understanding',
                questions: [
                    'Q1: How many rotation planes? a)3 b)4 c)6 d)8',
                    'Q2: Geometry encoding formula? a)base*3+core b)core*8+base c)base+core d)core*base',
                    'Q3: Canvas layers per system? a)3 b)4 c)5 d)6',
                    'Q4: Which are the 3 ACTIVE systems? a)quantum,faceted,holographic b)quantum,faceted,polychora c)all four d)none',
                    'Q5: How many base geometry types? a)6 b)8 c)10 d)24',
                    'Q6: Core warp types? a)base,sphere,cube b)base,hypersphere,hypertetrahedron c)2D,3D,4D d)none'
                ]
            },

            documentation: {
                primary: 'DOCS/SYSTEM_INVENTORY.md',
                geometry: '24-GEOMETRY-6D-ROTATION-SUMMARY.md',
                controls: 'DOCS/CONTROL_REFERENCE.md',
                cli: 'DOCS/CLI_ONBOARDING.md'
            },

            suggested_next_actions: ['verify_knowledge', 'create_4d_visualization', 'search_geometries']
        };
    }

    /**
     * Verify agent knowledge of SDK (multiple choice)
     */
    verifyKnowledge(answers) {
        const correctAnswers = {
            q1_rotation_planes: 'c',      // 6 rotation planes
            q2_geometry_formula: 'b',     // core*8+base
            q3_canvas_layers: 'c',        // 5 layers
            q4_active_systems: 'a',       // quantum, faceted, holographic (polychora is TBD)
            q5_base_geometries: 'b',      // 8 base geometries
            q6_core_types: 'b'            // base, hypersphere, hypertetrahedron
        };

        const docReferences = {
            q1_rotation_planes: {
                topic: '6D ROTATION SYSTEM',
                doc: 'DOCS/SYSTEM_INVENTORY.md#the-6d-rotation-system',
                reason: '6 planes: XY, XZ, YZ (3D) + XW, YW, ZW (4D hyperspace)'
            },
            q2_geometry_formula: {
                topic: 'GEOMETRY ENCODING',
                doc: '24-GEOMETRY-6D-ROTATION-SUMMARY.md',
                reason: 'geometry = coreIndex * 8 + baseIndex. Example: 10 = 1*8+2 = hypersphere+sphere'
            },
            q3_canvas_layers: {
                topic: 'CANVAS LAYER SYSTEM',
                doc: 'DOCS/SYSTEM_INVENTORY.md#the-4-visualization-systems',
                reason: '5 layers: background, shadow, content, highlight, accent'
            },
            q4_active_systems: {
                topic: 'ACTIVE VS PLACEHOLDER SYSTEMS',
                doc: 'DOCS/SYSTEM_INVENTORY.md',
                reason: 'Only 3 ACTIVE: quantum, faceted, holographic. Polychora is TBD/placeholder!'
            },
            q5_base_geometries: {
                topic: 'BASE GEOMETRY TYPES',
                doc: '24-GEOMETRY-6D-ROTATION-SUMMARY.md',
                reason: '8 base: tetrahedron, hypercube, sphere, torus, klein, fractal, wave, crystal'
            },
            q6_core_types: {
                topic: 'CORE WARP TYPES',
                doc: '24-GEOMETRY-6D-ROTATION-SUMMARY.md',
                reason: '3 cores: base (no warp), hypersphere, hypertetrahedron'
            }
        };

        const results = {
            score: 0,
            max_score: 6,
            details: [],
            REVIEW_REQUIRED: []
        };

        // Check each answer
        for (const [question, correct] of Object.entries(correctAnswers)) {
            const given = answers[question]?.toLowerCase?.() || answers[question];
            if (given === correct) {
                results.score++;
                results.details.push({ question, status: '✓ CORRECT' });
            } else if (given !== undefined) {
                results.details.push({
                    question,
                    status: '✗ WRONG',
                    your_answer: given,
                    correct_answer: correct
                });
                results.REVIEW_REQUIRED.push(docReferences[question]);
            }
        }

        results.percentage = Math.round((results.score / results.max_score) * 100);

        // Build response
        if (results.REVIEW_REQUIRED.length > 0) {
            results.MESSAGE = `Score: ${results.score}/${results.max_score}. YOU MAY PROCEED but PLEASE review the topics below to avoid errors.`;
            results.URGENT = results.REVIEW_REQUIRED.map(ref => ({
                TOPIC: ref.topic,
                READ: ref.doc,
                WHY: ref.reason
            }));
        } else {
            results.MESSAGE = `PERFECT SCORE! You understand the VIB3+ SDK architecture.`;
        }

        results.suggested_next_actions = ['create_4d_visualization', 'get_state', 'search_geometries'];

        return results;
    }

    /**
     * Get available tools (for progressive disclosure)
     */
    listTools(includeSchemas = false) {
        if (includeSchemas) {
            return getToolList();
        }

        return Object.keys(toolDefinitions).map(name => ({
            name,
            description: toolDefinitions[name].description
        }));
    }

    // ===== REACTIVITY HANDLERS (Phase 6.5) =====

    /**
     * Set reactivity configuration
     */
    setReactivityConfig(args) {
        const { audio, tilt, interaction } = args;

        // Update via global reactivity manager if available (browser only)
        const isBrowser = typeof window !== 'undefined';
        if (isBrowser && window.reactivityManager) {
            if (audio) {
                if (audio.enabled !== undefined) window.audioEnabled = audio.enabled;
                if (audio.globalSensitivity !== undefined) {
                    window.reactivityManager.setAudioSensitivity?.(audio.globalSensitivity);
                }
            }
            if (tilt) {
                if (tilt.enabled !== undefined) window.toggleDeviceTilt?.();
                if (tilt.dramaticMode !== undefined) {
                    window.setDramaticMode?.(tilt.dramaticMode);
                }
            }
            if (interaction) {
                if (interaction.mouseMode) window.setMouseMode?.(interaction.mouseMode);
                if (interaction.clickMode) window.setClickMode?.(interaction.clickMode);
                if (interaction.scrollMode) window.setScrollMode?.(interaction.scrollMode);
            }
        }

        telemetry.recordEvent(EventType.PARAMETER_CHANGE, { type: 'reactivity' });

        return {
            updated: true,
            config: { audio: audio || {}, tilt: tilt || {}, interaction: interaction || {} },
            suggested_next_actions: ['get_reactivity_config', 'apply_behavior_preset']
        };
    }

    /**
     * Get current reactivity configuration
     */
    getReactivityConfig() {
        const isBrowser = typeof window !== 'undefined';
        return {
            config: {
                audio: {
                    enabled: isBrowser ? (window.audioEnabled || false) : false,
                    globalSensitivity: isBrowser ? (window.reactivityManager?.audioSensitivity || 1.0) : 1.0
                },
                tilt: {
                    enabled: isBrowser ? (window.deviceTiltHandler?.isEnabled || false) : false,
                    dramaticMode: isBrowser ? (window.dramaticMode || false) : false
                },
                interaction: {
                    enabled: isBrowser ? (window.interactivityEnabled !== false) : true,
                    mouseMode: isBrowser ? (window.currentMouseMode || 'rotation') : 'rotation',
                    clickMode: isBrowser ? (window.currentClickMode || 'burst') : 'burst',
                    scrollMode: isBrowser ? (window.currentScrollMode || 'cycle') : 'cycle'
                }
            },
            suggested_next_actions: ['set_reactivity_config', 'configure_audio_band', 'apply_behavior_preset']
        };
    }

    /**
     * Configure a single audio band
     */
    configureAudioBand(args) {
        const { band, enabled, sensitivity, targets } = args;

        const isBrowser = typeof window !== 'undefined';
        if (isBrowser && window.reactivityManager?.configureAudioBand) {
            window.reactivityManager.configureAudioBand(band, { enabled, sensitivity, targets });
        }

        telemetry.recordEvent(EventType.PARAMETER_CHANGE, { type: 'audio_band', band });

        return {
            band,
            updated: true,
            config: { enabled, sensitivity, targets },
            suggested_next_actions: ['get_reactivity_config', 'configure_audio_band']
        };
    }

    // ===== EXPORT HANDLERS (Phase 6.5) =====

    /**
     * Export VIB3Package
     */
    exportPackage(args) {
        const { name, description, includeReactivity = true, includeEmbed = true, format = 'json' } = args;

        const visualParams = this.getState()?.parameters || {};
        const isBrowser = typeof window !== 'undefined';
        const system = isBrowser ? (window.currentSystem || 'quantum') : 'quantum';
        const reactivityConfig = includeReactivity ? this.getReactivityConfig().config : null;

        const package_ = {
            id: generateId('pkg'),
            version: '2.0',
            type: 'vib3-package',
            name: name || `VIB3 ${system} Export`,
            description: description || 'Exported visualization package',
            created: new Date().toISOString(),
            system,
            visual: {
                parameters: visualParams,
                geometry: {
                    index: visualParams.geometry || 0,
                    coreIndex: Math.floor((visualParams.geometry || 0) / 8),
                    baseIndex: (visualParams.geometry || 0) % 8
                }
            }
        };

        if (includeReactivity && reactivityConfig) package_.reactivity = reactivityConfig;
        if (includeEmbed) {
            package_.embed = {
                html: `<div id="vib3-container" data-package="${package_.id}"></div>`,
                js: `VIB3.loadPackage(${JSON.stringify(package_.id)});`,
                iframe: `<iframe src="https://vib3.app/embed/${package_.id}" width="100%" height="400"></iframe>`
            };
        }

        return { package: package_, format, suggested_next_actions: ['save_to_gallery', 'apply_behavior_preset'] };
    }

    // ===== PRESET HANDLERS (Phase 6.6) =====

    static BEHAVIOR_PRESETS = {
        ambient: {
            name: 'Ambient',
            description: 'Calm, slow, minimal reactivity - perfect for backgrounds',
            config: {
                audio: { enabled: false },
                tilt: { enabled: true, sensitivity: 0.3, dramaticMode: false },
                interaction: { mouseMode: 'shimmer', clickMode: 'none', scrollMode: 'none' }
            },
            visualOverrides: { speed: 0.3, chaos: 0.1 }
        },
        reactive: {
            name: 'Reactive',
            description: 'High audio reactivity - responds to music/sound',
            config: {
                audio: { enabled: true, globalSensitivity: 1.5 },
                tilt: { enabled: false },
                interaction: { mouseMode: 'rotation', clickMode: 'burst', scrollMode: 'cycle' }
            },
            visualOverrides: { speed: 1.0, chaos: 0.3 }
        },
        immersive: {
            name: 'Immersive',
            description: 'Full tilt control with dramatic rotations',
            config: {
                audio: { enabled: true, globalSensitivity: 0.8 },
                tilt: { enabled: true, sensitivity: 1.0, dramaticMode: true },
                interaction: { mouseMode: 'velocity', clickMode: 'ripple', scrollMode: 'zoom' }
            },
            visualOverrides: { speed: 0.8 }
        },
        energetic: {
            name: 'Energetic',
            description: 'Fast, chaotic, high-energy visuals',
            config: {
                audio: { enabled: true, globalSensitivity: 2.0 },
                tilt: { enabled: true, sensitivity: 1.5, dramaticMode: true },
                interaction: { mouseMode: 'velocity', clickMode: 'blast', scrollMode: 'wave' }
            },
            visualOverrides: { speed: 2.5, chaos: 0.8, morphFactor: 1.5 }
        },
        calm: {
            name: 'Calm',
            description: 'Slow, smooth, meditative patterns',
            config: {
                audio: { enabled: false },
                tilt: { enabled: true, sensitivity: 0.2, dramaticMode: false },
                interaction: { mouseMode: 'shimmer', clickMode: 'pulse', scrollMode: 'none' }
            },
            visualOverrides: { speed: 0.2, chaos: 0.05, morphFactor: 0.3 }
        },
        cinematic: {
            name: 'Cinematic',
            description: 'Dramatic rotations, smooth transitions for video',
            config: {
                audio: { enabled: false },
                tilt: { enabled: false },
                interaction: { mouseMode: 'none', clickMode: 'none', scrollMode: 'none' }
            },
            visualOverrides: { speed: 0.5, chaos: 0.2 }
        }
    };

    /**
     * Apply a behavior preset
     */
    applyBehaviorPreset(args) {
        const { preset } = args;
        const presetConfig = MCPServer.BEHAVIOR_PRESETS[preset];

        if (!presetConfig) {
            return {
                error: {
                    type: 'ValidationError',
                    code: 'INVALID_PRESET',
                    message: `Unknown preset: ${preset}`,
                    valid_options: Object.keys(MCPServer.BEHAVIOR_PRESETS)
                }
            };
        }

        this.setReactivityConfig(presetConfig.config);

        if (presetConfig.visualOverrides && this.engine) {
            for (const [param, value] of Object.entries(presetConfig.visualOverrides)) {
                this.engine.setParameter(param, value);
            }
        }

        telemetry.recordEvent(EventType.PARAMETER_CHANGE, { type: 'preset', preset });

        return {
            preset,
            applied: true,
            name: presetConfig.name,
            description: presetConfig.description,
            config: presetConfig.config,
            visualOverrides: presetConfig.visualOverrides,
            suggested_next_actions: ['get_reactivity_config', 'set_visual_parameters', 'export_package']
        };
    }

    /**
     * List available behavior presets
     */
    listBehaviorPresets() {
        return {
            count: Object.keys(MCPServer.BEHAVIOR_PRESETS).length,
            presets: Object.entries(MCPServer.BEHAVIOR_PRESETS).map(([key, value]) => ({
                id: key,
                name: value.name,
                description: value.description
            })),
            suggested_next_actions: ['apply_behavior_preset']
        };
    }
}

// Singleton instance
export const mcpServer = new MCPServer();
export default mcpServer;
