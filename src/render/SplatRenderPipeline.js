/**
 * SplatRenderPipeline
 *
 * Wires the GaussianSplatRenderer into the engine's CommandBuffer system
 * so that the full procedural pipeline can be validated end-to-end:
 *
 *   PCG JSON  →  expand seeds  →  encode Float32Array  →  GPU upload
 *            →  record CommandBuffer  →  sort  →  execute draw
 *
 * The pipeline records discrete render commands (clear, set-state,
 * set-viewport, draw-splats) into a CommandBuffer that can be:
 *   • sorted (back-to-front for transparency)
 *   • profiled (timing + draw-call stats)
 *   • executed against the WebGLBackend  *or*  self-executed standalone
 */

import { CommandBuffer, SortMode } from './CommandBuffer.js';
import {
    ClearCommand,
    SetStateCommand,
    SetViewportCommand,
    CustomCommand
} from './RenderCommand.js';
import { RenderState, BlendMode, DepthFunc, CullFace } from './RenderState.js';
import { GaussianSplatRenderer } from './GaussianSplatRenderer.js';
import { encodeGaussianSeeds } from './GaussianSeedBuffer.js';

/**
 * Build a RenderState configured for alpha-blended Gaussian splats:
 *  - premultiplied-alpha blend
 *  - depth test ON, depth write OFF
 *  - no face culling (point sprites)
 */
function splatRenderState() {
    const state = new RenderState();
    state.blend.enabled = true;
    state.blend.srcRGB = 'one';
    state.blend.dstRGB = 'one_minus_src_alpha';
    state.blend.srcAlpha = 'one';
    state.blend.dstAlpha = 'one_minus_src_alpha';
    state.depth.testEnabled = true;
    state.depth.writeEnabled = false;
    state.depth.func = DepthFunc.LEQUAL;
    state.rasterizer.cullFace = CullFace.NONE;
    return state;
}

export class SplatRenderPipeline {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     * @param {number} [options.pointScale]
     */
    constructor(gl, options = {}) {
        if (!gl) {
            throw new Error('SplatRenderPipeline requires a WebGL2 context.');
        }
        this.gl = gl;
        this.renderer = new GaussianSplatRenderer(gl, options);
        this.commandBuffer = new CommandBuffer({
            sortMode: SortMode.BACK_TO_FRONT,
            label: 'splat-pipeline'
        });
        this._state = splatRenderState();
    }

    /* -------------------------------------------------------------- */
    /*  Pipeline API                                                   */
    /* -------------------------------------------------------------- */

    /**
     * Full pipeline pass: encode seeds, upload, record commands.
     *
     * @param {Object[]} seeds  Array of seed objects (position, orientation,
     *                          scale, color, depth).
     * @returns {CommandBuffer}  The recorded (sorted) command buffer.
     */
    submit(seeds) {
        // ---- encode & upload ------------------------------------
        const encoded = encodeGaussianSeeds(seeds);
        this.renderer.updateSeeds(encoded, seeds.length);

        // ---- record commands ------------------------------------
        const gl = this.gl;
        const cb = this.commandBuffer;

        cb.begin();

        // 1. Clear colour + depth
        cb.add(new ClearCommand({
            color: true,
            depth: true,
            colorValue: [0.02, 0.04, 0.08, 1.0],
            depthValue: 1.0
        }));

        // 2. GPU state for transparent splat compositing
        cb.add(new SetStateCommand(this._state));

        // 3. Viewport
        cb.add(new SetViewportCommand(
            0, 0, gl.canvas.width, gl.canvas.height
        ));

        // 4. Draw all splats via a CustomCommand that delegates to
        //    the GaussianSplatRenderer's own program/VAO.
        const renderer = this.renderer;
        const drawCmd = new CustomCommand((/* backend */) => {
            const g = renderer.gl;
            g.useProgram(renderer.program);
            g.bindVertexArray(renderer.vao);
            g.uniform1f(renderer.uniforms.pointScale, renderer.pointScale);
            g.drawArrays(g.POINTS, 0, renderer.count);
            g.bindVertexArray(null);
        });
        drawCmd.depth = 0;          // sort key for depth sorting
        drawCmd.priority = 0;       // draw last
        drawCmd.label = 'draw-splats';
        cb.add(drawCmd);

        cb.end();
        cb.sort();

        return cb;
    }

    /**
     * Execute the most recently recorded command buffer.
     *
     * @param {object} [backend]  Optional WebGLBackend.  When provided,
     *   clear / state / viewport commands execute through the backend's
     *   abstraction layer.  When omitted, the pipeline self-executes
     *   using raw GL calls (standalone mode).
     * @returns {{ commandCount: number, drawCalls: number, stateChanges: number, triangles: number, executionTime?: number }}
     */
    execute(backend = null) {
        if (backend) {
            return this.commandBuffer.executeWithProfiling(backend);
        }

        // Standalone execution – iterate commands manually
        const start = performance.now();
        const gl = this.gl;

        for (const cmd of this.commandBuffer.commands) {
            if (cmd.callback) {
                // CustomCommand
                cmd.callback(null);
            } else {
                this._executeFallback(cmd, gl);
            }
        }

        return {
            ...this.commandBuffer.stats,
            executionTime: performance.now() - start
        };
    }

    /**
     * Convenience: submit + execute in one call.
     *
     * @param {Object[]} seeds
     * @param {object}   [backend]
     * @returns {object}  Execution stats.
     */
    run(seeds, backend = null) {
        this.submit(seeds);
        return this.execute(backend);
    }

    /* -------------------------------------------------------------- */
    /*  Accessors                                                      */
    /* -------------------------------------------------------------- */

    /** Current command buffer statistics. */
    get stats() {
        return this.commandBuffer.stats;
    }

    /** Number of splats currently on the GPU. */
    get splatCount() {
        return this.renderer.count;
    }

    /* -------------------------------------------------------------- */
    /*  Fallback execution (no backend)                                */
    /* -------------------------------------------------------------- */

    /** @private */
    _executeFallback(cmd, gl) {
        switch (cmd.type) {
            case 'clear': {
                let mask = 0;
                if (cmd.clearColor) {
                    gl.clearColor(...cmd.colorValue);
                    mask |= gl.COLOR_BUFFER_BIT;
                }
                if (cmd.clearDepth) {
                    gl.clearDepth(cmd.depthValue);
                    mask |= gl.DEPTH_BUFFER_BIT;
                }
                if (mask) gl.clear(mask);
                break;
            }
            case 'set_state': {
                const s = cmd.state;
                // Blend
                if (s.blend.enabled) {
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                } else {
                    gl.disable(gl.BLEND);
                }
                // Depth
                if (s.depth.testEnabled) {
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthFunc(gl.LEQUAL);
                } else {
                    gl.disable(gl.DEPTH_TEST);
                }
                gl.depthMask(s.depth.writeEnabled);
                break;
            }
            case 'set_viewport':
                gl.viewport(cmd.x, cmd.y, cmd.width, cmd.height);
                break;
            default:
                break;
        }
    }
}

export default SplatRenderPipeline;
