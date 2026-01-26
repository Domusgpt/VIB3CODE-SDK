/**
 * WASM Build Target Configuration
 *
 * Defines the build configuration for compiling VIB3+ math core to WebAssembly.
 * The WASM module provides high-performance 4D math operations shared across
 * Web, Flutter, and native platforms.
 *
 * Build commands:
 *   npm run build:wasm       - Build WASM module
 *   npm run build:wasm:debug - Build with debug symbols
 *   npm run test:wasm        - Run WASM tests
 */

export const WASM_BUILD_TARGET = {
    target: 'wasm32-unknown-unknown',
    toolchain: 'rust',

    // Core math modules to compile
    entryPoints: [
        'src/math/rotations.js',
        'src/math/projections.js',
        'src/math/Rotor4D.js',
        'src/math/Vec4.js'
    ],

    // Output configuration
    outputDir: 'dist/wasm',
    outputFile: 'vib3_core.wasm',
    jsGlueFile: 'vib3_core.js',

    // Build optimization
    optimization: {
        level: 3,           // -O3 optimization
        lto: true,          // Link-time optimization
        codegen_units: 1,   // Single codegen unit for better optimization
        debug: false        // Strip debug info in release
    },

    // WASM features to enable
    features: [
        'simd128',          // SIMD operations for vector math
        'bulk-memory',      // Bulk memory operations
        'mutable-globals',  // Mutable global variables
        'nontrapping-fptoint' // Non-trapping float-to-int conversions
    ],

    // Memory configuration
    memory: {
        initial: 16,        // 16 pages (1MB) initial
        maximum: 256,       // 256 pages (16MB) maximum
        shared: false       // Not using shared memory (no threading)
    },

    // Exported functions
    exports: [
        // Rotor4D operations
        'rotor4d_new',
        'rotor4d_from_plane_angle',
        'rotor4d_multiply',
        'rotor4d_rotate_vec4',
        'rotor4d_normalize',
        'rotor4d_inverse',

        // Vec4 operations
        'vec4_new',
        'vec4_add',
        'vec4_sub',
        'vec4_scale',
        'vec4_dot',
        'vec4_length',
        'vec4_normalize',

        // Projection operations
        'project_stereographic',
        'project_perspective',
        'project_4d_to_3d',

        // Matrix operations
        'mat4_identity',
        'mat4_multiply',
        'mat4_from_rotor',
        'mat4_perspective',

        // Command buffer execution
        'execute_command_buffer',
        'get_last_error'
    ],

    notes: [
        'Use wasm-pack or cargo + wasm-bindgen for builds.',
        'Expose math primitives as the shared core for Web + Flutter bindings.',
        'SIMD enabled for 4D vector operations - requires browser support.',
        'Memory is pre-allocated for zero-copy buffer sharing.'
    ]
};

/**
 * Cargo.toml template for WASM build
 */
export const CARGO_TOML_TEMPLATE = `
[package]
name = "vib3-core"
version = "1.9.0"
edition = "2021"
description = "VIB3+ 4D visualization math core"

[lib]
crate-type = ["cdylib", "rlib"]

[features]
default = ["console_error_panic_hook"]
simd = []

[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }

# Optional: better panic messages in debug
console_error_panic_hook = { version = "0.1", optional = true }

[dev-dependencies]
wasm-bindgen-test = "0.3"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
`;

/**
 * Rust module template for Rotor4D
 */
export const ROTOR4D_RS_TEMPLATE = `
//! 4D Rotor implementation using geometric algebra
//!
//! A rotor in 4D represents a rotation as a multivector with 8 components:
//! R = s + xy*e12 + xz*e13 + yz*e23 + xw*e14 + yw*e24 + zw*e34 + xyzw*e1234

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Rotor4D {
    /// Scalar component
    pub s: f32,
    /// XY bivector component
    pub xy: f32,
    /// XZ bivector component
    pub xz: f32,
    /// YZ bivector component
    pub yz: f32,
    /// XW bivector component
    pub xw: f32,
    /// YW bivector component
    pub yw: f32,
    /// ZW bivector component
    pub zw: f32,
    /// XYZW quadvector component
    pub xyzw: f32,
}

#[wasm_bindgen]
impl Rotor4D {
    /// Create identity rotor
    #[wasm_bindgen(constructor)]
    pub fn new() -> Rotor4D {
        Rotor4D {
            s: 1.0, xy: 0.0, xz: 0.0, yz: 0.0,
            xw: 0.0, yw: 0.0, zw: 0.0, xyzw: 0.0,
        }
    }

    /// Create rotor from rotation plane and angle
    pub fn from_plane_angle(plane: &str, angle: f32) -> Rotor4D {
        let half = angle * 0.5;
        let c = half.cos();
        let s = half.sin();

        let mut r = Rotor4D::new();
        r.s = c;

        match plane {
            "XY" => r.xy = s,
            "XZ" => r.xz = s,
            "YZ" => r.yz = s,
            "XW" => r.xw = s,
            "YW" => r.yw = s,
            "ZW" => r.zw = s,
            _ => {}
        }

        r
    }

    /// Multiply two rotors (geometric product)
    pub fn multiply(&self, other: &Rotor4D) -> Rotor4D {
        // Full geometric algebra multiplication
        Rotor4D {
            s: self.s * other.s
                - self.xy * other.xy - self.xz * other.xz - self.yz * other.yz
                - self.xw * other.xw - self.yw * other.yw - self.zw * other.zw
                + self.xyzw * other.xyzw,
            xy: self.s * other.xy + self.xy * other.s
                + self.xz * other.yz - self.yz * other.xz
                + self.xw * other.yw - self.yw * other.xw
                - self.zw * other.xyzw - self.xyzw * other.zw,
            xz: self.s * other.xz + self.xz * other.s
                - self.xy * other.yz + self.yz * other.xy
                + self.xw * other.zw - self.zw * other.xw
                + self.yw * other.xyzw + self.xyzw * other.yw,
            yz: self.s * other.yz + self.yz * other.s
                + self.xy * other.xz - self.xz * other.xy
                + self.yw * other.zw - self.zw * other.yw
                - self.xw * other.xyzw - self.xyzw * other.xw,
            xw: self.s * other.xw + self.xw * other.s
                - self.xy * other.yw + self.yw * other.xy
                - self.xz * other.zw + self.zw * other.xz
                - self.yz * other.xyzw - self.xyzw * other.yz,
            yw: self.s * other.yw + self.yw * other.s
                + self.xy * other.xw - self.xw * other.xy
                - self.yz * other.zw + self.zw * other.yz
                + self.xz * other.xyzw + self.xyzw * other.xz,
            zw: self.s * other.zw + self.zw * other.s
                + self.xz * other.xw - self.xw * other.xz
                + self.yz * other.yw - self.yw * other.yz
                - self.xy * other.xyzw - self.xyzw * other.xy,
            xyzw: self.s * other.xyzw + self.xyzw * other.s
                + self.xy * other.zw + self.zw * other.xy
                - self.xz * other.yw - self.yw * other.xz
                + self.yz * other.xw + self.xw * other.yz,
        }
    }

    /// Get magnitude squared
    pub fn magnitude_squared(&self) -> f32 {
        self.s * self.s
            + self.xy * self.xy + self.xz * self.xz + self.yz * self.yz
            + self.xw * self.xw + self.yw * self.yw + self.zw * self.zw
            + self.xyzw * self.xyzw
    }

    /// Normalize the rotor
    pub fn normalize(&mut self) {
        let mag = self.magnitude_squared().sqrt();
        if mag > 1e-10 {
            let inv = 1.0 / mag;
            self.s *= inv;
            self.xy *= inv;
            self.xz *= inv;
            self.yz *= inv;
            self.xw *= inv;
            self.yw *= inv;
            self.zw *= inv;
            self.xyzw *= inv;
        }
    }

    /// Get rotor components as array
    pub fn to_array(&self) -> Vec<f32> {
        vec![self.s, self.xy, self.xz, self.yz, self.xw, self.yw, self.zw, self.xyzw]
    }
}
`;

/**
 * Build script template
 */
export const BUILD_SCRIPT = `
#!/bin/bash
# VIB3+ WASM Build Script

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WASM_DIR="$PROJECT_ROOT/src/platforms/wasm"
OUTPUT_DIR="$PROJECT_ROOT/dist/wasm"

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
NC='\\033[0m'

echo "Building VIB3+ WASM module..."

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo -e "\${RED}Error: wasm-pack not found\${NC}"
    echo "Install with: cargo install wasm-pack"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build WASM module
cd "$WASM_DIR/rust"

if [ "$1" == "--debug" ]; then
    echo "Building debug version..."
    wasm-pack build --target web --dev --out-dir "$OUTPUT_DIR"
else
    echo "Building release version..."
    wasm-pack build --target web --release --out-dir "$OUTPUT_DIR"
fi

# Copy JS glue
cp "$OUTPUT_DIR/vib3_core.js" "$PROJECT_ROOT/dist/"
cp "$OUTPUT_DIR/vib3_core_bg.wasm" "$PROJECT_ROOT/dist/vib3_core.wasm"

echo -e "\${GREEN}Build complete!\${NC}"
echo "Output: $OUTPUT_DIR"
`;

/**
 * JavaScript glue code for loading WASM module
 */
export const WASM_LOADER = `
/**
 * VIB3+ WASM Loader
 *
 * Loads and initializes the WASM module, providing a JavaScript API
 * for the high-performance math operations.
 */

let wasmInstance = null;
let wasmMemory = null;

/**
 * Load the WASM module
 * @param {string} [wasmPath] - Path to WASM file (default: 'vib3_core.wasm')
 * @returns {Promise<object>} - WASM exports
 */
export async function loadVib3WASM(wasmPath = 'vib3_core.wasm') {
    if (wasmInstance) {
        return wasmInstance.exports;
    }

    // Check for WASM support
    if (typeof WebAssembly === 'undefined') {
        throw new Error('WebAssembly not supported');
    }

    try {
        // Try streaming compilation first
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            const response = await fetch(wasmPath);
            const result = await WebAssembly.instantiateStreaming(response, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 16, maximum: 256 }),
                    consoleLog: (ptr, len) => {
                        // Log string from WASM memory
                        const bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
                        console.log(new TextDecoder().decode(bytes));
                    }
                }
            });
            wasmInstance = result.instance;
            wasmMemory = wasmInstance.exports.memory;
        } else {
            // Fallback to ArrayBuffer compilation
            const response = await fetch(wasmPath);
            const bytes = await response.arrayBuffer();
            const result = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 16, maximum: 256 })
                }
            });
            wasmInstance = result.instance;
            wasmMemory = wasmInstance.exports.memory;
        }

        return wasmInstance.exports;
    } catch (error) {
        console.error('Failed to load VIB3+ WASM:', error);
        throw error;
    }
}

/**
 * Check if WASM is loaded
 * @returns {boolean}
 */
export function isWASMLoaded() {
    return wasmInstance !== null;
}

/**
 * Get WASM memory buffer
 * @returns {ArrayBuffer|null}
 */
export function getWASMMemory() {
    return wasmMemory?.buffer || null;
}

/**
 * Allocate memory in WASM
 * @param {number} size - Bytes to allocate
 * @returns {number} - Pointer to allocated memory
 */
export function wasmAlloc(size) {
    if (!wasmInstance) throw new Error('WASM not loaded');
    return wasmInstance.exports.alloc(size);
}

/**
 * Free memory in WASM
 * @param {number} ptr - Pointer to free
 */
export function wasmFree(ptr) {
    if (!wasmInstance) throw new Error('WASM not loaded');
    wasmInstance.exports.free(ptr);
}

/**
 * High-level API wrapping WASM functions
 */
export class Vib3WASMCore {
    constructor() {
        this._exports = null;
    }

    async init(wasmPath) {
        this._exports = await loadVib3WASM(wasmPath);
        return this;
    }

    // Rotor4D operations
    createRotor() {
        return this._exports.rotor4d_new();
    }

    rotorFromPlaneAngle(plane, angle) {
        // plane: 0=XY, 1=XZ, 2=YZ, 3=XW, 4=YW, 5=ZW
        return this._exports.rotor4d_from_plane_angle(plane, angle);
    }

    multiplyRotors(r1, r2) {
        return this._exports.rotor4d_multiply(r1, r2);
    }

    rotateVec4(rotor, vec) {
        return this._exports.rotor4d_rotate_vec4(rotor, vec);
    }

    // Vec4 operations
    createVec4(x, y, z, w) {
        return this._exports.vec4_new(x, y, z, w);
    }

    addVec4(v1, v2) {
        return this._exports.vec4_add(v1, v2);
    }

    dotVec4(v1, v2) {
        return this._exports.vec4_dot(v1, v2);
    }

    normalizeVec4(v) {
        return this._exports.vec4_normalize(v);
    }

    // Projection operations
    projectStereographic(vec, dimension) {
        return this._exports.project_stereographic(vec, dimension);
    }

    projectPerspective(vec, fov, near, far) {
        return this._exports.project_perspective(vec, fov, near, far);
    }

    // Command buffer execution
    executeCommands(commandsJson) {
        // Encode JSON to WASM memory
        const encoder = new TextEncoder();
        const bytes = encoder.encode(commandsJson);
        const ptr = wasmAlloc(bytes.length);
        new Uint8Array(getWASMMemory(), ptr, bytes.length).set(bytes);

        const result = this._exports.execute_command_buffer(ptr, bytes.length);

        wasmFree(ptr);
        return result;
    }
}

export default Vib3WASMCore;
`;

export default WASM_BUILD_TARGET;
