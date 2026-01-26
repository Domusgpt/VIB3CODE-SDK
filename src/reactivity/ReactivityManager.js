/**
 * VIB3+ ReactivityManager
 *
 * Coordinates all reactivity inputs (audio, tilt, interaction)
 * and applies them to the visualization parameters.
 *
 * This is the central hub that:
 * 1. Receives input from AudioReactivityEngine, TiltReactivityEngine, InteractionEngine
 * 2. Applies configured mappings from ReactivityConfig
 * 3. Updates visualization parameters through the parameter system
 */

import { ReactivityConfig, TARGETABLE_PARAMETERS, BLEND_MODES } from './ReactivityConfig.js';

/**
 * ReactivityManager - Coordinates all reactivity systems
 */
export class ReactivityManager {
    constructor(parameterUpdateFn = null) {
        // Function to call when parameters need updating
        this.updateParameter = parameterUpdateFn || window.updateParameter || this.defaultUpdateParameter.bind(this);

        // ReactivityConfig instance
        this.config = new ReactivityConfig();

        // Current input values from various sources
        this.inputState = {
            audio: { bass: 0, mid: 0, high: 0, energy: 0 },
            tilt: { alpha: 0, beta: 0, gamma: 0 },
            mouse: { x: 0.5, y: 0.5, velocityX: 0, velocityY: 0 },
            click: { intensity: 0, lastTime: 0 },
            scroll: { delta: 0, accumulated: 0 },
            touch: { touches: [], pinchScale: 1, rotation: 0 }
        };

        // Base parameter values (before reactivity applied)
        this.baseParameters = {};

        // Computed reactivity deltas
        this.reactivityDeltas = {};

        // Active state
        this.isActive = false;
        this.frameId = null;

        // Event emitter for telemetry
        this.listeners = new Map();

        console.log('🎛️ ReactivityManager: Initialized');
    }

    /**
     * Default parameter update function (fallback)
     */
    defaultUpdateParameter(name, value) {
        console.log(`ReactivityManager: updateParameter(${name}, ${value})`);
        // Store locally if no external handler
        this.baseParameters[name] = value;
    }

    /**
     * Set the parameter update function
     */
    setParameterUpdateFunction(fn) {
        this.updateParameter = fn;
    }

    /**
     * Load a ReactivityConfig
     */
    loadConfig(config) {
        if (config instanceof ReactivityConfig) {
            this.config = config;
        } else {
            this.config = new ReactivityConfig(config);
        }

        const validation = this.config.validate();
        if (!validation.valid) {
            console.warn('ReactivityManager: Config validation errors:', validation.errors);
        }

        this.emit('configChanged', this.config.getConfig());
        console.log('🎛️ ReactivityManager: Config loaded');
        return validation;
    }

    /**
     * Get current config
     */
    getConfig() {
        return this.config.getConfig();
    }

    /**
     * Start the reactivity processing loop
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.processFrame();
        console.log('🎛️ ReactivityManager: Started');
        this.emit('started');
    }

    /**
     * Stop the reactivity processing loop
     */
    stop() {
        this.isActive = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        console.log('🎛️ ReactivityManager: Stopped');
        this.emit('stopped');
    }

    /**
     * Main processing loop
     */
    processFrame() {
        if (!this.isActive) return;

        // Process all input sources and compute deltas
        this.computeReactivityDeltas();

        // Apply deltas to parameters
        this.applyDeltas();

        // Schedule next frame
        this.frameId = requestAnimationFrame(() => this.processFrame());
    }

    /**
     * Compute reactivity deltas from all input sources
     */
    computeReactivityDeltas() {
        // Reset deltas
        this.reactivityDeltas = {};

        const cfg = this.config.getConfig();

        // Process audio reactivity
        if (cfg.audio.enabled) {
            this.processAudioReactivity(cfg.audio);
        }

        // Process tilt reactivity
        if (cfg.tilt.enabled) {
            this.processTiltReactivity(cfg.tilt);
        }

        // Process interaction reactivity
        if (cfg.interaction.enabled) {
            this.processInteractionReactivity(cfg.interaction);
        }
    }

    /**
     * Process audio input and compute parameter deltas
     */
    processAudioReactivity(audioConfig) {
        const audio = this.inputState.audio;
        const globalSens = audioConfig.globalSensitivity;

        for (const [bandName, bandConfig] of Object.entries(audioConfig.bands)) {
            if (!bandConfig.enabled) continue;

            const bandValue = audio[bandName] || 0;
            const scaledValue = bandValue * bandConfig.sensitivity * globalSens;

            for (const target of bandConfig.targets) {
                this.addDelta(target.param, scaledValue * target.weight, target.mode);
            }
        }
    }

    /**
     * Process tilt input and compute parameter deltas
     */
    processTiltReactivity(tiltConfig) {
        const tilt = this.inputState.tilt;
        const mappings = tiltConfig.dramaticMode ? tiltConfig.dramaticMappings : tiltConfig.mappings;
        const sens = tiltConfig.sensitivity;

        for (const [axis, mapping] of Object.entries(mappings)) {
            if (!mapping || !mapping.target) continue;

            // Apply calibration offset
            let axisValue = tilt[axis] || 0;
            if (tiltConfig.calibrated && tiltConfig.calibrationOffset) {
                axisValue -= tiltConfig.calibrationOffset[axis] || 0;
            }

            // Scale and clamp
            let delta = axisValue * mapping.scale * sens;
            if (mapping.clamp) {
                delta = Math.max(mapping.clamp[0], Math.min(mapping.clamp[1], delta));
            }

            this.addDelta(mapping.target, delta, 'replace');
        }
    }

    /**
     * Process mouse/click/scroll/touch and compute parameter deltas
     */
    processInteractionReactivity(interactionConfig) {
        // Mouse movement
        if (interactionConfig.mouse.enabled) {
            this.processMouseReactivity(interactionConfig.mouse);
        }

        // Click effects
        if (interactionConfig.click.enabled) {
            this.processClickReactivity(interactionConfig.click);
        }

        // Scroll effects
        if (interactionConfig.scroll.enabled) {
            this.processScrollReactivity(interactionConfig.scroll);
        }

        // Touch effects
        if (interactionConfig.touch.enabled) {
            this.processTouchReactivity(interactionConfig.touch);
        }
    }

    /**
     * Process mouse movement
     */
    processMouseReactivity(mouseConfig) {
        const mouse = this.inputState.mouse;
        const sens = mouseConfig.sensitivity;
        const mode = mouseConfig.mode;

        if (mode === 'none') return;

        const targets = mouseConfig.targets || ['rot4dXY', 'rot4dYZ'];
        const x = mouseConfig.invertX ? (1 - mouse.x) : mouse.x;
        const y = mouseConfig.invertY ? (1 - mouse.y) : mouse.y;

        switch (mode) {
            case 'rotation':
                // Map mouse position to rotation
                if (targets[0]) this.addDelta(targets[0], (x - 0.5) * 2 * sens, 'replace');
                if (targets[1]) this.addDelta(targets[1], (y - 0.5) * 2 * sens, 'replace');
                break;

            case 'velocity':
                // Use mouse velocity
                if (targets[0]) this.addDelta(targets[0], mouse.velocityX * sens * 0.1, 'add');
                if (targets[1]) this.addDelta(targets[1], mouse.velocityY * sens * 0.1, 'add');
                break;

            case 'shimmer':
                // High-frequency shimmer based on velocity magnitude
                const velocity = Math.sqrt(mouse.velocityX ** 2 + mouse.velocityY ** 2);
                this.addDelta('chaos', velocity * sens * 0.01, 'add');
                break;

            case 'attract':
                // Pull visualization toward mouse
                this.addDelta('morphFactor', (1 - Math.abs(x - 0.5) * 2) * sens, 'multiply');
                break;

            case 'repel':
                // Push visualization away from mouse
                this.addDelta('morphFactor', Math.abs(x - 0.5) * 2 * sens, 'multiply');
                break;
        }
    }

    /**
     * Process click effects
     */
    processClickReactivity(clickConfig) {
        const click = this.inputState.click;

        // Decay click intensity
        click.intensity *= clickConfig.decay;

        if (click.intensity < 0.001) {
            click.intensity = 0;
            return;
        }

        const mode = clickConfig.mode;
        const target = clickConfig.target;
        const intensity = click.intensity * clickConfig.intensity;

        switch (mode) {
            case 'burst':
                this.addDelta(target, intensity, 'add');
                break;

            case 'blast':
                this.addDelta(target, intensity * 2, 'add');
                this.addDelta('chaos', intensity * 0.5, 'add');
                break;

            case 'ripple':
                this.addDelta(target, Math.sin(Date.now() * 0.01) * intensity, 'add');
                break;

            case 'pulse':
                this.addDelta('intensity', intensity * 0.5, 'add');
                this.addDelta('speed', intensity, 'add');
                break;
        }
    }

    /**
     * Process scroll effects
     */
    processScrollReactivity(scrollConfig) {
        const scroll = this.inputState.scroll;

        if (Math.abs(scroll.delta) < 0.001) return;

        const mode = scrollConfig.mode;
        const target = scrollConfig.target;
        const sens = scrollConfig.sensitivity;

        switch (mode) {
            case 'cycle':
                // Cycle through values (e.g., geometry)
                scroll.accumulated += scroll.delta * sens * scrollConfig.step;
                if (Math.abs(scroll.accumulated) >= 1) {
                    const steps = Math.floor(Math.abs(scroll.accumulated));
                    const direction = scroll.accumulated > 0 ? 1 : -1;
                    this.addDelta(target, steps * direction, 'add');
                    scroll.accumulated -= steps * direction;
                }
                break;

            case 'wave':
                this.addDelta(target, scroll.delta * sens * 0.1, 'add');
                break;

            case 'sweep':
                this.addDelta('hue', scroll.delta * sens * 10, 'add');
                break;

            case 'zoom':
                this.addDelta('dimension', scroll.delta * sens * 0.01, 'add');
                break;

            case 'morph':
                this.addDelta('morphFactor', scroll.delta * sens * 0.1, 'add');
                break;
        }

        // Decay scroll delta
        scroll.delta *= 0.9;
    }

    /**
     * Process touch gestures
     */
    processTouchReactivity(touchConfig) {
        const touch = this.inputState.touch;

        if (touchConfig.pinchZoom.enabled && touch.pinchScale !== 1) {
            const delta = (touch.pinchScale - 1) * touchConfig.pinchZoom.sensitivity;
            this.addDelta(touchConfig.pinchZoom.target, delta, 'add');
            touch.pinchScale = 1 + (touch.pinchScale - 1) * 0.9; // Decay
        }

        if (touchConfig.twoFingerRotate.enabled && touch.rotation !== 0) {
            const delta = touch.rotation * touchConfig.twoFingerRotate.sensitivity;
            this.addDelta(touchConfig.twoFingerRotate.target, delta, 'add');
            touch.rotation *= 0.9; // Decay
        }
    }

    /**
     * Add a delta to a parameter
     */
    addDelta(param, value, mode = 'add') {
        if (!TARGETABLE_PARAMETERS.includes(param)) {
            console.warn(`ReactivityManager: Unknown parameter "${param}"`);
            return;
        }

        if (!this.reactivityDeltas[param]) {
            this.reactivityDeltas[param] = { value: 0, mode: 'add' };
        }

        const delta = this.reactivityDeltas[param];

        switch (mode) {
            case 'add':
                delta.value += value;
                delta.mode = 'add';
                break;

            case 'multiply':
                delta.value = (delta.value || 1) * value;
                delta.mode = 'multiply';
                break;

            case 'replace':
                delta.value = value;
                delta.mode = 'replace';
                break;

            case 'max':
                delta.value = Math.max(delta.value, value);
                delta.mode = 'max';
                break;

            case 'min':
                delta.value = Math.min(delta.value, value);
                delta.mode = 'min';
                break;
        }
    }

    /**
     * Apply computed deltas to parameters
     */
    applyDeltas() {
        for (const [param, delta] of Object.entries(this.reactivityDeltas)) {
            if (Math.abs(delta.value) < 0.0001 && delta.mode !== 'replace') continue;

            const baseValue = this.baseParameters[param] || 0;
            let newValue;

            switch (delta.mode) {
                case 'add':
                    newValue = baseValue + delta.value;
                    break;
                case 'multiply':
                    newValue = baseValue * delta.value;
                    break;
                case 'replace':
                    newValue = delta.value;
                    break;
                case 'max':
                    newValue = Math.max(baseValue, delta.value);
                    break;
                case 'min':
                    newValue = Math.min(baseValue, delta.value);
                    break;
                default:
                    newValue = baseValue + delta.value;
            }

            // Apply the update
            this.updateParameter(param, newValue);
        }
    }

    // ==================== INPUT METHODS ====================

    /**
     * Update audio input values
     */
    setAudioInput(bass, mid, high, energy = null) {
        this.inputState.audio.bass = bass;
        this.inputState.audio.mid = mid;
        this.inputState.audio.high = high;
        this.inputState.audio.energy = energy !== null ? energy : (bass + mid + high) / 3;
    }

    /**
     * Update tilt input values
     */
    setTiltInput(alpha, beta, gamma) {
        this.inputState.tilt.alpha = alpha;
        this.inputState.tilt.beta = beta;
        this.inputState.tilt.gamma = gamma;
    }

    /**
     * Update mouse input values
     */
    setMouseInput(x, y, velocityX = 0, velocityY = 0) {
        this.inputState.mouse.x = x;
        this.inputState.mouse.y = y;
        this.inputState.mouse.velocityX = velocityX;
        this.inputState.mouse.velocityY = velocityY;
    }

    /**
     * Trigger a click event
     */
    triggerClick(intensity = 1.0) {
        this.inputState.click.intensity = intensity;
        this.inputState.click.lastTime = Date.now();
    }

    /**
     * Update scroll delta
     */
    setScrollDelta(delta) {
        this.inputState.scroll.delta += delta;
    }

    /**
     * Update touch input
     */
    setTouchInput(touches, pinchScale = 1, rotation = 0) {
        this.inputState.touch.touches = touches;
        this.inputState.touch.pinchScale = pinchScale;
        this.inputState.touch.rotation = rotation;
    }

    /**
     * Set base parameter value (before reactivity)
     */
    setBaseParameter(param, value) {
        this.baseParameters[param] = value;
    }

    /**
     * Set all base parameters
     */
    setBaseParameters(params) {
        this.baseParameters = { ...this.baseParameters, ...params };
    }

    // ==================== EVENT EMITTER ====================

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.listeners.has(event)) {
            for (const callback of this.listeners.get(event)) {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`ReactivityManager event handler error:`, e);
                }
            }
        }
    }

    // ==================== CLEANUP ====================

    /**
     * Destroy and cleanup
     */
    destroy() {
        this.stop();
        this.listeners.clear();
        console.log('🎛️ ReactivityManager: Destroyed');
    }
}

export default ReactivityManager;
