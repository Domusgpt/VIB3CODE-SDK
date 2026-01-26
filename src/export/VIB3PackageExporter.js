/**
 * VIB3Package Exporter
 *
 * Creates comprehensive, portable visualization packages that include:
 * - Visual parameters
 * - Reactivity configuration (audio/tilt/interaction)
 * - Self-contained embed code
 * - Integration helpers for various platforms
 *
 * Export targets: Web, Video, OBS, React, Vue, Web Components
 */

import { ReactivityConfig } from '../reactivity/ReactivityConfig.js';

/**
 * VIB3Package format version
 */
export const VIB3_PACKAGE_VERSION = '2.0';

/**
 * Generate a unique package ID
 */
function generatePackageId() {
    return `vib3_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * VIB3PackageExporter - Creates portable visualization packages
 */
export class VIB3PackageExporter {
    constructor(options = {}) {
        this.options = {
            author: options.author || 'VIB3+ User',
            email: options.email || '',
            license: options.license || 'All Rights Reserved',
            ...options
        };
    }

    /**
     * Create a full VIB3Package from current state
     *
     * @param {object} visualParams - Current visual parameters
     * @param {object} reactivityConfig - Current ReactivityConfig
     * @param {object} metadata - Additional metadata
     * @returns {object} VIB3Package
     */
    createPackage(visualParams, reactivityConfig, metadata = {}) {
        const packageId = generatePackageId();
        const timestamp = new Date().toISOString();

        // Determine system and geometry info
        const system = visualParams.system || 'quantum';
        const geometryIndex = visualParams.geometry || 0;
        const coreIndex = Math.floor(geometryIndex / 8);
        const baseIndex = geometryIndex % 8;

        const baseNames = ['Tetrahedron', 'Hypercube', 'Sphere', 'Torus', 'Klein Bottle', 'Fractal', 'Wave', 'Crystal'];
        const coreNames = ['Base', 'Hypersphere', 'Hypertetrahedron'];

        const package_ = {
            // Package metadata
            id: packageId,
            version: VIB3_PACKAGE_VERSION,
            type: 'vib3-package',
            name: metadata.name || `VIB3 ${system} Visualization`,
            description: metadata.description || `${baseNames[baseIndex]} with ${coreNames[coreIndex]} core`,
            created: timestamp,
            modified: timestamp,

            // Author info
            author: {
                name: this.options.author,
                email: this.options.email
            },
            license: this.options.license,

            // Visual state
            visual: {
                system,
                geometry: {
                    index: geometryIndex,
                    baseIndex,
                    coreIndex,
                    baseName: baseNames[baseIndex],
                    coreName: coreNames[coreIndex],
                    formula: `${coreIndex} × 8 + ${baseIndex} = ${geometryIndex}`
                },
                parameters: { ...visualParams },
                rotation6D: {
                    '3D': {
                        XY: visualParams.rot4dXY || 0,
                        XZ: visualParams.rot4dXZ || 0,
                        YZ: visualParams.rot4dYZ || 0
                    },
                    '4D': {
                        XW: visualParams.rot4dXW || 0,
                        YW: visualParams.rot4dYW || 0,
                        ZW: visualParams.rot4dZW || 0
                    }
                }
            },

            // Reactivity behavior
            reactivity: reactivityConfig instanceof ReactivityConfig
                ? reactivityConfig.getConfig()
                : (reactivityConfig || null),

            // Embed code (generated)
            embed: this.generateEmbedCode(visualParams, reactivityConfig, packageId),

            // Integration helpers
            integrations: this.generateIntegrations(packageId, visualParams),

            // Agentic control info
            agent: {
                mcpToolHint: 'Use set_rotation, set_visual_parameters, or load_from_gallery',
                cliCommand: `vib3 load --package ${packageId}`,
                apiEndpoint: `/api/v1/packages/${packageId}`,
                eventTypes: [
                    'vib3.package.loaded',
                    'vib3.parameter.change',
                    'vib3.reactivity.update'
                ]
            },

            // Compatibility info
            compatibility: {
                browsers: ['Chrome 90+', 'Firefox 88+', 'Safari 14+', 'Edge 90+'],
                features: ['WebGL2', 'WebAudio', 'DeviceOrientation'],
                fallbacks: ['WebGL1', 'Canvas2D'],
                mobileSupported: true
            }
        };

        return package_;
    }

    /**
     * Generate embed code for different formats
     */
    generateEmbedCode(visualParams, reactivityConfig, packageId) {
        const configJson = JSON.stringify({
            visual: visualParams,
            reactivity: reactivityConfig instanceof ReactivityConfig
                ? reactivityConfig.getConfig()
                : reactivityConfig
        });

        // HTML embed (self-contained)
        const htmlEmbed = this.generateHTMLEmbed(visualParams, reactivityConfig, packageId);

        // CSS for styling
        const cssEmbed = this.generateCSSEmbed(visualParams);

        // JavaScript for initialization
        const jsEmbed = this.generateJSEmbed(visualParams, reactivityConfig, packageId);

        return {
            // Full self-contained HTML
            html: htmlEmbed,

            // Modular pieces
            css: cssEmbed,
            js: jsEmbed,

            // Config as JSON string
            configJson,

            // CDN URLs (placeholder - would be actual CDN in production)
            cdn: {
                script: `https://cdn.vib3.dev/embed/${VIB3_PACKAGE_VERSION}/vib3-embed.min.js`,
                style: `https://cdn.vib3.dev/embed/${VIB3_PACKAGE_VERSION}/vib3-embed.min.css`,
                wasm: `https://cdn.vib3.dev/wasm/${VIB3_PACKAGE_VERSION}/vib3_core.wasm`
            },

            // Iframe embed
            iframe: `<iframe src="https://vib3.dev/embed/${packageId}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`,

            // Script tag embed
            scriptTag: `<script src="https://cdn.vib3.dev/embed.js" data-vib3-config='${configJson}'></script>`
        };
    }

    /**
     * Generate self-contained HTML embed
     */
    generateHTMLEmbed(visualParams, reactivityConfig, packageId) {
        const system = visualParams.system || 'quantum';
        const hue = visualParams.hue || 200;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VIB3+ Visualization - ${packageId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        #vib3-container {
            width: 100vw;
            height: 100vh;
            position: relative;
        }
        canvas {
            width: 100%;
            height: 100%;
            display: block;
        }
        .vib3-watermark {
            position: fixed;
            bottom: 10px;
            right: 10px;
            font-family: 'Orbitron', sans-serif;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.3);
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div id="vib3-container">
        <canvas id="vib3-canvas"></canvas>
        <div class="vib3-watermark">VIB3+ Engine</div>
    </div>

    <script>
    // VIB3+ Embedded Visualization
    // Package: ${packageId}
    // System: ${system}

    const VIB3_CONFIG = ${JSON.stringify(visualParams, null, 2)};
    const VIB3_REACTIVITY = ${JSON.stringify(
        reactivityConfig instanceof ReactivityConfig ? reactivityConfig.getConfig() : reactivityConfig,
        null, 2
    )};

    class Vib3EmbeddedRenderer {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.config = VIB3_CONFIG;
            this.time = 0;
            this.mouse = { x: 0.5, y: 0.5 };
            this.resize();
            this.setupEvents();
            this.render();
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        setupEvents() {
            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousemove', (e) => {
                this.mouse.x = e.clientX / this.canvas.width;
                this.mouse.y = e.clientY / this.canvas.height;
            });
        }

        render() {
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            const t = this.time * 0.001 * (this.config.speed || 1);

            // Clear
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, w, h);

            // Generate visualization based on config
            const hue = this.config.hue || ${hue};
            const density = this.config.gridDensity || 15;
            const morph = this.config.morphFactor || 1;
            const chaos = this.config.chaos || 0.2;

            const centerX = w / 2 + (this.mouse.x - 0.5) * w * 0.2;
            const centerY = h / 2 + (this.mouse.y - 0.5) * h * 0.2;

            // Draw geometry
            for (let i = 0; i < density * 10; i++) {
                const angle = (i / (density * 10)) * Math.PI * 2;
                const radius = 100 + Math.sin(t + angle * morph) * 50 + Math.random() * chaos * 30;

                const x = centerX + Math.cos(angle + t * 0.5) * radius;
                const y = centerY + Math.sin(angle + t * 0.5) * radius;

                const particleHue = (hue + angle * 30 + t * 20) % 360;
                ctx.fillStyle = \`hsla(\${particleHue}, 70%, 50%, 0.6)\`;
                ctx.beginPath();
                ctx.arc(x, y, 2 + chaos * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            this.time += 16;
            requestAnimationFrame(() => this.render());
        }
    }

    window.addEventListener('load', () => {
        new Vib3EmbeddedRenderer(document.getElementById('vib3-canvas'));
    });
    </script>
</body>
</html>`;
    }

    /**
     * Generate CSS embed
     */
    generateCSSEmbed(visualParams) {
        const hue = visualParams.hue || 200;

        return `/* VIB3+ Visualization Styles */
:root {
    --vib3-hue: ${hue};
    --vib3-primary: hsl(${hue}, 70%, 50%);
    --vib3-secondary: hsl(${(hue + 60) % 360}, 70%, 50%);
    --vib3-accent: hsl(${(hue + 180) % 360}, 70%, 50%);
}

.vib3-container {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
}

.vib3-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

.vib3-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    background: radial-gradient(
        ellipse at center,
        transparent 0%,
        rgba(0, 0, 0, 0.3) 100%
    );
}`;
    }

    /**
     * Generate JavaScript embed
     */
    generateJSEmbed(visualParams, reactivityConfig, packageId) {
        return `// VIB3+ Embed Script
// Package: ${packageId}

(function() {
    const config = ${JSON.stringify(visualParams)};

    window.Vib3Embed = {
        packageId: '${packageId}',
        config: config,

        init: function(containerId) {
            const container = document.getElementById(containerId);
            if (!container) {
                console.error('VIB3: Container not found:', containerId);
                return;
            }

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.className = 'vib3-canvas';
            container.appendChild(canvas);

            // Initialize renderer
            this.renderer = new Vib3Renderer(canvas, config);
            console.log('VIB3: Initialized package ${packageId}');
        },

        setParameter: function(name, value) {
            if (this.renderer) {
                this.renderer.setParameter(name, value);
            }
        },

        destroy: function() {
            if (this.renderer) {
                this.renderer.destroy();
                this.renderer = null;
            }
        }
    };

    // Auto-init if data attribute present
    document.addEventListener('DOMContentLoaded', function() {
        const autoInit = document.querySelector('[data-vib3-auto]');
        if (autoInit) {
            window.Vib3Embed.init(autoInit.id);
        }
    });
})();`;
    }

    /**
     * Generate integration helpers for various platforms
     */
    generateIntegrations(packageId, visualParams) {
        const configStr = JSON.stringify(visualParams);

        return {
            // React component
            react: `import React, { useEffect, useRef } from 'react';

export function Vib3Visualization({ config = ${configStr} }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (canvasRef.current) {
            // Initialize VIB3 renderer
            const renderer = new window.Vib3Renderer(canvasRef.current, config);
            return () => renderer.destroy();
        }
    }, [config]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}`,

            // Vue component
            vue: `<template>
    <canvas ref="canvas" class="vib3-canvas"></canvas>
</template>

<script>
export default {
    name: 'Vib3Visualization',
    props: {
        config: {
            type: Object,
            default: () => (${configStr})
        }
    },
    mounted() {
        this.renderer = new window.Vib3Renderer(this.$refs.canvas, this.config);
    },
    beforeDestroy() {
        if (this.renderer) this.renderer.destroy();
    }
}
</script>`,

            // Web Component
            webComponent: `<vib3-visualization
    geometry="${visualParams.geometry || 0}"
    system="${visualParams.system || 'quantum'}"
    hue="${visualParams.hue || 200}"
    speed="${visualParams.speed || 1}"
></vib3-visualization>

<script src="https://cdn.vib3.dev/web-component.js"></script>`,

            // OBS Browser Source
            obs: {
                url: `https://vib3.dev/embed/${packageId}?obs=true`,
                width: 1920,
                height: 1080,
                fps: 60,
                notes: 'Add as Browser Source in OBS. Enable "Control audio via OBS" for audio reactivity.'
            },

            // Video export settings
            video: {
                recommendedCodec: 'H.264',
                recommendedContainer: 'MP4',
                recommendedResolution: { width: 1920, height: 1080 },
                recommendedFps: 60,
                recommendedBitrate: '20Mbps',
                transparencySupported: true,
                transparentFormat: 'WebM with VP9'
            },

            // After Effects
            afterEffects: {
                scriptPath: 'https://cdn.vib3.dev/ae/vib3-ae-script.jsx',
                usage: 'File > Scripts > Run Script File... then import package JSON'
            }
        };
    }

    /**
     * Export package to JSON string
     */
    exportToJSON(package_, pretty = true) {
        return JSON.stringify(package_, null, pretty ? 2 : 0);
    }

    /**
     * Export package to downloadable file
     */
    downloadPackage(package_, filename = null) {
        const json = this.exportToJSON(package_);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `${package_.id}.vib3.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Export HTML embed to downloadable file
     */
    downloadHTMLEmbed(package_, filename = null) {
        const html = package_.embed.html;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `${package_.id}.html`;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * Load package from JSON
     */
    static loadFromJSON(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;

        if (data.type !== 'vib3-package') {
            throw new Error('Invalid VIB3 package: missing type');
        }

        return data;
    }
}

// Global export function
export function createVIB3Package(visualParams, reactivityConfig, metadata = {}) {
    const exporter = new VIB3PackageExporter(metadata);
    return exporter.createPackage(visualParams, reactivityConfig, metadata);
}

// Make available globally
if (typeof window !== 'undefined') {
    window.VIB3PackageExporter = VIB3PackageExporter;
    window.createVIB3Package = createVIB3Package;
}

export default VIB3PackageExporter;
