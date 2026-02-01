/**
 * VIB3+ Hybrid Render Pipeline Demo
 *
 * Showcases the HybridRenderPipeline compositing:
 *   Layer 0 — MeshRenderer (traditional triangles, GBuffer)
 *   Layer 1 — GaussianSplatRenderer (point-sprite splats)
 *   Layer 2 — Procedural VIB3 shader
 *   Layer 3 — EdgeInscriptionLayer (holographic edge overlay)
 *
 * Tabs:
 *   Full Hybrid      — All 4 layers active
 *   Mesh + Inscription — Only mesh + holographic edges
 *   Mesh + Splats     — Mesh + texture-to-splat conversion
 *   Splat + Procedural — Splat + VIB3 procedural shader only
 *   Benchmark         — Timed per-layer benchmarks
 */

import { MeshRenderer } from '../src/render/MeshRenderer.js';
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { EdgeInscriptionLayer } from '../src/render/EdgeInscriptionLayer.js';
import { HybridRenderPipeline, BlendModes } from '../src/render/HybridRenderPipeline.js';
import { TextureToSplatConverter } from '../src/render/TextureToSplatConverter.js';
import { encodeGaussianSeeds } from '../src/render/GaussianSeedBuffer.js';
import { SceneRenderer } from '../src/render/SceneRenderer.js';
import { InscriptionChannel } from '../src/render/InscriptionChannel.js';

/* ================================================================== */
/*  PROCEDURAL MESH GENERATORS                                         */
/* ================================================================== */

function generateTorus(R, r, segments, rings) {
    const positions = [];
    const normals   = [];
    const uvs       = [];
    const indices   = [];

    for (let j = 0; j <= rings; j++) {
        for (let i = 0; i <= segments; i++) {
            const u = i / segments * Math.PI * 2;
            const v = j / rings * Math.PI * 2;

            const x = (R + r * Math.cos(v)) * Math.cos(u);
            const y = r * Math.sin(v);
            const z = (R + r * Math.cos(v)) * Math.sin(u);

            const nx = Math.cos(v) * Math.cos(u);
            const ny = Math.sin(v);
            const nz = Math.cos(v) * Math.sin(u);

            positions.push(x, y, z);
            normals.push(nx, ny, nz);
            uvs.push(i / segments, j / rings);
        }
    }

    for (let j = 0; j < rings; j++) {
        for (let i = 0; i < segments; i++) {
            const a = j * (segments + 1) + i;
            const b = a + segments + 1;
            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        uvs:       new Float32Array(uvs),
        indices:   new Uint16Array(indices),
        triCount:  indices.length / 3,
    };
}

function generateSphere(radius, widthSegs, heightSegs) {
    const positions = [];
    const normals   = [];
    const uvs       = [];
    const indices   = [];

    for (let y = 0; y <= heightSegs; y++) {
        for (let x = 0; x <= widthSegs; x++) {
            const u = x / widthSegs;
            const v = y / heightSegs;
            const theta = u * Math.PI * 2;
            const phi   = v * Math.PI;

            const px = -radius * Math.cos(theta) * Math.sin(phi);
            const py =  radius * Math.cos(phi);
            const pz =  radius * Math.sin(theta) * Math.sin(phi);

            const len = Math.sqrt(px*px + py*py + pz*pz) || 1;
            positions.push(px, py, pz);
            normals.push(px/len, py/len, pz/len);
            uvs.push(u, v);
        }
    }

    for (let y = 0; y < heightSegs; y++) {
        for (let x = 0; x < widthSegs; x++) {
            const a = y * (widthSegs + 1) + x;
            const b = a + widthSegs + 1;
            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        uvs:       new Float32Array(uvs),
        indices:   new Uint16Array(indices),
        triCount:  indices.length / 3,
    };
}

function generateCube(size) {
    const s = size / 2;
    // prettier-ignore
    const P = [
        // Front
        -s,-s, s,  s,-s, s,  s, s, s, -s, s, s,
        // Back
         s,-s,-s, -s,-s,-s, -s, s,-s,  s, s,-s,
        // Top
        -s, s, s,  s, s, s,  s, s,-s, -s, s,-s,
        // Bottom
        -s,-s,-s,  s,-s,-s,  s,-s, s, -s,-s, s,
        // Right
         s,-s, s,  s,-s,-s,  s, s,-s,  s, s, s,
        // Left
        -s,-s,-s, -s,-s, s, -s, s, s, -s, s,-s,
    ];
    // prettier-ignore
    const N = [
        0,0,1, 0,0,1, 0,0,1, 0,0,1,
        0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
        0,1,0, 0,1,0, 0,1,0, 0,1,0,
        0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
        1,0,0, 1,0,0, 1,0,0, 1,0,0,
        -1,0,0, -1,0,0, -1,0,0, -1,0,0,
    ];
    // prettier-ignore
    const U = [
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
        0,0, 1,0, 1,1, 0,1,
    ];
    const I = [];
    for (let f = 0; f < 6; f++) {
        const o = f * 4;
        I.push(o, o+1, o+2, o, o+2, o+3);
    }
    return {
        positions: new Float32Array(P),
        normals:   new Float32Array(N),
        uvs:       new Float32Array(U),
        indices:   new Uint16Array(I),
        triCount:  I.length / 3,
    };
}

function generateTrefoilKnot(radius, tube, tubularSegments, radialSegments) {
    const positions = [];
    const normals   = [];
    const uvs       = [];
    const indices   = [];

    function knotPoint(t) {
        t *= Math.PI * 2;
        const x = Math.sin(t) + 2 * Math.sin(2*t);
        const y = Math.cos(t) - 2 * Math.cos(2*t);
        const z = -Math.sin(3*t);
        return [x * radius, y * radius, z * radius];
    }

    for (let j = 0; j <= radialSegments; j++) {
        for (let i = 0; i <= tubularSegments; i++) {
            const u = i / tubularSegments;
            const v = j / radialSegments * Math.PI * 2;

            const p  = knotPoint(u);
            const p1 = knotPoint(u + 0.001);

            // Tangent
            const T = [p1[0]-p[0], p1[1]-p[1], p1[2]-p[2]];
            const tLen = Math.sqrt(T[0]*T[0]+T[1]*T[1]+T[2]*T[2]) || 1;
            T[0]/=tLen; T[1]/=tLen; T[2]/=tLen;

            // Normal basis
            let N0 = [0,1,0];
            if (Math.abs(T[1]) > 0.99) N0 = [1,0,0];
            // B = T x N0
            const B = [T[1]*N0[2]-T[2]*N0[1], T[2]*N0[0]-T[0]*N0[2], T[0]*N0[1]-T[1]*N0[0]];
            const bLen = Math.sqrt(B[0]*B[0]+B[1]*B[1]+B[2]*B[2]) || 1;
            B[0]/=bLen; B[1]/=bLen; B[2]/=bLen;
            // N = B x T
            const Nv = [B[1]*T[2]-B[2]*T[1], B[2]*T[0]-B[0]*T[2], B[0]*T[1]-B[1]*T[0]];

            const cx = Math.cos(v);
            const sx = Math.sin(v);

            const nx = cx * Nv[0] + sx * B[0];
            const ny = cx * Nv[1] + sx * B[1];
            const nz = cx * Nv[2] + sx * B[2];

            positions.push(p[0]+tube*nx, p[1]+tube*ny, p[2]+tube*nz);
            normals.push(nx, ny, nz);
            uvs.push(u, j / radialSegments);
        }
    }

    for (let j = 0; j < radialSegments; j++) {
        for (let i = 0; i < tubularSegments; i++) {
            const a = j * (tubularSegments + 1) + i;
            const b = a + tubularSegments + 1;
            indices.push(a, b, a+1);
            indices.push(b, b+1, a+1);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        uvs:       new Float32Array(uvs),
        indices:   new Uint16Array(indices),
        triCount:  indices.length / 3,
    };
}

/* ================================================================== */
/*  PROCEDURAL TEXTURE GENERATOR                                       */
/* ================================================================== */

function generateCheckerTexture(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Gradient base
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size*0.5);
    grad.addColorStop(0, '#ff6b35');
    grad.addColorStop(0.35, '#d63384');
    grad.addColorStop(0.65, '#6f42c1');
    grad.addColorStop(1, '#0d6efd');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Checker overlay
    ctx.globalCompositeOperation = 'multiply';
    const cells = 8;
    const cs = size / cells;
    for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(60,60,80,0.85)';
            ctx.fillRect(c * cs, r * cs, cs, cs);
        }
    }

    // Rings
    ctx.globalCompositeOperation = 'screen';
    for (let i = 1; i <= 6; i++) {
        ctx.beginPath();
        ctx.arc(size/2, size/2, i * size * 0.07, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `hsla(${i*50}, 80%, 70%, 0.4)`;
        ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
    return ctx.getImageData(0, 0, size, size);
}

/* ================================================================== */
/*  PROCEDURAL SHADER (mini VIB3 fragment shader for procedural layer)  */
/* ================================================================== */

const PROC_VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
    float x = float((gl_VertexID & 1) << 2) - 1.0;
    float y = float((gl_VertexID & 2) << 1) - 1.0;
    v_uv = vec2(x, y) * 0.5 + 0.5;
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

const PROC_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform float u_time;
uniform float u_geometry;
uniform vec2  u_resolution;
out vec4 outColor;

mat4 rotXW(float a){float c=cos(a),s=sin(a);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rotYW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rotZW(float a){float c=cos(a),s=sin(a);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
    vec2 uv = (v_uv * 2.0 - 1.0) * vec2(u_resolution.x / u_resolution.y, 1.0);
    float t = u_time * 0.3;

    vec4 p = rotXW(t * 0.4) * rotYW(t * 0.3) * rotZW(t * 0.2) * vec4(uv, 0.0, 0.0);
    vec3 pos = p.xyz / (2.0 - p.w);

    float base = mod(u_geometry, 8.0);
    float pattern = 0.0;

    if (base < 0.5) {
        pattern = abs(sin(pos.x * 6.0 + t) * sin(pos.y * 6.0 - t));
    } else if (base < 1.5) {
        vec3 q = fract(pos * 4.0) - 0.5;
        pattern = 1.0 - smoothstep(0.2, 0.3, length(max(abs(q) - 0.2, 0.0)));
    } else if (base < 2.5) {
        pattern = 1.0 - smoothstep(0.3, 0.5, length(pos));
        pattern *= abs(sin(atan(pos.y, pos.x) * 5.0 + t * 2.0));
    } else if (base < 3.5) {
        float r = length(pos.xy);
        pattern = abs(sin((r - 0.35) * 30.0 + t * 2.0)) * smoothstep(0.5, 0.3, abs(r - 0.35));
    } else if (base < 4.5) {
        float a = atan(pos.y, pos.x) + t;
        pattern = abs(sin(a * 3.0 + pos.x * 5.0));
    } else if (base < 5.5) {
        vec2 q = pos.xy * 3.0;
        for (int i = 0; i < 4; i++) {
            q = abs(q) - 1.0;
            q *= 1.5;
        }
        pattern = 1.0 - smoothstep(0.0, 0.2, length(q) * 0.1);
    } else if (base < 6.5) {
        pattern = sin(pos.x * 10.0 + t) * sin(pos.y * 10.0 + t * 0.7);
        pattern = pattern * 0.5 + 0.5;
    } else {
        vec2 q = abs(fract(pos.xy * 4.0) - 0.5);
        pattern = 1.0 - smoothstep(0.0, 0.05, min(q.x, q.y));
    }

    if (u_geometry >= 8.0 && u_geometry < 16.0) {
        pattern *= smoothstep(0.6, 0.3, length(pos));
    } else if (u_geometry >= 16.0) {
        pattern *= smoothstep(0.5, 0.2, abs(max(abs(pos.x + pos.y) - pos.x, abs(pos.x - pos.y) + pos.x) * 0.5));
    }

    vec3 col = vec3(0.2, 0.5, 1.0) * pattern + vec3(0.8, 0.2, 0.5) * (1.0 - pattern) * 0.3;
    col *= pattern;

    outColor = vec4(col, pattern * 0.7);
}
`;

/* ================================================================== */
/*  CAMERA (inline minimal orbit camera)                               */
/* ================================================================== */

function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    return o;
}

function mat4Perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov * 0.5);
    const ri = 1 / (near - far);
    return new Float32Array([
        f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*ri,-1, 0,0,2*far*near*ri,0
    ]);
}

function mat4LookAt(eye, target, up) {
    let zx=eye[0]-target[0], zy=eye[1]-target[1], zz=eye[2]-target[2];
    let l=Math.hypot(zx,zy,zz)||1; zx/=l;zy/=l;zz/=l;
    let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l;xy/=l;xz/=l;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    return new Float32Array([
        xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
        -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
        -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
        -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1
    ]);
}

const IDENTITY = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

class OrbitCamera {
    constructor(canvas) {
        this.distance = 5;
        this.azimuth = 0.5;
        this.elevation = 0.35;
        this.fov = Math.PI / 4;
        this.near = 0.1;
        this.far = 100;
        this.target = [0, 0, 0];
        this.canvas = canvas;
        this._dragging = false;
        this._lastX = 0;
        this._lastY = 0;

        canvas.addEventListener('pointerdown', (e) => {
            this._dragging = true;
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!this._dragging) return;
            this.azimuth += (e.clientX - this._lastX) * 0.005;
            this.elevation += (e.clientY - this._lastY) * 0.005;
            this.elevation = Math.max(-1.5, Math.min(1.5, this.elevation));
            this._lastX = e.clientX;
            this._lastY = e.clientY;
        });
        canvas.addEventListener('pointerup', () => { this._dragging = false; });
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.distance *= 1 + e.deltaY * 0.001;
            this.distance = Math.max(1, Math.min(30, this.distance));
        }, { passive: false });
    }

    get isDragging() { return this._dragging; }

    get eye() {
        const ce = Math.cos(this.elevation), se = Math.sin(this.elevation);
        const ca = Math.cos(this.azimuth), sa = Math.sin(this.azimuth);
        return [
            this.target[0] + this.distance * ce * sa,
            this.target[1] + this.distance * se,
            this.target[2] + this.distance * ce * ca,
        ];
    }

    get aspect() { return this.canvas.width / this.canvas.height; }

    get viewMatrix() {
        return mat4LookAt(this.eye, this.target, [0,1,0]);
    }

    get projectionMatrix() {
        return mat4Perspective(this.fov, this.aspect, this.near, this.far);
    }

    get viewProjection() {
        return mat4Multiply(this.projectionMatrix, this.viewMatrix);
    }
}

/* ================================================================== */
/*  SETUP                                                              */
/* ================================================================== */

const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;

const gl = canvas.getContext('webgl2', {
    depth: true,
    antialias: false,
    preserveDrawingBuffer: false,
});
if (!gl) {
    document.body.innerHTML = '<h2 style="color:white;text-align:center;margin-top:40vh">WebGL2 required</h2>';
    throw new Error('WebGL2 required');
}

// Check for MRT support (required for GBuffer)
const drawBuffersSupport = gl.getExtension('EXT_color_buffer_half_float');

const camera = new OrbitCamera(canvas);

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
});

/* ================================================================== */
/*  INIT RENDERERS                                                     */
/* ================================================================== */

const meshRenderer = new MeshRenderer(gl, {
    lightDir: [0.5, 0.8, 0.3],
    lightColor: [1.0, 0.98, 0.95],
    ambientColor: [0.15, 0.15, 0.22],
    specularPower: 48,
});

const splatRenderer = new GaussianSplatRenderer(gl, {
    pointScale: canvas.height / (2 * Math.tan(Math.PI / 8)),
    blendMode: 'additive',
    animate: true,
    intensity: 1.0,
    chromatic: 0.4,
});

const edgeInscription = new EdgeInscriptionLayer(gl, {
    layerCount: 4,
    geometry: 3,
    thickness: 0.6,
    patternScale: 3.0,
    patternSpeed: 0.3,
    depthSensitivity: 8.0,
    normalSensitivity: 2.0,
    opacity: 0.8,
});

const pipeline = new HybridRenderPipeline(gl, {
    exposure: 1.2,
    gamma: 2.2,
});

pipeline.setMeshRenderer(meshRenderer);
pipeline.setSplatRenderer(splatRenderer);
pipeline.setEdgeInscription(edgeInscription);
pipeline.setDPR(devicePixelRatio);

/* ================================================================== */
/*  v2: SCENE RENDERER + INSCRIPTION CHANNEL                          */
/* ================================================================== */

const sceneRenderer = new SceneRenderer(gl, {
    lightDir: [0.5, 0.8, 0.3],
    lightColor: [1.0, 0.98, 0.95],
    ambientColor: [0.15, 0.15, 0.22],
});

const inscriptionChannel = new InscriptionChannel({
    layerCount: 4,
    transitionDuration: 0.5,
});

// Register default object
inscriptionChannel.registerObject(1, 'active');
pipeline.setInscriptionChannel(inscriptionChannel);

let useMultiScene = false;
let audioSimLevel = 0;
let morphWeight = 0;

// Procedural shader program (for Layer 2)
let procProgram = null;
let procQuadVao = null;
let procGeometry = 3;

function initProceduralShader() {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, PROC_VERT);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.warn('Proc vertex shader error:', gl.getShaderInfoLog(vs));
        return;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, PROC_FRAG);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.warn('Proc fragment shader error:', gl.getShaderInfoLog(fs));
        return;
    }

    procProgram = gl.createProgram();
    gl.attachShader(procProgram, vs);
    gl.attachShader(procProgram, fs);
    gl.linkProgram(procProgram);
    if (!gl.getProgramParameter(procProgram, gl.LINK_STATUS)) {
        console.warn('Proc program link error:', gl.getProgramInfoLog(procProgram));
        procProgram = null;
        return;
    }

    procQuadVao = gl.createVertexArray();
}
initProceduralShader();

pipeline.setProceduralRenderer((fbo, time) => {
    if (!procProgram) return;
    gl.useProgram(procProgram);
    gl.bindVertexArray(procQuadVao);
    gl.uniform1f(gl.getUniformLocation(procProgram, 'u_time'), time);
    gl.uniform1f(gl.getUniformLocation(procProgram, 'u_geometry'), procGeometry);
    gl.uniform2f(gl.getUniformLocation(procProgram, 'u_resolution'), fbo.width, fbo.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
});

/* ================================================================== */
/*  MESH + TEXTURE SETUP                                               */
/* ================================================================== */

const MESHES = {
    torus:  () => generateTorus(1.0, 0.4, 64, 32),
    sphere: () => generateSphere(1.2, 48, 32),
    cube:   () => generateCube(1.8),
    knot:   () => generateTrefoilKnot(0.35, 0.12, 128, 24),
};

let currentMeshKey = 'torus';
let currentMesh = null;
let textureSplats = [];

const textureConverter = new TextureToSplatConverter();
textureConverter.samplesPerTriangle = 6;
textureConverter.baseScale = 0.03;
textureConverter.edgeBoostFactor = 3;

const textureData = generateCheckerTexture(256);

function loadMesh(key) {
    currentMeshKey = key;
    const gen = MESHES[key];
    if (!gen) return;

    currentMesh = gen();
    meshRenderer.uploadGeometry(currentMesh);

    // Generate morph target (scaled/deformed version for animation demo)
    const morphPositions = new Float32Array(currentMesh.positions.length);
    const morphNormals = new Float32Array(currentMesh.normals.length);
    for (let i = 0; i < currentMesh.positions.length; i += 3) {
        const x = currentMesh.positions[i];
        const y = currentMesh.positions[i+1];
        const z = currentMesh.positions[i+2];
        const r = Math.sqrt(x*x + y*y + z*z) || 1;
        // Spiky deformation: push vertices outward by a sin-based pattern
        const spike = 1.0 + 0.3 * Math.sin(x * 8) * Math.sin(y * 8) * Math.sin(z * 8);
        morphPositions[i]   = x * spike;
        morphPositions[i+1] = y * spike;
        morphPositions[i+2] = z * spike;
        // Recalculate normals (approximate)
        morphNormals[i]   = currentMesh.normals[i] * spike;
        morphNormals[i+1] = currentMesh.normals[i+1] * spike;
        morphNormals[i+2] = currentMesh.normals[i+2] * spike;
    }
    if (meshRenderer.uploadMorphTarget) {
        meshRenderer.uploadMorphTarget(morphPositions, morphNormals);
    }

    // Upload procedural texture
    meshRenderer.uploadTexture(textureData);

    // Convert texture to splats on mesh surface
    textureSplats = textureConverter.convert({
        positions: currentMesh.positions,
        normals: currentMesh.normals,
        uvs: currentMesh.uvs,
        indices: currentMesh.indices,
        diffusePixels: textureData.data,
        diffuseWidth: textureData.width,
        diffuseHeight: textureData.height,
    });

    const encoded = encodeGaussianSeeds(textureSplats);
    splatRenderer.updateSeeds(encoded, textureSplats.length);

    // Update UI
    document.getElementById('meshTris').textContent = currentMesh.triCount.toLocaleString();
    document.getElementById('splatCount').textContent = textureSplats.length.toLocaleString();
    document.querySelectorAll('.mesh-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mesh === key);
    });
}

/* ================================================================== */
/*  MULTI-OBJECT SCENE SETUP                                           */
/* ================================================================== */

function setupMultiScene() {
    // Clear previous scene objects
    sceneRenderer.dispose();

    // Add 3 objects at different positions
    const torusGeo = generateTorus(0.7, 0.25, 48, 24);
    const sphereGeo = generateSphere(0.6, 32, 24);
    const cubeGeo = generateCube(0.9);

    const obj1 = sceneRenderer.addObject('torus', torusGeo);
    const obj2 = sceneRenderer.addObject('sphere', sphereGeo);
    const obj3 = sceneRenderer.addObject('cube', cubeGeo);

    // Position objects in a triangle arrangement
    obj1.setTransform(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, -1.8,0,0,1]));
    obj2.setTransform(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 1.8,0,0,1]));
    obj3.setTransform(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,1.5,0,1]));

    // Register each object with inscription channel at different states
    inscriptionChannel.registerObject(obj1.id, 'active');
    inscriptionChannel.registerObject(obj2.id, 'powered');
    inscriptionChannel.registerObject(obj3.id, 'selected');

    document.getElementById('sceneObjects').textContent = '3';
}

function teardownMultiScene() {
    sceneRenderer.dispose();
    document.getElementById('sceneObjects').textContent = '1';
}

/* ================================================================== */
/*  TAB MANAGEMENT                                                     */
/* ================================================================== */

let currentTab = 'hybrid';

const TAB_CONFIGS = {
    'hybrid': {
        mesh: true, splat: true, procedural: true, inscription: true,
        label: 'Hybrid', multiScene: false,
    },
    'mesh-inscribe': {
        mesh: true, splat: false, procedural: false, inscription: true,
        label: 'Mesh+Insc', multiScene: false,
    },
    'mesh-splat': {
        mesh: true, splat: true, procedural: false, inscription: false,
        label: 'Mesh+Splat', multiScene: false,
    },
    'splat-proc': {
        mesh: false, splat: true, procedural: true, inscription: false,
        label: 'Splat+Proc', multiScene: false,
    },
    'multi-scene': {
        mesh: true, splat: false, procedural: false, inscription: true,
        label: 'MultiObj', multiScene: true,
    },
    'benchmark': {
        mesh: true, splat: true, procedural: true, inscription: true,
        label: 'Benchmark', multiScene: false,
    },
};

function switchTab(tab) {
    currentTab = tab;
    const cfg = TAB_CONFIGS[tab];
    if (!cfg) return;

    pipeline.meshLayer.enabled = cfg.mesh;
    pipeline.splatLayer.enabled = cfg.splat;
    pipeline.proceduralLayer.enabled = cfg.procedural;
    pipeline.inscriptionLayer.enabled = cfg.inscription;

    // Handle multi-object scene mode
    if (cfg.multiScene && !useMultiScene) {
        useMultiScene = true;
        setupMultiScene();
        pipeline.setSceneRenderer(sceneRenderer);
        pipeline.setMeshRenderer(null);
    } else if (!cfg.multiScene && useMultiScene) {
        useMultiScene = false;
        teardownMultiScene();
        pipeline.setSceneRenderer(null);
        pipeline.setMeshRenderer(meshRenderer);
    }

    // Update toggle checkboxes to match
    document.getElementById('toggleMesh').checked = cfg.mesh;
    document.getElementById('toggleSplat').checked = cfg.splat;
    document.getElementById('toggleProcedural').checked = cfg.procedural;
    document.getElementById('toggleInscription').checked = cfg.inscription;

    document.getElementById('compositorMode').textContent = cfg.label;

    // Show/hide benchmark panel
    document.getElementById('benchmarkPanel').classList.toggle('hidden', tab !== 'benchmark');

    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
}

/* ================================================================== */
/*  CONTROLS WIRING                                                    */
/* ================================================================== */

// Tab buttons
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Mesh buttons
document.querySelectorAll('.mesh-btn').forEach(btn => {
    btn.addEventListener('click', () => loadMesh(btn.dataset.mesh));
});

// Controls toggle
const controlsToggle = document.getElementById('controlsToggle');
const controlsPanel = document.getElementById('controls');
controlsToggle.addEventListener('click', () => {
    const c = controlsPanel.classList.toggle('collapsed');
    controlsToggle.classList.toggle('active', !c);
});

// Layer toggles
document.getElementById('toggleMesh').addEventListener('change', (e) => {
    pipeline.meshLayer.enabled = e.target.checked;
});
document.getElementById('toggleSplat').addEventListener('change', (e) => {
    pipeline.splatLayer.enabled = e.target.checked;
});
document.getElementById('toggleProcedural').addEventListener('change', (e) => {
    pipeline.proceduralLayer.enabled = e.target.checked;
});
document.getElementById('toggleInscription').addEventListener('change', (e) => {
    pipeline.inscriptionLayer.enabled = e.target.checked;
});

// Opacity sliders
function wireSlider(sliderId, valId, callback) {
    const slider = document.getElementById(sliderId);
    const val = document.getElementById(valId);
    slider.addEventListener('input', () => {
        const v = slider.value / 100;
        val.textContent = v.toFixed(2);
        callback(v);
    });
}

wireSlider('sliderMeshOpacity', 'valMeshOpacity', v => pipeline.meshLayer.opacity = v);
wireSlider('sliderSplatOpacity', 'valSplatOpacity', v => pipeline.splatLayer.opacity = v);
wireSlider('sliderProcOpacity', 'valProcOpacity', v => pipeline.proceduralLayer.opacity = v);
wireSlider('sliderInscOpacity', 'valInscOpacity', v => pipeline.inscriptionLayer.opacity = v);

// Blend mode selects
document.getElementById('selectMeshBlend').addEventListener('change', (e) => {
    pipeline.meshLayer.blendMode = parseInt(e.target.value);
});
document.getElementById('selectSplatBlend').addEventListener('change', (e) => {
    pipeline.splatLayer.blendMode = parseInt(e.target.value);
});
document.getElementById('selectProcBlend').addEventListener('change', (e) => {
    pipeline.proceduralLayer.blendMode = parseInt(e.target.value);
});

// Inscription controls
const sliderThickness = document.getElementById('sliderThickness');
const valThickness = document.getElementById('valThickness');
sliderThickness.addEventListener('input', () => {
    const v = sliderThickness.value / 100;
    valThickness.textContent = v.toFixed(2);
    edgeInscription.thickness = v;
});

const sliderPattern = document.getElementById('sliderPattern');
const valPattern = document.getElementById('valPattern');
sliderPattern.addEventListener('input', () => {
    valPattern.textContent = sliderPattern.value;
    edgeInscription.geometry = parseInt(sliderPattern.value);
});

const sliderLayerCount = document.getElementById('sliderLayerCount');
const valLayerCount = document.getElementById('valLayerCount');
sliderLayerCount.addEventListener('input', () => {
    valLayerCount.textContent = sliderLayerCount.value;
    edgeInscription.layerCount = parseInt(sliderLayerCount.value);
    document.getElementById('inscLayers').textContent = sliderLayerCount.value;
});

// Geometry slider (procedural layer)
const sliderGeometry = document.getElementById('sliderGeometry');
const valGeometry = document.getElementById('valGeometry');
sliderGeometry.addEventListener('input', () => {
    valGeometry.textContent = sliderGeometry.value;
    procGeometry = parseInt(sliderGeometry.value);
});

// Exposure
const sliderExposure = document.getElementById('sliderExposure');
const valExposure = document.getElementById('valExposure');
sliderExposure.addEventListener('input', () => {
    const v = sliderExposure.value / 100;
    valExposure.textContent = v.toFixed(2);
    pipeline.exposure = v;
});

// 4D rotation sliders
function wire4D(sliderId, valId, prop) {
    const slider = document.getElementById(sliderId);
    const val = document.getElementById(valId);
    slider.addEventListener('input', () => {
        const v = slider.value / 100;
        val.textContent = v.toFixed(2);
        edgeInscription[prop] = v;
    });
}
wire4D('slider4DXW', 'val4DXW', 'rot4dXW');
wire4D('slider4DYW', 'val4DYW', 'rot4dYW');
wire4D('slider4DZW', 'val4DZW', 'rot4dZW');

// v2: Semantic state selector
document.getElementById('selectState').addEventListener('change', (e) => {
    const state = e.target.value;
    inscriptionChannel.setObjectState(1, state);
    document.getElementById('currentState').textContent = state;
});

// v2: Morph weight slider
wireSlider('sliderMorph', 'valMorph', v => {
    morphWeight = v;
    meshRenderer.morphWeight = v;
});

// v2: Audio simulation slider
wireSlider('sliderAudioSim', 'valAudioSim', v => {
    audioSimLevel = v;
});

// Splat source selector
document.getElementById('selectSplatSource').addEventListener('change', (e) => {
    const src = e.target.value;
    if (src === 'texture') {
        // Regenerate from mesh texture
        loadMesh(currentMeshKey);
    } else if (src === 'galaxy') {
        // Generate galaxy splats
        const seeds = [];
        for (let i = 0; i < 200000; i++) {
            const t = Math.random() * Math.PI * 2;
            const r = Math.pow(Math.random(), 0.5) * 3;
            const arm = Math.floor(Math.random() * 3) * (Math.PI * 2 / 3);
            const spiral = t * 0.5;
            seeds.push({
                position: [
                    r * Math.cos(t + arm + spiral) + (Math.random()-0.5)*0.3,
                    (Math.random()-0.5) * 0.2 * (1-r/3),
                    r * Math.sin(t + arm + spiral) + (Math.random()-0.5)*0.3,
                ],
                orientation: [1,0,0,0],
                scale: 0.015 + Math.random() * 0.02,
                color: [0.6+Math.random()*0.4, 0.4+Math.random()*0.4, 0.8+Math.random()*0.2],
                depth: r * 0.3,
            });
        }
        const enc = encodeGaussianSeeds(seeds);
        splatRenderer.updateSeeds(enc, seeds.length);
        document.getElementById('splatCount').textContent = seeds.length.toLocaleString();
    } else if (src === 'nebula') {
        const seeds = [];
        for (let i = 0; i < 150000; i++) {
            const r = Math.pow(Math.random(), 0.6) * 2;
            const theta = Math.random() * Math.PI * 2;
            const phi = (Math.random() - 0.5) * Math.PI;
            seeds.push({
                position: [
                    r * Math.cos(theta) * Math.cos(phi),
                    r * Math.sin(phi) * 0.6,
                    r * Math.sin(theta) * Math.cos(phi),
                ],
                orientation: [1,0,0,0],
                scale: 0.02 + Math.random() * 0.03,
                color: [0.8+Math.random()*0.2, 0.2+Math.random()*0.3, 0.5+Math.random()*0.5],
                depth: r * 0.2,
            });
        }
        const enc = encodeGaussianSeeds(seeds);
        splatRenderer.updateSeeds(enc, seeds.length);
        document.getElementById('splatCount').textContent = seeds.length.toLocaleString();
    }
});

/* ================================================================== */
/*  BENCHMARK                                                          */
/* ================================================================== */

async function runBenchmark() {
    const btn = document.getElementById('runBenchmark');
    const results = document.getElementById('benchResults');
    btn.disabled = true;
    btn.textContent = 'Running...';
    results.innerHTML = '';

    const configs = [
        { name: 'Mesh Only',       mesh: true,  splat: false, proc: false, insc: false },
        { name: 'Splat Only',      mesh: false, splat: true,  proc: false, insc: false },
        { name: 'Procedural Only', mesh: false, splat: false, proc: true,  insc: false },
        { name: 'Mesh + Insc.',    mesh: true,  splat: false, proc: false, insc: true  },
        { name: 'Mesh + Splat',    mesh: true,  splat: true,  proc: false, insc: false },
        { name: 'Full Hybrid',     mesh: true,  splat: true,  proc: true,  insc: true  },
    ];

    const FRAMES = 60;
    const benchResults = [];

    for (const cfg of configs) {
        pipeline.meshLayer.enabled = cfg.mesh;
        pipeline.splatLayer.enabled = cfg.splat;
        pipeline.proceduralLayer.enabled = cfg.proc;
        pipeline.inscriptionLayer.enabled = cfg.insc;

        // Warm up
        for (let i = 0; i < 5; i++) {
            const t = performance.now() * 0.001;
            pipeline.render(t, camera.viewMatrix, camera.projectionMatrix, {
                viewProjection: camera.viewProjection,
            });
        }
        gl.finish();

        // Timed frames
        const start = performance.now();
        for (let i = 0; i < FRAMES; i++) {
            const t = performance.now() * 0.001;
            pipeline.render(t, camera.viewMatrix, camera.projectionMatrix, {
                viewProjection: camera.viewProjection,
            });
        }
        gl.finish();
        const elapsed = performance.now() - start;

        const avgMs = elapsed / FRAMES;
        const fps = 1000 / avgMs;
        benchResults.push({ name: cfg.name, avgMs, fps });

        // Yield to UI
        await new Promise(r => setTimeout(r, 10));
    }

    // Restore current tab config
    switchTab(currentTab);

    // Display results
    const maxMs = Math.max(...benchResults.map(r => r.avgMs));

    let html = '<div class="bench-row bench-header"><span>Configuration</span><span>ms/frame</span><span>FPS</span></div>';
    for (const r of benchResults) {
        const barW = Math.round((r.avgMs / maxMs) * 100);
        const isTotal = r.name === 'Full Hybrid';
        html += `
            <div class="bench-row ${isTotal ? 'bench-total' : ''}">
                <span class="bench-label">${r.name}</span>
                <span class="bench-value">${r.avgMs.toFixed(2)}</span>
                <span class="bench-value">${Math.round(r.fps)}</span>
            </div>
            <div class="bench-bar" style="width:${barW}%;${isTotal?'background:rgba(200,100,255,0.5)':''}"></div>
        `;
    }
    results.innerHTML = html;
    btn.disabled = false;
    btn.textContent = 'Run Benchmark';
}

document.getElementById('runBenchmark').addEventListener('click', runBenchmark);

/* ================================================================== */
/*  STATS TRACKING                                                     */
/* ================================================================== */

let frameCount = 0;
let lastFpsTime = performance.now();
let displayFps = 0;

const elFps = document.getElementById('fps');
const elFrameTime = document.getElementById('frameTime');
const elActiveLayers = document.getElementById('activeLayers');

function updateStats(frameStart, stats) {
    frameCount++;
    const now = performance.now();

    if (now - lastFpsTime > 500) {
        displayFps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        elFps.textContent = displayFps;
        elFrameTime.textContent = (now - frameStart).toFixed(1) + ' ms';
        frameCount = 0;
        lastFpsTime = now;
    }

    if (stats) {
        elActiveLayers.textContent = stats.layersComposited;
    }
}

/* ================================================================== */
/*  RENDER LOOP                                                        */
/* ================================================================== */

let autoOrbit = true;
let startTime = performance.now();

canvas.addEventListener('pointerdown', () => { autoOrbit = false; });
canvas.addEventListener('pointerup', () => {
    setTimeout(() => { autoOrbit = true; }, 3000);
});

let lastTime = 0;

function tick() {
    const frameStart = performance.now();
    const time = (performance.now() - startTime) * 0.001;
    const deltaTime = time - lastTime;
    lastTime = time;

    if (autoOrbit && !camera.isDragging) {
        camera.azimuth += 0.003;
    }

    // Auto-animate 4D rotation for inscription
    edgeInscription.rot4dXY = time * 0.1;
    edgeInscription.rot4dYZ = time * 0.07;

    // v2: Update inscription channel transitions
    inscriptionChannel.update(deltaTime);

    // v2: Simulated audio reactivity
    if (audioSimLevel > 0) {
        const bass = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 2.1));
        const mid  = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 3.7));
        const high = audioSimLevel * (0.5 + 0.5 * Math.sin(time * 5.3));
        const energy = audioSimLevel * (0.6 + 0.4 * Math.sin(time * 1.3));
        inscriptionChannel.setAudio(bass, mid, high, energy);
        edgeInscription.setAudio(bass, mid, high, energy);
    }

    const stats = pipeline.render(time, camera.viewMatrix, camera.projectionMatrix, {
        viewProjection: camera.viewProjection,
    });

    updateStats(frameStart, stats);
    requestAnimationFrame(tick);
}

/* ================================================================== */
/*  BOOT                                                               */
/* ================================================================== */

loadMesh('torus');
switchTab('hybrid');
tick();
