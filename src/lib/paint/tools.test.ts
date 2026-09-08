import { describe, it, expect } from 'vitest';
import { cloneMask, createMask, get, isEmpty, isEmptyBox, MASK_SIZE, type Mask } from './mask';
import { disagreement, symmetrize, transformsFor } from './symmetry';
import { applySymmetric, floodFill, line, rect, stampCircle, stroke } from './tools';

const PEN = { radius: 2, value: 1 } as const;

/** Cells with the given value, as a set of `x,y` keys — order-free comparison. */
function cells(m: Mask, value: 0 | 1): Set<string> {
	const out = new Set<string>();
	for (let y = 0; y < m.size; y++) {
		for (let x = 0; x < m.size; x++) if (get(m, x, y) === value) out.add(`${x},${y}`);
	}
	return out;
}

function count(m: Mask, value: 0 | 1): number {
	let n = 0;
	for (const v of m.data) if (v === value) n++;
	return n;
}

describe('stampCircle', () => {
	it('fills a disc and reports the cells it changed', () => {
		const m = createMask(0, 32);
		const box = stampCircle(m, 10, 10, PEN);
		expect(box).toEqual({ x0: 8, y0: 8, x1: 13, y1: 13 });
		expect(get(m, 10, 10)).toBe(1);
		expect(get(m, 12, 10)).toBe(1);
		expect(get(m, 12, 12)).toBe(0); // outside the radius
	});

	it('clips at the edge instead of wrapping to the other side', () => {
		const m = createMask(0, 32);
		stampCircle(m, 0, 0, { radius: 3, value: 1 });
		expect(get(m, 0, 0)).toBe(1);
		expect(get(m, 31, 31)).toBe(0);
		expect(get(m, 31, 0)).toBe(0);
	});

	it('reports an empty box when the cells are already that colour', () => {
		const m = createMask(0, 32);
		expect(isEmptyBox(stampCircle(m, 10, 10, { radius: 3, value: 0 }))).toBe(true);
		expect(isEmpty(m)).toBe(true);
	});
});

describe('stroke', () => {
	it('leaves no gaps however far the pointer jumped', () => {
		// One event from corner to corner: the whole diagonal must come out connected.
		const m = createMask(0, 120);
		stroke(m, { x: 4, y: 6 }, { x: 115, y: 97 }, PEN);
		const painted = count(m, 1);

		// A flood fill from the start reaches the whole stroke exactly when it is
		// 4-connected; anything left over would be a gap.
		const probe: Mask = { size: m.size, data: new Uint8Array(m.data) };
		floodFill(probe, 4, 6, 0);
		expect(count(probe, 1)).toBe(0);
		expect(painted).toBeGreaterThan(200);
	});

	it('paints a single dab when both ends are the same point', () => {
		const m = createMask(0, 32);
		stroke(m, { x: 16, y: 16 }, { x: 16, y: 16 }, PEN);
		const dab = createMask(0, 32);
		stampCircle(dab, 16, 16, PEN);
		expect([...m.data]).toEqual([...dab.data]);
	});

	it('is what the line tool draws', () => {
		const a = createMask(0, 64);
		const b = createMask(0, 64);
		stroke(a, { x: 3, y: 60 }, { x: 55, y: 8 }, { radius: 6, value: 1 });
		line(b, { x: 3, y: 60 }, { x: 55, y: 8 }, { radius: 6, value: 1 });
		expect([...a.data]).toEqual([...b.data]);
	});
});

describe('rect', () => {
	it('takes its corners in any order', () => {
		const a = createMask(0, 32);
		const b = createMask(0, 32);
		rect(a, { x: 4, y: 6 }, { x: 20, y: 18 }, 1);
		rect(b, { x: 20, y: 18 }, { x: 4, y: 6 }, 1);
		expect([...a.data]).toEqual([...b.data]);
		expect(count(a, 1)).toBe(17 * 13);
	});

	it('clamps corners that fall outside the mask', () => {
		const m = createMask(0, 32);
		const box = rect(m, { x: -50, y: -12 }, { x: 5, y: 5 }, 1);
		expect(box).toEqual({ x0: 0, y0: 0, x1: 6, y1: 6 });
		expect(count(m, 1)).toBe(36);
		expect(get(m, 0, 0)).toBe(1);
	});

	it('changes nothing when the rectangle misses the mask entirely', () => {
		const m = createMask(0, 32);
		expect(isEmptyBox(rect(m, { x: 40, y: 40 }, { x: 60, y: 60 }, 1))).toBe(true);
		expect(isEmpty(m)).toBe(true);
	});
});

describe('floodFill', () => {
	it('stops at painted cells and leaves the rest of the square alone', () => {
		const m = createMask(0, 40);
		rect(m, { x: 10, y: 10 }, { x: 29, y: 10 }, 1);
		rect(m, { x: 10, y: 29 }, { x: 29, y: 29 }, 1);
		rect(m, { x: 10, y: 10 }, { x: 10, y: 29 }, 1);
		rect(m, { x: 29, y: 10 }, { x: 29, y: 29 }, 1);

		const box = floodFill(m, 20, 20, 1);
		expect(box).toEqual({ x0: 11, y0: 11, x1: 29, y1: 29 });
		expect(get(m, 20, 20)).toBe(1);
		expect(get(m, 5, 5)).toBe(0); // outside the fence
		expect(count(m, 1)).toBe(20 * 20);
	});

	it('fills a whole full-size mask without recursing', () => {
		// 160 000 cells from one seed: the scanline stack must stay bounded, which a
		// recursive fill would not.
		const m = createMask(0, MASK_SIZE);
		const box = floodFill(m, 0, 0, 1);
		expect(box).toEqual({ x0: 0, y0: 0, x1: MASK_SIZE, y1: MASK_SIZE });
		expect(count(m, 0)).toBe(0);
	});

	it('does nothing when the seed already has that colour, or lies outside', () => {
		const m = createMask(1, 16);
		expect(isEmptyBox(floodFill(m, 8, 8, 1))).toBe(true);
		expect(isEmptyBox(floodFill(m, -1, 8, 0))).toBe(true);
		expect(count(m, 1)).toBe(16 * 16);
	});
});

describe('applySymmetric', () => {
	it('copies the changed box to exactly the transformed positions', () => {
		const m = createMask(0, 16);
		const box = rect(m, { x: 1, y: 2 }, { x: 3, y: 4 }, 1);
		const changed = applySymmetric(m, box, ['transpose'], 1);

		const expected = new Set<string>();
		for (let y = 2; y <= 4; y++) {
			for (let x = 1; x <= 3; x++) {
				expected.add(`${x},${y}`);
				expected.add(`${y},${x}`);
			}
		}
		expect(cells(m, 1)).toEqual(expected);
		expect(changed).toEqual({ x0: 1, y0: 1, x1: 5, y1: 5 });
	});

	it('copies the box as it was, not as the copies leave it', () => {
		// The box straddles the mirror line, so the first copy writes back into the
		// source: reading the live mask would smear the stroke across the middle.
		const m = createMask(0, 16);
		const box = rect(m, { x: 6, y: 0 }, { x: 7, y: 0 }, 1);
		applySymmetric(m, box, ['mirrorX'], 1);
		expect(cells(m, 1)).toEqual(new Set(['6,0', '7,0', '8,0', '9,0']));
	});

	it('mirrors a stroke that crosses the mirror line instead of moving it', () => {
		// The stroke lands on its own image, so the box and its copy overlap; a plain
		// copy would drag the stroke to one side of the diagonal.
		const m = createMask(0, 32);
		const box = stroke(m, { x: 4, y: 12 }, { x: 22, y: 5 }, PEN);
		applySymmetric(m, box, ['transpose'], 1);
		expect(disagreement(m, 'transpose')).toBe(0);
		expect(get(m, 4, 12)).toBe(1);
		expect(get(m, 12, 4)).toBe(1);
	});

	it('mirrors the eraser the same way', () => {
		const m = createMask(1, 32);
		const box = stroke(m, { x: 4, y: 12 }, { x: 22, y: 5 }, { radius: 2, value: 0 });
		applySymmetric(m, box, ['transpose'], 0);
		expect(disagreement(m, 'transpose')).toBe(0);
		expect(get(m, 12, 4)).toBe(0);
	});

	it('spreads only the colour that was painted, and spreads it once', () => {
		// The box also covers cells the stroke did not touch; they keep their colour,
		// and running the copy again finds nothing left to do.
		const m = createMask(0, 24);
		rect(m, { x: 2, y: 2 }, { x: 3, y: 3 }, 1); // painted before symmetry came on
		const box = rect(m, { x: 8, y: 1 }, { x: 9, y: 2 }, 1);
		applySymmetric(m, box, ['mirrorX'], 1);
		const after = new Uint8Array(m.data);

		expect(get(m, 14, 1)).toBe(1); // the image of the new rectangle
		expect(get(m, 21, 2)).toBe(0); // the old one was outside the box, so it stays put
		applySymmetric(m, box, ['mirrorX'], 1);
		expect([...m.data]).toEqual([...after]);
	});

	it('covers the quarter turns that transpose and the mirrors generate', () => {
		// transpose with both mirrors generates all eight symmetries of the square, so
		// copying to the three generators alone would leave the quarter turns bare.
		const m = createMask(0, 64);
		const box = stroke(m, { x: 6, y: 9 }, { x: 20, y: 12 }, PEN);
		applySymmetric(m, box, transformsFor({ curve: 'sym', lobe: 'sym', lobes: 'sym' }), 1);

		for (const t of ['transpose', 'antiTranspose', 'mirrorX', 'mirrorY', 'rotate180'] as const) {
			expect(disagreement(m, t)).toBe(0);
		}
		for (let y = 0; y < m.size; y++) {
			for (let x = 0; x < m.size; x++) {
				expect(get(m, m.size - 1 - y, x)).toBe(get(m, x, y));
			}
		}
	});

	it('gets the transpose from the two anti rows, which neither names', () => {
		const m = createMask(0, 32);
		const box = rect(m, { x: 2, y: 3 }, { x: 6, y: 5 }, 1);
		applySymmetric(m, box, transformsFor({ curve: 'off', lobe: 'anti', lobes: 'anti' }), 1);
		expect(disagreement(m, 'antiTranspose')).toBe(0);
		expect(disagreement(m, 'rotate180')).toBe(0);
		expect(disagreement(m, 'transpose')).toBe(0);
	});

	it('leaves the mask alone when no symmetry is on, and still returns its own box', () => {
		// The canvas accumulates the boxes it is handed back and unions them in place,
		// so a returned box must never be the caller's own object.
		const m = createMask(0, 16);
		const box = rect(m, { x: 1, y: 1 }, { x: 2, y: 2 }, 1);
		const changed = applySymmetric(m, box, [], 1);
		expect(changed).toEqual(box);
		expect(changed).not.toBe(box);
		expect(count(m, 1)).toBe(4);
	});

	it('is exact once the mask has been folded, however loose the box', () => {
		// The whole flow: paint with symmetry off, switch Mellem lapper Sym on — which
		// the session answers by folding the mask — then draw one diagonal stroke, whose
		// box is nearly the whole mask. With the fold done first the old rectangle is
		// already at both of its positions, so spreading the brush colour through that
		// box adds nothing but the stroke.
		const m = createMask(0, 32);
		rect(m, { x: 20, y: 1 }, { x: 24, y: 3 }, 1); // painted while symmetry was off
		symmetrize(m, ['mirrorX']); // what setSymmetry does when the row goes on
		const before = cloneMask(m);

		const box = stroke(m, { x: 1, y: 1 }, { x: 30, y: 30 }, PEN);
		applySymmetric(m, box, ['mirrorX'], 1);

		expect(disagreement(m, 'mirrorX')).toBe(0);
		// Nothing was rubbed out, and the only cells added are the stroke and its image.
		for (let i = 0; i < m.data.length; i++) if (before.data[i]) expect(m.data[i]).toBe(1);
		const strokeOnly = createMask(0, 32);
		const strokeBox = stroke(strokeOnly, { x: 1, y: 1 }, { x: 30, y: 30 }, PEN);
		applySymmetric(strokeOnly, strokeBox, ['mirrorX'], 1);
		for (let i = 0; i < m.data.length; i++) {
			if (m.data[i] && !before.data[i]) expect(strokeOnly.data[i]).toBe(1);
		}
	});
});
