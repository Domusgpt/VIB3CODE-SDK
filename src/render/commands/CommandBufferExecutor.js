/**
 * CommandBufferExecutor - Executes RenderCommandBuffer against rendering backends
 *
 * Supports:
 * - WebGL 2.0 backend execution
 * - WebGPU backend execution
 * - Validation mode for debugging
 *
 * The executor translates abstract commands to backend-specific API calls,
 * enabling the same command buffer to run on multiple platforms.
 */

import {
    CommandType,
    BlendMode,
    DepthFunc,
    Topology
} from './RenderCommandBuffer.js';

/**
 * WebGL blend mode mapping
 */
const GL_BLEND_FACTORS = {
    [BlendMode.NONE]: null,
    [BlendMode.ALPHA]: { src: 'SRC_ALPHA', dst: 'ONE_MINUS_SRC_ALPHA' },
    [BlendMode.ADDITIVE]: { src: 'SRC_ALPHA', dst: 'ONE' },
    [BlendMode.MULTIPLY]: { src: 'DST_COLOR', dst: 'ZERO' },
    [BlendMode.SCREEN]: { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' },
    [BlendMode.PREMULTIPLIED]: { src: 'ONE', dst: 'ONE_MINUS_SRC_ALPHA' }
};

/**
 * WebGL depth function mapping
 */
const GL_DEPTH_FUNCS = {
    [DepthFunc.NEVER]: 'NEVER',
    [DepthFunc.LESS]: 'LESS',
    [DepthFunc.EQUAL]: 'EQUAL',
    [DepthFunc.LEQUAL]: 'LEQUAL',
    [DepthFunc.GREATER]: 'GREATER',
    [DepthFunc.NOTEQUAL]: 'NOTEQUAL',
    [DepthFunc.GEQUAL]: 'GEQUAL',
    [DepthFunc.ALWAYS]: 'ALWAYS'
};

/**
 * WebGL primitive topology mapping
 */
const GL_TOPOLOGY = {
    [Topology.POINT_LIST]: 'POINTS',
    [Topology.LINE_LIST]: 'LINES',
    [Topology.LINE_STRIP]: 'LINE_STRIP',
    [Topology.TRIANGLE_LIST]: 'TRIANGLES',
    [Topology.TRIANGLE_STRIP]: 'TRIANGLE_STRIP',
    [Topology.TRIANGLE_FAN]: 'TRIANGLE_FAN'
};

/**
 * Execution context for tracking state during command execution
 */
class ExecutionContext {
    constructor() {
        this.viewport = { x: 0, y: 0, width: 0, height: 0 };
        this.scissor = null;
        this.currentPipeline = null;
        this.blendMode = BlendMode.ALPHA;
        this.depthState = { enabled: true, write: true, func: DepthFunc.LESS };
        this.boundVertexBuffers = new Map();
        this.boundIndexBuffer = null;
        this.boundTextures = new Map();
        this.uniforms = {};
        this.rotor = null;
        this.projection = null;

        /** @type {Array<object>} */
        this.stateStack = [];

        this.stats = {
            commandsExecuted: 0,
            drawCalls: 0,
            stateChanges: 0,
            errors: 0
        };
    }

    pushState() {
        this.stateStack.push({
            viewport: { ...this.viewport },
            scissor: this.scissor ? { ...this.scissor } : null,
            currentPipeline: this.currentPipeline,
            blendMode: this.blendMode,
            depthState: { ...this.depthState },
            uniforms: { ...this.uniforms }
        });
    }

    popState() {
        const state = this.stateStack.pop();
        if (state) {
            Object.assign(this.viewport, state.viewport);
            this.scissor = state.scissor;
            this.currentPipeline = state.currentPipeline;
            this.blendMode = state.blendMode;
            Object.assign(this.depthState, state.depthState);
            this.uniforms = state.uniforms;
            return true;
        }
        return false;
    }
}

/**
 * Command buffer executor
 */
export class CommandBufferExecutor {
    /**
     * @param {object} [options]
     * @param {boolean} [options.validateOnly] - Only validate, don't execute
     * @param {boolean} [options.debug] - Enable debug logging
     */
    constructor(options = {}) {
        this.validateOnly = options.validateOnly || false;
        this.debug = options.debug || false;

        /** @type {Map<string|number, WebGLBuffer|GPUBuffer>} */
        this._bufferRegistry = new Map();

        /** @type {Map<string|number, WebGLTexture|GPUTexture>} */
        this._textureRegistry = new Map();

        /** @type {Map<string, object>} */
        this._pipelineRegistry = new Map();
    }

    /**
     * Register a buffer for reference in commands
     * @param {string|number} id
     * @param {WebGLBuffer|GPUBuffer} buffer
     */
    registerBuffer(id, buffer) {
        this._bufferRegistry.set(id, buffer);
    }

    /**
     * Register a texture for reference in commands
     * @param {string|number} id
     * @param {WebGLTexture|GPUTexture} texture
     */
    registerTexture(id, texture) {
        this._textureRegistry.set(id, texture);
    }

    /**
     * Register a pipeline for reference in commands
     * @param {string} id
     * @param {object} pipeline - Backend-specific pipeline object
     */
    registerPipeline(id, pipeline) {
        this._pipelineRegistry.set(id, pipeline);
    }

    /**
     * Execute command buffer against WebGL context
     * @param {RenderCommandBuffer} commandBuffer
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     * @returns {ExecutionContext}
     */
    executeWebGL(commandBuffer, gl, options = {}) {
        const ctx = new ExecutionContext();

        for (const cmd of commandBuffer.getCommands()) {
            try {
                this._executeWebGLCommand(cmd, gl, ctx, options);
                ctx.stats.commandsExecuted++;
            } catch (error) {
                ctx.stats.errors++;
                if (this.debug) {
                    console.error('WebGL command error:', CommandType[cmd.type], error);
                }
            }
        }

        return ctx;
    }

    /**
     * Execute single WebGL command
     * @private
     */
    _executeWebGLCommand(cmd, gl, ctx, options) {
        if (this.validateOnly) {
            this._validateCommand(cmd);
            return;
        }

        switch (cmd.type) {
            case CommandType.CLEAR:
                this._glClear(gl, cmd.data);
                break;

            case CommandType.SET_VIEWPORT:
                gl.viewport(cmd.data.x, cmd.data.y, cmd.data.width, cmd.data.height);
                Object.assign(ctx.viewport, cmd.data);
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_SCISSOR:
                gl.enable(gl.SCISSOR_TEST);
                gl.scissor(cmd.data.x, cmd.data.y, cmd.data.width, cmd.data.height);
                ctx.scissor = { ...cmd.data };
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_PIPELINE:
                ctx.currentPipeline = cmd.data.pipelineId;
                const pipeline = this._pipelineRegistry.get(cmd.data.pipelineId);
                if (pipeline && pipeline.program) {
                    gl.useProgram(pipeline.program);
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_UNIFORMS:
                this._glSetUniforms(gl, ctx, cmd.data.values);
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_ROTOR:
                ctx.rotor = cmd.data.rotor;
                // Rotor uniform will be set when pipeline is active
                this._glSetRotorUniform(gl, ctx);
                break;

            case CommandType.SET_PROJECTION:
                ctx.projection = cmd.data;
                break;

            case CommandType.BIND_VERTEX_BUFFER:
                const vb = this._bufferRegistry.get(cmd.data.bufferId);
                if (vb) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
                    ctx.boundVertexBuffers.set(cmd.data.slot, cmd.data.bufferId);
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.BIND_INDEX_BUFFER:
                const ib = this._bufferRegistry.get(cmd.data.bufferId);
                if (ib) {
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
                    ctx.boundIndexBuffer = {
                        id: cmd.data.bufferId,
                        format: cmd.data.format
                    };
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.BIND_TEXTURE:
                const tex = this._textureRegistry.get(cmd.data.textureId);
                if (tex) {
                    gl.activeTexture(gl.TEXTURE0 + cmd.data.slot);
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    ctx.boundTextures.set(cmd.data.slot, cmd.data.textureId);
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_BLEND_MODE:
                this._glSetBlendMode(gl, cmd.data.mode);
                ctx.blendMode = cmd.data.mode;
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_DEPTH_STATE:
                this._glSetDepthState(gl, cmd.data);
                ctx.depthState = { ...cmd.data };
                ctx.stats.stateChanges++;
                break;

            case CommandType.DRAW:
                gl.drawArrays(gl[GL_TOPOLOGY[cmd.data.topology]], cmd.data.firstVertex, cmd.data.vertexCount);
                ctx.stats.drawCalls++;
                break;

            case CommandType.DRAW_INDEXED:
                const indexType = ctx.boundIndexBuffer?.format === 'uint32'
                    ? gl.UNSIGNED_INT
                    : gl.UNSIGNED_SHORT;
                const byteOffset = cmd.data.firstIndex * (indexType === gl.UNSIGNED_INT ? 4 : 2);
                gl.drawElements(
                    gl[GL_TOPOLOGY[cmd.data.topology]],
                    cmd.data.indexCount,
                    indexType,
                    byteOffset
                );
                ctx.stats.drawCalls++;
                break;

            case CommandType.DRAW_INSTANCED:
                gl.drawArraysInstanced(
                    gl[GL_TOPOLOGY[cmd.data.topology]],
                    cmd.data.firstVertex,
                    cmd.data.vertexCount,
                    cmd.data.instanceCount
                );
                ctx.stats.drawCalls++;
                break;

            case CommandType.PUSH_STATE:
                ctx.pushState();
                break;

            case CommandType.POP_STATE:
                if (ctx.popState()) {
                    // Restore GL state
                    gl.viewport(ctx.viewport.x, ctx.viewport.y, ctx.viewport.width, ctx.viewport.height);
                    this._glSetBlendMode(gl, ctx.blendMode);
                    this._glSetDepthState(gl, ctx.depthState);
                }
                break;
        }
    }

    /**
     * WebGL clear implementation
     * @private
     */
    _glClear(gl, data) {
        let mask = 0;

        if (data.clearColor) {
            gl.clearColor(data.color[0], data.color[1], data.color[2], data.color[3]);
            mask |= gl.COLOR_BUFFER_BIT;
        }

        if (data.clearDepth) {
            gl.clearDepth(data.depth);
            mask |= gl.DEPTH_BUFFER_BIT;
        }

        if (data.clearStencil) {
            gl.clearStencil(data.stencil);
            mask |= gl.STENCIL_BUFFER_BIT;
        }

        if (mask) {
            gl.clear(mask);
        }
    }

    /**
     * WebGL blend mode implementation
     * @private
     */
    _glSetBlendMode(gl, mode) {
        const blend = GL_BLEND_FACTORS[mode];

        if (!blend) {
            gl.disable(gl.BLEND);
            return;
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl[blend.src], gl[blend.dst]);
    }

    /**
     * WebGL depth state implementation
     * @private
     */
    _glSetDepthState(gl, state) {
        if (state.enabled) {
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl[GL_DEPTH_FUNCS[state.func]]);
            gl.depthMask(state.write);
        } else {
            gl.disable(gl.DEPTH_TEST);
        }
    }

    /**
     * WebGL uniform setting
     * @private
     */
    _glSetUniforms(gl, ctx, values) {
        Object.assign(ctx.uniforms, values);
        // Actual uniform upload happens through pipeline-specific code
        // This stores values for later use
    }

    /**
     * WebGL rotor uniform
     * @private
     */
    _glSetRotorUniform(gl, ctx) {
        // Rotor is stored in context for pipeline to use
        // Actual uniform location depends on active shader
    }

    /**
     * Execute command buffer against WebGPU backend
     * @param {RenderCommandBuffer} commandBuffer
     * @param {WebGPUBackend} backend
     * @param {object} [options]
     * @returns {ExecutionContext}
     */
    executeWebGPU(commandBuffer, backend, options = {}) {
        const ctx = new ExecutionContext();
        const device = backend.device;

        // Start render pass
        const { encoder, pass } = backend.beginRenderPass({
            clearColor: [0, 0, 0, 1]
        });

        for (const cmd of commandBuffer.getCommands()) {
            try {
                this._executeWebGPUCommand(cmd, backend, pass, ctx, options);
                ctx.stats.commandsExecuted++;
            } catch (error) {
                ctx.stats.errors++;
                if (this.debug) {
                    console.error('WebGPU command error:', CommandType[cmd.type], error);
                }
            }
        }

        // End render pass
        backend.endRenderPass(encoder, pass);

        return ctx;
    }

    /**
     * Execute single WebGPU command
     * @private
     */
    _executeWebGPUCommand(cmd, backend, pass, ctx, options) {
        if (this.validateOnly) {
            this._validateCommand(cmd);
            return;
        }

        switch (cmd.type) {
            case CommandType.CLEAR:
                // Clear is handled by render pass configuration
                break;

            case CommandType.SET_VIEWPORT:
                pass.setViewport(
                    cmd.data.x, cmd.data.y,
                    cmd.data.width, cmd.data.height,
                    0, 1
                );
                Object.assign(ctx.viewport, cmd.data);
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_SCISSOR:
                pass.setScissorRect(
                    cmd.data.x, cmd.data.y,
                    cmd.data.width, cmd.data.height
                );
                ctx.scissor = { ...cmd.data };
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_PIPELINE:
                const pipeline = this._pipelineRegistry.get(cmd.data.pipelineId);
                if (pipeline) {
                    pass.setPipeline(pipeline);
                    ctx.currentPipeline = cmd.data.pipelineId;
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_UNIFORMS:
                Object.assign(ctx.uniforms, cmd.data.values);
                backend.updateUniforms(ctx.uniforms);
                ctx.stats.stateChanges++;
                break;

            case CommandType.SET_ROTOR:
                ctx.rotor = cmd.data.rotor;
                // Update rotor in uniform buffer
                break;

            case CommandType.SET_PROJECTION:
                ctx.projection = cmd.data;
                break;

            case CommandType.BIND_VERTEX_BUFFER:
                const vb = this._bufferRegistry.get(cmd.data.bufferId);
                if (vb) {
                    pass.setVertexBuffer(cmd.data.slot, vb, cmd.data.offset || 0);
                    ctx.boundVertexBuffers.set(cmd.data.slot, cmd.data.bufferId);
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.BIND_INDEX_BUFFER:
                const ib = this._bufferRegistry.get(cmd.data.bufferId);
                if (ib) {
                    pass.setIndexBuffer(ib, cmd.data.format, cmd.data.offset || 0);
                    ctx.boundIndexBuffer = {
                        id: cmd.data.bufferId,
                        format: cmd.data.format
                    };
                }
                ctx.stats.stateChanges++;
                break;

            case CommandType.DRAW:
                pass.draw(cmd.data.vertexCount, 1, cmd.data.firstVertex, 0);
                ctx.stats.drawCalls++;
                break;

            case CommandType.DRAW_INDEXED:
                pass.drawIndexed(
                    cmd.data.indexCount,
                    1,
                    cmd.data.firstIndex,
                    cmd.data.baseVertex,
                    0
                );
                ctx.stats.drawCalls++;
                break;

            case CommandType.DRAW_INSTANCED:
                pass.draw(
                    cmd.data.vertexCount,
                    cmd.data.instanceCount,
                    cmd.data.firstVertex,
                    cmd.data.firstInstance
                );
                ctx.stats.drawCalls++;
                break;

            case CommandType.PUSH_STATE:
                ctx.pushState();
                break;

            case CommandType.POP_STATE:
                ctx.popState();
                break;
        }
    }

    /**
     * Validate command structure
     * @private
     */
    _validateCommand(cmd) {
        if (typeof cmd.type !== 'number') {
            throw new Error('Invalid command type');
        }

        switch (cmd.type) {
            case CommandType.CLEAR:
                if (!Array.isArray(cmd.data.color) || cmd.data.color.length !== 4) {
                    throw new Error('CLEAR requires color array of 4 elements');
                }
                break;

            case CommandType.SET_VIEWPORT:
            case CommandType.SET_SCISSOR:
                if (typeof cmd.data.width !== 'number' || typeof cmd.data.height !== 'number') {
                    throw new Error('Viewport/Scissor requires width and height');
                }
                break;

            case CommandType.DRAW:
                if (typeof cmd.data.vertexCount !== 'number') {
                    throw new Error('DRAW requires vertexCount');
                }
                break;

            case CommandType.DRAW_INDEXED:
                if (typeof cmd.data.indexCount !== 'number') {
                    throw new Error('DRAW_INDEXED requires indexCount');
                }
                break;
        }
    }

    /**
     * Get registered buffer
     * @param {string|number} id
     * @returns {WebGLBuffer|GPUBuffer|undefined}
     */
    getBuffer(id) {
        return this._bufferRegistry.get(id);
    }

    /**
     * Clear all registered resources
     */
    clearRegistries() {
        this._bufferRegistry.clear();
        this._textureRegistry.clear();
        this._pipelineRegistry.clear();
    }
}

export default CommandBufferExecutor;
