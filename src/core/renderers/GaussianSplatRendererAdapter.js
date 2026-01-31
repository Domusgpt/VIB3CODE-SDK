/**
 * GaussianSplatRendererAdapter
 *
 * Adapter following the RendererContract pattern, allowing the
 * GaussianSplatSystem to plug into the unified engine alongside
 * Quantum, Faceted, and Holographic systems.
 *
 * Usage:
 *   import { GaussianSplatRendererAdapter } from './renderers/GaussianSplatRendererAdapter.js';
 *   const adapter = new GaussianSplatRendererAdapter();
 *   adapter.init({ canvas: myCanvas });
 *   adapter.setActive(true);
 *   // In render loop:
 *   adapter.render({ time, params, audio });
 */

import { RendererContract } from '../RendererContracts.js';
import { GaussianSplatSystem } from '../../splat/GaussianSplatSystem.js';

export class GaussianSplatRendererAdapter extends RendererContract {
    constructor(system = new GaussianSplatSystem()) {
        super();
        this.system = system;
    }

    init(context = {}) {
        return this.system.init(context);
    }

    resize(width, height, pixelRatio = 1) {
        this.system.resize(width, height, pixelRatio);
    }

    render(frameState = {}) {
        this.system.render(frameState);
    }

    setActive(active) {
        this.system.setActive(active);
    }

    dispose() {
        this.system.dispose();
    }

    /** Proxy to underlying system's updateParameter. */
    updateParameter(name, value) {
        this.system.updateParameter(name, value);
    }

    /** Proxy to underlying system's updateAudio. */
    updateAudio(audioData) {
        this.system.updateAudio(audioData);
    }

    /** Get current scene label. */
    getSceneLabel() {
        return this.system.getSceneLabel();
    }

    /** Get all parameters for gallery/export. */
    getParameters() {
        return this.system.getParameters();
    }
}

export default GaussianSplatRendererAdapter;
