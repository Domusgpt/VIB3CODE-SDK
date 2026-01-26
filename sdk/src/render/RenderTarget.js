/**
 * RenderTarget - Framebuffer abstraction for off-screen rendering
 *
 * Supports:
 * - Multiple color attachments (MRT)
 * - Depth and stencil attachments
 * - Texture and renderbuffer formats
 * - Automatic resize
 */

let renderTargetIdCounter = 0;

/**
 * Texture formats
 */
export const TextureFormat = {
    // Color formats
    RGBA8: 'rgba8',
    RGBA16F: 'rgba16f',
    RGBA32F: 'rgba32f',
    RGB8: 'rgb8',
    RG8: 'rg8',
    R8: 'r8',

    // Depth formats
    DEPTH16: 'depth16',
    DEPTH24: 'depth24',
    DEPTH32F: 'depth32f',

    // Depth-stencil formats
    DEPTH24_STENCIL8: 'depth24_stencil8',
    DEPTH32F_STENCIL8: 'depth32f_stencil8'
};

/**
 * Attachment types
 */
export const AttachmentType = {
    COLOR: 'color',
    DEPTH: 'depth',
    STENCIL: 'stencil',
    DEPTH_STENCIL: 'depth_stencil'
};

/**
 * Texture filtering modes
 */
export const FilterMode = {
    NEAREST: 'nearest',
    LINEAR: 'linear',
    NEAREST_MIPMAP_NEAREST: 'nearest_mipmap_nearest',
    LINEAR_MIPMAP_NEAREST: 'linear_mipmap_nearest',
    NEAREST_MIPMAP_LINEAR: 'nearest_mipmap_linear',
    LINEAR_MIPMAP_LINEAR: 'linear_mipmap_linear'
};

/**
 * Texture wrap modes
 */
export const WrapMode = {
    REPEAT: 'repeat',
    CLAMP_TO_EDGE: 'clamp_to_edge',
    MIRRORED_REPEAT: 'mirrored_repeat'
};

/**
 * Attachment descriptor
 */
export class AttachmentDescriptor {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        /** @type {string} */
        this.type = options.type || AttachmentType.COLOR;

        /** @type {string} */
        this.format = options.format || TextureFormat.RGBA8;

        /** @type {number} Attachment index (for MRT) */
        this.index = options.index || 0;

        /** @type {boolean} Use texture (true) or renderbuffer (false) */
        this.useTexture = options.useTexture !== false;

        /** @type {string} Minification filter */
        this.minFilter = options.minFilter || FilterMode.LINEAR;

        /** @type {string} Magnification filter */
        this.magFilter = options.magFilter || FilterMode.LINEAR;

        /** @type {string} Wrap mode S */
        this.wrapS = options.wrapS || WrapMode.CLAMP_TO_EDGE;

        /** @type {string} Wrap mode T */
        this.wrapT = options.wrapT || WrapMode.CLAMP_TO_EDGE;

        /** @type {boolean} Generate mipmaps */
        this.generateMipmaps = options.generateMipmaps || false;

        /** @type {number} MSAA samples (0 or 1 = no MSAA) */
        this.samples = options.samples || 0;
    }

    /**
     * Create color attachment descriptor
     * @param {object} options
     * @returns {AttachmentDescriptor}
     */
    static color(options = {}) {
        return new AttachmentDescriptor({
            type: AttachmentType.COLOR,
            format: TextureFormat.RGBA8,
            ...options
        });
    }

    /**
     * Create depth attachment descriptor
     * @param {object} options
     * @returns {AttachmentDescriptor}
     */
    static depth(options = {}) {
        return new AttachmentDescriptor({
            type: AttachmentType.DEPTH,
            format: TextureFormat.DEPTH24,
            useTexture: false,
            ...options
        });
    }

    /**
     * Create depth-stencil attachment descriptor
     * @param {object} options
     * @returns {AttachmentDescriptor}
     */
    static depthStencil(options = {}) {
        return new AttachmentDescriptor({
            type: AttachmentType.DEPTH_STENCIL,
            format: TextureFormat.DEPTH24_STENCIL8,
            useTexture: false,
            ...options
        });
    }

    /**
     * Check if this is a depth format
     * @returns {boolean}
     */
    isDepthFormat() {
        return this.type === AttachmentType.DEPTH ||
            this.type === AttachmentType.DEPTH_STENCIL;
    }
}

/**
 * RenderTarget class
 */
export class RenderTarget {
    /**
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     */
    constructor(width, height, options = {}) {
        /** @type {number} */
        this.id = ++renderTargetIdCounter;

        /** @type {number} */
        this.width = width;

        /** @type {number} */
        this.height = height;

        /** @type {AttachmentDescriptor[]} Color attachments */
        this.colorAttachments = options.colorAttachments || [
            AttachmentDescriptor.color()
        ];

        /** @type {AttachmentDescriptor|null} Depth/stencil attachment */
        this.depthAttachment = options.depthAttachment !== undefined
            ? options.depthAttachment
            : AttachmentDescriptor.depth();

        /** @type {string|null} Debug label */
        this.label = options.label || null;

        /** @type {boolean} Auto-resize with window */
        this.autoResize = options.autoResize || false;

        /** @type {number} Scale factor for auto-resize */
        this.resizeScale = options.resizeScale || 1;

        /** @type {object|null} Backend-specific handle */
        this._handle = null;

        /** @type {object[]} Texture handles for color attachments */
        this._colorTextures = [];

        /** @type {object|null} Depth texture handle */
        this._depthTexture = null;

        /** @type {boolean} Whether resources are allocated */
        this._allocated = false;

        /** @type {boolean} Whether target is disposed */
        this._disposed = false;
    }

    /**
     * Get aspect ratio
     * @returns {number}
     */
    get aspectRatio() {
        return this.width / this.height;
    }

    /**
     * Check if target has depth attachment
     * @returns {boolean}
     */
    get hasDepth() {
        return this.depthAttachment !== null;
    }

    /**
     * Get number of color attachments
     * @returns {number}
     */
    get colorAttachmentCount() {
        return this.colorAttachments.length;
    }

    /**
     * Resize the render target
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        if (width === this.width && height === this.height) return;

        this.width = width;
        this.height = height;

        // Mark for reallocation
        if (this._allocated) {
            this._needsReallocation = true;
        }
    }

    /**
     * Get color texture at index
     * @param {number} index
     * @returns {object|null}
     */
    getColorTexture(index = 0) {
        return this._colorTextures[index] || null;
    }

    /**
     * Get depth texture
     * @returns {object|null}
     */
    getDepthTexture() {
        return this._depthTexture;
    }

    /**
     * Set backend handle
     * @param {object} handle
     */
    setHandle(handle) {
        this._handle = handle;
        this._allocated = true;
    }

    /**
     * Get backend handle
     * @returns {object|null}
     */
    getHandle() {
        return this._handle;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this._handle = null;
        this._colorTextures = [];
        this._depthTexture = null;
        this._allocated = false;
        this._disposed = true;
    }

    /**
     * Create simple render target (single color + depth)
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @returns {RenderTarget}
     */
    static create(width, height, options = {}) {
        return new RenderTarget(width, height, {
            colorAttachments: [AttachmentDescriptor.color({
                format: options.colorFormat || TextureFormat.RGBA8
            })],
            depthAttachment: options.depth !== false
                ? AttachmentDescriptor.depth()
                : null,
            ...options
        });
    }

    /**
     * Create HDR render target
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @returns {RenderTarget}
     */
    static createHDR(width, height, options = {}) {
        return new RenderTarget(width, height, {
            colorAttachments: [AttachmentDescriptor.color({
                format: TextureFormat.RGBA16F
            })],
            depthAttachment: AttachmentDescriptor.depth(),
            ...options
        });
    }

    /**
     * Create G-buffer for deferred rendering
     * @param {number} width
     * @param {number} height
     * @returns {RenderTarget}
     */
    static createGBuffer(width, height) {
        return new RenderTarget(width, height, {
            colorAttachments: [
                // Position
                AttachmentDescriptor.color({
                    index: 0,
                    format: TextureFormat.RGBA16F
                }),
                // Normal
                AttachmentDescriptor.color({
                    index: 1,
                    format: TextureFormat.RGBA16F
                }),
                // Albedo + Specular
                AttachmentDescriptor.color({
                    index: 2,
                    format: TextureFormat.RGBA8
                })
            ],
            depthAttachment: AttachmentDescriptor.depthStencil(),
            label: 'GBuffer'
        });
    }

    /**
     * Create shadow map
     * @param {number} size
     * @param {object} [options]
     * @returns {RenderTarget}
     */
    static createShadowMap(size, options = {}) {
        return new RenderTarget(size, size, {
            colorAttachments: [],
            depthAttachment: AttachmentDescriptor.depth({
                format: TextureFormat.DEPTH32F,
                useTexture: true
            }),
            label: 'ShadowMap',
            ...options
        });
    }

    /**
     * Create MSAA render target
     * @param {number} width
     * @param {number} height
     * @param {number} samples
     * @returns {RenderTarget}
     */
    static createMSAA(width, height, samples = 4) {
        return new RenderTarget(width, height, {
            colorAttachments: [AttachmentDescriptor.color({
                samples,
                useTexture: false
            })],
            depthAttachment: AttachmentDescriptor.depth({
                samples
            }),
            label: `MSAA_${samples}x`
        });
    }
}

/**
 * RenderTargetPool - Manages pooled render targets
 */
export class RenderTargetPool {
    constructor() {
        /** @type {Map<string, RenderTarget[]>} */
        this._pools = new Map();

        /** @type {Set<RenderTarget>} */
        this._inUse = new Set();
    }

    /**
     * Generate pool key from dimensions and format
     * @private
     */
    _getKey(width, height, format) {
        return `${width}x${height}_${format}`;
    }

    /**
     * Acquire a render target
     * @param {number} width
     * @param {number} height
     * @param {string} format
     * @returns {RenderTarget}
     */
    acquire(width, height, format = TextureFormat.RGBA8) {
        const key = this._getKey(width, height, format);

        if (!this._pools.has(key)) {
            this._pools.set(key, []);
        }

        const pool = this._pools.get(key);
        let target;

        if (pool.length > 0) {
            target = pool.pop();
        } else {
            target = RenderTarget.create(width, height, {
                colorFormat: format
            });
        }

        this._inUse.add(target);
        return target;
    }

    /**
     * Release a render target back to pool
     * @param {RenderTarget} target
     */
    release(target) {
        if (!this._inUse.has(target)) return;

        this._inUse.delete(target);

        const key = this._getKey(
            target.width,
            target.height,
            target.colorAttachments[0]?.format || 'default'
        );

        if (!this._pools.has(key)) {
            this._pools.set(key, []);
        }

        this._pools.get(key).push(target);
    }

    /**
     * Clear all pools
     */
    clear() {
        for (const pool of this._pools.values()) {
            for (const target of pool) {
                target.dispose();
            }
        }
        this._pools.clear();

        for (const target of this._inUse) {
            target.dispose();
        }
        this._inUse.clear();
    }

    /**
     * Get pool statistics
     * @returns {object}
     */
    getStats() {
        let pooled = 0;
        for (const pool of this._pools.values()) {
            pooled += pool.length;
        }

        return {
            pooled,
            inUse: this._inUse.size,
            poolCount: this._pools.size
        };
    }
}

/**
 * Global render target pool
 */
export const renderTargetPool = new RenderTargetPool();

export default RenderTarget;
