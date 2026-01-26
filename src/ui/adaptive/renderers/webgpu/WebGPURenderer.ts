/**
 * VIB3+ WebGPU Renderer
 * Implements RendererContract for WebGPU-based 4D visualization
 *
 * @fileoverview WebGPU implementation for the VIB3+ SDK
 * Supports 24 geometries with 6D rotation using compute shaders
 */

import { WEBGPU_FEATURE_FLAGS, isWebGPUEnabled } from './index.ts';
import { TripleBufferedUniform, GPUDeviceLike, GPUQueueLike, GPUBufferLike } from './TripleBufferedUniform.ts';
import { PolytopeInstanceBuffer } from './PolytopeInstanceBuffer.ts';
import { GlassUniformLayout, createFloat32ArrayForLayout, writeField } from './BufferLayout.ts';

// WebGPU types (subset for compatibility)
interface GPUCanvasContext {
    configure(config: GPUCanvasConfiguration): void;
    getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
    device: GPUDeviceLike;
    format: string;
    alphaMode?: string;
}

interface GPUTexture {
    createView(): GPUTextureView;
    destroy?(): void;
}

interface GPUTextureView {}

interface GPURenderPassDescriptor {
    colorAttachments: GPURenderPassColorAttachment[];
}

interface GPURenderPassColorAttachment {
    view: GPUTextureView;
    clearValue?: { r: number; g: number; b: number; a: number };
    loadOp: 'clear' | 'load';
    storeOp: 'store' | 'discard';
}

interface GPUAdapter {
    requestDevice(): Promise<GPUDeviceLike>;
}

interface GPUShaderModule {}

interface GPURenderPipeline {}

interface GPUBindGroup {}

interface GPUBindGroupLayout {}

interface GPUCommandEncoder {
    beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
}

interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    draw(vertexCount: number, instanceCount?: number): void;
    end(): void;
}

interface GPUCommandBuffer {}

export interface WebGPURendererOptions {
    canvas: HTMLCanvasElement;
    maxInstances?: number;
    preferredFormat?: string;
}

export interface WebGPUFrameState {
    time?: number;
    params?: {
        geometry?: number;
        rot4dXY?: number;
        rot4dXZ?: number;
        rot4dYZ?: number;
        rot4dXW?: number;
        rot4dYW?: number;
        rot4dZW?: number;
        hue?: number;
        intensity?: number;
        saturation?: number;
        gridDensity?: number;
        morphFactor?: number;
        chaos?: number;
        speed?: number;
    };
    audio?: {
        bass?: number;
        mid?: number;
        high?: number;
        energy?: number;
    };
}

/**
 * WebGPU Renderer implementing RendererContract
 */
export class WebGPURenderer {
    private canvas: HTMLCanvasElement | null = null;
    private device: GPUDeviceLike | null = null;
    private context: GPUCanvasContext | null = null;
    private format: string = 'bgra8unorm';

    private pipeline: GPURenderPipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;
    private uniformBuffer: TripleBufferedUniform | null = null;
    private instanceBuffer: PolytopeInstanceBuffer | null = null;

    private _initialized = false;
    private _active = false;
    private _width = 0;
    private _height = 0;
    private _pixelRatio = 1;

    private time = 0;
    private params: WebGPUFrameState['params'] = {};

    readonly maxInstances: number;

    constructor(options?: { maxInstances?: number }) {
        this.maxInstances = options?.maxInstances ?? 1024;
    }

    /**
     * Check if WebGPU is available and enabled
     */
    static async isAvailable(): Promise<boolean> {
        if (!isWebGPUEnabled()) {
            return false;
        }
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            return false;
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return adapter !== null;
        } catch {
            return false;
        }
    }

    /**
     * Enable WebGPU feature flag
     */
    static enable(): void {
        WEBGPU_FEATURE_FLAGS.enabled = true;
        WEBGPU_FEATURE_FLAGS.reason = 'Enabled by application';
    }

    /**
     * Disable WebGPU feature flag
     */
    static disable(): void {
        WEBGPU_FEATURE_FLAGS.enabled = false;
        WEBGPU_FEATURE_FLAGS.reason = 'Disabled by application';
    }

    // ============================================
    // RendererContract Implementation
    // ============================================

    get initialized(): boolean {
        return this._initialized;
    }

    get isActive(): boolean {
        return this._active;
    }

    /**
     * Initialize the WebGPU renderer
     * @param context - { canvas: HTMLCanvasElement }
     */
    async init(context: { canvas?: HTMLCanvasElement; canvasId?: string }): Promise<boolean> {
        if (!isWebGPUEnabled()) {
            console.warn('WebGPU is not enabled. Call WebGPURenderer.enable() first.');
            return false;
        }

        // Get canvas
        this.canvas = context.canvas ||
            (context.canvasId ? document.getElementById(context.canvasId) as HTMLCanvasElement : null);

        if (!this.canvas) {
            console.error('WebGPURenderer: No canvas provided');
            return false;
        }

        // Check WebGPU availability
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            console.error('WebGPURenderer: WebGPU not supported in this browser');
            return false;
        }

        try {
            // Request adapter and device
            const adapter = await navigator.gpu.requestAdapter() as GPUAdapter | null;
            if (!adapter) {
                console.error('WebGPURenderer: Failed to get GPU adapter');
                return false;
            }

            this.device = await adapter.requestDevice() as unknown as GPUDeviceLike;
            if (!this.device) {
                console.error('WebGPURenderer: Failed to get GPU device');
                return false;
            }

            // Get canvas context
            this.context = this.canvas.getContext('webgpu') as unknown as GPUCanvasContext;
            if (!this.context) {
                console.error('WebGPURenderer: Failed to get WebGPU context');
                return false;
            }

            // Get preferred format
            this.format = navigator.gpu.getPreferredCanvasFormat?.() || 'bgra8unorm';

            // Configure context
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'premultiplied'
            });

            // Create buffers
            await this.createBuffers();

            // Create pipeline
            await this.createPipeline();

            this._initialized = true;
            console.log('✅ WebGPU Renderer initialized');
            return true;

        } catch (error) {
            console.error('WebGPURenderer: Initialization failed', error);
            return false;
        }
    }

    /**
     * Handle canvas resize
     */
    resize(width: number, height: number, pixelRatio = 1): void {
        this._width = width;
        this._height = height;
        this._pixelRatio = pixelRatio;

        if (this.canvas) {
            this.canvas.width = width * pixelRatio;
            this.canvas.height = height * pixelRatio;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }

        console.log(`🎮 WebGPU resized to ${width}x${height} @${pixelRatio}x`);
    }

    /**
     * Render a single frame
     */
    render(frameState: WebGPUFrameState = {}): void {
        if (!this._initialized || !this._active) return;
        if (!this.device || !this.context || !this.pipeline) return;

        // Update time
        if (typeof frameState.time === 'number') {
            this.time = frameState.time;
        } else {
            this.time += 0.016; // ~60fps default
        }

        // Update params
        if (frameState.params) {
            Object.assign(this.params, frameState.params);
        }

        // Update uniform buffer
        this.updateUniforms(frameState);

        // Get current texture
        const textureView = this.context.getCurrentTexture().createView();

        // Create command encoder
        const commandEncoder = (this.device as any).createCommandEncoder() as GPUCommandEncoder;

        // Begin render pass
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        // Draw
        renderPass.setPipeline(this.pipeline);
        if (this.bindGroup) {
            renderPass.setBindGroup(0, this.bindGroup);
        }
        renderPass.draw(6); // Fullscreen quad
        renderPass.end();

        // Submit
        (this.device.queue as any).submit([commandEncoder.finish()]);
    }

    /**
     * Set active state
     */
    setActive(active: boolean): void {
        this._active = active;
        console.log(`🎮 WebGPU Renderer ${active ? 'activated' : 'deactivated'}`);
    }

    /**
     * Clean up all resources
     */
    dispose(): void {
        this._active = false;
        this._initialized = false;

        if (this.uniformBuffer) {
            this.uniformBuffer.destroy();
            this.uniformBuffer = null;
        }

        if (this.instanceBuffer?.buffer && (this.instanceBuffer.buffer as any).destroy) {
            (this.instanceBuffer.buffer as any).destroy();
        }
        this.instanceBuffer = null;

        this.pipeline = null;
        this.bindGroup = null;
        this.device = null;
        this.context = null;
        this.canvas = null;

        console.log('🧹 WebGPU Renderer disposed');
    }

    // ============================================
    // Private Methods
    // ============================================

    private async createBuffers(): Promise<void> {
        if (!this.device) return;

        // Create uniform buffer for frame data
        this.uniformBuffer = new TripleBufferedUniform({
            device: this.device,
            byteSize: GlassUniformLayout.byteSize,
            label: 'VIB3-Uniforms'
        });

        // Create instance buffer for polytope data
        this.instanceBuffer = new PolytopeInstanceBuffer({
            device: this.device,
            maxInstances: this.maxInstances,
            label: 'VIB3-Instances'
        });
    }

    private async createPipeline(): Promise<void> {
        if (!this.device) return;

        // Create shader module
        const shaderCode = this.getShaderCode();
        const shaderModule = (this.device as any).createShaderModule({
            code: shaderCode,
            label: 'VIB3-Shader'
        }) as GPUShaderModule;

        // Create bind group layout
        const bindGroupLayout = (this.device as any).createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: 0x1 | 0x2, // VERTEX | FRAGMENT
                    buffer: { type: 'uniform' }
                }
            ],
            label: 'VIB3-BindGroupLayout'
        }) as GPUBindGroupLayout;

        // Create pipeline layout
        const pipelineLayout = (this.device as any).createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
            label: 'VIB3-PipelineLayout'
        });

        // Create render pipeline
        this.pipeline = (this.device as any).createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vertexMain'
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            label: 'VIB3-Pipeline'
        }) as GPURenderPipeline;

        // Create bind group
        if (this.uniformBuffer) {
            this.bindGroup = (this.device as any).createBindGroup({
                layout: bindGroupLayout,
                entries: [this.uniformBuffer.bindGroupEntry(0)],
                label: 'VIB3-BindGroup'
            }) as GPUBindGroup;
        }
    }

    private updateUniforms(frameState: WebGPUFrameState): void {
        if (!this.uniformBuffer) return;

        const data = this.uniformBuffer.data;

        // Write time and resolution to metrics slot
        const metrics = new Float32Array([
            this.time,
            this._width * this._pixelRatio,
            this._height * this._pixelRatio,
            this._pixelRatio
        ]);
        writeField(GlassUniformLayout, data, 'metrics', metrics);

        // Write rotation to euler slot
        const euler = new Float32Array([
            this.params.rot4dXY ?? 0,
            this.params.rot4dXZ ?? 0,
            this.params.rot4dYZ ?? 0,
            0
        ]);
        writeField(GlassUniformLayout, data, 'euler', euler);

        // Write 4D rotation to rotor4d slot
        const rotor = new Float32Array([
            this.params.rot4dXW ?? 0,
            this.params.rot4dYW ?? 0,
            this.params.rot4dZW ?? 0,
            this.params.geometry ?? 0
        ]);
        writeField(GlassUniformLayout, data, 'rotor4d', rotor);

        // Write visual parameters
        const visual = new Float32Array([
            (this.params.hue ?? 200) / 360,
            this.params.intensity ?? 0.7,
            this.params.saturation ?? 0.8,
            this.params.morphFactor ?? 1.0
        ]);
        writeField(GlassUniformLayout, data, 'visual', visual);

        // Write audio data
        const audio = new Float32Array([
            frameState.audio?.bass ?? 0,
            frameState.audio?.mid ?? 0,
            frameState.audio?.high ?? 0,
            frameState.audio?.energy ?? 0
        ]);
        writeField(GlassUniformLayout, data, 'audio', audio);

        // Upload to GPU
        this.uniformBuffer.upload();
    }

    private getShaderCode(): string {
        return VIB3_WGSL_SHADER;
    }
}

/**
 * WGSL shader for VIB3+ 4D visualization
 */
const VIB3_WGSL_SHADER = `
// VIB3+ 4D Visualization Shader (WGSL)
// Supports 24 geometries with 6D rotation

struct Uniforms {
    leftViewProj: mat4x4<f32>,
    rightViewProj: mat4x4<f32>,
    headMatrix: mat4x4<f32>,
    rotor4d: vec4<f32>,      // XW, YW, ZW rotations + geometry
    euler: vec4<f32>,        // XY, XZ, YZ rotations
    metrics: vec4<f32>,      // time, width, height, pixelRatio
    audio: vec4<f32>,        // bass, mid, high, energy
    localization: vec4<f32>,
    visual: vec4<f32>,       // hue, intensity, saturation, morphFactor
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertices
const VERTICES = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
);

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let pos = VERTICES[vertexIndex];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.uv = pos * 0.5 + 0.5;
    return output;
}

// 4D rotation matrices
fn rotateXY(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(c, -s, 0.0, 0.0),
        vec4<f32>(s, c, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn rotateXZ(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(c, 0.0, -s, 0.0),
        vec4<f32>(0.0, 1.0, 0.0, 0.0),
        vec4<f32>(s, 0.0, c, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn rotateYZ(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, c, -s, 0.0),
        vec4<f32>(0.0, s, c, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
}

fn rotateXW(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(c, 0.0, 0.0, -s),
        vec4<f32>(0.0, 1.0, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(s, 0.0, 0.0, c)
    );
}

fn rotateYW(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, c, 0.0, -s),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(0.0, s, 0.0, c)
    );
}

fn rotateZW(angle: f32) -> mat4x4<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, 1.0, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, c, -s),
        vec4<f32>(0.0, 0.0, s, c)
    );
}

// Apply all 6D rotations
fn apply6DRotation(pos: vec4<f32>, time: f32) -> vec4<f32> {
    var p = pos;
    p = rotateXY(uniforms.euler.x + time * 0.05) * p;
    p = rotateXZ(uniforms.euler.y + time * 0.06) * p;
    p = rotateYZ(uniforms.euler.z + time * 0.04) * p;
    p = rotateXW(uniforms.rotor4d.x + time * 0.07) * p;
    p = rotateYW(uniforms.rotor4d.y + time * 0.08) * p;
    p = rotateZW(uniforms.rotor4d.z + time * 0.09) * p;
    return p;
}

// Base geometry SDFs (0-7)
fn baseGeometry(p: vec4<f32>, geometryType: f32) -> f32 {
    let gType = floor(geometryType);

    if (gType < 0.5) {
        // Tetrahedron
        return max(max(max(abs(p.x + p.y) - p.z, abs(p.x - p.y) - p.z),
                       abs(p.x + p.y) + p.z), abs(p.x - p.y) + p.z) / sqrt(3.0);
    } else if (gType < 1.5) {
        // Hypercube
        let q = abs(p) - vec4<f32>(0.8);
        return length(max(q, vec4<f32>(0.0))) + min(max(max(max(q.x, q.y), q.z), q.w), 0.0);
    } else if (gType < 2.5) {
        // Sphere
        return length(p) - 1.0;
    } else if (gType < 3.5) {
        // Torus
        let t = vec2<f32>(length(p.xy) - 0.8, p.z);
        return length(t) - 0.3;
    } else if (gType < 4.5) {
        // Klein Bottle (simplified)
        let r = length(p.xy);
        return abs(r - 0.7) - 0.2 + sin(atan2(p.y, p.x) * 3.0 + p.z * 5.0) * 0.1;
    } else if (gType < 5.5) {
        // Fractal
        return length(p) - 0.8 + sin(p.x * 5.0) * sin(p.y * 5.0) * sin(p.z * 5.0) * 0.2;
    } else if (gType < 6.5) {
        // Wave
        let time = uniforms.metrics.x;
        return abs(p.z - sin(p.x * 5.0 + time) * cos(p.y * 5.0 + time) * 0.3) - 0.1;
    } else {
        // Crystal
        let q = abs(p);
        return max(max(max(q.x, q.y), q.z), q.w) - 0.8;
    }
}

// Hypersphere core wrapper (8-15)
fn hypersphereCore(p: vec4<f32>, baseType: f32) -> f32 {
    let baseShape = baseGeometry(p, baseType);
    let sphereField = length(p) - 1.2;
    return max(baseShape, sphereField);
}

// Hypertetrahedron core wrapper (16-23)
fn hypertetrahedronCore(p: vec4<f32>, baseType: f32) -> f32 {
    let baseShape = baseGeometry(p, baseType);
    let tetraField = max(max(max(
        abs(p.x + p.y) - p.z - p.w,
        abs(p.x - p.y) - p.z + p.w),
        abs(p.x + p.y) + p.z - p.w),
        abs(p.x - p.y) + p.z + p.w) / sqrt(4.0);
    return max(baseShape, tetraField);
}

// Main geometry dispatcher (0-23)
fn geometry(p: vec4<f32>, geometryIndex: f32) -> f32 {
    if (geometryIndex < 8.0) {
        return baseGeometry(p, geometryIndex);
    } else if (geometryIndex < 16.0) {
        return hypersphereCore(p, geometryIndex - 8.0);
    } else {
        return hypertetrahedronCore(p, geometryIndex - 16.0);
    }
}

// HSV to RGB conversion
fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let time = uniforms.metrics.x;
    let resolution = vec2<f32>(uniforms.metrics.y, uniforms.metrics.z);

    // Normalized coordinates
    let uv = (input.uv * 2.0 - 1.0) * vec2<f32>(resolution.x / resolution.y, 1.0);

    // Grid density from visual params
    let gridDensity = 15.0;

    // Create 4D point
    var pos = vec4<f32>(
        uv / gridDensity,
        sin(time * 0.3) * 0.5,
        cos(time * 0.2) * 0.5
    );

    // Apply 6D rotation
    pos = apply6DRotation(pos, time);

    // Apply morph factor
    let morphFactor = uniforms.visual.w;
    pos = pos * morphFactor;

    // Get geometry index
    let geometryIndex = uniforms.rotor4d.w;

    // Calculate distance
    let dist = geometry(pos, geometryIndex);

    // Faceted rendering
    let edge = smoothstep(0.02, 0.0, abs(dist));
    let fill = smoothstep(0.1, 0.0, dist) * 0.3;

    // Color from visual params
    let hue = uniforms.visual.x + dist * 0.2 + time * 0.05;
    let saturation = uniforms.visual.z;
    let intensity = uniforms.visual.y;

    // Audio reactive intensity boost
    let audioBoost = 1.0 + uniforms.audio.w * 0.3;

    let color = hsv2rgb(vec3<f32>(hue, saturation, intensity * audioBoost));
    let alpha = (edge + fill) * intensity;

    return vec4<f32>(color * alpha, alpha);
}
`;

export default WebGPURenderer;
