import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'docs',
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(import.meta.dirname, 'demo/camera-fractal-cube.js'),
            output: {
                entryFileNames: 'camera-fractal-cube-bundle.js',
                format: 'es',
                inlineDynamicImports: true,
            }
        }
    }
});
