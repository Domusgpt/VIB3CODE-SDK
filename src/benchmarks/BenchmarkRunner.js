/**
 * BenchmarkRunner - Run performance benchmarks on VIB3+ engine
 *
 * Executes standardized benchmark scenes and collects metrics
 * for performance analysis and regression detection.
 */

import { MetricsCollector } from './MetricsCollector.js';
import { BENCHMARK_SCENES } from './scenes.js';

/**
 * Default benchmark options
 */
const DEFAULT_OPTIONS = {
    duration: 10000, // 10 seconds per scene
    warmupDuration: 2000, // 2 second warmup
    platform: 'desktop',
    verbose: false
};

/**
 * Platform-specific thresholds
 */
const PLATFORM_THRESHOLDS = {
    desktop: {
        maxFrameTime: 11, // 90 FPS
        minFPS: 90,
        maxMemory: 200
    },
    mobile: {
        maxFrameTime: 14, // 72 FPS
        minFPS: 72,
        maxMemory: 100
    },
    web: {
        maxFrameTime: 16.67, // 60 FPS
        minFPS: 60,
        maxMemory: 150
    }
};

/**
 * Benchmark runner for VIB3+ engine
 */
export class BenchmarkRunner {
    /**
     * Create a benchmark runner
     * @param {object} engine - VIB3+ engine instance
     * @param {object} options - Runner options
     */
    constructor(engine, options = {}) {
        /** @type {object} Engine instance */
        this.engine = engine;

        /** @type {object} Runner options */
        this.options = { ...DEFAULT_OPTIONS, ...options };

        /** @type {MetricsCollector} Metrics collector */
        this.collector = new MetricsCollector({
            renderer: engine?.renderer || null
        });

        /** @type {Array<object>} Benchmark results */
        this.results = [];

        /** @type {boolean} Running state */
        this.running = false;

        /** @type {Function|null} Frame callback */
        this._frameCallback = null;
    }

    /**
     * Run a single benchmark scene
     * @param {string} sceneName - Name of scene from BENCHMARK_SCENES
     * @param {number} duration - Duration in milliseconds
     * @returns {Promise<object>} Benchmark result
     */
    async runBenchmark(sceneName, duration = this.options.duration) {
        const scene = BENCHMARK_SCENES[sceneName];
        if (!scene) {
            throw new Error(`Unknown benchmark scene: ${sceneName}`);
        }

        if (this.options.verbose) {
            console.log(`Running benchmark: ${scene.name}`);
        }

        // Configure scene
        if (this.engine?.setParameters) {
            this.engine.setParameters(scene.params);
        }

        this.collector.reset();
        this.running = true;

        // Warmup phase
        if (this.options.verbose) {
            console.log(`  Warmup: ${this.options.warmupDuration}ms`);
        }
        await this._runFrames(this.options.warmupDuration);
        this.collector.reset();

        // Measurement phase
        if (this.options.verbose) {
            console.log(`  Measuring: ${duration}ms`);
        }
        await this._runFrames(duration);

        this.running = false;

        // Collect results
        const stats = this.collector.getStats();
        const thresholds = PLATFORM_THRESHOLDS[this.options.platform] || PLATFORM_THRESHOLDS.desktop;
        const passed = this._evaluateThresholds(stats, thresholds);

        const result = {
            scene: sceneName,
            sceneName: scene.name,
            description: scene.description,
            params: scene.params,
            duration,
            ...stats,
            timestamp: new Date().toISOString(),
            platform: this.options.platform,
            thresholds,
            passed
        };

        this.results.push(result);

        if (this.options.verbose) {
            const status = passed.overall ? '✓ PASS' : '✗ FAIL';
            console.log(`  Result: ${status} (${stats.fps.avg.toFixed(1)} FPS, ${stats.frameTime.p95.toFixed(2)}ms p95)`);
        }

        return result;
    }

    /**
     * Run frames for specified duration
     * @private
     */
    async _runFrames(duration) {
        return new Promise((resolve) => {
            const startTime = performance.now();

            const frame = () => {
                if (!this.running || performance.now() - startTime >= duration) {
                    resolve();
                    return;
                }

                this.collector.beginFrame();

                // Render frame if engine available
                if (this.engine?.renderFrame) {
                    this.engine.renderFrame();
                } else if (this.engine?.render) {
                    this.engine.render();
                }

                this.collector.endFrame();

                // Use requestAnimationFrame for realistic timing
                if (typeof requestAnimationFrame !== 'undefined') {
                    requestAnimationFrame(frame);
                } else {
                    setImmediate(frame);
                }
            };

            frame();
        });
    }

    /**
     * Evaluate results against thresholds
     * @private
     */
    _evaluateThresholds(stats, thresholds) {
        if (!stats) {
            return { overall: false, frameTime: false, fps: false, memory: false };
        }

        const results = {
            frameTime: stats.frameTime.p95 <= thresholds.maxFrameTime,
            fps: stats.fps.avg >= thresholds.minFPS,
            memory: !stats.memory || stats.memory.used <= thresholds.maxMemory
        };

        results.overall = results.frameTime && results.fps && results.memory;

        return results;
    }

    /**
     * Run all benchmark scenes
     * @param {number} duration - Duration per scene
     * @returns {Promise<object>} All results
     */
    async runAllBenchmarks(duration = this.options.duration) {
        const results = {};
        const sceneNames = Object.keys(BENCHMARK_SCENES);

        if (this.options.verbose) {
            console.log(`Running ${sceneNames.length} benchmark scenes...`);
        }

        for (const sceneName of sceneNames) {
            try {
                results[sceneName] = await this.runBenchmark(sceneName, duration);
            } catch (error) {
                results[sceneName] = {
                    scene: sceneName,
                    error: error.message,
                    passed: { overall: false }
                };
            }
        }

        return results;
    }

    /**
     * Run benchmarks matching a pattern
     * @param {string|RegExp} pattern - Scene name pattern
     * @param {number} duration - Duration per scene
     * @returns {Promise<object>}
     */
    async runMatchingBenchmarks(pattern, duration = this.options.duration) {
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        const matchingScenes = Object.keys(BENCHMARK_SCENES).filter(name => regex.test(name));

        const results = {};
        for (const sceneName of matchingScenes) {
            results[sceneName] = await this.runBenchmark(sceneName, duration);
        }
        return results;
    }

    /**
     * Compare current results against a baseline
     * @param {object} baseline - Baseline results
     * @param {number} threshold - Regression threshold (e.g., 0.15 = 15%)
     * @returns {object} Comparison results
     */
    compareToBaseline(baseline, threshold = 0.15) {
        const comparisons = {};

        for (const result of this.results) {
            const baselineResult = baseline.results?.[result.scene];
            if (!baselineResult) {
                comparisons[result.scene] = {
                    status: 'new',
                    message: 'No baseline for comparison'
                };
                continue;
            }

            const frameTimeRatio = result.frameTime.avg / baselineResult.frameTime.avg;
            const fpsRatio = baselineResult.fps.avg / result.fps.avg;

            const regression = frameTimeRatio > (1 + threshold) || fpsRatio > (1 + threshold);

            comparisons[result.scene] = {
                status: regression ? 'regression' : 'pass',
                frameTimeRatio: frameTimeRatio.toFixed(3),
                fpsRatio: fpsRatio.toFixed(3),
                threshold,
                current: {
                    frameTime: result.frameTime.avg,
                    fps: result.fps.avg
                },
                baseline: {
                    frameTime: baselineResult.frameTime.avg,
                    fps: baselineResult.fps.avg
                }
            };
        }

        const hasRegression = Object.values(comparisons).some(c => c.status === 'regression');

        return {
            overall: hasRegression ? 'regression' : 'pass',
            threshold,
            comparisons
        };
    }

    /**
     * Export results as report
     * @returns {object}
     */
    exportReport() {
        const passedCount = this.results.filter(r => r.passed?.overall).length;
        const failedCount = this.results.length - passedCount;

        return {
            generated: new Date().toISOString(),
            platform: this.detectPlatform(),
            summary: {
                total: this.results.length,
                passed: passedCount,
                failed: failedCount
            },
            results: this.results.reduce((acc, r) => {
                acc[r.scene] = r;
                return acc;
            }, {})
        };
    }

    /**
     * Export results as markdown
     * @returns {string}
     */
    exportMarkdown() {
        let md = '# VIB3+ Benchmark Results\n\n';
        md += `**Generated:** ${new Date().toISOString()}\n`;
        md += `**Platform:** ${this.options.platform}\n\n`;

        md += '## Summary\n\n';
        const passed = this.results.filter(r => r.passed?.overall).length;
        md += `- **Passed:** ${passed}/${this.results.length}\n`;
        md += `- **Failed:** ${this.results.length - passed}/${this.results.length}\n\n`;

        md += '## Results\n\n';
        md += '| Scene | FPS | Frame Time (p95) | Status |\n';
        md += '|-------|-----|------------------|--------|\n';

        for (const result of this.results) {
            const status = result.passed?.overall ? '✓ Pass' : '✗ Fail';
            const fps = result.fps?.avg?.toFixed(1) || 'N/A';
            const frameTime = result.frameTime?.p95?.toFixed(2) || 'N/A';
            md += `| ${result.sceneName} | ${fps} | ${frameTime}ms | ${status} |\n`;
        }

        return md;
    }

    /**
     * Detect current platform
     * @returns {object}
     */
    detectPlatform() {
        const info = {
            type: this.options.platform,
            timestamp: new Date().toISOString()
        };

        if (typeof navigator !== 'undefined') {
            info.userAgent = navigator.userAgent;
            info.cores = navigator.hardwareConcurrency || 'unknown';
            info.memory = navigator.deviceMemory || 'unknown';
        }

        if (this.engine?.getGPUInfo) {
            info.gpu = this.engine.getGPUInfo();
        }

        return info;
    }

    /**
     * Clear all results
     */
    clearResults() {
        this.results = [];
        this.collector.reset();
    }

    /**
     * Stop current benchmark
     */
    stop() {
        this.running = false;
    }
}

export default BenchmarkRunner;
