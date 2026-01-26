/**
 * Vec4 - 4D Vector Class
 *
 * Represents a point or direction in 4-dimensional space.
 * Uses Float32Array for GPU compatibility and potential SIMD optimization.
 *
 * @example
 * const v = new Vec4(1, 2, 3, 0.5);
 * const normalized = v.normalize();
 * const dot = v.dot(other);
 */

export class Vec4 {
    /**
     * Create a new 4D vector
     * @param {number} x - X component
     * @param {number} y - Y component
     * @param {number} z - Z component
     * @param {number} w - W component (4th dimension)
     */
    constructor(x = 0, y = 0, z = 0, w = 0) {
        // Use Float32Array for GPU compatibility
        this.data = new Float32Array(4);
        this.data[0] = x;
        this.data[1] = y;
        this.data[2] = z;
        this.data[3] = w;
    }

    // Property accessors for readability
    get x() { return this.data[0]; }
    set x(v) { this.data[0] = v; }

    get y() { return this.data[1]; }
    set y(v) { this.data[1] = v; }

    get z() { return this.data[2]; }
    set z(v) { this.data[2] = v; }

    get w() { return this.data[3]; }
    set w(v) { this.data[3] = v; }

    /**
     * Create a Vec4 from an array
     * @param {number[]|Float32Array} arr - Array with at least 4 elements
     * @returns {Vec4}
     */
    static fromArray(arr) {
        return new Vec4(arr[0] || 0, arr[1] || 0, arr[2] || 0, arr[3] || 0);
    }

    /**
     * Create a copy of this vector
     * @returns {Vec4}
     */
    clone() {
        return new Vec4(this.x, this.y, this.z, this.w);
    }

    /**
     * Copy values from another vector
     * @param {Vec4} v - Source vector
     * @returns {Vec4} this (for chaining)
     */
    copy(v) {
        this.data[0] = v.data[0];
        this.data[1] = v.data[1];
        this.data[2] = v.data[2];
        this.data[3] = v.data[3];
        return this;
    }

    /**
     * Set all components
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {Vec4} this
     */
    set(x, y, z, w) {
        this.data[0] = x;
        this.data[1] = y;
        this.data[2] = z;
        this.data[3] = w;
        return this;
    }

    /**
     * Add another vector (immutable)
     * @param {Vec4} v
     * @returns {Vec4} New vector
     */
    add(v) {
        return new Vec4(
            this.x + v.x,
            this.y + v.y,
            this.z + v.z,
            this.w + v.w
        );
    }

    /**
     * Add another vector in place (mutable)
     * @param {Vec4} v
     * @returns {Vec4} this
     */
    addInPlace(v) {
        this.data[0] += v.data[0];
        this.data[1] += v.data[1];
        this.data[2] += v.data[2];
        this.data[3] += v.data[3];
        return this;
    }

    /**
     * Subtract another vector (immutable)
     * @param {Vec4} v
     * @returns {Vec4} New vector
     */
    sub(v) {
        return new Vec4(
            this.x - v.x,
            this.y - v.y,
            this.z - v.z,
            this.w - v.w
        );
    }

    /**
     * Subtract another vector in place (mutable)
     * @param {Vec4} v
     * @returns {Vec4} this
     */
    subInPlace(v) {
        this.data[0] -= v.data[0];
        this.data[1] -= v.data[1];
        this.data[2] -= v.data[2];
        this.data[3] -= v.data[3];
        return this;
    }

    /**
     * Multiply by scalar (immutable)
     * @param {number} s
     * @returns {Vec4} New vector
     */
    scale(s) {
        return new Vec4(
            this.x * s,
            this.y * s,
            this.z * s,
            this.w * s
        );
    }

    /**
     * Multiply by scalar in place (mutable)
     * @param {number} s
     * @returns {Vec4} this
     */
    scaleInPlace(s) {
        this.data[0] *= s;
        this.data[1] *= s;
        this.data[2] *= s;
        this.data[3] *= s;
        return this;
    }

    /**
     * Component-wise multiply (Hadamard product)
     * @param {Vec4} v
     * @returns {Vec4} New vector
     */
    multiply(v) {
        return new Vec4(
            this.x * v.x,
            this.y * v.y,
            this.z * v.z,
            this.w * v.w
        );
    }

    /**
     * Negate vector (immutable)
     * @returns {Vec4} New vector
     */
    negate() {
        return new Vec4(-this.x, -this.y, -this.z, -this.w);
    }

    /**
     * Negate vector in place (mutable)
     * @returns {Vec4} this
     */
    negateInPlace() {
        this.data[0] = -this.data[0];
        this.data[1] = -this.data[1];
        this.data[2] = -this.data[2];
        this.data[3] = -this.data[3];
        return this;
    }

    /**
     * Dot product with another vector
     * @param {Vec4} v
     * @returns {number}
     */
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    }

    /**
     * Squared length of vector (faster than length())
     * @returns {number}
     */
    lengthSquared() {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }

    /**
     * Length (magnitude) of vector
     * @returns {number}
     */
    length() {
        return Math.sqrt(this.lengthSquared());
    }

    /**
     * Distance to another vector
     * @param {Vec4} v
     * @returns {number}
     */
    distanceTo(v) {
        return this.sub(v).length();
    }

    /**
     * Squared distance to another vector (faster)
     * @param {Vec4} v
     * @returns {number}
     */
    distanceToSquared(v) {
        return this.sub(v).lengthSquared();
    }

    /**
     * Normalize to unit length (immutable)
     * @returns {Vec4} New normalized vector
     */
    normalize() {
        const len = this.length();
        if (len < 1e-10) {
            return new Vec4(0, 0, 0, 0);
        }
        return this.scale(1 / len);
    }

    /**
     * Normalize in place (mutable)
     * @returns {Vec4} this
     */
    normalizeInPlace() {
        const len = this.length();
        if (len < 1e-10) {
            this.set(0, 0, 0, 0);
            return this;
        }
        return this.scaleInPlace(1 / len);
    }

    /**
     * Linear interpolation to another vector
     * @param {Vec4} v - Target vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vec4} New interpolated vector
     */
    lerp(v, t) {
        return new Vec4(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t,
            this.z + (v.z - this.z) * t,
            this.w + (v.w - this.w) * t
        );
    }

    /**
     * Check if approximately equal to another vector
     * @param {Vec4} v
     * @param {number} epsilon - Tolerance (default 1e-6)
     * @returns {boolean}
     */
    equals(v, epsilon = 1e-6) {
        return (
            Math.abs(this.x - v.x) < epsilon &&
            Math.abs(this.y - v.y) < epsilon &&
            Math.abs(this.z - v.z) < epsilon &&
            Math.abs(this.w - v.w) < epsilon
        );
    }

    /**
     * Check if zero vector
     * @param {number} epsilon
     * @returns {boolean}
     */
    isZero(epsilon = 1e-10) {
        return this.lengthSquared() < epsilon * epsilon;
    }

    /**
     * Project 4D point to 3D using perspective projection
     * Projects from 4D to 3D by dividing by (d - w)
     * @param {number} d - Distance parameter (usually 2-5)
     * @param {object} [options] - Projection options (epsilon, distance)
     * @returns {Vec4} Projected point (w component is 0)
     */
    projectPerspective(d = 2, options = {}) {
        if (typeof d === 'object') {
            options = d;
            d = options.distance ?? options.d ?? 2;
        }
        const epsilon = options.epsilon ?? 1e-5;
        const denom = d - this.w;
        const clamped = Math.abs(denom) < epsilon ? (denom >= 0 ? epsilon : -epsilon) : denom;
        const scale = 1 / clamped;
        return new Vec4(this.x * scale, this.y * scale, this.z * scale, 0);
    }

    /**
     * Project 4D point to 3D using stereographic projection
     * Maps 4D hypersphere to 3D space
     * @param {object} [options] - Projection options (epsilon)
     * @returns {Vec4} Projected point (w component is 0)
     */
    projectStereographic(options = {}) {
        const epsilon = options.epsilon ?? 1e-5;
        const denom = 1 - this.w;
        const clamped = Math.abs(denom) < epsilon ? (denom >= 0 ? epsilon : -epsilon) : denom;
        const scale = 1 / clamped;
        return new Vec4(this.x * scale, this.y * scale, this.z * scale, 0);
    }

    /**
     * Project 4D point to 3D using orthographic projection
     * Simply drops the W component
     * @returns {Vec4} Projected point (w component is 0)
     */
    projectOrthographic() {
        return new Vec4(this.x, this.y, this.z, 0);
    }

    /**
     * Convert to array
     * @returns {number[]}
     */
    toArray() {
        return [this.x, this.y, this.z, this.w];
    }

    /**
     * Convert to Float32Array (for GPU upload)
     * @returns {Float32Array}
     */
    toFloat32Array() {
        return new Float32Array(this.data);
    }

    /**
     * Get XYZ components as a 3D array
     * @returns {number[]}
     */
    toArray3() {
        return [this.x, this.y, this.z];
    }

    /**
     * String representation
     * @param {number} precision - Decimal places
     * @returns {string}
     */
    toString(precision = 3) {
        return `Vec4(${this.x.toFixed(precision)}, ${this.y.toFixed(precision)}, ${this.z.toFixed(precision)}, ${this.w.toFixed(precision)})`;
    }

    /**
     * JSON representation
     * @returns {object}
     */
    toJSON() {
        return { x: this.x, y: this.y, z: this.z, w: this.w };
    }

    // Static factory methods for common vectors

    /** Zero vector */
    static zero() {
        return new Vec4(0, 0, 0, 0);
    }

    /** Unit vector along X axis */
    static unitX() {
        return new Vec4(1, 0, 0, 0);
    }

    /** Unit vector along Y axis */
    static unitY() {
        return new Vec4(0, 1, 0, 0);
    }

    /** Unit vector along Z axis */
    static unitZ() {
        return new Vec4(0, 0, 1, 0);
    }

    /** Unit vector along W axis */
    static unitW() {
        return new Vec4(0, 0, 0, 1);
    }

    /** Vector with all ones */
    static one() {
        return new Vec4(1, 1, 1, 1);
    }

    /**
     * Create random unit vector on 4D hypersphere
     * Uses Gaussian distribution for uniform distribution on sphere
     * @returns {Vec4}
     */
    static randomUnit() {
        // Box-Muller transform for Gaussian random numbers
        const u1 = Math.random();
        const u2 = Math.random();
        const u3 = Math.random();
        const u4 = Math.random();

        const r1 = Math.sqrt(-2 * Math.log(u1));
        const r2 = Math.sqrt(-2 * Math.log(u3));

        const x = r1 * Math.cos(2 * Math.PI * u2);
        const y = r1 * Math.sin(2 * Math.PI * u2);
        const z = r2 * Math.cos(2 * Math.PI * u4);
        const w = r2 * Math.sin(2 * Math.PI * u4);

        return new Vec4(x, y, z, w).normalizeInPlace();
    }

    /**
     * Create random vector with components in [0, 1]
     * @returns {Vec4}
     */
    static random() {
        return new Vec4(
            Math.random(),
            Math.random(),
            Math.random(),
            Math.random()
        );
    }

    /**
     * Create random vector with components in [-1, 1]
     * @returns {Vec4}
     */
    static randomSigned() {
        return new Vec4(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1
        );
    }
}

export default Vec4;
