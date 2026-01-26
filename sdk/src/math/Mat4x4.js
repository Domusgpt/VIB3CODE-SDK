/**
 * Mat4x4 - 4x4 Matrix Class
 *
 * Column-major layout for WebGL/GPU compatibility.
 * Used for 4D transformations including all 6 rotation planes.
 *
 * Memory layout (column-major):
 * | m[0]  m[4]  m[8]   m[12] |
 * | m[1]  m[5]  m[9]   m[13] |
 * | m[2]  m[6]  m[10]  m[14] |
 * | m[3]  m[7]  m[11]  m[15] |
 *
 * @example
 * const rotXW = Mat4x4.rotationXW(Math.PI / 4);
 * const transformed = rotXW.multiplyVec4(vec4);
 */

import { Vec4 } from './Vec4.js';

export class Mat4x4 {
    /**
     * Create a new 4x4 matrix
     * Default is identity matrix
     * @param {Float32Array|number[]} [elements] - 16 elements in column-major order
     */
    constructor(elements = null) {
        this.data = new Float32Array(16);

        if (elements) {
            if (elements.length !== 16) {
                throw new Error('Mat4x4 requires exactly 16 elements');
            }
            this.data.set(elements);
        } else {
            // Default to identity
            this.data[0] = 1;
            this.data[5] = 1;
            this.data[10] = 1;
            this.data[15] = 1;
        }
    }

    /**
     * Create identity matrix
     * @returns {Mat4x4}
     */
    static identity() {
        return new Mat4x4([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create zero matrix
     * @returns {Mat4x4}
     */
    static zero() {
        return new Mat4x4(new Float32Array(16));
    }

    /**
     * Clone this matrix
     * @returns {Mat4x4}
     */
    clone() {
        return new Mat4x4(this.data);
    }

    /**
     * Copy from another matrix
     * @param {Mat4x4} m
     * @returns {Mat4x4} this
     */
    copy(m) {
        this.data.set(m.data);
        return this;
    }

    /**
     * Get element at row, column
     * @param {number} row - 0-3
     * @param {number} col - 0-3
     * @returns {number}
     */
    get(row, col) {
        return this.data[col * 4 + row];
    }

    /**
     * Set element at row, column
     * @param {number} row - 0-3
     * @param {number} col - 0-3
     * @param {number} value
     * @returns {Mat4x4} this
     */
    set(row, col, value) {
        this.data[col * 4 + row] = value;
        return this;
    }

    /**
     * Get column as Vec4
     * @param {number} col - 0-3
     * @returns {Vec4}
     */
    getColumn(col) {
        const i = col * 4;
        return new Vec4(this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]);
    }

    /**
     * Set column from Vec4
     * @param {number} col - 0-3
     * @param {Vec4} v
     * @returns {Mat4x4} this
     */
    setColumn(col, v) {
        const i = col * 4;
        this.data[i] = v.x;
        this.data[i + 1] = v.y;
        this.data[i + 2] = v.z;
        this.data[i + 3] = v.w;
        return this;
    }

    /**
     * Get row as Vec4
     * @param {number} row - 0-3
     * @returns {Vec4}
     */
    getRow(row) {
        return new Vec4(
            this.data[row],
            this.data[row + 4],
            this.data[row + 8],
            this.data[row + 12]
        );
    }

    /**
     * Set row from Vec4
     * @param {number} row - 0-3
     * @param {Vec4} v
     * @returns {Mat4x4} this
     */
    setRow(row, v) {
        this.data[row] = v.x;
        this.data[row + 4] = v.y;
        this.data[row + 8] = v.z;
        this.data[row + 12] = v.w;
        return this;
    }

    /**
     * Multiply two matrices
     * @param {Mat4x4} m - Right operand
     * @returns {Mat4x4} New matrix = this * m
     */
    multiply(m) {
        const a = this.data;
        const b = m.data;
        const result = new Float32Array(16);

        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + row] * b[col * 4 + k];
                }
                result[col * 4 + row] = sum;
            }
        }

        return new Mat4x4(result);
    }

    /**
     * Multiply in place (this = this * m)
     * @param {Mat4x4} m
     * @returns {Mat4x4} this
     */
    multiplyInPlace(m) {
        const result = this.multiply(m);
        this.data.set(result.data);
        return this;
    }

    /**
     * Pre-multiply (this = m * this)
     * @param {Mat4x4} m
     * @returns {Mat4x4} this
     */
    preMultiplyInPlace(m) {
        const result = m.multiply(this);
        this.data.set(result.data);
        return this;
    }

    /**
     * Transform a Vec4 by this matrix
     * @param {Vec4} v
     * @returns {Vec4} Transformed vector
     */
    multiplyVec4(v) {
        const m = this.data;
        return new Vec4(
            m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * v.w,
            m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * v.w,
            m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * v.w,
            m[3] * v.x + m[7] * v.y + m[11] * v.z + m[15] * v.w
        );
    }

    /**
     * Transform array of Vec4s by this matrix
     * @param {Vec4[]} vectors
     * @returns {Vec4[]} Transformed vectors
     */
    multiplyVec4Array(vectors) {
        return vectors.map(v => this.multiplyVec4(v));
    }

    /**
     * Transform a Float32Array of packed vec4s (x,y,z,w,x,y,z,w,...)
     * @param {Float32Array} packed - Input packed vectors
     * @param {Float32Array} [output] - Optional output buffer
     * @returns {Float32Array} Transformed packed vectors
     */
    multiplyPackedVec4(packed, output = null) {
        const count = packed.length / 4;
        const result = output || new Float32Array(packed.length);
        const m = this.data;

        for (let i = 0; i < count; i++) {
            const offset = i * 4;
            const x = packed[offset];
            const y = packed[offset + 1];
            const z = packed[offset + 2];
            const w = packed[offset + 3];

            result[offset] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
            result[offset + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
            result[offset + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
            result[offset + 3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
        }

        return result;
    }

    /**
     * Add another matrix
     * @param {Mat4x4} m
     * @returns {Mat4x4} New matrix
     */
    add(m) {
        const result = new Float32Array(16);
        for (let i = 0; i < 16; i++) {
            result[i] = this.data[i] + m.data[i];
        }
        return new Mat4x4(result);
    }

    /**
     * Multiply by scalar
     * @param {number} s
     * @returns {Mat4x4} New matrix
     */
    scale(s) {
        const result = new Float32Array(16);
        for (let i = 0; i < 16; i++) {
            result[i] = this.data[i] * s;
        }
        return new Mat4x4(result);
    }

    /**
     * Transpose matrix
     * @returns {Mat4x4} New transposed matrix
     */
    transpose() {
        const m = this.data;
        return new Mat4x4([
            m[0], m[4], m[8], m[12],
            m[1], m[5], m[9], m[13],
            m[2], m[6], m[10], m[14],
            m[3], m[7], m[11], m[15]
        ]);
    }

    /**
     * Transpose in place
     * @returns {Mat4x4} this
     */
    transposeInPlace() {
        const m = this.data;
        let tmp;

        tmp = m[1]; m[1] = m[4]; m[4] = tmp;
        tmp = m[2]; m[2] = m[8]; m[8] = tmp;
        tmp = m[3]; m[3] = m[12]; m[12] = tmp;
        tmp = m[6]; m[6] = m[9]; m[9] = tmp;
        tmp = m[7]; m[7] = m[13]; m[13] = tmp;
        tmp = m[11]; m[11] = m[14]; m[14] = tmp;

        return this;
    }

    /**
     * Calculate determinant
     * @returns {number}
     */
    determinant() {
        const m = this.data;

        const a00 = m[0], a01 = m[4], a02 = m[8], a03 = m[12];
        const a10 = m[1], a11 = m[5], a12 = m[9], a13 = m[13];
        const a20 = m[2], a21 = m[6], a22 = m[10], a23 = m[14];
        const a30 = m[3], a31 = m[7], a32 = m[11], a33 = m[15];

        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;

        return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    }

    /**
     * Calculate inverse matrix
     * @returns {Mat4x4|null} Inverse matrix or null if singular
     */
    inverse() {
        const m = this.data;
        const inv = new Float32Array(16);

        inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] +
            m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];

        inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] -
            m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];

        inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] +
            m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];

        inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] -
            m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];

        inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] -
            m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];

        inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] +
            m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];

        inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] -
            m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];

        inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] +
            m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];

        inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] +
            m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];

        inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] -
            m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];

        inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] +
            m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];

        inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] -
            m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];

        inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] -
            m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];

        inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] +
            m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];

        inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] -
            m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];

        inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] +
            m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

        const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];

        if (Math.abs(det) < 1e-10) {
            return null; // Singular matrix
        }

        const invDet = 1 / det;
        for (let i = 0; i < 16; i++) {
            inv[i] *= invDet;
        }

        return new Mat4x4(inv);
    }

    /**
     * Check if approximately equal to another matrix
     * @param {Mat4x4} m
     * @param {number} epsilon
     * @returns {boolean}
     */
    equals(m, epsilon = 1e-6) {
        for (let i = 0; i < 16; i++) {
            if (Math.abs(this.data[i] - m.data[i]) > epsilon) {
                return false;
            }
        }
        return true;
    }

    /**
     * Check if this is identity matrix
     * @param {number} epsilon
     * @returns {boolean}
     */
    isIdentity(epsilon = 1e-6) {
        return this.equals(Mat4x4.identity(), epsilon);
    }

    /**
     * Check if orthogonal (rotation matrix)
     * @param {number} epsilon
     * @returns {boolean}
     */
    isOrthogonal(epsilon = 1e-6) {
        const product = this.multiply(this.transpose());
        return product.isIdentity(epsilon);
    }

    /**
     * Get the Float32Array for GPU upload
     * @returns {Float32Array}
     */
    toFloat32Array() {
        return new Float32Array(this.data);
    }

    /**
     * Convert to 2D array (row-major for readability)
     * @returns {number[][]}
     */
    toArray2D() {
        return [
            [this.data[0], this.data[4], this.data[8], this.data[12]],
            [this.data[1], this.data[5], this.data[9], this.data[13]],
            [this.data[2], this.data[6], this.data[10], this.data[14]],
            [this.data[3], this.data[7], this.data[11], this.data[15]]
        ];
    }

    /**
     * String representation
     * @param {number} precision
     * @returns {string}
     */
    toString(precision = 3) {
        const rows = this.toArray2D();
        return rows.map(row =>
            '| ' + row.map(v => v.toFixed(precision).padStart(8)).join(' ') + ' |'
        ).join('\n');
    }

    /**
     * JSON representation
     * @returns {object}
     */
    toJSON() {
        return { data: Array.from(this.data), columnMajor: true };
    }

    /**
     * Create from JSON
     * @param {object} json
     * @returns {Mat4x4}
     */
    static fromJSON(json) {
        return new Mat4x4(json.data);
    }

    // ========== ROTATION MATRICES FOR ALL 6 PLANES ==========

    /**
     * Create XY plane rotation matrix (standard Z-axis rotation in 3D)
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationXY(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            c, s, 0, 0,
            -s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create XZ plane rotation matrix (standard Y-axis rotation in 3D)
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationXZ(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create YZ plane rotation matrix (standard X-axis rotation in 3D)
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationYZ(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1
        ]);
    }

    /**
     * Create XW plane rotation matrix (4D hyperspace rotation)
     * Creates "inside-out" effect when w approaches viewer
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationXW(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            c, 0, 0, s,
            0, 1, 0, 0,
            0, 0, 1, 0,
            -s, 0, 0, c
        ]);
    }

    /**
     * Create YW plane rotation matrix (4D hyperspace rotation)
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationYW(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            1, 0, 0, 0,
            0, c, 0, s,
            0, 0, 1, 0,
            0, -s, 0, c
        ]);
    }

    /**
     * Create ZW plane rotation matrix (4D hyperspace rotation)
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotationZW(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Mat4x4([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, c, s,
            0, 0, -s, c
        ]);
    }

    /**
     * Create rotation matrix from plane name and angle
     * @param {string} plane - One of 'XY', 'XZ', 'YZ', 'XW', 'YW', 'ZW'
     * @param {number} angle - Rotation angle in radians
     * @returns {Mat4x4}
     */
    static rotation(plane, angle) {
        switch (plane.toUpperCase()) {
            case 'XY': return Mat4x4.rotationXY(angle);
            case 'XZ': return Mat4x4.rotationXZ(angle);
            case 'YZ': return Mat4x4.rotationYZ(angle);
            case 'XW': return Mat4x4.rotationXW(angle);
            case 'YW': return Mat4x4.rotationYW(angle);
            case 'ZW': return Mat4x4.rotationZW(angle);
            default:
                throw new Error(`Invalid rotation plane: ${plane}`);
        }
    }

    /**
     * Create combined rotation matrix from all 6 angles
     * Order: XY, XZ, YZ, XW, YW, ZW
     *
     * @param {object} angles - Rotation angles
     * @param {number} [angles.xy=0] - XY plane rotation
     * @param {number} [angles.xz=0] - XZ plane rotation
     * @param {number} [angles.yz=0] - YZ plane rotation
     * @param {number} [angles.xw=0] - XW plane rotation
     * @param {number} [angles.yw=0] - YW plane rotation
     * @param {number} [angles.zw=0] - ZW plane rotation
     * @returns {Mat4x4}
     */
    static rotationFromAngles(angles) {
        let result = Mat4x4.identity();

        if (angles.xy) result = result.multiply(Mat4x4.rotationXY(angles.xy));
        if (angles.xz) result = result.multiply(Mat4x4.rotationXZ(angles.xz));
        if (angles.yz) result = result.multiply(Mat4x4.rotationYZ(angles.yz));
        if (angles.xw) result = result.multiply(Mat4x4.rotationXW(angles.xw));
        if (angles.yw) result = result.multiply(Mat4x4.rotationYW(angles.yw));
        if (angles.zw) result = result.multiply(Mat4x4.rotationZW(angles.zw));

        return result;
    }

    /**
     * Create rotation matrix from parameter format (rot4dXY, rot4dXZ, etc.)
     * @param {object} params - Parameters object
     * @returns {Mat4x4}
     */
    static rotationFromParameters(params) {
        return Mat4x4.rotationFromAngles({
            xy: params.rot4dXY || 0,
            xz: params.rot4dXZ || 0,
            yz: params.rot4dYZ || 0,
            xw: params.rot4dXW || 0,
            yw: params.rot4dYW || 0,
            zw: params.rot4dZW || 0
        });
    }

    // ========== OTHER TRANSFORMATIONS ==========

    /**
     * Create uniform scale matrix
     * @param {number} s - Scale factor
     * @returns {Mat4x4}
     */
    static uniformScale(s) {
        return new Mat4x4([
            s, 0, 0, 0,
            0, s, 0, 0,
            0, 0, s, 0,
            0, 0, 0, s
        ]);
    }

    /**
     * Create non-uniform scale matrix
     * @param {number} sx
     * @param {number} sy
     * @param {number} sz
     * @param {number} sw
     * @returns {Mat4x4}
     */
    static scale(sx, sy, sz, sw = 1) {
        return new Mat4x4([
            sx, 0, 0, 0,
            0, sy, 0, 0,
            0, 0, sz, 0,
            0, 0, 0, sw
        ]);
    }

    /**
     * Create translation matrix (affine, in 5D homogeneous coordinates conceptually)
     * Note: For 4D translation, we'd need 5x5 matrices
     * This creates a shear that approximates translation for small displacements
     * @param {number} tx
     * @param {number} ty
     * @param {number} tz
     * @param {number} tw
     * @returns {Mat4x4}
     */
    static translation(tx, ty, tz, tw = 0) {
        // For true 4D translation, you need 5D homogeneous coordinates
        // This is a placeholder that adds the translation to the W column
        return new Mat4x4([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            tx, ty, tz, 1 + tw
        ]);
    }
}

export default Mat4x4;
