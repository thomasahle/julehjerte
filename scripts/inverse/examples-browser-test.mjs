/** Exercise each example as a one-click action, including recovery and mobile feedback. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { heartPhoto } from './crop-fixture.mjs';
const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.INVERSE_TEST_URL || 'http://127.0.0.1:4173';
const output = `tmp/inverse-browser/${new Date().toISOString().replace(/[:.]/g, '-')}-examples`;
await fs.mkdir(output, { recursive: true });
const results = [];
for (const [name, browserType] of Object.entries({ chromium, firefox })) {
  const record = { browser: name, checks: [], pageErrors: [] }; results.push(record);
  const browser = await browserType.launch({ headless: true });
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1050 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    page = await context.newPage();
    page.on('pageerror', error => record.pageErrors.push(error.message));
    const button = label => page.getByRole('button', { name: label, exact: true }).first();
    const check = label => { record.checks.push(label); console.log(`${name}: ${label}`); };
    const fresh = async (route = '/en/generate/') => {
      await page.goto(origin + route);
      await page.waitForFunction(() => document.querySelector('fieldset')?.disabled === false);
    };
    const verifyExample = async example => {
      await button(example).click();
      if (!example.startsWith('JUL')) {
        await page.getByRole('heading', { name: 'Inspect your pattern', exact: true }).waitFor();
        assert.equal(await button('Find cutting templates').isEnabled(), true);
        assert.equal(await page.locator('.filename').innerText(), example.startsWith('Star') ? 'star.png' : 'waves.svg');
      } else {
        await page.getByText('Saved templates · new check', { exact: true }).waitFor({ timeout: 60000 });
        const report = JSON.parse(await page.locator('.report pre').textContent());
        assert.equal(report.solver.imported, true);
        assert.equal(await page.locator('.filename').innerText(), `${example.startsWith('Star') ? 'star' : 'jul'}.saved.json`);
      }
      assert.equal(await page.locator('.preview-panel .empty').count(), 0);
      assert.equal(await page.locator('.preview-panel [role=alert]').count(), 0);
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.preview-panel img')).some(image => image.complete && image.naturalWidth > 0));
    };
    for (const example of ['Waves · new solve', 'Star · new solve', 'JUL · saved templates']) {
      await fresh();
      await verifyExample(example);
      check(`${example}: one click on a fresh page produces a rendered preview`);
    }

    const input = heartPhoto(), bytes = input.canvas.toBuffer('image/png');
    for (const example of ['Waves · new solve', 'Star · new solve', 'JUL · saved templates']) {
      await page.locator('input[type=file]').setInputFiles({ name: 'test-heart.png', mimeType: 'image/png', buffer: bytes });
      await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
      const crossed = [[190,80],[190,230],[275,155],[105,155]];
      for (let i = 0; i < 4; i++) for (let axis = 0; axis < 2; axis++) await page.locator('.coordinates input').nth(2 * i + axis).fill(String(crossed[i][axis]));
      await page.getByText('These corners do not form a valid crop.', { exact: false }).waitFor();
      await verifyExample(example);
      assert.equal(await page.locator('.crop-section').count(), example.startsWith('Star') ? 1 : 0);
      assert.equal(await page.locator('input[type=file]').inputValue(), '');
      check(`${example}: replaces an uploaded image with an invalid crop and clears its file control`);
    }

    await page.locator('input[type=file]').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><script>window.injected=true</script></svg>') });
    await button('Prepare artwork').click();
    await page.getByRole('heading', { name: 'Could not process this artwork', exact: true }).waitFor();
    await verifyExample('Waves · new solve');
    check('example recovers from a rejected upload');

    await verifyExample('JUL · saved templates');
    await context.route('**/inverse/examples/waves.svg', route => route.fulfill({ status: 404, body: 'Missing example' }));
    await button('Waves · new solve').click();
    await page.getByRole('heading', { name: 'Could not process this artwork', exact: true }).waitFor();
    assert.equal(await page.locator('.downloads').count(), 0);
    assert.equal(await button('Find cutting templates').isDisabled(), true);
    await context.unroute('**/inverse/examples/waves.svg');
    await verifyExample('Waves · new solve');
    check('failed example request clears old downloads and offers a working retry');

    await button('JUL · saved templates').click();
    await button('Stop').click();
    await page.getByText('Stopped. Prepare the artwork again to start a new search.', { exact: true }).waitFor();
    assert.equal(await page.locator('.downloads').count(), 0);
    await verifyExample('JUL · saved templates');
    check('automatic saved-template check can be stopped; another example starts with a fresh worker');

    await page.setViewportSize({ width: 390, height: 844 });
    await fresh();
    await verifyExample('Waves · new solve');
    await page.waitForFunction(() => {
      const rect = document.querySelector('.preview-panel').getBoundingClientRect();
      return rect.top < innerHeight / 2 && rect.top >= 0;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `${name}-mobile-waves.png`), fullPage: true });
    check('mobile example scrolls its rendered preview into view without overflow');

    await page.setViewportSize({ width: 1400, height: 1050 });
    await fresh('/generate/');
    await button('Bølger · ny beregning').click();
    await page.getByRole('heading', { name: 'Se dit mønster efter', exact: true }).waitFor();
    check('Danish example also opens its preview with one click');
    assert.deepEqual(record.pageErrors, []);
  } catch (error) {
    record.error = error.stack; process.exitCode = 1; console.error(error);
    if (page) await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ origin, results }, null, 2));
  }
}
console.log(`Example QA evidence: ${output}`);
