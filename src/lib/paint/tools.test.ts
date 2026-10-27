import { describe, it, expect } from 'vitest';
import { cloneMask, createMask, get, isEmpty, isEmptyBox, MASK_SIZE, shareAt, type Box, type Mask } from './mask';
import { disagreement, symmetrize, transformsFor, type Transform } from './symmetry';
import { commit, lift, moveBy } from './selection';
import {
	applySymmetric,
	applySymmetricEdit,
	checkAt,
	checks,
	checksKeepSymmetry,
	defaultMask,
	ellipse,
	floodFill,
	isDefaultMask,
	line,
	rect,
	stamp,
	stroke
} from './tools';

const PEN = { radius: 2, value: 1 } as const;

/** Cells with the given value, as a set of `x,y` keys — order-free comparison. */
function cells(m: Mask, value: 0 | 1): Set<string> {
	const out = new Set<string>();
	for (let y = 0; y < m.size; y++) {
		for (let x = 0; x < m.size; x++) if (get(m, x, y) === value) out.add(`${x},${y}`);
	}
	return out;
}

/**
 * Where along a line of cells the edge crosses, between their centres, read
 * as the screen reads it: `count` cells from cell `start`, `step` apart, in
 * cells from the first one's centre.
 */
function crossings(m: Mask, start: number, step: number, count: number): number[] {
	const out: number[] = [];
	for (let k = 0; k + 1 < count; k++) {
		const a = shareAt(m, start + k * step), b = shareAt(m, start + (k + 1) * step);
		if ((a >= 128) !== (b >= 128)) out.push(k + (127.5 - a) / (b - a));
	}
	return out;
}

function count(m: Mask, value: 0 | 1): number {
	let n = 0;
	for (const v of m.data) if (v === value) n++;
	return n;
}

describe('stamp', () => {
	it('fills a disc and reports the cells it changed', () => {
		const m = createMask(0, 32);
		const box = stamp(m, 10, 10, PEN);
		expect(box).toEqual({ x0: 8, y0: 8, x1: 13, y1: 13 });
		expect(get(m, 10, 10)).toBe(1);
		expect(get(m, 12, 10)).toBe(1);
		expect(get(m, 12, 12)).toBe(0); // outside the radius
	});

	it('clips at the edge instead of wrapping to the other side', () => {
		const m = createMask(0, 32);
		stamp(m, 0, 0, { radius: 3, value: 1 });
		expect(get(m, 0, 0)).toBe(1);
		expect(get(m, 31, 31)).toBe(0);
		expect(get(m, 31, 0)).toBe(0);
	});

	it('reports an empty box when the cells are already that colour', () => {
		const m = createMask(0, 32);
		expect(isEmptyBox(stamp(m, 10, 10, { radius: 3, value: 0 }))).toBe(true);
		expect(isEmpty(m)).toBe(true);
	});
});

describe('a square brush head', () => {
	it('fills the whole square of its radius, corners and all', () => {
		const m = createMask(0, 32);
		const box = stamp(m, 10, 10, { radius: 2, value: 1, shape: 'square' });
		expect(box).toEqual({ x0: 8, y0: 8, x1: 13, y1: 13 });
		expect(count(m, 1)).toBe(25);
		expect(get(m, 12, 12)).toBe(1); // a round head leaves this corner out
		expect(get(m, 13, 10)).toBe(0);
	});

	it('draws a stroke as wide as the square, without gaps', () => {
		const m = createMask(0, 64);
		stroke(m, { x: 10, y: 20 }, { x: 50, y: 20 }, { radius: 3, value: 1, shape: 'square' });
		for (let x = 7; x <= 53; x++) for (let y = 17; y <= 23; y++) expect(get(m, x, y)).toBe(1);
		expect(get(m, 30, 24)).toBe(0);
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
		stamp(dab, 16, 16, PEN);
		expect([...m.data]).toEqual([...dab.data]);
	});

	it('covers the dabs a stamp at every cell would, and nothing beyond the brush', () => {
		for (const shape of ['round', 'square', 'diamond', 'chisel'] as const) {
			const swept = createMask(0, 64), dabbed = createMask(0, 64);
			const from = { x: 7.3, y: 50.6 }, to = { x: 49.8, y: 12.1 }, brush = { radius: 5, value: 1 as const, shape };
			stroke(swept, from, to, brush);
			const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
			for (let i = 0; i <= steps; i++) stamp(dabbed, from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, brush);
			for (let i = 0; i < dabbed.data.length; i++) if (dabbed.data[i]) expect(swept.data[i]).toBe(1);
			// What the sweep adds lies between two neighbouring dabs: under a cell
			// more, which is more of a thin nib's stroke.
			expect(count(swept, 1) - count(dabbed, 1)).toBeLessThan(count(dabbed, 1) * (shape === 'chisel' ? 0.1 : 0.05));
		}
	});

	it('paints a stroke of the broadest brush in one pass', () => {
		const m = createMask(0, 400);
		const started = performance.now();
		stroke(m, { x: 20, y: 30 }, { x: 380, y: 370 }, { radius: 200, value: 1 });
		// All but the two far corners, each more than 200 cells off the stroke.
		expect(get(m, 200, 200)).toBe(1);
		expect(get(m, 399, 0)).toBe(0);
		expect(count(m, 1)).toBeGreaterThan(400 * 400 * .9);
		expect(performance.now() - started).toBeLessThan(500);
	});

	it('is what the line tool draws', () => {
		const a = createMask(0, 64);
		const b = createMask(0, 64);
		stroke(a, { x: 3, y: 60 }, { x: 55, y: 8 }, { radius: 6, value: 1 });
		line(b, { x: 3, y: 60 }, { x: 55, y: 8 }, { radius: 6, value: 1 });
		expect([...a.data]).toEqual([...b.data]);
	});
});

describe('the diamond and chisel heads', () => {
	it('stands the diamond upright on screen: the cells within the radius of it along both diagonals', () => {
		const m = createMask(0, 32);
		stamp(m, 16, 16, { radius: 4, value: 1, shape: 'diamond' });
		for (let y = 0; y < 32; y++)
			for (let x = 0; x < 32; x++) expect(get(m, x, y)).toBe(Math.abs(x - 16) + Math.abs(y - 16) <= 4 * Math.SQRT2 ? 1 : 0);
	});

	it('lays the chisel along a strip, a quarter as thick as it is long', () => {
		const m = createMask(0, 32);
		stamp(m, 16, 16, { radius: 8, value: 1, shape: 'chisel' });
		for (let y = 0; y < 32; y++)
			for (let x = 0; x < 32; x++) expect(get(m, x, y)).toBe(Math.abs(x - 16) <= 2 && Math.abs(y - 16) <= 8 ? 1 : 0);
	});

	it('draws thick and thin with the chisel, by the direction of the stroke', () => {
		const across = createMask(0, 64), along = createMask(0, 64);
		const nib = { radius: 8, value: 1 as const, shape: 'chisel' as const };
		stroke(across, { x: 10, y: 32 }, { x: 50, y: 32 }, nib);
		stroke(along, { x: 32, y: 10 }, { x: 32, y: 50 }, nib);
		const column = (m: Mask, x: number) => Array.from({ length: 64 }, (_, y) => get(m, x, y)).filter(Boolean).length;
		const row = (m: Mask, y: number) => Array.from({ length: 64 }, (_, x) => get(m, x, y)).filter(Boolean).length;
		expect(column(across, 30)).toBe(17);
		expect(row(along, 30)).toBe(5);
	});
});

describe('ellipse', () => {
	it('fills the ellipse inside the rectangle its corners span, in either order', () => {
		const a = createMask(0, 64), b = createMask(0, 64), box = createMask(0, 64);
		ellipse(a, { x: 10, y: 20 }, { x: 50, y: 40 }, 1);
		ellipse(b, { x: 50, y: 40 }, { x: 10, y: 20 }, 1);
		rect(box, { x: 10, y: 20 }, { x: 50, y: 40 }, 1);
		expect([...a.data]).toEqual([...b.data]);
		for (let i = 0; i < a.data.length; i++) if (a.data[i]) expect(box.data[i]).toBe(1);
		// π·rx·ry, with the corner cells' halves counted: radii 20.5 and 10.5.
		expect(Math.abs(count(a, 1) - Math.PI * 20.5 * 10.5) / count(a, 1)).toBeLessThan(0.03);
		expect(get(a, 30, 20)).toBe(1);
		expect(get(a, 10, 30)).toBe(1);
		expect(get(a, 10, 20)).toBe(0);
	});

	it('paints a line for a drag one cell wide, as the rectangle does', () => {
		const m = createMask(0, 32);
		ellipse(m, { x: 5, y: 10 }, { x: 25, y: 10 }, 1);
		expect(count(m, 1)).toBe(21);
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
		// The cells beyond it say where its edge lies.
		expect(box).toEqual({ x0: 0, y0: 0, x1: 7, y1: 7 });
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

describe('floodFill with a fence', () => {
	it('fills only the fenced part of the region, and not around the fence back in', () => {
		const m = createMask(0, 20);
		// A fence of two boxes joined only through cells outside it.
		const fence = new Uint8Array(400);
		for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) fence[y * 20 + x] = 1;
		for (let y = 12; y < 18; y++) for (let x = 2; x < 8; x++) fence[y * 20 + x] = 1;
		floodFill(m, 4, 4, 1, fence);
		expect(count(m, 1)).toBe(36);
		expect(get(m, 4, 14)).toBe(0);
		expect(get(m, 10, 4)).toBe(0);
	});

	it('does nothing from a seed outside the fence', () => {
		const m = createMask(0, 20);
		const fence = new Uint8Array(400);
		fence[0] = 1;
		expect(isEmptyBox(floodFill(m, 10, 10, 1, fence))).toBe(true);
		expect(isEmpty(m)).toBe(true);
	});
});

describe('the board Mal starts on', () => {
	it('is a plain woven heart of five strips, never an empty mask', () => {
		const m = defaultMask();
		expect(m.size).toBe(MASK_SIZE);
		expect(isEmpty(m)).toBe(false);
		const board = createMask(1, MASK_SIZE);
		checks(board, 5);
		expect([...m.data]).toEqual([...board.data]);
		expect(isDefaultMask(m)).toBe(true);
	});

	it('stops being it at the first changed cell, or one not known', () => {
		const m = defaultMask(40);
		stamp(m, 20, 20, { radius: 0, value: get(m, 20, 20) ? 0 : 1 });
		expect(isDefaultMask(m)).toBe(false);
		const unknown = { ...defaultMask(40), validMask: new Uint8Array(1600).fill(1) };
		expect(isDefaultMask(unknown)).toBe(true);
		unknown.validMask[7] = 0;
		expect(isDefaultMask(unknown)).toBe(false);
	});
});

describe('checks', () => {
	it('lays a plain board whose corner squares are the left paper, as a classic 3 × 3', () => {
		const m = createMask(1, 30);
		checks(m, 3);
		const at = (x: number, y: number) => get(m, x * 10 + 5, y * 10 + 5);
		expect([0, 1, 2].map((y) => [0, 1, 2].map((x) => at(x, y)).join('')).join('/')).toBe('010/101/010');
	});

	it('cuts every square to the same width on the painting mask', () => {
		const widths = new Map<number, number>();
		for (let x = 0; x < MASK_SIZE; x++) {
			const square = Math.floor((x + 0.5) * 7 / MASK_SIZE);
			widths.set(square, (widths.get(square) ?? 0) + 1);
		}
		expect([...widths.values()].every((w) => w === 57 || w === 58)).toBe(true);
		expect(checkAt(0, 0, 7, MASK_SIZE)).toBe(0);
	});

	it('stays inside a fence', () => {
		const m = createMask(0, 30);
		const fence = new Uint8Array(900);
		for (let x = 0; x < 30; x++) fence[15 * 30 + x] = 1;
		checks(m, 3, fence);
		// The middle row crosses the right paper's two squares beside the middle one.
		expect(count(m, 1)).toBe(20);
		expect([...m.data].every((v, i) => !v || (i >= 450 && i < 480))).toBe(true);
	});

	it('mirrors exactly at the painting size, so a board under symmetry needs no folding', () => {
		for (const n of [3, 5, 7, 9]) {
			const m = createMask(0);
			checks(m, n);
			for (const t of ['mirrorX', 'mirrorY', 'transpose', 'antiTranspose', 'rotate180'] as Transform[])
				expect(disagreement(m, t)).toBe(0);
		}
	});

	it('knows an even board turns paper over under a mirror within the lobe', () => {
		expect(checksKeepSymmetry(4, transformsFor({ curve: 'off', lobe: 'sym', lobes: 'off' }))).toBe(false);
		expect(checksKeepSymmetry(5, transformsFor({ curve: 'off', lobe: 'sym', lobes: 'off' }))).toBe(true);
		expect(checksKeepSymmetry(4, transformsFor({ curve: 'off', lobe: 'anti', lobes: 'sym' }))).toBe(true);
		expect(checksKeepSymmetry(6, [])).toBe(true);
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
		expect(changed).toEqual({ x0: 0, y0: 0, x1: 6, y1: 6 });
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

	it('mirrors the left paper the same way', () => {
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

describe('applySymmetricEdit', () => {
	/** Move a patch of cells and spread it, as the canvas does on a Markér commit. */
	function moveAndSpread(m: Mask, from: Box, dx: number, dy: number, transforms: Transform[]): void {
		const sel = lift(m, from)!;
		sel.placement = moveBy(sel.placement, dx, dy);
		const edit = commit(m, sel);
		applySymmetricEdit(m, edit.box, edit.marks, transforms);
	}

	/** A blob at each of the four corners, so the mask starts exactly mirrored. */
	function fourBlobs(): Mask {
		const m = createMask(0, 16);
		for (const [x, y] of [
			[2, 2],
			[11, 2],
			[2, 11],
			[11, 11]
		]) {
			rect(m, { x: x!, y: y! }, { x: x! + 2, y: y! + 2 }, 1);
		}
		return m;
	}

	it('mirrors a moved patch instead of rubbing the picture out', () => {
		const m = fourBlobs();
		const ink = count(m, 1);

		moveAndSpread(m, { x0: 1, y0: 1, x1: 6, y1: 6 }, 2, 0, ['mirrorX', 'mirrorY']);

		// All four blobs have moved together, and none of them was lost on the way.
		expect(disagreement(m, 'mirrorX')).toBe(0);
		expect(disagreement(m, 'mirrorY')).toBe(0);
		expect(count(m, 1)).toBe(ink);
		expect(get(m, 5, 3)).toBe(1); // where the patch landed
		expect(get(m, 3, 3)).toBe(0); // the hole it came from
		expect(get(m, 10, 3)).toBe(1); // its image under mirrorX
	});

	it('keeps the patch when it is dropped onto its own reflection', () => {
		// The gesture that used to blank the whole mask: with Mellem lapper Sym on,
		// drag a blob across the diagonal and onto the cells its own image stands on.
		const m = createMask(0, 16);
		rect(m, { x: 2, y: 6 }, { x: 4, y: 8 }, 1);
		rect(m, { x: 6, y: 2 }, { x: 8, y: 4 }, 1);
		const ink = count(m, 1);

		moveAndSpread(m, { x0: 1, y0: 5, x1: 6, y1: 10 }, 4, -4, ['transpose']);

		expect(count(m, 1)).toBe(ink);
		expect(disagreement(m, 'transpose')).toBe(0);
		expect(get(m, 6, 2)).toBe(1);
		expect(get(m, 2, 6)).toBe(1);
	});

	it('spreads the hole a moved patch leaves behind', () => {
		const m = createMask(0, 16);
		rect(m, { x: 2, y: 6 }, { x: 4, y: 8 }, 1);
		rect(m, { x: 6, y: 2 }, { x: 8, y: 4 }, 1);

		moveAndSpread(m, { x0: 1, y0: 5, x1: 6, y1: 10 }, 0, 5, ['transpose']);

		expect(disagreement(m, 'transpose')).toBe(0);
		// Both blobs left: the one the patch carried, and its image, which the hole
		// took with it.
		expect(get(m, 3, 6)).toBe(0);
		expect(get(m, 6, 3)).toBe(0);
		expect(get(m, 3, 11)).toBe(1);
		expect(get(m, 11, 3)).toBe(1);
	});

	it('leaves the mask alone with no symmetry on, and returns its own box', () => {
		const m = createMask(0, 16);
		const marks = new Uint8Array(m.data.length);
		const box = { x0: 1, y0: 1, x1: 3, y1: 3 };
		const changed = applySymmetricEdit(m, box, marks, []);
		expect(changed).toEqual(box);
		expect(changed).not.toBe(box);
		expect(isEmpty(m)).toBe(true);
	});
});

describe('edges between the cells', () => {
	it("puts the pen's edge where the head went, not on the cells' side", () => {
		const m = createMask(0, 40);
		stamp(m, 20.3, 20, { radius: 6.4, value: 1 });
		const [left, right] = crossings(m, 20 * 40, 1, 40);
		expect(left).toBeCloseTo(20.3 - 6.4, 1);
		expect(right).toBeCloseTo(20.3 + 6.4, 1);
	});

	it('draws a shallow line as a line, a hundredth of a cell or so off at most', () => {
		const m = createMask(0, 60);
		stroke(m, { x: 5, y: 20 }, { x: 55, y: 24 }, { radius: 2, value: 1 });
		for (let x = 10; x <= 50; x++) {
			// The top of the stroke: the line moved up by its radius, square to it.
			const top = 20 + 0.08 * (x - 5) - 2 * Math.hypot(1, 0.08);
			expect(Math.abs(crossings(m, x, 60, 60)[0]! - top)).toBeLessThan(0.03);
		}
	});

	it('changes nothing the second time over, edges and all', () => {
		const m = createMask(0, 40);
		stroke(m, { x: 8.2, y: 9.7 }, { x: 30.6, y: 21.1 }, { radius: 3.3, value: 1, shape: 'diamond' });
		expect(isEmptyBox(stroke(m, { x: 8.2, y: 9.7 }, { x: 30.6, y: 21.1 }, { radius: 3.3, value: 1, shape: 'diamond' }))).toBe(true);
	});

	it('keeps the edges of two shapes a cell apart where each was drawn', () => {
		const m = createMask(0, 40);
		rect(m, { x: 0, y: 0 }, { x: 9, y: 39 }, 1);
		stamp(m, 14, 20, { radius: 3, value: 1 });
		const [rectSide, discSide] = crossings(m, 20 * 40, 1, 40);
		expect(rectSide).toBeCloseTo(9.5, 2);
		expect(discSide).toBeCloseTo(11, 1);
	});

	it("puts the ellipse's edge on its own curve", () => {
		const m = createMask(0, 40);
		ellipse(m, { x: 10, y: 10 }, { x: 30, y: 20 }, 1);
		expect(crossings(m, 15 * 40, 1, 40).map((x) => x.toFixed(2))).toEqual(['9.50', '30.50']);
		expect(crossings(m, 20, 40, 40).map((y) => y.toFixed(2))).toEqual(['9.50', '20.50']);
	});

	it("lays Tern's squares 400/n cells wide, and mirrored exactly", () => {
		const m = createMask(0, MASK_SIZE);
		checks(m, 7);
		const sides = crossings(m, 3 * MASK_SIZE, 1, MASK_SIZE);
		expect(sides).toHaveLength(6);
		sides.forEach((x, k) => expect(Math.abs(x - ((k + 1) * MASK_SIZE) / 7 + 0.5)).toBeLessThan(0.01));
		for (let y = 0; y < MASK_SIZE; y += 13)
			for (let x = 0; x < MASK_SIZE; x++) expect(m.level![y * MASK_SIZE + x]).toBe(m.level![y * MASK_SIZE + MASK_SIZE - 1 - x]);
	});

	it("carries a stroke's edge to its images, across the mirror line too", () => {
		const m = createMask(0, 40);
		applySymmetric(m, stroke(m, { x: 5.3, y: 12.7 }, { x: 17.1, y: 9.2 }, { radius: 2.6, value: 1 }), ['mirrorX'], 1);
		applySymmetric(m, stroke(m, { x: 15.2, y: 20 }, { x: 24.9, y: 23.3 }, { radius: 2.2, value: 1 }), ['mirrorX'], 1);
		applySymmetric(m, stroke(m, { x: 11.5, y: 21 }, { x: 22.4, y: 30.8 }, { radius: 1.7, value: 0 }), ['mirrorX'], 0);
		for (let y = 0; y < 40; y++)
			for (let x = 0; x < 40; x++) expect(m.level![y * 40 + x]).toBe(m.level![y * 40 + 39 - x]);
		expect(crossings(m, 11 * 40, 1, 40).length).toBeGreaterThan(0);
	});

	it('folds an edge drawn a little differently on each side to the one between', () => {
		const m = createMask(0, 40);
		stamp(m, 10.2, 20, { radius: 5, value: 1 });
		stamp(m, 39 - 10.6, 20, { radius: 5, value: 1 });
		symmetrize(m, ['mirrorX']);
		const [left] = crossings(m, 20 * 40, 1, 40);
		expect(left).toBeCloseTo(10.4 - 5, 1);
		for (let x = 0; x < 40; x++) expect(m.level![20 * 40 + x]).toBe(m.level![20 * 40 + 39 - x]);
	});

	it("leaves an edge where it was when a fill of the paper's own colour only observes it", () => {
		const m = { ...createMask(0, 40), validMask: new Uint8Array(1600).fill(1) };
		stamp(m, 20.4, 20, { radius: 6.2, value: 1 });
		m.validMask.fill(0, 0, 40);
		const level = m.level!.slice();
		floodFill(m, 0, 0, 0);
		expect(m.validMask.every(Boolean)).toBe(true);
		expect([...m.level!]).toEqual([...level]);
	});
});
