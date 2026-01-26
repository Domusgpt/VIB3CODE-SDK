/**
 * MemoryPool - Efficient memory allocation for frequently created/destroyed objects
 *
 * Provides object pooling to reduce GC pressure and improve performance.
 * Supports both fixed-size and dynamic pools.
 */

/**
 * Generic object pool
 * @template T
 */
export class ObjectPool {
    /**
     * @param {function(): T} factory - Function to create new objects
     * @param {function(T): void} [reset] - Function to reset objects before reuse
     * @param {object} [options] - Pool options
     */
    constructor(factory, reset = null, options = {}) {
        /** @type {function(): T} */
        this._factory = factory;

        /** @type {function(T): void} */
        this._reset = reset;

        /** @type {T[]} Available objects */
        this._available = [];

        /** @type {Set<T>} Objects currently in use */
        this._inUse = new Set();

        /** @type {number} Maximum pool size (0 = unlimited) */
        this.maxSize = options.maxSize || 0;

        /** @type {number} Initial pool size */
        this.initialSize = options.initialSize || 0;

        /** @type {boolean} Whether to pre-warm the pool */
        this.preWarm = options.preWarm !== false;

        /** @type {number} Total allocations */
        this._totalAllocations = 0;

        /** @type {number} Pool hits (reused) */
        this._hits = 0;

        /** @type {number} Pool misses (created new) */
        this._misses = 0;

        // Pre-warm pool
        if (this.preWarm && this.initialSize > 0) {
            for (let i = 0; i < this.initialSize; i++) {
                this._available.push(this._factory());
            }
        }
    }

    /**
     * Acquire an object from the pool
     * @returns {T}
     */
    acquire() {
        this._totalAllocations++;

        if (this._available.length > 0) {
            this._hits++;
            const obj = this._available.pop();
            this._inUse.add(obj);
            return obj;
        }

        this._misses++;
        const obj = this._factory();
        this._inUse.add(obj);
        return obj;
    }

    /**
     * Release an object back to the pool
     * @param {T} obj
     * @returns {boolean} True if returned to pool
     */
    release(obj) {
        if (!this._inUse.has(obj)) {
            return false;
        }

        this._inUse.delete(obj);

        // Check pool size limit
        if (this.maxSize > 0 && this._available.length >= this.maxSize) {
            return false;
        }

        // Reset object before returning to pool
        if (this._reset) {
            this._reset(obj);
        }

        this._available.push(obj);
        return true;
    }

    /**
     * Release all in-use objects
     */
    releaseAll() {
        for (const obj of this._inUse) {
            if (this._reset) {
                this._reset(obj);
            }
            if (this.maxSize === 0 || this._available.length < this.maxSize) {
                this._available.push(obj);
            }
        }
        this._inUse.clear();
    }

    /**
     * Clear the pool
     */
    clear() {
        this._available = [];
        this._inUse.clear();
    }

    /**
     * Get pool statistics
     * @returns {object}
     */
    getStats() {
        return {
            available: this._available.length,
            inUse: this._inUse.size,
            totalAllocations: this._totalAllocations,
            hits: this._hits,
            misses: this._misses,
            hitRate: this._totalAllocations > 0
                ? this._hits / this._totalAllocations
                : 0
        };
    }

    /**
     * Get number of available objects
     * @returns {number}
     */
    get available() {
        return this._available.length;
    }

    /**
     * Get number of objects in use
     * @returns {number}
     */
    get inUse() {
        return this._inUse.size;
    }
}

/**
 * Typed array pool for efficient buffer management
 */
export class TypedArrayPool {
    constructor() {
        /** @type {Map<string, Float32Array[]>} */
        this._float32Pools = new Map();

        /** @type {Map<string, Uint16Array[]>} */
        this._uint16Pools = new Map();

        /** @type {Map<string, Uint32Array[]>} */
        this._uint32Pools = new Map();

        /** @type {number} */
        this._totalAllocations = 0;

        /** @type {number} */
        this._hits = 0;
    }

    /**
     * Get size bucket key
     * @private
     */
    _getBucket(size) {
        // Round up to power of 2 for bucketing
        const bucket = Math.pow(2, Math.ceil(Math.log2(Math.max(size, 16))));
        return String(bucket);
    }

    /**
     * Acquire a Float32Array
     * @param {number} size - Minimum size needed
     * @returns {Float32Array}
     */
    acquireFloat32(size) {
        this._totalAllocations++;
        const bucket = this._getBucket(size);

        if (!this._float32Pools.has(bucket)) {
            this._float32Pools.set(bucket, []);
        }

        const pool = this._float32Pools.get(bucket);
        if (pool.length > 0) {
            this._hits++;
            return pool.pop();
        }

        return new Float32Array(parseInt(bucket));
    }

    /**
     * Release a Float32Array
     * @param {Float32Array} arr
     */
    releaseFloat32(arr) {
        const bucket = String(arr.length);
        if (!this._float32Pools.has(bucket)) {
            this._float32Pools.set(bucket, []);
        }

        const pool = this._float32Pools.get(bucket);
        if (pool.length < 32) { // Limit pool size per bucket
            arr.fill(0); // Clear data
            pool.push(arr);
        }
    }

    /**
     * Acquire a Uint16Array
     * @param {number} size
     * @returns {Uint16Array}
     */
    acquireUint16(size) {
        this._totalAllocations++;
        const bucket = this._getBucket(size);

        if (!this._uint16Pools.has(bucket)) {
            this._uint16Pools.set(bucket, []);
        }

        const pool = this._uint16Pools.get(bucket);
        if (pool.length > 0) {
            this._hits++;
            return pool.pop();
        }

        return new Uint16Array(parseInt(bucket));
    }

    /**
     * Release a Uint16Array
     * @param {Uint16Array} arr
     */
    releaseUint16(arr) {
        const bucket = String(arr.length);
        if (!this._uint16Pools.has(bucket)) {
            this._uint16Pools.set(bucket, []);
        }

        const pool = this._uint16Pools.get(bucket);
        if (pool.length < 32) {
            arr.fill(0);
            pool.push(arr);
        }
    }

    /**
     * Acquire a Uint32Array
     * @param {number} size
     * @returns {Uint32Array}
     */
    acquireUint32(size) {
        this._totalAllocations++;
        const bucket = this._getBucket(size);

        if (!this._uint32Pools.has(bucket)) {
            this._uint32Pools.set(bucket, []);
        }

        const pool = this._uint32Pools.get(bucket);
        if (pool.length > 0) {
            this._hits++;
            return pool.pop();
        }

        return new Uint32Array(parseInt(bucket));
    }

    /**
     * Release a Uint32Array
     * @param {Uint32Array} arr
     */
    releaseUint32(arr) {
        const bucket = String(arr.length);
        if (!this._uint32Pools.has(bucket)) {
            this._uint32Pools.set(bucket, []);
        }

        const pool = this._uint32Pools.get(bucket);
        if (pool.length < 32) {
            arr.fill(0);
            pool.push(arr);
        }
    }

    /**
     * Clear all pools
     */
    clear() {
        this._float32Pools.clear();
        this._uint16Pools.clear();
        this._uint32Pools.clear();
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        let float32Total = 0;
        let uint16Total = 0;
        let uint32Total = 0;

        for (const pool of this._float32Pools.values()) {
            float32Total += pool.length;
        }
        for (const pool of this._uint16Pools.values()) {
            uint16Total += pool.length;
        }
        for (const pool of this._uint32Pools.values()) {
            uint32Total += pool.length;
        }

        return {
            float32Pooled: float32Total,
            uint16Pooled: uint16Total,
            uint32Pooled: uint32Total,
            totalAllocations: this._totalAllocations,
            hits: this._hits,
            hitRate: this._totalAllocations > 0
                ? this._hits / this._totalAllocations
                : 0
        };
    }
}

/**
 * Vec4 pool for efficient vector operations
 */
export class Vec4Pool {
    /**
     * @param {number} [initialSize=100]
     */
    constructor(initialSize = 100) {
        // Import Vec4 dynamically to avoid circular dependencies
        this._Vec4 = null;
        this._pool = [];
        this._inUse = new Set();
        this._initialSize = initialSize;
        this._initialized = false;
    }

    /**
     * Initialize the pool (call after Vec4 is available)
     * @param {typeof Vec4} Vec4Class
     */
    init(Vec4Class) {
        this._Vec4 = Vec4Class;
        for (let i = 0; i < this._initialSize; i++) {
            this._pool.push(new Vec4Class(0, 0, 0, 0));
        }
        this._initialized = true;
    }

    /**
     * Acquire a Vec4
     * @param {number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     * @param {number} [w=0]
     * @returns {Vec4}
     */
    acquire(x = 0, y = 0, z = 0, w = 0) {
        if (!this._initialized) {
            throw new Error('Vec4Pool not initialized. Call init() first.');
        }

        let vec;
        if (this._pool.length > 0) {
            vec = this._pool.pop();
            vec.x = x;
            vec.y = y;
            vec.z = z;
            vec.w = w;
        } else {
            vec = new this._Vec4(x, y, z, w);
        }

        this._inUse.add(vec);
        return vec;
    }

    /**
     * Release a Vec4
     * @param {Vec4} vec
     */
    release(vec) {
        if (!this._inUse.has(vec)) return;

        this._inUse.delete(vec);
        vec.x = 0;
        vec.y = 0;
        vec.z = 0;
        vec.w = 0;
        this._pool.push(vec);
    }

    /**
     * Release all vectors
     */
    releaseAll() {
        for (const vec of this._inUse) {
            vec.x = 0;
            vec.y = 0;
            vec.z = 0;
            vec.w = 0;
            this._pool.push(vec);
        }
        this._inUse.clear();
    }

    /**
     * Get pool statistics
     * @returns {object}
     */
    getStats() {
        return {
            available: this._pool.length,
            inUse: this._inUse.size
        };
    }
}

/**
 * Matrix pool for efficient matrix operations
 */
export class Mat4x4Pool {
    /**
     * @param {number} [initialSize=50]
     */
    constructor(initialSize = 50) {
        this._Mat4x4 = null;
        this._pool = [];
        this._inUse = new Set();
        this._initialSize = initialSize;
        this._initialized = false;
    }

    /**
     * Initialize the pool
     * @param {typeof Mat4x4} Mat4x4Class
     */
    init(Mat4x4Class) {
        this._Mat4x4 = Mat4x4Class;
        for (let i = 0; i < this._initialSize; i++) {
            this._pool.push(Mat4x4Class.identity());
        }
        this._initialized = true;
    }

    /**
     * Acquire an identity matrix
     * @returns {Mat4x4}
     */
    acquireIdentity() {
        if (!this._initialized) {
            throw new Error('Mat4x4Pool not initialized. Call init() first.');
        }

        let mat;
        if (this._pool.length > 0) {
            mat = this._pool.pop();
            // Reset to identity
            mat.data.fill(0);
            mat.data[0] = 1;
            mat.data[5] = 1;
            mat.data[10] = 1;
            mat.data[15] = 1;
        } else {
            mat = this._Mat4x4.identity();
        }

        this._inUse.add(mat);
        return mat;
    }

    /**
     * Release a matrix
     * @param {Mat4x4} mat
     */
    release(mat) {
        if (!this._inUse.has(mat)) return;
        this._inUse.delete(mat);
        this._pool.push(mat);
    }

    /**
     * Release all matrices
     */
    releaseAll() {
        for (const mat of this._inUse) {
            this._pool.push(mat);
        }
        this._inUse.clear();
    }

    /**
     * Get pool statistics
     * @returns {object}
     */
    getStats() {
        return {
            available: this._pool.length,
            inUse: this._inUse.size
        };
    }
}

/**
 * Global pool manager
 */
export class PoolManager {
    constructor() {
        /** @type {Map<string, ObjectPool>} */
        this._objectPools = new Map();

        /** @type {TypedArrayPool} */
        this.typedArrays = new TypedArrayPool();

        /** @type {Vec4Pool} */
        this.vec4 = new Vec4Pool();

        /** @type {Mat4x4Pool} */
        this.mat4x4 = new Mat4x4Pool();
    }

    /**
     * Initialize math pools
     * @param {typeof Vec4} Vec4Class
     * @param {typeof Mat4x4} Mat4x4Class
     */
    initMathPools(Vec4Class, Mat4x4Class) {
        this.vec4.init(Vec4Class);
        this.mat4x4.init(Mat4x4Class);
    }

    /**
     * Register a custom object pool
     * @param {string} name
     * @param {function} factory
     * @param {function} [reset]
     * @param {object} [options]
     * @returns {ObjectPool}
     */
    registerPool(name, factory, reset = null, options = {}) {
        const pool = new ObjectPool(factory, reset, options);
        this._objectPools.set(name, pool);
        return pool;
    }

    /**
     * Get a registered pool
     * @param {string} name
     * @returns {ObjectPool|undefined}
     */
    getPool(name) {
        return this._objectPools.get(name);
    }

    /**
     * Clear all pools
     */
    clearAll() {
        for (const pool of this._objectPools.values()) {
            pool.clear();
        }
        this.typedArrays.clear();
        this.vec4.releaseAll();
        this.mat4x4.releaseAll();
    }

    /**
     * Get combined statistics
     * @returns {object}
     */
    getStats() {
        const objectPoolStats = {};
        for (const [name, pool] of this._objectPools) {
            objectPoolStats[name] = pool.getStats();
        }

        return {
            objectPools: objectPoolStats,
            typedArrays: this.typedArrays.getStats(),
            vec4: this.vec4.getStats(),
            mat4x4: this.mat4x4.getStats()
        };
    }
}

/**
 * Default global pool manager instance
 */
export const pools = new PoolManager();

export default PoolManager;
