/**
 * CommandBuffer - Batches and sorts render commands
 *
 * Provides deferred command execution with sorting capabilities:
 * - State-based sorting to minimize GPU state changes
 * - Depth sorting for correct transparency rendering
 * - Priority-based ordering for clear/setup commands
 */

import { RenderCommand, CommandType } from './RenderCommand.js';

/**
 * Sort modes for command ordering
 */
export const SortMode = {
    /** No sorting, execute in submission order */
    NONE: 'none',

    /** Sort by priority then state key */
    STATE: 'state',

    /** Sort by depth (front-to-back for opaque) */
    FRONT_TO_BACK: 'front_to_back',

    /** Sort by depth (back-to-front for transparent) */
    BACK_TO_FRONT: 'back_to_front',

    /** Custom comparator function */
    CUSTOM: 'custom'
};

/**
 * CommandBuffer class
 */
export class CommandBuffer {
    /**
     * @param {object} [options]
     */
    constructor(options = {}) {
        /** @type {RenderCommand[]} Command queue */
        this._commands = [];

        /** @type {string} Sort mode */
        this.sortMode = options.sortMode || SortMode.STATE;

        /** @type {function|null} Custom sort comparator */
        this.customComparator = options.customComparator || null;

        /** @type {boolean} Whether buffer is currently recording */
        this._recording = false;

        /** @type {boolean} Whether buffer has been sorted */
        this._sorted = false;

        /** @type {string|null} Debug label */
        this.label = options.label || null;

        /** @type {object} Statistics */
        this._stats = {
            commandCount: 0,
            drawCalls: 0,
            stateChanges: 0,
            triangles: 0
        };
    }

    /**
     * Begin recording commands
     * @returns {this}
     */
    begin() {
        this._commands = [];
        this._recording = true;
        this._sorted = false;
        this._resetStats();
        return this;
    }

    /**
     * End recording
     * @returns {this}
     */
    end() {
        this._recording = false;
        return this;
    }

    /**
     * Add a command to the buffer
     * @param {RenderCommand} command
     * @returns {this}
     */
    add(command) {
        if (!this._recording) {
            console.warn('CommandBuffer: Adding command while not recording');
        }

        this._commands.push(command);
        this._sorted = false;
        this._updateStats(command);

        return this;
    }

    /**
     * Add multiple commands
     * @param {RenderCommand[]} commands
     * @returns {this}
     */
    addAll(commands) {
        for (const cmd of commands) {
            this.add(cmd);
        }
        return this;
    }

    /**
     * Sort commands according to sort mode
     * @returns {this}
     */
    sort() {
        if (this._sorted) return this;

        switch (this.sortMode) {
            case SortMode.NONE:
                // No sorting
                break;

            case SortMode.STATE:
                this._sortByState();
                break;

            case SortMode.FRONT_TO_BACK:
                this._sortByDepth(false);
                break;

            case SortMode.BACK_TO_FRONT:
                this._sortByDepth(true);
                break;

            case SortMode.CUSTOM:
                if (this.customComparator) {
                    this._commands.sort(this.customComparator);
                }
                break;
        }

        this._sorted = true;
        return this;
    }

    /**
     * Sort by priority and state key
     * @private
     */
    _sortByState() {
        this._commands.sort((a, b) => {
            // First by priority (higher first)
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }

            // Then by sort key (for state grouping)
            return a.sortKey - b.sortKey;
        });
    }

    /**
     * Sort by depth
     * @param {boolean} backToFront
     * @private
     */
    _sortByDepth(backToFront) {
        // Separate draw commands from others
        const draws = [];
        const others = [];

        for (const cmd of this._commands) {
            if (this._isDrawCommand(cmd)) {
                draws.push(cmd);
            } else {
                others.push(cmd);
            }
        }

        // Sort draw commands by depth
        draws.sort((a, b) => {
            const depthA = a.depth || 0;
            const depthB = b.depth || 0;
            return backToFront ? depthB - depthA : depthA - depthB;
        });

        // Sort others by priority
        others.sort((a, b) => b.priority - a.priority);

        // Recombine: others first, then draws
        this._commands = [...others, ...draws];
    }

    /**
     * Check if command is a draw command
     * @private
     */
    _isDrawCommand(cmd) {
        return cmd.type === CommandType.DRAW ||
            cmd.type === CommandType.DRAW_INDEXED ||
            cmd.type === CommandType.DRAW_INSTANCED ||
            cmd.type === CommandType.DRAW_INDEXED_INSTANCED;
    }

    /**
     * Execute all commands
     * @param {object} backend - Rendering backend
     */
    execute(backend) {
        if (!this._sorted && this.sortMode !== SortMode.NONE) {
            this.sort();
        }

        for (const command of this._commands) {
            command.execute(backend);
        }
    }

    /**
     * Execute commands with profiling
     * @param {object} backend
     * @returns {object} Execution stats
     */
    executeWithProfiling(backend) {
        const startTime = performance.now();

        this.execute(backend);

        const endTime = performance.now();

        return {
            ...this._stats,
            executionTime: endTime - startTime
        };
    }

    /**
     * Get command count
     * @returns {number}
     */
    get length() {
        return this._commands.length;
    }

    /**
     * Get commands (read-only)
     * @returns {RenderCommand[]}
     */
    get commands() {
        return [...this._commands];
    }

    /**
     * Check if empty
     * @returns {boolean}
     */
    get isEmpty() {
        return this._commands.length === 0;
    }

    /**
     * Get statistics
     * @returns {object}
     */
    get stats() {
        return { ...this._stats };
    }

    /**
     * Clear the buffer
     * @returns {this}
     */
    clear() {
        this._commands = [];
        this._sorted = false;
        this._resetStats();
        return this;
    }

    /**
     * Reset statistics
     * @private
     */
    _resetStats() {
        this._stats = {
            commandCount: 0,
            drawCalls: 0,
            stateChanges: 0,
            triangles: 0
        };
    }

    /**
     * Update statistics for a command
     * @param {RenderCommand} command
     * @private
     */
    _updateStats(command) {
        this._stats.commandCount++;

        switch (command.type) {
            case CommandType.DRAW:
            case CommandType.DRAW_INDEXED:
                this._stats.drawCalls++;
                if (command.primitive === 'triangles') {
                    const count = command.vertexCount || command.indexCount || 0;
                    this._stats.triangles += Math.floor(count / 3);
                }
                break;

            case CommandType.DRAW_INSTANCED:
            case CommandType.DRAW_INDEXED_INSTANCED:
                this._stats.drawCalls++;
                if (command.primitive === 'triangles') {
                    const count = command.vertexCount || command.indexCount || 0;
                    const instances = command.instanceCount || 1;
                    this._stats.triangles += Math.floor(count / 3) * instances;
                }
                break;

            case CommandType.SET_STATE:
                this._stats.stateChanges++;
                break;
        }
    }

    /**
     * Merge another command buffer into this one
     * @param {CommandBuffer} other
     * @returns {this}
     */
    merge(other) {
        for (const cmd of other._commands) {
            this.add(cmd);
        }
        return this;
    }

    /**
     * Filter commands by type
     * @param {string} type
     * @returns {RenderCommand[]}
     */
    filterByType(type) {
        return this._commands.filter(cmd => cmd.type === type);
    }

    /**
     * Get draw commands only
     * @returns {RenderCommand[]}
     */
    getDrawCommands() {
        return this._commands.filter(cmd => this._isDrawCommand(cmd));
    }

    /**
     * Clone the buffer
     * @returns {CommandBuffer}
     */
    clone() {
        const buffer = new CommandBuffer({
            sortMode: this.sortMode,
            customComparator: this.customComparator,
            label: this.label
        });

        buffer._commands = [...this._commands];
        buffer._sorted = this._sorted;
        buffer._stats = { ...this._stats };

        return buffer;
    }
}

/**
 * CommandBufferPool - Reuses command buffers to reduce allocations
 */
export class CommandBufferPool {
    constructor(initialSize = 4) {
        /** @type {CommandBuffer[]} */
        this._available = [];

        /** @type {Set<CommandBuffer>} */
        this._inUse = new Set();

        // Pre-allocate
        for (let i = 0; i < initialSize; i++) {
            this._available.push(new CommandBuffer());
        }
    }

    /**
     * Acquire a command buffer
     * @param {object} [options]
     * @returns {CommandBuffer}
     */
    acquire(options = {}) {
        let buffer;

        if (this._available.length > 0) {
            buffer = this._available.pop();
            buffer.sortMode = options.sortMode || SortMode.STATE;
            buffer.customComparator = options.customComparator || null;
            buffer.label = options.label || null;
        } else {
            buffer = new CommandBuffer(options);
        }

        buffer.begin();
        this._inUse.add(buffer);
        return buffer;
    }

    /**
     * Release a command buffer back to pool
     * @param {CommandBuffer} buffer
     */
    release(buffer) {
        if (!this._inUse.has(buffer)) return;

        this._inUse.delete(buffer);
        buffer.clear();
        buffer.end();
        this._available.push(buffer);
    }

    /**
     * Release all in-use buffers
     */
    releaseAll() {
        for (const buffer of this._inUse) {
            buffer.clear();
            buffer.end();
            this._available.push(buffer);
        }
        this._inUse.clear();
    }

    /**
     * Get pool statistics
     * @returns {object}
     */
    getStats() {
        return {
            available: this._available.length,
            inUse: this._inUse.size
        };
    }
}

/**
 * Global command buffer pool
 */
export const commandBufferPool = new CommandBufferPool();

export default CommandBuffer;
