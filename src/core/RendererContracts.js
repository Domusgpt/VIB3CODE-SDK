/**
 * Renderer and resource manager contracts for unified engine integrations.
 * These contracts provide a minimal API surface so renderers and resource managers
 * can be swapped without rewriting orchestration layers.
 *
 * @fileoverview VIB3+ SDK Renderer Contract System
 *
 * Contract Methods:
 * - init(context)              Initialize renderer with optional context
 * - resize(width, height, dpr) Handle canvas resize
 * - render(frameState)         Render a single frame
 * - setActive(active)          Activate/deactivate renderer
 * - dispose()                  Clean up all resources
 *
 * Systems implementing this contract:
 * - QuantumEngine       (src/quantum/QuantumEngine.js)
 * - FacetedSystem       (src/faceted/FacetedSystem.js)
 * - RealHolographicSystem (src/holograms/RealHolographicSystem.js)
 */

/**
 * Abstract renderer contract - base class for all visualization systems
 * @abstract
 */
export class RendererContract {
    /**
     * Initialize the renderer
     * @param {Object} context - Initialization context (canvas, options, etc.)
     * @returns {boolean|Promise<boolean>} Success status
     */
    init(context) {
        throw new Error('RendererContract.init() must be implemented.');
    }

    /**
     * Handle canvas resize
     * @param {number} width - New width in pixels
     * @param {number} height - New height in pixels
     * @param {number} [pixelRatio=1] - Device pixel ratio
     */
    resize(width, height, pixelRatio = 1) {
        throw new Error('RendererContract.resize() must be implemented.');
    }

    /**
     * Render a single frame
     * @param {Object} [frameState] - Frame state with time, parameters, audio data
     * @param {number} [frameState.time] - Current time in seconds
     * @param {Object} [frameState.params] - Visualization parameters
     * @param {Object} [frameState.audio] - Audio reactivity data
     */
    render(frameState) {
        throw new Error('RendererContract.render() must be implemented.');
    }

    /**
     * Set active/inactive state
     * @param {boolean} active - Whether the renderer should be active
     */
    setActive(active) {
        throw new Error('RendererContract.setActive() must be implemented.');
    }

    /**
     * Clean up all resources (WebGL contexts, audio, event listeners)
     */
    dispose() {
        throw new Error('RendererContract.dispose() must be implemented.');
    }
}

/**
 * Adapter base class that provides default implementations
 * Systems can extend this instead of RendererContract for easier compliance
 */
export class RendererContractAdapter extends RendererContract {
    constructor() {
        super();
        this._initialized = false;
        this._active = false;
        this._width = 0;
        this._height = 0;
        this._pixelRatio = 1;
    }

    /**
     * Check if renderer is initialized
     * @returns {boolean}
     */
    get initialized() {
        return this._initialized;
    }

    /**
     * Check if renderer is active
     * @returns {boolean}
     */
    get isActive() {
        return this._active;
    }

    /**
     * Default init - override in subclass
     * @param {Object} context
     * @returns {boolean}
     */
    init(context) {
        this._initialized = true;
        return true;
    }

    /**
     * Default resize - stores dimensions, override to apply to canvases
     * @param {number} width
     * @param {number} height
     * @param {number} pixelRatio
     */
    resize(width, height, pixelRatio = 1) {
        this._width = width;
        this._height = height;
        this._pixelRatio = pixelRatio;
    }

    /**
     * Default render - no-op, override in subclass
     * @param {Object} frameState
     */
    render(frameState) {
        // Override in subclass
    }

    /**
     * Default setActive - stores state
     * @param {boolean} active
     */
    setActive(active) {
        this._active = active;
    }

    /**
     * Default dispose - resets state
     */
    dispose() {
        this._initialized = false;
        this._active = false;
    }
}

/**
 * Verify that a system implements the RendererContract
 * @param {Object} system - System instance to verify
 * @returns {{compliant: boolean, missing: string[], warnings: string[]}}
 */
export function verifyRendererContract(system) {
    const required = ['init', 'resize', 'render', 'setActive', 'dispose'];
    const missing = [];
    const warnings = [];

    for (const method of required) {
        if (typeof system[method] !== 'function') {
            // Check for common aliases
            const aliases = {
                init: ['initialize'],
                dispose: ['destroy', 'cleanup'],
                render: ['renderFrame', 'draw']
            };

            const hasAlias = aliases[method]?.some(alias => typeof system[alias] === 'function');
            if (hasAlias) {
                warnings.push(`${method}() missing but alias exists - consider adding standard method`);
            } else {
                missing.push(method);
            }
        }
    }

    return {
        compliant: missing.length === 0,
        missing,
        warnings
    };
}

export class ResourceManagerContract {
    registerResource(type, id, resource, bytes = 0) {
        throw new Error('ResourceManagerContract.registerResource() must be implemented.');
    }

    releaseResource(type, id) {
        throw new Error('ResourceManagerContract.releaseResource() must be implemented.');
    }

    disposeAll() {
        throw new Error('ResourceManagerContract.disposeAll() must be implemented.');
    }

    getStats() {
        throw new Error('ResourceManagerContract.getStats() must be implemented.');
    }
}
