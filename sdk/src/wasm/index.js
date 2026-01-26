/**
 * WASM Module - VIB3+ SDK
 *
 * WebAssembly integration with automatic JavaScript fallback.
 *
 * Usage:
 *   import { init, getModule } from '@vib3/sdk/wasm';
 *
 *   // Initialize (loads WASM if available)
 *   await init();
 *
 *   // Get the module (WASM or JS fallback)
 *   const vib3 = getModule();
 *
 *   // Use math classes
 *   const v = new vib3.Vec4(1, 2, 3, 4);
 *   const r = vib3.Rotor4D.fromEuler6(0.1, 0.2, 0.3, 0.4, 0.5, 0.6);
 */

export {
    // Loader functions
    configure,
    loadWasmModule,
    init,
    getModule,
    getStatus,
    reset,

    // Feature detection
    isWasmSupported,
    isSimdSupported,
    isWasmLoaded,
    isFallbackActive,

    // Fallback classes (always available)
    Vec4Fallback,
    Rotor4DFallback,
    Mat4x4Fallback
} from './WasmLoader.js';

import WasmLoader from './WasmLoader.js';
export default WasmLoader;

/**
 * Unified math API that automatically uses WASM or fallback
 *
 * This provides a consistent interface regardless of WASM availability.
 */
export class UnifiedMath {
    static #module = null;

    /**
     * Initialize the unified API
     * @returns {Promise<void>}
     */
    static async init() {
        const { init, getModule } = await import('./WasmLoader.js');
        await init();
        UnifiedMath.#module = getModule();
    }

    /**
     * Get the underlying module
     */
    static get module() {
        return UnifiedMath.#module;
    }

    /**
     * Create Vec4
     */
    static vec4(x = 0, y = 0, z = 0, w = 0) {
        const m = UnifiedMath.#module;
        return m ? new m.Vec4(x, y, z, w) : null;
    }

    /**
     * Create Rotor4D from plane angle
     */
    static rotorFromPlane(plane, angle) {
        const m = UnifiedMath.#module;
        return m ? m.Rotor4D.fromPlaneAngle(plane, angle) : null;
    }

    /**
     * Create Rotor4D from 6 angles
     */
    static rotorFromEuler6(xy, xz, yz, xw, yw, zw) {
        const m = UnifiedMath.#module;
        return m ? m.Rotor4D.fromEuler6(xy, xz, yz, xw, yw, zw) : null;
    }

    /**
     * Create rotation matrix from 6 angles
     */
    static matrixFromAngles(xy, xz, yz, xw, yw, zw) {
        const m = UnifiedMath.#module;
        return m ? m.Mat4x4.rotationFromAngles(xy, xz, yz, xw, yw, zw) : null;
    }

    /**
     * Project 4D point to 3D (perspective)
     */
    static project(v, distance = 2.0) {
        const m = UnifiedMath.#module;
        return m ? m.projectPerspective(v, distance) : null;
    }

    /**
     * Project batch of 4D points (returns Float32Array)
     */
    static projectBatch(points, distance = 2.0) {
        const m = UnifiedMath.#module;
        return m ? m.projectToFloatArray(points, distance) : null;
    }

    /**
     * Check if WASM is being used
     */
    static get isWasm() {
        const m = UnifiedMath.#module;
        return m ? (m.isWasm?.() ?? true) : false;
    }

    /**
     * Check if SIMD is enabled
     */
    static get hasSimd() {
        const m = UnifiedMath.#module;
        return m ? (m.hasSimd?.() ?? false) : false;
    }
}
