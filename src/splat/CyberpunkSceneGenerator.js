/**
 * CyberpunkSceneGenerator
 *
 * Generates a 5-layer parallax scene of pyramids under moonlight with
 * planets, using Gaussian splats as a painting medium.
 *
 * Layers (back to front):
 *   1. Sky backdrop + star field + nebula clouds   (z ≈ -8)
 *   2. Moon + planets                              (z ≈ -4)
 *   3. Distant pyramids with neon edges            (z ≈ -1)
 *   4. Foreground pyramid + desert floor           (z ≈  1)
 *   5. Atmospheric dust + colour washes + grid     (z ≈  3)
 *
 * Total budget: ~2000 splats (stays ≥30 FPS in portrait on mobile).
 *
 * The parallax effect comes naturally from the depth spread: as the camera
 * orbits, nearer layers shift faster than distant ones.
 *
 * Translucent large splats in overlapping layers create colour mixing —
 * cyan over magenta yields violet, etc. This is the "painting" effect.
 */

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */

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

function rgb(r, g, b) { return [r, g, b]; }

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpColor(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

/** Quaternion that rotates +Z to a given normal. */
function quatFromNormal(nx, ny, nz) {
    const dot = nz;
    if (dot > 0.9999) return [1, 0, 0, 0];
    if (dot < -0.9999) return [0, 1, 0, 0];
    const cx = -ny, cy = nx, cz = 0;
    const s = Math.sqrt((1 + dot) * 2);
    return [s * 0.5, cx / s, cy / s, cz / s];
}

/** Quaternion from axis-angle. */
function quatFromAxisAngle(ax, ay, az, angle) {
    const ha = angle * 0.5;
    const s = Math.sin(ha);
    const len = Math.hypot(ax, ay, az) || 1;
    return [Math.cos(ha), (ax / len) * s, (ay / len) * s, (az / len) * s];
}

function makeSeed(position, orientation, scale3, color, opacity) {
    return { position, orientation, scale3, color, opacity, depth: 0 };
}

/* ------------------------------------------------------------------ */
/*  Layer 1 — Sky backdrop + star field + nebula                       */
/* ------------------------------------------------------------------ */

function generateSkyAndStars(seeds) {
    const Z_BACK = -8;
    const SPREAD_X = 14;
    const SPREAD_Y = 10;

    // Sky backdrop — large very dark blue/navy splats filling the background
    // These ensure the whole screen has colour, not just black
    for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
            const x = (col / 7) * SPREAD_X * 2 - SPREAD_X;
            const y = (row / 5) * SPREAD_Y - 1;
            const z = Z_BACK - 2;
            const skyHue = lerp(220, 250, row / 5);
            seeds.push(makeSeed(
                [x + rand(-0.5, 0.5), y + rand(-0.3, 0.3), z],
                quatFromAxisAngle(0, 0, 1, rand(0, 0.5)),
                [rand(1.8, 2.8), rand(1.4, 2.2), 0.1],
                hsl(skyHue, rand(0.2, 0.4), rand(0.02, 0.06)),
                rand(0.3, 0.6),
            ));
        }
    }

    // Stars — tiny bright point splats
    for (let i = 0; i < 300; i++) {
        const x = rand(-SPREAD_X, SPREAD_X);
        const y = rand(-1, SPREAD_Y);
        const z = rand(Z_BACK - 1, Z_BACK + 1);
        const brightness = rand(0.6, 1.0);
        const tint = Math.random() < 0.25
            ? hsl(rand(180, 260), 0.4, brightness)
            : Math.random() < 0.1
                ? hsl(rand(10, 40), 0.5, brightness) // warm stars
                : rgb(brightness, brightness, brightness * rand(0.9, 1.0));
        const size = rand(0.01, 0.05);

        seeds.push(makeSeed(
            [x, y, z],
            [1, 0, 0, 0],
            [size, size, size * 0.5],
            tint,
            rand(0.6, 1.0),
        ));
    }

    // Nebula blobs — large, translucent, overlapping for colour mixing
    const nebulaColors = [
        hsl(270, 0.7, 0.25),  // deep purple
        hsl(220, 0.8, 0.2),   // navy blue
        hsl(310, 0.6, 0.2),   // dark magenta
        hsl(190, 0.6, 0.15),  // dark teal
        hsl(250, 0.5, 0.18),  // indigo
        hsl(340, 0.4, 0.15),  // dark rose
    ];
    for (let i = 0; i < 100; i++) {
        const x = rand(-SPREAD_X * 0.9, SPREAD_X * 0.9);
        const y = rand(0, SPREAD_Y * 0.9);
        const z = rand(Z_BACK - 0.5, Z_BACK + 0.5);
        const baseCol = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        const col = lerpColor(baseCol, rgb(0, 0, 0), rand(0, 0.3));
        const sx = rand(0.5, 1.8);
        const sy = rand(0.4, 1.2);

        seeds.push(makeSeed(
            [x, y, z],
            quatFromAxisAngle(0, 0, 1, rand(0, Math.PI)),
            [sx, sy, sx * 0.1],
            col,
            rand(0.06, 0.18),
        ));
    }
}

/* ------------------------------------------------------------------ */
/*  Layer 2 — Moon + planets                                           */
/* ------------------------------------------------------------------ */

function generateMoon(seeds) {
    const cx = 2.5, cy = 4.5, cz = -4.5;
    const RADIUS = 0.9;
    const RING_COUNT = 12;
    const PER_RING = 16;

    for (let ri = 0; ri < RING_COUNT; ri++) {
        const v = (ri / (RING_COUNT - 1)) * Math.PI;
        const sv = Math.sin(v), cv = Math.cos(v);
        const ringR = RADIUS * sv;
        const ringY = RADIUS * cv;
        const count = Math.max(4, Math.round(PER_RING * sv));

        for (let ui = 0; ui < count; ui++) {
            const u = (ui / count) * Math.PI * 2;
            const nx = sv * Math.cos(u), ny = cv, nz = sv * Math.sin(u);

            const lum = rand(0.75, 0.95);
            const col = rgb(lum, lum * 0.97, lum * 0.9);
            const sz = rand(0.06, 0.12);

            seeds.push(makeSeed(
                [cx + ringR * Math.cos(u), cy + ringY, cz + ringR * Math.sin(u)],
                quatFromNormal(nx, ny, nz),
                [sz * 3.0, sz * 3.0, sz * 0.3],
                col,
                rand(0.6, 0.85),
            ));
        }
    }

    // Moon glow halo
    for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const hr = RADIUS * rand(1.2, 2.0);
        seeds.push(makeSeed(
            [cx + Math.cos(angle) * hr, cy + Math.sin(angle) * hr, cz - 0.3],
            [1, 0, 0, 0],
            [rand(0.3, 0.7), rand(0.3, 0.7), 0.05],
            lerpColor(rgb(0.8, 0.9, 1.0), hsl(190, 0.5, 0.7), rand(0, 0.4)),
            rand(0.05, 0.14),
        ));
    }
}

function generatePlanets(seeds) {
    const p1 = { cx: -4.5, cy: 5.5, cz: -5.5, r: 0.4, hue: 15, count: 50 };
    const p2 = { cx: 6.0, cy: 3.0, cz: -6, r: 0.5, hue: 170, count: 60 };

    [p1, p2].forEach(({ cx, cy, cz, r, hue, count }) => {
        for (let i = 0; i < count; i++) {
            const golden = (1 + Math.sqrt(5)) / 2;
            const theta = 2 * Math.PI * i / golden;
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            const sp = Math.sin(phi);
            const nx = sp * Math.cos(theta);
            const ny = Math.cos(phi);
            const nz = sp * Math.sin(theta);
            const sz = rand(0.04, 0.09);

            seeds.push(makeSeed(
                [cx + nx * r, cy + ny * r, cz + nz * r],
                quatFromNormal(nx, ny, nz),
                [sz * 2.5, sz * 2.5, sz * 0.3],
                hsl(hue + rand(-15, 15), rand(0.5, 0.8), rand(0.3, 0.55)),
                rand(0.65, 0.9),
            ));
        }

        // Planet glow ring
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            seeds.push(makeSeed(
                [cx + Math.cos(angle) * r * 1.5, cy + Math.sin(angle) * r * 1.5, cz - 0.1],
                [1, 0, 0, 0],
                [rand(0.15, 0.3), rand(0.15, 0.3), 0.03],
                hsl(hue, 0.6, 0.4),
                rand(0.04, 0.1),
            ));
        }
    });
}

/* ------------------------------------------------------------------ */
/*  Layer 3 — Distant pyramids (neon-edged silhouettes)                */
/* ------------------------------------------------------------------ */

function generateDistantPyramids(seeds) {
    const pyramids = [
        { cx: -4.0, cy: -1.8, cz: -1.5, h: 2.2, base: 1.8 },
        { cx: -1.2, cy: -1.8, cz: -0.5, h: 1.5, base: 1.2 },
        { cx:  2.5, cy: -1.8, cz: -1.0, h: 2.8, base: 2.2 },
        { cx:  5.0, cy: -1.8, cz: -2.0, h: 1.8, base: 1.4 },
    ];

    const neonCyan = rgb(0.0, 1.0, 1.0);
    const neonMagenta = rgb(1.0, 0.0, 0.8);
    const darkFill = rgb(0.03, 0.04, 0.10);

    pyramids.forEach(({ cx, cy, cz, h, base }, pi) => {
        const halfB = base * 0.5;
        const neonColor = pi % 2 === 0 ? neonCyan : neonMagenta;

        // Face fill — translucent dark splats
        for (let row = 0; row < 12; row++) {
            const t = row / 12;
            const rowY = cy + t * h;
            const rowW = halfB * (1 - t);
            const perRow = Math.max(2, Math.round(8 * (1 - t)));

            for (let c = 0; c < perRow; c++) {
                const frac = perRow > 1 ? c / (perRow - 1) : 0.5;
                const x = cx + (frac - 0.5) * rowW * 2;
                const sz = rand(0.06, 0.13);
                seeds.push(makeSeed(
                    [x + rand(-0.04, 0.04), rowY, cz + rand(-0.03, 0.03)],
                    quatFromNormal(0, 0, 1),
                    [sz * 2.2, sz * 1.8, sz * 0.2],
                    lerpColor(darkFill, hsl(240 + pi * 20, 0.2, 0.06), rand(0, 0.3)),
                    rand(0.35, 0.6),
                ));
            }
        }

        // Neon edges — left
        for (let i = 0; i < 12; i++) {
            const t = i / 12;
            const ey = cy + t * h;
            const ex = cx - halfB * (1 - t);
            const sz = rand(0.015, 0.03);
            seeds.push(makeSeed(
                [ex, ey, cz + 0.01],
                quatFromAxisAngle(0, 0, 1, Math.atan2(h, halfB)),
                [sz * 4, sz * 0.5, sz * 0.3],
                neonColor,
                rand(0.7, 1.0),
            ));
        }
        // Right edge
        for (let i = 0; i < 12; i++) {
            const t = i / 12;
            const ey = cy + t * h;
            const ex = cx + halfB * (1 - t);
            const sz = rand(0.015, 0.03);
            seeds.push(makeSeed(
                [ex, ey, cz + 0.01],
                quatFromAxisAngle(0, 0, 1, -Math.atan2(h, halfB)),
                [sz * 4, sz * 0.5, sz * 0.3],
                neonColor,
                rand(0.7, 1.0),
            ));
        }
        // Base edge
        for (let i = 0; i < 10; i++) {
            const frac = i / 10;
            const ex = cx + (frac - 0.5) * base;
            const sz = rand(0.015, 0.025);
            seeds.push(makeSeed(
                [ex, cy, cz + 0.01],
                [1, 0, 0, 0],
                [sz * 3, sz * 0.5, sz * 0.3],
                neonColor,
                rand(0.5, 0.85),
            ));
        }
    });
}

/* ------------------------------------------------------------------ */
/*  Layer 4 — Foreground pyramid + desert ground                       */
/* ------------------------------------------------------------------ */

function generateForegroundPyramid(seeds) {
    const cx = 0, cy = -2.2, cz = 1.5;
    const H = 3.5, BASE = 3.0;
    const halfB = BASE * 0.5;

    const sandDark = rgb(0.10, 0.07, 0.03);
    const sandMid = hsl(35, 0.5, 0.18);
    const neonYellow = rgb(1.0, 0.9, 0.0);
    const neonCyan = rgb(0.0, 1.0, 1.0);
    const neonPink = rgb(1.0, 0.0, 0.8);

    // Face fill — dense, gradient from dark base to slightly lighter apex
    for (let row = 0; row < 18; row++) {
        const t = row / 18;
        const rowY = cy + t * H;
        const rowW = halfB * (1 - t);
        const perRow = Math.max(2, Math.round(12 * (1 - t)));

        for (let c = 0; c < perRow; c++) {
            const frac = perRow > 1 ? c / (perRow - 1) : 0.5;
            const x = cx + (frac - 0.5) * rowW * 2;
            const sz = rand(0.05, 0.12);

            const faceLum = lerp(0.05, 0.10, t);
            const faceCol = lerpColor(sandDark, hsl(240, 0.15, faceLum), t * 0.4);

            seeds.push(makeSeed(
                [x + rand(-0.03, 0.03), rowY, cz + rand(-0.02, 0.02)],
                quatFromNormal(0, 0, 1),
                [sz * 2.5, sz * 2, sz * 0.2],
                faceCol,
                rand(0.4, 0.7),
            ));
        }
    }

    // Neon edge lines — left (cyan → yellow gradient)
    for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const ey = cy + t * H;
        const ex = cx - halfB * (1 - t);
        const sz = rand(0.02, 0.04);
        seeds.push(makeSeed(
            [ex, ey, cz + 0.02],
            quatFromAxisAngle(0, 0, 1, Math.atan2(H, halfB)),
            [sz * 5, sz * 0.6, sz * 0.3],
            lerpColor(neonCyan, neonYellow, t),
            rand(0.8, 1.0),
        ));
    }
    // Right edge (pink → yellow gradient)
    for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const ey = cy + t * H;
        const ex = cx + halfB * (1 - t);
        const sz = rand(0.02, 0.04);
        seeds.push(makeSeed(
            [ex, ey, cz + 0.02],
            quatFromAxisAngle(0, 0, 1, -Math.atan2(H, halfB)),
            [sz * 5, sz * 0.6, sz * 0.3],
            lerpColor(neonPink, neonYellow, t),
            rand(0.8, 1.0),
        ));
    }
    // Base edge
    for (let i = 0; i < 14; i++) {
        const frac = i / 14;
        const ex = cx + (frac - 0.5) * BASE;
        const sz = rand(0.02, 0.035);
        seeds.push(makeSeed(
            [ex, cy, cz + 0.02],
            [1, 0, 0, 0],
            [sz * 4, sz * 0.5, sz * 0.3],
            neonCyan,
            rand(0.6, 0.9),
        ));
    }

    // Desert ground plane — wide translucent sand splats
    for (let i = 0; i < 140; i++) {
        const gx = rand(-8, 8);
        const gz = rand(cz - 2, cz + 4);
        const sz = rand(0.15, 0.6);
        seeds.push(makeSeed(
            [gx, cy + rand(-0.15, 0.05), gz],
            quatFromNormal(0, 1, 0),
            [sz * 2.5, sz * 0.3, sz * 2.5],
            lerpColor(sandDark, sandMid, rand(0, 0.5)),
            rand(0.12, 0.35),
        ));
    }

    // Horizon glow — translucent warm/cool band at pyramid-sky boundary
    for (let i = 0; i < 20; i++) {
        const hx = rand(-8, 8);
        const hy = cy + rand(-0.2, 0.3);
        seeds.push(makeSeed(
            [hx, hy, cz - rand(1, 3)],
            [1, 0, 0, 0],
            [rand(0.8, 1.8), rand(0.2, 0.5), 0.05],
            hsl(rand(15, 35), rand(0.3, 0.6), rand(0.08, 0.15)),
            rand(0.05, 0.15),
        ));
    }
}

/* ------------------------------------------------------------------ */
/*  Layer 5 — Atmospheric particles + lens artifacts + neon grid       */
/* ------------------------------------------------------------------ */

function generateAtmosphere(seeds) {
    const Z_FRONT = 3;

    // Dust particles — small, scattered
    for (let i = 0; i < 100; i++) {
        const x = rand(-7, 7);
        const y = rand(-2.5, 6);
        const z = rand(Z_FRONT - 1, Z_FRONT + 2);
        const sz = rand(0.01, 0.035);
        seeds.push(makeSeed(
            [x, y, z],
            [1, 0, 0, 0],
            [sz, sz, sz * 0.5],
            hsl(rand(25, 55), rand(0.2, 0.4), rand(0.5, 0.8)),
            rand(0.12, 0.35),
        ));
    }

    // Large translucent colour-wash blobs for mixing effect
    const washes = [
        { x: -4, y: 2, col: hsl(290, 0.5, 0.2), sx: 2.5, sy: 1.8 },
        { x: 3, y: -0.5, col: hsl(180, 0.6, 0.18), sx: 2.0, sy: 1.5 },
        { x: 0, y: 4, col: hsl(210, 0.5, 0.15), sx: 3.0, sy: 2.0 },
        { x: -2, y: -1.5, col: hsl(330, 0.4, 0.15), sx: 1.8, sy: 1.2 },
        { x: 5, y: 3, col: hsl(260, 0.5, 0.15), sx: 2.0, sy: 1.5 },
        { x: -5, y: 5, col: hsl(200, 0.4, 0.12), sx: 2.5, sy: 1.8 },
    ];
    washes.forEach(({ x, y, col, sx, sy }) => {
        seeds.push(makeSeed(
            [x, y, Z_FRONT + 0.5],
            quatFromAxisAngle(0, 0, 1, rand(0, Math.PI)),
            [sx, sy, 0.05],
            col,
            rand(0.03, 0.09),
        ));
    });

    // Lens flare streaks from moon direction
    for (let i = 0; i < 10; i++) {
        const t = i / 10;
        const fx = lerp(2.5, -2, t);
        const fy = lerp(4.5, -0.5, t);
        const sz = rand(0.1, 0.35);
        seeds.push(makeSeed(
            [fx + rand(-0.4, 0.4), fy + rand(-0.3, 0.3), Z_FRONT + 1],
            quatFromAxisAngle(0, 0, 1, -0.7 + rand(-0.2, 0.2)),
            [sz * 4, sz * 0.3, 0.05],
            lerpColor(rgb(0.8, 0.9, 1.0), hsl(190, 0.5, 0.6), t),
            rand(0.02, 0.07),
        ));
    }

    // Neon grid lines on ground (cyberpunk signature)
    for (let i = 0; i < 40; i++) {
        const gx = rand(-6, 6);
        const gy = -2.2;
        const gz = rand(0.5, 5);
        const sz = rand(0.015, 0.035);
        const isParallel = Math.random() < 0.5;
        seeds.push(makeSeed(
            [gx, gy + rand(-0.02, 0.02), gz],
            quatFromNormal(0, 1, 0),
            isParallel
                ? [sz * 10, sz * 0.15, sz * 0.3]
                : [sz * 0.15, sz * 0.3, sz * 10],
            Math.random() < 0.5 ? rgb(0.0, 1.0, 1.0) : rgb(1.0, 0.0, 0.8),
            rand(0.1, 0.35),
        ));
    }

    // Floating neon particles — tiny bright specks near camera
    for (let i = 0; i < 30; i++) {
        const x = rand(-4, 4);
        const y = rand(-1, 4);
        const z = rand(Z_FRONT, Z_FRONT + 2);
        const sz = rand(0.008, 0.02);
        seeds.push(makeSeed(
            [x, y, z],
            [1, 0, 0, 0],
            [sz, sz, sz],
            Math.random() < 0.5
                ? rgb(0.0, rand(0.8, 1.0), rand(0.8, 1.0))
                : rgb(rand(0.8, 1.0), 0.0, rand(0.6, 0.9)),
            rand(0.3, 0.7),
        ));
    }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate the full 5-layer cyberpunk pyramid scene.
 * Returns an array of hi-fi seed objects ready for encodeHiFiSeeds().
 *
 * @returns {Object[]}  ~2000 seeds
 */
export function generateCyberpunkPyramidScene() {
    const seeds = [];
    generateSkyAndStars(seeds);       // Layer 1
    generateMoon(seeds);              // Layer 2a
    generatePlanets(seeds);           // Layer 2b
    generateDistantPyramids(seeds);   // Layer 3
    generateForegroundPyramid(seeds); // Layer 4
    generateAtmosphere(seeds);        // Layer 5
    return seeds;
}

export default generateCyberpunkPyramidScene;
