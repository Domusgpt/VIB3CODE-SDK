/**
 * VIB3+ Reactivity Panel UI
 *
 * Enhanced UI controls for configuring:
 * - Audio frequency band mappings
 * - Device tilt settings
 * - Mouse/click/scroll interaction modes
 *
 * Integrates with ReactivityConfig and ReactivityManager
 */

import { ReactivityConfig, TARGETABLE_PARAMETERS, AUDIO_BANDS, BLEND_MODES, INTERACTION_MODES } from '../../src/reactivity/ReactivityConfig.js';
import { ReactivityManager } from '../../src/reactivity/ReactivityManager.js';

// Global reactivity manager instance
let reactivityManager = null;
let currentConfig = null;

/**
 * Initialize the reactivity panel system
 */
export function initReactivityPanel() {
    console.log('🎛️ Initializing Reactivity Panel...');

    // Create ReactivityManager with parameter update function
    reactivityManager = new ReactivityManager(window.updateParameter);
    currentConfig = new ReactivityConfig();

    // Make available globally
    window.reactivityManager = reactivityManager;
    window.reactivityConfig = currentConfig;

    // Build enhanced UI sections
    buildAudioReactivityUI();
    buildTiltReactivityUI();
    buildInteractionReactivityUI();

    // Wire up existing checkboxes to new system
    wireUpExistingControls();

    // Start the reactivity manager
    reactivityManager.start();

    console.log('✅ Reactivity Panel initialized');
}

/**
 * Build enhanced Audio Reactivity UI
 */
function buildAudioReactivityUI() {
    const container = document.getElementById('audio-config-container');
    if (!container) {
        // Create container if it doesn't exist
        const reactivityContent = document.getElementById('reactivity-content');
        if (!reactivityContent) return;

        const section = document.createElement('div');
        section.className = 'control-section audio-config-section';
        section.id = 'audio-config-container';
        section.innerHTML = `
            <div class="section-title">
                🎵 Audio Configuration
                <label class="toggle-switch" style="margin-left: auto;">
                    <input type="checkbox" id="audioEnabled" onchange="toggleAudioEnabled(this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <!-- Global Sensitivity -->
            <div class="control-group">
                <div class="control-label">
                    <span>Global Sensitivity</span>
                    <span class="control-value" id="audioSensitivity-display">1.0</span>
                </div>
                <input type="range" id="audioSensitivity" class="control-slider" min="0.1" max="3" step="0.1" value="1"
                       oninput="setAudioSensitivity(this.value)">
            </div>

            <!-- Band Configurations -->
            <div class="audio-bands-config">
                ${AUDIO_BANDS.map(band => `
                    <div class="audio-band-config" data-band="${band}">
                        <div class="band-header">
                            <span class="band-name">${band.toUpperCase()}</span>
                            <label class="toggle-switch small">
                                <input type="checkbox" id="${band}Enabled" checked onchange="toggleBandEnabled('${band}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="band-controls">
                            <div class="control-mini">
                                <label>Sensitivity</label>
                                <input type="range" id="${band}Sensitivity" min="0.1" max="3" step="0.1" value="1"
                                       oninput="setBandSensitivity('${band}', this.value)">
                                <span id="${band}Sensitivity-display">1.0</span>
                            </div>
                            <div class="control-mini">
                                <label>Target</label>
                                <select id="${band}Target" onchange="setBandTarget('${band}', this.value)">
                                    ${TARGETABLE_PARAMETERS.map(p => `<option value="${p}">${p}</option>`).join('')}
                                </select>
                            </div>
                            <div class="control-mini">
                                <label>Weight</label>
                                <input type="range" id="${band}Weight" min="0" max="2" step="0.1" value="1"
                                       oninput="setBandWeight('${band}', this.value)">
                                <span id="${band}Weight-display">1.0</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Audio Level Display -->
            <div class="audio-levels-display">
                <div class="level-bar" id="bass-level"><div class="level-fill"></div><span>BASS</span></div>
                <div class="level-bar" id="mid-level"><div class="level-fill"></div><span>MID</span></div>
                <div class="level-bar" id="high-level"><div class="level-fill"></div><span>HIGH</span></div>
            </div>
        `;

        // Insert after the existing audio grid section
        const existingAudioSection = reactivityContent.querySelector('.audio-grid')?.parentElement;
        if (existingAudioSection) {
            existingAudioSection.after(section);
        } else {
            reactivityContent.querySelector('.tab-content-grid')?.appendChild(section);
        }
    }

    // Set default targets
    setTimeout(() => {
        const bassTarget = document.getElementById('bassTarget');
        const midTarget = document.getElementById('midTarget');
        const highTarget = document.getElementById('highTarget');
        if (bassTarget) bassTarget.value = 'morphFactor';
        if (midTarget) midTarget.value = 'chaos';
        if (highTarget) highTarget.value = 'speed';
    }, 100);
}

/**
 * Build Tilt Reactivity UI
 */
function buildTiltReactivityUI() {
    const reactivityContent = document.getElementById('reactivity-content');
    if (!reactivityContent) return;

    const section = document.createElement('div');
    section.className = 'control-section tilt-config-section';
    section.id = 'tilt-config-container';
    section.innerHTML = `
        <div class="section-title">
            📱 Device Tilt Configuration
            <label class="toggle-switch" style="margin-left: auto;">
                <input type="checkbox" id="tiltEnabled" onchange="toggleTiltEnabled(this.checked)">
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="tilt-controls">
            <!-- Sensitivity -->
            <div class="control-group">
                <div class="control-label">
                    <span>Sensitivity</span>
                    <span class="control-value" id="tiltSensitivity-display">1.0</span>
                </div>
                <input type="range" id="tiltSensitivity" class="control-slider" min="0.1" max="3" step="0.1" value="1"
                       oninput="setTiltSensitivity(this.value)">
            </div>

            <!-- Smoothing -->
            <div class="control-group">
                <div class="control-label">
                    <span>Smoothing</span>
                    <span class="control-value" id="tiltSmoothing-display">0.10</span>
                </div>
                <input type="range" id="tiltSmoothing" class="control-slider" min="0.01" max="0.5" step="0.01" value="0.1"
                       oninput="setTiltSmoothing(this.value)">
            </div>

            <!-- Dramatic Mode -->
            <div class="control-group dramatic-toggle">
                <label class="toggle-switch-labeled">
                    <input type="checkbox" id="dramaticMode" onchange="setDramaticMode(this.checked)">
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">🚀 Dramatic Mode (8x Sensitivity)</span>
                </label>
            </div>

            <!-- Calibrate Button -->
            <button class="action-btn full-width" onclick="calibrateTilt()">
                🎯 Calibrate Current Position
            </button>
        </div>
    `;

    const tabGrid = reactivityContent.querySelector('.tab-content-grid');
    if (tabGrid) {
        tabGrid.appendChild(section);
    }
}

/**
 * Build Interaction Reactivity UI
 */
function buildInteractionReactivityUI() {
    const reactivityContent = document.getElementById('reactivity-content');
    if (!reactivityContent) return;

    const section = document.createElement('div');
    section.className = 'control-section interaction-config-section';
    section.id = 'interaction-config-container';
    section.innerHTML = `
        <div class="section-title">
            🖱️ Interaction Configuration
            <label class="toggle-switch" style="margin-left: auto;">
                <input type="checkbox" id="interactionEnabled" checked onchange="toggleInteractionEnabled(this.checked)">
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="interaction-controls">
            <!-- Mouse Mode -->
            <div class="control-group">
                <div class="control-label"><span>Mouse Mode</span></div>
                <select id="mouseMode" class="control-select" onchange="setMouseMode(this.value)">
                    ${INTERACTION_MODES.mouse.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
                </select>
            </div>

            <!-- Mouse Sensitivity -->
            <div class="control-group">
                <div class="control-label">
                    <span>Mouse Sensitivity</span>
                    <span class="control-value" id="mouseSensitivity-display">1.0</span>
                </div>
                <input type="range" id="mouseSensitivity" class="control-slider" min="0.1" max="3" step="0.1" value="1"
                       oninput="setMouseSensitivity(this.value)">
            </div>

            <!-- Click Mode -->
            <div class="control-group">
                <div class="control-label"><span>Click Mode</span></div>
                <select id="clickMode" class="control-select" onchange="setClickMode(this.value)">
                    ${INTERACTION_MODES.click.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
                </select>
            </div>

            <!-- Click Intensity -->
            <div class="control-group">
                <div class="control-label">
                    <span>Click Intensity</span>
                    <span class="control-value" id="clickIntensity-display">1.0</span>
                </div>
                <input type="range" id="clickIntensity" class="control-slider" min="0.1" max="3" step="0.1" value="1"
                       oninput="setClickIntensity(this.value)">
            </div>

            <!-- Scroll Mode -->
            <div class="control-group">
                <div class="control-label"><span>Scroll Mode</span></div>
                <select id="scrollMode" class="control-select" onchange="setScrollMode(this.value)">
                    ${INTERACTION_MODES.scroll.map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
                </select>
            </div>
        </div>
    `;

    const tabGrid = reactivityContent.querySelector('.tab-content-grid');
    if (tabGrid) {
        tabGrid.appendChild(section);
    }
}

/**
 * Wire up existing checkbox controls to the new system
 */
function wireUpExistingControls() {
    // Connect existing audio checkboxes
    document.querySelectorAll('[id$="Color"], [id$="Geometry"], [id$="Movement"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            syncConfigFromUI();
        });
    });

    // Connect existing interactivity checkboxes
    document.querySelectorAll('[id$="Mouse"], [id$="Click"], [id$="Scroll"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            syncConfigFromUI();
        });
    });
}

/**
 * Sync ReactivityConfig from current UI state
 */
function syncConfigFromUI() {
    if (!currentConfig) return;

    // This would read all UI controls and update the config
    // For now, the individual setters handle this
    console.log('🔄 Syncing config from UI');
}

// ==================== GLOBAL FUNCTIONS ====================

// Audio controls
window.toggleAudioEnabled = function(enabled) {
    if (currentConfig) {
        currentConfig.setAudioEnabled(enabled);
        reactivityManager?.loadConfig(currentConfig);
    }
    console.log(`🎵 Audio reactivity: ${enabled ? 'ON' : 'OFF'}`);
};

window.setAudioSensitivity = function(value) {
    const v = parseFloat(value);
    if (currentConfig) {
        currentConfig.config.audio.globalSensitivity = v;
        reactivityManager?.loadConfig(currentConfig);
    }
    const display = document.getElementById('audioSensitivity-display');
    if (display) display.textContent = v.toFixed(1);
};

window.toggleBandEnabled = function(band, enabled) {
    if (currentConfig && currentConfig.config.audio.bands[band]) {
        currentConfig.config.audio.bands[band].enabled = enabled;
        reactivityManager?.loadConfig(currentConfig);
    }
};

window.setBandSensitivity = function(band, value) {
    const v = parseFloat(value);
    if (currentConfig && currentConfig.config.audio.bands[band]) {
        currentConfig.config.audio.bands[band].sensitivity = v;
        reactivityManager?.loadConfig(currentConfig);
    }
    const display = document.getElementById(`${band}Sensitivity-display`);
    if (display) display.textContent = v.toFixed(1);
};

window.setBandTarget = function(band, param) {
    if (currentConfig && currentConfig.config.audio.bands[band]) {
        currentConfig.config.audio.bands[band].targets = [
            { param, weight: 1.0, mode: 'add' }
        ];
        reactivityManager?.loadConfig(currentConfig);
    }
};

window.setBandWeight = function(band, value) {
    const v = parseFloat(value);
    if (currentConfig && currentConfig.config.audio.bands[band]) {
        const targets = currentConfig.config.audio.bands[band].targets;
        if (targets && targets[0]) {
            targets[0].weight = v;
        }
        reactivityManager?.loadConfig(currentConfig);
    }
    const display = document.getElementById(`${band}Weight-display`);
    if (display) display.textContent = v.toFixed(1);
};

// Tilt controls
window.toggleTiltEnabled = function(enabled) {
    if (currentConfig) {
        currentConfig.setTiltEnabled(enabled);
        reactivityManager?.loadConfig(currentConfig);
    }
    // Also toggle the device tilt handler
    if (enabled && window.enableDeviceTilt) {
        window.enableDeviceTilt();
    } else if (!enabled && window.disableDeviceTilt) {
        window.disableDeviceTilt();
    }
    console.log(`📱 Tilt reactivity: ${enabled ? 'ON' : 'OFF'}`);
};

window.setTiltSensitivity = function(value) {
    const v = parseFloat(value);
    if (currentConfig) {
        currentConfig.setTiltSensitivity(v);
        reactivityManager?.loadConfig(currentConfig);
    }
    if (window.deviceTiltHandler) {
        window.deviceTiltHandler.setSensitivity(v);
    }
    const display = document.getElementById('tiltSensitivity-display');
    if (display) display.textContent = v.toFixed(1);
};

window.setTiltSmoothing = function(value) {
    const v = parseFloat(value);
    if (currentConfig) {
        currentConfig.config.tilt.smoothing = v;
        reactivityManager?.loadConfig(currentConfig);
    }
    if (window.deviceTiltHandler) {
        window.deviceTiltHandler.setSmoothing(v);
    }
    const display = document.getElementById('tiltSmoothing-display');
    if (display) display.textContent = v.toFixed(2);
};

window.setDramaticMode = function(enabled) {
    if (currentConfig) {
        currentConfig.setTiltDramaticMode(enabled);
        reactivityManager?.loadConfig(currentConfig);
    }
    if (window.deviceTiltHandler) {
        window.deviceTiltHandler.setDramaticMode(enabled);
    }
    console.log(`🚀 Dramatic mode: ${enabled ? 'ON' : 'OFF'}`);
};

window.calibrateTilt = function() {
    if (window.deviceTiltHandler && window.deviceTiltHandler.currentTilt) {
        const tilt = window.deviceTiltHandler.currentTilt;
        if (currentConfig) {
            currentConfig.config.tilt.calibrationOffset = { ...tilt };
            currentConfig.config.tilt.calibrated = true;
            reactivityManager?.loadConfig(currentConfig);
        }
        console.log('🎯 Tilt calibrated to current position');
    }
};

// Interaction controls
window.toggleInteractionEnabled = function(enabled) {
    if (currentConfig) {
        currentConfig.setInteractionEnabled(enabled);
        reactivityManager?.loadConfig(currentConfig);
    }
    console.log(`🖱️ Interaction: ${enabled ? 'ON' : 'OFF'}`);
};

window.setMouseMode = function(mode) {
    if (currentConfig) {
        currentConfig.setMouseMode(mode);
        reactivityManager?.loadConfig(currentConfig);
    }
    console.log(`🖱️ Mouse mode: ${mode}`);
};

window.setMouseSensitivity = function(value) {
    const v = parseFloat(value);
    if (currentConfig) {
        currentConfig.config.interaction.mouse.sensitivity = v;
        reactivityManager?.loadConfig(currentConfig);
    }
    const display = document.getElementById('mouseSensitivity-display');
    if (display) display.textContent = v.toFixed(1);
};

window.setClickMode = function(mode) {
    if (currentConfig) {
        currentConfig.setClickMode(mode);
        reactivityManager?.loadConfig(currentConfig);
    }
    console.log(`👆 Click mode: ${mode}`);
};

window.setClickIntensity = function(value) {
    const v = parseFloat(value);
    if (currentConfig) {
        currentConfig.config.interaction.click.intensity = v;
        reactivityManager?.loadConfig(currentConfig);
    }
    const display = document.getElementById('clickIntensity-display');
    if (display) display.textContent = v.toFixed(1);
};

window.setScrollMode = function(mode) {
    if (currentConfig) {
        currentConfig.setScrollMode(mode);
        reactivityManager?.loadConfig(currentConfig);
    }
    console.log(`🌀 Scroll mode: ${mode}`);
};

// ==================== EXPORT HELPERS ====================

/**
 * Get current ReactivityConfig for export
 */
window.getReactivityConfig = function() {
    return currentConfig ? currentConfig.getConfig() : null;
};

/**
 * Load ReactivityConfig from imported data
 */
window.loadReactivityConfig = function(config) {
    if (currentConfig) {
        currentConfig.merge(config);
        reactivityManager?.loadConfig(currentConfig);
        updateUIFromConfig();
        console.log('📥 Reactivity config loaded');
    }
};

/**
 * Update UI controls from current config
 */
function updateUIFromConfig() {
    if (!currentConfig) return;

    const cfg = currentConfig.getConfig();

    // Audio
    const audioEnabled = document.getElementById('audioEnabled');
    if (audioEnabled) audioEnabled.checked = cfg.audio.enabled;

    const audioSens = document.getElementById('audioSensitivity');
    if (audioSens) audioSens.value = cfg.audio.globalSensitivity;

    // Tilt
    const tiltEnabled = document.getElementById('tiltEnabled');
    if (tiltEnabled) tiltEnabled.checked = cfg.tilt.enabled;

    const tiltSens = document.getElementById('tiltSensitivity');
    if (tiltSens) tiltSens.value = cfg.tilt.sensitivity;

    const dramatic = document.getElementById('dramaticMode');
    if (dramatic) dramatic.checked = cfg.tilt.dramaticMode;

    // Interaction
    const interactionEnabled = document.getElementById('interactionEnabled');
    if (interactionEnabled) interactionEnabled.checked = cfg.interaction.enabled;

    const mouseMode = document.getElementById('mouseMode');
    if (mouseMode) mouseMode.value = cfg.interaction.mouse.mode;

    const clickMode = document.getElementById('clickMode');
    if (clickMode) clickMode.value = cfg.interaction.click.mode;

    const scrollMode = document.getElementById('scrollMode');
    if (scrollMode) scrollMode.value = cfg.interaction.scroll.mode;
}

/**
 * Update audio level display (called from audio engine)
 */
window.updateAudioLevelDisplay = function(bass, mid, high) {
    const bassLevel = document.querySelector('#bass-level .level-fill');
    const midLevel = document.querySelector('#mid-level .level-fill');
    const highLevel = document.querySelector('#high-level .level-fill');

    if (bassLevel) bassLevel.style.width = `${bass * 100}%`;
    if (midLevel) midLevel.style.width = `${mid * 100}%`;
    if (highLevel) highLevel.style.width = `${high * 100}%`;
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(initReactivityPanel, 500);
    });
}

console.log('🎛️ Reactivity Panel Module: Loaded');
