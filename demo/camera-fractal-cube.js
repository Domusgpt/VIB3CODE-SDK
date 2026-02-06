/**
 * VIB3+ Camera Fractal Cube — Vortex Funnel Demo
 *
 * Fixed camera looking INTO a fractal vortex:
 * - Small center cube at the back
 * - 4 spiral arms emerging from corners toward the viewer
 * - Each cube scaled by the PLASTIC RATIO (ρ ≈ 1.3247)
 * - Creates a tornado/funnel effect with step-like fractal geometry
 * - Single camera image per cube face
 */

// ─── Constants ───────────────────────────────────────────────────────────────

// Plastic ratio: unique real solution to x³ = x + 1
const PLASTIC_RATIO = 1.3247179572447458;
const PLASTIC_INV = 1 / PLASTIC_RATIO;

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
uniform float u_spiralIndex;  // which cube in the spiral (0 = center)
uniform float u_armIndex;     // which arm (0-3)

out vec4 fragColor;

void main() {
  vec3 N = normalize(v_normal);

  // Single camera image per face (mirror X for selfie + flip Y for mobile orientation)
  vec2 uv = v_uv;
  uv.x = 1.0 - uv.x;
  uv.y = 1.0 - uv.y;

  // Sample camera texture
  vec4 cam = texture(u_camTex, uv);

  // Soft lighting
  vec3 lightDir = normalize(vec3(0.3, 0.8, 0.5));
  float diff = max(dot(N, lightDir), 0.0);
  float light = 0.4 + 0.6 * diff;

  // Color tint based on spiral arm (subtle rainbow)
  float hueShift = u_armIndex * 0.25;
  vec3 tint = vec3(
    0.5 + 0.5 * cos(hueShift * 6.2832),
    0.5 + 0.5 * cos(hueShift * 6.2832 + 2.094),
    0.5 + 0.5 * cos(hueShift * 6.2832 + 4.188)
  );

  vec3 col = cam.rgb * light;
  col = mix(col, col * tint, 0.15 + u_spiralIndex * 0.02);

  // Edge glow (subtle wireframe effect)
  vec2 edgeDist = smoothstep(vec2(0.0), vec2(0.03), v_uv)
                * smoothstep(vec2(0.0), vec2(0.03), 1.0 - v_uv);
  float edgeMask = edgeDist.x * edgeDist.y;
  float edge = 1.0 - edgeMask;
  vec3 edgeCol = vec3(0.0, 1.0, 1.0) * edge * 0.25;

  col = col * edgeMask + edgeCol;

  // Depth-based fade for far cubes (disable to keep cubes visible on mobile GPUs)
  float depthFade = 1.0;
  float alpha = u_alpha * depthFade;

  // Ensure some emissive visibility even with dark camera frames
  col = max(col, vec3(0.08));

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
out vec4 fragColor;

void main() {
  vec2 center = vec2(0.5);
  vec2 uv = v_uv - center;
  float dist = length(uv);
  float angle = atan(uv.y, uv.x);

  // Spiral vortex pattern
  float spiral = sin(angle * 4.0 - dist * 15.0 + u_time * 0.3) * 0.5 + 0.5;

  // Radial gradient (dark center, slightly brighter edges)
  float vignette = 1.0 - smoothstep(0.0, 0.8, dist);

  // Dark space colors
  vec3 col = mix(
    vec3(0.01, 0.01, 0.03),  // near black
    vec3(0.04, 0.02, 0.06),  // dark purple
    spiral * 0.3
  );

  // Subtle edge glow
  float edgeGlow = smoothstep(0.4, 0.9, dist) * 0.08;
  col += vec3(0.0, edgeGlow * 0.5, edgeGlow);

  col *= 0.5 + vignette * 0.5;

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

function linkProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
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
const cubeProg = linkProgram(cubeVS, cubeFS);
const cubeU = getUniforms(cubeProg, [
  'u_proj', 'u_view', 'u_model', 'u_camTex', 'u_time',
  'u_alpha', 'u_spiralIndex', 'u_armIndex'
]);

// Background program
const bgVS = compileShader(BG_VERT, gl.VERTEX_SHADER);
const bgFS = compileShader(BG_FRAG, gl.FRAGMENT_SHADER);
const bgProg = linkProgram(bgVS, bgFS);
const bgU = getUniforms(bgProg, ['u_time']);

// ─── Geometry: Unit Cube ─────────────────────────────────────────────────────

function makeCube() {
  const faces = [
    { n: [0,0,1], verts: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },     // +Z front
    { n: [0,0,-1], verts: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]] }, // -Z back
    { n: [1,0,0], verts: [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]] },      // +X right
    { n: [-1,0,0], verts: [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]] }, // -X left
    { n: [0,1,0], verts: [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]] },      // +Y top
    { n: [0,-1,0], verts: [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]] }, // -Y bottom
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

// ─── Camera Texture (webcam) ─────────────────────────────────────────────────

let videoReady = false;
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

const camTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, camTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
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
    console.warn('Camera not available, using procedural fallback', e);
    generateFallbackTexture();
  }
}

function generateFallbackTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x / size - 0.5, cy = y / size - 0.5;
      const d = Math.sqrt(cx*cx + cy*cy);
      const v = Math.sin(d * 20) * 0.5 + 0.5;
      data[i]   = (v * 150 + 80) | 0;
      data[i+1] = (v * 100 + 100) | 0;
      data[i+2] = (v * 180 + 75) | 0;
      data[i+3] = 255;
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, camTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
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

// ─── Fractal Vortex Cube Generation ──────────────────────────────────────────
//
// Structure:
// - Center cube at Z = -centerDepth (back of funnel)
// - 4 spiral arms, each starting from a diagonal direction
// - Each arm has N cubes, spiraling outward toward the camera
// - Cubes scale up by plastic ratio as they approach viewer

const NUM_ARMS = 4;
const CUBES_PER_ARM = 8;
const CENTER_DEPTH = 9;       // how far back the center cube is
const CENTER_SCALE = 0.24;    // size of the smallest (center) cube
const SPIRAL_TIGHTNESS = 0.32; // how tight the spiral winds
const VERTICAL_SPREAD = 0.12; // slight Y variation

function generateVortexCubes() {
  const cubes = [];

  // Center cube (the "eye" of the vortex)
  cubes.push({
    pos: [0, 0, -CENTER_DEPTH],
    scale: CENTER_SCALE,
    rotation: [0, 0, 0],
    armIndex: -1,
    spiralIndex: 0,
  });

  // 4 spiral arms
  for (let arm = 0; arm < NUM_ARMS; arm++) {
    const baseAngle = (arm / NUM_ARMS) * Math.PI * 2; // 0, 90, 180, 270 degrees

    for (let i = 0; i < CUBES_PER_ARM; i++) {
      // Distance from center increases with plastic ratio
      const t = (i + 1) / CUBES_PER_ARM;

      // Scale grows by plastic ratio each step
      const scale = CENTER_SCALE * Math.pow(PLASTIC_RATIO, i + 1);

      // Spiral angle: base + additional rotation as we go outward
      const spiralAngle = baseAngle + t * Math.PI * SPIRAL_TIGHTNESS * (arm % 2 === 0 ? 1 : -1);

      // Radial distance from center (grows with plastic ratio too)
      const radius = 1.5 * Math.pow(PLASTIC_RATIO, i * 0.7);

      // Z position: comes toward camera as we go outward
      const z = -CENTER_DEPTH + t * (CENTER_DEPTH - 2);

      // X, Y position: spiral pattern
      const x = Math.cos(spiralAngle) * radius;
      const y = Math.sin(spiralAngle) * radius * 0.6 + Math.sin(t * Math.PI) * VERTICAL_SPREAD * radius;

      // Rotation: slight tilt toward center
      const rotY = spiralAngle + Math.PI * 0.1;
      const rotX = -t * 0.2;
      const rotZ = arm * 0.1;

      cubes.push({
        pos: [x, y, z],
        scale: scale,
        rotation: [rotX, rotY, rotZ],
        armIndex: arm,
        spiralIndex: i + 1,
      });
    }
  }

  return cubes;
}

// Pre-generate the vortex structure
const vortexCubes = generateVortexCubes();

// ─── Fixed Camera ────────────────────────────────────────────────────────────

function getFixedCamera() {
  // Camera positioned in front, looking into the vortex
  const eye = [0, 0, 6.5];
  const target = [0, 0, -CENTER_DEPTH];
  const aspect = canvas.width / canvas.height;

  const proj = mat4Perspective(Math.PI / 3.5, aspect, 0.1, 100);
  const view = mat4LookAt(eye, target, [0, 1, 0]);

  return { proj, view };
}

// ─── Render Loop ─────────────────────────────────────────────────────────────

let startTime = 0;
const hud = document.getElementById('hud');

function render(now) {
  requestAnimationFrame(render);

  if (!startTime) startTime = now;
  const t = (now - startTime) / 1000;

  updateCamTexture();

  const { proj, view } = getFixedCamera();

  // Clear
  gl.clearColor(0.01, 0.01, 0.03, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ── Background ──
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(bgProg);
  gl.uniform1f(bgU.u_time, t);
  gl.bindVertexArray(quad);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ── Cubes (back to front for proper transparency) ──
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

  // Sort cubes by depth (back to front)
  const sorted = [...vortexCubes].sort((a, b) => a.pos[2] - b.pos[2]);

  for (const c of sorted) {
    // Build model matrix: translate, rotate, scale
    // Add gentle animation to rotation
    const animRotY = c.rotation[1] + t * 0.1 * (c.armIndex >= 0 ? 1 : 0.3);
    const animRotX = c.rotation[0] + Math.sin(t * 0.5 + c.spiralIndex) * 0.05;

    let model = mat4Translate(c.pos[0], c.pos[1], c.pos[2]);
    model = mat4Multiply(model, mat4RotY(animRotY));
    model = mat4Multiply(model, mat4RotX(animRotX));
    model = mat4Multiply(model, mat4RotZ(c.rotation[2]));
    model = mat4Multiply(model, mat4Scale(c.scale));

    gl.uniformMatrix4fv(cubeU.u_model, false, model);
    gl.uniform1f(cubeU.u_alpha, c.armIndex < 0 ? 1.0 : 0.92);
    gl.uniform1f(cubeU.u_spiralIndex, c.spiralIndex);
    gl.uniform1f(cubeU.u_armIndex, Math.max(0, c.armIndex));

    gl.drawElements(gl.TRIANGLES, cube.count, gl.UNSIGNED_SHORT, 0);
  }

  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // HUD
  if (hud) {
    hud.textContent = `${vortexCubes.length} cubes | plastic ratio: ${PLASTIC_RATIO.toFixed(4)}`;
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

const startBtn = document.getElementById('startBtn');
const overlay = document.getElementById('startOverlay');
let renderStarted = false;
let cameraRequested = false;

const beginRender = () => {
  if (renderStarted) return;
  renderStarted = true;
  generateFallbackTexture();
  requestAnimationFrame(render);
};

const requestCamera = () => {
  if (cameraRequested) return;
  cameraRequested = true;
  overlay.classList.add('hidden');
  startCamera();
};

beginRender();
startBtn.addEventListener('click', requestCamera);
