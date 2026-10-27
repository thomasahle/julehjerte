import { describe, it, expect } from 'vitest';
import { cloneMask, createMask, get, isEmptyBox, type Mask } from './mask';
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

describe('the square head', () => {
	it("moves paper in the square's corners, which the round brush leaves", () => {
		const round = createMask(0, 64), square = createMask(0, 64);
		checks(round, 8);
		checks(square, 8);
		// One dab: a push of up to a quarter brush is made in one step.
		createSmudge(round).push({ x: 32, y: 32 }, { x: 35, y: 32 }, 12);
		createSmudge(square, [], 'square').push({ x: 32, y: 32 }, { x: 35, y: 32 }, 12);
		const moved = (m: Mask, before: Mask, near: (x: number, y: number) => boolean) => {
			let n = 0;
			for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (near(x, y) && m.data[y * 64 + x] !== before.data[y * 64 + x]) n++;
			return n;
		};
		const plain = createMask(0, 64);
		checks(plain, 8);
		// Beyond the round brush's rim but inside the square's.
		const corners = (x: number, y: number) => (x - 32) ** 2 + (y - 32) ** 2 > 144 && Math.abs(x - 32) < 12 && Math.abs(y - 32) < 12;
		expect(moved(round, plain, corners)).toBe(0);
		expect(moved(square, plain, corners)).toBeGreaterThan(0);
		// And nothing beyond the square.
		expect(moved(square, plain, (x, y) => Math.abs(x - 32) > 12 || Math.abs(y - 32) > 12)).toBe(0);
	});
});

describe('the chisel', () => {
	it('turns a quarter in the images whose symmetry swaps the axes, so the mask stays symmetric', () => {
		const symmetry = { curve: 'off', lobe: 'sym', lobes: 'sym' } as const;
		const transforms = transformsFor(symmetry);
		for (const shape of ['diamond', 'chisel'] as const) {
			const m = createMask(0, 80);
			checks(m, 5);
			const smudge = createSmudge(m, transforms, shape);
			smudge.push({ x: 20, y: 30 }, { x: 26, y: 26 }, 10);
			for (let k = 0; k < 6; k++) smudge.twirl({ x: 24, y: 52 }, 12, 0.08);
			for (const t of transforms) expect(disagreement(m, t)).toBe(0);
		}
	});
});

describe('strength', () => {
	it('carries the paper only that share of the way', () => {
		const full = createMask(0, 64), half = createMask(0, 64);
		stamp(full, 30, 32, { radius: 4, value: 1 });
		stamp(half, 30, 32, { radius: 4, value: 1 });
		const before = centroid(full)!;
		createSmudge(full).push({ x: 30, y: 32 }, { x: 38, y: 32 }, 12);
		createSmudge(half).push({ x: 30, y: 32 }, { x: 38, y: 32 }, 12, .5);
		const fullWay = centroid(full)!.x - before.x, halfWay = centroid(half)!.x - before.x;
		expect(halfWay).toBeGreaterThan(fullWay * .3);
		expect(halfWay).toBeLessThan(fullWay * .7);
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

describe('from one stroke to the next', () => {
	/** A board bent by `strokes` holds of Krymp, each carried on from the last or each started afresh. */
	function shrunk(strokes: number, frames: number, carry: boolean, keepLevel = true): Mask {
		const m = createMask(0, 80);
		checks(m, 5);
		let last: ReturnType<typeof createSmudge> | null = null;
		for (let s = 0; s < strokes; s++) {
			if (!keepLevel) delete m.level;
			last = createSmudge(m, [], 'round', carry ? last : null);
			for (let f = 0; f < frames; f++) last.bulge({ x: 41, y: 38 }, 36, -0.03);
		}
		return m;
	}

	function differ(a: Mask, b: Mask): number {
		let n = 0;
		for (let i = 0; i < a.data.length; i++) n += a.data[i] !== b.data[i] ? 1 : 0;
		return n;
	}

	it('carries on from the stroke before, so four holds are one long hold', () => {
		const held = shrunk(4, 10, true), once = shrunk(1, 40, true);
		expect(held.data).toEqual(once.data);
		expect(held.level).toEqual(once.level);
	});

	it('starts afresh once anything else has touched the mask', () => {
		const m = createMask(0, 40);
		checks(m, 3);
		const first = createSmudge(m);
		first.twirl({ x: 20, y: 20 }, 15, 0.2);
		expect(first.carry(m)).not.toBeNull();
		expect(first.carry(cloneMask(m))).toBeNull();
		stamp(m, 5, 5, { radius: 2, value: m.data[5 * 40 + 5] ? 0 : 1 });
		expect(first.carry(m)).toBeNull();
	});

	it('leaves where each edge lies in the level, agreeing with the cells', () => {
		const m = shrunk(1, 10, true);
		let between = 0;
		for (let i = 0; i < m.data.length; i++) {
			expect(m.level![i]! >= 128).toBe(m.data[i] === 1);
			if (m.level![i]! > 0 && m.level![i]! < 255) between++;
		}
		expect(between).toBeGreaterThan(100);
	});

	it('reads the level when it starts afresh, so a stretched edge does not grow the stair the cells cut', () => {
		const once = shrunk(1, 40, true);
		const fromLevel = differ(shrunk(4, 10, false), once), fromCells = differ(shrunk(4, 10, false, false), once);
		expect(fromLevel).toBeLessThan(fromCells / 2);
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
