/**
 * Render Module - VIB3+ SDK
 *
 * Complete rendering abstraction for 4D visualization:
 * - GPU state management
 * - Render command pattern
 * - Command buffer batching and sorting
 * - Framebuffer/render target abstraction
 * - Shader program management
 * - WebGL 2.0 backend
 */

// State management
export {
    BlendMode,
    DepthFunc,
    CullFace,
    PolygonMode,
    StencilOp,
    BlendState,
    DepthState,
    StencilState,
    RasterizerState,
    Viewport,
    RenderState
} from './RenderState.js';

// Render commands
export {
    CommandType,
    PrimitiveType,
    RenderCommand,
    ClearCommand,
    SetStateCommand,
    BindShaderCommand,
    BindTextureCommand,
    BindVertexArrayCommand,
    BindRenderTargetCommand,
    SetUniformCommand,
    DrawCommand,
    DrawIndexedCommand,
    DrawInstancedCommand,
    DrawIndexedInstancedCommand,
    SetViewportCommand,
    CustomCommand
} from './RenderCommand.js';

// Command buffer
export {
    SortMode,
    CommandBuffer,
    CommandBufferPool,
    commandBufferPool
} from './CommandBuffer.js';

// Render targets
export {
    TextureFormat,
    AttachmentType,
    FilterMode,
    WrapMode,
    AttachmentDescriptor,
    RenderTarget,
    RenderTargetPool,
    renderTargetPool
} from './RenderTarget.js';

// Shader programs
export {
    ShaderStage,
    UniformType,
    UniformDescriptor,
    AttributeDescriptor,
    ShaderSource,
    ShaderProgram,
    ShaderLib,
    ShaderCache,
    shaderCache
} from './ShaderProgram.js';

// WebGL backend
export {
    WebGLBackend,
    createWebGLBackend
} from './backends/WebGLBackend.js';

/**
 * Create a complete rendering context
 * @param {HTMLCanvasElement} canvas
 * @param {object} [options]
 * @returns {object} Rendering context with backend and helpers
 */
export function createRenderContext(canvas, options = {}) {
    const { createWebGLBackend } = require('./backends/WebGLBackend.js');
    const backend = createWebGLBackend(canvas, options);

    if (!backend) {
        return null;
    }

    return {
        backend,
        canvas,
        gl: backend.gl,

        // Helper methods
        createCommandBuffer: (opts) => new CommandBuffer(opts),
        createRenderTarget: (width, height, opts) => new RenderTarget(width, height, opts),
        createShader: (opts) => new ShaderProgram(opts),

        // Dispose all
        dispose() {
            backend.dispose();
        }
    };
}

/**
 * Preset render states for common use cases
 */
export const RenderPresets = {
    /** Default opaque rendering */
    opaque: () => RenderState.opaque(),

    /** Alpha-blended transparent rendering */
    transparent: () => RenderState.transparent(),

    /** Additive blending for effects */
    additive: () => RenderState.additive(),

    /** Wireframe rendering */
    wireframe: () => RenderState.wireframe(),

    /** 4D geometry with W-depth sorting */
    geometry4D: () => {
        const state = RenderState.opaque();
        state.depth.testEnabled = true;
        state.depth.writeEnabled = true;
        return state;
    },

    /** Transparent 4D with back-to-front sorting */
    transparent4D: () => {
        const state = RenderState.transparent();
        state.depth.testEnabled = true;
        state.depth.writeEnabled = false;
        return state;
    }
};

/**
 * Common shader snippets for 4D rendering
 */
export const Shader4D = {
    /** All rotation functions for 6 planes */
    rotation: ShaderLib.rotation4D,

    /** Projection functions (perspective, stereographic, orthographic) */
    projection: ShaderLib.projection4D,

    /** Basic 4D vertex shader template */
    basicVertex: ShaderLib.vertex4D,

    /** Basic fragment shader with W-fog */
    basicFragment: ShaderLib.fragment4D,

    /**
     * Generate complete vertex shader for 4D geometry
     * @param {object} [options]
     * @returns {string}
     */
    generateVertexShader(options = {}) {
        const includeColor = options.color !== false;
        const includeNormal = options.normal === true;

        return `#version 300 es
precision highp float;

// 4D position
in vec4 a_position;
${includeColor ? 'in vec4 a_color;' : ''}
${includeNormal ? 'in vec4 a_normal;' : ''}

// Transforms
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
uniform mat4 u_rotation4D;
uniform float u_projDistance;

// Outputs
${includeColor ? 'out vec4 v_color;' : ''}
${includeNormal ? 'out vec3 v_normal;' : ''}
out float v_depth4D;
out vec3 v_position;

${ShaderLib.rotation4D}
${ShaderLib.projection4D}

void main() {
    // Apply 4D rotation
    vec4 rotated = u_rotation4D * a_position;

    // Project 4D -> 3D
    vec3 projected = projectPerspective(rotated, u_projDistance);

    // Apply 3D transforms
    vec4 worldPos = u_modelMatrix * vec4(projected, 1.0);
    vec4 viewPos = u_viewMatrix * worldPos;
    gl_Position = u_projMatrix * viewPos;

    // Pass to fragment shader
    v_position = worldPos.xyz;
    v_depth4D = rotated.w;
    ${includeColor ? 'v_color = a_color;' : ''}
    ${includeNormal ? `
    vec4 rotatedNormal = u_rotation4D * a_normal;
    v_normal = normalize((u_modelMatrix * vec4(rotatedNormal.xyz, 0.0)).xyz);
    ` : ''}
}`;
    },

    /**
     * Generate complete fragment shader for 4D geometry
     * @param {object} [options]
     * @returns {string}
     */
    generateFragmentShader(options = {}) {
        const includeColor = options.color !== false;
        const includeLighting = options.lighting === true;
        const includeWFog = options.wFog !== false;

        return `#version 300 es
precision highp float;

${includeColor ? 'in vec4 v_color;' : ''}
${includeLighting ? 'in vec3 v_normal;' : ''}
in float v_depth4D;
in vec3 v_position;

uniform float u_wFogDistance;
uniform bool u_wFogEnabled;
${includeColor ? '' : 'uniform vec4 u_baseColor;'}
${includeLighting ? `
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambientColor;
` : ''}

out vec4 fragColor;

void main() {
    ${includeColor ? 'vec4 color = v_color;' : 'vec4 color = u_baseColor;'}

    ${includeLighting ? `
    // Simple directional lighting
    float NdotL = max(dot(v_normal, normalize(u_lightDir)), 0.0);
    vec3 diffuse = u_lightColor * NdotL;
    vec3 ambient = u_ambientColor;
    color.rgb *= (ambient + diffuse);
    ` : ''}

    ${includeWFog ? `
    // W-depth fog (fades objects far in 4th dimension)
    if (u_wFogEnabled) {
        float fogFactor = clamp(abs(v_depth4D) / u_wFogDistance, 0.0, 1.0);
        color.a *= 1.0 - fogFactor;
    }
    ` : ''}

    fragColor = color;
}`;
    }
};

// Import classes for createRenderContext helper
import { CommandBuffer } from './CommandBuffer.js';
import { RenderTarget } from './RenderTarget.js';
import { RenderState } from './RenderState.js';
import { ShaderProgram, ShaderLib } from './ShaderProgram.js';
