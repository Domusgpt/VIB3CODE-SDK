/**
 * AudioReactivity.js - Audio Input Visualization System
 *
 * Provides audio-reactive features:
 * - Microphone input capture
 * - Audio file playback analysis
 * - FFT frequency analysis
 * - Beat detection
 * - Mapping audio features to 6D rotation parameters
 */

import { EventEmitter } from 'events';

/**
 * Audio source types
 */
export const AudioSource = {
    MICROPHONE: 'microphone',
    FILE: 'file',
    ELEMENT: 'element',
    STREAM: 'stream'
};

/**
 * Frequency band definitions (Hz)
 */
export const FrequencyBand = {
    SUB_BASS: { min: 20, max: 60 },
    BASS: { min: 60, max: 250 },
    LOW_MID: { min: 250, max: 500 },
    MID: { min: 500, max: 2000 },
    HIGH_MID: { min: 2000, max: 4000 },
    PRESENCE: { min: 4000, max: 6000 },
    BRILLIANCE: { min: 6000, max: 20000 }
};

/**
 * AudioReactivity - Audio input visualization system
 */
export class AudioReactivity extends EventEmitter {
    constructor(options = {}) {
        super();

        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.mediaStream = null;

        // Configuration
        this.config = {
            fftSize: options.fftSize || 2048,
            smoothingTimeConstant: options.smoothing || 0.8,
            minDecibels: options.minDecibels || -90,
            maxDecibels: options.maxDecibels || -10,
            beatThreshold: options.beatThreshold || 0.8,
            beatCooldown: options.beatCooldown || 100
        };

        // Analysis data
        this.frequencyData = null;
        this.timeDomainData = null;
        this.bandLevels = {};

        // Beat detection
        this.beatHistory = [];
        this.beatHistorySize = 43; // ~1 second at 60fps
        this.lastBeatTime = 0;
        this.bpm = 0;
        this.isBeat = false;

        // Feature extraction
        this.features = {
            volume: 0,
            bass: 0,
            mid: 0,
            treble: 0,
            energy: 0,
            centroid: 0,
            flatness: 0
        };

        // 6D rotation mapping
        this.rotationMapping = {
            xy: { feature: 'bass', scale: 0.5, offset: 0 },
            xz: { feature: 'mid', scale: 0.3, offset: 0 },
            yz: { feature: 'treble', scale: 0.2, offset: 0 },
            xw: { feature: 'energy', scale: 0.4, offset: 0 },
            yw: { feature: 'centroid', scale: 0.3, offset: 0 },
            zw: { feature: 'flatness', scale: 0.2, offset: 0 }
        };

        // State
        this.isActive = false;
        this.sourceType = null;
        this._animationFrame = null;

        // Bind methods
        this._analyze = this._analyze.bind(this);
    }

    /**
     * Initialize audio context
     */
    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();

            this.analyser.fftSize = this.config.fftSize;
            this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;
            this.analyser.minDecibels = this.config.minDecibels;
            this.analyser.maxDecibels = this.config.maxDecibels;

            // Initialize data arrays
            const bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(bufferLength);
            this.timeDomainData = new Uint8Array(bufferLength);

            this.emit('initialized');
            return true;
        } catch (err) {
            console.error('Failed to initialize audio context:', err);
            this.emit('error', err);
            return false;
        }
    }

    /**
     * Connect to microphone
     */
    async connectMicrophone() {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);

            this.sourceType = AudioSource.MICROPHONE;
            this.isActive = true;
            this._startAnalysis();

            this.emit('connected', { source: AudioSource.MICROPHONE });
            return true;
        } catch (err) {
            console.error('Microphone access denied:', err);
            this.emit('error', err);
            return false;
        }
    }

    /**
     * Connect to audio element
     */
    connectElement(audioElement) {
        if (!this.audioContext) {
            this.initialize();
        }

        try {
            this.source = this.audioContext.createMediaElementSource(audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.sourceType = AudioSource.ELEMENT;
            this.isActive = true;
            this._startAnalysis();

            this.emit('connected', { source: AudioSource.ELEMENT });
            return true;
        } catch (err) {
            console.error('Failed to connect audio element:', err);
            this.emit('error', err);
            return false;
        }
    }

    /**
     * Load and connect audio file
     */
    async connectFile(file) {
        if (!this.audioContext) {
            await this.initialize();
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.source = this.audioContext.createBufferSource();
            this.source.buffer = audioBuffer;
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.sourceType = AudioSource.FILE;
            this.isActive = true;
            this._startAnalysis();

            this.source.start(0);
            this.source.onended = () => {
                this.emit('ended');
            };

            this.emit('connected', { source: AudioSource.FILE, duration: audioBuffer.duration });
            return true;
        } catch (err) {
            console.error('Failed to load audio file:', err);
            this.emit('error', err);
            return false;
        }
    }

    /**
     * Disconnect current source
     */
    disconnect() {
        this._stopAnalysis();

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.isActive = false;
        this.sourceType = null;

        this.emit('disconnected');
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this.disconnect();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.emit('disposed');
    }

    /**
     * Resume audio context (required after user interaction)
     */
    async resume() {
        if (this.audioContext?.state === 'suspended') {
            await this.audioContext.resume();
            this.emit('resumed');
        }
    }

    /**
     * Start analysis loop
     */
    _startAnalysis() {
        if (this._animationFrame) return;
        this._analyze();
    }

    /**
     * Stop analysis loop
     */
    _stopAnalysis() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }

    /**
     * Main analysis loop
     */
    _analyze() {
        if (!this.isActive) return;

        // Get frequency and time domain data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeDomainData);

        // Extract features
        this._extractFeatures();

        // Detect beats
        this._detectBeat();

        // Calculate band levels
        this._calculateBandLevels();

        // Calculate 6D rotation
        const rotation = this.get6DRotation();

        // Emit analysis data
        this.emit('analysis', {
            features: { ...this.features },
            bands: { ...this.bandLevels },
            beat: this.isBeat,
            bpm: this.bpm,
            rotation
        });

        this._animationFrame = requestAnimationFrame(this._analyze);
    }

    /**
     * Extract audio features
     */
    _extractFeatures() {
        const binCount = this.frequencyData.length;

        // Calculate overall volume (RMS)
        let sum = 0;
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const val = (this.timeDomainData[i] - 128) / 128;
            sum += val * val;
        }
        this.features.volume = Math.sqrt(sum / this.timeDomainData.length);

        // Calculate frequency band levels
        const bassEnd = Math.floor(binCount * 0.1);
        const midEnd = Math.floor(binCount * 0.5);

        let bassSum = 0, midSum = 0, trebleSum = 0;

        for (let i = 0; i < binCount; i++) {
            const val = this.frequencyData[i] / 255;
            if (i < bassEnd) {
                bassSum += val;
            } else if (i < midEnd) {
                midSum += val;
            } else {
                trebleSum += val;
            }
        }

        this.features.bass = bassSum / bassEnd;
        this.features.mid = midSum / (midEnd - bassEnd);
        this.features.treble = trebleSum / (binCount - midEnd);

        // Calculate energy (sum of all frequency magnitudes)
        let energy = 0;
        for (let i = 0; i < binCount; i++) {
            energy += this.frequencyData[i] / 255;
        }
        this.features.energy = energy / binCount;

        // Calculate spectral centroid (brightness)
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 0; i < binCount; i++) {
            const magnitude = this.frequencyData[i] / 255;
            weightedSum += i * magnitude;
            magnitudeSum += magnitude;
        }
        this.features.centroid = magnitudeSum > 0 ? (weightedSum / magnitudeSum) / binCount : 0;

        // Calculate spectral flatness (tonality vs noise)
        let geometricMean = 0;
        let arithmeticMean = 0;
        const epsilon = 0.001;

        for (let i = 0; i < binCount; i++) {
            const val = Math.max(this.frequencyData[i] / 255, epsilon);
            geometricMean += Math.log(val);
            arithmeticMean += val;
        }

        geometricMean = Math.exp(geometricMean / binCount);
        arithmeticMean = arithmeticMean / binCount;

        this.features.flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
    }

    /**
     * Detect beats
     */
    _detectBeat() {
        const now = performance.now();
        const energy = this.features.energy;

        // Add to history
        this.beatHistory.push(energy);
        if (this.beatHistory.length > this.beatHistorySize) {
            this.beatHistory.shift();
        }

        // Calculate average energy
        const avgEnergy = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;

        // Calculate variance
        const variance = this.beatHistory.reduce((acc, val) => acc + Math.pow(val - avgEnergy, 2), 0) / this.beatHistory.length;

        // Dynamic threshold based on variance
        const threshold = avgEnergy + (Math.sqrt(variance) * this.config.beatThreshold);

        // Check for beat
        const wasInCooldown = (now - this.lastBeatTime) < this.config.beatCooldown;
        this.isBeat = energy > threshold && !wasInCooldown;

        if (this.isBeat) {
            // Update BPM calculation
            const timeSinceLastBeat = now - this.lastBeatTime;
            if (timeSinceLastBeat > 200 && timeSinceLastBeat < 2000) {
                const instantBPM = 60000 / timeSinceLastBeat;
                this.bpm = this.bpm === 0 ? instantBPM : this.bpm * 0.9 + instantBPM * 0.1;
            }

            this.lastBeatTime = now;
            this.emit('beat', { energy, bpm: this.bpm });
        }
    }

    /**
     * Calculate frequency band levels
     */
    _calculateBandLevels() {
        const binCount = this.frequencyData.length;
        const nyquist = this.audioContext?.sampleRate / 2 || 22050;
        const binWidth = nyquist / binCount;

        for (const [name, band] of Object.entries(FrequencyBand)) {
            const startBin = Math.floor(band.min / binWidth);
            const endBin = Math.min(Math.floor(band.max / binWidth), binCount - 1);

            let sum = 0;
            for (let i = startBin; i <= endBin; i++) {
                sum += this.frequencyData[i] / 255;
            }

            this.bandLevels[name] = sum / (endBin - startBin + 1);
        }
    }

    /**
     * Get 6D rotation values based on audio features
     */
    get6DRotation() {
        const rotation = {};

        for (const [plane, mapping] of Object.entries(this.rotationMapping)) {
            const featureValue = this.features[mapping.feature] || 0;
            rotation[plane] = (featureValue * mapping.scale + mapping.offset) * Math.PI * 2;
        }

        return rotation;
    }

    /**
     * Set rotation mapping for a plane
     */
    setRotationMapping(plane, feature, scale = 1, offset = 0) {
        if (this.rotationMapping[plane]) {
            this.rotationMapping[plane] = { feature, scale, offset };
        }
    }

    /**
     * Get current frequency data (for visualization)
     */
    getFrequencyData() {
        return this.frequencyData ? Array.from(this.frequencyData) : [];
    }

    /**
     * Get current waveform data (for visualization)
     */
    getWaveformData() {
        return this.timeDomainData ? Array.from(this.timeDomainData) : [];
    }

    /**
     * Serialize configuration
     */
    toJSON() {
        return {
            config: this.config,
            rotationMapping: this.rotationMapping
        };
    }

    /**
     * Restore from serialized state
     */
    fromJSON(data) {
        if (data.config) Object.assign(this.config, data.config);
        if (data.rotationMapping) Object.assign(this.rotationMapping, data.rotationMapping);
    }
}

export default AudioReactivity;
