import { describe, it, expect } from 'vitest';
import {
	clampBox,
	cloneMask,
	createMask,
	emptyBox,
	get,
	isEmpty,
	isEmptyBox,
	MASK_SIZE,
	maskMismatch,
	packMask,
	resample,
	unionBox,
	unpackMask
} from './mask';

/** A `size × size` buffer whose cells are their own index, for tracing a resample. */
function counting(size: number): Uint8Array {
	return Uint8Array.from({ length: size * size }, (_, i) => i);
}

describe('createMask', () => {
	it('is a full-resolution square of the left colour by default', () => {
		const m = createMask();
		expect(m.size).toBe(MASK_SIZE);
		expect(m.data.length).toBe(MASK_SIZE * MASK_SIZE);
		expect(isEmpty(m)).toBe(true);
	});

	it('can be filled with the right colour, and clones do not share cells', () => {
		const m = createMask(1, 8);
		expect(isEmpty(m)).toBe(false);
		const copy = cloneMask(m);
		copy.data[0] = 0;
		expect(m.data[0]).toBe(1);
	});

	it('is not empty once a single cell is painted, wherever it sits', () => {
		// `isEmpty` guards the "Ryd" confirm and the "replace the mask?" prompt, so
		// one stroke in the far corner has to count as much as a filled square.
		const m = createMask();
		m.data[MASK_SIZE * MASK_SIZE - 1] = 1;
		expect(isEmpty(m)).toBe(false);
	});
});

describe('get', () => {
	it('treats everything outside the square as the left colour', () => {
		// Tools ask about neighbours without checking the edge first, so reading past
		// it has to answer the background rather than wrap to the other side.
		const m = createMask(0, 8);
		m.data[4 * 8 + 3] = 1;
		expect(get(m, 3, 4)).toBe(1);
		expect(get(m, -1, 4)).toBe(0);
		expect(get(m, 8, 4)).toBe(0);
		expect(get(m, 3, -1)).toBe(0);
		expect(get(m, 3, 8)).toBe(0);
	});
});

describe('boxes', () => {
	it('cut a region down to the mask', () => {
		const m = createMask(0, 8);
		expect(clampBox(m, -3, -3, 4, 4)).toEqual({ x0: 0, y0: 0, x1: 4, y1: 4 });
		expect(isEmptyBox(clampBox(m, 20, 20, 30, 30))).toBe(true);
	});

	it('union around an empty box instead of growing to the origin', () => {
		const box = { x0: 4, y0: 4, x1: 6, y1: 6 };
		expect(unionBox(emptyBox(), box)).toEqual(box);
		expect(unionBox(box, emptyBox())).toEqual(box);
		expect(unionBox(box, { x0: 0, y0: 7, x1: 1, y1: 9 })).toEqual({ x0: 0, y0: 4, x1: 6, y1: 9 });
	});
});

describe('resample', () => {
	it('keeps the picture when scaling up and back down', () => {
		const m = createMask(0, 4);
		m.data.set([1, 0, 0, 1], 0);
		m.data.set([0, 1, 1, 0], 12);
		const up = resample(m.data, 4, 12);
		expect([...resample(up, 12, 4)]).toEqual([...m.data]);
	});

	it('picks the nearest cell rather than inventing a third value', () => {
		const m = createMask(0, 2);
		m.data.set([1, 0, 0, 1]);
		expect([...resample(m.data, 2, 4)]).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1]);
	});

	it('copies rather than aliases when the size is unchanged', () => {
		const m = createMask(1, 4);
		const same = resample(m.data, 4, 4);
		same[0] = 0;
		expect(m.data[0]).toBe(1);
	});

	it('takes the nearest cell going down, not the first of each block', () => {
		// 4 → 2 samples the centres of the target cells, which land on source rows
		// and columns 1 and 3 — the second and fourth, not the first and third.
		expect([...resample(counting(4), 4, 2)]).toEqual([5, 7, 13, 15]);
	});

	it('stays inside the source at the far edge for any ratio', () => {
		// The engine may answer at any resolution, and a rounding slip in the last
		// row would read past the buffer, which a Uint8Array silently reports as 0.
		for (const [from, to] of [
			[3, 7],
			[7, 3],
			[400, 200],
			[200, 400],
			[5, 5]
		]) {
			const source = new Uint8Array(from! * from!).fill(1);
			const out = resample(source, from!, to!);
			expect(out.length).toBe(to! * to!);
			expect(out.every((v) => v === 1)).toBe(true);
		}
	});
});

describe('maskMismatch', () => {
	it('counts the share of cells that differ', () => {
		expect(maskMismatch(new Uint8Array([0, 1, 0, 1]), new Uint8Array([0, 1, 1, 1]))).toBe(0.25);
		expect(maskMismatch(new Uint8Array([1, 1]), new Uint8Array([1, 1]))).toBe(0);
	});

	it('refuses masks it cannot line up, rather than answering about a prefix', () => {
		expect(() => maskMismatch(new Uint8Array(4), new Uint8Array(9))).toThrow();
		expect(() => maskMismatch(new Uint8Array(0), new Uint8Array(0))).toThrow();
	});
});

describe('packMask', () => {
	it('round-trips a full-size mask', () => {
		const m = createMask(0, MASK_SIZE);
		for (let i = 0; i < m.data.length; i += 7) m.data[i] = 1;
		m.data[m.data.length - 1] = 1;
		const back = unpackMask(MASK_SIZE, packMask(m));
		expect(back).not.toBeNull();
		expect([...back!.data]).toEqual([...m.data]);
	});

	it('round-trips a size whose cells do not fill whole bytes', () => {
		const m = createMask(0, 5); // 25 cells: three bytes and one bit
		m.data[24] = 1;
		m.data[0] = 1;
		expect([...unpackMask(5, packMask(m))!.data]).toEqual([...m.data]);
	});

	it('refuses text that is not a mask of that size', () => {
		expect(unpackMask(400, 'AAAA')).toBeNull();
		expect(unpackMask(4, '!!!!')).toBeNull();
		expect(unpackMask(0, '')).toBeNull();
	});
});
