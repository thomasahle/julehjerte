import { describe, it, expect } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { get, resample, type Mask } from './mask';
import { rasterizeDesign } from './rasterize';

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
