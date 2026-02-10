/**
 * VIB3+ Camera Hypercube Vortex
 *
 * Camera-textured cubes with 4D hypercube behavior.
 * - Accelerometer/gyroscope control for rotation
 * - 4D rotation through XW, YW, ZW planes
 * - Moiré interference patterns
 * - Audio reactivity
 */

/* ================================================================== */
/*  CONSTANTS                                                          */
/* ================================================================== */

const PLASTIC = 1.3247179572447458;

/* ================================================================== */
/*  CANVAS + GL                                                        */
/* ================================================================== */

const canvas = document.getElementById('gl');
canvas.width = window.innerWidth * devicePixelRatio;
canvas.height = window.innerHeight * devicePixelRatio;
canvas.style.width = '100vw';
canvas.style.height = '100vh';

const gl = canvas.getContext('webgl2', {
  depth: true,
  antialias: true,
  alpha: false,
  premultipliedAlpha: false,
});
if (!gl) throw new Error('WebGL2 required');

/* ================================================================== */
/*  SHADERS - Hypercube Camera Cubes                                   */
/* ================================================================== */

const cubeVS = `#version 300 es
precision highp float;

// Per-vertex
in vec3 a_position;
in vec2 a_uv;
in vec3 a_normal;

// Per-instance
in mat4 a_model;
in float a_brightness;
in float a_hueShift;
in float a_wCoord;  // W coordinate for 4D

uniform mat4 u_viewProj;
uniform float u_time;

// 4D rotation uniforms
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension;

out vec2 v_uv;
out vec3 v_normal;
out float v_brightness;
out float v_hueShift;
out float v_depth;
out float v_4dDepth;

// 4D to 3D projection
vec3 project4Dto3D(vec4 p4d, float dim) {
  float w = p4d.w + dim;
  return p4d.xyz / max(w, 0.1);
}

void main() {
  // Get world position from model matrix
  vec4 worldPos = a_model * vec4(a_position, 1.0);

  // Create 4D position
  vec4 pos4D = vec4(worldPos.xyz, a_wCoord);

  // Apply 4D rotations (XW, YW, ZW planes)
  // Rotate XW
  float cxw = cos(u_rotXW), sxw = sin(u_rotXW);
  vec4 p1 = vec4(
    pos4D.x * cxw - pos4D.w * sxw,
    pos4D.y,
    pos4D.z,
    pos4D.x * sxw + pos4D.w * cxw
  );

  // Rotate YW
  float cyw = cos(u_rotYW), syw = sin(u_rotYW);
  vec4 p2 = vec4(
    p1.x,
    p1.y * cyw - p1.w * syw,
    p1.z,
    p1.y * syw + p1.w * cyw
  );

  // Rotate ZW
  float czw = cos(u_rotZW), szw = sin(u_rotZW);
  vec4 p3 = vec4(
    p2.x,
    p2.y,
    p2.z * czw - p2.w * szw,
    p2.z * szw + p2.w * czw
  );

  // Project 4D to 3D
  vec3 projected = project4Dto3D(p3, u_dimension);

  gl_Position = u_viewProj * vec4(projected, 1.0);
  v_uv = a_uv;
  v_normal = mat3(a_model) * a_normal;
  v_brightness = a_brightness;
  v_hueShift = a_hueShift;
  v_depth = -projected.z * 0.015;
  v_4dDepth = p3.w * 0.1; // W-depth for effects
}
`;

const cubeFS = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in float v_brightness;
in float v_hueShift;
in float v_depth;
in float v_4dDepth;

uniform sampler2D u_cameraTexture;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;
uniform float u_glitch;
uniform float u_moireScale;

out vec4 fragColor;

vec3 hueShift(vec3 color, float shift) {
  float angle = shift * 6.28318;
  float s = sin(angle);
  float c = cos(angle);
  vec3 weights = vec3(0.57735);
  return vec3(
    dot(color, weights + c * (vec3(1.0, 0.0, 0.0) - weights) + s * vec3(0.0, -0.57735, 0.57735)),
    dot(color, weights + c * (vec3(0.0, 1.0, 0.0) - weights) + s * vec3(0.57735, 0.0, -0.57735)),
    dot(color, weights + c * (vec3(0.0, 0.0, 1.0) - weights) + s * vec3(-0.57735, 0.57735, 0.0))
  );
}

// Moiré pattern
float moire(vec2 uv, float scale1, float scale2) {
  float p1 = sin(uv.x * scale1 * 50.0) * sin(uv.y * scale1 * 50.0);
  float p2 = sin(uv.x * scale2 * 50.0) * sin(uv.y * scale2 * 50.0);
  return abs(p1 - p2);
}

void main() {
  vec2 uv = v_uv;

  // Glitch effect - RGB split
  float glitchAmount = u_glitch * 0.02;
  vec2 rOffset = vec2(glitchAmount, 0.0);
  vec2 bOffset = vec2(-glitchAmount, 0.0);

  float r = texture(u_cameraTexture, uv + rOffset).r;
  float g = texture(u_cameraTexture, uv).g;
  float b = texture(u_cameraTexture, uv + bOffset).b;
  vec3 camColor = vec3(r, g, b);

  // Moiré overlay based on 4D depth
  float moireEffect = moire(uv, 1.0, u_moireScale) * 0.15;
  moireEffect *= (0.5 + abs(v_4dDepth));

  // Apply hue shift from audio mid + 4D position
  float totalHueShift = v_hueShift + v_4dDepth * 0.1;
  if (abs(totalHueShift) > 0.01) {
    camColor = hueShift(camColor, totalHueShift);
  }

  // Add moiré color tint
  vec3 moireColor = vec3(0.0, 0.8, 1.0) * moireEffect;
  camColor = mix(camColor, camColor + moireColor, 0.3);

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
  float ambient = 0.35;
  float light = ambient + diffuse * 0.65;

  // Bass-reactive glow + 4D depth effect
  float glow = 1.0 + u_bass * 0.6;
  float depthGlow = 1.0 + abs(v_4dDepth) * 0.3;

  // Apply lighting and brightness
  vec3 color = camColor * light * v_brightness * glow * depthGlow;

  // Edge glow effect (stronger when emerging from 4D)
  float edgeFactor = 1.0 - abs(dot(normalize(v_normal), vec3(0.0, 0.0, 1.0)));
  vec3 edgeColor = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 1.0), 0.5 + v_4dDepth * 0.5);
  color += edgeColor * pow(edgeFactor, 2.5) * (0.3 + u_energy * 0.5);

  // Depth fog toward black
  color = mix(color, vec3(0.0), clamp(v_depth, 0.0, 0.92));

  fragColor = vec4(color, 1.0);
}
`;

/* ================================================================== */
/*  SHADER - Background Moiré Field                                    */
/* ================================================================== */

const bgVS = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`;

const bgFS = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_rotX;
uniform float u_rotY;
uniform float u_rotXW;
uniform float u_rotYW;
uniform float u_rotZW;
uniform float u_dimension;
uniform float u_bass;
uniform float u_mid;
uniform float u_gridDensity;
uniform float u_moireScale;

// 4D rotation matrices
mat4 rotateXW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c);
}
mat4 rotateYW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c);
}
mat4 rotateZW(float t) {
  float c = cos(t), s = sin(t);
  return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c);
}

vec3 project4Dto3D(vec4 p, float d) {
  return p.xyz / max(p.w + d, 0.1);
}

float hypercubeLattice(vec3 p, float morph, float grid) {
  vec4 p4d = vec4(p * grid, morph * u_dimension);

  p4d = rotateXW(u_rotXW * u_dimension) * p4d;
  p4d = rotateYW(u_rotYW * u_dimension) * p4d;
  p4d = rotateZW(u_rotZW * u_dimension) * p4d;

  vec4 lattice = fract(p4d) - 0.5;
  float dist = max(max(abs(lattice.x), abs(lattice.y)),
                   max(abs(lattice.z), abs(lattice.w)));

  return 1.0 - smoothstep(0.4, 0.5, dist);
}

float generateMoire(vec3 p, float morph, float grid) {
  float g1 = hypercubeLattice(p, morph, grid);
  float g2 = hypercubeLattice(p, morph, grid * u_moireScale);

  float r4d = length(vec4(p, morph * u_dimension));
  float s1 = sin(r4d * grid * 3.14159);
  float s2 = sin(r4d * grid * u_moireScale * 3.14159);
  float spherical = abs(s1 - s2) * 0.25;

  return abs(g1 - g2) * 0.4 + spherical;
}

void main() {
  vec2 uv = (v_uv - 0.5) * 2.0;
  uv.x *= u_resolution.x / u_resolution.y;

  vec3 rayDir = normalize(vec3(uv, 1.0));

  float morph = u_bass * 0.8;
  float lattice = hypercubeLattice(rayDir, morph, u_gridDensity);
  float moire = generateMoire(rayDir, morph, u_gridDensity);

  float combined = lattice + moire * 0.5;

  vec3 c1 = vec3(0.0, 0.4, 0.6);
  vec3 c2 = vec3(0.4, 0.0, 0.5);
  vec3 c3 = vec3(0.1, 0.1, 0.2);

  vec3 color = mix(mix(c1, c2, combined), c3, 1.0 - moire);
  color *= 0.3 + combined * 0.4;
  color *= 0.5 + u_bass * 0.3 + u_mid * 0.2;

  fragColor = vec4(color * 0.6, 1.0);
}
`;

/* ================================================================== */
/*  SHADER - Particle Splats                                           */
/* ================================================================== */

const splatVS = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;
in float a_size;

uniform mat4 u_viewProj;
uniform float u_pointScale;

out vec3 v_color;

void main() {
  vec4 pos = u_viewProj * vec4(a_position, 1.0);
  gl_Position = pos;
  gl_PointSize = clamp(a_size * u_pointScale / pos.w, 1.0, 64.0);
  v_color = a_color;
}
`;

const splatFS = `#version 300 es
precision highp float;

in vec3 v_color;
out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float alpha = exp(-r * 3.0);
  fragColor = vec4(v_color * alpha, alpha);
}
`;

/* ================================================================== */
/*  SHADER COMPILATION                                                 */
/* ================================================================== */

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function createProgram(vs, fs) {
  const vsh = createShader(gl.VERTEX_SHADER, vs);
  const fsh = createShader(gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  return prog;
}

// Programs
const cubeProgram = createProgram(cubeVS, cubeFS);
const bgProgram = createProgram(bgVS, bgFS);
const splatProgram = createProgram(splatVS, splatFS);

// Cube uniforms/attribs
const cubeLocs = {
  a_position: gl.getAttribLocation(cubeProgram, 'a_position'),
  a_uv: gl.getAttribLocation(cubeProgram, 'a_uv'),
  a_normal: gl.getAttribLocation(cubeProgram, 'a_normal'),
  a_model: gl.getAttribLocation(cubeProgram, 'a_model'),
  a_brightness: gl.getAttribLocation(cubeProgram, 'a_brightness'),
  a_hueShift: gl.getAttribLocation(cubeProgram, 'a_hueShift'),
  a_wCoord: gl.getAttribLocation(cubeProgram, 'a_wCoord'),
  u_viewProj: gl.getUniformLocation(cubeProgram, 'u_viewProj'),
  u_cameraTexture: gl.getUniformLocation(cubeProgram, 'u_cameraTexture'),
  u_time: gl.getUniformLocation(cubeProgram, 'u_time'),
  u_bass: gl.getUniformLocation(cubeProgram, 'u_bass'),
  u_energy: gl.getUniformLocation(cubeProgram, 'u_energy'),
  u_glitch: gl.getUniformLocation(cubeProgram, 'u_glitch'),
  u_moireScale: gl.getUniformLocation(cubeProgram, 'u_moireScale'),
  u_rotXW: gl.getUniformLocation(cubeProgram, 'u_rotXW'),
  u_rotYW: gl.getUniformLocation(cubeProgram, 'u_rotYW'),
  u_rotZW: gl.getUniformLocation(cubeProgram, 'u_rotZW'),
  u_dimension: gl.getUniformLocation(cubeProgram, 'u_dimension'),
};

// BG uniforms
const bgLocs = {
  a_position: gl.getAttribLocation(bgProgram, 'a_position'),
  u_time: gl.getUniformLocation(bgProgram, 'u_time'),
  u_resolution: gl.getUniformLocation(bgProgram, 'u_resolution'),
  u_rotX: gl.getUniformLocation(bgProgram, 'u_rotX'),
  u_rotY: gl.getUniformLocation(bgProgram, 'u_rotY'),
  u_rotXW: gl.getUniformLocation(bgProgram, 'u_rotXW'),
  u_rotYW: gl.getUniformLocation(bgProgram, 'u_rotYW'),
  u_rotZW: gl.getUniformLocation(bgProgram, 'u_rotZW'),
  u_dimension: gl.getUniformLocation(bgProgram, 'u_dimension'),
  u_bass: gl.getUniformLocation(bgProgram, 'u_bass'),
  u_mid: gl.getUniformLocation(bgProgram, 'u_mid'),
  u_gridDensity: gl.getUniformLocation(bgProgram, 'u_gridDensity'),
  u_moireScale: gl.getUniformLocation(bgProgram, 'u_moireScale'),
};

// Splat uniforms
const splatLocs = {
  a_position: gl.getAttribLocation(splatProgram, 'a_position'),
  a_color: gl.getAttribLocation(splatProgram, 'a_color'),
  a_size: gl.getAttribLocation(splatProgram, 'a_size'),
  u_viewProj: gl.getUniformLocation(splatProgram, 'u_viewProj'),
  u_pointScale: gl.getUniformLocation(splatProgram, 'u_pointScale'),
};

/* ================================================================== */
/*  GEOMETRY                                                           */
/* ================================================================== */

// Cube vertices
const cubeVertices = new Float32Array([
  // Front (Z+)
  -0.5,-0.5, 0.5, 0,0, 0,0,1,   0.5,-0.5, 0.5, 1,0, 0,0,1,
   0.5, 0.5, 0.5, 1,1, 0,0,1,  -0.5, 0.5, 0.5, 0,1, 0,0,1,
  // Back (Z-)
   0.5,-0.5,-0.5, 0,0, 0,0,-1, -0.5,-0.5,-0.5, 1,0, 0,0,-1,
  -0.5, 0.5,-0.5, 1,1, 0,0,-1,  0.5, 0.5,-0.5, 0,1, 0,0,-1,
  // Top (Y+)
  -0.5, 0.5, 0.5, 0,0, 0,1,0,   0.5, 0.5, 0.5, 1,0, 0,1,0,
   0.5, 0.5,-0.5, 1,1, 0,1,0,  -0.5, 0.5,-0.5, 0,1, 0,1,0,
  // Bottom (Y-)
  -0.5,-0.5,-0.5, 0,0, 0,-1,0,  0.5,-0.5,-0.5, 1,0, 0,-1,0,
   0.5,-0.5, 0.5, 1,1, 0,-1,0, -0.5,-0.5, 0.5, 0,1, 0,-1,0,
  // Right (X+)
   0.5,-0.5, 0.5, 0,0, 1,0,0,   0.5,-0.5,-0.5, 1,0, 1,0,0,
   0.5, 0.5,-0.5, 1,1, 1,0,0,   0.5, 0.5, 0.5, 0,1, 1,0,0,
  // Left (X-)
  -0.5,-0.5,-0.5, 0,0, -1,0,0, -0.5,-0.5, 0.5, 1,0, -1,0,0,
  -0.5, 0.5, 0.5, 1,1, -1,0,0, -0.5, 0.5,-0.5, 0,1, -1,0,0,
]);

const cubeIndices = new Uint16Array([
  0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11,
  12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23
]);

const cubeVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

const cubeEBO = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeEBO);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIndices, gl.STATIC_DRAW);

// Instance data: mat4(16) + brightness(1) + hueShift(1) + wCoord(1) = 19 floats
const MAX_CUBES = 500;
const INSTANCE_STRIDE = 19;
const instanceData = new Float32Array(MAX_CUBES * INSTANCE_STRIDE);
const instanceVBO = gl.createBuffer();

// Cube VAO
const cubeVAO = gl.createVertexArray();
gl.bindVertexArray(cubeVAO);

gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.enableVertexAttribArray(cubeLocs.a_position);
gl.vertexAttribPointer(cubeLocs.a_position, 3, gl.FLOAT, false, 32, 0);
gl.enableVertexAttribArray(cubeLocs.a_uv);
gl.vertexAttribPointer(cubeLocs.a_uv, 2, gl.FLOAT, false, 32, 12);
gl.enableVertexAttribArray(cubeLocs.a_normal);
gl.vertexAttribPointer(cubeLocs.a_normal, 3, gl.FLOAT, false, 32, 20);

gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
const bpi = INSTANCE_STRIDE * 4;
for (let i = 0; i < 4; i++) {
  gl.enableVertexAttribArray(cubeLocs.a_model + i);
  gl.vertexAttribPointer(cubeLocs.a_model + i, 4, gl.FLOAT, false, bpi, i * 16);
  gl.vertexAttribDivisor(cubeLocs.a_model + i, 1);
}
gl.enableVertexAttribArray(cubeLocs.a_brightness);
gl.vertexAttribPointer(cubeLocs.a_brightness, 1, gl.FLOAT, false, bpi, 64);
gl.vertexAttribDivisor(cubeLocs.a_brightness, 1);
gl.enableVertexAttribArray(cubeLocs.a_hueShift);
gl.vertexAttribPointer(cubeLocs.a_hueShift, 1, gl.FLOAT, false, bpi, 68);
gl.vertexAttribDivisor(cubeLocs.a_hueShift, 1);
gl.enableVertexAttribArray(cubeLocs.a_wCoord);
gl.vertexAttribPointer(cubeLocs.a_wCoord, 1, gl.FLOAT, false, bpi, 72);
gl.vertexAttribDivisor(cubeLocs.a_wCoord, 1);

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeEBO);
gl.bindVertexArray(null);

// BG quad
const bgVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,-1, 1,1, -1,1]);
const bgVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, bgVBO);
gl.bufferData(gl.ARRAY_BUFFER, bgVerts, gl.STATIC_DRAW);

const bgVAO = gl.createVertexArray();
gl.bindVertexArray(bgVAO);
gl.enableVertexAttribArray(bgLocs.a_position);
gl.vertexAttribPointer(bgLocs.a_position, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

// Splats
const MAX_SPLATS = 40000;
const splatData = new Float32Array(MAX_SPLATS * 7);
const splatVBO = gl.createBuffer();

const splatVAO = gl.createVertexArray();
gl.bindVertexArray(splatVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, splatVBO);
gl.enableVertexAttribArray(splatLocs.a_position);
gl.vertexAttribPointer(splatLocs.a_position, 3, gl.FLOAT, false, 28, 0);
gl.enableVertexAttribArray(splatLocs.a_color);
gl.vertexAttribPointer(splatLocs.a_color, 3, gl.FLOAT, false, 28, 12);
gl.enableVertexAttribArray(splatLocs.a_size);
gl.vertexAttribPointer(splatLocs.a_size, 1, gl.FLOAT, false, 28, 24);
gl.bindVertexArray(null);

/* ================================================================== */
/*  CAMERA TEXTURE                                                     */
/* ================================================================== */

const cameraTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
  new Uint8Array([100, 100, 120, 255]));

/* ================================================================== */
/*  AUDIO                                                              */
/* ================================================================== */

let audioCtx = null, analyser = null;
let audioData = new Uint8Array(128);
let audioEnabled = false;

async function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    audioData = new Uint8Array(analyser.frequencyBinCount);
    audioEnabled = true;
  } catch (e) {
    console.warn('Audio unavailable:', e);
  }
}

function getAudioLevels() {
  if (!audioEnabled || !analyser) return { bass: 0, mid: 0, high: 0, energy: 0 };
  analyser.getByteFrequencyData(audioData);
  const len = audioData.length;
  let bass = 0, mid = 0, high = 0;
  for (let i = 0; i < len * 0.15; i++) bass += audioData[i];
  for (let i = Math.floor(len * 0.15); i < len * 0.5; i++) mid += audioData[i];
  for (let i = Math.floor(len * 0.5); i < len; i++) high += audioData[i];
  bass = bass / (len * 0.15) / 255;
  mid = mid / (len * 0.35) / 255;
  high = high / (len * 0.5) / 255;
  return { bass, mid, high, energy: (bass + mid + high) / 3 };
}

/* ================================================================== */
/*  CAMERA                                                             */
/* ================================================================== */

let videoReady = false;
const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 512 }, height: { ideal: 512 } }
    });
    video.srcObject = stream;
    await video.play();
    videoReady = true;
  } catch (e) {
    console.warn('Camera unavailable:', e);
  }
}

/* ================================================================== */
/*  GESTURE SYSTEM - Momentum, Pinch, Tap                              */
/* ================================================================== */

let gestureState = {
  // Rotation with momentum
  rotVelX: 0, rotVelY: 0,
  isDragging: false,
  lastX: 0, lastY: 0,

  // Pinch gesture
  pinchScale: 1.0,
  pinchTarget: 1.0,
  lastPinchDist: 0,

  // Tap/impulse
  impulseX: 0, impulseY: 0, impulseZ: 0,
  shockwave: 0, shockwaveOrigin: [0, 0],

  // Swipe momentum
  swipeVelX: 0, swipeVelY: 0,
};

// Touch tracking
let touches = {};

canvas.addEventListener('touchstart', (e) => {
  for (let t of e.changedTouches) {
    touches[t.identifier] = { x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY };
  }
  if (e.touches.length === 1) {
    gestureState.isDragging = true;
    gestureState.lastX = e.touches[0].clientX;
    gestureState.lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    gestureState.lastPinchDist = Math.sqrt(dx*dx + dy*dy);
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && gestureState.isDragging) {
    const dx = e.touches[0].clientX - gestureState.lastX;
    const dy = e.touches[0].clientY - gestureState.lastY;

    // Add to rotation with velocity
    gestureState.rotVelY += dx * 0.008;
    gestureState.rotVelX += dy * 0.008;

    // Swipe momentum
    gestureState.swipeVelX = dx * 0.02;
    gestureState.swipeVelY = dy * 0.02;

    gestureState.lastX = e.touches[0].clientX;
    gestureState.lastY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    // Pinch gesture
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (gestureState.lastPinchDist > 0) {
      const scale = dist / gestureState.lastPinchDist;
      gestureState.pinchTarget *= scale;
      gestureState.pinchTarget = Math.max(0.3, Math.min(3.0, gestureState.pinchTarget));

      // Pinch creates impulse
      if (scale > 1.05) gestureState.impulseZ += 0.3; // Spread = push out
      if (scale < 0.95) gestureState.impulseZ -= 0.3; // Squeeze = pull in
    }
    gestureState.lastPinchDist = dist;
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  for (let t of e.changedTouches) {
    delete touches[t.identifier];
  }
  if (e.touches.length === 0) {
    gestureState.isDragging = false;
  }
  gestureState.lastPinchDist = 0;

  // Double tap detection
  const now = Date.now();
  if (!gestureState.lastTap) gestureState.lastTap = 0;
  if (now - gestureState.lastTap < 300) {
    // Double tap! Create shockwave
    gestureState.shockwave = 1.0;
    if (e.changedTouches.length > 0) {
      gestureState.shockwaveOrigin = [
        (e.changedTouches[0].clientX / window.innerWidth - 0.5) * 4,
        -(e.changedTouches[0].clientY / window.innerHeight - 0.5) * 4
      ];
    }
  }
  gestureState.lastTap = now;
  e.preventDefault();
}, { passive: false });

// Mouse fallback with momentum
canvas.addEventListener('mousedown', (e) => {
  gestureState.isDragging = true;
  gestureState.lastX = e.clientX;
  gestureState.lastY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!gestureState.isDragging) return;
  const dx = e.clientX - gestureState.lastX;
  const dy = e.clientY - gestureState.lastY;
  gestureState.rotVelY += dx * 0.005;
  gestureState.rotVelX += dy * 0.005;
  gestureState.swipeVelX = dx * 0.015;
  gestureState.swipeVelY = dy * 0.015;
  gestureState.lastX = e.clientX;
  gestureState.lastY = e.clientY;
});

canvas.addEventListener('mouseup', () => { gestureState.isDragging = false; });
canvas.addEventListener('mouseleave', () => { gestureState.isDragging = false; });

// Double click = shockwave
canvas.addEventListener('dblclick', (e) => {
  gestureState.shockwave = 1.0;
  gestureState.shockwaveOrigin = [
    (e.clientX / window.innerWidth - 0.5) * 4,
    -(e.clientY / window.innerHeight - 0.5) * 4
  ];
});

/* ================================================================== */
/*  PHYSICS STATE - Each cube has position, velocity, home             */
/* ================================================================== */

const NUM_CUBES = 80;
const cubePhysics = [];

// Initialize cube physics state
function initCubePhysics() {
  for (let i = 0; i < NUM_CUBES; i++) {
    cubePhysics.push({
      // Current state
      x: 0, y: 0, z: -5,
      vx: 0, vy: 0, vz: 0,
      rotX: Math.random() * 6.28,
      rotY: Math.random() * 6.28,
      rotVelX: (Math.random() - 0.5) * 0.02,
      rotVelY: (Math.random() - 0.5) * 0.02,
      scale: 0.5,
      scaleVel: 0,
      phase: Math.random() * 6.28,

      // Home position (formation target)
      homeX: 0, homeY: 0, homeZ: -5,

      // Properties
      mass: 0.8 + Math.random() * 0.4,
      springK: 2.0 + Math.random() * 1.0,
      damping: 0.92,
    });
  }
}
initCubePhysics();

/* ================================================================== */
/*  FORMATIONS - Different arrangements cubes morph between            */
/* ================================================================== */

function setFormation(formation, time) {
  const t = time * 0.1;

  for (let i = 0; i < NUM_CUBES; i++) {
    const cube = cubePhysics[i];
    const idx = i / NUM_CUBES;

    switch(formation) {
      case 'SPIRAL': {
        const angle = idx * Math.PI * 8 + t;
        const radius = 0.5 + idx * 3;
        cube.homeX = Math.cos(angle) * radius;
        cube.homeY = Math.sin(angle) * radius;
        cube.homeZ = -3 - idx * 15;
        break;
      }
      case 'SPHERE': {
        const phi = Math.acos(1 - 2 * idx);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = 2.5 + Math.sin(t + i) * 0.5;
        cube.homeX = r * Math.sin(phi) * Math.cos(theta);
        cube.homeY = r * Math.sin(phi) * Math.sin(theta);
        cube.homeZ = -5 + r * Math.cos(phi);
        break;
      }
      case 'GRID': {
        const cols = 8, rows = 10;
        const col = i % cols;
        const row = Math.floor(i / cols);
        cube.homeX = (col - cols/2 + 0.5) * 0.8;
        cube.homeY = (row - rows/2 + 0.5) * 0.8;
        cube.homeZ = -4 + Math.sin(col + row + t) * 0.5;
        break;
      }
      case 'EXPLOSION': {
        const angle1 = idx * Math.PI * 6;
        const angle2 = idx * Math.PI * 3;
        const r = 1 + idx * 8;
        cube.homeX = Math.cos(angle1) * Math.sin(angle2) * r;
        cube.homeY = Math.sin(angle1) * Math.sin(angle2) * r;
        cube.homeZ = -5 + Math.cos(angle2) * r * 0.5;
        break;
      }
      case 'DNA': {
        const strand = i % 2;
        const pos = Math.floor(i / 2) / (NUM_CUBES / 2);
        const angle = pos * Math.PI * 6 + strand * Math.PI + t;
        const radius = 1.5 + Math.sin(pos * 10) * 0.3;
        cube.homeX = Math.cos(angle) * radius;
        cube.homeY = Math.sin(angle) * radius;
        cube.homeZ = -2 - pos * 16;
        break;
      }
      case 'VORTEX': {
        const angle = idx * Math.PI * 12 + t * 2;
        const radius = 0.3 + Math.pow(idx, 0.7) * 4;
        const wave = Math.sin(idx * 20 + t * 3) * 0.5;
        cube.homeX = Math.cos(angle) * radius;
        cube.homeY = Math.sin(angle) * radius + wave;
        cube.homeZ = -2 - idx * 18;
        break;
      }
      default: // ORBIT
        const ring = Math.floor(i / 12);
        const inRing = i % 12;
        const ringAngle = (inRing / 12) * Math.PI * 2 + t * (1 + ring * 0.3);
        const ringRadius = 1 + ring * 1.2;
        cube.homeX = Math.cos(ringAngle) * ringRadius;
        cube.homeY = Math.sin(ringAngle) * ringRadius * (0.6 + ring * 0.1);
        cube.homeZ = -3 - ring * 3;
    }
  }
}

/* ================================================================== */
/*  ACCELEROMETER / GYRO                                               */
/* ================================================================== */

let rotationX = 0, rotationY = 0;
let targetRotX = 0, targetRotY = 0;
let accelEnabled = false;

function initAccelerometer() {
  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(response => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            accelEnabled = true;
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
      accelEnabled = true;
    }
  }
}

function handleOrientation(e) {
  if (e.beta !== null && e.gamma !== null) {
    targetRotX = (e.beta / 90) * Math.PI;
    targetRotY = (e.gamma / 45) * Math.PI;
  }
}

/* ================================================================== */
/*  MATRIX HELPERS                                                     */
/* ================================================================== */

function mat4Perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0]-target[0], zy = eye[1]-target[1], zz = eye[2]-target[2];
  let len = 1/Math.sqrt(zx*zx + zy*zy + zz*zz);
  const z = [zx*len, zy*len, zz*len];
  const xx = up[1]*z[2] - up[2]*z[1], xy = up[2]*z[0] - up[0]*z[2], xz = up[0]*z[1] - up[1]*z[0];
  len = 1/Math.sqrt(xx*xx + xy*xy + xz*xz);
  const x = [xx*len, xy*len, xz*len];
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]), 1]);
}

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      o[j*4+i] = a[i]*b[j*4] + a[i+4]*b[j*4+1] + a[i+8]*b[j*4+2] + a[i+12]*b[j*4+3];
  return o;
}

function mat4Translate(x, y, z) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
}

function mat4Scale(s) {
  return new Float32Array([s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]);
}

function mat4RotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}

function mat4RotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

function mat4RotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
}

/* ================================================================== */
/*  PHYSICS SIMULATION - Spring forces, audio impulses, gestures       */
/* ================================================================== */

let currentFormation = 'VORTEX';
let formationTimer = 0;
const FORMATIONS = ['VORTEX', 'SPIRAL', 'SPHERE', 'DNA', 'EXPLOSION', 'GRID'];
let formationIndex = 0;

function updatePhysics(dt, time, audio) {
  // Clamp dt to prevent explosion on tab switch
  dt = Math.min(dt, 0.05);

  // Auto-cycle formations every 15 seconds
  formationTimer += dt;
  if (formationTimer > 15) {
    formationTimer = 0;
    formationIndex = (formationIndex + 1) % FORMATIONS.length;
    currentFormation = FORMATIONS[formationIndex];
  }

  // Update home positions for current formation
  setFormation(currentFormation, time);

  // Global forces
  const breathe = Math.sin(time * 0.8) * 0.1;
  const bassKick = audio.bass > 0.6 ? (audio.bass - 0.6) * 5 : 0;
  const midPulse = audio.mid * 0.3;

  // Decay gesture velocities
  gestureState.rotVelX *= 0.96;
  gestureState.rotVelY *= 0.96;
  gestureState.swipeVelX *= 0.94;
  gestureState.swipeVelY *= 0.94;
  gestureState.impulseX *= 0.9;
  gestureState.impulseY *= 0.9;
  gestureState.impulseZ *= 0.9;
  gestureState.shockwave *= 0.92;

  // Smooth pinch scale
  gestureState.pinchScale += (gestureState.pinchTarget - gestureState.pinchScale) * 0.1;

  for (let i = 0; i < NUM_CUBES; i++) {
    const cube = cubePhysics[i];
    const idx = i / NUM_CUBES;

    // ══════════════════════════════════════════════════════════════════
    // SPRING FORCE - Pull toward home position
    // ══════════════════════════════════════════════════════════════════
    const dx = cube.homeX - cube.x;
    const dy = cube.homeY - cube.y;
    const dz = cube.homeZ - cube.z;

    const springForce = cube.springK * (1 + bassKick * 0.5);
    cube.vx += dx * springForce * dt;
    cube.vy += dy * springForce * dt;
    cube.vz += dz * springForce * dt;

    // ══════════════════════════════════════════════════════════════════
    // ACCELEROMETER INFLUENCE
    // ══════════════════════════════════════════════════════════════════
    const tiltInfluence = 1.5 * (1 - idx * 0.5); // Closer cubes more affected
    cube.vx += rotationY * tiltInfluence * dt * 2;
    cube.vy += rotationX * tiltInfluence * dt * 2;

    // ══════════════════════════════════════════════════════════════════
    // GESTURE FORCES
    // ══════════════════════════════════════════════════════════════════
    // Swipe creates wave through cubes
    const swipeDelay = idx * 0.3;
    const swipePhase = Math.sin(time * 4 - swipeDelay);
    cube.vx += gestureState.swipeVelX * swipePhase * 0.5;
    cube.vy += gestureState.swipeVelY * swipePhase * 0.5;

    // Pinch affects scale velocity
    const pinchDelta = gestureState.pinchTarget - 1.0;
    cube.scaleVel += pinchDelta * dt * 2;

    // Impulse (from pinch squeeze/spread)
    cube.vx += gestureState.impulseX * (1 - idx) * dt * 3;
    cube.vy += gestureState.impulseY * (1 - idx) * dt * 3;
    cube.vz += gestureState.impulseZ * (1 - idx) * dt * 3;

    // Shockwave from double-tap
    if (gestureState.shockwave > 0.01) {
      const shockDist = Math.sqrt(
        Math.pow(cube.x - gestureState.shockwaveOrigin[0], 2) +
        Math.pow(cube.y - gestureState.shockwaveOrigin[1], 2)
      );
      const shockForce = gestureState.shockwave * 3 / (1 + shockDist * 0.5);
      const shockAngle = Math.atan2(
        cube.y - gestureState.shockwaveOrigin[1],
        cube.x - gestureState.shockwaveOrigin[0]
      );
      cube.vx += Math.cos(shockAngle) * shockForce * dt;
      cube.vy += Math.sin(shockAngle) * shockForce * dt;
      cube.vz -= shockForce * 0.3 * dt;
    }

    // ══════════════════════════════════════════════════════════════════
    // AUDIO-REACTIVE FORCES
    // ══════════════════════════════════════════════════════════════════
    // Bass makes cubes punch outward from center
    if (bassKick > 0) {
      const distFromCenter = Math.sqrt(cube.x * cube.x + cube.y * cube.y);
      const angle = Math.atan2(cube.y, cube.x);
      cube.vx += Math.cos(angle) * bassKick * 0.8 / (1 + distFromCenter * 0.2);
      cube.vy += Math.sin(angle) * bassKick * 0.8 / (1 + distFromCenter * 0.2);
      cube.vz += bassKick * 0.3;
    }

    // Mids create rotation speed boost
    cube.rotVelX += audio.mid * 0.02;
    cube.rotVelY += audio.mid * 0.015;

    // Highs create jitter
    const jitter = audio.high * 0.15;
    cube.vx += (Math.random() - 0.5) * jitter;
    cube.vy += (Math.random() - 0.5) * jitter;

    // ══════════════════════════════════════════════════════════════════
    // INTER-CUBE FORCES (dancing together)
    // ══════════════════════════════════════════════════════════════════
    // Subtle alignment - cubes near each other rotate similarly
    const waveInfluence = Math.sin(time * 3 + idx * 10) * 0.02;
    cube.rotVelX += waveInfluence;
    cube.rotVelY += waveInfluence * 0.7;

    // ══════════════════════════════════════════════════════════════════
    // INTEGRATION
    // ══════════════════════════════════════════════════════════════════
    // Position
    cube.x += cube.vx * dt;
    cube.y += cube.vy * dt;
    cube.z += cube.vz * dt;

    // Rotation
    cube.rotX += cube.rotVelX + gestureState.rotVelX * 0.3;
    cube.rotY += cube.rotVelY + gestureState.rotVelY * 0.3;

    // Scale with breathing
    const targetScale = (0.3 + (1 - idx) * 0.5) * gestureState.pinchScale * (1 + breathe);
    cube.scaleVel += (targetScale - cube.scale) * 5 * dt;
    cube.scaleVel *= 0.9; // Scale damping
    cube.scale += cube.scaleVel * dt;
    cube.scale = Math.max(0.1, Math.min(2.0, cube.scale));

    // ══════════════════════════════════════════════════════════════════
    // DAMPING
    // ══════════════════════════════════════════════════════════════════
    const damping = cube.damping - audio.energy * 0.05; // More energy = less damping
    cube.vx *= damping;
    cube.vy *= damping;
    cube.vz *= damping;
    cube.rotVelX *= 0.98;
    cube.rotVelY *= 0.98;
  }
}

/* ================================================================== */
/*  CUBE GENERATION - From Physics State                               */
/* ================================================================== */

function generateCubeInstances(time, audio, rot4d) {
  let count = 0;

  // Global effects
  const heartbeat = Math.pow(Math.sin(time * 2.5), 8) * 0.3;

  for (let i = 0; i < NUM_CUBES && count < MAX_CUBES; i++) {
    const cube = cubePhysics[i];
    const idx = i / NUM_CUBES;

    // Build model matrix from physics state
    let model = mat4Translate(cube.x, cube.y, cube.z);
    model = mat4Multiply(model, mat4RotateX(cube.rotX));
    model = mat4Multiply(model, mat4RotateY(cube.rotY));
    model = mat4Multiply(model, mat4RotateZ(cube.phase + time * 0.05));
    model = mat4Multiply(model, mat4Scale(cube.scale));

    const offset = count * INSTANCE_STRIDE;
    for (let j = 0; j < 16; j++) instanceData[offset + j] = model[j];

    // Brightness based on depth and audio
    const depthBrightness = 0.5 + (1 - idx) * 1.0;
    instanceData[offset + 16] = depthBrightness * (1 + audio.bass * 0.4 + heartbeat);

    // Hue shift - varies by position and audio
    instanceData[offset + 17] = audio.mid * 0.3 + idx * 0.2 + Math.sin(time * 0.2 + i) * 0.1;

    // W coordinate for 4D rotation - oscillates based on physics
    const wBase = Math.sin(cube.phase + time * 0.3) * 1.5;
    const wAudio = audio.bass * 0.8;
    instanceData[offset + 18] = wBase + wAudio + (cube.scale - 0.5) * 0.5;

    count++;
  }

  return count;
}

/* ================================================================== */
/*  SPLAT GENERATION                                                   */
/* ================================================================== */

function generateSplats(time, audio) {
  let count = 0;
  const N = 25000;

  for (let i = 0; i < N && count < MAX_SPLATS; i++) {
    const t = i / N;
    const angle = t * Math.PI * 18 + time * 0.15;
    const radius = 0.4 + t * 6;
    const z = -28 + t * 30;

    const x = Math.cos(angle) * radius * (0.4 + Math.random() * 0.6);
    const y = Math.sin(angle) * radius * (0.4 + Math.random() * 0.6);

    const hue = t + audio.mid * 0.25;
    const r = 0.2 + Math.sin(hue * 6.28) * 0.25 + audio.bass * 0.25;
    const g = 0.3 + Math.sin(hue * 6.28 + 2.09) * 0.25;
    const b = 0.6 + Math.sin(hue * 6.28 + 4.18) * 0.3 + audio.high * 0.25;

    const size = (0.015 + Math.random() * 0.03) * (1 + audio.energy * 0.4);

    const off = count * 7;
    splatData[off] = x;
    splatData[off+1] = y;
    splatData[off+2] = z;
    splatData[off+3] = r;
    splatData[off+4] = g;
    splatData[off+5] = b;
    splatData[off+6] = size;
    count++;
  }

  return count;
}

/* ================================================================== */
/*  RENDER                                                             */
/* ================================================================== */

const startTime = performance.now();
let lastFrameTime = startTime;
const hud = document.getElementById('hud');

// 4D rotation state
let rot4d = { xw: 0, yw: 0, zw: 0 };

// Animated moiré scale
let moirePhase = 0;

function render() {
  requestAnimationFrame(render);

  const now = performance.now();
  const time = (now - startTime) * 0.001;
  const dt = (now - lastFrameTime) * 0.001;
  lastFrameTime = now;
  const audio = getAudioLevels();

  // ═══════════════════════════════════════════════════════════════════
  // PHYSICS SIMULATION
  // ═══════════════════════════════════════════════════════════════════
  updatePhysics(dt, time, audio);

  // Smooth rotation interpolation
  rotationX += (targetRotX - rotationX) * 0.08;
  rotationY += (targetRotY - rotationY) * 0.08;

  // 4D rotations driven by accelerometer + time + gesture momentum
  rot4d.xw = rotationX * 0.5 + Math.sin(time * 0.15) * 0.3 + audio.bass * 0.4 + gestureState.rotVelX * 2;
  rot4d.yw = rotationY * 0.5 + Math.cos(time * 0.12) * 0.25 + audio.mid * 0.3 + gestureState.rotVelY * 2;
  rot4d.zw = Math.sin(time * 0.1) * 0.2 + audio.high * 0.2 + gestureState.shockwave * 0.5;

  // Animated moiré
  moirePhase = 1.01 + Math.sin(time * 1.5) * 0.005 + Math.sin(time * 0.7) * 0.003;

  // Glitch from high frequencies
  const glitch = 0.1 + audio.high * 0.5;

  // Update camera texture
  if (videoReady && video.readyState >= 2) {
    gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  // View/projection
  const aspect = canvas.width / canvas.height;
  const proj = mat4Perspective(70 * Math.PI / 180, aspect, 0.1, 100);
  const view = mat4LookAt([0, 0, 5], [0, 0, -10], [0, 1, 0]);
  const viewProj = mat4Multiply(proj, view);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.01, 0.03, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // --- Background moiré ---
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(bgProgram);
  gl.uniform1f(bgLocs.u_time, time);
  gl.uniform2f(bgLocs.u_resolution, canvas.width, canvas.height);
  gl.uniform1f(bgLocs.u_rotX, rotationX);
  gl.uniform1f(bgLocs.u_rotY, rotationY);
  gl.uniform1f(bgLocs.u_rotXW, rot4d.xw);
  gl.uniform1f(bgLocs.u_rotYW, rot4d.yw);
  gl.uniform1f(bgLocs.u_rotZW, rot4d.zw);
  gl.uniform1f(bgLocs.u_dimension, 3.5);
  gl.uniform1f(bgLocs.u_bass, audio.bass);
  gl.uniform1f(bgLocs.u_mid, audio.mid);
  gl.uniform1f(bgLocs.u_gridDensity, 12);
  gl.uniform1f(bgLocs.u_moireScale, moirePhase);

  gl.bindVertexArray(bgVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // --- Cubes ---
  gl.enable(gl.DEPTH_TEST);
  const cubeCount = generateCubeInstances(time, audio, rot4d);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

  gl.useProgram(cubeProgram);
  gl.uniformMatrix4fv(cubeLocs.u_viewProj, false, viewProj);
  gl.uniform1i(cubeLocs.u_cameraTexture, 0);
  gl.uniform1f(cubeLocs.u_time, time);
  gl.uniform1f(cubeLocs.u_bass, audio.bass);
  gl.uniform1f(cubeLocs.u_energy, audio.energy);
  gl.uniform1f(cubeLocs.u_glitch, glitch);
  gl.uniform1f(cubeLocs.u_moireScale, moirePhase);
  gl.uniform1f(cubeLocs.u_rotXW, rot4d.xw);
  gl.uniform1f(cubeLocs.u_rotYW, rot4d.yw);
  gl.uniform1f(cubeLocs.u_rotZW, rot4d.zw);
  gl.uniform1f(cubeLocs.u_dimension, 3.5);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cameraTexture);

  gl.bindVertexArray(cubeVAO);
  gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, cubeCount);

  // --- Splats ---
  const splatCount = generateSplats(time, audio);

  gl.bindBuffer(gl.ARRAY_BUFFER, splatVBO);
  gl.bufferData(gl.ARRAY_BUFFER, splatData, gl.DYNAMIC_DRAW);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);

  gl.useProgram(splatProgram);
  gl.uniformMatrix4fv(splatLocs.u_viewProj, false, viewProj);
  gl.uniform1f(splatLocs.u_pointScale, canvas.height * 0.5);

  gl.bindVertexArray(splatVAO);
  gl.drawArrays(gl.POINTS, 0, splatCount);

  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // HUD
  if (hud) {
    const cam = videoReady ? 'CAM' : 'NO-CAM';
    const acc = accelEnabled ? 'GYRO' : 'MOUSE';
    const formTime = Math.ceil(15 - formationTimer);
    hud.textContent = `${cubeCount} cubes | ${currentFormation} (${formTime}s) | ${cam} | ${acc} | 4D: ${rot4d.xw.toFixed(1)},${rot4d.yw.toFixed(1)},${rot4d.zw.toFixed(1)}`;
  }
}

/* ================================================================== */
/*  START                                                              */
/* ================================================================== */

document.getElementById('startBtn').addEventListener('click', async () => {
  document.getElementById('startOverlay').classList.add('hidden');

  // Request accelerometer permission on iOS
  initAccelerometer();

  await Promise.all([startCamera(), initAudio()]);

  requestAnimationFrame(render);
});

// Handle resize
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
});

// Keyboard controls
window.addEventListener('keydown', (e) => {
  switch(e.key) {
    case '1': case '2': case '3': case '4': case '5': case '6':
      // Number keys switch formations
      formationIndex = parseInt(e.key) - 1;
      currentFormation = FORMATIONS[formationIndex];
      formationTimer = 0;
      break;
    case ' ':
      // Space creates shockwave at center
      gestureState.shockwave = 1.0;
      gestureState.shockwaveOrigin = [0, 0];
      break;
    case 'ArrowLeft':
      gestureState.swipeVelX = -2;
      break;
    case 'ArrowRight':
      gestureState.swipeVelX = 2;
      break;
    case 'ArrowUp':
      gestureState.swipeVelY = 2;
      break;
    case 'ArrowDown':
      gestureState.swipeVelY = -2;
      break;
    case 'z':
    case 'Z':
      // Zoom in
      gestureState.pinchTarget = Math.min(3.0, gestureState.pinchTarget * 1.2);
      gestureState.impulseZ += 0.5;
      break;
    case 'x':
    case 'X':
      // Zoom out
      gestureState.pinchTarget = Math.max(0.3, gestureState.pinchTarget * 0.8);
      gestureState.impulseZ -= 0.5;
      break;
  }
});
