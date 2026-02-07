/**
 * VIB3+ Camera Fractal Vortex
 *
 * A proper showcase demonstrating:
 * - Real-time camera → Gaussian splat conversion
 * - HyperSplatRenderer with instanced 4D rendering
 * - Plastic ratio fractal spiral geometry
 * - 6D rotation through hyperspace
 * - ACES tone mapping, bloom, anamorphic streaks
 *
 * This is meant to impress.
 */

import { SplatRenderPipeline } from '../src/render/SplatRenderPipeline.js';
import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { HyperSplatRenderer } from '../src/render/HyperSplatRenderer.js';

/* ================================================================== */
/*  PLASTIC RATIO                                                      */
/* ================================================================== */

const PLASTIC = 1.3247179572447458; // x³ = x + 1

/* ================================================================== */
/*  SETUP                                                              */
/* ================================================================== */

const canvas = document.getElementById('gl');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', { depth: true, antialias: false });
if (!gl) throw new Error('WebGL2 required');

// Fixed camera looking into the vortex
const camera = new SplatCamera({
  fov: 70 * Math.PI / 180,
  distance: 0.1,
  azimuth: 0,
  elevation: 0,
  target: [0, 0, -5],
  aspect: canvas.width / canvas.height,
  near: 0.01,
  far: 100,
});

function computePointScale() {
  return canvas.height / (2 * Math.tan(camera.fov / 2));
}

// Use HyperSplatRenderer for the full effect
const renderer = new HyperSplatRenderer(gl, {
  pointScale: computePointScale(),
  dimension: 4.2,
});
renderer.intensity = 1.4;
renderer.animate = true;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  camera.aspect = canvas.width / canvas.height;
  renderer.pointScale = computePointScale();
});

/* ================================================================== */
/*  CAMERA FEED                                                        */
/* ================================================================== */

let videoReady = false;
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

const videoCanvas = document.createElement('canvas');
videoCanvas.width = 128;
videoCanvas.height = 128;
const videoCtx = videoCanvas.getContext('2d', { willReadFrequently: true });

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 256 }, height: { ideal: 256 } }
    });
    video.srcObject = stream;
    await video.play();
    videoReady = true;
  } catch (e) {
    console.warn('Camera unavailable, using procedural', e);
    videoReady = false;
  }
}

function sampleVideoPixels() {
  if (!videoReady || video.readyState < 2) return null;
  videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
  return videoCtx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
}

/* ================================================================== */
/*  VORTEX SPLAT GENERATION                                            */
/* ================================================================== */

/**
 * Generate a vortex tunnel of splats from camera pixels.
 * The tunnel spirals into infinity using plastic ratio scaling.
 */
function generateVortexSplats(imageData, time) {
  const seeds = [];
  const { width, height, data } = imageData || { width: 64, height: 64, data: null };

  // Number of spiral layers (depth into the vortex)
  const LAYERS = 12;
  const ARMS = 4;
  const SPLATS_PER_LAYER = 800;

  for (let layer = 0; layer < LAYERS; layer++) {
    // Plastic ratio scaling: deeper layers are smaller and farther
    const layerScale = Math.pow(PLASTIC, -layer);
    const layerZ = -layer * 2.5; // depth into vortex
    const layerRadius = 1.5 * layerScale;

    // Each layer is rotated by plastic angle
    const layerRotation = layer * (2 * Math.PI / PLASTIC);

    for (let arm = 0; arm < ARMS; arm++) {
      const armAngle = (arm / ARMS) * Math.PI * 2 + layerRotation;

      for (let i = 0; i < SPLATS_PER_LAYER / ARMS; i++) {
        const t = i / (SPLATS_PER_LAYER / ARMS);

        // Spiral within the arm
        const spiralAngle = armAngle + t * Math.PI * 0.5;
        const spiralRadius = layerRadius * (0.3 + t * 0.7);

        const x = Math.cos(spiralAngle) * spiralRadius;
        const y = Math.sin(spiralAngle) * spiralRadius;
        const z = layerZ - t * 0.5;

        // Sample color from video at corresponding position
        let r = 0.5, g = 0.5, b = 0.5;
        if (data) {
          // Map splat position to video UV
          const u = (Math.cos(spiralAngle) * 0.5 + 0.5);
          const v = (Math.sin(spiralAngle) * 0.5 + 0.5);
          const px = Math.floor(u * (width - 1));
          const py = Math.floor(v * (height - 1));
          const idx = (py * width + px) * 4;
          r = data[idx] / 255;
          g = data[idx + 1] / 255;
          b = data[idx + 2] / 255;
        } else {
          // Procedural fallback: rainbow based on angle
          const hue = (spiralAngle + time * 0.2) / (Math.PI * 2);
          r = Math.sin(hue * Math.PI * 2) * 0.5 + 0.5;
          g = Math.sin(hue * Math.PI * 2 + 2.094) * 0.5 + 0.5;
          b = Math.sin(hue * Math.PI * 2 + 4.188) * 0.5 + 0.5;
        }

        // Boost brightness for inner layers (closer to viewer)
        const brightness = 1.0 + (1 - layer / LAYERS) * 0.5;
        r *= brightness;
        g *= brightness;
        b *= brightness;

        seeds.push({
          position: [x, y, z],
          orientation: [1, 0, 0, 0],
          scale: 0.04 * layerScale * (0.7 + Math.random() * 0.6),
          color: [
            Math.min(1, r),
            Math.min(1, g),
            Math.min(1, b)
          ],
          depth: layer * 0.3 + Math.random() * 0.2,
        });
      }
    }
  }

  // Add center bright core
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.15;
    seeds.push({
      position: [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        -LAYERS * 2.5 - Math.random() * 2
      ],
      orientation: [1, 0, 0, 0],
      scale: 0.02 + Math.random() * 0.03,
      color: [1, 1, 1],
      depth: 0.1,
    });
  }

  return seeds;
}

/**
 * Generate ambient particle field around the vortex
 */
function generateAmbientSplats() {
  const seeds = [];
  const COUNT = 50000;

  for (let i = 0; i < COUNT; i++) {
    // Distribute in a cone shape
    const t = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const z = -t * 35;
    const radius = 0.5 + t * 4;

    const x = Math.cos(angle) * radius * (0.5 + Math.random());
    const y = Math.sin(angle) * radius * (0.5 + Math.random());

    // Color: cool blues and purples with occasional warm accents
    const hue = Math.random();
    let r, g, b;
    if (hue < 0.7) {
      // Blues/purples
      r = 0.2 + Math.random() * 0.2;
      g = 0.2 + Math.random() * 0.3;
      b = 0.5 + Math.random() * 0.5;
    } else {
      // Warm accents
      r = 0.8 + Math.random() * 0.2;
      g = 0.3 + Math.random() * 0.3;
      b = 0.2 + Math.random() * 0.2;
    }

    seeds.push({
      position: [x, y, z],
      orientation: [1, 0, 0, 0],
      scale: 0.01 + Math.random() * 0.02,
      color: [r, g, b],
      depth: t * 2 + Math.random(),
    });
  }

  return seeds;
}

/* ================================================================== */
/*  RENDER LOOP                                                        */
/* ================================================================== */

let allSeeds = [];
let lastVideoUpdate = 0;
const VIDEO_UPDATE_INTERVAL = 100; // ms

const startTime = performance.now();
const stats = document.getElementById('hud');

function render() {
  requestAnimationFrame(render);

  const now = performance.now();
  const time = (now - startTime) * 0.001;

  // Update video-based splats periodically
  if (now - lastVideoUpdate > VIDEO_UPDATE_INTERVAL) {
    const imageData = sampleVideoPixels();
    const vortexSplats = generateVortexSplats(imageData, time);
    const ambientSplats = generateAmbientSplats();
    allSeeds = [...vortexSplats, ...ambientSplats];

    const encoded = encodeGaussianSeeds(allSeeds);
    renderer.updateSeeds(encoded, allSeeds.length);
    lastVideoUpdate = now;
  }

  // Animate 4D rotation - slow drift through hyperspace
  renderer.rotXW = Math.sin(time * 0.1) * 0.4;
  renderer.rotYW = Math.cos(time * 0.08) * 0.3;
  renderer.rotZW = Math.sin(time * 0.12) * 0.25;

  // Gentle camera drift
  camera.azimuth = Math.sin(time * 0.05) * 0.1;
  camera.elevation = Math.sin(time * 0.07) * 0.05;

  const vp = camera.viewProjection;
  renderer.render(vp, time);

  // Stats
  if (stats) {
    const fps = Math.round(1000 / 16.67);
    stats.textContent = `${(allSeeds.length / 1000).toFixed(0)}K splats × 10 instances = ${(allSeeds.length * 10 / 1000000).toFixed(1)}M | plastic: ${PLASTIC.toFixed(4)}`;
  }
}

/* ================================================================== */
/*  START                                                              */
/* ================================================================== */

const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('startOverlay');

startBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  await startCamera();

  // Initial generation with procedural fallback
  const vortexSplats = generateVortexSplats(null, 0);
  const ambientSplats = generateAmbientSplats();
  allSeeds = [...vortexSplats, ...ambientSplats];

  const encoded = encodeGaussianSeeds(allSeeds);
  renderer.updateSeeds(encoded, allSeeds.length);

  requestAnimationFrame(render);
});
