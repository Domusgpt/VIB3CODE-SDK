/**
 * EventStream.js - Server-Sent Events (SSE) System for Real-time Telemetry
 *
 * Provides real-time streaming of telemetry events to connected agents.
 * Supports multiple channels, filtering, and backpressure handling.
 */

import { EventEmitter } from 'events';

/**
 * Event types for the stream
 */
export const StreamEventType = {
    TELEMETRY: 'telemetry',
    SPAN_START: 'span:start',
    SPAN_END: 'span:end',
    METRIC: 'metric',
    ERROR: 'error',
    HEARTBEAT: 'heartbeat',
    SYSTEM: 'system'
};

/**
 * SSE Event Stream Server
 *
 * Creates an SSE endpoint for streaming telemetry to agents.
 */
export class EventStreamServer extends EventEmitter {
    constructor(options = {}) {
        super();

        /** @type {Map<string, SSEConnection>} */
        this.connections = new Map();

        /** @type {number} Connection ID counter */
        this.connectionIdCounter = 0;

        /** @type {number} Heartbeat interval (ms) */
        this.heartbeatInterval = options.heartbeatInterval || 30000;

        /** @type {number} Max connections */
        this.maxConnections = options.maxConnections || 100;

        /** @type {number} Buffer size for each connection */
        this.bufferSize = options.bufferSize || 100;

        /** @type {boolean} Enable compression */
        this.enableCompression = options.enableCompression || false;

        /** @type {NodeJS.Timeout|null} */
        this._heartbeatTimer = null;

        /** @type {Array<{event: object, timestamp: number}>} */
        this._replayBuffer = [];

        /** @type {number} Replay buffer max size */
        this._replayBufferSize = options.replayBufferSize || 1000;

        this._startHeartbeat();
    }

    /**
     * Handle incoming SSE connection request
     * @param {object} req - HTTP request
     * @param {object} res - HTTP response
     * @param {object} options - Connection options
     * @returns {string} Connection ID
     */
    handleConnection(req, res, options = {}) {
        if (this.connections.size >= this.maxConnections) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('Max connections reached');
            return null;
        }

        const connectionId = `conn_${++this.connectionIdCounter}_${Date.now()}`;

        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': options.cors || '*',
            'X-Accel-Buffering': 'no' // Disable nginx buffering
        });

        // Create connection object
        const connection = new SSEConnection({
            id: connectionId,
            response: res,
            filters: options.filters || {},
            channels: options.channels || ['*'],
            bufferSize: this.bufferSize
        });

        this.connections.set(connectionId, connection);

        // Send initial connection event
        connection.send({
            type: StreamEventType.SYSTEM,
            event: 'connected',
            connectionId,
            timestamp: new Date().toISOString()
        });

        // Handle replay request
        if (options.replay && options.lastEventId) {
            this._replayEvents(connection, options.lastEventId);
        }

        // Handle disconnect
        req.on('close', () => {
            this.connections.delete(connectionId);
            this.emit('disconnect', connectionId);
        });

        this.emit('connect', connectionId, connection);
        return connectionId;
    }

    /**
     * Broadcast event to all connections
     * @param {object} event - Event to broadcast
     * @param {string} channel - Optional channel filter
     */
    broadcast(event, channel = 'default') {
        const envelope = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            channel,
            timestamp: new Date().toISOString(),
            ...event
        };

        // Add to replay buffer
        this._addToReplayBuffer(envelope);

        // Send to all matching connections
        for (const connection of this.connections.values()) {
            if (connection.matchesChannel(channel) && connection.matchesFilters(event)) {
                connection.send(envelope);
            }
        }

        this.emit('broadcast', envelope);
    }

    /**
     * Send event to specific connection
     * @param {string} connectionId
     * @param {object} event
     */
    sendTo(connectionId, event) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.send({
                id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                ...event
            });
        }
    }

    /**
     * Stream telemetry event
     * @param {object} telemetryEvent - From TelemetryService
     */
    streamTelemetry(telemetryEvent) {
        this.broadcast({
            type: StreamEventType.TELEMETRY,
            data: telemetryEvent
        }, 'telemetry');
    }

    /**
     * Stream span start
     * @param {object} span
     */
    streamSpanStart(span) {
        this.broadcast({
            type: StreamEventType.SPAN_START,
            data: {
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId,
                name: span.name,
                startTime: span.startTime,
                attributes: span.attributes
            }
        }, 'spans');
    }

    /**
     * Stream span end
     * @param {object} span
     */
    streamSpanEnd(span) {
        this.broadcast({
            type: StreamEventType.SPAN_END,
            data: {
                traceId: span.traceId,
                spanId: span.spanId,
                name: span.name,
                status: span.status,
                durationMs: span.durationMs,
                endTime: span.endTime
            }
        }, 'spans');
    }

    /**
     * Stream metric update
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {object} labels - Metric labels
     */
    streamMetric(name, value, labels = {}) {
        this.broadcast({
            type: StreamEventType.METRIC,
            data: { name, value, labels }
        }, 'metrics');
    }

    /**
     * Stream error
     * @param {Error|object} error
     */
    streamError(error) {
        this.broadcast({
            type: StreamEventType.ERROR,
            data: {
                message: error.message || String(error),
                stack: error.stack,
                code: error.code
            }
        }, 'errors');
    }

    /**
     * Get connection count
     */
    get connectionCount() {
        return this.connections.size;
    }

    /**
     * Get all connection IDs
     */
    getConnectionIds() {
        return Array.from(this.connections.keys());
    }

    /**
     * Close specific connection
     * @param {string} connectionId
     */
    closeConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.close();
            this.connections.delete(connectionId);
        }
    }

    /**
     * Close all connections and stop server
     */
    close() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }

        for (const connection of this.connections.values()) {
            connection.close();
        }
        this.connections.clear();
        this._replayBuffer = [];
    }

    /**
     * Start heartbeat timer
     * @private
     */
    _startHeartbeat() {
        this._heartbeatTimer = setInterval(() => {
            const heartbeat = {
                type: StreamEventType.HEARTBEAT,
                timestamp: new Date().toISOString(),
                connections: this.connections.size
            };

            for (const connection of this.connections.values()) {
                connection.send(heartbeat);
            }
        }, this.heartbeatInterval);
    }

    /**
     * Add event to replay buffer
     * @private
     */
    _addToReplayBuffer(event) {
        this._replayBuffer.push({
            event,
            timestamp: Date.now()
        });

        // Trim buffer if needed
        if (this._replayBuffer.length > this._replayBufferSize) {
            this._replayBuffer.shift();
        }
    }

    /**
     * Replay missed events to connection
     * @private
     */
    _replayEvents(connection, lastEventId) {
        // Find events after lastEventId
        let found = false;
        for (const { event } of this._replayBuffer) {
            if (found) {
                connection.send(event);
            } else if (event.id === lastEventId) {
                found = true;
            }
        }
    }
}

/**
 * Individual SSE Connection
 */
export class SSEConnection {
    constructor(options) {
        this.id = options.id;
        this.response = options.response;
        this.filters = options.filters;
        this.channels = new Set(options.channels);
        this.bufferSize = options.bufferSize;

        /** @type {Array<object>} Pending events buffer */
        this._buffer = [];

        /** @type {boolean} */
        this._closed = false;

        /** @type {number} Events sent counter */
        this.eventsSent = 0;

        /** @type {number} Creation time */
        this.createdAt = Date.now();
    }

    /**
     * Send event to connection
     * @param {object} event
     */
    send(event) {
        if (this._closed) return;

        try {
            const data = this._formatSSE(event);
            this.response.write(data);
            this.eventsSent++;
        } catch (err) {
            // Connection likely closed
            this._closed = true;
        }
    }

    /**
     * Check if connection subscribes to channel
     * @param {string} channel
     */
    matchesChannel(channel) {
        return this.channels.has('*') || this.channels.has(channel);
    }

    /**
     * Check if event matches connection filters
     * @param {object} event
     */
    matchesFilters(event) {
        for (const [key, value] of Object.entries(this.filters)) {
            if (event[key] !== undefined && event[key] !== value) {
                return false;
            }
            // Check nested data
            if (event.data && event.data[key] !== undefined && event.data[key] !== value) {
                return false;
            }
        }
        return true;
    }

    /**
     * Close connection
     */
    close() {
        if (!this._closed) {
            this._closed = true;
            try {
                this.response.end();
            } catch {
                // Already closed
            }
        }
    }

    /**
     * Format event as SSE
     * @private
     */
    _formatSSE(event) {
        let output = '';

        if (event.id) {
            output += `id: ${event.id}\n`;
        }

        if (event.type) {
            output += `event: ${event.type}\n`;
        }

        // Serialize data
        const data = JSON.stringify(event);
        output += `data: ${data}\n\n`;

        return output;
    }
}

/**
 * Client-side EventStream consumer
 *
 * For browser/Node.js clients to consume SSE streams.
 */
export class EventStreamClient extends EventEmitter {
    constructor(url, options = {}) {
        super();

        this.url = url;
        this.options = options;

        /** @type {EventSource|null} */
        this._source = null;

        /** @type {string|null} */
        this._lastEventId = null;

        /** @type {boolean} */
        this._reconnecting = false;

        /** @type {number} */
        this._reconnectAttempts = 0;

        /** @type {number} */
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

        /** @type {number} Base reconnect delay (ms) */
        this.reconnectDelay = options.reconnectDelay || 1000;
    }

    /**
     * Connect to event stream
     */
    connect() {
        if (typeof EventSource === 'undefined') {
            throw new Error('EventSource not available in this environment');
        }

        const urlWithParams = new URL(this.url);

        // Add channels if specified
        if (this.options.channels) {
            urlWithParams.searchParams.set('channels', this.options.channels.join(','));
        }

        // Add last event ID for replay
        if (this._lastEventId) {
            urlWithParams.searchParams.set('lastEventId', this._lastEventId);
        }

        this._source = new EventSource(urlWithParams.toString());

        this._source.onopen = () => {
            this._reconnectAttempts = 0;
            this.emit('open');
        };

        this._source.onerror = (err) => {
            this.emit('error', err);
            this._handleReconnect();
        };

        this._source.onmessage = (event) => {
            this._handleMessage(event);
        };

        // Listen for specific event types
        for (const type of Object.values(StreamEventType)) {
            this._source.addEventListener(type, (event) => {
                this._handleMessage(event);
            });
        }
    }

    /**
     * Disconnect from stream
     */
    disconnect() {
        if (this._source) {
            this._source.close();
            this._source = null;
        }
        this._reconnecting = false;
    }

    /**
     * Handle incoming message
     * @private
     */
    _handleMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Track last event ID
            if (data.id) {
                this._lastEventId = data.id;
            }

            // Emit typed event
            if (data.type) {
                this.emit(data.type, data);
            }

            // Also emit generic message
            this.emit('message', data);

        } catch (err) {
            this.emit('parse-error', err, event.data);
        }
    }

    /**
     * Handle reconnection with exponential backoff
     * @private
     */
    _handleReconnect() {
        if (this._reconnecting) return;
        if (this._reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('max-reconnect');
            return;
        }

        this._reconnecting = true;
        this._reconnectAttempts++;

        const delay = this.reconnectDelay * Math.pow(2, this._reconnectAttempts - 1);

        setTimeout(() => {
            this._reconnecting = false;
            this.connect();
        }, delay);
    }

    /**
     * Get connection state
     */
    get readyState() {
        return this._source?.readyState ?? -1;
    }

    /**
     * Check if connected
     */
    get isConnected() {
        return this._source?.readyState === 1; // EventSource.OPEN
    }
}

/**
 * Create HTTP handler for SSE endpoint
 *
 * Use with Express, Koa, or native http server.
 *
 * @param {EventStreamServer} server
 * @returns {function} HTTP handler
 */
export function createSSEHandler(server) {
    return (req, res) => {
        // Parse query parameters
        const url = new URL(req.url, `http://${req.headers.host}`);
        const channels = url.searchParams.get('channels')?.split(',') || ['*'];
        const lastEventId = url.searchParams.get('lastEventId') ||
                           req.headers['last-event-id'];

        // Parse filters from query
        const filters = {};
        for (const [key, value] of url.searchParams) {
            if (!['channels', 'lastEventId'].includes(key)) {
                filters[key] = value;
            }
        }

        server.handleConnection(req, res, {
            channels,
            filters,
            replay: !!lastEventId,
            lastEventId
        });
    };
}

/**
 * Integration helper: Connect TelemetryService to EventStream
 *
 * @param {object} telemetryService - TelemetryService instance
 * @param {EventStreamServer} streamServer - EventStreamServer instance
 */
export function connectTelemetryToStream(telemetryService, streamServer) {
    // Wrap original methods to stream events
    const originalRecordEvent = telemetryService.recordEvent?.bind(telemetryService);
    const originalStartSpan = telemetryService.startSpan?.bind(telemetryService);
    const originalEndSpan = telemetryService.endSpan?.bind(telemetryService);

    if (originalRecordEvent) {
        telemetryService.recordEvent = function(...args) {
            const result = originalRecordEvent(...args);
            const event = telemetryService.events?.[telemetryService.events.length - 1];
            if (event) {
                streamServer.streamTelemetry(event);
            }
            return result;
        };
    }

    if (originalStartSpan) {
        telemetryService.startSpan = function(...args) {
            const span = originalStartSpan(...args);
            streamServer.streamSpanStart(span);
            return span;
        };
    }

    if (originalEndSpan) {
        telemetryService.endSpan = function(...args) {
            const result = originalEndSpan(...args);
            const span = telemetryService.activeSpans?.get(args[0]) ||
                        telemetryService._spans?.find(s => s.spanId === args[0]);
            if (span) {
                streamServer.streamSpanEnd(span);
            }
            return result;
        };
    }

    return streamServer;
}

export default {
    StreamEventType,
    EventStreamServer,
    EventStreamClient,
    SSEConnection,
    createSSEHandler,
    connectTelemetryToStream
};
