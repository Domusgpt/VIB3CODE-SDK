/**
 * Node4D - Base class for 4D scene graph nodes
 *
 * Provides hierarchical transform management with parent-child relationships.
 * Supports both local and world transforms in 4D space.
 */

import { Vec4 } from '../math/Vec4.js';
import { Mat4x4 } from '../math/Mat4x4.js';
import { Rotor4D } from '../math/Rotor4D.js';

let nodeIdCounter = 0;

/**
 * Generate unique node ID
 * @returns {string}
 */
function generateNodeId() {
    return `node_${++nodeIdCounter}`;
}

/**
 * Node4D class - Base scene graph node
 */
export class Node4D {
    /**
     * @param {string} [name] - Optional node name
     */
    constructor(name = '') {
        /** @type {string} Unique identifier */
        this.id = generateNodeId();

        /** @type {string} Human-readable name */
        this.name = name || this.id;

        /** @type {Node4D|null} Parent node */
        this._parent = null;

        /** @type {Node4D[]} Child nodes */
        this._children = [];

        /** @type {Vec4} Local position */
        this._position = Vec4.zero();

        /** @type {Rotor4D} Local rotation */
        this._rotation = Rotor4D.identity();

        /** @type {Vec4} Local scale (uniform in each dimension) */
        this._scale = new Vec4(1, 1, 1, 1);

        /** @type {Mat4x4} Local transform matrix (cached) */
        this._localMatrix = Mat4x4.identity();

        /** @type {Mat4x4} World transform matrix (cached) */
        this._worldMatrix = Mat4x4.identity();

        /** @type {boolean} Whether local matrix needs recalculation */
        this._localDirty = true;

        /** @type {boolean} Whether world matrix needs recalculation */
        this._worldDirty = true;

        /** @type {boolean} Whether node is visible */
        this.visible = true;

        /** @type {boolean} Whether node is enabled for updates */
        this.enabled = true;

        /** @type {Map<string, any>} User data storage */
        this.userData = new Map();

        /** @type {string[]} Tags for filtering */
        this.tags = [];

        /** @type {number} Layer mask for rendering/physics */
        this.layerMask = 1;
    }

    // ==================== Hierarchy ====================

    /**
     * Get parent node
     * @returns {Node4D|null}
     */
    get parent() {
        return this._parent;
    }

    /**
     * Set parent node
     * @param {Node4D|null} newParent
     */
    set parent(newParent) {
        if (this._parent === newParent) return;

        // Remove from current parent
        if (this._parent) {
            const idx = this._parent._children.indexOf(this);
            if (idx !== -1) {
                this._parent._children.splice(idx, 1);
            }
        }

        // Set new parent
        this._parent = newParent;

        // Add to new parent's children
        if (newParent) {
            newParent._children.push(this);
        }

        // Mark world transform as dirty
        this._markWorldDirty();
    }

    /**
     * Get children array (read-only copy)
     * @returns {Node4D[]}
     */
    get children() {
        return [...this._children];
    }

    /**
     * Get number of children
     * @returns {number}
     */
    get childCount() {
        return this._children.length;
    }

    /**
     * Add a child node
     * @param {Node4D} child
     * @returns {this}
     */
    addChild(child) {
        if (child._parent === this) return this;
        if (child === this) throw new Error('Cannot add node as child of itself');
        if (this.isDescendantOf(child)) throw new Error('Cannot create circular hierarchy');

        child.parent = this;
        return this;
    }

    /**
     * Remove a child node
     * @param {Node4D} child
     * @returns {boolean} True if child was removed
     */
    removeChild(child) {
        if (child._parent !== this) return false;
        child.parent = null;
        return true;
    }

    /**
     * Remove all children
     * @returns {this}
     */
    removeAllChildren() {
        for (const child of [...this._children]) {
            child.parent = null;
        }
        return this;
    }

    /**
     * Get child by index
     * @param {number} index
     * @returns {Node4D|undefined}
     */
    getChildAt(index) {
        return this._children[index];
    }

    /**
     * Get child by name
     * @param {string} name
     * @returns {Node4D|undefined}
     */
    getChildByName(name) {
        return this._children.find(c => c.name === name);
    }

    /**
     * Find descendant by name (recursive)
     * @param {string} name
     * @returns {Node4D|undefined}
     */
    findByName(name) {
        if (this.name === name) return this;
        for (const child of this._children) {
            const found = child.findByName(name);
            if (found) return found;
        }
        return undefined;
    }

    /**
     * Find all descendants with tag
     * @param {string} tag
     * @returns {Node4D[]}
     */
    findByTag(tag) {
        const results = [];
        if (this.tags.includes(tag)) results.push(this);
        for (const child of this._children) {
            results.push(...child.findByTag(tag));
        }
        return results;
    }

    /**
     * Check if this node is descendant of another
     * @param {Node4D} ancestor
     * @returns {boolean}
     */
    isDescendantOf(ancestor) {
        let current = this._parent;
        while (current) {
            if (current === ancestor) return true;
            current = current._parent;
        }
        return false;
    }

    /**
     * Get root node of hierarchy
     * @returns {Node4D}
     */
    getRoot() {
        let current = this;
        while (current._parent) {
            current = current._parent;
        }
        return current;
    }

    /**
     * Get depth in hierarchy (root = 0)
     * @returns {number}
     */
    getDepth() {
        let depth = 0;
        let current = this._parent;
        while (current) {
            depth++;
            current = current._parent;
        }
        return depth;
    }

    // ==================== Transform ====================

    /**
     * Get local position
     * @returns {Vec4}
     */
    get position() {
        return this._position;
    }

    /**
     * Set local position
     * @param {Vec4} value
     */
    set position(value) {
        this._position = value;
        this._markLocalDirty();
    }

    /**
     * Get local rotation
     * @returns {Rotor4D}
     */
    get rotation() {
        return this._rotation;
    }

    /**
     * Set local rotation
     * @param {Rotor4D} value
     */
    set rotation(value) {
        this._rotation = value;
        this._markLocalDirty();
    }

    /**
     * Get local scale
     * @returns {Vec4}
     */
    get scale() {
        return this._scale;
    }

    /**
     * Set local scale
     * @param {Vec4} value
     */
    set scale(value) {
        this._scale = value;
        this._markLocalDirty();
    }

    /**
     * Set position components directly
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} w
     * @returns {this}
     */
    setPosition(x, y, z, w) {
        this._position = new Vec4(x, y, z, w);
        this._markLocalDirty();
        return this;
    }

    /**
     * Set uniform scale
     * @param {number} s
     * @returns {this}
     */
    setUniformScale(s) {
        this._scale = new Vec4(s, s, s, s);
        this._markLocalDirty();
        return this;
    }

    /**
     * Translate by offset
     * @param {Vec4} offset
     * @returns {this}
     */
    translate(offset) {
        this._position = this._position.add(offset);
        this._markLocalDirty();
        return this;
    }

    /**
     * Rotate by rotor
     * @param {Rotor4D} rotor
     * @returns {this}
     */
    rotate(rotor) {
        this._rotation = rotor.multiply(this._rotation).normalize();
        this._markLocalDirty();
        return this;
    }

    /**
     * Rotate around a plane
     * @param {string} plane - 'XY', 'XZ', 'YZ', 'XW', 'YW', 'ZW'
     * @param {number} angle - Radians
     * @returns {this}
     */
    rotateOnPlane(plane, angle) {
        const rotor = Rotor4D.fromPlaneAngle(plane, angle);
        return this.rotate(rotor);
    }

    /**
     * Get local transform matrix
     * @returns {Mat4x4}
     */
    get localMatrix() {
        if (this._localDirty) {
            this._updateLocalMatrix();
        }
        return this._localMatrix;
    }

    /**
     * Get world transform matrix
     * @returns {Mat4x4}
     */
    get worldMatrix() {
        if (this._worldDirty) {
            this._updateWorldMatrix();
        }
        return this._worldMatrix;
    }

    /**
     * Get world position
     * @returns {Vec4}
     */
    get worldPosition() {
        const wm = this.worldMatrix;
        return new Vec4(wm.get(0, 3), wm.get(1, 3), wm.get(2, 3), wm.get(3, 3));
    }

    /**
     * Set world position (adjusts local position)
     * @param {Vec4} worldPos
     * @returns {this}
     */
    setWorldPosition(worldPos) {
        if (this._parent) {
            const parentWorldInv = this._parent.worldMatrix.inverse();
            this._position = parentWorldInv.multiplyVec4(worldPos);
        } else {
            this._position = worldPos;
        }
        this._markLocalDirty();
        return this;
    }

    /**
     * Transform a point from local to world space
     * @param {Vec4} localPoint
     * @returns {Vec4}
     */
    localToWorld(localPoint) {
        return this.worldMatrix.multiplyVec4(localPoint);
    }

    /**
     * Transform a point from world to local space
     * @param {Vec4} worldPoint
     * @returns {Vec4}
     */
    worldToLocal(worldPoint) {
        return this.worldMatrix.inverse().multiplyVec4(worldPoint);
    }

    /**
     * Look at a target position (aligns +Z toward target)
     * Note: In 4D this is more complex - this is a simplified version
     * @param {Vec4} target
     * @returns {this}
     */
    lookAt(target) {
        const direction = target.sub(this.worldPosition).normalize();
        // Simplified: rotate to align with direction
        // Full 4D lookAt would require specifying an "up" and "ana" vector
        const forward = new Vec4(0, 0, 1, 0);
        const dot = forward.dot(direction);
        if (Math.abs(dot) < 0.9999) {
            const angle = Math.acos(dot);
            // Use XZ and YZ planes for 3D-like rotation
            const rotX = Math.atan2(direction.y, direction.z);
            const rotY = Math.atan2(direction.x, direction.z);
            this._rotation = Rotor4D.fromEuler6(rotX, rotY, 0, 0, 0, 0);
            this._markLocalDirty();
        }
        return this;
    }

    // ==================== Internal ====================

    /**
     * Mark local matrix as dirty
     * @private
     */
    _markLocalDirty() {
        this._localDirty = true;
        this._markWorldDirty();
    }

    /**
     * Mark world matrix as dirty (cascades to children)
     * @private
     */
    _markWorldDirty() {
        this._worldDirty = true;
        for (const child of this._children) {
            child._markWorldDirty();
        }
    }

    /**
     * Update local transform matrix
     * @private
     */
    _updateLocalMatrix() {
        // Start with identity
        this._localMatrix = Mat4x4.identity();

        // Apply scale
        const scaleMatrix = Mat4x4.identity();
        scaleMatrix.set(0, 0, this._scale.x);
        scaleMatrix.set(1, 1, this._scale.y);
        scaleMatrix.set(2, 2, this._scale.z);
        scaleMatrix.set(3, 3, this._scale.w);

        // Apply rotation (toMatrix returns Float32Array, wrap in Mat4x4)
        const rotationMatrix = new Mat4x4(this._rotation.toMatrix());

        // Apply translation (in 4D, translation is stored in last column, keep [3,3]=1)
        const translationMatrix = Mat4x4.identity();
        translationMatrix.set(0, 3, this._position.x);
        translationMatrix.set(1, 3, this._position.y);
        translationMatrix.set(2, 3, this._position.z);
        // Note: position.w is the 4th spatial coordinate, handled separately
        // Matrix[3,3] must remain 1 for proper transformation

        // Compose: T * R * S
        this._localMatrix = translationMatrix.multiply(rotationMatrix).multiply(scaleMatrix);
        this._localDirty = false;
    }

    /**
     * Update world transform matrix
     * @private
     */
    _updateWorldMatrix() {
        if (this._localDirty) {
            this._updateLocalMatrix();
        }

        if (this._parent) {
            this._worldMatrix = this._parent.worldMatrix.multiply(this._localMatrix);
        } else {
            this._worldMatrix = this._localMatrix.clone();
        }

        this._worldDirty = false;
    }

    // ==================== Traversal ====================

    /**
     * Traverse hierarchy depth-first
     * @param {function(Node4D): boolean|void} callback - Return false to stop
     * @returns {boolean} True if completed, false if stopped
     */
    traverse(callback) {
        if (callback(this) === false) return false;
        for (const child of this._children) {
            if (!child.traverse(callback)) return false;
        }
        return true;
    }

    /**
     * Traverse hierarchy breadth-first
     * @param {function(Node4D): boolean|void} callback
     * @returns {boolean}
     */
    traverseBreadthFirst(callback) {
        const queue = [this];
        while (queue.length > 0) {
            const node = queue.shift();
            if (callback(node) === false) return false;
            queue.push(...node._children);
        }
        return true;
    }

    /**
     * Traverse only visible nodes
     * @param {function(Node4D): void} callback
     */
    traverseVisible(callback) {
        if (!this.visible) return;
        callback(this);
        for (const child of this._children) {
            child.traverseVisible(callback);
        }
    }

    /**
     * Get all descendants as flat array
     * @returns {Node4D[]}
     */
    getDescendants() {
        const result = [];
        this.traverse(node => {
            if (node !== this) result.push(node);
        });
        return result;
    }

    // ==================== Lifecycle ====================

    /**
     * Clone this node (without children)
     * @returns {Node4D}
     */
    clone() {
        const cloned = new Node4D(this.name + '_clone');
        cloned._position = this._position.clone();
        cloned._rotation = this._rotation.clone();
        cloned._scale = this._scale.clone();
        cloned.visible = this.visible;
        cloned.enabled = this.enabled;
        cloned.tags = [...this.tags];
        cloned.layerMask = this.layerMask;
        return cloned;
    }

    /**
     * Clone this node with all descendants
     * @returns {Node4D}
     */
    cloneDeep() {
        const cloned = this.clone();
        for (const child of this._children) {
            cloned.addChild(child.cloneDeep());
        }
        return cloned;
    }

    /**
     * Dispose this node and remove from parent
     */
    dispose() {
        this.removeAllChildren();
        if (this._parent) {
            this._parent.removeChild(this);
        }
        this.userData.clear();
    }

    /**
     * Dispose this node and all descendants
     */
    disposeDeep() {
        for (const child of [...this._children]) {
            child.disposeDeep();
        }
        this.dispose();
    }

    // ==================== Serialization ====================

    /**
     * Serialize node to plain object
     * @returns {object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            position: [this._position.x, this._position.y, this._position.z, this._position.w],
            rotation: this._rotation.toArray(),
            scale: [this._scale.x, this._scale.y, this._scale.z, this._scale.w],
            visible: this.visible,
            enabled: this.enabled,
            tags: this.tags,
            layerMask: this.layerMask,
            children: this._children.map(c => c.toJSON())
        };
    }

    /**
     * Create node from plain object
     * @param {object} json
     * @returns {Node4D}
     */
    static fromJSON(json) {
        const node = new Node4D(json.name);
        node._position = new Vec4(...json.position);
        node._rotation = Rotor4D.fromArray(json.rotation);
        node._scale = new Vec4(...json.scale);
        node.visible = json.visible;
        node.enabled = json.enabled;
        node.tags = json.tags || [];
        node.layerMask = json.layerMask || 1;
        node._markLocalDirty();

        for (const childJson of (json.children || [])) {
            node.addChild(Node4D.fromJSON(childJson));
        }

        return node;
    }
}

export default Node4D;
