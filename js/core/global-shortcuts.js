/**
 * VIB34D Global Keyboard Shortcuts System
 * Comprehensive keyboard control for the entire application
 *
 * Shortcuts organized by category:
 * - System switching
 * - Geometry selection
 * - Tab navigation
 * - Parameter control
 * - Actions (save, gallery, randomize, etc.)
 * - UI toggles
 */

console.log('⌨️ Global Shortcuts Module: Loading...');

// Shortcut state
let shortcutsEnabled = true;
let shortcutsVisible = false;
let helpModalElement = null;

// Shortcut definitions organized by category
const SHORTCUTS = {
    systems: {
        title: 'System Switching',
        shortcuts: [
            { keys: ['1'], action: 'switchToFaceted', desc: 'Switch to Faceted System' },
            { keys: ['2'], action: 'switchToQuantum', desc: 'Switch to Quantum System' },
            { keys: ['3'], action: 'switchToHolographic', desc: 'Switch to Holographic System' }
            // key 4 reserved for future Polychora (TBD placeholder)
        ]
    },

    tabs: {
        title: 'Tab Navigation',
        shortcuts: [
            { keys: ['Ctrl', 'B'], action: 'toggleBezel', desc: 'Toggle Bezel Collapse' },
            { keys: ['Space'], action: 'toggleBezel', desc: 'Toggle Bezel (alt)' },
            { keys: ['Ctrl', '1'], action: 'openControlsTab', desc: 'Open Controls Tab' },
            { keys: ['Ctrl', '2'], action: 'openColorTab', desc: 'Open Color Tab' },
            { keys: ['Ctrl', '3'], action: 'openGeometryTab', desc: 'Open Geometry Tab' },
            { keys: ['Ctrl', '4'], action: 'openReactivityTab', desc: 'Open Reactivity Tab' },
            { keys: ['Ctrl', '5'], action: 'openExportTab', desc: 'Open Export Tab' }
        ]
    },

    geometry: {
        title: 'Geometry Selection',
        shortcuts: [
            { keys: ['Alt', '1'], action: 'baseCore', desc: 'Switch to Base Core' },
            { keys: ['Alt', '2'], action: 'hypersphereCore', desc: 'Switch to Hypersphere Core' },
            { keys: ['Alt', '3'], action: 'hypertetraCore', desc: 'Switch to Hypertetra Core' },
            { keys: ['Alt', 'Q'], action: 'tetrahedron', desc: 'Select Tetrahedron' },
            { keys: ['Alt', 'W'], action: 'hypercube', desc: 'Select Hypercube' },
            { keys: ['Alt', 'E'], action: 'sphere', desc: 'Select Sphere' },
            { keys: ['Alt', 'R'], action: 'torus', desc: 'Select Torus' },
            { keys: ['Alt', 'A'], action: 'kleinBottle', desc: 'Select Klein Bottle' },
            { keys: ['Alt', 'S'], action: 'fractal', desc: 'Select Fractal' },
            { keys: ['Alt', 'D'], action: 'wave', desc: 'Select Wave' },
            { keys: ['Alt', 'F'], action: 'crystal', desc: 'Select Crystal' }
        ]
    },

    actions: {
        title: 'Actions',
        shortcuts: [
            { keys: ['Ctrl', 'S'], action: 'saveToGallery', desc: 'Save to Gallery' },
            { keys: ['Ctrl', 'G'], action: 'openGallery', desc: 'Open Gallery' },
            { keys: ['Ctrl', 'R'], action: 'randomizeAll', desc: 'Randomize All Parameters' },
            { keys: ['Ctrl', 'Shift', 'R'], action: 'randomizeEverything', desc: 'Randomize Everything' },
            { keys: ['Ctrl', 'Shift', 'Z'], action: 'resetAll', desc: 'Reset All Parameters' },
            { keys: ['Ctrl', 'E'], action: 'exportCard', desc: 'Export Trading Card' }
        ]
    },

    features: {
        title: 'Feature Toggles',
        shortcuts: [
            { keys: ['A'], action: 'toggleAudio', desc: 'Toggle Audio Reactivity' },
            { keys: ['T'], action: 'toggleTilt', desc: 'Toggle Device Tilt' },
            { keys: ['I'], action: 'toggleInteractivity', desc: 'Toggle Interactivity' },
            { keys: ['F'], action: 'toggleFullscreen', desc: 'Toggle Fullscreen' },
            { keys: ['H'], action: 'toggleHelp', desc: 'Toggle Shortcuts Help' }
        ]
    },

    navigation: {
        title: 'Navigation',
        shortcuts: [
            { keys: ['←'], action: 'previousGeometry', desc: 'Previous Geometry' },
            { keys: ['→'], action: 'nextGeometry', desc: 'Next Geometry' },
            { keys: ['↑'], action: 'nextSystem', desc: 'Next System' },
            { keys: ['↓'], action: 'previousSystem', desc: 'Previous System' }
        ]
    }
};

/**
 * Initialize global shortcuts system
 */
function initializeGlobalShortcuts() {
    console.log('🎹 Initializing global shortcuts...');

    // Create help modal
    createHelpModal();

    // Set up keyboard listener
    document.addEventListener('keydown', handleKeyDown);

    console.log('✅ Global shortcuts initialized');
    console.log('📋 Press H to view all shortcuts');
}

/**
 * Handle keydown events
 */
function handleKeyDown(e) {
    if (!shortcutsEnabled) return;

    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Allow only specific shortcuts like Ctrl+S
        if (!e.ctrlKey && !e.metaKey) return;
    }

    // System switching (1-4 without modifiers)
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        if (e.key === '1' && window.switchSystem) {
            e.preventDefault();
            window.switchSystem('faceted');
            return;
        }
        if (e.key === '2' && window.switchSystem) {
            e.preventDefault();
            window.switchSystem('quantum');
            return;
        }
        if (e.key === '3' && window.switchSystem) {
            e.preventDefault();
            window.switchSystem('holographic');
            return;
        }
        // Key 4 reserved for future Polychora (TBD placeholder)
        // if (e.key === '4' && window.switchSystem) {
        //     e.preventDefault();
        //     window.switchSystem('polychora');
        //     return;
        // }

        // Feature toggles (single letters without modifiers)
        if (e.key.toLowerCase() === 'a' && window.toggleAudio) {
            e.preventDefault();
            window.toggleAudio();
            return;
        }
        if (e.key.toLowerCase() === 't' && window.toggleDeviceTilt) {
            e.preventDefault();
            window.toggleDeviceTilt();
            return;
        }
        if (e.key.toLowerCase() === 'i' && window.toggleInteractivity) {
            e.preventDefault();
            window.toggleInteractivity();
            return;
        }
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFullscreen();
            return;
        }
        if (e.key.toLowerCase() === 'h') {
            e.preventDefault();
            toggleShortcutsHelp();
            return;
        }
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
        // Save
        if (e.key === 's' && window.saveToGallery) {
            e.preventDefault();
            window.saveToGallery();
            return;
        }

        // Gallery
        if (e.key === 'g' && window.openGallery) {
            e.preventDefault();
            window.openGallery();
            return;
        }

        // Randomize
        if (e.key === 'r') {
            e.preventDefault();
            if (e.shiftKey && window.randomizeEverything) {
                window.randomizeEverything();
            } else if (window.randomizeAll) {
                window.randomizeAll();
            }
            return;
        }

        // Reset
        if (e.key === 'z' && e.shiftKey && window.resetAll) {
            e.preventDefault();
            window.resetAll();
            return;
        }

        // Export
        if (e.key === 'e' && window.createTradingCard) {
            e.preventDefault();
            window.createTradingCard();
            return;
        }
    }

    // Arrow key navigation
    if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateGeometry(-1);
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateGeometry(1);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSystem(1);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSystem(-1);
            return;
        }
    }
}

/**
 * Navigate to next/previous geometry
 */
function navigateGeometry(direction) {
    const currentGeometry = window.getGeometryInfo ? window.getGeometryInfo().index : 0;
    let newGeometry = currentGeometry + direction;

    // Wrap around
    if (newGeometry < 0) newGeometry = 23;
    if (newGeometry > 23) newGeometry = 0;

    console.log(`➡️ Navigating from geometry ${currentGeometry} to ${newGeometry}`);

    if (window.loadGeometryFromIndex) {
        window.loadGeometryFromIndex(newGeometry);
    }
}

/**
 * Navigate to next/previous system
 */
function navigateSystem(direction) {
    const systems = ['faceted', 'quantum', 'holographic']; // 3 active systems (polychora TBD)
    const currentSystem = window.currentSystem || 'faceted';
    const currentIndex = systems.indexOf(currentSystem);
    let newIndex = currentIndex + direction;

    // Wrap around
    if (newIndex < 0) newIndex = systems.length - 1;
    if (newIndex >= systems.length) newIndex = 0;

    console.log(`➡️ Navigating from ${currentSystem} to ${systems[newIndex]}`);

    if (window.switchSystem) {
        window.switchSystem(systems[newIndex]);
    }
}

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            console.log('🖥️ Entered fullscreen mode');
            showNotification('Fullscreen Mode Enabled', 'Press F to exit', 'info');
        }).catch(err => {
            console.error('❌ Failed to enter fullscreen:', err);
        });
    } else {
        document.exitFullscreen().then(() => {
            console.log('🖥️ Exited fullscreen mode');
            showNotification('Fullscreen Mode Disabled', '', 'info');
        });
    }
}

/**
 * Create shortcuts help modal
 */
function createHelpModal() {
    const modal = document.createElement('div');
    modal.id = 'shortcuts-help-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.95);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Orbitron', monospace;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: linear-gradient(135deg, rgba(0, 30, 60, 0.95), rgba(0, 15, 30, 0.95));
        border: 2px solid #00ffff;
        border-radius: 15px;
        padding: 30px;
        max-width: 900px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 0 40px rgba(0, 255, 255, 0.3);
    `;

    // Build HTML for shortcuts
    let html = `
        <h2 style="color: #00ffff; text-align: center; margin-bottom: 25px; font-size: 1.8rem;">
            ⌨️ VIB3+ KEYBOARD SHORTCUTS
        </h2>
        <p style="color: #888; text-align: center; margin-bottom: 30px; font-size: 0.85rem;">
            Master the VIB3+ Engine with comprehensive keyboard control
        </p>
    `;

    Object.entries(SHORTCUTS).forEach(([category, data]) => {
        html += `
            <div style="margin-bottom: 25px;">
                <h3 style="color: #ff00ff; font-size: 1.1rem; margin-bottom: 12px; border-bottom: 1px solid rgba(255, 0, 255, 0.3); padding-bottom: 5px;">
                    ${data.title}
                </h3>
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 8px; font-size: 0.85rem;">
        `;

        data.shortcuts.forEach(shortcut => {
            const keys = shortcut.keys.map(k =>
                `<kbd style="background: rgba(0, 255, 255, 0.15); border: 1px solid rgba(0, 255, 255, 0.3); padding: 2px 8px; border-radius: 3px; font-size: 0.75rem; color: #00ffff;">${k}</kbd>`
            ).join(' + ');

            html += `
                <div style="color: #fff;">${keys}</div>
                <div style="color: #aaa;">${shortcut.desc}</div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
        <div style="text-align: center; margin-top: 25px;">
            <button onclick="toggleShortcutsHelp()" style="
                background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 200, 255, 0.2));
                border: 1px solid #00ffff;
                color: #00ffff;
                padding: 10px 30px;
                border-radius: 8px;
                font-family: 'Orbitron', monospace;
                font-size: 0.9rem;
                cursor: pointer;
                font-weight: bold;
            ">CLOSE (H or ESC)</button>
        </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            toggleShortcutsHelp();
        }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shortcutsVisible) {
            e.preventDefault();
            toggleShortcutsHelp();
        }
    });

    helpModalElement = modal;
}

/**
 * Toggle shortcuts help visibility
 */
function toggleShortcutsHelp() {
    if (!helpModalElement) return;

    shortcutsVisible = !shortcutsVisible;
    helpModalElement.style.display = shortcutsVisible ? 'flex' : 'none';

    console.log(`⌨️ Shortcuts help ${shortcutsVisible ? 'shown' : 'hidden'}`);
}

/**
 * Show notification
 */
function showNotification(title, message, type = 'info') {
    const colors = {
        success: { bg: '#00ff00', border: '#00cc00' },
        error: { bg: '#ff0000', border: '#cc0000' },
        info: { bg: '#00ffff', border: '#00cccc' },
        warning: { bg: '#ffff00', border: '#cccc00' }
    };

    const color = colors[type] || colors.info;

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid ${color.border};
        border-radius: 10px;
        padding: 15px 20px;
        color: ${color.bg};
        font-family: 'Orbitron', monospace;
        font-size: 0.85rem;
        z-index: 9999;
        box-shadow: 0 0 20px ${color.bg}40;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
    `;

    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
        ${message ? `<div style="font-size: 0.75rem; opacity: 0.8;">${message}</div>` : ''}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Enable/disable shortcuts
 */
window.enableShortcuts = function() {
    shortcutsEnabled = true;
    console.log('✅ Keyboard shortcuts enabled');
};

window.disableShortcuts = function() {
    shortcutsEnabled = false;
    console.log('⏸️ Keyboard shortcuts disabled');
};

window.toggleShortcutsHelp = toggleShortcutsHelp;

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGlobalShortcuts);
} else {
    initializeGlobalShortcuts();
}

console.log('⌨️ Global Shortcuts Module: Loaded');
console.log('📋 Press H anytime to view all shortcuts');
