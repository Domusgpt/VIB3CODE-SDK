/**
 * VIB3+ Hybrid Render Pipeline v3 — Demo Entry Point
 *
 * Imports real v3 modules via Vite; built to docs/hybrid-bundle.js
 */

// Direct imports — avoids barrel export pulling in Node-only schemas
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { encodeGaussianSeeds, GAUSSIAN_SEED_STRIDE } from '../src/render/GaussianSeedBuffer.js';
import { MeshRenderer } from '../src/render/MeshRenderer.js';
import { EdgeInscriptionLayer } from '../src/render/EdgeInscriptionLayer.js';
import { HybridRenderPipeline, BlendModes } from '../src/render/HybridRenderPipeline.js';
import { TextureToSplatConverter } from '../src/render/TextureToSplatConverter.js';
import { InscriptionChannel } from '../src/render/InscriptionChannel.js';
import { ShadowMap } from '../src/render/ShadowMap.js';
import { ParticleSystem } from '../src/render/ParticleSystem.js';
import { VolumetricInscription } from '../src/render/VolumetricInscription.js';
import { DeferredInscriptionLighting } from '../src/render/DeferredInscriptionLighting.js';
import { InscriptionTexture } from '../src/render/InscriptionTexture.js';
import { SSR } from '../src/render/SSR.js';

/* ================================================================== */
/*  PROCEDURAL MESH GENERATORS                                         */
/* ================================================================== */

function generateTorus(R, r, segments, rings) {
    const p = [], n = [], u = [], idx = [];
    for (let j = 0; j <= rings; j++)
        for (let i = 0; i <= segments; i++) {
            const a = i / segments * Math.PI * 2, b = j / rings * Math.PI * 2;
            p.push((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a));
            n.push(Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a));
            u.push(i / segments, j / rings);
        }
    for (let j = 0; j < rings; j++)
        for (let i = 0; i < segments; i++) {
            const a = j * (segments + 1) + i, b = a + segments + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx), triCount: idx.length / 3 };
}

function generateSphere(radius, ws, hs) {
    const p = [], n = [], u = [], idx = [];
    for (let y = 0; y <= hs; y++)
        for (let x = 0; x <= ws; x++) {
            const a = x / ws, b = y / hs, th = a * Math.PI * 2, ph = b * Math.PI;
            const px = -radius * Math.cos(th) * Math.sin(ph), py = radius * Math.cos(ph), pz = radius * Math.sin(th) * Math.sin(ph);
            const l = Math.sqrt(px * px + py * py + pz * pz) || 1;
            p.push(px, py, pz); n.push(px / l, py / l, pz / l); u.push(a, b);
        }
    for (let y = 0; y < hs; y++)
        for (let x = 0; x < ws; x++) {
            const a = y * (ws + 1) + x, b = a + ws + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx), triCount: idx.length / 3 };
}

function generateCube(size) {
    const s = size / 2;
    const P = [-s, -s, s, s, -s, s, s, s, s, -s, s, s, s, -s, -s, -s, -s, -s, -s, s, -s, s, s, -s, -s, s, s, s, s, s, s, s, -s, -s, s, -s, -s, -s, -s, s, -s, -s, s, -s, s, -s, -s, s, s, -s, s, s, -s, -s, s, s, -s, s, s, s, -s, -s, -s, -s, -s, s, -s, s, s, -s, s, -s];
    const N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
    const U = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
    const I = [];
    for (let f = 0; f < 6; f++) { const o = f * 4; I.push(o, o + 1, o + 2, o, o + 2, o + 3); }
    return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint16Array(I), triCount: I.length / 3 };
}

function generateTrefoilKnot(radius, tube, ts, rs) {
    const p = [], n = [], u = [], idx = [];
    function kp(t) { t *= Math.PI * 2; return [(Math.sin(t) + 2 * Math.sin(2 * t)) * radius, (Math.cos(t) - 2 * Math.cos(2 * t)) * radius, -Math.sin(3 * t) * radius]; }
    for (let j = 0; j <= rs; j++)
        for (let i = 0; i <= ts; i++) {
            const a = i / ts, v = j / rs * Math.PI * 2;
            const pt = kp(a), p1 = kp(a + 0.001);
            const T = [p1[0] - pt[0], p1[1] - pt[1], p1[2] - pt[2]];
            const tl = Math.sqrt(T[0] * T[0] + T[1] * T[1] + T[2] * T[2]) || 1;
            T[0] /= tl; T[1] /= tl; T[2] /= tl;
            let N0 = [0, 1, 0]; if (Math.abs(T[1]) > 0.99) N0 = [1, 0, 0];
            const B = [T[1] * N0[2] - T[2] * N0[1], T[2] * N0[0] - T[0] * N0[2], T[0] * N0[1] - T[1] * N0[0]];
            const bl = Math.sqrt(B[0] * B[0] + B[1] * B[1] + B[2] * B[2]) || 1;
            B[0] /= bl; B[1] /= bl; B[2] /= bl;
            const Nv = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]];
            const cx = Math.cos(v), sx = Math.sin(v);
            const nx = cx * Nv[0] + sx * B[0], ny = cx * Nv[1] + sx * B[1], nz = cx * Nv[2] + sx * B[2];
            p.push(pt[0] + tube * nx, pt[1] + tube * ny, pt[2] + tube * nz);
            n.push(nx, ny, nz); u.push(a, j / rs);
        }
    for (let j = 0; j < rs; j++)
        for (let i = 0; i < ts; i++) {
            const a = j * (ts + 1) + i, b = a + ts + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    return { positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx), triCount: idx.length / 3 };
}

/* ================================================================== */
/*  PROCEDURAL TEXTURE                                                 */
/* ================================================================== */

function generateCheckerTexture(size) {
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.5);
    grd.addColorStop(0, '#ff6b35'); grd.addColorStop(0.35, '#d63384');
    grd.addColorStop(0.65, '#6f42c1'); grd.addColorStop(1, '#0d6efd');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'multiply';
    const cells = 8, cs = size / cells;
    for (let r = 0; r < cells; r++)
        for (let cl = 0; cl < cells; cl++) {
            ctx.fillStyle = (r + cl) % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(60,60,80,0.85)';
            ctx.fillRect(cl * cs, r * cs, cs, cs);
        }
    ctx.globalCompositeOperation = 'screen';
    for (let i = 1; i <= 6; i++) {
        ctx.beginPath(); ctx.arc(size / 2, size / 2, i * size * 0.07, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = `hsla(${i * 50},80%,70%,0.4)`; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    return ctx.getImageData(0, 0, size, size);
}

/* ================================================================== */
/*  VIB3 PROCEDURAL SHADER (Layer 2)                                   */
/* ================================================================== */

const FS_VERT = `#version 300 es
precision highp float; out vec2 v_uv;
void main(){float x=float((gl_VertexID&1)<<2)-1.0;float y=float((gl_VertexID&2)<<1)-1.0;v_uv=vec2(x,y)*0.5+0.5;gl_Position=vec4(x,y,0.0,1.0);}`;

const PROC_FRAG = `#version 300 es
precision highp float; in vec2 v_uv; uniform float u_time,u_geometry; uniform vec2 u_resolution; out vec4 outColor;
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
void main(){
    vec2 uv=(v_uv*2.0-1.0)*vec2(u_resolution.x/u_resolution.y,1.0); float t=u_time*0.3;
    vec4 p=rXW(t*0.4)*rYW(t*0.3)*rZW(t*0.2)*vec4(uv,0,0); vec3 pos=p.xyz/(2.0-p.w);
    float b=mod(u_geometry,8.0),pat=0.0;
    if(b<0.5)pat=abs(sin(pos.x*6.0+t)*sin(pos.y*6.0-t));
    else if(b<1.5){vec3 q=fract(pos*4.0)-0.5;pat=1.0-smoothstep(0.2,0.3,length(max(abs(q)-0.2,0.0)));}
    else if(b<2.5){pat=1.0-smoothstep(0.3,0.5,length(pos));pat*=abs(sin(atan(pos.y,pos.x)*5.0+t*2.0));}
    else if(b<3.5){float r=length(pos.xy);pat=abs(sin((r-0.35)*30.0+t*2.0))*smoothstep(0.5,0.3,abs(r-0.35));}
    else if(b<4.5){float a=atan(pos.y,pos.x)+t;pat=abs(sin(a*3.0+pos.x*5.0));}
    else if(b<5.5){vec2 q=pos.xy*3.0;for(int i=0;i<4;i++){q=abs(q)-1.0;q*=1.5;}pat=1.0-smoothstep(0.0,0.2,length(q)*0.1);}
    else if(b<6.5){pat=sin(pos.x*10.0+t)*sin(pos.y*10.0+t*0.7);pat=pat*0.5+0.5;}
    else{vec2 q=abs(fract(pos.xy*4.0)-0.5);pat=1.0-smoothstep(0.0,0.05,min(q.x,q.y));}
    if(u_geometry>=8.0&&u_geometry<16.0)pat*=smoothstep(0.6,0.3,length(pos));
    else if(u_geometry>=16.0)pat*=smoothstep(0.5,0.2,abs(max(abs(pos.x+pos.y)-pos.x,abs(pos.x-pos.y)+pos.x)*0.5));
    vec3 col=vec3(0.2,0.5,1.0)*pat+vec3(0.8,0.2,0.5)*(1.0-pat)*0.3; col*=pat;
    outColor=vec4(col,pat*0.7);
}`;

/* ================================================================== */
/*  CAMERA                                                             */
/* ================================================================== */

function mat4Multiply(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
function mat4Perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov * 0.5), ri = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * ri, -1, 0, 0, 2 * far * near * ri, 0]); }
function mat4LookAt(eye, tgt, up) { let zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l; let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx; return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]); }

class CinemaCamera {
    constructor(canvas) {
        this.azimuth = 0.5;
        this.elevation = 0.35;
        this.distance = 5;
        this.fov = Math.PI / 4;
        this.near = 0.1;
        this.far = 100;
        this.target = [0, 0, 0];
        this.canvas = canvas;

        // Velocity state (inertia)
        this._vAz = 0;
        this._vEl = 0;
        this._vDist = 0;

        // Physics tuning
        this._friction = 0.93;
        this._zoomFriction = 0.87;
        this._sensitivity = 0.004;
        this._zoomSens = 0.001;
        this._springK = 3.5;
        this._springDamp = 0.88;

        // Auto-pilot
        this._autopilot = true;
        this._autoTimer = null;
        this._tAz = 0.5;
        this._tEl = 0.35;
        this._tDist = 5;
        this._orbitSpeed = 0.12;

        // Choreography (per-scene sine wobble)
        this._choroElAmp = 0.08;
        this._choroElFreq = 0.4;
        this._choroDistAmp = 0.3;
        this._choroDistFreq = 0.25;

        // Input tracking (multi-touch)
        this._pointers = new Map();
        this._pinchDist = 0;

        // Elastic zoom bounds
        this._minDist = 1.5;
        this._maxDist = 20;

        // Bind events
        canvas.style.touchAction = 'none';
        canvas.style.userSelect = 'none';
        canvas.style.webkitUserSelect = 'none';
        canvas.addEventListener('pointerdown', this._down.bind(this));
        canvas.addEventListener('pointermove', this._move.bind(this));
        canvas.addEventListener('pointerup', this._up.bind(this));
        canvas.addEventListener('pointercancel', this._up.bind(this));
        canvas.addEventListener('wheel', this._wheel.bind(this), { passive: false });
    }

    _down(e) {
        this.canvas.setPointerCapture(e.pointerId);
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this._vAz *= 0.3;
        this._vEl *= 0.3;
        this._autopilot = false;
        clearTimeout(this._autoTimer);
        if (this._pointers.size === 2) {
            const [a, b] = [...this._pointers.values()];
            this._pinchDist = Math.hypot(b.x - a.x, b.y - a.y);
        }
    }

    _move(e) {
        const p = this._pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;

        if (this._pointers.size === 1) {
            const vx = dx * this._sensitivity;
            const vy = dy * this._sensitivity;
            this.azimuth += vx;
            this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation + vy));
            this._vAz = this._vAz * 0.5 + vx * 0.5;
            this._vEl = this._vEl * 0.5 + vy * 0.5;
        } else if (this._pointers.size === 2) {
            const [a, b] = [...this._pointers.values()];
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            if (this._pinchDist > 10) {
                const ratio = this._pinchDist / dist;
                this.distance *= ratio;
                this._vDist = (ratio - 1) * this.distance * 0.5;
            }
            this._pinchDist = dist;
            this.azimuth += dx * this._sensitivity * 0.3;
            this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation + dy * this._sensitivity * 0.3));
        }
    }

    _up(e) {
        this._pointers.delete(e.pointerId);
        this._pinchDist = 0;
        if (this._pointers.size === 0) this._scheduleAutoResume();
    }

    _wheel(e) {
        e.preventDefault();
        const delta = e.deltaY * this._zoomSens;
        this._vDist += delta * this.distance;
        this.distance *= (1 + delta);
        this._autopilot = false;
        clearTimeout(this._autoTimer);
        this._scheduleAutoResume();
    }

    _scheduleAutoResume() {
        clearTimeout(this._autoTimer);
        this._autoTimer = setTimeout(() => {
            this._tAz = this.azimuth;
            this._tEl = this.elevation;
            this._tDist = this.distance;
            this._autopilot = true;
        }, 3500);
    }

    setTarget(azimuth, elevation, distance, orbitSpeed = 0.12, choreography = null) {
        this._tAz = azimuth;
        this._tEl = elevation;
        this._tDist = distance;
        this._orbitSpeed = orbitSpeed;
        this._autopilot = true;
        clearTimeout(this._autoTimer);
        if (choreography) {
            this._choroElAmp = choreography.elAmp || 0;
            this._choroElFreq = choreography.elFreq || 0;
            this._choroDistAmp = choreography.distAmp || 0;
            this._choroDistFreq = choreography.distFreq || 0;
        } else {
            this._choroElAmp = 0;
            this._choroElFreq = 0;
            this._choroDistAmp = 0;
            this._choroDistFreq = 0;
        }
    }

    releaseAutopilot() {
        this._autopilot = false;
        clearTimeout(this._autoTimer);
    }

    update(dt, time) {
        dt = Math.min(dt, 0.05);
        const fric = Math.pow(this._friction, dt * 60);
        const zfric = Math.pow(this._zoomFriction, dt * 60);

        if (this._pointers.size === 0) {
            if (this._autopilot) {
                const chorEl = this._choroElAmp * Math.sin(time * this._choroElFreq);
                const chorDist = this._choroDistAmp * Math.sin(time * this._choroDistFreq);
                const k = this._springK * dt;
                this._vAz += (this._tAz - this.azimuth) * k;
                this._vEl += ((this._tEl + chorEl) - this.elevation) * k;
                this._vDist += ((this._tDist + chorDist) - this.distance) * k;
                this.azimuth += this._vAz;
                this.elevation += this._vEl;
                this.distance += this._vDist;
                this._vAz *= this._springDamp;
                this._vEl *= this._springDamp;
                this._vDist *= this._springDamp;
                this._tAz += this._orbitSpeed * dt;
            } else {
                this.azimuth += this._vAz;
                this.elevation += this._vEl;
                this.distance += this._vDist;
                this.elevation = Math.max(-1.4, Math.min(1.4, this.elevation));
                this._vAz *= fric;
                this._vEl *= fric;
                this._vDist *= zfric;
                if (Math.abs(this._vAz) < 1e-6) this._vAz = 0;
                if (Math.abs(this._vEl) < 1e-6) this._vEl = 0;
                if (Math.abs(this._vDist) < 1e-5) this._vDist = 0;
            }
        }

        // Elastic zoom bounds
        if (this.distance < this._minDist) {
            this.distance += (this._minDist - this.distance) * 0.12;
            this._vDist *= 0.5;
        } else if (this.distance > this._maxDist) {
            this.distance += (this._maxDist - this.distance) * 0.12;
            this._vDist *= 0.5;
        }
    }

    get isDragging() { return this._pointers.size > 0; }
    get eye() {
        const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
        const ca = Math.cos(this.azimuth), sa = Math.sin(this.azimuth);
        return [this.target[0] + this.distance * ce * sa,
                this.target[1] + this.distance * se,
                this.target[2] + this.distance * ce * ca];
    }
    get aspect() { return this.canvas.width / this.canvas.height; }
    get viewMatrix() { return mat4LookAt(this.eye, this.target, [0, 1, 0]); }
    get projectionMatrix() { return mat4Perspective(this.fov, this.aspect, this.near, this.far); }
    get viewProjection() { return mat4Multiply(this.projectionMatrix, this.viewMatrix); }
}

/* ================================================================== */
/*  SETUP                                                              */
/* ================================================================== */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;

const gl = canvas.getContext('webgl2', { depth: true, antialias: false, preserveDrawingBuffer: true });
if (!gl) { document.body.innerHTML = '<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>'; throw new Error('WebGL2 required'); }
gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_color_buffer_float');

const camera = new CinemaCamera(canvas);
window.addEventListener('resize', () => { canvas.width = window.innerWidth * devicePixelRatio; canvas.height = window.innerHeight * devicePixelRatio; });

/* ================================================================== */
/*  INIT v2 RENDERERS                                                  */
/* ================================================================== */

const meshRenderer = new MeshRenderer(gl, { lightDir: [0.5, 0.8, 0.3], lightColor: [1.0, 0.98, 0.95], ambientColor: [0.15, 0.15, 0.22], specularPower: 48 });
const splatRenderer = new GaussianSplatRenderer(gl, { pointScale: canvas.height / (2 * Math.tan(Math.PI / 8)), blendMode: 'additive', animate: true, intensity: 1.0, chromatic: 0.4 });
const edgeInscription = new EdgeInscriptionLayer(gl, { layerCount: 4, geometry: 3, thickness: 0.6, patternScale: 3.0, patternSpeed: 0.3, depthSensitivity: 8.0, normalSensitivity: 2.0, opacity: 0.8 });
const pipeline = new HybridRenderPipeline(gl, { exposure: 1.2, gamma: 2.2 });
pipeline.setMeshRenderer(meshRenderer);
pipeline.setSplatRenderer(splatRenderer);
pipeline.setEdgeInscription(edgeInscription);

// InscriptionChannel (v2)
const inscriptionChannel = new InscriptionChannel({ layerCount: 4, transitionDuration: 0.5 });
inscriptionChannel.registerObject(1, 'active');
let audioSimLevel = 0.3;

// Procedural shader (Layer 2)
let procProgram = null, procQuadVao = null, procGeometry = 3;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, PROC_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        procProgram = gl.createProgram(); gl.attachShader(procProgram, vs); gl.attachShader(procProgram, fs); gl.linkProgram(procProgram);
        if (!gl.getProgramParameter(procProgram, gl.LINK_STATUS)) procProgram = null;
        else procQuadVao = gl.createVertexArray();
    }
}
pipeline.setProceduralRenderer((fbo, time) => {
    if (!procProgram) return;
    gl.useProgram(procProgram); gl.bindVertexArray(procQuadVao);
    gl.uniform1f(gl.getUniformLocation(procProgram, 'u_time'), time);
    gl.uniform1f(gl.getUniformLocation(procProgram, 'u_geometry'), procGeometry);
    gl.uniform2f(gl.getUniformLocation(procProgram, 'u_resolution'), fbo.width, fbo.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
});

/* ================================================================== */
/*  INIT v3 RENDERERS                                                  */
/* ================================================================== */

// v3: Shadow Map
let shadowMap = null;
let shadowsEnabled = true;
let shadowIntensity = 0.7;
let shadowSoftness = 0.5;
try {
    shadowMap = new ShadowMap(gl, {
        resolution: 1024,
        bias: 0.003,
        pcfRadius: 2,
        frustumSize: 6,
        lightDir: [0.5, 0.8, 0.3],
    });
    shadowMap.init();
} catch (e) {
    console.warn('ShadowMap init failed:', e);
    shadowMap = null;
}

// v3: Particle System
let particleSystem = null;
let particlesEnabled = true;
let particleRate = 50;
let particleSize = 0.8;
let particleMode = 'surface';
try {
    particleSystem = new ParticleSystem(gl, {
        maxParticles: 10000,
        emitRate: 50,
        lifetime: 2.5,
        speed: 0.3,
        speedVariance: 0.15,
        gravity: [0, -0.1, 0],
        drag: 0.02,
        splatScale: 0.015,
        emitterType: 'sphere',
        emitterRadius: 1.2,
        colorStart: [0.4, 0.7, 1.0],
        colorEnd: [0.8, 0.3, 1.0],
        colorMode: 'lerp',
    });
} catch (e) {
    console.warn('ParticleSystem init failed:', e);
    particleSystem = null;
}

// v3: Volumetric Inscription
let volumetricInscription = null;
let volumetricEnabled = false;
let volDensity = 0.8;
let volAbsorption = 0.4;
try {
    volumetricInscription = new VolumetricInscription(gl, {
        maxSteps: 48,
        density: 0.8,
        absorption: 0.4,
        geometry: 3,
        primaryColor: [0.3, 0.6, 1.0],
        secondaryColor: [0.8, 0.2, 0.9],
    });
    volumetricInscription.init();
} catch (e) {
    console.warn('VolumetricInscription init failed:', e);
    volumetricInscription = null;
}

// v3: Deferred Inscription Lighting
let deferredLighting = null;
let deferredLitEnabled = true;
let specularStrength = 0.6;
let fresnelPower = 0.4;
try {
    deferredLighting = new DeferredInscriptionLighting(gl, {
        lightDir: [0.5, 0.8, 0.3],
        lightColor: [1.0, 0.98, 0.95],
        specularPower: 32,
        specularStrength: 0.6,
        fresnelPower: 3.0,
        inscriptionEmission: 1.5,
    });
    deferredLighting.init();
} catch (e) {
    console.warn('DeferredInscriptionLighting init failed:', e);
    deferredLighting = null;
}

// v3: Inscription Texture
let inscriptionTexture = null;
try {
    inscriptionTexture = new InscriptionTexture(gl);
    inscriptionTexture.setLayerCircuitPattern(0, { density: 12, color: '#5b9cf5' });
    inscriptionTexture.setLayerText(1, 'VIB3+', { fontSize: 48, color: '#a78bfa' });
} catch (e) {
    console.warn('InscriptionTexture init failed:', e);
    inscriptionTexture = null;
}

// v3: Screen-Space Reflections
let ssr = null;
let ssrEnabled = true;
let ssrStrength = 0.6;
try {
    ssr = new SSR(gl, {
        maxSteps: 48,
        maxDistance: 8,
        thickness: 0.15,
        stride: 2,
        jitter: 0.4,
        fadeEdge: 0.12,
        reflectionStrength: 0.6,
    });
    ssr.init();
} catch (e) {
    console.warn('SSR init failed:', e);
    ssr = null;
}

// v3: Bloom enabled by default
let bloomEnabled = true;
let bloomThreshold = 0.65;
let bloomIntensity = 0.45;
let bloomRadius = 0.8;

// v3: Cinematic post-process
let vignetteEnabled = true;
let vignetteStrength = 0.35;
let chromaticEnabled = true;
let chromaticStrength = 0.003;

// v3: Auto-showcase
let autoShowcase = true;
let showcaseGeometryTimer = 0;
let showcaseGeometryInterval = 12; // seconds per geometry
let showcaseGeometryIndex = 3;
let targetGeometry = 3;

/* ================================================================== */
/*  MESH + TEXTURE + SPLAT SETUP                                       */
/* ================================================================== */

const MESHES = {
    torus: () => generateTorus(1, 0.4, 64, 32),
    sphere: () => generateSphere(1.2, 48, 32),
    cube: () => generateCube(1.8),
    knot: () => generateTrefoilKnot(0.35, 0.12, 128, 24),
};
let currentMeshKey = 'torus', currentMesh = null, textureSplats = [];
const textureConverter = new TextureToSplatConverter();
const textureData = generateCheckerTexture(256);

function loadMesh(key) {
    currentMeshKey = key;
    const gen = MESHES[key];
    if (!gen) return;
    currentMesh = gen();
    meshRenderer.uploadGeometry(currentMesh);
    meshRenderer.uploadTexture(textureData);
    textureSplats = textureConverter.convert({
        positions: currentMesh.positions, normals: currentMesh.normals,
        uvs: currentMesh.uvs, indices: currentMesh.indices,
        diffusePixels: textureData.data, diffuseWidth: textureData.width, diffuseHeight: textureData.height,
    });
    splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats), textureSplats.length);
    document.getElementById('meshTris').textContent = currentMesh.triCount.toLocaleString();
    document.getElementById('splatCount').textContent = textureSplats.length.toLocaleString();
    document.querySelectorAll('.mesh-btn').forEach(b => b.classList.toggle('active', b.dataset.mesh === key));
}

/* ================================================================== */
/*  v3: MEDIA INGESTION — Webcam / Image / Video → Pipeline            */
/* ================================================================== */

let mediaSource = 'none';       // 'none' | 'webcam' | 'image' | 'video'
let mediaVideo = null;          // HTMLVideoElement (webcam or video file)
let mediaCanvas = null;         // offscreen canvas for pixel extraction
let mediaCtx = null;
let mediaStream = null;         // MediaStream for webcam
let mediaSplatMode = 'surface'; // 'surface' (texture on mesh) | 'dissolve' (splat cloud)
let mediaSplatUpdateInterval = 6; // update splats every N frames
let mediaSplatFrameCounter = 0;
let mediaActive = false;

// Create offscreen canvas for pixel extraction
mediaCanvas = document.createElement('canvas');
mediaCanvas.width = 256;
mediaCanvas.height = 256;
mediaCtx = mediaCanvas.getContext('2d', { willReadFrequently: true });

async function startWebcam() {
    try {
        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); }
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 512 }, height: { ideal: 512 }, facingMode: 'user' }
        });
        if (!mediaVideo) {
            mediaVideo = document.createElement('video');
            mediaVideo.playsInline = true;
            mediaVideo.muted = true;
        }
        mediaVideo.srcObject = mediaStream;
        await mediaVideo.play();
        mediaSource = 'webcam';
        mediaActive = true;
        updateMediaBadge();
    } catch (e) {
        console.warn('Webcam access denied:', e);
        alert('Camera access denied. Check browser permissions.');
    }
}

function stopMedia() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (mediaVideo) { mediaVideo.pause(); mediaVideo.srcObject = null; }
    mediaSource = 'none';
    mediaActive = false;
    // Restore default texture
    if (currentMesh) {
        meshRenderer.uploadTexture(textureData);
        textureSplats = textureConverter.convert({
            positions: currentMesh.positions, normals: currentMesh.normals,
            uvs: currentMesh.uvs, indices: currentMesh.indices,
            diffusePixels: textureData.data, diffuseWidth: textureData.width, diffuseHeight: textureData.height,
        });
        splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats), textureSplats.length);
        const elSC = document.getElementById('splatCount');
        if (elSC) elSC.textContent = textureSplats.length.toLocaleString();
    }
    updateMediaBadge();
}

function loadMediaImage(file) {
    const img = new Image();
    img.onload = () => {
        mediaCanvas.width = Math.min(img.width, 512);
        mediaCanvas.height = Math.min(img.height, 512);
        mediaCtx.drawImage(img, 0, 0, mediaCanvas.width, mediaCanvas.height);
        const imageData = mediaCtx.getImageData(0, 0, mediaCanvas.width, mediaCanvas.height);
        // Apply as mesh texture
        meshRenderer.uploadTexture(imageData);
        // Convert to splats
        if (currentMesh) {
            textureSplats = textureConverter.convert({
                positions: currentMesh.positions, normals: currentMesh.normals,
                uvs: currentMesh.uvs, indices: currentMesh.indices,
                diffusePixels: imageData.data, diffuseWidth: mediaCanvas.width, diffuseHeight: mediaCanvas.height,
            });
            splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats), textureSplats.length);
            const elSC = document.getElementById('splatCount');
            if (elSC) elSC.textContent = textureSplats.length.toLocaleString();
        }
        mediaSource = 'image';
        mediaActive = true;
        updateMediaBadge();
        URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
}

function loadMediaVideo(file) {
    if (!mediaVideo) {
        mediaVideo = document.createElement('video');
        mediaVideo.playsInline = true;
        mediaVideo.muted = true;
        mediaVideo.loop = true;
    }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    mediaVideo.srcObject = null;
    mediaVideo.src = URL.createObjectURL(file);
    mediaVideo.play();
    mediaSource = 'video';
    mediaActive = true;
    updateMediaBadge();
}

function updateMediaBadge() {
    const el = document.getElementById('badgeMedia');
    if (el) el.className = 'feature-badge ' + (mediaActive ? 'on' : 'off');
    const elSrc = document.getElementById('mediaSourceLabel');
    if (elSrc) {
        const labels = { none: 'None', webcam: 'Webcam', image: 'Image', video: 'Video' };
        elSrc.textContent = labels[mediaSource] || 'None';
    }
}

// Per-frame video texture update (called from render loop)
function updateMediaTexture() {
    if (!mediaActive || mediaSource === 'none' || mediaSource === 'image') return;
    if (!mediaVideo || mediaVideo.readyState < 2) return;

    // Update mesh diffuse texture directly from video element (GPU path)
    const gl2 = meshRenderer.gl;
    if (meshRenderer._diffuseTexture) {
        gl2.bindTexture(gl2.TEXTURE_2D, meshRenderer._diffuseTexture);
        gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, mediaVideo);
        // Skip mipmap regeneration for performance (use LINEAR instead)
        gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    }

    // Periodically update splats from video frames
    mediaSplatFrameCounter++;
    if (mediaSplatFrameCounter >= mediaSplatUpdateInterval && currentMesh) {
        mediaSplatFrameCounter = 0;
        mediaCanvas.width = 256;
        mediaCanvas.height = 256;
        mediaCtx.drawImage(mediaVideo, 0, 0, 256, 256);
        const pixels = mediaCtx.getImageData(0, 0, 256, 256);

        if (mediaSplatMode === 'surface') {
            textureSplats = textureConverter.convert({
                positions: currentMesh.positions, normals: currentMesh.normals,
                uvs: currentMesh.uvs, indices: currentMesh.indices,
                diffusePixels: pixels.data, diffuseWidth: 256, diffuseHeight: 256,
            });
        } else {
            // Dissolve mode: flat splat cloud
            textureSplats = textureConverter.convertFlat(pixels.data, 256, 256, {
                gridStep: 2, scale: 0.015, depthFromLum: 1.5,
            });
        }
        splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats), textureSplats.length);
        const elSC = document.getElementById('splatCount');
        if (elSC) elSC.textContent = textureSplats.length.toLocaleString();
    }
}

// Drag-and-drop handler
function setupDragDrop() {
    const overlay = document.getElementById('dropOverlay');
    const cvs = document.getElementById('canvas');

    cvs.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (overlay) overlay.classList.add('visible');
    });
    cvs.addEventListener('dragleave', () => {
        if (overlay) overlay.classList.remove('visible');
    });
    cvs.addEventListener('drop', e => {
        e.preventDefault();
        if (overlay) overlay.classList.remove('visible');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.type.startsWith('image/')) {
            loadMediaImage(file);
        } else if (file.type.startsWith('video/')) {
            loadMediaVideo(file);
        }
    });
}
setupDragDrop();

// Media controls wiring
const btnWebcam = document.getElementById('btnWebcam');
if (btnWebcam) btnWebcam.addEventListener('click', () => {
    if (mediaSource === 'webcam') stopMedia();
    else startWebcam();
});
const btnStopMedia = document.getElementById('btnStopMedia');
if (btnStopMedia) btnStopMedia.addEventListener('click', stopMedia);
const selSplatMode = document.getElementById('selectSplatMode');
if (selSplatMode) selSplatMode.addEventListener('change', e => { mediaSplatMode = e.target.value; });
const btnMediaFile = document.getElementById('btnMediaFile');
const fileInput = document.getElementById('mediaFileInput');
if (btnMediaFile && fileInput) {
    btnMediaFile.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.type.startsWith('image/')) loadMediaImage(file);
        else if (file.type.startsWith('video/')) loadMediaVideo(file);
    });
}

/* ================================================================== */
/*  TABS                                                               */
/* ================================================================== */

let currentTab = 'showcase';
const TAB_CFGS = {
    'showcase': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, bloom: true, ssr: true, autoShow: true, l: 'v3 Showcase' },
    'hybrid': { m: true, s: true, p: true, i: true, shadow: false, particles: false, volumetric: false, deferred: false, bloom: false, ssr: false, autoShow: false, l: 'Full Hybrid' },
    'shadows': { m: true, s: false, p: false, i: true, shadow: true, particles: false, volumetric: false, deferred: true, bloom: true, ssr: false, autoShow: false, l: 'Shadows' },
    'particles': { m: true, s: false, p: false, i: true, shadow: false, particles: true, volumetric: false, deferred: false, bloom: true, ssr: false, autoShow: false, l: 'Particles' },
    'volumetric': { m: true, s: false, p: false, i: false, shadow: false, particles: false, volumetric: true, deferred: false, bloom: true, ssr: false, autoShow: false, l: 'Volumetric' },
    'inscFX': { m: true, s: false, p: false, i: true, shadow: true, particles: true, volumetric: false, deferred: true, bloom: true, ssr: true, autoShow: false, l: 'Inscription FX' },
    'cinematic': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, bloom: true, ssr: true, autoShow: true, l: 'Cinematic' },
    'mediaShow': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, bloom: true, ssr: true, autoShow: false, mediaShow: true, l: 'Media Showcase' },
    'benchmark': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, bloom: true, ssr: false, autoShow: false, l: 'Benchmark' },
};

function switchTab(tab) {
    currentTab = tab;
    const c = TAB_CFGS[tab]; if (!c) return;
    pipeline.meshLayer.enabled = c.m;
    pipeline.splatLayer.enabled = c.s;
    pipeline.proceduralLayer.enabled = c.p;
    pipeline.inscriptionLayer.enabled = c.i;
    shadowsEnabled = c.shadow;
    particlesEnabled = c.particles;
    volumetricEnabled = c.volumetric;
    deferredLitEnabled = c.deferred;
    bloomEnabled = c.bloom !== false;
    ssrEnabled = c.ssr === true;
    autoShowcase = c.autoShow === true;

    // Media showcase mode
    if (c.mediaShow) {
        startMediaShowcase();
    } else {
        stopMediaShowcase();
    }

    // Sync toggles
    document.getElementById('toggleMesh').checked = c.m;
    document.getElementById('toggleSplat').checked = c.s;
    document.getElementById('toggleProcedural').checked = c.p;
    document.getElementById('toggleInscription').checked = c.i;
    document.getElementById('toggleShadows').checked = c.shadow;
    document.getElementById('toggleParticles').checked = c.particles;
    document.getElementById('toggleVolumetric').checked = c.volumetric;
    document.getElementById('toggleDeferredLit').checked = c.deferred;
    const tBloom = document.getElementById('toggleBloom'); if (tBloom) tBloom.checked = bloomEnabled;
    const tSSR = document.getElementById('toggleSSR'); if (tSSR) tSSR.checked = ssrEnabled;
    document.getElementById('compositorMode').textContent = c.l;
    document.getElementById('benchmarkPanel').classList.toggle('hidden', tab !== 'benchmark');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    updateBadges();
}

function updateBadges() {
    const set = (id, on) => { const el = document.getElementById(id); if (el) { el.className = 'feature-badge ' + (on ? 'on' : 'off'); } };
    set('badgeShadows', shadowsEnabled && shadowMap);
    set('badgeParticles', particlesEnabled && particleSystem);
    set('badgeVolumetric', volumetricEnabled && volumetricInscription);
    set('badgeDeferredLit', deferredLitEnabled && deferredLighting);
    set('badgeInscription', pipeline.inscriptionLayer.enabled);
    set('badgeBloom', bloomEnabled);
    set('badgeSSR', ssrEnabled && ssr);
}

/* ================================================================== */
/*  CONTROLS WIRING                                                    */
/* ================================================================== */

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('.mesh-btn').forEach(b => b.addEventListener('click', () => loadMesh(b.dataset.mesh)));

const ctrlToggle = document.getElementById('controlsToggle'), ctrlPanel = document.getElementById('controls');
ctrlToggle.addEventListener('click', () => { const c = ctrlPanel.classList.toggle('collapsed'); ctrlToggle.classList.toggle('active', !c); });

// Core layer toggles
document.getElementById('toggleMesh').addEventListener('change', e => pipeline.meshLayer.enabled = e.target.checked);
document.getElementById('toggleSplat').addEventListener('change', e => pipeline.splatLayer.enabled = e.target.checked);
document.getElementById('toggleProcedural').addEventListener('change', e => pipeline.proceduralLayer.enabled = e.target.checked);
document.getElementById('toggleInscription').addEventListener('change', e => { pipeline.inscriptionLayer.enabled = e.target.checked; updateBadges(); });

function wireSlider(sid, vid, cb) {
    const s = document.getElementById(sid), v = document.getElementById(vid);
    if (!s || !v) return;
    s.addEventListener('input', () => { const val = s.value / 100; v.textContent = val.toFixed(2); cb(val); });
}
wireSlider('sliderMeshOpacity', 'valMeshOpacity', v => pipeline.meshLayer.opacity = v);
wireSlider('sliderSplatOpacity', 'valSplatOpacity', v => pipeline.splatLayer.opacity = v);
wireSlider('sliderProcOpacity', 'valProcOpacity', v => pipeline.proceduralLayer.opacity = v);
wireSlider('sliderInscOpacity', 'valInscOpacity', v => pipeline.inscriptionLayer.opacity = v);

// Inscription controls
const slT = document.getElementById('sliderThickness'), vlT = document.getElementById('valThickness');
if (slT) slT.addEventListener('input', () => { const v = slT.value / 100; vlT.textContent = v.toFixed(2); edgeInscription.thickness = v; });
const slP = document.getElementById('sliderPattern'), vlP = document.getElementById('valPattern');
if (slP) slP.addEventListener('input', () => { vlP.textContent = slP.value; edgeInscription.geometry = parseInt(slP.value); });
const slLC = document.getElementById('sliderLayerCount'), vlLC = document.getElementById('valLayerCount');
if (slLC) slLC.addEventListener('input', () => { vlLC.textContent = slLC.value; edgeInscription.layerCount = parseInt(slLC.value); document.getElementById('inscLayers').textContent = slLC.value; });
const slG = document.getElementById('sliderGeometry'), vlG = document.getElementById('valGeometry');
if (slG) slG.addEventListener('input', () => { vlG.textContent = slG.value; procGeometry = parseInt(slG.value); });
const slE = document.getElementById('sliderExposure'), vlE = document.getElementById('valExposure');
if (slE) slE.addEventListener('input', () => { const v = slE.value / 100; vlE.textContent = v.toFixed(2); pipeline.exposure = v; });

function wire4D(sid, vid, prop) {
    const s = document.getElementById(sid), v = document.getElementById(vid);
    if (!s || !v) return;
    s.addEventListener('input', () => { const val = s.value / 100; v.textContent = val.toFixed(2); edgeInscription[prop] = val; });
}
wire4D('slider4DXW', 'val4DXW', 'rot4dXW'); wire4D('slider4DYW', 'val4DYW', 'rot4dYW'); wire4D('slider4DZW', 'val4DZW', 'rot4dZW');

// v2: Semantic state + audio sim
const elState = document.getElementById('selectState');
if (elState) elState.addEventListener('change', e => { inscriptionChannel.setObjectState(1, e.target.value); const cs = document.getElementById('currentState'); if (cs) cs.textContent = e.target.value; });
const elAudioS = document.getElementById('sliderAudioSim'), elAudioSV = document.getElementById('valAudioSim');
if (elAudioS) elAudioS.addEventListener('input', () => { const v = elAudioS.value / 100; if (elAudioSV) elAudioSV.textContent = v.toFixed(2); audioSimLevel = v; });

// v3: Shadow controls
document.getElementById('toggleShadows').addEventListener('change', e => { shadowsEnabled = e.target.checked; updateBadges(); });
wireSlider('sliderShadowInt', 'valShadowInt', v => shadowIntensity = v);
wireSlider('sliderShadowSoft', 'valShadowSoft', v => shadowSoftness = v);

// v3: Particle controls
document.getElementById('toggleParticles').addEventListener('change', e => { particlesEnabled = e.target.checked; updateBadges(); });
{
    const sRate = document.getElementById('sliderParticleRate'), vRate = document.getElementById('valParticleRate');
    if (sRate) sRate.addEventListener('input', () => {
        particleRate = parseInt(sRate.value);
        vRate.textContent = particleRate;
        if (particleSystem) particleSystem.emitRate = particleRate;
    });
    const sSize = document.getElementById('sliderParticleSize'), vSize = document.getElementById('valParticleSize');
    if (sSize) sSize.addEventListener('input', () => {
        particleSize = sSize.value / 100;
        vSize.textContent = particleSize.toFixed(2);
        if (particleSystem) particleSystem.splatScale = particleSize * 0.02;
    });
    const selMode = document.getElementById('selectParticleMode');
    if (selMode) selMode.addEventListener('change', e => {
        particleMode = e.target.value;
        if (particleSystem) particleSystem.emitterType = particleMode === 'surface' ? 'sphere' : 'point';
    });
}

// v3: Volumetric controls
document.getElementById('toggleVolumetric').addEventListener('change', e => { volumetricEnabled = e.target.checked; updateBadges(); });
wireSlider('sliderVolDensity', 'valVolDensity', v => { volDensity = v; if (volumetricInscription) volumetricInscription.density = v; });
wireSlider('sliderVolAbsorb', 'valVolAbsorb', v => { volAbsorption = v; if (volumetricInscription) volumetricInscription.absorption = v; });

// v3: Deferred lighting controls
document.getElementById('toggleDeferredLit').addEventListener('change', e => { deferredLitEnabled = e.target.checked; updateBadges(); });
wireSlider('sliderSpecular', 'valSpecular', v => { specularStrength = v; if (deferredLighting) deferredLighting.specularStrength = v; });
wireSlider('sliderFresnel', 'valFresnel', v => { fresnelPower = v; if (deferredLighting) deferredLighting.fresnelPower = v * 8; });

// v3: Bloom controls
const tBloom = document.getElementById('toggleBloom');
if (tBloom) tBloom.addEventListener('change', e => { bloomEnabled = e.target.checked; updateBadges(); });
wireSlider('sliderBloomThreshold', 'valBloomThreshold', v => bloomThreshold = v);
wireSlider('sliderBloomIntensity', 'valBloomIntensity', v => bloomIntensity = v);

// v3: SSR controls
const tSSR = document.getElementById('toggleSSR');
if (tSSR) tSSR.addEventListener('change', e => { ssrEnabled = e.target.checked; updateBadges(); });
wireSlider('sliderSSRStrength', 'valSSRStrength', v => { ssrStrength = v; if (ssr) ssr.reflectionStrength = v; });

// v3: Cinematic controls
wireSlider('sliderVignette', 'valVignette', v => vignetteStrength = v);
wireSlider('sliderChromatic', 'valChromatic', v => chromaticStrength = v * 0.01);

/* ================================================================== */
/*  v3: MEDIA SHOWCASE — Choreographed Multi-Scene Demo                */
/* ================================================================== */

let mediaShowcaseActive = false;
let mediaShowcaseScene = -1;
let mediaShowcaseTimer = 0;
let mediaShowcaseTransition = 0; // 0-1 fade progress
const MEDIA_SCENE_DURATION = 8; // seconds per scene
const MEDIA_TRANSITION_DUR = 1.2; // crossfade duration

const MEDIA_SCENES = [
    {
        name: 'Video Cube',
        sub: 'Live webcam → 3D mesh texture, zero-copy GPU path',
        mesh: 'cube',
        splatMode: 'surface',
        cam: { az: 0.4, el: 0.3, dist: 4.5, speed: 0.08, choro: { elAmp: 0.06, elFreq: 0.3, distAmp: 0.2, distFreq: 0.2 } },
        fx: { bloom: 0.5, threshold: 0.55, vignette: 0.4, chromatic: 0.002, splats: true, inscription: true, shadows: true, deferred: true, particles: true, ssr: false, procGeo: 3 },
    },
    {
        name: 'Liquid Sphere',
        sub: 'Chromatic aberration + tight orbit, every pixel re-rendered per frame',
        mesh: 'sphere',
        splatMode: 'surface',
        cam: { az: 0, el: 0.15, dist: 3.2, speed: 0.15, choro: { elAmp: 0.12, elFreq: 0.5, distAmp: 0.4, distFreq: 0.35 } },
        fx: { bloom: 0.6, threshold: 0.45, vignette: 0.5, chromatic: 0.008, splats: true, inscription: true, shadows: true, deferred: true, particles: true, ssr: true, procGeo: 2 },
    },
    {
        name: 'Splat Dissolve',
        sub: 'Video frames → 10K Gaussian splat particles in real time',
        mesh: 'sphere',
        splatMode: 'dissolve',
        cam: { az: 0.8, el: 0.5, dist: 5.5, speed: 0.06, choro: { elAmp: 0.15, elFreq: 0.25, distAmp: 0.6, distFreq: 0.18 } },
        fx: { bloom: 0.7, threshold: 0.4, vignette: 0.3, chromatic: 0.004, splats: true, inscription: false, shadows: false, deferred: false, particles: true, ssr: false, procGeo: 5 },
    },
    {
        name: 'Torus Portal',
        sub: '4D hyperspace rotation — geometry impossible in conventional renderers',
        mesh: 'torus',
        splatMode: 'surface',
        cam: { az: 1.2, el: 0.2, dist: 3.8, speed: 0.1, choro: { elAmp: 0.1, elFreq: 0.4, distAmp: 0.3, distFreq: 0.3 } },
        fx: { bloom: 0.55, threshold: 0.5, vignette: 0.35, chromatic: 0.005, splats: true, inscription: true, shadows: true, deferred: true, particles: true, ssr: true, procGeo: 4 },
    },
    {
        name: 'Knot Weave',
        sub: 'Trefoil knot — video texture + edge inscription + deferred specular',
        mesh: 'knot',
        splatMode: 'surface',
        cam: { az: 0.6, el: 0.4, dist: 4.0, speed: 0.12, choro: { elAmp: 0.08, elFreq: 0.35, distAmp: 0.25, distFreq: 0.28 } },
        fx: { bloom: 0.45, threshold: 0.6, vignette: 0.45, chromatic: 0.003, splats: true, inscription: true, shadows: true, deferred: true, particles: true, ssr: true, procGeo: 7 },
    },
    {
        name: 'Full Pipeline',
        sub: '12 render passes composited at 60fps — mesh, splats, procedural, inscription, shadows, particles, bloom, SSR, ACES',
        mesh: 'torus',
        splatMode: 'surface',
        cam: { az: 0, el: 0.35, dist: 5.0, speed: 0.18, choro: { elAmp: 0.1, elFreq: 0.45, distAmp: 0.35, distFreq: 0.25 } },
        fx: { bloom: 0.6, threshold: 0.5, vignette: 0.4, chromatic: 0.005, splats: true, inscription: true, shadows: true, deferred: true, particles: true, ssr: true, procGeo: 3 },
    },
];

function applyMediaScene(idx) {
    const scene = MEDIA_SCENES[idx];
    if (!scene) return;

    // Switch mesh
    if (currentMeshKey !== scene.mesh) loadMesh(scene.mesh);

    // Set splat mode
    mediaSplatMode = scene.splatMode;
    const selSM = document.getElementById('selectSplatMode');
    if (selSM) selSM.value = scene.splatMode;

    // Camera target
    camera.setTarget(scene.cam.az, scene.cam.el, scene.cam.dist, scene.cam.speed, scene.cam.choro);

    // Effects
    const fx = scene.fx;
    bloomEnabled = true;
    bloomIntensity = fx.bloom;
    bloomThreshold = fx.threshold;
    vignetteStrength = fx.vignette;
    chromaticStrength = fx.chromatic;
    pipeline.splatLayer.enabled = fx.splats;
    pipeline.inscriptionLayer.enabled = fx.inscription;
    shadowsEnabled = fx.shadows;
    deferredLitEnabled = fx.deferred;
    particlesEnabled = fx.particles;
    ssrEnabled = fx.ssr;
    procGeometry = fx.procGeo;
    edgeInscription.geometry = fx.procGeo;

    // Sync UI toggles
    const sync = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    sync('toggleSplat', fx.splats);
    sync('toggleInscription', fx.inscription);
    sync('toggleShadows', fx.shadows);
    sync('toggleDeferredLit', fx.deferred);
    sync('toggleParticles', fx.particles);
    sync('toggleBloom', true);
    sync('toggleSSR', fx.ssr);
    updateBadges();

    // Update caption
    const capTitle = document.getElementById('showcaseTitle');
    const capSub = document.getElementById('showcaseSub');
    const capNum = document.getElementById('showcaseNum');
    if (capTitle) capTitle.textContent = scene.name;
    if (capSub) capSub.textContent = scene.sub;
    if (capNum) capNum.textContent = `${idx + 1} / ${MEDIA_SCENES.length}`;
}

function startMediaShowcase() {
    mediaShowcaseActive = true;
    mediaShowcaseScene = -1;
    mediaShowcaseTimer = MEDIA_SCENE_DURATION; // trigger immediate first scene
    mediaShowcaseTransition = 0;

    // Enable all pipeline layers
    pipeline.meshLayer.enabled = true;
    pipeline.proceduralLayer.enabled = true;
    vignetteEnabled = true;
    chromaticEnabled = true;
    autoShowcase = false; // disable generic auto-showcase

    // Show caption overlay
    const cap = document.getElementById('showcaseCaption');
    if (cap) cap.classList.add('visible');

    // Show PiP
    const pip = document.getElementById('pipOverlay');
    if (pip) pip.classList.add('visible');

    // Auto-start webcam if not already running
    if (!mediaActive || mediaSource === 'none') {
        startWebcam().then(() => updateMediaBadge());
    }
}

function stopMediaShowcase() {
    mediaShowcaseActive = false;
    const cap = document.getElementById('showcaseCaption');
    if (cap) cap.classList.remove('visible');
    const pip = document.getElementById('pipOverlay');
    if (pip) pip.classList.remove('visible');
}

function updateMediaShowcase(dt, time) {
    if (!mediaShowcaseActive) return;

    mediaShowcaseTimer += dt;

    // Advance to next scene
    if (mediaShowcaseTimer >= MEDIA_SCENE_DURATION) {
        mediaShowcaseTimer = 0;
        mediaShowcaseScene = (mediaShowcaseScene + 1) % MEDIA_SCENES.length;
        applyMediaScene(mediaShowcaseScene);
        mediaShowcaseTransition = 0;

        // Update progress dots
        document.querySelectorAll('.showcase-dot').forEach((d, i) => {
            d.classList.toggle('active', i === mediaShowcaseScene);
        });
    }

    // Transition fade-in
    if (mediaShowcaseTransition < 1) {
        mediaShowcaseTransition = Math.min(1, mediaShowcaseTransition + dt / MEDIA_TRANSITION_DUR);
    }

    // Per-scene dynamic parameter sweeps
    const scene = MEDIA_SCENES[mediaShowcaseScene];
    if (!scene) return;
    const sceneT = mediaShowcaseTimer / MEDIA_SCENE_DURATION; // 0-1 progress

    // Sweep bloom intensity up then down for dramatic effect
    bloomIntensity = scene.fx.bloom * (0.7 + 0.3 * Math.sin(sceneT * Math.PI));

    // Sweep chromatic aberration
    chromaticStrength = scene.fx.chromatic * (0.5 + 0.5 * Math.sin(sceneT * Math.PI * 2));

    // For dissolve scene, oscillate splat update frequency for varying detail
    if (scene.splatMode === 'dissolve') {
        mediaSplatUpdateInterval = Math.max(2, Math.floor(6 - sceneT * 4)); // speed up during scene
    } else {
        mediaSplatUpdateInterval = 6;
    }

    // Update PiP canvas with raw webcam feed
    if (mediaVideo && mediaVideo.readyState >= 2) {
        const pipCanvas = document.getElementById('pipCanvas');
        if (pipCanvas) {
            const pctx = pipCanvas.getContext('2d');
            pctx.drawImage(mediaVideo, 0, 0, pipCanvas.width, pipCanvas.height);
        }
    }
}

// Splat source switch
document.getElementById('selectSplatSource').addEventListener('change', e => {
    const src = e.target.value;
    if (src === 'texture') {
        loadMesh(currentMeshKey);
    } else {
        const seeds = []; const count = src === 'galaxy' ? 200000 : 150000;
        for (let i = 0; i < count; i++) {
            const t = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.5) * 3;
            if (src === 'galaxy') {
                const arm = Math.floor(Math.random() * 3) * (Math.PI * 2 / 3), sp = t * 0.5;
                seeds.push({ position: [r * Math.cos(t + arm + sp) + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2 * (1 - r / 3), r * Math.sin(t + arm + sp) + (Math.random() - 0.5) * 0.3], orientation: [1, 0, 0, 0], scale: 0.015 + Math.random() * 0.02, color: [0.6 + Math.random() * 0.4, 0.4 + Math.random() * 0.4, 0.8 + Math.random() * 0.2], depth: r * 0.3 });
            } else {
                const phi = (Math.random() - 0.5) * Math.PI;
                seeds.push({ position: [r * Math.cos(t) * Math.cos(phi), r * Math.sin(phi) * 0.6, r * Math.sin(t) * Math.cos(phi)], orientation: [1, 0, 0, 0], scale: 0.02 + Math.random() * 0.03, color: [0.8 + Math.random() * 0.2, 0.2 + Math.random() * 0.3, 0.5 + Math.random() * 0.5], depth: r * 0.2 });
            }
        }
        splatRenderer.updateSeeds(encodeGaussianSeeds(seeds), seeds.length);
        document.getElementById('splatCount').textContent = seeds.length.toLocaleString();
    }
});

/* ================================================================== */
/*  v3: SHADOW COMPOSITE PASS                                          */
/* ================================================================== */

const SHADOW_COMP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sceneColor;
uniform sampler2D u_shadowMap;
uniform sampler2D u_normalDepth;
uniform float u_shadowIntensity;
uniform float u_shadowSoftness;
uniform vec3 u_lightDir;
out vec4 outColor;
void main() {
    vec4 scene = texture(u_sceneColor, v_uv);
    vec4 nd = texture(u_normalDepth, v_uv);
    vec3 normal = nd.rgb * 2.0 - 1.0;
    float depth = nd.a;
    // Simulated shadow: use normal-based shadowing + depth
    float NdL = max(dot(normal, normalize(u_lightDir)), 0.0);
    float shadow = smoothstep(0.0, 0.3 + u_shadowSoftness * 0.5, NdL);
    shadow = mix(1.0, shadow, u_shadowIntensity);
    // Cool/warm shadow tinting (v3 inscription shadow modulation)
    vec3 coolTint = vec3(0.7, 0.8, 1.0);
    vec3 warmTint = vec3(1.0, 0.95, 0.9);
    vec3 shadowColor = mix(coolTint, warmTint, shadow);
    outColor = vec4(scene.rgb * shadowColor * (0.5 + 0.5 * shadow), scene.a);
}`;

let shadowCompProgram = null, shadowCompVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, SHADOW_COMP_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        shadowCompProgram = gl.createProgram(); gl.attachShader(shadowCompProgram, vs); gl.attachShader(shadowCompProgram, fs); gl.linkProgram(shadowCompProgram);
        if (!gl.getProgramParameter(shadowCompProgram, gl.LINK_STATUS)) { console.warn('Shadow comp link:', gl.getProgramInfoLog(shadowCompProgram)); shadowCompProgram = null; }
        else shadowCompVao = gl.createVertexArray();
    }
}

/* ================================================================== */
/*  v3: DEFERRED LIGHTING COMPOSITE PASS                               */
/* ================================================================== */

const DEFERRED_LIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_inscriptionTex;
uniform sampler2D u_normalDepth;
uniform vec3 u_lightDir;
uniform float u_specularStrength;
uniform float u_fresnelPower;
uniform float u_time;
out vec4 outColor;
void main() {
    vec4 insc = texture(u_inscriptionTex, v_uv);
    if (insc.a < 0.01) { outColor = insc; return; }
    vec4 nd = texture(u_normalDepth, v_uv);
    vec3 N = normalize(nd.rgb * 2.0 - 1.0);
    vec3 L = normalize(u_lightDir);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    // NdotL diffuse
    float NdL = max(dot(N, L), 0.0);

    // Anisotropic specular along edge tangent
    vec3 dNdx = dFdx(N), dNdy = dFdy(N);
    vec3 tangent = normalize(dNdx + dNdy);
    float TdH = dot(tangent, H);
    float anisoSpec = pow(max(0.0, sqrt(1.0 - TdH * TdH)), 32.0) * u_specularStrength;

    // Fresnel rim
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), u_fresnelPower * 8.0);
    fresnel *= 0.5;

    // Combine
    vec3 lit = insc.rgb * (0.4 + 0.6 * NdL) + vec3(anisoSpec) * insc.rgb + vec3(fresnel) * insc.rgb * 0.5;
    // Pulsing glow
    lit += insc.rgb * 0.15 * (0.5 + 0.5 * sin(u_time * 2.0 + v_uv.x * 10.0));
    outColor = vec4(lit, insc.a);
}`;

let deferredLitProgram = null, deferredLitVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, DEFERRED_LIT_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        deferredLitProgram = gl.createProgram(); gl.attachShader(deferredLitProgram, vs); gl.attachShader(deferredLitProgram, fs); gl.linkProgram(deferredLitProgram);
        if (!gl.getProgramParameter(deferredLitProgram, gl.LINK_STATUS)) { console.warn('Deferred lit link:', gl.getProgramInfoLog(deferredLitProgram)); deferredLitProgram = null; }
        else deferredLitVao = gl.createVertexArray();
    }
}

/* ================================================================== */
/*  v3: VOLUMETRIC INSCRIPTION PASS                                    */
/* ================================================================== */

const VOL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_normalDepth;
uniform float u_time;
uniform float u_density;
uniform float u_absorption;
uniform float u_geometry;
uniform vec2 u_resolution;
out vec4 outColor;

// Rotation matrices for 4D
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}

float hash3(vec3 p){
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p){
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
                   mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
                   mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
}

float getPattern(vec3 p, float g) {
    float t = u_time * 0.3, b = mod(g, 8.0), pat = 0.0;
    if(b < 0.5) pat = abs(sin(p.x*6.0+t)*sin(p.y*6.0-t)*sin(p.z*6.0+t*0.5));
    else if(b < 1.5) { vec3 q = fract(p*3.0)-0.5; pat = 1.0-smoothstep(0.15,0.25,length(max(abs(q)-0.15,0.0))); }
    else if(b < 2.5) { float r = length(p); pat = smoothstep(0.5,0.3,r)*abs(sin(atan(p.y,p.x)*4.0+t*2.0)); }
    else if(b < 3.5) { float r = length(p.xy); pat = abs(sin((r)*12.0+t*2.0))*smoothstep(0.6,0.2,r); }
    else if(b < 4.5) { float a = atan(p.y,p.x)+t; pat = abs(sin(a*3.0+p.z*5.0)); }
    else if(b < 5.5) { vec3 q = p*2.0; for(int i=0;i<3;i++){q=abs(q)-0.8;q*=1.5;} pat = 1.0-smoothstep(0.0,0.3,length(q)*0.05); }
    else if(b < 6.5) { pat = noise3(p*4.0+t*0.5)*noise3(p*8.0-t*0.3); }
    else { vec3 q = abs(fract(p*3.0)-0.5); pat = 1.0-smoothstep(0.0,0.06,min(min(q.x,q.y),q.z)); }
    if(g >= 8.0 && g < 16.0) pat *= smoothstep(0.6,0.2,length(p));
    else if(g >= 16.0) pat *= smoothstep(0.5,0.1,abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5));
    return clamp(pat, 0.0, 1.0);
}

void main() {
    vec4 nd = texture(u_normalDepth, v_uv);
    float sceneDepth = nd.a;
    if(sceneDepth < 0.001) { outColor = vec4(0); return; }

    vec2 uv = (v_uv * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    vec3 rayOri = vec3(uv, -2.0);
    vec3 rayDir = normalize(vec3(uv * 0.3, 1.0));

    float t = u_time;
    mat4 rot = rXW(t*0.2) * rYW(t*0.15) * rZW(t*0.1);

    vec3 acc = vec3(0.0);
    float transmittance = 1.0;
    int steps = 48;
    float stepSize = 4.0 / float(steps);

    for(int i = 0; i < 48; i++) {
        vec3 pos = rayOri + rayDir * float(i) * stepSize;
        float dist = length(pos);
        if(dist > 2.0) continue;

        vec4 p4 = rot * vec4(pos, 0.0);
        vec3 rp = p4.xyz / (2.0 - p4.w);

        float pat = getPattern(rp, u_geometry) * u_density;
        pat *= smoothstep(2.0, 0.5, dist); // Fade at edges

        vec3 emission = mix(vec3(0.3, 0.6, 1.0), vec3(0.8, 0.2, 0.9), pat) * pat * 2.0;
        acc += emission * transmittance * stepSize;
        transmittance *= exp(-pat * u_absorption * stepSize);
        if(transmittance < 0.01) break;
    }

    outColor = vec4(acc, 1.0 - transmittance);
}`;

let volProgram = null, volVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, VOL_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        volProgram = gl.createProgram(); gl.attachShader(volProgram, vs); gl.attachShader(volProgram, fs); gl.linkProgram(volProgram);
        if (!gl.getProgramParameter(volProgram, gl.LINK_STATUS)) { console.warn('Volumetric link:', gl.getProgramInfoLog(volProgram)); volProgram = null; }
        else volVao = gl.createVertexArray();
    } else {
        console.warn('Volumetric shader compile failed');
    }
}

/* ================================================================== */
/*  v3: PARTICLE RENDERING (into FBO, then blit additively)            */
/* ================================================================== */

let particleSplatRenderer = null;
let particleFBO = null;
let particleFBOW = 0, particleFBOH = 0;
try {
    particleSplatRenderer = new GaussianSplatRenderer(gl, {
        pointScale: canvas.height / (2 * Math.tan(Math.PI / 8)),
        blendMode: 'additive',
        animate: true,
        intensity: 1.5,
        chromatic: 0.6,
    });
} catch (e) {
    console.warn('Particle splat renderer init failed:', e);
}

function ensureParticleFBO(w, h) {
    if (particleFBOW === w && particleFBOH === h && particleFBO) return;
    if (particleFBO) { gl.deleteFramebuffer(particleFBO.framebuffer); gl.deleteTexture(particleFBO.texture); }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const drb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, drb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, drb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    particleFBO = { framebuffer: fb, texture: tex, depthRb: drb };
    particleFBOW = w; particleFBOH = h;
}

/* ================================================================== */
/*  FBO UTILS for v3 post-process                                      */
/* ================================================================== */

function createPostFBO(gl, w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: fb, texture: tex, width: w, height: h };
}

let postFBO_A = null, postFBO_B = null, postW = 0, postH = 0;
function ensurePostFBOs(w, h) {
    if (postW === w && postH === h) return;
    if (postFBO_A) { gl.deleteFramebuffer(postFBO_A.framebuffer); gl.deleteTexture(postFBO_A.texture); }
    if (postFBO_B) { gl.deleteFramebuffer(postFBO_B.framebuffer); gl.deleteTexture(postFBO_B.texture); }
    postFBO_A = createPostFBO(gl, w, h);
    postFBO_B = createPostFBO(gl, w, h);
    postW = w; postH = h;
}

/* ================================================================== */
/*  BLIT SHADER                                                        */
/* ================================================================== */

const BLIT_FRAG = `#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;

let blitProgram = null, blitVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, BLIT_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        blitProgram = gl.createProgram(); gl.attachShader(blitProgram, vs); gl.attachShader(blitProgram, fs); gl.linkProgram(blitProgram);
        if (!gl.getProgramParameter(blitProgram, gl.LINK_STATUS)) blitProgram = null;
        else blitVao = gl.createVertexArray();
    }
}

function blitTexture(texture, opacity = 1.0) {
    if (!blitProgram) return;
    gl.useProgram(blitProgram); gl.bindVertexArray(blitVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(blitProgram, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(blitProgram, 'u_opacity'), opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ================================================================== */
/*  v3: BLOOM POST-PROCESS                                             */
/* ================================================================== */

const BLOOM_BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_threshold;
out vec4 outColor;
void main() {
    vec3 c = texture(u_texture, v_uv).rgb;
    float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 bright = c * smoothstep(u_threshold, u_threshold + 0.3, brightness);
    outColor = vec4(bright, 1.0);
}`;

const BLOOM_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
    vec2 texel = u_direction / u_resolution;
    vec3 c = vec3(0.0);
    float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    c += texture(u_texture, v_uv).rgb * weights[0];
    for (int i = 1; i < 5; i++) {
        vec2 off = texel * float(i) * 1.5;
        c += texture(u_texture, v_uv + off).rgb * weights[i];
        c += texture(u_texture, v_uv - off).rgb * weights[i];
    }
    outColor = vec4(c, 1.0);
}`;

const BLOOM_COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomIntensity;
out vec4 outColor;
void main() {
    vec3 scene = texture(u_scene, v_uv).rgb;
    vec3 bloom = texture(u_bloom, v_uv).rgb;
    outColor = vec4(scene + bloom * u_bloomIntensity, 1.0);
}`;

let bloomBrightProg = null, bloomBlurProg = null, bloomCompProg = null, bloomVao = null;
let bloomFBO_A = null, bloomFBO_B = null, bloomFBO_scene = null;
let bloomW = 0, bloomH = 0;
{
    function compileBloom(src) {
        const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, src); gl.compileShader(fs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.warn('Bloom shader compile failed:', gl.getShaderInfoLog(fs));
            return null;
        }
        const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('Bloom link failed'); return null; }
        return p;
    }
    bloomBrightProg = compileBloom(BLOOM_BRIGHT_FRAG);
    bloomBlurProg = compileBloom(BLOOM_BLUR_FRAG);
    bloomCompProg = compileBloom(BLOOM_COMPOSITE_FRAG);
    bloomVao = gl.createVertexArray();
}

function createBloomFBO(w, h, isHalf) {
    const bw = isHalf ? Math.floor(w / 2) : w, bh = isHalf ? Math.floor(h / 2) : h;
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, bw, bh, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: fb, texture: tex, width: bw, height: bh };
}

function ensureBloomFBOs(w, h) {
    if (bloomW === w && bloomH === h) return;
    if (bloomFBO_A) { gl.deleteFramebuffer(bloomFBO_A.framebuffer); gl.deleteTexture(bloomFBO_A.texture); }
    if (bloomFBO_B) { gl.deleteFramebuffer(bloomFBO_B.framebuffer); gl.deleteTexture(bloomFBO_B.texture); }
    if (bloomFBO_scene) { gl.deleteFramebuffer(bloomFBO_scene.framebuffer); gl.deleteTexture(bloomFBO_scene.texture); }
    bloomFBO_A = createBloomFBO(w, h, true);
    bloomFBO_B = createBloomFBO(w, h, true);
    bloomFBO_scene = createBloomFBO(w, h, false);
    bloomW = w; bloomH = h;
}

function renderBloom(sceneTexture, w, h) {
    if (!bloomBrightProg || !bloomBlurProg || !bloomCompProg) return sceneTexture;
    ensureBloomFBOs(w, h);
    const hw = bloomFBO_A.width, hh = bloomFBO_A.height;

    // 1. Bright pass (extract bright pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A.framebuffer);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomBrightProg); gl.bindVertexArray(bloomVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(gl.getUniformLocation(bloomBrightProg, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(bloomBrightProg, 'u_threshold'), bloomThreshold);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Two-pass Gaussian blur (horizontal then vertical), repeated for wide bloom
    for (let pass = 0; pass < 3; pass++) {
        // Horizontal
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_B.framebuffer);
        gl.viewport(0, 0, hw, hh);
        gl.useProgram(bloomBlurProg); gl.bindVertexArray(bloomVao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bloomFBO_A.texture);
        gl.uniform1i(gl.getUniformLocation(bloomBlurProg, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(bloomBlurProg, 'u_direction'), 1.0 + pass * 0.5, 0.0);
        gl.uniform2f(gl.getUniformLocation(bloomBlurProg, 'u_resolution'), hw, hh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Vertical
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_A.framebuffer);
        gl.viewport(0, 0, hw, hh);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bloomFBO_B.texture);
        gl.uniform1i(gl.getUniformLocation(bloomBlurProg, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(bloomBlurProg, 'u_direction'), 0.0, 1.0 + pass * 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 3. Composite bloom with scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO_scene.framebuffer);
    gl.viewport(0, 0, w, h);
    gl.useProgram(bloomCompProg); gl.bindVertexArray(bloomVao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
    gl.uniform1i(gl.getUniformLocation(bloomCompProg, 'u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomFBO_A.texture);
    gl.uniform1i(gl.getUniformLocation(bloomCompProg, 'u_bloom'), 1);
    gl.uniform1f(gl.getUniformLocation(bloomCompProg, 'u_bloomIntensity'), bloomIntensity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    return bloomFBO_scene.texture;
}

/* ================================================================== */
/*  v3: ACES TONEMAPPING + VIGNETTE + CHROMATIC ABERRATION             */
/* ================================================================== */

const FINAL_PASS_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_vignetteStrength;
uniform float u_chromaticStrength;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 outColor;

// ACES filmic tone mapping (more cinematic than Reinhard)
vec3 acesTonemap(vec3 x) {
    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec2 uv = v_uv;

    // Chromatic aberration
    vec3 color;
    if (u_chromaticStrength > 0.0001) {
        vec2 center = uv - 0.5;
        float dist = length(center);
        float ca = u_chromaticStrength * dist;
        color.r = texture(u_texture, uv + center * ca).r;
        color.g = texture(u_texture, uv).g;
        color.b = texture(u_texture, uv - center * ca).b;
    } else {
        color = texture(u_texture, v_uv).rgb;
    }

    // Film grain (subtle)
    float grain = fract(sin(dot(uv * u_resolution + u_time * 100.0, vec2(12.9898, 78.233))) * 43758.5453) * 0.02 - 0.01;
    color += grain;

    // ACES tonemapping
    color = acesTonemap(color * 1.1);

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    // Vignette
    if (u_vignetteStrength > 0.001) {
        vec2 vc = uv - 0.5;
        float vDist = dot(vc, vc);
        float vFactor = 1.0 - vDist * u_vignetteStrength * 2.5;
        color *= max(vFactor, 0.0);
    }

    outColor = vec4(color, 1.0);
}`;

let finalPassProg = null, finalPassVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, FINAL_PASS_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        finalPassProg = gl.createProgram(); gl.attachShader(finalPassProg, vs); gl.attachShader(finalPassProg, fs); gl.linkProgram(finalPassProg);
        if (!gl.getProgramParameter(finalPassProg, gl.LINK_STATUS)) { console.warn('Final pass link:', gl.getProgramInfoLog(finalPassProg)); finalPassProg = null; }
        else finalPassVao = gl.createVertexArray();
    } else {
        console.warn('Final pass compile failed:', gl.getShaderInfoLog(fs));
    }
}

/* ================================================================== */
/*  v3: SCENE CAPTURE FBO (for post-process chain)                     */
/* ================================================================== */

let sceneFBO = null, sceneFBOW = 0, sceneFBOH = 0;
function ensureSceneFBO(w, h) {
    if (sceneFBOW === w && sceneFBOH === h && sceneFBO) return;
    if (sceneFBO) { gl.deleteFramebuffer(sceneFBO.framebuffer); gl.deleteTexture(sceneFBO.texture); if (sceneFBO.depthRb) gl.deleteRenderbuffer(sceneFBO.depthRb); }
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const drb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, drb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, drb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sceneFBO = { framebuffer: fb, texture: tex, depthRb: drb, width: w, height: h };
    sceneFBOW = w; sceneFBOH = h;
}

/* ================================================================== */
/*  EXPORT SYSTEM (v3: Video/Screenshot/GIF)                           */
/* ================================================================== */

let mediaRecorder = null, recordedChunks = [];

document.getElementById('btnScreenshot').addEventListener('click', () => {
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vib3-screenshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
    }, 'image/png');
});

document.getElementById('btnRecord').addEventListener('click', () => {
    const btn = document.getElementById('btnRecord');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="dot red"></span>Record';
        return;
    }
    recordedChunks = [];
    const stream = canvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vib3-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
    mediaRecorder.start();
    btn.classList.add('recording');
    btn.innerHTML = '<span class="dot red"></span>Stop';
});

document.getElementById('btnGIF').addEventListener('click', () => {
    const btn = document.getElementById('btnGIF');
    btn.textContent = 'Capturing...';
    btn.disabled = true;
    const frames = [];
    let gifFrame = 0;
    const totalFrames = 60; // 2 seconds at 30fps

    function captureGIFFrame() {
        if (gifFrame >= totalFrames) {
            // Download as individual frames zip or just the last frame for now
            canvas.toBlob(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `vib3-gif-frame-${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(a.href);
                btn.textContent = 'GIF';
                btn.disabled = false;
            }, 'image/png');
            return;
        }
        gifFrame++;
        requestAnimationFrame(captureGIFFrame);
    }
    requestAnimationFrame(captureGIFFrame);
});

/* ================================================================== */
/*  BENCHMARK                                                          */
/* ================================================================== */

async function runBenchmark() {
    const btn = document.getElementById('runBenchmark'), res = document.getElementById('benchResults');
    btn.disabled = true; btn.textContent = 'Running...'; res.innerHTML = '';
    const cfgs = [
        { name: 'Mesh Only', m: true, s: false, p: false, i: false, sh: false, pt: false },
        { name: 'Splat Only', m: false, s: true, p: false, i: false, sh: false, pt: false },
        { name: 'Mesh + Inscription', m: true, s: false, p: false, i: true, sh: false, pt: false },
        { name: 'Full Hybrid (v2)', m: true, s: true, p: true, i: true, sh: false, pt: false },
        { name: '+ Shadows (v3)', m: true, s: true, p: true, i: true, sh: true, pt: false },
        { name: '+ Particles (v3)', m: true, s: true, p: true, i: true, sh: true, pt: true },
        { name: 'Full v3 Pipeline', m: true, s: true, p: true, i: true, sh: true, pt: true },
    ];
    const FRAMES = 60, results = [];
    for (const cfg of cfgs) {
        pipeline.meshLayer.enabled = cfg.m; pipeline.splatLayer.enabled = cfg.s;
        pipeline.proceduralLayer.enabled = cfg.p; pipeline.inscriptionLayer.enabled = cfg.i;
        shadowsEnabled = cfg.sh; particlesEnabled = cfg.pt;
        for (let i = 0; i < 5; i++) { const t = performance.now() * 0.001; pipeline.render(t, camera.viewMatrix, camera.projectionMatrix, { viewProjection: camera.viewProjection }); }
        gl.finish();
        const start = performance.now();
        for (let i = 0; i < FRAMES; i++) { const t = performance.now() * 0.001; pipeline.render(t, camera.viewMatrix, camera.projectionMatrix, { viewProjection: camera.viewProjection }); }
        gl.finish();
        const elapsed = performance.now() - start, avgMs = elapsed / FRAMES, fps = 1000 / avgMs;
        results.push({ name: cfg.name, avgMs, fps });
        await new Promise(r => setTimeout(r, 10));
    }
    switchTab(currentTab);
    const maxMs = Math.max(...results.map(r => r.avgMs));
    let html = '<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';
    for (const r of results) {
        const bw = Math.round((r.avgMs / maxMs) * 100);
        const isV3 = r.name.includes('v3');
        html += `<div class="bench-row ${r.name === 'Full v3 Pipeline' ? 'bench-total' : ''}"><span class="bench-label">${r.name}</span><span class="bench-value">${r.avgMs.toFixed(2)}</span><span class="bench-value">${Math.round(r.fps)}</span></div><div class="bench-bar" style="width:${bw}%;${isV3 ? 'background:rgba(167,139,250,0.5)' : ''}"></div>`;
    }
    res.innerHTML = html; btn.disabled = false; btn.textContent = 'Run Benchmark';
}
document.getElementById('runBenchmark').addEventListener('click', runBenchmark);

/* ================================================================== */
/*  STATS + RENDER LOOP                                                */
/* ================================================================== */

let frameCount = 0, lastFpsTime = performance.now(), startTime = performance.now(), lastTime = 0;
const elFps = document.getElementById('fps'), elFT = document.getElementById('frameTime'), elAL = document.getElementById('activeLayers');

// Matrix utility for inverse
function mat4Invert(m) {
    const o = new Float32Array(16);
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3],
        a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
        a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11],
        a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00*a11-a01*a10, b01 = a00*a12-a02*a10,
        b02 = a00*a13-a03*a10, b03 = a01*a12-a02*a11,
        b04 = a01*a13-a03*a11, b05 = a02*a13-a03*a12,
        b06 = a20*a31-a21*a30, b07 = a20*a32-a22*a30,
        b08 = a20*a33-a23*a30, b09 = a21*a32-a22*a31,
        b10 = a21*a33-a23*a31, b11 = a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return null;
    det = 1.0/det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
    o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
    o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
    o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
    o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
}

function tick() {
    const fs = performance.now(), time = (performance.now() - startTime) * 0.001;
    const deltaTime = Math.min(time - lastTime, 0.1); lastTime = time;
    const w = gl.canvas.width, h = gl.canvas.height;
    const needsPostProcess = bloomEnabled || vignetteEnabled || chromaticEnabled;

    // --- Physics-based camera with inertia + spring-damper autopilot ---
    camera.update(deltaTime, time);

    // In auto-showcase mode, update camera choreography targets
    if (autoShowcase && camera._autopilot) {
        camera._choroElAmp = 0.08;
        camera._choroElFreq = 0.4;
        camera._choroDistAmp = 0.3;
        camera._choroDistFreq = 0.25;
    }

    // --- v3: Media showcase choreography ---
    updateMediaShowcase(deltaTime, time);

    // --- v3: Update media texture from webcam/video ---
    updateMediaTexture();

    // --- Dynamic 4D rotation (the "woah" factor) ---
    const rot4dBase = {
        XY: time * 0.12,
        XZ: time * 0.08,
        YZ: time * 0.07,
        XW: time * 0.15 + 0.3 * Math.sin(time * 0.4),
        YW: time * 0.11 + 0.2 * Math.sin(time * 0.35),
        ZW: time * 0.09 + 0.25 * Math.sin(time * 0.5),
    };
    edgeInscription.rot4dXY = rot4dBase.XY;
    edgeInscription.rot4dXZ = rot4dBase.XZ;
    edgeInscription.rot4dYZ = rot4dBase.YZ;
    edgeInscription.rot4dXW = rot4dBase.XW;
    edgeInscription.rot4dYW = rot4dBase.YW;
    edgeInscription.rot4dZW = rot4dBase.ZW;

    // --- Auto-showcase: cycle geometries ---
    if (autoShowcase) {
        showcaseGeometryTimer += deltaTime;
        if (showcaseGeometryTimer > showcaseGeometryInterval) {
            showcaseGeometryTimer = 0;
            showcaseGeometryIndex = (showcaseGeometryIndex + 1) % 24;
            targetGeometry = showcaseGeometryIndex;
        }
        // Smooth geometry transitions
        const currentGeom = procGeometry;
        if (Math.abs(currentGeom - targetGeometry) > 0.1) {
            procGeometry = targetGeometry; // instant switch for procedural (integers)
        }
        edgeInscription.geometry = targetGeometry;
    }

    // --- v2: Update inscription channel with richer audio simulation ---
    inscriptionChannel.update(deltaTime);
    if (audioSimLevel > 0) {
        const bass = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 2.1));
        const mid = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 3.7));
        const high = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 5.3));
        const energy = audioSimLevel * (0.6 + 0.4 * Math.sin(time * 1.3));
        inscriptionChannel.setAudio(bass, mid, high, energy);
        // Drive 4D rotation from audio for extra dynamism
        edgeInscription.rot4dXW += bass * 0.5;
        edgeInscription.rot4dYW += mid * 0.3;
        edgeInscription.rot4dZW += high * 0.4;
    }

    // --- v3: Update particles with color pulsing ---
    if (particlesEnabled && particleSystem) {
        // Pulse particle colors over time
        const hue = (time * 0.1) % 1.0;
        particleSystem.colorStart[0] = 0.3 + 0.3 * Math.sin(time * 0.7);
        particleSystem.colorStart[1] = 0.5 + 0.3 * Math.sin(time * 0.9 + 1);
        particleSystem.colorStart[2] = 0.8 + 0.2 * Math.sin(time * 1.1 + 2);
        particleSystem.colorEnd[0] = 0.8 + 0.2 * Math.sin(time * 0.5 + 3);
        particleSystem.colorEnd[1] = 0.2 + 0.2 * Math.sin(time * 0.6 + 4);
        particleSystem.colorEnd[2] = 0.7 + 0.3 * Math.sin(time * 0.8 + 5);

        particleSystem.update(Math.min(deltaTime, 0.05));
        const { buffer, count } = particleSystem.getSplatBuffer();
        if (particleSplatRenderer && count > 0) {
            particleSplatRenderer.updateSeeds(buffer, count);
        }
        const elPC = document.getElementById('particleCount');
        if (elPC) elPC.textContent = particleSystem.getAliveCount();
    } else {
        const elPC = document.getElementById('particleCount');
        if (elPC) elPC.textContent = '0';
    }

    // ================================================================
    // RENDER PIPELINE — Full post-process chain
    // ================================================================

    // If we need post-processing, render the pipeline to an FBO first
    if (needsPostProcess) {
        ensureSceneFBO(w, h);
        // Temporarily redirect pipeline output to scene FBO
        // We do this by capturing the compositor output
    }

    // -------- CORE PIPELINE RENDER (4-layer composite) --------
    const stats = pipeline.render(time, camera.viewMatrix, camera.projectionMatrix, {
        viewProjection: camera.viewProjection,
    });

    // -------- v3: SHADOW COMPOSITE PASS --------
    // Apply normal-based shadowing with cool/warm tinting
    const ndTex = meshRenderer.gbuffer ? meshRenderer.gbuffer.normalTexture : null;
    if (shadowsEnabled && shadowCompProgram && ndTex) {
        // Copy current framebuffer to a texture for the shadow pass to read
        ensurePostFBOs(w, h);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, postFBO_A.framebuffer);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(shadowCompProgram); gl.bindVertexArray(shadowCompVao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, postFBO_A.texture);
        gl.uniform1i(gl.getUniformLocation(shadowCompProgram, 'u_sceneColor'), 0);
        if (ndTex) {
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ndTex);
            gl.uniform1i(gl.getUniformLocation(shadowCompProgram, 'u_normalDepth'), 1);
        }
        gl.uniform1f(gl.getUniformLocation(shadowCompProgram, 'u_shadowIntensity'), shadowIntensity);
        gl.uniform1f(gl.getUniformLocation(shadowCompProgram, 'u_shadowSoftness'), shadowSoftness);
        gl.uniform3f(gl.getUniformLocation(shadowCompProgram, 'u_lightDir'), 0.5, 0.8, 0.3);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // -------- v3: DEFERRED INSCRIPTION LIGHTING --------
    // Apply specular + fresnel + pulsing glow on inscription pixels
    if (deferredLitEnabled && deferredLitProgram && ndTex) {
        ensurePostFBOs(w, h);
        // Capture current screen
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, postFBO_A.framebuffer);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        // Render deferred lighting as a screen-space pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive blend for specular highlights
        gl.useProgram(deferredLitProgram); gl.bindVertexArray(deferredLitVao);

        // Use the captured scene (includes composited inscription) for lighting pass
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, postFBO_A.texture);
        gl.uniform1i(gl.getUniformLocation(deferredLitProgram, 'u_inscriptionTex'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ndTex);
        gl.uniform1i(gl.getUniformLocation(deferredLitProgram, 'u_normalDepth'), 1);
        gl.uniform3f(gl.getUniformLocation(deferredLitProgram, 'u_lightDir'), 0.5, 0.8, 0.3);
        gl.uniform1f(gl.getUniformLocation(deferredLitProgram, 'u_specularStrength'), specularStrength);
        gl.uniform1f(gl.getUniformLocation(deferredLitProgram, 'u_fresnelPower'), fresnelPower);
        gl.uniform1f(gl.getUniformLocation(deferredLitProgram, 'u_time'), time);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
    }

    // -------- v3: PARTICLE OVERLAY --------
    if (particlesEnabled && particleSplatRenderer && particleSystem && particleSystem.getAliveCount() > 0) {
        ensureParticleFBO(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, particleFBO.framebuffer);
        gl.viewport(0, 0, w, h);
        particleSplatRenderer.render(camera.viewProjection, time);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        blitTexture(particleFBO.texture, 1.0);
        gl.disable(gl.BLEND);
    }

    // -------- v3: VOLUMETRIC INSCRIPTION --------
    if (volumetricEnabled && volProgram) {
        ensurePostFBOs(w, h);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(volProgram); gl.bindVertexArray(volVao);
        if (ndTex) {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ndTex);
            gl.uniform1i(gl.getUniformLocation(volProgram, 'u_normalDepth'), 0);
        }
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_time'), time);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_density'), volDensity);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_absorption'), volAbsorption);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_geometry'), edgeInscription.geometry);
        gl.uniform2f(gl.getUniformLocation(volProgram, 'u_resolution'), w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
        const elVS = document.getElementById('volSteps');
        if (elVS) elVS.textContent = '48';
    } else {
        const elVS = document.getElementById('volSteps');
        if (elVS) elVS.textContent = '0';
    }

    // -------- v3: SSR (Screen-Space Reflections) --------
    if (ssrEnabled && ssr && ndTex) {
        const invProj = mat4Invert(camera.projectionMatrix);
        if (invProj) {
            try {
                const ssrResult = ssr.render({
                    colorTexture: postFBO_A ? postFBO_A.texture : ndTex,
                    normalDepthTexture: ndTex,
                    projMatrix: camera.projectionMatrix,
                    invProjMatrix: invProj,
                    viewMatrix: camera.viewMatrix,
                    width: w,
                    height: h,
                    time: time,
                });
                if (ssrResult && ssrResult.texture) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.viewport(0, 0, w, h);
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.disable(gl.DEPTH_TEST);
                    blitTexture(ssrResult.texture, ssrStrength);
                    gl.disable(gl.BLEND);
                }
            } catch (e) { /* SSR may fail on some configs */ }
        }
    }

    // ================================================================
    // POST-PROCESS CHAIN
    // ================================================================

    if (needsPostProcess && finalPassProg) {
        ensurePostFBOs(w, h);
        // Capture current screen content
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, postFBO_A.framebuffer);
        gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        let currentTexture = postFBO_A.texture;

        // BLOOM
        if (bloomEnabled) {
            currentTexture = renderBloom(currentTexture, w, h);
        }

        // FINAL PASS: ACES tonemapping + vignette + chromatic aberration
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(finalPassProg); gl.bindVertexArray(finalPassVao);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, currentTexture);
        gl.uniform1i(gl.getUniformLocation(finalPassProg, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(finalPassProg, 'u_vignetteStrength'), vignetteEnabled ? vignetteStrength : 0.0);
        gl.uniform1f(gl.getUniformLocation(finalPassProg, 'u_chromaticStrength'), chromaticEnabled ? chromaticStrength : 0.0);
        gl.uniform2f(gl.getUniformLocation(finalPassProg, 'u_resolution'), w, h);
        gl.uniform1f(gl.getUniformLocation(finalPassProg, 'u_time'), time);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ================================================================
    // STATS
    // ================================================================

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        if (elFps) elFps.textContent = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        if (elFT) elFT.textContent = (now - fs).toFixed(1) + ' ms';
        frameCount = 0; lastFpsTime = now;
    }
    let activeCount = stats ? stats.layersComposited : 0;
    activeCount += particlesEnabled ? 1 : 0;
    activeCount += volumetricEnabled ? 1 : 0;
    activeCount += shadowsEnabled ? 1 : 0;
    activeCount += deferredLitEnabled ? 1 : 0;
    activeCount += bloomEnabled ? 1 : 0;
    activeCount += ssrEnabled ? 1 : 0;
    if (elAL) elAL.textContent = activeCount;

    const elPP = document.getElementById('postPasses');
    if (elPP) {
        let ppCount = 0;
        if (bloomEnabled) ppCount++;
        if (vignetteEnabled || chromaticEnabled) ppCount++;
        if (ssrEnabled) ppCount++;
        elPP.textContent = ppCount;
    }

    requestAnimationFrame(tick);
}

loadMesh('torus');
switchTab('showcase');
tick();
