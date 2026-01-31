/**
 * HyperSplatRenderer
 *
 * 20-million-splat instanced renderer with 4D hyperspace rotation.
 *
 * Architecture:
 *   Base buffer: 2M splats (96 MB GPU)
 *   Instance buffer: 10 instances × (vec3 offset + float rotY + vec3 tint + float scale)
 *   drawArraysInstanced(POINTS, 0, 2M, 10) → 20M visual splats
 *
 * Shader features beyond GaussianSplatRenderer:
 *   - 6D rotation (XY, XZ, YZ, XW, YW, ZW) from VIB3+ geometric algebra
 *   - Per-instance position offset, Y rotation, color tint, scale
 *   - 4D perspective projection (projFactor = 1 / (dimension - w))
 *   - ACES filmic tone mapping (HDR → SDR)
 *   - Anamorphic horizontal streak on bright splats
 *   - Multi-frequency twinkle with depth-driven aurora shimmer
 *   - Chromatic aberration
 *
 * This is the "woah" renderer.
 */

import { GAUSSIAN_SEED_STRIDE } from './GaussianSeedBuffer.js';

const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

/* ------------------------------------------------------------------ */
/*  Instance layout                                                    */
/* ------------------------------------------------------------------ */

// 10 instances tiling a cosmic volume
// Each: [offsetX, offsetY, offsetZ, rotationY, tintR, tintG, tintB, scaleMult]
const INSTANCE_DATA = new Float32Array([
    // center cluster
     0.0,  0.0,  0.0,  0.00,  1.0, 1.0, 1.0,  1.0,
    // surrounding ring (8 copies, rotated + offset)
     8.0,  0.5,  0.0,  0.40,  0.9, 0.85, 1.0,  0.95,
    -8.0, -0.3,  0.0,  1.20,  1.0, 0.9, 0.85,  0.90,
     0.0,  0.8,  8.0,  2.00,  0.85, 1.0, 0.9,  0.92,
     0.0, -0.5, -8.0,  2.80,  1.0, 0.85, 0.95, 0.88,
     5.7,  0.2,  5.7,  3.60,  0.95, 0.95, 1.0,  0.93,
    -5.7, -0.4,  5.7,  4.40,  1.0, 0.92, 0.88, 0.91,
     5.7,  0.6, -5.7,  5.20,  0.88, 1.0, 0.95, 0.94,
    -5.7, -0.1, -5.7,  0.80,  0.92, 0.88, 1.0,  0.89,
    // far background (slightly smaller, dimmer)
     0.0,  2.0,  0.0,  1.60,  0.7, 0.7, 0.8,  0.75,
]);
const INSTANCE_COUNT = INSTANCE_DATA.length / 8;
const INSTANCE_STRIDE = 8; // floats per instance

/* ------------------------------------------------------------------ */
/*  Shaders                                                            */
/* ------------------------------------------------------------------ */

const HYPER_VERTEX = `#version 300 es
precision highp float;

// Per-splat (from base buffer)
in vec3  a_position;
in float a_scale;
in vec4  a_orientation;
in vec3  a_color;
in float a_depth;

// Per-instance
in vec3  a_instanceOffset;
in float a_instanceRotY;
in vec3  a_instanceTint;
in float a_instanceScale;

// Uniforms
uniform float u_pointScale;
uniform float u_time;
uniform float u_animate;
uniform float u_intensity;
uniform mat4  u_viewProjection;

// 6D rotation angles (radians)
uniform float u_rotXY;
uniform float u_rotXZ;
uniform float u_rotYZ;
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension; // 4D projection distance (3.0–5.0)

flat out vec3  v_color;
flat out float v_depth;
flat out vec2  v_axisU;
flat out vec2  v_axisV;
flat out float v_hash;
flat out float v_bloom;
flat out float v_anamorphic; // horizontal streak energy

/* --- 4D rotation matrices --- */
mat4 rotXY(float a) { float c=cos(a),s=sin(a); return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1); }
mat4 rotXZ(float a) { float c=cos(a),s=sin(a); return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1); }
mat4 rotYZ(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1); }
mat4 rotXW(float a) { float c=cos(a),s=sin(a); return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c); }
mat4 rotYW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c); }
mat4 rotZW(float a) { float c=cos(a),s=sin(a); return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c); }

void main() {
    // Per-splat hash
    float h1 = fract(sin(dot(a_position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float h2 = fract(sin(dot(a_position.yz, vec2(45.164, 93.721))) * 23456.789);
    float h3 = fract(sin(dot(a_position.xz, vec2(63.7264, 10.873))) * 65432.123);
    v_hash = h1;

    // --- GPU animation ---
    float animAmp = a_depth * u_animate * 0.05;
    float animSpd = 0.3 + h1 * 0.5;
    float breathe = sin(u_time * 0.12 + h3 * 6.2832) * 0.015 * u_animate;

    vec3 localPos = a_position + vec3(
        sin(u_time * animSpd + h1 * 6.2832) * animAmp,
        cos(u_time * animSpd * 0.7 + h2 * 6.2832) * animAmp * 0.35 + breathe,
        cos(u_time * animSpd + h1 * 6.2832) * animAmp
    );

    // --- Per-instance Y rotation ---
    float cy = cos(a_instanceRotY), sy = sin(a_instanceRotY);
    vec3 rotatedPos = vec3(
        localPos.x * cy + localPos.z * sy,
        localPos.y,
        -localPos.x * sy + localPos.z * cy
    );

    // --- Per-instance offset + scale ---
    vec3 worldPos = rotatedPos * a_instanceScale + a_instanceOffset;

    // --- 4D hyperspace rotation ---
    // Lift 3D position into 4D (w = 0), apply 6D rotation, project back
    vec4 p4 = vec4(worldPos, 0.0);
    mat4 rot4D = rotXY(u_rotXY) * rotXZ(u_rotXZ) * rotYZ(u_rotYZ)
               * rotXW(u_rotXW) * rotYW(u_rotYW) * rotZW(u_rotZW);
    p4 = rot4D * p4;

    // 4D perspective projection: xyz / (dimension - w)
    float projFactor = 1.0 / (u_dimension - p4.w);
    vec3 projected = p4.xyz * projFactor;

    vec4 clipPos = u_viewProjection * vec4(projected, 1.0);
    gl_Position = clipPos;

    // --- Point size ---
    float projDist = max(0.5, clipPos.w);
    float pulse = 1.0 + sin(u_time * 1.2 + h1 * 6.2832) * 0.10 * min(1.0, a_depth) * u_animate;
    float intensityBoost = 1.0 + (u_intensity - 1.0) * 0.12;
    float depthFade = 1.0 / (1.0 + a_depth * 0.12 * (1.0 - u_animate));
    float sizeScale = a_scale * a_instanceScale * pulse * intensityBoost * u_pointScale * depthFade;
    gl_PointSize = clamp(sizeScale / projDist, 1.0, 2048.0);

    // --- Bloom + anamorphic energy ---
    float luminance = dot(a_color * a_instanceTint, vec3(0.2126, 0.7152, 0.0722));
    v_bloom = smoothstep(0.4, 0.9, luminance) * u_intensity;
    v_anamorphic = smoothstep(0.6, 1.0, luminance) * u_intensity * 0.4;

    // --- Quaternion → ellipse ---
    float qw = a_orientation.x, qx = a_orientation.y;
    float qy = a_orientation.z, qz = a_orientation.w;
    float sinA = 2.0 * (qw * qz + qx * qy);
    float cosA = 1.0 - 2.0 * (qy * qy + qz * qz);
    float invLen = inversesqrt(max(1e-12, sinA * sinA + cosA * cosA));
    sinA *= invLen; cosA *= invLen;
    float tilt = abs(2.0 * (qw * qx + qy * qz));
    float aspect = 1.0 + tilt * 0.6;
    v_axisU = vec2(cosA, sinA) * aspect;
    v_axisV = vec2(-sinA, cosA);

    // --- Color with instance tint ---
    v_color = a_color * a_instanceTint;
    v_depth = a_depth;
}
`;

const HYPER_FRAGMENT = `#version 300 es
precision highp float;

flat in vec3  v_color;
flat in float v_depth;
flat in vec2  v_axisU;
flat in vec2  v_axisV;
flat in float v_hash;
flat in float v_bloom;
flat in float v_anamorphic;

uniform float u_time;
uniform float u_animate;
uniform float u_intensity;

out vec4 outColor;

// ACES filmic tone mapping
vec3 acesToneMap(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float u = dot(d, v_axisU);
    float v = dot(d, v_axisV);

    // Core Gaussian
    float r2 = u * u + v * v;
    float sigma = 0.19;
    float gauss = exp(-0.5 * r2 / (sigma * sigma));

    // HDR bloom (wider)
    float bloomSigma = 0.34;
    float bloomGauss = exp(-0.5 * r2 / (bloomSigma * bloomSigma));
    float bloomE = v_bloom * 0.35;

    // Anamorphic horizontal streak
    float streakSigma = 0.08;
    float hStreak = exp(-0.5 * (d.y * d.y) / (streakSigma * streakSigma))
                  * exp(-0.5 * (d.x * d.x) / (0.45 * 0.45));
    float anamorphicE = hStreak * v_anamorphic;

    // Multi-frequency twinkle
    float tw1 = sin(u_time * 2.5 + v_hash * 6.2832) * 0.5 + 0.5;
    float tw2 = sin(u_time * 5.7 + v_hash * 3.1416) * 0.5 + 0.5;
    float tw3 = sin(u_time * 0.7 + v_hash * 1.5708) * 0.5 + 0.5;
    float twinkle = mix(1.0,
        0.65 + 0.35 * (tw1 * 0.5 + tw2 * 0.3 + tw3 * 0.2),
        u_animate * min(1.0, v_depth));
    float depthAlpha = 1.0 / (1.0 + v_depth * 0.20 * (1.0 - u_animate));

    // Combine layers
    float coreAlpha = gauss * depthAlpha * twinkle;
    float totalAlpha = coreAlpha + bloomGauss * bloomE + anamorphicE;
    if (totalAlpha < 0.002) discard;

    // Chromatic shift on bloom
    vec3 color = v_color;
    float chrShift = v_bloom * 0.02;
    if (chrShift > 0.001) {
        float rOff = exp(-0.5*((u-chrShift)*(u-chrShift)+v*v)/(bloomSigma*bloomSigma));
        float bOff = exp(-0.5*((u+chrShift)*(u+chrShift)+v*v)/(bloomSigma*bloomSigma));
        color.r += rOff * bloomE * 0.35;
        color.b += bOff * bloomE * 0.35;
    }

    // Anamorphic tint (slightly blue)
    color += vec3(0.15, 0.18, 0.35) * anamorphicE;

    // Aurora shimmer: depth-driven hue shift over time
    float auroraPhase = u_time * 0.4 + v_hash * 6.2832 + v_depth * 2.0;
    vec3 aurora = vec3(
        sin(auroraPhase) * 0.5 + 0.5,
        sin(auroraPhase + 2.094) * 0.5 + 0.5,
        sin(auroraPhase + 4.189) * 0.5 + 0.5
    );
    color = mix(color, color * aurora, u_animate * 0.15 * v_depth);

    // Intensity boost
    color *= (0.4 + u_intensity * 0.6);

    // ACES tone mapping (HDR → SDR)
    color = acesToneMap(color * 1.4);

    outColor = vec4(color * totalAlpha, totalAlpha);
}
`;

/* ------------------------------------------------------------------ */
/*  Renderer class                                                     */
/* ------------------------------------------------------------------ */

export class HyperSplatRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.pointScale=14]
     * @param {number} [opts.dimension=4.0]  4D projection distance
     */
    constructor(gl, { pointScale = 14, dimension = 4.0 } = {}) {
        this.gl = gl;
        this.pointScale = pointScale;
        this.intensity = 1.0;
        this.animate = true;
        this.blendMode = 'additive';
        this.chromatic = 0;
        this.dimension = dimension;

        // 6D rotation angles (radians)
        this.rotXY = 0; this.rotXZ = 0; this.rotYZ = 0;
        this.rotXW = 0; this.rotYW = 0; this.rotZW = 0;

        this.program = null;
        this.vao = null;
        this.splatBuffer = null;
        this.instanceBuffer = null;
        this.count = 0;
        this.uniforms = {};

        this._init();
    }

    _init() {
        const gl = this.gl;

        // --- Compile ---
        const program = gl.createProgram();
        const vert = this._compile(gl.VERTEX_SHADER, HYPER_VERTEX);
        const frag = this._compile(gl.FRAGMENT_SHADER, HYPER_FRAGMENT);
        gl.attachShader(program, vert); gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        this.program = program;

        // --- VAO ---
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // --- Per-splat buffer (interleaved, 12 floats) ---
        this.splatBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.splatBuffer);
        const stride = GAUSSIAN_SEED_STRIDE * 4;

        const bind = (name, size, offset) => {
            const loc = gl.getAttribLocation(program, name);
            if (loc < 0) return;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
        };
        bind('a_position', 3, 0);
        bind('a_scale', 1, 3);
        bind('a_orientation', 4, 4);
        bind('a_color', 3, 8);
        bind('a_depth', 1, 11);

        // --- Per-instance buffer (8 floats per instance) ---
        this.instanceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, INSTANCE_DATA, gl.STATIC_DRAW);
        const iStride = INSTANCE_STRIDE * 4;

        const bindInst = (name, size, offset) => {
            const loc = gl.getAttribLocation(program, name);
            if (loc < 0) return;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, gl.FLOAT, false, iStride, offset * 4);
            gl.vertexAttribDivisor(loc, 1); // advance per instance
        };
        bindInst('a_instanceOffset', 3, 0);
        bindInst('a_instanceRotY', 1, 3);
        bindInst('a_instanceTint', 3, 4);
        bindInst('a_instanceScale', 1, 7);

        gl.bindVertexArray(null);

        // --- Uniforms ---
        const u = (name) => gl.getUniformLocation(program, name);
        this.uniforms = {
            pointScale: u('u_pointScale'),
            viewProjection: u('u_viewProjection'),
            time: u('u_time'),
            animate: u('u_animate'),
            intensity: u('u_intensity'),
            dimension: u('u_dimension'),
            rotXY: u('u_rotXY'), rotXZ: u('u_rotXZ'), rotYZ: u('u_rotYZ'),
            rotXW: u('u_rotXW'), rotYW: u('u_rotYW'), rotZW: u('u_rotZW'),
        };
    }

    _compile(type, source) {
        const gl = this.gl;
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s));
        }
        return s;
    }

    /** Upload encoded splat buffer. */
    updateSeeds(buffer, count) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.splatBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.DYNAMIC_DRAW);
        this.count = count;
    }

    /** Render 20M splats (2M base × 10 instances). */
    render(viewProjection, time = 0) {
        const gl = this.gl;
        if (!this.count) return;

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(0.005, 0.008, 0.025, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive always

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Set uniforms
        gl.uniform1f(this.uniforms.pointScale, this.pointScale);
        gl.uniform1f(this.uniforms.time, time);
        gl.uniform1f(this.uniforms.animate, this.animate ? 1.0 : 0.0);
        gl.uniform1f(this.uniforms.intensity, this.intensity);
        gl.uniform1f(this.uniforms.dimension, this.dimension);

        // 4D rotation (auto-animate through hyperspace)
        const t = time;
        gl.uniform1f(this.uniforms.rotXY, this.rotXY + t * 0.02);
        gl.uniform1f(this.uniforms.rotXZ, this.rotXZ + t * 0.015);
        gl.uniform1f(this.uniforms.rotYZ, this.rotYZ + t * 0.01);
        gl.uniform1f(this.uniforms.rotXW, this.rotXW + Math.sin(t * 0.08) * 0.3);
        gl.uniform1f(this.uniforms.rotYW, this.rotYW + Math.sin(t * 0.06) * 0.25);
        gl.uniform1f(this.uniforms.rotZW, this.rotZW + Math.sin(t * 0.05) * 0.2);

        gl.uniformMatrix4fv(this.uniforms.viewProjection, false, viewProjection || IDENTITY);

        // THE DRAW CALL: 2M points × 10 instances = 20M splats
        gl.drawArraysInstanced(gl.POINTS, 0, this.count, INSTANCE_COUNT);

        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

export default HyperSplatRenderer;
