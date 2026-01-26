/**
 * Instrumentation.js - Auto-tracing Decorators and Wrappers
 *
 * Provides decorators and utilities for automatic instrumentation
 * of functions, classes, and async operations.
 */

import { SpanStatus } from './TelemetryService.js';

/**
 * Default telemetry service reference (set via configure)
 * @type {object|null}
 */
let defaultTelemetry = null;

/**
 * Configure the default telemetry service
 * @param {object} telemetryService
 */
export function configureTelemetry(telemetryService) {
    defaultTelemetry = telemetryService;
}

/**
 * Get the current telemetry service
 */
export function getTelemetry() {
    return defaultTelemetry;
}

/**
 * Trace decorator factory for methods
 *
 * Usage:
 *   class MyClass {
 *     @trace('myOperation')
 *     async doSomething() { ... }
 *   }
 *
 * @param {string} spanName - Name for the span
 * @param {object} options - Tracing options
 */
export function trace(spanName, options = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const name = spanName || `${target.constructor?.name}.${propertyKey}`;

        descriptor.value = function(...args) {
            const telemetry = options.telemetry || defaultTelemetry;
            if (!telemetry) {
                return originalMethod.apply(this, args);
            }

            const attributes = {
                'code.function': propertyKey,
                'code.namespace': target.constructor?.name,
                ...options.attributes
            };

            // Add argument info if enabled
            if (options.traceArgs) {
                attributes['code.args.count'] = args.length;
                if (options.traceArgValues) {
                    args.forEach((arg, i) => {
                        attributes[`code.args.${i}`] = summarizeValue(arg);
                    });
                }
            }

            const span = telemetry.startSpan(name, attributes);

            try {
                const result = originalMethod.apply(this, args);

                // Handle promises
                if (result && typeof result.then === 'function') {
                    return result.then(
                        (value) => {
                            if (options.traceResult) {
                                telemetry.addSpanEvent(span.spanId, 'result', {
                                    value: summarizeValue(value)
                                });
                            }
                            telemetry.endSpan(span.spanId, SpanStatus.OK);
                            return value;
                        },
                        (error) => {
                            telemetry.recordSpanError(span.spanId, error);
                            telemetry.endSpan(span.spanId, SpanStatus.ERROR, error.message);
                            throw error;
                        }
                    );
                }

                // Sync result
                if (options.traceResult) {
                    telemetry.addSpanEvent(span.spanId, 'result', {
                        value: summarizeValue(result)
                    });
                }
                telemetry.endSpan(span.spanId, SpanStatus.OK);
                return result;

            } catch (error) {
                telemetry.recordSpanError(span.spanId, error);
                telemetry.endSpan(span.spanId, SpanStatus.ERROR, error.message);
                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * Wrap a function with tracing
 *
 * Usage:
 *   const tracedFn = traceFunction(myFunction, 'myOperation');
 *
 * @param {Function} fn - Function to wrap
 * @param {string} name - Span name
 * @param {object} options - Tracing options
 */
export function traceFunction(fn, name, options = {}) {
    const spanName = name || fn.name || 'anonymous';

    return function tracedFunction(...args) {
        const telemetry = options.telemetry || defaultTelemetry;
        if (!telemetry) {
            return fn.apply(this, args);
        }

        const attributes = {
            'code.function': fn.name || 'anonymous',
            ...options.attributes
        };

        const span = telemetry.startSpan(spanName, attributes);

        try {
            const result = fn.apply(this, args);

            if (result && typeof result.then === 'function') {
                return result.then(
                    (value) => {
                        telemetry.endSpan(span.spanId, SpanStatus.OK);
                        return value;
                    },
                    (error) => {
                        telemetry.recordSpanError(span.spanId, error);
                        telemetry.endSpan(span.spanId, SpanStatus.ERROR);
                        throw error;
                    }
                );
            }

            telemetry.endSpan(span.spanId, SpanStatus.OK);
            return result;

        } catch (error) {
            telemetry.recordSpanError(span.spanId, error);
            telemetry.endSpan(span.spanId, SpanStatus.ERROR);
            throw error;
        }
    };
}

/**
 * Trace async generator/iterator
 *
 * @param {AsyncIterable} iterable - Async iterable to trace
 * @param {string} name - Span name
 * @param {object} options - Options
 */
export async function* traceAsyncIterable(iterable, name, options = {}) {
    const telemetry = options.telemetry || defaultTelemetry;
    if (!telemetry) {
        yield* iterable;
        return;
    }

    const span = telemetry.startSpan(name, {
        'iteration.type': 'async',
        ...options.attributes
    });

    let count = 0;

    try {
        for await (const item of iterable) {
            count++;
            if (options.traceItems) {
                telemetry.addSpanEvent(span.spanId, 'yield', {
                    index: count,
                    value: summarizeValue(item)
                });
            }
            yield item;
        }

        telemetry.setSpanAttribute(span.spanId, 'iteration.count', count);
        telemetry.endSpan(span.spanId, SpanStatus.OK);

    } catch (error) {
        telemetry.setSpanAttribute(span.spanId, 'iteration.count', count);
        telemetry.recordSpanError(span.spanId, error);
        telemetry.endSpan(span.spanId, SpanStatus.ERROR);
        throw error;
    }
}

/**
 * Instrument all methods of a class
 *
 * @param {Function} ClassConstructor - Class to instrument
 * @param {object} options - Options
 */
export function instrumentClass(ClassConstructor, options = {}) {
    const prototype = ClassConstructor.prototype;
    const className = ClassConstructor.name;
    const exclude = new Set(options.exclude || ['constructor']);
    const include = options.include ? new Set(options.include) : null;

    // Get all method names
    const methodNames = Object.getOwnPropertyNames(prototype)
        .filter(name => {
            if (exclude.has(name)) return false;
            if (include && !include.has(name)) return false;
            const desc = Object.getOwnPropertyDescriptor(prototype, name);
            return typeof desc?.value === 'function';
        });

    // Wrap each method
    for (const methodName of methodNames) {
        const original = prototype[methodName];
        const spanName = options.namePrefix
            ? `${options.namePrefix}.${methodName}`
            : `${className}.${methodName}`;

        prototype[methodName] = traceFunction(original, spanName, {
            ...options,
            attributes: {
                'code.class': className,
                'code.method': methodName,
                ...options.attributes
            }
        });
    }

    return ClassConstructor;
}

/**
 * Create a traced proxy around an object
 *
 * @param {object} target - Object to proxy
 * @param {string} name - Base name for spans
 * @param {object} options - Options
 */
export function traceObject(target, name, options = {}) {
    const telemetry = options.telemetry || defaultTelemetry;

    return new Proxy(target, {
        get(obj, prop) {
            const value = obj[prop];

            if (typeof value !== 'function') {
                return value;
            }

            // Return traced function
            return function(...args) {
                if (!telemetry) {
                    return value.apply(obj, args);
                }

                const spanName = `${name}.${String(prop)}`;
                const span = telemetry.startSpan(spanName, {
                    'code.function': String(prop),
                    ...options.attributes
                });

                try {
                    const result = value.apply(obj, args);

                    if (result && typeof result.then === 'function') {
                        return result.then(
                            (v) => {
                                telemetry.endSpan(span.spanId, SpanStatus.OK);
                                return v;
                            },
                            (e) => {
                                telemetry.recordSpanError(span.spanId, e);
                                telemetry.endSpan(span.spanId, SpanStatus.ERROR);
                                throw e;
                            }
                        );
                    }

                    telemetry.endSpan(span.spanId, SpanStatus.OK);
                    return result;

                } catch (error) {
                    telemetry.recordSpanError(span.spanId, error);
                    telemetry.endSpan(span.spanId, SpanStatus.ERROR);
                    throw error;
                }
            };
        }
    });
}

/**
 * Timing wrapper - measures execution time without full tracing
 *
 * @param {Function} fn - Function to time
 * @param {Function} callback - Called with duration in ms
 */
export function withTiming(fn, callback) {
    return function(...args) {
        const start = performance.now();

        try {
            const result = fn.apply(this, args);

            if (result && typeof result.then === 'function') {
                return result.then(
                    (value) => {
                        callback(performance.now() - start, null, value);
                        return value;
                    },
                    (error) => {
                        callback(performance.now() - start, error, null);
                        throw error;
                    }
                );
            }

            callback(performance.now() - start, null, result);
            return result;

        } catch (error) {
            callback(performance.now() - start, error, null);
            throw error;
        }
    };
}

/**
 * Meter decorator for counting invocations
 *
 * @param {string} metricName - Metric name
 * @param {object} options - Options
 */
export function meter(metricName, options = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        let count = 0;
        let errors = 0;
        let totalDuration = 0;

        descriptor.value = function(...args) {
            const telemetry = options.telemetry || defaultTelemetry;
            const start = performance.now();
            count++;

            try {
                const result = originalMethod.apply(this, args);

                if (result && typeof result.then === 'function') {
                    return result.then(
                        (value) => {
                            totalDuration += performance.now() - start;
                            recordMetrics();
                            return value;
                        },
                        (error) => {
                            errors++;
                            totalDuration += performance.now() - start;
                            recordMetrics();
                            throw error;
                        }
                    );
                }

                totalDuration += performance.now() - start;
                recordMetrics();
                return result;

            } catch (error) {
                errors++;
                totalDuration += performance.now() - start;
                recordMetrics();
                throw error;
            }

            function recordMetrics() {
                if (telemetry?.recordEvent) {
                    telemetry.recordEvent('meter', {
                        metric: metricName,
                        count,
                        errors,
                        errorRate: count > 0 ? errors / count : 0,
                        totalDurationMs: totalDuration,
                        avgDurationMs: count > 0 ? totalDuration / count : 0
                    });
                }
            }
        };

        // Expose metrics
        descriptor.value.getMetrics = () => ({
            count,
            errors,
            errorRate: count > 0 ? errors / count : 0,
            totalDurationMs: totalDuration,
            avgDurationMs: count > 0 ? totalDuration / count : 0
        });

        return descriptor;
    };
}

/**
 * Batch multiple operations into a single span
 *
 * @param {string} name - Batch span name
 * @param {Function} fn - Async function that performs batch operations
 * @param {object} options - Options
 */
export async function traceBatch(name, fn, options = {}) {
    const telemetry = options.telemetry || defaultTelemetry;
    if (!telemetry) {
        return fn();
    }

    const span = telemetry.startSpan(name, {
        'batch.type': 'grouped',
        ...options.attributes
    });

    const operations = [];

    // Create context for batch
    const ctx = {
        /**
         * Add operation to batch
         */
        operation(opName, opFn) {
            operations.push({ name: opName, fn: opFn });
        },

        /**
         * Record progress
         */
        progress(current, total) {
            telemetry.addSpanEvent(span.spanId, 'progress', {
                current,
                total,
                percentage: total > 0 ? (current / total * 100).toFixed(1) : 0
            });
        }
    };

    try {
        // Execute the batch setup
        await fn(ctx);

        // Execute all operations
        telemetry.setSpanAttribute(span.spanId, 'batch.operation_count', operations.length);

        let completed = 0;
        let failed = 0;

        for (const op of operations) {
            try {
                await op.fn();
                completed++;
                telemetry.addSpanEvent(span.spanId, 'operation_complete', {
                    name: op.name,
                    index: completed
                });
            } catch (err) {
                failed++;
                telemetry.addSpanEvent(span.spanId, 'operation_failed', {
                    name: op.name,
                    error: err.message
                });
                if (!options.continueOnError) throw err;
            }
        }

        telemetry.setSpanAttribute(span.spanId, 'batch.completed', completed);
        telemetry.setSpanAttribute(span.spanId, 'batch.failed', failed);
        telemetry.endSpan(span.spanId, failed > 0 ? SpanStatus.ERROR : SpanStatus.OK);

        return { completed, failed };

    } catch (error) {
        telemetry.recordSpanError(span.spanId, error);
        telemetry.endSpan(span.spanId, SpanStatus.ERROR);
        throw error;
    }
}

/**
 * Context manager for scoped tracing
 */
export class TraceContext {
    constructor(name, options = {}) {
        this.name = name;
        this.options = options;
        this.telemetry = options.telemetry || defaultTelemetry;
        this.span = null;
    }

    /**
     * Enter context (start span)
     */
    enter() {
        if (this.telemetry) {
            this.span = this.telemetry.startSpan(this.name, this.options.attributes);
        }
        return this;
    }

    /**
     * Add event to current span
     */
    event(name, attributes = {}) {
        if (this.span && this.telemetry) {
            this.telemetry.addSpanEvent(this.span.spanId, name, attributes);
        }
        return this;
    }

    /**
     * Set attribute on current span
     */
    setAttribute(key, value) {
        if (this.span && this.telemetry) {
            this.telemetry.setSpanAttribute(this.span.spanId, key, value);
        }
        return this;
    }

    /**
     * Exit context (end span)
     */
    exit(status = SpanStatus.OK, message) {
        if (this.span && this.telemetry) {
            this.telemetry.endSpan(this.span.spanId, status, message);
        }
        return this;
    }

    /**
     * Exit with error
     */
    error(err) {
        if (this.span && this.telemetry) {
            this.telemetry.recordSpanError(this.span.spanId, err);
            this.telemetry.endSpan(this.span.spanId, SpanStatus.ERROR, err.message);
        }
        return this;
    }
}

/**
 * Helper to summarize a value for logging
 * @private
 */
function summarizeValue(value, maxLength = 100) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    const type = typeof value;

    if (type === 'string') {
        return value.length > maxLength
            ? value.substring(0, maxLength) + '...'
            : value;
    }

    if (type === 'number' || type === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return `Array(${value.length})`;
    }

    if (type === 'object') {
        const name = value.constructor?.name || 'Object';
        return `${name}{}`;
    }

    if (type === 'function') {
        return `Function(${value.name || 'anonymous'})`;
    }

    return String(value).substring(0, maxLength);
}

export default {
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
};
