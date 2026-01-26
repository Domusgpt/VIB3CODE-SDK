/**
 * VIB3+ WebGPU Module
 * Experimental WebGPU backend for 4D visualization
 *
 * @fileoverview WebGPU feature flags and exports
 *
 * Usage:
 *   import { WebGPURenderer, enableWebGPU } from './webgpu';
 *
 *   // Check and enable WebGPU
 *   if (await WebGPURenderer.isAvailable()) {
 *     enableWebGPU();
 *     const renderer = new WebGPURenderer();
 *     await renderer.init({ canvas: myCanvas });
 *   }
 */

// Re-export components
export { BufferLayout, createStd140Layout, createStd430Layout, GlassUniformLayout } from './BufferLayout.ts';
export { TripleBufferedUniform } from './TripleBufferedUniform.ts';
export { PolytopeInstanceBuffer } from './PolytopeInstanceBuffer.ts';
export { WebGPURenderer } from './WebGPURenderer.ts';

/**
 * WebGPU feature flags
 * Set enabled=true to activate WebGPU backend
 */
export const WEBGPU_FEATURE_FLAGS = {
  enabled: false,
  reason: 'WebGPU backend is experimental; enable explicitly in host apps.',
  fallback: 'webgl2' as 'webgl' | 'webgl2' | 'canvas2d',
  debug: false
};

/**
 * Check if WebGPU is currently enabled
 */
export function isWebGPUEnabled(): boolean {
  return WEBGPU_FEATURE_FLAGS.enabled;
}

/**
 * Enable WebGPU backend
 * @param options - Optional configuration
 */
export function enableWebGPU(options?: {
  fallback?: 'webgl' | 'webgl2' | 'canvas2d';
  debug?: boolean;
}): void {
  WEBGPU_FEATURE_FLAGS.enabled = true;
  WEBGPU_FEATURE_FLAGS.reason = 'Enabled by application';
  if (options?.fallback) {
    WEBGPU_FEATURE_FLAGS.fallback = options.fallback;
  }
  if (options?.debug !== undefined) {
    WEBGPU_FEATURE_FLAGS.debug = options.debug;
  }
}

/**
 * Disable WebGPU backend
 */
export function disableWebGPU(): void {
  WEBGPU_FEATURE_FLAGS.enabled = false;
  WEBGPU_FEATURE_FLAGS.reason = 'Disabled by application';
}

/**
 * Check WebGPU support in current environment
 * @returns Promise<boolean> true if WebGPU is supported
 */
export async function checkWebGPUSupport(): Promise<{
  supported: boolean;
  reason: string;
  adapter?: unknown;
}> {
  if (typeof navigator === 'undefined') {
    return { supported: false, reason: 'Not in browser environment' };
  }

  if (!navigator.gpu) {
    return { supported: false, reason: 'WebGPU API not available' };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: 'No GPU adapter available' };
    }
    return { supported: true, reason: 'WebGPU available', adapter };
  } catch (error) {
    return {
      supported: false,
      reason: `WebGPU initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get the appropriate renderer based on feature flags and support
 * @returns 'webgpu' | 'webgl2' | 'webgl' | 'canvas2d'
 */
export async function getPreferredRenderer(): Promise<'webgpu' | 'webgl2' | 'webgl' | 'canvas2d'> {
  if (WEBGPU_FEATURE_FLAGS.enabled) {
    const support = await checkWebGPUSupport();
    if (support.supported) {
      return 'webgpu';
    }
    console.warn(`WebGPU not available: ${support.reason}. Falling back to ${WEBGPU_FEATURE_FLAGS.fallback}`);
  }
  return WEBGPU_FEATURE_FLAGS.fallback;
}
