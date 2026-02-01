/**
 * ChromaSimulation — ChromaWar game engine
 *
 * Architecture:
 *   ~300 cluster agents with full flocking AI (separation, cohesion, alignment,
 *   chase, flee, seek-allies, barrier avoidance)
 *
 *   200K particles follow cluster centroids via damped spring physics:
 *     vel = vel * 0.97 + (target - pos) * 0.08
 *
 *   Capture/liberation state machine: FREE → CAPTURED → RELEASED → FREE
 *   Crystal lattice formations at size milestones (100, 500, 1000, 5000+)
 *   3 tilting planes with mass-based physics
 *   Player barrier lines (max 3, 8s duration)
 *
 * Colour indices:
 *   0=Red  1=Yellow  2=Blue
 *   3-8=captured tints  9-11=crystal colours
 */

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const MAX_PARTICLES = 200000;
const INITIAL_CLUSTERS = 300;
const WORLD_RADIUS = 8.0;

// Flocking weights
const W_SEPARATION  = 1.8;
const W_COHESION    = 0.6;
const W_ALIGNMENT   = 0.4;
const W_CHASE       = 0.9;
const W_FLEE        = 1.5;
const W_SEEK_ALLY   = 0.5;
const W_BARRIER     = 2.5;
const W_CENTER      = 0.3;

// Physics
const CLUSTER_SPEED     = 1.2;
const CLUSTER_MAX_SPEED = 2.5;
const PARTICLE_DAMP     = 0.97;
const PARTICLE_SPRING   = 0.08;
const PARTICLE_SCATTER  = 0.02;

// Spatial hash
const HASH_CELL_SIZE = 1.0;
const HASH_TABLE_SIZE = 4096;

// Capture
const CAPTURE_RADIUS = 0.6;
const CAPTURE_MIN_RATIO = 1.5;

// Crystal milestones
const CRYSTAL_SEED    = 100;
const CRYSTAL_GROWING = 500;
const CRYSTAL_FULL    = 1000;
const CRYSTAL_FORT    = 5000;

// Player lines
const MAX_PLAYER_LINES = 3;
const LINE_DURATION    = 8.0;
const LINE_THICKNESS   = 0.15;

// Plane tilt
const TILT_MAX     = 0.12;
const TILT_DAMPING = 0.95;
const TILT_SPRING  = 0.002;

// Noise table (replaces Math.random in hot loops)
const NOISE_SIZE = 8192;
const NOISE_MASK = NOISE_SIZE - 1;
const _noise = new Float32Array(NOISE_SIZE);
for (let i = 0; i < NOISE_SIZE; i++) _noise[i] = Math.random() - 0.5;
let _noiseIdx = 0;
function noise() { return _noise[(_noiseIdx++) & NOISE_MASK]; }

// Capture tint map: [baseColor][captorColor] → colorIdx
const TINT_MAP = [
    [0, 3, 4],  // Red captured by [R, Y, B]
    [6, 1, 5],  // Yellow captured by [R, Y, B]
    [7, 8, 2],  // Blue captured by [R, Y, B]
];

/* ================================================================== */
/*  SpatialHash — O(1) neighbor queries for cluster agents             */
/* ================================================================== */

class SpatialHash {
    constructor(cellSize = HASH_CELL_SIZE, tableSize = HASH_TABLE_SIZE) {
        this.cellSize = cellSize;
        this.invCell = 1.0 / cellSize;
        this.tableSize = tableSize;
        this.table = new Array(tableSize);
        for (let i = 0; i < tableSize; i++) this.table[i] = [];
    }

    clear() {
        for (let i = 0; i < this.tableSize; i++) this.table[i].length = 0;
    }

    _hash(cx, cy) {
        let h = (cx * 92837111) ^ (cy * 689287499);
        h = ((h >> 16) ^ h) & (this.tableSize - 1);
        return h < 0 ? h + this.tableSize : h;
    }

    insert(id, x, y) {
        const cx = Math.floor(x * this.invCell);
        const cy = Math.floor(y * this.invCell);
        this.table[this._hash(cx, cy)].push(id);
    }

    query(x, y, radius) {
        const results = [];
        const r = Math.ceil(radius * this.invCell);
        const cx0 = Math.floor(x * this.invCell);
        const cy0 = Math.floor(y * this.invCell);

        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                const bucket = this.table[this._hash(cx0 + dx, cy0 + dy)];
                for (let i = 0; i < bucket.length; i++) results.push(bucket[i]);
            }
        }
        return results;
    }
}

/* ================================================================== */
/*  Crystal lattice generators                                         */
/* ================================================================== */

function hexLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    const rows = Math.ceil(Math.sqrt(count));
    let placed = 0;
    for (let r = -rows; r <= rows && placed < count; r++) {
        for (let c = -rows; c <= rows && placed < count; c++) {
            pts[placed * 2]     = cx + c * spacing + (r & 1) * spacing * 0.5;
            pts[placed * 2 + 1] = cy + r * spacing * 0.866;
            placed++;
        }
    }
    return pts;
}

function cubicLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    const side = Math.ceil(Math.sqrt(count));
    let placed = 0;
    for (let r = 0; r < side && placed < count; r++) {
        for (let c = 0; c < side && placed < count; c++) {
            pts[placed * 2]     = cx + (c - side * 0.5) * spacing;
            pts[placed * 2 + 1] = cy + (r - side * 0.5) * spacing;
            placed++;
        }
    }
    return pts;
}

function octaLattice(cx, cy, count, spacing) {
    const pts = new Float32Array(count * 2);
    let placed = 0;
    pts[0] = cx; pts[1] = cy; placed++;
    for (let ring = 1; placed < count; ring++) {
        const n = ring * 8;
        for (let i = 0; i < n && placed < count; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = ring * spacing;
            pts[placed * 2]     = cx + Math.cos(a) * r;
            pts[placed * 2 + 1] = cy + Math.sin(a) * r;
            placed++;
        }
    }
    return pts;
}

const LATTICE_FNS = [hexLattice, cubicLattice, octaLattice];

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

        /* ---- Cluster agent arrays ---- */
        this.cx = new Float32Array(clusterCount);
        this.cy = new Float32Array(clusterCount);
        this.cvx = new Float32Array(clusterCount);
        this.cvy = new Float32Array(clusterCount);
        this.ccolor = new Uint8Array(clusterCount);
        this.cstate = new Uint8Array(clusterCount);
        this.ccaptor = new Int32Array(clusterCount).fill(-1);
        this.csize = new Uint32Array(clusterCount);
        this.ccrystal = new Uint8Array(clusterCount);
        this.calive = new Uint8Array(clusterCount).fill(1);

        /* ---- Particle arrays (bound to renderer buffers) ---- */
        this.px = null;
        this.pa = null;
        this.pvx = new Float32Array(particleCount);
        this.pvy = new Float32Array(particleCount);
        this.pcluster = new Int32Array(particleCount).fill(-1);

        /* ---- Plane tilt state ---- */
        this.planeTilts = [
            new Float32Array(4),
            new Float32Array(4),
            new Float32Array(4),
        ];

        /* ---- Player barrier lines ---- */
        this.playerLines = [];

        /* ---- Spatial hash ---- */
        this.hash = new SpatialHash();

        /* ---- Game state ---- */
        this.time = 0;
        this.balance = [0, 0, 0];
        this.isBalanced = false;
        this.balanceMetric = 0;
        this.score = 0;
        this._frameCount = 0;

        /* ---- Crystal tracking ---- */
        // Per-cluster list of particle indices (rebuilt periodically)
        this._clusterParticleCache = null;
        this._cacheDirty = true;

        /* ---- Stats ---- */
        this.stats = {
            simTimeMs: 0,
            clusterCount: clusterCount,
            capturedCount: 0,
            crystalCount: 0,
            largestCluster: 0,
        };

        this._initClusters();
    }

    /* ============================================================== */
    /*  Initialization                                                 */
    /* ============================================================== */

    _initClusters() {
        const perColor = Math.floor(this.clusterCount / 3);
        for (let i = 0; i < this.clusterCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * WORLD_RADIUS * 0.8;
            this.cx[i] = Math.cos(angle) * dist;
            this.cy[i] = Math.sin(angle) * dist;
            const va = Math.random() * Math.PI * 2;
            this.cvx[i] = Math.cos(va) * 0.3;
            this.cvy[i] = Math.sin(va) * 0.3;
            if (i < perColor) this.ccolor[i] = 0;
            else if (i < perColor * 2) this.ccolor[i] = 1;
            else this.ccolor[i] = 2;
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

            // Deterministic scatter using noise table
            const idx2 = i * 2;
            const nx = noise();
            const ny = noise();
            this.px[idx2]     = this.cx[ci] + nx * 1.0;
            this.px[idx2 + 1] = this.cy[ci] + ny * 1.0;

            const idx4 = i * 4;
            this.pa[idx4]     = this.ccolor[ci];
            this.pa[idx4 + 1] = 0;
            this.pa[idx4 + 2] = 80 + ((i * 137) & 127); // deterministic size variation
            this.pa[idx4 + 3] = 0;
        }

        // Pre-set crystal levels so they don't all trigger on first step
        for (let i = 0; i < this.clusterCount; i++) {
            const size = this.csize[i];
            if (size >= CRYSTAL_FORT) this.ccrystal[i] = 4;
            else if (size >= CRYSTAL_FULL) this.ccrystal[i] = 3;
            else if (size >= CRYSTAL_GROWING) this.ccrystal[i] = 2;
            else if (size >= CRYSTAL_SEED) this.ccrystal[i] = 1;
        }

        this._updateParticlesAndColors();
    }

    /* ============================================================== */
    /*  Simulation step                                                */
    /* ============================================================== */

    step(dt) {
        const t0 = performance.now();
        dt = Math.min(dt, 0.033);
        this.time += dt;
        this._frameCount++;

        // 1. Build spatial hash of clusters
        this._buildHash();

        // 2. Update cluster AI
        this._stepClusters(dt);

        // 3. Check capture/liberation (every 3 frames to save CPU)
        if (this._frameCount % 3 === 0) {
            this._checkCapture();
        }

        // 4. Update plane tilts
        this._stepPlaneTilts(dt);

        // 5. Decay player lines
        this._stepPlayerLines(dt);

        // 6. Combined: update particles + colour attributes (single 200K loop)
        this._updateParticlesAndColors();

        // 7. Crystal formations (every 30 frames — expensive)
        if (this._frameCount % 30 === 0) {
            this._stepCrystals();
        }

        // 8. Calculate balance
        this._calcBalance();

        this.stats.simTimeMs = performance.now() - t0;
    }

    /* -------------------------------------------------------------- */
    /*  Spatial hash                                                    */
    /* -------------------------------------------------------------- */

    _buildHash() {
        this.hash.clear();
        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;
            this.hash.insert(i, this.cx[i], this.cy[i]);
        }
    }

    /* -------------------------------------------------------------- */
    /*  Cluster AI                                                     */
    /* -------------------------------------------------------------- */

    _stepClusters(dt) {
        let capturedCount = 0;
        let crystalCount = 0;
        let largest = 0;

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;

            if (this.cstate[i] === 1) {
                capturedCount++;
                const cap = this.ccaptor[i];
                if (cap >= 0 && this.calive[cap]) {
                    this.cvx[i] += (this.cx[cap] - this.cx[i]) * 0.02;
                    this.cvy[i] += (this.cy[cap] - this.cy[i]) * 0.02;
                }
                this.cvx[i] *= 0.98;
                this.cvy[i] *= 0.98;
                this.cx[i] += this.cvx[i] * dt;
                this.cy[i] += this.cvy[i] * dt;
                continue;
            }

            if (this.ccrystal[i] > 0) crystalCount++;
            if (this.csize[i] > largest) largest = this.csize[i];

            const neighbors = this.hash.query(this.cx[i], this.cy[i], 3.0);

            let sepX = 0, sepY = 0;
            let cohX = 0, cohY = 0, cohN = 0;
            let aliX = 0, aliY = 0, aliN = 0;
            let chaseX = 0, chaseY = 0;
            let fleeX = 0, fleeY = 0;
            let allyX = 0, allyY = 0, allyN = 0;

            for (let ni = 0; ni < neighbors.length; ni++) {
                const j = neighbors[ni];
                if (j === i || !this.calive[j]) continue;

                const dx = this.cx[j] - this.cx[i];
                const dy = this.cy[j] - this.cy[i];
                const d2 = dx * dx + dy * dy;
                if (d2 < 0.001) continue;
                const d = Math.sqrt(d2);

                if (d < 1.5) {
                    const repel = 1.0 / d2;
                    sepX -= dx * repel;
                    sepY -= dy * repel;
                }

                const sameColor = this.ccolor[j] === this.ccolor[i];

                if (sameColor) {
                    cohX += this.cx[j]; cohY += this.cy[j]; cohN++;
                    aliX += this.cvx[j]; aliY += this.cvy[j]; aliN++;
                    if (d > 2.0) {
                        allyX += dx / d;
                        allyY += dy / d;
                        allyN++;
                    }
                } else if (this.cstate[j] !== 1) {
                    const mySize = this.csize[i];
                    const theirSize = this.csize[j];
                    if (mySize > theirSize * CAPTURE_MIN_RATIO && d < 2.5) {
                        chaseX += dx / d;
                        chaseY += dy / d;
                    } else if (theirSize > mySize * CAPTURE_MIN_RATIO && d < 3.0) {
                        const urgency = 1.0 / Math.max(d, 0.5);
                        fleeX -= dx / d * urgency;
                        fleeY -= dy / d * urgency;
                    }
                }
            }

            let fx = sepX * W_SEPARATION;
            let fy = sepY * W_SEPARATION;

            if (cohN > 0) {
                fx += ((cohX / cohN) - this.cx[i]) * W_COHESION;
                fy += ((cohY / cohN) - this.cy[i]) * W_COHESION;
            }
            if (aliN > 0) {
                fx += (aliX / aliN) * W_ALIGNMENT;
                fy += (aliY / aliN) * W_ALIGNMENT;
            }

            fx += chaseX * W_CHASE + fleeX * W_FLEE;
            fy += chaseY * W_CHASE + fleeY * W_FLEE;

            if (allyN > 0) {
                fx += (allyX / allyN) * W_SEEK_ALLY;
                fy += (allyY / allyN) * W_SEEK_ALLY;
            }

            // Barrier avoidance
            for (let li = 0; li < this.playerLines.length; li++) {
                const line = this.playerLines[li];
                if (!line.active) continue;
                const dist = this._pointToLineDist(
                    this.cx[i], this.cy[i],
                    line.x0, line.y0, line.x1, line.y1
                );
                if (dist < LINE_THICKNESS * 4) {
                    const nx = -(line.y1 - line.y0);
                    const ny = line.x1 - line.x0;
                    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
                    const force = W_BARRIER / Math.max(dist, 0.1);
                    const side = (this.cx[i] - line.x0) * nx + (this.cy[i] - line.y0) * ny;
                    const sign = side >= 0 ? 1 : -1;
                    fx += (nx / nl) * force * sign;
                    fy += (ny / nl) * force * sign;
                }
            }

            // Soft boundary
            const distC = Math.sqrt(this.cx[i] * this.cx[i] + this.cy[i] * this.cy[i]);
            if (distC > WORLD_RADIUS * 0.7) {
                const pull = (distC - WORLD_RADIUS * 0.7) * W_CENTER;
                fx -= (this.cx[i] / distC) * pull;
                fy -= (this.cy[i] / distC) * pull;
            }

            // Speed based on cluster size (smaller = faster)
            const speedMult = 1.0 / (1.0 + Math.log2(Math.max(this.csize[i], 1)) * 0.3);

            this.cvx[i] += fx * dt;
            this.cvy[i] += fy * dt;

            // Clamp speed
            const spd = Math.sqrt(this.cvx[i] * this.cvx[i] + this.cvy[i] * this.cvy[i]);
            const maxSpd = CLUSTER_MAX_SPEED * speedMult;
            if (spd > maxSpd) {
                const s = maxSpd / spd;
                this.cvx[i] *= s;
                this.cvy[i] *= s;
            }

            if (this.ccrystal[i] >= 3) {
                this.cvx[i] *= 0.92;
                this.cvy[i] *= 0.92;
            }

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

            const neighbors = this.hash.query(this.cx[i], this.cy[i], CAPTURE_RADIUS * 2);

            for (let ni = 0; ni < neighbors.length; ni++) {
                const j = neighbors[ni];
                if (j === i || !this.calive[j]) continue;
                if (this.ccolor[j] === this.ccolor[i]) continue;

                const dx = this.cx[j] - this.cx[i];
                const dy = this.cy[j] - this.cy[i];
                if (dx * dx + dy * dy > CAPTURE_RADIUS * CAPTURE_RADIUS) continue;

                const mySize = this.csize[i];
                const theirSize = this.csize[j];

                if (mySize > theirSize * CAPTURE_MIN_RATIO && this.cstate[j] !== 1) {
                    this._captureCluster(i, j);
                } else if (theirSize > mySize * CAPTURE_MIN_RATIO && this.cstate[i] !== 1) {
                    this._captureCluster(j, i);
                    break;
                }
            }
        }
    }

    _captureCluster(captorIdx, victimIdx) {
        this.cstate[victimIdx] = 1;
        this.ccaptor[victimIdx] = captorIdx;
        this.csize[captorIdx] += this.csize[victimIdx];

        for (let k = 0; k < this.clusterCount; k++) {
            if (this.ccaptor[k] === victimIdx && this.cstate[k] === 1) {
                if (this.ccolor[k] === this.ccolor[captorIdx]) {
                    this._liberateCluster(k);
                } else {
                    this.ccaptor[k] = captorIdx;
                }
            }
        }
    }

    _liberateCluster(idx) {
        this.cstate[idx] = 0;
        this.ccaptor[idx] = -1;
        const angle = noise() * Math.PI * 4;
        this.cvx[idx] = Math.cos(angle) * 3.0;
        this.cvy[idx] = Math.sin(angle) * 3.0;
    }

    /* -------------------------------------------------------------- */
    /*  Combined: particle physics + colour mapping (single 200K loop) */
    /* -------------------------------------------------------------- */

    _updateParticlesAndColors() {
        if (!this.px || !this.pa) return;

        const px = this.px;
        const pa = this.pa;
        const pvx = this.pvx;
        const pvy = this.pvy;
        const pcluster = this.pcluster;
        const cx = this.cx;
        const cy = this.cy;
        const ccolor = this.ccolor;
        const cstate = this.cstate;
        const ccaptor = this.ccaptor;
        const ccrystal = this.ccrystal;
        const calive = this.calive;
        const count = this.particleCount;

        for (let i = 0; i < count; i++) {
            const ci = pcluster[i];
            if (ci < 0 || !calive[ci]) continue;

            const idx2 = i * 2;
            const idx4 = i * 4;

            // ---- Spring physics ----
            const dx = cx[ci] - px[idx2];
            const dy = cy[ci] - px[idx2 + 1];

            pvx[i] = pvx[i] * PARTICLE_DAMP + dx * PARTICLE_SPRING;
            pvy[i] = pvy[i] * PARTICLE_DAMP + dy * PARTICLE_SPRING;

            // Deterministic scatter (noise table, no Math.random)
            pvx[i] += _noise[(i + _noiseIdx) & NOISE_MASK] * PARTICLE_SCATTER;
            pvy[i] += _noise[(i + _noiseIdx + 4091) & NOISE_MASK] * PARTICLE_SCATTER;

            px[idx2]     += pvx[i];
            px[idx2 + 1] += pvy[i];

            // ---- Colour mapping ----
            const baseColor = ccolor[ci];
            const state = cstate[ci];
            const crystal = ccrystal[ci];

            let colorIdx = baseColor;
            let stateVal = 0;

            if (state === 1 && ccaptor[ci] >= 0) {
                colorIdx = TINT_MAP[baseColor][ccolor[ccaptor[ci]]];
                stateVal = 128;
            } else if (crystal >= 2 && pa[idx4 + 1] === 255) {
                // Already marked as crystal particle — keep crystal color
                colorIdx = 9 + baseColor;
                stateVal = 255;
            }

            pa[idx4] = colorIdx;
            if (stateVal !== 255 || pa[idx4 + 1] !== 255) {
                pa[idx4 + 1] = stateVal;
            }
        }

        // Advance noise offset each frame
        _noiseIdx = (_noiseIdx + 997) & NOISE_MASK;
    }

    /* -------------------------------------------------------------- */
    /*  Crystal formations (runs every ~30 frames)                     */
    /* -------------------------------------------------------------- */

    _stepCrystals() {
        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i] || this.cstate[i] === 1) continue;

            const size = this.csize[i];
            let level = 0;
            if (size >= CRYSTAL_FORT) level = 4;
            else if (size >= CRYSTAL_FULL) level = 3;
            else if (size >= CRYSTAL_GROWING) level = 2;
            else if (size >= CRYSTAL_SEED) level = 1;

            if (level > this.ccrystal[i]) {
                this.ccrystal[i] = level;
                if (level >= 2) {
                    this._arrangeCrystalFast(i);
                }
            }
        }
    }

    _arrangeCrystalFast(clusterIdx) {
        const color = this.ccolor[clusterIdx];
        const latticeFn = LATTICE_FNS[color] || hexLattice;
        const level = this.ccrystal[clusterIdx];
        const spacing = level >= 3 ? 0.03 : 0.05;
        const maxArrange = Math.min(
            this.csize[clusterIdx],
            level >= 4 ? 2000 : level >= 3 ? 500 : 200
        );

        const lattice = latticeFn(this.cx[clusterIdx], this.cy[clusterIdx], maxArrange, spacing);

        // Instead of scanning all 200K, use stride-based sampling
        // Particles for cluster ci are roughly at indices [ci*perCluster .. (ci+1)*perCluster]
        const perCluster = Math.floor(this.particleCount / this.clusterCount);
        const startIdx = clusterIdx * perCluster;
        const endIdx = Math.min(startIdx + perCluster * 2, this.particleCount);

        let arranged = 0;
        for (let i = startIdx; i < endIdx && arranged < maxArrange; i++) {
            if (this.pcluster[i] !== clusterIdx) continue;

            const li = arranged * 2;
            if (li + 1 >= lattice.length) break;

            this.pvx[i] += (lattice[li] - this.px[i * 2]) * 0.03;
            this.pvy[i] += (lattice[li + 1] - this.px[i * 2 + 1]) * 0.03;

            const idx4 = i * 4;
            this.pa[idx4 + 1] = 255;
            this.pa[idx4 + 3] = 180 + ((i * 53) & 75);

            arranged++;
        }
    }

    /* -------------------------------------------------------------- */
    /*  Plane tilt physics                                             */
    /* -------------------------------------------------------------- */

    _stepPlaneTilts(dt) {
        const massX = [0, 0, 0];
        const massY = [0, 0, 0];
        const massN = [0, 0, 0];

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;
            const c = this.ccolor[i];
            const w = this.csize[i];
            massX[c] += this.cx[i] * w;
            massY[c] += this.cy[i] * w;
            massN[c] += w;
        }

        for (let c = 0; c < 3; c++) {
            const tilt = this.planeTilts[c];
            if (massN[c] > 0) {
                const targetX = (massX[c] / massN[c] / WORLD_RADIUS) * TILT_MAX;
                const targetY = (massY[c] / massN[c] / WORLD_RADIUS) * TILT_MAX;
                tilt[2] += (targetX - tilt[0]) * TILT_SPRING;
                tilt[3] += (targetY - tilt[1]) * TILT_SPRING;
            }
            tilt[2] *= TILT_DAMPING;
            tilt[3] *= TILT_DAMPING;
            tilt[0] += tilt[2];
            tilt[1] += tilt[3];
        }
    }

    getPlaneTilts() {
        const out = new Float32Array(9);
        for (let c = 0; c < 3; c++) {
            const tilt = this.planeTilts[c];
            const ang = Math.sqrt(tilt[0] * tilt[0] + tilt[1] * tilt[1]);
            if (ang > 0.0001) {
                out[c * 3]     = tilt[0] / ang;
                out[c * 3 + 1] = tilt[1] / ang;
                out[c * 3 + 2] = ang;
            }
        }
        return out;
    }

    /* -------------------------------------------------------------- */
    /*  Player barrier lines                                           */
    /* -------------------------------------------------------------- */

    _stepPlayerLines(dt) {
        for (let i = this.playerLines.length - 1; i >= 0; i--) {
            this.playerLines[i].timeLeft -= dt;
            if (this.playerLines[i].timeLeft <= 0) {
                this.playerLines.splice(i, 1);
            }
        }
    }

    addPlayerLine(x0, y0, x1, y1) {
        if (this.playerLines.length >= MAX_PLAYER_LINES) return false;
        this.playerLines.push({ x0, y0, x1, y1, timeLeft: LINE_DURATION, active: true });
        return true;
    }

    _pointToLineDist(px, py, x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.001) return Math.sqrt((px-x0)*(px-x0) + (py-y0)*(py-y0));
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = x0 + t * dx, cy = y0 + t * dy;
        return Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy));
    }

    /* -------------------------------------------------------------- */
    /*  Balance calculation                                            */
    /* -------------------------------------------------------------- */

    _calcBalance() {
        this.balance[0] = this.balance[1] = this.balance[2] = 0;

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;
            this.balance[this.ccolor[i]] += this.csize[i];
        }

        const total = this.balance[0] + this.balance[1] + this.balance[2];
        if (total === 0) { this.balanceMetric = 0; return; }

        const ideal = total / 3;
        const dev = (
            Math.abs(this.balance[0] - ideal) +
            Math.abs(this.balance[1] - ideal) +
            Math.abs(this.balance[2] - ideal)
        ) / (2 * total);

        this.balanceMetric = 1.0 - dev;
        this.isBalanced = this.balanceMetric > 0.95;
        this.score += this.balanceMetric * 0.1;
    }

    /* -------------------------------------------------------------- */
    /*  Public queries                                                  */
    /* -------------------------------------------------------------- */

    screenToWorld(sx, sy, cw, ch) {
        const aspect = cw / ch;
        return {
            x: ((sx / cw) * 2 - 1) * WORLD_RADIUS * aspect,
            y: -((sy / ch) * 2 - 1) * WORLD_RADIUS,
        };
    }

    getActiveLineCount() {
        return this.playerLines.length;
    }
}

export default ChromaSimulation;
