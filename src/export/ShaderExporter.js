/**
 * VIB3+ Shader Exporter
 * Exports REAL Quantum/Faceted/Holographic shaders to standalone HTML
 * With full reactivity support
 */

export class ShaderExporter {

    /**
     * Get the actual Quantum system fragment shader
     */
    static getQuantumShader() {
        return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
#else
    precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_geometry;
uniform float u_gridDensity;
uniform float u_morphFactor;
uniform float u_chaos;
uniform float u_speed;
uniform float u_hue;
uniform float u_intensity;
uniform float u_saturation;
uniform float u_dimension;
uniform float u_rot4dXY;
uniform float u_rot4dXZ;
uniform float u_rot4dYZ;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;
uniform float u_mouseIntensity;
uniform float u_clickIntensity;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;

mat4 rotateXY(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
mat4 rotateXZ(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
}
mat4 rotateYZ(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
}
mat4 rotateXW(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(c, 0, 0, -s, 0, 1, 0, 0, 0, 0, 1, 0, s, 0, 0, c);
}
mat4 rotateYW(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(1, 0, 0, 0, 0, c, 0, -s, 0, 0, 1, 0, 0, s, 0, c);
}
mat4 rotateZW(float theta) {
    float c = cos(theta); float s = sin(theta);
    return mat4(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, c, -s, 0, 0, s, c);
}

vec3 project4Dto3D(vec4 p) {
    float w = 2.5 / (2.5 + p.w);
    return vec3(p.x * w, p.y * w, p.z * w);
}

vec3 warpHypersphereCore(vec3 p, int geometryIndex) {
    float radius = length(p);
    float morphBlend = clamp(u_morphFactor * 0.6 + (u_dimension - 3.0) * 0.25, 0.0, 2.0);
    float w = sin(radius * (1.3 + float(geometryIndex) * 0.12) + u_time * 0.0008 * u_speed);
    w *= (0.4 + morphBlend * 0.45);
    vec4 p4d = vec4(p * (1.0 + morphBlend * 0.2), w);
    p4d = rotateXY(u_rot4dXY) * rotateXZ(u_rot4dXZ) * rotateYZ(u_rot4dYZ) *
          rotateXW(u_rot4dXW) * rotateYW(u_rot4dYW) * rotateZW(u_rot4dZW) * p4d;
    vec3 projected = project4Dto3D(p4d);
    return mix(p, projected, clamp(0.45 + morphBlend * 0.35, 0.0, 1.0));
}

vec3 warpHypertetraCore(vec3 p, int geometryIndex) {
    vec3 c1 = normalize(vec3(1.0, 1.0, 1.0));
    vec3 c2 = normalize(vec3(-1.0, -1.0, 1.0));
    vec3 c3 = normalize(vec3(-1.0, 1.0, -1.0));
    vec3 c4 = normalize(vec3(1.0, -1.0, -1.0));
    float morphBlend = clamp(u_morphFactor * 0.8 + (u_dimension - 3.0) * 0.2, 0.0, 2.0);
    float basisMix = dot(p, c1) * 0.14 + dot(p, c2) * 0.1 + dot(p, c3) * 0.08;
    float w = sin(basisMix * 5.5 + u_time * 0.0009 * u_speed) * cos(dot(p, c4) * 4.2 - u_time * 0.0007 * u_speed);
    w *= (0.5 + morphBlend * 0.4);
    vec3 offset = vec3(dot(p, c1), dot(p, c2), dot(p, c3)) * 0.1 * morphBlend;
    vec4 p4d = vec4(p + offset, w);
    p4d = rotateXY(u_rot4dXY) * rotateXZ(u_rot4dXZ) * rotateYZ(u_rot4dYZ) *
          rotateXW(u_rot4dXW) * rotateYW(u_rot4dYW) * rotateZW(u_rot4dZW) * p4d;
    vec3 projected = project4Dto3D(p4d);
    float planeInfluence = min(min(abs(dot(p, c1)), abs(dot(p, c2))), min(abs(dot(p, c3)), abs(dot(p, c4))));
    vec3 blended = mix(p, projected, clamp(0.45 + morphBlend * 0.35, 0.0, 1.0));
    return mix(blended, blended * (1.0 - planeInfluence * 0.55), 0.2 + morphBlend * 0.2);
}

vec3 applyCoreWarp(vec3 p, float geometryType) {
    float coreFloat = floor(geometryType / 8.0);
    int coreIndex = int(clamp(coreFloat, 0.0, 2.0));
    int geometryIndex = int(mod(geometryType, 8.0));
    if (coreIndex == 1) return warpHypersphereCore(p, geometryIndex);
    if (coreIndex == 2) return warpHypertetraCore(p, geometryIndex);
    return p;
}

float tetrahedronLattice(vec3 p, float gridSize) {
    vec3 q = fract(p * gridSize) - 0.5;
    float d1 = length(q);
    float d2 = length(q - vec3(0.4, 0.0, 0.0));
    float d3 = length(q - vec3(0.0, 0.4, 0.0));
    float d4 = length(q - vec3(0.0, 0.0, 0.4));
    float vertices = 1.0 - smoothstep(0.0, 0.04, min(min(d1, d2), min(d3, d4)));
    float edges = max(max(
        1.0 - smoothstep(0.0, 0.02, abs(length(q.xy) - 0.2)),
        1.0 - smoothstep(0.0, 0.02, abs(length(q.yz) - 0.2))),
        1.0 - smoothstep(0.0, 0.02, abs(length(q.xz) - 0.2)));
    return max(vertices, edges * 0.5);
}

float hypercubeLattice(vec3 p, float gridSize) {
    vec3 grid = fract(p * gridSize);
    vec3 edges = min(grid, 1.0 - grid);
    float minEdge = min(min(edges.x, edges.y), edges.z);
    float lattice = 1.0 - smoothstep(0.0, 0.03, minEdge);
    vec3 centers = abs(grid - 0.5);
    float maxCenter = max(max(centers.x, centers.y), centers.z);
    float vertices = 1.0 - smoothstep(0.45, 0.5, maxCenter);
    return max(lattice * 0.7, vertices);
}

float sphereLattice(vec3 p, float gridSize) {
    vec3 cell = fract(p * gridSize) - 0.5;
    float sphere = 1.0 - smoothstep(0.15, 0.25, length(cell));
    float ringRadius = length(cell.xy);
    float rings = max(
        1.0 - smoothstep(0.0, 0.02, abs(ringRadius - 0.3)),
        1.0 - smoothstep(0.0, 0.02, abs(ringRadius - 0.2)));
    return max(sphere, rings * 0.6);
}

float torusLattice(vec3 p, float gridSize) {
    vec3 cell = fract(p * gridSize) - 0.5;
    float toroidalDist = length(vec2(length(cell.xy) - 0.3, cell.z));
    return 1.0 - smoothstep(0.08, 0.12, toroidalDist);
}

float kleinLattice(vec3 p, float gridSize) {
    vec3 cell = fract(p * gridSize) - 0.5;
    float u = atan(cell.y, cell.x) / 3.14159 + 1.0;
    float x = (2.0 + cos(u * 0.5)) * cos(u);
    float y = (2.0 + cos(u * 0.5)) * sin(u);
    float z = sin(u * 0.5) + cell.z + 0.5;
    float dist = length(cell - vec3(x, y, z) * 0.1);
    return 1.0 - smoothstep(0.1, 0.15, dist);
}

float fractalLattice(vec3 p, float gridSize) {
    vec3 cell = fract(p * gridSize);
    cell = abs(cell * 2.0 - 1.0);
    float dist = length(max(abs(cell) - 0.3, 0.0));
    for(int i = 0; i < 3; i++) {
        cell = abs(cell * 2.0 - 1.0);
        float subdist = length(max(abs(cell) - 0.3, 0.0)) / pow(2.0, float(i + 1));
        dist = min(dist, subdist);
    }
    return 1.0 - smoothstep(0.0, 0.05, dist);
}

float waveLattice(vec3 p, float gridSize) {
    float time = u_time * 0.001 * u_speed;
    vec3 cell = fract(p * gridSize) - 0.5;
    float wave1 = sin(p.x * gridSize * 2.0 + time * 2.0);
    float wave2 = sin(p.y * gridSize * 1.8 + time * 1.5);
    float wave3 = sin(p.z * gridSize * 2.2 + time * 1.8);
    float interference = (wave1 + wave2 + wave3) / 3.0;
    float amplitude = 1.0 - length(cell) * 2.0;
    return max(0.0, interference * amplitude);
}

float crystalLattice(vec3 p, float gridSize) {
    vec3 cell = fract(p * gridSize) - 0.5;
    float crystal = max(max(abs(cell.x) + abs(cell.y), abs(cell.y) + abs(cell.z)), abs(cell.x) + abs(cell.z));
    crystal = 1.0 - smoothstep(0.3, 0.4, crystal);
    float faces = max(max(
        1.0 - smoothstep(0.0, 0.02, abs(abs(cell.x) - 0.35)),
        1.0 - smoothstep(0.0, 0.02, abs(abs(cell.y) - 0.35))),
        1.0 - smoothstep(0.0, 0.02, abs(abs(cell.z) - 0.35)));
    return max(crystal, faces * 0.5);
}

float geometryFunction(vec4 p) {
    int geomType = int(mod(u_geometry, 8.0));
    vec3 p3d = project4Dto3D(p);
    vec3 warped = applyCoreWarp(p3d, u_geometry);
    float gridSize = (u_gridDensity + u_bass * 40.0) * 0.08;

    if (geomType == 0) return tetrahedronLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 1) return hypercubeLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 2) return sphereLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 3) return torusLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 4) return kleinLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 5) return fractalLattice(warped, gridSize) * u_morphFactor;
    else if (geomType == 6) return waveLattice(warped, gridSize) * u_morphFactor;
    else return crystalLattice(warped, gridSize) * u_morphFactor;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / min(u_resolution.x, u_resolution.y);
    float timeSpeed = u_time * 0.0001 * u_speed;
    vec4 pos = vec4(uv * 3.0, sin(timeSpeed * 3.0), cos(timeSpeed * 2.0));
    pos.xy += (u_mouse - 0.5) * u_mouseIntensity * 2.0;

    pos = rotateXY(u_rot4dXY) * rotateXZ(u_rot4dXZ) * rotateYZ(u_rot4dYZ) *
          rotateXW(u_rot4dXW) * rotateYW(u_rot4dYW) * rotateZW(u_rot4dZW) * pos;

    float value = geometryFunction(pos);
    float noise = sin(pos.x * 7.0) * cos(pos.y * 11.0) * sin(pos.z * 13.0);
    value += noise * (u_chaos + u_high * 0.6);

    float geometryIntensity = 1.0 - clamp(abs(value * 0.8), 0.0, 1.0);
    geometryIntensity = pow(geometryIntensity, 1.5);
    geometryIntensity += u_clickIntensity * 0.3;

    float shimmer = sin(uv.x * 20.0 + timeSpeed * 5.0) * cos(uv.y * 15.0 + timeSpeed * 3.0) * 0.1;
    geometryIntensity += shimmer * geometryIntensity;

    float hueShift = u_hue / 360.0 + u_mid * 0.3;
    vec3 color = hsv2rgb(vec3(hueShift + value * 0.1, u_saturation, u_intensity));
    color *= geometryIntensity;

    gl_FragColor = vec4(color, geometryIntensity * u_intensity);
}`;
    }

    /**
     * Get the EXACT Faceted system fragment shader from FacetedCardGeneratorExact.js
     * This matches the original working VIB3+ engine at domusgpt.github.io/vib3-plus-engine
     */
    static getFacetedShader() {
        return `precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_geometry;
uniform float u_gridDensity;
uniform float u_morphFactor;
uniform float u_chaos;
uniform float u_speed;
uniform float u_hue;
uniform float u_intensity;
uniform float u_saturation;
uniform float u_dimension;
uniform float u_rot4dXW;
uniform float u_rot4dYW;
uniform float u_rot4dZW;
uniform float u_mouseIntensity;
uniform float u_clickIntensity;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;

// 4D rotation matrices
mat4 rotateXW(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat4(c, 0.0, 0.0, -s, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, s, 0.0, 0.0, c);
}

mat4 rotateYW(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat4(1.0, 0.0, 0.0, 0.0, 0.0, c, 0.0, -s, 0.0, 0.0, 1.0, 0.0, 0.0, s, 0.0, c);
}

mat4 rotateZW(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat4(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, c, -s, 0.0, 0.0, s, c);
}

vec3 project4Dto3D(vec4 p) {
    float w = 2.5 / (2.5 + p.w);
    return vec3(p.x * w, p.y * w, p.z * w);
}

// EXACT geometry functions from original VIB3+ Faceted system
float geometryFunction(vec4 p) {
    int geomType = int(mod(u_geometry, 8.0));
    float density = u_gridDensity * 0.08;

    if (geomType == 0) {
        // Tetrahedron lattice
        vec4 pos = fract(p * density);
        vec4 dist = min(pos, 1.0 - pos);
        return min(min(dist.x, dist.y), min(dist.z, dist.w)) * u_morphFactor;
    }
    else if (geomType == 1) {
        // Hypercube lattice
        vec4 pos = fract(p * density);
        vec4 dist = min(pos, 1.0 - pos);
        float minDist = min(min(dist.x, dist.y), min(dist.z, dist.w));
        return minDist * u_morphFactor;
    }
    else if (geomType == 2) {
        // Sphere lattice
        float r = length(p);
        float spheres = abs(fract(r * density) - 0.5) * 2.0;
        float theta = atan(p.y, p.x);
        float harmonics = sin(theta * 3.0) * 0.2;
        return (spheres + harmonics) * u_morphFactor;
    }
    else if (geomType == 3) {
        // Torus lattice
        float r1 = length(p.xy) - 2.0;
        float torus = length(vec2(r1, p.z)) - 0.8;
        float lattice = sin(p.x * density) * sin(p.y * density);
        return (torus + lattice * 0.3) * u_morphFactor;
    }
    else if (geomType == 4) {
        // Klein bottle lattice
        float u = atan(p.y, p.x);
        float v = atan(p.w, p.z);
        float dist = length(p) - 2.0;
        float lattice = sin(u * density) * sin(v * density);
        return (dist + lattice * 0.4) * u_morphFactor;
    }
    else if (geomType == 5) {
        // Fractal lattice
        vec4 pos = fract(p * density);
        pos = abs(pos * 2.0 - 1.0);
        float dist = length(max(abs(pos) - 1.0, 0.0));
        return dist * u_morphFactor;
    }
    else if (geomType == 6) {
        // Wave lattice
        float time = u_time * 0.001 * u_speed;
        float wave1 = sin(p.x * density + time);
        float wave2 = sin(p.y * density + time * 1.3);
        float wave3 = sin(p.z * density * 0.8 + time * 0.7);
        float interference = wave1 * wave2 * wave3;
        return interference * u_morphFactor;
    }
    else {
        // Crystal lattice (geomType == 7)
        vec4 pos = fract(p * density) - 0.5;
        float cube = max(max(abs(pos.x), abs(pos.y)), max(abs(pos.z), abs(pos.w)));
        return cube * u_morphFactor;
    }
}

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / min(u_resolution.x, u_resolution.y);

    // 4D position with time animation
    float timeSpeed = u_time * 0.0001 * u_speed;
    vec4 pos = vec4(uv * 3.0, sin(timeSpeed * 3.0), cos(timeSpeed * 2.0));
    pos.xy += (u_mouse - 0.5) * u_mouseIntensity * 2.0;

    // Apply 4D rotations with audio reactivity
    pos = rotateXW(u_rot4dXW + u_bass * 0.3) * pos;
    pos = rotateYW(u_rot4dYW + u_mid * 0.2) * pos;
    pos = rotateZW(u_rot4dZW + u_high * 0.25) * pos;

    // Calculate geometry value
    float value = geometryFunction(pos);

    // Apply chaos
    float noise = sin(pos.x * 7.0) * cos(pos.y * 11.0) * sin(pos.z * 13.0);
    value += noise * (u_chaos + u_high * 0.2);

    // Color based on geometry value and hue
    float geometryIntensity = 1.0 - clamp(abs(value), 0.0, 1.0);
    geometryIntensity += u_clickIntensity * 0.3;

    float finalIntensity = geometryIntensity * u_intensity;
    float hue = u_hue / 360.0 + value * 0.1 + u_mid * 0.1;

    // Create color with saturation control
    vec3 baseColor = vec3(
        sin(hue * 6.28318 + 0.0) * 0.5 + 0.5,
        sin(hue * 6.28318 + 2.0943) * 0.5 + 0.5,
        sin(hue * 6.28318 + 4.1887) * 0.5 + 0.5
    );

    // Apply saturation
    float gray = (baseColor.r + baseColor.g + baseColor.b) / 3.0;
    vec3 color = mix(vec3(gray), baseColor, u_saturation) * finalIntensity;

    gl_FragColor = vec4(color, finalIntensity * 0.9);
}`;
    }

    /**
     * Get the actual Holographic system fragment shader
     */
    static getHolographicShader() {
        return `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_geometry;
uniform float u_gridDensity;
uniform float u_morphFactor;
uniform float u_chaos;
uniform float u_speed;
uniform float u_hue;
uniform float u_intensity;
uniform float u_rot4dXY, u_rot4dXZ, u_rot4dYZ;
uniform float u_rot4dXW, u_rot4dYW, u_rot4dZW;
uniform float u_mouseIntensity;
uniform float u_clickIntensity;
uniform float u_bass, u_mid, u_high;

mat4 rotateXY(float t){float c=cos(t),s=sin(t);return mat4(c,-s,0,0,s,c,0,0,0,0,1,0,0,0,0,1);}
mat4 rotateXZ(float t){float c=cos(t),s=sin(t);return mat4(c,0,s,0,0,1,0,0,-s,0,c,0,0,0,0,1);}
mat4 rotateYZ(float t){float c=cos(t),s=sin(t);return mat4(1,0,0,0,0,c,-s,0,0,s,c,0,0,0,0,1);}
mat4 rotateXW(float t){float c=cos(t),s=sin(t);return mat4(c,0,0,-s,0,1,0,0,0,0,1,0,s,0,0,c);}
mat4 rotateYW(float t){float c=cos(t),s=sin(t);return mat4(1,0,0,0,0,c,0,-s,0,0,1,0,0,s,0,c);}
mat4 rotateZW(float t){float c=cos(t),s=sin(t);return mat4(1,0,0,0,0,1,0,0,0,0,c,-s,0,0,s,c);}

vec3 project4Dto3D(vec4 p) {
    float w = 2.5 / (2.5 + p.w);
    return vec3(p.x * w, p.y * w, p.z * w);
}

vec3 warpHypersphereCore(vec3 p, int gi) {
    float r = length(p);
    float morph = clamp(u_morphFactor * 0.6 + 0.3, 0.0, 2.0);
    float w = sin(r * (1.3 + float(gi) * 0.12) + u_time * 0.0008 * u_speed) * (0.4 + morph * 0.45);
    vec4 p4d = vec4(p * (1.0 + morph * 0.2), w);
    p4d = rotateXY(u_rot4dXY)*rotateXZ(u_rot4dXZ)*rotateYZ(u_rot4dYZ)*
          rotateXW(u_rot4dXW)*rotateYW(u_rot4dYW)*rotateZW(u_rot4dZW)*p4d;
    return mix(p, project4Dto3D(p4d), clamp(0.45 + morph * 0.35, 0.0, 1.0));
}

vec3 warpHypertetraCore(vec3 p, int gi) {
    vec3 c1=normalize(vec3(1,1,1)),c2=normalize(vec3(-1,-1,1)),c3=normalize(vec3(-1,1,-1)),c4=normalize(vec3(1,-1,-1));
    float morph = clamp(u_morphFactor * 0.8 + 0.2, 0.0, 2.0);
    float bm = dot(p,c1)*0.14+dot(p,c2)*0.1+dot(p,c3)*0.08;
    float w = sin(bm*5.5+u_time*0.0009*u_speed)*cos(dot(p,c4)*4.2-u_time*0.0007*u_speed)*(0.5+morph*0.4);
    vec3 off = vec3(dot(p,c1),dot(p,c2),dot(p,c3))*0.1*morph;
    vec4 p4d = vec4(p+off, w);
    p4d = rotateXY(u_rot4dXY)*rotateXZ(u_rot4dXZ)*rotateYZ(u_rot4dYZ)*
          rotateXW(u_rot4dXW)*rotateYW(u_rot4dYW)*rotateZW(u_rot4dZW)*p4d;
    vec3 proj = project4Dto3D(p4d);
    float pi = min(min(abs(dot(p,c1)),abs(dot(p,c2))),min(abs(dot(p,c3)),abs(dot(p,c4))));
    vec3 bl = mix(p, proj, clamp(0.45+morph*0.35,0.0,1.0));
    return mix(bl, bl*(1.0-pi*0.55), 0.2+morph*0.2);
}

vec3 applyCoreWarp(vec3 p, float gt) {
    int core = int(floor(gt/8.0));
    int gi = int(mod(gt, 8.0));
    if(core==1) return warpHypersphereCore(p, gi);
    if(core==2) return warpHypertetraCore(p, gi);
    return p;
}

float tetraLattice(vec3 p, float gs) {
    vec3 q = fract(p*gs)-0.5;
    float d1=length(q),d2=length(q-vec3(0.35,0,0)),d3=length(q-vec3(0,0.35,0)),d4=length(q-vec3(0,0,0.35));
    float verts = 1.0-smoothstep(0.0,0.03,min(min(d1,d2),min(d3,d4)));
    float shimmer = sin(u_time*0.002)*0.02;
    float edges = max(max(
        1.0-smoothstep(0.0,0.015,abs(length(q.xy)-(0.18+shimmer))),
        1.0-smoothstep(0.0,0.015,abs(length(q.yz)-(0.18+shimmer*0.8)))),
        1.0-smoothstep(0.0,0.015,abs(length(q.xz)-(0.18+shimmer*1.2))));
    float interf = sin(d1*25.0+u_time*0.003)*sin(d2*22.0+u_time*0.0025)*0.1;
    float vol = exp(-length(q)*3.0)*0.15;
    return max(verts, edges*0.7)+interf+vol;
}

float hyperLattice(vec3 p, float gs) {
    vec3 g = fract(p*gs), q = g-0.5;
    vec3 e = 1.0-smoothstep(0.0,0.025,abs(q));
    float wire = max(max(e.x,e.y),e.z);
    float verts = 0.0;
    for(int i=0;i<8;i++){
        float fi=float(i);
        vec3 c = vec3(mod(fi,2.0)-0.5,mod(floor(fi/2.0),2.0)-0.5,float(i/4)-0.5);
        verts = max(verts, 1.0-smoothstep(0.0,0.04,length(q-c*0.4)));
    }
    float interf = sin(length(q)*20.0+u_time*0.002)*0.08;
    float glow = exp(-length(q)*2.5)*0.12;
    return wire*0.8+verts+interf+glow;
}

float sphereLattice(vec3 p, float gs) {
    vec3 q = fract(p*gs)-0.5;
    return 1.0-smoothstep(0.2,0.5,length(q));
}

float torusLattice(vec3 p, float gs) {
    vec3 q = fract(p*gs)-0.5;
    float r1 = sqrt(q.x*q.x+q.y*q.y);
    float r2 = sqrt((r1-0.3)*(r1-0.3)+q.z*q.z);
    return 1.0-smoothstep(0.0,0.1,r2);
}

float kleinLattice(vec3 p, float gs) {
    vec3 q = fract(p*gs);
    float u = q.x*6.28318, v = q.y*6.28318;
    float x = cos(u)*(3.0+cos(u/2.0)*sin(v)-sin(u/2.0)*sin(2.0*v));
    return 1.0-smoothstep(0.0,0.05,abs(length(vec2(x,q.z))-0.1));
}

float fractalLattice(vec3 p, float gs) {
    vec3 q = p*gs;
    float scale = 1.0, fract_val = 0.0;
    for(int i=0;i<4;i++){
        q = fract(q)-0.5;
        fract_val += abs(length(q))/scale;
        scale *= 2.0;
        q *= 2.0;
    }
    return 1.0-smoothstep(0.0,1.0,fract_val);
}

float waveLattice(vec3 p, float gs) {
    vec3 q = p*gs;
    float wave = sin(q.x*2.0)*sin(q.y*2.0)*sin(q.z*2.0+u_time);
    return smoothstep(-0.5,0.5,wave);
}

float crystalLattice(vec3 p, float gs) {
    vec3 q = fract(p*gs)-0.5;
    float d = max(max(abs(q.x),abs(q.y)),abs(q.z));
    return 1.0-smoothstep(0.3,0.5,d);
}

float getDynamicGeometry(vec3 p, float gs, float gt) {
    vec3 w = applyCoreWarp(p, gt);
    int bg = int(mod(gt, 8.0));
    float var = floor(gt/8.0)/4.0;
    float vgs = gs*(0.5+var*1.5);
    if(bg==0) return tetraLattice(w,vgs);
    else if(bg==1) return hyperLattice(w,vgs);
    else if(bg==2) return sphereLattice(w,vgs);
    else if(bg==3) return torusLattice(w,vgs);
    else if(bg==4) return kleinLattice(w,vgs);
    else if(bg==5) return fractalLattice(w,vgs);
    else if(bg==6) return waveLattice(w,vgs);
    else return crystalLattice(w,vgs);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0,2.0/3.0,1.0/3.0,3.0);
    vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy/u_resolution.xy;
    float ar = u_resolution.x/u_resolution.y;
    uv.x *= ar;
    uv -= 0.5;

    float time = u_time*0.0004*u_speed;
    vec2 moff = (u_mouse-0.5)*u_mouseIntensity*0.25;

    vec4 p4d = vec4(uv+moff*0.1, sin(time*0.1)*0.15, cos(time*0.08)*0.15);
    p4d = rotateXY(u_rot4dXY+time*0.1)*rotateXZ(u_rot4dXZ+time*0.12)*rotateYZ(u_rot4dYZ+time*0.08)*
          rotateXW(u_rot4dXW+time*0.2+moff.y*0.5+u_bass*0.3)*
          rotateYW(u_rot4dYW+time*0.15+moff.x*0.5+u_mid*0.2)*
          rotateZW(u_rot4dZW+time*0.25+u_clickIntensity*0.3+u_high*0.4)*p4d;

    vec3 p = project4Dto3D(p4d);
    float density = u_gridDensity*(1.0+u_bass*0.5);
    float morphedGeo = u_geometry+u_morphFactor*3.0+u_mid*1.5;
    float lattice = getDynamicGeometry(p, density, morphedGeo);

    float hue = u_hue/360.0+u_mid*0.3;
    vec3 baseColor = hsv2rgb(vec3(hue, 0.8, u_intensity));
    vec3 color = baseColor*(0.2+lattice*0.8);

    vec3 shimmer1 = baseColor*lattice*0.5;
    vec3 shimmer2 = baseColor*sin(lattice*8.0+u_time*0.001)*0.2;
    color += shimmer1+shimmer2;
    color += vec3(lattice*0.6)*baseColor;

    float depth = 1.0-length(p)*0.3;
    color *= (0.7+depth*0.3);

    float moire = sin(uv.x*12.0)*sin(uv.y*14.0)*(u_chaos+u_high*0.4)*0.15;
    color += vec3(moire);

    float mouseDist = length(uv-(u_mouse-0.5)*vec2(ar,1.0));
    float mouseGlow = exp(-mouseDist*1.2)*u_mouseIntensity*0.25;
    float mouseRipple = sin(mouseDist*15.0-u_time*0.003)*exp(-mouseDist*2.0)*u_mouseIntensity*0.1;
    color += vec3(mouseGlow+mouseRipple)*baseColor*0.8;

    float clickPulse = u_clickIntensity*exp(-mouseDist*1.8)*0.4;
    color += vec3(clickPulse, clickPulse*0.6, clickPulse*1.2);

    gl_FragColor = vec4(color, 0.95);
}`;
    }

    /**
     * Export complete standalone HTML with real VIB3+ shader
     */
    static exportHTML(config) {
        const {
            name = 'VIB3+ Visualization',
            description = 'Exported VIB3+ 4D Visualization',
            system = 'quantum',
            geometry = 0,
            parameters = {},
            reactivity = {}
        } = config;

        // Select shader based on system
        let fragmentShader;
        switch(system) {
            case 'faceted':
                fragmentShader = this.getFacetedShader();
                break;
            case 'holographic':
                fragmentShader = this.getHolographicShader();
                break;
            case 'quantum':
            default:
                fragmentShader = this.getQuantumShader();
        }

        const vertexShader = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

        // Default parameters
        const params = {
            gridDensity: 15,
            morphFactor: 1.0,
            chaos: 0.2,
            speed: 1.0,
            hue: 200,
            intensity: 0.7,
            saturation: 0.8,
            dimension: 3.5,
            rot4dXY: 0,
            rot4dXZ: 0,
            rot4dYZ: 0,
            rot4dXW: 0,
            rot4dYW: 0,
            rot4dZW: 0,
            ...parameters
        };

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }
        canvas { display: block; width: 100vw; height: 100vh; }
        .info {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(0,0,0,0.8);
            border: 1px solid rgba(100,255,150,0.3);
            border-radius: 8px;
            padding: 15px 20px;
            color: #fff;
            font-size: 12px;
            backdrop-filter: blur(10px);
            max-width: 320px;
        }
        .info h3 { color: #64ff96; margin-bottom: 8px; font-size: 14px; }
        .info p { opacity: 0.8; line-height: 1.4; margin-bottom: 8px; }
        .info .meta { font-size: 10px; opacity: 0.6; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
        .audio-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.8);
            border: 1px solid rgba(100,255,150,0.3);
            border-radius: 8px;
            padding: 10px 15px;
            color: #64ff96;
            cursor: pointer;
            font-size: 12px;
        }
        .audio-btn:hover { background: rgba(100,255,150,0.2); }
    </style>
</head>
<body>
    <canvas id="vib3"></canvas>
    <div class="info">
        <h3>${name}</h3>
        <p>${description}</p>
        <div class="meta">
            System: ${system.toUpperCase()}<br>
            Geometry: ${geometry} (${geometry < 8 ? 'Base' : geometry < 16 ? 'Hypersphere' : 'Hypertetra'})<br>
            VIB3+ Export • ${new Date().toLocaleDateString()}
        </div>
    </div>
    <button class="audio-btn" onclick="toggleAudio()">🎵 Enable Audio</button>

    <script>
    // VIB3+ Exported Visualization
    // System: ${system}
    // Generated: ${new Date().toISOString()}

    const CONFIG = {
        system: '${system}',
        geometry: ${geometry},
        params: ${JSON.stringify(params, null, 2)},
        reactivity: ${JSON.stringify(reactivity, null, 2)}
    };

    const canvas = document.getElementById('vib3');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
        document.body.innerHTML = '<div style="color:#64ff96;padding:40px;text-align:center;"><h2>WebGL Required</h2><p>Please enable WebGL to view this visualization.</p></div>';
        throw new Error('WebGL not supported');
    }

    // Compile shaders
    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    const vs = createShader(gl.VERTEX_SHADER, \`${vertexShader}\`);
    const fs = createShader(gl.FRAGMENT_SHADER, \`${fragmentShader}\`);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Link error:', gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);

    // Fullscreen quad
    const positions = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const uniforms = {};
    const uniformNames = [
        'u_time', 'u_resolution', 'u_mouse', 'u_geometry',
        'u_gridDensity', 'u_morphFactor', 'u_chaos', 'u_speed',
        'u_hue', 'u_intensity', 'u_saturation', 'u_dimension',
        'u_rot4dXY', 'u_rot4dXZ', 'u_rot4dYZ',
        'u_rot4dXW', 'u_rot4dYW', 'u_rot4dZW',
        'u_mouseIntensity', 'u_clickIntensity',
        'u_bass', 'u_mid', 'u_high'
    ];
    uniformNames.forEach(name => {
        uniforms[name] = gl.getUniformLocation(program, name);
    });

    // State
    let mouseX = 0.5, mouseY = 0.5, mouseIntensity = 0, clickIntensity = 0;
    let bass = 0, mid = 0, high = 0;
    let audioContext, analyser, dataArray, audioEnabled = false;
    const startTime = performance.now();

    // Mouse tracking
    document.addEventListener('mousemove', e => {
        mouseX = e.clientX / window.innerWidth;
        mouseY = 1 - e.clientY / window.innerHeight;
        mouseIntensity = Math.min(1, mouseIntensity + 0.1);
    });
    document.addEventListener('click', () => {
        clickIntensity = 1;
    });

    // Audio setup
    window.toggleAudio = async function() {
        if (audioEnabled) {
            audioEnabled = false;
            document.querySelector('.audio-btn').textContent = '🎵 Enable Audio';
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new AudioContext();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            audioEnabled = true;
            document.querySelector('.audio-btn').textContent = '🔊 Audio Active';
        } catch (e) {
            console.log('Audio not available:', e);
            alert('Could not access microphone');
        }
    };

    function updateAudio() {
        if (!audioEnabled || !analyser) return;
        analyser.getByteFrequencyData(dataArray);

        // Bass: 0-8, Mid: 8-32, High: 32-64
        let bassSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < 8; i++) bassSum += dataArray[i];
        for (let i = 8; i < 32; i++) midSum += dataArray[i];
        for (let i = 32; i < 64; i++) highSum += dataArray[i];

        bass = (bassSum / 8 / 255) * (CONFIG.reactivity?.audio?.sensitivity || 1);
        mid = (midSum / 24 / 255) * (CONFIG.reactivity?.audio?.sensitivity || 1);
        high = (highSum / 32 / 255) * (CONFIG.reactivity?.audio?.sensitivity || 1);
    }

    // Resize
    function resize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    // Render loop
    function render() {
        const time = performance.now() - startTime;

        updateAudio();
        mouseIntensity *= 0.95;
        clickIntensity *= 0.92;

        gl.uniform1f(uniforms.u_time, time);
        gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
        gl.uniform2f(uniforms.u_mouse, mouseX, mouseY);
        gl.uniform1f(uniforms.u_geometry, CONFIG.geometry);
        gl.uniform1f(uniforms.u_gridDensity, CONFIG.params.gridDensity);
        gl.uniform1f(uniforms.u_morphFactor, CONFIG.params.morphFactor);
        gl.uniform1f(uniforms.u_chaos, CONFIG.params.chaos);
        gl.uniform1f(uniforms.u_speed, CONFIG.params.speed);
        gl.uniform1f(uniforms.u_hue, CONFIG.params.hue);
        gl.uniform1f(uniforms.u_intensity, CONFIG.params.intensity);
        gl.uniform1f(uniforms.u_saturation, CONFIG.params.saturation || 0.8);
        gl.uniform1f(uniforms.u_dimension, CONFIG.params.dimension || 3.5);
        gl.uniform1f(uniforms.u_rot4dXY, CONFIG.params.rot4dXY || 0);
        gl.uniform1f(uniforms.u_rot4dXZ, CONFIG.params.rot4dXZ || 0);
        gl.uniform1f(uniforms.u_rot4dYZ, CONFIG.params.rot4dYZ || 0);
        gl.uniform1f(uniforms.u_rot4dXW, CONFIG.params.rot4dXW || 0);
        gl.uniform1f(uniforms.u_rot4dYW, CONFIG.params.rot4dYW || 0);
        gl.uniform1f(uniforms.u_rot4dZW, CONFIG.params.rot4dZW || 0);
        gl.uniform1f(uniforms.u_mouseIntensity, mouseIntensity);
        gl.uniform1f(uniforms.u_clickIntensity, clickIntensity);
        gl.uniform1f(uniforms.u_bass, bass);
        gl.uniform1f(uniforms.u_mid, mid);
        gl.uniform1f(uniforms.u_high, high);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(render);
    }
    render();

    console.log('VIB3+ ${system.toUpperCase()} visualization initialized');
    console.log('Config:', CONFIG);
    </script>
</body>
</html>`;
    }
}

export default ShaderExporter;
