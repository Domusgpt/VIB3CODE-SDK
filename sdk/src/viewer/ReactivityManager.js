/**
 * ReactivityManager.js - Unified Input Handler for 4D Visualization
 *
 * Manages multiple input sources and maps them to 4D rotation:
 * - Mouse movement and drag
 * - Touch gestures (pan, pinch, rotate)
 * - Device orientation (gyroscope/accelerometer)
 * - Keyboard shortcuts
 * - Gamepad input
 */

import { EventEmitter } from 'events';

/**
 * Input source types
 */
export const InputSource = {
    MOUSE: 'mouse',
    TOUCH: 'touch',
    GYROSCOPE: 'gyroscope',
    KEYBOARD: 'keyboard',
    GAMEPAD: 'gamepad'
};

/**
 * Input mapping presets
 */
export const InputPreset = {
    DEFAULT: 'default',
    MOBILE: 'mobile',
    DESKTOP: 'desktop',
    VR: 'vr'
};

/**
 * ReactivityManager - Unified input handling
 */
export class ReactivityManager extends EventEmitter {
    constructor(options = {}) {
        super();

        /** @type {HTMLElement|null} */
        this.element = null;

        /** @type {Set<string>} Active input sources */
        this.activeSources = new Set();

        /** @type {object} Current input state */
        this.state = {
            // Mouse/touch position (normalized -1 to 1)
            pointerX: 0,
            pointerY: 0,
            // Pointer delta
            deltaX: 0,
            deltaY: 0,
            // Multi-touch
            pinchScale: 1,
            rotationAngle: 0,
            // Device orientation
            alpha: 0,  // Compass direction (0-360)
            beta: 0,   // Front/back tilt (-180 to 180)
            gamma: 0,  // Left/right tilt (-90 to 90)
            // Keyboard
            keys: new Set(),
            // Gamepad axes
            gamepadAxes: [0, 0, 0, 0]
        };

        /** @type {object} Rotation output (6 planes) */
        this.rotation = {
            xy: 0, xz: 0, yz: 0,
            xw: 0, yw: 0, zw: 0
        };

        /** @type {object} Configuration */
        this.config = {
            // Sensitivity multipliers
            mouseSensitivity: options.mouseSensitivity || 0.005,
            touchSensitivity: options.touchSensitivity || 0.008,
            gyroSensitivity: options.gyroSensitivity || 0.02,
            keyboardSpeed: options.keyboardSpeed || 0.02,
            gamepadSensitivity: options.gamepadSensitivity || 0.03,
            // Damping
            damping: options.damping || 0.92,
            // Deadzone for gamepad
            deadzone: options.deadzone || 0.1,
            // Input mapping
            mapping: options.mapping || this._getDefaultMapping()
        };

        /** @type {object} Velocity for momentum */
        this._velocity = {
            xy: 0, xz: 0, yz: 0,
            xw: 0, yw: 0, zw: 0
        };

        /** @type {object} Touch tracking */
        this._touches = new Map();
        this._initialPinchDistance = 0;
        this._initialRotationAngle = 0;

        /** @type {number|null} Gamepad polling interval */
        this._gamepadInterval = null;

        /** @type {number|null} Animation frame */
        this._animationFrame = null;

        // Bind methods
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onDeviceOrientation = this._onDeviceOrientation.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._pollGamepad = this._pollGamepad.bind(this);
        this._update = this._update.bind(this);
    }

    /**
     * Initialize with target element
     * @param {HTMLElement} element
     */
    initialize(element) {
        this.element = element;
        this._addEventListeners();
        this._startUpdateLoop();
        this.emit('initialized');
        return this;
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this._stopUpdateLoop();
        this._removeEventListeners();
        this.emit('disposed');
    }

    /**
     * Enable specific input source
     * @param {string} source - Input source type
     */
    async enableSource(source) {
        switch (source) {
            case InputSource.MOUSE:
                this.activeSources.add(source);
                break;

            case InputSource.TOUCH:
                this.activeSources.add(source);
                break;

            case InputSource.GYROSCOPE:
                const granted = await this._requestGyroscopePermission();
                if (granted) {
                    window.addEventListener('deviceorientation', this._onDeviceOrientation);
                    this.activeSources.add(source);
                }
                break;

            case InputSource.KEYBOARD:
                this.activeSources.add(source);
                break;

            case InputSource.GAMEPAD:
                this._startGamepadPolling();
                this.activeSources.add(source);
                break;
        }

        this.emit('sourceEnabled', source);
        return this.activeSources.has(source);
    }

    /**
     * Disable specific input source
     * @param {string} source
     */
    disableSource(source) {
        switch (source) {
            case InputSource.GYROSCOPE:
                window.removeEventListener('deviceorientation', this._onDeviceOrientation);
                break;
            case InputSource.GAMEPAD:
                this._stopGamepadPolling();
                break;
        }

        this.activeSources.delete(source);
        this.emit('sourceDisabled', source);
    }

    /**
     * Set input preset
     * @param {string} preset
     */
    setPreset(preset) {
        switch (preset) {
            case InputPreset.MOBILE:
                this.config.mapping = this._getMobileMapping();
                break;
            case InputPreset.DESKTOP:
                this.config.mapping = this._getDesktopMapping();
                break;
            case InputPreset.VR:
                this.config.mapping = this._getVRMapping();
                break;
            default:
                this.config.mapping = this._getDefaultMapping();
        }
        this.emit('presetChanged', preset);
    }

    /**
     * Get current rotation values
     */
    getRotation() {
        return { ...this.rotation };
    }

    /**
     * Reset all input state
     */
    reset() {
        this.rotation = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
        this._velocity = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
        this.state.keys.clear();
        this.emit('reset');
    }

    /**
     * Default input mapping
     * @private
     */
    _getDefaultMapping() {
        return {
            mouse: {
                dragX: 'xw',   // Horizontal drag -> XW rotation
                dragY: 'yw',   // Vertical drag -> YW rotation
                wheel: 'zw'    // Scroll -> ZW rotation
            },
            touch: {
                panX: 'xw',
                panY: 'yw',
                pinch: 'zw',
                rotate: 'xy'
            },
            gyro: {
                alpha: 'xy',   // Compass -> XY rotation
                beta: 'yw',    // Front/back -> YW rotation
                gamma: 'xw'    // Left/right -> XW rotation
            },
            keyboard: {
                'ArrowLeft': { plane: 'xw', direction: -1 },
                'ArrowRight': { plane: 'xw', direction: 1 },
                'ArrowUp': { plane: 'yw', direction: -1 },
                'ArrowDown': { plane: 'yw', direction: 1 },
                'KeyQ': { plane: 'xy', direction: -1 },
                'KeyE': { plane: 'xy', direction: 1 },
                'KeyA': { plane: 'xz', direction: -1 },
                'KeyD': { plane: 'xz', direction: 1 },
                'KeyW': { plane: 'yz', direction: -1 },
                'KeyS': { plane: 'yz', direction: 1 },
                'KeyZ': { plane: 'zw', direction: -1 },
                'KeyX': { plane: 'zw', direction: 1 }
            },
            gamepad: {
                leftStickX: 'xw',
                leftStickY: 'yw',
                rightStickX: 'xy',
                rightStickY: 'zw'
            }
        };
    }

    _getMobileMapping() {
        return {
            ...this._getDefaultMapping(),
            touch: {
                panX: 'xw',
                panY: 'yw',
                pinch: 'zw',
                rotate: 'xy'
            }
        };
    }

    _getDesktopMapping() {
        return this._getDefaultMapping();
    }

    _getVRMapping() {
        return {
            ...this._getDefaultMapping(),
            gyro: {
                alpha: 'xy',
                beta: 'xw',
                gamma: 'yw'
            }
        };
    }

    _addEventListeners() {
        if (!this.element) return;

        // Mouse
        this.element.addEventListener('mousedown', this._onMouseDown);
        this.element.addEventListener('wheel', this._onWheel, { passive: false });

        // Touch
        this.element.addEventListener('touchstart', this._onTouchStart, { passive: false });

        // Keyboard
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    _removeEventListeners() {
        if (this.element) {
            this.element.removeEventListener('mousedown', this._onMouseDown);
            this.element.removeEventListener('wheel', this._onWheel);
            this.element.removeEventListener('touchstart', this._onTouchStart);
        }

        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('deviceorientation', this._onDeviceOrientation);

        this._stopGamepadPolling();
    }

    _onMouseDown(event) {
        if (!this.activeSources.has(InputSource.MOUSE)) {
            this.activeSources.add(InputSource.MOUSE);
        }

        this.state.pointerX = event.clientX;
        this.state.pointerY = event.clientY;

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        this.emit('pointerDown', { x: event.clientX, y: event.clientY });
    }

    _onMouseMove(event) {
        const deltaX = event.clientX - this.state.pointerX;
        const deltaY = event.clientY - this.state.pointerY;

        this.state.pointerX = event.clientX;
        this.state.pointerY = event.clientY;
        this.state.deltaX = deltaX;
        this.state.deltaY = deltaY;

        const mapping = this.config.mapping.mouse;
        this._velocity[mapping.dragX] += deltaX * this.config.mouseSensitivity;
        this._velocity[mapping.dragY] += deltaY * this.config.mouseSensitivity;

        this.emit('pointerMove', { x: event.clientX, y: event.clientY, deltaX, deltaY });
    }

    _onMouseUp() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this.emit('pointerUp');
    }

    _onWheel(event) {
        event.preventDefault();
        const mapping = this.config.mapping.mouse;
        this._velocity[mapping.wheel] += event.deltaY * 0.001;
        this.emit('wheel', event.deltaY);
    }

    _onTouchStart(event) {
        event.preventDefault();

        for (const touch of event.changedTouches) {
            this._touches.set(touch.identifier, {
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: touch.clientX,
                currentY: touch.clientY
            });
        }

        if (this._touches.size === 2) {
            const [t1, t2] = Array.from(this._touches.values());
            this._initialPinchDistance = Math.hypot(
                t2.currentX - t1.currentX,
                t2.currentY - t1.currentY
            );
            this._initialRotationAngle = Math.atan2(
                t2.currentY - t1.currentY,
                t2.currentX - t1.currentX
            );
        }

        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd);

        this.emit('touchStart', { count: this._touches.size });
    }

    _onTouchMove(event) {
        event.preventDefault();

        for (const touch of event.changedTouches) {
            const tracked = this._touches.get(touch.identifier);
            if (tracked) {
                tracked.currentX = touch.clientX;
                tracked.currentY = touch.clientY;
            }
        }

        const mapping = this.config.mapping.touch;

        if (this._touches.size === 1) {
            // Single finger pan
            const [t] = Array.from(this._touches.values());
            const deltaX = t.currentX - t.startX;
            const deltaY = t.currentY - t.startY;
            t.startX = t.currentX;
            t.startY = t.currentY;

            this._velocity[mapping.panX] += deltaX * this.config.touchSensitivity;
            this._velocity[mapping.panY] += deltaY * this.config.touchSensitivity;
        } else if (this._touches.size === 2) {
            // Two finger pinch/rotate
            const [t1, t2] = Array.from(this._touches.values());

            const distance = Math.hypot(
                t2.currentX - t1.currentX,
                t2.currentY - t1.currentY
            );
            const scale = distance / this._initialPinchDistance;
            this.state.pinchScale = scale;

            const angle = Math.atan2(
                t2.currentY - t1.currentY,
                t2.currentX - t1.currentX
            );
            const deltaAngle = angle - this._initialRotationAngle;
            this.state.rotationAngle = deltaAngle;

            this._velocity[mapping.pinch] += (scale - 1) * 0.1;
            this._velocity[mapping.rotate] += deltaAngle * 0.5;

            this._initialPinchDistance = distance;
            this._initialRotationAngle = angle;
        }

        this.emit('touchMove', { count: this._touches.size });
    }

    _onTouchEnd(event) {
        for (const touch of event.changedTouches) {
            this._touches.delete(touch.identifier);
        }

        if (this._touches.size === 0) {
            document.removeEventListener('touchmove', this._onTouchMove);
            document.removeEventListener('touchend', this._onTouchEnd);
        }

        this.emit('touchEnd', { count: this._touches.size });
    }

    _onDeviceOrientation(event) {
        const { alpha, beta, gamma } = event;

        this.state.alpha = alpha || 0;
        this.state.beta = beta || 0;
        this.state.gamma = gamma || 0;

        const mapping = this.config.mapping.gyro;
        const sens = this.config.gyroSensitivity;

        // Smooth rotation from device orientation
        const targetXY = (alpha || 0) * Math.PI / 180 * sens;
        const targetYW = (beta || 0) * Math.PI / 180 * sens;
        const targetXW = (gamma || 0) * Math.PI / 180 * sens;

        this._velocity[mapping.alpha] += (targetXY - this.rotation[mapping.alpha]) * 0.1;
        this._velocity[mapping.beta] += (targetYW - this.rotation[mapping.beta]) * 0.1;
        this._velocity[mapping.gamma] += (targetXW - this.rotation[mapping.gamma]) * 0.1;

        this.emit('deviceOrientation', { alpha, beta, gamma });
    }

    _onKeyDown(event) {
        this.state.keys.add(event.code);
        this.emit('keyDown', event.code);
    }

    _onKeyUp(event) {
        this.state.keys.delete(event.code);
        this.emit('keyUp', event.code);
    }

    async _requestGyroscopePermission() {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                return permission === 'granted';
            } catch {
                return false;
            }
        }
        return true;
    }

    _startGamepadPolling() {
        this._gamepadInterval = setInterval(this._pollGamepad, 16);
    }

    _stopGamepadPolling() {
        if (this._gamepadInterval) {
            clearInterval(this._gamepadInterval);
            this._gamepadInterval = null;
        }
    }

    _pollGamepad() {
        const gamepads = navigator.getGamepads?.() || [];
        const gamepad = gamepads[0];

        if (gamepad) {
            const [lx, ly, rx, ry] = gamepad.axes;
            const mapping = this.config.mapping.gamepad;
            const sens = this.config.gamepadSensitivity;
            const dz = this.config.deadzone;

            const applyDeadzone = (v) => Math.abs(v) < dz ? 0 : v;

            this._velocity[mapping.leftStickX] += applyDeadzone(lx) * sens;
            this._velocity[mapping.leftStickY] += applyDeadzone(ly) * sens;
            this._velocity[mapping.rightStickX] += applyDeadzone(rx) * sens;
            this._velocity[mapping.rightStickY] += applyDeadzone(ry) * sens;

            this.state.gamepadAxes = [lx, ly, rx, ry];
        }
    }

    _startUpdateLoop() {
        this._update();
    }

    _stopUpdateLoop() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }

    _update() {
        // Apply keyboard input
        const keyMapping = this.config.mapping.keyboard;
        for (const [code, action] of Object.entries(keyMapping)) {
            if (this.state.keys.has(code)) {
                this._velocity[action.plane] += action.direction * this.config.keyboardSpeed;
            }
        }

        // Apply velocity with damping
        for (const plane of Object.keys(this._velocity)) {
            this.rotation[plane] += this._velocity[plane];
            this._velocity[plane] *= this.config.damping;

            if (Math.abs(this._velocity[plane]) < 0.0001) {
                this._velocity[plane] = 0;
            }
        }

        this.emit('update', this.rotation);
        this._animationFrame = requestAnimationFrame(this._update);
    }
}

export default ReactivityManager;
