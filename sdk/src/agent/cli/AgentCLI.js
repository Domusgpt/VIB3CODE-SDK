/**
 * AgentCLI.js - Command Line Interface for Agentic Integration
 *
 * Provides streaming and batch modes for agent control of VIB3+ engine.
 * Supports JSONL input/output for easy integration with LLM agents.
 */

import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import { telemetry, EventType } from '../telemetry/TelemetryService.js';
import {
    PrometheusExporter,
    JSONExporter,
    NDJSONExporter,
    ConsoleExporter
} from '../telemetry/TelemetryExporters.js';
import { EventStreamServer, connectTelemetryToStream } from '../telemetry/EventStream.js';

/**
 * CLI Command types
 */
export const CommandType = {
    // Engine commands
    SET_PARAMETER: 'set_parameter',
    GET_PARAMETER: 'get_parameter',
    SET_GEOMETRY: 'set_geometry',
    SET_SYSTEM: 'set_system',

    // Rotation commands
    ROTATE: 'rotate',
    RESET_ROTATION: 'reset_rotation',

    // Batch operations
    BATCH: 'batch',
    BATCH_ROTATE: 'batch_rotate',

    // Telemetry
    GET_METRICS: 'get_metrics',
    GET_SPANS: 'get_spans',
    FLUSH_TELEMETRY: 'flush_telemetry',

    // Control
    PING: 'ping',
    STATUS: 'status',
    HELP: 'help',
    QUIT: 'quit'
};

/**
 * Response status codes
 */
export const ResponseStatus = {
    OK: 'ok',
    ERROR: 'error',
    PARTIAL: 'partial'
};

/**
 * Agent CLI for VIB3+ Engine
 */
export class AgentCLI extends EventEmitter {
    constructor(engine, options = {}) {
        super();

        /** @type {object} VIB3+ Engine instance */
        this.engine = engine;

        /** @type {object} Options */
        this.options = {
            inputStream: options.inputStream || process.stdin,
            outputStream: options.outputStream || process.stdout,
            errorStream: options.errorStream || process.stderr,
            format: options.format || 'jsonl', // jsonl, json, text
            pretty: options.pretty || false,
            enableTelemetry: options.enableTelemetry !== false,
            ...options
        };

        /** @type {readline.Interface|null} */
        this._readline = null;

        /** @type {boolean} */
        this._running = false;

        /** @type {number} Command counter */
        this._commandCount = 0;

        /** @type {Map<string, Function>} Command handlers */
        this._handlers = new Map();

        /** @type {EventStreamServer|null} */
        this._streamServer = null;

        this._registerDefaultHandlers();
    }

    /**
     * Start CLI in streaming mode
     */
    start() {
        if (this._running) return;
        this._running = true;

        this._readline = createInterface({
            input: this.options.inputStream,
            output: this.options.outputStream,
            terminal: false
        });

        this._readline.on('line', (line) => {
            this._processLine(line);
        });

        this._readline.on('close', () => {
            this._running = false;
            this.emit('close');
        });

        // Send ready signal
        this._respond({
            type: 'ready',
            version: '1.7.0',
            commands: Object.values(CommandType)
        });

        if (this.options.enableTelemetry) {
            telemetry.recordEvent(EventType.TOOL_INVOCATION, {
                tool: 'AgentCLI',
                action: 'start'
            });
        }

        this.emit('start');
    }

    /**
     * Stop CLI
     */
    stop() {
        if (this._readline) {
            this._readline.close();
            this._readline = null;
        }
        this._running = false;
        this.emit('stop');
    }

    /**
     * Process input line
     * @private
     */
    async _processLine(line) {
        const trimmed = line.trim();
        if (!trimmed) return;

        let command;

        try {
            // Parse as JSON
            command = JSON.parse(trimmed);
        } catch {
            // Try as simple text command
            command = this._parseTextCommand(trimmed);
        }

        if (!command) {
            this._respond({
                status: ResponseStatus.ERROR,
                error: 'Invalid command format'
            });
            return;
        }

        // Process command
        await this._executeCommand(command);
    }

    /**
     * Parse simple text command
     * @private
     */
    _parseTextCommand(text) {
        const parts = text.split(/\s+/);
        const cmd = parts[0]?.toLowerCase();

        switch (cmd) {
            case 'ping':
                return { type: CommandType.PING };
            case 'status':
                return { type: CommandType.STATUS };
            case 'help':
                return { type: CommandType.HELP };
            case 'quit':
            case 'exit':
                return { type: CommandType.QUIT };
            case 'metrics':
                return { type: CommandType.GET_METRICS };
            case 'set':
                return {
                    type: CommandType.SET_PARAMETER,
                    param: parts[1],
                    value: parseFloat(parts[2]) || parts[2]
                };
            case 'get':
                return {
                    type: CommandType.GET_PARAMETER,
                    param: parts[1]
                };
            case 'rotate':
                return {
                    type: CommandType.ROTATE,
                    plane: parts[1],
                    angle: parseFloat(parts[2])
                };
            case 'geometry':
                return {
                    type: CommandType.SET_GEOMETRY,
                    index: parseInt(parts[1], 10)
                };
            case 'system':
                return {
                    type: CommandType.SET_SYSTEM,
                    system: parts[1]
                };
            default:
                return null;
        }
    }

    /**
     * Execute a command
     * @private
     */
    async _executeCommand(command) {
        this._commandCount++;
        const startTime = performance.now();

        const commandId = command.id || `cmd_${this._commandCount}`;

        try {
            const handler = this._handlers.get(command.type);

            if (!handler) {
                this._respond({
                    id: commandId,
                    status: ResponseStatus.ERROR,
                    error: `Unknown command type: ${command.type}`
                });
                return;
            }

            const result = await handler(command);

            const duration = performance.now() - startTime;

            this._respond({
                id: commandId,
                status: ResponseStatus.OK,
                result,
                durationMs: duration
            });

            if (this.options.enableTelemetry) {
                telemetry.recordEvent(EventType.TOOL_INVOCATION, {
                    tool: 'AgentCLI',
                    command: command.type,
                    durationMs: duration
                });
            }

        } catch (error) {
            const duration = performance.now() - startTime;

            this._respond({
                id: commandId,
                status: ResponseStatus.ERROR,
                error: error.message,
                durationMs: duration
            });

            if (this.options.enableTelemetry) {
                telemetry.recordEvent(EventType.TOOL_ERROR, {
                    tool: 'AgentCLI',
                    command: command.type,
                    error: error.message
                });
            }
        }
    }

    /**
     * Send response to output
     * @private
     */
    _respond(data) {
        let output;

        switch (this.options.format) {
            case 'json':
                output = this.options.pretty
                    ? JSON.stringify(data, null, 2)
                    : JSON.stringify(data);
                break;

            case 'text':
                output = this._formatAsText(data);
                break;

            case 'jsonl':
            default:
                output = JSON.stringify(data);
                break;
        }

        this.options.outputStream.write(output + '\n');
        this.emit('response', data);
    }

    /**
     * Format response as text
     * @private
     */
    _formatAsText(data) {
        if (data.status === ResponseStatus.ERROR) {
            return `ERROR: ${data.error}`;
        }

        if (data.type === 'ready') {
            return `VIB3+ CLI v${data.version} ready`;
        }

        if (data.result !== undefined) {
            if (typeof data.result === 'object') {
                return JSON.stringify(data.result);
            }
            return String(data.result);
        }

        return 'OK';
    }

    /**
     * Register default command handlers
     * @private
     */
    _registerDefaultHandlers() {
        // Ping
        this._handlers.set(CommandType.PING, () => ({
            pong: true,
            timestamp: new Date().toISOString()
        }));

        // Status
        this._handlers.set(CommandType.STATUS, () => ({
            running: this._running,
            commandsProcessed: this._commandCount,
            engine: this.engine ? {
                system: this.engine.currentSystem || 'unknown',
                geometry: this.engine.currentGeometry || 0
            } : null
        }));

        // Help
        this._handlers.set(CommandType.HELP, () => ({
            commands: Object.entries(CommandType).map(([name, type]) => ({
                name,
                type
            })),
            formats: ['jsonl', 'json', 'text']
        }));

        // Quit
        this._handlers.set(CommandType.QUIT, () => {
            setTimeout(() => this.stop(), 100);
            return { goodbye: true };
        });

        // Set parameter
        this._handlers.set(CommandType.SET_PARAMETER, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');
            if (!cmd.param) throw new Error('Missing param');

            this.engine.setParameter?.(cmd.param, cmd.value);
            return { param: cmd.param, value: cmd.value };
        });

        // Get parameter
        this._handlers.set(CommandType.GET_PARAMETER, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');
            if (!cmd.param) throw new Error('Missing param');

            const value = this.engine.getParameter?.(cmd.param);
            return { param: cmd.param, value };
        });

        // Set geometry
        this._handlers.set(CommandType.SET_GEOMETRY, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');

            const index = cmd.index ?? cmd.geometry;
            if (index === undefined) throw new Error('Missing geometry index');

            this.engine.setGeometry?.(index);
            return { geometry: index };
        });

        // Set system
        this._handlers.set(CommandType.SET_SYSTEM, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');
            if (!cmd.system) throw new Error('Missing system');

            this.engine.setSystem?.(cmd.system);
            return { system: cmd.system };
        });

        // Rotate
        this._handlers.set(CommandType.ROTATE, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');

            const plane = cmd.plane?.toUpperCase() || 'XW';
            const angle = cmd.angle ?? 0;

            this.engine.rotate?.(plane, angle);
            return { plane, angle };
        });

        // Reset rotation
        this._handlers.set(CommandType.RESET_ROTATION, () => {
            if (!this.engine) throw new Error('No engine connected');

            this.engine.resetRotation?.();
            return { reset: true };
        });

        // Batch
        this._handlers.set(CommandType.BATCH, async (cmd) => {
            if (!cmd.commands || !Array.isArray(cmd.commands)) {
                throw new Error('Missing commands array');
            }

            const results = [];
            let errors = 0;

            for (const subCmd of cmd.commands) {
                try {
                    const handler = this._handlers.get(subCmd.type);
                    if (handler) {
                        const result = await handler(subCmd);
                        results.push({ status: 'ok', result });
                    } else {
                        results.push({ status: 'error', error: 'Unknown command' });
                        errors++;
                    }
                } catch (err) {
                    results.push({ status: 'error', error: err.message });
                    errors++;
                }
            }

            return {
                total: cmd.commands.length,
                succeeded: cmd.commands.length - errors,
                failed: errors,
                results
            };
        });

        // Batch rotate
        this._handlers.set(CommandType.BATCH_ROTATE, (cmd) => {
            if (!this.engine) throw new Error('No engine connected');

            const rotations = cmd.rotations || {};

            for (const [plane, angle] of Object.entries(rotations)) {
                this.engine.rotate?.(plane.toUpperCase(), angle);
            }

            return { rotations };
        });

        // Get metrics
        this._handlers.set(CommandType.GET_METRICS, (cmd) => {
            const metrics = telemetry.getMetrics();

            if (cmd.format === 'prometheus') {
                const exporter = new PrometheusExporter();
                return { format: 'prometheus', data: exporter.export(metrics) };
            }

            return metrics;
        });

        // Get spans
        this._handlers.set(CommandType.GET_SPANS, () => {
            const spans = telemetry.getSpans?.() || [];
            return { count: spans.length, spans };
        });

        // Flush telemetry
        this._handlers.set(CommandType.FLUSH_TELEMETRY, () => {
            const payload = telemetry.flush();
            return payload;
        });
    }

    /**
     * Register custom command handler
     * @param {string} type - Command type
     * @param {Function} handler - Handler function
     */
    registerHandler(type, handler) {
        this._handlers.set(type, handler);
    }

    /**
     * Execute single command (for programmatic use)
     * @param {object} command
     * @returns {Promise<object>}
     */
    async execute(command) {
        const handler = this._handlers.get(command.type);
        if (!handler) {
            throw new Error(`Unknown command: ${command.type}`);
        }
        return handler(command);
    }
}

/**
 * Batch command executor
 */
export class BatchExecutor {
    constructor(cli) {
        this.cli = cli;
        this.queue = [];
        this.results = [];
    }

    /**
     * Add command to batch
     */
    add(command) {
        this.queue.push(command);
        return this;
    }

    /**
     * Execute all queued commands
     */
    async execute() {
        this.results = [];

        for (const cmd of this.queue) {
            try {
                const result = await this.cli.execute(cmd);
                this.results.push({ status: 'ok', command: cmd.type, result });
            } catch (err) {
                this.results.push({ status: 'error', command: cmd.type, error: err.message });
            }
        }

        this.queue = [];
        return this.results;
    }

    /**
     * Execute commands in parallel
     */
    async executeParallel() {
        const promises = this.queue.map(async (cmd) => {
            try {
                const result = await this.cli.execute(cmd);
                return { status: 'ok', command: cmd.type, result };
            } catch (err) {
                return { status: 'error', command: cmd.type, error: err.message };
            }
        });

        this.results = await Promise.all(promises);
        this.queue = [];
        return this.results;
    }
}

/**
 * Create CLI with SSE streaming
 */
export function createStreamingCLI(engine, httpServer, options = {}) {
    const cli = new AgentCLI(engine, options);
    const streamServer = new EventStreamServer(options.streamOptions);

    // Connect telemetry to stream
    connectTelemetryToStream(telemetry, streamServer);

    // Add stream endpoint to HTTP server
    if (httpServer) {
        httpServer.on('request', (req, res) => {
            if (req.url?.startsWith('/events')) {
                streamServer.handleConnection(req, res);
            }
        });
    }

    cli._streamServer = streamServer;

    return { cli, streamServer };
}

export default {
    AgentCLI,
    BatchExecutor,
    CommandType,
    ResponseStatus,
    createStreamingCLI
};
