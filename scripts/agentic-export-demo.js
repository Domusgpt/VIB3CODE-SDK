/**
 * Agentic Export Demo
 *
 * This script demonstrates using the MCP tools programmatically to:
 * 1. Create a 4D visualization
 * 2. Configure reactivity settings
 * 3. Apply a behavior preset
 * 4. Export as a complete HTML package
 */

import { MCPServer } from '../src/agent/mcp/MCPServer.js';

// Create MCP server instance (no engine attached - we'll simulate)
const mcp = new MCPServer();

console.log('='.repeat(60));
console.log('VIB3+ AGENTIC EXPORT DEMO');
console.log('='.repeat(60));
console.log();

async function runAgenticWorkflow() {
    const steps = [];

    // STEP 1: List available behavior presets
    console.log('STEP 1: Discovering available behavior presets...');
    const presetList = await mcp.handleToolCall('list_behavior_presets', {});
    steps.push({ step: 1, tool: 'list_behavior_presets', result: presetList });
    console.log(`   Found ${presetList.count} presets:`);
    presetList.presets.forEach(p => console.log(`   - ${p.id}: ${p.description}`));
    console.log();

    // STEP 2: Create a 4D visualization with specific geometry
    console.log('STEP 2: Creating 4D visualization...');
    const vizResult = await mcp.handleToolCall('create_4d_visualization', {
        system: 'quantum',
        geometry_index: 10,  // Hypersphere + Sphere
        projection: 'perspective'
    });
    steps.push({ step: 2, tool: 'create_4d_visualization', result: vizResult });
    console.log(`   Scene ID: ${vizResult.scene_id}`);
    console.log(`   Geometry: ${vizResult.geometry.base_type} + ${vizResult.geometry.core_type}`);
    console.log(`   System: ${vizResult.system}`);
    console.log();

    // STEP 3: Set 6D rotation for interesting view
    console.log('STEP 3: Setting 6D rotation...');
    const rotationResult = await mcp.handleToolCall('set_rotation', {
        XY: 0.5,
        XZ: 0.3,
        YZ: 0.2,
        XW: 1.2,  // 4D rotation - creates "inside-out" effect
        YW: 0.8,
        ZW: 0.4
    });
    steps.push({ step: 3, tool: 'set_rotation', result: rotationResult });
    console.log('   Rotations applied:');
    console.log('   - 3D: XY=0.5, XZ=0.3, YZ=0.2');
    console.log('   - 4D: XW=1.2, YW=0.8, ZW=0.4');
    console.log();

    // STEP 4: Set visual parameters
    console.log('STEP 4: Setting visual parameters...');
    const visualResult = await mcp.handleToolCall('set_visual_parameters', {
        hue: 280,           // Purple hue
        saturation: 0.8,
        intensity: 0.9,
        speed: 0.7,
        chaos: 0.15,
        morphFactor: 0.6,
        gridDensity: 32,
        dimension: 3.8
    });
    steps.push({ step: 4, tool: 'set_visual_parameters', result: visualResult });
    console.log('   Visual params: hue=280, sat=0.8, intensity=0.9, speed=0.7');
    console.log();

    // STEP 5: Apply "reactive" behavior preset
    console.log('STEP 5: Applying "reactive" behavior preset...');
    const presetResult = await mcp.handleToolCall('apply_behavior_preset', {
        preset: 'reactive'
    });
    steps.push({ step: 5, tool: 'apply_behavior_preset', result: presetResult });
    console.log(`   Applied: ${presetResult.name}`);
    console.log(`   Description: ${presetResult.description}`);
    console.log('   Config:', JSON.stringify(presetResult.config, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    console.log();

    // STEP 6: Configure audio band for extra bass reactivity
    console.log('STEP 6: Configuring bass audio band...');
    const audioBandResult = await mcp.handleToolCall('configure_audio_band', {
        band: 'bass',
        enabled: true,
        sensitivity: 2.0,
        targets: [
            { param: 'morphFactor', weight: 1.2, mode: 'add' },
            { param: 'intensity', weight: 0.5, mode: 'multiply' }
        ]
    });
    steps.push({ step: 6, tool: 'configure_audio_band', result: audioBandResult });
    console.log('   Bass band configured with high sensitivity');
    console.log('   Targets: morphFactor (add), intensity (multiply)');
    console.log();

    // STEP 7: Export as complete package
    console.log('STEP 7: Exporting VIB3Package...');
    const exportResult = await mcp.handleToolCall('export_package', {
        name: 'Reactive Hypersphere Demo',
        description: 'Audio-reactive 4D hypersphere visualization with bass-driven morphing',
        includeReactivity: true,
        includeEmbed: true,
        format: 'json'
    });
    steps.push({ step: 7, tool: 'export_package', result: exportResult });
    console.log(`   Package ID: ${exportResult.package.id}`);
    console.log(`   Name: ${exportResult.package.name}`);
    console.log();

    // Generate standalone HTML from the package
    console.log('STEP 8: Generating standalone HTML...');
    const html = generateStandaloneHTML(exportResult.package);
    steps.push({ step: 8, tool: 'generateStandaloneHTML', result: { html_length: html.length } });

    // Write the HTML file
    const fs = await import('fs');
    const outputPath = new URL('../exports/reactive-hypersphere-demo.html', import.meta.url);

    // Ensure exports directory exists
    const exportsDir = new URL('../exports/', import.meta.url);
    try {
        fs.mkdirSync(exportsDir, { recursive: true });
    } catch (e) {}

    fs.writeFileSync(outputPath, html);
    console.log(`   HTML written to: exports/reactive-hypersphere-demo.html`);
    console.log(`   File size: ${(html.length / 1024).toFixed(1)} KB`);
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('WORKFLOW COMPLETE');
    console.log('='.repeat(60));
    console.log();
    console.log('Tools invoked in order:');
    steps.forEach(s => {
        console.log(`  ${s.step}. ${s.tool}`);
    });
    console.log();
    console.log('The exported HTML includes:');
    console.log('  - Self-contained visualization with inline shaders');
    console.log('  - All visual parameters baked in');
    console.log('  - Reactivity configuration for audio/interaction');
    console.log('  - No external dependencies required');
    console.log();

    return { steps, html, package: exportResult.package };
}

/**
 * Generate standalone HTML from VIB3Package
 */
function generateStandaloneHTML(pkg) {
    const params = pkg.visual?.parameters || {};
    const reactivity = pkg.reactivity || {};

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pkg.name || 'VIB3+ Visualization'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #000;
            overflow: hidden;
            font-family: 'Segoe UI', system-ui, sans-serif;
        }
        canvas {
            display: block;
            width: 100vw;
            height: 100vh;
        }
        .info-panel {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(0,0,0,0.8);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            padding: 15px 20px;
            color: #fff;
            font-size: 12px;
            backdrop-filter: blur(10px);
            max-width: 300px;
        }
        .info-panel h3 {
            color: #00ffff;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .info-panel p {
            opacity: 0.8;
            line-height: 1.4;
        }
        .info-panel .meta {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255,255,255,0.1);
            font-size: 10px;
            opacity: 0.6;
        }
    </style>
</head>
<body>
    <canvas id="vib3-canvas"></canvas>

    <div class="info-panel">
        <h3>${pkg.name}</h3>
        <p>${pkg.description}</p>
        <div class="meta">
            Package ID: ${pkg.id}<br>
            System: ${pkg.system}<br>
            Geometry: ${pkg.visual?.geometry?.baseIndex || 0} + Core ${pkg.visual?.geometry?.coreIndex || 0}<br>
            Created: ${new Date(pkg.created).toLocaleDateString()}
        </div>
    </div>

    <script>
    // VIB3+ Embedded Visualization
    // Package: ${pkg.id}
    // Generated: ${new Date().toISOString()}

    const CONFIG = ${JSON.stringify({
        system: pkg.system,
        geometry: pkg.visual?.geometry?.index || 0,
        parameters: params,
        reactivity: reactivity
    }, null, 2)};

    // Shader code (simplified procedural fragment shader)
    const vertexShader = \`
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    \`;

    const fragmentShader = \`
        precision highp float;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_geometry;
        uniform float u_rot4dXY, u_rot4dXZ, u_rot4dYZ;
        uniform float u_rot4dXW, u_rot4dYW, u_rot4dZW;
        uniform float u_gridDensity;
        uniform float u_morphFactor;
        uniform float u_chaos;
        uniform float u_speed;
        uniform float u_hue;
        uniform float u_intensity;
        uniform float u_saturation;
        uniform float u_dimension;
        uniform float u_mouseX, u_mouseY;
        uniform float u_audioLevel;

        #define PI 3.14159265359

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

        // Combined 6D rotation
        mat4 rotate4D() {
            return rotateXY(u_rot4dXY) * rotateXZ(u_rot4dXZ) * rotateYZ(u_rot4dYZ) *
                   rotateXW(u_rot4dXW) * rotateYW(u_rot4dYW) * rotateZW(u_rot4dZW);
        }

        // HSV to RGB
        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        // Geometry functions based on index
        float getPattern(vec4 p, float t) {
            float baseType = mod(u_geometry, 8.0);
            float coreType = floor(u_geometry / 8.0);

            // Apply core warp
            if (coreType >= 1.0) {
                float r = length(p);
                p = p / (r + 0.1);
                if (coreType >= 2.0) {
                    p.w += sin(p.x * 3.0 + t) * 0.3;
                }
            }

            float pattern = 0.0;
            float density = u_gridDensity * 0.1;

            // Base geometry patterns
            if (baseType < 1.0) {
                // Tetrahedron lattice
                pattern = sin(p.x * density) * sin(p.y * density) * sin(p.z * density);
            } else if (baseType < 2.0) {
                // Hypercube grid
                pattern = max(max(abs(sin(p.x * density)), abs(sin(p.y * density))),
                             max(abs(sin(p.z * density)), abs(sin(p.w * density))));
            } else if (baseType < 3.0) {
                // Sphere harmonics
                float r = length(p.xyz);
                pattern = sin(r * density + t * 2.0) * cos(atan(p.y, p.x) * 3.0);
            } else if (baseType < 4.0) {
                // Torus
                float r1 = length(p.xy) - 0.5;
                float r2 = length(vec2(r1, p.z));
                pattern = sin(r2 * density * 2.0 + t);
            } else if (baseType < 5.0) {
                // Klein bottle (simplified)
                pattern = sin((p.x + p.y) * density) * cos((p.z - p.w) * density);
            } else if (baseType < 6.0) {
                // Fractal
                vec3 z = p.xyz;
                for (int i = 0; i < 4; i++) {
                    z = abs(z) - 0.5;
                    z *= 1.5;
                }
                pattern = length(z) * 0.2;
            } else if (baseType < 7.0) {
                // Wave interference
                pattern = sin(p.x * density + t * 3.0) * sin(p.y * density - t * 2.0) *
                         sin(p.z * density + t) * sin(p.w * density * 0.5);
            } else {
                // Crystal
                pattern = max(abs(p.x) + abs(p.y), abs(p.z) + abs(p.w));
                pattern = sin(pattern * density);
            }

            // Apply morph
            pattern = mix(pattern, sin(length(p) * density * 2.0 + t), u_morphFactor * 0.5);

            // Apply chaos
            pattern += (fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * u_chaos;

            return pattern;
        }

        void main() {
            vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
            float t = u_time * u_speed;

            // Create 4D point
            vec4 p = vec4(uv * 2.0, sin(t * 0.5) * 0.5, cos(t * 0.3) * 0.5);

            // Apply mouse interaction
            p.xy += vec2(u_mouseX, u_mouseY) * 0.2;

            // Apply audio reactivity
            p *= 1.0 + u_audioLevel * 0.3;

            // Apply 6D rotation
            p = rotate4D() * p;

            // Project 4D -> 3D
            float projFactor = 1.0 / (u_dimension - p.w);
            vec3 projected = p.xyz * projFactor;

            // Get pattern
            float pattern = getPattern(p, t);

            // Color
            float hue = u_hue / 360.0 + pattern * 0.1 + t * 0.02;
            vec3 color = hsv2rgb(vec3(hue, u_saturation, u_intensity));

            // Apply pattern to color
            color *= 0.5 + pattern * 0.5;

            // Depth-based brightness
            color *= 1.0 - length(projected) * 0.3;

            gl_FragColor = vec4(color, 1.0);
        }
    \`;

    // Initialize WebGL
    const canvas = document.getElementById('vib3-canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
        console.error('WebGL not supported');
        document.body.innerHTML = '<div style="color:white;padding:20px;">WebGL not supported</div>';
    }

    // Compile shaders
    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    const vs = createShader(gl.VERTEX_SHADER, vertexShader);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);

    // Create fullscreen quad
    const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const uniforms = {};
    ['u_time', 'u_resolution', 'u_geometry',
     'u_rot4dXY', 'u_rot4dXZ', 'u_rot4dYZ', 'u_rot4dXW', 'u_rot4dYW', 'u_rot4dZW',
     'u_gridDensity', 'u_morphFactor', 'u_chaos', 'u_speed',
     'u_hue', 'u_intensity', 'u_saturation', 'u_dimension',
     'u_mouseX', 'u_mouseY', 'u_audioLevel'].forEach(name => {
        uniforms[name] = gl.getUniformLocation(program, name);
    });

    // Parameters from config
    const params = CONFIG.parameters;

    // Mouse tracking
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', e => {
        mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseY = -((e.clientY / window.innerHeight) * 2 - 1);
    });

    // Audio setup (if enabled)
    let audioLevel = 0;
    const reactivity = CONFIG.reactivity;
    if (reactivity?.audio?.enabled) {
        navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
            const audioCtx = new AudioContext();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            function updateAudio() {
                analyser.getByteFrequencyData(dataArray);
                // Get bass level (first few bins)
                let bass = 0;
                for (let i = 0; i < 8; i++) bass += dataArray[i];
                audioLevel = (bass / 8 / 255) * (reactivity.audio.globalSensitivity || 1.0);
                requestAnimationFrame(updateAudio);
            }
            updateAudio();
        }).catch(e => console.log('Audio not available:', e));
    }

    // Resize handler
    function resize() {
        canvas.width = window.innerWidth * devicePixelRatio;
        canvas.height = window.innerHeight * devicePixelRatio;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    // Animation loop
    const startTime = performance.now();
    function render() {
        const time = (performance.now() - startTime) / 1000;

        gl.uniform1f(uniforms.u_time, time);
        gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.u_geometry, CONFIG.geometry);

        // 6D rotation
        gl.uniform1f(uniforms.u_rot4dXY, params.rot4dXY || 0);
        gl.uniform1f(uniforms.u_rot4dXZ, params.rot4dXZ || 0);
        gl.uniform1f(uniforms.u_rot4dYZ, params.rot4dYZ || 0);
        gl.uniform1f(uniforms.u_rot4dXW, params.rot4dXW || 0);
        gl.uniform1f(uniforms.u_rot4dYW, params.rot4dYW || 0);
        gl.uniform1f(uniforms.u_rot4dZW, params.rot4dZW || 0);

        // Visual params
        gl.uniform1f(uniforms.u_gridDensity, params.gridDensity || 32);
        gl.uniform1f(uniforms.u_morphFactor, params.morphFactor || 0);
        gl.uniform1f(uniforms.u_chaos, params.chaos || 0);
        gl.uniform1f(uniforms.u_speed, params.speed || 1);
        gl.uniform1f(uniforms.u_hue, params.hue || 180);
        gl.uniform1f(uniforms.u_intensity, params.intensity || 1);
        gl.uniform1f(uniforms.u_saturation, params.saturation || 1);
        gl.uniform1f(uniforms.u_dimension, params.dimension || 4);

        // Interaction
        gl.uniform1f(uniforms.u_mouseX, mouseX);
        gl.uniform1f(uniforms.u_mouseY, mouseY);
        gl.uniform1f(uniforms.u_audioLevel, audioLevel);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(render);
    }
    render();

    console.log('VIB3+ Visualization initialized');
    console.log('Package:', CONFIG);
    </script>
</body>
</html>`;
}

// Run the workflow
runAgenticWorkflow()
    .then(result => {
        console.log('Export complete!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
