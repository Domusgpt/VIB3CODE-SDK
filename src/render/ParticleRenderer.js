/**
 * ParticleRenderer — Lightweight instanced renderer for 200K+ particles.
 *
 * Design:
 *   - Two GPU buffers updated every frame via bufferSubData:
 *       positionBuffer: Float32Array(count * 2)  — x, y per particle
 *       attribBuffer:   Uint8Array(count * 4)    — colorIdx, state, size, glow
 *   - Additive blending (no depth sort needed — bright areas glow naturally)
 *   - Gaussian falloff fragment shader with per-particle color from palette
 *   - Billboard quads sized 2–6px, Z derived from plane tilt uniforms
 *
 * Performance budget @ 200K particles:
 *   ~1.6 MB positions + 0.8 MB attributes = 2.4 MB upload/frame
 *   bufferSubData avoids reallocation
 */

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const PARTICLE_VERTEX = `#version 300 es
precision highp float;

// Per-vertex (quad corner)
in vec2 a_corner;

// Per-instance
in vec2 a_position;   // world XY
in vec4 a_attrib;     // colorIdx, state, size, glow  (0-255 each, normalized)

// Uniforms
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
uniform vec2 u_viewport;
uniform float u_time;
uniform vec3 u_planeTiltA;   // plane normal for red (tilt axis + angle encoded)
uniform vec3 u_planeTiltB;   // plane normal for yellow
uniform vec3 u_planeTiltC;   // plane normal for blue

out vec2 v_uv;
out vec3 v_color;
out float v_glow;
out float v_state;

// Color palette: Red, Yellow, Blue + captured tints
vec3 getPalette(float idx) {
    int i = int(idx * 255.0 + 0.5);
    if (i == 0) return vec3(1.0, 0.15, 0.12);       // Red
    if (i == 1) return vec3(1.0, 0.85, 0.1);         // Yellow
    if (i == 2) return vec3(0.15, 0.4, 1.0);          // Blue
    if (i == 3) return vec3(1.0, 0.5, 0.05);          // Orange (R captured by Y)
    if (i == 4) return vec3(0.6, 0.1, 0.8);           // Purple (R captured by B)
    if (i == 5) return vec3(0.1, 0.9, 0.3);           // Green  (Y captured by B)
    if (i == 6) return vec3(1.0, 0.65, 0.4);          // Peach  (Y captured by R)
    if (i == 7) return vec3(0.4, 0.2, 0.7);           // Indigo (B captured by R)
    if (i == 8) return vec3(0.2, 0.7, 0.9);           // Teal   (B captured by Y)
    // Crystal colors (9-11)
    if (i == 9)  return vec3(1.0, 0.3, 0.2);          // Red crystal
    if (i == 10) return vec3(1.0, 0.95, 0.3);         // Yellow crystal
    if (i == 11) return vec3(0.3, 0.5, 1.0);          // Blue crystal
    return vec3(0.5);
}

float getPlaneZ(vec2 pos, float colorIdx) {
    int i = int(colorIdx * 255.0 + 0.5);
    vec3 tilt;
    if (i <= 0 || i == 3 || i == 6 || i == 9)      tilt = u_planeTiltA;
    else if (i == 1 || i == 4 || i == 5 || i == 10) tilt = u_planeTiltB;
    else                                              tilt = u_planeTiltC;
    // Z = dot(pos, tilt.xy) * tilt.z  (tilt.z = angle magnitude)
    return dot(pos, tilt.xy) * tilt.z;
}

void main() {
    float colorIdx = a_attrib.x;
    float state    = a_attrib.y;   // 0=free, 0.5=captured, 1=crystal
    float size     = a_attrib.z;
    float glow     = a_attrib.w;

    // World position with Z from plane tilt
    float z = getPlaneZ(a_position, colorIdx);
    vec4 worldPos = vec4(a_position, z, 1.0);

    // View-space position
    vec4 viewPos = u_viewMatrix * worldPos;

    // Billboard size in pixels (3-10px based on size attribute + crystal boost)
    float pixelSize = mix(3.0, 10.0, size) + step(0.9, state) * 5.0;

    // Perspective scaling
    vec4 clipPos = u_projMatrix * viewPos;
    float w = max(clipPos.w, 0.001);
    // NDC range is [-1,1] = 2 units wide, so pixel→NDC = pixel * 2 / viewport
    vec2 screenOffset = a_corner * pixelSize * 2.0 / u_viewport;

    gl_Position = clipPos / w + vec4(screenOffset, 0.0, 0.0);
    gl_Position.w = 1.0;

    v_uv = a_corner;
    v_color = getPalette(colorIdx);
    v_glow = glow;
    v_state = state;
}
`;

const PARTICLE_FRAGMENT = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec3 v_color;
in float v_glow;
in float v_state;

out vec4 fragColor;

void main() {
    // Gaussian falloff
    float d = dot(v_uv, v_uv);
    if (d > 1.0) discard;

    float alpha = exp(-d * 3.0);

    // Glow boost for active/crystal particles
    float glowMult = 1.0 + v_glow * 2.0;

    // Crystal particles get a harder edge + sparkle
    if (v_state > 0.9) {
        alpha = smoothstep(1.0, 0.3, sqrt(d));
        glowMult += 0.5;
    }

    vec3 col = v_color * glowMult * alpha;
    fragColor = vec4(col, alpha * 0.85);
}
`;

/* ------------------------------------------------------------------ */
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */

export class ParticleRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {number} maxCount  Maximum particle count (default 200000)
     */
    constructor(gl, maxCount = 200000) {
        this.gl = gl;
        this.maxCount = maxCount;
        this.count = 0;

        // Pre-allocate CPU-side buffers
        this.positions = new Float32Array(maxCount * 2);
        this.attribs = new Uint8Array(maxCount * 4);

        // GPU handles
        this.program = null;
        this.vao = null;
        this.quadVBO = null;
        this.quadIBO = null;
        this.positionVBO = null;
        this.attribVBO = null;
        this.uniforms = {};

        this._init();
    }

    _init() {
        const gl = this.gl;

        // Compile
        const program = gl.createProgram();
        const vert = this._compile(gl.VERTEX_SHADER, PARTICLE_VERTEX);
        const frag = this._compile(gl.FRAGMENT_SHADER, PARTICLE_FRAGMENT);
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('ParticleRenderer link: ' + gl.getProgramInfoLog(program));
        }
        this.program = program;

        // VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Quad geometry (shared per-vertex)
        const quadVerts = new Float32Array([-1,-1, 1,-1, 1,1, -1,1]);
        const quadIdx = new Uint16Array([0,1,2, 0,2,3]);

        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
        const cornerLoc = gl.getAttribLocation(program, 'a_corner');
        gl.enableVertexAttribArray(cornerLoc);
        gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(cornerLoc, 0);

        this.quadIBO = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIBO);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx, gl.STATIC_DRAW);

        // Instance position buffer (Float32, 2 per particle)
        this.positionVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.positions.byteLength, gl.DYNAMIC_DRAW);
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 8, 0);
        gl.vertexAttribDivisor(posLoc, 1);

        // Instance attribute buffer (Uint8, 4 per particle — normalized to 0-1)
        this.attribVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.attribVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.attribs.byteLength, gl.DYNAMIC_DRAW);
        const attrLoc = gl.getAttribLocation(program, 'a_attrib');
        gl.enableVertexAttribArray(attrLoc);
        gl.vertexAttribPointer(attrLoc, 4, gl.UNSIGNED_BYTE, true, 4, 0); // normalized
        gl.vertexAttribDivisor(attrLoc, 1);

        gl.bindVertexArray(null);

        // Uniform locations
        this.uniforms = {
            viewMatrix:  gl.getUniformLocation(program, 'u_viewMatrix'),
            projMatrix:  gl.getUniformLocation(program, 'u_projMatrix'),
            viewport:    gl.getUniformLocation(program, 'u_viewport'),
            time:        gl.getUniformLocation(program, 'u_time'),
            planeTiltA:  gl.getUniformLocation(program, 'u_planeTiltA'),
            planeTiltB:  gl.getUniformLocation(program, 'u_planeTiltB'),
            planeTiltC:  gl.getUniformLocation(program, 'u_planeTiltC'),
        };
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('ParticleRenderer shader: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    /**
     * Upload positions and attributes to the GPU.
     * Call this every frame after simulation updates the arrays.
     * @param {number} count  Active particle count
     */
    upload(count) {
        const gl = this.gl;
        this.count = Math.min(count, this.maxCount);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions, 0, this.count * 2);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.attribVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.attribs, 0, this.count * 4);
    }

    /**
     * Render all particles.
     * @param {Float32Array} viewMatrix  4x4 column-major
     * @param {Float32Array} projMatrix  4x4 column-major
     * @param {number} time              Elapsed seconds
     * @param {Float32Array} planeTilts  [axR,ayR,angR, axY,ayY,angY, axB,ayB,angB]
     */
    render(viewMatrix, projMatrix, time = 0, planeTilts = null) {
        const gl = this.gl;
        if (!this.count) return;

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.uniformMatrix4fv(this.uniforms.viewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.projMatrix, false, projMatrix);
        gl.uniform2f(this.uniforms.viewport, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(this.uniforms.time, time);

        if (planeTilts) {
            gl.uniform3f(this.uniforms.planeTiltA, planeTilts[0], planeTilts[1], planeTilts[2]);
            gl.uniform3f(this.uniforms.planeTiltB, planeTilts[3], planeTilts[4], planeTilts[5]);
            gl.uniform3f(this.uniforms.planeTiltC, planeTilts[6], planeTilts[7], planeTilts[8]);
        } else {
            gl.uniform3f(this.uniforms.planeTiltA, 0.3, 0.1, 0.05);
            gl.uniform3f(this.uniforms.planeTiltB, -0.2, 0.3, 0.05);
            gl.uniform3f(this.uniforms.planeTiltC, 0.1, -0.2, 0.05);
        }

        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this.count);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    dispose() {
        const gl = this.gl;
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
        if (this.quadIBO) gl.deleteBuffer(this.quadIBO);
        if (this.positionVBO) gl.deleteBuffer(this.positionVBO);
        if (this.attribVBO) gl.deleteBuffer(this.attribVBO);
    }
}

export default ParticleRenderer;
