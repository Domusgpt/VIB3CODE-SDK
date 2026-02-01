/**
 * CyberpunkSceneGenerator
 *
 * Generates a cinematic 5-layer parallax scene of pyramids under moonlight
 * with planets, milky way, and cyberpunk neon — using Gaussian splats as
 * an artistic painting medium.
 *
 * Layers (back to front):
 *   1. Sky dome + milky way band + stars + nebula    (z ≈ -8 to -10)
 *   2. Moon with god rays + saturn + red planet      (z ≈ -4 to -6)
 *   3. Distant pyramids + horizon city silhouette    (z ≈ -1 to -2)
 *   4. Foreground pyramid + desert + neon reflections(z ≈  1 to  3)
 *   5. Atmosphere + colour washes + dust + grid      (z ≈  3 to  5)
 *
 * Total budget: ~2200 splats (stays ≥30 FPS in portrait on mobile).
 *
 * Artistic techniques:
 *   - Large translucent splats overlap to create subtractive/additive colour
 *     mixing (cyan + magenta → violet through alpha compositing)
 *   - Anisotropic splats (elongated in one axis) form edges, streaks, rays
 *   - Sky dome uses tiled large blobs for full-screen colour coverage
 *   - Milky way is a curved band of small clustered splats
 *   - God rays are radial anisotropic splats emanating from the moon
 *   - Horizon city is a row of thin tall splats for silhouette effect
 *   - Neon reflections mirror pyramid edges below the ground line
 *   - Sand dune ridges are elongated horizontal splats with warm tones
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
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function quatFromNormal(nx, ny, nz) {
    const dot = nz;
    if (dot > 0.9999) return [1, 0, 0, 0];
    if (dot < -0.9999) return [0, 1, 0, 0];
    const cx = -ny, cy = nx;
    const s = Math.sqrt((1 + dot) * 2);
    return [s * 0.5, cx / s, cy / s, 0];
}

function quatFromAxisAngle(ax, ay, az, angle) {
    const ha = angle * 0.5;
    const s = Math.sin(ha);
    const len = Math.hypot(ax, ay, az) || 1;
    return [Math.cos(ha), (ax / len) * s, (ay / len) * s, (az / len) * s];
}

function seed(position, orientation, scale3, color, opacity) {
    return { position, orientation, scale3, color, opacity, depth: 0 };
}

/* ================================================================== */
/*  LAYER 1 — Sky dome + milky way + stars + nebula                    */
/* ================================================================== */

function generateSky(seeds) {
    const Z = -9;
    const SX = 16, SY = 12;

    // --- Sky dome tiles: dark gradient from navy (top) to indigo (horizon)
    for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 9; col++) {
            const x = (col / 8) * SX * 2 - SX + rand(-0.6, 0.6);
            const y = (row / 6) * SY - 2 + rand(-0.4, 0.4);
            const t = row / 6;
            const hue = lerp(230, 260, t);
            const lightness = lerp(0.015, 0.045, 1 - t); // darker at top
            seeds.push(seed(
                [x, y, Z - 2],
                quatFromAxisAngle(0, 0, 1, rand(-0.3, 0.3)),
                [rand(2.0, 3.2), rand(1.6, 2.4), 0.1],
                hsl(hue, rand(0.25, 0.45), lightness),
                rand(0.35, 0.65),
            ));
        }
    }

    // --- Stars: multi-brightness, some tinted
    for (let i = 0; i < 320; i++) {
        const x = rand(-SX, SX);
        const y = rand(-1.5, SY);
        const brightness = rand(0.5, 1.0);
        const sz = rand(0.008, 0.05);
        const isBright = Math.random() < 0.15;
        const tint = Math.random() < 0.2
            ? hsl(rand(180, 260), 0.5, brightness)
            : Math.random() < 0.08
                ? hsl(rand(10, 40), 0.6, brightness)
                : rgb(brightness, brightness, brightness * rand(0.92, 1.0));

        seeds.push(seed(
            [x, y, rand(Z - 1, Z + 1)],
            [1, 0, 0, 0],
            [sz * (isBright ? 1.8 : 1), sz * (isBright ? 1.8 : 1), sz * 0.4],
            tint,
            isBright ? rand(0.85, 1.0) : rand(0.4, 0.8),
        ));
    }

    // --- Milky way band: arc of clustered small splats across sky
    const MW_COUNT = 80;
    for (let i = 0; i < MW_COUNT; i++) {
        const t = i / MW_COUNT;
        // Parametric arc from lower-left to upper-right
        const x = lerp(-SX * 0.7, SX * 0.6, t);
        const y = 2 + Math.sin(t * Math.PI) * 5 + rand(-0.8, 0.8);
        const sz = rand(0.08, 0.3);
        const mwCol = lerpColor(
            hsl(250, 0.4, rand(0.12, 0.25)),
            hsl(210, 0.3, rand(0.15, 0.3)),
            rand(0, 1),
        );
        seeds.push(seed(
            [x + rand(-0.5, 0.5), y, Z + rand(-0.3, 0.3)],
            quatFromAxisAngle(0, 0, 1, rand(0, Math.PI)),
            [sz * rand(1, 2.5), sz * rand(0.5, 1.2), sz * 0.1],
            mwCol,
            rand(0.06, 0.2),
        ));
    }

    // --- Nebula blobs: overlapping translucent colour fields
    const nebulaPalette = [
        hsl(275, 0.65, 0.2), hsl(225, 0.7, 0.15), hsl(315, 0.55, 0.18),
        hsl(195, 0.6, 0.12), hsl(255, 0.5, 0.16), hsl(345, 0.4, 0.12),
    ];
    for (let i = 0; i < 90; i++) {
        const x = rand(-SX * 0.85, SX * 0.85);
        const y = rand(-0.5, SY * 0.85);
        const col = lerpColor(pick(nebulaPalette), rgb(0, 0, 0), rand(0, 0.35));
        const sx = rand(0.5, 2.0);
        seeds.push(seed(
            [x, y, Z + rand(-0.5, 0.5)],
            quatFromAxisAngle(0, 0, 1, rand(0, Math.PI)),
            [sx, rand(0.4, 1.4), sx * 0.1],
            col,
            rand(0.05, 0.16),
        ));
    }

    // --- Shooting stars (3 thin bright streaks)
    for (let i = 0; i < 3; i++) {
        const sx = rand(-6, 6);
        const sy = rand(3, 8);
        const angle = rand(-0.5, -1.2);
        seeds.push(seed(
            [sx, sy, Z + 0.5],
            quatFromAxisAngle(0, 0, 1, angle),
            [rand(0.6, 1.2), rand(0.008, 0.015), 0.01],
            rgb(1, 1, rand(0.8, 1.0)),
            rand(0.5, 0.9),
        ));
    }
}

/* ================================================================== */
/*  LAYER 2 — Moon + god rays + saturn + red planet                    */
/* ================================================================== */

function generateCelestial(seeds) {
    // ---- Moon ----
    const mx = 3.0, my = 5.0, mz = -5;
    const MR = 1.0;
    const RINGS = 13, PER_RING = 18;

    for (let ri = 0; ri < RINGS; ri++) {
        const v = (ri / (RINGS - 1)) * Math.PI;
        const sv = Math.sin(v), cv = Math.cos(v);
        const count = Math.max(4, Math.round(PER_RING * sv));
        for (let ui = 0; ui < count; ui++) {
            const u = (ui / count) * Math.PI * 2;
            const nx = sv * Math.cos(u), ny = cv, nz = sv * Math.sin(u);
            const lum = rand(0.72, 0.95);
            const sz = rand(0.06, 0.13);
            // Slight warm-cool variation across surface
            const warmShift = (nx + 1) * 0.02;
            seeds.push(seed(
                [mx + sv * Math.cos(u) * MR, my + cv * MR, mz + sv * Math.sin(u) * MR],
                quatFromNormal(nx, ny, nz),
                [sz * 3.2, sz * 3.2, sz * 0.3],
                rgb(lum + warmShift, lum * 0.97, lum * 0.88),
                rand(0.6, 0.88),
            ));
        }
    }

    // ---- Moon glow halo (2 rings — inner bright, outer soft) ----
    for (let ring = 0; ring < 2; ring++) {
        const count = ring === 0 ? 14 : 10;
        const rMul = ring === 0 ? 1.4 : 2.2;
        const opRange = ring === 0 ? [0.06, 0.16] : [0.03, 0.08];
        const szRange = ring === 0 ? [0.3, 0.6] : [0.5, 1.0];
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const hr = MR * rMul * rand(0.9, 1.1);
            seeds.push(seed(
                [mx + Math.cos(a) * hr, my + Math.sin(a) * hr, mz - 0.3],
                [1, 0, 0, 0],
                [rand(...szRange), rand(...szRange), 0.05],
                lerpColor(rgb(0.85, 0.92, 1.0), hsl(190, 0.4, 0.65), rand(0, 0.5)),
                rand(...opRange),
            ));
        }
    }

    // ---- God rays: radial anisotropic splats from moon center ----
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rand(-0.1, 0.1);
        const dist = MR * rand(1.5, 4.0);
        const sz = rand(0.15, 0.4);
        seeds.push(seed(
            [mx + Math.cos(a) * dist, my + Math.sin(a) * dist, mz - 0.5],
            quatFromAxisAngle(0, 0, 1, a),
            [sz * 6, sz * 0.2, 0.05],
            lerpColor(rgb(0.6, 0.7, 0.85), hsl(200, 0.3, 0.5), rand(0, 0.5)),
            rand(0.02, 0.06),
        ));
    }

    // ---- Saturn (with ring) ----
    const sx = -5, sy = 5.8, sz_ = -6, SR = 0.45;
    for (let i = 0; i < 55; i++) {
        const golden = (1 + Math.sqrt(5)) / 2;
        const theta = 2 * Math.PI * i / golden;
        const phi = Math.acos(1 - 2 * (i + 0.5) / 55);
        const sp = Math.sin(phi);
        const nx = sp * Math.cos(theta), ny = Math.cos(phi), nz = sp * Math.sin(theta);
        const s = rand(0.04, 0.09);
        seeds.push(seed(
            [sx + nx * SR, sy + ny * SR, sz_ + nz * SR],
            quatFromNormal(nx, ny, nz),
            [s * 2.5, s * 2.5, s * 0.3],
            hsl(40 + rand(-10, 10), rand(0.4, 0.7), rand(0.3, 0.5)),
            rand(0.65, 0.9),
        ));
    }
    // Saturn's ring — tilted ellipse of small bright splats
    for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const rx = SR * 2.2, ry = SR * 0.4; // ellipse: wide, thin
        const ringX = sx + Math.cos(a) * rx;
        const ringY = sy + Math.sin(a) * ry * 0.3; // tilt
        const ringZ = sz_ + Math.sin(a) * ry;
        seeds.push(seed(
            [ringX, ringY, ringZ],
            quatFromAxisAngle(1, 0, 0, 0.3),
            [rand(0.03, 0.06), rand(0.01, 0.025), 0.01],
            hsl(35 + rand(-10, 10), rand(0.3, 0.5), rand(0.4, 0.6)),
            rand(0.5, 0.8),
        ));
    }

    // ---- Red planet ----
    const rpx = 6.5, rpy = 3.5, rpz = -6.5, RPR = 0.35;
    for (let i = 0; i < 45; i++) {
        const golden = (1 + Math.sqrt(5)) / 2;
        const theta = 2 * Math.PI * i / golden;
        const phi = Math.acos(1 - 2 * (i + 0.5) / 45);
        const sp = Math.sin(phi);
        const nx = sp * Math.cos(theta), ny = Math.cos(phi), nz = sp * Math.sin(theta);
        const s = rand(0.035, 0.075);
        seeds.push(seed(
            [rpx + nx * RPR, rpy + ny * RPR, rpz + nz * RPR],
            quatFromNormal(nx, ny, nz),
            [s * 2.5, s * 2.5, s * 0.3],
            hsl(15 + rand(-12, 12), rand(0.5, 0.8), rand(0.25, 0.45)),
            rand(0.65, 0.9),
        ));
    }

    // Planet glow rings
    [[sx, sy, sz_, 40, SR], [rpx, rpy, rpz, 15, RPR]].forEach(([px, py, pz, hue, r]) => {
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            seeds.push(seed(
                [px + Math.cos(a) * r * 1.6, py + Math.sin(a) * r * 1.6, pz - 0.1],
                [1, 0, 0, 0],
                [rand(0.12, 0.25), rand(0.12, 0.25), 0.03],
                hsl(hue, 0.5, 0.35),
                rand(0.03, 0.08),
            ));
        }
    });
}

/* ================================================================== */
/*  LAYER 3 — Distant pyramids + horizon city silhouette               */
/* ================================================================== */

function generateDistantPyramids(seeds) {
    const pyramids = [
        { cx: -5.0, cy: -1.8, cz: -1.8, h: 2.0, base: 1.6 },
        { cx: -2.0, cy: -1.8, cz: -0.8, h: 1.4, base: 1.1 },
        { cx:  1.5, cy: -1.8, cz: -1.2, h: 3.0, base: 2.4 },
        { cx:  4.5, cy: -1.8, cz: -1.5, h: 2.2, base: 1.8 },
        { cx:  7.0, cy: -1.8, cz: -2.2, h: 1.6, base: 1.3 },
    ];

    const neonCyan = rgb(0.0, 1.0, 1.0);
    const neonMagenta = rgb(1.0, 0.0, 0.8);
    const neonElectric = rgb(0.2, 0.4, 1.0);

    pyramids.forEach(({ cx, cy, cz, h, base }, pi) => {
        const halfB = base * 0.5;
        const neonColors = [neonCyan, neonMagenta, neonElectric];
        const neonColor = neonColors[pi % 3];
        const darkFill = hsl(240 + pi * 15, 0.15, 0.04);

        // Face fill
        for (let row = 0; row < 10; row++) {
            const t = row / 10;
            const rowY = cy + t * h;
            const rowW = halfB * (1 - t);
            const perRow = Math.max(2, Math.round(7 * (1 - t)));
            for (let c = 0; c < perRow; c++) {
                const frac = perRow > 1 ? c / (perRow - 1) : 0.5;
                const x = cx + (frac - 0.5) * rowW * 2;
                const sz = rand(0.05, 0.11);
                seeds.push(seed(
                    [x + rand(-0.03, 0.03), rowY, cz + rand(-0.02, 0.02)],
                    quatFromNormal(0, 0, 1),
                    [sz * 2.2, sz * 1.8, sz * 0.2],
                    lerpColor(darkFill, hsl(240, 0.1, lerp(0.03, 0.07, t)), rand(0, 0.3)),
                    rand(0.35, 0.6),
                ));
            }
        }

        // Neon edges — left, right, base
        for (let side = 0; side < 2; side++) {
            const dir = side === 0 ? -1 : 1;
            for (let i = 0; i < 10; i++) {
                const t = i / 10;
                const ey = cy + t * h;
                const ex = cx + dir * halfB * (1 - t);
                const sz = rand(0.012, 0.025);
                seeds.push(seed(
                    [ex, ey, cz + 0.01],
                    quatFromAxisAngle(0, 0, 1, dir * Math.atan2(h, halfB)),
                    [sz * 4, sz * 0.5, sz * 0.3],
                    neonColor,
                    rand(0.65, 1.0),
                ));
            }
        }
        for (let i = 0; i < 8; i++) {
            const frac = i / 8;
            const sz = rand(0.012, 0.02);
            seeds.push(seed(
                [cx + (frac - 0.5) * base, cy, cz + 0.01],
                [1, 0, 0, 0],
                [sz * 3, sz * 0.5, sz * 0.3],
                neonColor,
                rand(0.45, 0.8),
            ));
        }
    });

    // ---- Horizon city silhouette: thin tall splats ----
    for (let i = 0; i < 35; i++) {
        const hx = rand(-10, 10);
        const bh = rand(0.15, 0.9);
        const bw = rand(0.03, 0.08);
        seeds.push(seed(
            [hx, -1.8 + bh * 0.5, rand(-2.5, -3.5)],
            [1, 0, 0, 0],
            [bw, bh, bw * 0.5],
            hsl(230 + rand(-15, 15), rand(0.1, 0.3), rand(0.03, 0.08)),
            rand(0.3, 0.6),
        ));
    }
    // Tiny window lights on some buildings
    for (let i = 0; i < 20; i++) {
        const wx = rand(-8, 8);
        const wy = -1.8 + rand(0.05, 0.6);
        seeds.push(seed(
            [wx, wy, rand(-2.4, -3.0)],
            [1, 0, 0, 0],
            [rand(0.005, 0.012), rand(0.005, 0.012), 0.005],
            pick([rgb(1, 0.9, 0.3), rgb(0, 0.8, 1), rgb(1, 0.3, 0.6)]),
            rand(0.4, 0.9),
        ));
    }
}

/* ================================================================== */
/*  LAYER 4 — Foreground pyramid + desert + neon reflections           */
/* ================================================================== */

function generateForeground(seeds) {
    const cx = 0, cy = -2.2, cz = 1.5;
    const H = 3.8, BASE = 3.2;
    const halfB = BASE * 0.5;

    const sandDark = rgb(0.08, 0.06, 0.025);
    const sandMid = hsl(35, 0.5, 0.15);
    const neonYellow = rgb(1.0, 0.9, 0.0);
    const neonCyan = rgb(0.0, 1.0, 1.0);
    const neonPink = rgb(1.0, 0.0, 0.8);

    // ---- Pyramid face fill (dense, gradient) ----
    for (let row = 0; row < 20; row++) {
        const t = row / 20;
        const rowY = cy + t * H;
        const rowW = halfB * (1 - t);
        const perRow = Math.max(2, Math.round(14 * (1 - t)));
        for (let c = 0; c < perRow; c++) {
            const frac = perRow > 1 ? c / (perRow - 1) : 0.5;
            const x = cx + (frac - 0.5) * rowW * 2;
            const sz = rand(0.04, 0.11);
            const faceLum = lerp(0.04, 0.09, t);
            seeds.push(seed(
                [x + rand(-0.02, 0.02), rowY, cz + rand(-0.015, 0.015)],
                quatFromNormal(0, 0, 1),
                [sz * 2.5, sz * 2, sz * 0.2],
                lerpColor(sandDark, hsl(240, 0.12, faceLum), t * 0.35),
                rand(0.4, 0.7),
            ));
        }
    }

    // ---- Hieroglyphic / circuit details on pyramid face ----
    for (let i = 0; i < 25; i++) {
        const t = rand(0.15, 0.85);
        const rowW = halfB * (1 - t) * 0.7;
        const hx = cx + rand(-rowW, rowW);
        const hy = cy + t * H;
        const sz = rand(0.01, 0.025);
        const isHoriz = Math.random() < 0.5;
        seeds.push(seed(
            [hx, hy, cz + 0.025],
            [1, 0, 0, 0],
            isHoriz ? [sz * 4, sz * 0.3, 0.01] : [sz * 0.3, sz * 4, 0.01],
            lerpColor(neonCyan, neonPink, rand(0, 1)),
            rand(0.15, 0.4),
        ));
    }

    // ---- Neon edge lines with colour gradients ----
    for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? -1 : 1;
        const baseColor = side === 0 ? neonCyan : neonPink;
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const ey = cy + t * H;
            const ex = cx + dir * halfB * (1 - t);
            const sz = rand(0.02, 0.04);
            seeds.push(seed(
                [ex, ey, cz + 0.02],
                quatFromAxisAngle(0, 0, 1, dir * Math.atan2(H, halfB)),
                [sz * 5.5, sz * 0.6, sz * 0.3],
                lerpColor(baseColor, neonYellow, t),
                rand(0.8, 1.0),
            ));
        }
    }
    // Base edge
    for (let i = 0; i < 16; i++) {
        const frac = i / 16;
        const sz = rand(0.018, 0.032);
        seeds.push(seed(
            [cx + (frac - 0.5) * BASE, cy, cz + 0.02],
            [1, 0, 0, 0],
            [sz * 4, sz * 0.5, sz * 0.3],
            neonCyan,
            rand(0.6, 0.9),
        ));
    }

    // ---- Neon reflections below ground (mirrored edges, faded) ----
    for (let side = 0; side < 2; side++) {
        const dir = side === 0 ? -1 : 1;
        const baseColor = side === 0 ? neonCyan : neonPink;
        for (let i = 0; i < 8; i++) {
            const t = i / 8;
            const ey = cy - t * 0.6; // below ground line
            const ex = cx + dir * halfB * (1 - t * 0.2);
            const sz = rand(0.02, 0.04);
            seeds.push(seed(
                [ex + rand(-0.1, 0.1), ey, cz + rand(0.5, 1.5)],
                quatFromNormal(0, 1, 0),
                [sz * 4, sz * 0.2, sz * 3],
                lerpColor(baseColor, neonYellow, t),
                rand(0.04, 0.12), // very faint — reflection
            ));
        }
    }

    // ---- Desert ground plane ----
    for (let i = 0; i < 160; i++) {
        const gx = rand(-9, 9);
        const gz = rand(cz - 2.5, cz + 5);
        const sz = rand(0.15, 0.65);
        seeds.push(seed(
            [gx, cy + rand(-0.15, 0.04), gz],
            quatFromNormal(0, 1, 0),
            [sz * 2.5, sz * 0.25, sz * 2.5],
            lerpColor(sandDark, sandMid, rand(0, 0.5)),
            rand(0.1, 0.35),
        ));
    }

    // ---- Sand dune ridges (elongated horizontal warm splats) ----
    for (let i = 0; i < 24; i++) {
        const dx = rand(-7, 7);
        const dz = rand(cz, cz + 4);
        const sz = rand(0.03, 0.06);
        seeds.push(seed(
            [dx, cy + rand(-0.05, 0.02), dz],
            quatFromNormal(0, 1, 0),
            [sz * 12, sz * 0.15, sz * 1.5],
            hsl(30 + rand(-8, 8), rand(0.35, 0.55), rand(0.12, 0.2)),
            rand(0.15, 0.35),
        ));
    }

    // ---- Horizon glow band ----
    for (let i = 0; i < 16; i++) {
        const hx = rand(-9, 9);
        seeds.push(seed(
            [hx, cy + rand(-0.3, 0.2), cz - rand(1, 3)],
            [1, 0, 0, 0],
            [rand(0.8, 2.0), rand(0.2, 0.5), 0.05],
            hsl(rand(15, 40), rand(0.35, 0.6), rand(0.06, 0.14)),
            rand(0.04, 0.12),
        ));
    }
}

/* ================================================================== */
/*  LAYER 5 — Atmosphere + colour washes + dust + neon grid            */
/* ================================================================== */

function generateAtmosphere(seeds) {
    const Z = 3.5;

    // ---- Floating dust motes ----
    for (let i = 0; i < 100; i++) {
        const x = rand(-8, 8);
        const y = rand(-2.5, 7);
        const z = rand(Z - 1, Z + 2);
        const sz = rand(0.008, 0.03);
        seeds.push(seed(
            [x, y, z],
            [1, 0, 0, 0],
            [sz, sz, sz * 0.5],
            hsl(rand(25, 55), rand(0.2, 0.4), rand(0.5, 0.85)),
            rand(0.1, 0.35),
        ));
    }

    // ---- Large colour-wash blobs for mixing ----
    const washes = [
        { x: -5, y: 3, col: hsl(290, 0.5, 0.18), sx: 3.0, sy: 2.2 },
        { x: 4, y: -0.5, col: hsl(180, 0.55, 0.15), sx: 2.5, sy: 1.8 },
        { x: 0, y: 5, col: hsl(215, 0.45, 0.12), sx: 3.5, sy: 2.5 },
        { x: -3, y: -1.5, col: hsl(330, 0.4, 0.12), sx: 2.0, sy: 1.4 },
        { x: 6, y: 4, col: hsl(260, 0.45, 0.12), sx: 2.5, sy: 1.8 },
        { x: -6, y: 6, col: hsl(200, 0.4, 0.1), sx: 3.0, sy: 2.0 },
        { x: 1, y: 0, col: hsl(170, 0.3, 0.08), sx: 4.0, sy: 2.0 },
        { x: -2, y: 7, col: hsl(240, 0.35, 0.1), sx: 2.5, sy: 1.5 },
    ];
    washes.forEach(({ x, y, col, sx, sy }) => {
        seeds.push(seed(
            [x, y, Z + 0.5],
            quatFromAxisAngle(0, 0, 1, rand(0, Math.PI)),
            [sx, sy, 0.05],
            col,
            rand(0.025, 0.07),
        ));
    });

    // ---- Lens flare streaks from moon direction ----
    for (let i = 0; i < 12; i++) {
        const t = i / 12;
        const fx = lerp(3.0, -2.5, t);
        const fy = lerp(5.0, -1, t);
        const sz = rand(0.1, 0.4);
        seeds.push(seed(
            [fx + rand(-0.4, 0.4), fy + rand(-0.3, 0.3), Z + 1],
            quatFromAxisAngle(0, 0, 1, -0.65 + rand(-0.15, 0.15)),
            [sz * 4.5, sz * 0.25, 0.05],
            lerpColor(rgb(0.85, 0.92, 1.0), hsl(190, 0.5, 0.55), t),
            rand(0.015, 0.055),
        ));
    }

    // ---- Neon ground grid (cyberpunk signature) ----
    for (let i = 0; i < 50; i++) {
        const gx = rand(-7, 7);
        const gy = -2.2;
        const gz = rand(0, 6);
        const sz = rand(0.012, 0.03);
        const isParallel = Math.random() < 0.5;
        seeds.push(seed(
            [gx, gy + rand(-0.02, 0.02), gz],
            quatFromNormal(0, 1, 0),
            isParallel
                ? [sz * 12, sz * 0.12, sz * 0.3]
                : [sz * 0.12, sz * 0.3, sz * 12],
            pick([neonCyan(), neonPink(), rgb(0.2, 0.4, 1.0)]),
            rand(0.08, 0.3),
        ));
    }

    // ---- Floating neon particles near camera ----
    for (let i = 0; i < 40; i++) {
        const x = rand(-5, 5);
        const y = rand(-1.5, 5);
        const z = rand(Z, Z + 2.5);
        const sz = rand(0.006, 0.018);
        seeds.push(seed(
            [x, y, z],
            [1, 0, 0, 0],
            [sz, sz, sz],
            Math.random() < 0.5
                ? rgb(0.0, rand(0.8, 1.0), rand(0.8, 1.0))
                : rgb(rand(0.8, 1.0), 0.0, rand(0.6, 0.9)),
            rand(0.25, 0.7),
        ));
    }

    // ---- Heat shimmer / mirage near horizon ----
    for (let i = 0; i < 10; i++) {
        const hx = rand(-6, 6);
        seeds.push(seed(
            [hx, -2.2 + rand(-0.1, 0.1), rand(2, 4)],
            [1, 0, 0, 0],
            [rand(0.6, 1.5), rand(0.08, 0.2), 0.05],
            hsl(rand(20, 45), rand(0.2, 0.4), rand(0.15, 0.3)),
            rand(0.03, 0.08),
        ));
    }
}

function neonCyan() { return rgb(0.0, 1.0, 1.0); }
function neonPink() { return rgb(1.0, 0.0, 0.8); }

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

/**
 * Generate the full 5-layer cyberpunk pyramid scene.
 * @returns {Object[]}  ~2000-2200 seeds
 */
export function generateCyberpunkPyramidScene() {
    const seeds = [];
    generateSky(seeds);              // Layer 1
    generateCelestial(seeds);        // Layer 2
    generateDistantPyramids(seeds);  // Layer 3
    generateForeground(seeds);       // Layer 4
    generateAtmosphere(seeds);       // Layer 5
    return seeds;
}

export default generateCyberpunkPyramidScene;
