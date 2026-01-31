/**
 * GalaxySplatGenerator
 *
 * Procedural generators that produce 100K–500K+ Gaussian splats from
 * a handful of parameters.  Demonstrates the core efficiency advantage:
 *
 *   250,000 splats × 48 bytes = 12 MB (traditional PLY)
 *   8 parameters   × 4 bytes  = 32 bytes (procedural)
 *   Compression ratio ≈ 375,000 : 1
 *
 * All generators set the `depth` field to non-zero values which the
 * shader uses as GPU-side animation amplitude — producing living,
 * breathing scenes with zero per-frame CPU cost.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function gaussRandom(mean, stddev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(Math.max(1e-10, u1))) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
}

function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [r + m, g + m, b + m];
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* ------------------------------------------------------------------ */
/*  Spiral Galaxy                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate a spiral galaxy with core bulge, spiral arms, halo, and
 * bright foreground stars.
 *
 * @param {object} [opts]
 * @param {number} [opts.armCount=4]         Number of spiral arms
 * @param {number} [opts.coreRadius=0.4]     Radius of the dense core
 * @param {number} [opts.armLength=3.5]      How far arms extend
 * @param {number} [opts.diskHeight=0.12]    Vertical thickness of disk
 * @param {number} [opts.windAngle=2.8]      Total winding (radians per arm)
 * @param {number} [opts.totalSplats=250000] Total splat budget
 * @param {number} [opts.scale=0.02]         Base splat radius
 * @returns {Object[]} GaussianSeed[]
 */
export function generateGalaxySplats({
    armCount = 4,
    coreRadius = 0.4,
    armLength = 3.5,
    diskHeight = 0.12,
    windAngle = 2.8,
    totalSplats = 250000,
    scale = 0.02,
} = {}) {
    const seeds = [];

    // Budget distribution
    const coreBudget = Math.floor(totalSplats * 0.18);
    const armBudget = Math.floor(totalSplats * 0.55);
    const interarmBudget = Math.floor(totalSplats * 0.08);
    const haloBudget = Math.floor(totalSplats * 0.12);
    const starBudget = totalSplats - coreBudget - armBudget - interarmBudget - haloBudget;

    // --- Core bulge (dense, hot, white-yellow) -----------------------
    for (let i = 0; i < coreBudget; i++) {
        const r = Math.abs(gaussRandom(0, coreRadius * 0.45));
        const theta = Math.random() * Math.PI * 2;
        const h = gaussRandom(0, diskHeight * 1.5) * (1 - r / (coreRadius * 2));

        const temp = clamp01(1 - r / coreRadius); // 1 at center, 0 at edge
        const lr = 0.85 + temp * 0.15;
        const lg = 0.75 + temp * 0.20;
        const lb = 0.55 + temp * 0.35;

        seeds.push({
            position: [r * Math.cos(theta), h, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.8 + Math.random() * 0.8) * (0.6 + temp * 0.8),
            color: [lr, lg, lb],
            depth: 0.4 + Math.random() * 0.3,
        });
    }

    // --- Spiral arms -------------------------------------------------
    const splatsPerArm = Math.floor(armBudget / armCount);
    for (let arm = 0; arm < armCount; arm++) {
        const armOffset = (arm / armCount) * Math.PI * 2;

        for (let i = 0; i < splatsPerArm; i++) {
            const t = Math.random(); // 0-1 along arm
            const r = coreRadius * 0.6 + t * armLength;
            const theta = armOffset + t * windAngle;

            // Perpendicular spread (gaussian, increases outward)
            const spread = 0.04 + t * 0.28;
            const perpAngle = theta + Math.PI / 2;
            const perpDist = gaussRandom(0, spread);
            const px = r * Math.cos(theta) + perpDist * Math.cos(perpAngle);
            const pz = r * Math.sin(theta) + perpDist * Math.sin(perpAngle);
            const py = gaussRandom(0, diskHeight * (1 + t * 0.6));

            // Color: young blue near core → old red at edges
            const temp = 1 - t;
            let color;
            if (temp > 0.6) {
                // Hot blue-white
                color = [0.6 + temp * 0.3, 0.7 + temp * 0.25, 0.95];
            } else if (temp > 0.3) {
                // Warm yellow-white
                const f = (temp - 0.3) / 0.3;
                color = [0.9, 0.7 + f * 0.2, 0.4 + f * 0.4];
            } else {
                // Cool orange-red
                color = [0.8 + temp, 0.3 + temp * 0.8, 0.15 + temp * 0.3];
            }
            // Brightness variation
            const bright = 0.6 + Math.random() * 0.4;
            color = color.map(c => c * bright);

            seeds.push({
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.6 + Math.random() * 0.7),
                color,
                depth: 0.3 + t * 0.5 + Math.random() * 0.2,
            });
        }
    }

    // --- Inter-arm disk (sparse filler) ------------------------------
    for (let i = 0; i < interarmBudget; i++) {
        const r = coreRadius + Math.random() * armLength * 0.9;
        const theta = Math.random() * Math.PI * 2;
        const py = gaussRandom(0, diskHeight * 0.8);
        const dim = 0.15 + Math.random() * 0.25;

        seeds.push({
            position: [r * Math.cos(theta), py, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.5 + Math.random() * 0.5),
            color: [dim * 0.9, dim * 0.7, dim],
            depth: 0.5 + Math.random() * 0.5,
        });
    }

    // --- Halo (spherical, dim) ---------------------------------------
    for (let i = 0; i < haloBudget; i++) {
        const r = coreRadius + Math.random() * armLength * 1.3 * Math.random();
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const px = r * Math.sin(phi) * Math.cos(theta);
        const py = r * Math.cos(phi) * 0.35; // flattened
        const pz = r * Math.sin(phi) * Math.sin(theta);

        const dim = 0.08 + Math.random() * 0.15;

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (1.0 + Math.random() * 1.5),
            color: [dim * 0.6, dim * 0.5, dim],
            depth: 0.6 + Math.random() * 0.4,
        });
    }

    // --- Bright foreground stars -------------------------------------
    for (let i = 0; i < starBudget; i++) {
        const r = Math.random() * armLength * 1.1;
        const theta = Math.random() * Math.PI * 2;
        const py = gaussRandom(0, diskHeight * 0.6);

        // Random star temperature → color
        const temp = Math.random();
        let color;
        if (temp > 0.7) color = [0.7, 0.8, 1.0]; // blue
        else if (temp > 0.4) color = [1.0, 0.95, 0.85]; // white
        else if (temp > 0.2) color = [1.0, 0.85, 0.5]; // yellow
        else color = [1.0, 0.5, 0.3]; // orange-red

        // Brighten
        const bright = 1.2 + Math.random() * 0.8;
        color = color.map(c => Math.min(1.0, c * bright));

        seeds.push({
            position: [r * Math.cos(theta), py, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.3 + Math.random() * 0.4),
            color,
            depth: 0.8 + Math.random() * 0.4, // high animation = twinkling
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Nebula                                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate a multi-cloud emission nebula with embedded stars.
 *
 * @param {object} [opts]
 * @param {number} [opts.cloudCount=12]       Number of cloud centres
 * @param {number} [opts.cloudRadius=1.8]     Max displacement of cloud centres
 * @param {number} [opts.totalSplats=150000]
 * @param {number} [opts.scale=0.04]
 * @returns {Object[]}
 */
export function generateNebulaSplats({
    cloudCount = 12,
    cloudRadius = 1.8,
    totalSplats = 150000,
    scale = 0.04,
} = {}) {
    const seeds = [];

    // Define cloud centres with distinct colours
    const palette = [
        { h: 340, s: 0.9, l: 0.45 }, // H-alpha pink
        { h: 200, s: 0.85, l: 0.5 },  // reflection blue
        { h: 170, s: 0.8, l: 0.4 },   // OIII teal
        { h: 275, s: 0.75, l: 0.4 },   // violet
        { h: 30, s: 0.85, l: 0.45 },   // warm amber
        { h: 0, s: 0.9, l: 0.4 },      // deep red
    ];

    const clouds = [];
    for (let i = 0; i < cloudCount; i++) {
        const p = palette[i % palette.length];
        clouds.push({
            x: gaussRandom(0, cloudRadius * 0.5),
            y: gaussRandom(0, cloudRadius * 0.3),
            z: gaussRandom(0, cloudRadius * 0.5),
            r: 0.5 + Math.random() * 1.2,
            hue: p.h + (Math.random() - 0.5) * 30,
            sat: p.s,
            light: p.l,
        });
    }

    // Cloud splats (~85%)
    const cloudBudget = Math.floor(totalSplats * 0.85);
    for (let i = 0; i < cloudBudget; i++) {
        const cloud = clouds[Math.floor(Math.random() * clouds.length)];
        const r = Math.abs(gaussRandom(0, cloud.r * 0.45));
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const px = cloud.x + r * Math.sin(phi) * Math.cos(theta);
        const py = cloud.y + r * Math.cos(phi);
        const pz = cloud.z + r * Math.sin(phi) * Math.sin(theta);

        const hue = cloud.hue + (Math.random() - 0.5) * 25;
        const light = cloud.light * (0.3 + Math.random() * 0.7);
        const fade = clamp01(1 - r / (cloud.r * 1.5)); // dimmer at edges

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.5 + Math.random() * 1.2) * (0.6 + fade * 0.4),
            color: hsl(hue, cloud.sat, light * fade),
            depth: 0.2 + Math.random() * 0.6,
        });
    }

    // Embedded bright stars (~15%)
    const starBudget = totalSplats - cloudBudget;
    for (let i = 0; i < starBudget; i++) {
        const cloud = clouds[Math.floor(Math.random() * clouds.length)];
        const r = Math.abs(gaussRandom(0, cloud.r * 0.6));
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        seeds.push({
            position: [
                cloud.x + r * Math.sin(phi) * Math.cos(theta),
                cloud.y + r * Math.cos(phi),
                cloud.z + r * Math.sin(phi) * Math.sin(theta),
            ],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.2 + Math.random() * 0.3),
            color: [0.9 + Math.random() * 0.1, 0.9 + Math.random() * 0.1, 0.95],
            depth: 0.7 + Math.random() * 0.5,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Particle Storm / Vortex                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate a spiralling particle vortex (tornado / energy beam).
 *
 * @param {object} [opts]
 * @param {number} [opts.height=6]           Total height of vortex
 * @param {number} [opts.baseRadius=0.15]    Radius at waist
 * @param {number} [opts.flare=0.45]         How much it expands top/bottom
 * @param {number} [opts.spirals=35]         Number of full rotations
 * @param {number} [opts.totalSplats=200000]
 * @param {number} [opts.scale=0.015]
 * @returns {Object[]}
 */
export function generateParticleStormSplats({
    height = 6,
    baseRadius = 0.15,
    flare = 0.45,
    spirals = 35,
    totalSplats = 200000,
    scale = 0.015,
} = {}) {
    const seeds = [];
    const halfH = height / 2;

    // Main vortex body (~80%)
    const bodyBudget = Math.floor(totalSplats * 0.80);
    for (let i = 0; i < bodyBudget; i++) {
        const t = Math.random(); // 0-1 along height
        const y = t * height - halfH;

        // Funnel shape: wider at top and bottom
        const distFromCenter = Math.abs(t - 0.5) * 2; // 0 at waist, 1 at ends
        const radius = baseRadius + distFromCenter * flare + gaussRandom(0, 0.04);

        const angle = t * spirals * Math.PI * 2 + Math.random() * 0.3;
        const px = radius * Math.cos(angle);
        const pz = radius * Math.sin(angle);

        // Color gradient: hot orange at bottom → cool blue at top
        const hue = 20 + t * 210; // orange → cyan
        const sat = 0.85 + Math.random() * 0.15;
        const light = 0.4 + (1 - distFromCenter) * 0.25 + Math.random() * 0.15;

        seeds.push({
            position: [px, y, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.6 + Math.random() * 0.8),
            color: hsl(hue, sat, light),
            depth: 0.5 + distFromCenter * 0.5 + Math.random() * 0.3,
        });
    }

    // Ejected particles (~15%) — spray outward from ends
    const ejectBudget = Math.floor(totalSplats * 0.15);
    for (let i = 0; i < ejectBudget; i++) {
        const fromTop = Math.random() > 0.5;
        const y = fromTop ? halfH + Math.random() * 2 : -halfH - Math.random() * 2;
        const spreadR = flare + Math.random() * 1.5;
        const theta = Math.random() * Math.PI * 2;

        const px = spreadR * Math.cos(theta);
        const pz = spreadR * Math.sin(theta);

        const hue = fromTop ? 200 + Math.random() * 40 : 10 + Math.random() * 30;
        const dim = 0.2 + Math.random() * 0.35;

        seeds.push({
            position: [px, y, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.4 + Math.random() * 0.6),
            color: hsl(hue, 0.7, dim),
            depth: 0.8 + Math.random() * 0.4,
        });
    }

    // Central eye (dense, bright, ~5%)
    const eyeBudget = totalSplats - bodyBudget - ejectBudget;
    for (let i = 0; i < eyeBudget; i++) {
        const y = gaussRandom(0, height * 0.08);
        const r = Math.abs(gaussRandom(0, baseRadius * 0.3));
        const theta = Math.random() * Math.PI * 2;

        seeds.push({
            position: [r * Math.cos(theta), y, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.5 + Math.random() * 0.5),
            color: [0.95, 0.92, 1.0],
            depth: 0.3 + Math.random() * 0.3,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Star Field (deep space background)                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate a dense field of distant stars filling a cube volume.
 *
 * @param {object} [opts]
 * @param {number} [opts.extent=8]
 * @param {number} [opts.totalSplats=100000]
 * @param {number} [opts.scale=0.01]
 * @returns {Object[]}
 */
export function generateStarFieldSplats({
    extent = 8,
    totalSplats = 100000,
    scale = 0.01,
} = {}) {
    const seeds = [];
    const half = extent / 2;

    for (let i = 0; i < totalSplats; i++) {
        const px = (Math.random() - 0.5) * extent;
        const py = (Math.random() - 0.5) * extent;
        const pz = (Math.random() - 0.5) * extent;

        // Random star color temperature
        const temp = Math.random();
        let color;
        if (temp > 0.8) color = [0.65, 0.75, 1.0]; // blue
        else if (temp > 0.5) color = [1.0, 0.98, 0.92]; // white
        else if (temp > 0.3) color = [1.0, 0.88, 0.6]; // yellow
        else if (temp > 0.15) color = [1.0, 0.65, 0.35]; // orange
        else color = [1.0, 0.4, 0.25]; // red

        const bright = 0.4 + Math.random() * 0.6;
        color = color.map(c => c * bright);

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.3 + Math.random() * 1.0),
            color,
            depth: 0.6 + Math.random() * 0.6, // twinkle
        });
    }

    return seeds;
}

export default generateGalaxySplats;
