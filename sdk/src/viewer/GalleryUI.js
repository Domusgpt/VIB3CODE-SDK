/**
 * GalleryUI.js - Browser for 100 Variations
 *
 * Provides a visual gallery interface for:
 * - Browsing all 100 variation slots (30 default + 70 custom)
 * - Filtering by system (quantum, faceted, holographic)
 * - Searching and sorting variations
 * - Preview thumbnails with live 4D rotation
 * - Import/export collections
 */

import { EventEmitter } from 'events';

/**
 * Gallery view modes
 */
export const ViewMode = {
    GRID: 'grid',
    LIST: 'list',
    CAROUSEL: 'carousel'
};

/**
 * Sort options
 */
export const SortBy = {
    INDEX: 'index',
    NAME: 'name',
    SYSTEM: 'system',
    RECENTLY_MODIFIED: 'recentlyModified',
    FAVORITES: 'favorites'
};

/**
 * GalleryUI - Visual browser for 100 variations
 */
export class GalleryUI extends EventEmitter {
    constructor(options = {}) {
        super();

        this.container = null;
        this.engine = null;
        this.gallerySystem = null;

        // View state
        this.viewMode = options.viewMode || ViewMode.GRID;
        this.sortBy = options.sortBy || SortBy.INDEX;
        this.filterSystem = options.filterSystem || null;
        this.searchQuery = '';
        this.selectedIndex = 0;
        this.pageSize = options.pageSize || 20;
        this.currentPage = 0;

        // Configuration
        this.config = {
            thumbnailSize: options.thumbnailSize || 150,
            previewDelay: options.previewDelay || 300,
            animatePreview: options.animatePreview !== false,
            showLabels: options.showLabels !== false,
            gridColumns: options.gridColumns || 5
        };

        // Internal state
        this._variations = [];
        this._filteredVariations = [];
        this._thumbnailCache = new Map();
        this._previewTimer = null;
        this._previewCanvas = null;

        // DOM elements
        this._elements = {};

        // Bind methods
        this._onVariationClick = this._onVariationClick.bind(this);
        this._onVariationHover = this._onVariationHover.bind(this);
        this._onSearch = this._onSearch.bind(this);
        this._onPageChange = this._onPageChange.bind(this);
    }

    /**
     * Initialize gallery UI
     */
    initialize(container, engine, gallerySystem) {
        this.container = container;
        this.engine = engine;
        this.gallerySystem = gallerySystem;

        // Load variations
        this._loadVariations();

        // Build UI
        this._buildUI();

        // Render initial view
        this.render();

        this.emit('initialized');
        return this;
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
        }

        this._thumbnailCache.clear();

        if (this.container) {
            this.container.innerHTML = '';
        }

        this.emit('disposed');
    }

    /**
     * Load variations from gallery system
     */
    _loadVariations() {
        this._variations = [];

        // Load 100 variation slots
        for (let i = 0; i < 100; i++) {
            const variation = this.gallerySystem?.getVariation(i) || this._getDefaultVariation(i);
            this._variations.push({
                index: i,
                ...variation,
                isDefault: i < 30,
                isEmpty: !variation.system
            });
        }

        this._applyFilters();
    }

    /**
     * Get default variation for slot
     */
    _getDefaultVariation(index) {
        if (index >= 30) {
            return { name: `Custom ${index - 29}`, system: null, geometry: 0 };
        }

        const systems = ['quantum', 'faceted', 'holographic'];
        const system = systems[Math.floor(index / 10)];
        const geometryIndex = index % 10;

        const geometryNames = [
            'Tetrahedron', 'Hypercube', 'Sphere', 'Torus',
            'Klein Bottle', 'Fractal', 'Wave', 'Crystal',
            'Hypersphere Tetra', 'Hypersphere Cube'
        ];

        return {
            name: `${geometryNames[geometryIndex]} (${system})`,
            system,
            geometry: geometryIndex,
            rotation: { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 }
        };
    }

    /**
     * Build gallery UI elements
     */
    _buildUI() {
        this.container.innerHTML = '';
        this.container.className = 'vib3-gallery';

        // Apply container styles
        Object.assign(this.container.style, {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#0a0a0f',
            color: '#ffffff',
            fontFamily: '"Segoe UI", Arial, sans-serif'
        });

        // Create header
        this._elements.header = this._createHeader();
        this.container.appendChild(this._elements.header);

        // Create main content area
        this._elements.content = document.createElement('div');
        Object.assign(this._elements.content.style, {
            flex: '1',
            overflow: 'auto',
            padding: '20px'
        });
        this.container.appendChild(this._elements.content);

        // Create pagination
        this._elements.pagination = this._createPagination();
        this.container.appendChild(this._elements.pagination);

        // Create preview overlay
        this._elements.preview = this._createPreviewOverlay();
        this.container.appendChild(this._elements.preview);
    }

    /**
     * Create header with controls
     */
    _createHeader() {
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            padding: '15px 20px',
            borderBottom: '1px solid #333',
            background: '#111'
        });

        // Title
        const title = document.createElement('h2');
        title.textContent = 'VIB3+ Gallery';
        Object.assign(title.style, {
            margin: '0',
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#00ffff'
        });
        header.appendChild(title);

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';
        header.appendChild(spacer);

        // Search input
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Search variations...';
        Object.assign(search.style, {
            padding: '8px 12px',
            background: '#222',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff',
            width: '200px'
        });
        search.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this._applyFilters();
            this.render();
        });
        header.appendChild(search);

        // System filter
        const systemFilter = document.createElement('select');
        Object.assign(systemFilter.style, {
            padding: '8px 12px',
            background: '#222',
            border: '1px solid #444',
            borderRadius: '4px',
            color: '#fff'
        });
        systemFilter.innerHTML = `
            <option value="">All Systems</option>
            <option value="quantum">Quantum</option>
            <option value="faceted">Faceted</option>
            <option value="holographic">Holographic</option>
        `;
        systemFilter.addEventListener('change', (e) => {
            this.filterSystem = e.target.value || null;
            this._applyFilters();
            this.render();
        });
        header.appendChild(systemFilter);

        // View mode toggle
        const viewToggle = document.createElement('div');
        Object.assign(viewToggle.style, {
            display: 'flex',
            gap: '5px'
        });

        ['grid', 'list', 'carousel'].forEach(mode => {
            const btn = document.createElement('button');
            btn.textContent = mode === 'grid' ? '⊞' : mode === 'list' ? '☰' : '◐';
            Object.assign(btn.style, {
                padding: '8px 12px',
                background: this.viewMode === mode ? '#00ffff' : '#222',
                border: 'none',
                borderRadius: '4px',
                color: this.viewMode === mode ? '#000' : '#fff',
                cursor: 'pointer'
            });
            btn.addEventListener('click', () => {
                this.viewMode = mode;
                this.render();
            });
            viewToggle.appendChild(btn);
        });
        header.appendChild(viewToggle);

        return header;
    }

    /**
     * Create pagination controls
     */
    _createPagination() {
        const pagination = document.createElement('div');
        Object.assign(pagination.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '15px',
            borderTop: '1px solid #333',
            background: '#111'
        });

        return pagination;
    }

    /**
     * Create preview overlay
     */
    _createPreviewOverlay() {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '1000'
        });

        overlay.addEventListener('click', () => {
            this._hidePreview();
        });

        return overlay;
    }

    /**
     * Apply current filters
     */
    _applyFilters() {
        this._filteredVariations = this._variations.filter(v => {
            // System filter
            if (this.filterSystem && v.system !== this.filterSystem) {
                return false;
            }

            // Search filter
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                return v.name.toLowerCase().includes(query) ||
                       v.system?.toLowerCase().includes(query);
            }

            return true;
        });

        // Apply sorting
        this._filteredVariations.sort((a, b) => {
            switch (this.sortBy) {
                case SortBy.NAME:
                    return a.name.localeCompare(b.name);
                case SortBy.SYSTEM:
                    return (a.system || 'zzz').localeCompare(b.system || 'zzz');
                case SortBy.FAVORITES:
                    return (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
                default:
                    return a.index - b.index;
            }
        });

        this.currentPage = 0;
    }

    /**
     * Render gallery
     */
    render() {
        switch (this.viewMode) {
            case ViewMode.LIST:
                this._renderList();
                break;
            case ViewMode.CAROUSEL:
                this._renderCarousel();
                break;
            default:
                this._renderGrid();
        }

        this._updatePagination();
    }

    /**
     * Render grid view
     */
    _renderGrid() {
        const content = this._elements.content;
        content.innerHTML = '';

        Object.assign(content.style, {
            display: 'grid',
            gridTemplateColumns: `repeat(${this.config.gridColumns}, 1fr)`,
            gap: '15px'
        });

        const start = this.currentPage * this.pageSize;
        const end = Math.min(start + this.pageSize, this._filteredVariations.length);
        const pageVariations = this._filteredVariations.slice(start, end);

        pageVariations.forEach(variation => {
            const card = this._createVariationCard(variation);
            content.appendChild(card);
        });
    }

    /**
     * Render list view
     */
    _renderList() {
        const content = this._elements.content;
        content.innerHTML = '';

        Object.assign(content.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        const start = this.currentPage * this.pageSize;
        const end = Math.min(start + this.pageSize, this._filteredVariations.length);
        const pageVariations = this._filteredVariations.slice(start, end);

        pageVariations.forEach(variation => {
            const row = this._createVariationRow(variation);
            content.appendChild(row);
        });
    }

    /**
     * Render carousel view
     */
    _renderCarousel() {
        const content = this._elements.content;
        content.innerHTML = '';

        Object.assign(content.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px'
        });

        // Show 5 items centered on selection
        const total = this._filteredVariations.length;
        const indices = [-2, -1, 0, 1, 2].map(offset => {
            const idx = this.selectedIndex + offset;
            return ((idx % total) + total) % total;
        });

        indices.forEach((idx, position) => {
            const variation = this._filteredVariations[idx];
            const card = this._createCarouselCard(variation, position === 2);
            content.appendChild(card);
        });
    }

    /**
     * Create variation card for grid view
     */
    _createVariationCard(variation) {
        const card = document.createElement('div');
        Object.assign(card.style, {
            background: '#1a1a2e',
            borderRadius: '8px',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            border: variation.index === this.selectedIndex ? '2px solid #00ffff' : '2px solid transparent'
        });

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'scale(1.05)';
            card.style.boxShadow = '0 4px 20px rgba(0, 255, 255, 0.3)';
            this._onVariationHover(variation);
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
        });

        card.addEventListener('click', () => {
            this._onVariationClick(variation);
        });

        // Thumbnail
        const thumb = document.createElement('div');
        Object.assign(thumb.style, {
            width: '100%',
            aspectRatio: '1',
            background: this._getSystemGradient(variation.system),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            color: '#fff'
        });
        thumb.textContent = variation.isEmpty ? '+' : variation.index;
        card.appendChild(thumb);

        // Info
        if (this.config.showLabels) {
            const info = document.createElement('div');
            Object.assign(info.style, {
                padding: '10px',
                fontSize: '12px'
            });

            const name = document.createElement('div');
            name.textContent = variation.name;
            Object.assign(name.style, {
                fontWeight: 'bold',
                marginBottom: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            });
            info.appendChild(name);

            if (variation.system) {
                const system = document.createElement('div');
                system.textContent = variation.system;
                Object.assign(system.style, {
                    color: this._getSystemColor(variation.system),
                    fontSize: '10px',
                    textTransform: 'uppercase'
                });
                info.appendChild(system);
            }

            card.appendChild(info);
        }

        return card;
    }

    /**
     * Create variation row for list view
     */
    _createVariationRow(variation) {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            padding: '10px 15px',
            background: '#1a1a2e',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background 0.2s',
            border: variation.index === this.selectedIndex ? '2px solid #00ffff' : '2px solid transparent'
        });

        row.addEventListener('mouseenter', () => {
            row.style.background = '#252545';
        });

        row.addEventListener('mouseleave', () => {
            row.style.background = '#1a1a2e';
        });

        row.addEventListener('click', () => {
            this._onVariationClick(variation);
        });

        // Index
        const index = document.createElement('div');
        index.textContent = String(variation.index).padStart(2, '0');
        Object.assign(index.style, {
            width: '30px',
            color: '#666',
            fontFamily: 'monospace'
        });
        row.appendChild(index);

        // Thumbnail
        const thumb = document.createElement('div');
        Object.assign(thumb.style, {
            width: '50px',
            height: '50px',
            borderRadius: '4px',
            background: this._getSystemGradient(variation.system),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });
        row.appendChild(thumb);

        // Name
        const name = document.createElement('div');
        name.textContent = variation.name;
        name.style.flex = '1';
        row.appendChild(name);

        // System badge
        if (variation.system) {
            const badge = document.createElement('div');
            badge.textContent = variation.system;
            Object.assign(badge.style, {
                padding: '4px 8px',
                background: this._getSystemColor(variation.system),
                borderRadius: '4px',
                fontSize: '10px',
                textTransform: 'uppercase',
                color: '#000'
            });
            row.appendChild(badge);
        }

        return row;
    }

    /**
     * Create carousel card
     */
    _createCarouselCard(variation, isCenter) {
        const card = document.createElement('div');
        const size = isCenter ? 300 : 150;
        const opacity = isCenter ? 1 : 0.5;

        Object.assign(card.style, {
            width: `${size}px`,
            height: `${size * 1.4}px`,
            background: '#1a1a2e',
            borderRadius: '12px',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.3s',
            opacity: String(opacity),
            transform: isCenter ? 'scale(1)' : 'scale(0.8)'
        });

        card.addEventListener('click', () => {
            this._onVariationClick(variation);
        });

        // Content
        const content = document.createElement('div');
        Object.assign(content.style, {
            width: '100%',
            height: '80%',
            background: this._getSystemGradient(variation.system),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: isCenter ? '48px' : '24px',
            color: '#fff'
        });
        content.textContent = variation.index;
        card.appendChild(content);

        // Label
        const label = document.createElement('div');
        Object.assign(label.style, {
            padding: '10px',
            textAlign: 'center',
            fontSize: isCenter ? '16px' : '12px'
        });
        label.textContent = variation.name;
        card.appendChild(label);

        return card;
    }

    /**
     * Update pagination
     */
    _updatePagination() {
        const pagination = this._elements.pagination;
        pagination.innerHTML = '';

        const totalPages = Math.ceil(this._filteredVariations.length / this.pageSize);

        if (totalPages <= 1) return;

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '◀';
        prevBtn.disabled = this.currentPage === 0;
        Object.assign(prevBtn.style, {
            padding: '8px 12px',
            background: '#222',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: prevBtn.disabled ? 'not-allowed' : 'pointer',
            opacity: prevBtn.disabled ? '0.5' : '1'
        });
        prevBtn.addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.render();
            }
        });
        pagination.appendChild(prevBtn);

        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `${this.currentPage + 1} / ${totalPages}`;
        pageInfo.style.padding = '0 15px';
        pagination.appendChild(pageInfo);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '▶';
        nextBtn.disabled = this.currentPage >= totalPages - 1;
        Object.assign(nextBtn.style, {
            padding: '8px 12px',
            background: '#222',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: nextBtn.disabled ? 'not-allowed' : 'pointer',
            opacity: nextBtn.disabled ? '0.5' : '1'
        });
        nextBtn.addEventListener('click', () => {
            if (this.currentPage < totalPages - 1) {
                this.currentPage++;
                this.render();
            }
        });
        pagination.appendChild(nextBtn);
    }

    /**
     * Handle variation click
     */
    _onVariationClick(variation) {
        this.selectedIndex = variation.index;
        this.emit('select', variation);
        this.render();
    }

    /**
     * Handle variation hover
     */
    _onVariationHover(variation) {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
        }

        this._previewTimer = setTimeout(() => {
            this.emit('preview', variation);
        }, this.config.previewDelay);
    }

    /**
     * Show preview overlay
     */
    _showPreview(variation) {
        this._elements.preview.style.display = 'flex';
        // Preview content would be rendered here
    }

    /**
     * Hide preview overlay
     */
    _hidePreview() {
        this._elements.preview.style.display = 'none';
    }

    /**
     * Get gradient for system
     */
    _getSystemGradient(system) {
        const gradients = {
            quantum: 'linear-gradient(135deg, #00ff88, #0088ff)',
            faceted: 'linear-gradient(135deg, #ff4488, #ff8844)',
            holographic: 'linear-gradient(135deg, #44aaff, #aa44ff)'
        };
        return gradients[system] || 'linear-gradient(135deg, #333, #555)';
    }

    /**
     * Get color for system
     */
    _getSystemColor(system) {
        const colors = {
            quantum: '#00ff88',
            faceted: '#ff4488',
            holographic: '#44aaff'
        };
        return colors[system] || '#888';
    }

    /**
     * Get current selection
     */
    getSelection() {
        return this._variations[this.selectedIndex];
    }

    /**
     * Set selection by index
     */
    setSelection(index) {
        if (index >= 0 && index < this._variations.length) {
            this.selectedIndex = index;
            this.render();
            this.emit('select', this._variations[index]);
        }
    }

    /**
     * Refresh gallery data
     */
    refresh() {
        this._loadVariations();
        this.render();
        this.emit('refresh');
    }
}

export default GalleryUI;
