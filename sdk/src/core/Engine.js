/**
 * VIB34D Integrated Holographic Engine
 * Main system controller combining 5-layer holographic rendering
 * with 4D polytopal mathematics and 100 geometric variations
 */

import { IntegratedHolographicVisualizer } from './Visualizer.js';
import { ParameterManager } from './Parameters.js';
import { VariationManager } from '../variations/VariationManager.js';
import { GallerySystem } from '../gallery/GallerySystem.js';
import { ExportManager } from '../export/ExportManager.js';
// InteractionHandler removed - each system handles its own interactions
import { StatusManager } from '../ui/StatusManager.js';

export class VIB34DIntegratedEngine {
    constructor() {
        // Core system components
        this.visualizers = [];
        this.parameterManager = new ParameterManager();
        this.variationManager = new VariationManager(this); // CRITICAL FIX: Pass this as engine parameter
        this.gallerySystem = new GallerySystem(this);
        this.exportManager = new ExportManager(this);
        // Each system handles its own interactions - no central handler needed
        this.statusManager = new StatusManager();
        
        // Active state for reactivity
        this.isActive = false;
        
        // Conditional reactivity: Use built-in only if ReactivityManager not active
        this.useBuiltInReactivity = !window.reactivityManager;
        
        // Current state
        this.currentVariation = 0;
        this.totalVariations = 100; // 30 default + 70 custom
        
        // Mouse interaction state
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.mouseIntensity = 0.0;
        this.clickIntensity = 0.0;
        
        // Animation state
        this.time = 0;
        this.animationId = null;
        
        // Initialize system
        this.init();
    }
    
    /**
     * Initialize the complete VIB34D system
     */
    init() {
        console.log('🌌 Initializing VIB34D Integrated Holographic Engine...');
        
        try {
            this.createVisualizers();
            this.setupControls();
            this.setupInteractions();
            this.loadCustomVariations();
            this.populateVariationGrid();
            this.startRenderLoop();
            
            this.statusManager.setStatus('VIB34D Engine initialized successfully', 'success');
            console.log('✅ VIB34D Engine ready');
        } catch (error) {
            console.error('❌ Failed to initialize VIB34D Engine:', error);
            this.statusManager.setStatus('Initialization failed: ' + error.message, 'error');
        }
    }
    
    /**
     * Create the 5-layer holographic visualization system
     */
    createVisualizers() {
        const layers = [
            { id: 'background-canvas', role: 'background', reactivity: 0.5 },
            { id: 'shadow-canvas', role: 'shadow', reactivity: 0.7 },
            { id: 'content-canvas', role: 'content', reactivity: 0.9 },
            { id: 'highlight-canvas', role: 'highlight', reactivity: 1.1 },
            { id: 'accent-canvas', role: 'accent', reactivity: 1.5 }
        ];
        
        layers.forEach(layer => {
            const visualizer = new IntegratedHolographicVisualizer(
                layer.id, 
                layer.role, 
                layer.reactivity, 
                this.currentVariation
            );
            this.visualizers.push(visualizer);
        });
        
        console.log('✅ Created 5-layer integrated holographic system');
    }
    
    /**
     * Set up UI controls and event handlers
     */
    setupControls() {
        // Delegate to UI components
        this.setupTabSystem();
        this.setupParameterControls();
        this.setupGeometryPresets();
        this.updateDisplayValues();
    }
    
    setupTabSystem() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
            });
        });
    }
    
    setupParameterControls() {
        const controls = [
            'variationSlider', 'rot4dXW', 'rot4dYW', 'rot4dZW', 'dimension',
            'gridDensity', 'morphFactor', 'chaos', 'speed', 'hue'
        ];
        
        controls.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.updateFromControls());
            }
        });
    }
    
    setupGeometryPresets() {
        document.querySelectorAll('[data-geometry]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-geometry]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.parameterManager.setGeometry(parseInt(btn.dataset.geometry));
                this.updateVisualizers();
                this.updateDisplayValues();
            });
        });
    }
    
    /**
     * Set up mouse/touch interactions
     */
    setupInteractions() {
        if (!this.useBuiltInReactivity) {
            console.log('🔷 Faceted built-in reactivity DISABLED - ReactivityManager active');
            return;
        }
        
        console.log('🔷 Setting up Faceted 4D rotation mouse reactivity');
        this.setup4DRotationReactivity();
    }
    
    setup4DRotationReactivity() {
        console.log('🔷 Setting up Faceted: 4D rotations + click flash + scroll density');
        
        // Color flash animation state
        this.colorFlashIntensity = 0;
        this.flashDecay = 0.95;
        this.scrollDensity = 15; // Base density
        
        // Get faceted canvases
        const facetedCanvases = [
            'background-canvas', 'shadow-canvas', 'content-canvas',
            'highlight-canvas', 'accent-canvas'
        ];
        
        facetedCanvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            
            // Mouse movement -> 4D rotation parameters
            canvas.addEventListener('mousemove', (e) => {
                if (!this.isActive) return;
                
                const rect = canvas.getBoundingClientRect();
                const mouseX = (e.clientX - rect.left) / rect.width;
                const mouseY = (e.clientY - rect.top) / rect.height;
                
                this.update4DRotationParameters(mouseX, mouseY);
            });
            
            // Touch movement -> 4D rotation parameters
            canvas.addEventListener('touchmove', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                
                if (e.touches.length > 0) {
                    const touch = e.touches[0];
                    const rect = canvas.getBoundingClientRect();
                    const touchX = (touch.clientX - rect.left) / rect.width;
                    const touchY = (touch.clientY - rect.top) / rect.height;
                    
                    this.update4DRotationParameters(touchX, touchY);
                }
            }, { passive: false });
            
            // Click -> color flash effect
            canvas.addEventListener('click', (e) => {
                if (!this.isActive) return;
                
                this.triggerColorFlash();
            });
            
            // Touch tap -> color flash effect
            canvas.addEventListener('touchend', (e) => {
                if (!this.isActive) return;
                
                this.triggerColorFlash();
            });
            
            // Wheel -> invisible scroll density effect
            canvas.addEventListener('wheel', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                
                this.updateScrollDensity(e.deltaY);
            }, { passive: false });
        });
        
        // Start color flash animation loop
        this.startColorFlashLoop();
    }
    
    update4DRotationParameters(x, y) {
        // Map mouse/touch position to 4D rotation ranges (-6.28 to 6.28)
        const rotationRange = 6.28 * 2; // Full range is 12.56
        
        // X position controls XW and YW planes
        const rot4dXW = (x - 0.5) * rotationRange; // -6.28 to +6.28
        const rot4dYW = (x - 0.5) * rotationRange * 0.7; // Slightly different scaling
        
        // Y position controls ZW plane  
        const rot4dZW = (y - 0.5) * rotationRange;
        
        // SUBTLE MOUSE HUE CHANGES (fluid, not extreme)
        if (!this.mouseHue) this.mouseHue = this.scrollHue || 200; // Use current scroll hue or default
        
        // Gentle hue shifts based on mouse position (subtle)
        const hueOffset = (x - 0.5) * 30; // ±15 degree gentle shift
        const mouseHue = (this.mouseHue + hueOffset) % 360;
        
        // Update parameters through the global parameter system
        if (window.updateParameter) {
            window.updateParameter('rot4dXW', rot4dXW.toFixed(2));
            window.updateParameter('rot4dYW', rot4dYW.toFixed(2));
            window.updateParameter('rot4dZW', rot4dZW.toFixed(2));
            window.updateParameter('hue', Math.round(mouseHue)); // Gentle hue changes
        }
        
        console.log(`🔷 Smooth 4D + Hue: XW=${rot4dXW.toFixed(2)}, ZW=${rot4dZW.toFixed(2)}, Hue=${Math.round(mouseHue)}`);
    }
    
    triggerColorFlash() {
        // DRAMATIC BUT FLUID CLICK EFFECT
        this.colorFlashIntensity = 1.0; // Start at full flash
        
        // Additional dramatic parameters that decay back
        this.clickChaosBoost = 0.8; // Temporary chaos boost
        this.clickSpeedBoost = 1.5; // Temporary speed boost
        
        console.log('💥 Faceted dramatic click: color flash + chaos + speed boost');
    }
    
    updateScrollDensity(deltaY) {
        // ENHANCED SCROLL: More reactive with hue changes + density
        const scrollSpeed = 0.8; // More reactive
        const scrollDirection = deltaY > 0 ? 1 : -1;
        
        // Update density
        this.scrollDensity += scrollDirection * scrollSpeed;
        this.scrollDensity = Math.max(5, Math.min(100, this.scrollDensity)); // Clamp 5-100
        
        // FLUID HUE CYCLING with scroll
        if (!this.scrollHue) this.scrollHue = 200; // Base blue hue for faceted
        const hueSpeed = 3; // Smooth hue changes
        this.scrollHue += scrollDirection * hueSpeed;
        this.scrollHue = ((this.scrollHue % 360) + 360) % 360; // Keep 0-360 range
        
        // Update parameters smoothly
        if (window.updateParameter) {
            window.updateParameter('gridDensity', Math.round(this.scrollDensity));
            window.updateParameter('hue', Math.round(this.scrollHue));
        }
        
        console.log(`🌀 Smooth scroll: Density=${Math.round(this.scrollDensity)}, Hue=${Math.round(this.scrollHue)}`);
    }
    
    startColorFlashLoop() {
        const flashAnimation = () => {
            // ENHANCED DRAMATIC FLASH EFFECT (multiple parameters)
            let hasActiveEffects = false;
            
            if (this.colorFlashIntensity > 0.01) {
                hasActiveEffects = true;
                
                // Create flash effect: dip saturation/intensity then boost
                const flashPhase = this.colorFlashIntensity;
                
                // Phase 1 (1.0 -> 0.5): Dip colors
                // Phase 2 (0.5 -> 0.0): Boost colors back up
                let saturationMultiplier, intensityMultiplier;
                
                if (flashPhase > 0.5) {
                    // Dip phase - reduce saturation and intensity
                    const dipAmount = (flashPhase - 0.5) * 2; // 0-1 range
                    saturationMultiplier = 1.0 - (dipAmount * 0.7); // Dip to 30%
                    intensityMultiplier = 1.0 - (dipAmount * 0.5); // Dip to 50%
                } else {
                    // Boost phase - increase beyond normal
                    const boostAmount = (0.5 - flashPhase) * 2; // 0-1 range
                    saturationMultiplier = 1.0 + (boostAmount * 0.5); // Boost to 150%
                    intensityMultiplier = 1.0 + (boostAmount * 0.3); // Boost to 130%
                }
                
                // Apply flash modulation to base colors
                const baseSaturation = 0.8;
                const baseIntensity = 0.5;
                
                const flashSaturation = Math.max(0.1, Math.min(1.0, baseSaturation * saturationMultiplier));
                const flashIntensity = Math.max(0.1, Math.min(1.0, baseIntensity * intensityMultiplier));
                
                // Update color parameters
                if (window.updateParameter) {
                    window.updateParameter('saturation', flashSaturation.toFixed(2));
                    window.updateParameter('intensity', flashIntensity.toFixed(2));
                }
                
                // Smooth decay
                this.colorFlashIntensity *= 0.94; // Slightly slower decay for smoother effect
            }
            
            // DRAMATIC CHAOS BOOST EFFECT (fluid decay)
            if (this.clickChaosBoost > 0.01) {
                hasActiveEffects = true;
                
                const baseChaos = 0.2; // Default chaos
                const currentChaos = baseChaos + this.clickChaosBoost;
                
                if (window.updateParameter) {
                    window.updateParameter('chaos', currentChaos.toFixed(2));
                }
                
                // Smooth decay
                this.clickChaosBoost *= 0.92;
            }
            
            // DRAMATIC SPEED BOOST EFFECT (fluid decay)
            if (this.clickSpeedBoost > 0.01) {
                hasActiveEffects = true;
                
                const baseSpeed = 1.0; // Default speed
                const currentSpeed = baseSpeed + this.clickSpeedBoost;
                
                if (window.updateParameter) {
                    window.updateParameter('speed', currentSpeed.toFixed(2));
                }
                
                // Smooth decay
                this.clickSpeedBoost *= 0.91;
            }
            
            if (this.isActive) {
                requestAnimationFrame(flashAnimation);
            }
        };
        
        flashAnimation();
    }
    
    /**
     * Load custom variations from storage
     */
    loadCustomVariations() {
        this.variationManager.loadCustomVariations();
    }
    
    /**
     * Populate the variation grid UI
     */
    populateVariationGrid() {
        this.variationManager.populateGrid();
    }
    
    /**
     * Start the main render loop
     */
    startRenderLoop() {
        if (window.mobileDebug) {
            window.mobileDebug.log(`🎬 VIB34D Faceted Engine: Starting render loop with ${this.visualizers?.length} visualizers`);
        }
        
        const render = () => {
            this.time += 0.016; // ~60fps
            
            // MVEP-STYLE AUDIO PROCESSING: Each system processes audio in its own render loop
            // This eliminates the "holographic override" problem and ensures proper audio reactivity
            // Audio reactivity now handled directly in visualizer render loops
            
            this.updateVisualizers();
            this.animationId = requestAnimationFrame(render);
        };
        render();
        
        // Log successful start
        if (window.mobileDebug) {
            window.mobileDebug.log(`✅ VIB34D Faceted Engine: Render loop started, animationId=${!!this.animationId}`);
        }
    }
    
    /**
     * Update all visualizers with current parameters
     */
    updateVisualizers() {
        const params = this.parameterManager.getAllParameters();
        
        // Add interaction state
        params.mouseX = this.mouseX;
        params.mouseY = this.mouseY;
        params.mouseIntensity = this.mouseIntensity;
        params.clickIntensity = this.clickIntensity;
        params.time = this.time;
        
        this.visualizers.forEach(visualizer => {
            visualizer.updateParameters(params);
            visualizer.render();
        });
        
        // Decay interaction intensities
        this.mouseIntensity *= 0.95;
        this.clickIntensity *= 0.92;
    }
    
    /**
     * Update parameters from UI controls
     */
    updateFromControls() {
        this.parameterManager.updateFromControls();
        this.updateDisplayValues();
    }
    
    /**
     * Update display values in UI
     */
    updateDisplayValues() {
        this.parameterManager.updateDisplayValues();
    }
    
    /**
     * Navigate to specific variation
     */
    setVariation(index) {
        if (index >= 0 && index < this.totalVariations) {
            this.currentVariation = index;
            this.variationManager.applyVariation(index);
            this.updateDisplayValues();
            this.updateVisualizers();
            
            // Update UI
            const slider = document.getElementById('variationSlider');
            if (slider) {
                slider.value = index;
            }
            
            this.statusManager.setStatus(`Variation ${index + 1} loaded`, 'info');
        }
    }
    
    /**
     * Navigation methods
     */
    nextVariation() {
        this.setVariation((this.currentVariation + 1) % this.totalVariations);
    }
    
    previousVariation() {
        this.setVariation((this.currentVariation - 1 + this.totalVariations) % this.totalVariations);
    }
    
    randomVariation() {
        const newIndex = Math.floor(Math.random() * this.totalVariations);
        this.setVariation(newIndex);
    }
    
    /**
     * Randomize all parameters
     */
    randomizeAll() {
        this.parameterManager.randomizeAll();
        this.updateDisplayValues();
        this.updateVisualizers();
        this.statusManager.setStatus('All parameters randomized', 'info');
    }
    
    /**
     * Reset to default parameters
     */
    resetToDefaults() {
        this.parameterManager.resetToDefaults();
        this.updateDisplayValues();
        this.updateVisualizers();
        this.statusManager.setStatus('Reset to default parameters', 'info');
    }
    
    /**
     * Save current state as custom variation
     */
    saveAsCustomVariation() {
        const customIndex = this.variationManager.saveCurrentAsCustom();
        if (customIndex !== -1) {
            this.statusManager.setStatus(`Saved as custom variation ${customIndex + 1}`, 'success');
            this.populateVariationGrid();
        } else {
            this.statusManager.setStatus('All custom slots are full', 'warning');
        }
    }
    
    /**
     * Open gallery view
     */
    openGalleryView() {
        this.gallerySystem.openGallery();
    }
    
    /**
     * Export methods
     */
    exportJSON() {
        this.exportManager.exportJSON();
    }
    
    exportCSS() {
        this.exportManager.exportCSS();
    }
    
    exportHTML() {
        this.exportManager.exportHTML();
    }
    
    exportPNG() {
        this.exportManager.exportPNG();
    }
    
    /**
     * Import methods
     */
    importJSON() {
        this.exportManager.importJSON();
    }
    
    importFolder() {
        this.exportManager.importFolder();
    }
    
    /**
     * Set active state - required by CanvasManager
     */
    setActive(active) {
        console.log(`🔷 Faceted Engine setActive: ${active}`);
        this.isActive = active; // Set active state for interactions
        
        if (active && !this.animationId) {
            console.log('🎬 Faceted Engine: Starting animation loop');
            this.startRenderLoop();
        } else if (!active && this.animationId) {
            console.log('⏹️ Faceted Engine: Stopping animation loop');
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    /**
     * Update mouse interaction state
     */
    updateInteraction(x, y, intensity = 0.5) {
        this.mouseX = x;
        this.mouseY = y;
        this.mouseIntensity = intensity;
        
        // Apply to all faceted visualizers
        this.visualizers.forEach(visualizer => {
            if (visualizer.updateInteraction) {
                visualizer.updateInteraction(x, y, intensity);
            }
        });
    }
    
    /**
     * Trigger click interaction
     */
    triggerClick(intensity = 1.0) {
        this.clickIntensity = intensity;
    }
    
    /**
     * Update audio reactivity (for universal reactivity system)
     */
    // Audio reactivity now handled directly in visualizer render loops - no engine coordination needed
    
    /**
     * Apply audio reactivity grid settings (similar to holographic system)
     */
    applyAudioReactivityGrid(audioData) {
        const settings = this.audioReactivitySettings || window.audioReactivitySettings;
        if (!settings) return;
        
        // Get sensitivity multiplier
        const sensitivityMultiplier = settings.sensitivity[settings.activeSensitivity];
        
        // Apply audio changes to different visual modes based on grid selection
        settings.activeVisualModes.forEach(modeKey => {
            const [sensitivity, visualMode] = modeKey.split('-');
            
            if (visualMode === 'color') {
                // COLOR MODE: Affect hue, saturation, intensity
                const audioIntensity = (audioData.energy * sensitivityMultiplier);
                const bassIntensity = (audioData.bass * sensitivityMultiplier);
                const rhythmIntensity = (audioData.rhythm * sensitivityMultiplier);
                
                // Modulate hue based on audio frequency spread
                if (audioData.mid > 0.2) {
                    const currentHue = this.parameterManager.getParameter('hue') || 180;
                    const hueShift = audioData.mid * sensitivityMultiplier * 30;
                    this.parameterManager.setParameter('hue', (currentHue + hueShift) % 360);
                }
                
                // Boost intensity on energy spikes
                if (audioIntensity > 0.3) {
                    this.parameterManager.setParameter('intensity', Math.min(1.0, 0.5 + audioIntensity * 0.8));
                }
                
                // Boost saturation on bass hits
                if (bassIntensity > 0.4) {
                    this.parameterManager.setParameter('saturation', Math.min(1.0, 0.7 + bassIntensity * 0.3));
                }
                
            } else if (visualMode === 'geometry') {
                // GEOMETRY MODE: Affect morphFactor, gridDensity, chaos
                const bassIntensity = (audioData.bass * sensitivityMultiplier);
                const highIntensity = (audioData.high * sensitivityMultiplier);
                
                // Bass affects grid density
                if (bassIntensity > 0.3) {
                    const currentDensity = this.parameterManager.getParameter('gridDensity') || 15;
                    this.parameterManager.setParameter('gridDensity', Math.min(100, currentDensity + bassIntensity * 25));
                }
                
                // Mid frequencies affect morph factor
                if (audioData.mid > 0.2) {
                    const morphBoost = audioData.mid * sensitivityMultiplier * 0.5;
                    this.parameterManager.setParameter('morphFactor', Math.min(2.0, morphBoost));
                }
                
                // High frequencies add chaos
                if (highIntensity > 0.4) {
                    this.parameterManager.setParameter('chaos', Math.min(1.0, highIntensity * 0.6));
                }
                
            } else if (visualMode === 'movement') {
                // MOVEMENT MODE: Affect speed, 4D rotations
                const energyIntensity = (audioData.energy * sensitivityMultiplier);
                
                // Energy affects animation speed
                if (energyIntensity > 0.2) {
                    this.parameterManager.setParameter('speed', Math.min(3.0, 0.5 + energyIntensity * 1.5));
                }
                
                // Audio frequencies affect 4D rotations
                if (audioData.bass > 0.3) {
                    const currentXW = this.parameterManager.getParameter('rot4dXW') || 0;
                    this.parameterManager.setParameter('rot4dXW', currentXW + audioData.bass * sensitivityMultiplier * 0.1);
                }
                
                if (audioData.mid > 0.3) {
                    const currentYW = this.parameterManager.getParameter('rot4dYW') || 0;
                    this.parameterManager.setParameter('rot4dYW', currentYW + audioData.mid * sensitivityMultiplier * 0.08);
                }
                
                if (audioData.high > 0.3) {
                    const currentZW = this.parameterManager.getParameter('rot4dZW') || 0;
                    this.parameterManager.setParameter('rot4dZW', currentZW + audioData.high * sensitivityMultiplier * 0.06);
                }
            }
        });
    }
    
    /**
     * Update click effects (for universal reactivity system)
     */
    updateClick(intensity) {
        // Trigger click intensity on all visualizers
        this.clickIntensity = Math.min(1.0, this.clickIntensity + intensity);
        
        this.visualizers.forEach(visualizer => {
            if (visualizer.triggerClick) {
                visualizer.triggerClick(intensity);
            }
        });
    }
    
    /**
     * Update scroll effects (for universal reactivity system)
     */
    updateScroll(velocity) {
        this.visualizers.forEach(visualizer => {
            if (visualizer.updateScroll) {
                visualizer.updateScroll(velocity);
            }
        });
        
        // Apply scroll to parameter modulation
        const scrollIntensity = Math.abs(velocity);
        if (scrollIntensity > 0.1) {
            // Temporarily adjust morph factor based on scroll
            const currentMorph = this.parameterManager.getParameter('morphFactor') || 1.0;
            this.parameterManager.setParameter('morphFactor', Math.max(0.1, currentMorph + velocity * 0.5));
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        // Disconnect from universal reactivity
        if (window.universalReactivity) {
            window.universalReactivity.disconnectSystem('faceted');
        }
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        this.visualizers.forEach(visualizer => {
            if (visualizer.destroy) {
                visualizer.destroy();
            }
        });
        
        console.log('🔄 VIB34D Engine destroyed');
    }
}