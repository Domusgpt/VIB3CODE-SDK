/**
 * SceneRenderer
 *
 * Multi-object scene management that renders multiple meshes into a shared
 * GBuffer in a single pass. Each mesh gets a unique object ID for cross-object
 * edge inscription routing.
 *
 * Features:
 *   - Shared GBuffer across all objects (depth-correct compositing)
 *   - Per-object: transform, material, inscription config, morph weight
 *   - Cross-object edge detection via object ID boundaries
 *   - Frustum culling (AABB-based, optional)
 *   - Draw-order sorting (opaque front-to-back, transparent back-to-front)
 *
 * Usage:
 *   const scene = new SceneRenderer(gl);
 *   const obj1 = scene.addObject('hero', { positions, normals, indices });
 *   const obj2 = scene.addObject('terrain', { positions, normals, indices });
 *   obj1.setTransform(modelMatrix1);
 *   obj2.setTransform(modelMatrix2);
 *   scene.render(viewMatrix, projMatrix);
 *   // scene.gbuffer now has all objects with unique IDs
 */

import { MeshRenderer } from './MeshRenderer.js';

/* ------------------------------------------------------------------ */
/*  SceneObject                                                        */
/* ------------------------------------------------------------------ */

/**
 * Represents a single object in the scene with its own transform,
 * material, and inscription configuration.
 */
export class SceneObject {
    constructor(name, id, meshRenderer) {
        this.name = name;
        this.id = id;          // Integer 0-255 for GBuffer encoding
        this.mesh = meshRenderer;
        this.visible = true;
        this.transparent = false;

        // Transform (column-major 4x4)
        this.transform = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

        // Per-object inscription override (null = use global)
        this.inscriptionConfig = null;

        // AABB for frustum culling (set via computeAABB)
        this.aabbMin = null;
        this.aabbMax = null;

        // Sorting key (updated per frame)
        this._sortKey = 0;
    }

    setTransform(matrix) {
        this.transform.set(matrix);
    }

    setInscriptionConfig(config) {
        this.inscriptionConfig = config;
    }

    computeAABB(positions) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i += 3) {
            min[0] = Math.min(min[0], positions[i]);
            min[1] = Math.min(min[1], positions[i+1]);
            min[2] = Math.min(min[2], positions[i+2]);
            max[0] = Math.max(max[0], positions[i]);
            max[1] = Math.max(max[1], positions[i+1]);
            max[2] = Math.max(max[2], positions[i+2]);
        }
        this.aabbMin = min;
        this.aabbMax = max;
    }
}

/* ------------------------------------------------------------------ */
/*  Matrix helpers                                                     */
/* ------------------------------------------------------------------ */

function mat4Multiply(out, a, b) {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[k * 4 + j] * b[i * 4 + k];
            }
            out[i * 4 + j] = sum;
        }
    }
    return out;
}

function aabbCenterDepth(aabbMin, aabbMax, viewMatrix) {
    const cx = (aabbMin[0] + aabbMax[0]) * 0.5;
    const cy = (aabbMin[1] + aabbMax[1]) * 0.5;
    const cz = (aabbMin[2] + aabbMax[2]) * 0.5;
    // z component of view * center
    return viewMatrix[2] * cx + viewMatrix[6] * cy + viewMatrix[10] * cz + viewMatrix[14];
}

/* ------------------------------------------------------------------ */
/*  SceneRenderer                                                      */
/* ------------------------------------------------------------------ */

export class SceneRenderer {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this._objects = new Map(); // name -> SceneObject
        this._nextID = 1;         // 0 = background/no object
        this._sharedGBuffer = null;
        this._gbufferWidth = 0;
        this._gbufferHeight = 0;

        // Shared rendering config
        this.lightDir = opts.lightDir || [0.4, 0.8, 0.3];
        this.lightColor = opts.lightColor || [1.0, 0.98, 0.95];
        this.ambientColor = opts.ambientColor || [0.12, 0.12, 0.18];
    }

    /* -------------------------------------------------------------- */
    /*  Object management                                              */
    /* -------------------------------------------------------------- */

    /**
     * Add a mesh object to the scene.
     * @param {string} name  Unique object name
     * @param {object} geometry  { positions, normals, uvs, colors, indices }
     * @param {object} [opts]
     * @returns {SceneObject}
     */
    addObject(name, geometry, opts = {}) {
        if (this._objects.has(name)) {
            this.removeObject(name);
        }

        const id = this._nextID++;
        const mesh = new MeshRenderer(this.gl, {
            lightDir: this.lightDir,
            lightColor: this.lightColor,
            ambientColor: this.ambientColor,
            ...opts,
        });

        mesh.uploadGeometry(geometry);
        mesh.objectID = id;

        const obj = new SceneObject(name, id, mesh);
        if (geometry.positions) {
            obj.computeAABB(geometry.positions);
        }

        this._objects.set(name, obj);
        return obj;
    }

    getObject(name) {
        return this._objects.get(name) || null;
    }

    removeObject(name) {
        const obj = this._objects.get(name);
        if (obj) {
            obj.mesh.dispose();
            this._objects.delete(name);
        }
    }

    get objectCount() {
        return this._objects.size;
    }

    get objects() {
        return Array.from(this._objects.values());
    }

    /* -------------------------------------------------------------- */
    /*  Render all objects into shared GBuffer                         */
    /* -------------------------------------------------------------- */

    /**
     * Render all visible objects into a shared GBuffer.
     * Objects are sorted: opaque front-to-back, transparent back-to-front.
     *
     * @param {Float32Array} viewMatrix
     * @param {Float32Array} projMatrix
     * @param {object} [opts]
     * @param {Float32Array} [opts.rotation4D]
     * @param {number} [opts.projDistance]
     * @param {number} [opts.width]
     * @param {number} [opts.height]
     * @returns {{ gbuffer, objectCount, opaqueCount, transparentCount }}
     */
    render(viewMatrix, projMatrix, {
        rotation4D = null,
        projDistance = 2.0,
        width = 0,
        height = 0,
    } = {}) {
        const gl = this.gl;
        const w = width || gl.canvas.width;
        const h = height || gl.canvas.height;

        // Collect visible objects
        const visible = [];
        for (const obj of this._objects.values()) {
            if (!obj.visible) continue;
            // Compute sort key (depth from camera)
            if (obj.aabbMin && obj.aabbMax) {
                obj._sortKey = aabbCenterDepth(obj.aabbMin, obj.aabbMax, viewMatrix);
            }
            visible.push(obj);
        }

        // Sort: opaque front-to-back (smaller depth first),
        //       transparent back-to-front (larger depth first)
        const opaque = visible.filter(o => !o.transparent)
            .sort((a, b) => a._sortKey - b._sortKey);
        const transparent = visible.filter(o => o.transparent)
            .sort((a, b) => b._sortKey - a._sortKey);

        const sorted = [...opaque, ...transparent];

        // Use first object's MeshRenderer to manage the shared GBuffer.
        // All objects draw into the same GBuffer (clearBuffer only for first).
        const modelView = new Float32Array(16);

        let gbuffer = null;
        for (let i = 0; i < sorted.length; i++) {
            const obj = sorted[i];
            const mesh = obj.mesh;

            // ModelView = viewMatrix * objectTransform
            mat4Multiply(modelView, viewMatrix, obj.transform);

            // Sync lighting
            mesh.lightDir = this.lightDir;
            mesh.lightColor = this.lightColor;
            mesh.ambientColor = this.ambientColor;
            mesh.objectID = obj.id;

            const result = mesh.render(modelView, projMatrix, {
                rotation4D,
                projDistance,
                width: w,
                height: h,
                clearBuffer: i === 0,
            });

            if (i === 0) {
                gbuffer = result;
                // For subsequent objects, we need to render into the SAME GBuffer.
                // Override other objects' GBuffers to use the first one.
            } else {
                // Draw into first object's GBuffer
                gl.bindFramebuffer(gl.FRAMEBUFFER, gbuffer.framebuffer);
                gl.viewport(0, 0, w, h);
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL);
                gl.depthMask(!obj.transparent);

                if (obj.transparent) {
                    gl.enable(gl.BLEND);
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                } else {
                    gl.disable(gl.BLEND);
                }

                // Re-render into shared buffer
                gl.useProgram(mesh._program);
                gl.bindVertexArray(mesh._vao);
                if (mesh._indexCount > 0) {
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh._idxBuf);
                }

                const u = mesh._uniforms;
                const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
                gl.uniformMatrix4fv(u.modelView, false, modelView);
                gl.uniformMatrix4fv(u.projection, false, projMatrix);
                gl.uniformMatrix4fv(u.normalMatrix, false, modelView);
                gl.uniformMatrix4fv(u.rotation4D, false, rotation4D || IDENTITY);
                gl.uniform1f(u.projDistance, projDistance);
                gl.uniform1f(u.use4D, rotation4D ? 1.0 : 0.0);
                gl.uniform1f(u.morphWeight, mesh.morphWeight);
                gl.uniform1f(u.hasMorphTarget, mesh._hasMorphTarget ? 1.0 : 0.0);
                gl.uniform3fv(u.lightDir, mesh.lightDir);
                gl.uniform3fv(u.lightColor, mesh.lightColor);
                gl.uniform3fv(u.ambientColor, mesh.ambientColor);
                gl.uniform1f(u.specularPower, mesh.specularPower);
                gl.uniform1f(u.opacity, mesh.opacity);
                gl.uniform1f(u.objectID, mesh.objectID);

                if (mesh._hasTexture && mesh._diffuseTexture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, mesh._diffuseTexture);
                    gl.uniform1i(u.diffuseMap, 0);
                    gl.uniform1f(u.hasTexture, 1.0);
                } else {
                    gl.uniform1f(u.hasTexture, 0.0);
                }

                if (mesh._indexCount > 0) {
                    gl.drawElements(gl.TRIANGLES, mesh._indexCount, mesh._indexType, 0);
                } else {
                    gl.drawArrays(gl.TRIANGLES, 0, mesh._vertexCount);
                }

                gl.bindVertexArray(null);
                gl.disable(gl.BLEND);
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this._sharedGBuffer = gbuffer;

        return {
            gbuffer,
            objectCount: sorted.length,
            opaqueCount: opaque.length,
            transparentCount: transparent.length,
        };
    }

    get gbuffer() { return this._sharedGBuffer; }

    /* -------------------------------------------------------------- */
    /*  Per-object inscription configs                                 */
    /* -------------------------------------------------------------- */

    /**
     * Get a map of objectID -> inscriptionConfig for all objects
     * that have custom inscription settings.
     */
    getInscriptionMap() {
        const map = new Map();
        for (const obj of this._objects.values()) {
            if (obj.inscriptionConfig) {
                map.set(obj.id, obj.inscriptionConfig);
            }
        }
        return map;
    }

    dispose() {
        for (const obj of this._objects.values()) {
            obj.mesh.dispose();
        }
        this._objects.clear();
    }
}

export default SceneRenderer;
