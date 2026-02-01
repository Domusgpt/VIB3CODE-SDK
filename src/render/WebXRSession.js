/**
 * WebXRSession - VR/AR Immersive Mode
 * VIB3+ Hybrid Render Pipeline v2
 *
 * WebXR session for VR headsets and AR pass-through.
 * Stereo rendering into the pipeline GBuffer.
 * Hand tracking → inscription state: pointed-at → 'selected', grabbed → 'active'.
 */

export class WebXRSession {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} pipeline - HybridRenderPipeline instance
     * @param {object} [opts]
     * @param {string} [opts.mode='immersive-vr'] - 'immersive-vr' or 'immersive-ar'
     * @param {string} [opts.referenceSpace='local-floor']
     * @param {boolean} [opts.handTracking=true]
     * @param {object} [opts.inscriptionChannel] - InscriptionChannel for hand interaction
     */
    constructor(gl, pipeline, opts = {}) {
        this.gl = gl;
        this.pipeline = pipeline;
        this.mode = opts.mode ?? 'immersive-vr';
        this.referenceSpace = opts.referenceSpace ?? 'local-floor';
        this.handTracking = opts.handTracking ?? true;
        this.inscriptionChannel = opts.inscriptionChannel ?? null;

        // XR state
        this.session = null;
        this.refSpace = null;
        this.glLayer = null;
        this.active = false;

        // Per-eye render state
        this._viewMatrices = [new Float32Array(16), new Float32Array(16)];
        this._projMatrices = [new Float32Array(16), new Float32Array(16)];

        // Hand tracking state
        this._hands = { left: null, right: null };
        this._pointedObject = null;
        this._grabbedObject = null;

        // Controller state
        this._controllers = [];

        // Callbacks
        this.onSessionStart = null;
        this.onSessionEnd = null;
        this.onHandInteraction = null;
    }

    /**
     * Check if WebXR is available
     * @returns {Promise<boolean>}
     */
    static async isSupported(mode = 'immersive-vr') {
        if (!navigator.xr) return false;
        try {
            return await navigator.xr.isSessionSupported(mode);
        } catch {
            return false;
        }
    }

    /**
     * Request and start an XR session
     * @returns {Promise<boolean>} True if session started
     */
    async start() {
        if (this.active) return true;

        const supported = await WebXRSession.isSupported(this.mode);
        if (!supported) {
            console.warn(`WebXR: ${this.mode} not supported`);
            return false;
        }

        try {
            const sessionOpts = {
                requiredFeatures: [this.referenceSpace],
                optionalFeatures: [],
            };

            if (this.handTracking) {
                sessionOpts.optionalFeatures.push('hand-tracking');
            }

            this.session = await navigator.xr.requestSession(this.mode, sessionOpts);

            // Set up WebGL layer
            this.glLayer = new XRWebGLLayer(this.session, this.gl);
            this.session.updateRenderState({ baseLayer: this.glLayer });

            // Get reference space
            this.refSpace = await this.session.requestReferenceSpace(this.referenceSpace);

            // Set up frame loop
            this.active = true;
            this.session.requestAnimationFrame(this._onXRFrame.bind(this));

            // Handle session end
            this.session.addEventListener('end', () => {
                this.active = false;
                this.session = null;
                this.glLayer = null;
                this.refSpace = null;
                if (this.onSessionEnd) this.onSessionEnd();
            });

            // Set up input sources (controllers/hands)
            this.session.addEventListener('inputsourceschange', (e) => {
                this._updateInputSources(e);
            });

            if (this.onSessionStart) this.onSessionStart();
            return true;
        } catch (e) {
            console.error('WebXR session start failed:', e);
            return false;
        }
    }

    /**
     * End the XR session
     */
    async stop() {
        if (this.session) {
            await this.session.end();
        }
        this.active = false;
    }

    /**
     * Get current hand positions (for UI feedback)
     * @returns {{ left: {position, direction, pinching}, right: {position, direction, pinching} }}
     */
    getHandState() {
        return {
            left: this._hands.left,
            right: this._hands.right,
        };
    }

    /**
     * Set scene objects that can be interacted with via hands/controllers
     * @param {Array<{name: string, objectId: number, aabb: object}>} interactables
     */
    setInteractables(interactables) {
        this._interactables = interactables;
    }

    // ─── XR Frame Loop ───────────────────────────────────────────────

    _onXRFrame(time, frame) {
        if (!this.active) return;
        this.session.requestAnimationFrame(this._onXRFrame.bind(this));

        const pose = frame.getViewerPose(this.refSpace);
        if (!pose) return;

        const gl = this.gl;
        const glLayer = this.glLayer;

        gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);

        // Process hand tracking
        if (this.handTracking) {
            this._processHands(frame);
        }

        // Render each eye
        for (const view of pose.views) {
            const viewport = glLayer.getViewport(view);
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

            const viewMatrix = view.transform.inverse.matrix;
            const projMatrix = view.projectionMatrix;

            // Render pipeline for this eye
            this.pipeline.render(time / 1000, viewMatrix, projMatrix, {
                width: viewport.width,
                height: viewport.height,
                xrView: true,
            });
        }
    }

    _processHands(frame) {
        for (const inputSource of this.session.inputSources) {
            if (inputSource.hand) {
                const handedness = inputSource.handedness; // 'left' or 'right'
                const hand = inputSource.hand;

                // Get index finger tip joint
                const indexTip = hand.get('index-finger-tip');
                const thumbTip = hand.get('thumb-tip');

                if (indexTip && thumbTip) {
                    const indexPose = frame.getJointPose(indexTip, this.refSpace);
                    const thumbPose = frame.getJointPose(thumbTip, this.refSpace);

                    if (indexPose && thumbPose) {
                        const indexPos = indexPose.transform.position;
                        const thumbPos = thumbPose.transform.position;

                        // Pinch detection
                        const dx = indexPos.x - thumbPos.x;
                        const dy = indexPos.y - thumbPos.y;
                        const dz = indexPos.z - thumbPos.z;
                        const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        const pinching = pinchDist < 0.02; // 2cm threshold

                        // Point direction (from wrist to index tip)
                        const wrist = hand.get('wrist');
                        const wristPose = wrist ? frame.getJointPose(wrist, this.refSpace) : null;
                        let direction = [0, 0, -1];
                        if (wristPose) {
                            const wp = wristPose.transform.position;
                            direction = [
                                indexPos.x - wp.x,
                                indexPos.y - wp.y,
                                indexPos.z - wp.z,
                            ];
                            const len = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2) || 1;
                            direction[0] /= len; direction[1] /= len; direction[2] /= len;
                        }

                        this._hands[handedness] = {
                            position: [indexPos.x, indexPos.y, indexPos.z],
                            direction,
                            pinching,
                        };

                        // Inscription interaction
                        this._handleHandInteraction(handedness, indexPos, direction, pinching);
                    }
                }
            }
        }
    }

    _handleHandInteraction(handedness, position, direction, pinching) {
        if (!this.inscriptionChannel || !this._interactables) return;

        // Ray test against interactable AABBs
        const hit = this._raycastInteractables(
            [position.x, position.y, position.z],
            direction
        );

        if (hit) {
            if (pinching) {
                // Grabbed → active
                if (this._grabbedObject !== hit.objectId) {
                    this._grabbedObject = hit.objectId;
                    this.inscriptionChannel.setObjectState(hit.objectId, 'active');
                    if (this.onHandInteraction) {
                        this.onHandInteraction({ type: 'grab', hand: handedness, object: hit.name, objectId: hit.objectId });
                    }
                }
            } else {
                // Pointed at → selected
                if (this._pointedObject !== hit.objectId) {
                    // Deselect previous
                    if (this._pointedObject !== null) {
                        this.inscriptionChannel.setObjectState(this._pointedObject, 'idle');
                    }
                    this._pointedObject = hit.objectId;
                    this.inscriptionChannel.setObjectState(hit.objectId, 'selected');
                    if (this.onHandInteraction) {
                        this.onHandInteraction({ type: 'point', hand: handedness, object: hit.name, objectId: hit.objectId });
                    }
                }

                // Release grab
                if (this._grabbedObject !== null) {
                    this.inscriptionChannel.setObjectState(this._grabbedObject, 'idle');
                    this._grabbedObject = null;
                }
            }
        } else {
            // No hit → deselect
            if (this._pointedObject !== null) {
                this.inscriptionChannel.setObjectState(this._pointedObject, 'idle');
                this._pointedObject = null;
            }
            if (!pinching && this._grabbedObject !== null) {
                this.inscriptionChannel.setObjectState(this._grabbedObject, 'idle');
                this._grabbedObject = null;
            }
        }
    }

    _raycastInteractables(origin, direction) {
        let closest = null;
        let closestDist = Infinity;

        for (const obj of this._interactables) {
            if (!obj.aabb) continue;
            const t = this._rayAABBIntersect(origin, direction, obj.aabb);
            if (t !== null && t < closestDist) {
                closestDist = t;
                closest = obj;
            }
        }

        return closest;
    }

    _rayAABBIntersect(origin, dir, aabb) {
        let tmin = -Infinity, tmax = Infinity;

        for (let i = 0; i < 3; i++) {
            if (Math.abs(dir[i]) < 1e-8) {
                if (origin[i] < aabb.min[i] || origin[i] > aabb.max[i]) return null;
            } else {
                let t1 = (aabb.min[i] - origin[i]) / dir[i];
                let t2 = (aabb.max[i] - origin[i]) / dir[i];
                if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
                tmin = Math.max(tmin, t1);
                tmax = Math.min(tmax, t2);
                if (tmin > tmax) return null;
            }
        }

        return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
    }

    _updateInputSources(event) {
        this._controllers = [];
        for (const source of this.session.inputSources) {
            this._controllers.push({
                handedness: source.handedness,
                hasHand: !!source.hand,
                hasGamepad: !!source.gamepad,
            });
        }
    }

    dispose() {
        this.stop();
    }
}
