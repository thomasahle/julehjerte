#!/usr/bin/env node
/**
 * Bounded archive QA in our own Chromium, one page and no external downloads.
 * Run only when the shared machine is free for a browser worker:
 *   ARCHIVE_TEST_URL=http://localhost:4173 node scripts/archive/browser-qa.mjs
 * PLAYWRIGHT_MODULE and PLAYWRIGHT_CHROME override the install/browser binary.
 * ARCHIVE_QA_DIR optionally saves three viewport screenshots (never full-page).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = new URL(process.env.ARCHIVE_TEST_URL || 'http://localhost:4173').origin;
const executablePath = process.env.PLAYWRIGHT_CHROME ||
  '/Users/ahle/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const shots = process.env.ARCHIVE_QA_DIR;
if (shots) await mkdir(shots, { recursive: true });

const copy = {
  da: { route: '/all/', title: 'Alle de hjerter, vi har fundet', search: 'Søg i arkivet', source: 'Kilde', availability: 'Skabeloner', next: 'Næste', previous: 'Forrige' },
  en: { route: '/en/all/', title: 'All the hearts we have found', search: 'Search the archive', source: 'Source', availability: 'Templates', next: 'Next', previous: 'Previous' }
};
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];
const pageErrors = [];
const remoteImages = [];
const failedLocalResponses = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin) {
      if (request.resourceType() === 'image') remoteImages.push(request.url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    if (new URL(response.url()).origin === origin && response.status() >= 400) {
      failedLocalResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  const count = async expected => {
    await page.waitForFunction(n => document.querySelectorAll('main.archive article.record').length === n, expected);
    assert.ok(await page.locator('main.archive article.record').count() <= 60);
  };
  const screenshot = async name => {
    if (shots) await page.screenshot({ path: path.join(shots, name), fullPage: false });
  };

  for (const [lang, labels] of Object.entries(copy)) {
    const response = await page.goto(`${origin}${labels.route}`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), labels.title);
    await count(60);
    const search = page.getByRole('searchbox', { name: labels.search, exact: true });
    const source = page.getByRole('combobox', { name: labels.source, exact: true });
    const availability = page.getByRole('combobox', { name: labels.availability, exact: true });
    const initialId = await page.locator('article.record').first().getAttribute('id');

    await page.getByRole('button', { name: labels.next, exact: true }).first().click();
    await page.waitForFunction(id => document.querySelector('article.record')?.id !== id, initialId);
    await count(60);
    await page.getByRole('button', { name: labels.previous, exact: true }).first().click();
    await page.waitForFunction(id => document.querySelector('article.record')?.id === id, initialId);

    // These later source entries must be found even though their cards were
    // never mounted on the first page. The failed PDF stays reference-only.
    await search.fill('Carola Heesemann');
    await page.locator('#jhd-carola-super-nova').waitFor();
    await page.locator('#jhd-damernes').waitFor();
    assert.equal(await page.locator('#jhd-damernes .links a').count(), 0);
    await search.fill('');
    await source.selectOption('hunodan.dk');
    await count(27);
    await availability.selectOption('references');
    await count(0);
    await page.locator('.empty').waitFor();
    await availability.selectOption('all');
    await count(27);
    await source.selectOption('');
    await count(60);

    await search.fill('Spejderliv');
    const saved = page.locator('#spejderliv-julehjerter');
    // Published Juleflet hearts credited to this publisher also match.
    await saved.waitFor();
    const licence = saved.getByRole('link', { name: 'CC BY-NC-SA 4.0', exact: true });
    assert.ok(await licence.isVisible());
    assert.equal(await licence.getAttribute('href'), 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
    assert.ok((await saved.textContent()).includes('Kim G. L. Pedersen'));
    const href = await saved.locator('a[href*="/archive/templates/"]').getAttribute('href');
    const pdfUrl = new URL(href, page.url());
    assert.equal(pdfUrl.origin, origin);
    const pdf = await context.request.get(pdfUrl.href);
    assert.equal(pdf.status(), 200);
    assert.match(pdf.headers()['content-type'], /application\/pdf/);
    const bytes = await pdf.body();
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), path.basename(pdfUrl.pathname, '.pdf'));
    await screenshot(`archive-${lang}-desktop.png`);
    results.push({ lang, pagination: true, sourceAndAvailabilityFilters: true, fullIndexSearch: true, savedPdfBytes: bytes.length });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('searchbox', { name: copy.en.search, exact: true }).fill('');
  await count(60);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile page must not overflow horizontally');
  await page.getByRole('button', { name: copy.en.next, exact: true }).first().click();
  await count(60);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile pagination must remain within the viewport');
  await screenshot('archive-en-mobile.png');
  assert.deepEqual(remoteImages, [], 'archive must not request bulk third-party images');
  assert.deepEqual(pageErrors, [], 'no browser runtime errors');
  assert.deepEqual(failedLocalResponses, [], 'local thumbnails, scripts and styles must be available');
  console.log(JSON.stringify({ passed: true, results, mobileWidth: 390, maximumVisibleRecords: 60, remoteImageRequests: 0 }, null, 2));
} finally {
  await browser.close();
}
