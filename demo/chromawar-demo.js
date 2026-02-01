/**
 * ChromaWar Demo — 200K particle emergent warfare game
 *
 * Three primary colour factions war across tilting planes.
 * Player draws barrier lines to protect/ensnare groups.
 * Goal: balance all three colours.
 */

import { ParticleRenderer } from '../src/render/ParticleRenderer.js';
import { ChromaSimulation } from '../src/game/ChromaSimulation.js';
import { SplatPostProcess } from '../src/render/SplatPostProcess.js';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const PARTICLE_COUNT = 200000;
const CLUSTER_COUNT  = 300;

/* ================================================================== */
/*  Globals                                                            */
/* ================================================================== */

let canvas, gl;
let renderer, sim, postProcess;
let viewMatrix, projMatrix;
let startTime;

// Input state
let isDrawing = false;
let lineStart = null;
let lineEnd = null;
let pendingLine = null;

// Camera
const cam = {
    distance: 14.0,
    elevation: 0.35,   // slight downward look
    azimuth: 0,
    fov: 55,
};

// Stats DOM
let statsEl, balanceEls, lineCountEl, scoreEl, messageEl;

/* ================================================================== */
/*  Matrix helpers                                                     */
/* ================================================================== */

function mat4Perspective(fovDeg, aspect, near, far) {
    const f = 1.0 / Math.tan((fovDeg * Math.PI / 180) / 2);
    const nf = 1.0 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
    ]);
}

function mat4LookAt(eye, center, up) {
    const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let len = 1 / Math.sqrt(zx*zx + zy*zy + zz*zz);
    const fz = [zx*len, zy*len, zz*len];

    const sx = up[1]*fz[2] - up[2]*fz[1];
    const sy = up[2]*fz[0] - up[0]*fz[2];
    const sz = up[0]*fz[1] - up[1]*fz[0];
    len = 1 / Math.sqrt(sx*sx + sy*sy + sz*sz);
    const fx = [sx*len, sy*len, sz*len];

    const ux = [fz[1]*fx[2] - fz[2]*fx[1], fz[2]*fx[0] - fz[0]*fx[2], fz[0]*fx[1] - fz[1]*fx[0]];

    return new Float32Array([
        fx[0], ux[0], fz[0], 0,
        fx[1], ux[1], fz[1], 0,
        fx[2], ux[2], fz[2], 0,
        -(fx[0]*eye[0]+fx[1]*eye[1]+fx[2]*eye[2]),
        -(ux[0]*eye[0]+ux[1]*eye[1]+ux[2]*eye[2]),
        -(fz[0]*eye[0]+fz[1]*eye[1]+fz[2]*eye[2]),
        1,
    ]);
}

/* ================================================================== */
/*  Line drawing preview (drawn over the particle pass)                */
/* ================================================================== */

let lineProgram, lineVAO, lineVBO;

const LINE_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
void main() {
    gl_Position = u_projMatrix * u_viewMatrix * vec4(a_pos, 0.0, 1.0);
}`;

const LINE_FRAG = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
    fragColor = u_color;
}`;

function initLineRenderer() {
    const prog = gl.createProgram();
    const vs = compileShader(gl.VERTEX_SHADER, LINE_VERT);
    const fs = compileShader(gl.FRAGMENT_SHADER, LINE_FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    lineProgram = prog;

    lineVAO = gl.createVertexArray();
    gl.bindVertexArray(lineVAO);
    lineVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.bufferData(gl.ARRAY_BUFFER, 16, gl.DYNAMIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
}

function drawLine(x0, y0, x1, y1, color, width = 3) {
    gl.useProgram(lineProgram);
    gl.bindVertexArray(lineVAO);

    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([x0, y0, x1, y1]));

    gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, 'u_viewMatrix'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProgram, 'u_projMatrix'), false, projMatrix);
    gl.uniform4fv(gl.getUniformLocation(lineProgram, 'u_color'), color);

    gl.lineWidth(width); // may not be respected on all platforms
    gl.drawArrays(gl.LINES, 0, 2);
    gl.bindVertexArray(null);
}

function drawAllLines() {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Active barrier lines (white, fading)
    for (const line of sim.playerLines) {
        const alpha = Math.min(line.timeLeft / 2.0, 1.0);
        drawLine(line.x0, line.y0, line.x1, line.y1, [1, 1, 1, alpha * 0.8], 2);
    }

    // Currently drawing line (cyan preview)
    if (isDrawing && lineStart && lineEnd) {
        drawLine(lineStart.x, lineStart.y, lineEnd.x, lineEnd.y, [0, 1, 1, 0.6], 2);
    }

    gl.disable(gl.BLEND);
}

function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
}

/* ================================================================== */
/*  Input handling                                                     */
/* ================================================================== */

function getWorldPos(e) {
    const rect = canvas.getBoundingClientRect();
    let cx, cy;
    if (e.touches) {
        cx = e.touches[0].clientX - rect.left;
        cy = e.touches[0].clientY - rect.top;
    } else {
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
    }
    return sim.screenToWorld(cx, cy, canvas.clientWidth, canvas.clientHeight);
}

function onPointerDown(e) {
    e.preventDefault();
    isDrawing = true;
    lineStart = getWorldPos(e);
    lineEnd = lineStart;
}

function onPointerMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    lineEnd = getWorldPos(e);
}

function onPointerUp(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;

    if (lineStart && lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        if (Math.sqrt(dx*dx + dy*dy) > 0.3) {
            sim.addPlayerLine(lineStart.x, lineStart.y, lineEnd.x, lineEnd.y);
        }
    }
    lineStart = null;
    lineEnd = null;
}

/* ================================================================== */
/*  Camera                                                             */
/* ================================================================== */

function updateCamera() {
    // Gentle orbit
    cam.azimuth += 0.0005;

    const eyeX = Math.sin(cam.azimuth) * cam.distance * Math.cos(cam.elevation);
    const eyeY = Math.sin(cam.elevation) * cam.distance;
    const eyeZ = Math.cos(cam.azimuth) * cam.distance * Math.cos(cam.elevation);

    const aspect = canvas.width / canvas.height;
    projMatrix = mat4Perspective(cam.fov, aspect, 0.1, 100);
    viewMatrix = mat4LookAt([eyeX, eyeY, eyeZ], [0, 0, 0], [0, 1, 0]);
}

/* ================================================================== */
/*  HUD update                                                         */
/* ================================================================== */

function updateHUD() {
    if (statsEl) {
        statsEl.textContent =
            `Particles: ${PARTICLE_COUNT.toLocaleString()} | ` +
            `Clusters: ${sim.stats.clusterCount} | ` +
            `Sim: ${sim.stats.simTimeMs.toFixed(1)}ms | ` +
            `Crystals: ${sim.stats.crystalCount} | ` +
            `Captured: ${sim.stats.capturedCount}`;
    }

    if (balanceEls) {
        const total = sim.balance[0] + sim.balance[1] + sim.balance[2] || 1;
        balanceEls[0].style.width = `${(sim.balance[0] / total * 100).toFixed(1)}%`;
        balanceEls[1].style.width = `${(sim.balance[1] / total * 100).toFixed(1)}%`;
        balanceEls[2].style.width = `${(sim.balance[2] / total * 100).toFixed(1)}%`;
    }

    if (lineCountEl) {
        lineCountEl.textContent = `Lines: ${sim.getActiveLineCount()} / 3`;
    }

    if (scoreEl) {
        scoreEl.textContent = `Score: ${Math.floor(sim.score)}`;
    }

    if (messageEl) {
        if (sim.isBalanced) {
            messageEl.textContent = 'BALANCED! You win!';
            messageEl.style.opacity = '1';
        } else {
            const pct = (sim.balanceMetric * 100).toFixed(0);
            messageEl.textContent = `Balance: ${pct}%`;
            messageEl.style.opacity = '0.6';
        }
    }
}

/* ================================================================== */
/*  Render loop                                                        */
/* ================================================================== */

let lastTime = 0;
let frameCount = 0;

function frame(now) {
    requestAnimationFrame(frame);

    const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    const elapsed = (now - startTime) / 1000;

    // Resize canvas to match display
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }

    // Simulation step
    sim.step(dt);

    // Upload particle data to GPU
    renderer.upload(sim.particleCount);

    // Camera
    updateCamera();

    // Get plane tilts for renderer
    const tilts = sim.getPlaneTilts();

    // ---- Render ----
    if (postProcess) {
        postProcess.beginCapture();
    }

    // Clear
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.015, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Particles
    renderer.render(viewMatrix, projMatrix, elapsed, tilts);

    // Barrier lines overlay
    drawAllLines();

    if (postProcess) {
        postProcess.endCaptureAndComposite(elapsed);
    }

    // HUD (every 6 frames to save CPU)
    if (++frameCount % 6 === 0) updateHUD();
}

/* ================================================================== */
/*  Init                                                               */
/* ================================================================== */

export function init() {
    canvas = document.getElementById('chromawar-canvas');
    if (!canvas) {
        console.error('ChromaWar: canvas#chromawar-canvas not found');
        return;
    }

    gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
    });
    if (!gl) {
        alert('WebGL2 required for ChromaWar');
        return;
    }

    // Renderer
    renderer = new ParticleRenderer(gl, PARTICLE_COUNT);

    // Simulation
    sim = new ChromaSimulation({
        particleCount: PARTICLE_COUNT,
        clusterCount: CLUSTER_COUNT,
    });

    // Bind simulation output directly to renderer buffers (zero-copy)
    sim.bindBuffers(renderer.positions, renderer.attribs);
    sim.initParticles();

    // Post-processing (bloom + edges)
    try {
        postProcess = new SplatPostProcess(gl, {
            enableEdges: true,
            edgeIntensity: 1.2,
            enableBloom: true,
            bloomIntensity: 0.8,
            bloomThreshold: 0.3,
            enableVignette: true,
            vignetteIntensity: 0.4,
            enableTonemap: true,
            exposure: 1.3,
            enableChroma: false,
            enableGrain: false,
            enableInscription: false,
        });
    } catch (e) {
        console.warn('Post-process unavailable:', e.message);
        postProcess = null;
    }

    // Line renderer
    initLineRenderer();

    // Input
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp, { passive: false });

    // HUD references
    statsEl = document.getElementById('stats');
    lineCountEl = document.getElementById('line-count');
    scoreEl = document.getElementById('score');
    messageEl = document.getElementById('message');

    const redBar = document.getElementById('bar-red');
    const yelBar = document.getElementById('bar-yellow');
    const bluBar = document.getElementById('bar-blue');
    if (redBar && yelBar && bluBar) {
        balanceEls = [redBar, yelBar, bluBar];
    }

    // Camera init
    updateCamera();

    // Go
    startTime = performance.now();
    requestAnimationFrame(frame);

    console.log(`ChromaWar initialized: ${PARTICLE_COUNT.toLocaleString()} particles, ${CLUSTER_COUNT} clusters`);
}

// Auto-init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
