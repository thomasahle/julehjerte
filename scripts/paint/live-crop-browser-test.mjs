/**
 * The import dialog's live crop, in a real browser — PAINT.md §2.
 *
 * The claim is about a moment that no unit test can reach: what the preview
 * shows *between* a corner moving and the engine answering. `drawHeart.test.ts`
 * pins that a crop and a mask are drawn in the same places, and
 * `rectify.test.ts` pins the corner conversion, but only a browser can say
 * whether the canvas actually repaints under a finger that has not been lifted
 * — and whether the two-colour mask then replaces it.
 *
 * So this drags a corner over a real photograph of a real woven heart and reads
 * the preview canvas back: many colours while the pointer is down (a
 * photograph), the paper pair once it is up (a mask), and the last good frame
 * kept when the corners are dragged into a crop that folds over. What the page
 * asks the engine is counted at the worker, so "not asked until the corner
 * lands" is read off the requests themselves rather than off a status line.
 *
 * Run it against a built site:
 *
 *     npm run build
 *     (cd build && python3 -m http.server 5371)
 *     PAINT_TEST_URL=http://127.0.0.1:5371 npm run test:paint:live-crop
 *
 * `PLAYWRIGHT_MODULE` points at a playwright install if the project has none;
 * `PLAYWRIGHT_CHROME` at a browser binary; `PAINT_QA_DIR` at where the
 * screenshots go (docs/redesign/qa by default, which is git-ignored).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.PAINT_TEST_URL || 'http://127.0.0.1:5371';
const shots = process.env.PAINT_QA_DIR || 'docs/redesign/qa';
const photo = process.env.PAINT_QA_PHOTO || 'static/hearts/photos/5star.jpg';

await fs.mkdir(shots, { recursive: true });
const shot = (name) => path.join(shots, `live-crop-${name}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Which colours the preview canvas is showing, and how much of it each covers.
 *
 * A grid over the whole heart, so the lobes are counted as well as the woven
 * square: the mask and the crop share the lobes, and the question is what is
 * between them.
 */
const SAMPLE = `(() => {
  const canvas = document.querySelector('.preview canvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const seen = new Map();
  for (let gy = 0; gy < 24; gy++) {
    for (let gx = 0; gx < 24; gx++) {
      const x = Math.round(((gx + 0.5) / 24) * canvas.width);
      const y = Math.round(((gy + 0.5) / 24) * canvas.height);
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      if (a < 128) continue;
      const key = r + ',' + g + ',' + b;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const colours = [...seen.entries()].sort((a, b) => b[1] - a[1]);
  return { colours, total: colours.reduce((n, [, c]) => n + c, 0) };
})()`;

/**
 * Count what the page asks the engine, by action.
 *
 * "The engine is idle during the drag" is the requirement, and the engine is a
 * worker: one `postMessage` per request (`InverseWorker.request`). Reading that
 * directly says what a status line cannot — a hint that merely failed to render
 * would pass for silence — and it tells a corner search apart from a prepare,
 * which is what the debounce is about.
 */
const COUNT_ENGINE_CALLS = () => {
	window.__enginePosts = [];
	const post = Worker.prototype.postMessage;
	Worker.prototype.postMessage = function (...args) {
		window.__enginePosts.push(args[0]?.action ?? '?');
		return post.apply(this, args);
	};
};

const results = [];
function check(name, ok, detail) {
	results.push({ name, ok: !!ok });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/** Two samples as one comparable string, so "did anything repaint" is one test. */
const fingerprint = (s) => (s ? s.colours.map(([c, n]) => `${c}:${n}`).join('|') : '');

/** Two painted frames, so a canvas drawn inside a requestAnimationFrame is up. */
const settled = (page) =>
	page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');

const browser = await playwright.chromium.launch({
	headless: true,
	...(process.env.PLAYWRIGHT_CHROME ? { executablePath: process.env.PLAYWRIGHT_CHROME } : {})
});
try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
	page.on('console', (m) => m.type() === 'error' && console.log('  [console]', m.text().slice(0, 200)));
	await page.addInitScript(COUNT_ENGINE_CALLS);

	/** What the page has asked the engine so far, oldest first. */
	const engineCalls = () => page.evaluate('window.__enginePosts.slice()');

	/** Open the import dialog on a picture, as the visitor does. */
	async function openWith(file) {
		await page.getByRole('button', { name: 'Importér billede' }).first().click();
		await page.locator('#paint-import-title').waitFor();
		await page.locator('input[type=file]').setInputFiles(file);
		await page.locator('.photo img').waitFor();
	}

	/**
	 * The same, left with four corners on the picture.
	 *
	 * The engine's corner search runs in a worker and may find nothing in a
	 * photograph this cluttered; either way the visitor ends with four corners,
	 * so the fallback is the dialog's own "Sæt selv" and the test carries on.
	 */
	async function openWithFourCorners() {
		await openWith(photo);
		let found = 0;
		for (let i = 0; i < 60 && found !== 4; i++) {
			await sleep(500);
			found = await page.locator('.photo .corner').count();
		}
		if (found !== 4) {
			console.log(
				`  (no automatic corners — "${await page.locator('.picture .hint').innerText()}")`
			);
			await page.getByRole('button', { name: 'Sæt selv' }).click();
			const box = await page.locator('.photo').boundingBox();
			for (const [fx, fy] of [
				[0.5, 0.08],
				[0.93, 0.5],
				[0.5, 0.95],
				[0.06, 0.5]
			]) {
				await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
				await sleep(120);
			}
			found = await page.locator('.photo .corner').count();
		}
		return found;
	}

	await page.goto(`${origin}/editor/mal/`, { waitUntil: 'networkidle' });
	const corners = await openWithFourCorners();
	check('four corners on the picture', corners === 4, `${corners}`);

	// Four corners is a crop, so the crop is already showing — this is the same
	// live picture the "Sæt selv" path gets, before any drag.
	await page.waitForFunction("!!document.querySelector('.preview canvas')", null, { timeout: 20000 });
	await settled(page);
	const placed = await page.evaluate(SAMPLE);
	check(
		'the crop shows as soon as four corners exist',
		placed && placed.colours.length > 8,
		`${placed?.colours.length} distinct colours`
	);
	await page.locator('.preview').screenshot({ path: shot('1-placed') });

	// --- Drag a corner and read the canvas without letting go. ---
	const marker = await page.locator('.photo .corner').first().boundingBox();
	const picture = await page.locator('.photo').boundingBox();
	const from = { x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 };
	const before = await page.evaluate(SAMPLE);
	const askedBeforeDrag = (await engineCalls()).length;

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	const during = [];
	for (let i = 1; i <= 6; i++) {
		await page.mouse.move(from.x + (picture.width * 0.22 * i) / 6, from.y + (picture.height * 0.2 * i) / 6, {
			steps: 4
		});
		await settled(page);
		during.push(await page.evaluate(SAMPLE));
	}
	const dragged = during[during.length - 1];
	await page.locator('.preview').screenshot({ path: shot('2-dragging') });

	const moved = during.filter((s) => fingerprint(s) !== fingerprint(before)).length;
	check('the preview changes while the corner is still held down', moved > 0, `${moved}/6 frames differ`);
	check(
		'and it is the photograph: many colours, not two',
		dragged.colours.length > 8,
		`${dragged.colours.length} distinct colours`
	);
	const askedDuringDrag = (await engineCalls()).slice(askedBeforeDrag);
	check(
		'the engine is not asked while the corner is held',
		askedDuringDrag.length === 0,
		`${askedDuringDrag.length} worker requests across ${during.length} moves`
	);

	// --- Let go: the engine is asked once, and its mask replaces the crop. ---
	await page.mouse.up();
	await page.waitForFunction(
		"!!document.querySelector('.controls .hint') && !/Beregner|beskærer/.test(document.querySelector('.controls .hint').textContent)",
		null,
		{ timeout: 180000 }
	);
	await settled(page);
	const after = await page.evaluate(SAMPLE);
	await page.locator('.preview').screenshot({ path: shot('3-mask') });
	await page.screenshot({ path: shot('4-dialog') });

	const askedOnRelease = (await engineCalls()).slice(askedBeforeDrag);
	check(
		'and it is asked once the corner lands',
		askedOnRelease.filter((a) => a === 'prepare').length === 1,
		askedOnRelease.join(', ') || 'nothing'
	);

	// Only colours covering a real share of the samples count as paper: the rims
	// of the lobes are antialiased against the panel and would otherwise read as
	// a third and fourth colour.
	const paper = after.colours.filter(([, n]) => n >= after.total * 0.02);
	check(
		'after release the preview is the two paper colours',
		paper.length <= 2,
		paper.map(([c, n]) => `${c} ×${n}`).join('  ')
	);
	check(
		'and the mask is a fraction of the crop it replaced',
		after.colours.length * 8 < dragged.colours.length,
		`${dragged.colours.length} colours dragging → ${after.colours.length} after`
	);

	// --- A crop that folds over keeps the last good frame. ---
	const third = await page.locator('.photo .corner').nth(2).boundingBox();
	const first = await page.locator('.photo .corner').first().boundingBox();
	await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
	await page.mouse.down();
	await page.mouse.move(third.x + third.width / 2, third.y + third.height * 1.5, { steps: 8 });
	await settled(page);
	const folded = await page.evaluate(SAMPLE);
	const says = await page.locator('.picture .hint').innerText();
	await page.mouse.up();
	await page.locator('.preview').screenshot({ path: shot('5-invalid') });
	check(
		'a crop that folds over keeps its last good frame',
		folded && folded.colours.length > 8,
		`${folded?.colours.length} distinct colours still drawn`
	);
	check('and the picture says the corners are wrong', /uden knæk/.test(says), JSON.stringify(says.slice(0, 60)));

} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
