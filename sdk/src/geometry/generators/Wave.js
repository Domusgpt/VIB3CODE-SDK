/**
 * Wave Geometry Generator
 *
 * Generates sinusoidal interference patterns in 4D space.
 * Models wave phenomena, standing waves, and interference patterns.
 */

import { Vec4 } from '../../math/Vec4.js';

/**
 * Generate 4D standing wave pattern
 * @param {number} amplitude - Wave amplitude
 * @param {number} frequency - Wave frequency
 * @param {number} segments - Resolution per axis
 * @returns {Vec4[]} Vertices
 */
export function generateStandingWave4D(amplitude = 0.5, frequency = 2, segments = 16) {
    const vertices = [];
    const step = (2 * Math.PI) / segments;

    for (let i = 0; i <= segments; i++) {
        const u = i * step;
        for (let j = 0; j <= segments; j++) {
            const v = j * step;
            for (let k = 0; k <= Math.floor(segments / 2); k++) {
                const t = (k / (segments / 2)) * Math.PI;

                // Standing wave in 4D
                const x = Math.cos(u);
                const y = Math.sin(u) * Math.cos(v);
                const z = Math.sin(u) * Math.sin(v) * Math.cos(t);
                const w = amplitude * Math.sin(frequency * u) *
                         Math.sin(frequency * v) *
                         Math.cos(frequency * t);

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    return vertices;
}

/**
 * Generate interference pattern from two 4D wave sources
 * @param {Vec4} source1 - First wave source position
 * @param {Vec4} source2 - Second wave source position
 * @param {number} wavelength - Wave wavelength
 * @param {number} gridSize - Sampling grid size
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices with W as amplitude
 */
export function generateInterferencePattern(
    source1 = new Vec4(-1, 0, 0, 0),
    source2 = new Vec4(1, 0, 0, 0),
    wavelength = 0.5,
    gridSize = 2,
    segments = 20
) {
    const vertices = [];
    const k = (2 * Math.PI) / wavelength;
    const step = (2 * gridSize) / segments;

    for (let i = 0; i <= segments; i++) {
        const x = -gridSize + i * step;
        for (let j = 0; j <= segments; j++) {
            const y = -gridSize + j * step;
            for (let l = 0; l <= Math.floor(segments / 2); l++) {
                const z = -gridSize / 2 + l * step;

                // Distance from each source
                const pos = new Vec4(x, y, z, 0);
                const d1 = pos.distanceTo(source1);
                const d2 = pos.distanceTo(source2);

                // Superposition of waves
                const wave1 = Math.sin(k * d1) / Math.max(d1, 0.1);
                const wave2 = Math.sin(k * d2) / Math.max(d2, 0.1);
                const amplitude = (wave1 + wave2) * 0.5;

                vertices.push(new Vec4(x, y, z, amplitude));
            }
        }
    }

    return vertices;
}

/**
 * Generate 4D ripple surface
 * @param {number} radius - Surface radius
 * @param {number} frequency - Ripple frequency
 * @param {number} decay - Amplitude decay rate
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices
 */
export function generateRippleSurface(radius = 2, frequency = 4, decay = 0.5, segments = 32) {
    const vertices = [];

    for (let i = 0; i <= segments; i++) {
        const u = (i / segments) * Math.PI * 2;
        for (let j = 0; j <= segments; j++) {
            const r = (j / segments) * radius;

            const x = r * Math.cos(u);
            const y = r * Math.sin(u);

            // Ripple in Z and W dimensions
            const ripple = Math.sin(frequency * r) * Math.exp(-decay * r);
            const z = ripple * 0.5;
            const w = ripple * Math.cos(u * 2) * 0.3;

            vertices.push(new Vec4(x, y, z, w));
        }
    }

    return vertices;
}

/**
 * Generate sinusoidal helix in 4D
 * @param {number} radius - Helix radius
 * @param {number} pitch - Helix pitch
 * @param {number} turns - Number of turns
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices
 */
export function generateWaveHelix4D(radius = 1, pitch = 0.5, turns = 3, segments = 100) {
    const vertices = [];
    const totalAngle = turns * 2 * Math.PI;

    for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * totalAngle;

        const x = radius * Math.cos(t);
        const y = radius * Math.sin(t);
        const z = pitch * t / (2 * Math.PI);
        // W oscillates creating a 4D wave pattern
        const w = 0.3 * Math.sin(t * 3);

        vertices.push(new Vec4(x, y, z, w));
    }

    return vertices;
}

/**
 * Generate plane wave in 4D
 * @param {Vec4} direction - Wave propagation direction (normalized)
 * @param {number} wavelength - Wavelength
 * @param {number} amplitude - Wave amplitude
 * @param {number} gridSize - Sampling region size
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices
 */
export function generatePlaneWave4D(
    direction = new Vec4(1, 0, 0, 0).normalize(),
    wavelength = 1,
    amplitude = 0.5,
    gridSize = 2,
    segments = 16
) {
    const vertices = [];
    const k = (2 * Math.PI) / wavelength;
    const step = (2 * gridSize) / segments;

    for (let i = 0; i <= segments; i++) {
        const x = -gridSize + i * step;
        for (let j = 0; j <= segments; j++) {
            const y = -gridSize + j * step;
            for (let l = 0; l <= segments; l++) {
                const z = -gridSize + l * step;

                // Phase based on dot product with direction
                const pos = new Vec4(x, y, z, 0);
                const phase = k * pos.dot(direction);
                const w = amplitude * Math.sin(phase);

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    return vertices;
}

/**
 * Generate spherical wave emanating from origin in 4D
 * @param {number} maxRadius - Maximum radius
 * @param {number} frequency - Wave frequency
 * @param {number} segments - Resolution
 * @returns {Vec4[]} Vertices
 */
export function generateSphericalWave4D(maxRadius = 2, frequency = 3, segments = 24) {
    const vertices = [];

    // Use 4D spherical coordinates
    for (let i = 0; i <= segments; i++) {
        const phi1 = (i / segments) * Math.PI;
        for (let j = 0; j <= segments; j++) {
            const phi2 = (j / segments) * Math.PI;
            for (let k = 0; k <= segments * 2; k++) {
                const phi3 = (k / (segments * 2)) * Math.PI * 2;

                // Radius varies with wave
                const baseR = (i / segments) * maxRadius;
                const wave = 0.1 * Math.sin(frequency * baseR);
                const r = baseR + wave;

                // 4D hyperspherical coordinates
                const x = r * Math.sin(phi1) * Math.sin(phi2) * Math.cos(phi3);
                const y = r * Math.sin(phi1) * Math.sin(phi2) * Math.sin(phi3);
                const z = r * Math.sin(phi1) * Math.cos(phi2);
                const w = r * Math.cos(phi1);

                vertices.push(new Vec4(x, y, z, w));
            }
        }
    }

    return vertices;
}

/**
 * Generate wave edges (connect sequential points)
 * @param {Vec4[]} vertices
 * @param {number} stride - Connection stride
 * @returns {number[][]} Edge pairs
 */
export function generateWaveEdges(vertices, stride = 1) {
    const edges = [];

    for (let i = 0; i < vertices.length - stride; i += stride) {
        edges.push([i, i + stride]);
    }

    return edges;
}

/**
 * Generate grid edges for wave surface
 * @param {number} uSegments
 * @param {number} vSegments
 * @returns {number[][]} Edge pairs
 */
export function generateWaveGridEdges(uSegments, vSegments) {
    const edges = [];

    for (let i = 0; i < uSegments; i++) {
        for (let j = 0; j < vSegments; j++) {
            const idx = i * (vSegments + 1) + j;
            const nextU = (i + 1) * (vSegments + 1) + j;
            const nextV = i * (vSegments + 1) + j + 1;

            if (i < uSegments - 1) edges.push([idx, nextU]);
            if (j < vSegments) edges.push([idx, nextV]);
        }
    }

    return edges;
}

/**
 * Generate complete wave geometry
 * @param {string} type - 'standing', 'interference', 'ripple', 'helix', 'plane', 'spherical'
 * @param {object} params - Type-specific parameters
 * @returns {object} Geometry
 */
export function generateWave(type = 'standing', params = {}) {
    const {
        amplitude = 0.5,
        frequency = 2,
        segments = 16,
        radius = 1
    } = params;

    let vertices, edges;

    switch (type) {
        case 'standing':
            vertices = generateStandingWave4D(amplitude, frequency, segments);
            edges = generateWaveEdges(vertices);
            break;

        case 'interference':
            vertices = generateInterferencePattern(
                params.source1,
                params.source2,
                params.wavelength || 0.5,
                params.gridSize || 2,
                segments
            );
            edges = generateWaveEdges(vertices);
            break;

        case 'ripple':
            vertices = generateRippleSurface(radius, frequency, params.decay || 0.5, segments);
            edges = generateWaveGridEdges(segments, segments);
            break;

        case 'helix':
            vertices = generateWaveHelix4D(radius, params.pitch || 0.5, params.turns || 3, segments * 6);
            edges = generateWaveEdges(vertices);
            break;

        case 'plane':
            vertices = generatePlaneWave4D(
                params.direction,
                params.wavelength || 1,
                amplitude,
                params.gridSize || 2,
                segments
            );
            edges = [];
            break;

        case 'spherical':
            vertices = generateSphericalWave4D(radius, frequency, Math.floor(segments / 2));
            edges = [];
            break;

        default:
            vertices = generateStandingWave4D(amplitude, frequency, segments);
            edges = generateWaveEdges(vertices);
    }

    return {
        name: `wave_${type}`,
        vertices,
        edges,
        faces: [],
        vertexCount: vertices.length,
        edgeCount: edges.length,
        faceCount: 0,
        waveType: type,
        frequency,
        amplitude
    };
}

export default generateWave;
