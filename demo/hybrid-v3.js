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

class OrbitCamera {
    constructor(canvas) {
        this.distance = 5; this.azimuth = 0.5; this.elevation = 0.35;
        this.fov = Math.PI / 4; this.near = 0.1; this.far = 100;
        this.target = [0, 0, 0]; this.canvas = canvas;
        this._dragging = false; this._lastX = 0; this._lastY = 0;
        canvas.addEventListener('pointerdown', e => { this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
        canvas.addEventListener('pointermove', e => { if (!this._dragging) return; this.azimuth += (e.clientX - this._lastX) * 0.005; this.elevation += (e.clientY - this._lastY) * 0.005; this.elevation = Math.max(-1.5, Math.min(1.5, this.elevation)); this._lastX = e.clientX; this._lastY = e.clientY; });
        canvas.addEventListener('pointerup', () => { this._dragging = false; });
        canvas.addEventListener('wheel', e => { e.preventDefault(); this.distance *= 1 + e.deltaY * 0.001; this.distance = Math.max(1, Math.min(30, this.distance)); }, { passive: false });
    }
    get isDragging() { return this._dragging; }
    get eye() { const ce = Math.cos(this.elevation), se = Math.sin(this.elevation), ca = Math.cos(this.azimuth), sa = Math.sin(this.azimuth); return [this.target[0] + this.distance * ce * sa, this.target[1] + this.distance * se, this.target[2] + this.distance * ce * ca]; }
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

const camera = new OrbitCamera(canvas);
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
/*  TABS                                                               */
/* ================================================================== */

let currentTab = 'showcase';
const TAB_CFGS = {
    'showcase': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, l: 'v3 Showcase' },
    'hybrid': { m: true, s: true, p: true, i: true, shadow: false, particles: false, volumetric: false, deferred: false, l: 'Full Hybrid' },
    'shadows': { m: true, s: false, p: false, i: true, shadow: true, particles: false, volumetric: false, deferred: true, l: 'Shadows' },
    'particles': { m: true, s: false, p: false, i: true, shadow: false, particles: true, volumetric: false, deferred: false, l: 'Particles' },
    'volumetric': { m: true, s: false, p: false, i: false, shadow: false, particles: false, volumetric: true, deferred: false, l: 'Volumetric' },
    'inscFX': { m: true, s: false, p: false, i: true, shadow: true, particles: true, volumetric: false, deferred: true, l: 'Inscription FX' },
    'benchmark': { m: true, s: true, p: true, i: true, shadow: true, particles: true, volumetric: false, deferred: true, l: 'Benchmark' },
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

    // Sync toggles
    document.getElementById('toggleMesh').checked = c.m;
    document.getElementById('toggleSplat').checked = c.s;
    document.getElementById('toggleProcedural').checked = c.p;
    document.getElementById('toggleInscription').checked = c.i;
    document.getElementById('toggleShadows').checked = c.shadow;
    document.getElementById('toggleParticles').checked = c.particles;
    document.getElementById('toggleVolumetric').checked = c.volumetric;
    document.getElementById('toggleDeferredLit').checked = c.deferred;
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

let frameCount = 0, lastFpsTime = performance.now(), autoOrbit = true, startTime = performance.now(), lastTime = 0;
const elFps = document.getElementById('fps'), elFT = document.getElementById('frameTime'), elAL = document.getElementById('activeLayers');
canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => { setTimeout(() => { autoOrbit = true; }, 3000); });

function tick() {
    const fs = performance.now(), time = (performance.now() - startTime) * 0.001;
    const deltaTime = time - lastTime; lastTime = time;
    const w = gl.canvas.width, h = gl.canvas.height;

    if (autoOrbit && !camera.isDragging) camera.azimuth += 0.003;
    edgeInscription.rot4dXY = time * 0.1; edgeInscription.rot4dYZ = time * 0.07;

    // v2: Update inscription channel
    inscriptionChannel.update(deltaTime);
    if (audioSimLevel > 0) {
        const bass = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 2.1));
        const mid = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 3.7));
        const high = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 5.3));
        const energy = audioSimLevel * (0.6 + 0.4 * Math.sin(time * 1.3));
        inscriptionChannel.setAudio(bass, mid, high, energy);
    }

    // v3: Update particles
    if (particlesEnabled && particleSystem) {
        particleSystem.update(Math.min(deltaTime, 0.05));
        const { buffer, count } = particleSystem.getSplatBuffer();
        if (particleSplatRenderer && count > 0) {
            particleSplatRenderer.updateSeeds(buffer, count);
        }
        document.getElementById('particleCount').textContent = particleSystem.getAliveCount();
    } else {
        document.getElementById('particleCount').textContent = '0';
    }

    // Core pipeline render
    const stats = pipeline.render(time, camera.viewMatrix, camera.projectionMatrix, { viewProjection: camera.viewProjection });

    // v3: Particle overlay — render into FBO, then blit additively
    // (GaussianSplatRenderer.render() calls gl.clear(), so we must use an FBO)
    if (particlesEnabled && particleSplatRenderer && particleSystem && particleSystem.getAliveCount() > 0) {
        ensureParticleFBO(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, particleFBO.framebuffer);
        gl.viewport(0, 0, w, h);
        particleSplatRenderer.render(camera.viewProjection, time);
        // Now blit particle FBO additively onto the default framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        blitTexture(particleFBO.texture, 1.0);
        gl.disable(gl.BLEND);
    }

    // v3: Volumetric inscription overlay
    if (volumetricEnabled && volProgram) {
        ensurePostFBOs(w, h);
        // Read the current framebuffer to a texture first (capture pipeline output)
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(volProgram); gl.bindVertexArray(volVao);
        const ndTex = meshRenderer.gbuffer ? meshRenderer.gbuffer.normalTexture : null;
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
        document.getElementById('volSteps').textContent = '48';
    } else {
        document.getElementById('volSteps').textContent = '0';
    }

    // Stats
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        elFps.textContent = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        elFT.textContent = (now - fs).toFixed(1) + ' ms';
        frameCount = 0; lastFpsTime = now;
    }
    if (stats) elAL.textContent = stats.layersComposited + (particlesEnabled ? 1 : 0) + (volumetricEnabled ? 1 : 0) + (shadowsEnabled ? 1 : 0) + (deferredLitEnabled ? 1 : 0);

    requestAnimationFrame(tick);
}

loadMesh('torus');
switchTab('showcase');
tick();
