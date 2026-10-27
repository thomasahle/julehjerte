import { describe, it, expect } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { get, MASK_SIZE, maskMismatch, resample, type Mask } from './mask';
import { applyTransform, disagreement, type Transform } from './symmetry';
import { rasterizeDesign } from './rasterize';
import { cutGeometryToDesign, type CutGeometry } from '$lib/inverse/toHeartDesign';
import julSolution from '../../../static/inverse/examples/jul.saved.json';

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

	it('draws no line where both families cut along one seam', () => {
		// Round Uret's ring a cut of each family runs along the same seam, each drawn
		// on its own a hair from the other. The sliver between them came out as lines
		// and dots of the other colour across the ring and in its empty middle, and
		// Find snit cut them into the ring.
		const mask = rasterizeDesign(galleryDesign('circle'), 400);
		let thin = 0;
		for (let y = 1; y < 399; y++) {
			for (let x = 1; x < 399; x++) {
				const v = get(mask, x, y);
				const across = get(mask, x - 1, y) !== v && get(mask, x + 1, y) !== v;
				const along = get(mask, x, y - 1) !== v && get(mask, x, y + 1) !== v;
				if (across || along) thin++;
			}
		}
		// Only the tips of the eight wedges between the bands and the ring are a cell
		// wide (174 cells were, with the slivers).
		expect(thin).toBeLessThanOrEqual(8);
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

	it('draws the gallery jul and the engine’s jul as the same picture', () => {
		// §4's second rasteriser test. The gallery heart was drawn by hand and the
		// engine solved for the same lettering, so the two are not identical — but a
		// rasteriser or a converter with the frame wrong would not be close either.
		// This is the one test that spans both lanes, so it only became possible here.
		const gallery = rasterizeDesign(galleryDesign('jul'), 200);
		const converted = rasterizeDesign(
			cutGeometryToDesign(julSolution as unknown as CutGeometry, { name: 'jul' }),
			200
		);
		expect(maskMismatch(gallery.data, converted.data)).toBeLessThan(0.03);
	});

	it('follows the curves, not their chords', () => {
		// `ramme` has deeply curved fingers. Flattening each cubic to a single chord
		// would move the weave far more than the quarter-cell the rasteriser allows,
		// so this fails if the step count ever stops adapting to the curve.
		const design = galleryDesign('ramme');
		const chords: HeartDesign = {
			...design,
			fingers: design.fingers.map((f) => ({
				...f,
				segments: f.segments.map((s) => ({
					p0: s.p0,
					p1: { x: s.p0.x + (s.p3.x - s.p0.x) / 3, y: s.p0.y + (s.p3.y - s.p0.y) / 3 },
					p2: { x: s.p0.x + ((s.p3.x - s.p0.x) * 2) / 3, y: s.p0.y + ((s.p3.y - s.p0.y) * 2) / 3 },
					p3: s.p3
				}))
			}))
		};
		const straightened = rasterizeDesign(chords, 200);
		expect(maskMismatch(rasterizeDesign(design, 200).data, straightened.data)).toBeGreaterThan(0.01);
	});

	it('says where between the cells each cut runs, for Mal to draw the curves', () => {
		const design = galleryDesign('jul');
		const coarse = rasterizeDesign(design, 100, { levels: true }), fine = rasterizeDesign(design, 800);
		expect([...coarse.data]).toEqual([...rasterizeDesign(design, 100).data]);
		// The coarse mask read between its cells at the fine one's, as the screen reads it.
		const misread = (share: (i: number) => number) => {
			let wrong = 0;
			for (let fy = 0; fy < 800; fy++) {
				const v = Math.max(0, Math.min(99, (fy + 0.5) / 8 - 0.5)), y0 = Math.min(98, Math.floor(v)), ty = v - y0;
				for (let fx = 0; fx < 800; fx++) {
					const u = Math.max(0, Math.min(99, (fx + 0.5) / 8 - 0.5)), x0 = Math.min(98, Math.floor(u)), tx = u - x0, i = y0 * 100 + x0;
					const value = (share(i) * (1 - tx) + share(i + 1) * tx) * (1 - ty) + (share(i + 100) * (1 - tx) + share(i + 101) * tx) * ty;
					if ((value >= 127.5) !== (fine.data[fy * 800 + fx] === 1)) wrong++;
				}
			}
			return wrong / 800 ** 2;
		};
		const fromLevels = misread((i) => coarse.level![i]!), fromCells = misread((i) => coarse.data[i]! * 255);
		expect(fromLevels).toBeLessThan(fromCells / 3);
	});

	it('gives an empty mask for a heart with no fingers, at the mask resolution', () => {
		const design: HeartDesign = {
			id: 'x',
			name: 'x',
			author: '',
			gridSize: { x: 3, y: 3 },
			fingers: []
		};
		expect(ones(rasterizeDesign(design, 16))).toBe(0);
		// The size argument defaults to the mask's own resolution, so "Mal på hjertet"
		// can call it with a design alone and get something the session can hold.
		const full = rasterizeDesign(design);
		expect(full.size).toBe(MASK_SIZE);
		expect(full.data.length).toBe(MASK_SIZE * MASK_SIZE);
	});
});
