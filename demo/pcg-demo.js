import { ProceduralGaussianStream } from '../src/render/ProceduralGaussianStream.js';
import { ProceduralTraversalScheduler } from '../src/render/ProceduralTraversalScheduler.js';
import { encodeGaussianSeeds, GAUSSIAN_SEED_STRIDE } from '../src/render/GaussianSeedBuffer.js';

const canvas = document.getElementById('pcgCanvas');
const gl = canvas.getContext('webgl2');
const ctx = gl ? null : canvas.getContext('2d');

const depthValue = document.getElementById('depthValue');
const batchValue = document.getElementById('batchValue');
const seedValue = document.getElementById('seedValue');

const stream = new ProceduralGaussianStream({ maxDepth: 2, stepDistance: 0.9 });
const scheduler = new ProceduralTraversalScheduler({ stream });

let pointer = { x: canvas.width / 2, y: canvas.height / 2 };
let lastPointer = { ...pointer };

const center = () => ({ x: canvas.width / 2, y: canvas.height / 2 });

const toCanvas = (position, scale) => {
  const { x: cx, y: cy } = center();
  const x = cx + position[0] * 140;
  const y = cy + position[1] * 140;
  return { x, y, r: Math.max(1.5, scale * 3) };
};

const getSeedAt = (buffer, index) => {
  const offset = index * GAUSSIAN_SEED_STRIDE;
  return {
    position: [buffer[offset], buffer[offset + 1], buffer[offset + 2]],
    scale: buffer[offset + 3],
    depth: buffer[offset + 11]
  };
};

const createShader = (type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
};

const createProgram = () => {
  const vertex = createShader(gl.VERTEX_SHADER, `#version 300 es
  in vec2 a_position;
  in float a_depth;
  uniform float u_pointSize;
  out float v_depth;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    gl_PointSize = u_pointSize;
    v_depth = a_depth;
  }
  `);

  const fragment = createShader(gl.FRAGMENT_SHADER, `#version 300 es
  precision highp float;
  in float v_depth;
  out vec4 outColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = smoothstep(0.5, 0.0, dist) * (1.0 - v_depth * 0.12);
    outColor = vec4(0.55, 0.78, 1.0, alpha);
  }
  `);

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
};

let program = null;
let vao = null;
let buffer = null;
let depthBuffer = null;
let positionLocation = null;
let depthLocation = null;
let pointSizeUniform = null;

const initWebGL = () => {
  program = createProgram();
  positionLocation = gl.getAttribLocation(program, 'a_position');
  depthLocation = gl.getAttribLocation(program, 'a_depth');
  pointSizeUniform = gl.getUniformLocation(program, 'u_pointSize');

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  depthBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, depthBuffer);
  gl.enableVertexAttribArray(depthLocation);
  gl.vertexAttribPointer(depthLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
};

const renderSeeds2D = (buffer, count) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(140, 200, 255, 0.75)';
  ctx.strokeStyle = 'rgba(120, 170, 240, 0.3)';

  for (let i = 0; i < count; i += 1) {
    const seed = getSeedAt(buffer, i);
    const { x, y, r } = toCanvas(seed.position, seed.scale);
    const alpha = Math.max(0.1, 1 - seed.depth * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(140, 200, 255, ${alpha})`;
    ctx.fill();
    ctx.stroke();
  }
};

const renderSeedsWebGL = (buffer, count) => {
  const positions = new Float32Array(count * 2);
  const depths = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const seed = getSeedAt(buffer, i);
    const x = seed.position[0] / 3;
    const y = seed.position[1] / 3;
    const index = i * 2;
    positions[index] = x;
    positions[index + 1] = y;
    depths[i] = seed.depth;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.02, 0.04, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, depthBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, depths, gl.DYNAMIC_DRAW);

  gl.uniform1f(pointSizeUniform, 14.0);
  gl.drawArrays(gl.POINTS, 0, count);
  gl.bindVertexArray(null);
};

const tick = () => {
  const { x: cx, y: cy } = center();
  const dx = pointer.x - cx;
  const dy = pointer.y - cy;
  const dist = Math.min(Math.hypot(dx, dy), 320);
  const focus = 1 - dist / 320;
  const motion = Math.min(Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) / 20, 4);

  const result = scheduler.nextFrame({ focus, motion });
  const encoded = encodeGaussianSeeds(result.seeds);
  const seedCount = result.seeds.length;
  if (gl) {
    renderSeedsWebGL(encoded, seedCount);
  } else {
    renderSeeds2D(encoded, seedCount);
  }

  depthValue.textContent = result.maxDepth.toString();
  batchValue.textContent = result.batchSize.toString();
  seedValue.textContent = seedCount.toString();

  lastPointer = { ...pointer };
  requestAnimationFrame(tick);
};

canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointer = {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
});

canvas.addEventListener('pointerleave', () => {
  pointer = { ...center() };
});

if (gl) {
  initWebGL();
}
tick();
