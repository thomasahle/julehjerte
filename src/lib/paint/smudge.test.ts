import { describe, it, expect } from 'vitest';
import { createMask, get, isEmptyBox, type Mask } from './mask';
import { createSmudge } from './smudge';
import { disagreement, transformsFor } from './symmetry';
import { checks, rect, stamp } from './tools';

function count(m: Mask, value: 0 | 1): number {
	let n = 0;
	for (const v of m.data) if (v === value) n++;
	return n;
}

/** The middle of the right paper's cells, or null when there are none. */
function centroid(m: Mask): { x: number; y: number } | null {
	let sx = 0, sy = 0, n = 0;
	for (let y = 0; y < m.size; y++)
		for (let x = 0; x < m.size; x++)
			if (m.data[y * m.size + x]) { sx += x; sy += y; n++; }
	return n ? { x: sx / n, y: sy / n } : null;
}

describe('push', () => {
	it('carries the paper under the brush along with the pointer', () => {
		const m = createMask(0, 64);
		stamp(m, 30, 32, { radius: 4, value: 1 });
		const before = centroid(m)!;
		createSmudge(m).push({ x: 30, y: 32 }, { x: 38, y: 32 }, 12);
		const after = centroid(m)!;
		expect(after.x - before.x).toBeGreaterThan(5);
		expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
	});

	it('leaves everything beyond the brush as it was', () => {
		const m = createMask(0, 64);
		checks(m, 8);
		const before = m.data.slice();
		const box = createSmudge(m).push({ x: 32, y: 32 }, { x: 36, y: 34 }, 6);
		expect(isEmptyBox(box)).toBe(false);
		for (let y = 0; y < 64; y++)
			for (let x = 0; x < 64; x++)
				if ((x - 32) ** 2 + (y - 32) ** 2 > 12 ** 2) expect(m.data[y * 64 + x]).toBe(before[y * 64 + x]);
	});

	it('keeps two papers and no third', () => {
		const m = createMask(0, 64);
		checks(m, 6);
		createSmudge(m).push({ x: 20, y: 20 }, { x: 44, y: 40 }, 10);
		expect([...m.data].every((v) => v === 0 || v === 1)).toBe(true);
	});
});

describe('twirl', () => {
	it('turns a bar through the brush about its centre', () => {
		const m = createMask(0, 64);
		rect(m, { x: 22, y: 31 }, { x: 42, y: 33 }, 1);
		expect(get(m, 32, 26)).toBe(0);
		const smudge = createSmudge(m);
		// A quarter turn at the centre, in small dabs as the canvas makes it.
		for (let k = 0; k < 10; k++) smudge.twirl({ x: 32, y: 32 }, 16, Math.PI / 20);
		expect(get(m, 32, 28)).toBe(1);
		expect(get(m, 32, 36)).toBe(1);
		expect(get(m, 28, 32)).toBe(0);
	});

	it('reads every dab from the stroke\'s first mask, so a long turn keeps its area', () => {
		const m = createMask(0, 96);
		checks(m, 6);
		const before = count(m, 1);
		const smudge = createSmudge(m);
		for (let k = 0; k < 60; k++) smudge.twirl({ x: 48, y: 48 }, 30, 0.05);
		// Turning moves paper about and makes none; the edges' rounding is all
		// that may differ.
		expect(Math.abs(count(m, 1) - before) / before).toBeLessThan(0.02);
	});
});

describe('bulge', () => {
	it('swells the paper at the centre, and a negative amount draws it in', () => {
		const grown = createMask(0, 64), shrunk = createMask(0, 64);
		stamp(grown, 32, 32, { radius: 5, value: 1 });
		stamp(shrunk, 32, 32, { radius: 5, value: 1 });
		const area = count(grown, 1);
		const out = createSmudge(grown), inwards = createSmudge(shrunk);
		for (let k = 0; k < 5; k++) {
			out.bulge({ x: 32, y: 32 }, 16, 0.1);
			inwards.bulge({ x: 32, y: 32 }, 16, -0.1);
		}
		expect(count(grown, 1)).toBeGreaterThan(area * 1.3);
		expect(count(shrunk, 1)).toBeLessThan(area * 0.8);
	});
});

describe('under symmetry', () => {
	it('makes each dab at the brush\'s images too, so a symmetric mask stays symmetric', () => {
		const symmetry = { curve: 'off', lobe: 'sym', lobes: 'sym' } as const;
		const transforms = transformsFor(symmetry);
		const m = createMask(0, 80);
		checks(m, 5);
		const smudge = createSmudge(m, transforms);
		smudge.push({ x: 20, y: 30 }, { x: 28, y: 24 }, 10);
		for (let k = 0; k < 8; k++) smudge.twirl({ x: 24, y: 50 }, 12, 0.08);
		smudge.bulge({ x: 56, y: 22 }, 10, 0.2);
		for (const t of transforms) expect(disagreement(m, t)).toBe(0);
	});
});
