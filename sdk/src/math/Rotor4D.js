/**
 * Rotor4D - 4D Rotation using Geometric Algebra
 *
 * A rotor represents a rotation in 4D space using 8 components:
 * - 1 scalar (s)
 * - 6 bivector components (one per rotation plane: xy, xz, yz, xw, yw, zw)
 * - 1 pseudoscalar (xyzw)
 *
 * Unlike quaternions (which only work for 3D), rotors properly handle
 * all 6 rotation planes in 4D. Rotation is applied via sandwich product:
 * v' = R v R†
 *
 * @example
 * // Create rotor for 45° rotation in XW plane
 * const rotor = Rotor4D.fromAxisAngle('XW', Math.PI / 4);
 * const rotated = rotor.rotate(vec4);
 *
 * // Compose rotations
 * const combined = rotor1.multiply(rotor2);
 */

import { Vec4 } from './Vec4.js';

export class Rotor4D {
    /**
     * Create a new 4D rotor
     * Default is identity rotor (no rotation)
     *
     * @param {number} s - Scalar component
     * @param {number} xy - XY bivector (rotation in XY plane)
     * @param {number} xz - XZ bivector
     * @param {number} yz - YZ bivector
     * @param {number} xw - XW bivector (4D rotation plane)
     * @param {number} yw - YW bivector
     * @param {number} zw - ZW bivector
     * @param {number} xyzw - Pseudoscalar (4D volume element)
     */
    constructor(s = 1, xy = 0, xz = 0, yz = 0, xw = 0, yw = 0, zw = 0, xyzw = 0) {
        this.s = s;
        this.xy = xy;
        this.xz = xz;
        this.yz = yz;
        this.xw = xw;
        this.yw = yw;
        this.zw = zw;
        this.xyzw = xyzw;
    }

    /**
     * Create identity rotor (no rotation)
     * @returns {Rotor4D}
     */
    static identity() {
        return new Rotor4D(1, 0, 0, 0, 0, 0, 0, 0);
    }

    /**
     * Create a copy of this rotor
     * @returns {Rotor4D}
     */
    clone() {
        return new Rotor4D(
            this.s, this.xy, this.xz, this.yz,
            this.xw, this.yw, this.zw, this.xyzw
        );
    }

    /**
     * Copy values from another rotor
     * @param {Rotor4D} r
     * @returns {Rotor4D} this
     */
    copy(r) {
        this.s = r.s;
        this.xy = r.xy;
        this.xz = r.xz;
        this.yz = r.yz;
        this.xw = r.xw;
        this.yw = r.yw;
        this.zw = r.zw;
        this.xyzw = r.xyzw;
        return this;
    }

    /**
     * Create rotor from rotation in a single plane
     *
     * @param {string} plane - One of 'XY', 'XZ', 'YZ', 'XW', 'YW', 'ZW'
     * @param {number} angle - Rotation angle in radians
     * @returns {Rotor4D}
     */
    static fromPlaneAngle(plane, angle) {
        const halfAngle = angle / 2;
        const c = Math.cos(halfAngle);
        const s = Math.sin(halfAngle);

        const rotor = new Rotor4D();
        rotor.s = c;

        // Set the appropriate bivector component
        // Note: negative sign because of geometric algebra conventions
        switch (plane.toUpperCase()) {
            case 'XY': rotor.xy = -s; break;
            case 'XZ': rotor.xz = -s; break;
            case 'YZ': rotor.yz = -s; break;
            case 'XW': rotor.xw = -s; break;
            case 'YW': rotor.yw = -s; break;
            case 'ZW': rotor.zw = -s; break;
            default:
                throw new Error(`Invalid rotation plane: ${plane}. Use XY, XZ, YZ, XW, YW, or ZW.`);
        }

        return rotor;
    }

    /**
     * Create rotor from all 6 rotation angles
     * Composes rotations in order: XY, XZ, YZ, XW, YW, ZW
     *
     * @param {object} angles - Object with rotation angles
     * @param {number} angles.xy - XY plane rotation
     * @param {number} angles.xz - XZ plane rotation
     * @param {number} angles.yz - YZ plane rotation
     * @param {number} angles.xw - XW plane rotation
     * @param {number} angles.yw - YW plane rotation
     * @param {number} angles.zw - ZW plane rotation
     * @returns {Rotor4D}
     */
    static fromEuler6(angles) {
        let result = Rotor4D.identity();

        // Apply rotations in consistent order
        if (angles.xy) result = result.multiply(Rotor4D.fromPlaneAngle('XY', angles.xy));
        if (angles.xz) result = result.multiply(Rotor4D.fromPlaneAngle('XZ', angles.xz));
        if (angles.yz) result = result.multiply(Rotor4D.fromPlaneAngle('YZ', angles.yz));
        if (angles.xw) result = result.multiply(Rotor4D.fromPlaneAngle('XW', angles.xw));
        if (angles.yw) result = result.multiply(Rotor4D.fromPlaneAngle('YW', angles.yw));
        if (angles.zw) result = result.multiply(Rotor4D.fromPlaneAngle('ZW', angles.zw));

        return result.normalizeInPlace();
    }

    /**
     * Create rotor from parameter format (rot4dXY, rot4dXZ, etc.)
     * @param {object} params - Parameters object
     * @returns {Rotor4D}
     */
    static fromParameters(params) {
        return Rotor4D.fromEuler6({
            xy: params.rot4dXY || 0,
            xz: params.rot4dXZ || 0,
            yz: params.rot4dYZ || 0,
            xw: params.rot4dXW || 0,
            yw: params.rot4dYW || 0,
            zw: params.rot4dZW || 0
        });
    }

    /**
     * Squared norm of the rotor
     * @returns {number}
     */
    normSquared() {
        return (
            this.s * this.s +
            this.xy * this.xy +
            this.xz * this.xz +
            this.yz * this.yz +
            this.xw * this.xw +
            this.yw * this.yw +
            this.zw * this.zw +
            this.xyzw * this.xyzw
        );
    }

    /**
     * Norm (magnitude) of the rotor
     * @returns {number}
     */
    norm() {
        return Math.sqrt(this.normSquared());
    }

    /**
     * Normalize rotor to unit length (immutable)
     * CRITICAL: Call this regularly to prevent drift!
     * @returns {Rotor4D}
     */
    normalize() {
        const n = this.norm();
        if (n < 1e-10) {
            return Rotor4D.identity();
        }
        const invN = 1 / n;
        return new Rotor4D(
            this.s * invN,
            this.xy * invN,
            this.xz * invN,
            this.yz * invN,
            this.xw * invN,
            this.yw * invN,
            this.zw * invN,
            this.xyzw * invN
        );
    }

    /**
     * Normalize rotor in place (mutable)
     * @returns {Rotor4D} this
     */
    normalizeInPlace() {
        const n = this.norm();
        if (n < 1e-10) {
            this.s = 1;
            this.xy = this.xz = this.yz = 0;
            this.xw = this.yw = this.zw = 0;
            this.xyzw = 0;
            return this;
        }
        const invN = 1 / n;
        this.s *= invN;
        this.xy *= invN;
        this.xz *= invN;
        this.yz *= invN;
        this.xw *= invN;
        this.yw *= invN;
        this.zw *= invN;
        this.xyzw *= invN;
        return this;
    }

    /**
     * Reverse (conjugate) of the rotor
     * For unit rotors: R† = R⁻¹
     * @returns {Rotor4D}
     */
    reverse() {
        // Reverse flips sign of bivectors and pseudoscalar
        return new Rotor4D(
            this.s,
            -this.xy,
            -this.xz,
            -this.yz,
            -this.xw,
            -this.yw,
            -this.zw,
            -this.xyzw
        );
    }

    /**
     * Inverse of the rotor
     * For unit rotors, this equals reverse()
     * @returns {Rotor4D}
     */
    inverse() {
        const normSq = this.normSquared();
        if (normSq < 1e-10) {
            return Rotor4D.identity();
        }
        const invNormSq = 1 / normSq;
        return new Rotor4D(
            this.s * invNormSq,
            -this.xy * invNormSq,
            -this.xz * invNormSq,
            -this.yz * invNormSq,
            -this.xw * invNormSq,
            -this.yw * invNormSq,
            -this.zw * invNormSq,
            -this.xyzw * invNormSq
        );
    }

    /**
     * Multiply two rotors (compose rotations)
     * The result applies this rotation, then r's rotation
     *
     * @param {Rotor4D} r - Right operand
     * @returns {Rotor4D} Composed rotor
     */
    multiply(r) {
        // Full geometric product of two rotors in 4D
        // This is derived from the geometric algebra product rules

        const a = this;
        const b = r;

        return new Rotor4D(
            // Scalar component
            a.s * b.s - a.xy * b.xy - a.xz * b.xz - a.yz * b.yz -
            a.xw * b.xw - a.yw * b.yw - a.zw * b.zw - a.xyzw * b.xyzw,

            // XY bivector
            a.s * b.xy + a.xy * b.s + a.xz * b.yz - a.yz * b.xz +
            a.xw * b.yw - a.yw * b.xw - a.zw * b.xyzw - a.xyzw * b.zw,

            // XZ bivector
            a.s * b.xz + a.xz * b.s - a.xy * b.yz + a.yz * b.xy +
            a.xw * b.zw + a.yw * b.xyzw - a.zw * b.xw + a.xyzw * b.yw,

            // YZ bivector
            a.s * b.yz + a.yz * b.s + a.xy * b.xz - a.xz * b.xy -
            a.xw * b.xyzw + a.yw * b.zw - a.zw * b.yw - a.xyzw * b.xw,

            // XW bivector
            a.s * b.xw + a.xw * b.s - a.xy * b.yw + a.xz * b.zw +
            a.yz * b.xyzw + a.yw * b.xy - a.zw * b.xz + a.xyzw * b.yz,

            // YW bivector
            a.s * b.yw + a.yw * b.s + a.xy * b.xw - a.xz * b.xyzw -
            a.yz * b.zw - a.xw * b.xy + a.zw * b.yz - a.xyzw * b.xz,

            // ZW bivector
            a.s * b.zw + a.zw * b.s + a.xy * b.xyzw + a.xz * b.xw +
            a.yz * b.yw - a.xw * b.xz - a.yw * b.yz + a.xyzw * b.xy,

            // Pseudoscalar XYZW
            a.s * b.xyzw + a.xyzw * b.s + a.xy * b.zw - a.xz * b.yw +
            a.yz * b.xw + a.xw * b.yz - a.yw * b.xz + a.zw * b.xy
        );
    }

    /**
     * Rotate a 4D vector using sandwich product: v' = R v R†
     *
     * @param {Vec4} v - Vector to rotate
     * @returns {Vec4} Rotated vector
     */
    rotate(v) {
        // For efficiency, we expand the sandwich product directly
        // rather than doing two rotor multiplications

        const x = v.x, y = v.y, z = v.z, w = v.w;

        // Compute R v (rotor times vector)
        // Vector in GA is: x*e1 + y*e2 + z*e3 + w*e4
        // This produces a mixed multivector

        // Then multiply by R† (reverse of rotor)
        // Extract the vector part of the result

        // Pre-compute some common terms
        const s = this.s;
        const xy = this.xy, xz = this.xz, yz = this.yz;
        const xw = this.xw, yw = this.yw, zw = this.zw;
        const xyzw = this.xyzw;

        // Squared terms for the rotation formula
        const s2 = s * s;
        const xy2 = xy * xy, xz2 = xz * xz, yz2 = yz * yz;
        const xw2 = xw * xw, yw2 = yw * yw, zw2 = zw * zw;
        const xyzw2 = xyzw * xyzw;

        // The full rotation formula derived from R v R†
        const newX =
            x * (s2 + xy2 + xz2 - yz2 + xw2 - yw2 - zw2 - xyzw2) +
            2 * y * (s * xy + xz * yz + xw * yw - s * xyzw * zw + xy * s - xyzw * zw) +
            2 * z * (s * xz - xy * yz + xw * zw + xyzw * yw) +
            2 * w * (s * xw - xy * yw - xz * zw - xyzw * yz);

        // Simplified rotation using matrix form
        // This is equivalent but clearer

        // Actually, let's use the direct matrix multiplication approach
        // which is more numerically stable

        const m = this.toMatrix();
        return new Vec4(
            m[0] * x + m[4] * y + m[8] * z + m[12] * w,
            m[1] * x + m[5] * y + m[9] * z + m[13] * w,
            m[2] * x + m[6] * y + m[10] * z + m[14] * w,
            m[3] * x + m[7] * y + m[11] * z + m[15] * w
        );
    }

    /**
     * Convert rotor to 4x4 rotation matrix (column-major for WebGL)
     * @returns {Float32Array} 16-element array in column-major order
     */
    toMatrix() {
        // Normalize first for numerical stability
        const n = this.norm();
        const invN = n > 1e-10 ? 1 / n : 1;

        const s = this.s * invN;
        const xy = this.xy * invN;
        const xz = this.xz * invN;
        const yz = this.yz * invN;
        const xw = this.xw * invN;
        const yw = this.yw * invN;
        const zw = this.zw * invN;
        const xyzw = this.xyzw * invN;

        // Pre-compute products
        const s2 = s * s;
        const xy2 = xy * xy;
        const xz2 = xz * xz;
        const yz2 = yz * yz;
        const xw2 = xw * xw;
        const yw2 = yw * yw;
        const zw2 = zw * zw;
        const xyzw2 = xyzw * xyzw;

        // Cross terms
        const sxy = 2 * s * xy;
        const sxz = 2 * s * xz;
        const syz = 2 * s * yz;
        const sxw = 2 * s * xw;
        const syw = 2 * s * yw;
        const szw = 2 * s * zw;
        const sxyzw = 2 * s * xyzw;

        const xyxz = 2 * xy * xz;
        const xyyz = 2 * xy * yz;
        const xyxw = 2 * xy * xw;
        const xyyw = 2 * xy * yw;
        const xyzw_c = 2 * xy * zw;

        const xzyz = 2 * xz * yz;
        const xzxw = 2 * xz * xw;
        const xzyw = 2 * xz * yw;
        const xzzw = 2 * xz * zw;

        const yzxw = 2 * yz * xw;
        const yzyw = 2 * yz * yw;
        const yzzw = 2 * yz * zw;

        const xwyw = 2 * xw * yw;
        const xwzw = 2 * xw * zw;
        const ywzw = 2 * yw * zw;

        const xyxyzw = 2 * xy * xyzw;
        const xzxyzw = 2 * xz * xyzw;
        const yzxyzw = 2 * yz * xyzw;
        const xwxyzw = 2 * xw * xyzw;
        const ywxyzw = 2 * yw * xyzw;
        const zwxyzw = 2 * zw * xyzw;

        // 4x4 rotation matrix in column-major order
        // Each column is a transformed basis vector
        // FIX: Corrected signs - diagonal elements need negative bivector² for planes containing that axis
        return new Float32Array([
            // Column 0 (transformed X axis) - X in planes XY, XZ, XW (negative), not in YZ, YW, ZW (positive)
            s2 - xy2 - xz2 + yz2 - xw2 + yw2 + zw2 - xyzw2,
            -sxy + xzyz + xwyw - zwxyzw,  // FIX: negated sxy for correct rotation direction
            -sxz - xyyz + xwzw + ywxyzw,
            -sxw + xyyw + xzzw - yzxyzw,

            // Column 1 (transformed Y axis) - Y in planes XY, YZ, YW (negative), not in XZ, XW, ZW (positive)
            sxy + xzyz + xwyw + zwxyzw,
            s2 - xy2 + xz2 - yz2 + xw2 - yw2 + zw2 - xyzw2,
            -syz + xyxz + ywzw - xwxyzw,
            -syw - xyxw + yzzw + xzxyzw,

            // Column 2 (transformed Z axis) - Z in planes XZ, YZ, ZW (negative), not in XY, XW, YW (positive)
            sxz - xyyz + xwzw - ywxyzw,
            syz + xyxz + ywzw + xwxyzw,
            s2 + xy2 - xz2 - yz2 + xw2 + yw2 - zw2 - xyzw2,
            -szw - xzxw - yzyw + xyxyzw,

            // Column 3 (transformed W axis) - W in planes XW, YW, ZW (negative), not in XY, XZ, YZ (positive)
            sxw - xyyw - xzzw + yzxyzw,
            syw + xyxw - yzzw - xzxyzw,
            szw + xzxw + yzyw - xyxyzw,
            s2 + xy2 + xz2 + yz2 - xw2 - yw2 - zw2 - xyzw2
        ]);
    }

    /**
     * Spherical linear interpolation between rotors
     * @param {Rotor4D} target - Target rotor
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Rotor4D}
     */
    slerp(target, t) {
        // Compute the cosine of the angle between rotors
        let dot = this.s * target.s +
            this.xy * target.xy + this.xz * target.xz + this.yz * target.yz +
            this.xw * target.xw + this.yw * target.yw + this.zw * target.zw +
            this.xyzw * target.xyzw;

        // If dot is negative, negate one rotor to take shorter path
        let b = target;
        if (dot < 0) {
            dot = -dot;
            b = new Rotor4D(
                -target.s, -target.xy, -target.xz, -target.yz,
                -target.xw, -target.yw, -target.zw, -target.xyzw
            );
        }

        // If rotors are very close, use linear interpolation
        if (dot > 0.9995) {
            return new Rotor4D(
                this.s + t * (b.s - this.s),
                this.xy + t * (b.xy - this.xy),
                this.xz + t * (b.xz - this.xz),
                this.yz + t * (b.yz - this.yz),
                this.xw + t * (b.xw - this.xw),
                this.yw + t * (b.yw - this.yw),
                this.zw + t * (b.zw - this.zw),
                this.xyzw + t * (b.xyzw - this.xyzw)
            ).normalizeInPlace();
        }

        // Spherical interpolation
        const theta = Math.acos(dot);
        const sinTheta = Math.sin(theta);
        const wa = Math.sin((1 - t) * theta) / sinTheta;
        const wb = Math.sin(t * theta) / sinTheta;

        return new Rotor4D(
            wa * this.s + wb * b.s,
            wa * this.xy + wb * b.xy,
            wa * this.xz + wb * b.xz,
            wa * this.yz + wb * b.yz,
            wa * this.xw + wb * b.xw,
            wa * this.yw + wb * b.yw,
            wa * this.zw + wb * b.zw,
            wa * this.xyzw + wb * b.xyzw
        );
    }

    /**
     * Check if approximately equal to another rotor
     * @param {Rotor4D} r
     * @param {number} epsilon
     * @returns {boolean}
     */
    equals(r, epsilon = 1e-6) {
        // Account for double cover (R and -R represent same rotation)
        const diff1 = Math.abs(this.s - r.s) + Math.abs(this.xy - r.xy) +
            Math.abs(this.xz - r.xz) + Math.abs(this.yz - r.yz) +
            Math.abs(this.xw - r.xw) + Math.abs(this.yw - r.yw) +
            Math.abs(this.zw - r.zw) + Math.abs(this.xyzw - r.xyzw);

        const diff2 = Math.abs(this.s + r.s) + Math.abs(this.xy + r.xy) +
            Math.abs(this.xz + r.xz) + Math.abs(this.yz + r.yz) +
            Math.abs(this.xw + r.xw) + Math.abs(this.yw + r.yw) +
            Math.abs(this.zw + r.zw) + Math.abs(this.xyzw + r.xyzw);

        return Math.min(diff1, diff2) < epsilon * 8;
    }

    /**
     * Check if this is the identity rotor
     * @param {number} epsilon
     * @returns {boolean}
     */
    isIdentity(epsilon = 1e-6) {
        return this.equals(Rotor4D.identity(), epsilon);
    }

    /**
     * String representation
     * @param {number} precision
     * @returns {string}
     */
    toString(precision = 3) {
        return `Rotor4D(s=${this.s.toFixed(precision)}, xy=${this.xy.toFixed(precision)}, xz=${this.xz.toFixed(precision)}, yz=${this.yz.toFixed(precision)}, xw=${this.xw.toFixed(precision)}, yw=${this.yw.toFixed(precision)}, zw=${this.zw.toFixed(precision)}, xyzw=${this.xyzw.toFixed(precision)})`;
    }

    /**
     * JSON representation
     * @returns {object}
     */
    toJSON() {
        return {
            s: this.s,
            xy: this.xy, xz: this.xz, yz: this.yz,
            xw: this.xw, yw: this.yw, zw: this.zw,
            xyzw: this.xyzw
        };
    }

    /**
     * Convert to array [s, xy, xz, yz, xw, yw, zw, xyzw]
     * @returns {number[]}
     */
    toArray() {
        return [this.s, this.xy, this.xz, this.yz, this.xw, this.yw, this.zw, this.xyzw];
    }

    /**
     * Create rotor from array
     * @param {number[]} arr - Array of 8 components [s, xy, xz, yz, xw, yw, zw, xyzw]
     * @returns {Rotor4D}
     */
    static fromArray(arr) {
        return new Rotor4D(
            arr[0] ?? 1,
            arr[1] ?? 0,
            arr[2] ?? 0,
            arr[3] ?? 0,
            arr[4] ?? 0,
            arr[5] ?? 0,
            arr[6] ?? 0,
            arr[7] ?? 0
        );
    }

    /**
     * Create rotor from JSON
     * @param {object} json
     * @returns {Rotor4D}
     */
    static fromJSON(json) {
        return new Rotor4D(
            json.s || 1,
            json.xy || 0, json.xz || 0, json.yz || 0,
            json.xw || 0, json.yw || 0, json.zw || 0,
            json.xyzw || 0
        );
    }

    /**
     * Create random unit rotor (uniform distribution on rotation group)
     * @returns {Rotor4D}
     */
    static random() {
        // Generate random 8D unit vector for uniform rotor distribution
        const components = [];
        for (let i = 0; i < 8; i++) {
            // Box-Muller for Gaussian
            const u1 = Math.random();
            const u2 = Math.random();
            components.push(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
        }

        const rotor = new Rotor4D(...components);
        return rotor.normalizeInPlace();
    }
}

export default Rotor4D;
