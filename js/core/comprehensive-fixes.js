/**
 * VIB34D Comprehensive Fixes Module
 * Fixes:
 * 1. Canvas black space issue (forced resize on bezel state change)
 * 2. Slider animations when randomized
 * 3. Gallery save functionality
 */

console.log('🔧 Comprehensive Fixes Module: Loading...');

// ========================================
// FIX 1: Canvas Black Space (Forced Resize)
// ========================================

let bezelObserver = null;

function forceCanvasResize() {
    const canvasContainer = document.getElementById('canvasContainer');
    const controlPanel = document.getElementById('controlPanel');

    if (!canvasContainer || !controlPanel) return;

    const isCollapsed = controlPanel.classList.contains('collapsed');
    const headerHeight = 60; // Top bar height

    // Calculate proper bottom position
    let bottomPosition;
    if (isCollapsed) {
        bottomPosition = 52; // Collapsed bezel height
    } else {
        // Expanded bezel - use actual height
        const bezelHeight = controlPanel.offsetHeight;
        bottomPosition = bezelHeight;
    }

    console.log(`📐 Force canvas resize: ${isCollapsed ? 'collapsed' : 'expanded'}, bottom=${bottomPosition}px`);

    // Set canvas container dimensions
    canvasContainer.style.top = `${headerHeight}px`;
    canvasContainer.style.bottom = `${bottomPosition}px`;
    canvasContainer.style.left = '0';
    canvasContainer.style.right = '0';

    // Force immediate layout recalculation
    void canvasContainer.offsetHeight;

    // Get computed dimensions
    const rect = canvasContainer.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    console.log(`📐 Canvas container: ${width}x${height}px`);

    // Resize all canvases
    const allCanvases = canvasContainer.querySelectorAll('canvas');
    allCanvases.forEach(canvas => {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    });

    // Trigger engine resize
    if (window.vib34dApp && window.vib34dApp.currentEngine) {
        setTimeout(() => {
            if (window.vib34dApp.currentEngine.handleResize) {
                window.vib34dApp.currentEngine.handleResize(width, height);
            }
            if (window.vib34dApp.currentEngine.render) {
                window.vib34dApp.currentEngine.render();
            }
        }, 50);
    }
}

function initCanvasResizeObserver() {
    const controlPanel = document.getElementById('controlPanel');
    if (!controlPanel) {
        console.warn('⚠️ Control panel not found for resize observer');
        return;
    }

    // Use MutationObserver to watch for class changes
    bezelObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                console.log('🔄 Bezel class changed, forcing canvas resize...');
                setTimeout(forceCanvasResize, 100);
            }
        });
    });

    bezelObserver.observe(controlPanel, {
        attributes: true,
        attributeFilter: ['class']
    });

    console.log('✅ Canvas resize observer installed');

    // Initial resize
    setTimeout(forceCanvasResize, 500);
}

// Also handle window resize
let windowResizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(windowResizeTimeout);
    windowResizeTimeout = setTimeout(forceCanvasResize, 200);
});

// ========================================
// FIX 2: Slider Animations
// ========================================

function animateSlider(sliderId, targetValue, duration = 500) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;

    const startValue = parseFloat(slider.value);
    const endValue = parseFloat(targetValue);
    const startTime = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out-cubic)
        const eased = 1 - Math.pow(1 - progress, 3);

        // Calculate current value
        const currentValue = startValue + (endValue - startValue) * eased;

        // Update slider
        slider.value = currentValue;

        // Trigger input event to update display and engine
        const event = new Event('input', { bubbles: true });
        slider.dispatchEvent(event);

        // Continue animation
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

// Override updateParameter to add animation option
const originalUpdateParameter = window.updateParameter;

window.updateParameter = function(param, value, animate = false) {
    if (animate) {
        animateSlider(param, value);
    } else {
        if (originalUpdateParameter) {
            originalUpdateParameter(param, value);
        }
    }
};

// Override randomize functions to use animations
const originalRandomizeAll = window.randomizeAll;
const originalRandomizeEverything = window.randomizeEverything;

window.randomizeAll = function() {
    console.log('🎲 Randomizing with animations...');

    const params = [
        'rot4dXY', 'rot4dXZ', 'rot4dYZ',
        'rot4dXW', 'rot4dYW', 'rot4dZW',
        'gridDensity', 'morphFactor', 'chaos', 'speed',
        'hue', 'saturation', 'intensity'
    ];

    params.forEach((param, index) => {
        const slider = document.getElementById(param);
        if (!slider) return;

        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const randomValue = min + Math.random() * (max - min);

        // Stagger animations
        setTimeout(() => {
            animateSlider(param, randomValue, 800);
        }, index * 50);
    });

    console.log('✅ Animated randomization complete');
};

window.randomizeEverything = function() {
    console.log('🎯 Full randomize with animations...');

    // Random system (3 active - polychora is TBD)
    const systems = ['faceted', 'quantum', 'holographic'];
    const randomSystem = systems[Math.floor(Math.random() * systems.length)];

    if (window.switchSystem) {
        window.switchSystem(randomSystem);
    }

    // Random geometry (0-23)
    const randomGeometry = Math.floor(Math.random() * 24);
    setTimeout(() => {
        if (window.loadGeometryFromIndex) {
            window.loadGeometryFromIndex(randomGeometry);
        } else if (window.selectGeometry) {
            window.selectGeometry(randomGeometry);
        }
    }, 300);

    // Randomize all parameters with animation
    setTimeout(() => {
        window.randomizeAll();
    }, 600);

    console.log(`✅ Full randomization: ${randomSystem}, geometry ${randomGeometry}`);
};

// ========================================
// FIX 3: Gallery Save Functionality
// ========================================

// Override saveToGallery to ensure proper saving
const originalSaveToGallery = window.saveToGallery;

window.saveToGallery = function() {
    console.log('💾 Saving to gallery with fixes...');

    try {
        // Get current state
        const currentState = {
            system: window.currentSystem || 'faceted',
            parameters: window.userParameterState || {},
            timestamp: new Date().toISOString(),
            name: `${window.currentSystem || 'Unnamed'} - ${new Date().toLocaleString()}`
        };

        // Ensure geometry is included
        if (window.getGeometryInfo) {
            const geometryInfo = window.getGeometryInfo();
            currentState.parameters.geometry = geometryInfo.index;
            currentState.geometryName = geometryInfo.fullName;
        }

        // Generate unique ID
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const key = `vib34d-variation-${id}`;

        // Save to localStorage
        localStorage.setItem(key, JSON.stringify(currentState));

        console.log(`✅ Saved variation ${id}:`, currentState);
        console.log(`📦 LocalStorage key: ${key}`);

        // Show success notification
        showSaveNotification(`✅ Saved: ${currentState.name}`, 'success');

        // Verify save
        const verification = localStorage.getItem(key);
        if (verification) {
            console.log('✅ Save verified in localStorage');
        } else {
            console.error('❌ Save verification failed!');
        }

        return id;

    } catch (error) {
        console.error('❌ Save failed:', error);
        showSaveNotification(`❌ Save failed: ${error.message}`, 'error');
        return null;
    }
};

function showSaveNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, rgba(0, 255, 0, 0.95), rgba(0, 200, 100, 0.95))' : 'linear-gradient(135deg, rgba(255, 0, 0, 0.95), rgba(200, 0, 0, 0.95))'};
        color: ${type === 'success' ? '#000' : '#fff'};
        padding: 15px 25px;
        border-radius: 10px;
        font-family: 'Orbitron', monospace;
        font-weight: bold;
        font-size: 0.9rem;
        z-index: 10001;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOutRight {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Test localStorage on load
function testLocalStorage() {
    try {
        const testKey = 'vib34d-test';
        localStorage.setItem(testKey, 'test');
        const result = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);

        if (result === 'test') {
            console.log('✅ LocalStorage is working');
            return true;
        } else {
            console.error('❌ LocalStorage read/write mismatch');
            return false;
        }
    } catch (error) {
        console.error('❌ LocalStorage not available:', error);
        return false;
    }
}

// ========================================
// Initialize All Fixes
// ========================================

function initializeComprehensiveFixes() {
    console.log('🚀 Initializing Comprehensive Fixes...');

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyFixes);
    } else {
        applyFixes();
    }
}

function applyFixes() {
    // Test localStorage first
    const localStorageWorks = testLocalStorage();
    if (!localStorageWorks) {
        console.error('⚠️ LocalStorage is not working - save functionality will be limited');
    }

    // Apply fixes with delays
    setTimeout(() => {
        initCanvasResizeObserver();
        console.log('✅ Canvas resize observer initialized');
    }, 500);

    // List all saved variations on load
    setTimeout(() => {
        const savedKeys = Object.keys(localStorage).filter(key => key.startsWith('vib34d-variation-'));
        console.log(`📦 Found ${savedKeys.length} saved variations:`, savedKeys);
    }, 1000);

    console.log('✅ All comprehensive fixes applied');
}

// Initialize
initializeComprehensiveFixes();

// Export functions
if (typeof window !== 'undefined') {
    window.forceCanvasResize = forceCanvasResize;
    window.animateSlider = animateSlider;
    window.showSaveNotification = showSaveNotification;
}

console.log('🔧 Comprehensive Fixes Module: Loaded');
