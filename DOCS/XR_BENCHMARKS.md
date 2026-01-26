# XR integration benchmarks (draft)

This document captures baseline metrics, targets, and tooling for XR integration work.

## Baseline metrics to record

| Metric | Description | Unit | Desktop Target | Mobile Target |
|--------|-------------|------|----------------|---------------|
| Frame time | Time to render single frame | ms | <11ms | <14ms |
| FPS | Frames per second sustained | fps | 90 | 72 |
| CPU utilization | Main thread usage | % | <50% | <60% |
| GPU utilization | GPU compute usage | % | <80% | <85% |
| Memory usage | Total JS heap | MB | <200MB | <100MB |
| Draw calls | Per-frame draw call count | count | <100 | <50 |
| Triangles | Per-frame triangle count | count | <100K | <50K |
| Input latency | Motion-to-photon | ms | <20ms | <25ms |

## Target thresholds

### Desktop XR (Quest Link, SteamVR, etc.)
- **90 FPS sustained** minimum
- **<11ms frame time** (1000ms / 90fps)
- **<20ms motion-to-photon latency**
- Supports all 24 geometry variants at full fidelity

### Mobile XR (Quest standalone, mobile AR)
- **72 FPS sustained** minimum
- **<14ms frame time** (1000ms / 72fps)
- **<25ms motion-to-photon latency**
- May use simplified geometry (LOD system)

### Web XR (Browser-based)
- **60 FPS sustained** minimum
- **<16.67ms frame time**
- Falls back gracefully when GPU unavailable

## Performance tiers

| Tier | Geometry | Grid Density | Effects | Target Platform |
|------|----------|--------------|---------|-----------------|
| Ultra | Full 24 | 64-100 | All | Desktop XR |
| High | Full 24 | 32-64 | Most | Desktop/Mobile XR |
| Medium | 16 variants | 16-32 | Basic | Mobile XR |
| Low | 8 variants | 8-16 | Minimal | Low-end mobile |

## Benchmark workflow

### 1. Scene selection

Representative test scenes for consistent benchmarking:

```javascript
// tests/benchmarks/scenes.js
export const BENCHMARK_SCENES = {
  simple: {
    name: 'Simple Tetrahedron',
    params: {
      system: 'quantum',
      geometry: 0,
      gridDensity: 16,
      chaos: 0,
      speed: 1.0
    }
  },
  medium: {
    name: 'Medium Hypersphere',
    params: {
      system: 'quantum',
      geometry: 8,
      gridDensity: 32,
      chaos: 0.3,
      speed: 1.0
    }
  },
  complex: {
    name: 'Complex Holographic',
    params: {
      system: 'holographic',
      geometry: 16,
      gridDensity: 64,
      chaos: 0.5,
      speed: 1.5
    }
  },
  stress: {
    name: 'Stress Test',
    params: {
      system: 'quantum',
      geometry: 23,
      gridDensity: 100,
      chaos: 1.0,
      speed: 3.0
    }
  }
};
```

### 2. Metrics collection

```javascript
// src/benchmarks/MetricsCollector.js
export class MetricsCollector {
  constructor() {
    this.samples = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
  }

  beginFrame() {
    this.frameStart = performance.now();
  }

  endFrame() {
    const frameTime = performance.now() - this.frameStart;
    this.frameCount++;

    this.samples.push({
      timestamp: Date.now(),
      frameTime,
      fps: 1000 / frameTime,
      memory: this.getMemoryUsage(),
      drawCalls: this.getDrawCallCount(),
      triangles: this.getTriangleCount()
    });

    // Keep last 1000 samples
    if (this.samples.length > 1000) {
      this.samples.shift();
    }
  }

  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize / 1024 / 1024,
        total: performance.memory.totalJSHeapSize / 1024 / 1024,
        limit: performance.memory.jsHeapSizeLimit / 1024 / 1024
      };
    }
    return null;
  }

  getDrawCallCount() {
    // Implementation depends on renderer
    return this.renderer?.stats?.drawCalls ?? 0;
  }

  getTriangleCount() {
    return this.renderer?.stats?.triangles ?? 0;
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const frameTimes = this.samples.map(s => s.frameTime);
    const fps = this.samples.map(s => s.fps);

    return {
      frameTime: {
        min: Math.min(...frameTimes),
        max: Math.max(...frameTimes),
        avg: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
        p95: this.percentile(frameTimes, 95),
        p99: this.percentile(frameTimes, 99)
      },
      fps: {
        min: Math.min(...fps),
        max: Math.max(...fps),
        avg: fps.reduce((a, b) => a + b, 0) / fps.length
      },
      memory: this.samples[this.samples.length - 1].memory,
      drawCalls: this.samples[this.samples.length - 1].drawCalls,
      triangles: this.samples[this.samples.length - 1].triangles,
      sampleCount: this.samples.length
    };
  }

  percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }

  reset() {
    this.samples = [];
    this.frameCount = 0;
  }

  exportCSV() {
    const headers = ['timestamp', 'frameTime', 'fps', 'memoryUsed', 'drawCalls', 'triangles'];
    const rows = this.samples.map(s => [
      s.timestamp,
      s.frameTime.toFixed(2),
      s.fps.toFixed(1),
      s.memory?.used?.toFixed(1) ?? '',
      s.drawCalls,
      s.triangles
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}
```

### 3. Benchmark runner

```javascript
// src/benchmarks/BenchmarkRunner.js
import { MetricsCollector } from './MetricsCollector.js';
import { BENCHMARK_SCENES } from './scenes.js';

export class BenchmarkRunner {
  constructor(engine) {
    this.engine = engine;
    this.collector = new MetricsCollector();
    this.results = [];
  }

  async runBenchmark(sceneName, duration = 10000) {
    const scene = BENCHMARK_SCENES[sceneName];
    if (!scene) throw new Error(`Unknown scene: ${sceneName}`);

    console.log(`Running benchmark: ${scene.name}`);

    // Configure scene
    this.engine.setParameters(scene.params);
    this.collector.reset();

    // Warm-up phase (2 seconds)
    await this.runFrames(2000);
    this.collector.reset();

    // Measurement phase
    const startTime = performance.now();
    while (performance.now() - startTime < duration) {
      this.collector.beginFrame();
      await this.engine.renderFrame();
      this.collector.endFrame();
    }

    const stats = this.collector.getStats();
    const result = {
      scene: sceneName,
      sceneName: scene.name,
      params: scene.params,
      duration,
      ...stats,
      timestamp: new Date().toISOString(),
      passed: this.evaluateThresholds(stats)
    };

    this.results.push(result);
    return result;
  }

  async runFrames(duration) {
    const startTime = performance.now();
    while (performance.now() - startTime < duration) {
      await this.engine.renderFrame();
    }
  }

  evaluateThresholds(stats, platform = 'desktop') {
    const thresholds = platform === 'mobile'
      ? { frameTime: 14, fps: 72, memory: 100 }
      : { frameTime: 11, fps: 90, memory: 200 };

    return {
      frameTime: stats.frameTime.p95 <= thresholds.frameTime,
      fps: stats.fps.avg >= thresholds.fps,
      memory: (stats.memory?.used ?? 0) <= thresholds.memory,
      overall: stats.frameTime.p95 <= thresholds.frameTime && stats.fps.avg >= thresholds.fps
    };
  }

  async runAllBenchmarks(duration = 10000) {
    const results = {};
    for (const sceneName of Object.keys(BENCHMARK_SCENES)) {
      results[sceneName] = await this.runBenchmark(sceneName, duration);
    }
    return results;
  }

  exportReport() {
    return {
      generated: new Date().toISOString(),
      platform: this.detectPlatform(),
      results: this.results
    };
  }

  detectPlatform() {
    return {
      userAgent: navigator.userAgent,
      gpu: this.engine.getGPUInfo?.() ?? 'unknown',
      cores: navigator.hardwareConcurrency ?? 'unknown',
      memory: navigator.deviceMemory ?? 'unknown'
    };
  }
}
```

### 4. CLI benchmark command

```bash
# Run all benchmarks
vib3 benchmark --all --duration 10s

# Run specific scene
vib3 benchmark --scene complex --duration 30s

# Output formats
vib3 benchmark --all --format json --output results.json
vib3 benchmark --all --format csv --output results.csv
vib3 benchmark --all --format markdown --output BENCHMARK_RESULTS.md

# Platform-specific
vib3 benchmark --all --platform mobile --thresholds strict
```

### 5. Telemetry integration

```javascript
// Benchmark results are automatically captured in telemetry
import { TelemetryService } from '../agent/telemetry/TelemetryService.js';

async function runBenchmarkWithTelemetry(runner) {
  const span = TelemetryService.startSpan('benchmark_run');

  try {
    const results = await runner.runAllBenchmarks();

    span.setAttributes({
      'benchmark.scenes': Object.keys(results).length,
      'benchmark.passed': Object.values(results).filter(r => r.passed.overall).length,
      'benchmark.failed': Object.values(results).filter(r => !r.passed.overall).length
    });

    // Record individual scene results
    for (const [scene, result] of Object.entries(results)) {
      TelemetryService.recordMetric('benchmark.frame_time', result.frameTime.avg, {
        scene,
        percentile: 'avg'
      });
      TelemetryService.recordMetric('benchmark.fps', result.fps.avg, { scene });
    }

    span.setStatus({ code: 'OK' });
    return results;
  } catch (error) {
    span.setStatus({ code: 'ERROR', message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

## Regression tracking

### Baseline storage

Benchmark baselines are stored in `tests/benchmarks/baselines/`:

```json
// tests/benchmarks/baselines/desktop-chrome-2026-01.json
{
  "generated": "2026-01-23T22:00:00Z",
  "platform": {
    "browser": "Chrome 120",
    "os": "Windows 11",
    "gpu": "NVIDIA RTX 3080"
  },
  "results": {
    "simple": {
      "frameTime": { "avg": 2.1, "p95": 3.2 },
      "fps": { "avg": 476 },
      "passed": true
    },
    "medium": {
      "frameTime": { "avg": 4.5, "p95": 6.1 },
      "fps": { "avg": 222 },
      "passed": true
    },
    "complex": {
      "frameTime": { "avg": 8.2, "p95": 10.1 },
      "fps": { "avg": 122 },
      "passed": true
    },
    "stress": {
      "frameTime": { "avg": 12.5, "p95": 15.2 },
      "fps": { "avg": 80 },
      "passed": false
    }
  }
}
```

### Regression detection

```javascript
// tests/benchmarks/regression.test.js
import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../src/benchmarks/BenchmarkRunner.js';
import baseline from './baselines/desktop-chrome-2026-01.json';

const REGRESSION_THRESHOLD = 0.15; // 15% degradation allowed

describe('performance regression', () => {
  let runner;

  beforeAll(async () => {
    const engine = await createTestEngine();
    runner = new BenchmarkRunner(engine);
  });

  for (const [scene, baselineResult] of Object.entries(baseline.results)) {
    it(`should not regress on ${scene}`, async () => {
      const result = await runner.runBenchmark(scene, 5000);

      const frameTimeRatio = result.frameTime.avg / baselineResult.frameTime.avg;
      const fpsRatio = baselineResult.fps.avg / result.fps.avg;

      expect(frameTimeRatio).toBeLessThan(1 + REGRESSION_THRESHOLD);
      expect(fpsRatio).toBeLessThan(1 + REGRESSION_THRESHOLD);
    });
  }
});
```

### CI integration

```yaml
# .github/workflows/benchmarks.yml
name: Performance Benchmarks

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - run: pnpm install
      - run: pnpm bench

      - name: Check for regressions
        run: pnpm test -- tests/benchmarks/regression.test.js

      - name: Upload benchmark results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: benchmark-results.json
```

## XR-specific considerations

### WebXR frame timing

```javascript
// XR sessions have different timing requirements
function xrRenderLoop(time, frame) {
  const session = renderer.xr.getSession();

  // Get XR-specific timing
  const pose = frame.getViewerPose(referenceSpace);
  if (!pose) return;

  // Measure actual XR frame time
  const xrFrameStart = performance.now();

  for (const view of pose.views) {
    renderView(view);
  }

  const xrFrameTime = performance.now() - xrFrameStart;

  // XR frame budget is stricter
  if (xrFrameTime > 8) { // < 8ms for 120Hz displays
    console.warn('XR frame budget exceeded:', xrFrameTime.toFixed(2), 'ms');
  }
}
```

### Input latency measurement

```javascript
// Measure motion-to-photon latency
class LatencyMeasurer {
  constructor() {
    this.pendingMeasurements = new Map();
  }

  recordInput(inputId) {
    this.pendingMeasurements.set(inputId, performance.now());
  }

  recordRender(inputId) {
    const inputTime = this.pendingMeasurements.get(inputId);
    if (inputTime) {
      const latency = performance.now() - inputTime;
      this.pendingMeasurements.delete(inputId);
      return latency;
    }
    return null;
  }

  // For XR controller input
  measureXRInputLatency(controller, session) {
    const inputTime = performance.now();
    const inputId = `xr-${Date.now()}`;

    // Track through render
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        session.requestAnimationFrame(() => {
          const latency = performance.now() - inputTime;
          resolve(latency);
        });
      });
    });
  }
}
```

## Visualization dashboard

### Debug overlay

```javascript
// src/debug/PerformanceOverlay.js
export class PerformanceOverlay {
  constructor(collector) {
    this.collector = collector;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 200px;
      height: 100px;
      background: rgba(0,0,0,0.7);
      border-radius: 4px;
      z-index: 9999;
    `;
  }

  render() {
    const stats = this.collector.getStats();
    if (!stats) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, 200, 100);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';

    const fps = stats.fps.avg.toFixed(1);
    const frameTime = stats.frameTime.avg.toFixed(2);
    const memory = stats.memory?.used?.toFixed(1) ?? 'N/A';

    ctx.fillText(`FPS: ${fps}`, 10, 20);
    ctx.fillText(`Frame: ${frameTime}ms`, 10, 40);
    ctx.fillText(`Memory: ${memory}MB`, 10, 60);
    ctx.fillText(`Draw: ${stats.drawCalls}`, 10, 80);

    // Color-code based on thresholds
    ctx.fillStyle = stats.fps.avg >= 60 ? '#4f4' : '#f44';
    ctx.fillRect(180, 10, 10, 10);
  }

  show() {
    document.body.appendChild(this.canvas);
  }

  hide() {
    this.canvas.remove();
  }
}
```

## Implementation status

| Component | Status | Location |
|-----------|--------|----------|
| MetricsCollector | TODO | `src/benchmarks/MetricsCollector.js` |
| BenchmarkRunner | TODO | `src/benchmarks/BenchmarkRunner.js` |
| Benchmark scenes | TODO | `tests/benchmarks/scenes.js` |
| CLI command | TODO | `src/cli/benchmark.js` |
| Regression tests | TODO | `tests/benchmarks/regression.test.js` |
| Performance overlay | TODO | `src/debug/PerformanceOverlay.js` |
| CI workflow | TODO | `.github/workflows/benchmarks.yml` |
| Baseline storage | TODO | `tests/benchmarks/baselines/` |

## References

- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [WebXR Performance Guidelines](https://immersive-web.github.io/webxr-reference/)
- [Meta Quest Performance Guidelines](https://developer.oculus.com/documentation/native/android/mobile-power-overview/)
- [Chrome Performance Monitoring](https://developer.chrome.com/docs/devtools/performance/)
