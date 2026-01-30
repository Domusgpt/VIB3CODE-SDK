/**
 * ImageSplatGenerator
 *
 * Converts pixel data (from a canvas or image) into Gaussian seeds.
 * Supports uniform grid sampling and edge-aware importance sampling
 * (Sobel-based) so that edges get more splats than flat regions.
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 3×3 Sobel magnitude at (x, y) over a luminance buffer. */
function sobelMag(lum, w, h, x, y) {
    const g = (dx, dy) => {
        const cx = Math.min(w - 1, Math.max(0, x + dx));
        const cy = Math.min(h - 1, Math.max(0, y + dy));
        return lum[cy * w + cx];
    };
    const gx = -g(-1, -1) + g(1, -1) - 2 * g(-1, 0) + 2 * g(1, 0) - g(-1, 1) + g(1, 1);
    const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
    return Math.sqrt(gx * gx + gy * gy);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate splats from raw RGBA pixel data.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba  RGBA pixel data
 * @param {number} width   Image width in pixels
 * @param {number} height  Image height in pixels
 * @param {object} [opts]
 * @param {number} [opts.gridStep]      Sample every N pixels (lower = more splats)
 * @param {number} [opts.edgeBoost]     Extra sub-samples at edges (0 = none)
 * @param {number} [opts.edgeThreshold] Sobel threshold for "edge" (0–1)
 * @param {number} [opts.scale]         Base splat scale
 * @param {number} [opts.depthFromLum]  Map luminance to Z depth (0 = flat)
 * @param {number} [opts.jitter]        Sub-pixel position noise
 * @param {number} [opts.alphaThreshold] Skip nearly-transparent pixels
 * @returns {Object[]}  GaussianSeed[]
 */
export function generateImageSplats(rgba, width, height, {
    gridStep = 4,
    edgeBoost = 3,
    edgeThreshold = 0.12,
    scale = 0.06,
    depthFromLum = 1.5,
    jitter = 0.4,
    alphaThreshold = 30,
} = {}) {
    // Build luminance buffer for Sobel
    const lumBuf = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        lumBuf[i] = luminance(rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255);
    }

    // World-space extent: map image to [-aspect, aspect] × [-1, 1]
    const aspect = width / height;
    const mapX = (px) => (px / width - 0.5) * 2 * aspect;
    const mapY = (py) => -(py / height - 0.5) * 2; // flip Y

    const seeds = [];

    for (let py = 0; py < height; py += gridStep) {
        for (let px = 0; px < width; px += gridStep) {
            const idx = (py * width + px) * 4;
            if (rgba[idx + 3] < alphaThreshold) continue;

            const r = rgba[idx] / 255;
            const g = rgba[idx + 1] / 255;
            const b = rgba[idx + 2] / 255;
            const lum = luminance(r, g, b);

            // How many splats here? 1 base + extra at edges
            const edge = sobelMag(lumBuf, width, height, px, py);
            const count = 1 + (edge > edgeThreshold ? edgeBoost : 0);

            const baseZ = (1 - lum) * depthFromLum; // dark = farther

            for (let s = 0; s < count; s++) {
                const jx = (Math.random() - 0.5) * jitter * (gridStep / width) * 2 * aspect;
                const jy = (Math.random() - 0.5) * jitter * (gridStep / height) * 2;

                seeds.push({
                    position: [mapX(px) + jx, mapY(py) + jy, baseZ + (Math.random() - 0.5) * 0.1],
                    orientation: [1, 0, 0, 0],
                    scale: scale * (0.6 + lum * 0.6 + Math.random() * 0.3),
                    color: [r, g, b],
                    depth: baseZ * 0.3,
                });
            }
        }
    }

    return seeds;
}

/**
 * Generate splats from an HTMLImageElement or HTMLCanvasElement.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {object} [opts]  Same as generateImageSplats options
 * @returns {Object[]}
 */
export function generateImageSplatsFromElement(source, opts = {}) {
    const canvas = document.createElement('canvas');
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    return generateImageSplats(imageData.data, w, h, opts);
}

/**
 * Paint a procedural pattern onto a canvas and return splats.
 * Used as the default image when no user-supplied image is available.
 *
 * @param {number} [size=256]
 * @param {object} [opts]
 * @returns {Object[]}
 */
export function generateProceduralImageSplats(size = 256, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Radial gradient background
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
    grad.addColorStop(0, '#ff6b35');
    grad.addColorStop(0.3, '#d63384');
    grad.addColorStop(0.6, '#6f42c1');
    grad.addColorStop(1, '#0d6efd');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Concentric rings
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 8; i++) {
        const r = (i + 1) * size * 0.06;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = 3 + i * 0.8;
        ctx.strokeStyle = `hsla(${i * 45}, 90%, 70%, 0.5)`;
        ctx.stroke();
    }

    // Star / radial spokes
    for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * size * 0.45, cy + Math.sin(angle) * size * 0.45);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `hsla(${a * 30 + 15}, 80%, 75%, 0.35)`;
        ctx.stroke();
    }

    // VIB3 watermark
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `bold ${Math.round(size * 0.12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText('VIB3+', cx, cy);

    const imageData = ctx.getImageData(0, 0, size, size);
    return generateImageSplats(imageData.data, size, size, { gridStep: 2, ...opts });
}

export default generateImageSplats;
