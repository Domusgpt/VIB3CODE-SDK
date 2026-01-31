/**
 * ShapeSplatGenerator
 *
 * Generates Gaussian seeds distributed over parametric 3D surfaces.
 * Each splat gets a position on the surface, a quaternion orientation
 * aligned with the surface normal, colour derived from parametric
 * coordinates, and a uniform scale.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
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

/** Build a quaternion that rotates +Z to the given normal direction. */
function quatFromNormal(nx, ny, nz) {
    // Rotation from (0,0,1) to (nx,ny,nz)
    const dot = nz; // dot([0,0,1], [nx,ny,nz])
    if (dot > 0.9999) return [1, 0, 0, 0];
    if (dot < -0.9999) return [0, 1, 0, 0]; // 180° around X

    // cross([0,0,1], normal) = (-ny, nx, 0)
    const cx = -ny, cy = nx, cz = 0;
    const s = Math.sqrt((1 + dot) * 2);
    return [s * 0.5, cx / s, cy / s, cz / s];
}

function normalize3(x, y, z) {
    const len = Math.hypot(x, y, z) || 1;
    return [x / len, y / len, z / len];
}

/* ------------------------------------------------------------------ */
/*  Torus                                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate splats on a torus surface.
 *
 * @param {object} [opts]
 * @param {number} [opts.R]          Major radius
 * @param {number} [opts.r]          Minor (tube) radius
 * @param {number} [opts.uSteps]     Samples around the major circle
 * @param {number} [opts.vSteps]     Samples around the tube
 * @param {number} [opts.scale]      Per-splat scale
 * @param {number} [opts.jitter]     Surface-tangent noise
 * @returns {Object[]}
 */
export function generateTorusSplats({
    R = 1.2,
    r = 0.45,
    uSteps = 80,
    vSteps = 40,
    scale = 0.05,
    jitter = 0.15,
} = {}) {
    const seeds = [];
    for (let ui = 0; ui < uSteps; ui++) {
        const u = (ui / uSteps) * Math.PI * 2;
        for (let vi = 0; vi < vSteps; vi++) {
            const v = (vi / vSteps) * Math.PI * 2;

            const cu = Math.cos(u), su = Math.sin(u);
            const cv = Math.cos(v), sv = Math.sin(v);

            // Surface point
            const px = (R + r * cv) * cu;
            const py = r * sv;
            const pz = (R + r * cv) * su;

            // Normal (outward from tube centre)
            const [nx, ny, nz] = normalize3(cv * cu, sv, cv * su);

            // Jitter along tangent plane
            const jx = (Math.random() - 0.5) * jitter * r;
            const jy = (Math.random() - 0.5) * jitter * r;

            const hue = (u / (Math.PI * 2)) * 360;
            const lightness = 0.45 + sv * 0.15;

            seeds.push({
                position: [px + jx * cu, py + jy, pz + jx * su],
                orientation: quatFromNormal(nx, ny, nz),
                scale: scale * (0.7 + Math.random() * 0.6),
                color: hsl(hue, 0.9, lightness),
                depth: 0,
            });
        }
    }
    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Sphere                                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate splats on a UV-sphere surface.
 */
export function generateSphereSplats({
    radius = 1.2,
    uSteps = 60,
    vSteps = 30,
    scale = 0.06,
    jitter = 0.1,
} = {}) {
    const seeds = [];
    for (let vi = 1; vi < vSteps; vi++) {          // skip poles
        const v = (vi / vSteps) * Math.PI;         // 0 → π
        const sv = Math.sin(v), cv = Math.cos(v);
        for (let ui = 0; ui < uSteps; ui++) {
            const u = (ui / uSteps) * Math.PI * 2;
            const cu = Math.cos(u), su = Math.sin(u);

            const nx = sv * cu, ny = cv, nz = sv * su;
            const px = radius * nx;
            const py = radius * ny;
            const pz = radius * nz;

            const jx = (Math.random() - 0.5) * jitter * radius;
            const jy = (Math.random() - 0.5) * jitter * radius;
            const jz = (Math.random() - 0.5) * jitter * radius;

            const hue = (u / (Math.PI * 2)) * 360;
            const lightness = 0.4 + cv * 0.2;

            seeds.push({
                position: [px + jx, py + jy, pz + jz],
                orientation: quatFromNormal(nx, ny, nz),
                scale: scale * (0.7 + Math.random() * 0.6),
                color: hsl(hue, 0.85, lightness),
                depth: 0,
            });
        }
    }
    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Torus Knot (p=2, q=3)                                             */
/* ------------------------------------------------------------------ */

/**
 * Generate splats along a (2,3) torus knot with a tube cross-section.
 */
export function generateTorusKnotSplats({
    R = 1.0,
    r = 0.28,
    p = 2,
    q = 3,
    steps = 300,
    tubeSteps = 12,
    scale = 0.04,
} = {}) {
    const seeds = [];

    for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const rr = R + r * 0.5 * Math.cos(q * t);

        // Centre of knot at t
        const cx = rr * Math.cos(p * t);
        const cy = rr * Math.sin(p * t);
        const cz = -r * 0.5 * Math.sin(q * t);

        // Approximate tangent via finite diff
        const dt = 0.001;
        const t2 = t + dt;
        const rr2 = R + r * 0.5 * Math.cos(q * t2);
        const dx = rr2 * Math.cos(p * t2) - cx;
        const dy = rr2 * Math.sin(p * t2) - cy;
        const dz = -r * 0.5 * Math.sin(q * t2) - cz;
        const [tx, ty, tz] = normalize3(dx, dy, dz);

        // Perpendicular (arbitrary normal via cross with up or right)
        const ref = Math.abs(ty) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const b = normalize3(
            ty * ref[2] - tz * ref[1],
            tz * ref[0] - tx * ref[2],
            tx * ref[1] - ty * ref[0]
        );
        const n = normalize3(
            ty * b[2] - tz * b[1],
            tz * b[0] - tx * b[2],
            tx * b[1] - ty * b[0]
        );

        for (let j = 0; j < tubeSteps; j++) {
            const theta = (j / tubeSteps) * Math.PI * 2;
            const cT = Math.cos(theta), sT = Math.sin(theta);
            const tr = r * 0.35;

            const px = cx + (n[0] * cT + b[0] * sT) * tr;
            const py = cy + (n[1] * cT + b[1] * sT) * tr;
            const pz = cz + (n[2] * cT + b[2] * sT) * tr;

            const [snx, sny, snz] = normalize3(
                n[0] * cT + b[0] * sT,
                n[1] * cT + b[1] * sT,
                n[2] * cT + b[2] * sT
            );

            const hue = (t / (Math.PI * 2)) * 360;
            const lightness = 0.45 + sT * 0.15;

            seeds.push({
                position: [px, py, pz],
                orientation: quatFromNormal(snx, sny, snz),
                scale: scale * (0.8 + Math.random() * 0.4),
                color: hsl(hue, 0.9, lightness),
                depth: 0,
            });
        }
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Double Helix (DNA-like)                                            */
/* ------------------------------------------------------------------ */

/**
 * Generate splats along a double-helix structure with cross-rungs.
 */
export function generateHelixSplats({
    radius = 0.5,
    pitch = 0.8,
    turns = 4,
    steps = 500,
    scale = 0.05,
} = {}) {
    const seeds = [];
    const totalLength = turns * pitch;

    for (let strand = 0; strand < 2; strand++) {
        const angleOffset = strand * Math.PI;
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const angle = t * turns * Math.PI * 2 + angleOffset;

            const px = radius * Math.cos(angle);
            const py = t * totalLength - totalLength / 2;
            const pz = radius * Math.sin(angle);

            const [nx, , nz] = normalize3(Math.cos(angle), 0, Math.sin(angle));

            const baseHue = strand === 0 ? 200 : 340;
            const hue = baseHue + t * 60;

            seeds.push({
                position: [px, py, pz],
                orientation: quatFromNormal(nx, 0, nz),
                scale: scale * (0.8 + Math.random() * 0.4),
                color: hsl(hue, 0.9, 0.55),
                depth: 0,
            });

            // Cross-links (rungs) every 20 steps, only from strand 0
            if (strand === 0 && i % 20 === 0) {
                const otherAngle = angle + Math.PI;
                const ox = radius * Math.cos(otherAngle);
                const oz = radius * Math.sin(otherAngle);

                const rungSteps = 6;
                for (let ri = 0; ri < rungSteps; ri++) {
                    const rt = ri / (rungSteps - 1);
                    seeds.push({
                        position: [
                            px + (ox - px) * rt,
                            py,
                            pz + (oz - pz) * rt,
                        ],
                        orientation: [1, 0, 0, 0],
                        scale: scale * 0.6,
                        color: hsl(60 + rt * 60, 0.8, 0.65),
                        depth: 0,
                    });
                }
            }
        }
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  Multi-shape scene                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate a combined scene with multiple shapes for a richer default.
 */
export function generateMultiShapeSplats() {
    const seeds = [];

    // Central torus knot
    const knot = generateTorusKnotSplats({
        R: 0.8, r: 0.22, steps: 200, tubeSteps: 10, scale: 0.04,
    });
    seeds.push(...knot);

    // Orbiting spheres
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        const ox = Math.cos(angle) * 2;
        const oz = Math.sin(angle) * 2;
        const sphere = generateSphereSplats({
            radius: 0.3, uSteps: 24, vSteps: 12, scale: 0.035, jitter: 0.08,
        });
        for (const s of sphere) {
            s.position[0] += ox;
            s.position[2] += oz;
            // Tint each sphere differently
            const tintHue = i * 120;
            s.color = hsl(tintHue, 0.85, 0.55);
        }
        seeds.push(...sphere);
    }

    return seeds;
}

export default generateTorusSplats;
