import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    // Relative base so the build works at any sub-path on GitHub Pages
    base: './',

    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                'pcg-demo': resolve(import.meta.dirname, 'demo/pcg-demo.html'),
                'showcase': resolve(import.meta.dirname, 'demo/showcase-demo.html')
            }
        }
    }
});
