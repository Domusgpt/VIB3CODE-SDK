/**
 * Buffer Builder
 *
 * Converts geometry data into WebGL-compatible typed arrays.
 * Handles vertex buffers, index buffers, and interleaved formats.
 */

/**
 * Build a Float32Array vertex buffer from Vec4 vertices
 * @param {Vec4[]} vertices - Array of Vec4 vertices
 * @param {string} format - 'xyzw' (4 floats) or 'xyz' (3 floats, drops w)
 * @returns {Float32Array}
 */
export function buildVertexBuffer(vertices, format = 'xyzw') {
    const componentsPerVertex = format === 'xyz' ? 3 : 4;
    const buffer = new Float32Array(vertices.length * componentsPerVertex);

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const offset = i * componentsPerVertex;

        buffer[offset] = v.x;
        buffer[offset + 1] = v.y;
        buffer[offset + 2] = v.z;

        if (format === 'xyzw') {
            buffer[offset + 3] = v.w;
        }
    }

    return buffer;
}

/**
 * Build a Uint16Array or Uint32Array index buffer from edges
 * @param {number[][]} edges - Array of [start, end] index pairs
 * @param {boolean} use32Bit - Use Uint32Array instead of Uint16Array
 * @returns {Uint16Array|Uint32Array}
 */
export function buildEdgeIndexBuffer(edges, use32Bit = false) {
    const ArrayType = use32Bit ? Uint32Array : Uint16Array;
    const buffer = new ArrayType(edges.length * 2);

    for (let i = 0; i < edges.length; i++) {
        buffer[i * 2] = edges[i][0];
        buffer[i * 2 + 1] = edges[i][1];
    }

    return buffer;
}

/**
 * Build triangle index buffer from faces
 * @param {number[][]} faces - Array of face vertex indices (triangles or quads)
 * @param {boolean} use32Bit - Use Uint32Array
 * @returns {Uint16Array|Uint32Array}
 */
export function buildFaceIndexBuffer(faces, use32Bit = false) {
    const triangles = [];

    for (const face of faces) {
        if (face.length === 3) {
            // Triangle
            triangles.push(face[0], face[1], face[2]);
        } else if (face.length === 4) {
            // Quad - split into 2 triangles
            triangles.push(face[0], face[1], face[2]);
            triangles.push(face[0], face[2], face[3]);
        } else if (face.length > 4) {
            // Polygon - fan triangulation
            for (let i = 1; i < face.length - 1; i++) {
                triangles.push(face[0], face[i], face[i + 1]);
            }
        }
    }

    const ArrayType = use32Bit ? Uint32Array : Uint16Array;
    return new ArrayType(triangles);
}

/**
 * Build interleaved vertex buffer with position and color
 * @param {Vec4[]} vertices - Vertex positions
 * @param {number[][]} colors - RGBA colors per vertex (or single color)
 * @param {string} format - Position format ('xyzw' or 'xyz')
 * @returns {Float32Array}
 */
export function buildInterleavedBuffer(vertices, colors, format = 'xyzw') {
    const posComponents = format === 'xyz' ? 3 : 4;
    const colorComponents = 4; // RGBA
    const stride = posComponents + colorComponents;
    const buffer = new Float32Array(vertices.length * stride);

    const singleColor = colors.length === 1 || colors.length === 4;

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const offset = i * stride;

        // Position
        buffer[offset] = v.x;
        buffer[offset + 1] = v.y;
        buffer[offset + 2] = v.z;
        if (posComponents === 4) {
            buffer[offset + 3] = v.w;
        }

        // Color
        const colorOffset = offset + posComponents;
        if (singleColor) {
            const c = colors.length === 4 ? colors : colors[0];
            buffer[colorOffset] = c[0];
            buffer[colorOffset + 1] = c[1];
            buffer[colorOffset + 2] = c[2];
            buffer[colorOffset + 3] = c[3];
        } else {
            const c = colors[i] || [1, 1, 1, 1];
            buffer[colorOffset] = c[0];
            buffer[colorOffset + 1] = c[1];
            buffer[colorOffset + 2] = c[2];
            buffer[colorOffset + 3] = c[3];
        }
    }

    return buffer;
}

/**
 * Build normal vectors from vertex data (for lighting)
 * @param {Vec4[]} vertices - Vertex positions
 * @param {number[][]} faces - Face indices
 * @returns {Float32Array} Normal vectors (x, y, z per vertex)
 */
export function buildNormalBuffer(vertices, faces) {
    // Initialize normals to zero
    const normals = new Float32Array(vertices.length * 3);

    // Accumulate face normals to vertices
    for (const face of faces) {
        if (face.length < 3) continue;

        const v0 = vertices[face[0]];
        const v1 = vertices[face[1]];
        const v2 = vertices[face[2]];

        // Compute face normal (cross product of edges)
        const e1x = v1.x - v0.x;
        const e1y = v1.y - v0.y;
        const e1z = v1.z - v0.z;

        const e2x = v2.x - v0.x;
        const e2y = v2.y - v0.y;
        const e2z = v2.z - v0.z;

        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        // Add to all vertices of face
        for (const idx of face) {
            normals[idx * 3] += nx;
            normals[idx * 3 + 1] += ny;
            normals[idx * 3 + 2] += nz;
        }
    }

    // Normalize all normals
    for (let i = 0; i < vertices.length; i++) {
        const offset = i * 3;
        const len = Math.sqrt(
            normals[offset] * normals[offset] +
            normals[offset + 1] * normals[offset + 1] +
            normals[offset + 2] * normals[offset + 2]
        );

        if (len > 0.0001) {
            normals[offset] /= len;
            normals[offset + 1] /= len;
            normals[offset + 2] /= len;
        }
    }

    return normals;
}

/**
 * Generate colors based on W coordinate (4D depth)
 * @param {Vec4[]} vertices - Vertex positions
 * @param {object} colorMap - Color mapping options
 * @returns {number[][]} RGBA colors per vertex
 */
export function generateWDepthColors(vertices, colorMap = {}) {
    const {
        nearColor = [1, 0.2, 0.2, 1],  // Red for w > 0
        farColor = [0.2, 0.2, 1, 1],   // Blue for w < 0
        midColor = [0.2, 1, 0.2, 1],   // Green for w = 0
        range = 2
    } = colorMap;

    return vertices.map(v => {
        const t = (v.w / range + 1) / 2; // Normalize to 0-1

        if (t > 0.5) {
            // Blend mid to near
            const blend = (t - 0.5) * 2;
            return [
                midColor[0] + (nearColor[0] - midColor[0]) * blend,
                midColor[1] + (nearColor[1] - midColor[1]) * blend,
                midColor[2] + (nearColor[2] - midColor[2]) * blend,
                1
            ];
        } else {
            // Blend far to mid
            const blend = t * 2;
            return [
                farColor[0] + (midColor[0] - farColor[0]) * blend,
                farColor[1] + (midColor[1] - farColor[1]) * blend,
                farColor[2] + (midColor[2] - farColor[2]) * blend,
                1
            ];
        }
    });
}

/**
 * Generate colors based on vertex index (rainbow)
 * @param {number} vertexCount - Number of vertices
 * @param {number} saturation - Color saturation (0-1)
 * @param {number} lightness - Color lightness (0-1)
 * @returns {number[][]} RGBA colors per vertex
 */
export function generateRainbowColors(vertexCount, saturation = 1, lightness = 0.5) {
    const colors = [];

    for (let i = 0; i < vertexCount; i++) {
        const hue = (i / vertexCount) * 360;
        const rgb = hslToRgb(hue, saturation, lightness);
        colors.push([rgb[0], rgb[1], rgb[2], 1]);
    }

    return colors;
}

/**
 * HSL to RGB conversion
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {number[]} RGB values (0-1)
 */
function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r, g, b;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return [r + m, g + m, b + m];
}

/**
 * Build complete WebGL-ready geometry buffers
 * @param {object} geometry - Geometry with vertices, edges, faces
 * @param {object} options - Buffer options
 * @returns {object} WebGL buffer data
 */
export function buildGeometryBuffers(geometry, options = {}) {
    const {
        format = 'xyzw',
        includeNormals = false,
        includeColors = true,
        colorMode = 'wDepth', // 'wDepth', 'rainbow', 'uniform'
        uniformColor = [1, 1, 1, 1],
        use32BitIndices = false
    } = options;

    const result = {
        vertices: buildVertexBuffer(geometry.vertices, format),
        vertexCount: geometry.vertices.length,
        stride: format === 'xyz' ? 3 : 4
    };

    // Edge indices
    if (geometry.edges && geometry.edges.length > 0) {
        result.edgeIndices = buildEdgeIndexBuffer(geometry.edges, use32BitIndices);
        result.edgeCount = geometry.edges.length;
    }

    // Face indices
    if (geometry.faces && geometry.faces.length > 0) {
        result.faceIndices = buildFaceIndexBuffer(geometry.faces, use32BitIndices);
        result.faceCount = geometry.faces.length;
    }

    // Normals
    if (includeNormals && geometry.faces) {
        result.normals = buildNormalBuffer(geometry.vertices, geometry.faces);
    }

    // Colors
    if (includeColors) {
        let colors;
        switch (colorMode) {
            case 'wDepth':
                colors = generateWDepthColors(geometry.vertices);
                break;
            case 'rainbow':
                colors = generateRainbowColors(geometry.vertices.length);
                break;
            case 'uniform':
            default:
                colors = [uniformColor];
                break;
        }

        result.colors = new Float32Array(geometry.vertices.length * 4);
        const singleColor = colors.length === 1;

        for (let i = 0; i < geometry.vertices.length; i++) {
            const c = singleColor ? colors[0] : colors[i];
            result.colors[i * 4] = c[0];
            result.colors[i * 4 + 1] = c[1];
            result.colors[i * 4 + 2] = c[2];
            result.colors[i * 4 + 3] = c[3];
        }
    }

    return result;
}

export default buildGeometryBuffers;
