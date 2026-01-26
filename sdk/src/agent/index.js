/**
 * VIB3+ Agent Module
 * Agentic integration layer with MCP server, telemetry, and CLI
 */

// Telemetry - Core
export {
    TelemetryService,
    TelemetrySpan,
    EventType,
    SpanStatus,
    withTelemetry,
    withTelemetrySync,
    telemetry
} from './telemetry/index.js';

// Telemetry - Exporters
export {
    PrometheusExporter,
    JSONExporter,
    NDJSONExporter,
    ConsoleExporter,
    createExporter
} from './telemetry/index.js';

// Telemetry - Event Streaming
export {
    StreamEventType,
    EventStreamServer,
    EventStreamClient,
    SSEConnection,
    createSSEHandler,
    connectTelemetryToStream
} from './telemetry/index.js';

// Telemetry - Instrumentation
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
} from './telemetry/index.js';

// MCP
export {
    MCPServer,
    mcpServer,
    toolDefinitions,
    getToolList,
    getToolNames,
    getTool,
    validateToolInput
} from './mcp/index.js';

// CLI
export {
    AgentCLI,
    BatchExecutor,
    CommandType,
    ResponseStatus,
    createStreamingCLI
} from './cli/index.js';

// Default exports
export { telemetry } from './telemetry/index.js';
export { mcpServer } from './mcp/index.js';
