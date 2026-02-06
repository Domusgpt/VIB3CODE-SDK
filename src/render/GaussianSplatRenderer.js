/**
 * GaussianSplatRenderer
 *
 * WebGL2 renderer that consumes encoded Gaussian seed buffers directly.
 */

import { GAUSSIAN_SEED_STRIDE } from './GaussianSeedBuffer.js';

export class GaussianSplatRenderer {
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
        this.init();
    }

    init() {
        const gl = this.gl;
        const vertexSource = `#version 300 es
        in vec3 a_position;
        in float a_scale;
        in float a_depth;
        in vec3 a_color;
        uniform float u_pointScale;
        out float v_depth;
        out vec3 v_color;
        void main() {
          gl_Position = vec4(a_position, 1.0);
          gl_PointSize = max(2.0, a_scale * u_pointScale);
          v_depth = a_depth;
          v_color = a_color;
        }
        `;

        const fragmentSource = `#version 300 es
        precision highp float;
        in float v_depth;
        in vec3 v_color;
        out vec4 outColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, dist) * (1.0 - v_depth * 0.12);
          outColor = vec4(v_color, alpha);
        }
        `;

        const program = gl.createProgram();
        const vertex = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragment = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        this.program = program;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

        const stride = GAUSSIAN_SEED_STRIDE * 4;
        const positionLoc = gl.getAttribLocation(program, 'a_position');
        const scaleLoc = gl.getAttribLocation(program, 'a_scale');
        const depthLoc = gl.getAttribLocation(program, 'a_depth');
        const colorLoc = gl.getAttribLocation(program, 'a_color');

        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(scaleLoc);
        gl.vertexAttribPointer(scaleLoc, 1, gl.FLOAT, false, stride, 3 * 4);

        gl.enableVertexAttribArray(depthLoc);
        gl.vertexAttribPointer(depthLoc, 1, gl.FLOAT, false, stride, 11 * 4);

        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 8 * 4);

        gl.bindVertexArray(null);

        this.uniforms.pointScale = gl.getUniformLocation(program, 'u_pointScale');

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    updateSeeds(buffer, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
        this.count = count;
    }

    render() {
        const gl = this.gl;
        if (!this.count) {
            return;
        }
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.02, 0.04, 0.08, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);
        gl.uniform1f(this.uniforms.pointScale, this.pointScale);
        gl.drawArrays(gl.POINTS, 0, this.count);
        gl.bindVertexArray(null);
    }
}

export default GaussianSplatRenderer;
