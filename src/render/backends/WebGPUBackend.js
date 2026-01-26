/**
 * WebGPUBackend - WebGPU rendering backend for VIB3+ engine
 *
 * Features:
 * - Device/context initialization with feature detection
 * - Canvas configuration + resize handling
 * - Shader pipeline management
 * - Uniform buffer handling
 * - Render state management
 * - Clear pass and geometry rendering
 */

import { RenderResourceRegistry } from '../RenderResourceRegistry.js';

/**
 * Default vertex shader for geometry rendering
 */
const DEFAULT_VERTEX_SHADER = /* wgsl */`
struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    time: f32,
    dimension: f32,
    _padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) worldPos: vec3<f32>,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Apply 4D to 3D projection based on dimension parameter
    let w = input.position.w;
    let projectionFactor = 1.0 / (uniforms.dimension - w);
    let projected = vec4<f32>(
        input.position.x * projectionFactor,
        input.position.y * projectionFactor,
        input.position.z * projectionFactor,
        1.0
    );

    // Apply model-view-projection
    let worldPos = uniforms.modelMatrix * projected;
    let viewPos = uniforms.viewMatrix * worldPos;
    output.position = uniforms.projectionMatrix * viewPos;
    output.worldPos = worldPos.xyz;
    output.color = input.color;

    return output;
}
`;

/**
 * Default fragment shader for geometry rendering
 */
const DEFAULT_FRAGMENT_SHADER = /* wgsl */`
struct FragmentInput {
    @location(0) color: vec4<f32>,
    @location(1) worldPos: vec3<f32>,
};

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    // Add subtle depth-based shading
    let depth = clamp(length(input.worldPos) * 0.2, 0.0, 1.0);
    let shaded = input.color.rgb * (1.0 - depth * 0.3);

    return vec4<f32>(shaded, input.color.a);
}
`;

/**
 * WebGPU feature flags
 */
export const WebGPUFeatures = {
    TIMESTAMP_QUERY: 'timestamp-query',
    INDIRECT_FIRST_INSTANCE: 'indirect-first-instance',
    SHADER_F16: 'shader-f16',
    DEPTH_CLIP_CONTROL: 'depth-clip-control',
    DEPTH32_STENCIL8: 'depth32float-stencil8',
    TEXTURE_COMPRESSION_BC: 'texture-compression-bc',
    RG11B10_UFLOAT_RENDERABLE: 'rg11b10ufloat-renderable',
    BGRA8_UNORM_STORAGE: 'bgra8unorm-storage'
};

export class WebGPUBackend {
    /**
     * @param {object} params
     * @param {HTMLCanvasElement} params.canvas
     * @param {GPUDevice} params.device
     * @param {GPUCanvasContext} params.context
     * @param {GPUTextureFormat} params.format
     * @param {GPUAdapter} [params.adapter]
     * @param {object} [options]
     */
    constructor({ canvas, device, context, format, adapter }, options = {}) {
        this.canvas = canvas;
        this.device = device;
        this.context = context;
        this.format = format;
        this.adapter = adapter || null;

        this.debug = options.debug || false;
        this.depthEnabled = options.depth !== false;
        this._resources = options.resourceRegistry || new RenderResourceRegistry();

        /** @type {GPUTexture|null} */
        this._depthTexture = null;

        /** @type {Map<string, GPURenderPipeline>} */
        this._pipelines = new Map();

        /** @type {Map<string, GPUShaderModule>} */
        this._shaderModules = new Map();

        /** @type {GPUBuffer|null} */
        this._uniformBuffer = null;

        /** @type {GPUBindGroup|null} */
        this._uniformBindGroup = null;

        /** @type {GPUBindGroupLayout|null} */
        this._uniformBindGroupLayout = null;

        /** @type {Set<string>} */
        this._enabledFeatures = new Set(options.features || []);

        this._stats = {
            frames: 0,
            commandEncoders: 0,
            drawCalls: 0,
            triangles: 0,
            pipelineChanges: 0
        };

        // Initialize uniform buffer
        this._initUniformBuffer();

        // Create default pipeline
        this._createDefaultPipeline();

        this.resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
    }

    /**
     * Check if a feature is supported
     * @param {string} feature
     * @returns {boolean}
     */
    hasFeature(feature) {
        return this._enabledFeatures.has(feature);
    }

    /**
     * Get GPU info
     * @returns {object}
     */
    getGPUInfo() {
        if (!this.adapter) return { vendor: 'unknown', architecture: 'unknown' };

        return {
            vendor: this.adapter.info?.vendor || 'unknown',
            architecture: this.adapter.info?.architecture || 'unknown',
            device: this.adapter.info?.device || 'unknown',
            description: this.adapter.info?.description || 'unknown',
            features: Array.from(this._enabledFeatures)
        };
    }

    /**
     * Initialize uniform buffer
     * @private
     */
    _initUniformBuffer() {
        // Uniform buffer layout:
        // - mat4x4 modelMatrix (64 bytes)
        // - mat4x4 viewMatrix (64 bytes)
        // - mat4x4 projectionMatrix (64 bytes)
        // - f32 time (4 bytes)
        // - f32 dimension (4 bytes)
        // - vec2 padding (8 bytes)
        // Total: 208 bytes, aligned to 256 for WebGPU
        const uniformBufferSize = 256;

        this._uniformBuffer = this.device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this._resources.register('buffer', this._uniformBuffer);

        // Create bind group layout
        this._uniformBindGroupLayout = this.device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        // Create bind group
        this._uniformBindGroup = this.device.createBindGroup({
            layout: this._uniformBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this._uniformBuffer }
            }]
        });
    }

    /**
     * Create default rendering pipeline
     * @private
     */
    _createDefaultPipeline() {
        const vertexModule = this._getOrCreateShaderModule('default-vertex', DEFAULT_VERTEX_SHADER);
        const fragmentModule = this._getOrCreateShaderModule('default-fragment', DEFAULT_FRAGMENT_SHADER);

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this._uniformBindGroupLayout]
        });

        const pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: vertexModule,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 32, // 4 floats position + 4 floats color
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x4' },  // position
                        { shaderLocation: 1, offset: 16, format: 'float32x4' }  // color
                    ]
                }]
            },
            fragment: {
                module: fragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
                frontFace: 'ccw'
            },
            depthStencil: this.depthEnabled ? {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            } : undefined
        });

        this._pipelines.set('default', pipeline);
    }

    /**
     * Get or create shader module
     * @private
     */
    _getOrCreateShaderModule(name, code) {
        if (this._shaderModules.has(name)) {
            return this._shaderModules.get(name);
        }

        const module = this.device.createShaderModule({ code });
        this._shaderModules.set(name, module);
        return module;
    }

    /**
     * Update uniform buffer with current state
     * @param {object} uniforms
     */
    updateUniforms(uniforms) {
        const data = new Float32Array(64); // 256 bytes / 4

        // Model matrix (identity if not provided)
        const model = uniforms.modelMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
        data.set(model, 0);

        // View matrix
        const view = uniforms.viewMatrix || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-3,1];
        data.set(view, 16);

        // Projection matrix
        const proj = uniforms.projectionMatrix || this._createProjectionMatrix();
        data.set(proj, 32);

        // Time
        data[48] = uniforms.time || 0;

        // Dimension
        data[49] = uniforms.dimension || 3.5;

        this.device.queue.writeBuffer(this._uniformBuffer, 0, data);
    }

    /**
     * Create perspective projection matrix
     * @private
     */
    _createProjectionMatrix() {
        const fov = Math.PI / 4;
        const aspect = this.canvas.width / this.canvas.height;
        const near = 0.1;
        const far = 100;

        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1 / (near - far);

        return [
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ];
    }

    /**
     * Resize the canvas and recreate depth resources if enabled.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        const clampedWidth = Math.max(1, Math.floor(width));
        const clampedHeight = Math.max(1, Math.floor(height));

        this.canvas.width = clampedWidth;
        this.canvas.height = clampedHeight;

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        });

        if (this.depthEnabled) {
            this._destroyDepthTexture();
            this._depthTexture = this.device.createTexture({
                size: { width: clampedWidth, height: clampedHeight, depthOrArrayLayers: 1 },
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
            this._resources.register('texture', this._depthTexture);
        }
    }

    /**
     * Create a vertex buffer from geometry data
     * @param {Float32Array} data - Interleaved vertex data
     * @returns {GPUBuffer}
     */
    createVertexBuffer(data) {
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });

        new Float32Array(buffer.getMappedRange()).set(data);
        buffer.unmap();

        this._resources.register('buffer', buffer);
        return buffer;
    }

    /**
     * Create an index buffer
     * @param {Uint16Array|Uint32Array} data
     * @returns {GPUBuffer}
     */
    createIndexBuffer(data) {
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });

        if (data instanceof Uint16Array) {
            new Uint16Array(buffer.getMappedRange()).set(data);
        } else {
            new Uint32Array(buffer.getMappedRange()).set(data);
        }
        buffer.unmap();

        this._resources.register('buffer', buffer);
        return buffer;
    }

    /**
     * Render a single frame (clear-only pass by default).
     * @param {object} [options]
     * @param {number[]} [options.clearColor] - RGBA in 0-1
     */
    renderFrame(options = {}) {
        const clearColor = options.clearColor || [0, 0, 0, 1];
        const encoder = this.device.createCommandEncoder();
        this._stats.commandEncoders += 1;

        const colorView = this.context.getCurrentTexture().createView();
        const depthAttachment = this.depthEnabled && this._depthTexture
            ? {
                view: this._depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
            : undefined;

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: colorView,
                clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: depthAttachment
        });
        pass.end();

        this.device.queue.submit([encoder.finish()]);
        this._stats.frames += 1;
    }

    /**
     * Render geometry with the default pipeline
     * @param {object} options
     * @param {GPUBuffer} options.vertexBuffer
     * @param {GPUBuffer} [options.indexBuffer]
     * @param {number} options.vertexCount
     * @param {number} [options.indexCount]
     * @param {object} [options.uniforms]
     * @param {number[]} [options.clearColor]
     */
    renderGeometry(options) {
        const {
            vertexBuffer,
            indexBuffer,
            vertexCount,
            indexCount,
            uniforms = {},
            clearColor = [0, 0, 0, 1]
        } = options;

        // Update uniforms
        this.updateUniforms(uniforms);

        const encoder = this.device.createCommandEncoder();
        this._stats.commandEncoders += 1;

        const colorView = this.context.getCurrentTexture().createView();
        const depthAttachment = this.depthEnabled && this._depthTexture
            ? {
                view: this._depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
            : undefined;

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: colorView,
                clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: depthAttachment
        });

        // Set pipeline
        const pipeline = this._pipelines.get('default');
        pass.setPipeline(pipeline);
        this._stats.pipelineChanges += 1;

        // Set bind group
        pass.setBindGroup(0, this._uniformBindGroup);

        // Set vertex buffer
        pass.setVertexBuffer(0, vertexBuffer);

        // Draw
        if (indexBuffer && indexCount) {
            pass.setIndexBuffer(indexBuffer, 'uint16');
            pass.drawIndexed(indexCount);
            this._stats.triangles += indexCount / 3;
        } else {
            pass.draw(vertexCount);
            this._stats.triangles += vertexCount / 3;
        }

        this._stats.drawCalls += 1;

        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this._stats.frames += 1;
    }

    /**
     * Begin a new render pass (for manual control)
     * @param {object} [options]
     * @returns {{encoder: GPUCommandEncoder, pass: GPURenderPassEncoder}}
     */
    beginRenderPass(options = {}) {
        const clearColor = options.clearColor || [0, 0, 0, 1];
        const encoder = this.device.createCommandEncoder();

        const colorView = this.context.getCurrentTexture().createView();
        const depthAttachment = this.depthEnabled && this._depthTexture
            ? {
                view: this._depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: options.loadDepth ? 'load' : 'clear',
                depthStoreOp: 'store'
            }
            : undefined;

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: colorView,
                clearValue: { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] },
                loadOp: options.loadColor ? 'load' : 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: depthAttachment
        });

        return { encoder, pass };
    }

    /**
     * End a render pass and submit
     * @param {GPUCommandEncoder} encoder
     * @param {GPURenderPassEncoder} pass
     */
    endRenderPass(encoder, pass) {
        pass.end();
        this.device.queue.submit([encoder.finish()]);
        this._stats.frames += 1;
    }

    /**
     * Return backend statistics.
     */
    getStats() {
        return {
            ...this._stats,
            resources: this._resources.getStats()
        };
    }

    /**
     * Reset per-frame statistics
     */
    resetFrameStats() {
        this._stats.drawCalls = 0;
        this._stats.triangles = 0;
        this._stats.pipelineChanges = 0;
    }

    /**
     * Dispose of GPU resources.
     */
    dispose() {
        this._destroyDepthTexture();

        // Destroy buffers
        if (this._uniformBuffer) {
            this._uniformBuffer.destroy();
            this._uniformBuffer = null;
        }

        // Clear pipelines and shaders
        this._pipelines.clear();
        this._shaderModules.clear();

        this._resources.disposeAll();
    }

    _destroyDepthTexture() {
        if (this._depthTexture) {
            this._resources.release('texture', this._depthTexture);
            this._depthTexture.destroy();
            this._depthTexture = null;
        }
    }
}

/**
 * Check if WebGPU is available
 * @returns {boolean}
 */
export function isWebGPUSupported() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * Get available WebGPU features
 * @returns {Promise<Set<string>|null>}
 */
export async function getWebGPUFeatures() {
    if (!isWebGPUSupported()) return null;

    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return null;

        return new Set(adapter.features);
    } catch {
        return null;
    }
}

/**
 * Create a WebGPU backend (async).
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @param {string} [options.powerPreference] - 'high-performance' or 'low-power'
 * @param {string[]} [options.requiredFeatures] - Features to request
 * @param {boolean} [options.debug] - Enable debug mode
 * @param {boolean} [options.depth] - Enable depth buffer
 * @returns {Promise<WebGPUBackend|null>}
 */
export async function createWebGPUBackend(canvas, options = {}) {
    if (!canvas || !isWebGPUSupported()) {
        if (options.debug) {
            console.warn('WebGPU not supported');
        }
        return null;
    }

    const context = canvas.getContext('webgpu');
    if (!context) {
        if (options.debug) {
            console.warn('Could not get WebGPU context');
        }
        return null;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: options.powerPreference || 'high-performance'
        });

        if (!adapter) {
            if (options.debug) {
                console.warn('Could not get WebGPU adapter');
            }
            return null;
        }

        // Determine which features to request
        const availableFeatures = new Set(adapter.features);
        const requestedFeatures = [];

        // Check required features
        const requiredFeatures = options.requiredFeatures || [];
        for (const feature of requiredFeatures) {
            if (availableFeatures.has(feature)) {
                requestedFeatures.push(feature);
            } else if (options.debug) {
                console.warn(`WebGPU feature not available: ${feature}`);
            }
        }

        // Optionally request useful features if available
        const optionalFeatures = [
            WebGPUFeatures.TIMESTAMP_QUERY,
            WebGPUFeatures.INDIRECT_FIRST_INSTANCE
        ];

        for (const feature of optionalFeatures) {
            if (availableFeatures.has(feature) && !requestedFeatures.includes(feature)) {
                requestedFeatures.push(feature);
            }
        }

        // Request device with features
        const device = await adapter.requestDevice({
            requiredFeatures: requestedFeatures.length > 0 ? requestedFeatures : undefined
        });

        // Set up error handler
        device.lost.then((info) => {
            console.error('WebGPU device lost:', info.reason, info.message);
        });

        if (options.debug) {
            device.onuncapturederror = (event) => {
                console.error('WebGPU error:', event.error.message);
            };
        }

        const format = navigator.gpu.getPreferredCanvasFormat();

        if (options.debug) {
            console.log('WebGPU initialized:', {
                vendor: adapter.info?.vendor,
                architecture: adapter.info?.architecture,
                format,
                features: requestedFeatures
            });
        }

        return new WebGPUBackend(
            { canvas, device, context, format, adapter },
            { ...options, features: requestedFeatures }
        );
    } catch (error) {
        if (options.debug) {
            console.error('WebGPU initialization failed:', error);
        }
        return null;
    }
}

/**
 * Create WebGPU backend with fallback to WebGL
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @returns {Promise<{backend: WebGPUBackend|null, type: 'webgpu'|'webgl'|null}>}
 */
export async function createWebGPUWithFallback(canvas, options = {}) {
    // Try WebGPU first
    const webgpuBackend = await createWebGPUBackend(canvas, options);
    if (webgpuBackend) {
        return { backend: webgpuBackend, type: 'webgpu' };
    }

    // WebGPU not available, caller should fall back to WebGL
    return { backend: null, type: null };
}

export default WebGPUBackend;
