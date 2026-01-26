#!/usr/bin/env node
/**
 * VIB3+ CLI
 * Agent-friendly command-line interface with JSON output mode
 */

import { performance } from 'node:perf_hooks';
import { mcpServer, toolDefinitions } from '../agent/index.js';
import { schemaRegistry } from '../schemas/index.js';

/**
 * CLI Configuration
 */
const CLI_VERSION = '1.0.0';
const CLI_NAME = 'vib3';

/**
 * Exit codes following standard conventions
 */
const ExitCode = {
    SUCCESS: 0,
    ERROR: 1,
    INVALID_ARGS: 2,
    NOT_FOUND: 3,
    VALIDATION_ERROR: 4
};

/**
 * Parse command line arguments
 */
function parseArgs(args) {
    const parsed = {
        command: null,
        subcommand: null,
        options: {},
        positional: [],
        flags: {
            json: false,
            help: false,
            version: false,
            noInteractive: false,
            verbose: false
        }
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === '--json' || arg === '-j') {
            parsed.flags.json = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.flags.help = true;
        } else if (arg === '--version' || arg === '-v') {
            parsed.flags.version = true;
        } else if (arg === '--no-interactive') {
            parsed.flags.noInteractive = true;
        } else if (arg === '--verbose') {
            parsed.flags.verbose = true;
        } else if (arg.startsWith('--')) {
            // Parse --key=value or --key value
            const [key, ...valueParts] = arg.slice(2).split('=');
            if (valueParts.length > 0) {
                parsed.options[key] = valueParts.join('=');
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                parsed.options[key] = args[++i];
            } else {
                parsed.options[key] = true;
            }
        } else if (arg.startsWith('-')) {
            // Short options
            const key = arg.slice(1);
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                parsed.options[key] = args[++i];
            } else {
                parsed.options[key] = true;
            }
        } else if (!parsed.command) {
            parsed.command = arg;
        } else if (!parsed.subcommand) {
            parsed.subcommand = arg;
        } else {
            parsed.positional.push(arg);
        }

        i++;
    }

    return parsed;
}

/**
 * Output formatter
 */
function output(data, isJson) {
    if (isJson) {
        console.log(JSON.stringify(data, null, 2));
    } else {
        if (typeof data === 'string') {
            console.log(data);
        } else if (data.error) {
            console.error(`Error [${data.error.code}]: ${data.error.message}`);
            if (data.error.suggestion) {
                console.error(`Suggestion: ${data.error.suggestion}`);
            }
        } else {
            console.log(formatHumanReadable(data));
        }
    }
}

function wrapResponse(operation, data = {}, success = true, durationMs = null) {
    return {
        success,
        operation,
        timestamp: new Date().toISOString(),
        duration_ms: durationMs ?? undefined,
        ...data
    };
}

function validateResponseEnvelope(response) {
    const validation = schemaRegistry.validate('toolResponse', response);
    if (!validation.valid) {
        return { ...response, validation_errors: validation.errors };
    }
    return response;
}

/**
 * Format data for human-readable output
 */
function formatHumanReadable(data) {
    const lines = [];

    if (data.success !== undefined) {
        lines.push(`Status: ${data.success ? 'SUCCESS' : 'FAILED'}`);
    }
    if (data.operation) {
        lines.push(`Operation: ${data.operation}`);
    }
    if (data.scene_id) {
        lines.push(`Scene ID: ${data.scene_id}`);
    }
    if (data.system) {
        lines.push(`System: ${data.system}`);
    }
    if (data.geometry) {
        lines.push(`Geometry: ${data.geometry.base_type} (${data.geometry.core_type}) [index: ${data.geometry.index}]`);
    }
    if (data.rotation_state) {
        const r = data.rotation_state;
        lines.push(`Rotation: XY=${r.XY?.toFixed(2)}, XZ=${r.XZ?.toFixed(2)}, YZ=${r.YZ?.toFixed(2)}, XW=${r.XW?.toFixed(2)}, YW=${r.YW?.toFixed(2)}, ZW=${r.ZW?.toFixed(2)}`);
    }
    if (data.suggested_next_actions?.length) {
        lines.push(`Next actions: ${data.suggested_next_actions.join(', ')}`);
    }
    if (data.duration_ms !== undefined) {
        lines.push(`Duration: ${data.duration_ms.toFixed(2)}ms`);
    }

    return lines.join('\n');
}

/**
 * Show help
 */
function showHelp(isJson) {
    const help = {
        name: CLI_NAME,
        version: CLI_VERSION,
        description: 'VIB3+ 4D Visualization Engine CLI',
        usage: `${CLI_NAME} <command> [options]`,
        commands: {
            create: 'Create a new 4D visualization',
            state: 'Get current engine state',
            set: 'Set parameters (rotation, visual)',
            geometry: 'Change or list geometries',
            system: 'Switch visualization system',
            randomize: 'Randomize all parameters',
            reset: 'Reset to default parameters',
            tools: 'List available MCP tools',
            validate: 'Validate manifests, packs, and configs'
        },
        options: {
            '--json, -j': 'Output in JSON format (agent-friendly)',
            '--help, -h': 'Show this help message',
            '--version, -v': 'Show version',
            '--no-interactive': 'Disable interactive prompts',
            '--verbose': 'Verbose output'
        },
        examples: [
            `${CLI_NAME} create --system quantum --geometry 8 --json`,
            `${CLI_NAME} set rotation --XW 1.5 --YW 0.5`,
            `${CLI_NAME} set visual --hue 200 --chaos 0.3`,
            `${CLI_NAME} geometry list --core-type hypersphere`,
            `${CLI_NAME} state --json`,
            `${CLI_NAME} tools --json`,
            `${CLI_NAME} validate pack scene.vib3 --json`,
            `${CLI_NAME} validate manifest extension.json`
        ]
    };

    output(help, isJson);
}

/**
 * Show version
 */
function showVersion(isJson) {
    const version = {
        name: CLI_NAME,
        version: CLI_VERSION,
        node: process.version,
        platform: process.platform
    };

    if (isJson) {
        output(version, true);
    } else {
        console.log(`${CLI_NAME} v${CLI_VERSION}`);
    }
}

/**
 * Handle 'create' command
 */
async function handleCreate(parsed) {
    const args = {
        system: parsed.options.system || 'quantum',
        geometry_index: parseInt(parsed.options.geometry || '0'),
        projection: parsed.options.projection || 'perspective'
    };

    return await mcpServer.handleToolCall('create_4d_visualization', args);
}

/**
 * Handle 'state' command
 */
async function handleState(parsed) {
    return await mcpServer.handleToolCall('get_state', {});
}

/**
 * Handle 'set' command
 */
async function handleSet(parsed, startTime) {
    const subcommand = parsed.subcommand;

    if (subcommand === 'rotation') {
        const args = {};
        if (parsed.options.XY) args.XY = parseFloat(parsed.options.XY);
        if (parsed.options.XZ) args.XZ = parseFloat(parsed.options.XZ);
        if (parsed.options.YZ) args.YZ = parseFloat(parsed.options.YZ);
        if (parsed.options.XW) args.XW = parseFloat(parsed.options.XW);
        if (parsed.options.YW) args.YW = parseFloat(parsed.options.YW);
        if (parsed.options.ZW) args.ZW = parseFloat(parsed.options.ZW);
        return await mcpServer.handleToolCall('set_rotation', args);
    }

    if (subcommand === 'visual') {
        const args = {};
        if (parsed.options.hue) args.hue = parseInt(parsed.options.hue);
        if (parsed.options.saturation) args.saturation = parseFloat(parsed.options.saturation);
        if (parsed.options.intensity) args.intensity = parseFloat(parsed.options.intensity);
        if (parsed.options.speed) args.speed = parseFloat(parsed.options.speed);
        if (parsed.options.chaos) args.chaos = parseFloat(parsed.options.chaos);
        if (parsed.options.morphFactor) args.morphFactor = parseFloat(parsed.options.morphFactor);
        if (parsed.options.gridDensity) args.gridDensity = parseFloat(parsed.options.gridDensity);
        if (parsed.options.dimension) args.dimension = parseFloat(parsed.options.dimension);
        return await mcpServer.handleToolCall('set_visual_parameters', args);
    }

    return wrapResponse('set_parameters', {
        error: {
            type: 'ValidationError',
            code: 'INVALID_SUBCOMMAND',
            message: `Unknown set subcommand: ${subcommand}`,
            valid_options: ['rotation', 'visual'],
            suggestion: 'Use "set rotation" or "set visual"'
        }
    }, false, performance.now() - startTime);
}

/**
 * Handle 'geometry' command
 */
async function handleGeometry(parsed, startTime) {
    const subcommand = parsed.subcommand || 'list';

    if (subcommand === 'list') {
        const args = {
            core_type: parsed.options['core-type'] || parsed.options.coreType || 'all'
        };
        return await mcpServer.handleToolCall('search_geometries', args);
    }

    if (subcommand === 'set' || !isNaN(parseInt(subcommand))) {
        const index = parseInt(parsed.subcommand) || parseInt(parsed.options.index || '0');
        return await mcpServer.handleToolCall('change_geometry', { geometry_index: index });
    }

    return wrapResponse('change_geometry', {
        error: {
            type: 'ValidationError',
            code: 'INVALID_SUBCOMMAND',
            message: `Unknown geometry subcommand: ${subcommand}`,
            valid_options: ['list', 'set', '<index>'],
            suggestion: 'Use "geometry list" or "geometry <index>"'
        }
    }, false, performance.now() - startTime);
}

/**
 * Handle 'system' command
 */
async function handleSystem(parsed, startTime) {
    const system = parsed.subcommand || parsed.options.system;

    if (!system) {
        return wrapResponse('switch_system', {
            error: {
                type: 'ValidationError',
                code: 'MISSING_SYSTEM',
                message: 'System name required',
                valid_options: ['quantum', 'faceted', 'holographic'],
                suggestion: 'Use "system quantum", "system faceted", or "system holographic"'
            }
        }, false, performance.now() - startTime);
    }

    return await mcpServer.handleToolCall('switch_system', { system });
}

/**
 * Handle 'randomize' command
 */
async function handleRandomize(parsed) {
    const args = {
        preserve_system: parsed.options['preserve-system'] === 'true',
        preserve_geometry: parsed.options['preserve-geometry'] === 'true'
    };
    return await mcpServer.handleToolCall('randomize_parameters', args);
}

/**
 * Handle 'reset' command
 */
async function handleReset(parsed) {
    return await mcpServer.handleToolCall('reset_parameters', {});
}

/**
 * Handle 'tools' command
 */
async function handleTools(parsed, startTime) {
    const includeSchemas = parsed.options.schemas === 'true' || parsed.options.full === 'true';
    const tools = mcpServer.listTools(includeSchemas);

    return wrapResponse('list_tools', {
        count: tools.length,
        tools
    }, true, performance.now() - startTime);
}

/**
 * Handle 'validate' command - validates manifests, packs, and configs
 */
async function handleValidate(parsed, startTime) {
    const subcommand = parsed.subcommand || 'pack';
    const filePath = parsed.options.file || parsed.options.f || parsed.positional[0];

    if (!filePath && subcommand !== 'schema') {
        return wrapResponse('validate', {
            error: {
                type: 'ValidationError',
                code: 'MISSING_FILE',
                message: 'File path required for validation',
                suggestion: 'Use --file <path> or provide file as positional argument'
            }
        }, false, performance.now() - startTime);
    }

    try {
        switch (subcommand) {
            case 'pack': {
                // Validate a .vib3 scene pack file
                const fs = await import('fs/promises');
                const content = await fs.readFile(filePath, 'utf-8');
                const pack = JSON.parse(content);

                const validation = schemaRegistry.validate('parameters', pack.parameters || pack);
                return wrapResponse('validate_pack', {
                    file: filePath,
                    valid: validation.valid,
                    errors: validation.errors || [],
                    schema: 'parameters'
                }, validation.valid, performance.now() - startTime);
            }

            case 'manifest': {
                // Validate extension/tool manifest
                const fs = await import('fs/promises');
                const content = await fs.readFile(filePath, 'utf-8');
                const manifest = JSON.parse(content);

                // Basic manifest structure validation
                const required = ['name', 'version', 'type'];
                const missing = required.filter(f => !manifest[f]);
                const valid = missing.length === 0;

                return wrapResponse('validate_manifest', {
                    file: filePath,
                    valid,
                    errors: missing.length > 0 ? [{ message: `Missing required fields: ${missing.join(', ')}` }] : [],
                    manifest_type: manifest.type || 'unknown',
                    name: manifest.name,
                    version: manifest.version
                }, valid, performance.now() - startTime);
            }

            case 'response': {
                // Validate a tool response envelope
                const fs = await import('fs/promises');
                const content = await fs.readFile(filePath, 'utf-8');
                const response = JSON.parse(content);

                const validation = schemaRegistry.validate('toolResponse', response);
                return wrapResponse('validate_response', {
                    file: filePath,
                    valid: validation.valid,
                    errors: validation.errors || [],
                    schema: 'toolResponse'
                }, validation.valid, performance.now() - startTime);
            }

            case 'schema': {
                // List available schemas
                const schemas = ['parameters', 'toolResponse', 'error'];
                return wrapResponse('list_schemas', {
                    schemas,
                    count: schemas.length
                }, true, performance.now() - startTime);
            }

            default:
                return wrapResponse('validate', {
                    error: {
                        type: 'ValidationError',
                        code: 'INVALID_SUBCOMMAND',
                        message: `Unknown validate subcommand: ${subcommand}`,
                        valid_options: ['pack', 'manifest', 'response', 'schema'],
                        suggestion: 'Use "validate pack <file>", "validate manifest <file>", or "validate schema"'
                    }
                }, false, performance.now() - startTime);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            return wrapResponse('validate', {
                error: {
                    type: 'NotFoundError',
                    code: 'FILE_NOT_FOUND',
                    message: `File not found: ${filePath}`,
                    suggestion: 'Check the file path and try again'
                }
            }, false, performance.now() - startTime);
        }

        if (error instanceof SyntaxError) {
            return wrapResponse('validate', {
                error: {
                    type: 'ValidationError',
                    code: 'INVALID_JSON',
                    message: `Invalid JSON in file: ${error.message}`,
                    suggestion: 'Ensure the file contains valid JSON'
                }
            }, false, performance.now() - startTime);
        }

        throw error;
    }
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);
    const parsed = parseArgs(args);

    // Handle global flags
    if (parsed.flags.version) {
        showVersion(parsed.flags.json);
        process.exit(ExitCode.SUCCESS);
    }

    if (parsed.flags.help || !parsed.command) {
        showHelp(parsed.flags.json);
        process.exit(parsed.command ? ExitCode.SUCCESS : ExitCode.INVALID_ARGS);
    }

    // Route to command handler
    let result;

    const startTime = performance.now();

    try {
        switch (parsed.command) {
            case 'create':
                result = await handleCreate(parsed);
                break;
            case 'state':
                result = await handleState(parsed);
                break;
            case 'set':
                result = await handleSet(parsed, startTime);
                break;
            case 'geometry':
                result = await handleGeometry(parsed, startTime);
                break;
            case 'system':
                result = await handleSystem(parsed, startTime);
                break;
            case 'randomize':
                result = await handleRandomize(parsed);
                break;
            case 'reset':
                result = await handleReset(parsed);
                break;
            case 'tools':
                result = await handleTools(parsed, startTime);
                break;
            case 'validate':
                result = await handleValidate(parsed, startTime);
                break;
            default:
                result = wrapResponse('get_state', {
                    error: {
                        type: 'NotFoundError',
                        code: 'UNKNOWN_COMMAND',
                        message: `Unknown command: ${parsed.command}`,
                        valid_options: ['create', 'state', 'set', 'geometry', 'system', 'randomize', 'reset', 'tools'],
                        suggestion: 'Run "vib3 --help" for available commands'
                    }
                }, false, performance.now() - startTime);
        }
    } catch (error) {
        result = wrapResponse(parsed.command || 'get_state', {
            error: {
                type: 'SystemError',
                code: 'EXECUTION_ERROR',
                message: error.message,
                suggestion: 'Check your command syntax and try again'
            }
        }, false, performance.now() - startTime);
    }

    const finalResult = parsed.flags.verbose ? validateResponseEnvelope(result) : result;
    output(finalResult, parsed.flags.json);

    // Exit with appropriate code
    if (finalResult.error || finalResult.success === false) {
        const code = {
            'ValidationError': ExitCode.VALIDATION_ERROR,
            'NotFoundError': ExitCode.NOT_FOUND,
            'SystemError': ExitCode.ERROR
        }[finalResult.error?.type] || ExitCode.ERROR;

        process.exit(code);
    }

    process.exit(ExitCode.SUCCESS);
}

// Run CLI
main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(ExitCode.ERROR);
});
