/**
 * WasmLoader.js - WebAssembly Module Loader with JavaScript Fallback
 *
 * Loads the VIB3+ WASM module when available, otherwise falls back
 * to pure JavaScript implementations.
 */

// Import JavaScript fallbacks
import { Vec4 as JsVec4 } from '../math/Vec4.js';
import { Rotor4D as JsRotor4D } from '../math/Rotor4D.js';
import { Mat4x4 as JsMat4x4 } from '../math/Mat4x4.js';
import * as JsProjection from '../math/Projection.js';

/**
 * Module state
 */
let wasmModule = null;
let isLoaded = false;
let isLoading = false;
let loadError = null;
let useWasm = false;

/**
 * Configuration options
 */
const config = {
    /** Path to WASM files */
    wasmPath: '/wasm/',
    /** Prefer WASM over JavaScript when available */
    preferWasm: true,
    /** Timeout for WASM loading (ms) */
    loadTimeout: 10000,
    /** Enable debug logging */
    debug: false
};

/**
 * Set configuration options
 * @param {object} options
 */
export function configure(options) {
    Object.assign(config, options);
}

/**
 * Log debug message
 * @private
 */
function debugLog(...args) {
    if (config.debug) {
        console.log('[VIB3-WASM]', ...args);
    }
}

/**
 * Check if WebAssembly is supported
 * @returns {boolean}
 */
export function isWasmSupported() {
    return typeof WebAssembly !== 'undefined' &&
           typeof WebAssembly.instantiate === 'function';
}

/**
 * Check if SIMD is supported in WebAssembly
 * @returns {boolean}
 */
export function isSimdSupported() {
    if (!isWasmSupported()) return false;

    try {
        // Test SIMD support with a minimal WASM module
        const simdTest = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, // WASM magic
            0x01, 0x00, 0x00, 0x00, // Version 1
            0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // Type section (v128 return)
            0x03, 0x02, 0x01, 0x00, // Function section
            0x0a, 0x0a, 0x01, 0x08, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x0b // Code section
        ]);
        return WebAssembly.validate(simdTest);
    } catch {
        return false;
    }
}

/**
 * Load the WASM module
 * @returns {Promise<object>} The loaded module or fallback
 */
export async function loadWasmModule() {
    if (isLoaded) {
        return wasmModule;
    }

    if (isLoading) {
        // Wait for existing load to complete
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (isLoaded) {
                    clearInterval(checkInterval);
                    resolve(wasmModule);
                } else if (loadError) {
                    clearInterval(checkInterval);
                    reject(loadError);
                }
            }, 50);
        });
    }

    if (!config.preferWasm || !isWasmSupported()) {
        debugLog('Using JavaScript fallback (WASM not preferred or unsupported)');
        return getFallbackModule();
    }

    isLoading = true;

    try {
        debugLog('Loading WASM module...');

        // Dynamic import of the WASM module
        const wasmPath = config.wasmPath.endsWith('/') ? config.wasmPath : config.wasmPath + '/';
        const moduleUrl = wasmPath + 'vib3.js';

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.loadTimeout);

        try {
            // Try to load the WASM module factory
            const createModule = await import(/* webpackIgnore: true */ moduleUrl);

            clearTimeout(timeoutId);

            // Initialize the module
            wasmModule = await createModule.default({
                locateFile: (path) => wasmPath + path
            });

            isLoaded = true;
            useWasm = true;
            debugLog('WASM module loaded successfully');
            debugLog('SIMD enabled:', wasmModule.hasSimd?.() ?? 'unknown');

            return wasmModule;

        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }

    } catch (err) {
        debugLog('WASM loading failed, using fallback:', err.message);
        loadError = err;
        return getFallbackModule();

    } finally {
        isLoading = false;
    }
}

/**
 * Get the fallback JavaScript module
 * @private
 */
function getFallbackModule() {
    wasmModule = createFallbackModule();
    isLoaded = true;
    useWasm = false;
    return wasmModule;
}

/**
 * Create fallback module wrapping JavaScript implementations
 * @private
 */
function createFallbackModule() {
    return {
        // Version info
        getVersion: () => '1.0.0-js',
        hasSimd: () => false,
        isWasm: () => false,

        // Vec4
        Vec4: JsVec4,
        vec4FromArray: (arr) => new JsVec4(arr[0], arr[1], arr[2], arr[3]),

        // Rotor4D
        Rotor4D: JsRotor4D,
        RotationPlane: {
            XY: 0, XZ: 1, YZ: 2, XW: 3, YW: 4, ZW: 5
        },
        rotorFromEuler6Array: (arr) => JsRotor4D.fromEuler6(
            arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]
        ),

        // Mat4x4
        Mat4x4: JsMat4x4,
        matrixFromAnglesArray: (arr) => JsMat4x4.rotationFromAngles(
            arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]
        ),

        // Projections
        projectPerspective: JsProjection.perspectiveProject,
        projectStereographic: JsProjection.stereographicProject,
        projectOrthographic: JsProjection.orthographicProject,
        projectOblique: JsProjection.obliqueProject,
        projectSlice: JsProjection.sliceProject,
        projectToFloatArray: JsProjection.projectToFloatArray
    };
}

/**
 * Check if WASM module is loaded
 * @returns {boolean}
 */
export function isWasmLoaded() {
    return isLoaded && useWasm;
}

/**
 * Check if fallback is being used
 * @returns {boolean}
 */
export function isFallbackActive() {
    return isLoaded && !useWasm;
}

/**
 * Get the current module (WASM or fallback)
 * @returns {object|null}
 */
export function getModule() {
    return wasmModule;
}

/**
 * Get module status
 * @returns {object}
 */
export function getStatus() {
    return {
        isLoaded,
        isLoading,
        useWasm,
        hasError: loadError !== null,
        error: loadError?.message ?? null,
        simdSupported: isSimdSupported(),
        wasmSupported: isWasmSupported()
    };
}

/**
 * Force reload the module (for testing)
 */
export function reset() {
    wasmModule = null;
    isLoaded = false;
    isLoading = false;
    loadError = null;
    useWasm = false;
}

/**
 * Auto-initialize on import if in browser
 */
let initPromise = null;

export function init() {
    if (!initPromise) {
        initPromise = loadWasmModule().catch(err => {
            debugLog('Auto-init failed:', err.message);
            return getFallbackModule();
        });
    }
    return initPromise;
}

// Convenience re-exports
export {
    JsVec4 as Vec4Fallback,
    JsRotor4D as Rotor4DFallback,
    JsMat4x4 as Mat4x4Fallback
};

export default {
    configure,
    loadWasmModule,
    isWasmSupported,
    isSimdSupported,
    isWasmLoaded,
    isFallbackActive,
    getModule,
    getStatus,
    reset,
    init
};
