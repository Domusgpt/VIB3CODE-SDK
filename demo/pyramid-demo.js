/**
 * VIB3+ Cyberpunk Pyramid Scene Demo
 *
 * 5-layer parallax composition using Gaussian splats:
 *  - Stars & nebula → moon & planets → distant pyramids → foreground → atmosphere
 *  - Translucent overlapping splats create colour mixing
 *  - Slow orbit with gentle vertical bob for parallax emphasis
 *  - Post-processing: edge glow, VIB3 inscription, tonemap
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
/*  Camera — lower angle looking up at pyramids, wide FOV              */
/* ------------------------------------------------------------------ */

const camera = new SplatCamera({
    fov: 60 * Math.PI / 180,   // wider than default for cinematic feel
    distance: 6,
    azimuth: 0,
    elevation: 0.15,           // slight upward look → sky visible
    target: [0, 0.5, 0],      // slightly above origin
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

/* ------------------------------------------------------------------ */
/*  Renderer + post-processing                                         */
/* ------------------------------------------------------------------ */

const renderer = new HiFiSplatRenderer(gl, {
    blendMode: 'premultiplied',
    animate: false,
    intensity: 1.0,
    frustumCull: true,
    depthSort: true,
});

const postProcess = new SplatPostProcess(gl, {
    enableEdges: true,
    edgeColor: [0.0, 1.0, 1.0],     // neon cyan edges
    edgeIntensity: 2.0,
    edgeSensitivity: 8.0,
    enableInscription: true,
    inscGeometry: 1,                  // hypercube grid pattern
    inscScale: 4.0,
    inscSpeed: 0.2,
    enableTonemap: true,
    exposure: 1.4,
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
/*  Orbit interaction                                                  */
/* ------------------------------------------------------------------ */

let autoOrbit = true;
canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 4000);
});

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

const startTime = performance.now();

function tick() {
    const time = (performance.now() - startTime) * 0.001;

    // Slow cinematic orbit with gentle vertical bob for parallax
    if (autoOrbit) {
        camera.azimuth += 0.0015;                         // very slow rotation
        camera.elevation = 0.15 + Math.sin(time * 0.2) * 0.08; // gentle nod
        camera.target[1] = 0.5 + Math.sin(time * 0.15) * 0.3; // vertical drift
    }

    const viewMatrix = camera.viewMatrix;
    const projMatrix = camera.projMatrix;
    const vp = camera.viewProjection;

    // Animate 4D inscription rotation — slow, dreamy
    postProcess.rot4dXW = time * 0.08;
    postProcess.rot4dYW = time * 0.05;
    postProcess.rot4dZW = time * 0.03;

    // Render splats → FBO → post-process → screen
    postProcess.beginCapture();
    const stats = renderer.render(viewMatrix, projMatrix, vp, time);
    postProcess.endCaptureAndComposite(time);

    updateStats(stats);
    requestAnimationFrame(tick);
}

tick();
