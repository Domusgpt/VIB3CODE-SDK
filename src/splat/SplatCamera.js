/**
 * SplatCamera — minimal orbit camera with perspective projection.
 *
 * Produces a Float32Array(16) viewProjection matrix suitable for
 * uploading directly to a WebGL uniform.
 *
 * All matrices are **column-major** (WebGL convention).
 */

/* ------------------------------------------------------------------ */
/*  mat4 helpers (column-major Float32Array(16))                       */
/* ------------------------------------------------------------------ */

function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                a[1 * 4 + r] * b[c * 4 + 1] +
                a[2 * 4 + r] * b[c * 4 + 2] +
                a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return o;
}

function mat4Perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY * 0.5);
    const rangeInv = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * rangeInv, -1,
        0, 0, 2 * far * near * rangeInv, 0
    ]);
}

function mat4LookAt(eye, target, up) {
    // Forward (z)
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;

    // Right (x = up × z)
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;

    // True up (y = z × x)
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
    ]);
}

const IDENTITY = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);

/* ------------------------------------------------------------------ */
/*  SplatCamera                                                        */
/* ------------------------------------------------------------------ */

export class SplatCamera {
    /**
     * @param {object} opts
     * @param {number} [opts.fov]        Field of view in radians (default 50°)
     * @param {number} [opts.aspect]     Viewport aspect ratio
     * @param {number} [opts.near]
     * @param {number} [opts.far]
     * @param {number} [opts.distance]   Orbit radius
     * @param {number} [opts.azimuth]    Horizontal angle (radians)
     * @param {number} [opts.elevation]  Vertical angle (radians)
     * @param {number[]} [opts.target]   Look-at point
     */
    constructor({
        fov = 50 * Math.PI / 180,
        aspect = 960 / 640,
        near = 0.1,
        far = 100,
        distance = 5,
        azimuth = 0,
        elevation = 0.3,
        target = [0, 0, 0]
    } = {}) {
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
        this.distance = distance;
        this.azimuth = azimuth;
        this.elevation = elevation;
        this.target = [...target];
        this._vp = new Float32Array(16);
        this._dirty = true;
    }

    /** Eye position derived from orbit parameters. */
    get eye() {
        const ce = Math.cos(this.elevation);
        return [
            this.target[0] + this.distance * ce * Math.sin(this.azimuth),
            this.target[1] + this.distance * Math.sin(this.elevation),
            this.target[2] + this.distance * ce * Math.cos(this.azimuth)
        ];
    }

    /** Combined view × projection matrix. */
    get viewProjection() {
        const proj = mat4Perspective(this.fov, this.aspect, this.near, this.far);
        const view = mat4LookAt(this.eye, this.target, [0, 1, 0]);
        return mat4Multiply(proj, view);
    }

    /** Convenience: identity matrix (for legacy clip-space rendering). */
    static identity() {
        return new Float32Array(IDENTITY);
    }

    /**
     * Bind mouse / pointer listeners to a canvas for interactive orbit.
     * @param {HTMLCanvasElement} canvas
     */
    attachControls(canvas) {
        let dragging = false;
        let lastX = 0, lastY = 0;

        canvas.addEventListener('pointerdown', (e) => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            this.azimuth -= dx * 0.005;
            this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation + dy * 0.005));
            lastX = e.clientX;
            lastY = e.clientY;
        });

        canvas.addEventListener('pointerup', () => { dragging = false; });
        canvas.addEventListener('pointerleave', () => { dragging = false; });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.distance = Math.max(1, Math.min(30, this.distance + e.deltaY * 0.01));
        }, { passive: false });
    }
}

export default SplatCamera;
