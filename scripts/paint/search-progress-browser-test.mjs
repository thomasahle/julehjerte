/** Production Paint controls and live progress, using a fresh free-border hat. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {topHatFixture} from '../inverse/motif-fixture.mjs';
import {installPaintObservation, collectPaintObservation} from '../inverse/paint-observer.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.INVERSE_TEST_URL || 'http://127.0.0.1:5232';
const output = process.env.INVERSE_TEST_OUTPUT || 'tmp/paint-search-progress';
await fs.mkdir(output, {recursive: true});
const input = path.join(output, 'hat.png');
await fs.writeFile(input, topHatFixture(200));
const loader = await createServer({configFile: false, server: {middlewareMode: true, hmr: false}});
const {fitHeart, toScreen} = await loader.ssrLoadModule('/src/lib/paint/heartLayout.ts');
const {handlePoint} = await loader.ssrLoadModule('/src/lib/paint/frame.ts');
const browser = await chromium.launch({headless: true});
const results = [];

try {
  for (const viewport of [{width: 1440, height: 950}, {width: 390, height: 844}]) {
    const context = await browser.newContext({viewport});
    const row = {viewport, pageErrors: []};
    results.push(row);
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => row.pageErrors.push(error.message));
      await page.addInitScript(installPaintObservation);
      await page.addInitScript(() => {
        // Observe real progress without injecting fitted geometry or changing the worker.
        window.__liveQA = {events: [], displays: []};
        const Worker = window.Worker;
        window.Worker = class extends Worker {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', ({data}) => {
              if (data.type === 'progress') window.__liveQA.events.push(data.event);
            });
          }
        };
        document.addEventListener('DOMContentLoaded', () => {
          let previous = '';
          new MutationObserver(() => {
            const counts = [...document.querySelectorAll('.attempt-counts')].map(el => el.textContent.trim());
            const numbers = document.querySelector('.numbers')?.textContent.trim() || '';
            const key = JSON.stringify({counts, numbers});
            if (counts.length && key !== previous) window.__liveQA.displays.push({counts, numbers});
            previous = key;
          }).observe(document.documentElement, {subtree: true, childList: true, characterData: true});
        });
      });
      const button = name => page.getByRole('button', {name, exact: true}).first();
      await page.goto(`${origin}/en/editor/paint/`);
      await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--paper-left') !== '');
      const hint = button('Explanation: Border');
      await hint.focus();
      await hint.press('Enter');
      assert.equal(await hint.getAttribute('aria-expanded'), 'true');
      await hint.press('Enter');
      assert.equal(await hint.getAttribute('aria-expanded'), 'false');

      await button('Import picture').click();
      await page.locator('input[type=file]').setInputFiles(input);
      await button('The whole picture').click();
      await button('Use as mask').click();
      await page.getByRole('radio', {name: 'Free', exact: true}).click();
      const slider = page.locator('#paint-frame-size');
      assert.equal(await slider.inputValue(), '64');
      const canvas = page.locator('canvas').first();
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      const layout = fitHeart(box.width, box.height, 24);
      const point = size => {
        const p = handlePoint({mode: 'free', shape: 'diamond', size}, 'right');
        const s = toScreen(layout, p.x, p.y);
        return {x: box.x + s.x, y: box.y + s.y};
      };
      const from = point(.64), to = point(.74);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, {steps: 8});
      await page.mouse.up();
      assert.ok(Math.abs(Number(await slider.inputValue()) - 74) <= 1, 'Dragging the canvas handle updates the frame size.');
      row.dragSize = Number(await slider.inputValue());
      await slider.focus();
      await slider.press('End');
      assert.equal(await slider.inputValue(), '84');

      // Every required radio retains its selection on repeated pointer/keyboard activation.
      for (const label of ['Border', 'Brush', 'Paints with', 'Between lobes symmetry']) {
        const group = page.getByRole('radiogroup', {name: label, exact: true});
        const selected = group.getByRole('radio', {checked: true});
        await selected.click();
        await selected.press('Space');
        assert.equal(await group.getByRole('radio', {checked: true}).count(), 1);
      }
      await button('Find the cuts').click();
      await page.waitForFunction(() => document.querySelectorAll('.attempt-counts').length > 0);
      assert.equal(await page.getByRole('radio', {name: 'Free', exact: true}).isDisabled(), true);
      await page.screenshot({path: path.join(output, `${viewport.width}-searching.png`), fullPage: true});
      await button('Stop').click();
      await button('Find the cuts').waitFor();
      assert.equal(await page.locator('.attempt-counts').count(), 0);
      await page.evaluate(() => {window.__liveQA = {events: [], displays: []};});
      await button('Find the cuts').click();
      await button('Open in Draw').waitFor({timeout: 190000});
      const observation = await page.evaluate(collectPaintObservation);
      assert.equal(observation.error, null);
      assert.ok(observation.prepared.weights, 'The merged page must send the protected-region weights.');
      assert.equal(observation.result.report.validation.passed, true);
      assert.equal(observation.result.report.manufacturing.status, 'pass');
      const progress = await page.evaluate(() => window.__liveQA);
      const expected = new Set(progress.events.filter(event => event.counts).map(event => event.counts.map(count => count + 1).join(' + ')));
      assert.ok(progress.displays.length > 0, 'The real worker must update visible progress.');
      for (const display of progress.displays) {
        for (const counts of display.counts) assert.ok(expected.has(counts), `Unexpected displayed strip counts: ${counts}`);
        const pair = display.numbers.match(/(\d+ \+ \d+) strips/);
        if (pair) assert.ok(expected.has(pair[1]), `Unexpected stage strip counts: ${pair[1]}`);
      }
      row.progressEvents = progress.events.length;
      row.progressDisplays = progress.displays.length;
      row.error = observation.result.report.imageError.mismatchFraction;
      await fs.writeFile(path.join(output, `${viewport.width}-progress.json`), JSON.stringify(progress, null, 2));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The page must not overflow horizontally.');
      await page.screenshot({path: path.join(output, `${viewport.width}-result.png`), fullPage: true});
      assert.deepEqual(row.pageErrors, []);
      row.passed = true;
    } catch (error) {
      row.failure = String(error.stack || error);
      throw error;
    } finally {
      await context.close();
      await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({origin, results}, null, 2));
    }
  }
} finally {
  await browser.close();
  await loader.close();
}
console.log(JSON.stringify(results));
