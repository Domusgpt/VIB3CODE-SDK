/**
 * Disposable - Cascade disposal system for scene objects
 *
 * Provides automatic resource cleanup with:
 * - Dependency tracking
 * - Cascade disposal
 * - Safe disposal ordering
 * - Memory leak detection
 */

/**
 * Disposal state enum
 */
export const DisposalState = {
    ACTIVE: 'active',
    DISPOSING: 'disposing',
    DISPOSED: 'disposed'
};

/**
 * Base class for disposable objects
 */
export class Disposable {
    constructor() {
        /** @type {string} Current disposal state */
        this._disposalState = DisposalState.ACTIVE;

        /** @type {Set<Disposable>} Objects that depend on this one */
        this._dependents = new Set();

        /** @type {Set<Disposable>} Objects this one depends on */
        this._dependencies = new Set();

        /** @type {function[]} Callbacks to run on dispose */
        this._disposeCallbacks = [];

        /** @type {string|null} Debug label */
        this._label = null;
    }

    /**
     * Get disposal state
     * @returns {string}
     */
    get disposalState() {
        return this._disposalState;
    }

    /**
     * Check if disposed
     * @returns {boolean}
     */
    get isDisposed() {
        return this._disposalState === DisposalState.DISPOSED;
    }

    /**
     * Check if active (not disposed or disposing)
     * @returns {boolean}
     */
    get isActive() {
        return this._disposalState === DisposalState.ACTIVE;
    }

    /**
     * Set debug label
     * @param {string} label
     * @returns {this}
     */
    setLabel(label) {
        this._label = label;
        return this;
    }

    /**
     * Add a dependency (this object depends on other)
     * @param {Disposable} other
     * @returns {this}
     */
    addDependency(other) {
        if (other === this) {
            throw new Error('Object cannot depend on itself');
        }

        if (this._checkCircularDependency(other)) {
            throw new Error('Circular dependency detected');
        }

        this._dependencies.add(other);
        other._dependents.add(this);
        return this;
    }

    /**
     * Remove a dependency
     * @param {Disposable} other
     * @returns {this}
     */
    removeDependency(other) {
        this._dependencies.delete(other);
        other._dependents.delete(this);
        return this;
    }

    /**
     * Check for circular dependency
     * @private
     */
    _checkCircularDependency(other, visited = new Set()) {
        if (visited.has(other)) return false;
        if (other._dependencies.has(this)) return true;

        visited.add(other);
        for (const dep of other._dependencies) {
            if (this._checkCircularDependency(dep, visited)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Add dispose callback
     * @param {function(): void} callback
     * @returns {function} Unsubscribe function
     */
    onDispose(callback) {
        this._disposeCallbacks.push(callback);
        return () => {
            const idx = this._disposeCallbacks.indexOf(callback);
            if (idx !== -1) {
                this._disposeCallbacks.splice(idx, 1);
            }
        };
    }

    /**
     * Dispose this object and cascade to dependents
     */
    dispose() {
        if (this._disposalState !== DisposalState.ACTIVE) {
            return;
        }

        this._disposalState = DisposalState.DISPOSING;

        // First dispose all dependents (cascade)
        for (const dependent of [...this._dependents]) {
            dependent.dispose();
        }

        // Run dispose callbacks
        for (const callback of this._disposeCallbacks) {
            try {
                callback();
            } catch (e) {
                console.error(`Dispose callback error in ${this._label || 'unknown'}:`, e);
            }
        }

        // Perform actual disposal
        this._doDispose();

        // Remove from dependencies' dependent lists
        for (const dep of this._dependencies) {
            dep._dependents.delete(this);
        }

        // Clear references
        this._dependents.clear();
        this._dependencies.clear();
        this._disposeCallbacks = [];

        this._disposalState = DisposalState.DISPOSED;
    }

    /**
     * Override this to perform actual resource cleanup
     * @protected
     */
    _doDispose() {
        // Subclasses implement this
    }

    /**
     * Assert object is not disposed
     * @param {string} [operation] - Operation being attempted
     */
    assertNotDisposed(operation = 'operation') {
        if (this._disposalState !== DisposalState.ACTIVE) {
            throw new Error(
                `Cannot perform ${operation} on disposed object: ${this._label || 'unknown'}`
            );
        }
    }
}

/**
 * Manages disposal of multiple objects with dependency ordering
 */
export class DisposalManager {
    constructor() {
        /** @type {Set<Disposable>} Tracked objects */
        this._tracked = new Set();

        /** @type {boolean} Whether disposal is in progress */
        this._disposing = false;

        /** @type {Set<Disposable>} Objects pending disposal */
        this._pendingDisposal = new Set();
    }

    /**
     * Track an object for disposal
     * @param {Disposable} obj
     * @returns {this}
     */
    track(obj) {
        this._tracked.add(obj);
        return this;
    }

    /**
     * Untrack an object
     * @param {Disposable} obj
     * @returns {this}
     */
    untrack(obj) {
        this._tracked.delete(obj);
        return this;
    }

    /**
     * Mark object for deferred disposal
     * @param {Disposable} obj
     * @returns {this}
     */
    markForDisposal(obj) {
        this._pendingDisposal.add(obj);
        return this;
    }

    /**
     * Process pending disposals
     */
    processPending() {
        if (this._disposing) return;

        this._disposing = true;

        // Sort by dependency order (dispose dependents first)
        const sorted = this._topologicalSort([...this._pendingDisposal]);

        for (const obj of sorted) {
            if (obj.isActive) {
                obj.dispose();
            }
            this._tracked.delete(obj);
        }

        this._pendingDisposal.clear();
        this._disposing = false;
    }

    /**
     * Topological sort for disposal order
     * @private
     */
    _topologicalSort(objects) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (obj) => {
            if (visited.has(obj)) return;
            if (visiting.has(obj)) {
                console.warn('Circular dependency in disposal');
                return;
            }

            visiting.add(obj);

            // Visit dependents first (they need to be disposed before this)
            for (const dependent of obj._dependents) {
                if (objects.includes(dependent)) {
                    visit(dependent);
                }
            }

            visiting.delete(obj);
            visited.add(obj);
            sorted.push(obj);
        };

        for (const obj of objects) {
            visit(obj);
        }

        return sorted;
    }

    /**
     * Dispose all tracked objects
     */
    disposeAll() {
        // Add all tracked to pending
        for (const obj of this._tracked) {
            this._pendingDisposal.add(obj);
        }

        this.processPending();
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        let activeCount = 0;
        let disposedCount = 0;

        for (const obj of this._tracked) {
            if (obj.isActive) activeCount++;
            else disposedCount++;
        }

        return {
            tracked: this._tracked.size,
            active: activeCount,
            disposed: disposedCount,
            pending: this._pendingDisposal.size
        };
    }
}

/**
 * Composite disposable - disposes multiple objects together
 */
export class CompositeDisposable extends Disposable {
    constructor() {
        super();
        /** @type {Set<Disposable>} */
        this._children = new Set();
    }

    /**
     * Add a child disposable
     * @param {Disposable} child
     * @returns {this}
     */
    add(child) {
        this.assertNotDisposed('add');
        this._children.add(child);
        return this;
    }

    /**
     * Remove a child (does not dispose it)
     * @param {Disposable} child
     * @returns {boolean}
     */
    remove(child) {
        return this._children.delete(child);
    }

    /**
     * @override
     */
    _doDispose() {
        for (const child of this._children) {
            child.dispose();
        }
        this._children.clear();
    }
}

/**
 * Single assignment disposable - can only be assigned once
 */
export class SingleAssignmentDisposable extends Disposable {
    constructor() {
        super();
        /** @type {Disposable|null} */
        this._inner = null;
    }

    /**
     * Set the inner disposable (can only be called once)
     * @param {Disposable} disposable
     */
    set(disposable) {
        if (this._inner !== null) {
            throw new Error('SingleAssignmentDisposable already assigned');
        }

        if (this.isDisposed) {
            disposable.dispose();
            return;
        }

        this._inner = disposable;
    }

    /**
     * @override
     */
    _doDispose() {
        if (this._inner) {
            this._inner.dispose();
            this._inner = null;
        }
    }
}

/**
 * Serial disposable - replaces previous disposable on assignment
 */
export class SerialDisposable extends Disposable {
    constructor() {
        super();
        /** @type {Disposable|null} */
        this._inner = null;
    }

    /**
     * Set the inner disposable (disposes previous)
     * @param {Disposable|null} disposable
     */
    set(disposable) {
        if (this.isDisposed) {
            if (disposable) disposable.dispose();
            return;
        }

        if (this._inner) {
            this._inner.dispose();
        }

        this._inner = disposable;
    }

    /**
     * Get current inner
     * @returns {Disposable|null}
     */
    get() {
        return this._inner;
    }

    /**
     * @override
     */
    _doDispose() {
        if (this._inner) {
            this._inner.dispose();
            this._inner = null;
        }
    }
}

/**
 * Callback disposable - runs a callback on dispose
 */
export class CallbackDisposable extends Disposable {
    /**
     * @param {function(): void} callback
     */
    constructor(callback) {
        super();
        this._callback = callback;
    }

    /**
     * @override
     */
    _doDispose() {
        if (this._callback) {
            this._callback();
            this._callback = null;
        }
    }
}

/**
 * Create a disposable from a cleanup function
 * @param {function(): void} cleanup
 * @returns {Disposable}
 */
export function createDisposable(cleanup) {
    return new CallbackDisposable(cleanup);
}

/**
 * Global disposal manager instance
 */
export const disposalManager = new DisposalManager();

export default Disposable;
