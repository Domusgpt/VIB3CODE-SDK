/**
 * Triple-buffered uniform buffer for WebGPU
 * Provides smooth animation by maintaining 3 buffers for CPU write, GPU read, and swap
 */

// Type definitions for WebGPU-like interfaces (compatible with actual WebGPU or mocks)
export interface GPUBufferLike {
    readonly size: number;
    readonly usage: number;
    readonly label?: string;
    mapAsync?: (mode: number) => Promise<void>;
    getMappedRange?: () => ArrayBuffer;
    unmap?: () => void;
    destroy?: () => void;
}

export interface GPUDeviceLike {
    readonly queue: GPUQueueLike;
    createBuffer(descriptor: {
        size: number;
        usage: number;
        label?: string;
        mappedAtCreation?: boolean;
    }): GPUBufferLike;
    createBindGroup?(descriptor: unknown): unknown;
    createBindGroupLayout?(descriptor: unknown): unknown;
}

export interface GPUQueueLike {
    writeBuffer(buffer: GPUBufferLike, offset: number, data: ArrayBufferView | ArrayBuffer): void;
    submit?(commandBuffers: unknown[]): void;
}

export interface TripleBufferedUniformOptions {
    readonly device: GPUDeviceLike;
    readonly byteSize: number;
    readonly label?: string;
}

const GPU_BUFFER_USAGE_UNIFORM = 0x40;
const GPU_BUFFER_USAGE_COPY_DST = 0x8;

/**
 * Triple-buffered uniform buffer for smooth animations
 * - Buffer 0: Currently being written by CPU
 * - Buffer 1: Staged for next GPU read
 * - Buffer 2: Currently being read by GPU
 */
export class TripleBufferedUniform {
    readonly device: GPUDeviceLike;
    readonly byteSize: number;
    readonly label: string;
    readonly buffers: [GPUBufferLike, GPUBufferLike, GPUBufferLike];
    readonly data: Float32Array;

    private writeIndex = 0;
    private readIndex = 2;

    constructor(options: TripleBufferedUniformOptions) {
        if (!options?.device) {
            throw new Error('TripleBufferedUniform requires a WebGPU-compatible device.');
        }
        if (!Number.isFinite(options.byteSize) || options.byteSize <= 0) {
            throw new Error('TripleBufferedUniform byteSize must be a positive number.');
        }

        this.device = options.device;
        // Align to 256 bytes (WebGPU requirement for uniform buffers)
        this.byteSize = Math.ceil(options.byteSize / 256) * 256;
        this.label = options.label ?? 'TripleBufferedUniform';

        // Create CPU-side data buffer
        this.data = new Float32Array(this.byteSize / Float32Array.BYTES_PER_ELEMENT);

        // Create three GPU buffers
        this.buffers = [
            this.createBuffer(0),
            this.createBuffer(1),
            this.createBuffer(2)
        ];
    }

    private createBuffer(index: number): GPUBufferLike {
        return this.device.createBuffer({
            size: this.byteSize,
            usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
            label: `${this.label}-${index}`
        });
    }

    /**
     * Get the buffer currently available for GPU reading
     */
    get currentBuffer(): GPUBufferLike {
        return this.buffers[this.readIndex];
    }

    /**
     * Write data to the current write buffer and rotate
     * @param queue - GPU queue for buffer upload
     */
    upload(queue: GPUQueueLike = this.device.queue): void {
        if (!queue || typeof queue.writeBuffer !== 'function') {
            throw new Error('TripleBufferedUniform.upload requires a valid GPU queue.');
        }

        // Write to current write buffer
        queue.writeBuffer(this.buffers[this.writeIndex], 0, this.data);

        // Rotate indices
        const oldWrite = this.writeIndex;
        this.writeIndex = (this.writeIndex + 1) % 3;
        this.readIndex = oldWrite;
    }

    /**
     * Write a float value at the specified offset
     */
    writeFloat(offset: number, value: number): void {
        const index = Math.floor(offset / Float32Array.BYTES_PER_ELEMENT);
        if (index >= 0 && index < this.data.length) {
            this.data[index] = value;
        }
    }

    /**
     * Write a vec4 at the specified offset
     */
    writeVec4(offset: number, values: ArrayLike<number>): void {
        const startIndex = Math.floor(offset / Float32Array.BYTES_PER_ELEMENT);
        for (let i = 0; i < 4 && i < values.length; i++) {
            if (startIndex + i < this.data.length) {
                this.data[startIndex + i] = values[i];
            }
        }
    }

    /**
     * Write a mat4x4 at the specified offset
     */
    writeMat4(offset: number, values: ArrayLike<number>): void {
        const startIndex = Math.floor(offset / Float32Array.BYTES_PER_ELEMENT);
        for (let i = 0; i < 16 && i < values.length; i++) {
            if (startIndex + i < this.data.length) {
                this.data[startIndex + i] = values[i];
            }
        }
    }

    /**
     * Create a bind group entry for this buffer
     */
    bindGroupEntry(binding = 0): { binding: number; resource: { buffer: GPUBufferLike } } {
        return {
            binding,
            resource: { buffer: this.currentBuffer }
        };
    }

    /**
     * Destroy all buffers
     */
    destroy(): void {
        for (const buffer of this.buffers) {
            if (buffer.destroy) {
                buffer.destroy();
            }
        }
    }
}
