import { describe, it, expect } from 'vitest';
import {
	fitHeart,
	HEART_BOUNDS,
	HEART_HEIGHT,
	HEART_WIDTH,
	insideSquare,
	toMask,
	toScreen,
	toSquare
} from './heartLayout';

const LAYOUT = fitHeart(800, 600, 20);

describe('the heart on screen', () => {
	it('turns the square so its corners are the cleft and the tip', () => {
		// (0, 0) of the mask is the heart's top cleft and (1, 1) the bottom tip —
		// the engine's own frame (PAINT.md §4), and what the lobes hang from.
		const cleft = toScreen(LAYOUT, 0, 0);
		const tip = toScreen(LAYOUT, 1, 1);
		const right = toScreen(LAYOUT, 1, 0);
		const left = toScreen(LAYOUT, 0, 1);
		expect(cleft.x).toBeCloseTo(LAYOUT.cx, 9);
		expect(tip.x).toBeCloseTo(LAYOUT.cx, 9);
		expect(cleft.y).toBeLessThan(tip.y);
		expect(left.x).toBeLessThan(right.x);
		expect(left.y).toBeCloseTo(right.y, 9);
	});

	it('puts the left lobe up to the left and the right lobe up to the right', () => {
		// The lobes hang off the square's left and top edges; after the turn those
		// are the two upper sides of the diamond.
		const leftEar = toScreen(LAYOUT, -0.5, 0.5);
		const rightEar = toScreen(LAYOUT, 0.5, -0.5);
		expect(leftEar.x).toBeLessThan(LAYOUT.cx);
		expect(rightEar.x).toBeGreaterThan(LAYOUT.cx);
		expect(leftEar.y).toBeLessThan(LAYOUT.cy);
		expect(rightEar.y).toBeLessThan(LAYOUT.cy);
	});

	it('reads a screen point back to the square it came from', () => {
		for (const [u, v] of [
			[0, 0],
			[1, 1],
			[0.25, 0.8],
			[-0.3, 1.4]
		]) {
			const screen = toScreen(LAYOUT, u!, v!);
			const back = toSquare(LAYOUT, screen.x, screen.y);
			expect(back.x).toBeCloseTo(u!, 9);
			expect(back.y).toBeCloseTo(v!, 9);
		}
	});

	it('scales square units into mask cells', () => {
		const screen = toScreen(LAYOUT, 0.25, 0.75);
		const cell = toMask(LAYOUT, 400, screen.x, screen.y);
		expect(cell.x).toBeCloseTo(100, 6);
		expect(cell.y).toBeCloseTo(300, 6);
	});

	it('says which points are on the mask', () => {
		expect(insideSquare({ x: 0, y: 0 }, 400)).toBe(true);
		expect(insideSquare({ x: 399.9, y: 399.9 }, 400)).toBe(true);
		expect(insideSquare({ x: 400, y: 10 }, 400)).toBe(false);
		expect(insideSquare({ x: -0.1, y: 10 }, 400)).toBe(false);
	});
});

describe('fitHeart', () => {
	it('fits the whole heart, lobes and all, inside the padded box', () => {
		const layout = fitHeart(500, 400, 16);
		const corners = [
			[HEART_BOUNDS.minX, HEART_BOUNDS.minY],
			[HEART_BOUNDS.maxX, HEART_BOUNDS.maxY]
		];
		for (const [dx, dy] of corners) {
			const x = layout.cx + layout.scale * dx!;
			const y = layout.cy + layout.scale * dy!;
			expect(x).toBeGreaterThanOrEqual(16 - 1e-9);
			expect(x).toBeLessThanOrEqual(500 - 16 + 1e-9);
			expect(y).toBeGreaterThanOrEqual(16 - 1e-9);
			expect(y).toBeLessThanOrEqual(400 - 16 + 1e-9);
		}
	});

	it('touches both edges of whichever axis is the tight one', () => {
		// A wide box is limited by its height, a tall one by its width.
		const wide = fitHeart(1200, 400, 0);
		expect(wide.scale).toBeCloseTo(400 / HEART_HEIGHT, 9);
		const tall = fitHeart(300, 1200, 0);
		expect(tall.scale).toBeCloseTo(300 / HEART_WIDTH, 9);
	});

	it('survives a box with no room in it', () => {
		// The canvas is measured before it has been laid out at least once.
		const layout = fitHeart(0, 0, 24);
		expect(layout.scale).toBeGreaterThan(0);
		expect(Number.isFinite(layout.cx) && Number.isFinite(layout.cy)).toBe(true);
	});
});
