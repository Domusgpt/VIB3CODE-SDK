/**
 * VIB3+ Engine - Unified Visualization System
 * Coordinates Quantum, Faceted, and Holographic systems
 * Supports 24 geometries per system with full 6D rotation
 */

import { ParameterManager } from './Parameters.js';
import { CanvasManager } from './CanvasManager.js';
import { QuantumEngine } from '../quantum/QuantumEngine.js';
import { FacetedSystem } from '../faceted/FacetedSystem.js';
import { RealHolographicSystem } from '../holograms/RealHolographicSystem.js';

export class VIB3Engine {
    constructor() {
        this.activeSystem = null; // Only one system active at a time
        this.currentSystemName = 'quantum';
        this.parameters = new ParameterManager();
        this.initialized = false;
        this.canvasManager = null;
    }

    /**
     * Initialize the VIB3+ engine
     */
    async initialize(containerId = 'vib3-container') {
        console.log('🌟 Initializing VIB3+ Engine');

        // Create CanvasManager
        try {
            this.canvasManager = new CanvasManager(containerId);
        } catch (error) {
            console.error('❌ CanvasManager initialization failed:', error);
            return false;
        }

        // Initialize starting system
        await this.switchSystem(this.currentSystemName);

        this.initialized = true;
        console.log('✅ VIB3+ Engine initialized');
        return true;
    }

    /**
     * Create and initialize a specific system
     * CRITICAL: Engines find canvases by ID in DOM, not passed as parameters!
     */
    async createSystem(systemName) {
        console.log(`🔧 Creating ${systemName} system...`);

        // Create canvases with correct IDs in DOM
        // CanvasManager returns array of canvas IDs created
        const canvasIds = this.canvasManager.createSystemCanvases(systemName);

        // Create system instance - engines find canvases by ID in DOM
        let system = null;
        try {
            switch (systemName) {
                case 'quantum':
                    // QuantumEngine finds canvases by ID and initializes in constructor
                    system = new QuantumEngine();
                    break;

                case 'faceted':
                    // FacetedSystem needs explicit initialization after construction
                    system = new FacetedSystem();
                    const facetedSuccess = system.initialize();
                    if (!facetedSuccess) {
                        throw new Error('Faceted system initialization failed');
                    }
                    break;

                case 'holographic':
                    // RealHolographicSystem finds canvases and initializes in constructor
                    system = new RealHolographicSystem();
                    break;

                default:
                    throw new Error(`Unknown system: ${systemName}`);
            }

            // Register WebGL contexts with CanvasManager for cleanup
            canvasIds.forEach(canvasId => {
                const canvas = document.getElementById(canvasId);
                if (canvas) {
                    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                    if (gl) {
                        this.canvasManager.registerContext(canvasId, gl);
                    }
                }
            });

            // Apply current parameters
            system.updateParameters(this.parameters.getAllParameters());
            system.setActive(true);

            console.log(`✅ ${systemName} system created and activated`);
            return system;

        } catch (error) {
            console.error(`❌ ${systemName} system creation failed:`, error);
            throw error;
        }
    }

    /**
     * Switch between visualization systems
     * DESTROYS old system and CREATES new system (proper WebGL cleanup)
     */
    async switchSystem(systemName) {
        if (!['quantum', 'faceted', 'holographic'].includes(systemName)) {
            console.error('❌ Unknown system:', systemName);
            return false;
        }

        console.log(`🔄 Switching from ${this.currentSystemName} to ${systemName}`);

        // Destroy active system if exists
        if (this.activeSystem) {
            console.log(`  🗑️ Destroying ${this.currentSystemName} system...`);

            // Deactivate system
            if (this.activeSystem.setActive) {
                this.activeSystem.setActive(false);
            }

            // Destroy system
            if (this.activeSystem.destroy) {
                this.activeSystem.destroy();
            }

            // CanvasManager will destroy canvases when creating new ones
            this.activeSystem = null;
        }

        // Create and initialize new system
        try {
            this.activeSystem = await this.createSystem(systemName);
            this.currentSystemName = systemName;
            console.log(`✅ Switched to ${systemName} system`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to switch to ${systemName}:`, error);
            return false;
        }
    }

    /**
     * Update parameters for active system
     */
    updateCurrentSystemParameters() {
        const params = this.parameters.getAllParameters();

        if (this.activeSystem && this.activeSystem.updateParameters) {
            this.activeSystem.updateParameters(params);
        }
    }

    /**
     * Update a single parameter
     */
    setParameter(name, value) {
        this.parameters.setParameter(name, value);
        this.updateCurrentSystemParameters();
    }

    /**
     * Update multiple parameters
     */
    setParameters(params) {
        this.parameters.setParameters(params);
        this.updateCurrentSystemParameters();
    }

    /**
     * Get current parameter value
     */
    getParameter(name) {
        return this.parameters.getParameter(name);
    }

    /**
     * Get all parameters
     */
    getAllParameters() {
        return this.parameters.getAllParameters();
    }

    /**
     * Randomize all parameters
     */
    randomizeAll() {
        this.parameters.randomizeAll();
        this.updateCurrentSystemParameters();
    }

    /**
     * Reset to defaults
     */
    resetAll() {
        this.parameters.resetToDefaults();
        this.updateCurrentSystemParameters();
    }

    /**
     * Get current system name
     */
    getCurrentSystem() {
        return this.currentSystemName;
    }

    /**
     * Get active system instance
     */
    getActiveSystemInstance() {
        return this.activeSystem;
    }

    /**
     * Get geometry names for current system
     */
    getGeometryNames() {
        // All systems support 24 geometries
        return [
            // Base geometries (0-7)
            'Tetrahedron',
            'Hypercube',
            'Sphere',
            'Torus',
            'Klein Bottle',
            'Fractal',
            'Wave',
            'Crystal',
            // Hypersphere Core (8-15)
            '🌀 Hypersphere Core (Tetrahedron)',
            '🌀 Hypersphere Core (Hypercube)',
            '🌀 Hypersphere Core (Sphere)',
            '🌀 Hypersphere Core (Torus)',
            '🌀 Hypersphere Core (Klein)',
            '🌀 Hypersphere Core (Fractal)',
            '🌀 Hypersphere Core (Wave)',
            '🌀 Hypersphere Core (Crystal)',
            // Hypertetrahedron Core (16-23)
            '🔺 Hypertetrahedron Core (Tetrahedron)',
            '🔺 Hypertetrahedron Core (Hypercube)',
            '🔺 Hypertetrahedron Core (Sphere)',
            '🔺 Hypertetrahedron Core (Torus)',
            '🔺 Hypertetrahedron Core (Klein)',
            '🔺 Hypertetrahedron Core (Fractal)',
            '🔺 Hypertetrahedron Core (Wave)',
            '🔺 Hypertetrahedron Core (Crystal)'
        ];
    }

    /**
     * Export current state
     */
    exportState() {
        return {
            system: this.currentSystemName,
            parameters: this.parameters.getAllParameters(),
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
    }

    /**
     * Import state
     */
    async importState(state) {
        if (state.system) {
            await this.switchSystem(state.system);
        }
        if (state.parameters) {
            this.parameters.setParameters(state.parameters);
            this.updateCurrentSystemParameters();
        }
    }

    /**
     * Destroy engine and clean up
     */
    destroy() {
        // Destroy active system
        if (this.activeSystem && this.activeSystem.destroy) {
            this.activeSystem.destroy();
        }
        this.activeSystem = null;

        // Destroy canvas manager
        if (this.canvasManager) {
            this.canvasManager.destroy();
        }
        this.canvasManager = null;

        this.initialized = false;
        console.log('🗑️ VIB3+ Engine destroyed');
    }
}
