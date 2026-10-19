import { describe, expect, it } from 'vitest';
import { normalizeContours, contoursWithinBoundary } from './contours';
import { inside, forest, type Ring } from './geometry';
import rabbit from '../../../static/generator/motifs/ph-rabbit.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
import butterfly from '../../../static/generator/motifs/ph-butterfly.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';

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
