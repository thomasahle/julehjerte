import { describe, it, expect } from 'vitest';
import { wheelZoomFactor } from './wheelZoom';

describe('wheelZoomFactor', () => {
	it('zooms about 10 % per mouse notch (deltaY 100)', () => {
		expect(wheelZoomFactor(-100)).toBeCloseTo(Math.exp(0.1), 10);
		expect(wheelZoomFactor(100)).toBeCloseTo(Math.exp(-0.1), 10);
		expect(wheelZoomFactor(-100)).toBeGreaterThan(1.09);
		expect(wheelZoomFactor(-100)).toBeLessThan(1.12);
	});

	it('counts a coalesced multi-notch event as that many notches', () => {
		expect(wheelZoomFactor(-300)).toBeCloseTo(Math.exp(0.3), 10);
		expect(wheelZoomFactor(300)).toBeGreaterThan(0);
	});

	it('is monotonic in the delta', () => {
		let prev = Infinity;
		for (let d = -500; d <= 500; d += 5) {
			const f = wheelZoomFactor(d);
			expect(f).toBeLessThanOrEqual(prev);
			prev = f;
		}
	});

	it('is symmetric: one notch in then out returns to the start', () => {
		expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1, 12);
	});

	it('treats a line-mode notch (3 lines) like a pixel notch', () => {
		expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(100), 10);
	});

	it('keeps small trackpad-pinch deltas at about 1 % per pixel', () => {
		expect(wheelZoomFactor(-2)).toBeCloseTo(1.02, 3);
		expect(wheelZoomFactor(0)).toBe(1);
		expect(wheelZoomFactor(NaN)).toBe(1);
	});
});
