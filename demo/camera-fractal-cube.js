/**
 * VIB3+ Camera Fractal Vortex
 *
 * VISIBLE camera-textured cubes in a fractal spiral vortex.
 * - Actual camera texture on cube faces you can SEE
 * - Fractal spiral using plastic ratio
 * - Audio-reactive rotation and glow
 * - Splat particle effects around cubes
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
/*  SHADERS - Camera Textured Cubes                                    */
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

uniform mat4 u_viewProj;
uniform float u_time;

out vec2 v_uv;
out vec3 v_normal;
out float v_brightness;
out float v_hueShift;
out float v_depth;

void main() {
  vec4 worldPos = a_model * vec4(a_position, 1.0);
  gl_Position = u_viewProj * worldPos;
  v_uv = a_uv;
  v_normal = mat3(a_model) * a_normal;
  v_brightness = a_brightness;
  v_hueShift = a_hueShift;
  v_depth = -worldPos.z * 0.02; // For fog
}
`;

const cubeFS = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_normal;
in float v_brightness;
in float v_hueShift;
in float v_depth;

uniform sampler2D u_cameraTexture;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;

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

void main() {
  // Sample camera texture
  vec3 camColor = texture(u_cameraTexture, v_uv).rgb;

  // Apply hue shift from audio mid
  if (v_hueShift > 0.01) {
    camColor = hueShift(camColor, v_hueShift);
  }

  // Simple lighting
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
  float ambient = 0.4;
  float light = ambient + diffuse * 0.6;

  // Bass-reactive glow
  float glow = 1.0 + u_bass * 0.5;

  // Apply lighting and brightness
  vec3 color = camColor * light * v_brightness * glow;

  // Edge glow effect
  float edgeFactor = 1.0 - abs(dot(normalize(v_normal), vec3(0.0, 0.0, 1.0)));
  color += vec3(0.3, 0.6, 1.0) * pow(edgeFactor, 3.0) * u_energy * 0.5;

  // Depth fog toward black
  color = mix(color, vec3(0.0), clamp(v_depth, 0.0, 0.95));

  fragColor = vec4(color, 1.0);
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
uniform float u_time;
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
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(vs, fs, attribs) {
  const vsh = createShader(gl.VERTEX_SHADER, vs);
  const fsh = createShader(gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  if (attribs) {
    attribs.forEach((name, idx) => gl.bindAttribLocation(prog, idx, name));
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  return prog;
}

// Cube program
const cubeProgram = createProgram(cubeVS, cubeFS);
const cubeLocs = {
  a_position: gl.getAttribLocation(cubeProgram, 'a_position'),
  a_uv: gl.getAttribLocation(cubeProgram, 'a_uv'),
  a_normal: gl.getAttribLocation(cubeProgram, 'a_normal'),
  a_model: gl.getAttribLocation(cubeProgram, 'a_model'),
  a_brightness: gl.getAttribLocation(cubeProgram, 'a_brightness'),
  a_hueShift: gl.getAttribLocation(cubeProgram, 'a_hueShift'),
  u_viewProj: gl.getUniformLocation(cubeProgram, 'u_viewProj'),
  u_cameraTexture: gl.getUniformLocation(cubeProgram, 'u_cameraTexture'),
  u_time: gl.getUniformLocation(cubeProgram, 'u_time'),
  u_bass: gl.getUniformLocation(cubeProgram, 'u_bass'),
  u_energy: gl.getUniformLocation(cubeProgram, 'u_energy'),
};

// Splat program
const splatProgram = createProgram(splatVS, splatFS);
const splatLocs = {
  a_position: gl.getAttribLocation(splatProgram, 'a_position'),
  a_color: gl.getAttribLocation(splatProgram, 'a_color'),
  a_size: gl.getAttribLocation(splatProgram, 'a_size'),
  u_viewProj: gl.getUniformLocation(splatProgram, 'u_viewProj'),
  u_time: gl.getUniformLocation(splatProgram, 'u_time'),
  u_pointScale: gl.getUniformLocation(splatProgram, 'u_pointScale'),
};

/* ================================================================== */
/*  CUBE GEOMETRY                                                      */
/* ================================================================== */

// Positions, UVs, Normals for a unit cube centered at origin
const cubeVertices = new Float32Array([
  // Front face (Z+)
  -0.5, -0.5,  0.5,  0, 0,  0, 0, 1,
   0.5, -0.5,  0.5,  1, 0,  0, 0, 1,
   0.5,  0.5,  0.5,  1, 1,  0, 0, 1,
  -0.5,  0.5,  0.5,  0, 1,  0, 0, 1,
  // Back face (Z-)
   0.5, -0.5, -0.5,  0, 0,  0, 0, -1,
  -0.5, -0.5, -0.5,  1, 0,  0, 0, -1,
  -0.5,  0.5, -0.5,  1, 1,  0, 0, -1,
   0.5,  0.5, -0.5,  0, 1,  0, 0, -1,
  // Top face (Y+)
  -0.5,  0.5,  0.5,  0, 0,  0, 1, 0,
   0.5,  0.5,  0.5,  1, 0,  0, 1, 0,
   0.5,  0.5, -0.5,  1, 1,  0, 1, 0,
  -0.5,  0.5, -0.5,  0, 1,  0, 1, 0,
  // Bottom face (Y-)
  -0.5, -0.5, -0.5,  0, 0,  0, -1, 0,
   0.5, -0.5, -0.5,  1, 0,  0, -1, 0,
   0.5, -0.5,  0.5,  1, 1,  0, -1, 0,
  -0.5, -0.5,  0.5,  0, 1,  0, -1, 0,
  // Right face (X+)
   0.5, -0.5,  0.5,  0, 0,  1, 0, 0,
   0.5, -0.5, -0.5,  1, 0,  1, 0, 0,
   0.5,  0.5, -0.5,  1, 1,  1, 0, 0,
   0.5,  0.5,  0.5,  0, 1,  1, 0, 0,
  // Left face (X-)
  -0.5, -0.5, -0.5,  0, 0,  -1, 0, 0,
  -0.5, -0.5,  0.5,  1, 0,  -1, 0, 0,
  -0.5,  0.5,  0.5,  1, 1,  -1, 0, 0,
  -0.5,  0.5, -0.5,  0, 1,  -1, 0, 0,
]);

const cubeIndices = new Uint16Array([
  0, 1, 2, 0, 2, 3,       // Front
  4, 5, 6, 4, 6, 7,       // Back
  8, 9, 10, 8, 10, 11,    // Top
  12, 13, 14, 12, 14, 15, // Bottom
  16, 17, 18, 16, 18, 19, // Right
  20, 21, 22, 20, 22, 23, // Left
]);

// Create buffers
const cubeVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

const cubeEBO = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeEBO);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeIndices, gl.STATIC_DRAW);

// Instance data buffer (will be updated each frame)
const MAX_CUBES = 500;
const INSTANCE_STRIDE = 18; // 16 for mat4 + 1 brightness + 1 hueShift
const instanceData = new Float32Array(MAX_CUBES * INSTANCE_STRIDE);
const instanceVBO = gl.createBuffer();

// Create VAO for cubes
const cubeVAO = gl.createVertexArray();
gl.bindVertexArray(cubeVAO);

// Vertex attributes
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.enableVertexAttribArray(cubeLocs.a_position);
gl.vertexAttribPointer(cubeLocs.a_position, 3, gl.FLOAT, false, 32, 0);
gl.enableVertexAttribArray(cubeLocs.a_uv);
gl.vertexAttribPointer(cubeLocs.a_uv, 2, gl.FLOAT, false, 32, 12);
gl.enableVertexAttribArray(cubeLocs.a_normal);
gl.vertexAttribPointer(cubeLocs.a_normal, 3, gl.FLOAT, false, 32, 20);

// Instance attributes
gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
const bytesPerInstance = INSTANCE_STRIDE * 4;

// Model matrix (4 vec4s)
for (let i = 0; i < 4; i++) {
  const loc = cubeLocs.a_model + i;
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytesPerInstance, i * 16);
  gl.vertexAttribDivisor(loc, 1);
}

// Brightness
gl.enableVertexAttribArray(cubeLocs.a_brightness);
gl.vertexAttribPointer(cubeLocs.a_brightness, 1, gl.FLOAT, false, bytesPerInstance, 64);
gl.vertexAttribDivisor(cubeLocs.a_brightness, 1);

// Hue shift
gl.enableVertexAttribArray(cubeLocs.a_hueShift);
gl.vertexAttribPointer(cubeLocs.a_hueShift, 1, gl.FLOAT, false, bytesPerInstance, 68);
gl.vertexAttribDivisor(cubeLocs.a_hueShift, 1);

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeEBO);
gl.bindVertexArray(null);

/* ================================================================== */
/*  SPLAT GEOMETRY                                                     */
/* ================================================================== */

const MAX_SPLATS = 50000;
const splatData = new Float32Array(MAX_SPLATS * 7); // x,y,z, r,g,b, size
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

// Initialize with placeholder
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
  new Uint8Array([128, 128, 128, 255]));

/* ================================================================== */
/*  AUDIO ANALYSIS                                                     */
/* ================================================================== */

let audioCtx = null;
let analyser = null;
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
    audioEnabled = false;
  }
}

function getAudioLevels() {
  if (!audioEnabled || !analyser) {
    return { bass: 0, mid: 0, high: 0, energy: 0 };
  }
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
/*  CAMERA FEED                                                        */
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
    console.log('Camera started:', video.videoWidth, 'x', video.videoHeight);
  } catch (e) {
    console.warn('Camera unavailable:', e);
    videoReady = false;
  }
}

/* ================================================================== */
/*  MATRIX HELPERS                                                     */
/* ================================================================== */

function mat4Identity() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

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
  let len = 1/Math.sqrt(zx*zx + zy*zy + zz*zz);
  const z = [zx*len, zy*len, zz*len];
  const xx = up[1]*z[2] - up[2]*z[1], xy = up[2]*z[0] - up[0]*z[2], xz = up[0]*z[1] - up[1]*z[0];
  len = 1/Math.sqrt(xx*xx + xy*xy + xz*xz);
  const x = [xx*len, xy*len, xz*len];
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]), 1
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j*4+i] = a[i]*b[j*4] + a[i+4]*b[j*4+1] + a[i+8]*b[j*4+2] + a[i+12]*b[j*4+3];
    }
  }
  return out;
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
/*  GENERATE FRACTAL CUBES                                             */
/* ================================================================== */

function generateCubeInstances(time, audio) {
  let count = 0;

  // 4 spiral arms emerging from center
  const ARMS = 4;
  const CUBES_PER_ARM = 30;

  for (let arm = 0; arm < ARMS; arm++) {
    const armAngle = (arm / ARMS) * Math.PI * 2;

    for (let i = 0; i < CUBES_PER_ARM; i++) {
      if (count >= MAX_CUBES) break;

      // Spiral outward using plastic ratio
      const t = i / CUBES_PER_ARM;
      const scale = Math.pow(PLASTIC, i * 0.5);
      const spiralAngle = armAngle + i * (Math.PI * 2 / (PLASTIC * 3));

      // Position: spiral out and toward camera
      const radius = 0.3 + t * 4;
      const x = Math.cos(spiralAngle) * radius;
      const y = Math.sin(spiralAngle) * radius;
      const z = -20 + t * 22; // Start far, come toward camera

      // Size: larger toward camera (inverse plastic ratio)
      const cubeScale = 0.15 + t * 0.8;

      // Audio-reactive rotation
      const rotSpeed = 0.3 + audio.bass * 0.5;
      const rotX = time * rotSpeed * (0.5 + i * 0.1) + i * 0.3;
      const rotY = time * rotSpeed * (0.3 + i * 0.15) + arm;
      const rotZ = time * rotSpeed * 0.2;

      // Build model matrix
      let model = mat4Translate(x, y, z);
      model = mat4Multiply(model, mat4RotateX(rotX));
      model = mat4Multiply(model, mat4RotateY(rotY));
      model = mat4Multiply(model, mat4RotateZ(rotZ));
      model = mat4Multiply(model, mat4Scale(cubeScale));

      // Write to instance buffer
      const offset = count * INSTANCE_STRIDE;
      for (let j = 0; j < 16; j++) {
        instanceData[offset + j] = model[j];
      }

      // Brightness: fade with depth, boost with bass
      const brightness = (0.3 + t * 0.7) * (1 + audio.bass * 0.5);
      instanceData[offset + 16] = brightness;

      // Hue shift from mid frequencies
      instanceData[offset + 17] = audio.mid * 0.3;

      count++;
    }
  }

  // Center cube (largest, closest)
  if (count < MAX_CUBES) {
    const offset = count * INSTANCE_STRIDE;
    let model = mat4Translate(0, 0, 2);
    const rotX = time * 0.1 + audio.bass * 0.3;
    const rotY = time * 0.15;
    model = mat4Multiply(model, mat4RotateX(rotX));
    model = mat4Multiply(model, mat4RotateY(rotY));
    const centerScale = 1.2 + audio.bass * 0.3;
    model = mat4Multiply(model, mat4Scale(centerScale));
    for (let j = 0; j < 16; j++) {
      instanceData[offset + j] = model[j];
    }
    instanceData[offset + 16] = 1.5; // Bright
    instanceData[offset + 17] = audio.mid * 0.2;
    count++;
  }

  return count;
}

/* ================================================================== */
/*  GENERATE SPLAT PARTICLES                                           */
/* ================================================================== */

function generateSplats(time, audio) {
  let count = 0;
  const PARTICLE_COUNT = 30000;

  for (let i = 0; i < PARTICLE_COUNT && count < MAX_SPLATS; i++) {
    const t = i / PARTICLE_COUNT;
    const angle = t * Math.PI * 20 + time * 0.2;
    const radius = 0.5 + t * 6;
    const z = -25 + t * 28;

    const x = Math.cos(angle) * radius * (0.5 + Math.random() * 0.5);
    const y = Math.sin(angle) * radius * (0.5 + Math.random() * 0.5);

    // Color: cyan to magenta based on position
    const hue = t + audio.mid * 0.3;
    const r = 0.3 + Math.sin(hue * 6.28) * 0.3 + audio.bass * 0.3;
    const g = 0.4 + Math.sin(hue * 6.28 + 2.09) * 0.3;
    const b = 0.7 + Math.sin(hue * 6.28 + 4.18) * 0.3 + audio.high * 0.3;

    const size = (0.02 + Math.random() * 0.04) * (1 + audio.energy * 0.5);

    const offset = count * 7;
    splatData[offset] = x;
    splatData[offset + 1] = y;
    splatData[offset + 2] = z;
    splatData[offset + 3] = r;
    splatData[offset + 4] = g;
    splatData[offset + 5] = b;
    splatData[offset + 6] = size;
    count++;
  }

  return count;
}

/* ================================================================== */
/*  RENDER LOOP                                                        */
/* ================================================================== */

const startTime = performance.now();
const hud = document.getElementById('hud');

function render() {
  requestAnimationFrame(render);

  const now = performance.now();
  const time = (now - startTime) * 0.001;
  const audio = getAudioLevels();

  // Update camera texture from video
  if (videoReady && video.readyState >= 2) {
    gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  // Camera: fixed, looking into the vortex
  const aspect = canvas.width / canvas.height;
  const proj = mat4Perspective(70 * Math.PI / 180, aspect, 0.1, 100);
  const view = mat4LookAt([0, 0, 5], [0, 0, -10], [0, 1, 0]);
  const viewProj = mat4Multiply(proj, view);

  // Clear
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.02, 0.05, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  // Generate and render cubes
  const cubeCount = generateCubeInstances(time, audio);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

  gl.useProgram(cubeProgram);
  gl.uniformMatrix4fv(cubeLocs.u_viewProj, false, viewProj);
  gl.uniform1i(cubeLocs.u_cameraTexture, 0);
  gl.uniform1f(cubeLocs.u_time, time);
  gl.uniform1f(cubeLocs.u_bass, audio.bass);
  gl.uniform1f(cubeLocs.u_energy, audio.energy);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cameraTexture);

  gl.bindVertexArray(cubeVAO);
  gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, cubeCount);

  // Generate and render splats
  const splatCount = generateSplats(time, audio);

  gl.bindBuffer(gl.ARRAY_BUFFER, splatVBO);
  gl.bufferData(gl.ARRAY_BUFFER, splatData, gl.DYNAMIC_DRAW);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.depthMask(false);

  gl.useProgram(splatProgram);
  gl.uniformMatrix4fv(splatLocs.u_viewProj, false, viewProj);
  gl.uniform1f(splatLocs.u_time, time);
  gl.uniform1f(splatLocs.u_pointScale, canvas.height * 0.5);

  gl.bindVertexArray(splatVAO);
  gl.drawArrays(gl.POINTS, 0, splatCount);

  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // HUD
  if (hud) {
    const status = videoReady ? 'CAM ON' : 'NO CAM';
    hud.textContent = `${cubeCount} cubes | ${(splatCount/1000).toFixed(0)}K particles | ${status} | bass:${(audio.bass*100).toFixed(0)}`;
  }
}

/* ================================================================== */
/*  START                                                              */
/* ================================================================== */

document.getElementById('startBtn').addEventListener('click', async () => {
  document.getElementById('startOverlay').classList.add('hidden');

  await Promise.all([
    startCamera(),
    initAudio()
  ]);

  requestAnimationFrame(render);
});
