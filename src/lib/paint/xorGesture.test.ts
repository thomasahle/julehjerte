import { describe, expect, it } from 'vitest';
import { cloneMask, createMask, shareAt } from './mask';
import { stroke } from './tools';
import { createXorGesture } from './xorGesture';
import { createHistory, record, redo, undo } from './history';
import { NO_SYMMETRY } from './symmetry';

describe('XOR gestures', () => {
	it("draws the footprint's edge between the cells, on either paper", () => {
		const plain = createMask(0, 30);
		stroke(plain, { x: 4.3, y: 7.8 }, { x: 25.1, y: 19.6 }, { radius: 3.4, value: 1 });
		const blank = createMask(0, 30), full = createMask(1, 30);
		createXorGesture(blank).stroke({ x: 4.3, y: 7.8 }, { x: 25.1, y: 19.6 }, 3.4);
		createXorGesture(full).stroke({ x: 4.3, y: 7.8 }, { x: 25.1, y: 19.6 }, 3.4);
		for (let i = 0; i < 900; i++) {
			expect(shareAt(blank, i)).toBe(shareAt(plain, i));
			expect(shareAt(full, i)).toBe(255 - shareAt(plain, i));
		}
	});

	it('inverts both papers once across overlapping dabs and a retraced stroke', () => {
		const mask = createMask(0, 20);
		for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) mask.data[y * 20 + x] = 1;
		const before = mask.data.slice();
		const gesture = createXorGesture(mask);
		gesture.stroke({ x: 3, y: 10 }, { x: 16, y: 10 }, 2);
		const once = mask.data.slice();
		gesture.stroke({ x: 16, y: 10 }, { x: 3, y: 10 }, 2);
		gesture.stroke({ x: 8, y: 10 }, { x: 8, y: 10 }, 2);
		expect(mask.data).toEqual(once);
		expect(mask.data[10 * 20 + 5]).toBe(1);
		expect(mask.data[10 * 20 + 14]).toBe(0);
		expect(mask.data[0]).toBe(before[0]);
		// A second gesture does invert them again.
		createXorGesture(mask).stroke({ x: 3, y: 10 }, { x: 16, y: 10 }, 2);
		expect(mask.data).toEqual(before);
	});

	it('inverts the union of symmetry copies, including their intersections', () => {
		const mask = createMask(0, 21);
		const gesture = createXorGesture(mask, ['transpose', 'mirrorX', 'mirrorY']);
		gesture.stroke({ x: 5, y: 10 }, { x: 15, y: 10 }, 1);
		gesture.stroke({ x: 10, y: 5 }, { x: 10, y: 15 }, 1);
		expect(mask.data[10 * 21 + 10]).toBe(1);
		expect(mask.data[5 * 21 + 10]).toBe(1);
		expect(mask.data[10 * 21 + 5]).toBe(1);
		expect(mask.data[0]).toBe(0);
	});

	it('rectangles invert their interior and fills follow the original connected region', () => {
		const mask = createMask(0, 10);
		for (let y = 0; y < 10; y++) mask.data[y * 10 + 5] = 1;
		createXorGesture(mask).fill(1, 1);
		expect(mask.data[11]).toBe(1);
		expect(mask.data[18]).toBe(0);
		createXorGesture(mask).rect({ x: 3, y: 3 }, { x: 7, y: 7 });
		expect(mask.data[44]).toBe(0);
		expect(mask.data[46]).toBe(1);
		expect(mask.data[18]).toBe(0);
		expect(new Set(mask.data)).toEqual(new Set([0, 1]));
	});

	it('records one reversible binary edit and observes only the cells painted', () => {
		const mask = createMask(0, 10);
		mask.validMask = new Uint8Array(100);
		const original = cloneMask(mask);
		const history = createHistory();
		const symmetry = { ...NO_SYMMETRY };
		record(history, { mask, symmetry });
		const gesture = createXorGesture(mask);
		gesture.stroke({ x: 2, y: 2 }, { x: 6, y: 2 }, 1);
		gesture.stroke({ x: 6, y: 2 }, { x: 2, y: 2 }, 1);
		expect(mask.validMask[22]).toBe(1);
		expect(mask.validMask[99]).toBe(0);
		expect(history.past).toHaveLength(1);
		const previous = undo(history, { mask, symmetry })!;
		expect(previous.mask).toEqual(original);
		expect(redo(history, previous)!.mask).toEqual(mask);
	});
});
