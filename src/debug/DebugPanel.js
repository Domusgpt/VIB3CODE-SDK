/**
 * DebugPanel - Visual diagnostic overlay for VIB3+ rendering
 *
 * Displays real-time metrics including:
 * - FPS and frame time
 * - GPU resource usage (buffers, textures, shaders)
 * - Memory allocation and peak usage
 * - Per-frame deltas
 * - Performance graphs
 *
 * Usage:
 * ```javascript
 * const debugPanel = new DebugPanel({
 *   container: document.body,
 *   position: 'top-right',
 *   metrics: registry
 * });
 *
 * // In render loop:
 * debugPanel.update({
 *   fps: 60,
 *   frameTime: 16.7,
 *   drawCalls: 42
 * });
 * ```
 */

/**
 * Panel position options
 */
export const PanelPosition = {
    TOP_LEFT: 'top-left',
    TOP_RIGHT: 'top-right',
    BOTTOM_LEFT: 'bottom-left',
    BOTTOM_RIGHT: 'bottom-right'
};

/**
 * Panel section types
 */
const Section = {
    FPS: 'fps',
    MEMORY: 'memory',
    RESOURCES: 'resources',
    GRAPH: 'graph',
    CUSTOM: 'custom'
};

/**
 * Default panel styles
 */
const DEFAULT_STYLES = `
.vib3-debug-panel {
    position: fixed;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.85);
    color: #00ff88;
    font-family: 'Monaco', 'Consolas', monospace;
    font-size: 11px;
    padding: 8px 12px;
    border-radius: 4px;
    min-width: 180px;
    max-width: 280px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    user-select: none;
    pointer-events: auto;
}

.vib3-debug-panel.top-left { top: 10px; left: 10px; }
.vib3-debug-panel.top-right { top: 10px; right: 10px; }
.vib3-debug-panel.bottom-left { bottom: 10px; left: 10px; }
.vib3-debug-panel.bottom-right { bottom: 10px; right: 10px; }

.vib3-debug-panel.collapsed {
    min-width: auto;
    max-width: none;
}

.vib3-debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(0, 255, 136, 0.3);
}

.vib3-debug-title {
    font-weight: bold;
    color: #00ffcc;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.vib3-debug-toggle {
    background: none;
    border: none;
    color: #00ff88;
    cursor: pointer;
    font-size: 12px;
    padding: 0 4px;
}

.vib3-debug-section {
    margin: 6px 0;
}

.vib3-debug-section-title {
    color: #888;
    font-size: 9px;
    text-transform: uppercase;
    margin-bottom: 2px;
}

.vib3-debug-row {
    display: flex;
    justify-content: space-between;
    line-height: 1.4;
}

.vib3-debug-label {
    color: #aaa;
}

.vib3-debug-value {
    color: #00ff88;
    text-align: right;
}

.vib3-debug-value.warning {
    color: #ffaa00;
}

.vib3-debug-value.critical {
    color: #ff4444;
}

.vib3-debug-graph {
    height: 40px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 2px;
    margin-top: 4px;
    overflow: hidden;
}

.vib3-debug-graph-canvas {
    width: 100%;
    height: 100%;
}

.vib3-debug-collapsed-content {
    display: none;
}

.vib3-debug-panel.collapsed .vib3-debug-collapsed-content {
    display: block;
}

.vib3-debug-panel.collapsed .vib3-debug-expanded-content {
    display: none;
}

.vib3-debug-fps-large {
    font-size: 18px;
    font-weight: bold;
}
`;

export class DebugPanel {
    /**
     * @param {object} options
     * @param {HTMLElement} [options.container] - Parent element (default: document.body)
     * @param {string} [options.position] - Panel position (default: 'top-right')
     * @param {RenderResourceRegistry} [options.metrics] - Resource registry
     * @param {boolean} [options.collapsed] - Start collapsed
     * @param {boolean} [options.showGraph] - Show FPS graph
     * @param {number} [options.graphHistory] - Graph data points (default: 60)
     */
    constructor(options = {}) {
        this.container = options.container || document.body;
        this.position = options.position || PanelPosition.TOP_RIGHT;
        this.metrics = options.metrics || null;
        this.collapsed = options.collapsed || false;
        this.showGraph = options.showGraph !== false;
        this.graphHistory = options.graphHistory || 60;

        // FPS tracking
        this._fpsHistory = [];
        this._frameTimeHistory = [];
        this._lastFrameTime = performance.now();
        this._frameCount = 0;
        this._fps = 0;

        // Custom sections
        this._customSections = new Map();

        // DOM elements
        this._panel = null;
        this._elements = {};
        this._graphCanvas = null;
        this._graphCtx = null;

        // Create panel
        this._injectStyles();
        this._createPanel();
    }

    /**
     * Inject CSS styles
     * @private
     */
    _injectStyles() {
        if (document.getElementById('vib3-debug-styles')) return;

        const style = document.createElement('style');
        style.id = 'vib3-debug-styles';
        style.textContent = DEFAULT_STYLES;
        document.head.appendChild(style);
    }

    /**
     * Create panel DOM structure
     * @private
     */
    _createPanel() {
        this._panel = document.createElement('div');
        this._panel.className = `vib3-debug-panel ${this.position}`;
        if (this.collapsed) {
            this._panel.classList.add('collapsed');
        }

        this._panel.innerHTML = `
            <div class="vib3-debug-header">
                <span class="vib3-debug-title">VIB3+ Debug</span>
                <button class="vib3-debug-toggle">${this.collapsed ? '▶' : '▼'}</button>
            </div>

            <div class="vib3-debug-collapsed-content">
                <span class="vib3-debug-fps-large" data-el="fps-collapsed">60</span>
                <span>FPS</span>
            </div>

            <div class="vib3-debug-expanded-content">
                <div class="vib3-debug-section">
                    <div class="vib3-debug-section-title">Performance</div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">FPS</span>
                        <span class="vib3-debug-value" data-el="fps">60</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Frame Time</span>
                        <span class="vib3-debug-value" data-el="frameTime">16.7ms</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Draw Calls</span>
                        <span class="vib3-debug-value" data-el="drawCalls">0</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Triangles</span>
                        <span class="vib3-debug-value" data-el="triangles">0</span>
                    </div>
                </div>

                <div class="vib3-debug-section">
                    <div class="vib3-debug-section-title">Resources</div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Total</span>
                        <span class="vib3-debug-value" data-el="resourceCount">0</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Memory</span>
                        <span class="vib3-debug-value" data-el="memoryUsage">0 KB</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Peak</span>
                        <span class="vib3-debug-value" data-el="peakMemory">0 KB</span>
                    </div>
                    <div class="vib3-debug-row">
                        <span class="vib3-debug-label">Frame Δ</span>
                        <span class="vib3-debug-value" data-el="frameDelta">+0</span>
                    </div>
                </div>

                <div class="vib3-debug-section" data-el="resourceBreakdown">
                </div>

                ${this.showGraph ? `
                <div class="vib3-debug-section">
                    <div class="vib3-debug-section-title">FPS Graph</div>
                    <div class="vib3-debug-graph">
                        <canvas class="vib3-debug-graph-canvas" data-el="graph"></canvas>
                    </div>
                </div>
                ` : ''}

                <div class="vib3-debug-section" data-el="customSections">
                </div>
            </div>
        `;

        // Cache element references
        this._panel.querySelectorAll('[data-el]').forEach(el => {
            this._elements[el.dataset.el] = el;
        });

        // Setup toggle button
        const toggleBtn = this._panel.querySelector('.vib3-debug-toggle');
        toggleBtn.addEventListener('click', () => this.toggle());

        // Setup graph canvas
        if (this.showGraph && this._elements.graph) {
            this._graphCanvas = this._elements.graph;
            this._graphCtx = this._graphCanvas.getContext('2d');
            this._setupGraph();
        }

        this.container.appendChild(this._panel);
    }

    /**
     * Setup graph canvas
     * @private
     */
    _setupGraph() {
        const resize = () => {
            const rect = this._graphCanvas.parentElement.getBoundingClientRect();
            this._graphCanvas.width = rect.width * window.devicePixelRatio;
            this._graphCanvas.height = rect.height * window.devicePixelRatio;
        };

        resize();
        window.addEventListener('resize', resize);
    }

    /**
     * Toggle collapsed state
     */
    toggle() {
        this.collapsed = !this.collapsed;
        this._panel.classList.toggle('collapsed', this.collapsed);

        const toggleBtn = this._panel.querySelector('.vib3-debug-toggle');
        toggleBtn.textContent = this.collapsed ? '▶' : '▼';
    }

    /**
     * Show panel
     */
    show() {
        this._panel.style.display = '';
    }

    /**
     * Hide panel
     */
    hide() {
        this._panel.style.display = 'none';
    }

    /**
     * Update panel with new metrics
     * @param {object} metrics
     * @param {number} [metrics.fps] - Current FPS
     * @param {number} [metrics.frameTime] - Frame time in ms
     * @param {number} [metrics.drawCalls] - Draw call count
     * @param {number} [metrics.triangles] - Triangle count
     */
    update(metrics = {}) {
        const now = performance.now();
        const dt = now - this._lastFrameTime;
        this._lastFrameTime = now;

        // Calculate FPS
        this._frameCount++;
        if (dt > 0) {
            const instantFps = 1000 / dt;
            this._fpsHistory.push(instantFps);
            this._frameTimeHistory.push(dt);

            if (this._fpsHistory.length > this.graphHistory) {
                this._fpsHistory.shift();
                this._frameTimeHistory.shift();
            }

            // Smooth FPS (average of last 10 frames)
            const recentFps = this._fpsHistory.slice(-10);
            this._fps = Math.round(recentFps.reduce((a, b) => a + b, 0) / recentFps.length);
        }

        // Update FPS display
        const fps = metrics.fps ?? this._fps;
        this._elements.fps.textContent = fps;
        this._elements['fps-collapsed'].textContent = fps;

        // Color code FPS
        this._elements.fps.className = 'vib3-debug-value';
        if (fps < 30) {
            this._elements.fps.classList.add('critical');
        } else if (fps < 55) {
            this._elements.fps.classList.add('warning');
        }

        // Update frame time
        const frameTime = metrics.frameTime ?? dt;
        this._elements.frameTime.textContent = `${frameTime.toFixed(1)}ms`;

        // Update draw calls and triangles
        this._elements.drawCalls.textContent = metrics.drawCalls ?? 0;
        this._elements.triangles.textContent = this._formatNumber(metrics.triangles ?? 0);

        // Update resource metrics if registry available
        if (this.metrics) {
            const diag = this.metrics.getDiagnostics();

            this._elements.resourceCount.textContent = diag.totalResources;
            this._elements.memoryUsage.textContent = this._formatBytes(diag.totalBytes);
            this._elements.peakMemory.textContent = this._formatBytes(diag.peak.bytes);

            const delta = diag.frameDelta.resources;
            this._elements.frameDelta.textContent = (delta >= 0 ? '+' : '') + delta;
            this._elements.frameDelta.className = 'vib3-debug-value';
            if (delta > 5) {
                this._elements.frameDelta.classList.add('warning');
            } else if (delta > 20) {
                this._elements.frameDelta.classList.add('critical');
            }

            // Update resource breakdown
            this._updateResourceBreakdown(diag.byType);
        }

        // Update graph
        if (this.showGraph && this._graphCtx) {
            this._drawGraph();
        }

        // Update custom sections
        for (const [name, section] of this._customSections) {
            if (section.update) {
                section.update(section.element, metrics);
            }
        }
    }

    /**
     * Update resource breakdown display
     * @private
     */
    _updateResourceBreakdown(byType) {
        const container = this._elements.resourceBreakdown;
        if (!container) return;

        let html = '<div class="vib3-debug-section-title">By Type</div>';

        for (const [type, data] of Object.entries(byType)) {
            html += `
                <div class="vib3-debug-row">
                    <span class="vib3-debug-label">${type}</span>
                    <span class="vib3-debug-value">${data.count}</span>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Draw FPS graph
     * @private
     */
    _drawGraph() {
        const ctx = this._graphCtx;
        const w = this._graphCanvas.width;
        const h = this._graphCanvas.height;

        // Clear
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, w, h);

        if (this._fpsHistory.length < 2) return;

        // Draw target line (60 FPS)
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const targetY = h - (60 / 120) * h;
        ctx.moveTo(0, targetY);
        ctx.lineTo(w, targetY);
        ctx.stroke();

        // Draw FPS line
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const stepX = w / (this.graphHistory - 1);
        for (let i = 0; i < this._fpsHistory.length; i++) {
            const fps = Math.min(this._fpsHistory[i], 120);
            const x = i * stepX;
            const y = h - (fps / 120) * h;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }

    /**
     * Add a custom section
     * @param {string} name - Section identifier
     * @param {object} options
     * @param {string} options.title - Section title
     * @param {function} options.render - Render function returning HTML
     * @param {function} [options.update] - Update function called each frame
     */
    addSection(name, options) {
        const container = this._elements.customSections;
        if (!container) return;

        const section = document.createElement('div');
        section.className = 'vib3-debug-section';
        section.innerHTML = `
            <div class="vib3-debug-section-title">${options.title}</div>
            <div class="vib3-debug-custom-content">${options.render()}</div>
        `;

        container.appendChild(section);

        this._customSections.set(name, {
            element: section.querySelector('.vib3-debug-custom-content'),
            update: options.update
        });
    }

    /**
     * Remove a custom section
     * @param {string} name
     */
    removeSection(name) {
        const section = this._customSections.get(name);
        if (section) {
            section.element.parentElement.remove();
            this._customSections.delete(name);
        }
    }

    /**
     * Set position
     * @param {string} position - PanelPosition value
     */
    setPosition(position) {
        this._panel.classList.remove(this.position);
        this.position = position;
        this._panel.classList.add(position);
    }

    /**
     * Format bytes for display
     * @private
     */
    _formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    /**
     * Format large numbers
     * @private
     */
    _formatNumber(num) {
        if (num < 1000) return String(num);
        if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
        return `${(num / 1000000).toFixed(2)}M`;
    }

    /**
     * Dispose panel
     */
    dispose() {
        if (this._panel && this._panel.parentElement) {
            this._panel.parentElement.removeChild(this._panel);
        }
        this._customSections.clear();
    }
}

export default DebugPanel;
