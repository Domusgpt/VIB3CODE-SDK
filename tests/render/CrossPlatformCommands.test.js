/**
 * Tests for Cross-Platform RenderCommandBuffer and CommandBufferExecutor
 *
 * Tests the serializable command buffer system used for
 * WebGL, WebGPU, WASM, and Flutter platform integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    RenderCommandBuffer,
    CommandType,
    BlendMode,
    DepthFunc,
    Topology
} from '../../src/render/commands/RenderCommandBuffer.js';
import { CommandBufferExecutor } from '../../src/render/commands/CommandBufferExecutor.js';

describe('Cross-Platform RenderCommandBuffer', () => {
    let buffer;

    beforeEach(() => {
        buffer = new RenderCommandBuffer();
    });

    describe('basic operations', () => {
        it('should start empty', () => {
            expect(buffer.length).toBe(0);
            expect(buffer.sealed).toBe(false);
        });

        it('should record clear command', () => {
            buffer.clear({ color: [1, 0, 0, 1] });
            expect(buffer.length).toBe(1);

            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.CLEAR);
            expect(cmd.data.color).toEqual([1, 0, 0, 1]);
        });

        it('should record viewport command', () => {
            buffer.setViewport(0, 0, 800, 600);
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.SET_VIEWPORT);
            expect(cmd.data.width).toBe(800);
            expect(cmd.data.height).toBe(600);
        });

        it('should record draw command', () => {
            buffer.draw(36, 0, Topology.TRIANGLE_LIST);
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.DRAW);
            expect(cmd.data.vertexCount).toBe(36);
        });

        it('should record indexed draw command', () => {
            buffer.drawIndexed(108, 0, 0);
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.DRAW_INDEXED);
            expect(cmd.data.indexCount).toBe(108);
        });

        it('should record instanced draw command', () => {
            buffer.drawInstanced(36, 100);
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.DRAW_INSTANCED);
            expect(cmd.data.instanceCount).toBe(100);
        });
    });

    describe('VIB3+ specific commands', () => {
        it('should record rotor command with 8 components', () => {
            const rotor = [1, 0, 0, 0, 0.1, 0.2, 0.3, 0];
            buffer.setRotor(rotor);
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.SET_ROTOR);
            expect(cmd.data.rotor).toEqual(rotor);
            expect(cmd.data.rotor.length).toBe(8);
        });

        it('should record projection command', () => {
            buffer.setProjection({
                type: 'stereographic',
                dimension: 3.5,
                fov: Math.PI / 4
            });
            const cmd = buffer.getCommand(0);
            expect(cmd.type).toBe(CommandType.SET_PROJECTION);
            expect(cmd.data.type).toBe('stereographic');
            expect(cmd.data.dimension).toBe(3.5);
        });
    });

    describe('state commands', () => {
        it('should record pipeline command', () => {
            buffer.setPipeline('quantum-visualizer');
            const cmd = buffer.getCommand(0);
            expect(cmd.data.pipelineId).toBe('quantum-visualizer');
        });

        it('should record uniforms command', () => {
            buffer.setUniforms({ time: 1.5, intensity: 0.8, geometry: 12 });
            const cmd = buffer.getCommand(0);
            expect(cmd.data.values.time).toBe(1.5);
            expect(cmd.data.values.geometry).toBe(12);
        });

        it('should record blend mode command', () => {
            buffer.setBlendMode(BlendMode.ADDITIVE);
            const cmd = buffer.getCommand(0);
            expect(cmd.data.mode).toBe(BlendMode.ADDITIVE);
        });

        it('should record depth state command', () => {
            buffer.setDepthState({ enabled: true, write: false, func: DepthFunc.LEQUAL });
            const cmd = buffer.getCommand(0);
            expect(cmd.data.enabled).toBe(true);
            expect(cmd.data.write).toBe(false);
            expect(cmd.data.func).toBe(DepthFunc.LEQUAL);
        });
    });

    describe('buffer binding commands', () => {
        it('should record vertex buffer bind', () => {
            buffer.bindVertexBuffer(0, 'geometry-vbo', 64);
            const cmd = buffer.getCommand(0);
            expect(cmd.data.slot).toBe(0);
            expect(cmd.data.bufferId).toBe('geometry-vbo');
            expect(cmd.data.offset).toBe(64);
        });

        it('should record index buffer bind', () => {
            buffer.bindIndexBuffer('geometry-ibo', 'uint16', 0);
            const cmd = buffer.getCommand(0);
            expect(cmd.data.bufferId).toBe('geometry-ibo');
            expect(cmd.data.format).toBe('uint16');
        });

        it('should record texture bind', () => {
            buffer.bindTexture(0, 'holographic-tex', 'sampler-linear');
            const cmd = buffer.getCommand(0);
            expect(cmd.data.slot).toBe(0);
            expect(cmd.data.textureId).toBe('holographic-tex');
        });
    });

    describe('state stack', () => {
        it('should record push/pop state', () => {
            buffer.pushState();
            buffer.setBlendMode(BlendMode.ADDITIVE);
            buffer.popState();

            expect(buffer.length).toBe(3);
            expect(buffer.getCommand(0).type).toBe(CommandType.PUSH_STATE);
            expect(buffer.getCommand(2).type).toBe(CommandType.POP_STATE);
        });
    });

    describe('sealing', () => {
        it('should prevent recording after seal', () => {
            buffer.clear();
            buffer.seal();
            expect(buffer.sealed).toBe(true);

            expect(() => buffer.draw(36)).toThrow('Cannot record to sealed command buffer');
        });
    });

    describe('reset', () => {
        it('should clear buffer and allow reuse', () => {
            buffer.clear();
            buffer.draw(36);
            buffer.seal();

            buffer.reset();
            expect(buffer.length).toBe(0);
            expect(buffer.sealed).toBe(false);

            buffer.clear();
            expect(buffer.length).toBe(1);
        });
    });

    describe('statistics', () => {
        it('should track draw calls and triangles', () => {
            buffer.draw(36); // 12 triangles
            buffer.draw(24); // 8 triangles
            buffer.drawIndexed(108); // 36 triangles

            const stats = buffer.getStats();
            expect(stats.drawCalls).toBe(3);
            expect(stats.triangles).toBe(56);
        });

        it('should track state changes', () => {
            buffer.setViewport(0, 0, 800, 600);
            buffer.setPipeline('default');
            buffer.setBlendMode(BlendMode.ALPHA);

            const stats = buffer.getStats();
            expect(stats.stateChanges).toBe(3);
        });

        it('should track uniform updates', () => {
            buffer.setUniforms({ time: 0 });
            buffer.setRotor([1, 0, 0, 0, 0, 0, 0, 0]);
            buffer.setProjection({ type: 'perspective', dimension: 3.5 });

            const stats = buffer.getStats();
            expect(stats.uniformUpdates).toBe(3);
        });
    });

    describe('serialization for cross-platform', () => {
        it('should serialize to JSON', () => {
            buffer.clear({ color: [0, 0, 0, 1] });
            buffer.setRotor([1, 0, 0, 0, 0.1, 0.2, 0.3, 0]);
            buffer.draw(36);

            const json = buffer.toJSON();
            expect(json.commands).toHaveLength(3);
            expect(json.version).toBeGreaterThan(0);
        });

        it('should serialize to string for FFI', () => {
            buffer.clear();
            buffer.draw(36);
            const str = buffer.serialize();
            expect(typeof str).toBe('string');
            expect(str).toContain('commands');
        });

        it('should deserialize from JSON', () => {
            buffer.clear({ color: [1, 0, 0, 1] });
            buffer.setRotor([1, 0, 0, 0, 0, 0, 0, 0]);
            buffer.draw(36);

            const json = buffer.toJSON();
            const restored = RenderCommandBuffer.fromJSON(json);

            expect(restored.length).toBe(3);
            expect(restored.getCommand(0).data.color).toEqual([1, 0, 0, 1]);
            expect(restored.getCommand(1).data.rotor).toHaveLength(8);
        });

        it('should serialize to binary with magic header', () => {
            buffer.clear();
            buffer.draw(36);

            const binary = buffer.toBinary();
            expect(binary instanceof ArrayBuffer).toBe(true);

            // Check VCB1 magic header
            const view = new DataView(binary);
            expect(view.getUint32(0, false)).toBe(0x56434231);
        });

        it('should deserialize from binary', () => {
            buffer.clear({ color: [0, 1, 0, 1] });
            buffer.setRotor([0.707, 0, 0, 0, 0.707, 0, 0, 0]);
            buffer.draw(48);

            const binary = buffer.toBinary();
            const restored = RenderCommandBuffer.fromBinary(binary);

            expect(restored.length).toBe(3);
            expect(restored.getCommand(2).data.vertexCount).toBe(48);
        });

        it('should reject invalid binary magic', () => {
            const badBuffer = new ArrayBuffer(20);
            const view = new DataView(badBuffer);
            view.setUint32(0, 0x12345678, false); // Wrong magic

            expect(() => RenderCommandBuffer.fromBinary(badBuffer))
                .toThrow('Invalid command buffer magic');
        });
    });

    describe('builder pattern', () => {
        it('should support fluent API', () => {
            const built = RenderCommandBuffer.builder()
                .clear({ color: [0, 0, 0, 1] })
                .viewport(0, 0, 800, 600)
                .pipeline('quantum')
                .rotor([1, 0, 0, 0, 0, 0, 0, 0])
                .blend(BlendMode.ALPHA)
                .draw(36)
                .seal()
                .build();

            expect(built.length).toBe(6);
            expect(built.sealed).toBe(true);
        });
    });
});

describe('CommandBufferExecutor', () => {
    let executor;

    beforeEach(() => {
        executor = new CommandBufferExecutor({ validateOnly: true });
    });

    describe('validation mode', () => {
        it('should validate clear command', () => {
            const buffer = new RenderCommandBuffer();
            buffer.clear({ color: [0, 0, 0, 1] });

            const ctx = executor.executeWebGL(buffer, null);
            expect(ctx.stats.commandsExecuted).toBe(1);
            expect(ctx.stats.errors).toBe(0);
        });

        it('should validate draw command', () => {
            const buffer = new RenderCommandBuffer();
            buffer.draw(36);

            const ctx = executor.executeWebGL(buffer, null);
            expect(ctx.stats.commandsExecuted).toBe(1);
        });

        it('should validate VIB3+ commands', () => {
            const buffer = new RenderCommandBuffer();
            buffer.setRotor([1, 0, 0, 0, 0, 0, 0, 0]);
            buffer.setProjection({ type: 'stereographic', dimension: 3.5 });

            const ctx = executor.executeWebGL(buffer, null);
            expect(ctx.stats.commandsExecuted).toBe(2);
            expect(ctx.stats.errors).toBe(0);
        });
    });

    describe('resource registry', () => {
        it('should register and retrieve buffers', () => {
            const mockBuffer = { id: 'geometry-vbo' };
            executor.registerBuffer('vbo-quantum', mockBuffer);

            expect(executor.getBuffer('vbo-quantum')).toBe(mockBuffer);
        });

        it('should register textures', () => {
            const mockTexture = { id: 'holographic-tex' };
            executor.registerTexture('tex-holo', mockTexture);
        });

        it('should register pipelines', () => {
            const mockPipeline = { program: 'quantum-shader' };
            executor.registerPipeline('quantum', mockPipeline);
        });

        it('should clear all registries', () => {
            executor.registerBuffer('vbo-1', {});
            executor.registerTexture('tex-1', {});
            executor.registerPipeline('default', {});

            executor.clearRegistries();

            expect(executor.getBuffer('vbo-1')).toBeUndefined();
        });
    });
});

describe('CommandType constants', () => {
    it('should have unique values', () => {
        const values = Object.values(CommandType);
        const uniqueValues = new Set(values);
        expect(uniqueValues.size).toBe(values.length);
    });

    it('should include VIB3+ specific types', () => {
        expect(CommandType.SET_ROTOR).toBe(0x11);
        expect(CommandType.SET_PROJECTION).toBe(0x12);
    });
});

describe('BlendMode constants', () => {
    it('should include all standard blend modes', () => {
        expect(BlendMode.NONE).toBe(0);
        expect(BlendMode.ALPHA).toBe(1);
        expect(BlendMode.ADDITIVE).toBe(2);
        expect(BlendMode.MULTIPLY).toBe(3);
        expect(BlendMode.SCREEN).toBe(4);
        expect(BlendMode.PREMULTIPLIED).toBe(5);
    });
});

describe('Topology constants', () => {
    it('should include all primitive topologies', () => {
        expect(Topology.POINT_LIST).toBe(0);
        expect(Topology.LINE_LIST).toBe(1);
        expect(Topology.LINE_STRIP).toBe(2);
        expect(Topology.TRIANGLE_LIST).toBe(3);
        expect(Topology.TRIANGLE_STRIP).toBe(4);
        expect(Topology.TRIANGLE_FAN).toBe(5);
    });
});

describe('DepthFunc constants', () => {
    it('should include all depth functions', () => {
        expect(DepthFunc.NEVER).toBe(0);
        expect(DepthFunc.LESS).toBe(1);
        expect(DepthFunc.EQUAL).toBe(2);
        expect(DepthFunc.LEQUAL).toBe(3);
        expect(DepthFunc.GREATER).toBe(4);
        expect(DepthFunc.NOTEQUAL).toBe(5);
        expect(DepthFunc.GEQUAL).toBe(6);
        expect(DepthFunc.ALWAYS).toBe(7);
    });
});
