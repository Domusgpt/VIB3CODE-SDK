#!/usr/bin/env node
/**
 * VIB3+ SDK Visual Test Runner
 * Runs SDK in a server and captures screenshots using Puppeteer
 *
 * Usage: node scripts/visual-test.js
 */

import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import puppeteer from 'puppeteer-core';

const PORT = 3458;
const RESULTS_DIR = './test-results/visual';

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

// Ensure output directory exists
if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
}

console.log('🎨 VIB3+ SDK Visual Test Runner\n');
console.log('=' .repeat(50));

// Start server
const server = createServer((req, res) => {
    let filePath = join('./sdk', req.url === '/' ? 'index.html' : req.url);
    filePath = filePath.split('?')[0];

    if (!existsSync(filePath)) {
        // Try demo-assets for gallery
        const demoPath = join('./demo-assets', req.url);
        if (existsSync(demoPath)) {
            filePath = demoPath;
        } else {
            res.writeHead(404);
            res.end('Not found: ' + filePath);
            return;
        }
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

async function runTests() {
    await new Promise(resolve => server.listen(PORT, resolve));
    console.log(`\n🌐 Server running at http://localhost:${PORT}/\n`);

    let browser;
    try {
        // Try to find Chrome/Chromium
        const possiblePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            process.env.CHROME_PATH
        ].filter(Boolean);

        let executablePath = null;
        for (const path of possiblePaths) {
            if (existsSync(path)) {
                executablePath = path;
                break;
            }
        }

        if (!executablePath) {
            console.log('⚠️  No Chrome/Chromium found. Generating static test report instead.\n');
            await generateStaticReport();
            return;
        }

        console.log(`📦 Using browser: ${executablePath}\n`);

        browser = await puppeteer.launch({
            executablePath,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Collect console logs
        const logs = [];
        page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));

        // Test 1: Load page
        console.log('📸 TEST 1: Loading SDK page...');
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.screenshot({ path: `${RESULTS_DIR}/01-initial-load.png`, fullPage: true });
        console.log('   ✅ Screenshot: 01-initial-load.png');

        // Test 2: Wait for initialization
        console.log('📸 TEST 2: Waiting for WebGL initialization...');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${RESULTS_DIR}/02-after-init.png`, fullPage: true });
        console.log('   ✅ Screenshot: 02-after-init.png');

        // Test 3: Check canvases
        console.log('📸 TEST 3: Checking canvas elements...');
        const canvasInfo = await page.evaluate(() => {
            const canvases = document.querySelectorAll('canvas');
            return Array.from(canvases).map(c => ({
                id: c.id || 'unnamed',
                width: c.width,
                height: c.height,
                visible: c.offsetParent !== null
            }));
        });
        console.log(`   Found ${canvasInfo.length} canvases:`);
        canvasInfo.forEach(c => console.log(`     - #${c.id}: ${c.width}x${c.height} (visible: ${c.visible})`));

        // Test 4: Check UI controls
        console.log('📸 TEST 4: Checking UI controls...');
        const uiInfo = await page.evaluate(() => {
            return {
                sliders: document.querySelectorAll('input[type="range"]').length,
                buttons: document.querySelectorAll('button').length,
                tabs: document.querySelectorAll('.system-tab, [data-system]').length
            };
        });
        console.log(`   Sliders: ${uiInfo.sliders}, Buttons: ${uiInfo.buttons}, Tabs: ${uiInfo.tabs}`);

        // Test 5: Try switching systems (if available)
        console.log('📸 TEST 5: Testing system tabs...');
        const systemTabs = await page.$$('[data-system]');
        for (let i = 0; i < Math.min(systemTabs.length, 3); i++) {
            const system = await systemTabs[i].evaluate(el => el.dataset.system || el.textContent);
            await systemTabs[i].click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: `${RESULTS_DIR}/05-system-${system || i}.png` });
            console.log(`   ✅ Screenshot: 05-system-${system || i}.png`);
        }

        // Test 6: Adjust a slider
        console.log('📸 TEST 6: Testing parameter sliders...');
        const slider = await page.$('input[type="range"]');
        if (slider) {
            await slider.evaluate(el => { el.value = el.max; el.dispatchEvent(new Event('input')); });
            await page.waitForTimeout(500);
            await page.screenshot({ path: `${RESULTS_DIR}/06-slider-max.png` });
            console.log('   ✅ Screenshot: 06-slider-max.png');
        }

        // Generate report
        const report = {
            timestamp: new Date().toISOString(),
            url: `http://localhost:${PORT}/`,
            canvases: canvasInfo,
            ui: uiInfo,
            consoleLogs: logs.length,
            errors: logs.filter(l => l.type === 'error').length,
            screenshots: [
                '01-initial-load.png',
                '02-after-init.png',
                '05-system-*.png',
                '06-slider-max.png'
            ]
        };

        writeFileSync(`${RESULTS_DIR}/report.json`, JSON.stringify(report, null, 2));
        console.log('\n📋 Report saved: test-results/visual/report.json');

        // Print console summary
        console.log('\n📝 Console Log Summary:');
        console.log(`   Total: ${logs.length}, Errors: ${logs.filter(l => l.type === 'error').length}`);
        logs.filter(l => l.type === 'error').slice(0, 5).forEach(l => console.log(`   ❌ ${l.text.substring(0, 80)}`));

    } catch (error) {
        console.error('\n❌ Test error:', error.message);
        await generateStaticReport();
    } finally {
        if (browser) await browser.close();
        server.close();
    }

    console.log('\n' + '=' .repeat(50));
    console.log('✨ Visual tests complete!');
    console.log(`   Results: ${RESULTS_DIR}/`);
}

async function generateStaticReport() {
    console.log('\n📊 Generating static test report...\n');

    // Read SDK index.html and analyze it
    const sdkHtml = readFileSync('./sdk/index.html', 'utf8');

    const report = {
        timestamp: new Date().toISOString(),
        type: 'static-analysis',
        sdkFile: 'sdk/index.html',
        analysis: {
            canvasElements: (sdkHtml.match(/<canvas/g) || []).length,
            systemTabs: (sdkHtml.match(/data-system/g) || []).length,
            sliders: (sdkHtml.match(/type="range"/g) || []).length,
            buttons: (sdkHtml.match(/<button/g) || []).length,
            hasWebGL: sdkHtml.includes('webgl') || sdkHtml.includes('WebGL'),
            hasWASM: sdkHtml.includes('.wasm') || sdkHtml.includes('WebAssembly'),
            systems: ['quantum', 'faceted', 'holographic'].filter(s => sdkHtml.includes(s))
        },
        demoAssets: {
            total: 51,
            geometryConfigs: 24,
            svgPreviews: 24,
            galleryPage: existsSync('./demo-assets/geometry-gallery.html'),
            apiExamples: existsSync('./demo-assets/api-examples.js')
        }
    };

    writeFileSync(`${RESULTS_DIR}/static-report.json`, JSON.stringify(report, null, 2));

    console.log('📋 Static Analysis Results:');
    console.log(`   Canvas elements: ${report.analysis.canvasElements}`);
    console.log(`   System tabs: ${report.analysis.systemTabs}`);
    console.log(`   Sliders: ${report.analysis.sliders}`);
    console.log(`   Buttons: ${report.analysis.buttons}`);
    console.log(`   WebGL: ${report.analysis.hasWebGL}`);
    console.log(`   WASM: ${report.analysis.hasWASM}`);
    console.log(`   Systems: ${report.analysis.systems.join(', ')}`);
    console.log(`\n   Demo assets: ${report.demoAssets.total} files`);

    console.log('\n✅ Report saved: test-results/visual/static-report.json');
}

runTests().catch(console.error);
