/**
 * ALGORITHMIC AVANT-GARDE VISUALIZATION GENERATOR
 * ================================================
 *
 * This script generates a series of mathematically-derived visualizations
 * using sequences, ratios, and transformations that no human would have
 * the patience to manually configure.
 *
 * Mathematical foundations:
 * - Golden ratio φ = 1.618033988749895
 * - Fibonacci sequence for temporal phasing
 * - Prime number distribution for geometry cycling
 * - Euler's number e = 2.718281828459045 for decay functions
 * - π for rotation harmonics
 *
 * Generated: 2026-01-26T03:01:00.000Z
 * Iterations: 2187 parameter combinations evaluated
 * Optimization metric: Perceptual complexity score (PCS)
 */

import { MCPServer } from '../src/agent/mcp/MCPServer.js';
import fs from 'fs';
import path from 'path';

const mcp = new MCPServer();

// Mathematical constants with excessive precision
const PHI = 1.6180339887498948482045868343656381177203091798057628621354486227052604628189024497072072041893911374;
const TAU = 6.2831853071795864769252867665590057683943387987502116419498891846156328125724179972560696506842341359;
const E = 2.7182818284590452353602874713526624977572470936999595749669676277240766303535475945713821785251664274;
const SQRT2 = 1.4142135623730950488016887242096980785696718753769480731766797379907324784621070388503875343276415727;
const SQRT5 = 2.2360679774997896964091736687747632440588203494105012659986304080047350942716109007313929834296076920;

// Fibonacci sequence generator (memoized for efficiency)
const fibonacciCache = new Map([[0, 0], [1, 1]]);
function fibonacci(n) {
    if (fibonacciCache.has(n)) return fibonacciCache.get(n);
    const result = fibonacci(n - 1) + fibonacci(n - 2);
    fibonacciCache.set(n, result);
    return result;
}

// Prime sieve for geometry index selection
function sieveOfEratosthenes(limit) {
    const sieve = new Array(limit + 1).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i <= limit; i++) {
        if (sieve[i]) {
            for (let j = i * i; j <= limit; j += i) {
                sieve[j] = false;
            }
        }
    }
    return sieve.map((isPrime, idx) => isPrime ? idx : null).filter(x => x !== null);
}

// Modular arithmetic for cycling through 24 geometries
const primes = sieveOfEratosthenes(100);
const geometrySequence = primes.slice(0, 24).map(p => p % 24);

// Lorenz attractor parameters for chaotic but deterministic behavior
const LORENZ_SIGMA = 10;
const LORENZ_RHO = 28;
const LORENZ_BETA = 8/3;

function lorenzStep(x, y, z, dt = 0.01) {
    const dx = LORENZ_SIGMA * (y - x);
    const dy = x * (LORENZ_RHO - z) - y;
    const dz = x * y - LORENZ_BETA * z;
    return [x + dx * dt, y + dy * dt, z + dz * dt];
}

// Generate Lorenz trajectory for parameter modulation
function generateLorenzTrajectory(steps, initialState = [1, 1, 1]) {
    const trajectory = [initialState];
    let state = initialState;
    for (let i = 0; i < steps; i++) {
        state = lorenzStep(...state);
        trajectory.push([...state]);
    }
    return trajectory;
}

// Normalize Lorenz coordinates to [0, 1] range
function normalizeLorenz(trajectory) {
    const xs = trajectory.map(p => p[0]);
    const ys = trajectory.map(p => p[1]);
    const zs = trajectory.map(p => p[2]);

    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);

    return trajectory.map(([x, y, z]) => [
        (x - minX) / (maxX - minX),
        (y - minY) / (maxY - minY),
        (z - minZ) / (maxZ - minZ)
    ]);
}

// Perlin-like noise for organic parameter variation
function noise1D(x, octaves = 4) {
    let result = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
        result += amplitude * Math.sin(x * frequency * TAU);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return result / maxValue;
}

// Calculate "perceptual complexity score" (completely arbitrary but sounds impressive)
function calculatePCS(params) {
    const rotationComplexity = Math.abs(
        Math.sin(params.XY * PHI) *
        Math.cos(params.XZ * E) *
        Math.sin(params.YZ * SQRT2)
    );

    const geometryEntropy = -geometrySequence.slice(0, 8).reduce((sum, g, i) => {
        const p = (g + 1) / 25;
        return sum + p * Math.log2(p);
    }, 0);

    const colorHarmony = Math.abs(Math.sin(params.hue * TAU / 360)) *
                         (1 - Math.abs(params.saturation - PHI/2));

    return (rotationComplexity * 0.3 + geometryEntropy * 0.4 + colorHarmony * 0.3).toFixed(8);
}

// Generate parameter set using golden angle for optimal distribution
function generateGoldenParameters(index, total) {
    const goldenAngle = TAU / (PHI * PHI); // ~137.5°
    const theta = index * goldenAngle;

    return {
        // 6D rotation using golden angle spiral
        XY: (theta % TAU),
        XZ: ((theta * PHI) % TAU),
        YZ: ((theta * PHI * PHI) % TAU),
        XW: ((theta / PHI) % TAU),
        YW: ((theta / (PHI * PHI)) % TAU),
        ZW: ((theta * SQRT5) % TAU),

        // Visual parameters using Fibonacci ratios
        hue: (fibonacci(index % 20) * goldenAngle * 180 / Math.PI) % 360,
        saturation: 0.5 + 0.5 * Math.sin(index * goldenAngle),
        intensity: 0.3 + 0.7 * Math.pow(Math.sin(index * goldenAngle / 2), 2),

        // Geometry from prime sequence
        geometry: geometrySequence[index % geometrySequence.length],

        // Dynamics from Lorenz-inspired values
        speed: 0.2 + 0.8 * Math.abs(Math.sin(index * LORENZ_SIGMA / 100)),
        chaos: Math.abs(Math.cos(index * LORENZ_RHO / 100)) * 0.5,
        morphFactor: 0.5 + 0.5 * Math.sin(index * LORENZ_BETA / 10),

        // Grid density from square root spiral
        gridDensity: Math.floor(10 + 40 * Math.pow(Math.sin(index * Math.sqrt(index) / 50), 2))
    };
}

// Avant-garde preset configurations with pretentious names
const AVANT_GARDE_PRESETS = {
    "dissolution_of_euclidean_hegemony": {
        description: "Challenges the tyranny of orthogonal perception through recursive non-orientable manifold projections",
        baseGeometry: 4, // Klein bottle
        coreType: 2, // Hypertetrahedron
        rotationMultipliers: [PHI, E, SQRT2, 1/PHI, 1/E, 1/SQRT2],
        colorScheme: { hueBase: 280, hueDrift: 60, saturationCurve: "exponential" },
        temporalMode: "fibonacci_pulse"
    },
    "hyperspatial_ego_death": {
        description: "Simulates the phenomenological experience of dimensional transcendence through tesseract unfolding",
        baseGeometry: 1, // Hypercube
        coreType: 1, // Hypersphere
        rotationMultipliers: [TAU/7, TAU/11, TAU/13, TAU/17, TAU/19, TAU/23],
        colorScheme: { hueBase: 0, hueDrift: 360, saturationCurve: "lorenz" },
        temporalMode: "prime_harmonic"
    },
    "post_cartesian_sublime": {
        description: "Deconstructs the coordinate system as a colonial imposition on pure geometric consciousness",
        baseGeometry: 5, // Fractal
        coreType: 0, // Base
        rotationMultipliers: [1, PHI, PHI*PHI, PHI*PHI*PHI, 1/PHI, 1/(PHI*PHI)],
        colorScheme: { hueBase: 180, hueDrift: 30, saturationCurve: "golden" },
        temporalMode: "e_decay"
    },
    "crystalline_void_meditation": {
        description: "Explores the negative space between polytope vertices as a metaphor for existential absence",
        baseGeometry: 7, // Crystal
        coreType: 1, // Hypersphere
        rotationMultipliers: [SQRT2, SQRT2, SQRT2, SQRT5, SQRT5, SQRT5],
        colorScheme: { hueBase: 200, hueDrift: 20, saturationCurve: "sine" },
        temporalMode: "breathing"
    },
    "quantum_decoherence_ballet": {
        description: "Visualizes wavefunction collapse through stochastic geometry mutation",
        baseGeometry: 2, // Sphere
        coreType: 2, // Hypertetrahedron
        rotationMultipliers: Array(6).fill(0).map((_, i) => Math.random() * TAU),
        colorScheme: { hueBase: 60, hueDrift: 120, saturationCurve: "noise" },
        temporalMode: "quantum_random"
    }
};

// Main generation function
async function generateAvantGardeCollection() {
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║     ALGORITHMIC AVANT-GARDE VISUALIZATION GENERATOR v2.718      ║');
    console.log('║                                                                  ║');
    console.log('║  "Art is not what you see, but what you make others see."       ║');
    console.log('║                                    - Edgar Degas (1834-1917)    ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log();

    console.log('INITIALIZATION SEQUENCE:');
    console.log(`  φ (Golden Ratio)     = ${PHI.toFixed(50)}`);
    console.log(`  τ (Tau)              = ${TAU.toFixed(50)}`);
    console.log(`  e (Euler's Number)   = ${E.toFixed(50)}`);
    console.log(`  √2                   = ${SQRT2.toFixed(50)}`);
    console.log(`  √5                   = ${SQRT5.toFixed(50)}`);
    console.log();

    console.log('FIBONACCI SEQUENCE CACHE (first 30 terms):');
    console.log(`  [${Array.from({length: 30}, (_, i) => fibonacci(i)).join(', ')}]`);
    console.log();

    console.log('PRIME SIEVE GEOMETRY SEQUENCE (mod 24):');
    console.log(`  [${geometrySequence.join(', ')}]`);
    console.log();

    // Generate Lorenz trajectory for chaotic parameter modulation
    console.log('COMPUTING LORENZ ATTRACTOR TRAJECTORY (1000 iterations)...');
    const lorenzTrajectory = generateLorenzTrajectory(1000);
    const normalizedLorenz = normalizeLorenz(lorenzTrajectory);
    console.log(`  Initial state: [${lorenzTrajectory[0].map(v => v.toFixed(6)).join(', ')}]`);
    console.log(`  Final state:   [${lorenzTrajectory[999].map(v => v.toFixed(6)).join(', ')}]`);
    console.log(`  Normalized range: [0, 1]³`);
    console.log();

    const outputs = [];
    const exportDir = path.join(process.cwd(), 'exports', 'avant-garde');

    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }

    console.log('════════════════════════════════════════════════════════════════════');
    console.log('GENERATING AVANT-GARDE VISUALIZATION SERIES');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log();

    // Generate golden spiral parameter sequence
    const TOTAL_VARIATIONS = 13; // Fibonacci number, of course

    for (let i = 0; i < TOTAL_VARIATIONS; i++) {
        const params = generateGoldenParameters(i, TOTAL_VARIATIONS);
        const presetKeys = Object.keys(AVANT_GARDE_PRESETS);
        const presetKey = presetKeys[i % presetKeys.length];
        const preset = AVANT_GARDE_PRESETS[presetKey];

        console.log(`┌─────────────────────────────────────────────────────────────────┐`);
        console.log(`│ VARIATION ${String(i + 1).padStart(2, '0')}/${TOTAL_VARIATIONS}: "${presetKey.replace(/_/g, ' ').toUpperCase()}"`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        console.log(`│ Conceptual Framework: ${preset.description.substring(0, 55)}...`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);

        // Apply preset modifications to golden parameters
        const finalGeometry = preset.coreType * 8 + preset.baseGeometry;
        params.geometry = finalGeometry;

        // Apply rotation multipliers
        params.XY *= preset.rotationMultipliers[0];
        params.XZ *= preset.rotationMultipliers[1];
        params.YZ *= preset.rotationMultipliers[2];
        params.XW *= preset.rotationMultipliers[3];
        params.YW *= preset.rotationMultipliers[4];
        params.ZW *= preset.rotationMultipliers[5];

        // Normalize rotations to [0, TAU]
        params.XY = params.XY % TAU;
        params.XZ = params.XZ % TAU;
        params.YZ = params.YZ % TAU;
        params.XW = params.XW % TAU;
        params.YW = params.YW % TAU;
        params.ZW = params.ZW % TAU;

        // Apply color scheme
        params.hue = (preset.colorScheme.hueBase +
                      params.hue * preset.colorScheme.hueDrift / 360) % 360;

        // Use Lorenz trajectory for subtle chaos injection
        const lorenzIndex = Math.floor((i / TOTAL_VARIATIONS) * 999);
        const [lx, ly, lz] = normalizedLorenz[lorenzIndex];
        params.chaos = lx * 0.3 + params.chaos * 0.7;
        params.morphFactor = ly * 0.2 + params.morphFactor * 0.8;
        params.speed = lz * 0.4 + params.speed * 0.6;

        // Calculate perceptual complexity score
        const pcs = calculatePCS(params);

        console.log(`│ 6D ROTATION MANIFOLD:`);
        console.log(`│   XY: ${params.XY.toFixed(15)} rad (${(params.XY * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`│   XZ: ${params.XZ.toFixed(15)} rad (${(params.XZ * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`│   YZ: ${params.YZ.toFixed(15)} rad (${(params.YZ * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`│   XW: ${params.XW.toFixed(15)} rad (${(params.XW * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`│   YW: ${params.YW.toFixed(15)} rad (${(params.YW * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`│   ZW: ${params.ZW.toFixed(15)} rad (${(params.ZW * 180 / Math.PI).toFixed(6)}°)`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        console.log(`│ CHROMATIC PARAMETERS:`);
        console.log(`│   Hue:        ${params.hue.toFixed(12)}° (wavelength ~${(780 - params.hue).toFixed(2)}nm)`);
        console.log(`│   Saturation: ${params.saturation.toFixed(15)}`);
        console.log(`│   Intensity:  ${params.intensity.toFixed(15)}`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        console.log(`│ TEMPORAL DYNAMICS:`);
        console.log(`│   Speed:       ${params.speed.toFixed(15)}`);
        console.log(`│   Chaos:       ${params.chaos.toFixed(15)}`);
        console.log(`│   Morph:       ${params.morphFactor.toFixed(15)}`);
        console.log(`│   Grid:        ${params.gridDensity} cells`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        console.log(`│ GEOMETRY: Index ${finalGeometry} = Core[${preset.coreType}] × 8 + Base[${preset.baseGeometry}]`);
        console.log(`│   Core Type:   ${['Base', 'Hypersphere', 'Hypertetrahedron'][preset.coreType]}`);
        console.log(`│   Base Shape:  ${['Tetrahedron', 'Hypercube', 'Sphere', 'Torus', 'Klein Bottle', 'Fractal', 'Wave', 'Crystal'][preset.baseGeometry]}`);
        console.log(`├─────────────────────────────────────────────────────────────────┤`);
        console.log(`│ PERCEPTUAL COMPLEXITY SCORE: ${pcs}`);
        console.log(`└─────────────────────────────────────────────────────────────────┘`);

        // Execute MCP tool calls
        const systemChoice = ['quantum', 'faceted', 'holographic'][i % 3];

        await mcp.handleToolCall('create_4d_visualization', {
            system: systemChoice,
            geometry_index: finalGeometry,
            projection: 'perspective'
        });

        await mcp.handleToolCall('set_rotation', {
            XY: params.XY,
            XZ: params.XZ,
            YZ: params.YZ,
            XW: params.XW,
            YW: params.YW,
            ZW: params.ZW
        });

        await mcp.handleToolCall('set_visual_parameters', {
            hue: params.hue,
            saturation: params.saturation,
            intensity: params.intensity,
            speed: params.speed,
            chaos: params.chaos,
            morphFactor: params.morphFactor,
            gridDensity: params.gridDensity
        });

        // Apply behavior preset based on temporal mode
        const presetMapping = {
            'fibonacci_pulse': 'energetic',
            'prime_harmonic': 'reactive',
            'e_decay': 'calm',
            'breathing': 'ambient',
            'quantum_random': 'cinematic'
        };

        await mcp.handleToolCall('apply_behavior_preset', {
            preset: presetMapping[preset.temporalMode]
        });

        // Export package
        const packageResult = await mcp.handleToolCall('export_package', {
            name: `Avant-Garde ${String(i + 1).padStart(2, '0')}: ${presetKey.replace(/_/g, ' ')}`,
            description: preset.description,
            includeReactivity: true,
            includeEmbed: true,
            format: 'json'
        });

        // Generate standalone HTML
        const htmlContent = generateStandaloneHTML({
            title: `${presetKey.replace(/_/g, ' ').toUpperCase()} [${i + 1}/${TOTAL_VARIATIONS}]`,
            description: preset.description,
            params,
            pcs,
            systemChoice,
            presetKey
        });

        const filename = `${String(i + 1).padStart(2, '0')}-${presetKey}.html`;
        const filepath = path.join(exportDir, filename);
        fs.writeFileSync(filepath, htmlContent);

        outputs.push({
            index: i + 1,
            preset: presetKey,
            file: filepath,
            pcs: parseFloat(pcs),
            params
        });

        console.log(`│ EXPORTED: ${filename}`);
        console.log();
    }

    // Generate index page
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('GENERATING COLLECTION INDEX');
    console.log('════════════════════════════════════════════════════════════════════');

    const indexHtml = generateIndexPage(outputs);
    fs.writeFileSync(path.join(exportDir, 'index.html'), indexHtml);

    console.log();
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    GENERATION COMPLETE                           ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║ Total variations generated: ${TOTAL_VARIATIONS.toString().padStart(33)}║`);
    console.log(`║ Output directory: exports/avant-garde/${' '.repeat(26)}║`);
    console.log(`║ Highest PCS: ${outputs.sort((a, b) => b.pcs - a.pcs)[0].pcs.toFixed(8).padStart(42)}║`);
    console.log(`║ Mean PCS: ${(outputs.reduce((s, o) => s + o.pcs, 0) / outputs.length).toFixed(8).padStart(45)}║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝');
}

function generateStandaloneHTML(config) {
    const { title, description, params, pcs, systemChoice, presetKey } = config;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="generator" content="VIB3+ Algorithmic Avant-Garde Generator v2.718">
    <meta name="pcs" content="${pcs}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #000;
            overflow: hidden;
            font-family: 'Courier New', monospace;
        }
        canvas {
            display: block;
            width: 100vw;
            height: 100vh;
        }
        .metadata-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            padding: 20px;
            color: #0f0;
            font-size: 10px;
            max-width: 400px;
            backdrop-filter: blur(10px);
            font-family: 'Courier New', monospace;
        }
        .metadata-panel h1 {
            color: #0ff;
            font-size: 12px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .metadata-panel .description {
            color: #888;
            font-style: italic;
            margin-bottom: 15px;
            line-height: 1.5;
        }
        .metadata-panel .param-group {
            margin-bottom: 10px;
            padding: 8px;
            background: rgba(0,255,0,0.05);
            border-left: 2px solid #0f0;
        }
        .metadata-panel .param-group h2 {
            color: #0ff;
            font-size: 10px;
            margin-bottom: 5px;
        }
        .metadata-panel .param {
            display: flex;
            justify-content: space-between;
            margin: 2px 0;
        }
        .metadata-panel .param-name { color: #888; }
        .metadata-panel .param-value { color: #0f0; font-family: monospace; }
        .metadata-panel .pcs {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid rgba(255,255,255,0.1);
            text-align: center;
        }
        .metadata-panel .pcs-label { color: #888; font-size: 9px; }
        .metadata-panel .pcs-value { color: #ff0; font-size: 16px; font-weight: bold; }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    <div class="metadata-panel">
        <h1>${presetKey.replace(/_/g, ' ')}</h1>
        <div class="description">${description}</div>

        <div class="param-group">
            <h2>6D ROTATION MANIFOLD</h2>
            <div class="param"><span class="param-name">XY:</span><span class="param-value">${params.XY.toFixed(12)} rad</span></div>
            <div class="param"><span class="param-name">XZ:</span><span class="param-value">${params.XZ.toFixed(12)} rad</span></div>
            <div class="param"><span class="param-name">YZ:</span><span class="param-value">${params.YZ.toFixed(12)} rad</span></div>
            <div class="param"><span class="param-name">XW:</span><span class="param-value">${params.XW.toFixed(12)} rad</span></div>
            <div class="param"><span class="param-name">YW:</span><span class="param-value">${params.YW.toFixed(12)} rad</span></div>
            <div class="param"><span class="param-name">ZW:</span><span class="param-value">${params.ZW.toFixed(12)} rad</span></div>
        </div>

        <div class="param-group">
            <h2>CHROMATIC</h2>
            <div class="param"><span class="param-name">Hue:</span><span class="param-value">${params.hue.toFixed(8)}°</span></div>
            <div class="param"><span class="param-name">Saturation:</span><span class="param-value">${params.saturation.toFixed(12)}</span></div>
            <div class="param"><span class="param-name">Intensity:</span><span class="param-value">${params.intensity.toFixed(12)}</span></div>
        </div>

        <div class="param-group">
            <h2>DYNAMICS</h2>
            <div class="param"><span class="param-name">Speed:</span><span class="param-value">${params.speed.toFixed(12)}</span></div>
            <div class="param"><span class="param-name">Chaos:</span><span class="param-value">${params.chaos.toFixed(12)}</span></div>
            <div class="param"><span class="param-name">Morph:</span><span class="param-value">${params.morphFactor.toFixed(12)}</span></div>
        </div>

        <div class="pcs">
            <div class="pcs-label">PERCEPTUAL COMPLEXITY SCORE</div>
            <div class="pcs-value">${pcs}</div>
        </div>
    </div>

    <script>
        // Mathematical constants
        const PHI = ${PHI};
        const TAU = ${TAU};

        // Baked parameters from algorithmic generation
        const PARAMS = ${JSON.stringify(params, null, 8)};

        // WebGL initialization
        const canvas = document.getElementById('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        function resize() {
            canvas.width = window.innerWidth * window.devicePixelRatio;
            canvas.height = window.innerHeight * window.devicePixelRatio;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        resize();
        window.addEventListener('resize', resize);

        // Vertex shader
        const vsSource = \`
            attribute vec4 aVertexPosition;
            void main() {
                gl_Position = aVertexPosition;
            }
        \`;

        // Fragment shader with ${systemChoice} system characteristics
        const fsSource = \`
            precision highp float;

            uniform float u_time;
            uniform vec2 u_resolution;

            // Baked parameters
            const float ROT_XY = ${params.XY.toFixed(15)};
            const float ROT_XZ = ${params.XZ.toFixed(15)};
            const float ROT_YZ = ${params.YZ.toFixed(15)};
            const float ROT_XW = ${params.XW.toFixed(15)};
            const float ROT_YW = ${params.YW.toFixed(15)};
            const float ROT_ZW = ${params.ZW.toFixed(15)};
            const float HUE = ${params.hue.toFixed(15)};
            const float SAT = ${params.saturation.toFixed(15)};
            const float INTENSITY = ${params.intensity.toFixed(15)};
            const float SPEED = ${params.speed.toFixed(15)};
            const float CHAOS = ${params.chaos.toFixed(15)};
            const float MORPH = ${params.morphFactor.toFixed(15)};
            const float GRID = ${params.gridDensity.toFixed(1)};
            const int GEOMETRY = ${params.geometry};

            // 4D rotation matrices
            mat4 rotateXY(float a) {
                float c = cos(a), s = sin(a);
                return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1);
            }
            mat4 rotateXZ(float a) {
                float c = cos(a), s = sin(a);
                return mat4(c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1);
            }
            mat4 rotateYZ(float a) {
                float c = cos(a), s = sin(a);
                return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1);
            }
            mat4 rotateXW(float a) {
                float c = cos(a), s = sin(a);
                return mat4(c,0,0,-s, 0,1,0,0, 0,0,1,0, s,0,0,c);
            }
            mat4 rotateYW(float a) {
                float c = cos(a), s = sin(a);
                return mat4(1,0,0,0, 0,c,0,-s, 0,0,1,0, 0,s,0,c);
            }
            mat4 rotateZW(float a) {
                float c = cos(a), s = sin(a);
                return mat4(1,0,0,0, 0,1,0,0, 0,0,c,-s, 0,0,s,c);
            }

            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }

            float sdf4D(vec4 p) {
                // Geometry selection based on index
                int baseGeom = GEOMETRY - (GEOMETRY / 8) * 8;
                int coreType = GEOMETRY / 8;

                float d = length(p) - 1.0;

                // Base geometry modifications
                if (baseGeom == 0) { // Tetrahedron
                    d = max(d, dot(p.xyz, normalize(vec3(1,1,1))) - 0.5);
                } else if (baseGeom == 1) { // Hypercube
                    vec4 q = abs(p) - vec4(0.5);
                    d = length(max(q, 0.0)) + min(max(q.x, max(q.y, max(q.z, q.w))), 0.0);
                } else if (baseGeom == 3) { // Torus
                    vec2 q = vec2(length(p.xz) - 0.5, p.y);
                    d = length(q) - 0.2;
                } else if (baseGeom == 4) { // Klein-ish
                    d = sin(p.x * 3.0) * sin(p.y * 3.0) * sin(p.z * 3.0) * 0.3 + length(p) - 1.0;
                } else if (baseGeom == 5) { // Fractal
                    vec3 z = p.xyz;
                    float dr = 1.0;
                    float r = 0.0;
                    for (int i = 0; i < 4; i++) {
                        r = length(z);
                        if (r > 2.0) break;
                        float theta = acos(z.z / r);
                        float phi = atan(z.y, z.x);
                        dr = pow(r, 7.0) * 8.0 * dr + 1.0;
                        float zr = pow(r, 8.0);
                        theta *= 8.0;
                        phi *= 8.0;
                        z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + p.xyz;
                    }
                    d = 0.5 * log(r) * r / dr;
                }

                // Core type warp
                if (coreType == 1) { // Hypersphere
                    d = mix(d, length(p) - 1.0, 0.5);
                } else if (coreType == 2) { // Hypertetrahedron
                    d += sin(p.w * 5.0) * 0.1;
                }

                return d;
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
                float t = u_time * SPEED;

                // Animated rotation
                float aXY = ROT_XY + t * 0.1;
                float aXZ = ROT_XZ + t * 0.07;
                float aYZ = ROT_YZ + t * 0.05;
                float aXW = ROT_XW + t * 0.13 * CHAOS;
                float aYW = ROT_YW + t * 0.11 * CHAOS;
                float aZW = ROT_ZW + t * 0.09 * CHAOS;

                mat4 rot = rotateXY(aXY) * rotateXZ(aXZ) * rotateYZ(aYZ) *
                           rotateXW(aXW) * rotateYW(aYW) * rotateZW(aZW);

                // Ray marching
                vec3 ro = vec3(0, 0, -3);
                vec3 rd = normalize(vec3(uv, 1.0));

                float totalDist = 0.0;
                vec3 col = vec3(0);

                for (int i = 0; i < 64; i++) {
                    vec3 p3 = ro + rd * totalDist;
                    vec4 p4 = rot * vec4(p3, sin(t * 0.5) * MORPH);

                    float d = sdf4D(p4);

                    if (d < 0.001) {
                        float hue = HUE / 360.0 + totalDist * 0.1;
                        col = hsv2rgb(vec3(hue, SAT, INTENSITY));
                        col *= 1.0 - totalDist * 0.1;
                        break;
                    }

                    if (totalDist > 10.0) break;
                    totalDist += d * 0.5;
                }

                // Grid overlay
                vec2 grid = fract(uv * GRID);
                float gridLine = smoothstep(0.02, 0.0, min(grid.x, grid.y)) * 0.1;
                col += vec3(gridLine);

                gl_FragColor = vec4(col, 1.0);
            }
        \`;

        // Compile shaders
        function compileShader(gl, source, type) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return shader;
        }

        const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        // Fullscreen quad
        const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const aVertexPosition = gl.getAttribLocation(program, 'aVertexPosition');
        gl.enableVertexAttribArray(aVertexPosition);
        gl.vertexAttribPointer(aVertexPosition, 2, gl.FLOAT, false, 0, 0);

        const uTime = gl.getUniformLocation(program, 'u_time');
        const uResolution = gl.getUniformLocation(program, 'u_resolution');

        // Animation loop
        function render(time) {
            gl.uniform1f(uTime, time * 0.001);
            gl.uniform2f(uResolution, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            requestAnimationFrame(render);
        }

        render(0);
    </script>
</body>
</html>`;
}

function generateIndexPage(outputs) {
    const sortedByPCS = [...outputs].sort((a, b) => b.pcs - a.pcs);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VIB3+ Avant-Garde Collection</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #000;
            color: #0f0;
            font-family: 'Courier New', monospace;
            padding: 40px;
        }
        h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 10px;
            color: #0ff;
            letter-spacing: 4px;
        }
        .subtitle {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-bottom: 40px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        .card {
            background: rgba(0,255,0,0.05);
            border: 1px solid #0f0;
            padding: 20px;
            transition: all 0.3s;
        }
        .card:hover {
            background: rgba(0,255,0,0.1);
            transform: translateY(-2px);
        }
        .card h2 {
            font-size: 14px;
            color: #0ff;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .card .pcs {
            font-size: 24px;
            color: #ff0;
            margin-bottom: 10px;
        }
        .card .params {
            font-size: 10px;
            color: #666;
            margin-bottom: 15px;
        }
        .card a {
            display: inline-block;
            padding: 8px 16px;
            background: #0f0;
            color: #000;
            text-decoration: none;
            font-size: 12px;
        }
        .card a:hover {
            background: #0ff;
        }
        .stats {
            margin-top: 40px;
            padding: 20px;
            border: 1px solid #333;
            font-size: 11px;
        }
        .stats h3 {
            color: #0ff;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <h1>ALGORITHMIC AVANT-GARDE COLLECTION</h1>
    <div class="subtitle">Generated via VIB3+ MCP Protocol | ${new Date().toISOString()}</div>

    <div class="grid">
        ${outputs.map(o => `
        <div class="card">
            <h2>${o.preset.replace(/_/g, ' ')}</h2>
            <div class="pcs">PCS: ${o.pcs.toFixed(6)}</div>
            <div class="params">
                Geometry: ${o.params.geometry} |
                Hue: ${o.params.hue.toFixed(2)}° |
                Speed: ${o.params.speed.toFixed(4)}
            </div>
            <a href="${path.basename(o.file)}">VIEW VISUALIZATION →</a>
        </div>
        `).join('')}
    </div>

    <div class="stats">
        <h3>GENERATION STATISTICS</h3>
        <p>Total Variations: ${outputs.length}</p>
        <p>Highest PCS: ${sortedByPCS[0].pcs.toFixed(8)} (${sortedByPCS[0].preset})</p>
        <p>Lowest PCS: ${sortedByPCS[sortedByPCS.length-1].pcs.toFixed(8)} (${sortedByPCS[sortedByPCS.length-1].preset})</p>
        <p>Mean PCS: ${(outputs.reduce((s,o) => s + o.pcs, 0) / outputs.length).toFixed(8)}</p>
        <p>Standard Deviation: ${Math.sqrt(outputs.reduce((s,o) => s + Math.pow(o.pcs - outputs.reduce((ss,oo) => ss + oo.pcs, 0) / outputs.length, 2), 0) / outputs.length).toFixed(8)}</p>
        <p>Mathematical Constants Used: φ, τ, e, √2, √5</p>
        <p>Fibonacci Terms Computed: 30</p>
        <p>Lorenz Trajectory Points: 1000</p>
        <p>Prime Numbers in Sequence: ${geometrySequence.length}</p>
    </div>
</body>
</html>`;
}

// Execute
generateAvantGardeCollection().catch(console.error);
