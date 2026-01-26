/**
 * VIB34D Quantum Engine
 * Manages the enhanced quantum system with complex 3D lattice functions
 */

import { QuantumHolographicVisualizer } from './QuantumVisualizer.js';
import { ParameterManager } from '../core/Parameters.js';
import { GeometryLibrary } from '../geometry/GeometryLibrary.js';

export class QuantumEngine {
    constructor() {
        console.log('🔮 Initializing VIB34D Quantum Engine...');
        
        this.visualizers = [];
        this.parameters = new ParameterManager();
        this.isActive = false;
        
        // Conditional reactivity: Use built-in only if ReactivityManager not active
        this.useBuiltInReactivity = !window.reactivityManager;
        
        // Gesture velocity reactivity system for Quantum
        this.lastMousePosition = { x: 0.5, y: 0.5 };
        this.mouseVelocity = { x: 0, y: 0 };
        this.velocityHistory = [];
        this.maxVelocityHistory = 10;
        
        // Base parameter values for gesture modulation
        this.baseHue = 280; // Purple-blue for quantum
        this.baseMorphFactor = 1.0;
        
        // Initialize with quantum-enhanced defaults
        this.parameters.setParameter('hue', this.baseHue);
        this.parameters.setParameter('intensity', 0.7); // Higher intensity
        this.parameters.setParameter('saturation', 0.9); // More vivid
        this.parameters.setParameter('gridDensity', 20); // Denser patterns
        this.parameters.setParameter('morphFactor', this.baseMorphFactor);
        
        this.init();
    }
    
    /**
     * Initialize the quantum system
     */
    init() {
        this.createVisualizers();
        this.setupAudioReactivity();
        this.setupGestureVelocityReactivity(); // Additional gesture system
        this.startRenderLoop();
        console.log('✨ Quantum Engine initialized with audio + gesture velocity reactivity');
    }
    
    /**
     * Create quantum visualizers for all 5 layers
     */
    createVisualizers() {
        const layers = [
            { id: 'quantum-background-canvas', role: 'background', reactivity: 0.4 },
            { id: 'quantum-shadow-canvas', role: 'shadow', reactivity: 0.6 },
            { id: 'quantum-content-canvas', role: 'content', reactivity: 1.0 },
            { id: 'quantum-highlight-canvas', role: 'highlight', reactivity: 1.3 },
            { id: 'quantum-accent-canvas', role: 'accent', reactivity: 1.6 }
        ];
        
        layers.forEach(layer => {
            try {
                // Canvas elements should already exist in HTML
                const canvas = document.getElementById(layer.id);
                if (!canvas) {
                    console.warn(`⚠️ Canvas ${layer.id} not found in DOM - skipping`);
                    return;
                }
                
                const visualizer = new QuantumHolographicVisualizer(layer.id, layer.role, layer.reactivity, 0);
                if (visualizer.gl) {
                    this.visualizers.push(visualizer);
                    console.log(`🌌 Created quantum layer: ${layer.role}`);
                } else {
                    console.warn(`⚠️ No WebGL context for quantum layer ${layer.id}`);
                }
            } catch (error) {
                console.warn(`Failed to create quantum layer ${layer.id}:`, error);
            }
        });
        
        console.log(`✅ Created ${this.visualizers.length} quantum visualizers with enhanced effects`);
    }
    
    /**
     * Set system active/inactive
     */
    setActive(active) {
        this.isActive = active;
        
        if (active) {
            // Show quantum layers
            const quantumLayers = document.getElementById('quantumLayers');
            if (quantumLayers) {
                quantumLayers.style.display = 'block';
            }
            
            // Enable audio if global audio is enabled
            if (window.audioEnabled && !this.audioEnabled) {
                this.enableAudio();
            }
            
            console.log('🔮 Quantum System ACTIVATED - Audio frequency reactivity mode');
        } else {
            // Hide quantum layers
            const quantumLayers = document.getElementById('quantumLayers');
            if (quantumLayers) {
                quantumLayers.style.display = 'none';
            }
            console.log('🔮 Quantum System DEACTIVATED');
        }
    }
    
    // Method to be called when global audio is toggled
    toggleAudio(enabled) {
        if (enabled && this.isActive && !this.audioEnabled) {
            this.enableAudio();
        } else if (!enabled && this.audioEnabled) {
            // Disable audio
            this.audioEnabled = false;
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            console.log('🔇 Quantum audio reactivity disabled');
        }
    }
    
    /**
     * Setup audio frequency reactivity for Quantum system
     */
    setupAudioReactivity() {
        console.log('🌌 Setting up Quantum audio frequency reactivity');
        // Audio setup will be triggered when audio is enabled
    }
    
    /**
     * Setup enhanced multi-parameter reactivity for Quantum system
     */
    setupGestureVelocityReactivity() {
        if (!this.useBuiltInReactivity) {
            console.log('🌌 Quantum built-in reactivity DISABLED - ReactivityManager active');
            return;
        }
        
        console.log('🌌 Setting up Quantum: velocity + click + scroll + multi-parameter reactivity');
        
        // Enhanced state for smooth effects
        this.clickFlashIntensity = 0;
        this.scrollMorph = 1.0; // Base morph factor
        this.velocitySmoothing = 0.8; // Smoother velocity transitions
        
        const quantumCanvases = [
            'quantum-background-canvas', 'quantum-shadow-canvas', 'quantum-content-canvas',
            'quantum-highlight-canvas', 'quantum-accent-canvas'
        ];
        
        quantumCanvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            
            // Mouse movement -> smooth velocity + multiple parameters
            canvas.addEventListener('mousemove', (e) => {
                if (!this.isActive) return;
                
                const rect = canvas.getBoundingClientRect();
                const mouseX = (e.clientX - rect.left) / rect.width;
                const mouseY = (e.clientY - rect.top) / rect.height;
                
                this.updateEnhancedQuantumParameters(mouseX, mouseY);
            });
            
            // Touch movement -> same enhanced parameters  
            canvas.addEventListener('touchmove', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                
                if (e.touches.length > 0) {
                    const touch = e.touches[0];
                    const rect = canvas.getBoundingClientRect();
                    const touchX = (touch.clientX - rect.left) / rect.width;
                    const touchY = (touch.clientY - rect.top) / rect.height;
                    
                    this.updateEnhancedQuantumParameters(touchX, touchY);
                }
            }, { passive: false });
            
            // Click -> quantum flash effect
            canvas.addEventListener('click', (e) => {
                if (!this.isActive) return;
                this.triggerQuantumClick();
            });
            
            // Touch end -> quantum flash effect
            canvas.addEventListener('touchend', (e) => {
                if (!this.isActive) return;
                this.triggerQuantumClick();
            });
            
            // Wheel -> quantum morphing scroll effect
            canvas.addEventListener('wheel', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                this.updateQuantumScroll(e.deltaY);
            }, { passive: false });
        });
        
        // Start smooth animation loops
        this.startQuantumEffectLoops();
    }
    
    updateEnhancedQuantumParameters(x, y) {
        // Calculate velocity from position change (smoother)
        const deltaX = x - this.lastMousePosition.x;
        const deltaY = y - this.lastMousePosition.y;
        const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Smooth velocity history (reduced from 10 to 5 for responsiveness)
        this.velocityHistory.push(velocity);
        if (this.velocityHistory.length > 5) {
            this.velocityHistory.shift();
        }
        
        // Calculate smoother average velocity
        const avgVelocity = this.velocityHistory.reduce((sum, v) => sum + v, 0) / this.velocityHistory.length;
        
        // EXPERIMENTAL QUANTUM MOUSE MAPPING: X-axis rotation + hemispheric colors
        
        // X-AXIS: Direct rotation mapping (smooth 4D rotation)
        // Map mouse X (0-1) to rotation angle (-π to π for full rotation range)
        const rotationAngle = (x - 0.5) * Math.PI * 2; // -2π to 2π range
        const rot4dXW = rotationAngle * 0.5; // Smooth XW rotation
        const rot4dYW = rotationAngle * 0.3; // Complementary YW rotation
        const rot4dZW = rotationAngle * 0.2; // Subtle ZW rotation
        
        // Y-AXIS: Maintains current behavior (density/complexity)
        const gridDensity = 10 + (y * 90); // Y position: 10-100 range (unchanged)
        
        // HEMISPHERIC COLOR MAPPING: Distance from center affects color zones
        const centerX = 0.5;
        const centerY = 0.5;
        const distanceFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        const normalizedDistance = Math.min(1.0, distanceFromCenter * Math.sqrt(2)); // 0-1 range
        
        // Color hemisphere mapping
        const leftHemisphere = x < 0.5;
        const topHemisphere = y < 0.5;
        
        let baseHue;
        if (leftHemisphere && topHemisphere) {
            baseHue = 240; // Blue quadrant
        } else if (!leftHemisphere && topHemisphere) {
            baseHue = 300; // Purple quadrant  
        } else if (leftHemisphere && !topHemisphere) {
            baseHue = 180; // Cyan quadrant
        } else {
            baseHue = 320; // Magenta quadrant
        }
        
        // Distance affects hue variation (center = pure color, edges = shifted)
        const hueVariation = normalizedDistance * 60; // 0-60 degree shift
        const hue = (baseHue + hueVariation) % 360;
        
        // Other parameters influenced by movement
        const chaos = Math.min(1.0, avgVelocity * 30); // Velocity affects chaos
        const speed = 0.5 + Math.min(2.5, avgVelocity * 15); // Movement speed
        const intensity = 0.3 + (normalizedDistance * 0.7); // Distance affects brightness
        
        // Update all parameters for rich visual feedback
        if (window.updateParameter) {
            // Rotation parameters (new experimental mapping)
            window.updateParameter('rot4dXW', rot4dXW.toFixed(3));
            window.updateParameter('rot4dYW', rot4dYW.toFixed(3)); 
            window.updateParameter('rot4dZW', rot4dZW.toFixed(3));
            
            // Traditional parameters
            window.updateParameter('chaos', chaos.toFixed(2));
            window.updateParameter('speed', speed.toFixed(2));
            window.updateParameter('gridDensity', Math.round(gridDensity));
            window.updateParameter('intensity', intensity.toFixed(2));
            window.updateParameter('hue', Math.round(hue));
        }
        
        // Update last position
        this.lastMousePosition.x = x;
        this.lastMousePosition.y = y;
        
        console.log(`🌌 Quantum EXPERIMENTAL: X=${x.toFixed(2)}→Rot=${rotationAngle.toFixed(2)}, Y=${y.toFixed(2)}→Density=${Math.round(gridDensity)}, Dist=${normalizedDistance.toFixed(2)}→Hue=${Math.round(hue)}, Hemisphere=${leftHemisphere ? 'L' : 'R'}${topHemisphere ? 'T' : 'B'}`);
    }
    
    triggerQuantumClick() {
        // DRAMATIC QUANTUM ENERGY BURST (multi-parameter)
        this.clickFlashIntensity = 1.0;
        
        // Additional dramatic quantum effects that decay back
        this.quantumChaosBlast = 0.7; // Chaos energy burst
        this.quantumSpeedWave = 2.0; // Speed wave effect  
        this.quantumHueShift = 60; // Color explosion shift
        
        console.log('💥 Quantum energy burst: flash + chaos + speed + hue explosion');
    }
    
    updateQuantumScroll(deltaY) {
        // Scroll affects morph factor smoothly
        const scrollSpeed = 0.02;
        const scrollDirection = deltaY > 0 ? 1 : -1;
        
        this.scrollMorph += scrollDirection * scrollSpeed;
        this.scrollMorph = Math.max(0.2, Math.min(2.0, this.scrollMorph)); // Clamp 0.2-2.0
        
        // Update morph factor
        if (window.updateParameter) {
            window.updateParameter('morphFactor', this.scrollMorph.toFixed(2));
        }
        
        console.log(`🌀 Quantum scroll morph: ${this.scrollMorph.toFixed(2)}`);
    }
    
    startQuantumEffectLoops() {
        const quantumEffects = () => {
            let hasActiveEffects = false;
            
            // QUANTUM FLASH EFFECT (saturation + morph)
            if (this.clickFlashIntensity > 0.01) {
                hasActiveEffects = true;
                
                // Flash affects saturation - quantum shimmer effect
                const flashSaturation = 0.9 + (this.clickFlashIntensity * 0.1); // 0.9-1.0 boost
                const flashMorph = this.scrollMorph + (this.clickFlashIntensity * 0.5); // Morph boost
                
                if (window.updateParameter) {
                    window.updateParameter('saturation', flashSaturation.toFixed(2));
                    window.updateParameter('morphFactor', flashMorph.toFixed(2));
                }
                
                // Smooth decay
                this.clickFlashIntensity *= 0.91;
            }
            
            // DRAMATIC CHAOS BLAST EFFECT (fluid decay)
            if (this.quantumChaosBlast > 0.01) {
                hasActiveEffects = true;
                
                const baseChaos = 0.3; // Quantum default chaos
                const currentChaos = baseChaos + this.quantumChaosBlast;
                
                if (window.updateParameter) {
                    window.updateParameter('chaos', Math.min(1.0, currentChaos).toFixed(2));
                }
                
                // Smooth decay
                this.quantumChaosBlast *= 0.88; // Slightly faster than faceted for quantum energy feel
            }
            
            // DRAMATIC SPEED WAVE EFFECT (fluid decay)  
            if (this.quantumSpeedWave > 0.01) {
                hasActiveEffects = true;
                
                const baseSpeed = 1.0; // Quantum default speed
                const currentSpeed = baseSpeed + this.quantumSpeedWave;
                
                if (window.updateParameter) {
                    window.updateParameter('speed', Math.min(3.0, currentSpeed).toFixed(2));
                }
                
                // Smooth wave decay
                this.quantumSpeedWave *= 0.89;
            }
            
            // QUANTUM HUE EXPLOSION EFFECT (fluid decay)
            if (this.quantumHueShift > 1) {
                hasActiveEffects = true;
                
                const baseHue = 280; // Quantum purple-blue
                const currentHue = (baseHue + this.quantumHueShift) % 360;
                
                if (window.updateParameter) {
                    window.updateParameter('hue', Math.round(currentHue));
                }
                
                // Smooth color return
                this.quantumHueShift *= 0.90;
            }
            
            if (this.isActive) {
                requestAnimationFrame(quantumEffects);
            }
        };
        
        quantumEffects();
    }
    
    async enableAudio() {
        if (this.audioEnabled) return;
        
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Create audio context and analyser
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Configure analyser for frequency analysis
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Connect microphone to analyser
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            
            this.audioEnabled = true;
            console.log('🎵 Quantum audio reactivity enabled');
            
        } catch (error) {
            console.error('❌ Failed to enable Quantum audio:', error);
            this.audioEnabled = false;
        }
    }
    
    /**
     * Update parameter across all quantum visualizers with enhanced integration
     */
    updateParameter(param, value) {
        // Update internal parameter manager
        this.parameters.setParameter(param, value);
        
        // CRITICAL: Apply to all quantum visualizers with immediate render
        this.visualizers.forEach(visualizer => {
            if (visualizer.updateParameters) {
                const params = {};
                params[param] = value;
                visualizer.updateParameters(params);
            } else {
                // Fallback: direct parameter update with manual render
                if (visualizer.params) {
                    visualizer.params[param] = value;
                    if (visualizer.render) {
                        visualizer.render();
                    }
                }
            }
        });
        
        console.log(`🔮 Updated quantum ${param}: ${value}`);
    }
    
    /**
     * Update multiple parameters
     */
    updateParameters(params) {
        Object.keys(params).forEach(param => {
            this.updateParameter(param, params[param]);
        });
    }

    /**
     * Set variant (0-29) - maps to geometry (0-7)
     * Each geometry has 4 sub-variants
     */
    setVariant(variant) {
        const geometry = Math.floor(variant / 4);
        this.updateParameter('geometry', geometry);
        console.log(`🔮 Quantum variant ${variant} → geometry ${geometry}`);
    }

    /**
     * Update mouse interaction
     */
    updateInteraction(x, y, intensity) {
        this.visualizers.forEach(visualizer => {
            if (visualizer.updateInteraction) {
                visualizer.updateInteraction(x, y, intensity);
            }
        });
    }
    
    /**
     * Get current parameters for saving/export
     */
    getParameters() {
        return this.parameters.getAllParameters();
    }
    
    /**
     * Set parameters from loaded/imported data
     */
    setParameters(params) {
        Object.keys(params).forEach(param => {
            this.parameters.setParameter(param, params[param]);
        });
        this.updateParameters(params);
    }
    
    /**
     * Start the render loop
     */
    startRenderLoop() {
        if (window.mobileDebug) {
            window.mobileDebug.log(`🎬 Quantum Engine: Starting render loop with ${this.visualizers?.length} visualizers, isActive=${this.isActive}`);
        }
        
        const render = () => {
            if (this.isActive) {
                // MVEP-STYLE AUDIO PROCESSING: Use global audio data instead of internal processing
                // This eliminates conflicts with holographic system and ensures consistent audio reactivity
                // Audio reactivity now handled directly in visualizer render loops
                
                // CRITICAL FIX: Update visualizer parameters before rendering
                const currentParams = this.parameters.getAllParameters();
                
                this.visualizers.forEach(visualizer => {
                    if (visualizer.updateParameters && visualizer.render) {
                        visualizer.updateParameters(currentParams);
                        visualizer.render();
                    }
                });
                
                // Mobile debug: Log render activity periodically
                if (window.mobileDebug && !this._renderActivityLogged) {
                    window.mobileDebug.log(`🎬 Quantum Engine: Actively rendering ${this.visualizers?.length} visualizers`);
                    this._renderActivityLogged = true;
                }
            } else if (window.mobileDebug && !this._inactiveWarningLogged) {
                window.mobileDebug.log(`⚠️ Quantum Engine: Not rendering because isActive=false`);
                this._inactiveWarningLogged = true;
            }
            
            requestAnimationFrame(render);
        };
        
        render();
        console.log('🎬 Quantum render loop started');
        
        if (window.mobileDebug) {
            window.mobileDebug.log(`✅ Quantum Engine: Render loop started, will render when isActive=true`);
        }
    }
    
    /**
     * Update audio reactivity (for universal reactivity system)
     */
    // Audio reactivity now handled directly in visualizer render loops
    
    /**
     * Update click effects (for universal reactivity system)
     */
    updateClick(intensity) {
        this.visualizers.forEach(visualizer => {
            if (visualizer.triggerClick) {
                visualizer.triggerClick(0.5, 0.5, intensity); // Click at center with intensity
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
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        // Disconnect from universal reactivity
        if (window.universalReactivity) {
            window.universalReactivity.disconnectSystem('quantum');
        }
        
        this.visualizers.forEach(visualizer => {
            if (visualizer.destroy) {
                visualizer.destroy();
            }
        });
        this.visualizers = [];
        console.log('🧹 Quantum Engine destroyed');
    }
}