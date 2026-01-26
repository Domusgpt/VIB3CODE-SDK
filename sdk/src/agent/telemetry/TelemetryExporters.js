/**
 * TelemetryExporters.js - Export telemetry data in various formats
 *
 * Supports:
 * - Prometheus text format for metrics
 * - JSON format for structured logging
 * - OpenTelemetry Protocol (OTLP) JSON
 */

import { EventType, SpanStatus } from './TelemetryService.js';

/**
 * Prometheus metrics exporter
 */
export class PrometheusExporter {
    constructor(options = {}) {
        this.prefix = options.prefix || 'vib3';
        this.labels = options.labels || {};
    }

    /**
     * Export metrics in Prometheus text format
     * @param {object} metrics - Metrics from TelemetryService.getMetrics()
     * @returns {string} Prometheus-formatted metrics
     */
    export(metrics) {
        const lines = [];
        const timestamp = Date.now();

        // Add HELP and TYPE declarations
        lines.push(`# HELP ${this.prefix}_tool_invocations_total Total number of tool invocations`);
        lines.push(`# TYPE ${this.prefix}_tool_invocations_total counter`);
        lines.push(this._metric('tool_invocations_total', metrics.toolInvocations, timestamp));

        lines.push(`# HELP ${this.prefix}_tool_errors_total Total number of tool errors`);
        lines.push(`# TYPE ${this.prefix}_tool_errors_total counter`);
        lines.push(this._metric('tool_errors_total', metrics.toolErrors, timestamp));

        lines.push(`# HELP ${this.prefix}_frames_rendered_total Total frames rendered`);
        lines.push(`# TYPE ${this.prefix}_frames_rendered_total counter`);
        lines.push(this._metric('frames_rendered_total', metrics.framesRendered, timestamp));

        lines.push(`# HELP ${this.prefix}_parameter_changes_total Total parameter changes`);
        lines.push(`# TYPE ${this.prefix}_parameter_changes_total counter`);
        lines.push(this._metric('parameter_changes_total', metrics.parameterChanges, timestamp));

        lines.push(`# HELP ${this.prefix}_system_switches_total Total system switches`);
        lines.push(`# TYPE ${this.prefix}_system_switches_total counter`);
        lines.push(this._metric('system_switches_total', metrics.systemSwitches, timestamp));

        lines.push(`# HELP ${this.prefix}_operation_duration_ms_total Total operation duration in milliseconds`);
        lines.push(`# TYPE ${this.prefix}_operation_duration_ms_total counter`);
        lines.push(this._metric('operation_duration_ms_total', metrics.totalDurationMs, timestamp));

        lines.push(`# HELP ${this.prefix}_buffer_size Current event buffer size`);
        lines.push(`# TYPE ${this.prefix}_buffer_size gauge`);
        lines.push(this._metric('buffer_size', metrics.bufferSize, timestamp));

        // Error rate (calculated)
        if (metrics.toolInvocations > 0) {
            const errorRate = metrics.toolErrors / metrics.toolInvocations;
            lines.push(`# HELP ${this.prefix}_error_rate Current error rate`);
            lines.push(`# TYPE ${this.prefix}_error_rate gauge`);
            lines.push(this._metric('error_rate', errorRate, timestamp));
        }

        return lines.join('\n');
    }

    /**
     * Format single metric line
     * @private
     */
    _metric(name, value, timestamp) {
        const labels = Object.entries(this.labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');

        const labelStr = labels ? `{${labels}}` : '';
        return `${this.prefix}_${name}${labelStr} ${value} ${timestamp}`;
    }

    /**
     * Export histogram data
     * @param {string} name - Metric name
     * @param {number[]} values - Observed values
     * @param {number[]} buckets - Bucket boundaries
     */
    exportHistogram(name, values, buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000]) {
        const lines = [];
        const timestamp = Date.now();

        lines.push(`# HELP ${this.prefix}_${name} ${name} histogram`);
        lines.push(`# TYPE ${this.prefix}_${name} histogram`);

        const counts = new Array(buckets.length + 1).fill(0);
        let sum = 0;

        for (const v of values) {
            sum += v;
            for (let i = 0; i < buckets.length; i++) {
                if (v <= buckets[i]) {
                    counts[i]++;
                }
            }
            counts[buckets.length]++; // +Inf bucket
        }

        // Cumulative counts
        for (let i = 0; i < buckets.length; i++) {
            lines.push(`${this.prefix}_${name}_bucket{le="${buckets[i]}"} ${counts.slice(0, i + 1).reduce((a, b) => a + b, 0)} ${timestamp}`);
        }
        lines.push(`${this.prefix}_${name}_bucket{le="+Inf"} ${values.length} ${timestamp}`);
        lines.push(`${this.prefix}_${name}_sum ${sum} ${timestamp}`);
        lines.push(`${this.prefix}_${name}_count ${values.length} ${timestamp}`);

        return lines.join('\n');
    }
}

/**
 * JSON exporter for structured logging
 */
export class JSONExporter {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'vib3-engine';
        this.serviceVersion = options.serviceVersion || '1.0.0';
        this.pretty = options.pretty || false;
    }

    /**
     * Export metrics as JSON
     * @param {object} metrics
     * @returns {string}
     */
    exportMetrics(metrics) {
        const data = {
            '@timestamp': new Date().toISOString(),
            service: {
                name: this.serviceName,
                version: this.serviceVersion
            },
            metrics: {
                tool_invocations: metrics.toolInvocations,
                tool_errors: metrics.toolErrors,
                error_rate: metrics.toolInvocations > 0
                    ? metrics.toolErrors / metrics.toolInvocations
                    : 0,
                frames_rendered: metrics.framesRendered,
                parameter_changes: metrics.parameterChanges,
                system_switches: metrics.systemSwitches,
                total_duration_ms: metrics.totalDurationMs,
                buffer_size: metrics.bufferSize
            }
        };

        return this.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    /**
     * Export spans as JSON (OTLP-like format)
     * @param {object[]} spans
     * @returns {string}
     */
    exportSpans(spans) {
        const data = {
            resourceSpans: [{
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: this.serviceName } },
                        { key: 'service.version', value: { stringValue: this.serviceVersion } }
                    ]
                },
                scopeSpans: [{
                    scope: { name: 'vib3-telemetry' },
                    spans: spans.map(span => this._formatSpan(span))
                }]
            }]
        };

        return this.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    /**
     * Export events as JSON
     * @param {object[]} events
     * @returns {string}
     */
    exportEvents(events) {
        const data = {
            '@timestamp': new Date().toISOString(),
            service: this.serviceName,
            events: events.map(e => ({
                '@timestamp': e.timestamp,
                type: e.type,
                trace_id: e.traceId,
                attributes: e.attributes
            }))
        };

        return this.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    /**
     * Export full telemetry payload
     * @param {object} payload - From TelemetryService.flush()
     * @returns {string}
     */
    exportPayload(payload) {
        const data = {
            '@timestamp': payload.flushedAt,
            service: {
                name: this.serviceName,
                version: this.serviceVersion
            },
            metrics: payload.metrics,
            spans: payload.spans,
            events: payload.events
        };

        return this.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    /**
     * Format span for OTLP
     * @private
     */
    _formatSpan(span) {
        return {
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            name: span.name,
            kind: 1, // SPAN_KIND_INTERNAL
            startTimeUnixNano: Math.floor(span.startTime * 1000000).toString(),
            endTimeUnixNano: span.endTime ? Math.floor(span.endTime * 1000000).toString() : null,
            attributes: Object.entries(span.attributes || {}).map(([k, v]) => ({
                key: k,
                value: this._formatValue(v)
            })),
            events: (span.events || []).map(e => ({
                name: e.name,
                timeUnixNano: Math.floor(e.timestamp * 1000000).toString(),
                attributes: Object.entries(e.attributes || {}).map(([k, v]) => ({
                    key: k,
                    value: this._formatValue(v)
                }))
            })),
            status: {
                code: span.status === SpanStatus.ERROR ? 2 : span.status === SpanStatus.OK ? 1 : 0,
                message: span.statusMessage
            }
        };
    }

    /**
     * Format attribute value for OTLP
     * @private
     */
    _formatValue(v) {
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'number') {
            return Number.isInteger(v) ? { intValue: v.toString() } : { doubleValue: v };
        }
        if (typeof v === 'boolean') return { boolValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(x => this._formatValue(x)) } };
        return { stringValue: String(v) };
    }
}

/**
 * NDJSON (Newline Delimited JSON) exporter for streaming
 */
export class NDJSONExporter {
    constructor(options = {}) {
        this.serviceName = options.serviceName || 'vib3-engine';
    }

    /**
     * Export single event as NDJSON line
     * @param {object} event
     * @returns {string}
     */
    exportEvent(event) {
        return JSON.stringify({
            '@timestamp': event.timestamp || new Date().toISOString(),
            service: this.serviceName,
            type: event.type,
            trace_id: event.traceId,
            ...event.attributes
        });
    }

    /**
     * Export single span as NDJSON line
     * @param {object} span
     * @returns {string}
     */
    exportSpan(span) {
        return JSON.stringify({
            '@timestamp': new Date(span.startTime).toISOString(),
            service: this.serviceName,
            span_name: span.name,
            trace_id: span.traceId,
            span_id: span.spanId,
            parent_span_id: span.parentSpanId,
            duration_ms: span.durationMs,
            status: span.status,
            ...span.attributes
        });
    }

    /**
     * Export multiple items as NDJSON
     * @param {object[]} items
     * @param {string} type - 'event' or 'span'
     * @returns {string}
     */
    exportBatch(items, type = 'event') {
        const exportFn = type === 'span' ? this.exportSpan.bind(this) : this.exportEvent.bind(this);
        return items.map(exportFn).join('\n');
    }
}

/**
 * Console exporter for development
 */
export class ConsoleExporter {
    constructor(options = {}) {
        this.colorize = options.colorize !== false;
        this.verbose = options.verbose || false;
    }

    /**
     * Log event to console
     */
    logEvent(event) {
        const color = this._getColorForType(event.type);
        const prefix = this.colorize ? `${color}[${event.type}]${this._reset()}` : `[${event.type}]`;

        console.log(`${prefix} ${event.timestamp || new Date().toISOString()}`);

        if (this.verbose && event.attributes) {
            console.log('  Attributes:', JSON.stringify(event.attributes, null, 2));
        }
    }

    /**
     * Log span to console
     */
    logSpan(span) {
        const statusColor = span.status === SpanStatus.ERROR ? '\x1b[31m' :
                           span.status === SpanStatus.OK ? '\x1b[32m' : '\x1b[33m';
        const status = this.colorize ? `${statusColor}${span.status}${this._reset()}` : span.status;

        console.log(`[SPAN] ${span.name} - ${status} (${span.durationMs?.toFixed(2)}ms)`);

        if (this.verbose) {
            console.log(`  Trace: ${span.traceId}`);
            console.log(`  Span:  ${span.spanId}`);
            if (span.events?.length) {
                console.log(`  Events: ${span.events.length}`);
            }
        }
    }

    /**
     * Log metrics summary to console
     */
    logMetrics(metrics) {
        console.log('=== VIB3+ Metrics ===');
        console.log(`Tool Invocations: ${metrics.toolInvocations}`);
        console.log(`Tool Errors:      ${metrics.toolErrors}`);
        console.log(`Frames Rendered:  ${metrics.framesRendered}`);
        console.log(`Param Changes:    ${metrics.parameterChanges}`);
        console.log(`System Switches:  ${metrics.systemSwitches}`);
        console.log(`Total Duration:   ${metrics.totalDurationMs?.toFixed(2)}ms`);
        console.log(`Buffer Size:      ${metrics.bufferSize}`);
        console.log('=====================');
    }

    /**
     * Get ANSI color for event type
     * @private
     */
    _getColorForType(type) {
        if (type.includes('error')) return '\x1b[31m'; // Red
        if (type.includes('start')) return '\x1b[36m'; // Cyan
        if (type.includes('end')) return '\x1b[32m';   // Green
        if (type.includes('change')) return '\x1b[33m'; // Yellow
        return '\x1b[37m'; // White
    }

    /**
     * Reset ANSI color
     * @private
     */
    _reset() {
        return '\x1b[0m';
    }
}

/**
 * Create exporter factory
 */
export function createExporter(type, options = {}) {
    switch (type) {
        case 'prometheus':
            return new PrometheusExporter(options);
        case 'json':
            return new JSONExporter(options);
        case 'ndjson':
            return new NDJSONExporter(options);
        case 'console':
            return new ConsoleExporter(options);
        default:
            throw new Error(`Unknown exporter type: ${type}`);
    }
}

export default {
    PrometheusExporter,
    JSONExporter,
    NDJSONExporter,
    ConsoleExporter,
    createExporter
};
