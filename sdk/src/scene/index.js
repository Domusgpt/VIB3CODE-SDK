/**
 * Scene Module
 *
 * Complete 4D scene graph system with resource management.
 *
 * Core Classes:
 * - Node4D: Transform hierarchy node
 * - Scene4D: Scene container
 * - ResourceManager: Reference-counted resources
 * - MemoryPool: Object pooling
 * - Disposable: Cascade disposal
 */

// Scene Graph
export { Node4D, default as Node4DDefault } from './Node4D.js';
export { Scene4D, default as Scene4DDefault } from './Scene4D.js';

// Resource Management
export {
    ResourceManager,
    ManagedResource,
    ResourceTypes,
    default as ResourceManagerDefault
} from './ResourceManager.js';

// Memory Pools
export {
    ObjectPool,
    TypedArrayPool,
    Vec4Pool,
    Mat4x4Pool,
    PoolManager,
    pools,
    default as PoolManagerDefault
} from './MemoryPool.js';

// Disposal System
export {
    Disposable,
    DisposalManager,
    DisposalState,
    CompositeDisposable,
    SingleAssignmentDisposable,
    SerialDisposable,
    CallbackDisposable,
    createDisposable,
    disposalManager,
    default as DisposableDefault
} from './Disposable.js';

/**
 * Create a complete scene setup with all managers
 * @param {object} [options]
 * @returns {object}
 */
export function createSceneContext(options = {}) {
    const {
        sceneName = 'main',
        memoryLimit = 256 * 1024 * 1024, // 256MB default
        poolInitialSize = 100
    } = options;

    const scene = new (require('./Scene4D.js').Scene4D)(sceneName);
    const resources = new (require('./ResourceManager.js').ResourceManager)();
    const disposal = new (require('./Disposable.js').DisposalManager)();
    const poolManager = new (require('./MemoryPool.js').PoolManager)();

    resources.memoryLimit = memoryLimit;

    return {
        scene,
        resources,
        disposal,
        pools: poolManager,

        /**
         * Dispose all context resources
         */
        dispose() {
            disposal.disposeAll();
            resources.disposeAll();
            scene.dispose();
            poolManager.clearAll();
        },

        /**
         * Get combined statistics
         */
        getStats() {
            return {
                scene: scene.getStats(),
                resources: resources.getStats(),
                disposal: disposal.getStats(),
                pools: poolManager.getStats()
            };
        }
    };
}
