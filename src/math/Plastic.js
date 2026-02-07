/**
 * Plastic Ratio Mathematical Foundations
 *
 * Implements the Plastic Ratio (ρ ≈ 1.3247) and related mathematical constructs
 * for the Phillips Rendering System. The Plastic Ratio is the unique real solution
 * to x³ = x + 1, analogous to the Golden Ratio but with distinct geometric properties.
 *
 * Used for low-discrepancy sampling to prevent moiré patterns in Gaussian Flat rendering.
 *
 * @module math/Plastic
 * @example
 * import { PLASTIC_CONSTANT, getPadovanSequence, getPlasticSamplingPoint } from './Plastic.js';
 *
 * // Generate Padovan sequence
 * const sequence = getPadovanSequence(10);
 * // [1, 1, 1, 2, 2, 3, 4, 5, 7, 9]
 *
 * // Get low-discrepancy sampling points
 * for (let i = 0; i < 100; i++) {
 *     const point = getPlasticSamplingPoint(i);
 *     // point.x and point.y are uniformly distributed without clustering
 * }
 */

/**
 * The Plastic Constant (ρ)
 * The unique real solution to x³ = x + 1
 * Also known as the Plastic Number or Plastic Ratio
 * @type {number}
 */
export const PLASTIC_CONSTANT = 1.324717957244746;

/**
 * Inverse of the Plastic Constant (1/ρ)
 * @type {number}
 */
export const PLASTIC_CONSTANT_INV = 1 / PLASTIC_CONSTANT;

/**
 * Square of the Plastic Constant (ρ²)
 * Useful for 2D sampling distributions
 * @type {number}
 */
export const PLASTIC_CONSTANT_SQ = PLASTIC_CONSTANT * PLASTIC_CONSTANT;

/**
 * Cube of the Plastic Constant (ρ³)
 * Note: ρ³ = ρ + 1 by definition
 * @type {number}
 */
export const PLASTIC_CONSTANT_CUBE = PLASTIC_CONSTANT + 1;

/**
 * Alpha constant for 2D Plastic sampling
 * α₁ = 1 / ρ for the first dimension
 * @type {number}
 */
export const PLASTIC_ALPHA_1 = 0.7548776662466927;

/**
 * Alpha constant for 2D Plastic sampling
 * α₂ = 1 / ρ² for the second dimension
 * @type {number}
 */
export const PLASTIC_ALPHA_2 = 0.5698402909980532;

/**
 * Generate the Padovan Sequence up to n terms
 *
 * The Padovan sequence is defined by:
 * P(0) = P(1) = P(2) = 1
 * P(n) = P(n-2) + P(n-3) for n > 2
 *
 * The ratio of successive terms converges to the Plastic Constant.
 *
 * @param {number} n - Number of terms to generate (must be > 0)
 * @returns {number[]} Array of n Padovan numbers starting with [1, 1, 1, ...]
 * @throws {Error} If n is less than 1
 * @example
 * getPadovanSequence(10);
 * // Returns: [1, 1, 1, 2, 2, 3, 4, 5, 7, 9]
 */
export function getPadovanSequence(n) {
    if (n < 1) {
        throw new Error('Padovan sequence length must be at least 1');
    }

    if (n === 1) return [1];
    if (n === 2) return [1, 1];
    if (n === 3) return [1, 1, 1];

    const sequence = [1, 1, 1];

    for (let i = 3; i < n; i++) {
        sequence.push(sequence[i - 2] + sequence[i - 3]);
    }

    return sequence;
}

/**
 * Get the nth Padovan number (0-indexed)
 *
 * @param {number} n - Index of the Padovan number to retrieve
 * @returns {number} The nth Padovan number
 * @example
 * getPadovanNumber(7); // Returns: 5
 */
export function getPadovanNumber(n) {
    if (n < 0) {
        throw new Error('Padovan index must be non-negative');
    }
    if (n < 3) return 1;

    let a = 1, b = 1, c = 1;
    for (let i = 3; i <= n; i++) {
        const next = a + b;
        a = b;
        b = c;
        c = next;
    }
    return c;
}

/**
 * Generate a 2D low-discrepancy sampling point using the Plastic Ratio
 *
 * Similar to the Golden Ratio sequence (R₂) but using the Plastic Ratio
 * for potentially better distribution in certain geometric contexts.
 * Each successive point is distributed to avoid clustering.
 *
 * @param {number} index - The sample index (0, 1, 2, ...)
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {{x: number, y: number}} Point in [0, 1) × [0, 1)
 * @example
 * const point = getPlasticSamplingPoint(42);
 * // Returns { x: 0.xxx, y: 0.yyy } uniformly distributed
 */
export function getPlasticSamplingPoint(index, seed = 0.5) {
    // Use Plastic-based low-discrepancy sequence
    // Similar to R₂ sequence but with Plastic constants
    const x = (seed + PLASTIC_ALPHA_1 * index) % 1;
    const y = (seed + PLASTIC_ALPHA_2 * index) % 1;

    return { x, y };
}

/**
 * Generate a 3D low-discrepancy sampling point using the Plastic Ratio
 *
 * Extended to 3D for volumetric sampling applications.
 *
 * @param {number} index - The sample index (0, 1, 2, ...)
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {{x: number, y: number, z: number}} Point in [0, 1)³
 * @example
 * const point = getPlasticSamplingPoint3D(42);
 */
export function getPlasticSamplingPoint3D(index, seed = 0.5) {
    // Alpha constants for 3D: powers of 1/ρ
    const alpha3 = PLASTIC_ALPHA_2 * PLASTIC_CONSTANT_INV;

    const x = (seed + PLASTIC_ALPHA_1 * index) % 1;
    const y = (seed + PLASTIC_ALPHA_2 * index) % 1;
    const z = (seed + alpha3 * index) % 1;

    return { x, y, z };
}

/**
 * Generate an array of 2D sampling points using Plastic distribution
 *
 * @param {number} count - Number of points to generate
 * @param {number} [seed=0.5] - Initial offset for the sequence
 * @returns {Array<{x: number, y: number}>} Array of 2D points
 * @example
 * const points = generatePlasticSamplingGrid(100);
 * // Returns 100 uniformly distributed points
 */
export function generatePlasticSamplingGrid(count, seed = 0.5) {
    const points = [];
    for (let i = 0; i < count; i++) {
        points.push(getPlasticSamplingPoint(i, seed));
    }
    return points;
}

/**
 * Calculate the Plastic power for scale modulation
 *
 * Returns ρ^n for use in scale calculations in the Phillips Renderer.
 *
 * @param {number} n - The power (can be negative or fractional)
 * @returns {number} ρ^n
 * @example
 * getPlasticPower(2);  // Returns ρ² ≈ 1.7549
 * getPlasticPower(-1); // Returns 1/ρ ≈ 0.7549
 */
export function getPlasticPower(n) {
    return Math.pow(PLASTIC_CONSTANT, n);
}

/**
 * Calculate scale factor based on Plastic Ratio for splat sizing
 *
 * Maps a depth or distance value to a scale factor using Plastic powers.
 * Useful for the Phillips Renderer's u_plasticScale uniform.
 *
 * @param {number} depth - Depth value (0 = near, 1 = far)
 * @param {number} [minScale=0.1] - Minimum scale factor
 * @param {number} [maxScale=2.0] - Maximum scale factor
 * @returns {number} Scale factor modulated by Plastic Ratio
 */
export function getPlasticScaleFactor(depth, minScale = 0.1, maxScale = 2.0) {
    // Use inverse Plastic power for natural depth falloff
    const plasticFactor = getPlasticPower(-depth);
    return minScale + (maxScale - minScale) * plasticFactor;
}

/**
 * Convert an RGB color to RGB565 format (16-bit)
 *
 * Used for the ~17 bytes/splat compression target in the Phillips system.
 *
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} 16-bit RGB565 color value
 * @example
 * const packed = packRGB565(255, 128, 64);
 */
export function packRGB565(r, g, b) {
    const r5 = (r >> 3) & 0x1F;  // 5 bits for red
    const g6 = (g >> 2) & 0x3F;  // 6 bits for green
    const b5 = (b >> 3) & 0x1F;  // 5 bits for blue
    return (r5 << 11) | (g6 << 5) | b5;
}

/**
 * Unpack RGB565 to RGB components
 *
 * @param {number} packed - 16-bit RGB565 color value
 * @returns {{r: number, g: number, b: number}} RGB components (0-255)
 */
export function unpackRGB565(packed) {
    const r5 = (packed >> 11) & 0x1F;
    const g6 = (packed >> 5) & 0x3F;
    const b5 = packed & 0x1F;

    return {
        r: (r5 << 3) | (r5 >> 2),  // Expand 5 bits to 8 bits
        g: (g6 << 2) | (g6 >> 4),  // Expand 6 bits to 8 bits
        b: (b5 << 3) | (b5 >> 2)   // Expand 5 bits to 8 bits
    };
}

/**
 * Estimate if the Plastic sampling has reached sufficient coverage
 *
 * Based on the discrepancy theory, determines if n samples provide
 * adequate coverage of the unit square.
 *
 * @param {number} sampleCount - Number of samples placed
 * @param {number} targetResolution - Target resolution (pixels per dimension)
 * @returns {boolean} True if coverage is sufficient
 */
export function hasSufficientCoverage(sampleCount, targetResolution) {
    // Plastic sequence has O(1/n) discrepancy
    // For a grid of targetResolution², we need roughly that many samples
    const minSamples = targetResolution * targetResolution * 0.5;
    return sampleCount >= minSamples;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRANGE ATTRACTORS - Chaotic systems with Plastic-ratio parameters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lorenz Attractor step with Plastic-modulated parameters
 *
 * The Lorenz system is a classic chaotic attractor. Here we use Plastic-ratio
 * based parameters for unique emergent behavior.
 *
 * @param {Object} state - Current state {x, y, z}
 * @param {number} [dt=0.01] - Time step
 * @param {Object} [params] - Optional parameter overrides
 * @returns {Object} New state {x, y, z}
 */
export function lorenzStep(state, dt = 0.01, params = {}) {
    // Plastic-modulated Lorenz parameters
    const sigma = params.sigma ?? 10 * PLASTIC_CONSTANT;          // ~13.247
    const rho = params.rho ?? 28 * PLASTIC_CONSTANT_INV;           // ~21.14
    const beta = params.beta ?? 8/3 * PLASTIC_CONSTANT;            // ~3.53

    const { x, y, z } = state;

    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;

    return {
        x: x + dx * dt,
        y: y + dy * dt,
        z: z + dz * dt
    };
}

/**
 * Generate a Lorenz attractor trajectory
 *
 * @param {number} steps - Number of steps to simulate
 * @param {Object} [initial] - Initial state
 * @param {number} [dt=0.01] - Time step
 * @returns {Array<Object>} Array of {x, y, z} states
 */
export function generateLorenzTrajectory(steps, initial = { x: 1, y: 1, z: 1 }, dt = 0.01) {
    const trajectory = [initial];
    let state = { ...initial };

    for (let i = 1; i < steps; i++) {
        state = lorenzStep(state, dt);
        trajectory.push({ ...state });
    }

    return trajectory;
}

/**
 * Rossler Attractor step with Plastic-modulated parameters
 *
 * The Rossler attractor creates spiral chaos patterns.
 *
 * @param {Object} state - Current state {x, y, z}
 * @param {number} [dt=0.01] - Time step
 * @param {Object} [params] - Optional parameter overrides
 * @returns {Object} New state {x, y, z}
 */
export function rosslerStep(state, dt = 0.01, params = {}) {
    // Plastic-modulated Rossler parameters
    const a = params.a ?? 0.2 * PLASTIC_CONSTANT;
    const b = params.b ?? 0.2 * PLASTIC_CONSTANT;
    const c = params.c ?? 5.7 * PLASTIC_CONSTANT_INV;

    const { x, y, z } = state;

    const dx = -y - z;
    const dy = x + a * y;
    const dz = b + z * (x - c);

    return {
        x: x + dx * dt,
        y: y + dy * dt,
        z: z + dz * dt
    };
}

/**
 * Thomas Attractor - Creates smooth, flowing chaos
 *
 * @param {Object} state - Current state {x, y, z}
 * @param {number} [dt=0.01] - Time step
 * @param {number} [b=0.208186] - Dissipation parameter (Plastic-based default)
 * @returns {Object} New state {x, y, z}
 */
export function thomasStep(state, dt = 0.01, b = PLASTIC_ALPHA_2 * 0.366) {
    const { x, y, z } = state;

    const dx = Math.sin(y) - b * x;
    const dy = Math.sin(z) - b * y;
    const dz = Math.sin(x) - b * z;

    return {
        x: x + dx * dt,
        y: y + dy * dt,
        z: z + dz * dt
    };
}

/**
 * Aizawa Attractor - Creates butterfly-like patterns
 *
 * @param {Object} state - Current state {x, y, z}
 * @param {number} [dt=0.01] - Time step
 * @returns {Object} New state {x, y, z}
 */
export function aizawaStep(state, dt = 0.01) {
    // Plastic-modulated parameters
    const a = 0.95 * PLASTIC_CONSTANT_INV;
    const b = 0.7 * PLASTIC_CONSTANT;
    const c = 0.6;
    const d = 3.5 * PLASTIC_CONSTANT_INV;
    const e = 0.25;
    const f = 0.1 * PLASTIC_CONSTANT;

    const { x, y, z } = state;

    const dx = (z - b) * x - d * y;
    const dy = d * x + (z - b) * y;
    const dz = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x;

    return {
        x: x + dx * dt,
        y: y + dy * dt,
        z: z + dz * dt
    };
}

/**
 * Halvorsen Attractor - Creates twisted, interlocking loops
 *
 * @param {Object} state - Current state {x, y, z}
 * @param {number} [dt=0.01] - Time step
 * @param {number} [a=1.89] - Parameter (Plastic-based default)
 * @returns {Object} New state {x, y, z}
 */
export function halvorsenStep(state, dt = 0.01, a = PLASTIC_CONSTANT + 0.57) {
    const { x, y, z } = state;

    const dx = -a * x - 4 * y - 4 * z - y * y;
    const dy = -a * y - 4 * z - 4 * x - z * z;
    const dz = -a * z - 4 * x - 4 * y - x * x;

    return {
        x: x + dx * dt,
        y: y + dy * dt,
        z: z + dz * dt
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENT SWARM INTELLIGENCE - Boids with Plastic-ratio behaviors
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Swarm Agent class for emergent flocking behavior
 */
export class SwarmAgent {
    constructor(x = 0, y = 0, z = 0) {
        this.position = { x, y, z };
        this.velocity = {
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: (Math.random() - 0.5) * 2
        };
        this.acceleration = { x: 0, y: 0, z: 0 };
        this.maxSpeed = PLASTIC_CONSTANT * 2;
        this.maxForce = PLASTIC_CONSTANT_INV * 0.5;
    }

    /**
     * Apply a force to the agent
     * @param {Object} force - Force vector {x, y, z}
     */
    applyForce(force) {
        this.acceleration.x += force.x;
        this.acceleration.y += force.y;
        this.acceleration.z += force.z;
    }

    /**
     * Update agent position and velocity
     * @param {number} dt - Time step
     */
    update(dt = 1) {
        // Update velocity
        this.velocity.x += this.acceleration.x * dt;
        this.velocity.y += this.acceleration.y * dt;
        this.velocity.z += this.acceleration.z * dt;

        // Limit speed
        const speed = Math.sqrt(
            this.velocity.x ** 2 +
            this.velocity.y ** 2 +
            this.velocity.z ** 2
        );
        if (speed > this.maxSpeed) {
            const factor = this.maxSpeed / speed;
            this.velocity.x *= factor;
            this.velocity.y *= factor;
            this.velocity.z *= factor;
        }

        // Update position
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;
        this.position.z += this.velocity.z * dt;

        // Reset acceleration
        this.acceleration = { x: 0, y: 0, z: 0 };
    }
}

/**
 * Swarm system with emergent behaviors
 */
export class PlasticSwarm {
    /**
     * Create a swarm
     * @param {number} count - Number of agents
     * @param {number} [bounds=10] - Boundary size
     */
    constructor(count, bounds = 10) {
        this.agents = [];
        this.bounds = bounds;

        // Plastic-ratio weighted behavior parameters
        this.separationWeight = PLASTIC_CONSTANT;           // Strong separation
        this.alignmentWeight = PLASTIC_CONSTANT_INV;        // Moderate alignment
        this.cohesionWeight = PLASTIC_ALPHA_2;              // Gentle cohesion
        this.attractorWeight = PLASTIC_ALPHA_1 * 0.5;       // Weak attractor pull

        // Perception radii based on Plastic powers
        this.separationRadius = bounds * 0.1 * PLASTIC_CONSTANT;
        this.alignmentRadius = bounds * 0.2 * PLASTIC_CONSTANT;
        this.cohesionRadius = bounds * 0.3 * PLASTIC_CONSTANT;

        // Initialize agents using Plastic sampling
        for (let i = 0; i < count; i++) {
            const sample = getPlasticSamplingPoint3D(i, 0.5);
            const agent = new SwarmAgent(
                (sample.x - 0.5) * bounds * 2,
                (sample.y - 0.5) * bounds * 2,
                (sample.z - 0.5) * bounds * 2
            );
            this.agents.push(agent);
        }

        // Optional strange attractor influence
        this.attractorState = { x: 0, y: 0, z: 0 };
        this.attractorType = 'lorenz';
    }

    /**
     * Calculate separation force (avoid crowding)
     */
    separation(agent) {
        const force = { x: 0, y: 0, z: 0 };
        let count = 0;

        for (const other of this.agents) {
            if (other === agent) continue;

            const dx = agent.position.x - other.position.x;
            const dy = agent.position.y - other.position.y;
            const dz = agent.position.z - other.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > 0 && dist < this.separationRadius) {
                // Weight by inverse distance
                const weight = 1 / dist;
                force.x += dx * weight;
                force.y += dy * weight;
                force.z += dz * weight;
                count++;
            }
        }

        if (count > 0) {
            force.x /= count;
            force.y /= count;
            force.z /= count;
        }

        return force;
    }

    /**
     * Calculate alignment force (steer towards average heading)
     */
    alignment(agent) {
        const avgVelocity = { x: 0, y: 0, z: 0 };
        let count = 0;

        for (const other of this.agents) {
            if (other === agent) continue;

            const dx = agent.position.x - other.position.x;
            const dy = agent.position.y - other.position.y;
            const dz = agent.position.z - other.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > 0 && dist < this.alignmentRadius) {
                avgVelocity.x += other.velocity.x;
                avgVelocity.y += other.velocity.y;
                avgVelocity.z += other.velocity.z;
                count++;
            }
        }

        if (count > 0) {
            avgVelocity.x /= count;
            avgVelocity.y /= count;
            avgVelocity.z /= count;

            // Steer towards average velocity
            return {
                x: avgVelocity.x - agent.velocity.x,
                y: avgVelocity.y - agent.velocity.y,
                z: avgVelocity.z - agent.velocity.z
            };
        }

        return { x: 0, y: 0, z: 0 };
    }

    /**
     * Calculate cohesion force (steer towards center of mass)
     */
    cohesion(agent) {
        const center = { x: 0, y: 0, z: 0 };
        let count = 0;

        for (const other of this.agents) {
            if (other === agent) continue;

            const dx = agent.position.x - other.position.x;
            const dy = agent.position.y - other.position.y;
            const dz = agent.position.z - other.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist > 0 && dist < this.cohesionRadius) {
                center.x += other.position.x;
                center.y += other.position.y;
                center.z += other.position.z;
                count++;
            }
        }

        if (count > 0) {
            center.x /= count;
            center.y /= count;
            center.z /= count;

            // Steer towards center
            return {
                x: center.x - agent.position.x,
                y: center.y - agent.position.y,
                z: center.z - agent.position.z
            };
        }

        return { x: 0, y: 0, z: 0 };
    }

    /**
     * Calculate attractor force (pull towards strange attractor)
     */
    attractorForce(agent) {
        return {
            x: (this.attractorState.x * this.bounds * 0.1 - agent.position.x) * 0.01,
            y: (this.attractorState.y * this.bounds * 0.1 - agent.position.y) * 0.01,
            z: (this.attractorState.z * this.bounds * 0.1 - agent.position.z) * 0.01
        };
    }

    /**
     * Update the entire swarm
     * @param {number} dt - Time step
     */
    update(dt = 1) {
        // Update strange attractor
        switch (this.attractorType) {
            case 'lorenz':
                this.attractorState = lorenzStep(this.attractorState, 0.005);
                break;
            case 'rossler':
                this.attractorState = rosslerStep(this.attractorState, 0.02);
                break;
            case 'thomas':
                this.attractorState = thomasStep(this.attractorState, 0.1);
                break;
            case 'aizawa':
                this.attractorState = aizawaStep(this.attractorState, 0.005);
                break;
            case 'halvorsen':
                this.attractorState = halvorsenStep(this.attractorState, 0.002);
                break;
        }

        // Update each agent
        for (const agent of this.agents) {
            // Calculate forces
            const sep = this.separation(agent);
            const ali = this.alignment(agent);
            const coh = this.cohesion(agent);
            const att = this.attractorForce(agent);

            // Apply weighted forces
            agent.applyForce({
                x: sep.x * this.separationWeight +
                   ali.x * this.alignmentWeight +
                   coh.x * this.cohesionWeight +
                   att.x * this.attractorWeight,
                y: sep.y * this.separationWeight +
                   ali.y * this.alignmentWeight +
                   coh.y * this.cohesionWeight +
                   att.y * this.attractorWeight,
                z: sep.z * this.separationWeight +
                   ali.z * this.alignmentWeight +
                   coh.z * this.cohesionWeight +
                   att.z * this.attractorWeight
            });

            // Boundary wrapping
            agent.update(dt);

            const b = this.bounds;
            if (agent.position.x > b) agent.position.x = -b;
            if (agent.position.x < -b) agent.position.x = b;
            if (agent.position.y > b) agent.position.y = -b;
            if (agent.position.y < -b) agent.position.y = b;
            if (agent.position.z > b) agent.position.z = -b;
            if (agent.position.z < -b) agent.position.z = b;
        }
    }

    /**
     * Get agent positions for rendering
     * @returns {Array<Object>} Array of positions
     */
    getPositions() {
        return this.agents.map(a => ({ ...a.position }));
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HARMONIC RESONANCE CASCADE - Frequencies that build on Plastic ratios
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Harmonic Resonance Cascade system
 *
 * Creates complex wave interference patterns using Plastic-ratio harmonics.
 */
export class HarmonicCascade {
    /**
     * Create a harmonic cascade
     * @param {number} [baseFrequency=1] - Base frequency
     * @param {number} [harmonicCount=7] - Number of harmonics
     */
    constructor(baseFrequency = 1, harmonicCount = 7) {
        this.baseFrequency = baseFrequency;
        this.harmonics = [];
        this.resonanceEnergy = 0;
        this.cascadeLevel = 0;

        // Generate harmonics using Plastic ratio
        for (let i = 0; i < harmonicCount; i++) {
            this.harmonics.push({
                frequency: baseFrequency * getPlasticPower(i),
                amplitude: 1 / getPlasticPower(i),
                phase: 0,
                resonance: 0
            });
        }
    }

    /**
     * Update the cascade with an input signal
     * @param {number} inputFrequency - Input frequency to check for resonance
     * @param {number} inputAmplitude - Input amplitude
     * @param {number} dt - Time step
     */
    update(inputFrequency, inputAmplitude, dt = 0.016) {
        let totalResonance = 0;

        for (const harmonic of this.harmonics) {
            // Update phase
            harmonic.phase += harmonic.frequency * dt * Math.PI * 2;

            // Check for resonance (frequency matching)
            const freqRatio = inputFrequency / harmonic.frequency;
            const nearInteger = Math.abs(freqRatio - Math.round(freqRatio));

            // Also check for Plastic ratio relationships
            const plasticMatch = Math.abs(freqRatio - PLASTIC_CONSTANT);
            const plasticInvMatch = Math.abs(freqRatio - PLASTIC_CONSTANT_INV);

            let resonanceBoost = 0;

            // Integer harmonics
            if (nearInteger < 0.05) {
                resonanceBoost = (1 - nearInteger / 0.05) * inputAmplitude;
            }

            // Plastic ratio harmonics - creates unique resonance patterns
            if (plasticMatch < 0.1) {
                resonanceBoost += (1 - plasticMatch / 0.1) * inputAmplitude * PLASTIC_CONSTANT;
            }
            if (plasticInvMatch < 0.1) {
                resonanceBoost += (1 - plasticInvMatch / 0.1) * inputAmplitude * PLASTIC_CONSTANT_INV;
            }

            // Apply resonance with decay
            harmonic.resonance = harmonic.resonance * 0.95 + resonanceBoost * 0.1;
            harmonic.amplitude = (1 / getPlasticPower(this.harmonics.indexOf(harmonic))) +
                                harmonic.resonance;

            totalResonance += harmonic.resonance;
        }

        // Update cascade level - triggers at Plastic thresholds
        this.resonanceEnergy = this.resonanceEnergy * 0.98 + totalResonance * 0.02;

        // Cascade triggers at Plastic powers
        const cascadeThresholds = [
            PLASTIC_CONSTANT,
            PLASTIC_CONSTANT_SQ,
            PLASTIC_CONSTANT_CUBE,
            getPlasticPower(4),
            getPlasticPower(5)
        ];

        this.cascadeLevel = 0;
        for (let i = cascadeThresholds.length - 1; i >= 0; i--) {
            if (this.resonanceEnergy > cascadeThresholds[i]) {
                this.cascadeLevel = i + 1;
                break;
            }
        }
    }

    /**
     * Sample the cascade waveform at a given time
     * @param {number} t - Time
     * @returns {number} Combined waveform value
     */
    sample(t) {
        let value = 0;
        for (const harmonic of this.harmonics) {
            value += Math.sin(t * harmonic.frequency * Math.PI * 2 + harmonic.phase) *
                    harmonic.amplitude;
        }
        return value / this.harmonics.length;
    }

    /**
     * Get modulation values for rendering
     * @returns {Object} Modulation parameters
     */
    getModulation() {
        return {
            energy: this.resonanceEnergy,
            cascadeLevel: this.cascadeLevel,
            harmonics: this.harmonics.map(h => ({
                frequency: h.frequency,
                amplitude: h.amplitude,
                resonance: h.resonance
            }))
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL FRACTAL ENGINE - Self-similar patterns through time
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Temporal Fractal system - creates patterns that are self-similar across time scales
 */
export class TemporalFractal {
    /**
     * Create a temporal fractal
     * @param {number} [layers=5] - Number of time scale layers
     */
    constructor(layers = 5) {
        this.layers = [];
        this.globalTime = 0;

        // Each layer operates at a different time scale (Plastic-ratio scaled)
        for (let i = 0; i < layers; i++) {
            this.layers.push({
                timeScale: getPlasticPower(i),
                phase: 0,
                value: 0,
                history: [],
                maxHistory: Math.floor(20 * getPlasticPower(i))
            });
        }
    }

    /**
     * Update the temporal fractal
     * @param {number} dt - Time step
     * @param {number} [input=0] - External input value
     */
    update(dt, input = 0) {
        this.globalTime += dt;

        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const scaledTime = this.globalTime * layer.timeScale;

            // Base pattern - combines sine waves at Plastic-ratio frequencies
            let pattern = 0;
            for (let j = 0; j <= i; j++) {
                pattern += Math.sin(scaledTime * getPlasticPower(j)) / getPlasticPower(j);
            }

            // Modulate with input
            pattern *= (1 + input * PLASTIC_ALPHA_1);

            // Feed forward from previous layer
            if (i > 0) {
                pattern += this.layers[i - 1].value * PLASTIC_ALPHA_2;
            }

            // Store in history for recursive patterns
            layer.history.push(pattern);
            if (layer.history.length > layer.maxHistory) {
                layer.history.shift();
            }

            // Current value includes echo from history (self-similarity)
            const echoIndex = Math.floor(layer.history.length * PLASTIC_ALPHA_1);
            const echo = layer.history[echoIndex] || 0;

            layer.value = pattern * 0.7 + echo * 0.3;
        }
    }

    /**
     * Sample the fractal at all layers
     * @returns {Array<number>} Values at each layer
     */
    sample() {
        return this.layers.map(l => l.value);
    }

    /**
     * Get combined emergent value
     * @returns {number} Combined fractal value
     */
    getCombinedValue() {
        let combined = 0;
        for (let i = 0; i < this.layers.length; i++) {
            combined += this.layers[i].value / getPlasticPower(i);
        }
        return combined / this.layers.length;
    }

    /**
     * Get modulation suitable for rendering parameters
     * @returns {Object} Modulation values
     */
    getModulation() {
        const values = this.sample();
        return {
            scale: 1 + values[0] * 0.3,
            rotation: values[1] * Math.PI * 2,
            hueShift: values[2] * 180,
            complexity: Math.abs(values[3] || 0),
            intensity: 0.5 + (values[4] || 0) * 0.5
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE INTERFERENCE SYSTEM - Complex wave interactions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phase Interference system - multiple wave sources creating moiré patterns
 */
export class PhaseInterference {
    /**
     * Create phase interference system
     * @param {number} [sourceCount=4] - Number of wave sources
     */
    constructor(sourceCount = 4) {
        this.sources = [];

        // Position sources using Plastic sampling
        for (let i = 0; i < sourceCount; i++) {
            const sample = getPlasticSamplingPoint(i, 0.5);
            this.sources.push({
                x: (sample.x - 0.5) * 2,
                y: (sample.y - 0.5) * 2,
                frequency: PLASTIC_CONSTANT * (i + 1),
                phase: 0,
                amplitude: 1 / (i + 1)
            });
        }

        this.time = 0;
    }

    /**
     * Update wave phases
     * @param {number} dt - Time step
     */
    update(dt) {
        this.time += dt;

        for (const source of this.sources) {
            source.phase += source.frequency * dt;
        }
    }

    /**
     * Sample interference pattern at a point
     * @param {number} x - X coordinate (-1 to 1)
     * @param {number} y - Y coordinate (-1 to 1)
     * @returns {number} Interference value
     */
    sample(x, y) {
        let value = 0;

        for (const source of this.sources) {
            // Distance from source
            const dx = x - source.x;
            const dy = y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Wave value at this point
            value += Math.sin(dist * source.frequency * Math.PI * 2 + source.phase) *
                    source.amplitude * Math.exp(-dist * 0.5);
        }

        return value;
    }

    /**
     * Generate interference grid
     * @param {number} resolution - Grid resolution
     * @returns {Array<Array<number>>} 2D interference pattern
     */
    generateGrid(resolution) {
        const grid = [];

        for (let y = 0; y < resolution; y++) {
            const row = [];
            for (let x = 0; x < resolution; x++) {
                const nx = (x / resolution) * 2 - 1;
                const ny = (y / resolution) * 2 - 1;
                row.push(this.sample(nx, ny));
            }
            grid.push(row);
        }

        return grid;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIMENSIONAL BLEEDING - Higher dimensions projecting through
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Dimensional Bleeding system - simulates 4D/5D geometry projecting into 3D
 */
export class DimensionalBleeding {
    /**
     * Create dimensional bleeding system
     * @param {number} [baseDimension=4] - Base extra dimension (4 or 5)
     */
    constructor(baseDimension = 4) {
        this.dimension = baseDimension;
        this.rotation = {
            xy: 0, xz: 0, xw: 0,
            yz: 0, yw: 0, zw: 0,
            // 5D rotations
            xv: 0, yv: 0, zv: 0, wv: 0
        };
        this.bleedIntensity = 0;
        this.portalPhase = 0;
    }

    /**
     * Update dimensional rotations
     * @param {number} dt - Time step
     * @param {number} [intensity=0] - External intensity modulation (0-1)
     */
    update(dt, intensity = 0) {
        // Rotate through 4D space at Plastic-ratio speeds
        this.rotation.xw += dt * PLASTIC_CONSTANT * 0.5;
        this.rotation.yw += dt * PLASTIC_CONSTANT_INV * 0.7;
        this.rotation.zw += dt * PLASTIC_ALPHA_1 * 0.6;

        if (this.dimension >= 5) {
            this.rotation.xv += dt * PLASTIC_ALPHA_2 * 0.4;
            this.rotation.yv += dt * PLASTIC_CONSTANT_INV * 0.3;
            this.rotation.zv += dt * PLASTIC_CONSTANT * 0.25;
            this.rotation.wv += dt * PLASTIC_ALPHA_1 * 0.35;
        }

        // Bleed intensity oscillates at Plastic frequencies
        this.portalPhase += dt * PLASTIC_CONSTANT;
        this.bleedIntensity = intensity * 0.5 +
            0.25 * (1 + Math.sin(this.portalPhase)) +
            0.25 * (1 + Math.sin(this.portalPhase * PLASTIC_CONSTANT));
    }

    /**
     * Project a 4D/5D point into 3D
     * @param {Object} point - Point with x, y, z, w (and optionally v)
     * @returns {Object} Projected 3D point with scale and intensity
     */
    project(point) {
        let { x, y, z } = point;
        let w = point.w ?? 0;
        let v = point.v ?? 0;

        // Apply 4D rotations
        let temp;

        // XW rotation
        temp = x * Math.cos(this.rotation.xw) - w * Math.sin(this.rotation.xw);
        w = x * Math.sin(this.rotation.xw) + w * Math.cos(this.rotation.xw);
        x = temp;

        // YW rotation
        temp = y * Math.cos(this.rotation.yw) - w * Math.sin(this.rotation.yw);
        w = y * Math.sin(this.rotation.yw) + w * Math.cos(this.rotation.yw);
        y = temp;

        // ZW rotation
        temp = z * Math.cos(this.rotation.zw) - w * Math.sin(this.rotation.zw);
        w = z * Math.sin(this.rotation.zw) + w * Math.cos(this.rotation.zw);
        z = temp;

        // 5D rotations if applicable
        if (this.dimension >= 5 && v !== 0) {
            // XV rotation
            temp = x * Math.cos(this.rotation.xv) - v * Math.sin(this.rotation.xv);
            v = x * Math.sin(this.rotation.xv) + v * Math.cos(this.rotation.xv);
            x = temp;

            // WV rotation
            temp = w * Math.cos(this.rotation.wv) - v * Math.sin(this.rotation.wv);
            v = w * Math.sin(this.rotation.wv) + v * Math.cos(this.rotation.wv);
            w = temp;
        }

        // Perspective projection from 4D/5D to 3D
        const perspectiveDistance = 3;
        const wProjection = perspectiveDistance / (perspectiveDistance - w * this.bleedIntensity);
        const vProjection = this.dimension >= 5 ?
            perspectiveDistance / (perspectiveDistance - v * this.bleedIntensity * 0.5) : 1;

        const scale = wProjection * vProjection;

        return {
            x: x * scale,
            y: y * scale,
            z: z * scale,
            scale: Math.abs(scale),
            // Intensity based on position in higher dimensions
            intensity: 0.5 + 0.5 * Math.cos(w * Math.PI),
            // Color shift from dimensional position
            dimensionalHue: ((w + 1) / 2 + (v + 1) / 4) * 360
        };
    }

    /**
     * Generate a 4D hypercube vertices
     * @returns {Array<Object>} Array of 4D points
     */
    generateHypercube() {
        const vertices = [];

        // 16 vertices of a tesseract
        for (let i = 0; i < 16; i++) {
            vertices.push({
                x: (i & 1) ? 1 : -1,
                y: (i & 2) ? 1 : -1,
                z: (i & 4) ? 1 : -1,
                w: (i & 8) ? 1 : -1
            });
        }

        return vertices;
    }

    /**
     * Get current bleed state for rendering
     * @returns {Object} Bleed parameters
     */
    getBleedState() {
        return {
            intensity: this.bleedIntensity,
            rotation: { ...this.rotation },
            dimension: this.dimension
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENT COMPLEXITY ORCHESTRATOR - Ties all systems together
// ═══════════════════════════════════════════════════════════════════════════

/**
 * EmergentComplexity - Master orchestrator for all emergent systems
 *
 * This class coordinates multiple emergent systems to create exponentially
 * complex behaviors through their interactions.
 */
export class EmergentComplexity {
    /**
     * Create the emergent complexity orchestrator
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Initialize all subsystems
        this.swarm = new PlasticSwarm(options.swarmCount || 100, options.bounds || 5);
        this.harmonics = new HarmonicCascade(options.baseFrequency || 1, 7);
        this.temporalFractal = new TemporalFractal(5);
        this.phaseInterference = new PhaseInterference(4);
        this.dimensionalBleeding = new DimensionalBleeding(options.dimension || 4);

        // Cross-system modulation strengths
        this.crossModulation = {
            harmonicsToSwarm: PLASTIC_ALPHA_1,
            swarmToHarmonics: PLASTIC_ALPHA_2,
            fractalToAll: PLASTIC_CONSTANT_INV,
            bleedingToAll: PLASTIC_ALPHA_1 * 0.5
        };

        // Global state
        this.time = 0;
        this.complexityIndex = 0;
    }

    /**
     * Update all systems with cross-modulation
     * @param {number} dt - Time step
     * @param {Object} externalInput - External inputs (audio, etc.)
     */
    update(dt, externalInput = {}) {
        this.time += dt;

        // Extract external inputs
        const audioAmplitude = externalInput.amplitude ?? 0;
        const audioFrequency = externalInput.frequency ?? 220;
        const userInput = externalInput.userInput ?? 0;

        // === Update Temporal Fractal (feeds into others) ===
        this.temporalFractal.update(dt, audioAmplitude);
        const fractalMod = this.temporalFractal.getModulation();

        // === Update Harmonic Cascade ===
        this.harmonics.update(audioFrequency, audioAmplitude, dt);
        const harmonicMod = this.harmonics.getModulation();

        // === Cross-modulate swarm with harmonics and fractal ===
        this.swarm.separationWeight = PLASTIC_CONSTANT *
            (1 + harmonicMod.energy * this.crossModulation.harmonicsToSwarm);
        this.swarm.cohesionWeight = PLASTIC_ALPHA_2 *
            fractalMod.intensity * this.crossModulation.fractalToAll;

        // Change attractor type based on cascade level
        const attractorTypes = ['lorenz', 'rossler', 'thomas', 'aizawa', 'halvorsen'];
        this.swarm.attractorType = attractorTypes[harmonicMod.cascadeLevel % attractorTypes.length];

        this.swarm.update(dt);

        // === Update phase interference ===
        this.phaseInterference.update(dt);

        // Modulate sources with swarm density
        const swarmCenter = this.getSwarmCenter();
        for (let i = 0; i < this.phaseInterference.sources.length; i++) {
            this.phaseInterference.sources[i].amplitude =
                (1 / (i + 1)) * (1 + fractalMod.scale * 0.5);
        }

        // === Update dimensional bleeding ===
        this.dimensionalBleeding.update(dt, harmonicMod.cascadeLevel / 5 + audioAmplitude * 0.5);

        // === Calculate complexity index ===
        this.updateComplexityIndex(harmonicMod, fractalMod);
    }

    /**
     * Calculate swarm center of mass
     */
    getSwarmCenter() {
        const positions = this.swarm.getPositions();
        const center = { x: 0, y: 0, z: 0 };

        for (const pos of positions) {
            center.x += pos.x;
            center.y += pos.y;
            center.z += pos.z;
        }

        const count = positions.length;
        return {
            x: center.x / count,
            y: center.y / count,
            z: center.z / count
        };
    }

    /**
     * Update the complexity index
     */
    updateComplexityIndex(harmonicMod, fractalMod) {
        // Complexity grows with resonance, cascade level, and fractal depth
        const harmonicComplexity = harmonicMod.energy * harmonicMod.cascadeLevel;
        const fractalComplexity = fractalMod.complexity;
        const dimensionalComplexity = this.dimensionalBleeding.bleedIntensity;

        // Exponential combination
        this.complexityIndex =
            harmonicComplexity * PLASTIC_CONSTANT +
            fractalComplexity * PLASTIC_CONSTANT_SQ +
            dimensionalComplexity * PLASTIC_CONSTANT_CUBE;
    }

    /**
     * Get all rendering parameters for the current state
     * @returns {Object} Combined rendering parameters
     */
    getRenderingParams() {
        const fractalMod = this.temporalFractal.getModulation();
        const harmonicMod = this.harmonics.getModulation();
        const bleedState = this.dimensionalBleeding.getBleedState();

        return {
            // Swarm positions
            swarmPositions: this.swarm.getPositions(),
            attractorState: { ...this.swarm.attractorState },
            attractorType: this.swarm.attractorType,

            // Harmonic state
            resonanceEnergy: harmonicMod.energy,
            cascadeLevel: harmonicMod.cascadeLevel,
            harmonics: harmonicMod.harmonics,

            // Fractal modulation
            fractalScale: fractalMod.scale,
            fractalRotation: fractalMod.rotation,
            fractalHueShift: fractalMod.hueShift,
            fractalIntensity: fractalMod.intensity,

            // Dimensional state
            bleedIntensity: bleedState.intensity,
            dimensionalRotation: bleedState.rotation,

            // Phase interference sample at center
            interferenceValue: this.phaseInterference.sample(0, 0),

            // Overall complexity
            complexityIndex: this.complexityIndex,
            time: this.time
        };
    }

    /**
     * Generate points for Phillips Renderer with all emergent effects
     * @param {number} baseCount - Base number of points
     * @returns {Array<Object>} Points array for PhillipsRenderer
     */
    generatePoints(baseCount) {
        const points = [];
        const params = this.getRenderingParams();

        // Points from swarm
        for (const pos of params.swarmPositions) {
            // Project through dimensional bleeding
            const projected = this.dimensionalBleeding.project({
                x: pos.x / 5,
                y: pos.y / 5,
                z: pos.z / 5,
                w: Math.sin(this.time + pos.x * PLASTIC_ALPHA_1)
            });

            const interference = this.phaseInterference.sample(
                projected.x * 0.5,
                projected.y * 0.5
            );

            points.push({
                x: projected.x,
                y: projected.y,
                z: projected.z,
                scale: 0.03 * projected.scale * (1 + interference * 0.3),
                color: this.complexityToColor(
                    (projected.dimensionalHue + params.fractalHueShift) % 360,
                    projected.intensity * params.fractalIntensity
                )
            });
        }

        // Additional Plastic-sampled points influenced by attractor
        const extraCount = Math.floor(baseCount - params.swarmPositions.length);
        for (let i = 0; i < extraCount; i++) {
            const sample = getPlasticSamplingPoint3D(i, 0.5);

            // Attractor influence
            const attractorInfluence = 0.2;
            let x = (sample.x - 0.5) * 4 + params.attractorState.x * attractorInfluence;
            let y = (sample.y - 0.5) * 4 + params.attractorState.y * attractorInfluence;
            let z = (sample.z - 0.5) * 4 + params.attractorState.z * attractorInfluence;

            // Modulate with fractal
            x *= params.fractalScale;
            y *= params.fractalScale;

            const hue = (params.fractalHueShift + i * PLASTIC_ALPHA_1 * 10) % 360;
            const intensity = 0.5 + params.interferenceValue * 0.3;

            points.push({
                x, y, z,
                scale: 0.02 * params.fractalScale,
                color: this.complexityToColor(hue, intensity)
            });
        }

        return points;
    }

    /**
     * Convert complexity parameters to RGB color
     */
    complexityToColor(hue, intensity) {
        // HSL to RGB
        const h = hue / 360;
        const s = 0.8;
        const l = 0.3 + intensity * 0.4;

        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
}

export default {
    PLASTIC_CONSTANT,
    PLASTIC_CONSTANT_INV,
    PLASTIC_CONSTANT_SQ,
    PLASTIC_CONSTANT_CUBE,
    PLASTIC_ALPHA_1,
    PLASTIC_ALPHA_2,
    getPadovanSequence,
    getPadovanNumber,
    getPlasticSamplingPoint,
    getPlasticSamplingPoint3D,
    generatePlasticSamplingGrid,
    getPlasticPower,
    getPlasticScaleFactor,
    packRGB565,
    unpackRGB565,
    hasSufficientCoverage,
    // Strange Attractors
    lorenzStep,
    generateLorenzTrajectory,
    rosslerStep,
    thomasStep,
    aizawaStep,
    halvorsenStep,
    // Emergent Systems
    SwarmAgent,
    PlasticSwarm,
    HarmonicCascade,
    TemporalFractal,
    PhaseInterference,
    DimensionalBleeding,
    EmergentComplexity
};
