/**
 * VIB3+ Hi-Fi Splat Renderer Demo
 *
 * Demonstrates the production-quality HiFiSplatRenderer with:
 *  - Instanced screen-aligned quads (no gl.POINTS)
 *  - Full 3D→2D anisotropic covariance projection
 *  - CPU depth sorting (16-bit radix, back-to-front)
 *  - Frustum culling (6-plane extraction from VP matrix)
 *  - 3-axis anisotropic scale + separate opacity
 */

import { encodeHiFiSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { HiFiSplatRenderer } from '../src/render/HiFiSplatRenderer.js';
import {
    generateTorusSplats,
    generateSphereSplats,
    generateTorusKnotSplats,
    generateHelixSplats,
    generateMultiShapeSplats,
} from '../src/splat/ShapeSplatGenerator.js';

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
    preserveDrawingBuffer: false,
});
if (!gl) throw new Error('WebGL2 required');

const camera = new SplatCamera({
    distance: 5,
    azimuth: 0.3,
    elevation: 0.4,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

const renderer = new HiFiSplatRenderer(gl, {
    blendMode: 'premultiplied',
    animate: false,
    intensity: 1.0,
    frustumCull: true,
    depthSort: true,
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
});

/* ------------------------------------------------------------------ */
/*  Scene definitions                                                  */
/* ------------------------------------------------------------------ */

const SCENES = {
    multi: {
        label: 'Multi-Shape',
        gen: () => generateMultiShapeSplats({ hifi: true }),
        camera: { distance: 5, elevation: 0.4 },
    },
    torus: {
        label: 'Torus 3K',
        gen: () => generateTorusSplats({ hifi: true, uSteps: 80, vSteps: 40, scale: 0.06 }),
        camera: { distance: 4, elevation: 0.5 },
    },
    sphere: {
        label: 'Sphere 2K',
        gen: () => generateSphereSplats({ hifi: true, uSteps: 60, vSteps: 30, scale: 0.07 }),
        camera: { distance: 3.5, elevation: 0.3 },
    },
    knot: {
        label: 'Knot 4K',
        gen: () => generateTorusKnotSplats({ hifi: true, steps: 300, tubeSteps: 12, scale: 0.05 }),
        camera: { distance: 3.5, elevation: 0.4 },
    },
    helix: {
        label: 'Helix 1K',
        gen: () => generateHelixSplats({ hifi: true, steps: 500, scale: 0.06 }),
        camera: { distance: 4, elevation: 0.2 },
    },
};

let currentScene = 'multi';
let seeds = [];
let autoOrbit = true;
const startTime = performance.now();

/* ------------------------------------------------------------------ */
/*  Scene loading                                                      */
/* ------------------------------------------------------------------ */

function loadScene(key) {
    const scene = SCENES[key];
    if (!scene) return;
    currentScene = key;

    if (scene.camera) {
        if (scene.camera.distance != null) camera.distance = scene.camera.distance;
        if (scene.camera.elevation != null) camera.elevation = scene.camera.elevation;
    }

    seeds = scene.gen();
    const encoded = encodeHiFiSeeds(seeds);
    renderer.updateSeeds(encoded, seeds.length, seeds);

    document.getElementById('totalSplats').textContent = seeds.length.toLocaleString();

    document.querySelectorAll('.scene-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scene === key);
    });
}

/* ------------------------------------------------------------------ */
/*  Controls                                                           */
/* ------------------------------------------------------------------ */

document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => loadScene(btn.dataset.scene));
});

canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000);
});

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

const elFps = document.getElementById('fps');
const elFrameTime = document.getElementById('frameTime');
const elVisible = document.getElementById('visibleSplats');
const elCulled = document.getElementById('culledSplats');
const elSort = document.getElementById('sortTime');

function updateStats(frameStart, stats) {
    frameCount++;
    const now = performance.now();

    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        elFps.textContent = displayFps;
        elFrameTime.textContent = (now - frameStart).toFixed(1) + ' ms';
        frameCount = 0;
        lastFpsTime = now;
    }

    if (stats) {
        elVisible.textContent = stats.visibleSplats.toLocaleString();
        elCulled.textContent = stats.culledSplats.toLocaleString();
        elSort.textContent = stats.sortTimeMs.toFixed(1) + ' ms';
    }
}

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

function tick() {
    const frameStart = performance.now();

    if (autoOrbit) {
        camera.azimuth += 0.003;
    }

    const viewMatrix = camera.viewMatrix;
    const projMatrix = camera.projMatrix;
    const vp = camera.viewProjection;
    const time = (performance.now() - startTime) * 0.001;

    const stats = renderer.render(viewMatrix, projMatrix, vp, time);
    updateStats(frameStart, stats);

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

loadScene('multi');
tick();
