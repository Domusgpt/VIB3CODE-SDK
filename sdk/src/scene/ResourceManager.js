/**
 * ResourceManager - Manages resources with reference counting
 *
 * Provides centralized resource management for:
 * - Geometries
 * - Materials
 * - Textures
 * - Buffers
 * - Shaders
 *
 * Features:
 * - Reference counting for shared resources
 * - Automatic disposal when reference count reaches 0
 * - Resource caching and deduplication
 * - Memory usage tracking
 * - Async loading support
 */

/**
 * Resource wrapper with reference counting
 */
class ManagedResource {
    /**
     * @param {string} id - Resource identifier
     * @param {string} type - Resource type
     * @param {any} data - The actual resource data
     * @param {number} size - Estimated size in bytes
     */
    constructor(id, type, data, size = 0) {
        /** @type {string} */
        this.id = id;

        /** @type {string} */
        this.type = type;

        /** @type {any} */
        this.data = data;

        /** @type {number} */
        this.size = size;

        /** @type {number} Reference count */
        this.refCount = 0;

        /** @type {number} Creation timestamp */
        this.createdAt = Date.now();

        /** @type {number} Last access timestamp */
        this.lastAccessedAt = Date.now();

        /** @type {boolean} Whether resource is disposed */
        this.disposed = false;

        /** @type {function|null} Custom dispose function */
        this.disposeCallback = null;

        /** @type {Map<string, any>} Resource metadata */
        this.metadata = new Map();
    }

    /**
     * Increment reference count
     * @returns {this}
     */
    addRef() {
        if (this.disposed) {
            throw new Error(`Cannot reference disposed resource: ${this.id}`);
        }
        this.refCount++;
        this.lastAccessedAt = Date.now();
        return this;
    }

    /**
     * Decrement reference count
     * @returns {number} New reference count
     */
    release() {
        if (this.refCount > 0) {
            this.refCount--;
        }
        return this.refCount;
    }

    /**
     * Dispose the resource
     */
    dispose() {
        if (this.disposed) return;

        if (this.disposeCallback) {
            this.disposeCallback(this.data);
        }

        // Clear data reference
        this.data = null;
        this.disposed = true;
        this.metadata.clear();
    }
}

/**
 * ResourceManager class
 */
export class ResourceManager {
    constructor() {
        /** @type {Map<string, ManagedResource>} All managed resources */
        this._resources = new Map();

        /** @type {Map<string, Map<string, ManagedResource>>} Resources by type */
        this._byType = new Map();

        /** @type {Map<string, string>} Hash to ID lookup for deduplication */
        this._hashToId = new Map();

        /** @type {number} Total memory usage estimate */
        this._totalMemory = 0;

        /** @type {number} Memory limit (0 = unlimited) */
        this.memoryLimit = 0;

        /** @type {boolean} Enable automatic garbage collection */
        this.autoGC = true;

        /** @type {number} GC threshold (0-1, fraction of memory limit) */
        this.gcThreshold = 0.9;

        /** @type {number} Resource idle time before eligible for GC (ms) */
        this.gcIdleTime = 60000; // 1 minute

        /** @type {function[]} Dispose listeners */
        this._disposeListeners = [];
    }

    // ==================== Core Operations ====================

    /**
     * Register a resource
     * @param {string} id - Unique identifier
     * @param {string} type - Resource type
     * @param {any} data - Resource data
     * @param {object} [options] - Options
     * @returns {ManagedResource}
     */
    register(id, type, data, options = {}) {
        const {
            size = 0,
            hash = null,
            disposeCallback = null,
            metadata = {}
        } = options;

        // Check for existing resource with same hash
        if (hash && this._hashToId.has(hash)) {
            const existingId = this._hashToId.get(hash);
            const existing = this._resources.get(existingId);
            if (existing && !existing.disposed) {
                return existing.addRef();
            }
        }

        // Check if ID already exists
        if (this._resources.has(id)) {
            const existing = this._resources.get(id);
            if (!existing.disposed) {
                return existing.addRef();
            }
            // Remove disposed resource
            this._removeResource(existing);
        }

        // Create new managed resource
        const resource = new ManagedResource(id, type, data, size);
        resource.disposeCallback = disposeCallback;

        for (const [key, value] of Object.entries(metadata)) {
            resource.metadata.set(key, value);
        }

        // Store resource
        this._resources.set(id, resource);

        // Store by type
        if (!this._byType.has(type)) {
            this._byType.set(type, new Map());
        }
        this._byType.get(type).set(id, resource);

        // Store hash mapping
        if (hash) {
            this._hashToId.set(hash, id);
            resource.metadata.set('hash', hash);
        }

        // Update memory tracking
        this._totalMemory += size;

        // Check memory limit
        if (this.autoGC && this.memoryLimit > 0) {
            this._checkMemoryLimit();
        }

        return resource.addRef();
    }

    /**
     * Get a resource by ID
     * @param {string} id
     * @returns {ManagedResource|undefined}
     */
    get(id) {
        const resource = this._resources.get(id);
        if (resource && !resource.disposed) {
            resource.lastAccessedAt = Date.now();
            return resource;
        }
        return undefined;
    }

    /**
     * Get resource data by ID
     * @param {string} id
     * @returns {any}
     */
    getData(id) {
        const resource = this.get(id);
        return resource ? resource.data : undefined;
    }

    /**
     * Acquire a reference to a resource
     * @param {string} id
     * @returns {ManagedResource|undefined}
     */
    acquire(id) {
        const resource = this.get(id);
        if (resource) {
            return resource.addRef();
        }
        return undefined;
    }

    /**
     * Release a reference to a resource
     * @param {string} id
     * @returns {boolean} True if resource was disposed
     */
    release(id) {
        const resource = this._resources.get(id);
        if (!resource || resource.disposed) return false;

        const newCount = resource.release();

        if (newCount === 0 && this.autoGC) {
            this._disposeResource(resource);
            return true;
        }

        return false;
    }

    /**
     * Check if resource exists and is not disposed
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        const resource = this._resources.get(id);
        return resource !== undefined && !resource.disposed;
    }

    // ==================== Type-based Queries ====================

    /**
     * Get all resources of a type
     * @param {string} type
     * @returns {ManagedResource[]}
     */
    getByType(type) {
        const typeMap = this._byType.get(type);
        if (!typeMap) return [];

        return Array.from(typeMap.values()).filter(r => !r.disposed);
    }

    /**
     * Get resource count by type
     * @param {string} type
     * @returns {number}
     */
    getCountByType(type) {
        const typeMap = this._byType.get(type);
        if (!typeMap) return 0;

        let count = 0;
        for (const resource of typeMap.values()) {
            if (!resource.disposed) count++;
        }
        return count;
    }

    /**
     * Get memory usage by type
     * @param {string} type
     * @returns {number}
     */
    getMemoryByType(type) {
        const typeMap = this._byType.get(type);
        if (!typeMap) return 0;

        let total = 0;
        for (const resource of typeMap.values()) {
            if (!resource.disposed) total += resource.size;
        }
        return total;
    }

    // ==================== Memory Management ====================

    /**
     * Get total memory usage
     * @returns {number}
     */
    get totalMemory() {
        return this._totalMemory;
    }

    /**
     * Get total resource count
     * @returns {number}
     */
    get resourceCount() {
        let count = 0;
        for (const resource of this._resources.values()) {
            if (!resource.disposed) count++;
        }
        return count;
    }

    /**
     * Check memory limit and run GC if needed
     * @private
     */
    _checkMemoryLimit() {
        if (this._totalMemory > this.memoryLimit * this.gcThreshold) {
            this.runGC();
        }
    }

    /**
     * Run garbage collection
     * @param {object} [options]
     * @returns {number} Number of resources disposed
     */
    runGC(options = {}) {
        const {
            maxDispose = Infinity,
            minIdleTime = this.gcIdleTime,
            types = null
        } = options;

        const now = Date.now();
        const candidates = [];

        for (const resource of this._resources.values()) {
            if (resource.disposed) continue;
            if (resource.refCount > 0) continue;
            if (types && !types.includes(resource.type)) continue;
            if (now - resource.lastAccessedAt < minIdleTime) continue;

            candidates.push(resource);
        }

        // Sort by last access time (oldest first)
        candidates.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

        let disposed = 0;
        for (const resource of candidates) {
            if (disposed >= maxDispose) break;
            this._disposeResource(resource);
            disposed++;
        }

        return disposed;
    }

    /**
     * Dispose a resource
     * @private
     */
    _disposeResource(resource) {
        if (resource.disposed) return;

        // Notify listeners
        for (const listener of this._disposeListeners) {
            listener(resource);
        }

        // Remove from hash lookup
        const hash = resource.metadata.get('hash');
        if (hash) {
            this._hashToId.delete(hash);
        }

        // Update memory tracking
        this._totalMemory -= resource.size;

        // Dispose resource
        resource.dispose();
    }

    /**
     * Remove resource from internal maps
     * @private
     */
    _removeResource(resource) {
        this._resources.delete(resource.id);

        const typeMap = this._byType.get(resource.type);
        if (typeMap) {
            typeMap.delete(resource.id);
        }

        const hash = resource.metadata.get('hash');
        if (hash) {
            this._hashToId.delete(hash);
        }
    }

    /**
     * Add dispose listener
     * @param {function(ManagedResource): void} listener
     * @returns {function} Unsubscribe function
     */
    onDispose(listener) {
        this._disposeListeners.push(listener);
        return () => {
            const idx = this._disposeListeners.indexOf(listener);
            if (idx !== -1) {
                this._disposeListeners.splice(idx, 1);
            }
        };
    }

    // ==================== Utility ====================

    /**
     * Force dispose a resource regardless of reference count
     * @param {string} id
     * @returns {boolean}
     */
    forceDispose(id) {
        const resource = this._resources.get(id);
        if (!resource || resource.disposed) return false;

        this._disposeResource(resource);
        return true;
    }

    /**
     * Dispose all resources of a type
     * @param {string} type
     * @returns {number} Number disposed
     */
    disposeType(type) {
        const typeMap = this._byType.get(type);
        if (!typeMap) return 0;

        let count = 0;
        for (const resource of typeMap.values()) {
            if (!resource.disposed) {
                this._disposeResource(resource);
                count++;
            }
        }

        return count;
    }

    /**
     * Dispose all resources
     */
    disposeAll() {
        for (const resource of this._resources.values()) {
            if (!resource.disposed) {
                this._disposeResource(resource);
            }
        }

        this._resources.clear();
        this._byType.clear();
        this._hashToId.clear();
        this._totalMemory = 0;
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        const stats = {
            totalResources: 0,
            totalMemory: this._totalMemory,
            byType: {}
        };

        for (const [type, typeMap] of this._byType) {
            let count = 0;
            let memory = 0;
            let refs = 0;

            for (const resource of typeMap.values()) {
                if (!resource.disposed) {
                    count++;
                    memory += resource.size;
                    refs += resource.refCount;
                }
            }

            stats.byType[type] = { count, memory, refs };
            stats.totalResources += count;
        }

        return stats;
    }

    /**
     * Generate hash for resource deduplication
     * @param {any} data
     * @returns {string}
     */
    static generateHash(data) {
        // Simple hash for common cases
        if (typeof data === 'string') {
            return `str_${hashString(data)}`;
        }

        if (data instanceof Float32Array || data instanceof Uint16Array) {
            return `arr_${hashTypedArray(data)}`;
        }

        if (typeof data === 'object') {
            return `obj_${hashString(JSON.stringify(data))}`;
        }

        return `val_${String(data)}`;
    }
}

/**
 * Simple string hash function
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash >>> 0;
}

/**
 * Hash typed array
 * @param {TypedArray} arr
 * @returns {number}
 */
function hashTypedArray(arr) {
    let hash = arr.length;
    const step = Math.max(1, Math.floor(arr.length / 100));

    for (let i = 0; i < arr.length; i += step) {
        hash = ((hash << 5) - hash) + (arr[i] * 1000 | 0);
        hash = hash & hash;
    }

    return hash >>> 0;
}

// ==================== Convenience Types ====================

/**
 * Pre-defined resource types
 */
export const ResourceTypes = {
    GEOMETRY: 'geometry',
    MATERIAL: 'material',
    TEXTURE: 'texture',
    BUFFER: 'buffer',
    SHADER: 'shader',
    MESH: 'mesh',
    ANIMATION: 'animation',
    AUDIO: 'audio'
};

export { ManagedResource };
export default ResourceManager;
