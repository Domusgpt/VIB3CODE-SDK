/**
 * GaussianSplatRenderer
 *
 * WebGL2 point-sprite renderer for Gaussian splats.
 *
 * Buffer layout per seed (12 floats, see GaussianSeedBuffer.js):
 *   [0-2]  position   (vec3)
 *   [3]    scale      (float)
 *   [4-7]  orientation (vec4 quaternion w,x,y,z)
 *   [8-10] color      (vec3 r,g,b)
 *   [11]   depth      (float, traversal depth)
 *
 * The shader:
 *  - Decodes the quaternion into a 2D screen-space rotation so each
 *    splat can display anisotropic (elliptical) Gaussian falloff.
 *  - Computes a true Gaussian kernel  exp(-0.5 * r² / σ²)  instead
 *    of a linear smoothstep, matching the intended 3DGS representation.
 *  - Modulates both point size and opacity by traversal depth so that
 *    deeper (farther) splats are smaller and more transparent.
 *  - Uses premultiplied-alpha output for correct back-to-front compositing.
 */

import { GAUSSIAN_SEED_STRIDE } from './GaussianSeedBuffer.js';

/* ------------------------------------------------------------------ */
/*  Shader sources                                                     */
/* ------------------------------------------------------------------ */

const SPLAT_VERTEX = `#version 300 es
precision highp float;

// Per-seed attributes (interleaved, stride = 12 floats)
in vec3  a_position;      // offset  0
in float a_scale;         // offset  3
in vec4  a_orientation;   // offset  4  (quaternion w,x,y,z)
in vec3  a_color;         // offset  8
in float a_depth;         // offset 11

uniform float u_pointScale;

// Flat – constant across the point-sprite quad
flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;   // major ellipse axis in point-coord space
flat out vec2  v_axisV;   // minor ellipse axis

void main() {
    gl_Position = vec4(a_position, 1.0);

    // ---- depth-aware point size --------------------------------
    // Splats deeper in the traversal tree shrink via a smooth
    // inverse falloff so the hierarchy is visually apparent.
    float depthFade = 1.0 / (1.0 + a_depth * 0.15);
    gl_PointSize = max(2.0, a_scale * u_pointScale * depthFade);

    // ---- quaternion → 2D screen-space rotation ------------------
    // Extract the Z-axis (yaw) component of the quaternion so
    // the point-sprite disc can be warped into an oriented ellipse.
    float qw = a_orientation.x;
    float qx = a_orientation.y;
    float qy = a_orientation.z;
    float qz = a_orientation.w;

    // sin/cos of the effective screen-plane rotation
    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen;
    cosA *= invLen;

    // Derive anisotropy (aspect ratio) from the tilt component.
    // A pure identity quaternion produces aspect = 1 (circle);
    // tilted orientations stretch up to 1.6× along the major axis.
    float tilt   = abs(2.0 * (qw * qx + qy * qz));
    float aspect = 1.0 + tilt * 0.6;

    v_axisU = vec2(cosA, sinA) * aspect;
    v_axisV = vec2(-sinA, cosA);

    v_color = a_color;
    v_depth = a_depth;
}
`;

const SPLAT_FRAGMENT = `#version 300 es
precision highp float;

flat in vec3  v_color;
flat in float v_depth;
flat in vec2  v_axisU;
flat in vec2  v_axisV;

out vec4 outColor;

void main() {
    // Centre the point-sprite coordinate to [-0.5, 0.5]
    vec2 d = gl_PointCoord - vec2(0.5);

    // Project into the quaternion-derived ellipse frame
    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    // True Gaussian falloff: G = exp(-0.5 * r² / σ²)
    // σ = 0.20 gives a smooth bell that reaches ~1 % at the sprite edge.
    float r2    = u * u + v * v;
    float sigma = 0.20;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // Depth-aware opacity: deeper splats fade out smoothly.
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.25);

    float alpha = gauss * depthAlpha;

    // Early-out for nearly invisible fragments
    if (alpha < 0.004) discard;

    // Premultiplied-alpha output (blend func ONE, ONE_MINUS_SRC_ALPHA)
    outColor = vec4(v_color * alpha, alpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Renderer class                                                     */
/* ------------------------------------------------------------------ */

export class GaussianSplatRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [options]
     * @param {number} [options.pointScale=14]
     */
    constructor(gl, { pointScale = 14 } = {}) {
        if (!gl) {
            throw new Error('GaussianSplatRenderer requires a WebGL2 context.');
        }
        this.gl = gl;
        this.pointScale = pointScale;
        this.program = null;
        this.vao = null;
        this.buffer = null;
        this.count = 0;
        this.uniforms = {};
        this._init();
    }

    /* -------------------------------------------------------------- */
    /*  Initialisation                                                 */
    /* -------------------------------------------------------------- */

    /** @private */
    _init() {
        const gl = this.gl;

        // ---- compile & link -------------------------------------
        const program = gl.createProgram();
        const vert = this._compileShader(gl.VERTEX_SHADER, SPLAT_VERTEX);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, SPLAT_FRAGMENT);
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        this.program = program;

        // ---- VAO & interleaved buffer ---------------------------
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        const stride = GAUSSIAN_SEED_STRIDE * 4; // bytes

        // position  – 3 floats @ offset 0
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);

        // scale     – 1 float  @ offset 3
        const sclLoc = gl.getAttribLocation(program, 'a_scale');
        gl.enableVertexAttribArray(sclLoc);
        gl.vertexAttribPointer(sclLoc, 1, gl.FLOAT, false, stride, 3 * 4);

        // orientation – 4 floats @ offset 4 (quaternion w,x,y,z)
        const oriLoc = gl.getAttribLocation(program, 'a_orientation');
        gl.enableVertexAttribArray(oriLoc);
        gl.vertexAttribPointer(oriLoc, 4, gl.FLOAT, false, stride, 4 * 4);

        // color     – 3 floats @ offset 8
        const colLoc = gl.getAttribLocation(program, 'a_color');
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 3, gl.FLOAT, false, stride, 8 * 4);

        // depth     – 1 float  @ offset 11
        const depLoc = gl.getAttribLocation(program, 'a_depth');
        gl.enableVertexAttribArray(depLoc);
        gl.vertexAttribPointer(depLoc, 1, gl.FLOAT, false, stride, 11 * 4);

        gl.bindVertexArray(null);

        // ---- uniform locations ----------------------------------
        this.uniforms.pointScale = gl.getUniformLocation(program, 'u_pointScale');
    }

    /**
     * Compile a single shader stage.
     * @private
     */
    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    /* -------------------------------------------------------------- */
    /*  Data upload                                                    */
    /* -------------------------------------------------------------- */

    /**
     * Upload an encoded seed buffer to the GPU.
     * @param {Float32Array} buffer
     * @param {number} count  Number of splats (not bytes/floats).
     */
    updateSeeds(buffer, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
        this.count = count;
    }

    /* -------------------------------------------------------------- */
    /*  Draw                                                           */
    /* -------------------------------------------------------------- */

    /**
     * Render all uploaded splats.
     *
     * Sets up depth-test (read-only) and premultiplied-alpha blending
     * so that back-to-front compositing works correctly.
     */
    render() {
        const gl = this.gl;
        if (!this.count) return;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear colour + depth
        gl.clearColor(0.02, 0.04, 0.08, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Depth test ON, depth write OFF (transparent compositing)
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        // Premultiplied-alpha blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);
        gl.uniform1f(this.uniforms.pointScale, this.pointScale);

        gl.drawArrays(gl.POINTS, 0, this.count);

        // Restore
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

export default GaussianSplatRenderer;
