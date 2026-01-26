/**
 * RenderResourceRegistry - Centralized GPU resource lifecycle tracking.
 *
 * Tracks WebGL/WebGPU resources by type with optional byte sizing to help
 * manage disposal and provide lifecycle visibility to renderer contracts.
 *
 * Features:
 * - Resource registration with type, handle, disposer, and metadata
 * - Peak usage tracking (high watermark)
 * - Per-frame delta statistics
 * - Allocation/deallocation history for debugging
 * - Resource leak detection
 * - Timeline recording for performance analysis
 */

/**
 * Resource allocation event
 */
class ResourceEvent {
    constructor(type, action, bytes, label = null) {
        this.timestamp = performance.now();
        this.type = type;
        this.action = action; // 'alloc' | 'free'
        this.bytes = bytes;
        this.label = label;
    }
}

export class RenderResourceRegistry {
    /**
     * @param {object} [options]
     * @param {boolean} [options.trackHistory] - Enable allocation history
     * @param {number} [options.historyLimit] - Max history entries (default 1000)
     * @param {boolean} [options.detectLeaks] - Enable leak detection warnings
     */
    constructor(options = {}) {
        this._resources = new Map();

        // Diagnostics options
        this._trackHistory = options.trackHistory || false;
        this._historyLimit = options.historyLimit || 1000;
        this._detectLeaks = options.detectLeaks || false;

        // Peak usage tracking
        this._peakResources = 0;
        this._peakBytes = 0;
        this._peakByType = new Map();

        // Per-frame delta tracking
        this._frameStartResources = 0;
        this._frameStartBytes = 0;
        this._frameDelta = { resources: 0, bytes: 0 };

        // Allocation history
        /** @type {ResourceEvent[]} */
        this._history = [];

        // Leak detection
        this._disposedTypes = new Set();

        // Statistics
        this._stats = {
            totalAllocations: 0,
            totalDeallocations: 0,
            currentResources: 0,
            currentBytes: 0
        };
    }

    /**
     * Enable or disable history tracking
     * @param {boolean} enabled
     */
    setHistoryTracking(enabled) {
        this._trackHistory = enabled;
        if (!enabled) {
            this._history = [];
        }
    }

    /**
     * Mark the start of a frame for delta tracking
     */
    beginFrame() {
        this._frameStartResources = this._stats.currentResources;
        this._frameStartBytes = this._stats.currentBytes;
    }

    /**
     * Mark the end of a frame and calculate deltas
     * @returns {object} Frame delta statistics
     */
    endFrame() {
        this._frameDelta = {
            resources: this._stats.currentResources - this._frameStartResources,
            bytes: this._stats.currentBytes - this._frameStartBytes
        };
        return this._frameDelta;
    }

    /**
     * Register a resource
     * @param {string} type - Resource type (buffer, texture, shader, etc.)
     * @param {any} handle - GPU resource handle
     * @param {function} [disposer] - Cleanup function
     * @param {object} [options]
     * @param {number} [options.bytes] - Resource size in bytes
     * @param {string} [options.label] - Debug label
     * @returns {object|null} Resource entry
     */
    register(type, handle, disposer, options = {}) {
        if (!handle) {
            return null;
        }

        const bytes = options.bytes ?? 0;
        const label = options.label ?? null;

        const entry = {
            handle,
            disposer,
            bytes,
            label,
            createdAt: performance.now(),
            id: ++this._stats.totalAllocations
        };

        const bucket = this._resources.get(type) ?? new Set();
        bucket.add(entry);
        this._resources.set(type, bucket);

        // Update statistics
        this._stats.currentResources++;
        this._stats.currentBytes += bytes;

        // Update peak tracking
        this._updatePeakStats(type);

        // Record history
        if (this._trackHistory) {
            this._recordEvent(type, 'alloc', bytes, label);
        }

        return entry;
    }

    /**
     * Release a resource without disposing
     * @param {string} type
     * @param {any} handle
     * @returns {boolean}
     */
    release(type, handle) {
        const bucket = this._resources.get(type);
        if (!bucket) return false;

        for (const entry of bucket) {
            if (entry.handle === handle) {
                bucket.delete(entry);

                // Update statistics
                this._stats.currentResources--;
                this._stats.currentBytes -= entry.bytes;
                this._stats.totalDeallocations++;

                // Record history
                if (this._trackHistory) {
                    this._recordEvent(type, 'free', entry.bytes, entry.label);
                }

                if (bucket.size === 0) {
                    this._resources.delete(type);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Dispose a resource (call disposer and release)
     * @param {string} type
     * @param {any} handle
     * @returns {boolean}
     */
    dispose(type, handle) {
        const bucket = this._resources.get(type);
        if (!bucket) return false;

        for (const entry of bucket) {
            if (entry.handle === handle) {
                if (entry.disposer) {
                    try {
                        entry.disposer();
                    } catch (e) {
                        console.warn(`RenderResourceRegistry: dispose error for ${type}:`, e);
                    }
                }

                bucket.delete(entry);

                // Update statistics
                this._stats.currentResources--;
                this._stats.currentBytes -= entry.bytes;
                this._stats.totalDeallocations++;

                // Record history
                if (this._trackHistory) {
                    this._recordEvent(type, 'free', entry.bytes, entry.label);
                }

                if (bucket.size === 0) {
                    this._resources.delete(type);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Dispose all resources of a type
     * @param {string} type
     * @returns {number} Number of resources disposed
     */
    disposeType(type) {
        const bucket = this._resources.get(type);
        if (!bucket) return 0;

        let count = 0;
        for (const entry of bucket) {
            if (entry.disposer) {
                try {
                    entry.disposer();
                } catch (e) {
                    console.warn(`RenderResourceRegistry: dispose error for ${type}:`, e);
                }
            }

            this._stats.currentResources--;
            this._stats.currentBytes -= entry.bytes;
            this._stats.totalDeallocations++;

            if (this._trackHistory) {
                this._recordEvent(type, 'free', entry.bytes, entry.label);
            }

            count++;
        }

        this._resources.delete(type);
        this._disposedTypes.add(type);

        return count;
    }

    /**
     * Dispose all resources
     */
    disposeAll() {
        for (const [type, bucket] of this._resources.entries()) {
            for (const entry of bucket) {
                if (entry.disposer) {
                    try {
                        entry.disposer();
                    } catch (e) {
                        console.warn(`RenderResourceRegistry: dispose error for ${type}:`, e);
                    }
                }

                this._stats.totalDeallocations++;

                if (this._trackHistory) {
                    this._recordEvent(type, 'free', entry.bytes, entry.label);
                }
            }
            this._disposedTypes.add(type);
        }

        this._stats.currentResources = 0;
        this._stats.currentBytes = 0;
        this._resources.clear();
    }

    /**
     * Update peak statistics
     * @private
     */
    _updatePeakStats(type) {
        // Global peaks
        if (this._stats.currentResources > this._peakResources) {
            this._peakResources = this._stats.currentResources;
        }
        if (this._stats.currentBytes > this._peakBytes) {
            this._peakBytes = this._stats.currentBytes;
        }

        // Per-type peaks
        const bucket = this._resources.get(type);
        if (bucket) {
            const current = bucket.size;
            const peak = this._peakByType.get(type) || 0;
            if (current > peak) {
                this._peakByType.set(type, current);
            }
        }
    }

    /**
     * Record history event
     * @private
     */
    _recordEvent(type, action, bytes, label) {
        this._history.push(new ResourceEvent(type, action, bytes, label));

        // Trim history if over limit
        if (this._history.length > this._historyLimit) {
            this._history = this._history.slice(-this._historyLimit);
        }
    }

    /**
     * Get basic statistics
     * @returns {object}
     */
    getStats() {
        const stats = {
            totalResources: this._stats.currentResources,
            totalBytes: this._stats.currentBytes,
            byType: {}
        };

        for (const [type, bucket] of this._resources.entries()) {
            let bytes = 0;
            for (const entry of bucket) {
                bytes += entry.bytes;
            }
            stats.byType[type] = {
                count: bucket.size,
                bytes
            };
        }

        return stats;
    }

    /**
     * Get detailed diagnostics
     * @returns {object}
     */
    getDiagnostics() {
        const basicStats = this.getStats();

        return {
            ...basicStats,

            // Peak usage
            peak: {
                resources: this._peakResources,
                bytes: this._peakBytes,
                byType: Object.fromEntries(this._peakByType)
            },

            // Frame delta
            frameDelta: { ...this._frameDelta },

            // Lifetime statistics
            lifetime: {
                totalAllocations: this._stats.totalAllocations,
                totalDeallocations: this._stats.totalDeallocations,
                netAllocations: this._stats.totalAllocations - this._stats.totalDeallocations
            },

            // Memory efficiency
            efficiency: {
                utilizationPercent: this._peakBytes > 0
                    ? (this._stats.currentBytes / this._peakBytes * 100).toFixed(1)
                    : 100,
                averageBytesPerResource: this._stats.currentResources > 0
                    ? Math.round(this._stats.currentBytes / this._stats.currentResources)
                    : 0
            }
        };
    }

    /**
     * Get allocation history
     * @param {object} [options]
     * @param {string} [options.type] - Filter by resource type
     * @param {string} [options.action] - Filter by action ('alloc' or 'free')
     * @param {number} [options.limit] - Max entries to return
     * @returns {ResourceEvent[]}
     */
    getHistory(options = {}) {
        let history = this._history;

        if (options.type) {
            history = history.filter(e => e.type === options.type);
        }
        if (options.action) {
            history = history.filter(e => e.action === options.action);
        }
        if (options.limit) {
            history = history.slice(-options.limit);
        }

        return history;
    }

    /**
     * Get resources by type
     * @param {string} type
     * @returns {Array<object>}
     */
    getResourcesByType(type) {
        const bucket = this._resources.get(type);
        if (!bucket) return [];

        return Array.from(bucket).map(entry => ({
            label: entry.label,
            bytes: entry.bytes,
            createdAt: entry.createdAt,
            age: performance.now() - entry.createdAt,
            id: entry.id
        }));
    }

    /**
     * Check for potential leaks (resources held too long)
     * @param {number} [ageThreshold] - Age in ms to consider as potential leak (default 60000)
     * @returns {Array<object>}
     */
    detectLeaks(ageThreshold = 60000) {
        const now = performance.now();
        const potentialLeaks = [];

        for (const [type, bucket] of this._resources.entries()) {
            for (const entry of bucket) {
                const age = now - entry.createdAt;
                if (age > ageThreshold) {
                    potentialLeaks.push({
                        type,
                        label: entry.label,
                        bytes: entry.bytes,
                        age: Math.round(age),
                        id: entry.id
                    });
                }
            }
        }

        return potentialLeaks;
    }

    /**
     * Reset peak statistics
     */
    resetPeakStats() {
        this._peakResources = this._stats.currentResources;
        this._peakBytes = this._stats.currentBytes;
        this._peakByType.clear();

        for (const [type, bucket] of this._resources.entries()) {
            this._peakByType.set(type, bucket.size);
        }
    }

    /**
     * Clear allocation history
     */
    clearHistory() {
        this._history = [];
    }

    /**
     * Export diagnostics as JSON
     * @returns {string}
     */
    exportDiagnosticsJSON() {
        return JSON.stringify({
            diagnostics: this.getDiagnostics(),
            history: this._history.map(e => ({
                timestamp: e.timestamp,
                type: e.type,
                action: e.action,
                bytes: e.bytes,
                label: e.label
            }))
        }, null, 2);
    }

    /**
     * Get summary string for debug overlay
     * @returns {string}
     */
    getSummaryString() {
        const d = this.getDiagnostics();
        const lines = [
            `Resources: ${d.totalResources} (peak: ${d.peak.resources})`,
            `Memory: ${this._formatBytes(d.totalBytes)} (peak: ${this._formatBytes(d.peak.bytes)})`,
            `Frame Δ: ${d.frameDelta.resources >= 0 ? '+' : ''}${d.frameDelta.resources} resources`
        ];

        // Add per-type breakdown
        for (const [type, data] of Object.entries(d.byType)) {
            lines.push(`  ${type}: ${data.count} (${this._formatBytes(data.bytes)})`);
        }

        return lines.join('\n');
    }

    /**
     * Format bytes for display
     * @private
     */
    _formatBytes(bytes) {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
}

export default RenderResourceRegistry;
