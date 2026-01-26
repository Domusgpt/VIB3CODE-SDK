export type LayoutMode = 'std140' | 'std430';

export type LayoutFieldType = 'f32' | 'vec2' | 'vec3' | 'vec4' | 'mat4x4';

export interface LayoutFieldDefinition {
  readonly name: string;
  readonly type: LayoutFieldType;
  /** Number of elements for arrays. Defaults to 1. */
  readonly count?: number;
}

export interface LayoutField {
  readonly name: string;
  readonly type: LayoutFieldType;
  readonly count: number;
  /** Byte offset from the start of the struct. */
  readonly offset: number;
  /** Total byte span occupied by the field including padding. */
  readonly size: number;
  /** Byte distance between array elements (equals size when count === 1). */
  readonly stride: number;
  /** Number of numeric components per element (e.g. vec3 → 3). */
  readonly componentCount: number;
}

export interface BufferLayout {
  readonly mode: LayoutMode;
  readonly byteSize: number;
  readonly fields: Readonly<Record<string, LayoutField>>;
}

export interface WriteFieldOptions {
  /** Index of the array element to write (defaults to 0). */
  readonly elementIndex?: number;
  /** Number of array elements that will be written from the provided values. */
  readonly elementCount?: number;
}

const COMPONENT_COUNT: Record<LayoutFieldType, number> = {
  f32: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat4x4: 16,
};

const NATURAL_SIZE: Record<LayoutFieldType, number> = {
  f32: 4,
  vec2: 8,
  vec3: 12,
  vec4: 16,
  mat4x4: 64,
};

const BASE_ALIGNMENT: Record<LayoutFieldType, number> = {
  f32: 4,
  vec2: 8,
  vec3: 16,
  vec4: 16,
  mat4x4: 16,
};

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function resolveCount(def: LayoutFieldDefinition): number {
  const count = Math.floor(def.count ?? 1);
  if (count <= 0) {
    throw new Error(`Field "${def.name}" requires a positive element count.`);
  }
  return count;
}

function computeArrayAlignment(mode: LayoutMode, baseAlignment: number): number {
  if (mode === 'std140') {
    return Math.max(baseAlignment, 16);
  }
  return baseAlignment;
}

function computeStride(mode: LayoutMode, type: LayoutFieldType, arrayAlignment: number): number {
  const natural = NATURAL_SIZE[type];
  if (mode === 'std140') {
    return align(natural, arrayAlignment);
  }
  return align(natural, arrayAlignment);
}

function computeElementSize(type: LayoutFieldType): number {
  const baseAlignment = BASE_ALIGNMENT[type];
  return align(NATURAL_SIZE[type], baseAlignment);
}

function createLayout(mode: LayoutMode, definitions: readonly LayoutFieldDefinition[]): BufferLayout {
  let size = 0;
  const fields: Record<string, LayoutField> = {};

  for (const def of definitions) {
    if (!def?.name) {
      throw new Error('Layout fields require a name.');
    }
    if (!COMPONENT_COUNT[def.type]) {
      throw new Error(`Unsupported field type "${String(def.type)}" for ${def.name}.`);
    }

    const baseAlignment = BASE_ALIGNMENT[def.type];
    const count = resolveCount(def);
    const componentCount = COMPONENT_COUNT[def.type];

    if (count > 1) {
      const arrayAlignment = computeArrayAlignment(mode, baseAlignment);
      size = align(size, arrayAlignment);
      const stride = computeStride(mode, def.type, arrayAlignment);
      const fieldSize = stride * count;
      fields[def.name] = {
        name: def.name,
        type: def.type,
        count,
        offset: size,
        size: fieldSize,
        stride,
        componentCount,
      };
      size += fieldSize;
    } else {
      size = align(size, baseAlignment);
      const elementSize = computeElementSize(def.type);
      fields[def.name] = {
        name: def.name,
        type: def.type,
        count,
        offset: size,
        size: elementSize,
        stride: elementSize,
        componentCount,
      };
      size += elementSize;
    }
  }

  const byteSize = align(size, 16);
  return Object.freeze({
    mode,
    byteSize,
    fields: Object.freeze(fields),
  });
}

export function createStd140Layout(definitions: readonly LayoutFieldDefinition[]): BufferLayout {
  return createLayout('std140', definitions);
}

export function createStd430Layout(definitions: readonly LayoutFieldDefinition[]): BufferLayout {
  return createLayout('std430', definitions);
}

export function createFloat32ArrayForLayout(layout: BufferLayout): Float32Array {
  return new Float32Array(layout.byteSize / Float32Array.BYTES_PER_ELEMENT);
}

function ensureTargetSize(layout: BufferLayout, target: Float32Array): void {
  if (target.length * Float32Array.BYTES_PER_ELEMENT < layout.byteSize) {
    throw new Error('Target buffer is too small for the provided layout.');
  }
}

export function writeField(
  layout: BufferLayout,
  target: Float32Array,
  fieldName: string,
  values: ArrayLike<number>,
  options: WriteFieldOptions = {}
): void {
  ensureTargetSize(layout, target);
  const field = layout.fields[fieldName];
  if (!field) {
    throw new Error(`Unknown field "${fieldName}" in layout.`);
  }

  const elementCount = Math.min(field.count, Math.floor(options.elementCount ?? field.count));
  if (elementCount <= 0) {
    return;
  }
  const elementIndex = Math.min(field.count - 1, Math.max(0, Math.floor(options.elementIndex ?? 0)));
  const components = field.componentCount;
  const strideFloats = field.stride / Float32Array.BYTES_PER_ELEMENT;
  const offsetFloats = field.offset / Float32Array.BYTES_PER_ELEMENT + elementIndex * strideFloats;

  const requiredValues = components * elementCount;
  if (values.length < requiredValues) {
    throw new Error(`Field "${fieldName}" requires at least ${requiredValues} components.`);
  }

  let cursor = 0;
  for (let element = 0; element < elementCount; element += 1) {
    const base = offsetFloats + element * strideFloats;
    for (let i = 0; i < components; i += 1) {
      target[base + i] = values[cursor + i];
    }
    for (let i = components; i < strideFloats; i += 1) {
      target[base + i] = 0;
    }
    cursor += components;
  }

  const remaining = field.count - (elementIndex + elementCount);
  if (remaining > 0) {
    const base = offsetFloats + elementCount * strideFloats;
    const total = remaining * strideFloats;
    for (let i = 0; i < total; i += 1) {
      target[base + i] = 0;
    }
  }
}

export function readField(
  layout: BufferLayout,
  source: Float32Array,
  fieldName: string,
  options: WriteFieldOptions = {}
): Float32Array {
  ensureTargetSize(layout, source);
  const field = layout.fields[fieldName];
  if (!field) {
    throw new Error(`Unknown field "${fieldName}" in layout.`);
  }
  const elementIndex = Math.min(field.count - 1, Math.max(0, Math.floor(options.elementIndex ?? 0)));
  const elementCount = Math.min(field.count - elementIndex, Math.floor(options.elementCount ?? 1));
  const strideFloats = field.stride / Float32Array.BYTES_PER_ELEMENT;
  const offsetFloats = field.offset / Float32Array.BYTES_PER_ELEMENT + elementIndex * strideFloats;
  const result = new Float32Array(field.componentCount * elementCount);
  for (let element = 0; element < elementCount; element += 1) {
    const base = offsetFloats + element * strideFloats;
    for (let i = 0; i < field.componentCount; i += 1) {
      result[element * field.componentCount + i] = source[base + i];
    }
  }
  return result;
}

export const GlassUniformLayout = createStd140Layout([
  { name: 'leftViewProj', type: 'mat4x4' },
  { name: 'rightViewProj', type: 'mat4x4' },
  { name: 'headMatrix', type: 'mat4x4' },
  { name: 'rotor4d', type: 'vec4' },
  { name: 'euler', type: 'vec4' },
  { name: 'metrics', type: 'vec4' },
  { name: 'audio', type: 'vec4' },
  { name: 'localization', type: 'vec4' },
  { name: 'visual', type: 'vec4' },
]);
