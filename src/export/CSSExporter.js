/**
 * CSSExporter - Export VIB3+ parameters as CSS custom properties
 *
 * Generates theme-ready CSS variables from visualization parameters
 * for easy integration with any CSS framework.
 */

/**
 * Default export options
 */
const DEFAULT_OPTIONS = {
    includeDarkMode: false,
    includeAnimations: false,
    includeComments: true,
    rootSelector: ':root',
    prefix: 'vib3'
};

/**
 * Geometry names for comments
 */
const GEOMETRY_NAMES = [
    'Tetrahedron', 'Hypercube', 'Sphere', 'Torus',
    'Klein Bottle', 'Fractal', 'Wave', 'Crystal'
];

/**
 * System display names
 */
const SYSTEM_NAMES = {
    quantum: 'Quantum',
    faceted: 'Faceted',
    holographic: 'Holographic'
};

/**
 * Export parameters to CSS custom properties
 *
 * @param {object} params - VIB3+ parameters
 * @param {object} options - Export options
 * @returns {string} CSS content
 */
export function exportCSS(params, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const { includeDarkMode, includeAnimations, includeComments, rootSelector, prefix } = opts;

    // Extract parameters with defaults
    const system = params.system || 'quantum';
    const geometry = params.geometry ?? 0;
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;
    const gridDensity = params.gridDensity ?? 16;
    const morphFactor = params.morphFactor ?? 0;
    const chaos = params.chaos ?? 0;
    const speed = params.speed ?? 1;
    const dimension = params.dimension ?? 3.5;

    // 6D rotation values
    const rotXY = params.rot4dXY ?? 0;
    const rotXZ = params.rot4dXZ ?? 0;
    const rotYZ = params.rot4dYZ ?? 0;
    const rotXW = params.rot4dXW ?? 0;
    const rotYW = params.rot4dYW ?? 0;
    const rotZW = params.rot4dZW ?? 0;

    // Derived colors
    const primaryHSL = `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(40 + intensity * 20)}%)`;
    const secondaryHSL = `hsl(${hue}, ${Math.round(saturation * 80)}%, ${Math.round(50 + intensity * 20)}%)`;
    const accentHSL = `hsl(${(hue + 30) % 360}, ${Math.round(saturation * 100)}%, ${Math.round(50 + intensity * 10)}%)`;
    const backgroundHSL = `hsl(${hue}, ${Math.round(saturation * 30)}%, ${Math.round(10 + intensity * 5)}%)`;

    // Build CSS
    let css = '';

    // Header comment
    if (includeComments) {
        const timestamp = new Date().toISOString().split('T')[0];
        css += `/* VIB3+ Theme Export - Generated ${timestamp} */\n`;
        css += `/* System: ${SYSTEM_NAMES[system] || system} */\n`;
        css += `/* Geometry: ${GEOMETRY_NAMES[geometry % 8] || 'Unknown'} (${geometry}) */\n\n`;
    }

    // Root variables
    css += `${rootSelector} {\n`;

    if (includeComments) {
        css += `  /* Color palette */\n`;
    }
    css += `  --${prefix}-hue: ${hue};\n`;
    css += `  --${prefix}-saturation: ${saturation};\n`;
    css += `  --${prefix}-intensity: ${intensity};\n`;
    css += `  --${prefix}-primary: ${primaryHSL};\n`;
    css += `  --${prefix}-secondary: ${secondaryHSL};\n`;
    css += `  --${prefix}-accent: ${accentHSL};\n`;
    css += `  --${prefix}-background: ${backgroundHSL};\n`;
    css += `\n`;

    if (includeComments) {
        css += `  /* Geometry parameters */\n`;
    }
    css += `  --${prefix}-geometry: ${geometry};\n`;
    css += `  --${prefix}-system: '${system}';\n`;
    css += `  --${prefix}-dimension: ${dimension};\n`;
    css += `  --${prefix}-grid-density: ${gridDensity};\n`;
    css += `  --${prefix}-morph-factor: ${morphFactor};\n`;
    css += `  --${prefix}-chaos: ${chaos};\n`;
    css += `\n`;

    if (includeComments) {
        css += `  /* 6D rotation (radians) */\n`;
    }
    css += `  --${prefix}-rot-xy: ${rotXY};\n`;
    css += `  --${prefix}-rot-xz: ${rotXZ};\n`;
    css += `  --${prefix}-rot-yz: ${rotYZ};\n`;
    css += `  --${prefix}-rot-xw: ${rotXW};\n`;
    css += `  --${prefix}-rot-yw: ${rotYW};\n`;
    css += `  --${prefix}-rot-zw: ${rotZW};\n`;
    css += `\n`;

    if (includeComments) {
        css += `  /* Animation timing */\n`;
    }
    css += `  --${prefix}-speed: ${speed};\n`;
    css += `  --${prefix}-animation-duration: ${(1 / speed).toFixed(2)}s;\n`;

    css += `}\n`;

    // Dark mode variant
    if (includeDarkMode) {
        css += `\n`;
        if (includeComments) {
            css += `/* Dark mode variant */\n`;
        }
        css += `@media (prefers-color-scheme: dark) {\n`;
        css += `  ${rootSelector} {\n`;
        css += `    --${prefix}-primary: hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(50 + intensity * 20)}%);\n`;
        css += `    --${prefix}-secondary: hsl(${hue}, ${Math.round(saturation * 80)}%, ${Math.round(35 + intensity * 15)}%);\n`;
        css += `    --${prefix}-background: hsl(${hue}, ${Math.round(saturation * 20)}%, ${Math.round(5 + intensity * 3)}%);\n`;
        css += `  }\n`;
        css += `}\n`;
    }

    // Animation keyframes
    if (includeAnimations) {
        css += `\n`;
        if (includeComments) {
            css += `/* VIB3+ animations */\n`;
        }
        css += `@keyframes ${prefix}-pulse {\n`;
        css += `  0%, 100% {\n`;
        css += `    transform: scale(1);\n`;
        css += `    filter: hue-rotate(0deg);\n`;
        css += `  }\n`;
        css += `  50% {\n`;
        css += `    transform: scale(${1 + morphFactor * 0.05});\n`;
        css += `    filter: hue-rotate(${chaos * 30}deg);\n`;
        css += `  }\n`;
        css += `}\n\n`;

        css += `@keyframes ${prefix}-rotate {\n`;
        css += `  from {\n`;
        css += `    transform: rotate(0deg);\n`;
        css += `  }\n`;
        css += `  to {\n`;
        css += `    transform: rotate(360deg);\n`;
        css += `  }\n`;
        css += `}\n\n`;

        css += `.${prefix}-animated {\n`;
        css += `  animation: ${prefix}-pulse var(--${prefix}-animation-duration) ease-in-out infinite;\n`;
        css += `}\n\n`;

        css += `.${prefix}-rotating {\n`;
        css += `  animation: ${prefix}-rotate calc(var(--${prefix}-animation-duration) * 10) linear infinite;\n`;
        css += `}\n`;
    }

    return css;
}

/**
 * Export CSS to file (browser environment)
 */
export function downloadCSS(params, options = {}, filename = 'vib3-theme.css') {
    const css = exportCSS(params, options);
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
    return css;
}

/**
 * Generate inline style object from parameters
 * Useful for React/Vue style props
 */
export function toStyleObject(params, prefix = 'vib3') {
    const hue = params.hue ?? 200;
    const saturation = params.saturation ?? 0.7;
    const intensity = params.intensity ?? 0.8;

    return {
        [`--${prefix}-hue`]: hue,
        [`--${prefix}-saturation`]: saturation,
        [`--${prefix}-intensity`]: intensity,
        [`--${prefix}-primary`]: `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(40 + intensity * 20)}%)`,
        [`--${prefix}-geometry`]: params.geometry ?? 0,
        [`--${prefix}-system`]: `'${params.system || 'quantum'}'`,
        [`--${prefix}-rot-xw`]: params.rot4dXW ?? 0,
        [`--${prefix}-rot-yw`]: params.rot4dYW ?? 0,
        [`--${prefix}-rot-zw`]: params.rot4dZW ?? 0,
        [`--${prefix}-speed`]: params.speed ?? 1
    };
}

export default {
    exportCSS,
    downloadCSS,
    toStyleObject
};
