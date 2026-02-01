/**
 * ChromaSimulation — Full ChromaWar game engine
 *
 * Three colour factions (Red, Yellow, Blue) war across tilting planes.
 * ~300 cluster agents with emergent behaviours:
 *   - Ant-like trails (small fast groups leave pheromone-like attraction)
 *   - Squid-like expansion/contraction (pulsing clusters)
 *   - Slime mold growth (merging toward resource-rich areas)
 *   - Vine-like tendrils (elongated cluster formations)
 *   - Orbital debris (scattered remnants after liberation)
 *   - Rise and fall of cities (crystal fortress formation/destruction)
 *
 * 200K particles follow cluster centroids via damped spring physics.
 * Capture/liberation with membrane formation around prisoners.
 * Crystal lattice formations at size milestones.
 * Player barrier lines (max 3, 8s duration).
 * Win condition: balance all three colours.
 *
 * Colour indices:
 *   0=Red  1=Yellow  2=Blue
 *   3-8=captured tints  9-11=crystal  12=membrane
 */

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const MAX_PARTICLES = 200000;
const INITIAL_CLUSTERS = 300;
const WORLD_RADIUS = 8.0;

// Flocking
const W_SEPARATION  = 2.5;
const W_COHESION    = 1.2;
const W_ALIGNMENT   = 0.5;
const W_CHASE       = 2.5;
const W_FLEE        = 3.0;
const W_SEEK_ALLY   = 0.5;
const W_BARRIER     = 4.0;
const W_CENTER      = 0.4;
const W_PHEROMONE   = 0.5;  // ant trail attraction

// Physics
const CLUSTER_SPEED     = 2.5;
const CLUSTER_MAX_SPEED = 5.0;
const PARTICLE_DAMP     = 0.96;
const PARTICLE_SPRING   = 0.12;
const PARTICLE_SCATTER  = 0.04;

// Spatial hash
const HASH_CELL_SIZE = 1.0;
const HASH_TABLE_SIZE = 4096;

// Capture
const CAPTURE_RADIUS = 1.2;
const CAPTURE_MIN_RATIO = 1.3;
const MEMBRANE_PARTICLES_PER_CLUSTER = 30; // ring around captured groups

// Crystal milestones
const CRYSTAL_SEED    = 80;
const CRYSTAL_GROWING = 400;
const CRYSTAL_FULL    = 800;
const CRYSTAL_FORT    = 3000;

// Player lines
const MAX_PLAYER_LINES = 3;
const LINE_DURATION    = 8.0;
const LINE_THICKNESS   = 0.15;

// Plane tilt — dramatic Z-axis separation
const TILT_MAX     = 1.5;
const TILT_DAMPING = 0.93;
const TILT_SPRING  = 0.02;

// Behavioural modes
const MODE_SWARM   = 0;  // default flocking
const MODE_ANT     = 1;  // fast, trail-following
const MODE_SQUID   = 2;  // pulsing expand/contract
const MODE_SLIME   = 3;  // merging toward density
const MODE_VINE    = 4;  // elongated tendrils
const MODE_DEBRIS  = 5;  // scattered post-liberation

// Noise table
const NOISE_SIZE = 8192;
const NOISE_MASK = NOISE_SIZE - 1;
const _noise = new Float32Array(NOISE_SIZE);
for (let i = 0; i < NOISE_SIZE; i++) _noise[i] = Math.random() - 0.5;
let _noiseIdx = 0;

// Tint map
const TINT_MAP = [
    [0, 3, 4],  // Red captured by [R, Y, B]
    [6, 1, 5],  // Yellow captured by [R, Y, B]
    [7, 8, 2],  // Blue captured by [R, Y, B]
];

/* ================================================================== */
/*  SpatialHash                                                        */
/* ================================================================== */

class SpatialHash {
    constructor() {
        this.invCell = 1.0 / HASH_CELL_SIZE;
        this.table = new Array(HASH_TABLE_SIZE);
        for (let i = 0; i < HASH_TABLE_SIZE; i++) this.table[i] = [];
    }
    clear() { for (let i = 0; i < HASH_TABLE_SIZE; i++) this.table[i].length = 0; }
    _hash(cx, cy) {
        let h = (cx * 92837111) ^ (cy * 689287499);
        h = ((h >> 16) ^ h) & (HASH_TABLE_SIZE - 1);
        return h < 0 ? h + HASH_TABLE_SIZE : h;
    }
    insert(id, x, y) {
        this.table[this._hash(Math.floor(x * this.invCell), Math.floor(y * this.invCell))].push(id);
    }
    query(x, y, radius) {
        const res = [], r = Math.ceil(radius * this.invCell);
        const cx0 = Math.floor(x * this.invCell), cy0 = Math.floor(y * this.invCell);
        for (let dx = -r; dx <= r; dx++)
            for (let dy = -r; dy <= r; dy++) {
                const b = this.table[this._hash(cx0 + dx, cy0 + dy)];
                for (let i = 0; i < b.length; i++) res.push(b[i]);
            }
        return res;
    }
}

/* ================================================================== */
/*  Crystal lattice generators                                         */
/* ================================================================== */

function hexLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    const rows = Math.ceil(Math.sqrt(count));
    let n = 0;
    for (let r = -rows; r <= rows && n < count; r++)
        for (let c = -rows; c <= rows && n < count; c++) {
            pts[n*2]   = cx + c * spacing + (r & 1) * spacing * 0.5;
            pts[n*2+1] = cy + r * spacing * 0.866;
            n++;
        }
    return pts;
}
function cubicLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    const side = Math.ceil(Math.sqrt(count));
    let n = 0;
    for (let r = 0; r < side && n < count; r++)
        for (let c = 0; c < side && n < count; c++) {
            pts[n*2]   = cx + (c - side*0.5) * spacing;
            pts[n*2+1] = cy + (r - side*0.5) * spacing;
            n++;
        }
    return pts;
}
function octaLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    let n = 0;
    pts[0] = cx; pts[1] = cy; n++;
    for (let ring = 1; n < count; ring++) {
        const k = ring * 8;
        for (let i = 0; i < k && n < count; i++) {
            const a = (i / k) * Math.PI * 2;
            pts[n*2]   = cx + Math.cos(a) * ring * spacing;
            pts[n*2+1] = cy + Math.sin(a) * ring * spacing;
            n++;
        }
    }
    return pts;
}
const LATTICE_FNS = [hexLattice, cubicLattice, octaLattice];

/* ================================================================== */
/*  Pheromone map (for ant-mode trail following)                       */
/* ================================================================== */

const PHERO_GRID = 64;
const PHERO_CELL = WORLD_RADIUS * 2 / PHERO_GRID;
const pheromones = [
    new Float32Array(PHERO_GRID * PHERO_GRID), // Red
    new Float32Array(PHERO_GRID * PHERO_GRID), // Yellow
    new Float32Array(PHERO_GRID * PHERO_GRID), // Blue
];

function pheroDeposit(color, x, y, amount) {
    const gx = Math.floor((x + WORLD_RADIUS) / PHERO_CELL);
    const gy = Math.floor((y + WORLD_RADIUS) / PHERO_CELL);
    if (gx >= 0 && gx < PHERO_GRID && gy >= 0 && gy < PHERO_GRID)
        pheromones[color][gy * PHERO_GRID + gx] += amount;
}

function pheroSample(color, x, y) {
    const gx = Math.floor((x + WORLD_RADIUS) / PHERO_CELL);
    const gy = Math.floor((y + WORLD_RADIUS) / PHERO_CELL);
    if (gx >= 0 && gx < PHERO_GRID && gy >= 0 && gy < PHERO_GRID)
        return pheromones[color][gy * PHERO_GRID + gx];
    return 0;
}

function pheroGradient(color, x, y) {
    const s = PHERO_CELL;
    const l = pheroSample(color, x - s, y);
    const r = pheroSample(color, x + s, y);
    const u = pheroSample(color, x, y - s);
    const d = pheroSample(color, x, y + s);
    return { x: r - l, y: d - u };
}

function pheroDecay() {
    for (let c = 0; c < 3; c++) {
        const p = pheromones[c];
        for (let i = 0; i < p.length; i++) p[i] *= 0.98;
    }
}

/* ================================================================== */
/*  Main Simulation                                                    */
/* ================================================================== */

export class ChromaSimulation {
    constructor({
        particleCount = MAX_PARTICLES,
        clusterCount = INITIAL_CLUSTERS,
    } = {}) {
        this.particleCount = particleCount;
        this.clusterCount = clusterCount;

        // Cluster arrays
        this.cx = new Float32Array(clusterCount);
        this.cy = new Float32Array(clusterCount);
        this.cvx = new Float32Array(clusterCount);
        this.cvy = new Float32Array(clusterCount);
        this.ccolor = new Uint8Array(clusterCount);
        this.cstate = new Uint8Array(clusterCount);         // 0=free, 1=captured
        this.ccaptor = new Int32Array(clusterCount).fill(-1);
        this.csize = new Uint32Array(clusterCount);
        this.ccrystal = new Uint8Array(clusterCount);       // crystal level
        this.calive = new Uint8Array(clusterCount).fill(1);
        this.cmode = new Uint8Array(clusterCount);           // behavioural mode
        this.cpulse = new Float32Array(clusterCount);        // squid pulse phase
        this.ctrail = new Float32Array(clusterCount);        // ant trail strength
        this.cangle = new Float32Array(clusterCount);        // vine growth angle
        this.cmembrane = new Uint8Array(clusterCount);       // has membrane particles

        // Particle arrays
        this.px = null;   // bound to renderer
        this.pa = null;
        this.pvx = new Float32Array(particleCount);
        this.pvy = new Float32Array(particleCount);
        this.pcluster = new Int32Array(particleCount).fill(-1);
        this.pflag = new Uint8Array(particleCount);          // 0=normal, 1=membrane

        // Plane tilts
        this.planeTilts = [new Float32Array(4), new Float32Array(4), new Float32Array(4)];

        // Player lines
        this.playerLines = [];

        // Spatial hash
        this.hash = new SpatialHash();

        // Game state
        this.time = 0;
        this.balance = [0, 0, 0];
        this.isBalanced = false;
        this.balanceMetric = 0;
        this.score = 0;
        this._frameCount = 0;

        // Stats
        this.stats = {
            simTimeMs: 0,
            clusterCount: clusterCount,
            capturedCount: 0,
            crystalCount: 0,
            largestCluster: 0,
            activeModes: [0, 0, 0, 0, 0, 0],
        };

        this._initClusters();
    }

    /* ============================================================== */
    /*  Init                                                           */
    /* ============================================================== */

    _initClusters() {
        const perColor = Math.floor(this.clusterCount / 3);
        for (let i = 0; i < this.clusterCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * WORLD_RADIUS * 0.75;
            this.cx[i] = Math.cos(a) * d;
            this.cy[i] = Math.sin(a) * d;
            this.cvx[i] = Math.cos(a + 1.5) * 0.3;
            this.cvy[i] = Math.sin(a + 1.5) * 0.3;
            this.ccolor[i] = i < perColor ? 0 : i < perColor * 2 ? 1 : 2;
            // Random initial behavioural mode
            this.cmode[i] = Math.floor(Math.random() * 5); // 0-4
            this.cpulse[i] = Math.random() * Math.PI * 2;
            this.cangle[i] = Math.random() * Math.PI * 2;
        }
    }

    bindBuffers(positions, attribs) {
        this.px = positions;
        this.pa = attribs;
    }

    initParticles() {
        if (!this.px || !this.pa) throw new Error('Call bindBuffers first');
        const perCluster = Math.floor(this.particleCount / this.clusterCount);

        for (let i = 0; i < this.particleCount; i++) {
            const ci = Math.min(Math.floor(i / perCluster), this.clusterCount - 1);
            this.pcluster[i] = ci;
            this.csize[ci]++;

            const idx2 = i * 2;
            this.px[idx2]     = this.cx[ci] + _noise[(_noiseIdx++) & NOISE_MASK] * 0.8;
            this.px[idx2 + 1] = this.cy[ci] + _noise[(_noiseIdx++) & NOISE_MASK] * 0.8;

            const idx4 = i * 4;
            this.pa[idx4]     = this.ccolor[ci];
            this.pa[idx4 + 1] = 0;
            this.pa[idx4 + 2] = 80 + ((i * 137) & 127);
            this.pa[idx4 + 3] = 0;
        }

        // Pre-set crystal levels
        for (let i = 0; i < this.clusterCount; i++) {
            const s = this.csize[i];
            if (s >= CRYSTAL_FORT) this.ccrystal[i] = 4;
            else if (s >= CRYSTAL_FULL) this.ccrystal[i] = 3;
            else if (s >= CRYSTAL_GROWING) this.ccrystal[i] = 2;
            else if (s >= CRYSTAL_SEED) this.ccrystal[i] = 1;
        }
    }

    /* ============================================================== */
    /*  Step                                                           */
    /* ============================================================== */

    step(dt) {
        const t0 = performance.now();
        dt = Math.min(dt, 0.033);
        this.time += dt;
        this._frameCount++;

        this._buildHash();
        this._updateBehaviouralModes();
        this._stepClusters(dt);

        if (this._frameCount % 3 === 0) this._checkCapture();
        if (this._frameCount % 5 === 0) pheroDecay();

        this._stepPlaneTilts(dt);
        this._stepPlayerLines(dt);
        this._updateParticlesAndColors(dt);

        if (this._frameCount % 30 === 0) this._stepCrystals();
        if (this._frameCount % 10 === 0) this._updateMembranes();

        this._calcBalance();
        this.stats.simTimeMs = performance.now() - t0;
    }

    _buildHash() {
        this.hash.clear();
        for (let i = 0; i < this.clusterCount; i++) {
            if (this.calive[i]) this.hash.insert(i, this.cx[i], this.cy[i]);
        }
    }

    /* -------------------------------------------------------------- */
    /*  Behavioural mode selection                                     */
    /* -------------------------------------------------------------- */

    _updateBehaviouralModes() {
        if (this._frameCount % 20 !== 0) return; // every 20 frames

        const modeCount = [0, 0, 0, 0, 0, 0];

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i] || this.cstate[i] === 1) continue;

            const size = this.csize[i];
            const nb = this.hash.query(this.cx[i], this.cy[i], 3);
            let enemyNear = 0, allyNear = 0;
            for (let j = 0; j < nb.length; j++) {
                const k = nb[j];
                if (k === i || !this.calive[k]) continue;
                if (this.ccolor[k] === this.ccolor[i]) allyNear++;
                else enemyNear++;
            }

            // Mode selection based on conditions
            if (size < 50) {
                // Small: ant mode (fast, trail-following scouts)
                this.cmode[i] = MODE_ANT;
            } else if (size > 2000 && this.ccrystal[i] >= 2) {
                // Large crystal: city mode (stationary fortress) → uses SWARM but slow
                this.cmode[i] = MODE_SWARM;
            } else if (enemyNear > allyNear && size < 300) {
                // Outnumbered: squid mode (pulsing evasion)
                this.cmode[i] = MODE_SQUID;
            } else if (allyNear > 3 && size > 100) {
                // Many allies: slime mode (merge toward density)
                this.cmode[i] = MODE_SLIME;
            } else if (size > 200 && enemyNear > 0) {
                // Medium with enemies: vine mode (aggressive tendrils)
                this.cmode[i] = MODE_VINE;
            } else {
                this.cmode[i] = MODE_SWARM;
            }

            modeCount[this.cmode[i]]++;
        }

        this.stats.activeModes = modeCount;
    }

    /* -------------------------------------------------------------- */
    /*  Cluster AI                                                     */
    /* -------------------------------------------------------------- */

    _stepClusters(dt) {
        let capturedCount = 0, crystalCount = 0, largest = 0;

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;

            // Captured clusters drift toward captor
            if (this.cstate[i] === 1) {
                capturedCount++;
                const cap = this.ccaptor[i];
                if (cap >= 0 && this.calive[cap]) {
                    this.cvx[i] += (this.cx[cap] - this.cx[i]) * 0.02;
                    this.cvy[i] += (this.cy[cap] - this.cy[i]) * 0.02;
                }
                this.cvx[i] *= 0.98; this.cvy[i] *= 0.98;
                this.cx[i] += this.cvx[i] * dt;
                this.cy[i] += this.cvy[i] * dt;
                continue;
            }

            if (this.ccrystal[i] > 0) crystalCount++;
            if (this.csize[i] > largest) largest = this.csize[i];

            // Deposit pheromones (ant mode deposits more)
            const pheroAmt = this.cmode[i] === MODE_ANT ? 0.5 : 0.1;
            pheroDeposit(this.ccolor[i], this.cx[i], this.cy[i], pheroAmt * this.csize[i] * 0.001);

            const nb = this.hash.query(this.cx[i], this.cy[i], 3);
            let sepX = 0, sepY = 0;
            let cohX = 0, cohY = 0, cohN = 0;
            let aliX = 0, aliY = 0, aliN = 0;
            let chaseX = 0, chaseY = 0;
            let fleeX = 0, fleeY = 0;

            for (let ni = 0; ni < nb.length; ni++) {
                const j = nb[ni];
                if (j === i || !this.calive[j]) continue;
                const dx = this.cx[j] - this.cx[i], dy = this.cy[j] - this.cy[i];
                const d2 = dx * dx + dy * dy;
                if (d2 < 0.001) continue;
                const d = Math.sqrt(d2);

                if (d < 1.5) {
                    const repel = 1.0 / d2;
                    sepX -= dx * repel; sepY -= dy * repel;
                }

                if (this.ccolor[j] === this.ccolor[i]) {
                    cohX += this.cx[j]; cohY += this.cy[j]; cohN++;
                    aliX += this.cvx[j]; aliY += this.cvy[j]; aliN++;
                } else if (this.cstate[j] !== 1) {
                    const myS = this.csize[i], thS = this.csize[j];
                    if (myS > thS * CAPTURE_MIN_RATIO && d < 2.5) {
                        chaseX += dx / d; chaseY += dy / d;
                    } else if (thS > myS * CAPTURE_MIN_RATIO && d < 3.0) {
                        const u = 1.0 / Math.max(d, 0.5);
                        fleeX -= dx / d * u; fleeY -= dy / d * u;
                    }
                }
            }

            let fx = sepX * W_SEPARATION + chaseX * W_CHASE + fleeX * W_FLEE;
            let fy = sepY * W_SEPARATION + chaseY * W_CHASE + fleeY * W_FLEE;

            if (cohN > 0) {
                fx += ((cohX / cohN) - this.cx[i]) * W_COHESION;
                fy += ((cohY / cohN) - this.cy[i]) * W_COHESION;
            }
            if (aliN > 0) {
                fx += (aliX / aliN) * W_ALIGNMENT;
                fy += (aliY / aliN) * W_ALIGNMENT;
            }

            // ---- Mode-specific behaviours ----
            const mode = this.cmode[i];

            if (mode === MODE_ANT) {
                // Follow pheromone gradient of own colour
                const grad = pheroGradient(this.ccolor[i], this.cx[i], this.cy[i]);
                fx += grad.x * W_PHEROMONE;
                fy += grad.y * W_PHEROMONE;
                this.ctrail[i] += dt;
            }

            if (mode === MODE_SQUID) {
                // Pulsing: alternate between expand and contract
                this.cpulse[i] += dt * 4.0;
                const pulse = Math.sin(this.cpulse[i]);
                // On expand: push away from center of allies
                // On contract: pull toward center of allies
                if (cohN > 0) {
                    const toCoh = pulse * 0.8;
                    fx += ((cohX / cohN) - this.cx[i]) * toCoh;
                    fy += ((cohY / cohN) - this.cy[i]) * toCoh;
                }
            }

            if (mode === MODE_SLIME) {
                // Move toward highest density of same-colour pheromone
                const grad = pheroGradient(this.ccolor[i], this.cx[i], this.cy[i]);
                fx += grad.x * 0.6;
                fy += grad.y * 0.6;
            }

            if (mode === MODE_VINE) {
                // Grow in a consistent direction (toward nearest enemy)
                this.cangle[i] += dt * 0.1;
                if (chaseX !== 0 || chaseY !== 0) {
                    this.cangle[i] = Math.atan2(chaseY, chaseX);
                }
                fx += Math.cos(this.cangle[i]) * 0.8;
                fy += Math.sin(this.cangle[i]) * 0.8;
            }

            if (mode === MODE_DEBRIS) {
                // Chaotic scatter — only happens right after liberation
                fx += _noise[(_noiseIdx + i) & NOISE_MASK] * 3.0;
                fy += _noise[(_noiseIdx + i + 2048) & NOISE_MASK] * 3.0;
                // Transition back to swarm after a few seconds
                if (this.ctrail[i] > 3.0) this.cmode[i] = MODE_SWARM;
                this.ctrail[i] += dt;
            }

            // Barrier avoidance
            for (let li = 0; li < this.playerLines.length; li++) {
                const L = this.playerLines[li];
                if (!L.active) continue;
                const dist = this._ptLineDist(this.cx[i], this.cy[i], L.x0, L.y0, L.x1, L.y1);
                if (dist < LINE_THICKNESS * 4) {
                    const nx = -(L.y1 - L.y0), ny = L.x1 - L.x0;
                    const nl = Math.sqrt(nx*nx + ny*ny) || 1;
                    const force = W_BARRIER / Math.max(dist, 0.1);
                    const side = (this.cx[i] - L.x0) * nx + (this.cy[i] - L.y0) * ny >= 0 ? 1 : -1;
                    fx += (nx / nl) * force * side;
                    fy += (ny / nl) * force * side;
                }
            }

            // Soft boundary
            const dc = Math.sqrt(this.cx[i] * this.cx[i] + this.cy[i] * this.cy[i]);
            if (dc > WORLD_RADIUS * 0.7) {
                const pull = (dc - WORLD_RADIUS * 0.7) * W_CENTER;
                fx -= (this.cx[i] / dc) * pull;
                fy -= (this.cy[i] / dc) * pull;
            }

            // Speed: smaller = faster, ant mode is fastest
            let speedMult = 1.0 / (1.0 + Math.log2(Math.max(this.csize[i], 1)) * 0.3);
            if (mode === MODE_ANT) speedMult *= 1.5;
            if (this.ccrystal[i] >= 3) speedMult *= 0.4; // crystal fortress = slow

            this.cvx[i] += fx * dt;
            this.cvy[i] += fy * dt;

            const spd = Math.sqrt(this.cvx[i] * this.cvx[i] + this.cvy[i] * this.cvy[i]);
            const maxSpd = CLUSTER_MAX_SPEED * speedMult;
            if (spd > maxSpd) { const s = maxSpd / spd; this.cvx[i] *= s; this.cvy[i] *= s; }

            this.cx[i] += this.cvx[i] * dt * CLUSTER_SPEED;
            this.cy[i] += this.cvy[i] * dt * CLUSTER_SPEED;

            // Hard boundary
            const r2 = this.cx[i] * this.cx[i] + this.cy[i] * this.cy[i];
            if (r2 > WORLD_RADIUS * WORLD_RADIUS) {
                const r = Math.sqrt(r2);
                this.cx[i] = (this.cx[i] / r) * WORLD_RADIUS;
                this.cy[i] = (this.cy[i] / r) * WORLD_RADIUS;
                const dot = this.cvx[i] * this.cx[i] + this.cvy[i] * this.cy[i];
                if (dot > 0) {
                    this.cvx[i] -= 2 * dot * this.cx[i] / r2;
                    this.cvy[i] -= 2 * dot * this.cy[i] / r2;
                }
            }
        }

        this.stats.capturedCount = capturedCount;
        this.stats.crystalCount = crystalCount;
        this.stats.largestCluster = largest;
    }

    /* -------------------------------------------------------------- */
    /*  Capture & Liberation                                           */
    /* -------------------------------------------------------------- */

    _checkCapture() {
        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i] || this.cstate[i] === 1) continue;
            const nb = this.hash.query(this.cx[i], this.cy[i], CAPTURE_RADIUS * 2);
            for (let ni = 0; ni < nb.length; ni++) {
                const j = nb[ni];
                if (j === i || !this.calive[j] || this.ccolor[j] === this.ccolor[i]) continue;
                const dx = this.cx[j]-this.cx[i], dy = this.cy[j]-this.cy[i];
                if (dx*dx + dy*dy > CAPTURE_RADIUS * CAPTURE_RADIUS) continue;

                if (this.csize[i] > this.csize[j] * CAPTURE_MIN_RATIO && this.cstate[j] !== 1) {
                    this._capture(i, j);
                } else if (this.csize[j] > this.csize[i] * CAPTURE_MIN_RATIO && this.cstate[i] !== 1) {
                    this._capture(j, i); break;
                }
            }
        }
    }

    _capture(captorIdx, victimIdx) {
        this.cstate[victimIdx] = 1;
        this.ccaptor[victimIdx] = captorIdx;
        this.csize[captorIdx] += this.csize[victimIdx];
        this.cmembrane[victimIdx] = 1; // membrane forms around prisoner

        // Liberate prisoners of victim that match captor's colour
        for (let k = 0; k < this.clusterCount; k++) {
            if (this.ccaptor[k] === victimIdx && this.cstate[k] === 1) {
                if (this.ccolor[k] === this.ccolor[captorIdx]) {
                    this._liberate(k);
                } else {
                    this.ccaptor[k] = captorIdx;
                }
            }
        }
    }

    _liberate(idx) {
        this.cstate[idx] = 0;
        this.ccaptor[idx] = -1;
        this.cmembrane[idx] = 0;
        this.cmode[idx] = MODE_DEBRIS; // scatter mode after liberation
        this.ctrail[idx] = 0; // reset debris timer
        const a = _noise[(_noiseIdx++) & NOISE_MASK] * Math.PI * 4;
        this.cvx[idx] = Math.cos(a) * 3.5;
        this.cvy[idx] = Math.sin(a) * 3.5;
    }

    /* -------------------------------------------------------------- */
    /*  Membrane formation                                             */
    /* -------------------------------------------------------------- */

    _updateMembranes() {
        if (!this.pa) return;

        // Reset membrane flags
        for (let i = 0; i < this.particleCount; i++) this.pflag[i] = 0;

        for (let ci = 0; ci < this.clusterCount; ci++) {
            if (!this.calive[ci] || this.cstate[ci] !== 1 || !this.cmembrane[ci]) continue;

            // Find particles of this cluster and mark edge ones as membrane
            const perCluster = Math.floor(this.particleCount / this.clusterCount);
            const start = ci * perCluster;
            const end = Math.min(start + perCluster * 2, this.particleCount);

            let marked = 0;
            const maxMembrane = Math.min(MEMBRANE_PARTICLES_PER_CLUSTER, this.csize[ci]);
            const centerX = this.cx[ci], centerY = this.cy[ci];

            // Find farthest particles from center → those become the membrane ring
            for (let i = start; i < end && marked < maxMembrane; i++) {
                if (this.pcluster[i] !== ci) continue;
                const dx = this.px[i*2] - centerX, dy = this.px[i*2+1] - centerY;
                const d = Math.sqrt(dx*dx + dy*dy);
                if (d > 0.2) { // only particles away from center
                    this.pflag[i] = 1;
                    // Push membrane particles outward to form ring
                    const targetR = 0.5 + this.csize[ci] * 0.0002;
                    const nx = dx / (d || 1), ny = dy / (d || 1);
                    this.pvx[i] += (nx * targetR - dx) * 0.05;
                    this.pvy[i] += (ny * targetR - dy) * 0.05;
                    marked++;
                }
            }
        }
    }

    /* -------------------------------------------------------------- */
    /*  Particles + colours (single 200K loop)                         */
    /* -------------------------------------------------------------- */

    _updateParticlesAndColors(dt) {
        if (!this.px || !this.pa) return;

        const px = this.px, pa = this.pa, pvx = this.pvx, pvy = this.pvy;
        const pcluster = this.pcluster, pflag = this.pflag;
        const cx = this.cx, cy = this.cy;
        const ccolor = this.ccolor, cstate = this.cstate, ccaptor = this.ccaptor;
        const ccrystal = this.ccrystal, calive = this.calive, cmode = this.cmode;
        const cpulse = this.cpulse;

        for (let i = 0; i < this.particleCount; i++) {
            const ci = pcluster[i];
            if (ci < 0 || !calive[ci]) continue;
            const i2 = i * 2, i4 = i * 4;

            // Target position (cluster center, with mode-specific offset)
            let tx = cx[ci], ty = cy[ci];

            // Squid mode: particles expand/contract with the pulse
            if (cmode[ci] === MODE_SQUID) {
                const pulse = Math.sin(cpulse[ci]) * 0.5 + 0.5;
                const dx = px[i2] - tx, dy = px[i2+1] - ty;
                const d = Math.sqrt(dx*dx + dy*dy) || 0.01;
                const targetD = 0.2 + pulse * 0.8;
                tx = tx + (dx / d) * targetD * 0.3;
                ty = ty + (dy / d) * targetD * 0.3;
            }

            // Spring toward target
            const dx = tx - px[i2], dy = ty - px[i2+1];
            pvx[i] = pvx[i] * PARTICLE_DAMP + dx * PARTICLE_SPRING;
            pvy[i] = pvy[i] * PARTICLE_DAMP + dy * PARTICLE_SPRING;

            // Scatter
            pvx[i] += _noise[(i + _noiseIdx) & NOISE_MASK] * PARTICLE_SCATTER;
            pvy[i] += _noise[(i + _noiseIdx + 4091) & NOISE_MASK] * PARTICLE_SCATTER;

            px[i2] += pvx[i];
            px[i2+1] += pvy[i];

            // Colour mapping
            const bc = ccolor[ci];
            let colorIdx = bc, stateVal = 0;

            if (pflag[i] === 1) {
                // Membrane particle — white/bright
                colorIdx = 12;
                stateVal = 200;
                pa[i4 + 3] = 255; // max glow
            } else if (cstate[ci] === 1 && ccaptor[ci] >= 0) {
                colorIdx = TINT_MAP[bc][ccolor[ccaptor[ci]]];
                stateVal = 128;
            } else if (ccrystal[ci] >= 2 && pa[i4+1] === 255) {
                colorIdx = 9 + bc;
                stateVal = 255;
            }

            pa[i4] = colorIdx;
            if (stateVal !== 255 || pa[i4+1] !== 255) pa[i4+1] = stateVal;
        }

        _noiseIdx = (_noiseIdx + 997) & NOISE_MASK;
    }

    /* -------------------------------------------------------------- */
    /*  Crystal formations                                             */
    /* -------------------------------------------------------------- */

    _stepCrystals() {
        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i] || this.cstate[i] === 1) continue;
            const s = this.csize[i];
            let level = 0;
            if (s >= CRYSTAL_FORT) level = 4;
            else if (s >= CRYSTAL_FULL) level = 3;
            else if (s >= CRYSTAL_GROWING) level = 2;
            else if (s >= CRYSTAL_SEED) level = 1;

            if (level > this.ccrystal[i]) {
                this.ccrystal[i] = level;
                if (level >= 2) this._arrangeCrystal(i);
            }
        }
    }

    _arrangeCrystal(ci) {
        const color = this.ccolor[ci];
        const latticeFn = LATTICE_FNS[color] || hexLattice;
        const level = this.ccrystal[ci];
        const spacing = level >= 3 ? 0.03 : 0.05;
        const max = Math.min(this.csize[ci], level >= 4 ? 2000 : level >= 3 ? 500 : 200);
        const lattice = latticeFn(this.cx[ci], this.cy[ci], max, spacing);

        const perC = Math.floor(this.particleCount / this.clusterCount);
        const start = ci * perC, end = Math.min(start + perC * 2, this.particleCount);
        let n = 0;
        for (let i = start; i < end && n < max; i++) {
            if (this.pcluster[i] !== ci) continue;
            const li = n * 2;
            if (li + 1 >= lattice.length) break;
            this.pvx[i] += (lattice[li] - this.px[i*2]) * 0.03;
            this.pvy[i] += (lattice[li+1] - this.px[i*2+1]) * 0.03;
            this.pa[i*4+1] = 255;
            this.pa[i*4+3] = 180 + ((i * 53) & 75);
            n++;
        }
    }

    /* -------------------------------------------------------------- */
    /*  Plane tilts                                                    */
    /* -------------------------------------------------------------- */

    _stepPlaneTilts(dt) {
        const mX = [0,0,0], mY = [0,0,0], mN = [0,0,0];
        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;
            const c = this.ccolor[i], w = this.csize[i];
            mX[c] += this.cx[i] * w; mY[c] += this.cy[i] * w; mN[c] += w;
        }
        for (let c = 0; c < 3; c++) {
            const t = this.planeTilts[c];
            if (mN[c] > 0) {
                t[2] += ((mX[c]/mN[c]/WORLD_RADIUS)*TILT_MAX - t[0]) * TILT_SPRING;
                t[3] += ((mY[c]/mN[c]/WORLD_RADIUS)*TILT_MAX - t[1]) * TILT_SPRING;
            }
            t[2] *= TILT_DAMPING; t[3] *= TILT_DAMPING;
            t[0] += t[2]; t[1] += t[3];
        }
    }

    getPlaneTilts() {
        const out = new Float32Array(9);
        for (let c = 0; c < 3; c++) {
            const t = this.planeTilts[c];
            const a = Math.sqrt(t[0]*t[0]+t[1]*t[1]);
            if (a > 0.0001) { out[c*3]=t[0]/a; out[c*3+1]=t[1]/a; out[c*3+2]=a; }
        }
        return out;
    }

    /* -------------------------------------------------------------- */
    /*  Player lines                                                   */
    /* -------------------------------------------------------------- */

    _stepPlayerLines(dt) {
        for (let i = this.playerLines.length - 1; i >= 0; i--) {
            this.playerLines[i].timeLeft -= dt;
            if (this.playerLines[i].timeLeft <= 0) this.playerLines.splice(i, 1);
        }
    }

    addPlayerLine(x0, y0, x1, y1) {
        if (this.playerLines.length >= MAX_PLAYER_LINES) return false;
        this.playerLines.push({ x0, y0, x1, y1, timeLeft: LINE_DURATION, active: true });
        return true;
    }

    _ptLineDist(px, py, x0, y0, x1, y1) {
        const dx = x1-x0, dy = y1-y0, l2 = dx*dx+dy*dy;
        if (l2 < 0.001) return Math.sqrt((px-x0)*(px-x0)+(py-y0)*(py-y0));
        let t = Math.max(0, Math.min(1, ((px-x0)*dx+(py-y0)*dy)/l2));
        const cx = x0+t*dx, cy = y0+t*dy;
        return Math.sqrt((px-cx)*(px-cx)+(py-cy)*(py-cy));
    }

    /* -------------------------------------------------------------- */
    /*  Balance                                                        */
    /* -------------------------------------------------------------- */

    _calcBalance() {
        this.balance[0] = this.balance[1] = this.balance[2] = 0;
        for (let i = 0; i < this.clusterCount; i++) {
            if (this.calive[i]) this.balance[this.ccolor[i]] += this.csize[i];
        }
        const tot = this.balance[0]+this.balance[1]+this.balance[2];
        if (!tot) { this.balanceMetric = 0; return; }
        const id = tot/3;
        this.balanceMetric = 1 - (Math.abs(this.balance[0]-id)+Math.abs(this.balance[1]-id)+Math.abs(this.balance[2]-id))/(2*tot);
        this.isBalanced = this.balanceMetric > 0.95;
        this.score += this.balanceMetric * 0.1;
    }

    /* -------------------------------------------------------------- */
    /*  Queries                                                        */
    /* -------------------------------------------------------------- */

    screenToWorld(sx, sy, cw, ch) {
        const a = cw / ch;
        return { x: ((sx/cw)*2-1)*WORLD_RADIUS*a, y: -((sy/ch)*2-1)*WORLD_RADIUS };
    }

    getActiveLineCount() { return this.playerLines.length; }
}

export default ChromaSimulation;
