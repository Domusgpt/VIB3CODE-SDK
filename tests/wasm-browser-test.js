/**
 * VIB3+ WASM Browser Test
 *
 * This test actually loads the SDK in a real Chromium browser
 * and verifies that WASM loading works correctly.
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
    '.json': 'application/json',
    '.png': 'image/png'
};

const RESULTS_DIR = './test-results';
if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
}

const PORT = 3458;
let server;

async function startServer() {
    return new Promise((resolve) => {
        server = createServer((req, res) => {
            let filePath = join('./sdk', req.url === '/' ? 'index.html' : req.url);
            filePath = filePath.split('?')[0];

            if (!existsSync(filePath)) {
                console.log(`  404: ${filePath}`);
                res.writeHead(404);
                res.end('Not found: ' + filePath);
                return;
            }

            const ext = extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            try {
                const content = readFileSync(filePath);
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp'
                });
                res.end(content);
            } catch (err) {
                console.log(`  500: ${err.message}`);
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

async function runTest() {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  VIB3+ SDK BROWSER TEST - Real Chromium');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

    await startServer();

    const browser = await chromium.launch({
        headless: true,
        executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--disable-gpu-sandbox',
            '--enable-webgl'
        ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleLogs = [];
    const pageErrors = [];

    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
        if (msg.type() === 'error') {
            console.log(`  [Console Error] ${msg.text()}`);
        }
    });

    page.on('pageerror', err => {
        pageErrors.push(err.message);
        console.log(`  [Page Error] ${err.message}`);
    });

    const results = {
        timestamp: new Date().toISOString(),
        tests: [],
        summary: { passed: 0, failed: 0 }
    };

    try {
        // TEST 1: Page loads
        console.log('[TEST 1] Loading page...');
        const response = await page.goto(`http://localhost:${PORT}/`, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        const test1 = {
            name: 'Page Load',
            status: response.ok() ? 'PASS' : 'FAIL',
            httpStatus: response.status()
        };
        results.tests.push(test1);
        console.log(`  ${test1.status}: HTTP ${test1.httpStatus}`);
        if (test1.status === 'PASS') results.summary.passed++;
        else results.summary.failed++;

        // Wait for initialization
        console.log('');
        console.log('[TEST 2] Waiting for WASM initialization...');
        await page.waitForTimeout(8000);

        // Take screenshot (may fail in headless without GPU)
        try {
            await page.screenshot({ path: `${RESULTS_DIR}/wasm-test-screenshot.png`, fullPage: true });
            console.log(`  Screenshot saved: ${RESULTS_DIR}/wasm-test-screenshot.png`);
        } catch (e) {
            console.log(`  Screenshot failed: ${e.message}`);
        }

        // TEST 2: Check loading status
        const loadingText = await page.locator('#loadingText').textContent().catch(() => 'N/A');
        console.log(`  Loading Status: "${loadingText}"`);

        // TEST 3: Check for Vib3Core global
        console.log('');
        console.log('[TEST 3] Checking WASM globals...');
        const wasmStatus = await page.evaluate(() => {
            return {
                hasVib3Core: typeof window.Vib3Core !== 'undefined',
                vib3CoreType: typeof window.Vib3Core,
                hasVib3Math: typeof window.Vib3Math !== 'undefined',
                vib3MathType: typeof window.Vib3Math,
                hasFunctions: window.Vib3Core && typeof window.Vib3Core._vib3_vec4_create === 'function',
                loadingElement: document.getElementById('loadingText')?.textContent || 'N/A'
            };
        });

        console.log(`  window.Vib3Core: ${wasmStatus.hasVib3Core} (${wasmStatus.vib3CoreType})`);
        console.log(`  window.Vib3Math: ${wasmStatus.hasVib3Math} (${wasmStatus.vib3MathType})`);
        console.log(`  WASM functions available: ${wasmStatus.hasFunctions}`);

        const test2 = {
            name: 'WASM Core Loaded',
            status: wasmStatus.hasVib3Core && wasmStatus.vib3CoreType === 'object' ? 'PASS' : 'FAIL',
            details: wasmStatus
        };
        results.tests.push(test2);
        console.log(`  ${test2.status}`);
        if (test2.status === 'PASS') results.summary.passed++;
        else results.summary.failed++;

        // TEST 4: Check for WASM functions
        console.log('');
        console.log('[TEST 4] Checking WASM functions...');
        const functions = await page.evaluate(() => {
            if (!window.Vib3Core) return null;
            return {
                vec4_create: typeof window.Vib3Core._vib3_vec4_create,
                rotor4d_identity: typeof window.Vib3Core._vib3_rotor4d_identity,
                rotor4d_from_euler6: typeof window.Vib3Core._vib3_rotor4d_from_euler6,
                rotor4d_rotate: typeof window.Vib3Core._vib3_rotor4d_rotate,
                project_perspective: typeof window.Vib3Core._vib3_project_perspective
            };
        });

        if (functions) {
            Object.entries(functions).forEach(([name, type]) => {
                console.log(`  ${name}: ${type}`);
            });

            const allFunctions = Object.values(functions).every(t => t === 'function');
            const test3 = {
                name: 'WASM Functions Available',
                status: allFunctions ? 'PASS' : 'FAIL',
                functions
            };
            results.tests.push(test3);
            console.log(`  ${test3.status}`);
            if (test3.status === 'PASS') results.summary.passed++;
            else results.summary.failed++;
        } else {
            results.tests.push({
                name: 'WASM Functions Available',
                status: 'FAIL',
                error: 'Vib3Core not available'
            });
            results.summary.failed++;
            console.log('  FAIL: Vib3Core not available');
        }

        // TEST 5: Check WebGL context
        console.log('');
        console.log('[TEST 5] Checking WebGL context...');
        const canvasInfo = await page.evaluate(() => {
            const canvases = document.querySelectorAll('canvas');
            const results = [];
            canvases.forEach((canvas, i) => {
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                results.push({
                    index: i,
                    id: canvas.id || 'no-id',
                    width: canvas.width,
                    height: canvas.height,
                    hasWebGL: !!gl,
                    webglVersion: gl ? (gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1') : 'none'
                });
            });
            return results;
        });

        console.log(`  Found ${canvasInfo.length} canvas elements`);
        canvasInfo.forEach(c => {
            console.log(`    #${c.id}: ${c.width}x${c.height}, ${c.webglVersion}`);
        });

        const test4 = {
            name: 'WebGL Canvas',
            status: canvasInfo.some(c => c.hasWebGL) ? 'PASS' : 'FAIL',
            canvases: canvasInfo
        };
        results.tests.push(test4);
        console.log(`  ${test4.status}`);
        if (test4.status === 'PASS') results.summary.passed++;
        else results.summary.failed++;

        // Console errors summary
        console.log('');
        console.log('[SUMMARY] Console Output');
        const errors = consoleLogs.filter(l => l.type === 'error');
        console.log(`  Errors: ${errors.length}`);
        errors.slice(0, 5).forEach(e => console.log(`    - ${e.text.substring(0, 100)}`));

        const warnings = consoleLogs.filter(l => l.type === 'warning');
        console.log(`  Warnings: ${warnings.length}`);

        const infos = consoleLogs.filter(l => l.type === 'log');
        console.log(`  Info logs: ${infos.length}`);
        infos.slice(0, 10).forEach(l => console.log(`    - ${l.text.substring(0, 80)}`));

        results.consoleLogs = consoleLogs;
        results.pageErrors = pageErrors;

    } catch (error) {
        console.log('');
        console.log(`[ERROR] Test failed: ${error.message}`);
        results.tests.push({
            name: 'Test Execution',
            status: 'FAIL',
            error: error.message
        });
        results.summary.failed++;
    }

    // Final summary
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${results.summary.passed} PASSED, ${results.summary.failed} FAILED`);
    console.log('════════════════════════════════════════════════════════════');

    // Save results
    writeFileSync(`${RESULTS_DIR}/wasm-browser-test-results.json`, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${RESULTS_DIR}/wasm-browser-test-results.json`);

    await browser.close();
    server.close();

    process.exit(results.summary.failed > 0 ? 1 : 0);
}

runTest().catch(err => {
    console.error('Fatal error:', err);
    if (server) server.close();
    process.exit(1);
});
