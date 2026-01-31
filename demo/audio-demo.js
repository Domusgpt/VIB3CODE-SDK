/**
 * VIB3+ Audio Reactive Splat Demo
 *
 * Encodes microphone input as a decodable 3D Gaussian splat visualization.
 *
 * Decode map (every visual property maps to exactly one audio property):
 *   X axis  = Frequency (left = bass, right = treble)
 *   Y axis  = Amplitude (up = loud)
 *   Z axis  = Time (front = now, back = history)
 *   Hue     = Frequency band (red=bass, green=mid, blue=high)
 *   Size    = Energy (loud bins are larger)
 *   Bloom   = Onset energy (attack transients glow)
 *
 * Three visualization topologies:
 *   1. Spectrogram — 3D scrolling frequency × amplitude × time
 *   2. Rings       — concentric frequency rings pulsing radially
 *   3. Waveform    — raw waveform as a 3D helix of splats
 *
 * The 4D rotation from VIB3+ is NOT used here to keep the audio→visual
 * mapping strictly decodable (adding 4D rotation would entangle the axes).
 * It could be added as an artistic mode.
 */

import { GAUSSIAN_SEED_STRIDE } from '../src/render/GaussianSeedBuffer.js';
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { SplatCamera } from '../src/splat/SplatCamera.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FFT_SIZE = 2048;
const NUM_BINS = 128;         // frequency bins to visualize
const MAX_SLICES = 128;       // time slices in rolling buffer
const MAX_SPLATS = NUM_BINS * MAX_SLICES;
const RING_SPLATS = 128 * 64; // for ring mode
const WAVE_SPLATS = 2048 * 8; // for waveform mode
const BUF_SIZE = Math.max(MAX_SPLATS, RING_SPLATS, WAVE_SPLATS) * GAUSSIAN_SEED_STRIDE;

// Frequency axis span
const FREQ_WIDTH = 6.0;
const AMP_HEIGHT = 3.0;
const TIME_DEPTH = 6.0;

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
    distance: 8,
    azimuth: 0.2,
    elevation: 0.35,
    aspect: canvas.width / canvas.height,
});
camera.attachControls(canvas);

function computePointScale() {
    return canvas.height / (2 * Math.tan(camera.fov / 2));
}

const renderer = new GaussianSplatRenderer(gl, {
    pointScale: computePointScale(),
    blendMode: 'additive',
    animate: true,
    intensity: 1.2,
    chromatic: 0.3,
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    camera.aspect = canvas.width / canvas.height;
    renderer.pointScale = computePointScale();
});

/* ------------------------------------------------------------------ */
/*  Audio setup                                                        */
/* ------------------------------------------------------------------ */

let audioCtx = null;
let analyser = null;
let freqData = null;    // Uint8Array — frequency domain
let timeData = null;    // Uint8Array — time domain (waveform)
let micActive = false;

// Rolling spectrogram buffer (ring buffer of frequency snapshots)
const spectroSlices = [];
let spectroHead = 0;

async function startMic() {
    if (micActive) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);

        freqData = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);
        micActive = true;

        document.getElementById('micBtn').textContent = 'Mic On';
        document.getElementById('micBtn').classList.add('active');
    } catch (err) {
        console.error('Mic access denied:', err);
        document.getElementById('micBtn').textContent = 'Denied';
    }
}

/* ------------------------------------------------------------------ */
/*  HSL → RGB helper                                                   */
/* ------------------------------------------------------------------ */

function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
}

/* ------------------------------------------------------------------ */
/*  Splat buffer (pre-allocated, reused every frame)                   */
/* ------------------------------------------------------------------ */

const splatBuffer = new Float32Array(BUF_SIZE);

/* ------------------------------------------------------------------ */
/*  Spectrogram visualizer                                             */
/* ------------------------------------------------------------------ */

function generateSpectrogram() {
    if (!micActive) return 0;
    analyser.getByteFrequencyData(freqData);

    // Push new slice into rolling buffer
    const slice = new Uint8Array(NUM_BINS);
    for (let i = 0; i < NUM_BINS; i++) {
        // Map FFT bins to our reduced bin count (log-ish spacing)
        const fftIdx = Math.floor(Math.pow(i / NUM_BINS, 1.5) * analyser.frequencyBinCount * 0.5);
        slice[i] = freqData[Math.min(fftIdx, freqData.length - 1)];
    }
    spectroSlices.push(slice);
    if (spectroSlices.length > MAX_SLICES) spectroSlices.shift();

    // Build splats
    let count = 0;
    const sliceCount = spectroSlices.length;
    for (let t = 0; t < sliceCount; t++) {
        const s = spectroSlices[t];
        const zNorm = 1.0 - (t / MAX_SLICES); // 0=oldest, 1=newest
        const z = (zNorm - 0.5) * TIME_DEPTH;
        const timeFade = 0.3 + zNorm * 0.7;

        for (let f = 0; f < NUM_BINS; f++) {
            const amp = s[f] / 255;
            if (amp < 0.04) continue; // skip silence

            const fNorm = f / NUM_BINS;
            const x = (fNorm - 0.5) * FREQ_WIDTH;
            const y = amp * AMP_HEIGHT - AMP_HEIGHT * 0.1;
            const [r, g, b] = hsl(fNorm * 300, 0.85, 0.3 + amp * 0.4);
            const scale = 0.02 + amp * 0.03;

            const off = count * GAUSSIAN_SEED_STRIDE;
            splatBuffer[off + 0] = x;
            splatBuffer[off + 1] = y;
            splatBuffer[off + 2] = z;
            splatBuffer[off + 3] = scale;
            splatBuffer[off + 4] = 1; splatBuffer[off + 5] = 0;
            splatBuffer[off + 6] = 0; splatBuffer[off + 7] = 0;
            splatBuffer[off + 8] = r * timeFade;
            splatBuffer[off + 9] = g * timeFade;
            splatBuffer[off + 10] = b * timeFade;
            splatBuffer[off + 11] = amp * 0.8; // depth → bloom energy
            count++;
        }
    }
    return count;
}

/* ------------------------------------------------------------------ */
/*  Rings visualizer                                                   */
/* ------------------------------------------------------------------ */

function generateRings() {
    if (!micActive) return 0;
    analyser.getByteFrequencyData(freqData);

    let count = 0;
    const bands = 32;
    const pointsPerRing = 64;

    for (let band = 0; band < bands; band++) {
        // Aggregate FFT bins into this band
        const lo = Math.floor(Math.pow(band / bands, 1.5) * freqData.length * 0.5);
        const hi = Math.floor(Math.pow((band + 1) / bands, 1.5) * freqData.length * 0.5);
        let sum = 0, n = 0;
        for (let i = lo; i < hi && i < freqData.length; i++) { sum += freqData[i]; n++; }
        const amp = n > 0 ? (sum / n) / 255 : 0;
        if (amp < 0.02) continue;

        const radius = 0.5 + band * 0.12;
        const [r, g, b] = hsl((band / bands) * 300, 0.9, 0.3 + amp * 0.4);
        const scale = 0.015 + amp * 0.025;
        const yOffset = amp * 1.5 - 0.2;

        for (let p = 0; p < pointsPerRing; p++) {
            const angle = (p / pointsPerRing) * Math.PI * 2;
            const pulseRadius = radius * (1.0 + amp * 0.3);

            const off = count * GAUSSIAN_SEED_STRIDE;
            splatBuffer[off + 0] = Math.cos(angle) * pulseRadius;
            splatBuffer[off + 1] = yOffset;
            splatBuffer[off + 2] = Math.sin(angle) * pulseRadius;
            splatBuffer[off + 3] = scale;
            splatBuffer[off + 4] = 1; splatBuffer[off + 5] = 0;
            splatBuffer[off + 6] = 0; splatBuffer[off + 7] = 0;
            splatBuffer[off + 8] = r; splatBuffer[off + 9] = g; splatBuffer[off + 10] = b;
            splatBuffer[off + 11] = amp * 0.6;
            count++;
        }
    }
    return count;
}

/* ------------------------------------------------------------------ */
/*  Waveform visualizer                                                */
/* ------------------------------------------------------------------ */

function generateWaveform() {
    if (!micActive) return 0;
    analyser.getByteTimeDomainData(timeData);

    let count = 0;
    const samples = analyser.fftSize;
    const tubeSamples = 8;
    const helixTurns = 3;

    for (let i = 0; i < samples; i += 2) { // skip every other for density
        const norm = i / samples;
        const waveVal = (timeData[i] - 128) / 128; // -1 to 1
        const angle = norm * helixTurns * Math.PI * 2;
        const helixR = 1.5;
        const baseX = Math.cos(angle) * helixR;
        const baseZ = Math.sin(angle) * helixR;
        const baseY = (norm - 0.5) * 4;

        const amp = Math.abs(waveVal);
        const [r, g, b] = hsl(120 + waveVal * 120, 0.8, 0.3 + amp * 0.4);

        // Tube points around the waveform path
        for (let t = 0; t < tubeSamples; t++) {
            const tubeAngle = (t / tubeSamples) * Math.PI * 2;
            const tubeR = 0.05 + amp * 0.2;

            const off = count * GAUSSIAN_SEED_STRIDE;
            splatBuffer[off + 0] = baseX + Math.cos(tubeAngle) * tubeR * Math.cos(angle);
            splatBuffer[off + 1] = baseY + Math.sin(tubeAngle) * tubeR;
            splatBuffer[off + 2] = baseZ + Math.cos(tubeAngle) * tubeR * Math.sin(angle);
            splatBuffer[off + 3] = 0.012 + amp * 0.015;
            splatBuffer[off + 4] = 1; splatBuffer[off + 5] = 0;
            splatBuffer[off + 6] = 0; splatBuffer[off + 7] = 0;
            splatBuffer[off + 8] = r; splatBuffer[off + 9] = g; splatBuffer[off + 10] = b;
            splatBuffer[off + 11] = amp * 0.5;
            count++;
        }
    }
    return count;
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

function updateAudioStats() {
    if (!micActive || !freqData) return;

    // Peak frequency
    let peakIdx = 0, peakVal = 0;
    for (let i = 0; i < freqData.length; i++) {
        if (freqData[i] > peakVal) { peakVal = freqData[i]; peakIdx = i; }
    }
    const peakHz = Math.round(peakIdx * audioCtx.sampleRate / analyser.fftSize);
    document.getElementById('peakHz').textContent = peakHz + ' Hz';

    // RMS
    let rmsSum = 0;
    for (let i = 0; i < freqData.length; i++) rmsSum += freqData[i] * freqData[i];
    const rmsVal = Math.sqrt(rmsSum / freqData.length) / 255;
    document.getElementById('rms').textContent = rmsVal.toFixed(3);
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let visMode = 'spectrogram';
let autoOrbit = true;
let frameCount = 0;
let lastFpsTime = performance.now();
let startTime = performance.now();

const generators = {
    spectrogram: generateSpectrogram,
    rings: generateRings,
    waveform: generateWaveform,
};

/* ------------------------------------------------------------------ */
/*  Render loop                                                        */
/* ------------------------------------------------------------------ */

function tick() {
    const now = performance.now();

    if (autoOrbit) camera.azimuth += 0.001;

    // Generate splats from current audio
    const count = generators[visMode]();

    if (count > 0) {
        // Upload directly — no encoding step, buffer is already in GPU format
        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, splatBuffer.subarray(0, count * GAUSSIAN_SEED_STRIDE), gl.DYNAMIC_DRAW);
        renderer.count = count;
        document.getElementById('splatCount').textContent = count.toLocaleString();
    }

    const vp = camera.viewProjection;
    const time = (now - startTime) * 0.001;
    renderer.render(vp, time);

    // FPS
    frameCount++;
    if (now - lastFpsTime > 500) {
        document.getElementById('fps').textContent =
            Math.round(frameCount / ((now - lastFpsTime) / 1000));
        frameCount = 0;
        lastFpsTime = now;
        updateAudioStats();
    }

    requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ */
/*  UI wiring                                                          */
/* ------------------------------------------------------------------ */

document.getElementById('micBtn').addEventListener('click', startMic);

document.querySelectorAll('.vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        visMode = btn.dataset.vis;
        document.querySelectorAll('.vis-btn').forEach(b =>
            b.classList.toggle('active', b === btn));
        // Clear spectrogram history on mode switch
        spectroSlices.length = 0;
    });
});

canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => { setTimeout(() => { autoOrbit = true; }, 3000); });

/* ------------------------------------------------------------------ */
/*  Boot — show placeholder until mic is started                       */
/* ------------------------------------------------------------------ */

// Generate a static placeholder so the canvas isn't empty
(function generatePlaceholder() {
    let count = 0;
    for (let f = 0; f < 64; f++) {
        for (let t = 0; t < 32; t++) {
            const fNorm = f / 64;
            const tNorm = t / 32;
            const off = count * GAUSSIAN_SEED_STRIDE;
            splatBuffer[off + 0] = (fNorm - 0.5) * FREQ_WIDTH;
            splatBuffer[off + 1] = Math.sin(fNorm * 6 + tNorm * 4) * 0.5;
            splatBuffer[off + 2] = (tNorm - 0.5) * TIME_DEPTH;
            splatBuffer[off + 3] = 0.02;
            splatBuffer[off + 4] = 1; splatBuffer[off + 5] = 0;
            splatBuffer[off + 6] = 0; splatBuffer[off + 7] = 0;
            const [r, g, b] = hsl(fNorm * 300, 0.6, 0.2 + Math.sin(fNorm * 4 + tNorm * 3) * 0.15);
            splatBuffer[off + 8] = r;
            splatBuffer[off + 9] = g;
            splatBuffer[off + 10] = b;
            splatBuffer[off + 11] = 0.2;
            count++;
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, splatBuffer.subarray(0, count * GAUSSIAN_SEED_STRIDE), gl.DYNAMIC_DRAW);
    renderer.count = count;
    document.getElementById('splatCount').textContent = count.toLocaleString();
})();

tick();
