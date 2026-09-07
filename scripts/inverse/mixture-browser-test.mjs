/** Real worker preparation, review and export for photographic colour mixtures. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createCanvas } from 'canvas';
import { quantize } from '../../static/inverse/core/input.js';
import { renderExportedWeave } from './export-renderer.mjs';

const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.INVERSE_TEST_URL || 'http://127.0.0.1:4173';
const output = `tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g, '-')}-mixture`, results = [];
await fs.mkdir(output, { recursive: true });
const canvas = createCanvas(128, 128), ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  const color = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 ? [158, 23, 38] : [230, 217, 214];
  const light = .85 + .15 * y / 127;
  pixels.data.set([...color.map(v => Math.round(light * v)), 255], 4 * (y * 128 + x));
}
ctx.putImageData(pixels, 0, 0);
const fixture = `${output}/shaded-checker.png`;
await fs.writeFile(fixture, canvas.toBuffer('image/png'));
for (const [name, type] of Object.entries({ chromium, firefox })) {
  const row = { browser: name, checks: [], pageErrors: [] }; results.push(row);
  const browser = await type.launch({ headless: true }); let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    await context.route('**/*', r => new URL(r.request().url()).origin === new URL(origin).origin ? r.continue() : r.abort());
    await context.addInitScript(() => {
      const Base = window.Worker;
      window.Worker = class extends Base {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', e => { if (e.data.type === 'prepared') window.mixturePreview = e.data.preview; });
        }
      };
    });
    page = await context.newPage(); page.on('pageerror', e => row.pageErrors.push(e.message));
    await page.goto(`${origin}/en/generate/`);
    const button = label => page.getByRole('button', { name: label, exact: true }).first();
    const idle = () => page.waitForFunction(() => document.querySelector('fieldset')?.disabled === false);
    await idle(); await page.locator('input[type=file]').setInputFiles(fixture); await idle();
    await page.getByLabel(/^Image area/).selectOption('square');
    await page.locator('details').filter({ has: page.getByText('Image conversion', { exact: true }) }).locator('summary').click();
    await page.getByLabel(/^Separate source colours/).selectOption('red-white-mixture');
    await page.getByLabel('Tracing resolution (pixels)', { exact: true }).fill('128');
    await button('Prepare artwork').click(); await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
    const prepared = await page.evaluate(() => ({ ...window.mixturePreview, rgb: Array.from(window.mixturePreview.rgb), mask: Array.from(window.mixturePreview.mask) }));
    assert.equal(prepared.metadata.preprocessing.method, 'red-white-mixture');
    assert.deepEqual(prepared.mask, [...quantize(Uint8Array.from(prepared.rgb), { mode: 'red-white-mixture' }).mask]);
    row.checks.push('Selected photographic mixture reaches the real worker and matches independent preparation');
    await button('Binary mask').click();
    await page.waitForFunction(() => document.querySelector('canvas.mask')?.width === 128);
    await page.screenshot({ path: `${output}/${name}-mask.png`, fullPage: true });
    row.checks.push('Classified photograph remains inspectable before solving');
    await button('Find cutting templates').click();
    await page.getByRole('heading', { name: 'Template pair checked', exact: true }).waitFor({ timeout: 90000 });
    const pending = page.waitForEvent('download'); await button('Download everything (.zip)').click();
    const zip = `${output}/${name}.zip`; await (await pending).saveAs(zip);
    const report = JSON.parse(execFileSync('unzip', ['-p', zip, 'report.json'], { encoding: 'utf8' }));
    const cuts = JSON.parse(execFileSync('unzip', ['-p', zip, 'cut_geometry.json'], { encoding: 'utf8' }));
    assert.equal(report.templateExportAllowed, true); assert.equal(report.manufacturing.status, 'pass');
    assert.deepEqual(report.slits, { left: 3, right: 3 });
    assert.equal(report.input.preprocessing.method, 'red-white-mixture');
    const independent = await renderExportedWeave(cuts, 128);
    row.independentImageError = independent.mask.reduce((s, v, i) => s + Number(v !== prepared.mask[i]), 0) / prepared.mask.length;
    assert.ok(row.independentImageError < .01);
    row.checks.push('Fresh solve exports three slits per sheet with colour provenance and independently checked fidelity');
    if (process.env.INVERSE_RECROP_ARCHIVE) {
      const root = process.env.INVERSE_RECROP_ARCHIVE;
      for (const c of JSON.parse(await fs.readFile(`${root}/cases.json`))) {
        await page.locator('input[type=file]').setInputFiles(`${root}/inputs/cases/${c.id}/rectified.png`); await idle();
        await page.getByLabel(/^Image area/).selectOption('square');
        const conversion = page.locator('details').filter({ has: page.getByText('Image conversion', { exact: true }) });
        if (!(await conversion.evaluate(e => e.open))) await conversion.locator('summary').click();
        await page.getByLabel('Tracing resolution (pixels)', { exact: true }).fill('256');
        await button('Prepare artwork').click(); await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
        const mask = await page.evaluate(() => Array.from(window.mixturePreview.mask));
        const rgba = await fs.readFile(`${root}/inputs/cases/${c.id}/rectified.rgba`);
        const rgb = Uint8Array.from({ length: 256 * 256 * 3 }, (_, i) => rgba[Math.floor(i / 3) * 4 + i % 3]);
        assert.deepEqual(mask, [...quantize(rgb, { mode: 'red-white-mixture' }).mask]);
        row.checks.push(`${c.id}: browser photo classification matches archive input preparation`);
      }
      await button('Binary mask').click();
      await page.screenshot({ path: `${output}/${name}-photograph.png`, fullPage: true });
    }
    assert.deepEqual(row.pageErrors, []);
  } catch (e) {
    row.error = e.stack; process.exitCode = 1; console.error(e);
    if (page) await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true });
  } finally { await browser.close(); await fs.writeFile(`${output}/results.json`, JSON.stringify({ origin, results }, null, 2)); }
  console.log(name, row.checks);
}
console.log(output);
