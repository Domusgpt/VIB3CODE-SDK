/**
 * TextSplatGenerator
 *
 * Converts a text string into an array of GaussianSeed objects using a
 * built-in 5×7 bitmap font.  Each "lit" pixel in the glyph grid becomes
 * one or more splats with per-character colour and optional depth wave.
 */

/* ------------------------------------------------------------------ */
/*  5×7 bitmap font (row = 5-bit integer, MSB = left pixel)            */
/* ------------------------------------------------------------------ */

const FONT = {
    ' ': [0, 0, 0, 0, 0, 0, 0],
    A: [14, 17, 17, 31, 17, 17, 17],
    B: [30, 17, 17, 30, 17, 17, 30],
    C: [14, 17, 16, 16, 16, 17, 14],
    D: [28, 18, 17, 17, 17, 18, 28],
    E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 14],
    H: [17, 17, 17, 31, 17, 17, 17],
    I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17],
    L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17],
    N: [17, 17, 25, 21, 19, 17, 17],
    O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16],
    Q: [14, 17, 17, 17, 21, 18, 13],
    R: [30, 17, 17, 30, 20, 18, 17],
    S: [14, 17, 16, 14, 1, 17, 14],
    T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4],
    W: [17, 17, 17, 21, 21, 21, 10],
    X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 17, 10, 4, 4, 4],
    Z: [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14],
    '1': [4, 12, 4, 4, 4, 4, 14],
    '2': [14, 17, 1, 2, 4, 8, 31],
    '3': [14, 17, 1, 6, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2],
    '5': [31, 16, 30, 1, 1, 17, 14],
    '6': [6, 8, 16, 30, 17, 17, 14],
    '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14],
    '9': [14, 17, 17, 15, 1, 2, 12],
    '!': [4, 4, 4, 4, 4, 0, 4],
    '.': [0, 0, 0, 0, 0, 0, 4],
    ',': [0, 0, 0, 0, 0, 4, 8],
    '+': [0, 0, 4, 14, 4, 0, 0],
    '-': [0, 0, 0, 14, 0, 0, 0],
    ':': [0, 4, 0, 0, 0, 4, 0],
    '/': [1, 1, 2, 4, 8, 16, 16],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const CHAR_SPACING = 1;     // columns between characters

/* ------------------------------------------------------------------ */
/*  HSL → RGB (for rainbow colouring)                                  */
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

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate Gaussian seeds from a text string.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.scale]       Base splat scale
 * @param {number} [opts.spacing]     World-space size per pixel
 * @param {number} [opts.subSamples]  Extra splats per lit pixel (1 = exact)
 * @param {number} [opts.jitter]      Position randomness (0–1)
 * @param {number} [opts.depthWave]   Z-wave amplitude per character
 * @param {boolean}[opts.rainbow]     Hue gradient across the text
 * @param {number[]} [opts.baseColor] Fallback flat colour [r,g,b]
 * @returns {Object[]}  GaussianSeed[]
 */
export function generateTextSplats(text, {
    scale = 0.12,
    spacing = 0.15,
    subSamples = 3,
    jitter = 0.35,
    depthWave = 0.4,
    rainbow = true,
    baseColor = [1, 1, 1],
} = {}) {
    const upper = text.toUpperCase();
    const seeds = [];
    const totalCols = computeTextWidth(upper);
    const halfW = (totalCols * spacing) / 2;
    const halfH = (GLYPH_H * spacing) / 2;

    let cursorX = 0;

    for (let ci = 0; ci < upper.length; ci++) {
        const ch = upper[ci];
        const glyph = FONT[ch];
        if (!glyph) { cursorX += GLYPH_W + CHAR_SPACING; continue; }

        // Per-character hue and depth
        const charT = upper.length > 1 ? ci / (upper.length - 1) : 0.5;
        const charHue = charT * 300;  // red → magenta sweep
        const charZ = Math.sin(charT * Math.PI * 2) * depthWave;

        for (let row = 0; row < GLYPH_H; row++) {
            const bits = glyph[row];
            for (let col = 0; col < GLYPH_W; col++) {
                if (!((bits >> (GLYPH_W - 1 - col)) & 1)) continue;

                const baseX = (cursorX + col) * spacing - halfW;
                const baseY = ((GLYPH_H - 1 - row)) * spacing - halfH;

                for (let s = 0; s < subSamples; s++) {
                    const jx = (Math.random() - 0.5) * jitter * spacing;
                    const jy = (Math.random() - 0.5) * jitter * spacing;
                    const jz = (Math.random() - 0.5) * jitter * spacing * 0.5;

                    // Per-splat colour variation
                    const splatHue = charHue + (Math.random() - 0.5) * 30;
                    const lightness = 0.55 + Math.random() * 0.2;
                    const color = rainbow ? hsl(splatHue, 0.85, lightness) : [...baseColor];

                    // Random slight orientation for visual variety
                    const angle = Math.random() * Math.PI;
                    const tilt = (Math.random() - 0.5) * 0.3;
                    const cA = Math.cos(angle * 0.5);
                    const sA = Math.sin(angle * 0.5);

                    seeds.push({
                        position: [baseX + jx, baseY + jy, charZ + jz],
                        orientation: [cA, tilt * sA, 0, sA],
                        scale: scale * (0.7 + Math.random() * 0.6),
                        color,
                        depth: Math.abs(charZ) * 0.5 + Math.random() * 0.3,
                    });
                }
            }
        }

        cursorX += GLYPH_W + CHAR_SPACING;
    }

    return seeds;
}

function computeTextWidth(upper) {
    let cols = 0;
    for (let i = 0; i < upper.length; i++) {
        cols += GLYPH_W;
        if (i < upper.length - 1) cols += CHAR_SPACING;
    }
    return cols;
}

export default generateTextSplats;
