/**
 * VIB3+ Cyberpunk Pyramid Scene — Cinematic Demo
 *
 * 5-layer parallax composition using Gaussian splats as a painting medium.
 * Full cinematic post-processing pipeline: bloom, edge glow, chromatic
 * aberration, vignette, film grain, and HDR tonemap.
 */

import { encodeHiFiSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { HiFiSplatRenderer } from '../src/render/HiFiSplatRenderer.js';
import { SplatPostProcess } from '../src/render/SplatPostProcess.js';
import { generateCyberpunkPyramidScene } from '../src/splat/CyberpunkSceneGenerator.js';

/* ------------------------------------------------------------------ */
/*  Canvas + WebGL setup                                               */
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

/* ------------------------------------------------------------------ */
/*  Camera — cinematic low angle, wide FOV                             */
/* ------------------------------------------------------------------ */

const camera = new SplatCamera({
    fov: 62 * Math.PI / 180,
    distance: 6.5,
    azimuth: 0,
    elevation: 0.12,
    target: [0, 0.3, 0],
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

/* ------------------------------------------------------------------ */
/*  Renderer + cinematic post-processing                               */
/* ------------------------------------------------------------------ */

const renderer = new HiFiSplatRenderer(gl, {
    blendMode: 'premultiplied',
    animate: false,
    intensity: 1.0,
    frustumCull: true,
    depthSort: true,
});

const postProcess = new SplatPostProcess(gl, {
    // Bloom — makes neon edges and moon glow bleed light
    enableBloom: true,
    bloomThreshold: 0.3,
    bloomIntensity: 1.0,
    bloomRadius: 3.5,

    // Edge glow — cyan silhouette outlines
    enableEdges: true,
    edgeColor: [0.0, 0.8, 1.0],
    edgeIntensity: 1.8,
    edgeSensitivity: 7.0,

    // VIB3 inscription — hypercube grid pattern on edges
    enableInscription: true,
    inscGeometry: 1,
    inscScale: 4.5,
    inscSpeed: 0.15,

    // Chromatic aberration — subtle RGB split at screen edges
    enableChroma: true,
    chromaIntensity: 0.004,

    // Vignette — darken screen corners for cinematic frame
    enableVignette: true,
    vignetteIntensity: 0.55,
    vignetteSoftness: 0.28,

    // Film grain — subtle texture
    enableGrain: true,
    grainIntensity: 0.045,

    // HDR tonemap
    enableTonemap: true,
    exposure: 1.5,
    gamma: 2.2,
});

/* ------------------------------------------------------------------ */
/*  Resize handling                                                    */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
});

/* ------------------------------------------------------------------ */
/*  Load scene                                                         */
/* ------------------------------------------------------------------ */

const seeds = generateCyberpunkPyramidScene();
const encoded = encodeHiFiSeeds(seeds);
renderer.updateSeeds(encoded, seeds.length, seeds);

document.getElementById('totalSplats').textContent = seeds.length.toLocaleString();

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

const elFps = document.getElementById('fps');
const elVisible = document.getElementById('visibleSplats');
const elCulled = document.getElementById('culledSplats');
const elSort = document.getElementById('sortTime');

function updateStats(stats) {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        elFps.textContent = displayFps;
        elFps.className = displayFps >= 50 ? 'value good' : displayFps >= 25 ? 'value' : 'value warn';
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
wireCheckbox('ppBloom', v => postProcess.enableBloom = v);
wireCheckbox('ppChroma', v => postProcess.enableChroma = v);
wireCheckbox('ppVignette', v => postProcess.enableVignette = v);
wireCheckbox('ppGrain', v => postProcess.enableGrain = v);

wireRange('ppSensitivity', 'ppSensitivityVal', v => postProcess.edgeSensitivity = v);
wireRange('ppEdgeIntensity', 'ppEdgeIntensityVal', v => postProcess.edgeIntensity = v);
wireRange('ppInscPattern', 'ppInscPatternVal', v => postProcess.inscGeometry = v);
wireRange('ppExposure', 'ppExposureVal', v => postProcess.exposure = v);
wireRange('ppBloomIntensity', 'ppBloomIntensityVal', v => postProcess.bloomIntensity = v);
wireRange('ppBloomThreshold', 'ppBloomThresholdVal', v => postProcess.bloomThreshold = v);
wireRange('ppVignetteStr', 'ppVignetteStrVal', v => postProcess.vignetteIntensity = v);

/* ------------------------------------------------------------------ */
/*  Orbit interaction                                                  */
/* ------------------------------------------------------------------ */

let autoOrbit = true;
canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 4000);
});

/* ------------------------------------------------------------------ */
/*  Render loop — cinematic choreography                               */
/* ------------------------------------------------------------------ */

const startTime = performance.now();

function tick() {
    const time = (performance.now() - startTime) * 0.001;

    if (autoOrbit) {
        // Slow orbit with breathing motion
        camera.azimuth += 0.0012;
        // Sinusoidal elevation: look up at sky, then back at pyramids
        camera.elevation = 0.12 + Math.sin(time * 0.18) * 0.1;
        // Gentle lateral drift for parallax emphasis
        camera.target[0] = Math.sin(time * 0.1) * 0.4;
        camera.target[1] = 0.3 + Math.sin(time * 0.13) * 0.35;
        // Slow dolly breathing
        camera.distance = 6.5 + Math.sin(time * 0.08) * 0.5;
    }

    const viewMatrix = camera.viewMatrix;
    const projMatrix = camera.projMatrix;
    const vp = camera.viewProjection;

    // 4D inscription rotation — slow, dreamy
    postProcess.rot4dXW = time * 0.06;
    postProcess.rot4dYW = time * 0.04;
    postProcess.rot4dZW = time * 0.025;

    // Render: splats → FBO → cinematic post-process → screen
    postProcess.beginCapture();
    const stats = renderer.render(viewMatrix, projMatrix, vp, time);
    postProcess.endCaptureAndComposite(time);

    updateStats(stats);
    requestAnimationFrame(tick);
}

tick();
