import { describe, it, expect } from 'vitest';
import { heartLayout } from './drawHeart';

/** The heart's reach from the square's centre, in units of the square's side. */
const REACH = Math.SQRT1_2 / 2 + 0.5;
const BOTTOM = Math.SQRT1_2;

/** Where the drawn heart's outermost points land on a canvas of `size` pixels. */
function edges(size: number) {
	const { cx, cy, scale } = heartLayout(size);
	return {
		left: cx - REACH * scale,
		right: cx + REACH * scale,
		top: cy - REACH * scale,
		bottom: cy + BOTTOM * scale,
		scale
	};
}

describe('heartLayout', () => {
	it('fits the whole heart on the canvas', () => {
		const { left, right, top, bottom } = edges(200);
		expect(left).toBeGreaterThan(0);
		expect(top).toBeGreaterThan(0);
		expect(right).toBeLessThan(200);
		expect(bottom).toBeLessThan(200);
	});

	it('centres it, which the lobes make an off-centre square', () => {
		const { left, right, top, bottom } = edges(200);
		expect(left).toBeCloseTo(200 - right, 6);
		expect(top).toBeCloseTo(200 - bottom, 6);
		// The lobes rise higher than the tip falls, so the square's centre sits
		// below the canvas's — a layout that simply centred the square would push
		// the cleft off the top edge.
		expect(heartLayout(200).cy).toBeGreaterThan(100);
	});

	it("leaves the SVG heart's 2.1% of air on the long side", () => {
		const { left, right, scale } = edges(200);
		expect(left).toBeCloseTo(0.021 * (right - left), 4);
		// The heart is wider than it is tall, so width is what the padding is of.
		expect(right - left).toBeCloseTo(2 * REACH * scale, 6);
	});

	it('scales linearly, so the same mask reads the same at any size', () => {
		const small = heartLayout(100);
		const large = heartLayout(400);
		expect(large.scale).toBeCloseTo(4 * small.scale, 6);
		expect(large.cy / 400).toBeCloseTo(small.cy / 100, 6);
	});
});
