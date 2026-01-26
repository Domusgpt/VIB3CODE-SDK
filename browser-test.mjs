/**
 * VIB3+ SDK Browser Test using Playwright
 * Actually loads the SDK in a real browser and reports what works/fails
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

// Simple static file server
function createStaticServer(rootDir, port) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            let filePath = join(rootDir, req.url === '/' ? 'index.html' : req.url);

            // Remove query string
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
                res.end('Error reading file: ' + err.message);
            }
        });

        server.listen(port, () => {
            console.log(`Server running at http://localhost:${port}/`);
            resolve(server);
        });
    });
}

async function runBrowserTest() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  VIB3+ SDK BROWSER TEST (Playwright)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    const PORT = 3456;
    const server = await createStaticServer(__dirname, PORT);

    let browser;
    const results = {
        passed: [],
        failed: [],
        errors: [],
        consoleMessages: []
    };

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        // Capture all console messages
        page.on('console', msg => {
            const text = msg.text();
            results.consoleMessages.push({ type: msg.type(), text });
            if (msg.type() === 'error') {
                results.errors.push(text);
            }
        });

        // Capture page errors
        page.on('pageerror', err => {
            results.errors.push(err.message);
        });

        console.log('[TEST 1] Loading index.html...');
        const response = await page.goto(`http://localhost:${PORT}/index.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        if (response.ok()) {
            results.passed.push('Page loads (HTTP 200)');
            console.log('  ✅ Page loads');
        } else {
            results.failed.push(`Page load failed: ${response.status()}`);
            console.log(`  ❌ Page load failed: ${response.status()}`);
        }

        // Wait for potential WASM loading
        console.log('[TEST 2] Waiting for WASM initialization (5s)...');
        await page.waitForTimeout(5000);

        // Check for WASM error in page content
        const pageContent = await page.content();
        const loadingText = await page.$eval('#loadingText', el => el?.textContent).catch(() => null);

        console.log(`  Loading text: "${loadingText}"`);

        if (loadingText && loadingText.includes('WASM Core Error')) {
            results.failed.push(`WASM Error: ${loadingText}`);
            console.log(`  ❌ WASM FAILED: ${loadingText}`);
        } else if (loadingText && loadingText.includes('Loading')) {
            results.failed.push('WASM still loading after 5s');
            console.log('  ❌ WASM still loading (stuck)');
        } else {
            results.passed.push('No WASM error visible');
            console.log('  ✅ No WASM error in UI');
        }

        // Check if Vib3Core is defined
        console.log('[TEST 3] Checking window.Vib3Core...');
        const hasVib3Core = await page.evaluate(() => typeof window.Vib3Core !== 'undefined');
        if (hasVib3Core) {
            results.passed.push('window.Vib3Core exists');
            console.log('  ✅ window.Vib3Core exists');
        } else {
            results.failed.push('window.Vib3Core is undefined');
            console.log('  ❌ window.Vib3Core is undefined');
        }

        // Check if canvas exists and has content
        console.log('[TEST 4] Checking canvas rendering...');
        const canvasInfo = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return { exists: false };
            const ctx = canvas.getContext('2d') || canvas.getContext('webgl') || canvas.getContext('webgl2');
            return {
                exists: true,
                width: canvas.width,
                height: canvas.height,
                hasContext: !!ctx
            };
        });

        if (canvasInfo.exists) {
            results.passed.push(`Canvas exists: ${canvasInfo.width}x${canvasInfo.height}`);
            console.log(`  ✅ Canvas: ${canvasInfo.width}x${canvasInfo.height}`);
        } else {
            results.failed.push('No canvas element found');
            console.log('  ❌ No canvas found');
        }

        // Check for JS errors
        console.log('[TEST 5] Checking for JavaScript errors...');
        if (results.errors.length > 0) {
            results.failed.push(`${results.errors.length} JS errors`);
            console.log(`  ❌ ${results.errors.length} JS errors:`);
            results.errors.forEach(err => console.log(`     - ${err}`));
        } else {
            results.passed.push('No JS errors');
            console.log('  ✅ No JS errors');
        }

        // Take screenshot
        console.log('[TEST 6] Taking screenshot...');
        await page.screenshot({ path: join(__dirname, 'browser-test-screenshot.png') });
        results.passed.push('Screenshot saved');
        console.log('  ✅ Screenshot: sdk/browser-test-screenshot.png');

    } catch (err) {
        results.failed.push(`Test crashed: ${err.message}`);
        console.log(`  ❌ TEST CRASHED: ${err.message}`);
    } finally {
        if (browser) await browser.close();
        server.close();
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Passed: ${results.passed.length}`);
    results.passed.forEach(p => console.log(`     - ${p}`));
    console.log(`  ❌ Failed: ${results.failed.length}`);
    results.failed.forEach(f => console.log(`     - ${f}`));

    if (results.consoleMessages.length > 0) {
        console.log('');
        console.log('  Console output (first 20):');
        results.consoleMessages.slice(0, 20).forEach(m => {
            const icon = m.type === 'error' ? '❌' : m.type === 'warning' ? '⚠️' : '📝';
            console.log(`     ${icon} ${m.text.substring(0, 100)}`);
        });
    }

    console.log('═══════════════════════════════════════════════════════════');

    return results;
}

runBrowserTest().catch(console.error);
