/**
 * VIB3+ Telemetry Service
 * OpenTelemetry-compatible event tracing for agentic operations
 */

/**
 * Event types following OpenTelemetry semantic conventions
 */
export const EventType = {
    // Tool operations
    TOOL_INVOCATION_START: 'vib3.tool.invocation.start',
    TOOL_INVOCATION_END: 'vib3.tool.invocation.end',
    TOOL_INVOCATION_ERROR: 'vib3.tool.invocation.error',

    // Rendering
    RENDER_FRAME_START: 'vib3.render.frame.start',
    RENDER_FRAME_END: 'vib3.render.frame.end',
    RENDER_CONTEXT_LOST: 'vib3.render.context.lost',
    RENDER_CONTEXT_RESTORED: 'vib3.render.context.restored',

    // Parameter changes
    PARAMETER_CHANGE: 'vib3.parameter.change',
    PARAMETER_BATCH_CHANGE: 'vib3.parameter.batch_change',
    PARAMETER_RANDOMIZE: 'vib3.parameter.randomize',
    PARAMETER_RESET: 'vib3.parameter.reset',

    // System operations
    SYSTEM_SWITCH: 'vib3.system.switch',
    SYSTEM_INITIALIZE: 'vib3.system.initialize',
    SYSTEM_DESTROY: 'vib3.system.destroy',

    // Geometry
    GEOMETRY_CHANGE: 'vib3.geometry.change',
    GEOMETRY_GENERATE: 'vib3.geometry.generate',

    // Gallery
    GALLERY_SAVE: 'vib3.gallery.save',
    GALLERY_LOAD: 'vib3.gallery.load',
    GALLERY_EXPORT: 'vib3.gallery.export',

    // Resources
    RESOURCE_ALLOCATE: 'vib3.resource.allocate',
    RESOURCE_DISPOSE: 'vib3.resource.dispose',
    GPU_MEMORY_WARNING: 'vib3.gpu.memory.warning'
};

/**
 * Span status following OpenTelemetry conventions
 */
export const SpanStatus = {
    UNSET: 'UNSET',
    OK: 'OK',
    ERROR: 'ERROR'
};

/**
 * Generate unique trace/span IDs
 */
function generateId(length = 16) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * Telemetry span for tracking operation duration
 */
export class TelemetrySpan {
    constructor(name, traceId, parentSpanId = null, attributes = {}) {
        this.name = name;
        this.traceId = traceId;
        this.spanId = generateId(16);
        this.parentSpanId = parentSpanId;
        this.startTime = performance.now();
        this.endTime = null;
        this.status = SpanStatus.UNSET;
        this.attributes = { ...attributes };
        this.events = [];
    }

    /**
     * Add an event to this span
     */
    addEvent(name, attributes = {}) {
        this.events.push({
            name,
            timestamp: performance.now(),
            attributes
        });
        return this;
    }

    /**
     * Set span attribute
     */
    setAttribute(key, value) {
        this.attributes[key] = value;
        return this;
    }

    /**
     * Set multiple attributes
     */
    setAttributes(attrs) {
        Object.assign(this.attributes, attrs);
        return this;
    }

    /**
     * Set span status
     */
    setStatus(status, message = null) {
        this.status = status;
        if (message) {
            this.statusMessage = message;
        }
        return this;
    }

    /**
     * End the span
     */
    end() {
        this.endTime = performance.now();
        this.durationMs = this.endTime - this.startTime;
        return this;
    }

    /**
     * Export to JSON for logging/transmission
     */
    toJSON() {
        return {
            name: this.name,
            traceId: this.traceId,
            spanId: this.spanId,
            parentSpanId: this.parentSpanId,
            startTime: this.startTime,
            endTime: this.endTime,
            durationMs: this.durationMs,
            status: this.status,
            statusMessage: this.statusMessage,
            attributes: this.attributes,
            events: this.events
        };
    }
}

/**
 * Main Telemetry Service
 */
export class TelemetryService {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'vib3-engine';
        this.serviceVersion = options.serviceVersion || '1.0.0';
        this.enabled = options.enabled !== false;
        this.bufferSize = options.bufferSize || 100;
        this.flushInterval = options.flushInterval || 5000;

        // Event buffer for batching
        this.eventBuffer = [];
        this.spanBuffer = [];

        // Listeners for real-time event streaming
        this.listeners = new Map();

        // Metrics
        this.metrics = {
            toolInvocations: 0,
            toolErrors: 0,
            framesRendered: 0,
            parameterChanges: 0,
            systemSwitches: 0,
            totalDurationMs: 0
        };

        // Current trace context
        this.currentTraceId = null;

        // Flush timer
        if (this.enabled && this.flushInterval > 0) {
            this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
        }
    }

    /**
     * Start a new trace
     */
    startTrace() {
        this.currentTraceId = generateId(32);
        return this.currentTraceId;
    }

    /**
     * Get current trace ID or create one
     */
    getTraceId() {
        if (!this.currentTraceId) {
            this.startTrace();
        }
        return this.currentTraceId;
    }

    /**
     * Create a new span
     */
    createSpan(name, attributes = {}, parentSpanId = null) {
        if (!this.enabled) return new TelemetrySpan(name, 'disabled');

        const span = new TelemetrySpan(
            name,
            this.getTraceId(),
            parentSpanId,
            {
                'service.name': this.serviceName,
                'service.version': this.serviceVersion,
                ...attributes
            }
        );

        return span;
    }

    /**
     * Record a completed span
     */
    recordSpan(span) {
        if (!this.enabled) return;

        this.spanBuffer.push(span.toJSON());
        this.emit('span', span.toJSON());

        // Update metrics based on span
        this.updateMetrics(span);

        // Flush if buffer full
        if (this.spanBuffer.length >= this.bufferSize) {
            this.flush();
        }
    }

    /**
     * Record an event
     */
    recordEvent(type, attributes = {}) {
        if (!this.enabled) return;

        const event = {
            type,
            timestamp: new Date().toISOString(),
            timestampMs: performance.now(),
            traceId: this.getTraceId(),
            attributes: {
                'service.name': this.serviceName,
                ...attributes
            }
        };

        this.eventBuffer.push(event);
        this.emit('event', event);

        // Update metrics
        this.updateMetricsFromEvent(type);

        // Flush if buffer full
        if (this.eventBuffer.length >= this.bufferSize) {
            this.flush();
        }

        return event;
    }

    /**
     * Update metrics based on span
     */
    updateMetrics(span) {
        if (span.name.startsWith('tool.')) {
            this.metrics.toolInvocations++;
            if (span.status === SpanStatus.ERROR) {
                this.metrics.toolErrors++;
            }
        }
        if (span.durationMs) {
            this.metrics.totalDurationMs += span.durationMs;
        }
    }

    /**
     * Update metrics from event type
     */
    updateMetricsFromEvent(type) {
        switch (type) {
            case EventType.RENDER_FRAME_END:
                this.metrics.framesRendered++;
                break;
            case EventType.PARAMETER_CHANGE:
            case EventType.PARAMETER_BATCH_CHANGE:
                this.metrics.parameterChanges++;
                break;
            case EventType.SYSTEM_SWITCH:
                this.metrics.systemSwitches++;
                break;
            case EventType.TOOL_INVOCATION_ERROR:
                this.metrics.toolErrors++;
                break;
        }
    }

    /**
     * Subscribe to telemetry events
     */
    subscribe(eventType, callback) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        this.listeners.get(eventType).add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(eventType)?.delete(callback);
        };
    }

    /**
     * Emit event to listeners
     */
    emit(eventType, data) {
        // Emit to specific type listeners
        this.listeners.get(eventType)?.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('Telemetry listener error:', e);
            }
        });

        // Emit to 'all' listeners
        this.listeners.get('all')?.forEach(cb => {
            try {
                cb({ type: eventType, data });
            } catch (e) {
                console.error('Telemetry listener error:', e);
            }
        });
    }

    /**
     * Flush buffered events (e.g., to external service)
     */
    flush() {
        if (this.eventBuffer.length === 0 && this.spanBuffer.length === 0) {
            return;
        }

        const payload = {
            events: [...this.eventBuffer],
            spans: [...this.spanBuffer],
            metrics: { ...this.metrics },
            flushedAt: new Date().toISOString()
        };

        // Clear buffers
        this.eventBuffer = [];
        this.spanBuffer = [];

        // Emit flush event for external handlers
        this.emit('flush', payload);

        return payload;
    }

    /**
     * Get current metrics snapshot
     */
    getMetrics() {
        return {
            ...this.metrics,
            bufferSize: this.eventBuffer.length + this.spanBuffer.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            toolInvocations: 0,
            toolErrors: 0,
            framesRendered: 0,
            parameterChanges: 0,
            systemSwitches: 0,
            totalDurationMs: 0
        };
    }

    /**
     * Enable/disable telemetry
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Destroy service
     */
    destroy() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flush();
        this.listeners.clear();
    }
}

// Convenience functions for common operations

/**
 * Wrap an async operation with telemetry
 */
export async function withTelemetry(service, operationName, fn, attributes = {}) {
    const span = service.createSpan(operationName, attributes);

    try {
        const result = await fn();
        span.setStatus(SpanStatus.OK);
        return result;
    } catch (error) {
        span.setStatus(SpanStatus.ERROR, error.message);
        span.setAttribute('error.type', error.name);
        span.setAttribute('error.message', error.message);
        throw error;
    } finally {
        span.end();
        service.recordSpan(span);
    }
}

/**
 * Wrap a sync operation with telemetry
 */
export function withTelemetrySync(service, operationName, fn, attributes = {}) {
    const span = service.createSpan(operationName, attributes);

    try {
        const result = fn();
        span.setStatus(SpanStatus.OK);
        return result;
    } catch (error) {
        span.setStatus(SpanStatus.ERROR, error.message);
        span.setAttribute('error.type', error.name);
        span.setAttribute('error.message', error.message);
        throw error;
    } finally {
        span.end();
        service.recordSpan(span);
    }
}

// Singleton instance
export const telemetry = new TelemetryService();
export default telemetry;
