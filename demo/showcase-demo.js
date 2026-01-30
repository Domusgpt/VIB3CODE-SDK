/**
 * VIB3+ Gaussian Splat Showcase
 *
 * Three modes driven through the same SplatRenderPipeline:
 *   1. Text   — "HELLO WORLD" rendered as thousands of rainbow Gaussian splats
 *   2. Image  — preloaded procedural patterns (or drag-dropped photo) as splat fields
 *   3. Shape  — 3D parametric surfaces with normal-aligned, surface-coloured splats
 *
 * All modes use an orbit camera with perspective projection.
 * Each mode has selectable presets via a sub-bar.
 */

import { SplatRenderPipeline } from '../src/render/SplatRenderPipeline.js';
import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { generateTextSplats } from '../src/splat/TextSplatGenerator.js';
import {
    generateProceduralImageSplats,
    generateCheckerSplats,
    generateSunsetSplats,
    generatePlasmaSplats,
    generateImageSplatsFromElement,
} from '../src/splat/ImageSplatGenerator.js';
import {
    generateTorusKnotSplats,
    generateTorusSplats,
    generateSphereSplats,
    generateHelixSplats,
    generateMultiShapeSplats,
} from '../src/splat/ShapeSplatGenerator.js';
import { parsePlySplats } from '../src/splat/PlySplatLoader.js';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', { depth: true, antialias: false });
if (!gl) throw new Error('WebGL2 required');

const camera = new SplatCamera({
    distance: 5,
    azimuth: 0.3,
    elevation: 0.25,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

/**
 * Compute the correct point-scale factor so that a_scale maps to
 * world-space radius.  The perspective matrix gives:
 *   screenPx = worldSize * (canvasHeight / 2) * f / z
 * where f = 1/tan(fov/2).  Our shader does:
 *   gl_PointSize = a_scale * u_pointScale / clipPos.w
 * So u_pointScale = canvasHeight / (2 * tan(fov/2)).
 */
function computePointScale() {
    return canvas.height / (2 * Math.tan(camera.fov / 2));
}

const pipeline = new SplatRenderPipeline(gl, { pointScale: computePointScale() });

// Handle resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
    pipeline.renderer.pointScale = computePointScale();
});

/* ------------------------------------------------------------------ */
/*  Preset definitions                                                 */
/* ------------------------------------------------------------------ */

const PRESETS = {
    text: [
        {
            label: 'Hello World',
            gen: () => generateTextSplats('HELLO WORLD', {
                scale: 0.13, spacing: 0.16, subSamples: 4,
                jitter: 0.38, depthWave: 0.5, rainbow: true,
            }),
            camera: { distance: 5, elevation: 0.15 },
        },
        {
            label: 'VIB3+',
            gen: () => generateTextSplats('VIB3+', {
                scale: 0.22, spacing: 0.26, subSamples: 5,
                jitter: 0.35, depthWave: 0.6, rainbow: true,
            }),
            camera: { distance: 4, elevation: 0.2 },
        },
        {
            label: 'SPLAT!',
            gen: () => generateTextSplats('SPLAT!', {
                scale: 0.20, spacing: 0.24, subSamples: 6,
                jitter: 0.45, depthWave: 0.8, rainbow: true,
            }),
            camera: { distance: 4, elevation: 0.1 },
        },
    ],

    image: [
        {
            label: 'Radial',
            gen: () => generateProceduralImageSplats(280, {
                gridStep: 2, edgeBoost: 4, scale: 0.04, depthFromLum: 1.0,
            }),
            camera: { distance: 3.5, elevation: 0.3 },
        },
        {
            label: 'Checker',
            gen: () => generateCheckerSplats(280, {
                gridStep: 2, edgeBoost: 3, scale: 0.04, depthFromLum: 0.8,
            }),
            camera: { distance: 3.5, elevation: 0.35 },
        },
        {
            label: 'Sunset',
            gen: () => generateSunsetSplats(280, {
                gridStep: 2, edgeBoost: 3, scale: 0.04, depthFromLum: 1.2,
            }),
            camera: { distance: 3.5, elevation: 0.25 },
        },
        {
            label: 'Plasma',
            gen: () => generatePlasmaSplats(280, {
                gridStep: 2, edgeBoost: 4, scale: 0.04, depthFromLum: 1.0,
            }),
            camera: { distance: 3.5, elevation: 0.3 },
        },
    ],

    shape: [
        {
            label: 'Torus Knot',
            gen: () => generateTorusKnotSplats({
                R: 1.1, r: 0.38, steps: 360, tubeSteps: 16, scale: 0.04,
            }),
            camera: { distance: 4.5, elevation: 0.3 },
        },
        {
            label: 'Torus',
            gen: () => generateTorusSplats({
                R: 1.2, r: 0.45, uSteps: 90, vSteps: 45, scale: 0.045,
            }),
            camera: { distance: 5, elevation: 0.35 },
        },
        {
            label: 'Sphere',
            gen: () => generateSphereSplats({
                radius: 1.3, uSteps: 70, vSteps: 35, scale: 0.05,
            }),
            camera: { distance: 4.5, elevation: 0.25 },
        },
        {
            label: 'DNA Helix',
            gen: () => generateHelixSplats({
                radius: 0.6, pitch: 0.9, turns: 4, steps: 600, scale: 0.05,
            }),
            camera: { distance: 5, elevation: 0.15 },
        },
        {
            label: 'Multi-Shape',
            gen: () => generateMultiShapeSplats(),
            camera: { distance: 6, elevation: 0.3 },
        },
    ],
};

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let currentMode = 'text';
let currentPresetIndex = 0;
let seeds = [];
let autoOrbit = true;
let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

/* ------------------------------------------------------------------ */
/*  Sub-bar rendering                                                  */
/* ------------------------------------------------------------------ */

const subBar = document.getElementById('subBar');

function renderSubBar(mode) {
    const presets = PRESETS[mode];
    subBar.innerHTML = '';
    if (!presets || presets.length <= 1) return;

    presets.forEach((preset, i) => {
        const btn = document.createElement('button');
        btn.className = 'sub-btn' + (i === currentPresetIndex ? ' active' : '');
        btn.textContent = preset.label;
        btn.addEventListener('click', () => selectPreset(i));
        subBar.appendChild(btn);
    });
}

/* ------------------------------------------------------------------ */
/*  Mode & preset switching                                            */
/* ------------------------------------------------------------------ */

function selectPreset(index) {
    const presets = PRESETS[currentMode];
    if (!presets || !presets[index]) return;

    currentPresetIndex = index;
    const preset = presets[index];

    // Update sub-bar active state
    subBar.querySelectorAll('.sub-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // Apply camera preset
    if (preset.camera) {
        if (preset.camera.distance != null) camera.distance = preset.camera.distance;
        if (preset.camera.elevation != null) camera.elevation = preset.camera.elevation;
    }

    // Generate and upload
    seeds = preset.gen();
    uploadSeeds();

    // Flash the preset label
    const flash = document.getElementById('titleFlash');
    flash.textContent = preset.label;
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1000);
}

function switchMode(mode) {
    currentMode = mode;
    currentPresetIndex = 0;

    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('modeLabel').textContent = mode;

    // Show/hide hints
    document.getElementById('dropHint').classList.toggle('visible', mode === 'image');
    document.getElementById('plyHint').classList.toggle('visible', mode === 'shape');

    // Render sub-bar for this mode
    renderSubBar(mode);

    // Flash title
    const flash = document.getElementById('titleFlash');
    const titles = { text: 'Text Splats', image: 'Image Splats', shape: '3D Shape Splats' };
    flash.textContent = titles[mode] || mode;
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1200);

    // Load first preset
    selectPreset(0);
}

function uploadSeeds() {
    const encoded = encodeGaussianSeeds(seeds);
    pipeline.renderer.updateSeeds(encoded, seeds.length);
    document.getElementById('splatCount').textContent = seeds.length.toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

function tick() {
    // Auto-orbit
    if (autoOrbit) {
        camera.azimuth += 0.004;
    }

    const vp = camera.viewProjection;

    // Render with the current VP matrix
    pipeline.renderer.render(vp);

    // FPS counter
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        document.getElementById('fps').textContent = displayFps;
        frameCount = 0;
        lastFpsTime = now;
    }

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  UI Wiring                                                          */
/* ------------------------------------------------------------------ */

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// Pause auto-orbit during drag
canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000); // resume after 3s idle
});

// Image drag-and-drop
canvas.addEventListener('dragover', e => { e.preventDefault(); });
canvas.addEventListener('drop', e => {
    e.preventDefault();
    if (currentMode !== 'image') switchMode('image');
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
        seeds = generateImageSplatsFromElement(img, {
            gridStep: 3, edgeBoost: 4, scale: 0.04, depthFromLum: 1.5,
        });
        uploadSeeds();
    };
    img.src = URL.createObjectURL(file);
});

// PLY file upload
document.getElementById('plyFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    seeds = parsePlySplats(buf, { maxSplats: 100000, scaleMultiplier: 8 });
    uploadSeeds();
    camera.distance = 6;
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

switchMode('text');
tick();
