/**
 * MegaSplatGenerator
 *
 * Ultra-scale procedural generators targeting 500K–2M Gaussian splats.
 * Designed to visually impress non-technical audiences while
 * demonstrating extreme efficiency:
 *
 *   1,000,000 splats × 48 bytes = 48 MB (PLY)
 *   ~10 parameters   × 4 bytes  = 40 bytes (procedural)
 *   Compression ≈ 1,200,000 : 1
 *
 * Generators:
 *   - Supernova: Expanding shock shell + core remnant + debris
 *   - Black Hole: Accretion disk + relativistic jets + lensing ring
 *   - Aurora: Curtains of light with magnetic field lines
 *   - Fireworks: Multi-burst shells with trails + sparkle
 *   - Quantum Field: Probability cloud with wave interference
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

function lerp3(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

/* ------------------------------------------------------------------ */
/*  Supernova                                                          */
/* ------------------------------------------------------------------ */

/**
 * Expanding supernova remnant with:
 * - Dense core remnant (neutron star glow)
 * - Expanding shock shell (thin, bright)
 * - Ejecta filaments radiating outward
 * - Ambient dust cloud
 *
 * @param {object} [opts]
 * @param {number} [opts.shellRadius=3.0]     Radius of the expanding shell
 * @param {number} [opts.shellThickness=0.15] Thickness of the shock front
 * @param {number} [opts.filamentCount=24]    Number of radial filaments
 * @param {number} [opts.totalSplats=750000]
 * @param {number} [opts.scale=0.018]
 * @returns {Object[]}
 */
export function generateSupernovaSplats({
    shellRadius = 3.0,
    shellThickness = 0.15,
    filamentCount = 24,
    totalSplats = 750000,
    scale = 0.018,
} = {}) {
    const seeds = [];

    // Budget: core 5%, shell 35%, filaments 30%, dust 25%, bright stars 5%
    const coreBudget = Math.floor(totalSplats * 0.05);
    const shellBudget = Math.floor(totalSplats * 0.35);
    const filBudget = Math.floor(totalSplats * 0.30);
    const dustBudget = Math.floor(totalSplats * 0.25);
    const starBudget = totalSplats - coreBudget - shellBudget - filBudget - dustBudget;

    // --- Core remnant (white-hot, small, dense) -------------------------
    for (let i = 0; i < coreBudget; i++) {
        const r = Math.abs(gaussRandom(0, 0.15));
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        seeds.push({
            position: [
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta),
            ],
            orientation: [1, 0, 0, 0],
            scale: scale * (1.5 + Math.random() * 2.0),
            color: [1.0, 0.95 + Math.random() * 0.05, 0.85 + Math.random() * 0.15],
            depth: 0.2 + Math.random() * 0.3,
        });
    }

    // --- Expanding shock shell ------------------------------------------
    for (let i = 0; i < shellBudget; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = shellRadius + gaussRandom(0, shellThickness);

        const px = r * Math.sin(phi) * Math.cos(theta);
        const py = r * Math.cos(phi);
        const pz = r * Math.sin(phi) * Math.sin(theta);

        // Color varies by position — creates mottled texture
        const posHash = Math.abs(Math.sin(px * 7.3 + py * 11.1 + pz * 5.7));
        let color;
        if (posHash > 0.7) {
            color = hsl(340 + posHash * 30, 0.9, 0.5); // H-alpha pink
        } else if (posHash > 0.4) {
            color = hsl(180 + posHash * 40, 0.85, 0.45); // OIII teal-blue
        } else {
            color = hsl(40 + posHash * 20, 0.8, 0.55); // warm yellow
        }

        const bright = 0.7 + Math.random() * 0.3;
        color = color.map(c => clamp01(c * bright));

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.6 + Math.random() * 0.8),
            color,
            depth: 0.4 + Math.random() * 0.4,
        });
    }

    // --- Radial filaments -----------------------------------------------
    const splatsPerFil = Math.floor(filBudget / filamentCount);
    for (let f = 0; f < filamentCount; f++) {
        // Each filament has a random direction
        const fTheta = Math.random() * Math.PI * 2;
        const fPhi = Math.acos(2 * Math.random() - 1);
        const dx = Math.sin(fPhi) * Math.cos(fTheta);
        const dy = Math.cos(fPhi);
        const dz = Math.sin(fPhi) * Math.sin(fTheta);

        // Random filament color
        const filHue = 300 + Math.random() * 120; // magenta → red → orange

        for (let i = 0; i < splatsPerFil; i++) {
            const t = Math.random(); // 0-1 along filament
            const dist = t * shellRadius * 1.3;

            // Spread perpendicular to filament direction
            const spread = 0.02 + t * 0.12;
            const sx = gaussRandom(0, spread);
            const sy = gaussRandom(0, spread);
            const sz = gaussRandom(0, spread);

            const px = dx * dist + sx;
            const py = dy * dist + sy;
            const pz = dz * dist + sz;

            const bright = 0.3 + (1 - t) * 0.5 + Math.random() * 0.2;
            const color = hsl(filHue + (Math.random() - 0.5) * 30, 0.85, bright * 0.5);

            seeds.push({
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.4 + Math.random() * 0.6),
                color,
                depth: 0.3 + t * 0.5 + Math.random() * 0.2,
            });
        }
    }

    // --- Ambient dust cloud ---------------------------------------------
    for (let i = 0; i < dustBudget; i++) {
        const r = Math.random() * shellRadius * 1.5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const px = r * Math.sin(phi) * Math.cos(theta);
        const py = r * Math.cos(phi) * 0.7; // slightly flattened
        const pz = r * Math.sin(phi) * Math.sin(theta);

        const dim = 0.05 + Math.random() * 0.15;
        const dustColor = hsl(20 + Math.random() * 30, 0.5, dim);

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.8 + Math.random() * 1.5),
            color: dustColor,
            depth: 0.5 + Math.random() * 0.5,
        });
    }

    // --- Bright foreground stars ----------------------------------------
    for (let i = 0; i < starBudget; i++) {
        const r = Math.random() * shellRadius * 2;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        seeds.push({
            position: [
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta),
            ],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.2 + Math.random() * 0.3),
            color: [0.9 + Math.random() * 0.1, 0.9 + Math.random() * 0.1, 0.95],
            depth: 0.8 + Math.random() * 0.4,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Black Hole                                                         */
/* ------------------------------------------------------------------ */

/**
 * Black hole with accretion disk, relativistic jets, and photon ring.
 *
 * @param {object} [opts]
 * @param {number} [opts.diskInner=0.5]       Inner edge of accretion disk
 * @param {number} [opts.diskOuter=4.0]       Outer edge
 * @param {number} [opts.diskHeight=0.08]     Disk thickness
 * @param {number} [opts.jetLength=5.0]       Length of relativistic jets
 * @param {number} [opts.totalSplats=750000]
 * @param {number} [opts.scale=0.015]
 * @returns {Object[]}
 */
export function generateBlackHoleSplats({
    diskInner = 0.5,
    diskOuter = 4.0,
    diskHeight = 0.08,
    jetLength = 5.0,
    totalSplats = 750000,
    scale = 0.015,
} = {}) {
    const seeds = [];

    // Budget: photon ring 8%, inner disk 25%, outer disk 30%, jets 20%, corona 12%, bg 5%
    const ringBudget = Math.floor(totalSplats * 0.08);
    const innerBudget = Math.floor(totalSplats * 0.25);
    const outerBudget = Math.floor(totalSplats * 0.30);
    const jetBudget = Math.floor(totalSplats * 0.20);
    const coronaBudget = Math.floor(totalSplats * 0.12);
    const bgBudget = totalSplats - ringBudget - innerBudget - outerBudget - jetBudget - coronaBudget;

    // --- Photon ring (bright, tight circle) ---
    for (let i = 0; i < ringBudget; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = diskInner + gaussRandom(0, 0.03);
        const py = gaussRandom(0, 0.01);

        seeds.push({
            position: [r * Math.cos(theta), py, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.8 + Math.random() * 0.6),
            color: [1.0, 0.92, 0.7],
            depth: 0.3 + Math.random() * 0.2,
        });
    }

    // --- Inner accretion disk (hot, bright) ---
    const innerExtent = diskInner + (diskOuter - diskInner) * 0.35;
    for (let i = 0; i < innerBudget; i++) {
        const r = diskInner + Math.random() * (innerExtent - diskInner);
        const theta = Math.random() * Math.PI * 2;
        const normalizedR = (r - diskInner) / (diskOuter - diskInner);
        const py = gaussRandom(0, diskHeight * (0.5 + normalizedR));

        // Temperature gradient: white-hot near black hole → orange outward
        const temp = 1 - normalizedR;
        let color;
        if (temp > 0.7) {
            color = [1.0, 0.95, 0.85]; // white
        } else if (temp > 0.4) {
            color = [1.0, 0.8, 0.45]; // yellow
        } else {
            color = [1.0, 0.55, 0.2]; // orange
        }

        const bright = 0.7 + temp * 0.3 + Math.random() * 0.15;
        color = color.map(c => clamp01(c * bright));

        // Doppler: approaching side brighter, receding dimmer
        const doppler = 0.7 + 0.3 * Math.cos(theta);
        color = color.map(c => clamp01(c * doppler));

        seeds.push({
            position: [r * Math.cos(theta), py, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.5 + Math.random() * 0.7),
            color,
            depth: 0.2 + normalizedR * 0.4 + Math.random() * 0.2,
        });
    }

    // --- Outer accretion disk (cooler, wider) ---
    for (let i = 0; i < outerBudget; i++) {
        const r = innerExtent + Math.random() * (diskOuter - innerExtent);
        const theta = Math.random() * Math.PI * 2;
        const normalizedR = (r - diskInner) / (diskOuter - diskInner);
        const py = gaussRandom(0, diskHeight * (0.8 + normalizedR * 0.5));

        // Cooler: orange → red → dim red
        const temp = 1 - normalizedR;
        let color;
        if (temp > 0.5) {
            color = hsl(30 + temp * 20, 0.9, 0.45);
        } else {
            color = hsl(5 + temp * 30, 0.85, 0.25 + temp * 0.2);
        }

        const bright = 0.4 + temp * 0.4 + Math.random() * 0.2;
        color = color.map(c => clamp01(c * bright));

        // Spiral structure
        const spiralAngle = theta + normalizedR * 4.0;
        const spiralBright = 0.8 + 0.2 * Math.sin(spiralAngle * 3);
        color = color.map(c => c * spiralBright);

        seeds.push({
            position: [r * Math.cos(theta), py, r * Math.sin(theta)],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.6 + Math.random() * 0.8),
            color,
            depth: 0.3 + normalizedR * 0.5 + Math.random() * 0.2,
        });
    }

    // --- Relativistic jets (bipolar) ---
    const jetPerSide = Math.floor(jetBudget / 2);
    for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? 1 : -1;
        for (let i = 0; i < jetPerSide; i++) {
            const t = Math.random(); // 0-1 along jet
            const y = dir * (diskInner * 0.5 + t * jetLength);

            // Cone shape: narrow at base, wider at top
            const coneR = 0.03 + t * 0.6;
            const theta = Math.random() * Math.PI * 2;
            const px = gaussRandom(0, coneR * 0.4) + coneR * 0.3 * Math.cos(theta + t * 8);
            const pz = gaussRandom(0, coneR * 0.4) + coneR * 0.3 * Math.sin(theta + t * 8);

            // Color: blue-white at base → purple → dim violet at tip
            let color;
            if (t < 0.3) {
                color = lerp3([0.7, 0.8, 1.0], [0.6, 0.4, 1.0], t / 0.3);
            } else {
                color = lerp3([0.6, 0.4, 1.0], [0.3, 0.1, 0.5], (t - 0.3) / 0.7);
            }

            const bright = 0.5 + (1 - t) * 0.5;
            color = color.map(c => clamp01(c * bright));

            seeds.push({
                position: [px, y, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.4 + Math.random() * 0.6),
                color,
                depth: 0.5 + t * 0.5 + Math.random() * 0.3,
            });
        }
    }

    // --- Hot corona (spherical glow around core) ---
    for (let i = 0; i < coronaBudget; i++) {
        const r = Math.abs(gaussRandom(0, diskInner * 1.2));
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const px = r * Math.sin(phi) * Math.cos(theta);
        const py = r * Math.cos(phi);
        const pz = r * Math.sin(phi) * Math.sin(theta);

        const temp = clamp01(1 - r / (diskInner * 2));
        const color = [
            0.8 + temp * 0.2,
            0.6 + temp * 0.3,
            0.3 + temp * 0.5,
        ];

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (1.0 + Math.random() * 1.5),
            color,
            depth: 0.3 + Math.random() * 0.3,
        });
    }

    // --- Background stars ---
    for (let i = 0; i < bgBudget; i++) {
        const r = diskOuter + Math.random() * diskOuter;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        seeds.push({
            position: [
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta),
            ],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.15 + Math.random() * 0.25),
            color: [0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2, 0.9],
            depth: 0.7 + Math.random() * 0.5,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Aurora Borealis                                                    */
/* ------------------------------------------------------------------ */

/**
 * Aurora borealis / northern lights with magnetic field lines.
 *
 * @param {object} [opts]
 * @param {number} [opts.curtainCount=5]      Number of curtain sheets
 * @param {number} [opts.curtainWidth=6]      Width of each curtain
 * @param {number} [opts.curtainHeight=4]     Height
 * @param {number} [opts.totalSplats=600000]
 * @param {number} [opts.scale=0.025]
 * @returns {Object[]}
 */
export function generateAuroraSplats({
    curtainCount = 5,
    curtainWidth = 6,
    curtainHeight = 4,
    totalSplats = 600000,
    scale = 0.025,
} = {}) {
    const seeds = [];

    // Aurora palette: green dominates, with purple/pink edges and blue tones
    const auroraColors = [
        { h: 120, s: 0.9, l: 0.45 },  // green (oxygen, dominant)
        { h: 140, s: 0.85, l: 0.5 },   // teal-green
        { h: 280, s: 0.8, l: 0.4 },    // purple (nitrogen, high altitude)
        { h: 320, s: 0.75, l: 0.45 },   // pink (nitrogen, low altitude)
        { h: 200, s: 0.85, l: 0.35 },   // deep blue
    ];

    // Budget: curtains 70%, rays 15%, diffuse glow 10%, stars 5%
    const curtainBudget = Math.floor(totalSplats * 0.70);
    const rayBudget = Math.floor(totalSplats * 0.15);
    const glowBudget = Math.floor(totalSplats * 0.10);
    const starBudget = totalSplats - curtainBudget - rayBudget - glowBudget;

    const splatsPerCurtain = Math.floor(curtainBudget / curtainCount);

    // --- Curtain sheets ------------------------------------------------
    for (let c = 0; c < curtainCount; c++) {
        const baseZ = (c - curtainCount / 2) * 1.2 + gaussRandom(0, 0.3);
        const baseColor = auroraColors[c % auroraColors.length];
        const waveFreq = 2 + Math.random() * 3;
        const waveAmp = 0.3 + Math.random() * 0.5;

        for (let i = 0; i < splatsPerCurtain; i++) {
            const tx = Math.random(); // 0-1 across width
            const ty = Math.random(); // 0-1 up height

            const x = (tx - 0.5) * curtainWidth;
            const y = ty * curtainHeight - curtainHeight * 0.3;

            // Curtain wave shape
            const wave = Math.sin(tx * waveFreq * Math.PI + c * 1.5) * waveAmp;
            const z = baseZ + wave + gaussRandom(0, 0.08);

            // Vertical color gradient: green at bottom → purple at top
            const heightFactor = ty;
            let h, s, l;
            if (heightFactor < 0.4) {
                // Lower: green/teal
                h = baseColor.h + (Math.random() - 0.5) * 20;
                s = baseColor.s;
                l = baseColor.l * (0.6 + heightFactor * 0.8);
            } else if (heightFactor < 0.7) {
                // Middle: transition
                const t = (heightFactor - 0.4) / 0.3;
                h = baseColor.h + t * (280 - baseColor.h);
                s = 0.8;
                l = 0.4 + t * 0.1;
            } else {
                // Upper: purple/pink
                h = 280 + (Math.random() - 0.5) * 40;
                s = 0.7;
                l = 0.35 * (1 - (heightFactor - 0.7) / 0.3);
            }

            // Intensity variation along curtain
            const intensity = 0.4 + 0.6 * Math.pow(Math.sin(tx * Math.PI), 0.5);

            const color = hsl(h, s, l * intensity);

            seeds.push({
                position: [x, y, z],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.5 + Math.random() * 1.0),
                color,
                depth: 0.3 + heightFactor * 0.4 + Math.random() * 0.2,
            });
        }
    }

    // --- Vertical rays (magnetic field aligned) -------------------------
    const rayCount = 40;
    const splatsPerRay = Math.floor(rayBudget / rayCount);
    for (let r = 0; r < rayCount; r++) {
        const rx = (Math.random() - 0.5) * curtainWidth;
        const rz = (Math.random() - 0.5) * curtainCount * 1.2;
        const rayColor = auroraColors[Math.floor(Math.random() * auroraColors.length)];

        for (let i = 0; i < splatsPerRay; i++) {
            const ty = Math.random();
            const y = ty * curtainHeight * 1.2;
            const spreadX = gaussRandom(0, 0.05);
            const spreadZ = gaussRandom(0, 0.05);

            const bright = 0.5 + (1 - ty) * 0.4;
            const color = hsl(rayColor.h + (Math.random() - 0.5) * 15, rayColor.s, bright * rayColor.l);

            seeds.push({
                position: [rx + spreadX, y, rz + spreadZ],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.3 + Math.random() * 0.5),
                color,
                depth: 0.5 + Math.random() * 0.4,
            });
        }
    }

    // --- Diffuse glow ---------------------------------------------------
    for (let i = 0; i < glowBudget; i++) {
        const x = (Math.random() - 0.5) * curtainWidth * 1.3;
        const y = Math.random() * curtainHeight * 0.8;
        const z = (Math.random() - 0.5) * curtainCount * 1.5;

        const gHue = 120 + Math.random() * 60; // green family
        const dim = 0.05 + Math.random() * 0.12;

        seeds.push({
            position: [x, y, z],
            orientation: [1, 0, 0, 0],
            scale: scale * (1.5 + Math.random() * 2.5),
            color: hsl(gHue, 0.6, dim),
            depth: 0.4 + Math.random() * 0.4,
        });
    }

    // --- Background stars -----------------------------------------------
    for (let i = 0; i < starBudget; i++) {
        const x = (Math.random() - 0.5) * curtainWidth * 2;
        const y = Math.random() * curtainHeight * 1.5;
        const z = (Math.random() - 0.5) * curtainCount * 3;

        seeds.push({
            position: [x, y, z],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.1 + Math.random() * 0.2),
            color: [0.8 + Math.random() * 0.2, 0.8 + Math.random() * 0.2, 0.9],
            depth: 0.7 + Math.random() * 0.5,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Fireworks                                                          */
/* ------------------------------------------------------------------ */

/**
 * Multi-burst fireworks display with trails and sparkle.
 *
 * @param {object} [opts]
 * @param {number} [opts.burstCount=12]       Number of burst shells
 * @param {number} [opts.burstRadius=2.0]     Max burst radius
 * @param {number} [opts.totalSplats=500000]
 * @param {number} [opts.scale=0.02]
 * @returns {Object[]}
 */
export function generateFireworksSplats({
    burstCount = 12,
    burstRadius = 2.0,
    totalSplats = 500000,
    scale = 0.02,
} = {}) {
    const seeds = [];

    // Firework palette
    const burstColors = [
        [1.0, 0.2, 0.2],   // red
        [0.2, 1.0, 0.2],   // green
        [0.3, 0.5, 1.0],   // blue
        [1.0, 0.9, 0.2],   // gold
        [1.0, 0.5, 1.0],   // magenta
        [0.2, 1.0, 1.0],   // cyan
        [1.0, 0.6, 0.2],   // orange
        [0.8, 0.3, 1.0],   // purple
    ];

    // Budget per burst + trails + sparkle
    const burstSplats = Math.floor(totalSplats * 0.55 / burstCount);
    const trailSplats = Math.floor(totalSplats * 0.25 / burstCount);
    const sparkleBudget = totalSplats - (burstSplats + trailSplats) * burstCount;

    for (let b = 0; b < burstCount; b++) {
        // Random burst center
        const cx = (Math.random() - 0.5) * 6;
        const cy = 1 + Math.random() * 5;
        const cz = (Math.random() - 0.5) * 6;
        const bRadius = burstRadius * (0.6 + Math.random() * 0.4);
        const baseColor = burstColors[b % burstColors.length];

        // Burst type: 0=sphere, 1=ring, 2=palm, 3=willow
        const burstType = Math.floor(Math.random() * 4);

        // --- Main burst particles ---
        for (let i = 0; i < burstSplats; i++) {
            let px, py, pz;

            if (burstType === 0) {
                // Sphere burst
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = bRadius * (0.7 + Math.random() * 0.3);
                px = cx + r * Math.sin(phi) * Math.cos(theta);
                py = cy + r * Math.cos(phi);
                pz = cz + r * Math.sin(phi) * Math.sin(theta);
            } else if (burstType === 1) {
                // Ring burst
                const theta = Math.random() * Math.PI * 2;
                const r = bRadius * (0.8 + Math.random() * 0.2);
                const spread = gaussRandom(0, 0.15);
                px = cx + r * Math.cos(theta);
                py = cy + spread;
                pz = cz + r * Math.sin(theta);
            } else if (burstType === 2) {
                // Palm burst (upward arcs)
                const theta = Math.random() * Math.PI * 2;
                const t = Math.random();
                const r = t * bRadius;
                const droop = t * t * bRadius * 0.4; // gravity droop
                px = cx + r * Math.cos(theta);
                py = cy + bRadius * 0.5 * t - droop;
                pz = cz + r * Math.sin(theta);
            } else {
                // Willow (long drooping trails)
                const theta = Math.random() * Math.PI * 2;
                const t = Math.random();
                const r = t * bRadius * 0.8;
                const droop = t * t * bRadius * 1.2;
                px = cx + r * Math.cos(theta) * (1 - t * 0.3);
                py = cy - droop;
                pz = cz + r * Math.sin(theta) * (1 - t * 0.3);
            }

            // Color fades toward tips
            const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2);
            const fade = clamp01(1 - dist / (bRadius * 1.3));
            const bright = 0.4 + fade * 0.6;
            const color = baseColor.map(c => clamp01(c * bright));

            seeds.push({
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.4 + Math.random() * 0.8),
                color,
                depth: 0.3 + (1 - fade) * 0.5 + Math.random() * 0.2,
            });
        }

        // --- Trails (lines from center outward) ---
        const trailCount = 20 + Math.floor(Math.random() * 20);
        const splatsPerTrail = Math.floor(trailSplats / trailCount);
        for (let tr = 0; tr < trailCount; tr++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            for (let i = 0; i < splatsPerTrail; i++) {
                const t = i / splatsPerTrail;
                const r = t * bRadius * 1.1;
                const droop = t * t * 0.3; // slight gravity

                const px = cx + r * Math.sin(phi) * Math.cos(theta);
                const py = cy + r * Math.cos(phi) - droop;
                const pz = cz + r * Math.sin(phi) * Math.sin(theta);

                const bright = 0.6 + (1 - t) * 0.4;
                const color = baseColor.map(c => clamp01(c * bright * 0.7));

                seeds.push({
                    position: [px, py, pz],
                    orientation: [1, 0, 0, 0],
                    scale: scale * (0.2 + Math.random() * 0.3),
                    color,
                    depth: 0.5 + t * 0.3,
                });
            }
        }
    }

    // --- Background sparkle (scattered across sky) ---
    for (let i = 0; i < sparkleBudget; i++) {
        const x = (Math.random() - 0.5) * 10;
        const y = Math.random() * 8;
        const z = (Math.random() - 0.5) * 10;

        const sparkleColor = burstColors[Math.floor(Math.random() * burstColors.length)];
        const dim = 0.1 + Math.random() * 0.3;

        seeds.push({
            position: [x, y, z],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.1 + Math.random() * 0.2),
            color: sparkleColor.map(c => c * dim),
            depth: 0.8 + Math.random() * 0.4,
        });
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Quantum Field                                                      */
/* ------------------------------------------------------------------ */

/**
 * Quantum probability field with wave interference patterns.
 * Particles distributed in overlapping probability clouds with
 * constructive/destructive interference creating standing waves.
 *
 * @param {object} [opts]
 * @param {number} [opts.waveCount=6]          Number of wave sources
 * @param {number} [opts.fieldExtent=5]        Size of field volume
 * @param {number} [opts.totalSplats=800000]
 * @param {number} [opts.scale=0.018]
 * @returns {Object[]}
 */
export function generateQuantumFieldSplats({
    waveCount = 6,
    fieldExtent = 5,
    totalSplats = 800000,
    scale = 0.018,
} = {}) {
    const seeds = [];
    const halfE = fieldExtent / 2;

    // Define wave sources
    const sources = [];
    for (let i = 0; i < waveCount; i++) {
        sources.push({
            x: gaussRandom(0, halfE * 0.5),
            y: gaussRandom(0, halfE * 0.3),
            z: gaussRandom(0, halfE * 0.5),
            freq: 2 + Math.random() * 4,
            phase: Math.random() * Math.PI * 2,
            hue: (i / waveCount) * 360,
        });
    }

    // Budget: probability clouds 60%, interference fringes 25%, nodes 10%, bg 5%
    const cloudBudget = Math.floor(totalSplats * 0.60);
    const fringeBudget = Math.floor(totalSplats * 0.25);
    const nodeBudget = Math.floor(totalSplats * 0.10);
    const bgBudget = totalSplats - cloudBudget - fringeBudget - nodeBudget;

    // --- Probability clouds (around each source) ---
    const perSource = Math.floor(cloudBudget / waveCount);
    for (let s = 0; s < waveCount; s++) {
        const src = sources[s];
        for (let i = 0; i < perSource; i++) {
            const r = Math.abs(gaussRandom(0, 1.2));
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const px = src.x + r * Math.sin(phi) * Math.cos(theta);
            const py = src.y + r * Math.cos(phi);
            const pz = src.z + r * Math.sin(phi) * Math.sin(theta);

            // Wave function probability |ψ|²
            const dist = Math.sqrt(r * r);
            const psi = Math.exp(-dist * 0.5) * Math.cos(dist * src.freq + src.phase);
            const prob = psi * psi;

            const bright = 0.2 + prob * 0.8;
            const color = hsl(src.hue + (Math.random() - 0.5) * 20, 0.85, bright * 0.5);

            seeds.push({
                position: [px, py, pz],
                orientation: [1, 0, 0, 0],
                scale: scale * (0.4 + prob * 1.2 + Math.random() * 0.3),
                color,
                depth: 0.2 + (1 - prob) * 0.5 + Math.random() * 0.2,
            });
        }
    }

    // --- Interference fringes (where waves overlap) ---
    for (let i = 0; i < fringeBudget; i++) {
        const px = (Math.random() - 0.5) * fieldExtent;
        const py = (Math.random() - 0.5) * fieldExtent * 0.6;
        const pz = (Math.random() - 0.5) * fieldExtent;

        // Sum wave contributions
        let amplitude = 0;
        let dominantHue = 0;
        let maxContrib = 0;
        for (const src of sources) {
            const dx = px - src.x;
            const dy = py - src.y;
            const dz = pz - src.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const contrib = Math.cos(dist * src.freq + src.phase) / (1 + dist * 0.3);
            amplitude += contrib;
            if (Math.abs(contrib) > maxContrib) {
                maxContrib = Math.abs(contrib);
                dominantHue = src.hue;
            }
        }

        // Only place splats at constructive interference peaks
        const intensity = Math.abs(amplitude / waveCount);
        if (intensity < 0.15) continue; // skip destructive

        const bright = 0.2 + intensity * 0.6;
        const color = hsl(dominantHue + amplitude * 30, 0.9, bright);

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.3 + intensity * 0.8),
            color,
            depth: 0.3 + (1 - intensity) * 0.4 + Math.random() * 0.2,
        });
    }

    // --- Quantum nodes (bright points at wave peaks) ---
    for (let i = 0; i < nodeBudget; i++) {
        const src = sources[Math.floor(Math.random() * sources.length)];
        const n = Math.floor(Math.random() * 5) + 1; // quantum number
        const r = n * (Math.PI / src.freq); // standing wave node distance
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const px = src.x + r * Math.sin(phi) * Math.cos(theta);
        const py = src.y + r * Math.cos(phi);
        const pz = src.z + r * Math.sin(phi) * Math.sin(theta);

        const color = hsl(src.hue + 60, 0.95, 0.6);

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.6 + Math.random() * 0.4),
            color,
            depth: 0.5 + Math.random() * 0.4,
        });
    }

    // --- Background quantum foam ---
    for (let i = 0; i < bgBudget; i++) {
        const px = (Math.random() - 0.5) * fieldExtent * 1.5;
        const py = (Math.random() - 0.5) * fieldExtent;
        const pz = (Math.random() - 0.5) * fieldExtent * 1.5;

        const dim = 0.03 + Math.random() * 0.08;
        const foamHue = Math.random() * 360;

        seeds.push({
            position: [px, py, pz],
            orientation: [1, 0, 0, 0],
            scale: scale * (0.2 + Math.random() * 0.5),
            color: hsl(foamHue, 0.4, dim),
            depth: 0.6 + Math.random() * 0.4,
        });
    }

    return seeds;
}

export default generateSupernovaSplats;
