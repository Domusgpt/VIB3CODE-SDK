/**
 * VIB3+ Rendering Experiment Lab
 *
 * Test-bed for optimization tricks on the Gaussian splat pipeline.
 * Each technique can be toggled independently with real-time FPS
 * and draw-count impact metrics.
 *
 * Techniques:
 *   1. A/B Frame Interleaving — half the splats per frame (odds/evens)
 *   2. Temporal Persistence   — previous frame decays instead of clearing
 *   3. Stochastic Thinning    — random subset per frame, size-boosted
 *   4. Resolution Scaling     — render at lower res, upscale to native
 *   5. Screen-Space Bloom     — Kawase blur on bright pixels
 *   6. Additive Trail Buffer  — bright-pixel accumulation glow layer
 */

import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { ExperimentalSplatRenderer } from '../src/render/ExperimentalSplatRenderer.js';
import {
    generateGalaxySplats,
    generateNebulaSplats,
} from '../src/splat/GalaxySplatGenerator.js';
import {
    generateSupernovaSplats,
    generateBlackHoleSplats,
} from '../src/splat/MegaSplatGenerator.js';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', {
    depth: true,
    antialias: false,
    // Need float textures for FBOs
    preserveDrawingBuffer: false,
});
if (!gl) throw new Error('WebGL2 required');

const camera = new SplatCamera({
    distance: 9,
    azimuth: 0.3,
    elevation: 0.45,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

function computePointScale() {
    return canvas.height / (2 * Math.tan(camera.fov / 2));
}

const renderer = new ExperimentalSplatRenderer(gl, {
    pointScale: computePointScale(),
    blendMode: 'additive',
    animate: true,
    intensity: 1.0,
    chromatic: 0.5,
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
    renderer.pointScale = computePointScale();
});

/* ------------------------------------------------------------------ */
/*  Scene definitions                                                  */
/* ------------------------------------------------------------------ */

const SCENES = {
    galaxy: {
        label: 'Galaxy 500K',
        gen: () => generateGalaxySplats({ totalSplats: 500000, scale: 0.015 }),
        camera: { distance: 9, elevation: 0.55 },
    },
    nebula: {
        label: 'Nebula 400K',
        gen: () => generateNebulaSplats({ totalSplats: 400000, scale: 0.03 }),
        camera: { distance: 6, elevation: 0.2 },
    },
    supernova: {
        label: 'Supernova 750K',
        gen: () => generateSupernovaSplats({ totalSplats: 750000, scale: 0.018 }),
        camera: { distance: 8, elevation: 0.35 },
    },
    blackhole: {
        label: 'Black Hole 1M',
        gen: () => generateBlackHoleSplats({ totalSplats: 1000000, scale: 0.012 }),
        camera: { distance: 10, elevation: 0.4 },
    },
};

let currentScene = 'galaxy';
let seeds = [];
let autoOrbit = true;
let startTime = performance.now();

/* ------------------------------------------------------------------ */
/*  Scene loading                                                      */
/* ------------------------------------------------------------------ */

function loadScene(key) {
    const scene = SCENES[key];
    if (!scene) return;

    currentScene = key;

    // Camera
    if (scene.camera) {
        if (scene.camera.distance != null) camera.distance = scene.camera.distance;
        if (scene.camera.elevation != null) camera.elevation = scene.camera.elevation;
    }

    // Generate
    seeds = scene.gen();
    const encoded = encodeGaussianSeeds(seeds);
    renderer.updateSeeds(encoded, seeds.length);

    document.getElementById('totalSplats').textContent = seeds.length.toLocaleString();

    // Update scene buttons
    document.querySelectorAll('.scene-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scene === key);
    });
}

/* ------------------------------------------------------------------ */
/*  Controls wiring                                                    */
/* ------------------------------------------------------------------ */

// A/B Interleaving
const toggleAB = document.getElementById('toggleAB');
toggleAB.addEventListener('change', () => {
    renderer.abInterleave = toggleAB.checked;
});

// Temporal Persistence
const toggleTrail = document.getElementById('toggleTrail');
const sliderTrailDecay = document.getElementById('sliderTrailDecay');
const valTrailDecay = document.getElementById('valTrailDecay');

toggleTrail.addEventListener('change', () => {
    renderer.trailDecay = toggleTrail.checked ? (sliderTrailDecay.value / 100) : 0;
});
sliderTrailDecay.addEventListener('input', () => {
    const v = sliderTrailDecay.value / 100;
    valTrailDecay.textContent = v.toFixed(2);
    if (toggleTrail.checked) renderer.trailDecay = v;
});

// Stochastic Thinning
const toggleStoch = document.getElementById('toggleStoch');
const sliderStochDensity = document.getElementById('sliderStochDensity');
const valStochDensity = document.getElementById('valStochDensity');

toggleStoch.addEventListener('change', () => {
    renderer.stochDensity = toggleStoch.checked ? (sliderStochDensity.value / 100) : 1.0;
});
sliderStochDensity.addEventListener('input', () => {
    const v = sliderStochDensity.value / 100;
    valStochDensity.textContent = Math.round(v * 100) + '%';
    if (toggleStoch.checked) renderer.stochDensity = v;
});

// Resolution Scaling
const toggleResScale = document.getElementById('toggleResScale');
const sliderResScale = document.getElementById('sliderResScale');
const valResScale = document.getElementById('valResScale');

toggleResScale.addEventListener('change', () => {
    renderer.resolutionScale = toggleResScale.checked ? (sliderResScale.value / 100) : 1.0;
});
sliderResScale.addEventListener('input', () => {
    const v = sliderResScale.value / 100;
    valResScale.textContent = Math.round(v * 100) + '%';
    if (toggleResScale.checked) renderer.resolutionScale = v;
});

// Bloom
const toggleBloom = document.getElementById('toggleBloom');
const sliderBloomThreshold = document.getElementById('sliderBloomThreshold');
const valBloomThreshold = document.getElementById('valBloomThreshold');
const sliderBloomIntensity = document.getElementById('sliderBloomIntensity');
const valBloomIntensity = document.getElementById('valBloomIntensity');

toggleBloom.addEventListener('change', () => {
    renderer.bloomEnabled = toggleBloom.checked;
});
sliderBloomThreshold.addEventListener('input', () => {
    const v = sliderBloomThreshold.value / 100;
    valBloomThreshold.textContent = v.toFixed(2);
    renderer.bloomThreshold = v;
});
sliderBloomIntensity.addEventListener('input', () => {
    const v = sliderBloomIntensity.value / 100;
    valBloomIntensity.textContent = v.toFixed(2);
    renderer.bloomIntensity = v;
});

// Additive Trail Buffer
const toggleAddTrail = document.getElementById('toggleAddTrail');
toggleAddTrail.addEventListener('change', () => {
    renderer.trailBufferEnabled = toggleAddTrail.checked;
});

// Controls toggle (collapsible panel)
const controlsToggle = document.getElementById('controlsToggle');
const controlsPanel = document.getElementById('controls');
controlsToggle.addEventListener('click', () => {
    const isCollapsed = controlsPanel.classList.toggle('collapsed');
    controlsToggle.classList.toggle('active', !isCollapsed);
});

// Scene buttons
document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => loadScene(btn.dataset.scene));
});

// Orbit control
canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000);
});

/* ------------------------------------------------------------------ */
/*  Stats tracking                                                     */
/* ------------------------------------------------------------------ */

let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

const elFps = document.getElementById('fps');
const elFrameTime = document.getElementById('frameTime');
const elDrawn = document.getElementById('drawnSplats');
const elSavings = document.getElementById('savings');
const elRenderRes = document.getElementById('renderRes');
const elActiveTricks = document.getElementById('activeTricks');

function updateStats(frameStart, result) {
    frameCount++;
    const now = performance.now();

    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        elFps.textContent = displayFps;
        elFrameTime.textContent = (now - frameStart).toFixed(1) + ' ms';
        frameCount = 0;
        lastFpsTime = now;
    }

    if (result) {
        elDrawn.textContent = result.drawnSplats.toLocaleString();
        const saving = seeds.length > 0
            ? Math.round((1 - result.drawnSplats / seeds.length) * 100)
            : 0;
        elSavings.textContent = saving + '%';
    }

    // Render resolution
    const sw = Math.floor(canvas.width * renderer.resolutionScale);
    const sh = Math.floor(canvas.height * renderer.resolutionScale);
    elRenderRes.textContent = sw + 'x' + sh;

    // Count active tricks
    let active = 0;
    if (renderer.abInterleave) active++;
    if (renderer.trailDecay > 0.01) active++;
    if (renderer.stochDensity < 0.999) active++;
    if (renderer.resolutionScale < 0.99) active++;
    if (renderer.bloomEnabled) active++;
    if (renderer.trailBufferEnabled) active++;
    elActiveTricks.textContent = active;
}

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

function tick() {
    const frameStart = performance.now();

    if (autoOrbit) {
        camera.azimuth += 0.0015;
    }

    const vp = camera.viewProjection;
    const time = (performance.now() - startTime) * 0.001;

    const result = renderer.render(vp, time);
    updateStats(frameStart, result);

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

loadScene('galaxy');
tick();
