/**
 * ProceduralRenderLoop
 *
 * Connects scheduler output to a renderer with optional focus/motion inputs.
 */

export class ProceduralRenderLoop {
    constructor({
        scheduler,
        renderer,
        focusProvider = () => 1,
        motionProvider = () => 0,
        raf = (callback) => requestAnimationFrame(callback)
    }) {
        if (!scheduler || !renderer) {
            throw new Error('ProceduralRenderLoop requires scheduler and renderer.');
        }
        this.scheduler = scheduler;
        this.renderer = renderer;
        this.focusProvider = focusProvider;
        this.motionProvider = motionProvider;
        this.raf = raf;
        this.running = false;
        this.frameHandle = null;
    }

    tick = () => {
        if (!this.running) {
            return;
        }
        const focus = this.focusProvider();
        const motion = this.motionProvider();
        const { buffer, seeds } = this.scheduler.nextFrame({ focus, motion });
        this.renderer.updateSeeds(buffer, seeds.length);
        this.renderer.render();
        this.frameHandle = this.raf(this.tick);
    };

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        this.tick();
    }

    stop() {
        this.running = false;
        this.frameHandle = null;
    }
}

export default ProceduralRenderLoop;
