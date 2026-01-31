/**
 * VIB3+ Fluid Tank Demo
 *
 * 20K water particles in a glass tank with accelerometer/gravity control.
 *
 * Why Gaussian splatting is uniquely suited to fluid:
 *   - Each splat IS a density kernel (same math as SPH fluid simulation)
 *   - Additive blending naturally creates continuous density visualization
 *   - Overlapping splats form a continuous surface without mesh extraction
 *   - Size encodes pressure, color encodes velocity — built into splat properties
 *   - The GL_LINES wireframe tank provides crisp spatial reference that
 *     contrasts with the soft Gaussian water body
 *
 * Controls:
 *   - Device tilt (accelerometer) controls gravity direction
 *   - Mouse/touch position tilts gravity (desktop fallback)
 *   - "Shake" button agitates water
 *   - "Reset" refills the tank
 *   - Drag to orbit camera, scroll to zoom
 */

import { GAUSSIAN_SEED_STRIDE } from '../src/render/GaussianSeedBuffer.js';
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_PARTICLES = 20000;
const TANK_W = 1.5;     // half-width  (X extent)
const TANK_H = 1.2;     // half-height (Y extent, full height = 2.4)
const TANK_D = 1.5;     // half-depth  (Z extent)
const DAMPING = 0.997;
const BOUNCE = 0.25;
const FRICTION = 0.92;
const PRESSURE = 3.0;   // hydrostatic pressure strength
const TURBULENCE = 0.4;
const WAVE_FORCE = 0.08;
const RECYCLE_Y = -TANK_H * 4; // recycle particles that fall this far

/* ------------------------------------------------------------------ */
/*  Canvas + WebGL                                                     */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', { depth: true, antialias: false });
if (!gl) throw new Error('WebGL2 required');

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */

const camera = new SplatCamera({
    distance: 6,
    azimuth: 0.3,
    elevation: 0.45,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

function computePointScale() {
    return canvas.height / (2 * Math.tan(camera.fov / 2));
}

/* ------------------------------------------------------------------ */
/*  Splat Renderer                                                     */
/* ------------------------------------------------------------------ */

const renderer = new GaussianSplatRenderer(gl, {
    pointScale: computePointScale(),
    blendMode: 'additive',
    animate: false,    // physics drives motion, not GPU animation
    intensity: 0.9,
    chromatic: 0.1,
});

/* ------------------------------------------------------------------ */
/*  Resize                                                             */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
    renderer.pointScale = computePointScale();
});

/* ------------------------------------------------------------------ */
/*  Particle state (Structure-of-Arrays for cache performance)         */
/* ------------------------------------------------------------------ */

const posX = new Float32Array(NUM_PARTICLES);
const posY = new Float32Array(NUM_PARTICLES);
const posZ = new Float32Array(NUM_PARTICLES);
const velX = new Float32Array(NUM_PARTICLES);
const velY = new Float32Array(NUM_PARTICLES);
const velZ = new Float32Array(NUM_PARTICLES);

function resetParticles() {
    for (let i = 0; i < NUM_PARTICLES; i++) {
        posX[i] = (Math.random() - 0.5) * TANK_W * 1.8;
        posY[i] = -TANK_H + Math.random() * TANK_H * 1.2; // bottom ~60%
        posZ[i] = (Math.random() - 0.5) * TANK_D * 1.8;
        velX[i] = velY[i] = velZ[i] = 0;
    }
}
resetParticles();

/* ------------------------------------------------------------------ */
/*  Gravity (accelerometer + mouse fallback)                           */
/* ------------------------------------------------------------------ */

let gravX = 0, gravY = -9.8, gravZ = 0;
let accelAvailable = false;

function handleOrientation(e) {
    accelAvailable = true;
    const beta  = (e.beta  || 0) * Math.PI / 180;
    const gamma = (e.gamma || 0) * Math.PI / 180;
    gravX =  Math.sin(gamma) * 9.8;
    gravY = -Math.cos(beta) * Math.cos(gamma) * 9.8;
    gravZ =  Math.sin(beta) * Math.cos(gamma) * 9.8;
    updateGravityIndicator();
}

async function requestAccel() {
    try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ requires permission
            const state = await DeviceOrientationEvent.requestPermission();
            if (state === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                document.getElementById('tiltBtn').textContent = 'Tilt Active';
                document.getElementById('tiltBtn').classList.add('active');
            }
        } else {
            // Android, desktop — just listen
            window.addEventListener('deviceorientation', handleOrientation);
            setTimeout(() => {
                if (accelAvailable) {
                    document.getElementById('tiltBtn').textContent = 'Tilt Active';
                    document.getElementById('tiltBtn').classList.add('active');
                }
            }, 500);
        }
    } catch (_) {
        // Accelerometer unavailable — mouse fallback will be used
    }
}

// Mouse/touch gravity fallback (desktop)
canvas.addEventListener('pointermove', (e) => {
    if (accelAvailable) return;
    const cx = (e.clientX / window.innerWidth  - 0.5) * 2; // -1..1
    const cy = (e.clientY / window.innerHeight - 0.5) * 2;
    gravX = cx * 6;
    gravY = -9.8 + cy * 4;
    gravZ = 0;
    updateGravityIndicator();
});

function updateGravityIndicator() {
    const el = document.getElementById('gravDir');
    if (!el) return;
    const angle = Math.atan2(gravX, -gravY) * 180 / Math.PI;
    el.style.transform = `rotate(${angle}deg)`;
}

/* ------------------------------------------------------------------ */
/*  Wireframe tank (GL_LINES with separate shader program)             */
/* ------------------------------------------------------------------ */

const WIRE_VERT = `#version 300 es
in vec3 a_pos;
uniform mat4 u_vp;
void main() { gl_Position = u_vp * vec4(a_pos, 1.0); }
`;

const WIRE_FRAG = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 fragColor;
void main() { fragColor = u_color; }
`;

let wireProgram, wireVAO, wireUniforms;

function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Wire shader compile error:', gl.getShaderInfoLog(s));
    }
    return s;
}

function initWireframe() {
    wireProgram = gl.createProgram();
    gl.attachShader(wireProgram, compileShader(gl.VERTEX_SHADER, WIRE_VERT));
    gl.attachShader(wireProgram, compileShader(gl.FRAGMENT_SHADER, WIRE_FRAG));
    gl.linkProgram(wireProgram);
    if (!gl.getProgramParameter(wireProgram, gl.LINK_STATUS)) {
        console.error('Wire program link error:', gl.getProgramInfoLog(wireProgram));
    }

    wireUniforms = {
        vp:    gl.getUniformLocation(wireProgram, 'u_vp'),
        color: gl.getUniformLocation(wireProgram, 'u_color'),
    };

    // 12 edges of a box = 24 line-pair vertices
    const W = TANK_W, H = TANK_H, D = TANK_D;
    const v = new Float32Array([
        // Bottom square
        -W,-H,-D,   W,-H,-D,    W,-H,-D,   W,-H, D,
         W,-H, D,  -W,-H, D,   -W,-H, D,  -W,-H,-D,
        // Top rim
        -W, H,-D,   W, H,-D,    W, H,-D,   W, H, D,
         W, H, D,  -W, H, D,   -W, H, D,  -W, H,-D,
        // Vertical pillars
        -W,-H,-D,  -W, H,-D,    W,-H,-D,   W, H,-D,
         W,-H, D,   W, H, D,   -W,-H, D,  -W, H, D,
    ]);

    wireVAO = gl.createVertexArray();
    gl.bindVertexArray(wireVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(wireProgram, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
}

function renderTank(vp) {
    gl.useProgram(wireProgram);
    gl.bindVertexArray(wireVAO);
    gl.uniformMatrix4fv(wireUniforms.vp, false, vp);
    gl.uniform4f(wireUniforms.color, 0.35, 0.6, 0.85, 0.35);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.drawArrays(gl.LINES, 0, 24);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
}

initWireframe();

/* ------------------------------------------------------------------ */
/*  HSL -> RGB                                                         */
/* ------------------------------------------------------------------ */

function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [r + m, g + m, b + m];
}

/* ------------------------------------------------------------------ */
/*  Splat buffer (pre-allocated, reused every frame)                   */
/* ------------------------------------------------------------------ */

const splatBuffer = new Float32Array(NUM_PARTICLES * GAUSSIAN_SEED_STRIDE);

/* ------------------------------------------------------------------ */
/*  Physics                                                            */
/* ------------------------------------------------------------------ */

let simTime = 0;
let spilledCount = 0;

function stepPhysics(dt) {
    // Estimate water surface level from average Y
    let sumY = 0, inTank = 0;
    for (let i = 0; i < NUM_PARTICLES; i++) {
        if (posY[i] > RECYCLE_Y) { sumY += posY[i]; inTank++; }
    }
    const avgY = inTank > 0 ? sumY / inTank : 0;
    const surfaceY = avgY + 0.35;

    spilledCount = 0;

    for (let i = 0; i < NUM_PARTICLES; i++) {
        // Gravity
        velX[i] += gravX * dt;
        velY[i] += gravY * dt;
        velZ[i] += gravZ * dt;

        // Hydrostatic pressure approximation: push up when below surface
        if (posY[i] < surfaceY && posY[i] >= -TANK_H) {
            const depth = surfaceY - posY[i];
            velY[i] += depth * PRESSURE * dt;
        }

        // Surface waves (sinusoidal cross-pattern)
        const wave = Math.sin(posX[i] * 2.5 + simTime * 1.8) *
                     Math.cos(posZ[i] * 2.5 + simTime * 1.3) *
                     WAVE_FORCE * dt;
        velY[i] += wave;

        // Turbulence (Brownian jitter)
        velX[i] += (Math.random() - 0.5) * TURBULENCE * dt;
        velY[i] += (Math.random() - 0.5) * TURBULENCE * dt * 0.5;
        velZ[i] += (Math.random() - 0.5) * TURBULENCE * dt;

        // Viscous damping
        velX[i] *= DAMPING;
        velY[i] *= DAMPING;
        velZ[i] *= DAMPING;

        // Integrate position
        posX[i] += velX[i] * dt;
        posY[i] += velY[i] * dt;
        posZ[i] += velZ[i] * dt;

        // --- Tank collision (5 faces, open top) ---

        const belowRim = posY[i] <= TANK_H;

        // Bottom
        if (posY[i] < -TANK_H) {
            posY[i] = -TANK_H;
            velY[i] = Math.abs(velY[i]) * BOUNCE;
            velX[i] *= FRICTION;
            velZ[i] *= FRICTION;
        }

        // Walls (only apply below the rim — above the rim, particles spill freely)
        if (belowRim) {
            if (posX[i] < -TANK_W) {
                posX[i] = -TANK_W;
                velX[i] = Math.abs(velX[i]) * BOUNCE;
            } else if (posX[i] > TANK_W) {
                posX[i] = TANK_W;
                velX[i] = -Math.abs(velX[i]) * BOUNCE;
            }
            if (posZ[i] < -TANK_D) {
                posZ[i] = -TANK_D;
                velZ[i] = Math.abs(velZ[i]) * BOUNCE;
            } else if (posZ[i] > TANK_D) {
                posZ[i] = TANK_D;
                velZ[i] = -Math.abs(velZ[i]) * BOUNCE;
            }
        } else {
            spilledCount++;
        }

        // Recycle particles that fall far below the scene
        if (posY[i] < RECYCLE_Y) {
            posX[i] = (Math.random() - 0.5) * TANK_W * 0.5;
            posY[i] = TANK_H * 0.8;
            posZ[i] = (Math.random() - 0.5) * TANK_D * 0.5;
            velX[i] = velY[i] = velZ[i] = 0;
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Generate splats from particle state                                */
/* ------------------------------------------------------------------ */

function generateSplats() {
    for (let i = 0; i < NUM_PARTICLES; i++) {
        const speed = Math.sqrt(
            velX[i] * velX[i] + velY[i] * velY[i] + velZ[i] * velZ[i]
        );
        const speedNorm = Math.min(1, speed / 6);
        const depthInTank = Math.max(0, Math.min(1,
            (TANK_H - posY[i]) / (2 * TANK_H)
        ));

        // Water color: deep blue at bottom, lighter at surface, whitish foam at speed
        const hue = 200 + depthInTank * 20 - speedNorm * 30;
        const sat = 0.65 - speedNorm * 0.3;
        const lit = 0.15 + (1 - depthInTank) * 0.1 + speedNorm * 0.25;
        const [r, g, b] = hsl(hue, sat, lit);

        // Larger deeper (pressure), boost at speed (foam splash)
        const scale = 0.04 + depthInTank * 0.012 + speedNorm * 0.01;

        const off = i * GAUSSIAN_SEED_STRIDE;
        splatBuffer[off + 0]  = posX[i];
        splatBuffer[off + 1]  = posY[i];
        splatBuffer[off + 2]  = posZ[i];
        splatBuffer[off + 3]  = scale;
        splatBuffer[off + 4]  = 1; // quaternion identity
        splatBuffer[off + 5]  = 0;
        splatBuffer[off + 6]  = 0;
        splatBuffer[off + 7]  = 0;
        splatBuffer[off + 8]  = r;
        splatBuffer[off + 9]  = g;
        splatBuffer[off + 10] = b;
        splatBuffer[off + 11] = speedNorm * 0.4; // bloom energy for fast particles
    }
    return NUM_PARTICLES;
}

/* ------------------------------------------------------------------ */
/*  Shake                                                              */
/* ------------------------------------------------------------------ */

function shakeWater() {
    for (let i = 0; i < NUM_PARTICLES; i++) {
        velX[i] += (Math.random() - 0.5) * 8;
        velY[i] += Math.random() * 6;
        velZ[i] += (Math.random() - 0.5) * 8;
    }
}

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

let frameCount = 0;
let lastFpsTime = performance.now();
let lastTime = performance.now();
let autoOrbit = true;

function tick() {
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastTime) * 0.001); // cap at ~30fps step
    lastTime = now;
    simTime += dt;

    if (autoOrbit) camera.azimuth += 0.0008;

    // Physics
    stepPhysics(dt);

    // Build splats
    const count = generateSplats();

    // Upload to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        splatBuffer.subarray(0, count * GAUSSIAN_SEED_STRIDE),
        gl.DYNAMIC_DRAW
    );
    renderer.count = count;

    // Draw splats, then wireframe tank on top
    const vp = camera.viewProjection;
    renderer.render(vp, simTime);
    renderTank(vp);

    // Stats
    frameCount++;
    if (now - lastFpsTime > 500) {
        const fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        document.getElementById('fps').textContent = fps;
        document.getElementById('particles').textContent = count.toLocaleString();
        document.getElementById('spilled').textContent = spilledCount.toLocaleString();
        frameCount = 0;
        lastFpsTime = now;
    }

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  UI wiring                                                          */
/* ------------------------------------------------------------------ */

document.getElementById('tiltBtn').addEventListener('click', requestAccel);
document.getElementById('shakeBtn').addEventListener('click', shakeWater);
document.getElementById('resetBtn').addEventListener('click', resetParticles);

canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000);
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

// Try auto-starting accelerometer (Android doesn't need explicit permission)
requestAccel();

tick();
