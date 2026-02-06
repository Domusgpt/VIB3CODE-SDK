/**
 * Phillips Renderer - Gaussian Flat Rendering System
 *
 * A novel, high-efficiency WebGL rendering architecture for 3D Gaussian Splats
 * designed for AI semantic analysis. This system implements "Gaussian Flat" rendering
 * which removes view-dependent effects (Spherical Harmonics) to create "Canonical Views"
 * that are deterministic and highly compressible (~17 bytes/splat).
 *
 * The system uses the Plastic Ratio (ρ ≈ 1.3247) for low-discrepancy sampling
 * to prevent moiré patterns in flat visualizations.
 *
 * @module systems/PhillipsRenderer
 * @example
 * import { PhillipsRenderer } from './PhillipsRenderer.js';
 *
 * const renderer = new PhillipsRenderer('canvas-id');
 * renderer.setPoints([
 *     { x: 0, y: 0, z: 0, scale: 1.0, color: 0xFFFF },
 *     { x: 1, y: 0, z: 0, scale: 0.8, color: 0xF800 }
 * ]);
 * renderer.render();
 */

import {
    PLASTIC_CONSTANT,
    getPlasticPower,
    getPlasticScaleFactor,
    packRGB565,
    unpackRGB565
} from '../math/Plastic.js';

/**
 * Phillips Renderer Class
 *
 * Implements the "Gaussian Flat" shader architecture for deterministic,
 * albedo-only rendering without lighting or specular calculations.
 */
export class PhillipsRenderer {
    /**
     * Create a Phillips Renderer instance
     *
     * @param {string|HTMLCanvasElement} canvas - Canvas element or ID
     * @param {Object} [options={}] - Renderer options
     * @param {boolean} [options.alpha=true] - Enable alpha blending
     * @param {boolean} [options.antialias=false] - Enable antialiasing
     * @param {number} [options.plasticScale=1.0] - Global Plastic scale factor
     * @param {string} [options.blendMode='alpha'] - Blend mode: 'alpha' or 'opaque'
     */
    constructor(canvas, options = {}) {
        // Resolve canvas element
        if (typeof canvas === 'string') {
            this.canvas = document.getElementById(canvas);
        } else {
            this.canvas = canvas;
        }

        if (!this.canvas) {
            throw new Error('PhillipsRenderer: Canvas not found');
        }

        // Configuration
        this.options = {
            alpha: options.alpha !== false,
            antialias: options.antialias || false,
            plasticScale: options.plasticScale || 1.0,
            blendMode: options.blendMode || 'alpha'
        };

        // WebGL context options
        this.contextOptions = {
            alpha: this.options.alpha,
            depth: true,
            stencil: false,
            antialias: this.options.antialias,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false
        };

        // Initialize WebGL
        this.gl = this.canvas.getContext('webgl2', this.contextOptions) ||
                  this.canvas.getContext('webgl', this.contextOptions) ||
                  this.canvas.getContext('experimental-webgl', this.contextOptions);

        if (!this.gl) {
            console.error('PhillipsRenderer: WebGL not supported');
            this.showWebGLError();
            throw new Error('WebGL not supported');
        }

        // Rendering state
        this.points = [];
        this.pointCount = 0;
        this.plasticScale = this.options.plasticScale;
        this.viewMatrix = this.createIdentityMatrix();
        this.projectionMatrix = this.createIdentityMatrix();

        // Camera properties
        this.cameraDistance = 5.0;
        this.cameraFov = 60.0;

        // Initialize shaders and buffers
        this.initShaders();
        this.initBuffers();
        this.resize();

        // Time tracking
        this.startTime = Date.now();
    }

    /**
     * Initialize the vertex and fragment shaders
     * Implements the "Flat Shader" - pure albedo, no lighting
     */
    initShaders() {
        // Vertex Shader - Lightweight projection
        const vertexShaderSource = `
            attribute vec3 a_position;
            attribute float a_scale;
            attribute vec3 a_color;

            uniform mat4 u_viewMatrix;
            uniform mat4 u_projectionMatrix;
            uniform float u_plasticScale;
            uniform vec2 u_resolution;

            varying vec3 v_color;
            varying float v_pointSize;

            void main() {
                // Apply view transformation
                vec4 viewPos = u_viewMatrix * vec4(a_position, 1.0);

                // Project to clip space
                vec4 clipPos = u_projectionMatrix * viewPos;
                gl_Position = clipPos;

                // Calculate point size based on distance and Plastic scale
                // Using Plastic Ratio for scale modulation
                float distance = length(viewPos.xyz);
                float baseSize = a_scale * u_plasticScale;

                // Perspective-correct point size
                float projectedSize = baseSize * u_resolution.y / distance;

                // Clamp to reasonable range
                gl_PointSize = clamp(projectedSize, 1.0, 64.0);

                // Pass color and size to fragment shader
                v_color = a_color;
                v_pointSize = gl_PointSize;
            }
        `;

        // Fragment Shader - The Flat Shader
        // CRUCIAL: No lighting, specular, or SH calculations
        const fragmentShaderSource = `
            precision highp float;

            varying vec3 v_color;
            varying float v_pointSize;

            void main() {
                // Calculate distance from center of point sprite
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);

                // Soft circular falloff for Gaussian-like appearance
                // Using smooth step for soft edges
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

                // Discard pixels outside the circle
                if (alpha < 0.01) {
                    discard;
                }

                // OUTPUT: Pure flat albedo color
                // No lighting calculations, no specular, no SH
                gl_FragColor = vec4(v_color, alpha);
            }
        `;

        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);

        // Get uniform locations
        this.uniforms = {
            viewMatrix: this.gl.getUniformLocation(this.program, 'u_viewMatrix'),
            projectionMatrix: this.gl.getUniformLocation(this.program, 'u_projectionMatrix'),
            plasticScale: this.gl.getUniformLocation(this.program, 'u_plasticScale'),
            resolution: this.gl.getUniformLocation(this.program, 'u_resolution')
        };

        // Get attribute locations
        this.attributes = {
            position: this.gl.getAttribLocation(this.program, 'a_position'),
            scale: this.gl.getAttribLocation(this.program, 'a_scale'),
            color: this.gl.getAttribLocation(this.program, 'a_color')
        };
    }

    /**
     * Create and compile a shader program
     *
     * @param {string} vertexSource - Vertex shader source
     * @param {string} fragmentSource - Fragment shader source
     * @returns {WebGLProgram} Compiled and linked program
     */
    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);

        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(program);
            throw new Error('PhillipsRenderer: Program linking failed: ' + error);
        }

        return program;
    }

    /**
     * Create and compile a shader
     *
     * @param {number} type - Shader type (VERTEX_SHADER or FRAGMENT_SHADER)
     * @param {string} source - Shader source code
     * @returns {WebGLShader} Compiled shader
     */
    createShader(type, source) {
        if (!this.gl || this.gl.isContextLost()) {
            throw new Error('PhillipsRenderer: WebGL context is invalid');
        }

        const shader = this.gl.createShader(type);
        if (!shader) {
            throw new Error('PhillipsRenderer: Failed to create shader object');
        }

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = this.gl.getShaderInfoLog(shader);
            const shaderType = type === this.gl.VERTEX_SHADER ? 'vertex' : 'fragment';
            throw new Error(`PhillipsRenderer: ${shaderType} shader compilation failed: ${error}`);
        }

        return shader;
    }

    /**
     * Initialize vertex buffers for point rendering
     */
    initBuffers() {
        // Position buffer (vec3)
        this.positionBuffer = this.gl.createBuffer();

        // Scale buffer (float)
        this.scaleBuffer = this.gl.createBuffer();

        // Color buffer (vec3)
        this.colorBuffer = this.gl.createBuffer();
    }

    /**
     * Set the points to render
     *
     * @param {Array<Object>} points - Array of point objects
     * @param {number} points[].x - X position
     * @param {number} points[].y - Y position
     * @param {number} points[].z - Z position
     * @param {number} points[].scale - Point scale (Plastic-modulated)
     * @param {number|Object} points[].color - RGB565 packed color or {r,g,b} object
     * @example
     * renderer.setPoints([
     *     { x: 0, y: 0, z: 0, scale: 1.0, color: { r: 255, g: 128, b: 64 } },
     *     { x: 1, y: 0, z: 0, scale: 0.8, color: 0xF800 } // RGB565 red
     * ]);
     */
    setPoints(points) {
        this.points = points;
        this.pointCount = points.length;

        if (this.pointCount === 0) {
            return;
        }

        // Prepare typed arrays
        const positions = new Float32Array(this.pointCount * 3);
        const scales = new Float32Array(this.pointCount);
        const colors = new Float32Array(this.pointCount * 3);

        for (let i = 0; i < this.pointCount; i++) {
            const p = points[i];

            // Position
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;

            // Scale - Apply Plastic power modulation
            const plasticModulatedScale = p.scale * getPlasticPower(i % 5 - 2);
            scales[i] = Math.max(0.1, plasticModulatedScale);

            // Color - Handle both RGB565 and RGB object formats
            let r, g, b;
            if (typeof p.color === 'number') {
                // RGB565 packed format
                const unpacked = unpackRGB565(p.color);
                r = unpacked.r / 255;
                g = unpacked.g / 255;
                b = unpacked.b / 255;
            } else if (p.color && typeof p.color === 'object') {
                // RGB object format
                r = (p.color.r || 0) / 255;
                g = (p.color.g || 0) / 255;
                b = (p.color.b || 0) / 255;
            } else {
                // Default white
                r = g = b = 1.0;
            }

            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        // Upload to GPU
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.scaleBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, scales, this.gl.DYNAMIC_DRAW);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    }

    /**
     * Set the global Plastic scale factor
     *
     * @param {number} scale - Scale factor (default 1.0)
     */
    setPlasticScale(scale) {
        this.plasticScale = scale;
    }

    /**
     * Set camera position
     *
     * @param {number} distance - Distance from origin
     * @param {number} [fov=60] - Field of view in degrees
     */
    setCamera(distance, fov = 60) {
        this.cameraDistance = distance;
        this.cameraFov = fov;
        this.updateProjectionMatrix();
    }

    /**
     * Create a simple view matrix (look at origin from +Z)
     *
     * @param {number} distance - Distance from origin
     * @returns {Float32Array} 4x4 view matrix
     */
    createViewMatrix(distance) {
        const matrix = new Float32Array(16);
        // Identity with translation
        matrix[0] = 1; matrix[5] = 1; matrix[10] = 1; matrix[15] = 1;
        matrix[14] = -distance; // Translate back
        return matrix;
    }

    /**
     * Create a perspective projection matrix
     *
     * @param {number} fov - Field of view in degrees
     * @param {number} aspect - Aspect ratio
     * @param {number} near - Near plane
     * @param {number} far - Far plane
     * @returns {Float32Array} 4x4 projection matrix
     */
    createPerspectiveMatrix(fov, aspect, near, far) {
        const matrix = new Float32Array(16);
        const f = 1.0 / Math.tan(fov * Math.PI / 360);

        matrix[0] = f / aspect;
        matrix[5] = f;
        matrix[10] = (far + near) / (near - far);
        matrix[11] = -1;
        matrix[14] = (2 * far * near) / (near - far);

        return matrix;
    }

    /**
     * Create an identity 4x4 matrix
     *
     * @returns {Float32Array} Identity matrix
     */
    createIdentityMatrix() {
        const matrix = new Float32Array(16);
        matrix[0] = 1; matrix[5] = 1; matrix[10] = 1; matrix[15] = 1;
        return matrix;
    }

    /**
     * Update projection matrix based on current canvas size
     */
    updateProjectionMatrix() {
        const aspect = this.canvas.width / this.canvas.height;
        this.projectionMatrix = this.createPerspectiveMatrix(
            this.cameraFov, aspect, 0.1, 1000
        );
        this.viewMatrix = this.createViewMatrix(this.cameraDistance);
    }

    /**
     * Handle canvas resize
     */
    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.updateProjectionMatrix();
        }
    }

    /**
     * Render the current set of points
     */
    render() {
        if (!this.program || this.pointCount === 0) {
            return;
        }

        this.resize();

        const gl = this.gl;

        // Clear with black background
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Enable depth testing
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // Enable blending for soft edges
        if (this.options.blendMode === 'alpha') {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.disable(gl.BLEND);
        }

        // Use program
        gl.useProgram(this.program);

        // Set uniforms
        gl.uniformMatrix4fv(this.uniforms.viewMatrix, false, this.viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, this.projectionMatrix);
        gl.uniform1f(this.uniforms.plasticScale, this.plasticScale * PLASTIC_CONSTANT);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);

        // Bind position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

        // Bind scale attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.scaleBuffer);
        gl.enableVertexAttribArray(this.attributes.scale);
        gl.vertexAttribPointer(this.attributes.scale, 1, gl.FLOAT, false, 0, 0);

        // Bind color attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.enableVertexAttribArray(this.attributes.color);
        gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

        // Draw points
        gl.drawArrays(gl.POINTS, 0, this.pointCount);
    }

    /**
     * Start animation loop
     *
     * @param {Function} [onFrame] - Optional callback called each frame
     */
    startAnimationLoop(onFrame = null) {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);

            if (onFrame) {
                onFrame(Date.now() - this.startTime);
            }

            this.render();
        };

        animate();
    }

    /**
     * Stop animation loop
     */
    stopAnimationLoop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Export current frame as PNG
     *
     * @returns {string} Data URL of the rendered image
     */
    exportFrame() {
        this.render();
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Get serialized point data for compression
     * Target: ~17 bytes per splat
     *
     * @returns {ArrayBuffer} Packed point data
     */
    getPackedData() {
        // Format per splat (17 bytes):
        // - Position: 3 x float16 (6 bytes)
        // - Scale: 1 x uint8 (1 byte)
        // - Color: RGB565 (2 bytes)
        // - Reserved: 8 bytes for future use

        const bytesPerSplat = 17;
        const buffer = new ArrayBuffer(this.pointCount * bytesPerSplat);
        const view = new DataView(buffer);

        for (let i = 0; i < this.pointCount; i++) {
            const offset = i * bytesPerSplat;
            const p = this.points[i];

            // Position as float16 (using float32 conversion)
            // Note: For true float16, a polyfill would be needed
            view.setFloat32(offset, p.x, true);
            view.setFloat32(offset + 4, p.y, true);
            view.setFloat32(offset + 8, p.z, true);

            // Scale as uint8 (0-255 maps to 0.0-2.5)
            view.setUint8(offset + 12, Math.min(255, Math.floor(p.scale * 100)));

            // Color as RGB565
            let color565;
            if (typeof p.color === 'number') {
                color565 = p.color;
            } else if (p.color && typeof p.color === 'object') {
                color565 = packRGB565(p.color.r || 0, p.color.g || 0, p.color.b || 0);
            } else {
                color565 = 0xFFFF; // White
            }
            view.setUint16(offset + 13, color565, true);
        }

        return buffer;
    }

    /**
     * Show user-friendly WebGL error message
     */
    showWebGLError() {
        if (!this.canvas) return;

        const ctx = this.canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = '#ff6464';
            ctx.font = '16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WebGL Required', this.canvas.width / 2, this.canvas.height / 2);
            ctx.fillStyle = '#888';
            ctx.font = '12px monospace';
            ctx.fillText('Please enable WebGL in your browser',
                this.canvas.width / 2, this.canvas.height / 2 + 25);
        }
    }

    /**
     * Clean up WebGL resources
     */
    dispose() {
        this.stopAnimationLoop();

        if (this.gl) {
            this.gl.deleteBuffer(this.positionBuffer);
            this.gl.deleteBuffer(this.scaleBuffer);
            this.gl.deleteBuffer(this.colorBuffer);
            this.gl.deleteProgram(this.program);
        }

        this.points = [];
        this.pointCount = 0;
    }
}

export default PhillipsRenderer;
