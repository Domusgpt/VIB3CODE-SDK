/**
 * VIB3+ Hi-Fi Splat Renderer Demo
 *
 * Demonstrates the production-quality HiFiSplatRenderer with:
 *  - Instanced screen-aligned quads (no gl.POINTS)
 *  - Full 3D→2D anisotropic covariance projection
 *  - CPU depth sorting (16-bit radix, back-to-front)
 *  - Frustum culling (6-plane extraction from VP matrix)
 *  - 3-axis anisotropic scale + separate opacity
 *  - Post-processing: Sobel edge detection, VIB3 inscription, tonemap
 */

import { encodeHiFiSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { HiFiSplatRenderer } from '../src/render/HiFiSplatRenderer.js';
import { SplatPostProcess } from '../src/render/SplatPostProcess.js';
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

const postProcess = new SplatPostProcess(gl, {
    enableEdges: true,
    edgeColor: [0.3, 0.7, 1.0],
    edgeIntensity: 1.5,
    edgeSensitivity: 6.0,
    enableInscription: true,
    inscGeometry: 3,
    inscScale: 3.0,
    inscSpeed: 0.3,
    enableTonemap: true,
    exposure: 1.2,
    gamma: 2.2,
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
/*  Post-process controls                                              */
/* ------------------------------------------------------------------ */

function wireCheckbox(id, cb) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => cb(e.target.checked));
}
function wireRange(id, vid, cb) {
    const el = document.getElementById(id), vl = document.getElementById(vid);
    if (el) el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (vl) vl.textContent = v.toFixed(el.step < 1 ? 1 : 0);
        cb(v);
    });
}

wireCheckbox('ppEdges', v => postProcess.enableEdges = v);
wireCheckbox('ppInscription', v => postProcess.enableInscription = v);
wireCheckbox('ppTonemap', v => postProcess.enableTonemap = v);

wireRange('ppSensitivity', 'ppSensitivityVal', v => postProcess.edgeSensitivity = v);
wireRange('ppEdgeIntensity', 'ppEdgeIntensityVal', v => postProcess.edgeIntensity = v);
wireRange('ppInscPattern', 'ppInscPatternVal', v => postProcess.inscGeometry = v);
wireRange('ppExposure', 'ppExposureVal', v => postProcess.exposure = v);

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

    // Animate 4D inscription rotation
    postProcess.rot4dXW = time * 0.15;
    postProcess.rot4dYW = time * 0.1;
    postProcess.rot4dZW = time * 0.08;

    // Render splats to offscreen FBO, then composite with post-processing
    postProcess.beginCapture();
    const stats = renderer.render(viewMatrix, projMatrix, vp, time);
    postProcess.endCaptureAndComposite(time);

    updateStats(frameStart, stats);

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

loadScene('multi');
tick();
