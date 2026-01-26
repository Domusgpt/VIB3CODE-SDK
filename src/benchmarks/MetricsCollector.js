/**
 * MetricsCollector - Collect performance metrics for VIB3+ engine
 *
 * Captures frame time, FPS, memory usage, draw calls, and triangle counts
 * for performance analysis and regression detection.
 */

/**
 * Performance metrics collector
 */
export class MetricsCollector {
    constructor(options = {}) {
        /** @type {Array<object>} Sample history */
        this.samples = [];

        /** @type {number} Total frames counted */
        this.frameCount = 0;

        /** @type {number} Last frame timestamp */
        this.lastFrameTime = 0;

        /** @type {number|null} Current frame start time */
        this.frameStart = null;

        /** @type {object|null} Renderer reference for stats */
        this.renderer = options.renderer || null;

        /** @type {number} Maximum samples to keep */
        this.maxSamples = options.maxSamples || 1000;

        /** @type {boolean} Whether to track memory */
        this.trackMemory = options.trackMemory !== false;

        /** @type {number} Session start time */
        this.sessionStart = performance.now();
    }

    /**
     * Set renderer reference for draw call/triangle stats
     * @param {object} renderer
     */
    setRenderer(renderer) {
        this.renderer = renderer;
    }

    /**
     * Mark the beginning of a frame
     */
    beginFrame() {
        this.frameStart = performance.now();
    }

    /**
     * Mark the end of a frame and record metrics
     */
    endFrame() {
        if (this.frameStart === null) {
            console.warn('MetricsCollector: endFrame called without beginFrame');
            return;
        }

        const now = performance.now();
        const frameTime = now - this.frameStart;
        this.frameCount++;

        const sample = {
            timestamp: Date.now(),
            frameNumber: this.frameCount,
            frameTime,
            fps: frameTime > 0 ? 1000 / frameTime : 0,
            memory: this.trackMemory ? this.getMemoryUsage() : null,
            drawCalls: this.getDrawCallCount(),
            triangles: this.getTriangleCount()
        };

        this.samples.push(sample);

        // Keep sample buffer bounded
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }

        this.lastFrameTime = frameTime;
        this.frameStart = null;

        return sample;
    }

    /**
     * Get current memory usage (if available)
     * @returns {object|null}
     */
    getMemoryUsage() {
        // Only available in Chrome with --enable-precise-memory-info flag
        if (typeof performance !== 'undefined' && performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize / 1024 / 1024,
                total: performance.memory.totalJSHeapSize / 1024 / 1024,
                limit: performance.memory.jsHeapSizeLimit / 1024 / 1024
            };
        }
        return null;
    }

    /**
     * Get draw call count from renderer
     * @returns {number}
     */
    getDrawCallCount() {
        if (this.renderer?.stats?.drawCalls !== undefined) {
            return this.renderer.stats.drawCalls;
        }
        if (this.renderer?.getStats) {
            const stats = this.renderer.getStats();
            return stats?.drawCalls ?? 0;
        }
        return 0;
    }

    /**
     * Get triangle count from renderer
     * @returns {number}
     */
    getTriangleCount() {
        if (this.renderer?.stats?.triangles !== undefined) {
            return this.renderer.stats.triangles;
        }
        if (this.renderer?.getStats) {
            const stats = this.renderer.getStats();
            return stats?.triangles ?? 0;
        }
        return 0;
    }

    /**
     * Calculate statistics from collected samples
     * @returns {object|null}
     */
    getStats() {
        if (this.samples.length === 0) {
            return null;
        }

        const frameTimes = this.samples.map(s => s.frameTime);
        const fpsValues = this.samples.map(s => s.fps);

        return {
            frameTime: {
                min: Math.min(...frameTimes),
                max: Math.max(...frameTimes),
                avg: this.average(frameTimes),
                median: this.median(frameTimes),
                stdDev: this.standardDeviation(frameTimes),
                p50: this.percentile(frameTimes, 50),
                p90: this.percentile(frameTimes, 90),
                p95: this.percentile(frameTimes, 95),
                p99: this.percentile(frameTimes, 99)
            },
            fps: {
                min: Math.min(...fpsValues),
                max: Math.max(...fpsValues),
                avg: this.average(fpsValues),
                median: this.median(fpsValues)
            },
            memory: this.samples[this.samples.length - 1].memory,
            drawCalls: this.samples[this.samples.length - 1].drawCalls,
            triangles: this.samples[this.samples.length - 1].triangles,
            sampleCount: this.samples.length,
            totalFrames: this.frameCount,
            sessionDuration: (performance.now() - this.sessionStart) / 1000
        };
    }

    /**
     * Calculate percentile of array
     * @param {number[]} arr
     * @param {number} p - Percentile (0-100)
     * @returns {number}
     */
    percentile(arr, p) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Calculate median of array
     * @param {number[]} arr
     * @returns {number}
     */
    median(arr) {
        return this.percentile(arr, 50);
    }

    /**
     * Calculate average of array
     * @param {number[]} arr
     * @returns {number}
     */
    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Calculate standard deviation of array
     * @param {number[]} arr
     * @returns {number}
     */
    standardDeviation(arr) {
        if (arr.length === 0) return 0;
        const avg = this.average(arr);
        const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
        return Math.sqrt(this.average(squareDiffs));
    }

    /**
     * Reset all collected data
     */
    reset() {
        this.samples = [];
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.frameStart = null;
        this.sessionStart = performance.now();
    }

    /**
     * Export samples as CSV
     * @returns {string}
     */
    exportCSV() {
        const headers = ['timestamp', 'frameNumber', 'frameTime', 'fps', 'memoryUsed', 'drawCalls', 'triangles'];
        const rows = this.samples.map(s => [
            s.timestamp,
            s.frameNumber,
            s.frameTime.toFixed(3),
            s.fps.toFixed(1),
            s.memory?.used?.toFixed(2) ?? '',
            s.drawCalls,
            s.triangles
        ]);
        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    /**
     * Export samples as JSON
     * @returns {object}
     */
    exportJSON() {
        return {
            stats: this.getStats(),
            samples: this.samples,
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Get last N samples
     * @param {number} n
     * @returns {object[]}
     */
    getLastSamples(n) {
        return this.samples.slice(-n);
    }

    /**
     * Check if performance meets thresholds
     * @param {object} thresholds
     * @returns {object}
     */
    checkThresholds(thresholds = {}) {
        const stats = this.getStats();
        if (!stats) return { passed: false, reason: 'No data' };

        const defaults = {
            maxFrameTime: 16.67, // 60fps
            minFPS: 60,
            maxMemory: 200 // MB
        };

        const limits = { ...defaults, ...thresholds };
        const results = {
            frameTime: stats.frameTime.p95 <= limits.maxFrameTime,
            fps: stats.fps.avg >= limits.minFPS,
            memory: !stats.memory || stats.memory.used <= limits.maxMemory
        };

        return {
            passed: results.frameTime && results.fps && results.memory,
            results,
            stats,
            thresholds: limits
        };
    }
}

export default MetricsCollector;
