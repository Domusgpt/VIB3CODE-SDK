import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'docs',
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(import.meta.dirname, 'demo/hybrid-v3.js'),
            output: {
                entryFileNames: 'hybrid-bundle.js',
                format: 'es',
                inlineDynamicImports: true,
            }
        }
    }
});
