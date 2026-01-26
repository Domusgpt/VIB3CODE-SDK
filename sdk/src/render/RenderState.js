/**
 * RenderState - GPU state management
 *
 * Encapsulates all GPU state settings for efficient state changes.
 * Tracks blend, depth, stencil, cull, and viewport settings.
 */

/**
 * Blend mode presets
 */
export const BlendMode = {
    NONE: 'none',
    ALPHA: 'alpha',
    ADDITIVE: 'additive',
    MULTIPLY: 'multiply',
    PREMULTIPLIED: 'premultiplied'
};

/**
 * Depth comparison functions
 */
export const DepthFunc = {
    NEVER: 'never',
    LESS: 'less',
    EQUAL: 'equal',
    LEQUAL: 'lequal',
    GREATER: 'greater',
    NOTEQUAL: 'notequal',
    GEQUAL: 'gequal',
    ALWAYS: 'always'
};

/**
 * Cull face modes
 */
export const CullFace = {
    NONE: 'none',
    FRONT: 'front',
    BACK: 'back',
    FRONT_AND_BACK: 'front_and_back'
};

/**
 * Polygon fill modes
 */
export const PolygonMode = {
    FILL: 'fill',
    LINE: 'line',
    POINT: 'point'
};

/**
 * Stencil operations
 */
export const StencilOp = {
    KEEP: 'keep',
    ZERO: 'zero',
    REPLACE: 'replace',
    INCR: 'incr',
    INCR_WRAP: 'incr_wrap',
    DECR: 'decr',
    DECR_WRAP: 'decr_wrap',
    INVERT: 'invert'
};

/**
 * Blend state configuration
 */
export class BlendState {
    constructor() {
        /** @type {boolean} */
        this.enabled = false;

        /** @type {string} */
        this.mode = BlendMode.ALPHA;

        /** @type {string} Source RGB factor */
        this.srcRGB = 'src_alpha';

        /** @type {string} Destination RGB factor */
        this.dstRGB = 'one_minus_src_alpha';

        /** @type {string} Source Alpha factor */
        this.srcAlpha = 'one';

        /** @type {string} Destination Alpha factor */
        this.dstAlpha = 'one_minus_src_alpha';

        /** @type {number[]} Blend color (RGBA) */
        this.color = [0, 0, 0, 0];
    }

    /**
     * Set from blend mode preset
     * @param {string} mode
     * @returns {this}
     */
    setMode(mode) {
        this.mode = mode;
        this.enabled = mode !== BlendMode.NONE;

        switch (mode) {
            case BlendMode.ALPHA:
                this.srcRGB = 'src_alpha';
                this.dstRGB = 'one_minus_src_alpha';
                this.srcAlpha = 'one';
                this.dstAlpha = 'one_minus_src_alpha';
                break;

            case BlendMode.ADDITIVE:
                this.srcRGB = 'src_alpha';
                this.dstRGB = 'one';
                this.srcAlpha = 'one';
                this.dstAlpha = 'one';
                break;

            case BlendMode.MULTIPLY:
                this.srcRGB = 'dst_color';
                this.dstRGB = 'zero';
                this.srcAlpha = 'dst_alpha';
                this.dstAlpha = 'zero';
                break;

            case BlendMode.PREMULTIPLIED:
                this.srcRGB = 'one';
                this.dstRGB = 'one_minus_src_alpha';
                this.srcAlpha = 'one';
                this.dstAlpha = 'one_minus_src_alpha';
                break;

            case BlendMode.NONE:
            default:
                this.enabled = false;
                break;
        }

        return this;
    }

    /**
     * Clone this state
     * @returns {BlendState}
     */
    clone() {
        const state = new BlendState();
        state.enabled = this.enabled;
        state.mode = this.mode;
        state.srcRGB = this.srcRGB;
        state.dstRGB = this.dstRGB;
        state.srcAlpha = this.srcAlpha;
        state.dstAlpha = this.dstAlpha;
        state.color = [...this.color];
        return state;
    }

    /**
     * Check equality
     * @param {BlendState} other
     * @returns {boolean}
     */
    equals(other) {
        return this.enabled === other.enabled &&
            this.mode === other.mode &&
            this.srcRGB === other.srcRGB &&
            this.dstRGB === other.dstRGB &&
            this.srcAlpha === other.srcAlpha &&
            this.dstAlpha === other.dstAlpha;
    }
}

/**
 * Depth state configuration
 */
export class DepthState {
    constructor() {
        /** @type {boolean} */
        this.testEnabled = true;

        /** @type {boolean} */
        this.writeEnabled = true;

        /** @type {string} */
        this.func = DepthFunc.LESS;

        /** @type {number} Near clipping plane */
        this.near = 0;

        /** @type {number} Far clipping plane */
        this.far = 1;
    }

    /**
     * Clone this state
     * @returns {DepthState}
     */
    clone() {
        const state = new DepthState();
        state.testEnabled = this.testEnabled;
        state.writeEnabled = this.writeEnabled;
        state.func = this.func;
        state.near = this.near;
        state.far = this.far;
        return state;
    }

    /**
     * Check equality
     * @param {DepthState} other
     * @returns {boolean}
     */
    equals(other) {
        return this.testEnabled === other.testEnabled &&
            this.writeEnabled === other.writeEnabled &&
            this.func === other.func &&
            this.near === other.near &&
            this.far === other.far;
    }
}

/**
 * Stencil state configuration
 */
export class StencilState {
    constructor() {
        /** @type {boolean} */
        this.enabled = false;

        /** @type {string} */
        this.func = 'always';

        /** @type {number} */
        this.ref = 0;

        /** @type {number} */
        this.mask = 0xFF;

        /** @type {string} */
        this.failOp = StencilOp.KEEP;

        /** @type {string} */
        this.depthFailOp = StencilOp.KEEP;

        /** @type {string} */
        this.passOp = StencilOp.KEEP;
    }

    /**
     * Clone this state
     * @returns {StencilState}
     */
    clone() {
        const state = new StencilState();
        state.enabled = this.enabled;
        state.func = this.func;
        state.ref = this.ref;
        state.mask = this.mask;
        state.failOp = this.failOp;
        state.depthFailOp = this.depthFailOp;
        state.passOp = this.passOp;
        return state;
    }

    /**
     * Check equality
     * @param {StencilState} other
     * @returns {boolean}
     */
    equals(other) {
        return this.enabled === other.enabled &&
            this.func === other.func &&
            this.ref === other.ref &&
            this.mask === other.mask &&
            this.failOp === other.failOp &&
            this.depthFailOp === other.depthFailOp &&
            this.passOp === other.passOp;
    }
}

/**
 * Rasterizer state configuration
 */
export class RasterizerState {
    constructor() {
        /** @type {string} */
        this.cullFace = CullFace.BACK;

        /** @type {boolean} Front face is counter-clockwise */
        this.frontFaceCCW = true;

        /** @type {string} */
        this.polygonMode = PolygonMode.FILL;

        /** @type {boolean} */
        this.scissorEnabled = false;

        /** @type {number[]} Scissor rect [x, y, width, height] */
        this.scissorRect = [0, 0, 0, 0];

        /** @type {number} Line width for LINE mode */
        this.lineWidth = 1;

        /** @type {number} Point size for POINT mode */
        this.pointSize = 1;

        /** @type {boolean} */
        this.depthBiasEnabled = false;

        /** @type {number} */
        this.depthBiasFactor = 0;

        /** @type {number} */
        this.depthBiasUnits = 0;
    }

    /**
     * Clone this state
     * @returns {RasterizerState}
     */
    clone() {
        const state = new RasterizerState();
        state.cullFace = this.cullFace;
        state.frontFaceCCW = this.frontFaceCCW;
        state.polygonMode = this.polygonMode;
        state.scissorEnabled = this.scissorEnabled;
        state.scissorRect = [...this.scissorRect];
        state.lineWidth = this.lineWidth;
        state.pointSize = this.pointSize;
        state.depthBiasEnabled = this.depthBiasEnabled;
        state.depthBiasFactor = this.depthBiasFactor;
        state.depthBiasUnits = this.depthBiasUnits;
        return state;
    }

    /**
     * Check equality
     * @param {RasterizerState} other
     * @returns {boolean}
     */
    equals(other) {
        return this.cullFace === other.cullFace &&
            this.frontFaceCCW === other.frontFaceCCW &&
            this.polygonMode === other.polygonMode &&
            this.scissorEnabled === other.scissorEnabled &&
            this.lineWidth === other.lineWidth;
    }
}

/**
 * Viewport configuration
 */
export class Viewport {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    constructor(x = 0, y = 0, width = 800, height = 600) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    /**
     * Get aspect ratio
     * @returns {number}
     */
    get aspectRatio() {
        return this.width / this.height;
    }

    /**
     * Clone this viewport
     * @returns {Viewport}
     */
    clone() {
        return new Viewport(this.x, this.y, this.width, this.height);
    }

    /**
     * Check equality
     * @param {Viewport} other
     * @returns {boolean}
     */
    equals(other) {
        return this.x === other.x &&
            this.y === other.y &&
            this.width === other.width &&
            this.height === other.height;
    }
}

/**
 * Complete render state
 */
export class RenderState {
    constructor() {
        /** @type {BlendState} */
        this.blend = new BlendState();

        /** @type {DepthState} */
        this.depth = new DepthState();

        /** @type {StencilState} */
        this.stencil = new StencilState();

        /** @type {RasterizerState} */
        this.rasterizer = new RasterizerState();

        /** @type {Viewport} */
        this.viewport = new Viewport();

        /** @type {number[]} Color write mask [R, G, B, A] */
        this.colorMask = [true, true, true, true];

        /** @type {number[]} Clear color (RGBA) */
        this.clearColor = [0, 0, 0, 1];

        /** @type {number} Clear depth value */
        this.clearDepth = 1;

        /** @type {number} Clear stencil value */
        this.clearStencil = 0;
    }

    /**
     * Create default state for opaque rendering
     * @returns {RenderState}
     */
    static opaque() {
        const state = new RenderState();
        state.blend.enabled = false;
        state.depth.testEnabled = true;
        state.depth.writeEnabled = true;
        state.rasterizer.cullFace = CullFace.BACK;
        return state;
    }

    /**
     * Create default state for transparent rendering
     * @returns {RenderState}
     */
    static transparent() {
        const state = new RenderState();
        state.blend.setMode(BlendMode.ALPHA);
        state.depth.testEnabled = true;
        state.depth.writeEnabled = false; // Don't write depth for transparent
        state.rasterizer.cullFace = CullFace.NONE;
        return state;
    }

    /**
     * Create state for additive effects (particles, glow)
     * @returns {RenderState}
     */
    static additive() {
        const state = new RenderState();
        state.blend.setMode(BlendMode.ADDITIVE);
        state.depth.testEnabled = true;
        state.depth.writeEnabled = false;
        state.rasterizer.cullFace = CullFace.NONE;
        return state;
    }

    /**
     * Create state for wireframe rendering
     * @returns {RenderState}
     */
    static wireframe() {
        const state = new RenderState();
        state.blend.setMode(BlendMode.ALPHA);
        state.depth.testEnabled = true;
        state.depth.writeEnabled = true;
        state.rasterizer.cullFace = CullFace.NONE;
        state.rasterizer.polygonMode = PolygonMode.LINE;
        return state;
    }

    /**
     * Clone this state
     * @returns {RenderState}
     */
    clone() {
        const state = new RenderState();
        state.blend = this.blend.clone();
        state.depth = this.depth.clone();
        state.stencil = this.stencil.clone();
        state.rasterizer = this.rasterizer.clone();
        state.viewport = this.viewport.clone();
        state.colorMask = [...this.colorMask];
        state.clearColor = [...this.clearColor];
        state.clearDepth = this.clearDepth;
        state.clearStencil = this.clearStencil;
        return state;
    }

    /**
     * Calculate state difference for minimal state changes
     * @param {RenderState} other
     * @returns {object} Changed properties
     */
    diff(other) {
        const changes = {};

        if (!this.blend.equals(other.blend)) {
            changes.blend = other.blend;
        }

        if (!this.depth.equals(other.depth)) {
            changes.depth = other.depth;
        }

        if (!this.stencil.equals(other.stencil)) {
            changes.stencil = other.stencil;
        }

        if (!this.rasterizer.equals(other.rasterizer)) {
            changes.rasterizer = other.rasterizer;
        }

        if (!this.viewport.equals(other.viewport)) {
            changes.viewport = other.viewport;
        }

        return changes;
    }

    /**
     * Generate sort key for state-based sorting
     * Allows grouping draw calls by similar state
     * @returns {number}
     */
    getSortKey() {
        let key = 0;

        // Blend mode (bits 0-3)
        key |= (this.blend.enabled ? 1 : 0);
        key |= (Object.values(BlendMode).indexOf(this.blend.mode) << 1);

        // Depth state (bits 4-7)
        key |= ((this.depth.testEnabled ? 1 : 0) << 4);
        key |= ((this.depth.writeEnabled ? 1 : 0) << 5);

        // Cull state (bits 8-9)
        key |= (Object.values(CullFace).indexOf(this.rasterizer.cullFace) << 8);

        return key;
    }
}

export default RenderState;
