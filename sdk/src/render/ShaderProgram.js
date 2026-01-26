/**
 * ShaderProgram - Shader compilation and uniform management
 *
 * Provides:
 * - Vertex/fragment shader compilation
 * - Uniform location caching
 * - Attribute binding
 * - Shader source management
 */

let shaderIdCounter = 0;

/**
 * Shader stages
 */
export const ShaderStage = {
    VERTEX: 'vertex',
    FRAGMENT: 'fragment',
    COMPUTE: 'compute'
};

/**
 * Uniform types
 */
export const UniformType = {
    FLOAT: 'float',
    VEC2: 'vec2',
    VEC3: 'vec3',
    VEC4: 'vec4',
    INT: 'int',
    IVEC2: 'ivec2',
    IVEC3: 'ivec3',
    IVEC4: 'ivec4',
    BOOL: 'bool',
    MAT2: 'mat2',
    MAT3: 'mat3',
    MAT4: 'mat4',
    SAMPLER_2D: 'sampler2D',
    SAMPLER_CUBE: 'samplerCube',
    SAMPLER_3D: 'sampler3D'
};

/**
 * Uniform descriptor
 */
export class UniformDescriptor {
    /**
     * @param {string} name
     * @param {string} type
     * @param {any} defaultValue
     */
    constructor(name, type, defaultValue = null) {
        /** @type {string} */
        this.name = name;

        /** @type {string} */
        this.type = type;

        /** @type {any} */
        this.defaultValue = defaultValue;

        /** @type {number|null} Location (set by backend) */
        this.location = null;

        /** @type {number} Size for arrays */
        this.arraySize = 1;
    }
}

/**
 * Attribute descriptor
 */
export class AttributeDescriptor {
    /**
     * @param {string} name
     * @param {number} location
     * @param {string} type
     */
    constructor(name, location, type = 'vec4') {
        /** @type {string} */
        this.name = name;

        /** @type {number} */
        this.location = location;

        /** @type {string} */
        this.type = type;
    }
}

/**
 * Shader source with metadata
 */
export class ShaderSource {
    /**
     * @param {string} stage
     * @param {string} code
     * @param {object} [options]
     */
    constructor(stage, code, options = {}) {
        /** @type {string} */
        this.stage = stage;

        /** @type {string} */
        this.code = code;

        /** @type {string} Entry point name */
        this.entryPoint = options.entryPoint || 'main';

        /** @type {object} Defines for preprocessing */
        this.defines = options.defines || {};

        /** @type {string[]} Include paths */
        this.includes = options.includes || [];
    }

    /**
     * Get preprocessed code with defines
     * @returns {string}
     */
    getProcessedCode() {
        let processedCode = this.code;

        // Add defines at the beginning (after version directive if present)
        const defineLines = Object.entries(this.defines)
            .map(([key, value]) => `#define ${key} ${value}`)
            .join('\n');

        if (defineLines) {
            const versionMatch = processedCode.match(/^#version\s+\d+.*$/m);
            if (versionMatch) {
                const versionLine = versionMatch[0];
                const restOfCode = processedCode.slice(versionMatch.index + versionLine.length);
                processedCode = versionLine + '\n' + defineLines + restOfCode;
            } else {
                processedCode = defineLines + '\n' + processedCode;
            }
        }

        return processedCode;
    }
}

/**
 * ShaderProgram class
 */
export class ShaderProgram {
    /**
     * @param {object} options
     */
    constructor(options = {}) {
        /** @type {number} */
        this.id = ++shaderIdCounter;

        /** @type {string|null} */
        this.name = options.name || null;

        /** @type {ShaderSource|null} */
        this.vertexSource = options.vertex
            ? new ShaderSource(ShaderStage.VERTEX, options.vertex, options.vertexOptions)
            : null;

        /** @type {ShaderSource|null} */
        this.fragmentSource = options.fragment
            ? new ShaderSource(ShaderStage.FRAGMENT, options.fragment, options.fragmentOptions)
            : null;

        /** @type {Map<string, UniformDescriptor>} */
        this._uniforms = new Map();

        /** @type {Map<string, AttributeDescriptor>} */
        this._attributes = new Map();

        /** @type {Map<string, any>} Cached uniform values */
        this._uniformCache = new Map();

        /** @type {object|null} Backend handle */
        this._handle = null;

        /** @type {boolean} */
        this._compiled = false;

        /** @type {string|null} Compilation errors */
        this._error = null;

        // Parse uniforms and attributes from source
        if (options.uniforms) {
            for (const uniform of options.uniforms) {
                this.addUniform(uniform.name, uniform.type, uniform.defaultValue);
            }
        }

        if (options.attributes) {
            for (const attr of options.attributes) {
                this.addAttribute(attr.name, attr.location, attr.type);
            }
        }
    }

    /**
     * Add uniform descriptor
     * @param {string} name
     * @param {string} type
     * @param {any} defaultValue
     * @returns {this}
     */
    addUniform(name, type, defaultValue = null) {
        this._uniforms.set(name, new UniformDescriptor(name, type, defaultValue));
        return this;
    }

    /**
     * Add attribute descriptor
     * @param {string} name
     * @param {number} location
     * @param {string} type
     * @returns {this}
     */
    addAttribute(name, location, type = 'vec4') {
        this._attributes.set(name, new AttributeDescriptor(name, location, type));
        return this;
    }

    /**
     * Get uniform descriptor
     * @param {string} name
     * @returns {UniformDescriptor|undefined}
     */
    getUniform(name) {
        return this._uniforms.get(name);
    }

    /**
     * Get attribute descriptor
     * @param {string} name
     * @returns {AttributeDescriptor|undefined}
     */
    getAttribute(name) {
        return this._attributes.get(name);
    }

    /**
     * Get all uniforms
     * @returns {UniformDescriptor[]}
     */
    get uniforms() {
        return Array.from(this._uniforms.values());
    }

    /**
     * Get all attributes
     * @returns {AttributeDescriptor[]}
     */
    get attributes() {
        return Array.from(this._attributes.values());
    }

    /**
     * Set uniform value (cached)
     * @param {string} name
     * @param {any} value
     * @returns {boolean} True if value changed
     */
    setUniformValue(name, value) {
        const cached = this._uniformCache.get(name);

        // Simple equality check (won't work for arrays/objects)
        if (cached === value) {
            return false;
        }

        this._uniformCache.set(name, value);
        return true;
    }

    /**
     * Get cached uniform value
     * @param {string} name
     * @returns {any}
     */
    getUniformValue(name) {
        return this._uniformCache.get(name);
    }

    /**
     * Clear uniform cache
     */
    clearUniformCache() {
        this._uniformCache.clear();
    }

    /**
     * Set backend handle
     * @param {object} handle
     */
    setHandle(handle) {
        this._handle = handle;
        this._compiled = true;
    }

    /**
     * Get backend handle
     * @returns {object|null}
     */
    getHandle() {
        return this._handle;
    }

    /**
     * Check if compiled
     * @returns {boolean}
     */
    get isCompiled() {
        return this._compiled;
    }

    /**
     * Get compilation error
     * @returns {string|null}
     */
    get error() {
        return this._error;
    }

    /**
     * Set compilation error
     * @param {string} error
     */
    setError(error) {
        this._error = error;
        this._compiled = false;
    }

    /**
     * Dispose shader resources
     */
    dispose() {
        this._handle = null;
        this._compiled = false;
        this._uniformCache.clear();
    }

    /**
     * Clone shader program
     * @returns {ShaderProgram}
     */
    clone() {
        const shader = new ShaderProgram({
            name: this.name ? `${this.name}_clone` : null,
            vertex: this.vertexSource?.code,
            fragment: this.fragmentSource?.code
        });

        for (const uniform of this._uniforms.values()) {
            shader.addUniform(uniform.name, uniform.type, uniform.defaultValue);
        }

        for (const attr of this._attributes.values()) {
            shader.addAttribute(attr.name, attr.location, attr.type);
        }

        return shader;
    }
}

/**
 * Common shader library with reusable code
 */
export const ShaderLib = {
    /**
     * 4D rotation matrices for 6 planes
     */
    rotation4D: `
        mat4 rotateXY(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                c, -s, 0, 0,
                s,  c, 0, 0,
                0,  0, 1, 0,
                0,  0, 0, 1
            );
        }

        mat4 rotateXZ(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                c, 0, -s, 0,
                0, 1,  0, 0,
                s, 0,  c, 0,
                0, 0,  0, 1
            );
        }

        mat4 rotateYZ(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                1, 0,  0, 0,
                0, c, -s, 0,
                0, s,  c, 0,
                0, 0,  0, 1
            );
        }

        mat4 rotateXW(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                c, 0, 0, -s,
                0, 1, 0,  0,
                0, 0, 1,  0,
                s, 0, 0,  c
            );
        }

        mat4 rotateYW(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                1, 0, 0,  0,
                0, c, 0, -s,
                0, 0, 1,  0,
                0, s, 0,  c
            );
        }

        mat4 rotateZW(float angle) {
            float c = cos(angle), s = sin(angle);
            return mat4(
                1, 0, 0,  0,
                0, 1, 0,  0,
                0, 0, c, -s,
                0, 0, s,  c
            );
        }

        mat4 rotate4D(float xy, float xz, float yz, float xw, float yw, float zw) {
            return rotateXY(xy) * rotateXZ(xz) * rotateYZ(yz) *
                   rotateXW(xw) * rotateYW(yw) * rotateZW(zw);
        }
    `,

    /**
     * 4D to 3D projection functions
     */
    projection4D: `
        vec3 projectPerspective(vec4 p, float d) {
            float w = d - p.w;
            if (abs(w) < 0.0001) w = 0.0001;
            return p.xyz / w;
        }

        vec3 projectStereographic(vec4 p) {
            float denom = 1.0 - p.w;
            if (abs(denom) < 0.0001) denom = 0.0001;
            return p.xyz / denom;
        }

        vec3 projectOrthographic(vec4 p) {
            return p.xyz;
        }
    `,

    /**
     * Basic vertex shader for 4D geometry
     */
    vertex4D: `#version 300 es
        precision highp float;

        in vec4 a_position;
        in vec4 a_color;

        uniform mat4 u_modelMatrix;
        uniform mat4 u_viewMatrix;
        uniform mat4 u_projMatrix;
        uniform mat4 u_rotation4D;
        uniform float u_projDistance;

        out vec4 v_color;
        out float v_depth4D;

        ${/* Inject rotation4D and projection4D */ ''}

        void main() {
            // Apply 4D rotation
            vec4 rotated = u_rotation4D * a_position;

            // Project 4D -> 3D
            vec3 projected = projectPerspective(rotated, u_projDistance);

            // Apply 3D transforms
            vec4 worldPos = u_modelMatrix * vec4(projected, 1.0);
            vec4 viewPos = u_viewMatrix * worldPos;
            gl_Position = u_projMatrix * viewPos;

            v_color = a_color;
            v_depth4D = rotated.w;
        }
    `,

    /**
     * Basic fragment shader with W-depth coloring
     */
    fragment4D: `#version 300 es
        precision highp float;

        in vec4 v_color;
        in float v_depth4D;

        uniform float u_wFogDistance;
        uniform bool u_wFogEnabled;

        out vec4 fragColor;

        void main() {
            vec4 color = v_color;

            // W-depth fog
            if (u_wFogEnabled) {
                float fogFactor = clamp(abs(v_depth4D) / u_wFogDistance, 0.0, 1.0);
                color.a *= 1.0 - fogFactor;
            }

            fragColor = color;
        }
    `
};

/**
 * ShaderCache - Caches compiled shaders
 */
export class ShaderCache {
    constructor() {
        /** @type {Map<string, ShaderProgram>} */
        this._cache = new Map();
    }

    /**
     * Get or create shader
     * @param {string} key
     * @param {function(): ShaderProgram} factory
     * @returns {ShaderProgram}
     */
    getOrCreate(key, factory) {
        if (!this._cache.has(key)) {
            this._cache.set(key, factory());
        }
        return this._cache.get(key);
    }

    /**
     * Get shader by key
     * @param {string} key
     * @returns {ShaderProgram|undefined}
     */
    get(key) {
        return this._cache.get(key);
    }

    /**
     * Add shader to cache
     * @param {string} key
     * @param {ShaderProgram} shader
     */
    set(key, shader) {
        this._cache.set(key, shader);
    }

    /**
     * Check if shader exists
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this._cache.has(key);
    }

    /**
     * Clear cache
     */
    clear() {
        for (const shader of this._cache.values()) {
            shader.dispose();
        }
        this._cache.clear();
    }

    /**
     * Get cache size
     * @returns {number}
     */
    get size() {
        return this._cache.size;
    }
}

/**
 * Global shader cache
 */
export const shaderCache = new ShaderCache();

export default ShaderProgram;
