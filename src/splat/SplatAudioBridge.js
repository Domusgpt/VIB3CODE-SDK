/**
 * SplatAudioBridge
 *
 * Lightweight audio-reactive bridge that connects the Web Audio API
 * to a GaussianSplatRenderer, modulating visual parameters in real-time.
 *
 * Usage:
 *   const bridge = new SplatAudioBridge(renderer);
 *   await bridge.initMicrophone();  // or bridge.initAudioElement(audioEl)
 *   // In render loop:
 *   bridge.update();
 *
 * Mappings:
 *   bass (20-250 Hz)   → intensity boost (splat brightness pulse)
 *   mid  (250-4000 Hz) → chromatic aberration strength
 *   high (4000+ Hz)    → animation speed modulation via pointScale flutter
 *   energy (overall)   → global intensity
 */

export class SplatAudioBridge {
    constructor(renderer) {
        this.renderer = renderer;
        this.audioCtx = null;
        this.analyser = null;
        this.freqData = null;
        this.active = false;

        // Smoothed values
        this.bass = 0;
        this.mid = 0;
        this.high = 0;
        this.energy = 0;

        // Sensitivity (adjustable)
        this.sensitivity = 1.0;
        this.smoothing = 0.85;

        // Store base values to restore
        this._baseIntensity = renderer.intensity;
        this._baseChromatic = renderer.chromatic;
        this._basePointScale = renderer.pointScale;
    }

    /** Initialize from user microphone. */
    async initMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._setupAudio(stream);
        } catch (err) {
            console.warn('SplatAudioBridge: Microphone access denied', err);
        }
    }

    /** Initialize from an HTMLAudioElement or HTMLMediaElement. */
    initAudioElement(audioElement) {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const source = this.audioCtx.createMediaElementSource(audioElement);
        this._setupAnalyser(source);
        source.connect(this.audioCtx.destination);
    }

    /** @private */
    _setupAudio(stream) {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const source = this.audioCtx.createMediaStreamSource(stream);
        this._setupAnalyser(source);
    }

    /** @private */
    _setupAnalyser(source) {
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
        source.connect(this.analyser);
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.active = true;
    }

    /** Call each frame to update renderer parameters from audio. */
    update() {
        if (!this.active || !this.analyser) return;

        this.analyser.getByteFrequencyData(this.freqData);
        const binCount = this.freqData.length;

        // Band extraction (assuming 44.1kHz, 256 FFT → ~172Hz per bin)
        const bassEnd = Math.floor(binCount * 0.08);   // ~0-250Hz
        const midEnd = Math.floor(binCount * 0.35);     // ~250-4000Hz

        let bassSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < binCount; i++) {
            const v = this.freqData[i] / 255;
            if (i < bassEnd) bassSum += v;
            else if (i < midEnd) midSum += v;
            else highSum += v;
        }

        const rawBass = bassSum / Math.max(1, bassEnd);
        const rawMid = midSum / Math.max(1, midEnd - bassEnd);
        const rawHigh = highSum / Math.max(1, binCount - midEnd);
        const rawEnergy = (rawBass + rawMid + rawHigh) / 3;

        // Smooth
        const s = this.smoothing;
        this.bass = this.bass * s + rawBass * (1 - s) * this.sensitivity;
        this.mid = this.mid * s + rawMid * (1 - s) * this.sensitivity;
        this.high = this.high * s + rawHigh * (1 - s) * this.sensitivity;
        this.energy = this.energy * s + rawEnergy * (1 - s) * this.sensitivity;

        // Apply to renderer
        this.renderer.intensity = this._baseIntensity + this.bass * 0.5 + this.energy * 0.3;
        this.renderer.chromatic = this._baseChromatic + this.mid * 0.6;
        this.renderer.pointScale = this._basePointScale * (1 + this.high * 0.08);
    }

    /** Get current audio data as an object (compatible with SDK audio format). */
    getAudioData() {
        return {
            bass: this.bass,
            mid: this.mid,
            high: this.high,
            energy: this.energy,
        };
    }

    /** Stop audio processing and restore renderer defaults. */
    dispose() {
        this.active = false;
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.renderer.intensity = this._baseIntensity;
        this.renderer.chromatic = this._baseChromatic;
        this.renderer.pointScale = this._basePointScale;
    }
}

export default SplatAudioBridge;
