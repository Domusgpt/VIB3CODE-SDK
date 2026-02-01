/**
 * InscriptionTexture - Texture-Based Inscription Patterns
 * VIB3+ Hybrid Render Pipeline v2
 *
 * User-supplied textures as inscription source: logos, text, circuit patterns, artistic masks.
 * Blends procedural VIB3 patterns with texture patterns per-layer.
 * UV mapping: screen-space, object-space (from GBuffer), or cylindrical/spherical projection.
 */

export class InscriptionTexture {
    /**
     * @param {WebGL2RenderingContext} gl
     * @param {object} [opts]
     * @param {number} [opts.maxTextures=8] - Maximum texture slots
     */
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.maxTextures = opts.maxTextures ?? 8;

        // Texture slots: layer index → texture config
        this._textures = new Map();
        this._glTextures = new Map();
    }

    /**
     * Load and assign a texture to an inscription layer
     * @param {number} layerIndex - Inscription layer (0-15)
     * @param {HTMLImageElement|ImageData|HTMLCanvasElement} source - Texture source
     * @param {object} [opts]
     * @param {string} [opts.uvMode='screen'] - 'screen', 'object', 'cylindrical', 'spherical'
     * @param {number} [opts.blend=0.5] - Blend factor (0=procedural, 1=texture)
     * @param {number} [opts.tileX=1] - Horizontal tiling
     * @param {number} [opts.tileY=1] - Vertical tiling
     * @param {number} [opts.offsetX=0] - UV offset X
     * @param {number} [opts.offsetY=0] - UV offset Y
     * @param {number} [opts.rotation=0] - UV rotation (radians)
     * @param {string} [opts.channel='r'] - Which channel to use: 'r', 'g', 'b', 'a', 'luminance'
     * @param {boolean} [opts.invert=false] - Invert the pattern
     */
    setLayerTexture(layerIndex, source, opts = {}) {
        const gl = this.gl;

        // Create GL texture
        let glTex = this._glTextures.get(layerIndex);
        if (!glTex) {
            glTex = gl.createTexture();
            this._glTextures.set(layerIndex, glTex);
        }

        gl.bindTexture(gl.TEXTURE_2D, glTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this._textures.set(layerIndex, {
            texture: glTex,
            uvMode: opts.uvMode ?? 'screen',
            blend: opts.blend ?? 0.5,
            tileX: opts.tileX ?? 1,
            tileY: opts.tileY ?? 1,
            offsetX: opts.offsetX ?? 0,
            offsetY: opts.offsetY ?? 0,
            rotation: opts.rotation ?? 0,
            channel: opts.channel ?? 'r',
            invert: opts.invert ?? false,
            width: source.width || source.naturalWidth,
            height: source.height || source.naturalHeight,
        });
    }

    /**
     * Load texture from URL
     * @param {number} layerIndex
     * @param {string} url
     * @param {object} [opts]
     * @returns {Promise<void>}
     */
    async loadLayerTexture(layerIndex, url, opts = {}) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.setLayerTexture(layerIndex, img, opts);
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    /**
     * Create a text inscription texture
     * @param {number} layerIndex
     * @param {string} text
     * @param {object} [opts]
     * @param {string} [opts.font='32px monospace']
     * @param {string} [opts.color='white']
     * @param {number} [opts.canvasSize=512]
     */
    setLayerText(layerIndex, text, opts = {}) {
        const size = opts.canvasSize ?? 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = opts.color ?? 'white';
        ctx.font = opts.font ?? '32px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word wrap
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        const maxWidth = size * 0.8;

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);

        const lineHeight = parseInt(ctx.font) * 1.4;
        const startY = size / 2 - (lines.length - 1) * lineHeight / 2;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
        }

        this.setLayerTexture(layerIndex, canvas, { channel: 'luminance', ...opts });
    }

    /**
     * Create a procedural circuit pattern texture
     * @param {number} layerIndex
     * @param {object} [opts]
     */
    setLayerCircuitPattern(layerIndex, opts = {}) {
        const size = opts.canvasSize ?? 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;

        const gridSize = opts.gridSize ?? 32;
        const seed = opts.seed ?? 42;
        let rng = seed;
        const rand = () => { rng = (rng * 1664525 + 1013904223) & 0xFFFFFFFF; return (rng >>> 0) / 0xFFFFFFFF; };

        // Draw grid lines with random breaks
        for (let x = 0; x < size; x += gridSize) {
            let drawing = rand() > 0.3;
            for (let y = 0; y < size; y += gridSize) {
                if (rand() > 0.6) drawing = !drawing;
                if (drawing) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    if (rand() > 0.5) {
                        ctx.lineTo(x + gridSize, y);
                    } else {
                        ctx.lineTo(x, y + gridSize);
                    }
                    ctx.stroke();
                }

                // Random dots at intersections
                if (rand() > 0.7) {
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                }
            }
        }

        this.setLayerTexture(layerIndex, canvas, { channel: 'luminance', ...opts });
    }

    /**
     * Remove texture from layer
     * @param {number} layerIndex
     */
    removeLayerTexture(layerIndex) {
        const glTex = this._glTextures.get(layerIndex);
        if (glTex) {
            this.gl.deleteTexture(glTex);
            this._glTextures.delete(layerIndex);
        }
        this._textures.delete(layerIndex);
    }

    /**
     * Get texture config for a layer (null if no texture)
     * @param {number} layerIndex
     * @returns {object|null}
     */
    getLayerConfig(layerIndex) {
        return this._textures.get(layerIndex) || null;
    }

    /**
     * Check if a layer has a texture
     * @param {number} layerIndex
     * @returns {boolean}
     */
    hasTexture(layerIndex) {
        return this._textures.has(layerIndex);
    }

    /**
     * Bind texture for a layer to a texture unit
     * @param {number} layerIndex
     * @param {number} textureUnit - GL texture unit index
     * @returns {boolean} True if texture was bound
     */
    bind(layerIndex, textureUnit) {
        const config = this._textures.get(layerIndex);
        if (!config) return false;

        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, config.texture);
        return true;
    }

    /**
     * Get GLSL code for texture-based inscription sampling
     * @returns {string}
     */
    static getShaderSrc() {
        return `
// Inscription texture uniforms
uniform sampler2D u_inscriptionTex[8];
uniform int u_inscTexEnabled[8];        // 0=procedural only, 1=texture enabled
uniform float u_inscTexBlend[8];        // 0=procedural, 1=texture
uniform vec4 u_inscTexTransform[8];     // xy=tile, zw=offset
uniform float u_inscTexRotation[8];     // UV rotation angle
uniform int u_inscTexUVMode[8];         // 0=screen, 1=object, 2=cylindrical, 3=spherical
uniform int u_inscTexChannel[8];        // 0=r, 1=g, 2=b, 3=a, 4=luminance
uniform int u_inscTexInvert[8];         // 0=normal, 1=inverted

vec2 getInscriptionUV(int uvMode, vec2 screenUV, vec3 worldNormal, float objectID) {
    if (uvMode == 0) {
        // Screen-space
        return screenUV;
    } else if (uvMode == 1) {
        // Object-space (approximate from screen + objectID)
        float hash = fract(objectID * 127.1) * 6.28318;
        vec2 rotated = vec2(
            screenUV.x * cos(hash) - screenUV.y * sin(hash),
            screenUV.x * sin(hash) + screenUV.y * cos(hash)
        );
        return rotated;
    } else if (uvMode == 2) {
        // Cylindrical projection from normals
        float theta = atan(worldNormal.z, worldNormal.x);
        float phi = worldNormal.y * 0.5 + 0.5;
        return vec2(theta / 6.28318 + 0.5, phi);
    } else {
        // Spherical projection from normals
        float theta = atan(worldNormal.z, worldNormal.x);
        float phi = acos(clamp(worldNormal.y, -1.0, 1.0));
        return vec2(theta / 6.28318 + 0.5, phi / 3.14159);
    }
}

float sampleInscriptionTexture(int layerIndex, vec2 screenUV, vec3 worldNormal, float objectID) {
    if (layerIndex >= 8 || u_inscTexEnabled[layerIndex] == 0) return -1.0; // No texture

    vec2 uv = getInscriptionUV(u_inscTexUVMode[layerIndex], screenUV, worldNormal, objectID);

    // Apply transform (tile + offset)
    vec4 transform = u_inscTexTransform[layerIndex];
    uv = uv * transform.xy + transform.zw;

    // Apply rotation
    float angle = u_inscTexRotation[layerIndex];
    if (abs(angle) > 0.001) {
        vec2 center = vec2(0.5);
        uv -= center;
        float c = cos(angle), s = sin(angle);
        uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        uv += center;
    }

    vec4 texColor = texture(u_inscriptionTex[layerIndex], uv);

    // Channel selection
    float value;
    int ch = u_inscTexChannel[layerIndex];
    if (ch == 0) value = texColor.r;
    else if (ch == 1) value = texColor.g;
    else if (ch == 2) value = texColor.b;
    else if (ch == 3) value = texColor.a;
    else value = dot(texColor.rgb, vec3(0.299, 0.587, 0.114)); // luminance

    // Invert
    if (u_inscTexInvert[layerIndex] == 1) value = 1.0 - value;

    return value;
}

// Mix procedural and texture inscription
float blendInscription(float procedural, int layerIndex, vec2 screenUV, vec3 worldNormal, float objectID) {
    float texValue = sampleInscriptionTexture(layerIndex, screenUV, worldNormal, objectID);
    if (texValue < 0.0) return procedural; // No texture, pure procedural

    float blend = u_inscTexBlend[layerIndex];
    return mix(procedural, texValue, blend);
}
`;
    }

    dispose() {
        for (const [, tex] of this._glTextures) {
            this.gl.deleteTexture(tex);
        }
        this._glTextures.clear();
        this._textures.clear();
    }
}
