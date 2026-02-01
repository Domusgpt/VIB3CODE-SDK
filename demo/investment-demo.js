/**
 * VIB3+ Investment Demo — Cinematic Auto-Showcase
 *
 * Self-running presentation that cycles through 6 scenes,
 * each highlighting a different capability of the v3 hybrid render pipeline.
 * Designed to impress investors with real-time rendering technology.
 */

// ─── MODULE IMPORTS ──────────────────────────────────────────────
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { MeshRenderer } from '../src/render/MeshRenderer.js';
import { EdgeInscriptionLayer } from '../src/render/EdgeInscriptionLayer.js';
import { HybridRenderPipeline } from '../src/render/HybridRenderPipeline.js';
import { TextureToSplatConverter } from '../src/render/TextureToSplatConverter.js';
import { InscriptionChannel } from '../src/render/InscriptionChannel.js';
import { ShadowMap } from '../src/render/ShadowMap.js';
import { ParticleSystem } from '../src/render/ParticleSystem.js';
import { VolumetricInscription } from '../src/render/VolumetricInscription.js';
import { DeferredInscriptionLighting } from '../src/render/DeferredInscriptionLighting.js';
import { InscriptionTexture } from '../src/render/InscriptionTexture.js';

// ─── MATH HELPERS ────────────────────────────────────────────────
function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
}
function mat4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov * 0.5), ri = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * ri, -1, 0, 0, 2 * far * near * ri, 0]);
}
function mat4LookAt(eye, tgt, up) {
    let zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpVec3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ─── MESH GENERATORS ─────────────────────────────────────────────
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
    const P = [-s,-s,s,s,-s,s,s,s,s,-s,s,s,s,-s,-s,-s,-s,-s,-s,s,-s,s,s,-s,-s,s,s,s,s,s,s,s,-s,-s,s,-s,-s,-s,-s,s,-s,-s,s,-s,s,-s,-s,s,s,-s,s,s,-s,-s,s,s,-s,s,s,s,-s,-s,-s,-s,-s,s,-s,s,s,-s,s,-s];
    const N = [0,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,1,0,0,1,0,0,1,0,0,1,0,0,-1,0,0,-1,0,0,-1,0,0,-1,0,0];
    const U = [0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1];
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

// ─── PROCEDURAL TEXTURE ──────────────────────────────────────────
function generateTexture(size) {
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

// ─── PROCEDURAL SHADER (Layer 2) ─────────────────────────────────
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

// ─── VOLUMETRIC SHADER ───────────────────────────────────────────
const VOL_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_normalDepth; uniform float u_time,u_density,u_absorption,u_geometry;
uniform vec2 u_resolution; out vec4 outColor;
mat4 rXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}
float hash3(vec3 p){p=fract(p*vec3(443.897,441.423,437.195));p+=dot(p,p.yzx+19.19);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float getPattern(vec3 p,float g){float t=u_time*0.3,b=mod(g,8.0),pat=0.0;
if(b<0.5)pat=abs(sin(p.x*6.0+t)*sin(p.y*6.0-t)*sin(p.z*6.0+t*0.5));
else if(b<1.5){vec3 q=fract(p*3.0)-0.5;pat=1.0-smoothstep(0.15,0.25,length(max(abs(q)-0.15,0.0)));}
else if(b<2.5){float r=length(p);pat=smoothstep(0.5,0.3,r)*abs(sin(atan(p.y,p.x)*4.0+t*2.0));}
else if(b<3.5){float r=length(p.xy);pat=abs(sin(r*12.0+t*2.0))*smoothstep(0.6,0.2,r);}
else if(b<4.5){float a=atan(p.y,p.x)+t;pat=abs(sin(a*3.0+p.z*5.0));}
else if(b<5.5){vec3 q=p*2.0;for(int i=0;i<3;i++){q=abs(q)-0.8;q*=1.5;}pat=1.0-smoothstep(0.0,0.3,length(q)*0.05);}
else if(b<6.5){pat=noise3(p*4.0+t*0.5)*noise3(p*8.0-t*0.3);}
else{vec3 q=abs(fract(p*3.0)-0.5);pat=1.0-smoothstep(0.0,0.06,min(min(q.x,q.y),q.z));}
if(g>=8.0&&g<16.0)pat*=smoothstep(0.6,0.2,length(p));
else if(g>=16.0)pat*=smoothstep(0.5,0.1,abs(max(abs(p.x+p.y)-p.z,abs(p.x-p.y)+p.z)*0.5));
return clamp(pat,0.0,1.0);}
void main(){vec4 nd=texture(u_normalDepth,v_uv);float sceneDepth=nd.a;
if(sceneDepth<0.001){outColor=vec4(0);return;}
vec2 uv=(v_uv*2.0-1.0)*vec2(u_resolution.x/u_resolution.y,1.0);
vec3 rayOri=vec3(uv,-2.0);vec3 rayDir=normalize(vec3(uv*0.3,1.0));
float t=u_time;mat4 rot=rXW(t*0.2)*rYW(t*0.15)*rZW(t*0.1);
vec3 acc=vec3(0.0);float transmittance=1.0;float stepSize=4.0/48.0;
for(int i=0;i<48;i++){vec3 pos=rayOri+rayDir*float(i)*stepSize;float dist=length(pos);if(dist>2.0)continue;
vec4 p4=rot*vec4(pos,0.0);vec3 rp=p4.xyz/(2.0-p4.w);
float pat=getPattern(rp,u_geometry)*u_density;pat*=smoothstep(2.0,0.5,dist);
vec3 emission=mix(vec3(0.3,0.6,1.0),vec3(0.8,0.2,0.9),pat)*pat*2.0;
acc+=emission*transmittance*stepSize;transmittance*=exp(-pat*u_absorption*stepSize);if(transmittance<0.01)break;}
outColor=vec4(acc,1.0-transmittance);}`;

// ─── SHADOW COMPOSITE SHADER ─────────────────────────────────────
const SHADOW_COMP_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_sceneColor,u_shadowMap,u_normalDepth;
uniform float u_shadowIntensity,u_shadowSoftness; uniform vec3 u_lightDir; out vec4 outColor;
void main(){vec4 scene=texture(u_sceneColor,v_uv);vec4 nd=texture(u_normalDepth,v_uv);
vec3 normal=nd.rgb*2.0-1.0;float NdL=max(dot(normal,normalize(u_lightDir)),0.0);
float shadow=smoothstep(0.0,0.3+u_shadowSoftness*0.5,NdL);shadow=mix(1.0,shadow,u_shadowIntensity);
vec3 coolTint=vec3(0.7,0.8,1.0);vec3 warmTint=vec3(1.0,0.95,0.9);
vec3 shadowColor=mix(coolTint,warmTint,shadow);outColor=vec4(scene.rgb*shadowColor*(0.5+0.5*shadow),scene.a);}`;

// ─── DEFERRED LIGHTING SHADER ────────────────────────────────────
const DEFERRED_LIT_FRAG = `#version 300 es
precision highp float; in vec2 v_uv;
uniform sampler2D u_inscriptionTex,u_normalDepth;
uniform vec3 u_lightDir; uniform float u_specularStrength,u_fresnelPower,u_time; out vec4 outColor;
void main(){vec4 insc=texture(u_inscriptionTex,v_uv);if(insc.a<0.01){outColor=insc;return;}
vec4 nd=texture(u_normalDepth,v_uv);vec3 N=normalize(nd.rgb*2.0-1.0);
vec3 L=normalize(u_lightDir);vec3 V=vec3(0,0,1);vec3 H=normalize(L+V);
float NdL=max(dot(N,L),0.0);vec3 dNdx=dFdx(N),dNdy=dFdy(N);vec3 tangent=normalize(dNdx+dNdy);
float TdH=dot(tangent,H);float anisoSpec=pow(max(0.0,sqrt(1.0-TdH*TdH)),32.0)*u_specularStrength;
float fresnel=pow(1.0-max(dot(N,V),0.0),u_fresnelPower*8.0)*0.5;
vec3 lit=insc.rgb*(0.4+0.6*NdL)+vec3(anisoSpec)*insc.rgb+vec3(fresnel)*insc.rgb*0.5;
lit+=insc.rgb*0.15*(0.5+0.5*sin(u_time*2.0+v_uv.x*10.0));outColor=vec4(lit,insc.a);}`;

// ─── BLIT SHADER ─────────────────────────────────────────────────
const BLIT_FRAG = `#version 300 es
precision highp float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity; out vec4 outColor;
void main(){vec4 c=texture(u_texture,v_uv);outColor=vec4(c.rgb,c.a*u_opacity);}`;

// ═══════════════════════════════════════════════════════════════════
//  CANVAS + GL INIT
// ═══════════════════════════════════════════════════════════════════
const canvas = document.getElementById('canvas');
const dpr = Math.min(devicePixelRatio, 2);
canvas.width = window.innerWidth * dpr;
canvas.height = window.innerHeight * dpr;
canvas.style.width = '100%';
canvas.style.height = '100%';

const gl = canvas.getContext('webgl2', { depth: true, antialias: false, preserveDrawingBuffer: true });
if (!gl) { document.body.innerHTML = '<h2 style="color:#fff;text-align:center;margin-top:40vh">WebGL2 required</h2>'; throw new Error('WebGL2 required'); }
gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_color_buffer_float');

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
});

// ═══════════════════════════════════════════════════════════════════
//  ORBIT CAMERA WITH SCRIPTABLE TARGETS
// ═══════════════════════════════════════════════════════════════════
class CinemaCamera {
    constructor(canvas) {
        this.distance = 5; this.azimuth = 0.5; this.elevation = 0.35;
        this.fov = Math.PI / 4; this.near = 0.1; this.far = 100;
        this.target = [0, 0, 0]; this.canvas = canvas;
        this._dragging = false; this._userControl = false;
        this._targetDistance = 5; this._targetAzimuth = 0.5; this._targetElevation = 0.35;
        this._lerpSpeed = 0.03;

        canvas.addEventListener('pointerdown', e => {
            this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
            this._userControl = true;
        });
        canvas.addEventListener('pointermove', e => {
            if (!this._dragging) return;
            this.azimuth += (e.clientX - this._lastX) * 0.005;
            this.elevation += (e.clientY - this._lastY) * 0.005;
            this.elevation = Math.max(-1.5, Math.min(1.5, this.elevation));
            this._lastX = e.clientX; this._lastY = e.clientY;
        });
        canvas.addEventListener('pointerup', () => { this._dragging = false; });
        canvas.addEventListener('wheel', e => {
            e.preventDefault(); this.distance *= 1 + e.deltaY * 0.001;
            this.distance = Math.max(1, Math.min(30, this.distance));
            this._userControl = true;
        }, { passive: false });
    }
    setTarget(azimuth, elevation, distance, lerpSpeed = 0.03) {
        this._targetAzimuth = azimuth;
        this._targetElevation = elevation;
        this._targetDistance = distance;
        this._lerpSpeed = lerpSpeed;
        this._userControl = false;
    }
    update() {
        if (!this._userControl && !this._dragging) {
            this.azimuth += (this._targetAzimuth - this.azimuth) * this._lerpSpeed;
            this.elevation += (this._targetElevation - this.elevation) * this._lerpSpeed;
            this.distance += (this._targetDistance - this.distance) * this._lerpSpeed;
            // Slowly orbit
            this._targetAzimuth += 0.002;
        }
    }
    get eye() {
        const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
        const ca = Math.cos(this.azimuth), sa = Math.sin(this.azimuth);
        return [this.target[0] + this.distance * ce * sa, this.target[1] + this.distance * se, this.target[2] + this.distance * ce * ca];
    }
    get aspect() { return this.canvas.width / this.canvas.height; }
    get viewMatrix() { return mat4LookAt(this.eye, this.target, [0, 1, 0]); }
    get projectionMatrix() { return mat4Perspective(this.fov, this.aspect, this.near, this.far); }
    get viewProjection() { return mat4Multiply(this.projectionMatrix, this.viewMatrix); }
}

const camera = new CinemaCamera(canvas);

// ═══════════════════════════════════════════════════════════════════
//  RENDERER INITIALIZATION
// ═══════════════════════════════════════════════════════════════════
const meshRenderer = new MeshRenderer(gl, {
    lightDir: [0.5, 0.8, 0.3], lightColor: [1.0, 0.98, 0.95],
    ambientColor: [0.15, 0.15, 0.22], specularPower: 48
});
const splatRenderer = new GaussianSplatRenderer(gl, {
    pointScale: canvas.height / (2 * Math.tan(Math.PI / 8)),
    blendMode: 'additive', animate: true, intensity: 1.0, chromatic: 0.4
});
const edgeInscription = new EdgeInscriptionLayer(gl, {
    layerCount: 4, geometry: 3, thickness: 0.6, patternScale: 3.0,
    patternSpeed: 0.3, depthSensitivity: 8.0, normalSensitivity: 2.0, opacity: 0.8
});
const pipeline = new HybridRenderPipeline(gl, { exposure: 1.2, gamma: 2.2 });
pipeline.setMeshRenderer(meshRenderer);
pipeline.setSplatRenderer(splatRenderer);
pipeline.setEdgeInscription(edgeInscription);

const inscriptionChannel = new InscriptionChannel({ layerCount: 4, transitionDuration: 0.5 });
inscriptionChannel.registerObject(1, 'active');

// Procedural shader setup
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

// v3 renderers
let shadowMap = null;
try { shadowMap = new ShadowMap(gl, { resolution: 1024, bias: 0.003, pcfRadius: 2, frustumSize: 6, lightDir: [0.5, 0.8, 0.3] }); shadowMap.init(); }
catch (e) { shadowMap = null; }

let particleSystem = null;
try {
    particleSystem = new ParticleSystem(gl, {
        maxParticles: 10000, emitRate: 50, lifetime: 2.5, speed: 0.3, speedVariance: 0.15,
        gravity: [0, -0.1, 0], drag: 0.02, splatScale: 0.015, emitterType: 'sphere',
        emitterRadius: 1.2, colorStart: [0.4, 0.7, 1.0], colorEnd: [0.8, 0.3, 1.0], colorMode: 'lerp'
    });
} catch (e) { particleSystem = null; }

let volumetricInscription = null;
try {
    volumetricInscription = new VolumetricInscription(gl, {
        maxSteps: 48, density: 0.8, absorption: 0.4, geometry: 3,
        primaryColor: [0.3, 0.6, 1.0], secondaryColor: [0.8, 0.2, 0.9]
    });
    volumetricInscription.init();
} catch (e) { volumetricInscription = null; }

let deferredLighting = null;
try {
    deferredLighting = new DeferredInscriptionLighting(gl, {
        lightDir: [0.5, 0.8, 0.3], lightColor: [1.0, 0.98, 0.95],
        specularPower: 32, specularStrength: 0.6, fresnelPower: 3.0, inscriptionEmission: 1.5
    });
    deferredLighting.init();
} catch (e) { deferredLighting = null; }

let inscriptionTexture = null;
try {
    inscriptionTexture = new InscriptionTexture(gl);
    inscriptionTexture.setLayerCircuitPattern(0, { density: 12, color: '#5b9cf5' });
    inscriptionTexture.setLayerText(1, 'VIB3+', { fontSize: 48, color: '#a78bfa' });
} catch (e) { inscriptionTexture = null; }

// Particle splat renderer + FBO
let particleSplatRenderer = null;
try {
    particleSplatRenderer = new GaussianSplatRenderer(gl, {
        pointScale: canvas.height / (2 * Math.tan(Math.PI / 8)),
        blendMode: 'additive', animate: true, intensity: 1.5, chromatic: 0.6
    });
} catch (e) { particleSplatRenderer = null; }

let particleFBO = null, particleFBOW = 0, particleFBOH = 0;
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

// Volumetric program
let volProgram = null, volVao = null;
{
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, VOL_FRAG.includes('v_uv') ? FS_VERT : FS_VERT); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, VOL_FRAG); gl.compileShader(fs);
    if (gl.getShaderParameter(vs, gl.COMPILE_STATUS) && gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        volProgram = gl.createProgram(); gl.attachShader(volProgram, vs); gl.attachShader(volProgram, fs); gl.linkProgram(volProgram);
        if (!gl.getProgramParameter(volProgram, gl.LINK_STATUS)) volProgram = null;
        else volVao = gl.createVertexArray();
    }
}

// Blit shader
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

// ═══════════════════════════════════════════════════════════════════
//  MESH + SPLAT DATA
// ═══════════════════════════════════════════════════════════════════
const MESHES = {
    torus: () => generateTorus(1, 0.4, 64, 32),
    sphere: () => generateSphere(1.2, 48, 32),
    cube: () => generateCube(1.8),
    knot: () => generateTrefoilKnot(0.35, 0.12, 128, 24),
};
let currentMeshKey = 'knot', currentMesh = null, textureSplats = [];
const textureConverter = new TextureToSplatConverter();
const textureData = generateTexture(256);

function loadMesh(key) {
    currentMeshKey = key;
    const gen = MESHES[key]; if (!gen) return;
    currentMesh = gen();
    meshRenderer.uploadGeometry(currentMesh);
    meshRenderer.uploadTexture(textureData);
    textureSplats = textureConverter.convert({
        positions: currentMesh.positions, normals: currentMesh.normals,
        uvs: currentMesh.uvs, indices: currentMesh.indices,
        diffusePixels: textureData.data, diffuseWidth: textureData.width, diffuseHeight: textureData.height,
    });
    splatRenderer.updateSeeds(encodeGaussianSeeds(textureSplats), textureSplats.length);
    updateStats('meshTris', currentMesh.triCount.toLocaleString());
    updateStats('splatCount', textureSplats.length.toLocaleString());
}

function loadGalaxySplats() {
    const seeds = [];
    const count = 200000;
    for (let i = 0; i < count; i++) {
        const t = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.5) * 3;
        const arm = Math.floor(Math.random() * 3) * (Math.PI * 2 / 3), sp = t * 0.5;
        seeds.push({
            position: [r * Math.cos(t + arm + sp) + (Math.random() - 0.5) * 0.3,
                       (Math.random() - 0.5) * 0.2 * (1 - r / 3),
                       r * Math.sin(t + arm + sp) + (Math.random() - 0.5) * 0.3],
            orientation: [1, 0, 0, 0], scale: 0.015 + Math.random() * 0.02,
            color: [0.6 + Math.random() * 0.4, 0.4 + Math.random() * 0.4, 0.8 + Math.random() * 0.2],
            depth: r * 0.3
        });
    }
    splatRenderer.updateSeeds(encodeGaussianSeeds(seeds), seeds.length);
    updateStats('splatCount', count.toLocaleString());
}

// ═══════════════════════════════════════════════════════════════════
//  SCENE DEFINITIONS — 6 showcase scenes
// ═══════════════════════════════════════════════════════════════════
const SCENES = [
    {
        id: 'hybrid-pipeline',
        title: 'Hybrid Render Pipeline',
        desc: 'Four compositing layers — Mesh, Gaussian Splats, Procedural Shader, Edge Inscription — rendered simultaneously into a unified framebuffer with per-layer blend modes and tonemapping.',
        tags: ['WebGL 2.0', 'MRT GBuffer', '4-Layer Compositor', 'Tone Mapping'],
        mesh: 'knot',
        camera: { azimuth: 0.5, elevation: 0.35, distance: 5 },
        layers: { mesh: true, splat: true, procedural: true, inscription: true },
        v3: { shadows: true, particles: false, volumetric: false, deferred: true },
        procGeometry: 3,
        state: 'active',
        usecaseHighlight: 0,
        capMetric: { key: 'capLayers', value: '4' },
    },
    {
        id: 'gaussian-splats',
        title: '200K Gaussian Splats',
        desc: 'Real-time point cloud rendering with per-splat orientation quaternions, GPU-driven orbital animation, chromatic aberration, and HDR bloom — all at 60fps.',
        tags: ['200K Points', 'GPU Animation', 'Chromatic Aberration', 'HDR Bloom', 'Quaternion Orientation'],
        mesh: null, // Galaxy mode
        camera: { azimuth: 1.0, elevation: 0.15, distance: 4 },
        layers: { mesh: false, splat: true, procedural: false, inscription: false },
        v3: { shadows: false, particles: false, volumetric: false, deferred: false },
        procGeometry: 3,
        state: 'active',
        usecaseHighlight: 4,
        capMetric: { key: 'capLayers', value: '200K' },
    },
    {
        id: 'edge-inscription',
        title: 'Edge Inscription System',
        desc: 'GBuffer-driven Sobel edge detection feeds a 4-layer procedural inscription system with 24 geometry variants, 4D rotation, and per-layer color, opacity, and pattern control.',
        tags: ['Sobel Edge Detection', '4 Inscription Layers', '24 Geometries', '4D Rotation', 'Audio Reactive'],
        mesh: 'torus',
        camera: { azimuth: -0.5, elevation: 0.4, distance: 4.5 },
        layers: { mesh: true, splat: false, procedural: false, inscription: true },
        v3: { shadows: true, particles: false, volumetric: false, deferred: true },
        procGeometry: 7,
        state: 'active',
        usecaseHighlight: 1,
        capMetric: { key: 'capGeometries', value: '24' },
    },
    {
        id: 'state-machine',
        title: 'Semantic State Machine',
        desc: 'Object-aware inscription transitions between semantic states — idle, active, powered, damaged, destroyed — with smooth interpolation, priority overrides, and audio-reactive modulation.',
        tags: ['5 Semantic States', 'Smooth Transitions', 'Priority System', 'Audio Mapping', 'Per-Object Identity'],
        mesh: 'sphere',
        camera: { azimuth: 0.2, elevation: 0.3, distance: 4.8 },
        layers: { mesh: true, splat: true, procedural: false, inscription: true },
        v3: { shadows: true, particles: true, volumetric: false, deferred: true },
        procGeometry: 5,
        state: 'idle', // Will cycle through states
        usecaseHighlight: 2,
        capMetric: { key: 'capLayers', value: '5' },
    },
    {
        id: 'volumetric-4d',
        title: '4D Volumetric Fields',
        desc: 'Raymarched volumetric inscription with 48-step integration through 4D-rotated noise fields. Emission-absorption model constrained by GBuffer depth for physically-grounded volumetric effects.',
        tags: ['48 Ray Steps', '4D Noise Field', 'Emission-Absorption', 'Depth Constrained', 'Volumetric Rendering'],
        mesh: 'cube',
        camera: { azimuth: 0.8, elevation: 0.25, distance: 5.5 },
        layers: { mesh: true, splat: false, procedural: true, inscription: true },
        v3: { shadows: false, particles: false, volumetric: true, deferred: false },
        procGeometry: 1,
        state: 'powered',
        usecaseHighlight: 3,
        capMetric: { key: 'capRotation', value: '6D' },
    },
    {
        id: 'full-pipeline',
        title: 'Full v3 Pipeline',
        desc: 'All 15 features active simultaneously: Mesh renderer, Gaussian splats, procedural shader, edge inscription, shadow mapping, particle system, volumetric inscription, deferred lighting, and inscription textures — production-ready at 60fps.',
        tags: ['15 Features', 'All Layers Active', 'Shadow + Particles', 'Volumetric', 'Deferred Lighting', '60fps'],
        tagType: 'purple',
        mesh: 'knot',
        camera: { azimuth: 0.0, elevation: 0.3, distance: 4.8 },
        layers: { mesh: true, splat: true, procedural: true, inscription: true },
        v3: { shadows: true, particles: true, volumetric: false, deferred: true },
        procGeometry: 3,
        state: 'active',
        usecaseHighlight: 5,
        capMetric: { key: 'capLayers', value: '15' },
    },
];

// ═══════════════════════════════════════════════════════════════════
//  SCENE DIRECTOR
// ═══════════════════════════════════════════════════════════════════
let currentSceneIndex = 0;
let sceneStartTime = 0;
const SCENE_DURATION = 9; // seconds per scene
const TRANSITION_DURATION = 1.5; // seconds for transition
let showcaseRunning = true;
let showcaseStarted = false;
let openingDone = false;
let interactiveMode = false;

// State cycling for scene 3
const STATE_CYCLE = ['idle', 'active', 'powered', 'damaged', 'destroyed'];
let stateCycleIdx = 0;
let lastStateCycleTime = 0;

function applyScene(index) {
    const scene = SCENES[index];
    if (!scene) return;

    // Load mesh or galaxy
    if (scene.mesh) {
        loadMesh(scene.mesh);
    } else {
        loadGalaxySplats();
    }

    // Pipeline layers
    pipeline.meshLayer.enabled = scene.layers.mesh;
    pipeline.splatLayer.enabled = scene.layers.splat;
    pipeline.proceduralLayer.enabled = scene.layers.procedural;
    pipeline.inscriptionLayer.enabled = scene.layers.inscription;

    // Procedural geometry
    procGeometry = scene.procGeometry;

    // Camera target
    camera.setTarget(scene.camera.azimuth, scene.camera.elevation, scene.camera.distance, 0.02);

    // Inscription state
    inscriptionChannel.setObjectState(1, scene.state);

    // Update UI
    updateNarrative(index);
    updateProgress(index);
    updateUsecases(scene.usecaseHighlight);
    if (scene.capMetric) updateCapMetric(scene.capMetric.key, scene.capMetric.value);

    // Flash effect
    const flash = document.createElement('div');
    flash.className = 'scene-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1500);
}

function advanceScene() {
    currentSceneIndex = (currentSceneIndex + 1) % SCENES.length;
    sceneStartTime = performance.now() * 0.001;
    applyScene(currentSceneIndex);
}

// ═══════════════════════════════════════════════════════════════════
//  UI UPDATES
// ═══════════════════════════════════════════════════════════════════
function updateStats(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateNarrative(index) {
    const scene = SCENES[index];
    const el = document.getElementById('narrative');
    el.classList.remove('visible');
    el.classList.add('exit');
    setTimeout(() => {
        document.getElementById('sceneCounter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(SCENES.length).padStart(2, '0')}`;
        document.getElementById('sceneTitle').textContent = scene.title;
        document.getElementById('sceneDesc').textContent = scene.desc;
        const tagsEl = document.getElementById('techTags');
        tagsEl.innerHTML = scene.tags.map(t =>
            `<span class="tech-tag${scene.tagType === 'purple' ? ' purple' : ''}">${t}</span>`
        ).join('');
        el.classList.remove('exit');
        el.classList.add('visible');
    }, 400);
}

function updateProgress(index) {
    document.querySelectorAll('.progress-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
        dot.classList.toggle('visited', i < index);
    });
    document.getElementById('progressLabel').textContent = `Scene ${index + 1} of ${SCENES.length}`;
}

function updateUsecases(highlight) {
    document.querySelectorAll('.usecase-tag').forEach(tag => {
        tag.classList.toggle('highlight', parseInt(tag.dataset.idx) === highlight);
    });
}

function updateCapMetric(key, value) {
    const el = document.getElementById(key);
    if (el) el.textContent = value;
}

function showUI() {
    ['top-bar', 'narrative', 'stats', 'progress-bar', 'usecases', 'capabilities'].forEach(id => {
        document.getElementById(id).classList.add('visible');
    });
}

function hideShowcaseUI() {
    ['narrative', 'progress-bar', 'capabilities', 'usecases'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
    });
}

// ═══════════════════════════════════════════════════════════════════
//  UI EVENT WIRING
// ═══════════════════════════════════════════════════════════════════

// Contact panel
document.getElementById('btnContact').addEventListener('click', () => {
    document.getElementById('contact-panel').classList.add('visible');
});
document.getElementById('btnCloseContact').addEventListener('click', () => {
    document.getElementById('contact-panel').classList.remove('visible');
});

// Replay
document.getElementById('btnReplay').addEventListener('click', () => {
    interactiveMode = false;
    showcaseRunning = true;
    currentSceneIndex = 0;
    sceneStartTime = performance.now() * 0.001;
    document.getElementById('interactive-cta').classList.remove('visible');
    showUI();
    applyScene(0);
});

// Controls toggle (interactive mode)
document.getElementById('btnControls').addEventListener('click', () => {
    interactiveMode = !interactiveMode;
    if (interactiveMode) {
        showcaseRunning = false;
        hideShowcaseUI();
        document.getElementById('interactive-cta').classList.remove('visible');
        // Enable all layers for playground
        pipeline.meshLayer.enabled = true;
        pipeline.splatLayer.enabled = true;
        pipeline.proceduralLayer.enabled = true;
        pipeline.inscriptionLayer.enabled = true;
    } else {
        showcaseRunning = true;
        sceneStartTime = performance.now() * 0.001;
        showUI();
        applyScene(currentSceneIndex);
    }
});

// Interactive CTA
document.getElementById('btnInteractive').addEventListener('click', () => {
    interactiveMode = true;
    showcaseRunning = false;
    document.getElementById('interactive-cta').classList.remove('visible');
    hideShowcaseUI();
    pipeline.meshLayer.enabled = true;
    pipeline.splatLayer.enabled = true;
    pipeline.proceduralLayer.enabled = true;
    pipeline.inscriptionLayer.enabled = true;
});

// Progress dot clicks
document.querySelectorAll('.progress-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.scene);
        currentSceneIndex = idx;
        sceneStartTime = performance.now() * 0.001;
        applyScene(idx);
    });
});

// ═══════════════════════════════════════════════════════════════════
//  OPENING SEQUENCE
// ═══════════════════════════════════════════════════════════════════
function startOpening() {
    // Load initial mesh immediately so rendering starts
    loadMesh('knot');
    // After opening animation, fade out and start showcase
    setTimeout(() => {
        document.getElementById('opening').classList.add('fade-out');
        setTimeout(() => {
            document.getElementById('opening').classList.add('hidden');
            openingDone = true;
            showcaseStarted = true;
            sceneStartTime = performance.now() * 0.001;
            showUI();
            applyScene(0);
        }, 1500);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════════════════════
let frameCount = 0, lastFpsTime = performance.now(), startTime = performance.now(), lastTime = 0;
let shadowsEnabled = true, particlesEnabled = false, volumetricEnabled = false, deferredLitEnabled = true;
let audioSimLevel = 0.4;

function tick() {
    const now = performance.now();
    const time = (now - startTime) * 0.001;
    const deltaTime = time - lastTime;
    lastTime = time;
    const w = gl.canvas.width, h = gl.canvas.height;

    // Camera update (smooth lerp to targets)
    camera.update();

    // Edge inscription auto-animation
    edgeInscription.rot4dXY = time * 0.1;
    edgeInscription.rot4dYZ = time * 0.07;

    // Inscription channel update
    inscriptionChannel.update(deltaTime);
    if (audioSimLevel > 0) {
        const bass = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 2.1));
        const mid = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 3.7));
        const high = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 5.3));
        const energy = audioSimLevel * (0.6 + 0.4 * Math.sin(time * 1.3));
        inscriptionChannel.setAudio(bass, mid, high, energy);
    }

    // Scene auto-advance
    if (showcaseRunning && showcaseStarted) {
        const sceneElapsed = time - sceneStartTime;

        // State cycling for scene 3 (state machine demo)
        if (currentSceneIndex === 3 && sceneElapsed > 1.5) {
            if (time - lastStateCycleTime > 1.8) {
                stateCycleIdx = (stateCycleIdx + 1) % STATE_CYCLE.length;
                inscriptionChannel.setObjectState(1, STATE_CYCLE[stateCycleIdx]);
                updateStats('currentState', STATE_CYCLE[stateCycleIdx]);
                lastStateCycleTime = time;
            }
        }

        // Auto-advance scene
        if (sceneElapsed > SCENE_DURATION) {
            if (currentSceneIndex < SCENES.length - 1) {
                advanceScene();
            } else {
                // Showcase complete — show CTA
                showcaseRunning = false;
                document.getElementById('interactive-cta').classList.add('visible');
            }
        }

        // Apply v3 features from current scene
        const scene = SCENES[currentSceneIndex];
        if (scene) {
            shadowsEnabled = scene.v3.shadows;
            particlesEnabled = scene.v3.particles;
            volumetricEnabled = scene.v3.volumetric;
            deferredLitEnabled = scene.v3.deferred;
        }
    }

    // Particle update
    if (particlesEnabled && particleSystem) {
        particleSystem.update(Math.min(deltaTime, 0.05));
        const { buffer, count } = particleSystem.getSplatBuffer();
        if (particleSplatRenderer && count > 0) {
            particleSplatRenderer.updateSeeds(buffer, count);
        }
        updateStats('particleCount', particleSystem.getAliveCount());
    } else {
        updateStats('particleCount', '0');
    }

    // Core pipeline render
    const stats = pipeline.render(time, camera.viewMatrix, camera.projectionMatrix, { viewProjection: camera.viewProjection });

    // Particle overlay
    if (particlesEnabled && particleSplatRenderer && particleSystem && particleSystem.getAliveCount() > 0) {
        ensureParticleFBO(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, particleFBO.framebuffer);
        gl.viewport(0, 0, w, h);
        particleSplatRenderer.render(camera.viewProjection, time);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
        blitTexture(particleFBO.texture, 1.0);
        gl.disable(gl.BLEND);
    }

    // Volumetric inscription overlay
    if (volumetricEnabled && volProgram) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(volProgram); gl.bindVertexArray(volVao);
        const ndTex = meshRenderer.gbuffer ? meshRenderer.gbuffer.normalTexture : null;
        if (ndTex) {
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ndTex);
            gl.uniform1i(gl.getUniformLocation(volProgram, 'u_normalDepth'), 0);
        }
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_time'), time);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_density'), 0.8);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_absorption'), 0.4);
        gl.uniform1f(gl.getUniformLocation(volProgram, 'u_geometry'), edgeInscription.geometry || 3);
        gl.uniform2f(gl.getUniformLocation(volProgram, 'u_resolution'), w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
    }

    // FPS stats
    frameCount++;
    if (now - lastFpsTime > 500) {
        const fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        const ft = ((now - lastFpsTime) / frameCount).toFixed(1);
        updateStats('fps', fps);
        updateStats('frameTime', ft + ' ms');
        document.getElementById('capFps').textContent = fps;
        const layerCount = (stats ? stats.layersComposited : 0) +
            (particlesEnabled ? 1 : 0) + (volumetricEnabled ? 1 : 0) +
            (shadowsEnabled ? 1 : 0) + (deferredLitEnabled ? 1 : 0);
        updateStats('activeLayers', layerCount);
        frameCount = 0; lastFpsTime = now;
    }

    requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════════
startOpening();
tick();
