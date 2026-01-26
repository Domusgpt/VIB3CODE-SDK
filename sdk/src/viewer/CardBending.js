/**
 * CardBending.js - 3D Card Effect with 6D Rotation
 *
 * Creates a holographic trading card effect by:
 * - Applying CSS 3D transforms for physical card bend
 * - Mapping card tilt to 4D rotation planes
 * - Adding holographic shimmer based on viewing angle
 * - Creating parallax depth layers
 */

import { EventEmitter } from 'events';

/**
 * Bend presets for different card effects
 */
export const BendPreset = {
    NONE: 'none',
    SUBTLE: 'subtle',
    STANDARD: 'standard',
    DRAMATIC: 'dramatic',
    HOLOGRAPHIC: 'holographic'
};

/**
 * Preset configurations
 */
const BEND_CONFIGS = {
    [BendPreset.NONE]: {
        maxBend: 0,
        perspective: 1000,
        shimmerIntensity: 0,
        parallaxDepth: 0
    },
    [BendPreset.SUBTLE]: {
        maxBend: 5,
        perspective: 1500,
        shimmerIntensity: 0.3,
        parallaxDepth: 10
    },
    [BendPreset.STANDARD]: {
        maxBend: 15,
        perspective: 1000,
        shimmerIntensity: 0.5,
        parallaxDepth: 20
    },
    [BendPreset.DRAMATIC]: {
        maxBend: 30,
        perspective: 800,
        shimmerIntensity: 0.7,
        parallaxDepth: 40
    },
    [BendPreset.HOLOGRAPHIC]: {
        maxBend: 20,
        perspective: 1000,
        shimmerIntensity: 1.0,
        parallaxDepth: 30
    }
};

/**
 * CardBending - 3D Card Effect Controller
 */
export class CardBending extends EventEmitter {
    constructor(options = {}) {
        super();

        this.element = null;
        this.shimmerOverlay = null;
        this.parallaxLayers = [];

        // Bend state
        this.bendX = 0;  // Horizontal bend (-1 to 1)
        this.bendY = 0;  // Vertical bend (-1 to 1)
        this.bendZ = 0;  // Twist/rotation

        // Configuration
        this.preset = options.preset || BendPreset.STANDARD;
        this.config = { ...BEND_CONFIGS[this.preset], ...options };

        // 6D rotation mapping coefficients
        this.rotationMapping = {
            xy: options.xyCoeff || 0.2,
            xz: options.xzCoeff || 0.3,
            yz: options.yzCoeff || 0.3,
            xw: options.xwCoeff || 0.5,
            yw: options.ywCoeff || 0.5,
            zw: options.zwCoeff || 0.1
        };

        // Shimmer colors for holographic effect
        this.shimmerColors = options.shimmerColors || [
            'rgba(255, 0, 128, 0.3)',
            'rgba(128, 0, 255, 0.3)',
            'rgba(0, 255, 255, 0.3)',
            'rgba(255, 255, 0, 0.3)'
        ];

        // Animation state
        this.isAnimating = false;
        this._animationFrame = null;
        this._targetBend = { x: 0, y: 0, z: 0 };
        this._smoothing = options.smoothing || 0.1;

        // Bind methods
        this._animate = this._animate.bind(this);
    }

    /**
     * Initialize card bending on an element
     */
    initialize(element) {
        this.element = element;

        // Set up perspective container
        if (element.parentElement) {
            element.parentElement.style.perspective = `${this.config.perspective}px`;
            element.parentElement.style.perspectiveOrigin = '50% 50%';
        }

        // Apply base styles
        Object.assign(element.style, {
            transformStyle: 'preserve-3d',
            transition: 'none',
            willChange: 'transform'
        });

        // Create shimmer overlay
        this._createShimmerOverlay();

        // Start animation loop
        this._startAnimation();

        this.emit('initialized');
        return this;
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this._stopAnimation();

        if (this.shimmerOverlay && this.shimmerOverlay.parentElement) {
            this.shimmerOverlay.parentElement.removeChild(this.shimmerOverlay);
        }

        this.parallaxLayers.forEach(layer => {
            if (layer.parentElement) {
                layer.parentElement.removeChild(layer);
            }
        });

        this.element = null;
        this.shimmerOverlay = null;
        this.parallaxLayers = [];

        this.emit('disposed');
    }

    /**
     * Set bend preset
     */
    setPreset(preset) {
        if (BEND_CONFIGS[preset]) {
            this.preset = preset;
            this.config = { ...BEND_CONFIGS[preset] };
            this._updateShimmer();
            this.emit('presetChanged', preset);
        }
    }

    /**
     * Set bend values directly
     */
    setBend(x, y, z = 0) {
        this._targetBend.x = Math.max(-1, Math.min(1, x));
        this._targetBend.y = Math.max(-1, Math.min(1, y));
        this._targetBend.z = Math.max(-1, Math.min(1, z));
    }

    /**
     * Set bend from mouse/touch position relative to element
     */
    setBendFromPosition(clientX, clientY, rect = null) {
        if (!this.element) return;

        rect = rect || this.element.getBoundingClientRect();

        // Normalize position to -1 to 1
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((clientY - rect.top) / rect.height) * 2 - 1;

        this.setBend(-y * 0.8, x * 0.8, 0);
    }

    /**
     * Set bend from device orientation
     */
    setBendFromOrientation(beta, gamma) {
        // Beta: front-to-back tilt (-180 to 180), Gamma: left-to-right (-90 to 90)
        const normalizedBeta = Math.max(-1, Math.min(1, beta / 45));
        const normalizedGamma = Math.max(-1, Math.min(1, gamma / 45));

        this.setBend(normalizedBeta, normalizedGamma, 0);
    }

    /**
     * Get current 6D rotation values based on card bend
     */
    get6DRotation() {
        const { xy, xz, yz, xw, yw, zw } = this.rotationMapping;

        return {
            xy: this.bendZ * xy * Math.PI,
            xz: this.bendY * xz * Math.PI,
            yz: this.bendX * yz * Math.PI,
            xw: this.bendY * xw * Math.PI,
            yw: this.bendX * yw * Math.PI,
            zw: (this.bendX * this.bendY) * zw * Math.PI
        };
    }

    /**
     * Create the shimmer overlay element
     */
    _createShimmerOverlay() {
        if (!this.element) return;

        this.shimmerOverlay = document.createElement('div');
        Object.assign(this.shimmerOverlay.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
            opacity: '0',
            background: 'linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)',
            backgroundSize: '200% 200%',
            zIndex: '10'
        });

        this.element.style.position = 'relative';
        this.element.appendChild(this.shimmerOverlay);
    }

    /**
     * Create parallax depth layers
     */
    createParallaxLayers(count = 3) {
        if (!this.element) return;

        this.parallaxLayers = [];

        for (let i = 0; i < count; i++) {
            const layer = document.createElement('div');
            Object.assign(layer.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                transformStyle: 'preserve-3d',
                zIndex: String(i)
            });

            this.parallaxLayers.push(layer);
            this.element.appendChild(layer);
        }

        return this.parallaxLayers;
    }

    /**
     * Start animation loop
     */
    _startAnimation() {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this._animate();
    }

    /**
     * Stop animation loop
     */
    _stopAnimation() {
        this.isAnimating = false;
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
    }

    /**
     * Animation loop
     */
    _animate() {
        if (!this.isAnimating) return;

        // Smooth interpolation
        this.bendX += (this._targetBend.x - this.bendX) * this._smoothing;
        this.bendY += (this._targetBend.y - this.bendY) * this._smoothing;
        this.bendZ += (this._targetBend.z - this.bendZ) * this._smoothing;

        // Apply transforms
        this._applyTransform();
        this._updateShimmer();
        this._updateParallax();

        // Emit update
        this.emit('update', {
            bendX: this.bendX,
            bendY: this.bendY,
            bendZ: this.bendZ,
            rotation6D: this.get6DRotation()
        });

        this._animationFrame = requestAnimationFrame(this._animate);
    }

    /**
     * Apply CSS transform to element
     */
    _applyTransform() {
        if (!this.element) return;

        const { maxBend } = this.config;

        const rotateX = this.bendX * maxBend;
        const rotateY = this.bendY * maxBend;
        const rotateZ = this.bendZ * maxBend * 0.5;

        // Calculate subtle scale based on tilt (cards appear closer when tilted toward viewer)
        const tiltMagnitude = Math.sqrt(this.bendX ** 2 + this.bendY ** 2);
        const scale = 1 + tiltMagnitude * 0.02;

        this.element.style.transform = `
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            rotateZ(${rotateZ}deg)
            scale(${scale})
        `;
    }

    /**
     * Update shimmer effect
     */
    _updateShimmer() {
        if (!this.shimmerOverlay) return;

        const { shimmerIntensity } = this.config;

        // Calculate shimmer position based on bend
        const shimmerX = 50 + this.bendY * 50;
        const shimmerY = 50 + this.bendX * 50;

        // Calculate shimmer hue based on angle
        const angle = Math.atan2(this.bendY, this.bendX);
        const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;

        // Create holographic gradient
        const gradient = `
            linear-gradient(
                ${45 + this.bendY * 30}deg,
                transparent 20%,
                hsla(${hue}, 100%, 70%, ${shimmerIntensity * 0.3}) 40%,
                hsla(${(hue + 60) % 360}, 100%, 70%, ${shimmerIntensity * 0.5}) 50%,
                hsla(${(hue + 120) % 360}, 100%, 70%, ${shimmerIntensity * 0.3}) 60%,
                transparent 80%
            )
        `;

        this.shimmerOverlay.style.background = gradient;
        this.shimmerOverlay.style.backgroundPosition = `${shimmerX}% ${shimmerY}%`;
        this.shimmerOverlay.style.opacity = String(shimmerIntensity * Math.min(1, Math.sqrt(this.bendX ** 2 + this.bendY ** 2) * 2));
    }

    /**
     * Update parallax layers
     */
    _updateParallax() {
        if (this.parallaxLayers.length === 0) return;

        const { parallaxDepth } = this.config;

        this.parallaxLayers.forEach((layer, index) => {
            const depth = (index + 1) / this.parallaxLayers.length;
            const offsetX = this.bendY * parallaxDepth * depth;
            const offsetY = this.bendX * parallaxDepth * depth;
            const offsetZ = depth * 10;

            layer.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${offsetZ}px)`;
        });
    }

    /**
     * Apply a bend animation sequence
     */
    async animateBend(keyframes, duration = 1000) {
        const startTime = performance.now();
        const startBend = { x: this.bendX, y: this.bendY, z: this.bendZ };

        return new Promise(resolve => {
            const animate = (time) => {
                const progress = Math.min(1, (time - startTime) / duration);

                // Find current keyframe
                let frame = keyframes[0];
                for (let i = 0; i < keyframes.length - 1; i++) {
                    const nextFrame = keyframes[i + 1];
                    if (progress >= keyframes[i].time && progress <= nextFrame.time) {
                        const localProgress = (progress - keyframes[i].time) / (nextFrame.time - keyframes[i].time);
                        frame = {
                            x: keyframes[i].x + (nextFrame.x - keyframes[i].x) * localProgress,
                            y: keyframes[i].y + (nextFrame.y - keyframes[i].y) * localProgress,
                            z: (keyframes[i].z || 0) + ((nextFrame.z || 0) - (keyframes[i].z || 0)) * localProgress
                        };
                        break;
                    }
                }

                this._targetBend.x = frame.x;
                this._targetBend.y = frame.y;
                this._targetBend.z = frame.z || 0;

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    resolve();
                }
            };

            requestAnimationFrame(animate);
        });
    }

    /**
     * Play a holographic showcase animation
     */
    async playShowcaseAnimation(duration = 3000) {
        const keyframes = [
            { time: 0, x: 0, y: 0, z: 0 },
            { time: 0.2, x: 0.5, y: -0.3, z: 0 },
            { time: 0.4, x: -0.3, y: 0.5, z: 0.1 },
            { time: 0.6, x: -0.5, y: -0.4, z: -0.1 },
            { time: 0.8, x: 0.4, y: 0.3, z: 0 },
            { time: 1, x: 0, y: 0, z: 0 }
        ];

        return this.animateBend(keyframes, duration);
    }

    /**
     * Serialize current state
     */
    toJSON() {
        return {
            bendX: this.bendX,
            bendY: this.bendY,
            bendZ: this.bendZ,
            preset: this.preset,
            config: this.config,
            rotationMapping: this.rotationMapping,
            rotation6D: this.get6DRotation()
        };
    }

    /**
     * Restore from serialized state
     */
    fromJSON(data) {
        if (data.preset) this.setPreset(data.preset);
        if (data.config) this.config = { ...this.config, ...data.config };
        if (data.rotationMapping) this.rotationMapping = { ...data.rotationMapping };
        if (typeof data.bendX === 'number') this.setBend(data.bendX, data.bendY, data.bendZ);
    }
}

export default CardBending;
