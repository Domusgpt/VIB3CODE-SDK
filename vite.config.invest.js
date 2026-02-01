import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        outDir: 'docs',
        emptyOutDir: false,
        rollupOptions: {
            input: resolve(import.meta.dirname, 'demo/investment-demo.js'),
            output: {
                entryFileNames: 'investment-bundle.js',
                format: 'es',
                inlineDynamicImports: true,
            }
        }
    }
});
