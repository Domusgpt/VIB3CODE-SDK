import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Base path for GitHub Pages deployment
    base: './',

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                demo: resolve(__dirname, 'demo/index.html'),
                phillipsRenderer: resolve(__dirname, 'demo/phillips-renderer.html'),
                plasticCosmos: resolve(__dirname, 'demo/plastic-cosmos.html'),
                neutronDescent: resolve(__dirname, 'demo/neutron-descent.html'),
                emergenceStorm: resolve(__dirname, 'demo/emergence-storm.html'),
            }
        }
    },

    // Resolve aliases for cleaner imports
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
            '@math': resolve(__dirname, 'src/math'),
            '@systems': resolve(__dirname, 'src/systems'),
        }
    },

    // Development server configuration
    server: {
        port: 3000,
        open: true
    }
});
