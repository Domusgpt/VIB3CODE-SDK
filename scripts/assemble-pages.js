#!/usr/bin/env node
/**
 * assemble-pages.js
 *
 * Assembles the _site directory for GitHub Pages deployment.
 * Run after `vite build` via `npm run build:pages`.
 *
 * Output structure:
 *   _site/
 *   ├── index.html          ← pages-index.html (landing page)
 *   ├── demo/               ← vite-built demos (PCG, Showcase, Experiment, Hi-Fi)
 *   ├── assets/             ← vite-built JS/CSS bundles
 *   ├── sdk/                ← full SDK app (no build needed)
 *   ├── docs/               ← algo art gallery
 *   └── DOCS/               ← technical documentation (markdown)
 */

import { cpSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const site = resolve(root, '_site');

function cp(src, dst, opts = {}) {
    const srcPath = resolve(root, src);
    const dstPath = resolve(site, dst);
    if (!existsSync(srcPath)) {
        console.warn(`  SKIP  ${src} (not found)`);
        return;
    }
    if (opts.recursive) {
        cpSync(srcPath, dstPath, { recursive: true });
    } else {
        mkdirSync(dirname(dstPath), { recursive: true });
        copyFileSync(srcPath, dstPath);
    }
    console.log(`  COPY  ${src} → _site/${dst}`);
}

console.log('\nAssembling _site for GitHub Pages...\n');

// Clean and create
mkdirSync(site, { recursive: true });

// Landing page
cp('pages-index.html', 'index.html');

// Vite-built demos + assets
cp('dist/demo', 'demo', { recursive: true });
cp('dist/assets', 'assets', { recursive: true });

// Full SDK app (inline JS, no build step)
cp('sdk', 'sdk', { recursive: true });

// Art gallery / docs
cp('docs', 'docs', { recursive: true });

// Technical docs (markdown, rendered by GitHub but useful to have)
cp('DOCS', 'DOCS', { recursive: true });

// .nojekyll to prevent GitHub from processing with Jekyll
copyFileSync(
    resolve(root, 'docs/.nojekyll'),
    resolve(site, '.nojekyll')
);
console.log('  COPY  .nojekyll');

console.log('\nDone. _site/ is ready for deployment.');
console.log('  Local preview: npx serve _site');
console.log('  GitHub Pages will deploy from Actions on push.\n');
