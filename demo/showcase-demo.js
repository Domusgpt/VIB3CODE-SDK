/**
 * VIB3+ Gaussian Splat Showcase
 *
 * Three modes driven through the same SplatRenderPipeline:
 *   1. Text   — "HELLO WORLD" rendered as thousands of rainbow Gaussian splats
 *   2. Image  — procedural pattern (or drag-dropped photo) as a splat field
 *   3. Shape  — 3D torus knot with normal-aligned, surface-coloured splats
 *
 * All modes use an orbit camera with perspective projection.
 */

import { SplatRenderPipeline } from '../src/render/SplatRenderPipeline.js';
import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { generateTextSplats } from '../src/splat/TextSplatGenerator.js';
import {
    generateProceduralImageSplats,
    generateImageSplatsFromElement,
} from '../src/splat/ImageSplatGenerator.js';
import { generateTorusKnotSplats } from '../src/splat/ShapeSplatGenerator.js';
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

const pipeline = new SplatRenderPipeline(gl, { pointScale: 28 });

const camera = new SplatCamera({
    distance: 5,
    azimuth: 0.3,
    elevation: 0.25,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

// Handle resize
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
});

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let currentMode = 'text';
let seeds = [];
let autoOrbit = true;
let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

/* ------------------------------------------------------------------ */
/*  Seed generators                                                    */
/* ------------------------------------------------------------------ */

function generateForMode(mode) {
    switch (mode) {
        case 'text':
            return generateTextSplats('HELLO WORLD', {
                scale: 0.13,
                spacing: 0.16,
                subSamples: 4,
                jitter: 0.38,
                depthWave: 0.5,
                rainbow: true,
            });

        case 'image':
            return generateProceduralImageSplats(320, {
                gridStep: 2,
                edgeBoost: 4,
                scale: 0.05,
                depthFromLum: 2.0,
            });

        case 'shape':
            return generateTorusKnotSplats({
                R: 1.1,
                r: 0.38,
                steps: 360,
                tubeSteps: 16,
                scale: 0.04,
            });

        default:
            return [];
    }
}

function switchMode(mode) {
    currentMode = mode;

    // Update buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    document.getElementById('modeLabel').textContent = mode;

    // Show/hide hints
    document.getElementById('dropHint').classList.toggle('visible', mode === 'image');
    document.getElementById('plyHint').classList.toggle('visible', mode === 'shape');

    // Flash title
    const flash = document.getElementById('titleFlash');
    const titles = { text: 'HELLO WORLD', image: 'Image \u2192 Splats', shape: '3D Gaussian Splats' };
    flash.textContent = titles[mode] || mode;
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 1200);

    // Camera presets per mode
    if (mode === 'text') {
        camera.distance = 5;
        camera.elevation = 0.15;
    } else if (mode === 'image') {
        camera.distance = 4;
        camera.elevation = 0.35;
    } else {
        camera.distance = 4.5;
        camera.elevation = 0.3;
    }

    // Generate seeds
    seeds = generateForMode(mode);
    uploadSeeds();
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

    // Use pipeline's lower-level path: we already uploaded seeds once,
    // so just render with the current VP matrix.
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
            gridStep: 3,
            edgeBoost: 4,
            scale: 0.05,
            depthFromLum: 2.0,
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
