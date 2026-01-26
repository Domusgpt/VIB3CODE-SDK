/**
 * VIB3+ Examples Browser Test
 * Tests that the SDK examples actually render visible content
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json'
};

const RESULTS_DIR = './test-results';
if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
}

const PORT = 3459;
let server;

async function startServer() {
    return new Promise((resolve) => {
        server = createServer((req, res) => {
            let filePath = join('./sdk', req.url === '/' ? 'examples/minimal.html' : req.url);
            filePath = filePath.split('?')[0];

            if (!existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not found: ' + filePath);
                return;
            }

            const ext = extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            try {
                const content = readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } catch (err) {
                res.writeHead(500);
                res.end('Error: ' + err.message);
            }
        });

        server.listen(PORT, () => {
            console.log(`Test server running at http://localhost:${PORT}/`);
            resolve();
        });
    });
}

async function testExample(page, name, path) {
    console.log(`\n[TEST] ${name}`);
    console.log('─'.repeat(50));

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    try {
        await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        // Check for WebGL context
        const hasWebGL = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return { error: 'No canvas found' };
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return { error: 'No WebGL context' };
            return {
                success: true,
                width: canvas.width,
                height: canvas.height,
                version: gl.getParameter(gl.VERSION)
            };
        });

        if (hasWebGL.error) {
            console.log(`  FAIL: ${hasWebGL.error}`);
            return { name, status: 'FAIL', error: hasWebGL.error };
        }

        console.log(`  Canvas: ${hasWebGL.width}x${hasWebGL.height}`);
        console.log(`  WebGL: ${hasWebGL.version}`);

        // Check if canvas has rendered pixels (not all black)
        const pixelCheck = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return { error: 'No GL' };

            const pixels = new Uint8Array(4);
            // Sample center pixel
            gl.readPixels(
                Math.floor(canvas.width / 2),
                Math.floor(canvas.height / 2),
                1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels
            );

            return {
                r: pixels[0],
                g: pixels[1],
                b: pixels[2],
                a: pixels[3],
                hasColor: pixels[0] > 0 || pixels[1] > 0 || pixels[2] > 0
            };
        });

        console.log(`  Center pixel: R=${pixelCheck.r} G=${pixelCheck.g} B=${pixelCheck.b}`);
        console.log(`  Has rendered content: ${pixelCheck.hasColor ? 'YES' : 'NO'}`);

        if (errors.length > 0) {
            console.log(`  Errors: ${errors.length}`);
            errors.forEach(e => console.log(`    - ${e}`));
        }

        const status = pixelCheck.hasColor ? 'PASS' : 'FAIL';
        console.log(`  Result: ${status}`);

        return {
            name,
            status,
            webgl: hasWebGL,
            pixels: pixelCheck,
            errors
        };

    } catch (error) {
        console.log(`  ERROR: ${error.message}`);
        return { name, status: 'ERROR', error: error.message };
    }
}

async function runTests() {
    console.log('');
    console.log('═'.repeat(60));
    console.log('  VIB3+ SDK EXAMPLES TEST');
    console.log('═'.repeat(60));

    await startServer();

    const browser = await chromium.launch({
        headless: true,
        executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl'
        ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const results = [];

    // Test minimal example
    results.push(await testExample(page, 'Minimal 4D Visualization', '/examples/minimal.html'));

    // Test basic demo
    results.push(await testExample(page, 'Basic Demo', '/examples/basic-demo.html'));

    // Test main SDK
    results.push(await testExample(page, 'Main SDK', '/index.html'));

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  SUMMARY');
    console.log('═'.repeat(60));

    let passed = 0, failed = 0;
    results.forEach(r => {
        const icon = r.status === 'PASS' ? '✓' : '✗';
        console.log(`  ${icon} ${r.name}: ${r.status}`);
        if (r.status === 'PASS') passed++;
        else failed++;
    });

    console.log(`\n  Total: ${passed} passed, ${failed} failed`);

    writeFileSync(`${RESULTS_DIR}/examples-test-results.json`, JSON.stringify(results, null, 2));

    await browser.close();
    server.close();

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    if (server) server.close();
    process.exit(1);
});
