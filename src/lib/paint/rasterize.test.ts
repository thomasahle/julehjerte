import { describe, it, expect } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { get, resample, type Mask } from './mask';
import { applyTransform, disagreement, type Transform } from './symmetry';
import { rasterizeDesign } from './rasterize';

const NAMED: Transform[] = ['transpose', 'antiTranspose', 'mirrorX', 'mirrorY', 'rotate180'];

/** A gallery heart, taken the long way round through the on-disk format. */
function galleryDesign(id: string): HeartDesign {
	const design = getGalleryDesign(id);
	if (!design) throw new Error(`missing gallery heart ${id}`);
	const normalized = normalizeHeartDesign(serializeHeartDesign(design));
	if (!normalized) throw new Error(`could not normalize ${id}`);
	return normalized;
}

function ones(m: Mask): number {
	let n = 0;
	for (const v of m.data) n += v;
	return n;
}

describe('rasterizeDesign', () => {
	it('draws the classic 3×3 as a checkerboard', () => {
		// Three strips a side, so the weave is nine cells: the corners and the middle
		// show the left colour, the four edge cells the right one.
		const mask = rasterizeDesign(galleryDesign('classic-3x3'), 300);
		const cells: number[][] = [];
		for (let row = 0; row < 3; row++) {
			cells.push([0, 1, 2].map((col) => get(mask, col * 100 + 50, row * 100 + 50)));
		}
		expect(cells).toEqual([
			[0, 1, 0],
			[1, 0, 1],
			[0, 1, 0]
		]);
		// Four whole cells of nine, drawn to the cell edges.
		expect(ones(mask)).toBe(4 * 100 * 100);
	});

	it('lifts the other family of strips when the parity is 1', () => {
		// weaveParity 0 means the top-left cell has the left lobe on top, which is the
		// colour the mask calls 0. Parity 1 takes the other right-lobe strips, and on a
		// heart whose strips tile the square — the classic 3×3 does — that turns every
		// cell over: the two masks are exact complements. A rasteriser that dropped the
		// parity would draw the same picture twice.
		const classic = galleryDesign('classic-3x3');
		expect(classic.weaveParity ?? 0).toBe(0);
		const even = rasterizeDesign(classic, 300);
		const odd = rasterizeDesign({ ...classic, weaveParity: 1 }, 300);

		expect(get(even, 50, 50)).toBe(0);
		expect(get(odd, 50, 50)).toBe(1);
		let agreeing = 0;
		for (let i = 0; i < even.data.length; i++) if (even.data[i] === odd.data[i]) agreeing++;
		expect(agreeing).toBe(0);
	});

	it('draws jul the right way round', () => {
		// §4 asks for jul because it is asymmetric, so a mirrored or transposed frame
		// fails loudly — the converter lane measures its round trip against this very
		// picture. First: there is no symmetry left for a flipped frame to hide behind.
		const mask = rasterizeDesign(galleryDesign('jul'), 200);
		for (const t of NAMED) expect(disagreement(mask, t)).toBeGreaterThan(0.08);

		// Then cells read off that mask, each paired with the symmetry that takes it to
		// a cell of the other colour. Every one sits at least three cells clear of a
		// strip edge, so only a wholesale flip of the frame can move it.
		const pins: Array<{ x: number; y: number; value: 0 | 1; moved: Transform }> = [
			{ x: 59, y: 52, value: 0, moved: 'mirrorX' },
			{ x: 134, y: 52, value: 1, moved: 'mirrorY' },
			{ x: 139, y: 31, value: 1, moved: 'transpose' },
			{ x: 139, y: 35, value: 1, moved: 'antiTranspose' },
			{ x: 141, y: 37, value: 1, moved: 'rotate180' }
		];
		expect(new Set(pins.map((p) => p.moved))).toEqual(new Set(NAMED));
		for (const pin of pins) {
			expect(get(mask, pin.x, pin.y)).toBe(pin.value);
			const image = applyTransform(pin.moved, pin.x, pin.y, mask.size);
			expect(get(mask, image.x, image.y)).toBe(pin.value ? 0 : 1);
		}
	});

	it('draws the same picture whatever the resolution', () => {
		// Jul is asymmetric and curved, so this catches a rasteriser that rounds a
		// coordinate the wrong way or samples corners instead of cell centres.
		const design = galleryDesign('jul');
		const coarse = rasterizeDesign(design, 200);
		const fine = rasterizeDesign(design, 400);
		const shrunk = resample(fine.data, 400, 200);

		let differing = 0;
		for (let i = 0; i < coarse.data.length; i++) {
			if (coarse.data[i] !== shrunk[i]) differing++;
		}
		expect(differing / coarse.data.length).toBeLessThan(0.03);
		// And it is a weave, not an empty or a solid square.
		const covered = ones(coarse) / coarse.data.length;
		expect(covered).toBeGreaterThan(0.2);
		expect(covered).toBeLessThan(0.8);
	});

	it('gives an empty mask for a heart with no fingers', () => {
		const design: HeartDesign = {
			id: 'x',
			name: 'x',
			author: '',
			gridSize: { x: 3, y: 3 },
			fingers: []
		};
		expect(ones(rasterizeDesign(design, 16))).toBe(0);
	});
});
