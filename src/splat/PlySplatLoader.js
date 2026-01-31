/**
 * PlySplatLoader
 *
 * Parses 3D Gaussian Splatting PLY files (binary little-endian and ASCII)
 * into an array of GaussianSeed objects consumable by the render pipeline.
 *
 * Standard 3DGS PLY properties handled:
 *   x, y, z                 → position
 *   scale_0, scale_1, scale_2  → anisotropic scale (log-space)
 *   rot_0 … rot_3           → quaternion (w, x, y, z)
 *   f_dc_0, f_dc_1, f_dc_2  → SH DC → base RGB
 *   opacity                  → logit-space opacity → alpha
 *
 * Two output modes:
 *   - Standard (default): single scalar scale, color premultiplied by alpha,
 *     depth=0. Compatible with GaussianSplatRenderer.
 *   - HiFi (hifi=true): 3-axis anisotropic scale3[], separate opacity,
 *     depth=0. Compatible with HiFiSplatRenderer.
 */

const SH_C0 = 0.28209479177387814; // 1 / (2 * sqrt(π))

/**
 * Parse a PLY ArrayBuffer into GaussianSeed[].
 *
 * @param {ArrayBuffer} buffer  Raw PLY file bytes
 * @param {object} [opts]
 * @param {number}  [opts.maxSplats]        Cap the number of returned splats
 * @param {number}  [opts.scaleMultiplier]  Global scale multiplier
 * @param {boolean} [opts.hifi=false]       Emit hi-fi seeds (3-axis scale, separate opacity)
 * @returns {Object[]}  GaussianSeed[]
 */
export function parsePlySplats(buffer, { maxSplats = Infinity, scaleMultiplier = 1, hifi = false } = {}) {
    const bytes = new Uint8Array(buffer);
    const headerEnd = findHeaderEnd(bytes);
    const headerStr = new TextDecoder().decode(bytes.subarray(0, headerEnd));

    const { vertexCount, properties, format } = parseHeader(headerStr);
    const count = Math.min(vertexCount, maxSplats);

    if (format === 'ascii') {
        return parseAscii(headerStr, bytes, headerEnd, properties, count, scaleMultiplier, hifi);
    }

    return parseBinary(buffer, headerEnd, properties, count, scaleMultiplier, hifi);
}

/* ------------------------------------------------------------------ */
/*  Header parsing                                                     */
/* ------------------------------------------------------------------ */

function findHeaderEnd(bytes) {
    const marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 10]; // "end_header\n"
    outer:
    for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
        for (let j = 0; j < marker.length; j++) {
            if (bytes[i + j] !== marker[j]) continue outer;
        }
        return i + marker.length;
    }
    throw new Error('PLY header not found (missing end_header)');
}

function parseHeader(headerStr) {
    const lines = headerStr.split('\n').map(l => l.trim()).filter(Boolean);
    let format = 'binary_little_endian';
    let vertexCount = 0;
    const properties = [];
    let inVertex = false;

    for (const line of lines) {
        if (line.startsWith('format')) {
            format = line.includes('ascii') ? 'ascii' : 'binary_little_endian';
        } else if (line.startsWith('element vertex')) {
            vertexCount = parseInt(line.split(/\s+/)[2], 10);
            inVertex = true;
        } else if (line.startsWith('element') && inVertex) {
            inVertex = false; // another element started
        } else if (line.startsWith('property') && inVertex) {
            const parts = line.split(/\s+/);
            properties.push({ type: parts[1], name: parts[2] });
        }
    }

    return { vertexCount, properties, format };
}

/* ------------------------------------------------------------------ */
/*  Binary parsing                                                     */
/* ------------------------------------------------------------------ */

const TYPE_SIZE = {
    float: 4, double: 8,
    uchar: 1, char: 1,
    ushort: 2, short: 2,
    uint: 4, int: 4,
};

function parseBinary(buffer, offset, properties, count, scaleMul, hifi = false) {
    const stride = properties.reduce((s, p) => s + (TYPE_SIZE[p.type] || 4), 0);
    const view = new DataView(buffer, offset);

    // Build property offset map
    const propOffset = {};
    let off = 0;
    for (const p of properties) {
        propOffset[p.name] = off;
        off += TYPE_SIZE[p.type] || 4;
    }

    const readF = (base, name) => {
        const o = propOffset[name];
        return o !== undefined ? view.getFloat32(base + o, true) : 0;
    };

    const seeds = [];
    for (let i = 0; i < count; i++) {
        const base = i * stride;
        if (base + stride > view.byteLength) break;

        const x = readF(base, 'x');
        const y = readF(base, 'y');
        const z = readF(base, 'z');

        // Scales (log-space → exp)
        const s0 = Math.exp(readF(base, 'scale_0'));
        const s1 = Math.exp(readF(base, 'scale_1'));
        const s2 = Math.exp(readF(base, 'scale_2'));

        // Quaternion
        const rw = readF(base, 'rot_0');
        const rx = readF(base, 'rot_1');
        const ry = readF(base, 'rot_2');
        const rz = readF(base, 'rot_3');
        const qlen = Math.hypot(rw, rx, ry, rz) || 1;

        // SH DC → RGB
        const sh0 = readF(base, 'f_dc_0');
        const sh1 = readF(base, 'f_dc_1');
        const sh2 = readF(base, 'f_dc_2');
        const cr = Math.max(0, Math.min(1, sh0 * SH_C0 + 0.5));
        const cg = Math.max(0, Math.min(1, sh1 * SH_C0 + 0.5));
        const cb = Math.max(0, Math.min(1, sh2 * SH_C0 + 0.5));

        // Opacity (logit → sigmoid)
        const rawOpacity = readF(base, 'opacity');
        const alpha = 1 / (1 + Math.exp(-rawOpacity));

        if (alpha < 0.05) continue; // skip very transparent splats

        if (hifi) {
            // Hi-fi mode: preserve full anisotropic scale and separate opacity
            seeds.push({
                position: [x, y, z],
                orientation: [rw / qlen, rx / qlen, ry / qlen, rz / qlen],
                scale3: [s0 * scaleMul, s1 * scaleMul, s2 * scaleMul],
                color: [cr, cg, cb],
                opacity: alpha,
                depth: 0,
            });
        } else {
            // Standard mode: averaged scalar scale, premultiplied alpha
            const avgScale = ((s0 + s1 + s2) / 3) * scaleMul;
            seeds.push({
                position: [x, y, z],
                orientation: [rw / qlen, rx / qlen, ry / qlen, rz / qlen],
                scale: avgScale,
                color: [cr * alpha, cg * alpha, cb * alpha],
                depth: 0,
            });
        }
    }

    return seeds;
}

/* ------------------------------------------------------------------ */
/*  ASCII parsing                                                      */
/* ------------------------------------------------------------------ */

function parseAscii(headerStr, bytes, headerEnd, properties, count, scaleMul, hifi = false) {
    const body = new TextDecoder().decode(bytes.subarray(headerEnd));
    const lines = body.split('\n').filter(l => l.trim().length > 0);

    const nameIndex = {};
    properties.forEach((p, i) => { nameIndex[p.name] = i; });
    const col = (vals, name) => {
        const idx = nameIndex[name];
        return idx !== undefined ? parseFloat(vals[idx]) : 0;
    };

    const seeds = [];
    for (let i = 0; i < Math.min(count, lines.length); i++) {
        const vals = lines[i].trim().split(/\s+/);
        const x = col(vals, 'x');
        const y = col(vals, 'y');
        const z = col(vals, 'z');

        const s0 = Math.exp(col(vals, 'scale_0'));
        const s1 = Math.exp(col(vals, 'scale_1'));
        const s2 = Math.exp(col(vals, 'scale_2'));

        const rw = col(vals, 'rot_0');
        const rx = col(vals, 'rot_1');
        const ry = col(vals, 'rot_2');
        const rz = col(vals, 'rot_3');
        const qlen = Math.hypot(rw, rx, ry, rz) || 1;

        const cr = Math.max(0, Math.min(1, col(vals, 'f_dc_0') * SH_C0 + 0.5));
        const cg = Math.max(0, Math.min(1, col(vals, 'f_dc_1') * SH_C0 + 0.5));
        const cb = Math.max(0, Math.min(1, col(vals, 'f_dc_2') * SH_C0 + 0.5));

        const rawOpacity = col(vals, 'opacity');
        const alpha = 1 / (1 + Math.exp(-rawOpacity));
        if (alpha < 0.05) continue;

        if (hifi) {
            seeds.push({
                position: [x, y, z],
                orientation: [rw / qlen, rx / qlen, ry / qlen, rz / qlen],
                scale3: [s0 * scaleMul, s1 * scaleMul, s2 * scaleMul],
                color: [cr, cg, cb],
                opacity: alpha,
                depth: 0,
            });
        } else {
            const avgScale = ((s0 + s1 + s2) / 3) * scaleMul;
            seeds.push({
                position: [x, y, z],
                orientation: [rw / qlen, rx / qlen, ry / qlen, rz / qlen],
                scale: avgScale,
                color: [cr * alpha, cg * alpha, cb * alpha],
                depth: 0,
            });
        }
    }

    return seeds;
}

export default parsePlySplats;
