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
                'showcase': resolve(import.meta.dirname, 'demo/showcase-demo.html'),
                'experiment': resolve(import.meta.dirname, 'demo/experiment-demo.html'),
                'hifi': resolve(import.meta.dirname, 'demo/hifi-demo.html'),
                'pyramid': resolve(import.meta.dirname, 'demo/pyramid-demo.html'),
                'chromawar': resolve(import.meta.dirname, 'demo/chromawar-demo.html')
            }
        }
    }
});
