/**
 * VIB3+ Camera Fractal Cube — Slinky Vortex Demo
 *
 * Live camera feed textured onto a cube that tumbles like a slinky/dice
 * (one face at a time). Each tumble leaves a clone. Clones spiral outward
 * in a helix, growing larger toward the edges — creating a vortex effect.
 */

// ─── GL Boilerplate ──────────────────────────────────────────────────────────

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) { alert('WebGL 2 not supported'); throw new Error('no webgl2'); }

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width  = innerWidth  * dpr;
  canvas.height = innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
addEventListener('resize', resize);
resize();

// ─── Shader Sources ──────────────────────────────────────────────────────────

const VERT = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;

uniform mat4 u_proj;
uniform mat4 u_view;
uniform mat4 u_model;

out vec3 v_normal;
out vec2 v_uv;
out vec3 v_worldPos;
out float v_depth;

void main() {
  vec4 world = u_model * vec4(a_pos, 1.0);
  v_worldPos = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_uv = a_uv;
  vec4 clip = u_proj * u_view * world;
  v_depth = clip.z / clip.w;
  gl_Position = clip;
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_uv;
in vec3 v_worldPos;
in float v_depth;

uniform sampler2D u_camTex;
uniform float u_time;
uniform float u_alpha;
uniform float u_ghostFade;   // 0 = lead cube, 1 = oldest clone
uniform float u_cubeIndex;   // index in the spiral
uniform float u_totalCubes;  // total clones

out vec4 fragColor;

// chromatic aberration on the camera feed
vec4 sampleCam(vec2 uv, float spread) {
  float r = texture(u_camTex, uv + vec2(spread, 0.0)).r;
  float g = texture(u_camTex, uv).g;
  float b = texture(u_camTex, uv - vec2(spread, 0.0)).b;
  return vec4(r, g, b, 1.0);
}

void main() {
  vec3 N = normalize(v_normal);
  float facing = abs(dot(N, vec3(0.0, 0.0, 1.0)));

  // Tile the UV to create a fract pattern across each face
  float tiles = 3.0;
  vec2 tiled = fract(v_uv * tiles);

  // slight angle offset per tile for the "repeating angled" look
  float tileId = floor(v_uv.x * tiles) + floor(v_uv.y * tiles) * tiles;
  float ang = tileId * 0.15 + u_time * 0.1;
  float ca = cos(ang), sa = sin(ang);
  vec2 centered = tiled - 0.5;
  vec2 rotUV = vec2(ca * centered.x - sa * centered.y,
                     sa * centered.x + ca * centered.y) + 0.5;
  rotUV = clamp(rotUV, 0.01, 0.99);

  // mirror X for selfie-style
  rotUV.x = 1.0 - rotUV.x;

  float aberr = 0.003 + 0.002 * sin(u_time + u_cubeIndex * 0.5);
  vec4 cam = sampleCam(rotUV, aberr);

  // Subtle edge glow on each tile
  vec2 edgeDist = smoothstep(vec2(0.0), vec2(0.04), tiled)
                * smoothstep(vec2(0.0), vec2(0.04), 1.0 - tiled);
  float edgeMask = edgeDist.x * edgeDist.y;

  // Lighting: soft directional + ambient
  float diff = max(dot(N, normalize(vec3(0.5, 1.0, 0.8))), 0.0);
  float light = 0.35 + 0.65 * diff;

  // Ghost colour shift for clones
  float hueShift = u_cubeIndex * 0.12;
  vec3 col = cam.rgb * light;
  // Shift toward magenta/cyan for older clones
  col.r += hueShift * 0.15;
  col.b += hueShift * 0.2;

  // Edge wireframe glow
  float wire = 1.0 - edgeMask;
  vec3 wireCol = vec3(0.0, 1.0, 1.0) * wire * 0.3 * (1.0 - u_ghostFade * 0.7);

  col = col * edgeMask + wireCol;

  // Fade out older clones
  float alpha = u_alpha * (1.0 - u_ghostFade * 0.65);

  // Vignette on the cube based on depth
  float vig = smoothstep(0.98, 0.5, abs(v_depth));
  alpha *= mix(1.0, vig, 0.3);

  fragColor = vec4(col, alpha);
}
`;

// ─── Background Shader (vortex atmosphere) ───────────────────────────────────

const BG_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_time;
uniform vec2 u_res;
out vec4 fragColor;

void main() {
  vec2 uv = v_uv;
  vec2 center = vec2(0.5);
  float dist = length(uv - center);

  // Spiral pattern
  float angle = atan(uv.y - 0.5, uv.x - 0.5);
  float spiral = sin(angle * 3.0 - dist * 12.0 + u_time * 0.4) * 0.5 + 0.5;

  // Dark vortex
  float vortex = smoothstep(0.7, 0.0, dist);
  vec3 col = mix(
    vec3(0.02, 0.02, 0.06),
    vec3(0.06, 0.02, 0.1),
    spiral * 0.3
  );
  // Edge glow
  float edgeGlow = smoothstep(0.3, 0.8, dist) * 0.15;
  col += vec3(0.0, edgeGlow * 0.5, edgeGlow);

  // Vignette
  float vig = 1.0 - smoothstep(0.2, 0.85, dist);
  col *= 0.4 + vig * 0.6;

  fragColor = vec4(col, 1.0);
}
`;

// ─── Shader Compilation ──────────────────────────────────────────────────────

function compileShader(src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function linkProgram(vs, fs, attribs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  if (attribs) attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function getUniforms(prog, names) {
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return u;
}

// Cube program
const cubeVS = compileShader(VERT, gl.VERTEX_SHADER);
const cubeFS = compileShader(FRAG, gl.FRAGMENT_SHADER);
const cubeProg = linkProgram(cubeVS, cubeFS, ['a_pos', 'a_normal', 'a_uv']);
const cubeU = getUniforms(cubeProg, [
  'u_proj', 'u_view', 'u_model', 'u_camTex', 'u_time',
  'u_alpha', 'u_ghostFade', 'u_cubeIndex', 'u_totalCubes'
]);

// Background program
const bgVS = compileShader(BG_VERT, gl.VERTEX_SHADER);
const bgFS = compileShader(BG_FRAG, gl.FRAGMENT_SHADER);
const bgProg = linkProgram(bgVS, bgFS, ['a_pos']);
const bgU = getUniforms(bgProg, ['u_time', 'u_res']);

// ─── Geometry: Unit Cube ─────────────────────────────────────────────────────

function makeCube() {
  // Each face: 2 triangles, with positions, normals, UVs
  const faces = [
    // +Z front
    { n: [0,0,1], verts: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },
    // -Z back
    { n: [0,0,-1], verts: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]] },
    // +X right
    { n: [1,0,0], verts: [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]] },
    // -X left
    { n: [-1,0,0], verts: [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]] },
    // +Y top
    { n: [0,1,0], verts: [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]] },
    // -Y bottom
    { n: [0,-1,0], verts: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]] },
  ];
  const uvs = [[0,0],[1,0],[1,1],[0,1]];
  const idx = [0,1,2, 0,2,3];

  const pos = [], norm = [], uv = [], indices = [];
  let offset = 0;
  for (const f of faces) {
    for (let i = 0; i < 4; i++) {
      pos.push(...f.verts[i]);
      norm.push(...f.n);
      uv.push(...uvs[i]);
    }
    for (const i of idx) indices.push(i + offset);
    offset += 4;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norm), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

  const idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: indices.length };
}

// Fullscreen quad for background
function makeQuad() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

const cube = makeCube();
const quad = makeQuad();

// ─── Camera (webcam) Texture ─────────────────────────────────────────────────

let videoReady = false;
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

const camTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, camTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([80,80,80,255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    video.srcObject = stream;
    await video.play();
    videoReady = true;
  } catch (e) {
    console.warn('Camera not available, using procedural texture fallback', e);
    // Generate a procedural fallback texture
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const cx = x / size - 0.5, cy = y / size - 0.5;
        const d = Math.sqrt(cx*cx + cy*cy);
        const v = Math.sin(d * 30) * 0.5 + 0.5;
        data[i]   = (v * 180 + 60) | 0;
        data[i+1] = (v * 100 + 80) | 0;
        data[i+2] = (v * 200 + 55) | 0;
        data[i+3] = 255;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, camTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    videoReady = false; // won't try to upload frames
  }
}

function updateCamTexture() {
  if (!videoReady || video.readyState < 2) return;
  gl.bindTexture(gl.TEXTURE_2D, camTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
}

// ─── Matrix Math ─────────────────────────────────────────────────────────────

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f/aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far+near)*nf, -1,
    0, 0, 2*far*near*nf, 0
  ]);
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0]-target[0], zy = eye[1]-target[1], zz = eye[2]-target[2];
  let len = 1/Math.sqrt(zx*zx+zy*zy+zz*zz);
  const fz = [zx*len, zy*len, zz*len];
  const sx = up[1]*fz[2]-up[2]*fz[1], sy = up[2]*fz[0]-up[0]*fz[2], sz = up[0]*fz[1]-up[1]*fz[0];
  len = 1/Math.sqrt(sx*sx+sy*sy+sz*sz);
  const fx = [sx*len, sy*len, sz*len];
  const ux = [fz[1]*fx[2]-fz[2]*fx[1], fz[2]*fx[0]-fz[0]*fx[2], fz[0]*fx[1]-fz[1]*fx[0]];
  return new Float32Array([
    fx[0], ux[0], fz[0], 0,
    fx[1], ux[1], fz[1], 0,
    fx[2], ux[2], fz[2], 0,
    -(fx[0]*eye[0]+fx[1]*eye[1]+fx[2]*eye[2]),
    -(ux[0]*eye[0]+ux[1]*eye[1]+ux[2]*eye[2]),
    -(fz[0]*eye[0]+fz[1]*eye[1]+fz[2]*eye[2]),
    1
  ]);
}

function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4+j] * b[i*4+k];
      o[i*4+j] = s;
    }
  return o;
}

function mat4Translate(x, y, z) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function mat4Scale(s) {
  const m = mat4Identity();
  m[0] = s; m[5] = s; m[10] = s;
  return m;
}

function mat4RotX(a) {
  const c = Math.cos(a), s = Math.sin(a), m = mat4Identity();
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

function mat4RotY(a) {
  const c = Math.cos(a), s = Math.sin(a), m = mat4Identity();
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

function mat4RotZ(a) {
  const c = Math.cos(a), s = Math.sin(a), m = mat4Identity();
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

// ─── Slinky/Dice Tumble Animation ────────────────────────────────────────────
// The cube tumbles 90 degrees at a time around its bottom edge,
// simulating a die being pushed lightly, toppling face-over-face.

const HALF_PI = Math.PI / 2;

// Tumble direction: which axis to rotate around, and the edge offset
const TUMBLE_DIRS = [
  { axis: 'z', sign: -1, edge: [0, -1, 0], move: [2, 0, 0] },   // tumble right
  { axis: 'x', sign:  1, edge: [0, -1, 0], move: [0, 0, 2] },    // tumble forward
  { axis: 'z', sign:  1, edge: [0, -1, 0], move: [-2, 0, 0] },   // tumble left
  { axis: 'x', sign: -1, edge: [0, -1, 0], move: [0, 0, -2] },   // tumble backward
];

// Build a spiral path of tumble directions
// This creates a growing spiral: 1 right, 1 forward, 2 left, 2 back, 3 right, 3 forward...
function buildSpiralPath(count) {
  const path = [];
  let dirIdx = 0;
  let segLen = 1;
  let segCount = 0;
  let segPair = 0;
  for (let i = 0; i < count; i++) {
    path.push(dirIdx % 4);
    segCount++;
    if (segCount >= segLen) {
      segCount = 0;
      dirIdx++;
      segPair++;
      if (segPair >= 2) {
        segPair = 0;
        segLen++;
      }
    }
  }
  return path;
}

// ─── Clone State ─────────────────────────────────────────────────────────────

const MAX_CLONES = 80;
const TUMBLE_DURATION = 0.55; // seconds per tumble
const TUMBLE_PAUSE = 0.12;   // pause between tumbles

// Each clone stores its final world-space transform
const clones = []; // { modelMatrix, birthTime, spiralIndex }

// Lead cube state
const lead = {
  pos: [0, 0, 0],          // center position (world)
  baseRot: mat4Identity(),  // accumulated rotation from past tumbles
  tumbleProgress: 0,        // 0..1 progress of current tumble
  tumbleDir: 0,             // index into TUMBLE_DIRS
  spiralStep: 0,            // which step in spiral path
  paused: false,
  pauseTimer: 0,
};

const spiralPath = buildSpiralPath(MAX_CLONES + 20);

function getLeadModelMatrix(t) {
  // Current tumble direction
  const dir = TUMBLE_DIRS[spiralPath[lead.spiralStep] % 4];

  // Easing: smooth start, snappy finish (like a die toppling)
  const raw = lead.tumbleProgress;
  // Use a cubic ease that accelerates (gravity-like)
  const eased = raw < 0.5
    ? 2 * raw * raw
    : 1 - Math.pow(-2 * raw + 2, 2) / 2;

  const angle = eased * HALF_PI * dir.sign;

  // The pivot is at the bottom edge in the tumble direction
  const pivotX = lead.pos[0] + dir.move[0] * 0.5;
  const pivotY = lead.pos[1] + dir.edge[1]; // bottom of cube
  const pivotZ = lead.pos[2] + dir.move[2] * 0.5;

  // Build transform: translate to pivot, rotate, translate back
  const toPivot = mat4Translate(-pivotX, -pivotY, -pivotZ);
  const fromPivot = mat4Translate(pivotX, pivotY, pivotZ);

  let rot;
  if (dir.axis === 'x') rot = mat4RotX(angle);
  else if (dir.axis === 'z') rot = mat4RotZ(angle);
  else rot = mat4RotY(angle);

  // Compose: fromPivot * rot * toPivot * (translate to lead.pos) * baseRot
  const posM = mat4Translate(lead.pos[0], lead.pos[1], lead.pos[2]);
  let m = mat4Multiply(posM, lead.baseRot);
  m = mat4Multiply(toPivot, m);
  m = mat4Multiply(rot, m);
  m = mat4Multiply(fromPivot, m);

  return m;
}

function advanceTumble(dt) {
  if (lead.paused) {
    lead.pauseTimer -= dt;
    if (lead.pauseTimer <= 0) lead.paused = false;
    return;
  }

  lead.tumbleProgress += dt / TUMBLE_DURATION;

  if (lead.tumbleProgress >= 1.0) {
    // Complete the tumble: snapshot clone
    lead.tumbleProgress = 1.0;
    const cloneMatrix = getLeadModelMatrix(0);

    if (clones.length >= MAX_CLONES) clones.shift();
    clones.push({
      modelMatrix: cloneMatrix,
      birthTime: performance.now() / 1000,
      spiralIndex: lead.spiralStep,
    });

    // Apply the 90° rotation permanently
    const dir = TUMBLE_DIRS[spiralPath[lead.spiralStep] % 4];
    let permRot;
    const permAngle = HALF_PI * dir.sign;
    if (dir.axis === 'x') permRot = mat4RotX(permAngle);
    else if (dir.axis === 'z') permRot = mat4RotZ(permAngle);
    else permRot = mat4RotY(permAngle);

    lead.baseRot = mat4Multiply(permRot, lead.baseRot);
    lead.pos[0] += dir.move[0];
    lead.pos[1] += 0; // stays on ground plane
    lead.pos[2] += dir.move[2];

    // Next step
    lead.spiralStep++;
    lead.tumbleProgress = 0;
    lead.paused = true;
    lead.pauseTimer = TUMBLE_PAUSE;

    // Reset spiral if we've gone too far
    if (lead.spiralStep >= spiralPath.length - 1) {
      lead.spiralStep = 0;
      lead.pos = [0, 0, 0];
      lead.baseRot = mat4Identity();
      clones.length = 0;
    }
  }
}

// ─── Camera Orbit ────────────────────────────────────────────────────────────

let camAzimuth = 0.4;
let camElevation = 0.5;
let camDist = 18;
let targetAzimuth = camAzimuth;
let targetElevation = camElevation;
let targetDist = camDist;
let dragging = false;
let lastMouse = [0, 0];

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastMouse = [e.clientX, e.clientY];
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouse[0];
  const dy = e.clientY - lastMouse[1];
  lastMouse = [e.clientX, e.clientY];
  targetAzimuth += dx * 0.005;
  targetElevation = Math.max(-1.2, Math.min(1.2, targetElevation + dy * 0.005));
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  targetDist = Math.max(5, Math.min(60, targetDist + e.deltaY * 0.03));
  e.preventDefault();
}, { passive: false });

function getCameraMatrices() {
  // Smooth follow
  camAzimuth += (targetAzimuth - camAzimuth) * 0.08;
  camElevation += (targetElevation - camElevation) * 0.08;
  camDist += (targetDist - camDist) * 0.08;

  // Look at the midpoint of the spiral
  const lookX = lead.pos[0] * 0.3;
  const lookZ = lead.pos[2] * 0.3;

  const eyeX = lookX + Math.cos(camAzimuth) * Math.cos(camElevation) * camDist;
  const eyeY = Math.sin(camElevation) * camDist + 4;
  const eyeZ = lookZ + Math.sin(camAzimuth) * Math.cos(camElevation) * camDist;

  const aspect = canvas.width / canvas.height;
  const proj = mat4Perspective(Math.PI / 4, aspect, 0.5, 200);
  const view = mat4LookAt([eyeX, eyeY, eyeZ], [lookX, 0, lookZ], [0, 1, 0]);

  return { proj, view };
}

// ─── Render Loop ─────────────────────────────────────────────────────────────

let lastTime = 0;
const hud = document.getElementById('hud');
let frameCount = 0;
let fpsTime = 0;
let fps = 0;

function render(now) {
  requestAnimationFrame(render);
  const t = now / 1000;
  const dt = Math.min(t - lastTime, 0.1);
  lastTime = t;

  // FPS
  frameCount++;
  if (t - fpsTime > 1) {
    fps = frameCount;
    frameCount = 0;
    fpsTime = t;
  }

  // Update camera texture
  updateCamTexture();

  // Advance tumble
  advanceTumble(dt);

  // Matrices
  const { proj, view } = getCameraMatrices();

  // Clear
  gl.clearColor(0.02, 0.02, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ── Background ──
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(bgProg);
  gl.uniform1f(bgU.u_time, t);
  gl.uniform2f(bgU.u_res, canvas.width, canvas.height);
  gl.bindVertexArray(quad);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ── Cubes ──
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(cubeProg);
  gl.uniformMatrix4fv(cubeU.u_proj, false, proj);
  gl.uniformMatrix4fv(cubeU.u_view, false, view);
  gl.uniform1f(cubeU.u_time, t);
  gl.uniform1i(cubeU.u_camTex, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, camTex);
  gl.bindVertexArray(cube.vao);

  const totalCubes = clones.length + 1;
  gl.uniform1f(cubeU.u_totalCubes, totalCubes);

  // Draw clones (back to front for proper alpha blending)
  // Each clone grows slightly based on its spiral distance
  for (let i = 0; i < clones.length; i++) {
    const c = clones[i];
    const age = t - c.birthTime;
    const fadeIn = Math.min(age * 3, 1);
    const ghostFade = i / Math.max(clones.length, 1); // 0 = newest, ~1 = oldest

    // Scale increases with distance from center (vortex growth)
    const distFromCenter = Math.sqrt(
      c.modelMatrix[12]*c.modelMatrix[12] +
      c.modelMatrix[14]*c.modelMatrix[14]
    );
    const growthFactor = 1.0 + distFromCenter * 0.04;

    // Apply growth scale to the clone's matrix
    const scaled = mat4Multiply(c.modelMatrix, mat4Scale(growthFactor));

    gl.uniformMatrix4fv(cubeU.u_model, false, scaled);
    gl.uniform1f(cubeU.u_alpha, fadeIn * 0.85);
    gl.uniform1f(cubeU.u_ghostFade, ghostFade);
    gl.uniform1f(cubeU.u_cubeIndex, i);
    gl.drawElements(gl.TRIANGLES, cube.count, gl.UNSIGNED_SHORT, 0);
  }

  // Draw lead cube (fully opaque, no ghost)
  const leadModel = getLeadModelMatrix(t);
  gl.uniformMatrix4fv(cubeU.u_model, false, leadModel);
  gl.uniform1f(cubeU.u_alpha, 1.0);
  gl.uniform1f(cubeU.u_ghostFade, 0.0);
  gl.uniform1f(cubeU.u_cubeIndex, clones.length);
  gl.drawElements(gl.TRIANGLES, cube.count, gl.UNSIGNED_SHORT, 0);

  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // HUD
  if (hud) {
    hud.textContent = `${fps} fps | ${totalCubes} cubes | step ${lead.spiralStep}`;
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('startOverlay');

startBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  await startCamera();
  requestAnimationFrame(render);
});
