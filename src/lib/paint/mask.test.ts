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
	packMask,
	resample,
	set,
	unionBox,
	unpackMask
} from './mask';

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
});

describe('get and set', () => {
	it('treat everything outside the square as the left colour, and drop writes there', () => {
		const m = createMask(0, 8);
		set(m, 3, 4, 1);
		expect(get(m, 3, 4)).toBe(1);
		expect(get(m, -1, 4)).toBe(0);
		expect(get(m, 8, 4)).toBe(0);
		set(m, -1, 4, 1);
		set(m, 8, 4, 1);
		expect(m.data.filter((v) => v === 1).length).toBe(1);
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
