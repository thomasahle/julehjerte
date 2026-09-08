/** Real HTTP integration checks for crop fitting, rectangle selection and edits.
 * Optional INVERSE_TEST_COLLAGE=1 includes the user's local sRGB collage and its recorded raw pixels.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { heartPhoto } from './crop-fixture.mjs';
import { rectifyMotif } from '../../static/inverse/locator/locator.js';
const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.INVERSE_TEST_URL || 'http://127.0.0.1:4173';
const output = `tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g, '-')}-locator`;
await fs.mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const [name, browserType] of Object.entries({ chromium, firefox })) {
  const record = { browser: name, checks: [], pageErrors: [] }; results.push(record);
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1050 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', error => record.pageErrors.push(error.message));
    await page.addInitScript(() => {
      const original = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (...args) {
        if (args[0]?.action === 'detect-crops') window.testCropROI = args[0].input?.roi;
        if (args[0]?.action === 'prepare') window.testCropProvenance = args[0].input?.cropProvenance;
        return original.apply(this, args);
      };
    });
    const button = label => page.getByRole('button', { name: label, exact: true }).first();
    const check = label => { record.checks.push(label); console.log(`${name}: ${label}`); };
    const corners = () => page.locator('.coordinates input').evaluateAll(inputs => [0, 2, 4, 6].map(i => [+inputs[i].value, +inputs[i + 1].value]));
    const waitReady = async () => {
      await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
      try { await page.locator('.photo-preview canvas').waitFor({ timeout: 10000 }); }
      catch (error) {
        record.failedCrop = { roi: await page.evaluate(() => window.testCropROI), text: await page.locator('body').innerText() };
        await page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true });
        throw error;
      }
      await page.waitForFunction(() => document.querySelector('.photo-preview canvas')?.width === 240);
    };
    await page.goto(`${origin}/en/generate/`);
    await page.waitForFunction(() => document.querySelector('fieldset')?.disabled === false);
    const fixture = heartPhoto();
    const fixtureBytes = fixture.canvas.toBuffer('image/png');
    await page.locator('input[type=file]').setInputFiles({ name: 'analytic-heart.png', mimeType: 'image/png', buffer: fixtureBytes });
    await waitReady();
    const quad = await corners();
    for (let i = 0; i < 4; i++) assert.ok(Math.hypot(quad[i][0] - [[190,80],[275,155],[190,230],[105,155]][i][0], quad[i][1] - [[190,80],[275,155],[190,230],[105,155]][i][1]) < 6);
    const displayed = await page.locator('.photo-preview canvas').evaluate(c => Array.from(c.getContext('2d').getImageData(0, 0, 240, 240).data));
    const expected = rectifyMotif({ width: fixture.imageWidth, height: fixture.imageHeight, data: fixture.rgba }, quad.map(p => p.map(v => v - 0.5)), { size: 240 });
    assert.ok(displayed.every((v, i) => Math.abs(v - expected.data[i]) <= 1));
    check('upload → real locator worker → original photo preview agrees with recorded source pixels');

    const first = page.locator('.coordinates input').first();
    await first.fill(String(quad[0][0] + 2));
    await button('Prepare artwork').click();
    await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
    const provenance = await page.evaluate(() => window.testCropProvenance);
    assert.equal(provenance.manuallyEdited, true);
    assert.ok(Math.abs(provenance.acceptedPixelEdgeCorners[0][0] - quad[0][0] - 2) < 1e-8);
    assert.equal(provenance.sourceSha256, hash(fixtureBytes));
    assert.equal(provenance.decodedPixelsSha256, hash(fixture.rgba));
    assert.equal(provenance.locatorVersion, '0.1.0');
    record.acceptedCrop = provenance;
    check('numeric edit invalidates preparation; accepted corners and source hashes reach the engine');

    // Reproduce a top/left/bottom/right manual selection, as in the user's error screenshot.
    const reversed = [quad[0], quad[3], quad[2], quad[1]];
    for (let i = 0; i < 4; i++) for (let axis = 0; axis < 2; axis++) await page.locator('.coordinates input').nth(2 * i + axis).fill(String(reversed[i][axis]));
    const wanted = rectifyMotif({ width: fixture.imageWidth, height: fixture.imageHeight, data: fixture.rgba }, reversed.map(p => p.map(v => v - 0.5)), { size: 240 });
    await page.waitForFunction(expected => {
      const canvas = document.querySelector('.photo-preview canvas');
      const pixels = canvas?.getContext('2d').getImageData(0, 0, 240, 240).data;
      return pixels && pixels.every((v, i) => Math.abs(v - expected[i]) <= 1);
    }, Array.from(wanted.data));
    assert.equal(await page.getByText('These corners do not form a valid crop.', { exact: false }).count(), 0);
    await button('Prepare artwork').click();
    await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
    check('counterclockwise manual corners retain their image orientation and prepare successfully');

    if (process.env.INVERSE_TEST_WINDING_IMAGE) {
      await page.locator('input[type=file]').setInputFiles(path.resolve(process.env.INVERSE_TEST_WINDING_IMAGE));
      await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
      await button('Reset corners').click();
      const manual = [[302, 78], [169, 205], [284, 333], [402, 204]];
      for (let i = 0; i < 4; i++) for (let axis = 0; axis < 2; axis++) await page.locator('.coordinates input').nth(2 * i + axis).fill(String(manual[i][axis]));
      await waitReady();
      await page.waitForFunction(() => {
        const c = document.querySelector('.photo-preview canvas');
        return c?.getContext('2d').getImageData(120, 120, 1, 1).data[3] === 255;
      });
      assert.equal(await page.getByText('These corners do not form a valid crop.', { exact: false }).count(), 0);
      await button('Prepare artwork').click();
      await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
      await page.locator('.photo-preview').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}-yellow-star.png`), fullPage: true });
      record.windingImage = { file: path.basename(process.env.INVERSE_TEST_WINDING_IMAGE), sha256: hash(await fs.readFile(process.env.INVERSE_TEST_WINDING_IMAGE)), corners: manual };
      check('user yellow-star image previews and prepares with top/left/bottom/right corners');
    }

    const scene = heartPhoto({ width: 700, hearts: [[190,80,85,75,-85,75],[520,80,85,75,-85,75]] });
    await page.locator('input[type=file]').setInputFiles({ name: 'two-hearts.png', mimeType: 'image/png', buffer: scene.canvas.toBuffer('image/png') });
    await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
    await button('Select one heart').click();
    const drag = async (from, to, width, height) => {
      const element = page.locator('.crop-image'); await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      await page.mouse.move(box.x + from[0] / width * box.width, box.y + from[1] / height * box.height);
      await page.mouse.down();
      await page.mouse.move(box.x + to[0] / width * box.width, box.y + to[1] / height * box.height, { steps: 6 });
      await page.mouse.up();
    };
    await drag([415,45], [625,240], 700,320); await waitReady();
    const chosen = await corners(); assert.ok(Math.abs(chosen[0][0] - 520) < 6);
    await drag(chosen[0], [chosen[0][0] + 5, chosen[0][1] + 3], 700,320);
    const moved = await corners(), display = await page.locator('.crop-image').boundingBox();
    record.drag = { before: chosen[0], after: moved[0], requestedDelta: [5, 3], displayPixelInSource: 700 / display.width };
    // Firefox rounds pointer positions to CSS pixels; require agreement within one displayed pixel.
    assert.ok(Math.abs(moved[0][0] - chosen[0][0] - 5) < 700 / display.width + 0.1, JSON.stringify(record.drag));
    assert.ok(Math.abs(moved[0][1] - chosen[0][1] - 3) < 320 / display.height + 0.1, JSON.stringify(record.drag));
    check('rough rectangle selects the second heart; pointer dragging moves its corner without resetting the crop');
    await button('Prepare artwork').click(); await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
    await button('Select one heart').click();
    await button('Reset corners').click();
    assert.equal(await page.locator('.photo-preview canvas').count(), 0);
    assert.equal(await button('Find cutting templates').isDisabled(), true);
    check('manual reset clears stale photo and prepared artwork');

    if (process.env.INVERSE_TEST_COLLAGE === '1') {
      const catalog = JSON.parse(await fs.readFile('scripts/inverse/collage-rois.json', 'utf8'));
      await page.locator('input[type=file]').setInputFiles(path.resolve(catalog.file));
      await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
      const decodedHash = await page.evaluate(async () => {
        const bitmap = await createImageBitmap(document.querySelector('input[type=file]').files[0]);
        const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, c.width, c.height).data)), v => v.toString(16).padStart(2, '0')).join('');
      });
      assert.equal(decodedHash, hash(await fs.readFile(catalog.rgbaFile)));
      await button('Select one heart').click();
      const region = catalog.cases.find(c => c.id === 'outline-star').roi;
      await drag(region.slice(0, 2), region.slice(2), catalog.width, catalog.height); await waitReady();
      record.collageCorners = await corners(); record.collagePixelsSha256 = decodedHash;
      await page.screenshot({ path: path.join(output, `${name}-collage.png`), fullPage: true });
      check('user collage uses exactly the benchmark sRGB pixels; a selected photo region yields a reviewable crop');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `${name}-mobile.png`), fullPage: true });
    check('crop controls and photo preview fit a mobile viewport');
    assert.deepEqual(record.pageErrors, []);
  } catch (error) { record.error = error.stack; console.error(error); process.exitCode = 1; }
  finally { await browser.close(); await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2)); }
}
console.log(`Locator browser evidence: ${output}`);
