/**
 * InscriptionChannel
 *
 * Maps semantic state, per-object identity, and audio input into
 * EdgeInscriptionLayer configurations. This is the "information channel"
 * layer — inscription patterns encode meaning rather than just aesthetics.
 *
 * Features:
 *   - **Per-object identity**: Each object gets a deterministic, visually
 *     distinct inscription pattern based on its ID
 *   - **Semantic states**: Objects can be in states (idle, active, damaged,
 *     powered, selected) that modify inscription appearance
 *   - **Audio-reactive mapping**: Bass/mid/high/energy drive 4D rotation,
 *     thickness, and glow parameters
 *   - **Transition system**: Smooth interpolation between state changes
 *   - **Priority system**: Higher-priority states override lower ones
 *
 * Usage:
 *   const channel = new InscriptionChannel();
 *   channel.setObjectState('hero', 'powered');
 *   channel.setAudio(0.8, 0.3, 0.5, 0.6);
 *   channel.update(deltaTime);
 *   const config = channel.getInscriptionConfig('hero');
 *   inscriptionLayer.setLayerConfig(0, config.layers[0]);
 */

/* ------------------------------------------------------------------ */
/*  Semantic State Presets                                              */
/* ------------------------------------------------------------------ */

/**
 * Each state defines how inscription layers should appear.
 * Properties modulate the base per-object identity config.
 */
const STATE_PRESETS = {
    idle: {
        priority: 0,
        opacityMultiplier: 0.3,
        thicknessMultiplier: 0.5,
        speedMultiplier: 0.5,
        glowIntensity: 0.1,
        colorShift: [0, 0, 0],        // No color shift
        rotationSpeed: 0.1,
        patternOverride: null,         // Use identity pattern
    },
    active: {
        priority: 1,
        opacityMultiplier: 0.8,
        thicknessMultiplier: 1.0,
        speedMultiplier: 1.0,
        glowIntensity: 0.5,
        colorShift: [0.1, 0.1, 0.2],  // Slight blue boost
        rotationSpeed: 0.3,
        patternOverride: null,
    },
    selected: {
        priority: 2,
        opacityMultiplier: 1.0,
        thicknessMultiplier: 1.2,
        speedMultiplier: 0.8,
        glowIntensity: 0.8,
        colorShift: [0.0, 0.2, 0.3],  // Cyan highlight
        rotationSpeed: 0.5,
        patternOverride: 7,            // Crystal lattice (selection indicator)
    },
    powered: {
        priority: 2,
        opacityMultiplier: 1.0,
        thicknessMultiplier: 1.5,
        speedMultiplier: 1.5,
        glowIntensity: 1.0,
        colorShift: [0.3, 0.0, 0.5],  // Purple power glow
        rotationSpeed: 1.0,
        patternOverride: 6,            // Wave interference (energy)
    },
    damaged: {
        priority: 3,
        opacityMultiplier: 0.9,
        thicknessMultiplier: 0.8,
        speedMultiplier: 2.0,
        glowIntensity: 0.7,
        colorShift: [0.5, -0.2, -0.2], // Red warning
        rotationSpeed: 2.0,
        patternOverride: 5,             // Fractal dissolution
    },
    destroyed: {
        priority: 4,
        opacityMultiplier: 0.4,
        thicknessMultiplier: 2.0,
        speedMultiplier: 3.0,
        glowIntensity: 0.3,
        colorShift: [0.3, -0.1, -0.3],
        rotationSpeed: 3.0,
        patternOverride: 5,             // Fractal
    },
};

/* ------------------------------------------------------------------ */
/*  Identity generation (deterministic from object ID)                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a deterministic inscription config from an integer ID.
 * Uses hash-like functions to spread patterns across the 24 geometry space.
 */
function generateIdentityConfig(objectID, layerCount = 4) {
    // Hash function for deterministic pseudo-random
    const hash = (seed) => {
        let h = seed * 2654435761;
        h = ((h >>> 16) ^ h) * 2246822507;
        h = ((h >>> 16) ^ h) * 3266489909;
        h = (h >>> 16) ^ h;
        return (h & 0x7FFFFFFF) / 0x7FFFFFFF;
    };

    const layers = [];
    for (let i = 0; i < layerCount; i++) {
        const seed = objectID * 1000 + i;
        layers.push({
            geometry: Math.floor(hash(seed) * 24),
            thickness: 0.3 + hash(seed + 100) * 0.4,
            opacity: 0.7 + hash(seed + 200) * 0.3,
            color: [
                0.3 + hash(seed + 300) * 0.7,
                0.3 + hash(seed + 400) * 0.7,
                0.3 + hash(seed + 500) * 0.7,
            ],
            patternScale: 2.0 + hash(seed + 600) * 4.0,
            patternSpeed: 0.2 + hash(seed + 700) * 0.4,
            rotOffset: hash(seed + 800) * Math.PI * 2,
        });
    }

    return {
        layers,
        baseRotationSpeed: hash(objectID * 31) * 0.5,
        baseHue: hash(objectID * 47) * 360,
    };
}

/* ------------------------------------------------------------------ */
/*  Audio Mapping                                                      */
/* ------------------------------------------------------------------ */

const AUDIO_MAPPINGS = {
    // Bass -> 4D hyperspace rotation (XW plane) + edge thickness
    bass: {
        rot4dXW: 0.5,      // Bass drives XW rotation
        thickness: 0.3,     // Bass thickens edges
        glow: 0.4,          // Bass adds glow
    },
    // Mid -> pattern speed modulation + YW rotation
    mid: {
        rot4dYW: 0.3,
        speed: 0.5,
        opacity: 0.2,
    },
    // High -> ZW rotation + pattern scale shimmer
    high: {
        rot4dZW: 0.6,
        patternScale: 0.3,
        hueShift: 30,       // Degrees of hue shift at full high
    },
    // Energy -> overall intensity + all rotation speed
    energy: {
        allRotation: 0.3,
        intensity: 0.5,
        glow: 0.3,
    },
};

/* ------------------------------------------------------------------ */
/*  InscriptionChannel                                                 */
/* ------------------------------------------------------------------ */

export class InscriptionChannel {
    constructor({
        layerCount = 4,
        transitionDuration = 0.5,  // Seconds for state transitions
    } = {}) {
        this.layerCount = layerCount;
        this.transitionDuration = transitionDuration;

        // Per-object state tracking
        this._objectStates = new Map();   // objectID -> { current, target, progress, identity }
        this._audio = { bass: 0, mid: 0, high: 0, energy: 0 };
        this._time = 0;
    }

    /* -------------------------------------------------------------- */
    /*  State management                                               */
    /* -------------------------------------------------------------- */

    /**
     * Register an object for inscription tracking.
     * @param {number} objectID  Integer ID (from MeshRenderer.objectID)
     * @param {string} [initialState]  Initial semantic state
     */
    registerObject(objectID, initialState = 'idle') {
        const identity = generateIdentityConfig(objectID, this.layerCount);
        const preset = STATE_PRESETS[initialState] || STATE_PRESETS.idle;

        this._objectStates.set(objectID, {
            currentState: initialState,
            targetState: initialState,
            transitionProgress: 1.0,
            currentPreset: { ...preset },
            targetPreset: { ...preset },
            identity,
        });
    }

    /**
     * Set the semantic state of an object.
     * @param {number} objectID
     * @param {string} state  One of: 'idle', 'active', 'selected', 'powered', 'damaged', 'destroyed'
     */
    setObjectState(objectID, state) {
        const obj = this._objectStates.get(objectID);
        if (!obj) {
            this.registerObject(objectID, state);
            return;
        }

        if (obj.targetState === state) return;

        const preset = STATE_PRESETS[state];
        if (!preset) return;

        // Only transition if new state has equal or higher priority
        const currentPriority = (STATE_PRESETS[obj.currentState] || STATE_PRESETS.idle).priority;
        if (preset.priority < currentPriority && obj.transitionProgress < 0.5) return;

        obj.currentPreset = this._interpolatePresets(
            obj.currentPreset, obj.targetPreset, obj.transitionProgress
        );
        obj.targetPreset = { ...preset };
        obj.currentState = obj.targetState;
        obj.targetState = state;
        obj.transitionProgress = 0;
    }

    /**
     * Set audio-reactive inputs.
     */
    setAudio(bass, mid, high, energy) {
        this._audio.bass = Math.max(0, Math.min(1, bass || 0));
        this._audio.mid = Math.max(0, Math.min(1, mid || 0));
        this._audio.high = Math.max(0, Math.min(1, high || 0));
        this._audio.energy = Math.max(0, Math.min(1, energy || 0));
    }

    /**
     * Update transitions and time-based effects.
     * @param {number} deltaTime  Seconds since last update
     */
    update(deltaTime) {
        this._time += deltaTime;

        for (const obj of this._objectStates.values()) {
            if (obj.transitionProgress < 1.0) {
                obj.transitionProgress = Math.min(1.0,
                    obj.transitionProgress + deltaTime / this.transitionDuration);
            }
        }
    }

    /* -------------------------------------------------------------- */
    /*  Generate inscription config for an object                      */
    /* -------------------------------------------------------------- */

    /**
     * Get the current EdgeInscriptionLayer configuration for an object,
     * incorporating identity, state, and audio.
     *
     * @param {number} objectID
     * @returns {{ layers: object[], rot4dXW, rot4dYW, rot4dZW, globalThickness, bass, mid, high, energy }}
     */
    getInscriptionConfig(objectID) {
        let obj = this._objectStates.get(objectID);
        if (!obj) {
            this.registerObject(objectID);
            obj = this._objectStates.get(objectID);
        }

        const preset = this._interpolatePresets(
            obj.currentPreset, obj.targetPreset, obj.transitionProgress
        );

        const identity = obj.identity;
        const audio = this._audio;

        // Build per-layer configs
        const layers = [];
        for (let i = 0; i < this.layerCount; i++) {
            const baseLayer = identity.layers[i];

            // State modulates base identity
            const geometry = preset.patternOverride !== null
                ? preset.patternOverride
                : baseLayer.geometry;

            const opacity = baseLayer.opacity * preset.opacityMultiplier
                + audio.energy * AUDIO_MAPPINGS.energy.intensity * 0.3;

            const thickness = baseLayer.thickness * preset.thicknessMultiplier
                + audio.bass * AUDIO_MAPPINGS.bass.thickness;

            const speed = baseLayer.patternSpeed * preset.speedMultiplier
                + audio.mid * AUDIO_MAPPINGS.mid.speed;

            // Color = base + state shift + audio hue shift
            const hueShift = audio.high * AUDIO_MAPPINGS.high.hueShift / 360;
            const color = [
                Math.min(1, Math.max(0, baseLayer.color[0] + preset.colorShift[0] + hueShift * 0.5)),
                Math.min(1, Math.max(0, baseLayer.color[1] + preset.colorShift[1] + hueShift * 0.3)),
                Math.min(1, Math.max(0, baseLayer.color[2] + preset.colorShift[2] + hueShift)),
            ];

            const patternScale = baseLayer.patternScale
                + audio.high * AUDIO_MAPPINGS.high.patternScale;

            const rotOffset = baseLayer.rotOffset
                + this._time * (identity.baseRotationSpeed + preset.rotationSpeed * 0.5);

            layers.push({
                geometry,
                thickness: Math.min(1, Math.max(0, thickness)),
                opacity: Math.min(1, Math.max(0, opacity)),
                color,
                patternScale,
                patternSpeed: speed,
                rotOffset,
            });
        }

        // Global 4D rotation from audio
        const rot4dXW = audio.bass * AUDIO_MAPPINGS.bass.rot4dXW
            + audio.energy * AUDIO_MAPPINGS.energy.allRotation;
        const rot4dYW = audio.mid * AUDIO_MAPPINGS.mid.rot4dYW
            + audio.energy * AUDIO_MAPPINGS.energy.allRotation;
        const rot4dZW = audio.high * AUDIO_MAPPINGS.high.rot4dZW
            + audio.energy * AUDIO_MAPPINGS.energy.allRotation;

        const globalThickness = 0.6 * preset.thicknessMultiplier
            + audio.bass * 0.2;

        return {
            layers,
            rot4dXW,
            rot4dYW,
            rot4dZW,
            globalThickness,
            glowIntensity: preset.glowIntensity + audio.energy * AUDIO_MAPPINGS.energy.glow,
            bass: audio.bass,
            mid: audio.mid,
            high: audio.high,
            energy: audio.energy,
        };
    }

    /**
     * Apply an inscription config to an EdgeInscriptionLayer.
     * @param {EdgeInscriptionLayer} inscriptionLayer
     * @param {number} objectID
     */
    applyToLayer(inscriptionLayer, objectID) {
        const config = this.getInscriptionConfig(objectID);

        inscriptionLayer.rot4dXW = config.rot4dXW;
        inscriptionLayer.rot4dYW = config.rot4dYW;
        inscriptionLayer.rot4dZW = config.rot4dZW;
        inscriptionLayer.globalThickness = config.globalThickness;
        inscriptionLayer.setAudio(config.bass, config.mid, config.high, config.energy);

        for (let i = 0; i < config.layers.length && i < inscriptionLayer.layerCount; i++) {
            inscriptionLayer.setLayerConfig(i, config.layers[i]);
        }
    }

    /* -------------------------------------------------------------- */
    /*  State preset interpolation                                     */
    /* -------------------------------------------------------------- */

    _interpolatePresets(a, b, t) {
        // Smooth ease-in-out
        const st = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        return {
            priority: b.priority,
            opacityMultiplier: a.opacityMultiplier + (b.opacityMultiplier - a.opacityMultiplier) * st,
            thicknessMultiplier: a.thicknessMultiplier + (b.thicknessMultiplier - a.thicknessMultiplier) * st,
            speedMultiplier: a.speedMultiplier + (b.speedMultiplier - a.speedMultiplier) * st,
            glowIntensity: a.glowIntensity + (b.glowIntensity - a.glowIntensity) * st,
            colorShift: [
                a.colorShift[0] + (b.colorShift[0] - a.colorShift[0]) * st,
                a.colorShift[1] + (b.colorShift[1] - a.colorShift[1]) * st,
                a.colorShift[2] + (b.colorShift[2] - a.colorShift[2]) * st,
            ],
            rotationSpeed: a.rotationSpeed + (b.rotationSpeed - a.rotationSpeed) * st,
            patternOverride: st > 0.5 ? b.patternOverride : a.patternOverride,
        };
    }

    /* -------------------------------------------------------------- */
    /*  Query                                                          */
    /* -------------------------------------------------------------- */

    getObjectState(objectID) {
        const obj = this._objectStates.get(objectID);
        return obj ? obj.targetState : null;
    }

    get registeredObjects() {
        return Array.from(this._objectStates.keys());
    }

    get stateNames() {
        return Object.keys(STATE_PRESETS);
    }

    dispose() {
        this._objectStates.clear();
    }
}

export default InscriptionChannel;
