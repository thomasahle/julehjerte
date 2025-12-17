import { describe, it, expect } from 'vitest';
import { clamp, clampInt, median, clamp01 } from './math';

describe('clamp', () => {
	it('returns value unchanged when within range', () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(0, 0, 10)).toBe(0);
		expect(clamp(10, 0, 10)).toBe(10);
	});

	it('returns min when value is below min', () => {
		expect(clamp(-5, 0, 10)).toBe(0);
		expect(clamp(-100, -50, 50)).toBe(-50);
	});

	it('returns max when value is above max', () => {
		expect(clamp(15, 0, 10)).toBe(10);
		expect(clamp(100, -50, 50)).toBe(50);
	});

	it('handles equal min and max', () => {
		expect(clamp(5, 5, 5)).toBe(5);
		expect(clamp(0, 5, 5)).toBe(5);
		expect(clamp(10, 5, 5)).toBe(5);
	});

	it('handles negative ranges', () => {
		expect(clamp(-5, -10, -1)).toBe(-5);
		expect(clamp(0, -10, -1)).toBe(-1);
		expect(clamp(-15, -10, -1)).toBe(-10);
	});

	it('handles floating point values', () => {
		expect(clamp(0.5, 0, 1)).toBe(0.5);
		expect(clamp(1.5, 0, 1)).toBe(1);
		expect(clamp(-0.5, 0, 1)).toBe(0);
	});
});

describe('clampInt', () => {
	it('rounds before clamping', () => {
		expect(clampInt(5.4, 0, 10)).toBe(5);
		expect(clampInt(5.6, 0, 10)).toBe(6);
	});

	it('handles 0.5 rounding (rounds to nearest even or up)', () => {
		// Math.round rounds 0.5 up
		expect(clampInt(5.5, 0, 10)).toBe(6);
		expect(clampInt(4.5, 0, 10)).toBe(5);
	});

	it('clamps after rounding', () => {
		expect(clampInt(10.6, 0, 10)).toBe(10); // rounds to 11, clamps to 10
		expect(clampInt(-0.6, 0, 10)).toBe(0); // rounds to -1, clamps to 0
	});

	it('handles negative values', () => {
		expect(clampInt(-5.4, -10, 0)).toBe(-5);
		expect(clampInt(-5.6, -10, 0)).toBe(-6);
	});

	it('returns integer values', () => {
		const result = clampInt(5.7, 0, 10);
		expect(Number.isInteger(result)).toBe(true);
	});
});

describe('median', () => {
	it('returns 0 for empty array', () => {
		expect(median([])).toBe(0);
	});

	it('returns the element for single-element array', () => {
		expect(median([5])).toBe(5);
		expect(median([0])).toBe(0);
		expect(median([-3])).toBe(-3);
	});

	it('returns middle element for odd-length array', () => {
		expect(median([1, 2, 3])).toBe(2);
		expect(median([1, 2, 3, 4, 5])).toBe(3);
	});

	it('returns average of two middle elements for even-length array', () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(median([1, 2])).toBe(1.5);
	});

	it('handles unsorted input', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('handles negative numbers', () => {
		expect(median([-3, -1, -2])).toBe(-2);
		expect(median([-10, 0, 10])).toBe(0);
	});

	it('handles floating point numbers', () => {
		expect(median([1.5, 2.5, 3.5])).toBe(2.5);
		expect(median([1.1, 2.2, 3.3, 4.4])).toBe(2.75);
	});

	it('does not mutate the original array', () => {
		const original = [3, 1, 2];
		median(original);
		expect(original).toEqual([3, 1, 2]);
	});

	it('handles duplicate values', () => {
		expect(median([5, 5, 5])).toBe(5);
		expect(median([1, 5, 5, 5])).toBe(5);
	});
});

describe('clamp01', () => {
	it('returns value unchanged when within [0, 1]', () => {
		expect(clamp01(0)).toBe(0);
		expect(clamp01(0.5)).toBe(0.5);
		expect(clamp01(1)).toBe(1);
	});

	it('clamps values below 0 to 0', () => {
		expect(clamp01(-0.5)).toBe(0);
		expect(clamp01(-100)).toBe(0);
	});

	it('clamps values above 1 to 1', () => {
		expect(clamp01(1.5)).toBe(1);
		expect(clamp01(100)).toBe(1);
	});
});
