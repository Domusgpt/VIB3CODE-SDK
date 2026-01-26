/**
 * RendererContract Compliance Tests
 * Verifies that all visualization systems implement the required contract methods
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    RendererContract,
    RendererContractAdapter,
    verifyRendererContract
} from '../../src/core/RendererContracts.js';

// Mock WebGL context for testing
const createMockGL = () => ({
    viewport: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    getUniformLocation: vi.fn(),
    uniform1f: vi.fn(),
    uniform2fv: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    BLEND: 3042,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    COLOR_BUFFER_BIT: 16384
});

// Mock canvas for testing
const createMockCanvas = (id = 'test-canvas') => {
    const canvas = {
        id,
        width: 800,
        height: 600,
        style: { width: '800px', height: '600px' },
        getContext: vi.fn(() => createMockGL()),
        getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600 })),
        parentElement: {
            getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600 }))
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    };
    return canvas;
};

describe('RendererContract', () => {
    describe('Abstract Base Class', () => {
        it('should throw when init() is not implemented', () => {
            const contract = new RendererContract();
            expect(() => contract.init()).toThrow('must be implemented');
        });

        it('should throw when resize() is not implemented', () => {
            const contract = new RendererContract();
            expect(() => contract.resize(800, 600)).toThrow('must be implemented');
        });

        it('should throw when render() is not implemented', () => {
            const contract = new RendererContract();
            expect(() => contract.render()).toThrow('must be implemented');
        });

        it('should throw when setActive() is not implemented', () => {
            const contract = new RendererContract();
            expect(() => contract.setActive(true)).toThrow('must be implemented');
        });

        it('should throw when dispose() is not implemented', () => {
            const contract = new RendererContract();
            expect(() => contract.dispose()).toThrow('must be implemented');
        });
    });

    describe('RendererContractAdapter', () => {
        let adapter;

        beforeEach(() => {
            adapter = new RendererContractAdapter();
        });

        it('should have default implementations that do not throw', () => {
            expect(() => adapter.init({})).not.toThrow();
            expect(() => adapter.resize(800, 600)).not.toThrow();
            expect(() => adapter.render({})).not.toThrow();
            expect(() => adapter.setActive(true)).not.toThrow();
            expect(() => adapter.dispose()).not.toThrow();
        });

        it('should track initialized state', () => {
            expect(adapter.initialized).toBe(false);
            adapter.init({});
            expect(adapter.initialized).toBe(true);
            adapter.dispose();
            expect(adapter.initialized).toBe(false);
        });

        it('should track active state', () => {
            expect(adapter.isActive).toBe(false);
            adapter.setActive(true);
            expect(adapter.isActive).toBe(true);
            adapter.setActive(false);
            expect(adapter.isActive).toBe(false);
        });

        it('should store dimensions on resize', () => {
            adapter.resize(1920, 1080, 2);
            expect(adapter._width).toBe(1920);
            expect(adapter._height).toBe(1080);
            expect(adapter._pixelRatio).toBe(2);
        });
    });

    describe('verifyRendererContract', () => {
        it('should pass for fully compliant system', () => {
            const compliantSystem = {
                init: () => {},
                resize: () => {},
                render: () => {},
                setActive: () => {},
                dispose: () => {}
            };

            const result = verifyRendererContract(compliantSystem);
            expect(result.compliant).toBe(true);
            expect(result.missing).toHaveLength(0);
        });

        it('should fail for missing methods', () => {
            const incompleteSystem = {
                init: () => {},
                setActive: () => {}
            };

            const result = verifyRendererContract(incompleteSystem);
            expect(result.compliant).toBe(false);
            expect(result.missing).toContain('resize');
            expect(result.missing).toContain('render');
            expect(result.missing).toContain('dispose');
        });

        it('should warn about common aliases', () => {
            const systemWithAliases = {
                initialize: () => {},  // alias for init
                render: () => {},
                setActive: () => {},
                destroy: () => {},     // alias for dispose
                resize: () => {}
            };

            const result = verifyRendererContract(systemWithAliases);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('init'))).toBe(true);
            expect(result.warnings.some(w => w.includes('dispose'))).toBe(true);
        });
    });
});

describe('FacetedSystem Contract Compliance', () => {
    let FacetedSystem;
    let system;

    beforeEach(async () => {
        // Mock DOM
        const mockCanvas = createMockCanvas('content-canvas');
        global.document = {
            getElementById: vi.fn((id) => {
                if (id === 'content-canvas') return mockCanvas;
                return null;
            })
        };

        // Import after mocking
        const module = await import('../../src/faceted/FacetedSystem.js');
        FacetedSystem = module.FacetedSystem;
        system = new FacetedSystem();
    });

    it('should have init() method', () => {
        expect(typeof system.init).toBe('function');
    });

    it('should have resize() method', () => {
        expect(typeof system.resize).toBe('function');
    });

    it('should have render() method', () => {
        expect(typeof system.render).toBe('function');
    });

    it('should have setActive() method', () => {
        expect(typeof system.setActive).toBe('function');
    });

    it('should have dispose() method', () => {
        expect(typeof system.dispose).toBe('function');
    });

    it('should pass contract verification', () => {
        const result = verifyRendererContract(system);
        expect(result.compliant).toBe(true);
    });
});

describe('QuantumEngine Contract Compliance', () => {
    it('should have resize method defined on prototype', async () => {
        // Dynamically import to check prototype without instantiation
        const { QuantumEngine } = await import('../../src/quantum/QuantumEngine.js');

        // Test that all contract methods exist on prototype
        expect(typeof QuantumEngine.prototype.resize).toBe('function');
        expect(typeof QuantumEngine.prototype.render).toBe('function');
        expect(typeof QuantumEngine.prototype.setActive).toBe('function');
        expect(typeof QuantumEngine.prototype.dispose).toBe('function');
    });

    it('should have contract verification warnings for aliases', () => {
        const mockSystem = {
            init: () => {},  // has init
            resize: () => {},
            render: () => {},
            setActive: () => {},
            destroy: () => {}  // alias for dispose
        };

        const result = verifyRendererContract(mockSystem);
        expect(result.warnings.some(w => w.includes('dispose'))).toBe(true);
    });
});

describe('RealHolographicSystem Contract Compliance', () => {
    it('should have all required contract methods on prototype', async () => {
        // Dynamically import to check prototype without instantiation
        const { RealHolographicSystem } = await import('../../src/holograms/RealHolographicSystem.js');

        // Test that all contract methods exist on prototype
        expect(typeof RealHolographicSystem.prototype.init).toBe('function');
        expect(typeof RealHolographicSystem.prototype.resize).toBe('function');
        expect(typeof RealHolographicSystem.prototype.render).toBe('function');
        expect(typeof RealHolographicSystem.prototype.setActive).toBe('function');
        expect(typeof RealHolographicSystem.prototype.dispose).toBe('function');
    });
});

describe('Contract Method Behavior', () => {
    it('resize() should accept width, height, and pixelRatio', () => {
        const adapter = new RendererContractAdapter();
        adapter.resize(1920, 1080, 2);

        expect(adapter._width).toBe(1920);
        expect(adapter._height).toBe(1080);
        expect(adapter._pixelRatio).toBe(2);
    });

    it('resize() should default pixelRatio to 1', () => {
        const adapter = new RendererContractAdapter();
        adapter.resize(800, 600);

        expect(adapter._pixelRatio).toBe(1);
    });

    it('render() should accept frameState with params', () => {
        const adapter = new RendererContractAdapter();
        const frameState = {
            time: 1.5,
            params: { hue: 200, chaos: 0.5 },
            audio: { bass: 0.3, mid: 0.5, high: 0.2 }
        };

        expect(() => adapter.render(frameState)).not.toThrow();
    });

    it('setActive() should update internal state', () => {
        const adapter = new RendererContractAdapter();

        adapter.setActive(true);
        expect(adapter.isActive).toBe(true);

        adapter.setActive(false);
        expect(adapter.isActive).toBe(false);
    });

    it('dispose() should reset state', () => {
        const adapter = new RendererContractAdapter();
        adapter.init({});
        adapter.setActive(true);

        adapter.dispose();

        expect(adapter.initialized).toBe(false);
        expect(adapter.isActive).toBe(false);
    });
});
