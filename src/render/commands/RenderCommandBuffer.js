/**
 * RenderCommandBuffer - Cross-platform serializable render command buffer
 *
 * Records render operations as serializable commands that can be:
 * - Executed immediately on WebGL/WebGPU backends
 * - Serialized to JSON for WASM/Flutter FFI
 * - Batched to reduce FFI overhead on cross-platform targets
 *
 * Command Types:
 * - CLEAR: Clear color/depth buffers
 * - SET_VIEWPORT: Set viewport dimensions
 * - SET_PIPELINE: Set shader pipeline
 * - SET_UNIFORMS: Update uniform values
 * - BIND_VERTEX_BUFFER: Bind vertex data
 * - BIND_INDEX_BUFFER: Bind index data
 * - DRAW: Draw primitives
 * - DRAW_INDEXED: Draw indexed primitives
 * - DRAW_INSTANCED: Draw instanced primitives
 * - SET_BLEND_MODE: Set blend state
 * - SET_DEPTH_STATE: Set depth test state
 * - PUSH_STATE: Push render state to stack
 * - POP_STATE: Restore render state from stack
 */

/**
 * Command type constants
 */
export const CommandType = {
    CLEAR: 0x01,
    SET_VIEWPORT: 0x02,
    SET_PIPELINE: 0x03,
    SET_UNIFORMS: 0x04,
    BIND_VERTEX_BUFFER: 0x05,
    BIND_INDEX_BUFFER: 0x06,
    DRAW: 0x07,
    DRAW_INDEXED: 0x08,
    DRAW_INSTANCED: 0x09,
    SET_BLEND_MODE: 0x0A,
    SET_DEPTH_STATE: 0x0B,
    PUSH_STATE: 0x0C,
    POP_STATE: 0x0D,
    SET_SCISSOR: 0x0E,
    SET_STENCIL: 0x0F,
    BIND_TEXTURE: 0x10,
    SET_ROTOR: 0x11,
    SET_PROJECTION: 0x12
};

/**
 * Blend mode presets
 */
export const BlendMode = {
    NONE: 0,
    ALPHA: 1,
    ADDITIVE: 2,
    MULTIPLY: 3,
    SCREEN: 4,
    PREMULTIPLIED: 5
};

/**
 * Depth compare functions
 */
export const DepthFunc = {
    NEVER: 0,
    LESS: 1,
    EQUAL: 2,
    LEQUAL: 3,
    GREATER: 4,
    NOTEQUAL: 5,
    GEQUAL: 6,
    ALWAYS: 7
};

/**
 * Primitive topology
 */
export const Topology = {
    POINT_LIST: 0,
    LINE_LIST: 1,
    LINE_STRIP: 2,
    TRIANGLE_LIST: 3,
    TRIANGLE_STRIP: 4,
    TRIANGLE_FAN: 5
};

/**
 * Render command structure
 */
class RenderCommand {
    /**
     * @param {number} type - CommandType value
     * @param {object} data - Command-specific data
     */
    constructor(type, data = {}) {
        this.type = type;
        this.data = data;
        this.timestamp = performance.now();
    }

    /**
     * Serialize command to plain object
     * @returns {object}
     */
    toJSON() {
        return {
            type: this.type,
            data: this.data,
            timestamp: this.timestamp
        };
    }

    /**
     * Create command from plain object
     * @param {object} obj
     * @returns {RenderCommand}
     */
    static fromJSON(obj) {
        const cmd = new RenderCommand(obj.type, obj.data);
        cmd.timestamp = obj.timestamp;
        return cmd;
    }
}

/**
 * Cross-platform render command buffer
 */
export class RenderCommandBuffer {
    /**
     * @param {object} [options]
     * @param {number} [options.initialCapacity] - Pre-allocate command array
     * @param {boolean} [options.trackStats] - Enable statistics tracking
     */
    constructor(options = {}) {
        this._commands = [];
        this._capacity = options.initialCapacity || 256;
        this._trackStats = options.trackStats !== false;

        /** @type {Map<number, number>} */
        this._resourceIds = new Map();
        this._nextResourceId = 1;

        this._stats = {
            commands: 0,
            drawCalls: 0,
            triangles: 0,
            stateChanges: 0,
            uniformUpdates: 0
        };

        this._sealed = false;
        this._version = 1;
    }

    /**
     * Check if buffer is sealed (no more recording)
     * @returns {boolean}
     */
    get sealed() {
        return this._sealed;
    }

    /**
     * Get command count
     * @returns {number}
     */
    get length() {
        return this._commands.length;
    }

    /**
     * Get buffer version (increments on changes)
     * @returns {number}
     */
    get version() {
        return this._version;
    }

    /**
     * Clear the command buffer for reuse
     */
    reset() {
        this._commands.length = 0;
        this._sealed = false;
        this._version++;
        this._stats.commands = 0;
        this._stats.drawCalls = 0;
        this._stats.triangles = 0;
        this._stats.stateChanges = 0;
        this._stats.uniformUpdates = 0;
    }

    /**
     * Seal the buffer (mark as complete, no more recording)
     */
    seal() {
        this._sealed = true;
    }

    /**
     * Record a command
     * @private
     */
    _record(type, data) {
        if (this._sealed) {
            throw new Error('Cannot record to sealed command buffer');
        }
        this._commands.push(new RenderCommand(type, data));
        this._stats.commands++;
        this._version++;
    }

    // ========== Recording API ==========

    /**
     * Record clear command
     * @param {object} options
     * @param {number[]} [options.color] - RGBA clear color [0-1]
     * @param {number} [options.depth] - Depth clear value
     * @param {number} [options.stencil] - Stencil clear value
     * @param {boolean} [options.clearColor] - Clear color buffer
     * @param {boolean} [options.clearDepth] - Clear depth buffer
     * @param {boolean} [options.clearStencil] - Clear stencil buffer
     */
    clear(options = {}) {
        this._record(CommandType.CLEAR, {
            color: options.color || [0, 0, 0, 1],
            depth: options.depth ?? 1.0,
            stencil: options.stencil ?? 0,
            clearColor: options.clearColor !== false,
            clearDepth: options.clearDepth !== false,
            clearStencil: options.clearStencil || false
        });
    }

    /**
     * Record viewport command
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    setViewport(x, y, width, height) {
        this._record(CommandType.SET_VIEWPORT, { x, y, width, height });
        this._stats.stateChanges++;
    }

    /**
     * Record scissor command
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    setScissor(x, y, width, height) {
        this._record(CommandType.SET_SCISSOR, { x, y, width, height });
        this._stats.stateChanges++;
    }

    /**
     * Record pipeline bind command
     * @param {string} pipelineId - Pipeline identifier
     */
    setPipeline(pipelineId) {
        this._record(CommandType.SET_PIPELINE, { pipelineId });
        this._stats.stateChanges++;
    }

    /**
     * Record uniform update command
     * @param {object} uniforms - Uniform name/value pairs
     */
    setUniforms(uniforms) {
        this._record(CommandType.SET_UNIFORMS, { values: { ...uniforms } });
        this._stats.uniformUpdates++;
    }

    /**
     * Record 4D rotor uniform
     * @param {number[]} rotor - 8-component rotor [s, xy, xz, yz, xw, yw, zw, xyzw]
     */
    setRotor(rotor) {
        this._record(CommandType.SET_ROTOR, { rotor: Array.from(rotor) });
        this._stats.uniformUpdates++;
    }

    /**
     * Record projection parameters
     * @param {object} projection
     * @param {string} projection.type - 'perspective' or 'stereographic'
     * @param {number} projection.dimension - 4D projection distance
     * @param {number} [projection.fov] - Field of view
     * @param {number} [projection.near] - Near plane
     * @param {number} [projection.far] - Far plane
     */
    setProjection(projection) {
        this._record(CommandType.SET_PROJECTION, { ...projection });
        this._stats.uniformUpdates++;
    }

    /**
     * Record vertex buffer bind command
     * @param {number} slot - Vertex buffer slot
     * @param {number|string} bufferId - Buffer identifier
     * @param {number} [offset] - Byte offset
     */
    bindVertexBuffer(slot, bufferId, offset = 0) {
        this._record(CommandType.BIND_VERTEX_BUFFER, { slot, bufferId, offset });
        this._stats.stateChanges++;
    }

    /**
     * Record index buffer bind command
     * @param {number|string} bufferId - Buffer identifier
     * @param {string} format - 'uint16' or 'uint32'
     * @param {number} [offset] - Byte offset
     */
    bindIndexBuffer(bufferId, format = 'uint16', offset = 0) {
        this._record(CommandType.BIND_INDEX_BUFFER, { bufferId, format, offset });
        this._stats.stateChanges++;
    }

    /**
     * Record texture bind command
     * @param {number} slot - Texture slot
     * @param {number|string} textureId - Texture identifier
     * @param {number|string} [samplerId] - Sampler identifier
     */
    bindTexture(slot, textureId, samplerId = null) {
        this._record(CommandType.BIND_TEXTURE, { slot, textureId, samplerId });
        this._stats.stateChanges++;
    }

    /**
     * Record blend mode command
     * @param {number} mode - BlendMode value
     */
    setBlendMode(mode) {
        this._record(CommandType.SET_BLEND_MODE, { mode });
        this._stats.stateChanges++;
    }

    /**
     * Record depth state command
     * @param {object} options
     * @param {boolean} options.enabled - Enable depth test
     * @param {boolean} options.write - Enable depth write
     * @param {number} options.func - DepthFunc value
     */
    setDepthState(options) {
        this._record(CommandType.SET_DEPTH_STATE, {
            enabled: options.enabled !== false,
            write: options.write !== false,
            func: options.func ?? DepthFunc.LESS
        });
        this._stats.stateChanges++;
    }

    /**
     * Record draw command
     * @param {number} vertexCount - Number of vertices
     * @param {number} [firstVertex] - First vertex index
     * @param {number} [topology] - Topology value (default: TRIANGLE_LIST)
     */
    draw(vertexCount, firstVertex = 0, topology = Topology.TRIANGLE_LIST) {
        this._record(CommandType.DRAW, { vertexCount, firstVertex, topology });
        this._stats.drawCalls++;
        if (topology === Topology.TRIANGLE_LIST) {
            this._stats.triangles += vertexCount / 3;
        }
    }

    /**
     * Record indexed draw command
     * @param {number} indexCount - Number of indices
     * @param {number} [firstIndex] - First index
     * @param {number} [baseVertex] - Base vertex offset
     * @param {number} [topology] - Topology value
     */
    drawIndexed(indexCount, firstIndex = 0, baseVertex = 0, topology = Topology.TRIANGLE_LIST) {
        this._record(CommandType.DRAW_INDEXED, {
            indexCount, firstIndex, baseVertex, topology
        });
        this._stats.drawCalls++;
        if (topology === Topology.TRIANGLE_LIST) {
            this._stats.triangles += indexCount / 3;
        }
    }

    /**
     * Record instanced draw command
     * @param {number} vertexCount - Vertices per instance
     * @param {number} instanceCount - Number of instances
     * @param {number} [firstVertex] - First vertex
     * @param {number} [firstInstance] - First instance
     * @param {number} [topology] - Topology value
     */
    drawInstanced(vertexCount, instanceCount, firstVertex = 0, firstInstance = 0, topology = Topology.TRIANGLE_LIST) {
        this._record(CommandType.DRAW_INSTANCED, {
            vertexCount, instanceCount, firstVertex, firstInstance, topology
        });
        this._stats.drawCalls++;
        if (topology === Topology.TRIANGLE_LIST) {
            this._stats.triangles += (vertexCount / 3) * instanceCount;
        }
    }

    /**
     * Push render state to stack
     */
    pushState() {
        this._record(CommandType.PUSH_STATE, {});
    }

    /**
     * Pop render state from stack
     */
    popState() {
        this._record(CommandType.POP_STATE, {});
    }

    // ========== Utility API ==========

    /**
     * Get recorded commands
     * @returns {RenderCommand[]}
     */
    getCommands() {
        return this._commands.slice();
    }

    /**
     * Get command at index
     * @param {number} index
     * @returns {RenderCommand|undefined}
     */
    getCommand(index) {
        return this._commands[index];
    }

    /**
     * Iterate over commands
     * @param {function(RenderCommand, number): void} callback
     */
    forEach(callback) {
        this._commands.forEach(callback);
    }

    /**
     * Get statistics
     * @returns {object}
     */
    getStats() {
        return { ...this._stats };
    }

    // ========== Serialization API ==========

    /**
     * Serialize to JSON-compatible object
     * @returns {object}
     */
    toJSON() {
        return {
            version: this._version,
            sealed: this._sealed,
            commands: this._commands.map(cmd => cmd.toJSON()),
            stats: this._stats
        };
    }

    /**
     * Serialize to JSON string
     * @returns {string}
     */
    serialize() {
        return JSON.stringify(this.toJSON());
    }

    /**
     * Serialize to binary format (for FFI efficiency)
     * @returns {ArrayBuffer}
     */
    toBinary() {
        const json = this.serialize();
        const encoder = new TextEncoder();
        const data = encoder.encode(json);

        // Header: magic (4) + version (4) + length (4) = 12 bytes
        const buffer = new ArrayBuffer(12 + data.length);
        const view = new DataView(buffer);

        // Magic: 'VCB1' (VIB3 Command Buffer v1)
        view.setUint32(0, 0x56434231, false);
        view.setUint32(4, this._version, false);
        view.setUint32(8, data.length, false);

        // Command data
        new Uint8Array(buffer, 12).set(data);

        return buffer;
    }

    /**
     * Create from JSON object
     * @param {object} obj
     * @returns {RenderCommandBuffer}
     */
    static fromJSON(obj) {
        const buffer = new RenderCommandBuffer();
        buffer._version = obj.version || 1;
        buffer._sealed = obj.sealed || false;
        buffer._commands = (obj.commands || []).map(c => RenderCommand.fromJSON(c));
        buffer._stats = obj.stats || buffer._stats;
        return buffer;
    }

    /**
     * Deserialize from JSON string
     * @param {string} json
     * @returns {RenderCommandBuffer}
     */
    static deserialize(json) {
        return RenderCommandBuffer.fromJSON(JSON.parse(json));
    }

    /**
     * Deserialize from binary format
     * @param {ArrayBuffer} buffer
     * @returns {RenderCommandBuffer}
     */
    static fromBinary(buffer) {
        const view = new DataView(buffer);

        // Verify magic
        const magic = view.getUint32(0, false);
        if (magic !== 0x56434231) {
            throw new Error('Invalid command buffer magic');
        }

        // Read header
        const length = view.getUint32(8, false);

        // Decode JSON
        const data = new Uint8Array(buffer, 12, length);
        const decoder = new TextDecoder();
        const json = decoder.decode(data);

        return RenderCommandBuffer.deserialize(json);
    }

    // ========== Builder Pattern API ==========

    /**
     * Create a new command buffer with builder pattern
     * @returns {RenderCommandBufferBuilder}
     */
    static builder() {
        return new RenderCommandBufferBuilder();
    }
}

/**
 * Builder for fluent command buffer construction
 */
class RenderCommandBufferBuilder {
    constructor() {
        this._buffer = new RenderCommandBuffer();
    }

    clear(options) {
        this._buffer.clear(options);
        return this;
    }

    viewport(x, y, w, h) {
        this._buffer.setViewport(x, y, w, h);
        return this;
    }

    pipeline(id) {
        this._buffer.setPipeline(id);
        return this;
    }

    uniforms(u) {
        this._buffer.setUniforms(u);
        return this;
    }

    rotor(r) {
        this._buffer.setRotor(r);
        return this;
    }

    projection(p) {
        this._buffer.setProjection(p);
        return this;
    }

    vertexBuffer(slot, id, offset) {
        this._buffer.bindVertexBuffer(slot, id, offset);
        return this;
    }

    indexBuffer(id, format, offset) {
        this._buffer.bindIndexBuffer(id, format, offset);
        return this;
    }

    texture(slot, id, sampler) {
        this._buffer.bindTexture(slot, id, sampler);
        return this;
    }

    blend(mode) {
        this._buffer.setBlendMode(mode);
        return this;
    }

    depth(opts) {
        this._buffer.setDepthState(opts);
        return this;
    }

    draw(count, first, topo) {
        this._buffer.draw(count, first, topo);
        return this;
    }

    drawIndexed(count, first, base, topo) {
        this._buffer.drawIndexed(count, first, base, topo);
        return this;
    }

    drawInstanced(verts, instances, firstV, firstI, topo) {
        this._buffer.drawInstanced(verts, instances, firstV, firstI, topo);
        return this;
    }

    push() {
        this._buffer.pushState();
        return this;
    }

    pop() {
        this._buffer.popState();
        return this;
    }

    seal() {
        this._buffer.seal();
        return this;
    }

    build() {
        return this._buffer;
    }
}

export default RenderCommandBuffer;
