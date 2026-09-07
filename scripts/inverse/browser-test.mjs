/** Test the production build over HTTP with real workers, WASM and downloads.
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run test:inverse:browser
 * A separately installed Playwright keeps browser tooling out of the site bundle.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { chromium, firefox, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.INVERSE_TEST_URL || 'http://127.0.0.1:4173';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'tmp', 'inverse-browser', runId);
await fs.mkdir(output, { recursive: true });
const engines = { chromium, firefox, webkit };
const names = (process.env.INVERSE_TEST_BROWSERS || 'chromium,firefox').split(',');
const results = [];
const hash = data => createHash('sha256').update(data).digest('hex');

for (const name of names) {
  const record = { browser: name, checks: [], pageErrors: [], consoleErrors: [] };
  results.push(record);
  const browser = await engines[name].launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
    // The existing site's analytics/stars widget are unrelated to the local artwork pipeline.
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => record.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') record.consoleErrors.push(message.text()); });
    const button = label => page.getByRole('button', { name: label, exact: true }).first();
    const heading = label => page.getByRole('heading', { name: label, exact: true });
    const check = label => { record.checks.push(label); console.log(`${name}: ${label}`); };
    const loadWaves = async () => {
      await button('Waves · new solve').click();
      await heading('Inspect your pattern').waitFor();
    };
    const download = async (label, filename) => {
      const pending = page.waitForEvent('download');
      await button(label).click();
      const item = await pending;
      assert.equal(item.suggestedFilename(), filename);
      const destination = path.join(output, `${name}-${filename}`);
      await item.saveAs(destination);
      return destination;
    };

    await page.goto(`${origin}/en/`);
    await page.getByRole('link', { name: 'Image to heart', exact: true }).click();
    await heading('From image to woven heart').waitFor();
    assert.match(page.url(), /\/en\/generate\/$/);
    check('gallery navigation to English generator');

    for (const [resource, mime] of [['worker-bootstrap.js', 'javascript'], ['worker.js', 'javascript'], ['core/engine.js', 'javascript'], ['vendor/highs.mjs', 'javascript'], ['vendor/highs.wasm', 'application/wasm']]) {
      const response = await context.request.get(`${origin}/inverse/${resource}`);
      assert.equal(response.status(), 200);
      assert.ok(response.headers()['content-type'].includes(mime));
      assert.equal(hash(await response.body()), hash(await fs.readFile(path.join(root, 'static/inverse', resource))));
    }
    assert.equal((await context.request.get(`${origin}/inverse/vendor/missing.wasm`)).status(), 404);
    check('HTTP modules and WASM match source bytes; missing WASM returns 404');

    await loadWaves();
    await button('Binary mask').click();
    assert.equal(await page.locator('canvas.mask').getAttribute('width'), '240');
    await button('Processed curves').click();
    await button('Find cutting templates').click();
    await heading('Template pair checked').waitFor({ timeout: 90000 });
    assert.ok((await page.locator('.preview-panel').innerText()).includes('Generated from artwork'));
    check('fresh SVG → worker/WASM solve → checked pair');

    const zipPath = await download('Download everything (.zip)', 'juleflet-design.zip');
    execFileSync('unzip', ['-t', zipPath]);
    const report = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'report.json'], { encoding: 'utf8' }));
    assert.equal(report.solver.status, 'solved');
    assert.equal(report.templateExportAllowed, true);
    assert.equal(report.validation.forwardSampleMismatchPixels, 0);
    assert.equal(report.solver.imported, undefined);
    record.freshReport = report;
    const left = await fs.readFile(await download('Left SVG', 'template_left.svg'), 'utf8');
    assert.match(left, /width="210mm" height="297mm"/);
    assert.match(left, /20 mm scale check/);
    assert.match(left, /data-slit="1" d="M/);
    await download('Printable pages (.html)', 'print_templates.html');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `${name}-desktop.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(output, `${name}-mobile.png`), fullPage: true });
    check('ZIP CRCs, SVG dimensions, print download and responsive layout');
    await page.setViewportSize({ width: 1400, height: 1000 });

    await page.getByLabel('Overlap width (mm)', { exact: true }).fill('110');
    assert.equal(await button('Find cutting templates').isDisabled(), true);
    assert.equal(await button('Download everything (.zip)').count(), 0);
    await page.getByLabel('Overlap width (mm)', { exact: true }).fill('100');
    await button('Prepare artwork').click();
    await heading('Inspect your pattern').waitFor();
    await button('Find cutting templates').click();
    await button('Stop').click();
    await page.getByText('Stopped. Prepare the artwork again to start a new search.', { exact: true }).waitFor();
    assert.equal(await button('Find cutting templates').isDisabled(), true);
    await button('Prepare artwork').click();
    await heading('Inspect your pattern').waitFor();
    check('settings invalidate downloads; cancellation and worker restart');

    // Make actual two-colour pixels. The application decodes and traces this PNG itself.
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#b91313' : '#ffffff'; ctx.fillRect(x * 32, y * 32, 32, 32);
      }
      for (const x of [8, 12, 48, 76, 113]) {
        ctx.fillStyle = Math.floor(x / 32) % 2 ? '#ffffff' : '#b91313';
        ctx.fillRect(x, 0, 1, 1);
      }
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('input[type=file]').setInputFiles({ name: 'checker.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await button('Prepare artwork').click();
    await heading('Inspect your pattern').waitFor();
    await button('Find cutting templates').click();
    await heading('Template pair checked').waitFor({ timeout: 90000 });
    assert.ok((await page.locator('.metrics').innerText()).includes('0.03%'));
    assert.ok((await page.locator('.metrics').innerText()).includes('difference from input image'));
    check('edge-noisy PNG → stabilized tracing → checked templates with original-input error');

    await page.getByRole('combobox', { name: /Image area/ }).selectOption('quad');
    await button('Prepare artwork').click();
    await page.getByText('Select all four corners of the woven overlap first.', { exact: true }).waitFor();
    for (const [i, [x, y]] of [[0, 0], [128, 0], [128, 128], [0, 128]].entries()) {
      await page.getByLabel(`Corner ${i + 1} · x`, { exact: true }).fill(String(x));
      await page.getByLabel(`Corner ${i + 1} · y`, { exact: true }).fill(String(y));
    }
    await button('Prepare artwork').click();
    await heading('Inspect your pattern').waitFor();
    check('four-corner crop validation and rectification');

    await button('Simplify traced artwork').click();
    await heading('Inspect your pattern').waitFor();
    assert.equal(await page.getByLabel('Curve fitting tolerance (mm)', { exact: true }).inputValue(), '0.75');
    assert.equal(await page.getByLabel('Merge nearby junctions (mm)', { exact: true }).inputValue(), '1.5');
    check('simplification preset reprepares the artwork and exposes junction merging in mm');

    for (const example of ['JUL']) {
      await button(`${example} · saved templates`).click();
      await page.getByText('Saved templates · new check', { exact: true }).waitFor({ timeout: 60000 });
      await page.getByText('Technical report (English)', { exact: true }).click();
      const savedReport = JSON.parse(await page.locator('.report pre').innerText());
      assert.equal(savedReport.solver.imported, true);
      record[`${example.toLowerCase()}SavedReport`] = savedReport;
      check(`${example} is explicitly a saved-template audit (${savedReport.manufacturing.status})`);
    }

    await page.locator('input[type=file]').setInputFiles({ name: 'active.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><script>window.injected=true</script></svg>') });
    await button('Prepare artwork').click();
    await heading('Could not process this artwork').waitFor();
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await button('Find cutting templates').isDisabled(), true);
    assert.equal(await button('Left SVG').count(), 0);
    check('unsafe upload rejected; stale previews and exports removed');

    // Exercise a real finite time limit over the HTTP worker protocol.
    record.timeout = await page.evaluate(async () => {
      const text = await (await fetch('/inverse/examples/waves.svg')).text();
      const worker = new Worker('/inverse/worker-bootstrap.js');
      try {
        return await new Promise((resolve, reject) => {
          worker.onerror = event => reject(new Error(event.message));
          worker.onmessage = ({ data }) => {
            if (data.type === 'prepared') worker.postMessage({ id: 2, action: 'solve', settings: { timeLimit: 0.1, trials: 0 } });
            else if (data.type === 'error') resolve(data.report);
            else if (data.type === 'result') reject(new Error('Expected the controlled short search to time out.'));
          };
          worker.postMessage({ id: 1, action: 'prepare', input: { type: 'svg', text }, settings: {} });
        });
      } finally { worker.terminate(); }
    });
    assert.equal(record.timeout?.termination, 'time_limit');
    check('fresh search timeout is reported separately from infeasibility');

    await page.goto(`${origin}/generate/`);
    await heading('Fra billede til flettet hjerte').waitFor();
    await button('Bølger · ny beregning').click();
    await heading('Se dit mønster efter').waitFor();
    await page.getByRole('link', { name: '← Tilbage', exact: true }).click();
    await page.getByRole('link', { name: 'Lav Nyt Hjerte', exact: true }).click();
    await page.locator('.canvas-wrapper svg').waitFor();
    check('Danish direct route, preparation, gallery return and existing editor');
    assert.deepEqual(record.pageErrors, []);
    record.passed = true;
  } catch (error) {
    record.passed = false;
    record.failure = error.stack;
    const failedPage = browser.contexts()[0]?.pages()[0];
    if (failedPage) {
      await failedPage.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
      record.failurePage = await failedPage.locator('body').innerText().catch(() => 'Page unavailable');
    }
    process.exitCode = 1;
    console.error(`${name}: ${error.stack}`);
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ runId, origin, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), results }, null, 2));
  }
}
console.log(`Browser evidence: ${output}`);
