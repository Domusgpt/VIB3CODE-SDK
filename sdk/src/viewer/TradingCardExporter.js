/**
 * TradingCardExporter.js - Export Visualization Frames as Trading Cards
 *
 * Creates high-quality trading card exports with:
 * - Standard card dimensions (2.5" x 3.5" at various DPI)
 * - Custom borders and frames
 * - Metadata overlays (name, stats, rarity)
 * - Multiple export formats (PNG, JPEG, WebP, PDF)
 * - Batch export capabilities
 */

import { EventEmitter } from 'events';

/**
 * Card size presets (in pixels at 300 DPI)
 */
export const CardSize = {
    STANDARD: { width: 750, height: 1050, name: 'Standard (2.5" x 3.5")' },
    MINI: { width: 525, height: 735, name: 'Mini (1.75" x 2.45")' },
    JUMBO: { width: 1050, height: 1470, name: 'Jumbo (3.5" x 4.9")' },
    SQUARE: { width: 900, height: 900, name: 'Square (3" x 3")' },
    POSTER: { width: 1800, height: 2400, name: 'Poster (6" x 8")' }
};

/**
 * Card frame styles
 */
export const FrameStyle = {
    NONE: 'none',
    SIMPLE: 'simple',
    HOLOGRAPHIC: 'holographic',
    QUANTUM: 'quantum',
    FACETED: 'faceted',
    VINTAGE: 'vintage',
    FUTURISTIC: 'futuristic'
};

/**
 * Rarity levels with colors
 */
export const Rarity = {
    COMMON: { name: 'Common', color: '#888888', glow: false },
    UNCOMMON: { name: 'Uncommon', color: '#4CAF50', glow: false },
    RARE: { name: 'Rare', color: '#2196F3', glow: true },
    EPIC: { name: 'Epic', color: '#9C27B0', glow: true },
    LEGENDARY: { name: 'Legendary', color: '#FF9800', glow: true },
    MYTHIC: { name: 'Mythic', color: '#FF5722', glow: true, animated: true }
};

/**
 * TradingCardExporter - Export visualization frames as trading cards
 */
export class TradingCardExporter extends EventEmitter {
    constructor(options = {}) {
        super();

        this.sourceCanvas = null;
        this.exportCanvas = null;
        this.ctx = null;

        // Default configuration
        this.config = {
            size: options.size || CardSize.STANDARD,
            frameStyle: options.frameStyle || FrameStyle.HOLOGRAPHIC,
            borderWidth: options.borderWidth || 20,
            cornerRadius: options.cornerRadius || 20,
            quality: options.quality || 0.95,
            showMetadata: options.showMetadata !== false,
            showRarity: options.showRarity !== false,
            showStats: options.showStats || false
        };

        // Card metadata
        this.metadata = {
            title: options.title || 'VIB3+ Visualization',
            subtitle: options.subtitle || '',
            rarity: options.rarity || Rarity.RARE,
            system: options.system || 'quantum',
            geometry: options.geometry || 0,
            variation: options.variation || 0,
            stats: options.stats || {}
        };

        // Create offscreen canvas
        this._createExportCanvas();
    }

    /**
     * Initialize with source canvas
     */
    initialize(sourceCanvas) {
        this.sourceCanvas = sourceCanvas;
        this.emit('initialized');
        return this;
    }

    /**
     * Create offscreen export canvas
     */
    _createExportCanvas() {
        if (typeof OffscreenCanvas !== 'undefined') {
            this.exportCanvas = new OffscreenCanvas(
                this.config.size.width,
                this.config.size.height
            );
        } else {
            this.exportCanvas = document.createElement('canvas');
            this.exportCanvas.width = this.config.size.width;
            this.exportCanvas.height = this.config.size.height;
        }
        this.ctx = this.exportCanvas.getContext('2d');
    }

    /**
     * Set card size
     */
    setSize(size) {
        this.config.size = size;
        this.exportCanvas.width = size.width;
        this.exportCanvas.height = size.height;
    }

    /**
     * Set card metadata
     */
    setMetadata(metadata) {
        Object.assign(this.metadata, metadata);
    }

    /**
     * Export current frame as trading card
     */
    async exportCard(format = 'png') {
        if (!this.sourceCanvas) {
            throw new Error('Source canvas not initialized');
        }

        const { width, height } = this.config.size;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Draw background
        this._drawBackground();

        // Draw frame
        this._drawFrame();

        // Draw visualization (with padding for frame)
        this._drawVisualization();

        // Draw metadata
        if (this.config.showMetadata) {
            this._drawMetadata();
        }

        // Draw rarity indicator
        if (this.config.showRarity) {
            this._drawRarity();
        }

        // Draw stats
        if (this.config.showStats) {
            this._drawStats();
        }

        // Export to blob
        const blob = await this._canvasToBlob(format);

        this.emit('exported', { format, size: blob.size });

        return blob;
    }

    /**
     * Download card
     */
    async downloadCard(filename, format = 'png') {
        const blob = await this.exportCard(format);
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = `${filename}.${format}`;
        link.href = url;
        link.click();

        URL.revokeObjectURL(url);

        this.emit('downloaded', { filename, format });
    }

    /**
     * Export batch of cards at different rotations
     */
    async exportBatch(rotations, format = 'png') {
        const results = [];

        for (let i = 0; i < rotations.length; i++) {
            const rotation = rotations[i];

            // Apply rotation to engine (if available)
            if (this.engine?.setRotation) {
                this.engine.setRotation(rotation);
                // Wait for render
                await new Promise(resolve => requestAnimationFrame(resolve));
            }

            const blob = await this.exportCard(format);
            results.push({
                index: i,
                rotation,
                blob,
                size: blob.size
            });

            this.emit('batchProgress', { current: i + 1, total: rotations.length });
        }

        this.emit('batchComplete', { count: results.length });

        return results;
    }

    /**
     * Draw card background
     */
    _drawBackground() {
        const { width, height } = this.config.size;
        const { cornerRadius } = this.config;

        // Draw rounded rectangle background
        this.ctx.fillStyle = '#0a0a0f';
        this._roundedRect(0, 0, width, height, cornerRadius);
        this.ctx.fill();

        // Add subtle gradient
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'rgba(30, 30, 50, 0.5)');
        gradient.addColorStop(1, 'rgba(10, 10, 20, 0.5)');
        this.ctx.fillStyle = gradient;
        this._roundedRect(0, 0, width, height, cornerRadius);
        this.ctx.fill();
    }

    /**
     * Draw card frame
     */
    _drawFrame() {
        const { width, height } = this.config.size;
        const { borderWidth, cornerRadius, frameStyle } = this.config;

        this.ctx.lineWidth = borderWidth;

        switch (frameStyle) {
            case FrameStyle.HOLOGRAPHIC:
                this._drawHolographicFrame(width, height, cornerRadius);
                break;
            case FrameStyle.QUANTUM:
                this._drawQuantumFrame(width, height, cornerRadius);
                break;
            case FrameStyle.FACETED:
                this._drawFacetedFrame(width, height, cornerRadius);
                break;
            case FrameStyle.SIMPLE:
                this._drawSimpleFrame(width, height, cornerRadius);
                break;
            case FrameStyle.VINTAGE:
                this._drawVintageFrame(width, height, cornerRadius);
                break;
            case FrameStyle.FUTURISTIC:
                this._drawFuturisticFrame(width, height, cornerRadius);
                break;
        }
    }

    _drawHolographicFrame(width, height, radius) {
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#ff00ff');
        gradient.addColorStop(0.25, '#00ffff');
        gradient.addColorStop(0.5, '#ffff00');
        gradient.addColorStop(0.75, '#ff00ff');
        gradient.addColorStop(1, '#00ffff');

        this.ctx.strokeStyle = gradient;
        this._roundedRect(10, 10, width - 20, height - 20, radius);
        this.ctx.stroke();

        // Inner glow
        this.ctx.shadowColor = '#ff00ff';
        this.ctx.shadowBlur = 15;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    _drawQuantumFrame(width, height, radius) {
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#00ff88');
        gradient.addColorStop(0.5, '#0088ff');
        gradient.addColorStop(1, '#8800ff');

        this.ctx.strokeStyle = gradient;
        this._roundedRect(10, 10, width - 20, height - 20, radius);
        this.ctx.stroke();

        // Quantum particles effect
        this.ctx.fillStyle = '#00ffff';
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    _drawFacetedFrame(width, height, radius) {
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#ff4444');
        gradient.addColorStop(0.33, '#44ff44');
        gradient.addColorStop(0.66, '#4444ff');
        gradient.addColorStop(1, '#ff4444');

        this.ctx.strokeStyle = gradient;

        // Draw angular frame
        this.ctx.beginPath();
        const inset = 15;
        const cut = 30;
        this.ctx.moveTo(inset + cut, inset);
        this.ctx.lineTo(width - inset - cut, inset);
        this.ctx.lineTo(width - inset, inset + cut);
        this.ctx.lineTo(width - inset, height - inset - cut);
        this.ctx.lineTo(width - inset - cut, height - inset);
        this.ctx.lineTo(inset + cut, height - inset);
        this.ctx.lineTo(inset, height - inset - cut);
        this.ctx.lineTo(inset, inset + cut);
        this.ctx.closePath();
        this.ctx.stroke();
    }

    _drawSimpleFrame(width, height, radius) {
        this.ctx.strokeStyle = '#ffffff';
        this._roundedRect(10, 10, width - 20, height - 20, radius);
        this.ctx.stroke();
    }

    _drawVintageFrame(width, height, radius) {
        this.ctx.strokeStyle = '#d4af37';
        this.ctx.lineWidth = 25;
        this._roundedRect(12, 12, width - 24, height - 24, radius);
        this.ctx.stroke();

        this.ctx.strokeStyle = '#8b7355';
        this.ctx.lineWidth = 15;
        this._roundedRect(12, 12, width - 24, height - 24, radius);
        this.ctx.stroke();
    }

    _drawFuturisticFrame(width, height, radius) {
        const gradient = this.ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#00ffff');
        gradient.addColorStop(1, '#ff00ff');

        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 3;

        // Outer frame
        this._roundedRect(5, 5, width - 10, height - 10, radius);
        this.ctx.stroke();

        // Inner frame
        this._roundedRect(15, 15, width - 30, height - 30, radius - 5);
        this.ctx.stroke();

        // Corner accents
        this.ctx.lineWidth = 5;
        const cornerSize = 40;
        [[0, 0], [width, 0], [0, height], [width, height]].forEach(([cx, cy]) => {
            this.ctx.beginPath();
            this.ctx.moveTo(cx === 0 ? 5 : width - 5, cy === 0 ? 5 : height - 5);
            this.ctx.lineTo(cx === 0 ? 5 + cornerSize : width - 5 - cornerSize, cy === 0 ? 5 : height - 5);
            this.ctx.moveTo(cx === 0 ? 5 : width - 5, cy === 0 ? 5 : height - 5);
            this.ctx.lineTo(cx === 0 ? 5 : width - 5, cy === 0 ? 5 + cornerSize : height - 5 - cornerSize);
            this.ctx.stroke();
        });
    }

    /**
     * Draw visualization from source canvas
     */
    _drawVisualization() {
        if (!this.sourceCanvas) return;

        const { width, height } = this.config.size;
        const padding = this.config.borderWidth + 20;

        // Calculate visualization area (top 60% of card)
        const vizWidth = width - padding * 2;
        const vizHeight = (height - padding * 2) * 0.6;

        // Draw with aspect ratio preservation
        const sourceAspect = this.sourceCanvas.width / this.sourceCanvas.height;
        const targetAspect = vizWidth / vizHeight;

        let drawWidth, drawHeight, drawX, drawY;

        if (sourceAspect > targetAspect) {
            drawWidth = vizWidth;
            drawHeight = vizWidth / sourceAspect;
            drawX = padding;
            drawY = padding + (vizHeight - drawHeight) / 2;
        } else {
            drawHeight = vizHeight;
            drawWidth = vizHeight * sourceAspect;
            drawX = padding + (vizWidth - drawWidth) / 2;
            drawY = padding;
        }

        // Draw border for visualization area
        this.ctx.fillStyle = '#000000';
        this._roundedRect(padding, padding, vizWidth, vizHeight, 10);
        this.ctx.fill();

        // Draw the visualization
        this.ctx.drawImage(this.sourceCanvas, drawX, drawY, drawWidth, drawHeight);
    }

    /**
     * Draw card metadata (title, subtitle)
     */
    _drawMetadata() {
        const { width, height } = this.config.size;
        const padding = this.config.borderWidth + 20;

        // Title area (below visualization)
        const titleY = height * 0.65;

        // Title
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.metadata.title, width / 2, titleY);

        // Subtitle
        if (this.metadata.subtitle) {
            this.ctx.fillStyle = '#aaaaaa';
            this.ctx.font = '24px "Segoe UI", Arial, sans-serif';
            this.ctx.fillText(this.metadata.subtitle, width / 2, titleY + 35);
        }

        // System badge
        const systemColors = {
            quantum: '#00ff88',
            faceted: '#ff4488',
            holographic: '#44aaff'
        };
        const systemColor = systemColors[this.metadata.system] || '#ffffff';

        this.ctx.fillStyle = systemColor;
        this.ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(this.metadata.system.toUpperCase(), padding, height - padding - 60);

        // Geometry & Variation info
        this.ctx.fillStyle = '#888888';
        this.ctx.font = '16px "Segoe UI", Arial, sans-serif';
        this.ctx.fillText(`Geometry: ${this.metadata.geometry} | Variation: ${this.metadata.variation}`, padding, height - padding - 35);
    }

    /**
     * Draw rarity indicator
     */
    _drawRarity() {
        const { width, height } = this.config.size;
        const padding = this.config.borderWidth + 20;
        const rarity = this.metadata.rarity;

        // Rarity badge
        const badgeX = width - padding - 100;
        const badgeY = height - padding - 50;
        const badgeWidth = 90;
        const badgeHeight = 30;

        // Badge background
        this.ctx.fillStyle = rarity.color;
        this._roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5);
        this.ctx.fill();

        // Glow effect for rare+ cards
        if (rarity.glow) {
            this.ctx.shadowColor = rarity.color;
            this.ctx.shadowBlur = 10;
            this._roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Rarity text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(rarity.name.toUpperCase(), badgeX + badgeWidth / 2, badgeY + 20);
    }

    /**
     * Draw stats (if enabled)
     */
    _drawStats() {
        const { width, height } = this.config.size;
        const padding = this.config.borderWidth + 20;
        const stats = this.metadata.stats;

        if (!stats || Object.keys(stats).length === 0) return;

        // Stats area
        const statsY = height * 0.72;
        const statWidth = (width - padding * 2) / Object.keys(stats).length;

        this.ctx.textAlign = 'center';
        let x = padding + statWidth / 2;

        for (const [key, value] of Object.entries(stats)) {
            // Stat value
            this.ctx.fillStyle = '#00ffff';
            this.ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
            this.ctx.fillText(String(value), x, statsY);

            // Stat name
            this.ctx.fillStyle = '#888888';
            this.ctx.font = '14px "Segoe UI", Arial, sans-serif';
            this.ctx.fillText(key.toUpperCase(), x, statsY + 20);

            x += statWidth;
        }
    }

    /**
     * Draw rounded rectangle path
     */
    _roundedRect(x, y, width, height, radius) {
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
        this.ctx.closePath();
    }

    /**
     * Convert canvas to blob
     */
    async _canvasToBlob(format) {
        const mimeType = `image/${format}`;

        if (this.exportCanvas instanceof OffscreenCanvas) {
            return await this.exportCanvas.convertToBlob({
                type: mimeType,
                quality: this.config.quality
            });
        }

        return new Promise(resolve => {
            this.exportCanvas.toBlob(resolve, mimeType, this.config.quality);
        });
    }

    /**
     * Get card as data URL
     */
    async getDataURL(format = 'png') {
        await this.exportCard(format);
        return this.exportCanvas.toDataURL(`image/${format}`, this.config.quality);
    }

    /**
     * Serialize configuration
     */
    toJSON() {
        return {
            config: this.config,
            metadata: this.metadata
        };
    }

    /**
     * Restore from serialized state
     */
    fromJSON(data) {
        if (data.config) Object.assign(this.config, data.config);
        if (data.metadata) Object.assign(this.metadata, data.metadata);
        this.setSize(this.config.size);
    }
}

export default TradingCardExporter;
