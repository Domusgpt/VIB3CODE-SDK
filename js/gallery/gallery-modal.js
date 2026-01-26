/**
 * VIB34D Inline Modal Gallery System
 * Fixes gallery 404 error by implementing modal-based gallery
 * No separate HTML page needed - all inline
 */

/**
 * Open inline gallery modal
 */
window.openGallery = function() {
    console.log('🖼️ Opening inline gallery modal...');

    // Create modal overlay if doesn't exist
    let modal = document.getElementById('gallery-modal');
    if (!modal) {
        modal = createGalleryModal();
        document.body.appendChild(modal);
    }

    // Load and display gallery items
    loadGalleryItems();

    // Show modal
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('visible');
    }, 10);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
};

/**
 * Close gallery modal
 */
window.closeGallery = function() {
    const modal = document.getElementById('gallery-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
    }
};

/**
 * Create gallery modal structure
 */
function createGalleryModal() {
    const modal = document.createElement('div');
    modal.id = 'gallery-modal';
    modal.className = 'gallery-modal';

    modal.innerHTML = `
        <div class="gallery-overlay" onclick="closeGallery()"></div>
        <div class="gallery-container">
            <!-- Gallery Header -->
            <div class="gallery-header">
                <div class="gallery-title">
                    <span class="gallery-icon">🖼️</span>
                    <span>VIB34D GALLERY</span>
                </div>
                <div class="gallery-stats" id="galleryStats">
                    Loading...
                </div>
                <button class="gallery-close-btn" onclick="closeGallery()">×</button>
            </div>

            <!-- Gallery Filter/Sort -->
            <div class="gallery-controls">
                <div class="filter-tabs">
                    <button class="filter-tab active" onclick="filterGallery('all')">All</button>
                    <button class="filter-tab" onclick="filterGallery('faceted')">🔷 Faceted</button>
                    <button class="filter-tab" onclick="filterGallery('quantum')">🌌 Quantum</button>
                    <button class="filter-tab" onclick="filterGallery('holographic')">✨ Holographic</button>
                </div>
                <select class="sort-select" onchange="sortGallery(this.value)">
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="system">By System</option>
                </select>
            </div>

            <!-- Gallery Grid -->
            <div class="gallery-grid" id="galleryGrid">
                <!-- Gallery items loaded dynamically -->
            </div>

            <!-- Empty State -->
            <div class="gallery-empty" id="galleryEmpty" style="display: none;">
                <div class="empty-icon">🎨</div>
                <div class="empty-title">No Variations Saved</div>
                <div class="empty-text">
                    Create your first variation by clicking "💾 Save to Gallery" in the control panel
                </div>
            </div>
        </div>
    `;

    return modal;
}

/**
 * Load gallery items from localStorage
 */
function loadGalleryItems() {
    console.log('📦 Loading gallery items...');

    try {
        // Get all gallery items from localStorage
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('vib34d-variation-')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    items.push({
                        key,
                        id: key.replace('vib34d-variation-', ''),
                        ...data
                    });
                } catch (e) {
                    console.warn(`Failed to parse ${key}:`, e);
                }
            }
        }

        console.log(`✅ Loaded ${items.length} gallery items`);

        // Update stats
        updateGalleryStats(items);

        // Display items
        if (items.length === 0) {
            showEmptyState();
        } else {
            displayGalleryItems(items);
        }

        return items;

    } catch (error) {
        console.error('❌ Failed to load gallery items:', error);
        showEmptyState();
        return [];
    }
}

/**
 * Update gallery statistics
 */
function updateGalleryStats(items) {
    const statsEl = document.getElementById('galleryStats');
    if (!statsEl) return;

    const systemCounts = items.reduce((acc, item) => {
        const system = item.system || 'unknown';
        acc[system] = (acc[system] || 0) + 1;
        return acc;
    }, {});

    const countText = Object.entries(systemCounts)
        .map(([sys, count]) => {
            const icons = {
                faceted: '🔷',
                quantum: '🌌',
                holographic: '✨',
                polychora: '🔮'
            };
            return `${icons[sys] || ''} ${count}`;
        })
        .join(' • ');

    statsEl.innerHTML = `
        <span class="stat-total">${items.length} Variations</span>
        ${countText ? `<span class="stat-breakdown">${countText}</span>` : ''}
    `;
}

/**
 * Display gallery items in grid
 */
function displayGalleryItems(items) {
    const grid = document.getElementById('galleryGrid');
    const emptyState = document.getElementById('galleryEmpty');

    if (!grid) return;

    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    // Sort by newest first (default)
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    grid.innerHTML = items.map(item => createGalleryCard(item)).join('');
}

/**
 * Create gallery card HTML
 */
function createGalleryCard(item) {
    const systemIcons = {
        faceted: '🔷',
        quantum: '🌌',
        holographic: '✨',
        polychora: '🔮'
    };

    const systemColors = {
        faceted: '#00ffff',
        quantum: '#ff00ff',
        holographic: '#ff64ff',
        polychora: '#ffff00'
    };

    const icon = systemIcons[item.system] || '🎨';
    const color = systemColors[item.system] || '#00ffff';
    const geometryName = getGeometryName(item.system, item.parameters?.geometry || 0);
    const timestamp = new Date(item.timestamp).toLocaleDateString();

    return `
        <div class="gallery-card" data-id="${item.id}" data-system="${item.system}">
            <div class="card-preview" style="border-color: ${color};">
                <div class="preview-icon" style="color: ${color};">${icon}</div>
                <div class="preview-info">
                    <div class="preview-system">${item.system.toUpperCase()}</div>
                    <div class="preview-geometry">${geometryName}</div>
                </div>
            </div>
            <div class="card-info">
                <div class="card-title">${item.name || `Variation #${item.id}`}</div>
                <div class="card-meta">
                    <span class="card-date">${timestamp}</span>
                    <span class="card-id">#${item.id}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="card-btn load-btn" onclick="loadGalleryVariation('${item.id}')" title="Load Variation">
                    ▶️ Load
                </button>
                <button class="card-btn delete-btn" onclick="deleteGalleryVariation('${item.id}')" title="Delete Variation">
                    🗑️
                </button>
            </div>
        </div>
    `;
}

/**
 * Get geometry name from index
 */
function getGeometryName(system, geometryIndex) {
    const geometries = {
        faceted: [
            'Tetrahedron', 'Hypercube', 'Sphere', 'Torus', 'Klein Bottle', 'Fractal', 'Wave', 'Crystal',
            '🌀 Tetrahedron', '🌀 Hypercube', '🌀 Sphere', '🌀 Torus', '🌀 Klein', '🌀 Fractal', '🌀 Wave', '🌀 Crystal',
            '🔺 Tetrahedron', '🔺 Hypercube', '🔺 Sphere', '🔺 Torus', '🔺 Klein', '🔺 Fractal', '🔺 Wave', '🔺 Crystal'
        ],
        quantum: [
            'Tetrahedron', 'Hypercube', 'Sphere', 'Torus', 'Klein Bottle', 'Fractal', 'Wave', 'Crystal',
            '🌀 Tetrahedron', '🌀 Hypercube', '🌀 Sphere', '🌀 Torus', '🌀 Klein', '🌀 Fractal', '🌀 Wave', '🌀 Crystal',
            '🔺 Tetrahedron', '🔺 Hypercube', '🔺 Sphere', '🔺 Torus', '🔺 Klein', '🔺 Fractal', '🔺 Wave', '🔺 Crystal'
        ],
        holographic: ['Holographic'],
        polychora: ['5-Cell', 'Tesseract', '16-Cell', '24-Cell', '600-Cell', '120-Cell']
    };

    const geoList = geometries[system] || geometries.faceted;
    return geoList[geometryIndex] || `Geometry #${geometryIndex}`;
}

/**
 * Load variation from gallery
 */
window.loadGalleryVariation = async function(id) {
    console.log(`📂 Loading variation ${id}...`);

    try {
        const key = `vib34d-variation-${id}`;
        const data = JSON.parse(localStorage.getItem(key));

        if (!data) {
            throw new Error(`Variation ${id} not found`);
        }

        console.log('✅ Loaded variation:', data);

        // Close gallery
        closeGallery();

        // Switch system if needed
        if (data.system && data.system !== window.currentSystem) {
            console.log(`🔄 Switching from ${window.currentSystem} to ${data.system}`);
            if (window.switchSystem) {
                await window.switchSystem(data.system);
                // Wait for system to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Apply parameters
        if (data.parameters) {
            Object.entries(data.parameters).forEach(([param, value]) => {
                if (param === 'geometry' && typeof value === 'number') {
                    // Select geometry
                    if (window.selectGeometry) {
                        window.selectGeometry(value);
                    }
                } else {
                    // Update slider
                    const slider = document.getElementById(param);
                    if (slider) {
                        slider.value = value;
                        if (window.updateParameter) {
                            window.updateParameter(param, value);
                        }
                    }
                }
            });
        }

        // Show success notification
        showNotification(`✅ Loaded: ${data.name || `Variation #${id}`}`, 'success');

    } catch (error) {
        console.error('❌ Failed to load variation:', error);
        showNotification(`❌ Failed to load variation: ${error.message}`, 'error');
    }
};

/**
 * Delete variation from gallery
 */
window.deleteGalleryVariation = function(id) {
    if (!confirm(`Delete variation #${id}?`)) {
        return;
    }

    try {
        const key = `vib34d-variation-${id}`;
        localStorage.removeItem(key);
        console.log(`🗑️ Deleted variation ${id}`);

        // Reload gallery
        loadGalleryItems();

        showNotification(`🗑️ Deleted variation #${id}`, 'success');

    } catch (error) {
        console.error('❌ Failed to delete variation:', error);
        showNotification(`❌ Failed to delete: ${error.message}`, 'error');
    }
};

/**
 * Filter gallery by system
 */
window.filterGallery = function(system) {
    console.log(`🔍 Filtering by: ${system}`);

    // Update active tab
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Filter cards
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach(card => {
        if (system === 'all' || card.dataset.system === system) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
};

/**
 * Sort gallery items
 */
window.sortGallery = function(sortBy) {
    console.log(`🔢 Sorting by: ${sortBy}`);

    const items = loadGalleryItems();

    if (sortBy === 'oldest') {
        items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (sortBy === 'system') {
        items.sort((a, b) => a.system.localeCompare(b.system));
    } else {
        // newest (default)
        items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    displayGalleryItems(items);
};

/**
 * Show empty state
 */
function showEmptyState() {
    const grid = document.getElementById('galleryGrid');
    const emptyState = document.getElementById('galleryEmpty');

    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `gallery-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)'};
        color: ${type === 'success' ? 'black' : 'white'};
        padding: 15px 20px;
        border-radius: 8px;
        font-family: 'Orbitron', monospace;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Keyboard shortcut: ESC to close gallery
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('gallery-modal');
        if (modal && modal.style.display !== 'none') {
            closeGallery();
        }
    }
});

console.log('🖼️ Gallery Modal Module: Loaded');
