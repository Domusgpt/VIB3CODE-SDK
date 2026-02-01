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
const W_CENTER      = 0.3;   // soft boundary pull

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
const CAPTURE_MIN_RATIO = 1.5;  // must be 1.5x larger to capture

// Crystal milestones
const CRYSTAL_SEED    = 100;
const CRYSTAL_GROWING = 500;
const CRYSTAL_FULL    = 1000;
const CRYSTAL_FORT    = 5000;

// Player lines
const MAX_PLAYER_LINES = 3;
const LINE_DURATION    = 8.0; // seconds
const LINE_THICKNESS   = 0.15;

// Plane tilt
const TILT_MAX     = 0.12;  // max tilt angle (radians-ish)
const TILT_DAMPING = 0.95;
const TILT_SPRING  = 0.002;

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
        // Simple spatial hash
        let h = (cx * 92837111) ^ (cy * 689287499);
        h = ((h >> 16) ^ h) & (this.tableSize - 1);
        return h < 0 ? h + this.tableSize : h;
    }

    insert(id, x, y) {
        const cx = Math.floor(x * this.invCell);
        const cy = Math.floor(y * this.invCell);
        const h = this._hash(cx, cy);
        this.table[h].push(id);
    }

    query(x, y, radius) {
        const results = [];
        const r = Math.ceil(radius * this.invCell);
        const cx0 = Math.floor(x * this.invCell);
        const cy0 = Math.floor(y * this.invCell);
        const r2 = radius * radius;

        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                const h = this._hash(cx0 + dx, cy0 + dy);
                const bucket = this.table[h];
                for (let i = 0; i < bucket.length; i++) {
                    results.push(bucket[i]);
                }
            }
        }
        return results;
    }
}

/* ================================================================== */
/*  UnionFind — cluster detection                                      */
/* ================================================================== */

class UnionFind {
    constructor(n) {
        this.parent = new Int32Array(n);
        this.rank = new Uint8Array(n);
        this.size = new Uint32Array(n);
        for (let i = 0; i < n; i++) {
            this.parent[i] = i;
            this.size[i] = 1;
        }
    }

    find(x) {
        while (this.parent[x] !== x) {
            this.parent[x] = this.parent[this.parent[x]]; // path halving
            x = this.parent[x];
        }
        return x;
    }

    union(a, b) {
        a = this.find(a);
        b = this.find(b);
        if (a === b) return;
        if (this.rank[a] < this.rank[b]) { const t = a; a = b; b = t; }
        this.parent[b] = a;
        this.size[a] += this.size[b];
        if (this.rank[a] === this.rank[b]) this.rank[a]++;
    }
}

/* ================================================================== */
/*  Crystal lattice generators                                         */
/* ================================================================== */

function hexLattice(cx, cy, count, spacing) {
    const pts = [];
    const rows = Math.ceil(Math.sqrt(count));
    let placed = 0;
    for (let r = -rows; r <= rows && placed < count; r++) {
        for (let c = -rows; c <= rows && placed < count; c++) {
            const x = cx + c * spacing + (r % 2) * spacing * 0.5;
            const y = cy + r * spacing * 0.866;
            pts.push(x, y);
            placed++;
        }
    }
    return pts;
}

function cubicLattice(cx, cy, count, spacing) {
    const pts = [];
    const side = Math.ceil(Math.sqrt(count));
    let placed = 0;
    for (let r = 0; r < side && placed < count; r++) {
        for (let c = 0; c < side && placed < count; c++) {
            const x = cx + (c - side/2) * spacing;
            const y = cy + (r - side/2) * spacing;
            pts.push(x, y);
            placed++;
        }
    }
    return pts;
}

function octaLattice(cx, cy, count, spacing) {
    const pts = [];
    let placed = 0;
    // Concentric octagons
    pts.push(cx, cy); placed++;
    for (let ring = 1; placed < count; ring++) {
        const n = ring * 8;
        for (let i = 0; i < n && placed < count; i++) {
            const a = (i / n) * Math.PI * 2;
            const r = ring * spacing;
            pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
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
    /**
     * @param {object} opts
     * @param {number} opts.particleCount  Total particles (default 200000)
     * @param {number} opts.clusterCount   Initial clusters (default 300)
     */
    constructor({
        particleCount = MAX_PARTICLES,
        clusterCount = INITIAL_CLUSTERS,
    } = {}) {
        this.particleCount = particleCount;
        this.clusterCount = clusterCount;

        /* ---- Cluster agent arrays ---- */
        // Position
        this.cx = new Float32Array(clusterCount);
        this.cy = new Float32Array(clusterCount);
        // Velocity
        this.cvx = new Float32Array(clusterCount);
        this.cvy = new Float32Array(clusterCount);
        // Color (0=R, 1=Y, 2=B)
        this.ccolor = new Uint8Array(clusterCount);
        // State (0=free, 1=captured)
        this.cstate = new Uint8Array(clusterCount);
        // Captor cluster index (-1 = none)
        this.ccaptor = new Int32Array(clusterCount).fill(-1);
        // Size (number of particles following this cluster)
        this.csize = new Uint32Array(clusterCount);
        // Crystal level (0=none, 1=seed, 2=growing, 3=full, 4=fortress)
        this.ccrystal = new Uint8Array(clusterCount);
        // Alive flag
        this.calive = new Uint8Array(clusterCount).fill(1);

        /* ---- Particle arrays (written directly to renderer buffers) ---- */
        // These will be set to reference the renderer's arrays
        this.px = null;  // Float32Array positions (count*2)
        this.pa = null;  // Uint8Array attribs (count*4)
        // Velocity (CPU only)
        this.pvx = new Float32Array(particleCount);
        this.pvy = new Float32Array(particleCount);
        // Which cluster each particle follows
        this.pcluster = new Int32Array(particleCount).fill(-1);

        /* ---- Plane tilt state ---- */
        // Each plane: [tiltX, tiltY, velX, velY]
        this.planeTilts = [
            new Float32Array(4), // Red
            new Float32Array(4), // Yellow
            new Float32Array(4), // Blue
        ];

        /* ---- Player barrier lines ---- */
        // Each line: { x0, y0, x1, y1, timeLeft, active }
        this.playerLines = [];

        /* ---- Spatial hash ---- */
        this.hash = new SpatialHash();

        /* ---- Game state ---- */
        this.time = 0;
        this.balance = [0, 0, 0]; // per-color population
        this.isBalanced = false;
        this.balanceMetric = 0; // 0-1, 1=perfect balance
        this.score = 0;

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
            // Spread clusters in world space
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * WORLD_RADIUS * 0.8;
            this.cx[i] = Math.cos(angle) * dist;
            this.cy[i] = Math.sin(angle) * dist;

            // Random initial velocity
            const va = Math.random() * Math.PI * 2;
            this.cvx[i] = Math.cos(va) * 0.3;
            this.cvy[i] = Math.sin(va) * 0.3;

            // Assign color: first third R, second third Y, rest B
            if (i < perColor) this.ccolor[i] = 0;
            else if (i < perColor * 2) this.ccolor[i] = 1;
            else this.ccolor[i] = 2;
        }
    }

    /**
     * Bind particle arrays to the renderer's buffers for zero-copy writes.
     * @param {Float32Array} positions  renderer.positions
     * @param {Uint8Array}   attribs    renderer.attribs
     */
    bindBuffers(positions, attribs) {
        this.px = positions;
        this.pa = attribs;
    }

    /**
     * Initialize particles — distribute evenly among clusters.
     */
    initParticles() {
        if (!this.px || !this.pa) throw new Error('Call bindBuffers first');

        const perCluster = Math.floor(this.particleCount / this.clusterCount);

        for (let i = 0; i < this.particleCount; i++) {
            const ci = Math.min(Math.floor(i / perCluster), this.clusterCount - 1);
            this.pcluster[i] = ci;
            this.csize[ci]++;

            // Scatter around cluster center
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 0.5;
            const idx2 = i * 2;
            this.px[idx2]     = this.cx[ci] + Math.cos(angle) * dist;
            this.px[idx2 + 1] = this.cy[ci] + Math.sin(angle) * dist;

            // Set attributes
            const idx4 = i * 4;
            this.pa[idx4]     = this.ccolor[ci]; // colorIdx (will be encoded properly)
            this.pa[idx4 + 1] = 0;               // state = free
            this.pa[idx4 + 2] = 80 + Math.floor(Math.random() * 80); // size
            this.pa[idx4 + 3] = 0;               // glow
        }

        this._updateColorMapping();
    }

    /* ============================================================== */
    /*  Simulation step                                                */
    /* ============================================================== */

    /**
     * Advance simulation by dt seconds.
     * @param {number} dt  Delta time (capped internally to 33ms)
     */
    step(dt) {
        const t0 = performance.now();
        dt = Math.min(dt, 0.033); // cap at ~30fps minimum
        this.time += dt;

        // 1. Build spatial hash of clusters
        this._buildHash();

        // 2. Update cluster AI (flocking + chase/flee)
        this._stepClusters(dt);

        // 3. Check capture/liberation
        this._checkCapture();

        // 4. Update plane tilts
        this._stepPlaneTilts(dt);

        // 5. Decay player lines
        this._stepPlayerLines(dt);

        // 6. Update particles (spring physics toward cluster centroids)
        this._stepParticles(dt);

        // 7. Update crystal formations
        this._stepCrystals();

        // 8. Update colour attributes
        this._updateColorMapping();

        // 9. Calculate balance
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
                // Captured clusters drift toward captor
                const cap = this.ccaptor[i];
                if (cap >= 0 && this.calive[cap]) {
                    const dx = this.cx[cap] - this.cx[i];
                    const dy = this.cy[cap] - this.cy[i];
                    this.cvx[i] += dx * 0.02;
                    this.cvy[i] += dy * 0.02;
                }
                this.cvx[i] *= 0.98;
                this.cvy[i] *= 0.98;
                this.cx[i] += this.cvx[i] * dt;
                this.cy[i] += this.cvy[i] * dt;
                continue;
            }

            if (this.ccrystal[i] > 0) crystalCount++;
            if (this.csize[i] > largest) largest = this.csize[i];

            // Query neighbors
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

                // Separation (all nearby)
                if (d < 1.5) {
                    const repel = 1.0 / d2;
                    sepX -= dx * repel;
                    sepY -= dy * repel;
                }

                const sameColor = this.ccolor[j] === this.ccolor[i];

                if (sameColor) {
                    // Cohesion + alignment with same-color
                    cohX += this.cx[j]; cohY += this.cy[j]; cohN++;
                    aliX += this.cvx[j]; aliY += this.cvy[j]; aliN++;

                    // Seek ally if far
                    if (d > 2.0) {
                        allyX += dx / d;
                        allyY += dy / d;
                        allyN++;
                    }
                } else if (this.cstate[j] !== 1) {
                    // Chase/flee based on relative size
                    const mySize = this.csize[i];
                    const theirSize = this.csize[j];

                    if (mySize > theirSize * CAPTURE_MIN_RATIO && d < 2.5) {
                        // Chase smaller enemy
                        chaseX += dx / d;
                        chaseY += dy / d;
                    } else if (theirSize > mySize * CAPTURE_MIN_RATIO && d < 3.0) {
                        // Flee larger enemy (smaller = faster)
                        const urgency = 1.0 / Math.max(d, 0.5);
                        fleeX -= dx / d * urgency;
                        fleeY -= dy / d * urgency;
                    }
                }
            }

            // Combine forces
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

            fx += chaseX * W_CHASE;
            fy += chaseY * W_CHASE;
            fx += fleeX * W_FLEE;
            fy += fleeY * W_FLEE;

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
                    // Push away from line
                    const nx = -(line.y1 - line.y0);
                    const ny = line.x1 - line.x0;
                    const nl = Math.sqrt(nx * nx + ny * ny) || 1;
                    const force = W_BARRIER / Math.max(dist, 0.1);
                    // Determine which side we're on
                    const side = (this.cx[i] - line.x0) * nx + (this.cy[i] - line.y0) * ny;
                    const sign = side >= 0 ? 1 : -1;
                    fx += (nx / nl) * force * sign;
                    fy += (ny / nl) * force * sign;
                }
            }

            // Soft boundary
            const distFromCenter = Math.sqrt(this.cx[i] * this.cx[i] + this.cy[i] * this.cy[i]);
            if (distFromCenter > WORLD_RADIUS * 0.7) {
                const pull = (distFromCenter - WORLD_RADIUS * 0.7) * W_CENTER;
                fx -= (this.cx[i] / distFromCenter) * pull;
                fy -= (this.cy[i] / distFromCenter) * pull;
            }

            // Speed based on cluster size (smaller = faster)
            const speedMult = 1.0 / (1.0 + Math.log2(Math.max(this.csize[i], 1)) * 0.3);

            // Apply forces
            this.cvx[i] += fx * dt;
            this.cvy[i] += fy * dt;

            // Clamp speed
            const spd = Math.sqrt(this.cvx[i] * this.cvx[i] + this.cvy[i] * this.cvy[i]);
            const maxSpd = CLUSTER_MAX_SPEED * speedMult;
            if (spd > maxSpd) {
                this.cvx[i] = (this.cvx[i] / spd) * maxSpd;
                this.cvy[i] = (this.cvy[i] / spd) * maxSpd;
            }

            // Crystal clusters move slower
            if (this.ccrystal[i] >= 3) {
                this.cvx[i] *= 0.92;
                this.cvy[i] *= 0.92;
            }

            // Integrate position
            this.cx[i] += this.cvx[i] * dt * CLUSTER_SPEED;
            this.cy[i] += this.cvy[i] * dt * CLUSTER_SPEED;

            // Hard boundary clamp
            const r2 = this.cx[i] * this.cx[i] + this.cy[i] * this.cy[i];
            if (r2 > WORLD_RADIUS * WORLD_RADIUS) {
                const r = Math.sqrt(r2);
                this.cx[i] = (this.cx[i] / r) * WORLD_RADIUS;
                this.cy[i] = (this.cy[i] / r) * WORLD_RADIUS;
                // Bounce velocity inward
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
                if (this.ccolor[j] === this.ccolor[i]) continue; // same color

                const dx = this.cx[j] - this.cx[i];
                const dy = this.cy[j] - this.cy[i];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > CAPTURE_RADIUS) continue;

                const mySize = this.csize[i];
                const theirSize = this.csize[j];

                // Larger captures smaller
                if (mySize > theirSize * CAPTURE_MIN_RATIO && this.cstate[j] !== 1) {
                    this._captureCluster(i, j);
                } else if (theirSize > mySize * CAPTURE_MIN_RATIO && this.cstate[i] !== 1) {
                    this._captureCluster(j, i);
                    break; // I got captured, stop checking
                }
            }
        }
    }

    _captureCluster(captorIdx, victimIdx) {
        this.cstate[victimIdx] = 1;
        this.ccaptor[victimIdx] = captorIdx;

        // Transfer size to captor
        this.csize[captorIdx] += this.csize[victimIdx];

        // Check if victim was a captor — liberate matching prisoners
        for (let k = 0; k < this.clusterCount; k++) {
            if (this.ccaptor[k] === victimIdx && this.cstate[k] === 1) {
                // Liberation! If prisoner color matches new captor color, they're freed
                if (this.ccolor[k] === this.ccolor[captorIdx]) {
                    this._liberateCluster(k);
                } else {
                    // Transfer to new captor
                    this.ccaptor[k] = captorIdx;
                }
            }
        }
    }

    _liberateCluster(idx) {
        this.cstate[idx] = 0;
        this.ccaptor[idx] = -1;

        // Radial scatter — give a burst velocity away from current position
        const angle = Math.random() * Math.PI * 2;
        this.cvx[idx] = Math.cos(angle) * 3.0;
        this.cvy[idx] = Math.sin(angle) * 3.0;
    }

    /* -------------------------------------------------------------- */
    /*  Particle spring physics                                        */
    /* -------------------------------------------------------------- */

    _stepParticles(dt) {
        if (!this.px) return;

        for (let i = 0; i < this.particleCount; i++) {
            const ci = this.pcluster[i];
            if (ci < 0 || !this.calive[ci]) continue;

            const idx2 = i * 2;
            const tx = this.cx[ci];
            const ty = this.cy[ci];

            // Spring toward cluster centroid
            let dx = tx - this.px[idx2];
            let dy = ty - this.px[idx2 + 1];

            this.pvx[i] = this.pvx[i] * PARTICLE_DAMP + dx * PARTICLE_SPRING;
            this.pvy[i] = this.pvy[i] * PARTICLE_DAMP + dy * PARTICLE_SPRING;

            // Small random scatter for organic look
            this.pvx[i] += (Math.random() - 0.5) * PARTICLE_SCATTER;
            this.pvy[i] += (Math.random() - 0.5) * PARTICLE_SCATTER;

            this.px[idx2]     += this.pvx[i];
            this.px[idx2 + 1] += this.pvy[i];
        }
    }

    /* -------------------------------------------------------------- */
    /*  Crystal formations                                             */
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

            // Upgrade crystal (never downgrade during a step to avoid flicker)
            if (level > this.ccrystal[i]) {
                this.ccrystal[i] = level;
                if (level >= 2) {
                    this._arrangeCrystal(i);
                }
            }
        }
    }

    _arrangeCrystal(clusterIdx) {
        const color = this.ccolor[clusterIdx];
        const latticeFn = LATTICE_FNS[color] || hexLattice;
        const level = this.ccrystal[clusterIdx];
        const spacing = level >= 3 ? 0.03 : 0.05;

        // Find particles belonging to this cluster and arrange them
        let arranged = 0;
        const maxArrange = Math.min(this.csize[clusterIdx], level >= 4 ? 2000 : level >= 3 ? 500 : 200);

        const lattice = latticeFn(this.cx[clusterIdx], this.cy[clusterIdx], maxArrange, spacing);

        for (let i = 0; i < this.particleCount && arranged < maxArrange; i++) {
            if (this.pcluster[i] !== clusterIdx) continue;

            const li = arranged * 2;
            if (li + 1 >= lattice.length) break;

            // Set target toward lattice position (soft, spring will handle it)
            const idx2 = i * 2;
            const lx = lattice[li];
            const ly = lattice[li + 1];

            // Blend current position toward lattice (don't snap instantly)
            this.pvx[i] += (lx - this.px[idx2]) * 0.03;
            this.pvy[i] += (ly - this.px[idx2 + 1]) * 0.03;

            // Mark as crystal in attribs
            const idx4 = i * 4;
            this.pa[idx4 + 1] = 255; // state = crystal
            this.pa[idx4 + 3] = 180 + Math.floor(Math.random() * 75); // high glow

            arranged++;
        }
    }

    /* -------------------------------------------------------------- */
    /*  Plane tilt physics                                             */
    /* -------------------------------------------------------------- */

    _stepPlaneTilts(dt) {
        // Calculate mass center for each color
        const massX = [0, 0, 0];
        const massY = [0, 0, 0];
        const massN = [0, 0, 0];

        for (let i = 0; i < this.clusterCount; i++) {
            if (!this.calive[i]) continue;
            const c = this.ccolor[i];
            const weight = this.csize[i];
            massX[c] += this.cx[i] * weight;
            massY[c] += this.cy[i] * weight;
            massN[c] += weight;
        }

        for (let c = 0; c < 3; c++) {
            const tilt = this.planeTilts[c];
            if (massN[c] > 0) {
                const cmx = massX[c] / massN[c];
                const cmy = massY[c] / massN[c];

                // Tilt toward center of mass
                const targetTiltX = (cmx / WORLD_RADIUS) * TILT_MAX;
                const targetTiltY = (cmy / WORLD_RADIUS) * TILT_MAX;

                tilt[2] += (targetTiltX - tilt[0]) * TILT_SPRING;
                tilt[3] += (targetTiltY - tilt[1]) * TILT_SPRING;
            }

            tilt[2] *= TILT_DAMPING;
            tilt[3] *= TILT_DAMPING;
            tilt[0] += tilt[2];
            tilt[1] += tilt[3];
        }
    }

    /**
     * Get plane tilt data formatted for the renderer.
     * Returns Float32Array(9): [axR,ayR,angR, axY,ayY,angY, axB,ayB,angB]
     */
    getPlaneTilts() {
        const out = new Float32Array(9);
        for (let c = 0; c < 3; c++) {
            const tilt = this.planeTilts[c];
            const ang = Math.sqrt(tilt[0] * tilt[0] + tilt[1] * tilt[1]);
            if (ang > 0.0001) {
                out[c * 3]     = tilt[0] / ang; // axis X
                out[c * 3 + 1] = tilt[1] / ang; // axis Y
                out[c * 3 + 2] = ang;            // angle
            }
        }
        return out;
    }

    /* -------------------------------------------------------------- */
    /*  Player barrier lines                                           */
    /* -------------------------------------------------------------- */

    _stepPlayerLines(dt) {
        for (let i = this.playerLines.length - 1; i >= 0; i--) {
            const line = this.playerLines[i];
            line.timeLeft -= dt;
            if (line.timeLeft <= 0) {
                line.active = false;
                this.playerLines.splice(i, 1);
            }
        }
    }

    /**
     * Add a player barrier line.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @returns {boolean} true if line was added
     */
    addPlayerLine(x0, y0, x1, y1) {
        if (this.playerLines.length >= MAX_PLAYER_LINES) return false;
        this.playerLines.push({
            x0, y0, x1, y1,
            timeLeft: LINE_DURATION,
            active: true,
        });
        return true;
    }

    _pointToLineDist(px, py, x0, y0, x1, y1) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.001) return Math.sqrt((px-x0)*(px-x0) + (py-y0)*(py-y0));
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = x0 + t * dx;
        const cy = y0 + t * dy;
        return Math.sqrt((px-cx)*(px-cx) + (py-cy)*(py-cy));
    }

    /* -------------------------------------------------------------- */
    /*  Colour attribute mapping                                       */
    /* -------------------------------------------------------------- */

    _updateColorMapping() {
        if (!this.pa) return;

        for (let i = 0; i < this.particleCount; i++) {
            const ci = this.pcluster[i];
            if (ci < 0) continue;

            const baseColor = this.ccolor[ci];
            const state = this.cstate[ci];
            const crystal = this.ccrystal[ci];
            const idx4 = i * 4;

            let colorIdx = baseColor;

            if (state === 1 && this.ccaptor[ci] >= 0) {
                // Captured — use tinted color based on captor
                const captorColor = this.ccolor[this.ccaptor[ci]];
                // Map: base + captor → tint index
                //  R captured by Y → 3 (Orange)
                //  R captured by B → 4 (Purple)
                //  Y captured by B → 5 (Green)
                //  Y captured by R → 6 (Peach)
                //  B captured by R → 7 (Indigo)
                //  B captured by Y → 8 (Teal)
                const tintMap = [
                    [0, 3, 4],  // Red captured by [R, Y, B]
                    [6, 1, 5],  // Yellow captured by [R, Y, B]
                    [7, 8, 2],  // Blue captured by [R, Y, B]
                ];
                colorIdx = tintMap[baseColor][captorColor];
                this.pa[idx4 + 1] = 128; // state = captured
            } else if (crystal >= 2) {
                colorIdx = 9 + baseColor; // crystal color
                // pa[idx4+1] already set in _arrangeCrystal for crystal particles
            } else {
                if (this.pa[idx4 + 1] !== 255) { // don't override crystal state
                    this.pa[idx4 + 1] = 0; // state = free
                }
            }

            this.pa[idx4] = colorIdx;
        }
    }

    /* -------------------------------------------------------------- */
    /*  Balance calculation                                            */
    /* -------------------------------------------------------------- */

    _calcBalance() {
        this.balance[0] = 0;
        this.balance[1] = 0;
        this.balance[2] = 0;

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

        // Score accumulates based on balance
        this.score += this.balanceMetric * 0.1;
    }

    /* -------------------------------------------------------------- */
    /*  Public queries                                                  */
    /* -------------------------------------------------------------- */

    /**
     * Screen-space to world-space coordinate conversion.
     * @param {number} sx  Screen X (0 to canvas.width)
     * @param {number} sy  Screen Y (0 to canvas.height)
     * @param {number} cw  Canvas width
     * @param {number} ch  Canvas height
     * @returns {{ x: number, y: number }}
     */
    screenToWorld(sx, sy, cw, ch) {
        const aspect = cw / ch;
        const x = ((sx / cw) * 2 - 1) * WORLD_RADIUS * aspect;
        const y = -((sy / ch) * 2 - 1) * WORLD_RADIUS;
        return { x, y };
    }

    getActiveLineCount() {
        return this.playerLines.length;
    }
}

export default ChromaSimulation;
