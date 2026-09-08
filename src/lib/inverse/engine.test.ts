import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMask, MASK_SIZE, type Mask } from '$lib/paint/mask';
import { insideCell } from '$lib/paint/frame';
import { symmetrize } from '$lib/paint/symmetry';
import {
	ADVANCED_LIMITS,
	clampAdvanced,
	ENGINE_SYMMETRY,
	engineSymmetry,
	frameWeights,
	maskPrepareSettings,
	maskToPixels,
	solveSettings,
	type ImportSettings
} from '$lib/inverse/engine';
// The engine's own `prepare` — the exact call the worker makes for a 'prepare'
// request. Importing it here is what makes the round trip below a proof rather
// than a re-implementation; see engine-modules.d.ts for why it comes in through
// the `$inverse` alias.
import { prepare } from '$inverse/core/engine.js';
// And the engine's own reading of a settings object, which is what says whether
// a key we send means anything at all.
import { settings as engineSettings } from '$inverse/core/settings.js';

const COLORS = { left: '#ffffff', right: '#b91313' };

const NO_SYMMETRY = { curve: 'off', lobe: 'off', lobes: 'off' } as const;

/**
 * Send a mask to the engine exactly as `prepareMask` does, and read back the
 * cells it classified.
 */
function roundTrip(mask: Mask, colors = COLORS): Uint8Array {
	const { preview } = prepare(maskToPixels(mask, colors), maskPrepareSettings(colors));
	expect(preview.resolution).toBe(mask.size);
	return preview.mask;
}

/** A drawing with no symmetry at all, so a flip or a transpose would show. */
function scribble(): Mask {
	const mask = createMask(0);
	const n = mask.size;
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const inCorner = x < n / 4 && y > n / 3 && y < n / 2;
			const inBand = x + 2 * y > 1.7 * n && x + 2 * y < 1.9 * n;
			const inDot = (x - 300) ** 2 + (y - 90) ** 2 < 40 ** 2;
			mask.data[y * n + x] = inCorner || inBand || inDot ? 1 : 0;
		}
	}
	return mask;
}

describe('the mask round trip', () => {
	it('comes back from prepare cell for cell', () => {
		const mask = scribble();
		expect(roundTrip(mask)).toEqual(mask.data);
	});

	it('survives a symmetric mask too, which takes the engine down another road', () => {
		// A mask that is symmetric under the transpose and both mirrors makes
		// `prepareAutomatic` consider its angular route, which prepares a second
		// time with different settings. `preview.mask` is the classified crop
		// either way, and this is what says so.
		const mask = scribble();
		symmetrize(mask, ['transpose', 'mirrorX', 'mirrorY']);
		expect(roundTrip(mask)).toEqual(mask.data);
	});

	it('paints 1 in the right lobe colour and 0 in the left', () => {
		// The convention the whole paint mode rests on. Two cells are enough to
		// pin it, and the pixels are read straight out of what we send.
		const mask = createMask(0);
		mask.data[0] = 1;
		const { rgba } = maskToPixels(mask, COLORS);
		expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([0xb9, 0x13, 0x13, 255]);
		expect([rgba[4], rgba[5], rgba[6], rgba[7]]).toEqual([0xff, 0xff, 0xff, 255]);
	});

	it('keeps the mapping when the visitor picks other paper', () => {
		const colors = { left: '#0b3d0b', right: '#f5c542' };
		const mask = scribble();
		expect(roundTrip(mask, colors)).toEqual(mask.data);
	});

	it('falls back to the site paper for a colour the engine would refuse', () => {
		// The colour store still holds its default red as `rgb(185, 19, 19)`, and
		// the engine takes `#rrggbb` only.
		const mask = scribble();
		expect(roundTrip(mask, { left: '#ffffff', right: 'rgb(185, 19, 19)' })).toEqual(mask.data);
	});

	it('sends the swatches right colour first, which is what makes 1 the right lobe', () => {
		const settings = maskPrepareSettings(COLORS);
		expect(settings.mode).toBe('swatches');
		expect(settings.swatches).toEqual([COLORS.right, COLORS.left]);
		expect(settings.paperColors).toEqual([COLORS.right, COLORS.left]);
		expect(settings.resolution).toBe(MASK_SIZE);
	});

	it('leaves a stray cell alone: the mask is a drawing, not a photograph', () => {
		const settings = maskPrepareSettings(COLORS);
		expect(settings.removeSpecks).toBe(0);
		expect(settings.fillHoles).toBe(0);
		const mask = createMask(0);
		mask.data[201 * mask.size + 201] = 1;
		expect(roundTrip(mask)[201 * mask.size + 201]).toBe(1);
	});
});

describe('the settings a search is run with', () => {
	it('sends the checkbox as the key the fitter reads', () => {
		// `preferMatchingSheets` is in the engine's DEFAULTS and is read by
		// core/direct/fit.js and core/direct/prefer-matching.js. `identicalSheets`
		// is neither: it is a prepare-time key, and a solve never sees it.
		const on = solveSettings({ colors: COLORS, symmetry: NO_SYMMETRY, matchingSheets: true });
		const off = solveSettings({ colors: COLORS, symmetry: NO_SYMMETRY, matchingSheets: false });
		expect(on.preferMatchingSheets).toBe(true);
		expect(off.preferMatchingSheets).toBe(false);
		// The preset brings its own `identicalSheets`; the checkbox must not ride on
		// it, and the engine throws it away at solve time in any case.
		expect(on.identicalSheets).toBe(off.identicalSheets);
		expect(engineSettings(on)).not.toHaveProperty('identicalSheets');
	});

	it('follows Mellem lapper: Sym when the visitor has not touched the checkbox', () => {
		const sym = solveSettings({ colors: COLORS, symmetry: { ...NO_SYMMETRY, lobes: 'sym' } });
		expect(sym.preferMatchingSheets).toBe(true);
		expect(solveSettings({ colors: COLORS, symmetry: NO_SYMMETRY }).preferMatchingSheets).toBe(
			false
		);
	});

	it('survives the engine’s own settings(), which drops what it does not know', () => {
		// The proof that the two keys above are not decoration: `settings()` copies
		// only the keys of its DEFAULTS, so a setting that comes back changed is a
		// setting the engine really has.
		const cfg = engineSettings(
			solveSettings({ colors: COLORS, symmetry: NO_SYMMETRY, matchingSheets: false })
		);
		expect(cfg.preferMatchingSheets).toBe(false);
		expect(cfg.width).toBe(100);
		expect(cfg.minWidth).toBe(2);
	});

	it('clamps the two Avanceret numbers instead of letting the engine throw', () => {
		// `settings()` throws on a width outside [20, 300] — inside the worker, at
		// solve time, where the page can only report it as an engine that failed to
		// load. So a typed 5, or an emptied field's 0, is brought into range here.
		for (const key of ['widthMm', 'minWidthMm'] as const) {
			const [lo, hi] = ADVANCED_LIMITS[key];
			expect(clampAdvanced(key, lo - 1)).toBe(lo);
			expect(clampAdvanced(key, hi + 1)).toBe(hi);
			expect(clampAdvanced(key, Number.NaN)).toBe(key === 'widthMm' ? 100 : 2);
		}
		const extreme = solveSettings({
			colors: COLORS,
			symmetry: NO_SYMMETRY,
			widthMm: 5,
			minWidthMm: 900
		});
		expect(extreme.width).toBe(20);
		expect(extreme.minWidth).toBe(30);
		expect(() => engineSettings(extreme)).not.toThrow();
	});
});

describe('engineSymmetry', () => {
	it('is sent, now that the engine can hold a symmetry itself', () => {
		// PAINT.md §11: the `paint-engine-symmetry` lane has landed on redesign, so
		// the request goes to the fitter rather than being corrected afterwards.
		// The constant is pinned rather than assumed because it decides which of
		// two very different routes a search takes.
		expect(ENGINE_SYMMETRY).toBe(true);
		const asked = solveSettings({
			colors: COLORS,
			symmetry: { curve: 'off', lobe: 'off', lobes: 'sym' }
		});
		expect(asked.symmetry).toEqual({ transpose: true });
		// And the engine really reads it: `settings()` normalises the request and
		// lets the transpose decide the matching sheets for us.
		const cfg = engineSettings(asked);
		expect(cfg.symmetry).toMatchObject({ transpose: true, mirrorX: false, withinCurve: 'off' });
		expect(cfg.preferMatchingSheets).toBe(true);
	});

	it('maps Mellem lapper to the transpose and the anti-transpose', () => {
		expect(engineSymmetry({ curve: 'off', lobe: 'off', lobes: 'sym' })).toEqual({
			transpose: true
		});
		expect(engineSymmetry({ curve: 'off', lobe: 'off', lobes: 'anti' })).toEqual({
			antiTranspose: true
		});
	});

	it('maps Inden i lap to both mirrors and to the half turn', () => {
		expect(engineSymmetry({ curve: 'off', lobe: 'sym', lobes: 'off' })).toEqual({
			mirrorX: true,
			mirrorY: true
		});
		expect(engineSymmetry({ curve: 'off', lobe: 'anti', lobes: 'off' })).toEqual({
			rotate180: true
		});
	});

	it('passes Inden i kurve through as its own field', () => {
		// The one row that is not a symmetry of the square: it holds per cut. Sym
		// still sends both mirrors, because the mask was painted mirrored and the
		// fitter has to be told both (docs/inverse/SYMMETRY.md's table); Anti has
		// no image on the mask at all, so it travels alone.
		expect(engineSymmetry({ curve: 'sym', lobe: 'off', lobes: 'off' })).toEqual({
			mirrorX: true,
			mirrorY: true,
			withinCurve: 'sym'
		});
		expect(engineSymmetry({ curve: 'anti', lobe: 'off', lobes: 'off' })).toEqual({
			withinCurve: 'anti'
		});
	});

	it('says nothing at all when every row is off', () => {
		expect(engineSymmetry({ curve: 'off', lobe: 'off', lobes: 'off' })).toEqual({});
	});

	it('combines the rows', () => {
		expect(engineSymmetry({ curve: 'sym', lobe: 'sym', lobes: 'sym' })).toEqual({
			transpose: true,
			mirrorX: true,
			mirrorY: true,
			withinCurve: 'sym'
		});
	});
});
/*
 * The engine's door is mostly settings, which the engine itself checks. What is
 * ours to get right is the traffic: one request at a time, in the order it was
 * asked for, and a cancel that stops the work rather than the caller's interest
 * in it. Both are module state shared by every caller, so each test starts from
 * a fresh module and a fresh fake worker.
 */

type FakeWorker = {
	postMessage: ReturnType<typeof vi.fn>;
	terminate: ReturnType<typeof vi.fn>;
	onmessage: ((event: MessageEvent) => void) | null;
};

let workers: FakeWorker[] = [];

/** Let the queue's promises settle, so what has been sent is what will be sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Answer the request a worker was given, by its own id: `InverseWorker` ignores
 * a message whose id is not the one it is waiting for, and a stopped worker
 * leaves a gap in the numbering.
 */
function reply(worker: FakeWorker, call: number, data: Record<string, unknown>): void {
	const sent = worker.postMessage.mock.calls[call]![0] as { id: number };
	worker.onmessage?.({ data: { ...data, id: sent.id } } as MessageEvent);
}

const SETTINGS: ImportSettings = {
	mode: 'auto',
	swatches: ['#b91313', '#ffffff'],
	invert: false,
	paperColors: ['#b91313', '#ffffff']
};

const PICTURE = {
	type: 'pixels' as const,
	rgba: new Uint8ClampedArray(4),
	imageWidth: 1,
	imageHeight: 1
};

describe('the engine door', () => {
	// Only these tests need a worker, so only these tests get a fake one — the
	// settings above are pure arithmetic and the round trip runs the engine's own
	// code in this thread.
	beforeEach(() => {
		workers = [];
		vi.resetModules();
		vi.stubGlobal(
			'Worker',
			class {
				postMessage = vi.fn();
				terminate = vi.fn();
				onmessage: ((event: MessageEvent) => void) | null = null;
				onerror: ((event: ErrorEvent) => void) | null = null;
				onmessageerror: (() => void) | null = null;
				constructor() {
					workers.push(this as unknown as FakeWorker);
				}
			}
		);
	});

	it('makes a second caller wait instead of meeting the engine’s refusal', async () => {
		const { prepareImage, detectCorners } = await import('./engine');
		// The dialog's debounced preview and its corner search race exactly like
		// this, and `InverseWorker.request` rejects the second outright.
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();
		expect(workers).toHaveLength(1);
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);

		reply(workers[0]!, 0, { type: 'prepared', preview: 'the mask' });
		await expect(prepared).resolves.toBe('the mask');
		await settle();
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(2);
		reply(workers[0]!, 1, { type: 'crops', crops: 'the corners' });
		await expect(corners).resolves.toBe('the corners');
	});

	it('lets the next caller through when the one before it failed', async () => {
		const { prepareImage, detectCorners } = await import('./engine');
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();
		reply(workers[0]!, 0, { type: 'error', message: 'Billedet kunne ikke læses' });
		await expect(prepared).rejects.toMatchObject({ name: 'EngineError' });
		await settle();
		reply(workers[0]!, 1, { type: 'crops', crops: 'the corners' });
		await expect(corners).resolves.toBe('the corners');
	});

	it('stops the work in flight and drops what was queued behind it', async () => {
		const { prepareImage, detectCorners, cancel } = await import('./engine');
		const prepared = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		const corners = detectCorners(PICTURE);
		await settle();

		cancel();
		await expect(prepared).rejects.toMatchObject({ name: 'AbortError' });
		await expect(corners).rejects.toMatchObject({ name: 'AbortError' });
		expect(workers[0]!.terminate).toHaveBeenCalledOnce();
		// The point of stopping: the queued request must not start a fresh worker
		// on a 24-megapixel prepare nobody is waiting for any more.
		expect(workers).toHaveLength(1);
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
	});

	it('builds a new worker for the next request after a cancel', async () => {
		const { prepareImage, cancel } = await import('./engine');
		const stopped = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		await settle();
		cancel();
		await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });

		const again = prepareImage({ type: 'svg', text: '<svg/>' }, SETTINGS);
		await settle();
		expect(workers).toHaveLength(2);
		reply(workers[1]!, 0, { type: 'prepared', preview: 'the mask' });
		await expect(again).resolves.toBe('the mask');
	});

	it('sends the mask resolution and the visitor’s colour choices, and no solve settings', async () => {
		const { prepareImage } = await import('./engine');
		const { MASK_SIZE } = await import('$lib/paint/mask');
		void prepareImage({ type: 'svg', text: '<svg/>' }, { ...SETTINGS, invert: true });
		await settle();
		const [message] = workers[0]!.postMessage.mock.calls[0] as [
			{ action: string; settings: Record<string, unknown> }
		];
		expect(message.action).toBe('prepare');
		expect(message.settings).toMatchObject({ resolution: MASK_SIZE, mode: 'auto', invert: true });
		// A time limit past 180 seconds is refused by the engine's own validation
		// before a pixel is classified, and preparing has no use for one anyway.
		expect(message.settings.timeLimit).toBeUndefined();
	});

	it('holds Find snit in the same queue as the dialog', async () => {
		// The two lanes met here: the dialog's prepare and the page's search share
		// one worker, so a search started while a preview is in flight has to wait
		// rather than be refused. It is also why a prepare and its solve stay in
		// order — the solve reads the artwork the prepare left inside the worker.
		const { findCuts, prepareMask } = await import('./engine');
		const { createMask } = await import('$lib/paint/mask');
		const prepared = prepareMask(createMask(0), COLORS);
		const cuts = findCuts({ colors: COLORS, symmetry: NO_SYMMETRY });
		await settle();
		expect(workers).toHaveLength(1);
		expect(workers[0]!.postMessage).toHaveBeenCalledTimes(1);
		expect((workers[0]!.postMessage.mock.calls[0]![0] as { action: string }).action).toBe(
			'prepare'
		);

		reply(workers[0]!, 0, { type: 'prepared', preview: 'the mask' });
		await expect(prepared).resolves.toBe('the mask');
		await settle();
		expect((workers[0]!.postMessage.mock.calls[1]![0] as { action: string }).action).toBe('solve');
		reply(workers[0]!, 1, { type: 'result', result: 'the cuts' });
		await expect(cuts).resolves.toBe('the cuts');
	});
});

describe('frameWeights', () => {
	const FREE = { mode: 'free' as const, shape: 'diamond' as const, size: 0.64 };

	it('is 1 inside the protected motif and 0 in a free band', () => {
		const mask = createMask(0, 40);
		const weights = frameWeights(mask, FREE);
		expect(weights).toHaveLength(mask.data.length);
		for (let y = 0; y < mask.size; y++) {
			for (let x = 0; x < mask.size; x++) {
				const want = insideCell(FREE, mask.size, x, y) ? 1 : 0;
				expect([x, y, weights[y * mask.size + x]]).toEqual([x, y, want]);
			}
		}
	});

	it('is 1 everywhere while the band is fixed', () => {
		const weights = frameWeights(createMask(0, 20), { ...FREE, mode: 'fixed' });
		expect([...weights].every((w) => w === 1)).toBe(true);
	});

	it('is not sent to the engine yet, because the engine cannot read it', () => {
		// PAINT.md §11 and docs/inverse/MOTIF-BORDER.md: the fitter's loss has no
		// per-cell weight, and a neutral 0.5 probability is not the same as an
		// ignored cell. Until Codex's lane lands, a free band travels as
		// `substituteCheckerBand`'s woven pattern instead — so no key of the solve
		// settings may carry weights, or a reader would think the engine honours them.
		const sent = solveSettings({ colors: COLORS, symmetry: NO_SYMMETRY });
		expect(Object.keys(sent).some((key) => /weight/i.test(key))).toBe(false);
	});
});
