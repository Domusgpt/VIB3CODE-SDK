/**
 * VIB3+ Unified SDK
 * Clean, simple API for 4D geometry visualization
 *
 * Usage:
 *   const vib3 = new VIB3('#canvas');
 *   vib3.setGeometry('hypercube');
 *   vib3.setRotation({ xw: 0.5, zw: 0.3 });
 *   vib3.start();
 *   vib3.exportPNG();
 */

// Geometry type mapping
const GEOMETRIES = {
    tetrahedron: 0, tetra: 0,
    hypercube: 1, cube: 1, tesseract: 1,
    sphere: 2,
    torus: 3,
    klein: 4, kleinbottle: 4,
    fractal: 5,
    wave: 6,
    crystal: 7
};

// Default shader for basic visualization
const VERTEX_SHADER = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_geometry;
uniform float u_rotXY, u_rotXZ, u_rotYZ, u_rotXW, u_rotYW, u_rotZW;
uniform float u_gridDensity;
uniform float u_morphFactor;
uniform float u_hue;
uniform float u_intensity;

// 4D rotation matrices
mat4 rotXY(float t) { float c=cos(t),s=sin(t); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotXZ(float t) { float c=cos(t),s=sin(t); return mat4(c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1); }
mat4 rotYZ(float t) { float c=cos(t),s=sin(t); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotXW(float t) { float c=cos(t),s=sin(t); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotYW(float t) { float c=cos(t),s=sin(t); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotZW(float t) { float c=cos(t),s=sin(t); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

vec3 project4Dto3D(vec4 p) {
    float w = 2.0 / (2.0 + p.w);
    return p.xyz * w;
}

// Geometry functions
float tetraLattice(vec3 p, float d) {
    vec3 q = fract(p * d) - 0.5;
    return 1.0 - smoothstep(0.0, 0.06, min(length(q), length(q - vec3(0.35, 0.0, 0.0))));
}

float cubeLattice(vec3 p, float d) {
    vec3 g = fract(p * d);
    vec3 e = min(g, 1.0 - g);
    return 1.0 - smoothstep(0.0, 0.04, min(min(e.x, e.y), e.z));
}

float sphereLattice(vec3 p, float d) {
    return 1.0 - smoothstep(0.15, 0.25, length(fract(p * d) - 0.5));
}

float torusLattice(vec3 p, float d) {
    vec3 c = fract(p * d) - 0.5;
    return 1.0 - smoothstep(0.08, 0.12, length(vec2(length(c.xy) - 0.3, c.z)));
}

float kleinLattice(vec3 p, float d) {
    vec3 c = fract(p * d) - 0.5;
    float u = atan(c.y, c.x) / 3.14159;
    float x = (2.0 + cos(u * 0.5)) * cos(u) * 0.1;
    float y = (2.0 + cos(u * 0.5)) * sin(u) * 0.1;
    return 1.0 - smoothstep(0.1, 0.15, length(c.xy - vec2(x, y)));
}

float fractalLattice(vec3 p, float d) {
    vec3 c = abs(fract(p * d) * 2.0 - 1.0);
    float dist = length(max(abs(c) - 0.3, 0.0));
    for(int i = 0; i < 3; i++) {
        c = abs(c * 2.0 - 1.0);
        dist = min(dist, length(max(abs(c) - 0.3, 0.0)) / pow(2.0, float(i+1)));
    }
    return 1.0 - smoothstep(0.0, 0.05, dist);
}

float waveLattice(vec3 p, float d) {
    return abs(sin(p.x * d * 2.0 + u_time) * sin(p.y * d * 1.8 + u_time * 0.7));
}

float crystalLattice(vec3 p, float d) {
    vec3 c = fract(p * d) - 0.5;
    float crystal = max(max(abs(c.x)+abs(c.y), abs(c.y)+abs(c.z)), abs(c.x)+abs(c.z));
    return 1.0 - smoothstep(0.3, 0.4, crystal);
}

float getGeometry(vec3 p, float g, float d) {
    int geom = int(g);
    if (geom == 0) return tetraLattice(p, d);
    if (geom == 1) return cubeLattice(p, d);
    if (geom == 2) return sphereLattice(p, d);
    if (geom == 3) return torusLattice(p, d);
    if (geom == 4) return kleinLattice(p, d);
    if (geom == 5) return fractalLattice(p, d);
    if (geom == 6) return waveLattice(p, d);
    return crystalLattice(p, d);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);

    // Create 4D point
    vec4 p = vec4(uv * 2.5, sin(u_time * 0.3), cos(u_time * 0.2));

    // Apply 6D rotations
    p = rotXY(u_rotXY) * p;
    p = rotXZ(u_rotXZ) * p;
    p = rotYZ(u_rotYZ) * p;
    p = rotXW(u_rotXW) * p;
    p = rotYW(u_rotYW) * p;
    p = rotZW(u_rotZW) * p;

    // Project to 3D
    vec3 p3 = project4Dto3D(p);

    // Get geometry value
    float v = getGeometry(p3 * u_morphFactor, u_geometry, u_gridDensity);

    // Color
    float h = u_hue + atan(uv.y, uv.x) / 6.28 * 0.2 + u_time * 0.02;
    vec3 col = 0.5 + 0.5 * cos(6.28 * (h + vec3(0.0, 0.33, 0.67)));
    col *= pow(v, 1.2) * u_intensity;
    col += vec3(0.0, 0.2, 0.4) * v * 0.3;

    gl_FragColor = vec4(col, 1.0);
}
`;

export class VIB3 {
    constructor(canvasOrSelector) {
        // Get canvas element
        if (typeof canvasOrSelector === 'string') {
            this.canvas = document.querySelector(canvasOrSelector);
        } else if (canvasOrSelector instanceof HTMLCanvasElement) {
            this.canvas = canvasOrSelector;
        } else {
            throw new Error('VIB3: Provide a canvas element or CSS selector');
        }

        if (!this.canvas) {
            throw new Error('VIB3: Canvas not found');
        }

        // Initialize WebGL
        this.gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ||
                  this.canvas.getContext('webgl', { preserveDrawingBuffer: true });

        if (!this.gl) {
            throw new Error('VIB3: WebGL not available');
        }

        // Parameters
        this.params = {
            geometry: 1,        // hypercube
            rotXY: 0, rotXZ: 0, rotYZ: 0,
            rotXW: 0, rotYW: 0, rotZW: 0,
            gridDensity: 4,
            morphFactor: 1.0,
            hue: 0.6,
            intensity: 1.0,
            speed: 1.0
        };

        this.time = 0;
        this.running = false;
        this.startTime = Date.now();

        // Setup
        this._resize();
        this._createProgram();
        this._createBuffer();

        // Auto-resize
        this._resizeHandler = () => this._resize();
        window.addEventListener('resize', this._resizeHandler);

        console.log('VIB3+ SDK initialized');
    }

    // === PUBLIC API ===

    /**
     * Set geometry type
     * @param {string|number} geometry - Name ('hypercube') or index (0-7)
     */
    setGeometry(geometry) {
        if (typeof geometry === 'string') {
            const key = geometry.toLowerCase().replace(/[^a-z]/g, '');
            this.params.geometry = GEOMETRIES[key] ?? 1;
        } else {
            this.params.geometry = Math.floor(geometry) % 8;
        }
        return this;
    }

    /**
     * Set 4D rotation angles
     * @param {object} rotations - { xy, xz, yz, xw, yw, zw } in radians
     */
    setRotation(rotations) {
        if (rotations.xy !== undefined) this.params.rotXY = rotations.xy;
        if (rotations.xz !== undefined) this.params.rotXZ = rotations.xz;
        if (rotations.yz !== undefined) this.params.rotYZ = rotations.yz;
        if (rotations.xw !== undefined) this.params.rotXW = rotations.xw;
        if (rotations.yw !== undefined) this.params.rotYW = rotations.yw;
        if (rotations.zw !== undefined) this.params.rotZW = rotations.zw;
        return this;
    }

    /**
     * Set visual parameters
     * @param {object} params - { gridDensity, morphFactor, hue, intensity, speed }
     */
    setParams(params) {
        Object.assign(this.params, params);
        return this;
    }

    /**
     * Start animation loop
     */
    start() {
        if (this.running) return this;
        this.running = true;
        this._loop();
        return this;
    }

    /**
     * Stop animation loop
     */
    stop() {
        this.running = false;
        return this;
    }

    /**
     * Render single frame
     */
    render() {
        this._render();
        return this;
    }

    /**
     * Export current frame as PNG
     * @param {string} filename - Optional filename
     */
    exportPNG(filename = `vib3-${Date.now()}.png`) {
        this._render();
        const link = document.createElement('a');
        link.download = filename;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
        return this;
    }

    /**
     * Get current frame as data URL
     */
    toDataURL(type = 'image/png') {
        this._render();
        return this.canvas.toDataURL(type);
    }

    /**
     * Get current frame as Blob
     */
    async toBlob(type = 'image/png') {
        this._render();
        return new Promise(resolve => {
            this.canvas.toBlob(resolve, type);
        });
    }

    /**
     * Record frames for animation
     * @param {number} duration - Duration in seconds
     * @param {number} fps - Frames per second
     * @returns {Promise<string[]>} Array of data URLs
     */
    async recordFrames(duration = 3, fps = 30) {
        const frames = [];
        const frameCount = Math.floor(duration * fps);
        const frameTime = 1000 / fps;

        for (let i = 0; i < frameCount; i++) {
            this._render();
            frames.push(this.canvas.toDataURL('image/png'));
            this.time += frameTime * 0.001 * this.params.speed;
            await new Promise(r => setTimeout(r, 1));
        }

        return frames;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        window.removeEventListener('resize', this._resizeHandler);
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }
    }

    // === PRIVATE METHODS ===

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _createProgram() {
        const gl = this.gl;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, VERTEX_SHADER);
        gl.compileShader(vs);

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, FRAGMENT_SHADER);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        // Get uniform locations
        this.uniforms = {};
        ['u_resolution', 'u_time', 'u_geometry',
         'u_rotXY', 'u_rotXZ', 'u_rotYZ', 'u_rotXW', 'u_rotYW', 'u_rotZW',
         'u_gridDensity', 'u_morphFactor', 'u_hue', 'u_intensity'].forEach(name => {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        });
    }

    _createBuffer() {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

        const pos = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    }

    _render() {
        const gl = this.gl;
        const p = this.params;
        const u = this.uniforms;

        gl.useProgram(this.program);

        gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(u.u_time, this.time);
        gl.uniform1f(u.u_geometry, p.geometry);
        gl.uniform1f(u.u_rotXY, p.rotXY);
        gl.uniform1f(u.u_rotXZ, p.rotXZ);
        gl.uniform1f(u.u_rotYZ, p.rotYZ);
        gl.uniform1f(u.u_rotXW, p.rotXW);
        gl.uniform1f(u.u_rotYW, p.rotYW);
        gl.uniform1f(u.u_rotZW, p.rotZW);
        gl.uniform1f(u.u_gridDensity, p.gridDensity);
        gl.uniform1f(u.u_morphFactor, p.morphFactor);
        gl.uniform1f(u.u_hue, p.hue);
        gl.uniform1f(u.u_intensity, p.intensity);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    _loop() {
        if (!this.running) return;

        this.time = (Date.now() - this.startTime) * 0.001 * this.params.speed;
        this._render();
        requestAnimationFrame(() => this._loop());
    }
}

// Browser global
if (typeof window !== 'undefined') {
    window.VIB3 = VIB3;
}

export default VIB3;
