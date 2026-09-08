import { describe, it, expect } from 'vitest';
import { createMask, MASK_SIZE, type Mask } from '$lib/paint/mask';
import { symmetrize } from '$lib/paint/symmetry';
import {
	ENGINE_SYMMETRY,
	engineSymmetry,
	maskPrepareSettings,
	maskToPixels
} from '$lib/inverse/engine';
// The engine's own `prepare` — the exact call the worker makes for a 'prepare'
// request. Importing it here is what makes the round trip below a proof rather
// than a re-implementation; see engine-modules.d.ts for why it comes in through
// the `$inverse` alias.
import { prepare } from '$inverse/core/engine.js';

const COLORS = { left: '#ffffff', right: '#b91313' };

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

describe('engineSymmetry', () => {
	it('is not sent yet', () => {
		// PAINT.md §11: the engine lane has not landed, so the bridge folds the
		// mask and corrects the cuts instead. Flipping this constant is the whole
		// switch-over, which is why it is pinned rather than assumed.
		expect(ENGINE_SYMMETRY).toBe(false);
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
		// The one row that is not a symmetry of the square: it holds per cut, so
		// there is nothing on the mask it could become.
		expect(engineSymmetry({ curve: 'sym', lobe: 'off', lobes: 'off' })).toEqual({
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
