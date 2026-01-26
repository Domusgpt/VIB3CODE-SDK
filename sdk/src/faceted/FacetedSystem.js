/**
 * Faceted System - Clean 2D Geometric Patterns with 4D Rotation
 * Supports 24 geometry variants: 8 base + 8 Hypersphere Core + 8 Hypertetrahedron Core
 * Full 6D rotation mathematics (XY, XZ, YZ, XW, YW, ZW)
 */

export class FacetedSystem {
    constructor() {
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.isActive = false;
        this.time = 0;
        this.parameters = {
            geometry: 0,
            rot4dXY: 0, rot4dXZ: 0, rot4dYZ: 0,
            rot4dXW: 0, rot4dYW: 0, rot4dZW: 0,
            gridDensity: 15,
            morphFactor: 1.0,
            chaos: 0.2,
            speed: 1.0,
            hue: 200,
            intensity: 0.7,
            dimension: 3.5
        };
    }

    /**
     * Initialize faceted system
     * Finds canvas by ID in DOM (matches reference architecture)
     */
    initialize() {
        // Faceted system uses 'content-canvas' as main canvas
        // (Reference system has 5 layers, we're using simplified version for now)
        this.canvas = document.getElementById('content-canvas');
        if (!this.canvas) {
            console.error('❌ Faceted canvas (content-canvas) not found in DOM');
            console.log('Looking for canvas IDs:', ['background-canvas', 'shadow-canvas', 'content-canvas', 'highlight-canvas', 'accent-canvas']);
            return false;
        }

        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error('❌ WebGL not available for Faceted System');
            return false;
        }

        if (!this.createShaderProgram()) {
            console.error('❌ Failed to create faceted shader program');
            return false;
        }

        this.setupCanvasSize();
        console.log('✅ Faceted System initialized on content-canvas');
        return true;
    }

    /**
     * Create shader program with 6D rotation and 24 geometry support
     */
    createShaderProgram() {
        const vertexShader = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fragmentShader = `
            precision highp float;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform float u_geometry;  // 0-23

            // 6D Rotation uniforms
            uniform float u_rot4dXY;
            uniform float u_rot4dXZ;
            uniform float u_rot4dYZ;
            uniform float u_rot4dXW;
            uniform float u_rot4dYW;
            uniform float u_rot4dZW;

            uniform float u_dimension;
            uniform float u_gridDensity;
            uniform float u_morphFactor;
            uniform float u_chaos;
            uniform float u_hue;
            uniform float u_intensity;

            // 6 Rotation matrices for complete 4D rotation
            mat4 rotateXY(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    c, -s, 0, 0,
                    s, c, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1
                );
            }

            mat4 rotateXZ(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    c, 0, -s, 0,
                    0, 1, 0, 0,
                    s, 0, c, 0,
                    0, 0, 0, 1
                );
            }

            mat4 rotateYZ(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    1, 0, 0, 0,
                    0, c, -s, 0,
                    0, s, c, 0,
                    0, 0, 0, 1
                );
            }

            mat4 rotateXW(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    c, 0, 0, -s,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    s, 0, 0, c
                );
            }

            mat4 rotateYW(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    1, 0, 0, 0,
                    0, c, 0, -s,
                    0, 0, 1, 0,
                    0, s, 0, c
                );
            }

            mat4 rotateZW(float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return mat4(
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, c, -s,
                    0, 0, s, c
                );
            }

            // Apply all 6 rotations
            vec4 apply6DRotation(vec4 pos) {
                pos = rotateXY(u_rot4dXY + u_time * 0.05) * pos;
                pos = rotateXZ(u_rot4dXZ + u_time * 0.06) * pos;
                pos = rotateYZ(u_rot4dYZ + u_time * 0.04) * pos;
                pos = rotateXW(u_rot4dXW + u_time * 0.07) * pos;
                pos = rotateYW(u_rot4dYW + u_time * 0.08) * pos;
                pos = rotateZW(u_rot4dZW + u_time * 0.09) * pos;
                return pos;
            }

            // Base geometry SDFs (0-7)
            float baseGeometry(vec4 p, float type) {
                if (type < 0.5) {
                    // Tetrahedron
                    return max(max(max(abs(p.x + p.y) - p.z, abs(p.x - p.y) - p.z),
                                   abs(p.x + p.y) + p.z), abs(p.x - p.y) + p.z) / sqrt(3.0);
                } else if (type < 1.5) {
                    // Hypercube
                    vec4 q = abs(p) - 0.8;
                    return length(max(q, 0.0)) + min(max(max(max(q.x, q.y), q.z), q.w), 0.0);
                } else if (type < 2.5) {
                    // Sphere
                    return length(p) - 1.0;
                } else if (type < 3.5) {
                    // Torus
                    vec2 t = vec2(length(p.xy) - 0.8, p.z);
                    return length(t) - 0.3;
                } else if (type < 4.5) {
                    // Klein Bottle (simplified)
                    float r = length(p.xy);
                    return abs(r - 0.7) - 0.2 + sin(atan(p.y, p.x) * 3.0 + p.z * 5.0) * 0.1;
                } else if (type < 5.5) {
                    // Fractal (Mandelbulb approximation)
                    return length(p) - 0.8 + sin(p.x * 5.0) * sin(p.y * 5.0) * sin(p.z * 5.0) * 0.2;
                } else if (type < 6.5) {
                    // Wave
                    return abs(p.z - sin(p.x * 5.0 + u_time) * cos(p.y * 5.0 + u_time) * 0.3) - 0.1;
                } else {
                    // Crystal
                    vec4 q = abs(p);
                    return max(max(max(q.x, q.y), q.z), q.w) - 0.8;
                }
            }

            // Hypersphere Core wrapper (8-15)
            float hypersphereCore(vec4 p, float baseType) {
                float baseShape = baseGeometry(p, baseType);
                float sphereField = length(p) - 1.2;
                return max(baseShape, sphereField);  // Intersection
            }

            // Hypertetrahedron Core wrapper (16-23)
            float hypertetrahedronCore(vec4 p, float baseType) {
                float baseShape = baseGeometry(p, baseType);
                float tetraField = max(max(max(
                    abs(p.x + p.y) - p.z - p.w,
                    abs(p.x - p.y) - p.z + p.w),
                    abs(p.x + p.y) + p.z - p.w),
                    abs(p.x - p.y) + p.z + p.w) / sqrt(4.0);
                return max(baseShape, tetraField);  // Intersection
            }

            // Main geometry dispatcher (0-23)
            float geometry(vec4 p, float type) {
                if (type < 8.0) {
                    // Base geometries (0-7)
                    return baseGeometry(p, type);
                } else if (type < 16.0) {
                    // Hypersphere Core (8-15)
                    return hypersphereCore(p, type - 8.0);
                } else {
                    // Hypertetrahedron Core (16-23)
                    return hypertetrahedronCore(p, type - 16.0);
                }
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
                uv *= 2.0 / u_gridDensity;

                // Create 4D point
                vec4 pos = vec4(uv, sin(u_time * 0.3) * 0.5, cos(u_time * 0.2) * 0.5);

                // Apply full 6D rotation
                pos = apply6DRotation(pos);

                // Apply morphing
                pos *= u_morphFactor;
                pos += vec4(sin(u_time * 0.1), cos(u_time * 0.15), sin(u_time * 0.12), cos(u_time * 0.18)) * u_chaos;

                // Get distance
                float dist = geometry(pos, u_geometry);

                // Faceted rendering (sharp edges)
                float edge = smoothstep(0.02, 0.0, abs(dist));
                float fill = smoothstep(0.1, 0.0, dist) * 0.3;

                // Color based on hue and distance
                float hueVal = u_hue / 360.0 + dist * 0.2 + u_time * 0.05;
                vec3 color = vec3(
                    0.5 + 0.5 * cos(hueVal * 6.28),
                    0.5 + 0.5 * cos((hueVal + 0.33) * 6.28),
                    0.5 + 0.5 * cos((hueVal + 0.67) * 6.28)
                );

                float alpha = (edge + fill) * u_intensity;
                gl_FragColor = vec4(color * alpha, alpha);
            }
        `;

        this.program = this.compileProgram(vertexShader, fragmentShader);
        if (!this.program) return false;

        // Create fullscreen quad
        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        return true;
    }

    /**
     * Compile shader program
     */
    compileProgram(vertexSource, fragmentSource) {
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);

        if (!vertexShader || !fragmentShader) return null;

        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    /**
     * Compile individual shader
     */
    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    /**
     * Setup canvas size
     */
    setupCanvasSize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || 800;
        this.canvas.height = rect.height || 600;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Start rendering
     */
    start() {
        // Initialize if not already done
        if (!this.gl || !this.program) {
            if (!this.initialize()) {
                console.error('❌ FacetedSystem failed to initialize on start');
                return;
            }
        }
        this.isActive = true;
        this.render();
        console.log('🔷 Faceted System started');
    }

    /**
     * Stop rendering
     */
    stop() {
        this.isActive = false;
        console.log('🔷 Faceted System stopped');
    }

    /**
     * Set active state
     */
    setActive(active) {
        if (active) {
            this.start();
        } else {
            this.stop();
        }
    }

    /**
     * Render loop
     */
    render() {
        if (!this.isActive || !this.gl || !this.program) return;

        this.time += 0.016 * this.parameters.speed;

        this.gl.useProgram(this.program);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Set uniforms
        const uniforms = {
            u_time: this.time,
            u_resolution: [this.canvas.width, this.canvas.height],
            u_geometry: this.parameters.geometry,
            u_rot4dXY: this.parameters.rot4dXY,
            u_rot4dXZ: this.parameters.rot4dXZ,
            u_rot4dYZ: this.parameters.rot4dYZ,
            u_rot4dXW: this.parameters.rot4dXW,
            u_rot4dYW: this.parameters.rot4dYW,
            u_rot4dZW: this.parameters.rot4dZW,
            u_dimension: this.parameters.dimension,
            u_gridDensity: this.parameters.gridDensity * 0.1,
            u_morphFactor: this.parameters.morphFactor,
            u_chaos: this.parameters.chaos,
            u_hue: this.parameters.hue,
            u_intensity: this.parameters.intensity
        };

        Object.entries(uniforms).forEach(([name, value]) => {
            const location = this.gl.getUniformLocation(this.program, name);
            if (location !== null) {
                if (Array.isArray(value)) {
                    this.gl.uniform2fv(location, value);
                } else {
                    this.gl.uniform1f(location, value);
                }
            }
        });

        // Draw fullscreen quad
        const posLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(posLocation);
        this.gl.vertexAttribPointer(posLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);

        requestAnimationFrame(() => this.render());
    }

    /**
     * Update parameters
     */
    updateParameters(params) {
        Object.assign(this.parameters, params);
    }

    /**
     * Set variant (0-29) - maps to geometry (0-7)
     * Each geometry has 4 sub-variants
     */
    setVariant(variant) {
        const geometry = Math.floor(variant / 4);
        this.parameters.geometry = geometry;
        console.log(`🔷 Faceted variant ${variant} → geometry ${geometry}`);
    }
}
