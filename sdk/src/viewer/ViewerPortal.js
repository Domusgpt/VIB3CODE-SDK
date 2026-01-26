/**
 * ViewerPortal.js - Immersive Fullscreen 4D Visualization Viewer
 *
 * Provides an immersive viewing experience with:
 * - Fullscreen mode with escape handling
 * - Device orientation (gyroscope) control
 * - Touch/mouse gesture rotation
 * - Card bending 3D effect
 * - Screenshot and trading card export
 */

import { EventEmitter } from 'events';

/**
 * Viewer display modes
 */
export const ViewerMode = {
    NORMAL: 'normal',
    FULLSCREEN: 'fullscreen',
    IMMERSIVE: 'immersive',
    CARD: 'card'
};

/**
 * Projection modes for 4D viewing
 */
export const ProjectionMode = {
    PERSPECTIVE: 'perspective',
    STEREOGRAPHIC: 'stereographic',
    ORTHOGRAPHIC: 'orthographic',
    CROSS_SECTION: 'cross_section'
};

/**
 * ViewerPortal - Immersive 4D Visualization Viewer
 */
export class ViewerPortal extends EventEmitter {
    constructor(options = {}) {
        super();

        this.container = null;
        this.canvas = null;
        this.engine = null;
        this.mode = ViewerMode.NORMAL;
        this.projectionMode = ProjectionMode.PERSPECTIVE;
        this.isFullscreen = false;
        this.gyroscopeEnabled = false;

        this.rotation = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
        this.velocity = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };

        this.damping = options.damping || 0.95;
        this.sensitivity = options.sensitivity || 0.01;
        this.autoRotate = options.autoRotate || false;
        this.autoRotateSpeed = options.autoRotateSpeed || 0.005;
        this.autoRotatePlanes = options.autoRotatePlanes || ['xw', 'yw'];
        this.cardBend = { x: 0, y: 0 };

        this._animationFrame = null;
        this._touch = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0 };
        this._deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };

        this._onResize = this._onResize.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onDeviceOrientation = this._onDeviceOrientation.bind(this);
        this._onFullscreenChange = this._onFullscreenChange.bind(this);
        this._animate = this._animate.bind(this);
    }

    initialize(container, engine) {
        this.container = container;
        this.engine = engine;

        this.canvas = container.querySelector('canvas');
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            container.appendChild(this.canvas);
        }

        this._applyStyles();
        this._addEventListeners();
        this._startAnimation();
        this.emit('initialized');
        return this;
    }

    dispose() {
        this._stopAnimation();
        this._removeEventListeners();
        this.emit('disposed');
    }

    async enterFullscreen() {
        if (!this.container) return;
        try {
            await (this.container.requestFullscreen?.() ||
                   this.container.webkitRequestFullscreen?.() ||
                   this.container.mozRequestFullScreen?.());
            this.isFullscreen = true;
            this.mode = ViewerMode.FULLSCREEN;
            this.emit('fullscreen', true);
        } catch (err) {
            console.warn('Fullscreen not available:', err);
        }
    }

    async exitFullscreen() {
        try {
            await (document.exitFullscreen?.() ||
                   document.webkitExitFullscreen?.() ||
                   document.mozCancelFullScreen?.());
            this.isFullscreen = false;
            this.mode = ViewerMode.NORMAL;
            this.emit('fullscreen', false);
        } catch (err) {
            console.warn('Exit fullscreen failed:', err);
        }
    }

    toggleFullscreen() {
        this.isFullscreen ? this.exitFullscreen() : this.enterFullscreen();
    }

    async enterImmersiveMode() {
        await this.enterFullscreen();
        await this.enableGyroscope();
        this.mode = ViewerMode.IMMERSIVE;
        this.emit('immersive', true);
    }

    async enableGyroscope() {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') return false;
            } catch (err) {
                console.warn('Gyroscope permission denied:', err);
                return false;
            }
        }
        window.addEventListener('deviceorientation', this._onDeviceOrientation);
        this.gyroscopeEnabled = true;
        this.emit('gyroscope', true);
        return true;
    }

    disableGyroscope() {
        window.removeEventListener('deviceorientation', this._onDeviceOrientation);
        this.gyroscopeEnabled = false;
        this.emit('gyroscope', false);
    }

    setRotation(plane, angle) {
        if (this.rotation.hasOwnProperty(plane)) {
            this.rotation[plane] = angle;
            this._updateEngine();
        }
    }

    setAllRotations(rotations) {
        Object.assign(this.rotation, rotations);
        this._updateEngine();
    }

    resetRotation() {
        this.rotation = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
        this.velocity = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
        this._updateEngine();
        this.emit('reset');
    }

    setProjectionMode(mode) {
        this.projectionMode = mode;
        this.emit('projectionMode', mode);
    }

    captureFrame(format = 'png', quality = 0.92) {
        if (!this.canvas) return null;
        return this.canvas.toDataURL(\`image/\${format}\`, quality);
    }

    downloadFrame(filename = 'vib3-capture', format = 'png') {
        const dataUrl = this.captureFrame(format);
        if (!dataUrl) return;
        const link = document.createElement('a');
        link.download = \`\${filename}.\${format}\`;
        link.href = dataUrl;
        link.click();
    }

    _applyStyles() {
        if (!this.container) return;
        Object.assign(this.container.style, {
            position: 'relative', overflow: 'hidden',
            touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none'
        });
        if (this.canvas) {
            Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%' });
        }
    }

    _addEventListeners() {
        window.addEventListener('resize', this._onResize);
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('fullscreenchange', this._onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
        if (this.container) {
            this.container.addEventListener('mousedown', this._onMouseDown);
            this.container.addEventListener('touchstart', this._onTouchStart, { passive: false });
        }
    }

    _removeEventListeners() {
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('fullscreenchange', this._onFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
        if (this.container) {
            this.container.removeEventListener('mousedown', this._onMouseDown);
            this.container.removeEventListener('touchstart', this._onTouchStart);
        }
        this.disableGyroscope();
    }

    _onResize() {
        if (this.canvas && this.container) {
            const rect = this.container.getBoundingClientRect();
            this.canvas.width = rect.width * window.devicePixelRatio;
            this.canvas.height = rect.height * window.devicePixelRatio;
        }
        this.emit('resize');
    }

    _onKeyDown(event) {
        switch (event.key) {
            case 'Escape': if (this.isFullscreen) this.exitFullscreen(); break;
            case 'f': case 'F': this.toggleFullscreen(); break;
            case 'r': case 'R': this.resetRotation(); break;
            case 's': case 'S':
                if (event.ctrlKey || event.metaKey) { event.preventDefault(); this.downloadFrame(); }
                break;
            case ' ': this.autoRotate = !this.autoRotate; this.emit('autoRotate', this.autoRotate); break;
        }
    }

    _onMouseDown(event) {
        this._touch.active = true;
        this._touch.startX = this._touch.lastX = event.clientX;
        this._touch.startY = this._touch.lastY = event.clientY;
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
        this.emit('interactionStart');
    }

    _onMouseMove(event) {
        if (!this._touch.active) return;
        const deltaX = event.clientX - this._touch.lastX;
        const deltaY = event.clientY - this._touch.lastY;
        this._touch.lastX = event.clientX;
        this._touch.lastY = event.clientY;
        this.velocity.xw += deltaX * this.sensitivity;
        this.velocity.yw += deltaY * this.sensitivity;
        this.cardBend.x = (event.clientX - this._touch.startX) * 0.1;
        this.cardBend.y = (event.clientY - this._touch.startY) * 0.1;
        this.emit('interaction', { deltaX, deltaY });
    }

    _onMouseUp() {
        this._touch.active = false;
        this.cardBend = { x: 0, y: 0 };
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        this.emit('interactionEnd');
    }

    _onTouchStart(event) {
        event.preventDefault();
        const touch = event.touches[0];
        this._touch.active = true;
        this._touch.startX = this._touch.lastX = touch.clientX;
        this._touch.startY = this._touch.lastY = touch.clientY;
        document.addEventListener('touchmove', this._onTouchMove, { passive: false });
        document.addEventListener('touchend', this._onTouchEnd);
        this.emit('interactionStart');
    }

    _onTouchMove(event) {
        event.preventDefault();
        if (!this._touch.active) return;
        const touch = event.touches[0];
        const deltaX = touch.clientX - this._touch.lastX;
        const deltaY = touch.clientY - this._touch.lastY;
        this._touch.lastX = touch.clientX;
        this._touch.lastY = touch.clientY;
        this.velocity.xw += deltaX * this.sensitivity;
        this.velocity.yw += deltaY * this.sensitivity;
        this.cardBend.x = (touch.clientX - this._touch.startX) * 0.1;
        this.cardBend.y = (touch.clientY - this._touch.startY) * 0.1;
        this.emit('interaction', { deltaX, deltaY });
    }

    _onTouchEnd() {
        this._touch.active = false;
        this.cardBend = { x: 0, y: 0 };
        document.removeEventListener('touchmove', this._onTouchMove);
        document.removeEventListener('touchend', this._onTouchEnd);
        this.emit('interactionEnd');
    }

    _onDeviceOrientation(event) {
        const { alpha, beta, gamma } = event;
        const alphaRad = (alpha || 0) * Math.PI / 180;
        const betaRad = (beta || 0) * Math.PI / 180;
        const gammaRad = (gamma || 0) * Math.PI / 180;
        const smooth = 0.1;
        this.rotation.zw += (alphaRad * 0.5 - this.rotation.zw) * smooth;
        this.rotation.yw += (betaRad * 0.3 - this.rotation.yw) * smooth;
        this.rotation.xw += (gammaRad * 0.3 - this.rotation.xw) * smooth;
        this._deviceOrientation = { alpha, beta, gamma };
        this.emit('deviceOrientation', this._deviceOrientation);
    }

    _onFullscreenChange() {
        this.isFullscreen = !!document.fullscreenElement || !!document.webkitFullscreenElement;
        if (!this.isFullscreen) {
            this.mode = ViewerMode.NORMAL;
            this.emit('fullscreen', false);
        }
    }

    _startAnimation() { this._animate(); }

    _stopAnimation() {
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }

    _animate() {
        for (const plane of Object.keys(this.velocity)) {
            this.rotation[plane] += this.velocity[plane];
            this.velocity[plane] *= this.damping;
            if (Math.abs(this.velocity[plane]) < 0.0001) this.velocity[plane] = 0;
        }
        if (this.autoRotate && !this._touch.active) {
            for (const plane of this.autoRotatePlanes) {
                this.rotation[plane] += this.autoRotateSpeed;
            }
        }
        this._updateEngine();
        this._animationFrame = requestAnimationFrame(this._animate);
    }

    _updateEngine() {
        if (this.engine?.setRotation) this.engine.setRotation(this.rotation);
        this.emit('update', this.rotation);
    }
}

export default ViewerPortal;
