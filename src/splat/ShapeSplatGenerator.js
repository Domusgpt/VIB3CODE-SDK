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

export default generateTorusSplats;
