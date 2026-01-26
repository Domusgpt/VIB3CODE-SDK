/**
 * VIB3+ MCP Tool Definitions
 * Workflow-oriented tools for agentic API consumption
 */

import { schemaRegistry } from '../../schemas/index.js';

/**
 * Tool definitions following MCP specification
 * Granularity matches workflows, not individual API endpoints
 */
export const toolDefinitions = {
    // Scene Management
    create_4d_visualization: {
        name: 'create_4d_visualization',
        description: 'Creates a complete 4D visualization scene with specified geometry and projection. Returns scene ID and metadata for subsequent operations.',
        inputSchema: {
            type: 'object',
            properties: {
                system: {
                    type: 'string',
                    enum: ['quantum', 'faceted', 'holographic'],
                    description: 'Visualization system to use'
                },
                geometry_index: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 23,
                    description: 'Geometry index: 0-7 base, 8-15 hypersphere core, 16-23 hypertetrahedron core'
                },
                projection: {
                    type: 'string',
                    enum: ['perspective', 'stereographic', 'orthographic'],
                    default: 'perspective',
                    description: 'Projection method for 4D to 3D mapping'
                }
            },
            required: ['system']
        }
    },

    set_rotation: {
        name: 'set_rotation',
        description: 'Sets 6D rotation angles across all six rotation planes. XY/XZ/YZ are 3D rotations, XW/YW/ZW are 4D hyperspace rotations that create inside-out effects.',
        inputSchema: {
            type: 'object',
            properties: {
                XY: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'X-Y plane rotation (radians)' },
                XZ: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'X-Z plane rotation (radians)' },
                YZ: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'Y-Z plane rotation (radians)' },
                XW: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'X-W hyperplane rotation (radians)' },
                YW: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'Y-W hyperplane rotation (radians)' },
                ZW: { type: 'number', minimum: -6.28, maximum: 6.28, description: 'Z-W hyperplane rotation (radians)' }
            }
        }
    },

    set_visual_parameters: {
        name: 'set_visual_parameters',
        description: 'Adjusts visual rendering parameters like color, speed, chaos, and morphing. Returns updated state.',
        inputSchema: {
            type: 'object',
            properties: {
                hue: { type: 'integer', minimum: 0, maximum: 360, description: 'Base color hue in degrees' },
                saturation: { type: 'number', minimum: 0, maximum: 1, description: 'Color saturation' },
                intensity: { type: 'number', minimum: 0, maximum: 1, description: 'Brightness/intensity' },
                speed: { type: 'number', minimum: 0.1, maximum: 3, description: 'Animation speed multiplier' },
                chaos: { type: 'number', minimum: 0, maximum: 1, description: 'Randomization/turbulence' },
                morphFactor: { type: 'number', minimum: 0, maximum: 2, description: 'Shape transformation factor' },
                gridDensity: { type: 'number', minimum: 4, maximum: 100, description: 'Geometric detail level' },
                dimension: { type: 'number', minimum: 3.0, maximum: 4.5, description: 'Dimensional interpolation' }
            }
        }
    },

    switch_system: {
        name: 'switch_system',
        description: 'Switches between visualization systems (quantum, faceted, holographic). Destroys old system and creates new one.',
        inputSchema: {
            type: 'object',
            properties: {
                system: {
                    type: 'string',
                    enum: ['quantum', 'faceted', 'holographic'],
                    description: 'Target visualization system'
                }
            },
            required: ['system']
        }
    },

    change_geometry: {
        name: 'change_geometry',
        description: 'Changes the active geometry type. Supports 24 geometries: 8 base types x 3 core modes (base, hypersphere, hypertetrahedron).',
        inputSchema: {
            type: 'object',
            properties: {
                geometry_index: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 23,
                    description: 'Geometry index (0-7: base, 8-15: hypersphere core, 16-23: hypertetrahedron core)'
                },
                base_type: {
                    type: 'string',
                    enum: ['tetrahedron', 'hypercube', 'sphere', 'torus', 'klein_bottle', 'fractal', 'wave', 'crystal'],
                    description: 'Alternative: specify base geometry by name'
                },
                core_type: {
                    type: 'string',
                    enum: ['base', 'hypersphere', 'hypertetrahedron'],
                    default: 'base',
                    description: 'Core transformation to apply'
                }
            }
        }
    },

    get_state: {
        name: 'get_state',
        description: 'Returns complete current state including system, geometry, all parameters, and render info.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },

    randomize_parameters: {
        name: 'randomize_parameters',
        description: 'Randomizes all parameters for creative exploration. Returns new state.',
        inputSchema: {
            type: 'object',
            properties: {
                preserve_system: {
                    type: 'boolean',
                    default: true,
                    description: 'Keep current system, only randomize visual params'
                },
                preserve_geometry: {
                    type: 'boolean',
                    default: false,
                    description: 'Keep current geometry, only randomize other params'
                }
            }
        }
    },

    reset_parameters: {
        name: 'reset_parameters',
        description: 'Resets all parameters to default values.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },

    // Gallery Operations
    save_to_gallery: {
        name: 'save_to_gallery',
        description: 'Saves current state to a gallery slot (0-99). Slots 0-29 are defaults, 30-99 are custom.',
        inputSchema: {
            type: 'object',
            properties: {
                slot: {
                    type: 'integer',
                    minimum: 30,
                    maximum: 99,
                    description: 'Gallery slot to save to (30-99 for custom)'
                },
                name: {
                    type: 'string',
                    description: 'Optional name for the variation'
                }
            },
            required: ['slot']
        }
    },

    load_from_gallery: {
        name: 'load_from_gallery',
        description: 'Loads a saved variation from gallery slot.',
        inputSchema: {
            type: 'object',
            properties: {
                slot: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 99,
                    description: 'Gallery slot to load from'
                }
            },
            required: ['slot']
        }
    },

    // Query Tools
    search_geometries: {
        name: 'search_geometries',
        description: 'Returns list of available geometries with their properties. Use to discover geometry options.',
        inputSchema: {
            type: 'object',
            properties: {
                core_type: {
                    type: 'string',
                    enum: ['base', 'hypersphere', 'hypertetrahedron', 'all'],
                    default: 'all',
                    description: 'Filter by core type'
                }
            }
        }
    },

    get_parameter_schema: {
        name: 'get_parameter_schema',
        description: 'Returns full JSON schema for parameters with valid ranges and descriptions.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },

    // ===== REACTIVITY TOOLS (Phase 6.5) =====

    set_reactivity_config: {
        name: 'set_reactivity_config',
        description: 'Set complete reactivity configuration for audio/tilt/interaction behavior. This controls how the visualization responds to audio input, device motion, and user interaction.',
        inputSchema: {
            type: 'object',
            properties: {
                audio: {
                    type: 'object',
                    description: 'Audio reactivity configuration',
                    properties: {
                        enabled: { type: 'boolean', description: 'Enable audio reactivity' },
                        globalSensitivity: { type: 'number', minimum: 0.1, maximum: 3.0, description: 'Overall audio sensitivity' }
                    }
                },
                tilt: {
                    type: 'object',
                    description: 'Device tilt configuration',
                    properties: {
                        enabled: { type: 'boolean', description: 'Enable tilt reactivity' },
                        sensitivity: { type: 'number', minimum: 0.1, maximum: 3.0, description: 'Tilt sensitivity' },
                        dramaticMode: { type: 'boolean', description: 'Enable dramatic (8x) mode' }
                    }
                },
                interaction: {
                    type: 'object',
                    description: 'Mouse/touch interaction configuration',
                    properties: {
                        enabled: { type: 'boolean', description: 'Enable interaction' },
                        mouseMode: { type: 'string', enum: ['rotation', 'velocity', 'shimmer', 'attract', 'repel', 'none'] },
                        clickMode: { type: 'string', enum: ['burst', 'blast', 'ripple', 'pulse', 'none'] },
                        scrollMode: { type: 'string', enum: ['cycle', 'wave', 'sweep', 'zoom', 'morph', 'none'] }
                    }
                }
            }
        }
    },

    get_reactivity_config: {
        name: 'get_reactivity_config',
        description: 'Get current reactivity configuration including audio, tilt, and interaction settings.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },

    configure_audio_band: {
        name: 'configure_audio_band',
        description: 'Configure a single audio frequency band (bass, mid, or high) with target parameter mappings.',
        inputSchema: {
            type: 'object',
            properties: {
                band: {
                    type: 'string',
                    enum: ['bass', 'mid', 'high'],
                    description: 'Frequency band to configure'
                },
                enabled: { type: 'boolean', description: 'Enable this band' },
                sensitivity: { type: 'number', minimum: 0.1, maximum: 3.0, description: 'Band sensitivity' },
                targets: {
                    type: 'array',
                    description: 'Parameter targets for this band',
                    items: {
                        type: 'object',
                        properties: {
                            param: { type: 'string', description: 'Target parameter name (e.g., morphFactor, chaos, speed)' },
                            weight: { type: 'number', description: 'Effect weight/strength' },
                            mode: { type: 'string', enum: ['add', 'multiply', 'replace', 'max', 'min'], default: 'add' }
                        }
                    }
                }
            },
            required: ['band']
        }
    },

    // ===== EXPORT TOOLS (Phase 6.5) =====

    export_package: {
        name: 'export_package',
        description: 'Export complete VIB3Package with visual state, reactivity config, and embed code. The package is self-contained and portable.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Package name' },
                description: { type: 'string', description: 'Package description' },
                includeReactivity: { type: 'boolean', default: true, description: 'Include reactivity configuration' },
                includeEmbed: { type: 'boolean', default: true, description: 'Include embed code (HTML/JS/CSS)' },
                format: {
                    type: 'string',
                    enum: ['json', 'html', 'webcomponent'],
                    default: 'json',
                    description: 'Export format'
                }
            }
        }
    },

    // ===== PRESET TOOLS (Phase 6.6) =====

    apply_behavior_preset: {
        name: 'apply_behavior_preset',
        description: 'Apply a named behavior preset that configures reactivity for common use cases.',
        inputSchema: {
            type: 'object',
            properties: {
                preset: {
                    type: 'string',
                    enum: ['ambient', 'reactive', 'immersive', 'energetic', 'calm', 'cinematic'],
                    description: 'Preset name: ambient (minimal), reactive (audio-driven), immersive (full tilt), energetic (high speed), calm (slow/smooth), cinematic (dramatic rotations)'
                }
            },
            required: ['preset']
        }
    },

    list_behavior_presets: {
        name: 'list_behavior_presets',
        description: 'List all available behavior presets with descriptions.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
};

/**
 * Get all tool definitions as array for MCP registration
 */
export function getToolList() {
    return Object.values(toolDefinitions);
}

/**
 * Get tool names only (for progressive disclosure)
 */
export function getToolNames() {
    return Object.keys(toolDefinitions);
}

/**
 * Get single tool definition by name
 */
export function getTool(name) {
    return toolDefinitions[name] || null;
}

/**
 * Validate tool input against schema
 */
export function validateToolInput(toolName, input) {
    const tool = toolDefinitions[toolName];
    if (!tool) {
        return {
            valid: false,
            error: {
                type: 'NotFoundError',
                code: 'TOOL_NOT_FOUND',
                message: `Tool '${toolName}' not found`,
                valid_options: Object.keys(toolDefinitions),
                suggestion: 'Use get_parameter_schema or search_geometries to discover available tools'
            }
        };
    }

    // Basic validation - full validation would use AJV
    const required = tool.inputSchema.required || [];
    for (const field of required) {
        if (!(field in input)) {
            return {
                valid: false,
                error: {
                    type: 'ValidationError',
                    code: 'MISSING_REQUIRED_FIELD',
                    message: `Missing required field: ${field}`,
                    parameter: field,
                    suggestion: `Provide the '${field}' parameter`
                }
            };
        }
    }

    return { valid: true };
}

export default toolDefinitions;
