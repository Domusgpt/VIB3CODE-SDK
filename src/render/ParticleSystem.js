/**
 * ParticleSystem - GPU Particle Emitter using Gaussian Splats
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Splats as particles: emit from mesh surfaces, react to state changes, form trails.
 * GPU transform feedback (WebGL2) for position integration.
 * InscriptionChannel state triggers emission bursts.
 */

export class ParticleSystem {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.maxParticles=10000]
     * @param {number} [opts.emitRate=100] - Particles per second
     * @param {number} [opts.lifetime=3.0] - Seconds
     * @param {number} [opts.lifetimeVariance=0.5]
     * @param {number} [opts.speed=1.0] - Initial velocity magnitude
     * @param {number} [opts.speedVariance=0.3]
     * @param {number} [opts.gravity=-2.0] - Y-axis gravity
     * @param {number} [opts.drag=0.98] - Velocity damping per frame
     * @param {number} [opts.splatScale=0.02] - Particle splat size
     * @param {number} [opts.splatScaleDecay=0.5] - Scale shrink over lifetime
     * @param {number} [opts.trailLength=0] - Number of trail splats per particle (0=none)
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxParticles = opts.maxParticles ?? 10000;
        this.emitRate = opts.emitRate ?? 100;
        this.lifetime = opts.lifetime ?? 3.0;
        this.lifetimeVariance = opts.lifetimeVariance ?? 0.5;
        this.speed = opts.speed ?? 1.0;
        this.speedVariance = opts.speedVariance ?? 0.3;
        this.gravity = opts.gravity ?? -2.0;
        this.drag = opts.drag ?? 0.98;
        this.splatScale = opts.splatScale ?? 0.02;
        this.splatScaleDecay = opts.splatScaleDecay ?? 0.5;
        this.trailLength = opts.trailLength ?? 0;

        // Emitter config
        this.emitterType = opts.emitterType ?? 'point'; // 'point', 'surface', 'sphere'
        this.emitterPosition = new Float32Array(opts.emitterPosition || [0, 0, 0]);
        this.emitterRadius = opts.emitterRadius ?? 0.5;
        this.emitterDirection = new Float32Array(opts.emitterDirection || [0, 1, 0]);
        this.emitterSpread = opts.emitterSpread ?? 0.5; // Cone angle (0=focused, 1=hemisphere)

        // Color
        this.colorStart = new Float32Array(opts.colorStart || [0.0, 1.0, 1.0]);
        this.colorEnd = new Float32Array(opts.colorEnd || [1.0, 0.0, 1.0]);
        this.colorMode = opts.colorMode ?? 'lerp'; // 'lerp', 'random', 'velocity'

        // State burst config
        this.burstConfigs = new Map();
        this._setupDefaultBursts();

        // Particle buffer (CPU for compatibility, GPU TF when available)
        // Layout per particle: pos(3) + vel(3) + color(3) + age(1) + maxAge(1) + scale(1) = 12 floats
        this._stride = 12;
        this._data = new Float32Array(this.maxParticles * this._stride);
        this._aliveCount = 0;
        this._emitAccumulator = 0;

        // Trail history
        this._trailHistory = this.trailLength > 0
            ? new Float32Array(this.maxParticles * this.trailLength * 7) // pos(3) + color(3) + scale(1)
            : null;

        // Output splat buffer for GaussianSplatRenderer
        this._splatBuffer = null;
        this._splatCount = 0;

        // RNG state
        this._rng = 12345;
    }

    /**
     * Configure burst for semantic state
     * @param {string} state - 'powered', 'damaged', 'destroyed', etc.
     * @param {object} config
     * @param {number} config.count - Burst particle count
     * @param {number} [config.speed] - Override speed
     * @param {number} [config.spread] - Override spread
     * @param {number[]} [config.color] - Override color
     */
    setBurstConfig(state, config) {
        this.burstConfigs.set(state, config);
    }

    /**
     * Emit a burst of particles (triggered by state change)
     * @param {string} state - Semantic state name
     * @param {Float32Array} [position] - Override emit position
     */
    burst(state, position) {
        const config = this.burstConfigs.get(state);
        if (!config) return;

        const pos = position || this.emitterPosition;
        const spd = config.speed ?? this.speed * 2;
        const spread = config.spread ?? 1.0;

        for (let i = 0; i < config.count; i++) {
            this._emitOne(pos, spd, spread, config.color);
        }
    }

    /**
     * Set emitter position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setPosition(x, y, z) {
        this.emitterPosition[0] = x;
        this.emitterPosition[1] = y;
        this.emitterPosition[2] = z;
    }

    /**
     * Set surface emitter (emit from mesh triangles)
     * @param {Float32Array} positions - Mesh positions
     * @param {Float32Array} normals - Mesh normals
     * @param {Uint32Array} indices - Mesh indices
     */
    setSurfaceEmitter(positions, normals, indices) {
        this.emitterType = 'surface';
        this._surfacePositions = positions;
        this._surfaceNormals = normals;
        this._surfaceIndices = indices;
    }

    /**
     * Update particle simulation
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (dt <= 0 || dt > 0.1) dt = 0.016; // Clamp delta

        // Emit new particles
        this._emitAccumulator += this.emitRate * dt;
        while (this._emitAccumulator >= 1.0 && this._aliveCount < this.maxParticles) {
            this._emitAccumulator -= 1.0;
            this._emitParticle();
        }

        // Update existing particles
        let writeIdx = 0;
        for (let i = 0; i < this._aliveCount; i++) {
            const o = i * this._stride;

            // Age
            this._data[o + 9] += dt;
            if (this._data[o + 9] >= this._data[o + 10]) continue; // Dead

            // Store trail before updating position
            if (this._trailHistory) {
                this._pushTrail(i);
            }

            // Physics: velocity += gravity, position += velocity
            this._data[o + 4] += this.gravity * dt; // vy += gravity
            this._data[o + 3] *= this.drag; // vx *= drag
            this._data[o + 4] *= this.drag; // vy *= drag
            this._data[o + 5] *= this.drag; // vz *= drag

            this._data[o + 0] += this._data[o + 3] * dt; // px += vx * dt
            this._data[o + 1] += this._data[o + 4] * dt; // py += vy * dt
            this._data[o + 2] += this._data[o + 5] * dt; // pz += vz * dt

            // Color evolution
            const life = this._data[o + 9] / this._data[o + 10]; // 0-1 normalized age
            this._data[o + 6] = this.colorStart[0] * (1 - life) + this.colorEnd[0] * life;
            this._data[o + 7] = this.colorStart[1] * (1 - life) + this.colorEnd[1] * life;
            this._data[o + 8] = this.colorStart[2] * (1 - life) + this.colorEnd[2] * life;

            // Scale decay
            this._data[o + 11] = this.splatScale * (1.0 - life * this.splatScaleDecay);

            // Compact alive particles
            if (writeIdx !== i) {
                this._data.copyWithin(writeIdx * this._stride, o, o + this._stride);
            }
            writeIdx++;
        }

        this._aliveCount = writeIdx;

        // Build splat output buffer
        this._buildSplatBuffer();
    }

    /**
     * Get splat seed buffer for GaussianSplatRenderer.updateSeeds()
     * @returns {{buffer: Float32Array, count: number}}
     */
    getSplatBuffer() {
        return {
            buffer: this._splatBuffer,
            count: this._splatCount,
        };
    }

    /**
     * @returns {number} Number of alive particles
     */
    getAliveCount() {
        return this._aliveCount;
    }

    // ─── Internal ────────────────────────────────────────────────────

    _setupDefaultBursts() {
        this.burstConfigs.set('powered', { count: 50, speed: 2.0, spread: 0.3, color: [0.5, 0.0, 1.0] });
        this.burstConfigs.set('damaged', { count: 100, speed: 3.0, spread: 1.0, color: [1.0, 0.3, 0.0] });
        this.burstConfigs.set('destroyed', { count: 500, speed: 5.0, spread: 1.0, color: [1.0, 0.1, 0.1] });
        this.burstConfigs.set('selected', { count: 20, speed: 0.5, spread: 0.8, color: [0.0, 1.0, 1.0] });
        this.burstConfigs.set('active', { count: 30, speed: 1.0, spread: 0.5, color: [0.0, 1.0, 0.5] });
    }

    _emitParticle() {
        const pos = this._getEmitPosition();
        this._emitOne(pos, this.speed, this.emitterSpread);
    }

    _emitOne(pos, speed, spread, colorOverride) {
        if (this._aliveCount >= this.maxParticles) return;

        const o = this._aliveCount * this._stride;

        // Position
        this._data[o + 0] = pos[0];
        this._data[o + 1] = pos[1];
        this._data[o + 2] = pos[2];

        // Velocity (cone around emitter direction)
        const dir = this._randomConeDirection(this.emitterDirection, spread);
        const spd = speed + (this._rand() - 0.5) * this.speedVariance * 2;
        this._data[o + 3] = dir[0] * spd;
        this._data[o + 4] = dir[1] * spd;
        this._data[o + 5] = dir[2] * spd;

        // Color
        if (colorOverride) {
            this._data[o + 6] = colorOverride[0];
            this._data[o + 7] = colorOverride[1];
            this._data[o + 8] = colorOverride[2];
        } else {
            this._data[o + 6] = this.colorStart[0];
            this._data[o + 7] = this.colorStart[1];
            this._data[o + 8] = this.colorStart[2];
        }

        // Age / lifetime
        this._data[o + 9] = 0;
        this._data[o + 10] = this.lifetime + (this._rand() - 0.5) * this.lifetimeVariance * 2;

        // Scale
        this._data[o + 11] = this.splatScale;

        this._aliveCount++;
    }

    _getEmitPosition() {
        if (this.emitterType === 'surface' && this._surfaceIndices) {
            return this._randomSurfacePoint();
        } else if (this.emitterType === 'sphere') {
            const theta = this._rand() * Math.PI * 2;
            const phi = Math.acos(2 * this._rand() - 1);
            const r = this.emitterRadius * Math.cbrt(this._rand());
            return [
                this.emitterPosition[0] + r * Math.sin(phi) * Math.cos(theta),
                this.emitterPosition[1] + r * Math.cos(phi),
                this.emitterPosition[2] + r * Math.sin(phi) * Math.sin(theta),
            ];
        }
        return this.emitterPosition;
    }

    _randomSurfacePoint() {
        const triCount = this._surfaceIndices.length / 3;
        const tri = Math.floor(this._rand() * triCount);
        const i0 = this._surfaceIndices[tri * 3] * 3;
        const i1 = this._surfaceIndices[tri * 3 + 1] * 3;
        const i2 = this._surfaceIndices[tri * 3 + 2] * 3;

        // Random barycentric
        let u = this._rand(), v = this._rand();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;

        return [
            this._surfacePositions[i0] * w + this._surfacePositions[i1] * u + this._surfacePositions[i2] * v,
            this._surfacePositions[i0 + 1] * w + this._surfacePositions[i1 + 1] * u + this._surfacePositions[i2 + 1] * v,
            this._surfacePositions[i0 + 2] * w + this._surfacePositions[i1 + 2] * u + this._surfacePositions[i2 + 2] * v,
        ];
    }

    _randomConeDirection(baseDir, spread) {
        // Random direction within cone of given spread
        const theta = this._rand() * Math.PI * 2;
        const cosAngle = 1 - this._rand() * spread;
        const sinAngle = Math.sqrt(1 - cosAngle * cosAngle);

        // Local frame from baseDir
        const bx = baseDir[0], by = baseDir[1], bz = baseDir[2];
        let ux, uy, uz;
        if (Math.abs(by) < 0.99) {
            ux = by * 0 - bz * 0; uy = bz * 1 - bx * 0; uz = bx * 0 - by * 1;
            // Cross with (1,0,0) or (0,1,0)
            ux = 0; uy = -bz; uz = by;
        } else {
            ux = -bz; uy = 0; uz = bx;
        }
        const len = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        ux /= len; uy /= len; uz /= len;

        const vx = by * uz - bz * uy;
        const vy = bz * ux - bx * uz;
        const vz = bx * uy - by * ux;

        return [
            bx * cosAngle + (ux * Math.cos(theta) + vx * Math.sin(theta)) * sinAngle,
            by * cosAngle + (uy * Math.cos(theta) + vy * Math.sin(theta)) * sinAngle,
            bz * cosAngle + (uz * Math.cos(theta) + vz * Math.sin(theta)) * sinAngle,
        ];
    }

    _pushTrail(particleIdx) {
        if (!this._trailHistory) return;
        const o = particleIdx * this._stride;
        const tStride = 7;
        const tBase = particleIdx * this.trailLength * tStride;

        // Shift trail entries back
        for (let t = this.trailLength - 1; t > 0; t--) {
            const dst = tBase + t * tStride;
            const src = tBase + (t - 1) * tStride;
            for (let j = 0; j < tStride; j++) this._trailHistory[dst + j] = this._trailHistory[src + j];
        }

        // Write current position to trail[0]
        this._trailHistory[tBase + 0] = this._data[o + 0]; // px
        this._trailHistory[tBase + 1] = this._data[o + 1]; // py
        this._trailHistory[tBase + 2] = this._data[o + 2]; // pz
        this._trailHistory[tBase + 3] = this._data[o + 6]; // r
        this._trailHistory[tBase + 4] = this._data[o + 7]; // g
        this._trailHistory[tBase + 5] = this._data[o + 8]; // b
        this._trailHistory[tBase + 6] = this._data[o + 11]; // scale
    }

    _buildSplatBuffer() {
        // 12 floats per splat: pos(3) + scale(1) + orient(4) + color(3) + depth(1)
        const splatStride = 12;
        const totalSplats = this._aliveCount * (1 + this.trailLength);

        if (!this._splatBuffer || this._splatBuffer.length < totalSplats * splatStride) {
            this._splatBuffer = new Float32Array(totalSplats * splatStride);
        }

        let idx = 0;
        for (let i = 0; i < this._aliveCount; i++) {
            const o = i * this._stride;
            const so = idx * splatStride;

            // Position
            this._splatBuffer[so + 0] = this._data[o + 0];
            this._splatBuffer[so + 1] = this._data[o + 1];
            this._splatBuffer[so + 2] = this._data[o + 2];
            // Scale
            this._splatBuffer[so + 3] = this._data[o + 11];
            // Orientation (identity quaternion - spherical splats)
            this._splatBuffer[so + 4] = 1; this._splatBuffer[so + 5] = 0;
            this._splatBuffer[so + 6] = 0; this._splatBuffer[so + 7] = 0;
            // Color
            this._splatBuffer[so + 8] = this._data[o + 6];
            this._splatBuffer[so + 9] = this._data[o + 7];
            this._splatBuffer[so + 10] = this._data[o + 8];
            // Depth (for bloom)
            this._splatBuffer[so + 11] = 0.5;

            idx++;

            // Trail splats
            if (this._trailHistory) {
                const tBase = i * this.trailLength * 7;
                for (let t = 0; t < this.trailLength; t++) {
                    const to = tBase + t * 7;
                    const tso = idx * splatStride;
                    const fade = 1 - (t + 1) / (this.trailLength + 1);

                    this._splatBuffer[tso + 0] = this._trailHistory[to + 0];
                    this._splatBuffer[tso + 1] = this._trailHistory[to + 1];
                    this._splatBuffer[tso + 2] = this._trailHistory[to + 2];
                    this._splatBuffer[tso + 3] = this._trailHistory[to + 6] * fade;
                    this._splatBuffer[tso + 4] = 1; this._splatBuffer[tso + 5] = 0;
                    this._splatBuffer[tso + 6] = 0; this._splatBuffer[tso + 7] = 0;
                    this._splatBuffer[tso + 8] = this._trailHistory[to + 3] * fade;
                    this._splatBuffer[tso + 9] = this._trailHistory[to + 4] * fade;
                    this._splatBuffer[tso + 10] = this._trailHistory[to + 5] * fade;
                    this._splatBuffer[tso + 11] = 0.3 * fade;

                    idx++;
                }
            }
        }

        this._splatCount = idx;
    }

    _rand() {
        this._rng = (this._rng * 1664525 + 1013904223) & 0x7FFFFFFF;
        return this._rng / 0x7FFFFFFF;
    }

    dispose() {
        this._data = null;
        this._splatBuffer = null;
        this._trailHistory = null;
    }
}
