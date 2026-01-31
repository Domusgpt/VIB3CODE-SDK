/**
 * HyperSceneGenerator
 *
 * Generates a 2M-splat "observable universe" base scene designed for
 * 10× instanced rendering → 20 million visual splats.
 *
 * Structure (fractal hierarchy):
 *   - Cosmic web filaments (large-scale structure)
 *   - Galaxy cluster nodes (where filaments intersect)
 *   - Individual galaxies within clusters
 *   - Nebulae / emission regions
 *   - Dense star fields
 *   - Foreground bright stars with high depth (twinkle)
 *
 * The scene is centered at origin with radius ~6 units so that 10
 * instanced copies can tile a ~30-unit volume without overlap gaps.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function gaussRandom(mean, stddev) {
    const u1 = Math.random();
    const u2 = Math.random();
    return mean + Math.sqrt(-2 * Math.log(Math.max(1e-10, u1))) * Math.cos(2 * Math.PI * u2) * stddev;
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
/*  Universe generator                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {object} [opts]
 * @param {number} [opts.totalSplats=2000000]  Base splat count (instanced 10×)
 * @param {number} [opts.extent=6]             Radius of the scene volume
 * @param {number} [opts.scale=0.012]          Base splat size
 * @returns {Object[]} GaussianSeed[]
 */
export function generateHyperSceneSplats({
    totalSplats = 2000000,
    extent = 6,
    scale = 0.012,
} = {}) {
    const seeds = new Array(totalSplats);
    let idx = 0;

    /* --- Budget allocation --- */
    const filamentBudget   = Math.floor(totalSplats * 0.15);  // 300K
    const clusterBudget    = Math.floor(totalSplats * 0.20);  // 400K
    const galaxyBudget     = Math.floor(totalSplats * 0.25);  // 500K
    const nebulaBudget     = Math.floor(totalSplats * 0.15);  // 300K
    const starFieldBudget  = Math.floor(totalSplats * 0.15);  // 300K
    const brightStarBudget = totalSplats - filamentBudget - clusterBudget
                             - galaxyBudget - nebulaBudget - starFieldBudget; // 200K

    /* --- Cosmic web filaments (large-scale structure) --- */
    // 20 filaments connecting random cluster centers
    const clusterCenters = [];
    const clusterCount = 30;
    for (let i = 0; i < clusterCount; i++) {
        clusterCenters.push([
            gaussRandom(0, extent * 0.4),
            gaussRandom(0, extent * 0.3),
            gaussRandom(0, extent * 0.4),
        ]);
    }

    const filamentCount = 20;
    const splatsPerFilament = Math.floor(filamentBudget / filamentCount);
    for (let f = 0; f < filamentCount; f++) {
        const a = clusterCenters[Math.floor(Math.random() * clusterCount)];
        const b = clusterCenters[Math.floor(Math.random() * clusterCount)];

        for (let i = 0; i < splatsPerFilament; i++) {
            const t = Math.random();
            const px = a[0] + (b[0] - a[0]) * t + gaussRandom(0, 0.15);
            const py = a[1] + (b[1] - a[1]) * t + gaussRandom(0, 0.10);
            const pz = a[2] + (b[2] - a[2]) * t + gaussRandom(0, 0.15);

            const dim = 0.03 + Math.random() * 0.06;
            seeds[idx++] = {
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (1.5 + Math.random() * 2.0),
                color: [dim * 0.6, dim * 0.5, dim * 0.9],
                depth: 0.3 + Math.random() * 0.3,
            };
        }
    }

    /* --- Galaxy cluster nodes --- */
    const splatsPerCluster = Math.floor(clusterBudget / clusterCount);
    for (let c = 0; c < clusterCount; c++) {
        const cx = clusterCenters[c][0];
        const cy = clusterCenters[c][1];
        const cz = clusterCenters[c][2];
        const clusterR = 0.5 + Math.random() * 0.8;
        const clusterHue = Math.random() * 360;

        for (let i = 0; i < splatsPerCluster; i++) {
            const r = Math.abs(gaussRandom(0, clusterR * 0.4));
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const px = cx + r * Math.sin(phi) * Math.cos(theta);
            const py = cy + r * Math.cos(phi) * 0.6;
            const pz = cz + r * Math.sin(phi) * Math.sin(theta);

            const temp = clamp01(1 - r / (clusterR * 1.5));
            const bright = 0.1 + temp * 0.3 + Math.random() * 0.1;
            const color = hsl(clusterHue + (Math.random() - 0.5) * 40, 0.7, bright);

            seeds[idx++] = {
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.6 + Math.random() * 1.0),
                color,
                depth: 0.2 + temp * 0.3 + Math.random() * 0.2,
            };
        }
    }

    /* --- Individual spiral galaxies --- */
    const galaxyCount = 60;
    const splatsPerGalaxy = Math.floor(galaxyBudget / galaxyCount);
    for (let g = 0; g < galaxyCount; g++) {
        // Place near a cluster
        const cluster = clusterCenters[Math.floor(Math.random() * clusterCount)];
        const gx = cluster[0] + gaussRandom(0, 0.8);
        const gy = cluster[1] + gaussRandom(0, 0.4);
        const gz = cluster[2] + gaussRandom(0, 0.8);
        const gRadius = 0.15 + Math.random() * 0.35;
        const armCount = 2 + Math.floor(Math.random() * 3);
        const windAngle = 1.5 + Math.random() * 2.0;
        const tiltX = (Math.random() - 0.5) * Math.PI;
        const tiltZ = (Math.random() - 0.5) * Math.PI;
        const galHue = Math.random() * 360;

        for (let i = 0; i < splatsPerGalaxy; i++) {
            const t = Math.random();
            const arm = Math.floor(Math.random() * armCount);
            const armOffset = (arm / armCount) * Math.PI * 2;
            const r = t * gRadius;
            const theta = armOffset + t * windAngle + gaussRandom(0, 0.2 + t * 0.4);
            const h = gaussRandom(0, gRadius * 0.04 * (1 + t));

            // Local coordinates
            let lx = r * Math.cos(theta);
            let ly = h;
            let lz = r * Math.sin(theta);

            // Apply random tilt
            const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);
            const cosZ = Math.cos(tiltZ), sinZ = Math.sin(tiltZ);
            let ny = ly * cosX - lz * sinX;
            let nz = ly * sinX + lz * cosX;
            ly = ny; lz = nz;
            const nx = lx * cosZ - ly * sinZ;
            ny = lx * sinZ + ly * cosZ;
            lx = nx; ly = ny;

            const temp = 1 - t;
            let color;
            if (temp > 0.6) color = [0.7 + temp * 0.2, 0.8 + temp * 0.15, 0.95];
            else if (temp > 0.3) color = [0.9, 0.75, 0.5];
            else color = [0.75, 0.35 + temp, 0.2];
            const bright = 0.3 + Math.random() * 0.4;
            color = color.map(c => clamp01(c * bright));

            seeds[idx++] = {
                position: [gx + lx, gy + ly, gz + lz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.3 + Math.random() * 0.5),
                color,
                depth: 0.3 + t * 0.4 + Math.random() * 0.2,
            };
        }
    }

    /* --- Nebulae (emission regions) --- */
    const nebulaCount = 25;
    const splatsPerNebula = Math.floor(nebulaBudget / nebulaCount);
    const nebulaPalette = [
        { h: 340, s: 0.9, l: 0.42 }, // H-alpha pink
        { h: 200, s: 0.85, l: 0.45 }, // blue
        { h: 170, s: 0.8, l: 0.38 },  // OIII teal
        { h: 275, s: 0.75, l: 0.38 }, // violet
        { h: 30, s: 0.85, l: 0.42 },  // amber
        { h: 120, s: 0.8, l: 0.35 },  // green
    ];
    for (let n = 0; n < nebulaCount; n++) {
        const cluster = clusterCenters[Math.floor(Math.random() * clusterCount)];
        const nx = cluster[0] + gaussRandom(0, 1.0);
        const ny = cluster[1] + gaussRandom(0, 0.6);
        const nz = cluster[2] + gaussRandom(0, 1.0);
        const nRadius = 0.3 + Math.random() * 0.6;
        const pal = nebulaPalette[n % nebulaPalette.length];

        for (let i = 0; i < splatsPerNebula; i++) {
            const r = Math.abs(gaussRandom(0, nRadius * 0.45));
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const px = nx + r * Math.sin(phi) * Math.cos(theta);
            const py = ny + r * Math.cos(phi);
            const pz = nz + r * Math.sin(phi) * Math.sin(theta);

            const fade = clamp01(1 - r / (nRadius * 1.2));
            const light = pal.l * (0.2 + fade * 0.6 + Math.random() * 0.2);
            const color = hsl(pal.h + (Math.random() - 0.5) * 20, pal.s, light);

            seeds[idx++] = {
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.6 + Math.random() * 1.5) * (0.5 + fade * 0.5),
                color,
                depth: 0.2 + (1 - fade) * 0.4 + Math.random() * 0.2,
            };
        }
    }

    /* --- Dense star field (volume fill) --- */
    for (let i = 0; i < starFieldBudget; i++) {
        const px = (Math.random() - 0.5) * extent * 2;
        const py = (Math.random() - 0.5) * extent * 1.4;
        const pz = (Math.random() - 0.5) * extent * 2;

        const temp = Math.random();
        let color;
        if (temp > 0.8) color = [0.65, 0.75, 1.0];
        else if (temp > 0.5) color = [1.0, 0.97, 0.9];
        else if (temp > 0.3) color = [1.0, 0.88, 0.6];
        else if (temp > 0.15) color = [1.0, 0.65, 0.35];
        else color = [1.0, 0.4, 0.25];

        const bright = 0.2 + Math.random() * 0.4;
        color = color.map(c => c * bright);

        seeds[idx++] = {
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.2 + Math.random() * 0.6),
            color,
            depth: 0.5 + Math.random() * 0.5,
        };
    }

    /* --- Bright foreground stars (high twinkle) --- */
    for (let i = 0; i < brightStarBudget && idx < totalSplats; i++) {
        const px = (Math.random() - 0.5) * extent * 1.8;
        const py = (Math.random() - 0.5) * extent * 1.2;
        const pz = (Math.random() - 0.5) * extent * 1.8;

        const temp = Math.random();
        let color;
        if (temp > 0.6) color = [0.7, 0.85, 1.0];
        else if (temp > 0.3) color = [1.0, 0.95, 0.85];
        else color = [1.0, 0.8, 0.5];

        const bright = 0.8 + Math.random() * 0.4;
        color = color.map(c => Math.min(1.0, c * bright));

        seeds[idx++] = {
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.15 + Math.random() * 0.25),
            color,
            depth: 0.8 + Math.random() * 0.5,
        };
    }

    // Trim to actual count (in case of rounding)
    return seeds.slice(0, idx);
}

export default generateHyperSceneSplats;
