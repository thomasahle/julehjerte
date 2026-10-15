import { describe, expect, it } from 'vitest';
import { normalizeContours } from './contours';
import { inside, type Ring } from './geometry';
import rabbit from '../../../static/generator/motifs/ph-rabbit.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
import butterfly from '../../../static/generator/motifs/ph-butterfly.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';

const filled = (rings: Ring[], x: number, y: number) => rings.reduce((a, r) => a ^ Number(inside([x, y], r)), 0);

describe('rounded contour normalization', () => {
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
