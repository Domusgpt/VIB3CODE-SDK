/**
 * VIB3+ Telemetry Module
 * Re-exports telemetry service and utilities
 */

// Core telemetry
export {
    TelemetryService,
    TelemetrySpan,
    EventType,
    SpanStatus,
    withTelemetry,
    withTelemetrySync,
    telemetry
} from './TelemetryService.js';

// Exporters
export {
    PrometheusExporter,
    JSONExporter,
    NDJSONExporter,
    ConsoleExporter,
    createExporter
} from './TelemetryExporters.js';

// Event streaming
export {
    StreamEventType,
    EventStreamServer,
    EventStreamClient,
    SSEConnection,
    createSSEHandler,
    connectTelemetryToStream
} from './EventStream.js';

// Instrumentation
export {
    configureTelemetry,
    getTelemetry,
    trace,
    traceFunction,
    traceAsyncIterable,
    instrumentClass,
    traceObject,
    withTiming,
    meter,
    traceBatch,
    TraceContext
} from './Instrumentation.js';

import { telemetry } from './TelemetryService.js';
export default telemetry;
