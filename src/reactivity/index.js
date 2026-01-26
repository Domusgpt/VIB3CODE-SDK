/**
 * VIB3+ Reactivity System
 *
 * Unified reactivity configuration and management for:
 * - Audio frequency band mappings
 * - Device tilt/gyroscope control
 * - Mouse/touch/click interactions
 *
 * @module reactivity
 */

export {
    ReactivityConfig,
    DEFAULT_REACTIVITY_CONFIG,
    TARGETABLE_PARAMETERS,
    AUDIO_BANDS,
    BLEND_MODES,
    INTERACTION_MODES
} from './ReactivityConfig.js';

export { ReactivityManager } from './ReactivityManager.js';

/**
 * Create a pre-configured ReactivityManager with common settings
 */
export function createReactivityManager(options = {}) {
    const { config, parameterUpdateFn } = options;

    const manager = new (await import('./ReactivityManager.js')).ReactivityManager(parameterUpdateFn);

    if (config) {
        manager.loadConfig(config);
    }

    return manager;
}

/**
 * Create ReactivityConfig from a preset name
 */
export function createPresetConfig(presetName) {
    const { ReactivityConfig } = require('./ReactivityConfig.js');
    const config = new ReactivityConfig();

    switch (presetName) {
        case 'ambient':
            config.setAudioEnabled(false);
            config.setTiltEnabled(true);
            config.setTiltSensitivity(0.5);
            config.config.tilt.smoothing = 0.3;
            config.setMouseMode('rotation', { sensitivity: 0.3 });
            config.setClickMode('none');
            break;

        case 'reactive':
            config.setAudioEnabled(true);
            config.config.audio.globalSensitivity = 1.5;
            config.setTiltEnabled(true);
            config.setMouseMode('velocity');
            config.setClickMode('burst', { intensity: 1.5 });
            break;

        case 'immersive':
            config.setAudioEnabled(false);
            config.setTiltEnabled(true);
            config.setTiltDramaticMode(true);
            config.setTiltSensitivity(1.5);
            config.setMouseMode('none');
            config.setClickMode('none');
            break;

        case 'performance':
            config.setAudioEnabled(true);
            config.config.audio.globalSensitivity = 2.0;
            config.setTiltEnabled(false);
            config.setInteractionEnabled(false);
            break;

        case 'background':
            config.setAudioEnabled(true);
            config.config.audio.globalSensitivity = 0.3;
            config.setTiltEnabled(false);
            config.setInteractionEnabled(false);
            break;

        default:
            console.warn(`Unknown preset: ${presetName}, using defaults`);
    }

    return config;
}

console.log('🎛️ VIB3+ Reactivity System loaded');
