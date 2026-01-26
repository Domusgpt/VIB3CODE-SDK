/**
 * WebGLBackend - WebGL 2.0 rendering backend
 *
 * Implements the rendering interface for WebGL 2.0:
 * - State management with minimal redundant calls
 * - Shader compilation and linking
 * - Buffer and texture management
 * - Draw call execution
 */

import { BlendMode, DepthFunc, CullFace, StencilOp } from '../RenderState.js';
import { TextureFormat, FilterMode, WrapMode } from '../RenderTarget.js';

/**
 * WebGL blend factor mapping
 */
const BLEND_FACTORS = {
    'zero': 0,
    'one': 1,
    'src_color': 0x0300,
    'one_minus_src_color': 0x0301,
    'dst_color': 0x0306,
    'one_minus_dst_color': 0x0307,
    'src_alpha': 0x0302,
    'one_minus_src_alpha': 0x0303,
    'dst_alpha': 0x0304,
    'one_minus_dst_alpha': 0x0305,
    'constant_color': 0x8001,
    'one_minus_constant_color': 0x8002,
    'constant_alpha': 0x8003,
    'one_minus_constant_alpha': 0x8004,
    'src_alpha_saturate': 0x0308
};

/**
 * WebGL depth function mapping
 */
const DEPTH_FUNCS = {
    [DepthFunc.NEVER]: 0x0200,
    [DepthFunc.LESS]: 0x0201,
    [DepthFunc.EQUAL]: 0x0202,
    [DepthFunc.LEQUAL]: 0x0203,
    [DepthFunc.GREATER]: 0x0204,
    [DepthFunc.NOTEQUAL]: 0x0205,
    [DepthFunc.GEQUAL]: 0x0206,
    [DepthFunc.ALWAYS]: 0x0207
};

/**
 * WebGL stencil operation mapping
 */
const STENCIL_OPS = {
    [StencilOp.KEEP]: 0x1E00,
    [StencilOp.ZERO]: 0,
    [StencilOp.REPLACE]: 0x1E01,
    [StencilOp.INCR]: 0x1E02,
    [StencilOp.INCR_WRAP]: 0x8507,
    [StencilOp.DECR]: 0x1E03,
    [StencilOp.DECR_WRAP]: 0x8508,
    [StencilOp.INVERT]: 0x150A
};

/**
 * Primitive type mapping
 */
const PRIMITIVE_TYPES = {
    'points': 0,
    'lines': 1,
    'line_loop': 2,
    'line_strip': 3,
    'triangles': 4,
    'triangle_strip': 5,
    'triangle_fan': 6
};

/**
 * WebGLBackend class
 */
export class WebGLBackend {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     */
    constructor(gl, options = {}) {
        /** @type {WebGL2RenderingContext} */
        this.gl = gl;

        /** @type {boolean} */
        this.debug = options.debug || false;

        // Current state tracking for minimal state changes
        /** @type {object|null} */
        this._currentState = null;

        /** @type {object|null} */
        this._currentShader = null;

        /** @type {object|null} */
        this._currentVAO = null;

        /** @type {object|null} */
        this._currentRenderTarget = null;

        /** @type {Map<number, object>} */
        this._boundTextures = new Map();

        // Caches
        /** @type {Map<object, WebGLProgram>} */
        this._shaderCache = new Map();

        /** @type {Map<object, WebGLFramebuffer>} */
        this._framebufferCache = new Map();

        /** @type {Map<object, WebGLVertexArrayObject>} */
        this._vaoCache = new Map();

        // WebGL constants
        this._initConstants();

        // Extensions
        this._initExtensions();

        // Statistics
        this._stats = {
            drawCalls: 0,
            stateChanges: 0,
            shaderSwitches: 0,
            textureBinds: 0
        };
    }

    /**
     * Initialize WebGL constants
     * @private
     */
    _initConstants() {
        const gl = this.gl;

        this.BLEND_FACTORS = {
            'zero': gl.ZERO,
            'one': gl.ONE,
            'src_color': gl.SRC_COLOR,
            'one_minus_src_color': gl.ONE_MINUS_SRC_COLOR,
            'dst_color': gl.DST_COLOR,
            'one_minus_dst_color': gl.ONE_MINUS_DST_COLOR,
            'src_alpha': gl.SRC_ALPHA,
            'one_minus_src_alpha': gl.ONE_MINUS_SRC_ALPHA,
            'dst_alpha': gl.DST_ALPHA,
            'one_minus_dst_alpha': gl.ONE_MINUS_DST_ALPHA,
            'constant_color': gl.CONSTANT_COLOR,
            'one_minus_constant_color': gl.ONE_MINUS_CONSTANT_COLOR,
            'constant_alpha': gl.CONSTANT_ALPHA,
            'one_minus_constant_alpha': gl.ONE_MINUS_CONSTANT_ALPHA,
            'src_alpha_saturate': gl.SRC_ALPHA_SATURATE
        };

        this.DEPTH_FUNCS = {
            [DepthFunc.NEVER]: gl.NEVER,
            [DepthFunc.LESS]: gl.LESS,
            [DepthFunc.EQUAL]: gl.EQUAL,
            [DepthFunc.LEQUAL]: gl.LEQUAL,
            [DepthFunc.GREATER]: gl.GREATER,
            [DepthFunc.NOTEQUAL]: gl.NOTEQUAL,
            [DepthFunc.GEQUAL]: gl.GEQUAL,
            [DepthFunc.ALWAYS]: gl.ALWAYS
        };

        this.STENCIL_OPS = {
            [StencilOp.KEEP]: gl.KEEP,
            [StencilOp.ZERO]: gl.ZERO,
            [StencilOp.REPLACE]: gl.REPLACE,
            [StencilOp.INCR]: gl.INCR,
            [StencilOp.INCR_WRAP]: gl.INCR_WRAP,
            [StencilOp.DECR]: gl.DECR,
            [StencilOp.DECR_WRAP]: gl.DECR_WRAP,
            [StencilOp.INVERT]: gl.INVERT
        };

        this.PRIMITIVE_TYPES = {
            'points': gl.POINTS,
            'lines': gl.LINES,
            'line_loop': gl.LINE_LOOP,
            'line_strip': gl.LINE_STRIP,
            'triangles': gl.TRIANGLES,
            'triangle_strip': gl.TRIANGLE_STRIP,
            'triangle_fan': gl.TRIANGLE_FAN
        };

        this.TEXTURE_FORMATS = {
            [TextureFormat.RGBA8]: { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE },
            [TextureFormat.RGBA16F]: { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT },
            [TextureFormat.RGBA32F]: { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT },
            [TextureFormat.RGB8]: { internalFormat: gl.RGB8, format: gl.RGB, type: gl.UNSIGNED_BYTE },
            [TextureFormat.RG8]: { internalFormat: gl.RG8, format: gl.RG, type: gl.UNSIGNED_BYTE },
            [TextureFormat.R8]: { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE },
            [TextureFormat.DEPTH16]: { internalFormat: gl.DEPTH_COMPONENT16, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_SHORT },
            [TextureFormat.DEPTH24]: { internalFormat: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT },
            [TextureFormat.DEPTH32F]: { internalFormat: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT },
            [TextureFormat.DEPTH24_STENCIL8]: { internalFormat: gl.DEPTH24_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.UNSIGNED_INT_24_8 },
            [TextureFormat.DEPTH32F_STENCIL8]: { internalFormat: gl.DEPTH32F_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.FLOAT_32_UNSIGNED_INT_24_8_REV }
        };

        this.FILTER_MODES = {
            [FilterMode.NEAREST]: gl.NEAREST,
            [FilterMode.LINEAR]: gl.LINEAR,
            [FilterMode.NEAREST_MIPMAP_NEAREST]: gl.NEAREST_MIPMAP_NEAREST,
            [FilterMode.LINEAR_MIPMAP_NEAREST]: gl.LINEAR_MIPMAP_NEAREST,
            [FilterMode.NEAREST_MIPMAP_LINEAR]: gl.NEAREST_MIPMAP_LINEAR,
            [FilterMode.LINEAR_MIPMAP_LINEAR]: gl.LINEAR_MIPMAP_LINEAR
        };

        this.WRAP_MODES = {
            [WrapMode.REPEAT]: gl.REPEAT,
            [WrapMode.CLAMP_TO_EDGE]: gl.CLAMP_TO_EDGE,
            [WrapMode.MIRRORED_REPEAT]: gl.MIRRORED_REPEAT
        };
    }

    /**
     * Initialize WebGL extensions
     * @private
     */
    _initExtensions() {
        const gl = this.gl;

        this.extensions = {
            colorBufferFloat: gl.getExtension('EXT_color_buffer_float'),
            floatBlend: gl.getExtension('EXT_float_blend'),
            textureFilterAnisotropic: gl.getExtension('EXT_texture_filter_anisotropic'),
            debugRendererInfo: gl.getExtension('WEBGL_debug_renderer_info'),
            loseContext: gl.getExtension('WEBGL_lose_context'),
            parallelShaderCompile: gl.getExtension('KHR_parallel_shader_compile')
        };

        if (this.debug && this.extensions.debugRendererInfo) {
            console.log('WebGL Renderer:', gl.getParameter(this.extensions.debugRendererInfo.UNMASKED_RENDERER_WEBGL));
            console.log('WebGL Vendor:', gl.getParameter(this.extensions.debugRendererInfo.UNMASKED_VENDOR_WEBGL));
        }
    }

    /**
     * Clear framebuffer
     * @param {object} command - ClearCommand
     */
    clear(command) {
        const gl = this.gl;
        let mask = 0;

        if (command.clearColor) {
            gl.clearColor(...command.colorValue);
            mask |= gl.COLOR_BUFFER_BIT;
        }

        if (command.clearDepth) {
            gl.clearDepth(command.depthValue);
            mask |= gl.DEPTH_BUFFER_BIT;
        }

        if (command.clearStencil) {
            gl.clearStencil(command.stencilValue);
            mask |= gl.STENCIL_BUFFER_BIT;
        }

        if (mask) {
            gl.clear(mask);
        }
    }

    /**
     * Set render state
     * @param {object} state - RenderState
     */
    setState(state) {
        const gl = this.gl;
        this._stats.stateChanges++;

        // Blend state
        this._setBlendState(state.blend);

        // Depth state
        this._setDepthState(state.depth);

        // Stencil state
        this._setStencilState(state.stencil);

        // Rasterizer state
        this._setRasterizerState(state.rasterizer);

        // Color mask
        gl.colorMask(...state.colorMask);

        this._currentState = state;
    }

    /**
     * Set blend state
     * @private
     */
    _setBlendState(blend) {
        const gl = this.gl;

        if (blend.enabled) {
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(
                this.BLEND_FACTORS[blend.srcRGB],
                this.BLEND_FACTORS[blend.dstRGB],
                this.BLEND_FACTORS[blend.srcAlpha],
                this.BLEND_FACTORS[blend.dstAlpha]
            );
            if (blend.color.some(c => c !== 0)) {
                gl.blendColor(...blend.color);
            }
        } else {
            gl.disable(gl.BLEND);
        }
    }

    /**
     * Set depth state
     * @private
     */
    _setDepthState(depth) {
        const gl = this.gl;

        if (depth.testEnabled) {
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(this.DEPTH_FUNCS[depth.func]);
        } else {
            gl.disable(gl.DEPTH_TEST);
        }

        gl.depthMask(depth.writeEnabled);
        gl.depthRange(depth.near, depth.far);
    }

    /**
     * Set stencil state
     * @private
     */
    _setStencilState(stencil) {
        const gl = this.gl;

        if (stencil.enabled) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilFunc(
                this.DEPTH_FUNCS[stencil.func] || gl.ALWAYS,
                stencil.ref,
                stencil.mask
            );
            gl.stencilOp(
                this.STENCIL_OPS[stencil.failOp],
                this.STENCIL_OPS[stencil.depthFailOp],
                this.STENCIL_OPS[stencil.passOp]
            );
        } else {
            gl.disable(gl.STENCIL_TEST);
        }
    }

    /**
     * Set rasterizer state
     * @private
     */
    _setRasterizerState(rasterizer) {
        const gl = this.gl;

        // Culling
        if (rasterizer.cullFace === CullFace.NONE) {
            gl.disable(gl.CULL_FACE);
        } else {
            gl.enable(gl.CULL_FACE);
            switch (rasterizer.cullFace) {
                case CullFace.FRONT:
                    gl.cullFace(gl.FRONT);
                    break;
                case CullFace.BACK:
                    gl.cullFace(gl.BACK);
                    break;
                case CullFace.FRONT_AND_BACK:
                    gl.cullFace(gl.FRONT_AND_BACK);
                    break;
            }
        }

        // Front face
        gl.frontFace(rasterizer.frontFaceCCW ? gl.CCW : gl.CW);

        // Scissor
        if (rasterizer.scissorEnabled) {
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(...rasterizer.scissorRect);
        } else {
            gl.disable(gl.SCISSOR_TEST);
        }

        // Line width (clamped by implementation)
        gl.lineWidth(Math.min(rasterizer.lineWidth, gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)[1]));

        // Polygon offset for depth bias
        if (rasterizer.depthBiasEnabled) {
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(rasterizer.depthBiasFactor, rasterizer.depthBiasUnits);
        } else {
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }
    }

    /**
     * Set viewport
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    setViewport(x, y, width, height) {
        this.gl.viewport(x, y, width, height);
    }

    /**
     * Bind shader program
     * @param {object} shader - ShaderProgram
     */
    bindShader(shader) {
        if (this._currentShader === shader) return;

        const gl = this.gl;
        let program = this._shaderCache.get(shader);

        if (!program) {
            program = this._compileShader(shader);
            if (program) {
                this._shaderCache.set(shader, program);
                shader.setHandle(program);
            }
        }

        if (program) {
            gl.useProgram(program);
            this._currentShader = shader;
            this._stats.shaderSwitches++;
        }
    }

    /**
     * Compile shader program
     * @private
     */
    _compileShader(shader) {
        const gl = this.gl;

        // Compile vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, shader.vertexSource.getProcessedCode());
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(vertexShader);
            shader.setError(`Vertex shader error: ${error}`);
            gl.deleteShader(vertexShader);
            return null;
        }

        // Compile fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, shader.fragmentSource.getProcessedCode());
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fragmentShader);
            shader.setError(`Fragment shader error: ${error}`);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            return null;
        }

        // Link program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);

        // Bind attribute locations
        for (const attr of shader.attributes) {
            gl.bindAttribLocation(program, attr.location, attr.name);
        }

        gl.linkProgram(program);

        // Clean up shaders (attached to program, can be deleted)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program);
            shader.setError(`Link error: ${error}`);
            gl.deleteProgram(program);
            return null;
        }

        // Cache uniform locations
        for (const uniform of shader.uniforms) {
            uniform.location = gl.getUniformLocation(program, uniform.name);
        }

        return program;
    }

    /**
     * Set shader uniform
     * @param {string} name
     * @param {any} value
     * @param {string} [type]
     */
    setUniform(name, value, type = null) {
        const gl = this.gl;

        if (!this._currentShader) return;

        const uniform = this._currentShader.getUniform(name);
        const location = uniform?.location ?? gl.getUniformLocation(
            this._shaderCache.get(this._currentShader),
            name
        );

        if (location === null) return;

        // Check cache
        if (!this._currentShader.setUniformValue(name, value)) {
            return; // Value unchanged
        }

        const uniformType = type || uniform?.type || this._inferUniformType(value);

        switch (uniformType) {
            case 'float':
                gl.uniform1f(location, value);
                break;
            case 'vec2':
                gl.uniform2fv(location, value);
                break;
            case 'vec3':
                gl.uniform3fv(location, value);
                break;
            case 'vec4':
                gl.uniform4fv(location, value);
                break;
            case 'int':
            case 'sampler2D':
            case 'samplerCube':
            case 'sampler3D':
                gl.uniform1i(location, value);
                break;
            case 'ivec2':
                gl.uniform2iv(location, value);
                break;
            case 'ivec3':
                gl.uniform3iv(location, value);
                break;
            case 'ivec4':
                gl.uniform4iv(location, value);
                break;
            case 'bool':
                gl.uniform1i(location, value ? 1 : 0);
                break;
            case 'mat2':
                gl.uniformMatrix2fv(location, false, value);
                break;
            case 'mat3':
                gl.uniformMatrix3fv(location, false, value);
                break;
            case 'mat4':
                gl.uniformMatrix4fv(location, false, value);
                break;
            default:
                console.warn(`Unknown uniform type: ${uniformType}`);
        }
    }

    /**
     * Infer uniform type from value
     * @private
     */
    _inferUniformType(value) {
        if (typeof value === 'number') {
            return Number.isInteger(value) ? 'int' : 'float';
        }
        if (typeof value === 'boolean') {
            return 'bool';
        }
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            const length = value.length;
            if (length === 2) return 'vec2';
            if (length === 3) return 'vec3';
            if (length === 4) return 'vec4';
            if (length === 9) return 'mat3';
            if (length === 16) return 'mat4';
        }
        return 'float';
    }

    /**
     * Bind texture to slot
     * @param {object} texture
     * @param {number} slot
     */
    bindTexture(texture, slot = 0) {
        const gl = this.gl;

        gl.activeTexture(gl.TEXTURE0 + slot);

        if (!texture) {
            gl.bindTexture(gl.TEXTURE_2D, null);
            this._boundTextures.delete(slot);
            return;
        }

        let glTexture = texture._handle;

        if (!glTexture) {
            glTexture = this._createTexture(texture);
            texture._handle = glTexture;
        }

        gl.bindTexture(texture._target || gl.TEXTURE_2D, glTexture);
        this._boundTextures.set(slot, texture);
        this._stats.textureBinds++;
    }

    /**
     * Create WebGL texture
     * @private
     */
    _createTexture(texture) {
        const gl = this.gl;
        const glTexture = gl.createTexture();
        const target = texture._target || gl.TEXTURE_2D;

        gl.bindTexture(target, glTexture);

        // Set parameters
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER,
            this.FILTER_MODES[texture.minFilter] || gl.LINEAR);
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER,
            this.FILTER_MODES[texture.magFilter] || gl.LINEAR);
        gl.texParameteri(target, gl.TEXTURE_WRAP_S,
            this.WRAP_MODES[texture.wrapS] || gl.CLAMP_TO_EDGE);
        gl.texParameteri(target, gl.TEXTURE_WRAP_T,
            this.WRAP_MODES[texture.wrapT] || gl.CLAMP_TO_EDGE);

        return glTexture;
    }

    /**
     * Bind vertex array object
     * @param {object} vao
     */
    bindVertexArray(vao) {
        if (this._currentVAO === vao) return;

        const gl = this.gl;
        let glVAO = this._vaoCache.get(vao);

        if (!glVAO && vao) {
            glVAO = this._createVAO(vao);
            this._vaoCache.set(vao, glVAO);
            vao._handle = glVAO;
        }

        gl.bindVertexArray(glVAO || null);
        this._currentVAO = vao;
    }

    /**
     * Create vertex array object
     * @private
     */
    _createVAO(vao) {
        const gl = this.gl;
        const glVAO = gl.createVertexArray();
        gl.bindVertexArray(glVAO);

        // Set up attributes from VAO descriptor
        for (const attr of vao.attributes || []) {
            gl.enableVertexAttribArray(attr.location);

            // Bind the attribute's buffer
            if (attr.buffer?._handle) {
                gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer._handle);
            }

            // Set vertex attribute pointer
            gl.vertexAttribPointer(
                attr.location,
                attr.size || 4,
                attr.type || gl.FLOAT,
                attr.normalized || false,
                attr.stride || 0,
                attr.offset || 0
            );

            // Instance divisor for instanced rendering
            if (attr.divisor) {
                gl.vertexAttribDivisor(attr.location, attr.divisor);
            }
        }

        // Bind index buffer if present
        if (vao.indexBuffer?._handle) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vao.indexBuffer._handle);
        }

        gl.bindVertexArray(null);
        return glVAO;
    }

    /**
     * Bind render target (framebuffer)
     * @param {object|null} target
     */
    bindRenderTarget(target) {
        const gl = this.gl;

        if (target === null) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            this._currentRenderTarget = null;
            return;
        }

        let framebuffer = this._framebufferCache.get(target);

        if (!framebuffer || target._needsReallocation) {
            framebuffer = this._createFramebuffer(target);
            this._framebufferCache.set(target, framebuffer);
            target.setHandle(framebuffer);
            target._needsReallocation = false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        this._currentRenderTarget = target;

        // Set viewport to match target size
        gl.viewport(0, 0, target.width, target.height);
    }

    /**
     * Create framebuffer
     * @private
     */
    _createFramebuffer(target) {
        const gl = this.gl;
        const framebuffer = gl.createFramebuffer();

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

        // Color attachments
        const drawBuffers = [];
        target._colorTextures = [];

        for (let i = 0; i < target.colorAttachments.length; i++) {
            const attachment = target.colorAttachments[i];
            const formatInfo = this.TEXTURE_FORMATS[attachment.format];

            if (attachment.useTexture) {
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(
                    gl.TEXTURE_2D, 0,
                    formatInfo.internalFormat,
                    target.width, target.height, 0,
                    formatInfo.format,
                    formatInfo.type,
                    null
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
                    this.FILTER_MODES[attachment.minFilter]);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER,
                    this.FILTER_MODES[attachment.magFilter]);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,
                    this.WRAP_MODES[attachment.wrapS]);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,
                    this.WRAP_MODES[attachment.wrapT]);

                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0 + i,
                    gl.TEXTURE_2D,
                    texture, 0
                );

                target._colorTextures.push({ _handle: texture, _target: gl.TEXTURE_2D });
            } else {
                const renderbuffer = gl.createRenderbuffer();
                gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

                if (attachment.samples > 1) {
                    gl.renderbufferStorageMultisample(
                        gl.RENDERBUFFER,
                        attachment.samples,
                        formatInfo.internalFormat,
                        target.width, target.height
                    );
                } else {
                    gl.renderbufferStorage(
                        gl.RENDERBUFFER,
                        formatInfo.internalFormat,
                        target.width, target.height
                    );
                }

                gl.framebufferRenderbuffer(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0 + i,
                    gl.RENDERBUFFER,
                    renderbuffer
                );
            }

            drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
        }

        // Set draw buffers for MRT
        if (drawBuffers.length > 0) {
            gl.drawBuffers(drawBuffers);
        }

        // Depth attachment
        if (target.depthAttachment) {
            const depthAttachment = target.depthAttachment;
            const formatInfo = this.TEXTURE_FORMATS[depthAttachment.format];
            const isDepthStencil = depthAttachment.format.includes('stencil');

            if (depthAttachment.useTexture) {
                const texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(
                    gl.TEXTURE_2D, 0,
                    formatInfo.internalFormat,
                    target.width, target.height, 0,
                    formatInfo.format,
                    formatInfo.type,
                    null
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    isDepthStencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT,
                    gl.TEXTURE_2D,
                    texture, 0
                );

                target._depthTexture = { _handle: texture, _target: gl.TEXTURE_2D };
            } else {
                const renderbuffer = gl.createRenderbuffer();
                gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

                if (depthAttachment.samples > 1) {
                    gl.renderbufferStorageMultisample(
                        gl.RENDERBUFFER,
                        depthAttachment.samples,
                        formatInfo.internalFormat,
                        target.width, target.height
                    );
                } else {
                    gl.renderbufferStorage(
                        gl.RENDERBUFFER,
                        formatInfo.internalFormat,
                        target.width, target.height
                    );
                }

                gl.framebufferRenderbuffer(
                    gl.FRAMEBUFFER,
                    isDepthStencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT,
                    gl.RENDERBUFFER,
                    renderbuffer
                );
            }
        }

        // Check completeness
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer incomplete:', this._getFramebufferStatusName(status));
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return framebuffer;
    }

    /**
     * Get framebuffer status name for debugging
     * @private
     */
    _getFramebufferStatusName(status) {
        const gl = this.gl;
        const names = {
            [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
            [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'INCOMPLETE_MISSING_ATTACHMENT',
            [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
            [gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED',
            [gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE]: 'INCOMPLETE_MULTISAMPLE'
        };
        return names[status] || `UNKNOWN (${status})`;
    }

    /**
     * Draw non-indexed primitives
     * @param {object} command - DrawCommand
     */
    draw(command) {
        const gl = this.gl;
        const primitive = this.PRIMITIVE_TYPES[command.primitive] || gl.TRIANGLES;

        gl.drawArrays(primitive, command.firstVertex, command.vertexCount);
        this._stats.drawCalls++;
    }

    /**
     * Draw indexed primitives
     * @param {object} command - DrawIndexedCommand
     */
    drawIndexed(command) {
        const gl = this.gl;
        const primitive = this.PRIMITIVE_TYPES[command.primitive] || gl.TRIANGLES;
        const indexType = command.indexType === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        const byteOffset = command.firstIndex * (command.indexType === 'uint32' ? 4 : 2);

        gl.drawElements(primitive, command.indexCount, indexType, byteOffset);
        this._stats.drawCalls++;
    }

    /**
     * Draw instanced primitives
     * @param {object} command - DrawInstancedCommand
     */
    drawInstanced(command) {
        const gl = this.gl;
        const primitive = this.PRIMITIVE_TYPES[command.primitive] || gl.TRIANGLES;

        gl.drawArraysInstanced(
            primitive,
            command.firstVertex,
            command.vertexCount,
            command.instanceCount
        );
        this._stats.drawCalls++;
    }

    /**
     * Draw indexed instanced primitives
     * @param {object} command - DrawIndexedInstancedCommand
     */
    drawIndexedInstanced(command) {
        const gl = this.gl;
        const primitive = this.PRIMITIVE_TYPES[command.primitive] || gl.TRIANGLES;
        const indexType = command.indexType === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        const byteOffset = command.firstIndex * (command.indexType === 'uint32' ? 4 : 2);

        gl.drawElementsInstanced(
            primitive,
            command.indexCount,
            indexType,
            byteOffset,
            command.instanceCount
        );
        this._stats.drawCalls++;
    }

    /**
     * Create buffer
     * @param {object} descriptor
     * @returns {object}
     */
    createBuffer(descriptor) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        const target = descriptor.usage === 'index' ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        const usage = descriptor.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;

        gl.bindBuffer(target, buffer);

        if (descriptor.data) {
            gl.bufferData(target, descriptor.data, usage);
        } else if (descriptor.size) {
            gl.bufferData(target, descriptor.size, usage);
        }

        return {
            _handle: buffer,
            _target: target,
            size: descriptor.data?.byteLength || descriptor.size || 0,
            usage: descriptor.usage || 'vertex'
        };
    }

    /**
     * Update buffer data
     * @param {object} buffer
     * @param {ArrayBufferView} data
     * @param {number} [offset]
     */
    updateBuffer(buffer, data, offset = 0) {
        const gl = this.gl;
        gl.bindBuffer(buffer._target, buffer._handle);
        gl.bufferSubData(buffer._target, offset, data);
    }

    /**
     * Delete buffer
     * @param {object} buffer
     */
    deleteBuffer(buffer) {
        if (buffer?._handle) {
            this.gl.deleteBuffer(buffer._handle);
            buffer._handle = null;
        }
    }

    /**
     * Get render statistics
     * @returns {object}
     */
    getStats() {
        return { ...this._stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this._stats = {
            drawCalls: 0,
            stateChanges: 0,
            shaderSwitches: 0,
            textureBinds: 0
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        const gl = this.gl;

        // Delete shaders
        for (const program of this._shaderCache.values()) {
            gl.deleteProgram(program);
        }
        this._shaderCache.clear();

        // Delete framebuffers
        for (const fb of this._framebufferCache.values()) {
            gl.deleteFramebuffer(fb);
        }
        this._framebufferCache.clear();

        // Delete VAOs
        for (const vao of this._vaoCache.values()) {
            gl.deleteVertexArray(vao);
        }
        this._vaoCache.clear();

        this._currentState = null;
        this._currentShader = null;
        this._currentVAO = null;
        this._currentRenderTarget = null;
        this._boundTextures.clear();
    }
}

/**
 * Create WebGL 2.0 backend from canvas
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @returns {WebGLBackend|null}
 */
export function createWebGLBackend(canvas, options = {}) {
    const contextOptions = {
        alpha: options.alpha ?? true,
        depth: options.depth ?? true,
        stencil: options.stencil ?? false,
        antialias: options.antialias ?? true,
        premultipliedAlpha: options.premultipliedAlpha ?? true,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
        powerPreference: options.powerPreference ?? 'high-performance',
        failIfMajorPerformanceCaveat: options.failIfMajorPerformanceCaveat ?? false
    };

    const gl = canvas.getContext('webgl2', contextOptions);

    if (!gl) {
        console.error('WebGL 2.0 not supported');
        return null;
    }

    return new WebGLBackend(gl, options);
}

export default WebGLBackend;
