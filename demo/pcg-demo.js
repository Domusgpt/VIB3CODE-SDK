import { ProceduralGaussianStream } from '../src/render/ProceduralGaussianStream.js';
import { ProceduralTraversalScheduler } from '../src/render/ProceduralTraversalScheduler.js';

const canvas = document.getElementById('pcgCanvas');
const ctx = canvas.getContext('2d');

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

const renderSeeds = (seeds) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(140, 200, 255, 0.75)';
  ctx.strokeStyle = 'rgba(120, 170, 240, 0.3)';

  seeds.forEach((seed) => {
    const { x, y, r } = toCanvas(seed.position, seed.scale);
    const alpha = Math.max(0.1, 1 - seed.depth * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(140, 200, 255, ${alpha})`;
    ctx.fill();
    ctx.stroke();
  });
};

const tick = () => {
  const { x: cx, y: cy } = center();
  const dx = pointer.x - cx;
  const dy = pointer.y - cy;
  const dist = Math.min(Math.hypot(dx, dy), 320);
  const focus = 1 - dist / 320;
  const motion = Math.min(Math.hypot(pointer.x - lastPointer.x, pointer.y - lastPointer.y) / 20, 4);

  const result = scheduler.nextFrame({ focus, motion });
  renderSeeds(result.seeds);

  depthValue.textContent = result.maxDepth.toString();
  batchValue.textContent = result.batchSize.toString();
  seedValue.textContent = result.seeds.length.toString();

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
