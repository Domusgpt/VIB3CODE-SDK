/**
 * Scene4D - Container for 4D scene management
 *
 * Provides a complete scene graph with:
 * - Root node management
 * - Node lookup by ID/name/tag
 * - Layer-based filtering
 * - Update and render traversal
 * - Scene-wide settings
 */

import { Node4D } from './Node4D.js';
import { Vec4 } from '../math/Vec4.js';

let sceneIdCounter = 0;

/**
 * Scene4D class - Main scene container
 */
export class Scene4D {
    /**
     * @param {string} [name] - Scene name
     */
    constructor(name = '') {
        /** @type {string} Unique scene ID */
        this.id = `scene_${++sceneIdCounter}`;

        /** @type {string} Scene name */
        this.name = name || this.id;

        /** @type {Node4D} Root node of scene graph */
        this.root = new Node4D('__root__');

        /** @type {Map<string, Node4D>} ID to node lookup */
        this._nodeById = new Map();
        this._nodeById.set(this.root.id, this.root);

        /** @type {Set<Node4D>} Nodes pending addition */
        this._pendingAdd = new Set();

        /** @type {Set<Node4D>} Nodes pending removal */
        this._pendingRemove = new Set();

        /** @type {boolean} Whether scene is currently updating */
        this._updating = false;

        /** @type {Vec4} Scene background color (RGBA) */
        this.backgroundColor = new Vec4(0, 0, 0, 1);

        /** @type {Vec4} Ambient light color */
        this.ambientLight = new Vec4(0.2, 0.2, 0.2, 1);

        /** @type {number} 4D "fog" distance (W-axis fade) */
        this.wFogDistance = 10;

        /** @type {boolean} Whether W-fog is enabled */
        this.wFogEnabled = false;

        /** @type {object} Scene metadata */
        this.metadata = {};

        /** @type {function[]} Update callbacks */
        this._updateCallbacks = [];

        /** @type {number} Total nodes in scene (cached) */
        this._nodeCount = 1; // Root counts as 1

        /** @type {boolean} Whether node count needs recalculation */
        this._nodeCountDirty = false;
    }

    // ==================== Node Management ====================

    /**
     * Add a node to the scene (under root)
     * @param {Node4D} node
     * @returns {this}
     */
    add(node) {
        if (this._updating) {
            this._pendingAdd.add(node);
            return this;
        }

        this._addNodeImmediate(node);
        return this;
    }

    /**
     * Add node immediately
     * @private
     */
    _addNodeImmediate(node) {
        if (node.parent === this.root) return;

        this.root.addChild(node);
        this._registerNode(node);
    }

    /**
     * Remove a node from the scene
     * @param {Node4D} node
     * @returns {boolean}
     */
    remove(node) {
        if (node === this.root) return false;

        if (this._updating) {
            this._pendingRemove.add(node);
            return true;
        }

        return this._removeNodeImmediate(node);
    }

    /**
     * Remove node immediately
     * @private
     */
    _removeNodeImmediate(node) {
        this._unregisterNode(node);
        node.parent = null;
        return true;
    }

    /**
     * Register node and all descendants in lookup
     * @private
     */
    _registerNode(node) {
        node.traverse(n => {
            this._nodeById.set(n.id, n);
        });
        this._nodeCountDirty = true;
    }

    /**
     * Unregister node and all descendants from lookup
     * @private
     */
    _unregisterNode(node) {
        node.traverse(n => {
            this._nodeById.delete(n.id);
        });
        this._nodeCountDirty = true;
    }

    /**
     * Process pending additions and removals
     * @private
     */
    _processPending() {
        for (const node of this._pendingRemove) {
            this._removeNodeImmediate(node);
        }
        this._pendingRemove.clear();

        for (const node of this._pendingAdd) {
            this._addNodeImmediate(node);
        }
        this._pendingAdd.clear();
    }

    /**
     * Get node by ID
     * @param {string} id
     * @returns {Node4D|undefined}
     */
    getNodeById(id) {
        return this._nodeById.get(id);
    }

    /**
     * Get node by name (first match)
     * @param {string} name
     * @returns {Node4D|undefined}
     */
    getNodeByName(name) {
        return this.root.findByName(name);
    }

    /**
     * Get all nodes with tag
     * @param {string} tag
     * @returns {Node4D[]}
     */
    getNodesByTag(tag) {
        return this.root.findByTag(tag);
    }

    /**
     * Get all nodes on a layer
     * @param {number} layer - Layer bit (0-31)
     * @returns {Node4D[]}
     */
    getNodesByLayer(layer) {
        const mask = 1 << layer;
        const results = [];
        this.root.traverse(node => {
            if (node.layerMask & mask) {
                results.push(node);
            }
        });
        return results;
    }

    /**
     * Get total node count
     * @returns {number}
     */
    get nodeCount() {
        if (this._nodeCountDirty) {
            this._nodeCount = this._nodeById.size;
            this._nodeCountDirty = false;
        }
        return this._nodeCount;
    }

    /**
     * Check if scene contains a node
     * @param {Node4D} node
     * @returns {boolean}
     */
    contains(node) {
        return this._nodeById.has(node.id);
    }

    // ==================== Traversal ====================

    /**
     * Traverse all nodes depth-first
     * @param {function(Node4D): boolean|void} callback
     */
    traverse(callback) {
        this.root.traverse(callback);
    }

    /**
     * Traverse only visible nodes
     * @param {function(Node4D): void} callback
     */
    traverseVisible(callback) {
        this.root.traverseVisible(callback);
    }

    /**
     * Traverse nodes matching layer mask
     * @param {number} mask
     * @param {function(Node4D): void} callback
     */
    traverseByLayer(mask, callback) {
        this.root.traverse(node => {
            if (node.layerMask & mask) {
                callback(node);
            }
        });
    }

    /**
     * Get all visible nodes sorted by W coordinate (far to near)
     * @returns {Node4D[]}
     */
    getVisibleNodesSortedByW() {
        const nodes = [];
        this.traverseVisible(node => {
            if (node !== this.root) {
                nodes.push(node);
            }
        });

        // Sort by world W coordinate (far to near for proper transparency)
        nodes.sort((a, b) => a.worldPosition.w - b.worldPosition.w);
        return nodes;
    }

    // ==================== Update Loop ====================

    /**
     * Register an update callback
     * @param {function(number): void} callback - Called with deltaTime
     * @returns {function} Unsubscribe function
     */
    onUpdate(callback) {
        this._updateCallbacks.push(callback);
        return () => {
            const idx = this._updateCallbacks.indexOf(callback);
            if (idx !== -1) {
                this._updateCallbacks.splice(idx, 1);
            }
        };
    }

    /**
     * Update the scene
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(deltaTime) {
        this._updating = true;

        // Call update callbacks
        for (const callback of this._updateCallbacks) {
            callback(deltaTime);
        }

        // Update all node transforms (ensures world matrices are current)
        this.root.traverse(node => {
            // Access worldMatrix to trigger update if dirty
            void node.worldMatrix;
        });

        this._updating = false;

        // Process pending operations
        this._processPending();
    }

    // ==================== Queries ====================

    /**
     * Find nodes within a 4D sphere
     * @param {Vec4} center
     * @param {number} radius
     * @returns {Node4D[]}
     */
    findNodesInSphere(center, radius) {
        const results = [];
        const radiusSq = radius * radius;

        this.root.traverse(node => {
            if (node === this.root) return;
            const dist = node.worldPosition.sub(center).lengthSquared();
            if (dist <= radiusSq) {
                results.push(node);
            }
        });

        return results;
    }

    /**
     * Find nodes within a 4D box
     * @param {Vec4} min
     * @param {Vec4} max
     * @returns {Node4D[]}
     */
    findNodesInBox(min, max) {
        const results = [];

        this.root.traverse(node => {
            if (node === this.root) return;
            const pos = node.worldPosition;
            if (pos.x >= min.x && pos.x <= max.x &&
                pos.y >= min.y && pos.y <= max.y &&
                pos.z >= min.z && pos.z <= max.z &&
                pos.w >= min.w && pos.w <= max.w) {
                results.push(node);
            }
        });

        return results;
    }

    /**
     * Find nearest node to a point
     * @param {Vec4} point
     * @param {number} [maxDistance] - Maximum search distance
     * @returns {Node4D|null}
     */
    findNearestNode(point, maxDistance = Infinity) {
        let nearest = null;
        let nearestDistSq = maxDistance * maxDistance;

        this.root.traverse(node => {
            if (node === this.root) return;
            const distSq = node.worldPosition.sub(point).lengthSquared();
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = node;
            }
        });

        return nearest;
    }

    /**
     * Raycast into the scene (simplified 4D ray)
     * @param {Vec4} origin
     * @param {Vec4} direction
     * @param {number} [maxDistance]
     * @returns {Array<{node: Node4D, distance: number}>}
     */
    raycast(origin, direction, maxDistance = 1000) {
        const hits = [];
        const dir = direction.normalize();

        this.root.traverse(node => {
            if (node === this.root) return;

            // Simplified: treat each node as a point
            const toNode = node.worldPosition.sub(origin);
            const dist = toNode.dot(dir);

            if (dist > 0 && dist < maxDistance) {
                // Check perpendicular distance
                const closest = origin.add(dir.scale(dist));
                const perpDist = node.worldPosition.sub(closest).length();

                // Assume nodes have radius 0.5 for hit detection
                if (perpDist < 0.5) {
                    hits.push({ node, distance: dist });
                }
            }
        });

        // Sort by distance
        hits.sort((a, b) => a.distance - b.distance);
        return hits;
    }

    // ==================== Lifecycle ====================

    /**
     * Clear all nodes from scene
     */
    clear() {
        this.root.removeAllChildren();
        this._nodeById.clear();
        this._nodeById.set(this.root.id, this.root);
        this._pendingAdd.clear();
        this._pendingRemove.clear();
        this._nodeCountDirty = true;
    }

    /**
     * Dispose scene and all nodes
     */
    dispose() {
        this.clear();
        this._updateCallbacks = [];
        this.root.dispose();
    }

    /**
     * Clone scene with all nodes
     * @returns {Scene4D}
     */
    clone() {
        const cloned = new Scene4D(this.name + '_clone');
        cloned.backgroundColor = this.backgroundColor.clone();
        cloned.ambientLight = this.ambientLight.clone();
        cloned.wFogDistance = this.wFogDistance;
        cloned.wFogEnabled = this.wFogEnabled;
        cloned.metadata = { ...this.metadata };

        // Clone all children of root
        for (const child of this.root.children) {
            cloned.add(child.cloneDeep());
        }

        return cloned;
    }

    // ==================== Serialization ====================

    /**
     * Serialize scene to JSON
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            backgroundColor: [
                this.backgroundColor.x,
                this.backgroundColor.y,
                this.backgroundColor.z,
                this.backgroundColor.w
            ],
            ambientLight: [
                this.ambientLight.x,
                this.ambientLight.y,
                this.ambientLight.z,
                this.ambientLight.w
            ],
            wFogDistance: this.wFogDistance,
            wFogEnabled: this.wFogEnabled,
            metadata: this.metadata,
            nodes: this.root.children.map(c => c.toJSON())
        };
    }

    /**
     * Create scene from JSON
     * @param {object} json
     * @returns {Scene4D}
     */
    static fromJSON(json) {
        const scene = new Scene4D(json.name);
        scene.backgroundColor = new Vec4(...json.backgroundColor);
        scene.ambientLight = new Vec4(...json.ambientLight);
        scene.wFogDistance = json.wFogDistance;
        scene.wFogEnabled = json.wFogEnabled;
        scene.metadata = json.metadata || {};

        for (const nodeJson of (json.nodes || [])) {
            scene.add(Node4D.fromJSON(nodeJson));
        }

        return scene;
    }

    // ==================== Statistics ====================

    /**
     * Get scene statistics
     * @returns {object}
     */
    getStats() {
        let visibleCount = 0;
        let enabledCount = 0;
        let maxDepth = 0;

        this.root.traverse(node => {
            if (node.visible) visibleCount++;
            if (node.enabled) enabledCount++;
            maxDepth = Math.max(maxDepth, node.getDepth());
        });

        return {
            totalNodes: this.nodeCount,
            visibleNodes: visibleCount,
            enabledNodes: enabledCount,
            maxDepth,
            pendingAdd: this._pendingAdd.size,
            pendingRemove: this._pendingRemove.size
        };
    }
}

export default Scene4D;
