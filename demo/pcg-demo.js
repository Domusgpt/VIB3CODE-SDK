/**
 * PCG Demo – uses the full SplatRenderPipeline to validate the
 * procedural traversal → buffer → command-buffer → GPU draw flow.
 */
import { ProceduralGaussianStream } from '../src/render/ProceduralGaussianStream.js';
import { ProceduralTraversalScheduler } from '../src/render/ProceduralTraversalScheduler.js';
import { SplatRenderPipeline } from '../src/render/SplatRenderPipeline.js';

const canvas = document.getElementById('pcgCanvas');
const gl = canvas.getContext('webgl2', { depth: true });
if (!gl) {
  throw new Error('WebGL2 is required for this demo.');
}

const depthValue = document.getElementById('depthValue');
const batchValue = document.getElementById('batchValue');
const seedValue = document.getElementById('seedValue');

const stream = new ProceduralGaussianStream({ maxDepth: 2, stepDistance: 0.9 });
const scheduler = new ProceduralTraversalScheduler({ stream });

// Full pipeline: encodes seeds, records CommandBuffer, sorts, executes GL
const pipeline = new SplatRenderPipeline(gl, { pointScale: 18 });

let pointer = { x: canvas.width / 2, y: canvas.height / 2 };
let lastPointer = { ...pointer };

const center = () => ({ x: canvas.width / 2, y: canvas.height / 2 });

const tick = () => {
  const { x: cx, y: cy } = center();
  const dx = pointer.x - cx;
  const dy = pointer.y - cy;
  const dist = Math.min(Math.hypot(dx, dy), 320);
  const focus = 1 - dist / 320;
  const motion = Math.min(Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) / 20, 4);

  const result = scheduler.nextFrame({ focus, motion });
  const seedCount = result.seeds.length;

  // Run the full command-buffer pipeline (submit + execute)
  pipeline.run(result.seeds);

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

tick();
