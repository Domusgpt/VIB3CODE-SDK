/**
 * SkeletalAnimator - GPU Skeletal Animation System
 * VIB3+ Hybrid Render Pipeline v2
 *
 * Joint hierarchy, bone matrix palette (uploaded as texture),
 * vertex skinning with up to 4 influences per vertex.
 * Morph targets + skeletal coexist (morph applied before skinning).
 *
 * Joint velocity feeds into InscriptionChannel for animation-reactive edges.
 */

export class SkeletalAnimator {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.maxJoints=128]
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxJoints = opts.maxJoints ?? 128;

        // Skeleton data
        this.joints = [];                   // Array of Joint
        this.inverseBindMatrices = null;    // Float32Array (maxJoints * 16)
        this.jointMatrices = new Float32Array(this.maxJoints * 16);
        this.jointVelocities = new Float32Array(this.maxJoints); // scalar speed per joint
        this._prevJointPositions = new Float32Array(this.maxJoints * 3);

        // Animations
        this.animations = new Map();        // name → AnimationClip
        this.activeClip = null;
        this.clipTime = 0;
        this.clipSpeed = 1.0;
        this.looping = true;

        // Blend state
        this.blendFrom = null;
        this.blendTo = null;
        this.blendWeight = 0;
        this.blendDuration = 0.3;
        this._blendElapsed = 0;

        // Bone palette texture (upload bone matrices to GPU as float texture)
        this._paletteTexture = null;
        this._paletteBuffer = new Float32Array(this.maxJoints * 16);
        this._initPaletteTexture();
    }

    // ─── Setup ───────────────────────────────────────────────────────

    /**
     * Set skeleton from glTF skin data
     * @param {object} skinData - { joints: number[], inverseBindMatrices: Float32Array }
     * @param {Array} nodes - glTF node array
     */
    setSkeleton(skinData, nodes) {
        this.joints = [];

        for (let i = 0; i < skinData.joints.length; i++) {
            const nodeIndex = skinData.joints[i];
            const node = nodes[nodeIndex];

            this.joints.push({
                nodeIndex,
                name: node.name || `joint_${i}`,
                children: node.children || [],
                localTranslation: new Float32Array(node.translation || [0, 0, 0]),
                localRotation: new Float32Array(node.rotation || [0, 0, 0, 1]),
                localScale: new Float32Array(node.scale || [1, 1, 1]),
                localMatrix: new Float32Array(16),
                worldMatrix: new Float32Array(16),
            });
        }

        // Copy inverse bind matrices
        if (skinData.inverseBindMatrices) {
            this.inverseBindMatrices = new Float32Array(skinData.inverseBindMatrices);
        } else {
            this.inverseBindMatrices = new Float32Array(this.maxJoints * 16);
            for (let i = 0; i < this.maxJoints; i++) {
                this.inverseBindMatrices[i * 16 + 0] = 1;
                this.inverseBindMatrices[i * 16 + 5] = 1;
                this.inverseBindMatrices[i * 16 + 10] = 1;
                this.inverseBindMatrices[i * 16 + 15] = 1;
            }
        }

        // Build node→joint index map
        this._nodeToJoint = new Map();
        for (let i = 0; i < skinData.joints.length; i++) {
            this._nodeToJoint.set(skinData.joints[i], i);
        }
    }

    /**
     * Add animation clip from glTF animation data
     * @param {object} animData - { name, channels: [{targetNode, targetPath, interpolation, times, values}], duration }
     */
    addAnimation(animData) {
        const clip = {
            name: animData.name,
            duration: animData.duration,
            channels: animData.channels.map(ch => ({
                jointIndex: this._nodeToJoint ? this._nodeToJoint.get(ch.targetNode) : ch.targetNode,
                path: ch.targetPath,
                interpolation: ch.interpolation,
                times: ch.times,
                values: ch.values,
            })),
        };
        this.animations.set(clip.name, clip);
    }

    /**
     * Play named animation
     * @param {string} name
     * @param {object} [opts]
     * @param {boolean} [opts.loop=true]
     * @param {number} [opts.speed=1]
     * @param {boolean} [opts.blend=true] - Cross-fade from current
     */
    play(name, opts = {}) {
        const clip = this.animations.get(name);
        if (!clip) return;

        if (opts.blend !== false && this.activeClip) {
            this.blendFrom = this.activeClip;
            this.blendTo = clip;
            this._blendElapsed = 0;
            this.blendDuration = opts.blendDuration ?? 0.3;
        }

        this.activeClip = clip;
        this.clipTime = 0;
        this.clipSpeed = opts.speed ?? 1.0;
        this.looping = opts.loop !== false;
    }

    // ─── Update ──────────────────────────────────────────────────────

    /**
     * Advance animation and compute joint matrices
     * @param {number} deltaTime - Seconds
     */
    update(deltaTime) {
        if (!this.activeClip) {
            this._updateIdentityPalette();
            return;
        }

        // Advance time
        this.clipTime += deltaTime * this.clipSpeed;
        if (this.clipTime >= this.activeClip.duration) {
            if (this.looping) {
                this.clipTime %= this.activeClip.duration;
            } else {
                this.clipTime = this.activeClip.duration;
            }
        }

        // Update blend
        if (this.blendFrom && this.blendTo) {
            this._blendElapsed += deltaTime;
            this.blendWeight = Math.min(this._blendElapsed / this.blendDuration, 1.0);
            if (this.blendWeight >= 1.0) {
                this.blendFrom = null;
                this.blendTo = null;
            }
        }

        // Sample animation → local transforms
        this._sampleAnimation(this.activeClip, this.clipTime);

        // Compute joint world matrices (hierarchy traversal)
        this._computeWorldMatrices();

        // Compute skinning matrices: jointMatrix = worldMatrix * inverseBindMatrix
        this._computeSkinningMatrices();

        // Compute joint velocities for inscription
        this._computeJointVelocities(deltaTime);

        // Upload to palette texture
        this._uploadPalette();
    }

    /**
     * Get average joint velocity (for InscriptionChannel)
     * @returns {number} Average speed across all joints
     */
    getAverageJointVelocity() {
        if (this.joints.length === 0) return 0;
        let sum = 0;
        for (let i = 0; i < this.joints.length; i++) sum += this.jointVelocities[i];
        return sum / this.joints.length;
    }

    /**
     * Get max joint velocity
     * @returns {number}
     */
    getMaxJointVelocity() {
        let max = 0;
        for (let i = 0; i < this.joints.length; i++) {
            if (this.jointVelocities[i] > max) max = this.jointVelocities[i];
        }
        return max;
    }

    /**
     * Get the bone palette texture for shader binding
     * @returns {WebGLTexture}
     */
    getPaletteTexture() {
        return this._paletteTexture;
    }

    /**
     * @returns {number} Number of active joints
     */
    getJointCount() {
        return this.joints.length;
    }

    // ─── Skinning Shader Integration ─────────────────────────────────

    /**
     * Get GLSL snippet for vertex skinning
     * Insert into MeshRenderer vertex shader
     */
    static getSkinningSrc() {
        return `
// Skeletal animation uniforms
uniform sampler2D u_bonePalette;
uniform int u_jointCount;

// Per-vertex joint data
in vec4 a_joints;   // 4 joint indices
in vec4 a_weights;  // 4 joint weights

mat4 getBoneMatrix(int index) {
    // Each row of the palette texture stores one float4
    // 4 rows per matrix, texture width = 4
    int y = index;
    vec4 r0 = texelFetch(u_bonePalette, ivec2(0, y), 0);
    vec4 r1 = texelFetch(u_bonePalette, ivec2(1, y), 0);
    vec4 r2 = texelFetch(u_bonePalette, ivec2(2, y), 0);
    vec4 r3 = texelFetch(u_bonePalette, ivec2(3, y), 0);
    return mat4(r0, r1, r2, r3);
}

vec4 applySkinning(vec4 position) {
    if (u_jointCount == 0) return position;

    mat4 skin = a_weights.x * getBoneMatrix(int(a_joints.x))
              + a_weights.y * getBoneMatrix(int(a_joints.y))
              + a_weights.z * getBoneMatrix(int(a_joints.z))
              + a_weights.w * getBoneMatrix(int(a_joints.w));

    return skin * position;
}

vec3 applySkinningNormal(vec3 normal) {
    if (u_jointCount == 0) return normal;

    mat4 skin = a_weights.x * getBoneMatrix(int(a_joints.x))
              + a_weights.y * getBoneMatrix(int(a_joints.y))
              + a_weights.z * getBoneMatrix(int(a_joints.z))
              + a_weights.w * getBoneMatrix(int(a_joints.w));

    return normalize(mat3(skin) * normal);
}
`;
    }

    // ─── Internal ────────────────────────────────────────────────────

    _initPaletteTexture() {
        const gl = this.gl;
        this._paletteTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._paletteTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // 4 pixels wide (4 vec4 columns per matrix), maxJoints tall
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, this.maxJoints, 0, gl.RGBA, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    _uploadPalette() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this._paletteTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, this.joints.length || 1, gl.RGBA, gl.FLOAT, this._paletteBuffer);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    _updateIdentityPalette() {
        for (let i = 0; i < this.maxJoints; i++) {
            const o = i * 16;
            this._paletteBuffer.fill(0, o, o + 16);
            this._paletteBuffer[o + 0] = 1;
            this._paletteBuffer[o + 5] = 1;
            this._paletteBuffer[o + 10] = 1;
            this._paletteBuffer[o + 15] = 1;
        }
        this._uploadPalette();
    }

    _sampleAnimation(clip, time) {
        for (const channel of clip.channels) {
            if (channel.jointIndex === undefined || channel.jointIndex >= this.joints.length) continue;
            const joint = this.joints[channel.jointIndex];
            const value = this._interpolateChannel(channel, time);

            switch (channel.path) {
                case 'translation':
                    joint.localTranslation[0] = value[0];
                    joint.localTranslation[1] = value[1];
                    joint.localTranslation[2] = value[2];
                    break;
                case 'rotation':
                    joint.localRotation[0] = value[0];
                    joint.localRotation[1] = value[1];
                    joint.localRotation[2] = value[2];
                    joint.localRotation[3] = value[3];
                    break;
                case 'scale':
                    joint.localScale[0] = value[0];
                    joint.localScale[1] = value[1];
                    joint.localScale[2] = value[2];
                    break;
            }
        }
    }

    _interpolateChannel(channel, time) {
        const { times, values, interpolation, path } = channel;
        const compCount = path === 'rotation' ? 4 : 3;

        // Clamp to range
        if (time <= times[0]) return values.subarray(0, compCount);
        if (time >= times[times.length - 1]) {
            const last = (times.length - 1) * compCount;
            return values.subarray(last, last + compCount);
        }

        // Find keyframe pair
        let i = 0;
        while (i < times.length - 1 && times[i + 1] < time) i++;

        const t0 = times[i], t1 = times[i + 1];
        const alpha = (time - t0) / (t1 - t0);
        const o0 = i * compCount, o1 = (i + 1) * compCount;

        const result = new Float32Array(compCount);

        if (interpolation === 'STEP') {
            for (let c = 0; c < compCount; c++) result[c] = values[o0 + c];
        } else if (path === 'rotation') {
            // SLERP for quaternions
            this._slerp(result, values, o0, values, o1, alpha);
        } else {
            // LERP
            for (let c = 0; c < compCount; c++) {
                result[c] = values[o0 + c] * (1 - alpha) + values[o1 + c] * alpha;
            }
        }

        return result;
    }

    _slerp(out, a, aOff, b, bOff, t) {
        let ax = a[aOff], ay = a[aOff + 1], az = a[aOff + 2], aw = a[aOff + 3];
        let bx = b[bOff], by = b[bOff + 1], bz = b[bOff + 2], bw = b[bOff + 3];

        let dot = ax * bx + ay * by + az * bz + aw * bw;
        if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }

        let s0, s1;
        if (dot > 0.9999) {
            s0 = 1 - t; s1 = t;
        } else {
            const omega = Math.acos(dot);
            const sinOmega = Math.sin(omega);
            s0 = Math.sin((1 - t) * omega) / sinOmega;
            s1 = Math.sin(t * omega) / sinOmega;
        }

        out[0] = s0 * ax + s1 * bx;
        out[1] = s0 * ay + s1 * by;
        out[2] = s0 * az + s1 * bz;
        out[3] = s0 * aw + s1 * bw;
    }

    _computeWorldMatrices() {
        // Compute local matrices from TRS
        for (const joint of this.joints) {
            this._trsToMatrix(joint.localMatrix, joint.localTranslation, joint.localRotation, joint.localScale);
        }

        // Traverse hierarchy (assumes joints are in topological order from glTF)
        for (let i = 0; i < this.joints.length; i++) {
            const joint = this.joints[i];
            let hasParent = false;

            // Find parent joint
            for (let p = 0; p < i; p++) {
                if (this.joints[p].children.includes(joint.nodeIndex)) {
                    this._multiplyMat4(joint.worldMatrix, this.joints[p].worldMatrix, joint.localMatrix);
                    hasParent = true;
                    break;
                }
            }

            if (!hasParent) {
                joint.worldMatrix.set(joint.localMatrix);
            }
        }
    }

    _computeSkinningMatrices() {
        for (let i = 0; i < this.joints.length; i++) {
            const offset = i * 16;
            this._multiplyMat4(
                this._paletteBuffer.subarray(offset, offset + 16),
                this.joints[i].worldMatrix,
                this.inverseBindMatrices.subarray(offset, offset + 16)
            );
        }
    }

    _computeJointVelocities(dt) {
        if (dt <= 0) return;
        for (let i = 0; i < this.joints.length; i++) {
            const wm = this.joints[i].worldMatrix;
            const px = wm[12], py = wm[13], pz = wm[14];
            const o = i * 3;
            const dx = px - this._prevJointPositions[o];
            const dy = py - this._prevJointPositions[o + 1];
            const dz = pz - this._prevJointPositions[o + 2];
            this.jointVelocities[i] = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
            this._prevJointPositions[o] = px;
            this._prevJointPositions[o + 1] = py;
            this._prevJointPositions[o + 2] = pz;
        }
    }

    _trsToMatrix(out, t, r, s) {
        const x = r[0], y = r[1], z = r[2], w = r[3];
        const x2 = x + x, y2 = y + y, z2 = z + z;
        const xx = x * x2, xy = x * y2, xz = x * z2;
        const yy = y * y2, yz = y * z2, zz = z * z2;
        const wx = w * x2, wy = w * y2, wz = w * z2;

        out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
        out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
        out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
        out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
    }

    _multiplyMat4(out, a, b) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                out[i * 4 + j] =
                    a[0 * 4 + j] * b[i * 4 + 0] +
                    a[1 * 4 + j] * b[i * 4 + 1] +
                    a[2 * 4 + j] * b[i * 4 + 2] +
                    a[3 * 4 + j] * b[i * 4 + 3];
            }
        }
    }

    dispose() {
        if (this._paletteTexture) {
            this.gl.deleteTexture(this._paletteTexture);
            this._paletteTexture = null;
        }
    }
}
