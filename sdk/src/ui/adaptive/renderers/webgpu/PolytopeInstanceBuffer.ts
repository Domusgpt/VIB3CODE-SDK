import { createStd430Layout, createFloat32ArrayForLayout, writeField, readField, type BufferLayout } from './BufferLayout.ts';
import type { GPUBufferLike, GPUDeviceLike, GPUQueueLike } from './TripleBufferedUniform.ts';

const GPU_BUFFER_USAGE_STORAGE = 0x20;
const GPU_BUFFER_USAGE_COPY_DST = 0x8;

export interface PolytopeInstance {
  readonly modelMatrix: ArrayLike<number>;
  readonly rotor: ArrayLike<number>;
  readonly color: ArrayLike<number>;
  readonly misc?: {
    readonly scale?: number;
    readonly audioEnergy?: number;
    readonly glitch?: number;
    readonly id?: number;
  };
}

export interface PolytopeInstanceBufferOptions {
  readonly device: GPUDeviceLike;
  readonly maxInstances: number;
  readonly label?: string;
  readonly usage?: number;
}

export interface InstanceWriteOptions {
  readonly index: number;
}

export class PolytopeInstanceBuffer {
  readonly device: GPUDeviceLike;
  readonly layout: BufferLayout;
  readonly maxInstances: number;
  readonly label: string;
  readonly buffer: GPUBufferLike;
  readonly data: Float32Array;

  private instanceCount = 0;

  constructor(options: PolytopeInstanceBufferOptions) {
    if (!options?.device) {
      throw new Error('PolytopeInstanceBuffer requires a WebGPU-compatible device.');
    }
    if (!Number.isFinite(options.maxInstances) || options.maxInstances <= 0) {
      throw new Error('PolytopeInstanceBuffer maxInstances must be a positive integer.');
    }

    this.device = options.device;
    this.maxInstances = Math.floor(options.maxInstances);
    this.label = options.label ?? 'PolytopeInstanceBuffer';

    this.layout = createStd430Layout([
      { name: 'modelMatrices', type: 'mat4x4', count: this.maxInstances },
      { name: 'rotors', type: 'vec4', count: this.maxInstances },
      { name: 'colors', type: 'vec4', count: this.maxInstances },
      { name: 'misc', type: 'vec4', count: this.maxInstances },
    ]);

    this.data = createFloat32ArrayForLayout(this.layout);

    const usage = options.usage ?? (GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST);
    this.buffer = this.device.createBuffer({
      size: this.layout.byteSize,
      usage,
      label: `${this.label}-storage`,
    });
  }

  get count(): number {
    return this.instanceCount;
  }

  reset(): void {
    this.instanceCount = 0;
    this.data.fill(0);
  }

  writeInstance(instance: PolytopeInstance, options: InstanceWriteOptions): void {
    const index = Math.floor(options.index);
    if (index < 0 || index >= this.maxInstances) {
      throw new Error(`Instance index ${index} is out of bounds for maxInstances=${this.maxInstances}.`);
    }

    writeField(this.layout, this.data, 'modelMatrices', ensureLength(instance.modelMatrix, 16), {
      elementIndex: index,
      elementCount: 1,
    });

    const rotor = ensureLength(instance.rotor, 4);
    writeField(this.layout, this.data, 'rotors', rotor, { elementIndex: index, elementCount: 1 });

    const color = ensureLength(instance.color, 4);
    writeField(this.layout, this.data, 'colors', color, { elementIndex: index, elementCount: 1 });

    const misc = buildMisc(instance.misc);
    writeField(this.layout, this.data, 'misc', misc, { elementIndex: index, elementCount: 1 });

    this.instanceCount = Math.max(this.instanceCount, index + 1);
  }

  readInstance(index: number): { modelMatrix: Float32Array; rotor: Float32Array; color: Float32Array; misc: Float32Array } {
    if (index < 0 || index >= this.maxInstances) {
      throw new Error(`Instance index ${index} is out of bounds for maxInstances=${this.maxInstances}.`);
    }
    return {
      modelMatrix: readField(this.layout, this.data, 'modelMatrices', { elementIndex: index }),
      rotor: readField(this.layout, this.data, 'rotors', { elementIndex: index }),
      color: readField(this.layout, this.data, 'colors', { elementIndex: index }),
      misc: readField(this.layout, this.data, 'misc', { elementIndex: index }),
    };
  }

  upload(queue: GPUQueueLike = this.device.queue): void {
    if (!queue || typeof queue.writeBuffer !== 'function') {
      throw new Error('PolytopeInstanceBuffer.upload requires a valid GPU queue.');
    }
    queue.writeBuffer(this.buffer, 0, this.data);
  }

  bindGroupEntry(binding = 0): { binding: number; resource: { buffer: GPUBufferLike } } {
    return { binding, resource: { buffer: this.buffer } };
  }
}

function ensureLength(values: ArrayLike<number>, expected: number): Float32Array {
  const result = new Float32Array(expected);
  const length = Math.min(values.length, expected);
  for (let i = 0; i < length; i += 1) {
    result[i] = Number(values[i]) || 0;
  }
  return result;
}

function buildMisc(misc: PolytopeInstance['misc']): Float32Array {
  const result = new Float32Array(4);
  if (!misc) {
    return result;
  }
  result[0] = Number(misc.scale) || 0;
  result[1] = Number(misc.audioEnergy) || 0;
  result[2] = Number(misc.glitch) || 0;
  result[3] = Number(misc.id) || 0;
  return result;
}
