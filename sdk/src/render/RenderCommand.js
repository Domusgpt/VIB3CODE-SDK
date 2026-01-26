/**
 * RenderCommand - Base class for all render commands
 *
 * Commands are recorded into a CommandBuffer and executed by a backend.
 * This allows for sorting, batching, and deferred execution.
 */

import { RenderState } from './RenderState.js';

let commandIdCounter = 0;

/**
 * Command types enum
 */
export const CommandType = {
    // State commands
    SET_STATE: 'set_state',
    SET_VIEWPORT: 'set_viewport',
    SET_SCISSOR: 'set_scissor',

    // Clear commands
    CLEAR: 'clear',
    CLEAR_COLOR: 'clear_color',
    CLEAR_DEPTH: 'clear_depth',
    CLEAR_STENCIL: 'clear_stencil',

    // Bind commands
    BIND_SHADER: 'bind_shader',
    BIND_TEXTURE: 'bind_texture',
    BIND_BUFFER: 'bind_buffer',
    BIND_VERTEX_ARRAY: 'bind_vertex_array',
    BIND_RENDER_TARGET: 'bind_render_target',

    // Uniform commands
    SET_UNIFORM: 'set_uniform',
    SET_UNIFORM_BLOCK: 'set_uniform_block',

    // Draw commands
    DRAW: 'draw',
    DRAW_INDEXED: 'draw_indexed',
    DRAW_INSTANCED: 'draw_instanced',
    DRAW_INDEXED_INSTANCED: 'draw_indexed_instanced',

    // Compute commands
    DISPATCH: 'dispatch',

    // Transfer commands
    COPY_BUFFER: 'copy_buffer',
    COPY_TEXTURE: 'copy_texture',
    READ_PIXELS: 'read_pixels',

    // Barrier/sync
    MEMORY_BARRIER: 'memory_barrier',

    // Custom
    CUSTOM: 'custom'
};

/**
 * Primitive types for drawing
 */
export const PrimitiveType = {
    POINTS: 'points',
    LINES: 'lines',
    LINE_STRIP: 'line_strip',
    LINE_LOOP: 'line_loop',
    TRIANGLES: 'triangles',
    TRIANGLE_STRIP: 'triangle_strip',
    TRIANGLE_FAN: 'triangle_fan'
};

/**
 * Base render command
 */
export class RenderCommand {
    /**
     * @param {string} type - Command type from CommandType enum
     */
    constructor(type) {
        /** @type {number} Unique command ID */
        this.id = ++commandIdCounter;

        /** @type {string} Command type */
        this.type = type;

        /** @type {number} Sort key for ordering */
        this.sortKey = 0;

        /** @type {number} Priority (higher = earlier) */
        this.priority = 0;

        /** @type {string|null} Debug label */
        this.label = null;
    }

    /**
     * Execute the command (implemented by subclasses)
     * @param {object} backend - Rendering backend
     */
    execute(backend) {
        throw new Error('RenderCommand.execute() must be implemented');
    }

    /**
     * Set debug label
     * @param {string} label
     * @returns {this}
     */
    setLabel(label) {
        this.label = label;
        return this;
    }
}

/**
 * Clear command - clears framebuffer attachments
 */
export class ClearCommand extends RenderCommand {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        super(CommandType.CLEAR);

        /** @type {boolean} */
        this.clearColor = options.color !== false;

        /** @type {boolean} */
        this.clearDepth = options.depth !== false;

        /** @type {boolean} */
        this.clearStencil = options.stencil === true;

        /** @type {number[]} RGBA clear color */
        this.colorValue = options.colorValue || [0, 0, 0, 1];

        /** @type {number} */
        this.depthValue = options.depthValue ?? 1;

        /** @type {number} */
        this.stencilValue = options.stencilValue ?? 0;

        // Clear commands should execute first
        this.priority = 1000;
    }

    execute(backend) {
        backend.clear(this);
    }

    /**
     * Create color-only clear
     * @param {number[]} color
     * @returns {ClearCommand}
     */
    static color(color) {
        return new ClearCommand({
            color: true,
            depth: false,
            stencil: false,
            colorValue: color
        });
    }

    /**
     * Create depth-only clear
     * @param {number} depth
     * @returns {ClearCommand}
     */
    static depth(depth = 1) {
        return new ClearCommand({
            color: false,
            depth: true,
            stencil: false,
            depthValue: depth
        });
    }
}

/**
 * SetState command - changes GPU state
 */
export class SetStateCommand extends RenderCommand {
    /**
     * @param {RenderState} state
     */
    constructor(state) {
        super(CommandType.SET_STATE);

        /** @type {RenderState} */
        this.state = state;

        // State commands should execute early
        this.priority = 900;
    }

    execute(backend) {
        backend.setState(this.state);
    }
}

/**
 * BindShader command - binds a shader program
 */
export class BindShaderCommand extends RenderCommand {
    /**
     * @param {object} shader - Shader program reference
     */
    constructor(shader) {
        super(CommandType.BIND_SHADER);

        /** @type {object} */
        this.shader = shader;

        this.priority = 800;
    }

    execute(backend) {
        backend.bindShader(this.shader);
    }
}

/**
 * BindTexture command - binds a texture to a slot
 */
export class BindTextureCommand extends RenderCommand {
    /**
     * @param {object} texture - Texture reference
     * @param {number} slot - Texture unit slot
     */
    constructor(texture, slot = 0) {
        super(CommandType.BIND_TEXTURE);

        /** @type {object} */
        this.texture = texture;

        /** @type {number} */
        this.slot = slot;

        this.priority = 700;
    }

    execute(backend) {
        backend.bindTexture(this.texture, this.slot);
    }
}

/**
 * BindVertexArray command - binds vertex array object
 */
export class BindVertexArrayCommand extends RenderCommand {
    /**
     * @param {object} vao - Vertex array object reference
     */
    constructor(vao) {
        super(CommandType.BIND_VERTEX_ARRAY);

        /** @type {object} */
        this.vao = vao;

        this.priority = 600;
    }

    execute(backend) {
        backend.bindVertexArray(this.vao);
    }
}

/**
 * BindRenderTarget command - sets render target
 */
export class BindRenderTargetCommand extends RenderCommand {
    /**
     * @param {object|null} target - Render target or null for default framebuffer
     */
    constructor(target) {
        super(CommandType.BIND_RENDER_TARGET);

        /** @type {object|null} */
        this.target = target;

        this.priority = 950;
    }

    execute(backend) {
        backend.bindRenderTarget(this.target);
    }
}

/**
 * SetUniform command - sets shader uniform value
 */
export class SetUniformCommand extends RenderCommand {
    /**
     * @param {string} name - Uniform name
     * @param {any} value - Uniform value
     * @param {string} [type] - Uniform type hint
     */
    constructor(name, value, type = null) {
        super(CommandType.SET_UNIFORM);

        /** @type {string} */
        this.name = name;

        /** @type {any} */
        this.value = value;

        /** @type {string|null} */
        this.uniformType = type;

        this.priority = 500;
    }

    execute(backend) {
        backend.setUniform(this.name, this.value, this.uniformType);
    }
}

/**
 * Draw command - draws primitives
 */
export class DrawCommand extends RenderCommand {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        super(CommandType.DRAW);

        /** @type {string} */
        this.primitive = options.primitive || PrimitiveType.TRIANGLES;

        /** @type {number} */
        this.vertexCount = options.vertexCount || 0;

        /** @type {number} */
        this.firstVertex = options.firstVertex || 0;

        /** @type {number} Sort key based on state/material */
        this.sortKey = options.sortKey || 0;

        /** @type {number} Depth for depth sorting */
        this.depth = options.depth || 0;

        this.priority = 0; // Draw commands execute last
    }

    execute(backend) {
        backend.draw(this);
    }
}

/**
 * DrawIndexed command - draws indexed primitives
 */
export class DrawIndexedCommand extends RenderCommand {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        super(CommandType.DRAW_INDEXED);

        /** @type {string} */
        this.primitive = options.primitive || PrimitiveType.TRIANGLES;

        /** @type {number} */
        this.indexCount = options.indexCount || 0;

        /** @type {number} */
        this.firstIndex = options.firstIndex || 0;

        /** @type {number} */
        this.baseVertex = options.baseVertex || 0;

        /** @type {string} Index type ('uint16' or 'uint32') */
        this.indexType = options.indexType || 'uint16';

        /** @type {number} */
        this.sortKey = options.sortKey || 0;

        /** @type {number} */
        this.depth = options.depth || 0;

        this.priority = 0;
    }

    execute(backend) {
        backend.drawIndexed(this);
    }
}

/**
 * DrawInstanced command - draws instanced primitives
 */
export class DrawInstancedCommand extends RenderCommand {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        super(CommandType.DRAW_INSTANCED);

        /** @type {string} */
        this.primitive = options.primitive || PrimitiveType.TRIANGLES;

        /** @type {number} */
        this.vertexCount = options.vertexCount || 0;

        /** @type {number} */
        this.firstVertex = options.firstVertex || 0;

        /** @type {number} */
        this.instanceCount = options.instanceCount || 1;

        /** @type {number} */
        this.firstInstance = options.firstInstance || 0;

        /** @type {number} */
        this.sortKey = options.sortKey || 0;

        this.priority = 0;
    }

    execute(backend) {
        backend.drawInstanced(this);
    }
}

/**
 * DrawIndexedInstanced command - draws indexed instanced primitives
 */
export class DrawIndexedInstancedCommand extends RenderCommand {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        super(CommandType.DRAW_INDEXED_INSTANCED);

        /** @type {string} */
        this.primitive = options.primitive || PrimitiveType.TRIANGLES;

        /** @type {number} */
        this.indexCount = options.indexCount || 0;

        /** @type {number} */
        this.firstIndex = options.firstIndex || 0;

        /** @type {number} */
        this.baseVertex = options.baseVertex || 0;

        /** @type {number} */
        this.instanceCount = options.instanceCount || 1;

        /** @type {number} */
        this.firstInstance = options.firstInstance || 0;

        /** @type {string} */
        this.indexType = options.indexType || 'uint16';

        /** @type {number} */
        this.sortKey = options.sortKey || 0;

        this.priority = 0;
    }

    execute(backend) {
        backend.drawIndexedInstanced(this);
    }
}

/**
 * SetViewport command - sets viewport dimensions
 */
export class SetViewportCommand extends RenderCommand {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    constructor(x, y, width, height) {
        super(CommandType.SET_VIEWPORT);

        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;

        this.priority = 900;
    }

    execute(backend) {
        backend.setViewport(this.x, this.y, this.width, this.height);
    }
}

/**
 * Custom command - executes arbitrary function
 */
export class CustomCommand extends RenderCommand {
    /**
     * @param {function(object): void} callback
     */
    constructor(callback) {
        super(CommandType.CUSTOM);

        /** @type {function} */
        this.callback = callback;
    }

    execute(backend) {
        this.callback(backend);
    }
}

export default RenderCommand;
