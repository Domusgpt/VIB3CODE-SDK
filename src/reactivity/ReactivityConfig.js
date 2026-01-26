/**
 * VIB3+ ReactivityConfig
 *
 * Unified configuration schema for all reactivity inputs:
 * - Audio frequency band mappings
 * - Device tilt/gyroscope mappings
 * - Mouse/touch/click interaction modes
 *
 * This config is exported with VIB3Package for portable behavior.
 */

/**
 * Valid parameter names that can be targeted by reactivity
 */
export const TARGETABLE_PARAMETERS = [
    'rot4dXY', 'rot4dXZ', 'rot4dYZ',  // 3D rotations
    'rot4dXW', 'rot4dYW', 'rot4dZW',  // 4D rotations
    'gridDensity', 'morphFactor', 'chaos', 'speed',
    'hue', 'intensity', 'saturation', 'dimension',
    'geometry'
];

/**
 * Audio band names
 */
export const AUDIO_BANDS = ['bass', 'mid', 'high'];

/**
 * Reactivity blend modes
 */
export const BLEND_MODES = ['add', 'multiply', 'replace', 'max', 'min'];

/**
 * Interaction modes for different input types
 */
export const INTERACTION_MODES = {
    mouse: ['rotation', 'velocity', 'shimmer', 'attract', 'repel', 'none'],
    click: ['burst', 'blast', 'ripple', 'pulse', 'none'],
    scroll: ['cycle', 'wave', 'sweep', 'zoom', 'morph', 'none']
};

/**
 * Default ReactivityConfig
 */
export const DEFAULT_REACTIVITY_CONFIG = {
    version: '1.0',

    audio: {
        enabled: false,
        globalSensitivity: 1.0,
        smoothing: 0.8,
        bands: {
            bass: {
                enabled: true,
                sensitivity: 1.5,
                frequencyRange: [20, 250],
                targets: [
                    { param: 'morphFactor', weight: 0.8, mode: 'add' },
                    { param: 'intensity', weight: 0.3, mode: 'multiply' }
                ]
            },
            mid: {
                enabled: true,
                sensitivity: 1.0,
                frequencyRange: [250, 2000],
                targets: [
                    { param: 'chaos', weight: 0.5, mode: 'add' }
                ]
            },
            high: {
                enabled: true,
                sensitivity: 0.8,
                frequencyRange: [2000, 20000],
                targets: [
                    { param: 'speed', weight: 0.4, mode: 'add' },
                    { param: 'hue', weight: 15, mode: 'add' }
                ]
            }
        }
    },

    tilt: {
        enabled: false,
        sensitivity: 1.0,
        smoothing: 0.1,
        dramaticMode: false,
        calibrated: false,
        calibrationOffset: { alpha: 0, beta: 0, gamma: 0 },
        mappings: {
            // Device axis -> rotation parameter
            alpha: { target: 'rot4dXY', scale: 0.006, clamp: [-3.14, 3.14] },
            beta: { target: 'rot4dXW', scale: 0.01, clamp: [-1.5, 1.5] },
            gamma: { target: 'rot4dYW', scale: 0.015, clamp: [-1.5, 1.5] }
        },
        dramaticMappings: {
            // 8x more sensitive for dramatic mode
            alpha: { target: 'rot4dXY', scale: 0.048, clamp: [-6.28, 6.28] },
            beta: { target: 'rot4dXW', scale: 0.08, clamp: [-6.0, 6.0] },
            gamma: { target: 'rot4dYW', scale: 0.12, clamp: [-6.0, 6.0] }
        }
    },

    interaction: {
        enabled: true,

        mouse: {
            enabled: true,
            mode: 'rotation',
            sensitivity: 1.0,
            smoothing: 0.15,
            targets: ['rot4dXY', 'rot4dYZ'],
            invertX: false,
            invertY: false
        },

        click: {
            enabled: true,
            mode: 'burst',
            intensity: 1.0,
            decay: 0.92,
            target: 'morphFactor',
            maxValue: 2.0
        },

        scroll: {
            enabled: true,
            mode: 'cycle',
            sensitivity: 1.0,
            target: 'geometry',
            wrap: true,
            step: 1
        },

        touch: {
            enabled: true,
            multiTouchEnabled: true,
            pinchZoom: { enabled: true, target: 'dimension', sensitivity: 0.01 },
            twoFingerRotate: { enabled: true, target: 'rot4dZW', sensitivity: 0.02 },
            swipeGestures: true
        }
    }
};

/**
 * ReactivityConfig class
 * Manages, validates, and serializes reactivity configuration
 */
export class ReactivityConfig {
    constructor(config = null) {
        this.config = this.deepClone(DEFAULT_REACTIVITY_CONFIG);

        if (config) {
            this.merge(config);
        }
    }

    /**
     * Deep clone an object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Merge partial config into current config
     */
    merge(partialConfig) {
        this.deepMerge(this.config, partialConfig);
        return this;
    }

    /**
     * Deep merge source into target
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                this.deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }

    /**
     * Validate the configuration
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validate() {
        const errors = [];

        // Validate audio config
        if (this.config.audio) {
            const audio = this.config.audio;

            if (typeof audio.globalSensitivity !== 'number' ||
                audio.globalSensitivity < 0 || audio.globalSensitivity > 10) {
                errors.push('audio.globalSensitivity must be a number between 0 and 10');
            }

            for (const band of AUDIO_BANDS) {
                if (audio.bands && audio.bands[band]) {
                    const bandConfig = audio.bands[band];

                    if (bandConfig.targets) {
                        for (const target of bandConfig.targets) {
                            if (!TARGETABLE_PARAMETERS.includes(target.param)) {
                                errors.push(`audio.bands.${band}.targets: invalid parameter "${target.param}"`);
                            }
                            if (!BLEND_MODES.includes(target.mode)) {
                                errors.push(`audio.bands.${band}.targets: invalid mode "${target.mode}"`);
                            }
                        }
                    }
                }
            }
        }

        // Validate tilt config
        if (this.config.tilt) {
            const tilt = this.config.tilt;

            if (typeof tilt.sensitivity !== 'number' ||
                tilt.sensitivity < 0.1 || tilt.sensitivity > 10) {
                errors.push('tilt.sensitivity must be a number between 0.1 and 10');
            }

            if (tilt.mappings) {
                for (const axis of ['alpha', 'beta', 'gamma']) {
                    if (tilt.mappings[axis] && tilt.mappings[axis].target) {
                        if (!TARGETABLE_PARAMETERS.includes(tilt.mappings[axis].target)) {
                            errors.push(`tilt.mappings.${axis}.target: invalid parameter`);
                        }
                    }
                }
            }
        }

        // Validate interaction config
        if (this.config.interaction) {
            const interaction = this.config.interaction;

            if (interaction.mouse && interaction.mouse.mode) {
                if (!INTERACTION_MODES.mouse.includes(interaction.mouse.mode)) {
                    errors.push(`interaction.mouse.mode: invalid mode "${interaction.mouse.mode}"`);
                }
            }

            if (interaction.click && interaction.click.mode) {
                if (!INTERACTION_MODES.click.includes(interaction.click.mode)) {
                    errors.push(`interaction.click.mode: invalid mode "${interaction.click.mode}"`);
                }
            }

            if (interaction.scroll && interaction.scroll.mode) {
                if (!INTERACTION_MODES.scroll.includes(interaction.scroll.mode)) {
                    errors.push(`interaction.scroll.mode: invalid mode "${interaction.scroll.mode}"`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ==================== GETTERS ====================

    /**
     * Get full config
     */
    getConfig() {
        return this.deepClone(this.config);
    }

    /**
     * Get audio config
     */
    getAudioConfig() {
        return this.deepClone(this.config.audio);
    }

    /**
     * Get tilt config
     */
    getTiltConfig() {
        return this.deepClone(this.config.tilt);
    }

    /**
     * Get interaction config
     */
    getInteractionConfig() {
        return this.deepClone(this.config.interaction);
    }

    // ==================== SETTERS ====================

    /**
     * Enable/disable audio reactivity
     */
    setAudioEnabled(enabled) {
        this.config.audio.enabled = !!enabled;
        return this;
    }

    /**
     * Set audio band configuration
     */
    setAudioBand(band, config) {
        if (!AUDIO_BANDS.includes(band)) {
            throw new Error(`Invalid audio band: ${band}`);
        }
        this.deepMerge(this.config.audio.bands[band], config);
        return this;
    }

    /**
     * Add a target to an audio band
     */
    addAudioTarget(band, param, weight = 1.0, mode = 'add') {
        if (!AUDIO_BANDS.includes(band)) {
            throw new Error(`Invalid audio band: ${band}`);
        }
        if (!TARGETABLE_PARAMETERS.includes(param)) {
            throw new Error(`Invalid parameter: ${param}`);
        }
        if (!BLEND_MODES.includes(mode)) {
            throw new Error(`Invalid blend mode: ${mode}`);
        }

        this.config.audio.bands[band].targets.push({ param, weight, mode });
        return this;
    }

    /**
     * Clear all targets from an audio band
     */
    clearAudioTargets(band) {
        if (!AUDIO_BANDS.includes(band)) {
            throw new Error(`Invalid audio band: ${band}`);
        }
        this.config.audio.bands[band].targets = [];
        return this;
    }

    /**
     * Enable/disable tilt reactivity
     */
    setTiltEnabled(enabled) {
        this.config.tilt.enabled = !!enabled;
        return this;
    }

    /**
     * Set tilt dramatic mode
     */
    setTiltDramaticMode(enabled) {
        this.config.tilt.dramaticMode = !!enabled;
        return this;
    }

    /**
     * Set tilt sensitivity
     */
    setTiltSensitivity(sensitivity) {
        this.config.tilt.sensitivity = Math.max(0.1, Math.min(10, sensitivity));
        return this;
    }

    /**
     * Set tilt axis mapping
     */
    setTiltMapping(axis, target, scale, clamp = null) {
        if (!['alpha', 'beta', 'gamma'].includes(axis)) {
            throw new Error(`Invalid axis: ${axis}`);
        }
        if (!TARGETABLE_PARAMETERS.includes(target)) {
            throw new Error(`Invalid parameter: ${target}`);
        }

        this.config.tilt.mappings[axis] = {
            target,
            scale,
            clamp: clamp || [-6.28, 6.28]
        };
        return this;
    }

    /**
     * Enable/disable interaction
     */
    setInteractionEnabled(enabled) {
        this.config.interaction.enabled = !!enabled;
        return this;
    }

    /**
     * Set mouse interaction mode
     */
    setMouseMode(mode, options = {}) {
        if (!INTERACTION_MODES.mouse.includes(mode)) {
            throw new Error(`Invalid mouse mode: ${mode}`);
        }
        this.config.interaction.mouse.mode = mode;
        this.deepMerge(this.config.interaction.mouse, options);
        return this;
    }

    /**
     * Set click interaction mode
     */
    setClickMode(mode, options = {}) {
        if (!INTERACTION_MODES.click.includes(mode)) {
            throw new Error(`Invalid click mode: ${mode}`);
        }
        this.config.interaction.click.mode = mode;
        this.deepMerge(this.config.interaction.click, options);
        return this;
    }

    /**
     * Set scroll interaction mode
     */
    setScrollMode(mode, options = {}) {
        if (!INTERACTION_MODES.scroll.includes(mode)) {
            throw new Error(`Invalid scroll mode: ${mode}`);
        }
        this.config.interaction.scroll.mode = mode;
        this.deepMerge(this.config.interaction.scroll, options);
        return this;
    }

    // ==================== SERIALIZATION ====================

    /**
     * Export to JSON
     */
    toJSON() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import from JSON
     */
    static fromJSON(json) {
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        return new ReactivityConfig(parsed);
    }

    /**
     * Export minimal config (only non-default values)
     */
    toMinimalJSON() {
        const minimal = {};
        const defaults = DEFAULT_REACTIVITY_CONFIG;

        // Only include values that differ from defaults
        this.extractDifferences(this.config, defaults, minimal);

        return JSON.stringify(minimal, null, 2);
    }

    /**
     * Extract differences between current and default config
     */
    extractDifferences(current, defaults, result) {
        for (const key in current) {
            if (typeof current[key] === 'object' && !Array.isArray(current[key])) {
                const subResult = {};
                this.extractDifferences(current[key], defaults[key] || {}, subResult);
                if (Object.keys(subResult).length > 0) {
                    result[key] = subResult;
                }
            } else if (JSON.stringify(current[key]) !== JSON.stringify(defaults[key])) {
                result[key] = current[key];
            }
        }
    }

    /**
     * Create a copy
     */
    clone() {
        return new ReactivityConfig(this.config);
    }

    /**
     * Reset to defaults
     */
    reset() {
        this.config = this.deepClone(DEFAULT_REACTIVITY_CONFIG);
        return this;
    }
}

export default ReactivityConfig;
