import { describe, expect, it } from 'vitest';
import { normalizeContours, contoursWithinBoundary, withoutSpurs, closedAtContacts, ringContacts } from './contours';
import { inside, forest, type Ring } from './geometry';
import rabbit from '../../../static/generator/motifs/ph-rabbit.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
import butterfly from '../../../static/generator/motifs/ph-butterfly.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';
import award from '../../../static/generator/motifs/tb-award.json';
import crownCross from '../../../static/generator/motifs/ph-crown-cross.json';
import excludeSquare from '../../../static/generator/motifs/ph-exclude-square.json';

const filled = (rings: Ring[], x: number, y: number) => rings.reduce((a, r) => a ^ Number(inside([x, y], r)), 0);

describe('complete contour containment', () => {
	const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
	it('retains counters and accepts contact along the frame boundary', () => {
		expect(contoursWithinBoundary([square, [[2, 2], [4, 2], [4, 4], [2, 4]]], square)).toBe(true);
	});
	it('rejects an outline vertex outside the frame', () => {
		expect(contoursWithinBoundary([[[2, 2], [12, 2], [2, 4]]], square)).toBe(false);
	});
	it('finds a narrow concave excursion between interior vertices and midpoints', () => {
		const frame: Ring = [[0, 0], [10, 0], [10, 10], [2.2, 10], [2.2, 6], [2, 6], [2, 10], [0, 10]],
			outline: Ring = [[1, 8], [9, 8], [9, 1], [1, 1]];
		for (const ring of [outline, outline.slice().reverse()]) {
			expect(ring.every(point => inside(point, frame))).toBe(true);
			expect(contoursWithinBoundary([ring], frame)).toBe(false);
		}
	});
});

describe('rounded contour normalization', () => {
	it('keeps touching components separate regardless of their starting vertex', () => {
		const rings: Ring[] = [[[0, 0], [2, 0], [2, 2], [0, 2]], [[0, 0], [-1, 0], [-1, -1], [0, -1]]];
		for (const reverse of [false, true]) {
			const roots = forest(rings.map(r => reverse ? r.slice().reverse() : r));
			expect(roots).toHaveLength(2);
			expect(roots.every(r => !r.children.length)).toBe(true);
		}
	});
	it('recognizes an inner contour even when all its vertices touch the parent', () => {
		const roots = forest([[[0, 0], [4, 0], [4, 4], [0, 4]], [[2, 0], [4, 2], [2, 4], [0, 2]]]);
		expect(roots).toHaveLength(1);
		expect(roots[0].children).toHaveLength(1);
	});
	it('does not mistake the touching butterfly component for a hole', () => {
		const roots = forest(normalizeContours(butterfly.contours as Ring[]));
		expect(roots).toHaveLength(2);
		expect(roots.every(r => !r.children.length)).toBe(true);
	});
	it('removes repeated adjacent points and collapsed contours without moving edges', () => {
		const square: Ring = [[0, 0], [2, 0], [2, 2], [0, 2]];
		expect(normalizeContours([
			[square[0], square[0], ...square.slice(1), square[0]],
			[[1, 1], [1, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]], []
		])).toEqual([square]);
	});
	it('splits touching loops while retaining the original even-odd fill', () => {
		const original: Ring[] = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0], [-2, 0], [-2, -2], [0, -2]]];
		const result = normalizeContours(original);
		expect(result).toHaveLength(2);
		for (let y = -2.25; y < 2.5; y += .5) for (let x = -2.25; x < 2.5; x += .5)
			expect(filled(result, x, y)).toBe(filled(original, x, y));
	});
	it('keeps non-collinear contours whose signed areas cancel', () => {
		const bowtie: Ring = [[-1, -1], [1, 1], [-1, 1], [1, -1]];
		expect(normalizeContours([bowtie])).toEqual([bowtie]);
	});
	for (const [name, motif] of [['rabbit', rabbit], ['sun', sun], ['butterfly', butterfly], ['bicycle', bicycle]] as const)
		it(`preserves the imported ${name}, including holes and disconnected details`, () => {
			const original = motif.contours as Ring[], result = normalizeContours(original);
			expect(result.length).toBeGreaterThan(0);
			for (const ring of result) expect(new Set(ring.map(p => p.join(','))).size).toBe(ring.length);
			for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
				const px = (x + .37) / 80 - .5, py = (y + .61) / 80 - .5;
				expect(filled(result, px, py)).toBe(filled(original, px, py));
			}
		});
});

describe('hairline spurs', () => {
	it('drops an outline that overshoots a corner and comes back along itself', () => {
		// The bottom runs 0.4 past its corner and back: nothing to see, but a
		// needle in every cut along it.
		const ring: Ring = [[0, 0], [10.4, 0], [10, .01], [10, 10], [0, 10]];
		expect(withoutSpurs([ring])).toEqual([[[0, 0], [10, .01], [10, 10], [0, 10]]]);
	});
	it('keeps a thin point of the motif, whose needle trimming only moves', () => {
		const ring: Ring = [[0, 0], [10, -.5], [10, .5], [.2, .0067]], rings = [ring];
		expect(withoutSpurs(rings)).toBe(rings);
	});
	it('drops a sliver of a ring that thin unless asked to keep it, and keeps a thin stroke', () => {
		// The award's three points where a ribbon meets the medal.
		const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]], stroke: Ring = [[2, 5], [8, 5], [8, 5.1], [2, 5.1]];
		const sliver: Ring = [[3, 3], [3.0006, 3.001], [3.0006, 3]];
		expect(withoutSpurs([square, stroke, sliver])).toEqual([square, stroke]);
		expect(withoutSpurs([square, stroke, sliver], true)).toEqual([square, stroke, sliver]);
		expect(withoutSpurs(award.contours as Ring[]).length).toBe(3);
	});
});

describe('rings that cross or touch', () => {
	it('joins two squares that overlap round the hole between them, and leaves rings apart alone', () => {
		const a: Ring = [[0, 0], [2, 0], [2, 2], [0, 2]], b: Ring = [[1, 1], [3, 1], [3, 3], [1, 3]];
		expect(ringContacts([a, b]).length).toBeGreaterThan(0);
		const joined = closedAtContacts([a, b], .1);
		// One piece round the overlap, which stays a hole; away from where
		// the squares cross, the picture is the same.
		expect(joined.length).toBe(2);
		for (const [x, y, colour] of [[.5, .5, 1], [1.5, 1.5, 0], [2.5, 2.5, 1], [2.5, .5, 0]] as const)
			expect(filled(joined, x, y), `${x},${y}`).toBe(colour);
		const apart: Ring[] = [a, [[5, 5], [6, 5], [6, 6], [5, 6]]];
		expect(closedAtContacts(apart, .1)).toBe(apart);
	});
	it('joins the cross to the crown it stands on, keeping the slot below it open', () => {
		const rings = crownCross.contours as Ring[], joined = closedAtContacts(rings, 1.25 / 49);
		expect(ringContacts(rings).length).toBeGreaterThan(0);
		expect(ringContacts(joined)).toEqual([]);
		// The slot for the cross's stem, down the crown's middle.
		expect(filled(joined, 0, -.05)).toBe(0);
		expect(filled(joined, .2, -.05)).toBe(1);
		expect(closedAtContacts(excludeSquare.contours as Ring[], 1.25 / 49).length).toBe(2);
	});
});
