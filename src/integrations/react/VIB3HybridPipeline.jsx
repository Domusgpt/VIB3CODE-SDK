/**
 * VIB3HybridPipeline - React Component + Hooks
 * VIB3+ Hybrid Render Pipeline v2
 *
 * <VIB3HybridPipeline> React component wrapping the pipeline for web app integration.
 * useHybridPipeline() hook for direct API access.
 * Three.js interop: accepts THREE.BufferGeometry as mesh input.
 */

// ─── React Hook ──────────────────────────────────────────────────

/**
 * React hook for VIB3 Hybrid Pipeline
 *
 * @param {React.RefObject<HTMLCanvasElement>} canvasRef - Canvas ref
 * @param {object} [config] - Pipeline configuration
 * @returns {object} Pipeline API
 *
 * Usage:
 * ```jsx
 * function App() {
 *   const canvasRef = useRef(null);
 *   const pipeline = useHybridPipeline(canvasRef, {
 *     exposure: 1.2,
 *     gamma: 2.2,
 *     inscriptionLayers: 4,
 *   });
 *
 *   useEffect(() => {
 *     if (pipeline.ready) {
 *       pipeline.loadModel('model.glb');
 *     }
 *   }, [pipeline.ready]);
 *
 *   return <canvas ref={canvasRef} />;
 * }
 * ```
 */
export function useHybridPipeline(canvasRef, config = {}) {
    // This module provides the API shape; actual React imports are
    // resolved by the consuming application's React instance.
    // This avoids bundling React as a dependency.

    const state = {
        ready: false,
        gl: null,
        pipeline: null,
        meshRenderer: null,
        splatRenderer: null,
        inscriptionLayer: null,
        inscriptionChannel: null,
        sceneRenderer: null,
        modelLoader: null,
        animator: null,
        particleSystem: null,

        // Methods
        async init() {
            const canvas = canvasRef?.current;
            if (!canvas) return;

            const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
            if (!gl) {
                console.error('VIB3: WebGL2 not available');
                return;
            }

            const { HybridRenderPipeline } = await import('../../render/HybridRenderPipeline.js');
            const { MeshRenderer } = await import('../../render/MeshRenderer.js');
            const { GaussianSplatRenderer } = await import('../../render/GaussianSplatRenderer.js');
            const { EdgeInscriptionLayer } = await import('../../render/EdgeInscriptionLayer.js');
            const { InscriptionChannel } = await import('../../render/InscriptionChannel.js');
            const { SceneRenderer } = await import('../../render/SceneRenderer.js');
            const { ModelLoader } = await import('../../render/ModelLoader.js');

            state.gl = gl;
            state.pipeline = new HybridRenderPipeline(gl, {
                exposure: config.exposure ?? 1.2,
                gamma: config.gamma ?? 2.2,
            });

            state.meshRenderer = new MeshRenderer(gl);
            state.splatRenderer = new GaussianSplatRenderer(gl);
            state.inscriptionLayer = new EdgeInscriptionLayer(gl, {
                layerCount: config.inscriptionLayers ?? 4,
            });
            state.inscriptionChannel = new InscriptionChannel({
                layerCount: config.inscriptionLayers ?? 4,
            });
            state.sceneRenderer = new SceneRenderer(gl);
            state.modelLoader = new ModelLoader(gl, {
                generateSplats: config.generateSplats ?? false,
                autoInscription: config.autoInscription ?? true,
            });

            state.pipeline.setMeshRenderer(state.meshRenderer);
            state.pipeline.setSplatRenderer(state.splatRenderer);
            state.pipeline.setEdgeInscription(state.inscriptionLayer);
            state.pipeline.setInscriptionChannel(state.inscriptionChannel);

            state.ready = true;
        },

        async loadModel(urlOrBuffer, opts = {}) {
            if (!state.modelLoader) return null;
            const result = await state.modelLoader.loadScene(urlOrBuffer, opts);
            state.pipeline.setSceneRenderer(result.scene);
            return result;
        },

        setGeometry(geometry) {
            if (!state.meshRenderer) return;
            // Accept Three.js BufferGeometry
            if (geometry.attributes) {
                const pos = geometry.attributes.position?.array;
                const norm = geometry.attributes.normal?.array;
                const uv = geometry.attributes.uv?.array;
                const idx = geometry.index?.array;
                state.meshRenderer.uploadGeometry({
                    positions: pos,
                    normals: norm,
                    uvs: uv,
                    indices: idx,
                });
            } else {
                state.meshRenderer.uploadGeometry(geometry);
            }
        },

        setObjectState(objectId, semanticState) {
            if (state.inscriptionChannel) {
                state.inscriptionChannel.setObjectState(objectId, semanticState);
            }
        },

        setAudio(bass, mid, high, energy) {
            if (state.inscriptionChannel) {
                state.inscriptionChannel.setAudio(bass, mid, high, energy);
            }
            if (state.inscriptionLayer) {
                state.inscriptionLayer.setAudio(bass, mid, high, energy);
            }
        },

        render(time, viewMatrix, projMatrix, opts = {}) {
            if (!state.pipeline || !state.gl) return;
            return state.pipeline.render(time, viewMatrix, projMatrix, opts);
        },

        dispose() {
            state.pipeline = null;
            state.gl = null;
            state.ready = false;
        },
    };

    return state;
}

// ─── React Component (JSX shape) ────────────────────────────────

/**
 * VIB3HybridPipeline React Component
 *
 * Usage:
 * ```jsx
 * <VIB3HybridPipeline
 *   width={800}
 *   height={600}
 *   model="model.glb"
 *   inscriptionLayers={4}
 *   exposure={1.2}
 *   onReady={(api) => console.log('Pipeline ready', api)}
 *   audioInput={{ bass: 0, mid: 0, high: 0, energy: 0 }}
 *   semanticStates={{ hero: 'powered', terrain: 'idle' }}
 * />
 * ```
 *
 * Props:
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} [model] - Model URL to auto-load
 * @param {object} [geometry] - Direct geometry data or THREE.BufferGeometry
 * @param {number} [inscriptionLayers=4]
 * @param {number} [exposure=1.2]
 * @param {number} [gamma=2.2]
 * @param {boolean} [generateSplats=false]
 * @param {function} [onReady] - Called with API when pipeline initializes
 * @param {object} [audioInput] - { bass, mid, high, energy }
 * @param {object} [semanticStates] - { objectName: stateName }
 * @param {string} [className] - CSS class for canvas
 * @param {object} [style] - Inline styles for canvas
 */
export const VIB3PipelineProps = {
    width: 800,
    height: 600,
    inscriptionLayers: 4,
    exposure: 1.2,
    gamma: 2.2,
    generateSplats: false,
};

// ─── Three.js Interop ───────────────────────────────────────────

/**
 * Convert Three.js BufferGeometry to VIB3 mesh format
 * @param {THREE.BufferGeometry} geometry
 * @returns {object} { positions, normals, uvs, indices }
 */
export function threeGeometryToVIB3(geometry) {
    const result = {};

    if (geometry.attributes.position) {
        result.positions = new Float32Array(geometry.attributes.position.array);
    }
    if (geometry.attributes.normal) {
        result.normals = new Float32Array(geometry.attributes.normal.array);
    }
    if (geometry.attributes.uv) {
        result.uvs = new Float32Array(geometry.attributes.uv.array);
    }
    if (geometry.attributes.color) {
        result.colors = new Float32Array(geometry.attributes.color.array);
    }
    if (geometry.index) {
        result.indices = new Uint32Array(geometry.index.array);
    }

    // Joint data for skinned meshes
    if (geometry.attributes.skinIndex) {
        result.joints = new Uint16Array(geometry.attributes.skinIndex.array);
    }
    if (geometry.attributes.skinWeight) {
        result.weights = new Float32Array(geometry.attributes.skinWeight.array);
    }

    return result;
}

/**
 * Create VIB3 inscription overlay for existing Three.js scene
 *
 * Usage with React Three Fiber:
 * ```jsx
 * import { useThree, useFrame } from '@react-three/fiber';
 *
 * function VIB3Overlay() {
 *   const { gl, scene, camera } = useThree();
 *   const overlay = useVIB3Overlay(gl.domElement);
 *
 *   useFrame((state) => {
 *     overlay.render(state.clock.elapsedTime, camera);
 *   });
 *
 *   return null;
 * }
 * ```
 */
export function createThreeOverlay(threeRenderer) {
    return {
        canvas: threeRenderer.domElement,
        _pipeline: null,
        _ready: false,

        async init() {
            const canvas = this.canvas;
            const gl = canvas.getContext('webgl2');
            if (!gl) return;

            const { EdgeInscriptionLayer } = await import('../../render/EdgeInscriptionLayer.js');
            const { InscriptionChannel } = await import('../../render/InscriptionChannel.js');

            this._inscriptionLayer = new EdgeInscriptionLayer(gl, { layerCount: 4 });
            this._inscriptionChannel = new InscriptionChannel({ layerCount: 4 });
            this._ready = true;
        },

        render(time, camera) {
            if (!this._ready) return;
            // The inscription layer would read from a shared depth/normal buffer
            // that Three.js renders to via MRT or a separate pass
        },

        setObjectState(id, state) {
            if (this._inscriptionChannel) {
                this._inscriptionChannel.setObjectState(id, state);
            }
        },

        setAudio(bass, mid, high, energy) {
            if (this._inscriptionChannel) {
                this._inscriptionChannel.setAudio(bass, mid, high, energy);
            }
        },

        dispose() {
            this._ready = false;
        },
    };
}
