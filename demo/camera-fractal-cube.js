/**
 * VIB3+ Camera Fractal Vortex
 *
 * Your face as a 3D splat cloud, repeated into infinity.
 * - Sobel edge detection → dense splats at edges
 * - Luminance → Z depth → face has 3D structure
 * - Plastic ratio layers receding into the void
 * - Audio reactivity: bass=pulse, mid=hue, high=twinkle
 * - HyperSplatRenderer with 4D hyperspace rotation
 */

import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';
import { HyperSplatRenderer } from '../src/render/HyperSplatRenderer.js';

/* ================================================================== */
/*  CONSTANTS                                                          */
/* ================================================================== */

const PLASTIC = 1.3247179572447458;

/* ================================================================== */
/*  CANVAS + GL                                                        */
/* ================================================================== */

const canvas = document.getElementById('gl');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', { depth: true, antialias: false });
if (!gl) throw new Error('WebGL2 required');

const camera = new SplatCamera({
  fov: 60 * Math.PI / 180,
  distance: 3,
  azimuth: 0,
  elevation: 0,
  target: [0, 0, -8],
  aspect: canvas.width / canvas.height,
  near: 0.01,
  far: 150,
});

function computePointScale() {
  return canvas.height / (2 * Math.tan(camera.fov / 2));
}

const renderer = new HyperSplatRenderer(gl, {
  pointScale: computePointScale(),
  dimension: 4.0,
});
renderer.intensity = 1.3;
renderer.animate = true;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  camera.aspect = canvas.width / canvas.height;
  renderer.pointScale = computePointScale();
});

/* ================================================================== */
/*  AUDIO ANALYSIS                                                     */
/* ================================================================== */

let audioCtx = null;
let analyser = null;
let audioData = new Uint8Array(128);
let audioEnabled = false;

async function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    audioData = new Uint8Array(analyser.frequencyBinCount);
    audioEnabled = true;
  } catch (e) {
    console.warn('Audio unavailable:', e);
    audioEnabled = false;
  }
}

function getAudioLevels() {
  if (!audioEnabled || !analyser) {
    return { bass: 0, mid: 0, high: 0, energy: 0 };
  }
  analyser.getByteFrequencyData(audioData);

  // Split into frequency bands
  const len = audioData.length;
  let bass = 0, mid = 0, high = 0;

  for (let i = 0; i < len * 0.15; i++) bass += audioData[i];
  for (let i = Math.floor(len * 0.15); i < len * 0.5; i++) mid += audioData[i];
  for (let i = Math.floor(len * 0.5); i < len; i++) high += audioData[i];

  bass = bass / (len * 0.15) / 255;
  mid = mid / (len * 0.35) / 255;
  high = high / (len * 0.5) / 255;
  const energy = (bass + mid + high) / 3;

  return { bass, mid, high, energy };
}

/* ================================================================== */
/*  CAMERA FEED                                                        */
/* ================================================================== */

let videoReady = false;
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

const VID_SIZE = 96; // Resolution for splat sampling
const videoCanvas = document.createElement('canvas');
videoCanvas.width = VID_SIZE;
videoCanvas.height = VID_SIZE;
const videoCtx = videoCanvas.getContext('2d', { willReadFrequently: true });

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 } }
    });
    video.srcObject = stream;
    await video.play();
    videoReady = true;
  } catch (e) {
    console.warn('Camera unavailable:', e);
    videoReady = false;
  }
}

/* ================================================================== */
/*  SOBEL EDGE DETECTION                                               */
/* ================================================================== */

function computeLuminance(data, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return lum;
}

function sobelMagnitude(lum, w, h, x, y) {
  const get = (dx, dy) => {
    const cx = Math.min(w - 1, Math.max(0, x + dx));
    const cy = Math.min(h - 1, Math.max(0, y + dy));
    return lum[cy * w + cx];
  };
  const gx = -get(-1,-1) + get(1,-1) - 2*get(-1,0) + 2*get(1,0) - get(-1,1) + get(1,1);
  const gy = -get(-1,-1) - 2*get(0,-1) - get(1,-1) + get(-1,1) + 2*get(0,1) + get(1,1);
  return Math.sqrt(gx * gx + gy * gy);
}

/* ================================================================== */
/*  SPLAT GENERATION - YOUR FACE AS 3D CLOUD                          */
/* ================================================================== */

function generateFaceSplats(imageData, audio, time) {
  const seeds = [];
  if (!imageData) return seeds;

  const { width, height, data } = imageData;
  const lum = computeLuminance(data, width, height);

  const aspect = width / height;
  const mapX = (px) => (px / width - 0.5) * 2 * aspect;
  const mapY = (py) => -(py / height - 0.5) * 2;

  // Audio-driven parameters
  const bassPulse = 1 + audio.bass * 0.4;
  const midHue = audio.mid * 0.3;

  // Sample every 2 pixels, more at edges
  const step = 2;
  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const idx = (py * width + px) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;
      const l = lum[py * width + px];

      // Edge detection - more splats at edges
      const edge = sobelMagnitude(lum, width, height, px, py);
      const isEdge = edge > 0.15;
      const splatCount = isEdge ? 3 : 1;

      // Luminance → depth (bright = forward)
      const baseZ = (1 - l) * 2.0;

      for (let s = 0; s < splatCount; s++) {
        const jitter = isEdge ? 0.02 : 0.01;
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;
        const jz = (Math.random() - 0.5) * 0.1;

        // Hue shift from audio mids
        let cr = r, cg = g, cb = b;
        if (midHue > 0.1) {
          cr = r * (1 - midHue) + (Math.sin(time + r * 6.28) * 0.5 + 0.5) * midHue;
          cg = g * (1 - midHue) + (Math.sin(time + g * 6.28 + 2.09) * 0.5 + 0.5) * midHue;
          cb = b * (1 - midHue) + (Math.sin(time + b * 6.28 + 4.18) * 0.5 + 0.5) * midHue;
        }

        seeds.push({
          position: [mapX(px) + jx, mapY(py) + jy, baseZ + jz],
          orientation: [1, 0, 0, 0],
          scale: (0.025 + edge * 0.02 + l * 0.015) * bassPulse,
          color: [cr, cg, cb],
          depth: baseZ * 0.2 + audio.high * 0.5,
        });
      }
    }
  }

  return seeds;
}

/* ================================================================== */
/*  INFINITY MIRROR - PLASTIC RATIO LAYERS                            */
/* ================================================================== */

function generateInfinityLayers(baseSplats, audio, time) {
  const allSeeds = [];
  const LAYERS = 8;

  for (let layer = 0; layer < LAYERS; layer++) {
    // Each layer scaled down by plastic ratio, pushed back
    const scale = Math.pow(PLASTIC, -layer);
    const zOffset = -layer * 4;
    const rotation = layer * (Math.PI * 2 / PLASTIC); // Plastic angle rotation

    // Fade out deeper layers
    const fade = Math.pow(0.85, layer);

    // Audio makes layers pulse
    const layerPulse = 1 + Math.sin(time * 2 + layer) * audio.bass * 0.2;

    const cos_r = Math.cos(rotation);
    const sin_r = Math.sin(rotation);

    for (const splat of baseSplats) {
      // Rotate around Z axis by plastic angle
      const x = splat.position[0] * cos_r - splat.position[1] * sin_r;
      const y = splat.position[0] * sin_r + splat.position[1] * cos_r;
      const z = splat.position[2] + zOffset;

      allSeeds.push({
        position: [x * scale * layerPulse, y * scale * layerPulse, z],
        orientation: splat.orientation,
        scale: splat.scale * scale * layerPulse,
        color: [
          splat.color[0] * fade,
          splat.color[1] * fade,
          splat.color[2] * fade
        ],
        depth: splat.depth + layer * 0.5,
      });
    }
  }

  return allSeeds;
}

/* ================================================================== */
/*  AMBIENT PARTICLES                                                  */
/* ================================================================== */

function generateAmbient(audio) {
  const seeds = [];
  const COUNT = 20000;
  const energyBoost = 1 + audio.energy * 2;

  for (let i = 0; i < COUNT; i++) {
    const t = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const z = -t * 40;
    const radius = 0.8 + t * 5;

    const x = Math.cos(angle) * radius * (0.3 + Math.random() * 0.7);
    const y = Math.sin(angle) * radius * (0.3 + Math.random() * 0.7);

    // Color influenced by audio
    const hue = Math.random() + audio.mid * 0.5;
    const r = 0.15 + Math.sin(hue * 6.28) * 0.15 + audio.bass * 0.2;
    const g = 0.15 + Math.sin(hue * 6.28 + 2.09) * 0.15;
    const b = 0.4 + Math.sin(hue * 6.28 + 4.18) * 0.3 + audio.high * 0.2;

    seeds.push({
      position: [x, y, z],
      orientation: [1, 0, 0, 0],
      scale: (0.008 + Math.random() * 0.015) * energyBoost,
      color: [r, g, b],
      depth: t * 2,
    });
  }

  return seeds;
}

/* ================================================================== */
/*  RENDER LOOP                                                        */
/* ================================================================== */

let lastUpdate = 0;
const UPDATE_INTERVAL = 80;
const startTime = performance.now();
const hud = document.getElementById('hud');

function render() {
  requestAnimationFrame(render);

  const now = performance.now();
  const time = (now - startTime) * 0.001;

  // Get audio levels
  const audio = getAudioLevels();

  // Update splats periodically
  if (now - lastUpdate > UPDATE_INTERVAL) {
    let imageData = null;
    if (videoReady && video.readyState >= 2) {
      videoCtx.drawImage(video, 0, 0, VID_SIZE, VID_SIZE);
      imageData = videoCtx.getImageData(0, 0, VID_SIZE, VID_SIZE);
    }

    // Generate face splats from camera
    const faceSplats = generateFaceSplats(imageData, audio, time);

    // Create infinity mirror effect
    const infinitySplats = generateInfinityLayers(faceSplats, audio, time);

    // Add ambient particles
    const ambientSplats = generateAmbient(audio);

    const allSeeds = [...infinitySplats, ...ambientSplats];

    if (allSeeds.length > 0) {
      const encoded = encodeGaussianSeeds(allSeeds);
      renderer.updateSeeds(encoded, allSeeds.length);
    }

    lastUpdate = now;

    // Stats
    if (hud) {
      const total = allSeeds.length * 10; // 10 instances
      hud.textContent = `${(total/1000).toFixed(0)}K splats | bass:${(audio.bass*100).toFixed(0)} mid:${(audio.mid*100).toFixed(0)} high:${(audio.high*100).toFixed(0)}`;
    }
  }

  // Audio-reactive 4D rotation
  renderer.rotXW = Math.sin(time * 0.08) * 0.3 + audio.bass * 0.2;
  renderer.rotYW = Math.cos(time * 0.06) * 0.25 + audio.mid * 0.15;
  renderer.rotZW = Math.sin(time * 0.1) * 0.2 + audio.high * 0.1;

  // Audio-reactive intensity
  renderer.intensity = 1.2 + audio.energy * 0.5;

  // Subtle camera sway
  camera.azimuth = Math.sin(time * 0.03) * 0.08;
  camera.elevation = Math.sin(time * 0.05) * 0.04;

  renderer.render(camera.viewProjection, time);
}

/* ================================================================== */
/*  START                                                              */
/* ================================================================== */

document.getElementById('startBtn').addEventListener('click', async () => {
  document.getElementById('startOverlay').classList.add('hidden');

  await Promise.all([
    startCamera(),
    initAudio()
  ]);

  requestAnimationFrame(render);
});
