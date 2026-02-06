import { ProceduralGaussianStream } from '../src/render/ProceduralGaussianStream.js';
import { ProceduralTraversalScheduler } from '../src/render/ProceduralTraversalScheduler.js';
import { GaussianSplatRenderer } from '../src/render/GaussianSplatRenderer.js';
import { ProceduralRenderLoop } from '../src/render/ProceduralRenderLoop.js';

const canvas = document.getElementById('pcgCanvas');
const gl = canvas.getContext('webgl2');
if (!gl) {
  throw new Error('WebGL2 is required for this demo.');
}

const depthValue = document.getElementById('depthValue');
const batchValue = document.getElementById('batchValue');
const seedValue = document.getElementById('seedValue');

const stream = new ProceduralGaussianStream({ maxDepth: 2, stepDistance: 0.9 });
const scheduler = new ProceduralTraversalScheduler({ stream });

let pointer = { x: canvas.width / 2, y: canvas.height / 2 };
let lastPointer = { ...pointer };

const center = () => ({ x: canvas.width / 2, y: canvas.height / 2 });

const renderer = new GaussianSplatRenderer(gl, { pointScale: 18 });

const loop = new ProceduralRenderLoop({
  scheduler,
  renderer,
  focusProvider: () => {
    const { x: cx, y: cy } = center();
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const dist = Math.min(Math.hypot(dx, dy), 320);
    return 1 - dist / 320;
  },
  motionProvider: () => Math.min(Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) / 20, 4),
  raf: (callback) => requestAnimationFrame(() => {
    lastPointer = { ...pointer };
    callback();
  })
});

const updateStats = () => {
  const { maxDepth, batchSize } = scheduler.policy.compute({
    focus: loop.focusProvider(),
    motion: loop.motionProvider()
  });
  depthValue.textContent = maxDepth.toString();
  batchValue.textContent = batchSize.toString();
  seedValue.textContent = scheduler.stream?.seeds?.length?.toString() ?? '0';
  requestAnimationFrame(updateStats);
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

loop.start();
updateStats();
