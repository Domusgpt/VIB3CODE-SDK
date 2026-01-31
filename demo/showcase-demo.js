/**
 * VIB3+ Gaussian Splat Showcase
 *
 * Six modes driven through two renderers:
 *   1. Text    — rainbow text rendered as thousands of Gaussian splats
 *   2. Image   — procedural patterns (or drag-dropped photos) as splat fields
 *   3. Shape   — 3D parametric surfaces with normal-aligned splats
 *   4. Massive — 250K–500K+ splats with GPU-driven animation
 *   5. Ultra   — 750K–1M+ splats: Supernova, Black Hole, Aurora,
 *                Fireworks, Quantum Field — the efficiency vertical slice
 *   6. WOAH    — 10M splats via instanced rendering (1M base × 10 instances)
 *                with 4D hyperspace rotation, ACES tone mapping,
 *                anamorphic streaks, and aurora shimmer
 *
 * Modes 1-5 use SplatRenderPipeline (GaussianSplatRenderer).
 * Mode 6 uses HyperSplatRenderer with drawArraysInstanced.
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
import {
    generateGalaxySplats,
    generateNebulaSplats,
    generateParticleStormSplats,
    generateStarFieldSplats,
} from '../src/splat/GalaxySplatGenerator.js';
import {
    generateSupernovaSplats,
    generateBlackHoleSplats,
    generateAuroraSplats,
    generateFireworksSplats,
    generateQuantumFieldSplats,
} from '../src/splat/MegaSplatGenerator.js';
import { parsePlySplats } from '../src/splat/PlySplatLoader.js';
import { HyperSplatRenderer } from '../src/render/HyperSplatRenderer.js';
import { generateHyperSceneSplats } from '../src/splat/HyperSceneGenerator.js';

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

/** Correct point-scale: maps a_scale to world-space radius on screen. */
function computePointScale() {
    return canvas.height / (2 * Math.tan(camera.fov / 2));
}

const pipeline = new SplatRenderPipeline(gl, { pointScale: computePointScale() });

/** HyperSplatRenderer — created lazily on first WOAH mode activation. */
let hyperRenderer = null;
function getHyperRenderer() {
    if (!hyperRenderer) {
        hyperRenderer = new HyperSplatRenderer(gl, {
            pointScale: computePointScale(),
            dimension: 4.0,
        });
    }
    return hyperRenderer;
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
    pipeline.renderer.pointScale = computePointScale();
    if (hyperRenderer) hyperRenderer.pointScale = computePointScale();
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

    massive: [
        {
            label: 'Galaxy 500K',
            gen: () => generateGalaxySplats({ totalSplats: 500000, scale: 0.015 }),
            camera: { distance: 9, elevation: 0.55 },
            pcgBytes: 28,
        },
        {
            label: 'Nebula 400K',
            gen: () => generateNebulaSplats({ totalSplats: 400000, scale: 0.03 }),
            camera: { distance: 6, elevation: 0.2 },
            pcgBytes: 16,
        },
        {
            label: 'Vortex 500K',
            gen: () => generateParticleStormSplats({ totalSplats: 500000, scale: 0.012 }),
            camera: { distance: 8, elevation: 0.15 },
            pcgBytes: 24,
        },
        {
            label: 'Star Field',
            gen: () => generateStarFieldSplats({ totalSplats: 300000, scale: 0.01 }),
            camera: { distance: 10, elevation: 0.1 },
            pcgBytes: 12,
        },
        {
            label: 'Galaxy 1M',
            gen: () => generateGalaxySplats({ totalSplats: 1000000, scale: 0.01 }),
            camera: { distance: 10, elevation: 0.5 },
            pcgBytes: 28,
        },
    ],

    woah: [
        {
            label: '10M Universe',
            gen: () => generateHyperSceneSplats({ totalSplats: 1000000 }),
            camera: { distance: 15, elevation: 0.35 },
            pcgBytes: 12,
            isHyper: true,
        },
    ],

    ultra: [
        {
            label: 'Supernova',
            gen: () => generateSupernovaSplats({ totalSplats: 750000, scale: 0.018 }),
            camera: { distance: 8, elevation: 0.35 },
            pcgBytes: 24,
            chromatic: 0.6,
        },
        {
            label: 'Black Hole',
            gen: () => generateBlackHoleSplats({ totalSplats: 1000000, scale: 0.012 }),
            camera: { distance: 10, elevation: 0.4 },
            pcgBytes: 24,
            chromatic: 0.8,
        },
        {
            label: 'Aurora',
            gen: () => generateAuroraSplats({ totalSplats: 800000, scale: 0.02 }),
            camera: { distance: 8, elevation: 0.3 },
            pcgBytes: 20,
            chromatic: 0.4,
        },
        {
            label: 'Fireworks',
            gen: () => generateFireworksSplats({ totalSplats: 750000, scale: 0.018 }),
            camera: { distance: 10, elevation: 0.4 },
            pcgBytes: 12,
            chromatic: 0.5,
        },
        {
            label: 'Quantum Field',
            gen: () => generateQuantumFieldSplats({ totalSplats: 1000000, scale: 0.015 }),
            camera: { distance: 8, elevation: 0.3 },
            pcgBytes: 16,
            chromatic: 0.7,
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
let lastGenTime = 0;
let lastPcgBytes = 0;
let startTime = performance.now();

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
/*  Efficiency metrics                                                 */
/* ------------------------------------------------------------------ */

const metricsPanel = document.getElementById('metricsPanel');

function updateMetrics() {
    const isWoah = currentMode === 'woah';
    const baseCount = seeds.length;
    const visualCount = isWoah ? baseCount * 10 : baseCount;
    const plyBytes = visualCount * 48; // 12 floats × 4 bytes
    const pcg = lastPcgBytes || 32;
    const compression = plyBytes > 0 ? Math.round(plyBytes / pcg) : 0;
    const gpuBuf = baseCount * 12 * 4 + (isWoah ? 320 : 0); // + instance buffer

    document.getElementById('metSplats').textContent =
        isWoah ? visualCount.toLocaleString() + ' (10×inst)' : visualCount.toLocaleString();
    document.getElementById('metGenTime').textContent = lastGenTime.toFixed(1) + ' ms';
    document.getElementById('metPcgSize').textContent = pcg + ' bytes';
    document.getElementById('metPlySize').textContent = formatBytes(plyBytes);
    document.getElementById('metCompression').textContent = compression.toLocaleString() + ':1';
    document.getElementById('metGpuBuf').textContent = formatBytes(gpuBuf);
}

function updateFrameTime(ms) {
    document.getElementById('metFrameTime').textContent = ms.toFixed(1) + ' ms';
}

function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
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

    // Camera preset
    if (preset.camera) {
        if (preset.camera.distance != null) camera.distance = preset.camera.distance;
        if (preset.camera.elevation != null) camera.elevation = preset.camera.elevation;
    }

    // Chromatic aberration per preset
    pipeline.renderer.chromatic = preset.chromatic || 0;

    // Generate with timing
    const t0 = performance.now();
    seeds = preset.gen();
    lastGenTime = performance.now() - t0;
    lastPcgBytes = preset.pcgBytes || 32;

    // Upload to the appropriate renderer
    if (preset.isHyper) {
        const hr = getHyperRenderer();
        const encoded = encodeGaussianSeeds(seeds);
        hr.updateSeeds(encoded, seeds.length);
    } else {
        uploadSeeds();
    }

    document.getElementById('splatCount').textContent =
        preset.isHyper
            ? (seeds.length * 10).toLocaleString() + ' (instanced)'
            : seeds.length.toLocaleString();

    // Update metrics if in massive/ultra/woah mode
    if (currentMode === 'massive' || currentMode === 'ultra' || currentMode === 'woah') {
        updateMetrics();
    }

    // Flash
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

    // Show/hide contextual UI
    document.getElementById('dropHint').classList.toggle('visible', mode === 'image');
    document.getElementById('plyHint').classList.toggle('visible', mode === 'shape');
    metricsPanel.classList.toggle('visible', mode === 'massive' || mode === 'ultra' || mode === 'woah');

    // Renderer config for animated modes
    const isAnimated = mode === 'massive' || mode === 'ultra';
    pipeline.renderer.animate = isAnimated;
    pipeline.renderer.blendMode = isAnimated ? 'additive' : 'premultiplied';
    pipeline.renderer.intensity = mode === 'ultra' ? 1.2 : 1.0;

    // Render sub-bar
    renderSubBar(mode);

    // Flash title
    const flash = document.getElementById('titleFlash');
    const titles = {
        text: 'Text Splats',
        image: 'Image Splats',
        shape: '3D Shape Splats',
        massive: 'Massive Scale',
        ultra: 'Ultra Scale',
        woah: '10M HYPERSPACE',
    };
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
    const frameStart = performance.now();

    if (autoOrbit) {
        const speed = currentMode === 'woah' ? 0.001
            : (currentMode === 'massive' || currentMode === 'ultra') ? 0.0015
            : 0.004;
        camera.azimuth += speed;
    }

    const vp = camera.viewProjection;
    const time = (performance.now() - startTime) * 0.001; // seconds

    // WOAH mode uses HyperSplatRenderer, others use pipeline
    if (currentMode === 'woah' && hyperRenderer) {
        hyperRenderer.render(vp, time);
    } else {
        pipeline.renderer.render(vp, time);
    }

    // FPS + frame time
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        document.getElementById('fps').textContent = displayFps;
        frameCount = 0;
        lastFpsTime = now;

        if (currentMode === 'massive' || currentMode === 'ultra' || currentMode === 'woah') {
            updateFrameTime(now - frameStart);
        }
    }

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  UI Wiring                                                          */
/* ------------------------------------------------------------------ */

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000);
});

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
