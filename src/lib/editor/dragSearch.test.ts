import { describe, expect, it } from 'vitest';
import type { Vec } from '$lib/types/heart';
import { nearestAllowed, type Reached } from './dragSearch';

const SIZE = 200;
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** `allowed`, counting the places it judges, each once, as the editor's judge does. */
const counted = (allowed: (p: Vec) => boolean) => {
	const seen = new Set<string>();
	return { judged: () => seen.size, allowed: (p: Vec) => (seen.add(`${p.x} ${p.y}`), allowed(p)) };
};
/** The point of y = 6 sin(x / 12) nearest `q`, by brute force. */
function nearestOnWave(q: Vec): Vec {
	let best = { d: Infinity, x: 0 };
	for (let u = q.x - 40; u <= q.x + 40; u += 0.002) {
		const d = Math.hypot(u - q.x, 6 * Math.sin(u / 12) - q.y);
		if (d < best.d) best = { d, x: u };
	}
	return { x: best.x, y: 6 * Math.sin(best.x / 12) };
}

describe('nearestAllowed', () => {
	it('goes all the way where the point may be', () => {
		expect(nearestAllowed({ x: 0, y: 0 }, { x: 30, y: -10 }, () => true, SIZE)).toEqual({ point: { x: 30, y: -10 }, slide: null });
	});

	it('slides along a straight edge to the place nearest the pointer, not stopping where it met the edge', () => {
		const below = (p: Vec) => p.y <= 0;
		for (const to of [{ x: 40, y: 15 }, { x: 80, y: 60 }, { x: -30, y: 2 }]) {
			const { point } = nearestAllowed({ x: 0, y: -10 }, to, below, SIZE);
			expect(below(point)).toBe(true);
			expect(distance(point, { x: to.x, y: 0 })).toBeLessThan(0.05);
		}
	});

	it('stops in a corner it is pushed into, and where the pointer pushes it square onto an edge', () => {
		const corner = nearestAllowed({ x: -10, y: -10 }, { x: 15, y: 25 }, (p) => p.x <= 0 && p.y <= 0, SIZE);
		expect(distance(corner.point, { x: 0, y: 0 })).toBeLessThan(0.05);
		const square = nearestAllowed({ x: 0, y: -10 }, { x: 0, y: 20 }, (p) => p.y <= 0, SIZE);
		expect(distance(square.point, { x: 0, y: 0 })).toBeLessThan(0.05);
	});

	it('goes round a bent edge, outside a round one and inside it', () => {
		// a disc the point may not enter, the pointer inside it: the point on its rim nearest the pointer
		const outside = nearestAllowed({ x: -40, y: 0 }, { x: 5, y: 12 }, (p) => Math.hypot(p.x, p.y) >= 20, SIZE);
		expect(distance(outside.point, { x: (5 / 13) * 20, y: (12 / 13) * 20 })).toBeLessThan(0.5);
		// a disc the point may not leave, the pointer outside it
		const inside = nearestAllowed({ x: 0, y: 0 }, { x: 0, y: 60 }, (p) => Math.hypot(p.x - 10, p.y) <= 30, SIZE);
		const h = Math.hypot(10, 60);
		expect(distance(inside.point, { x: 10 - (30 * 10) / h, y: (30 * 60) / h })).toBeLessThan(0.05);
	});

	it('follows the pointer along a wavy edge, move by move, at the place nearest it, with a few dozen looks a move', () => {
		const wave = (p: Vec) => p.y <= 6 * Math.sin(p.x / 12);
		let reached: Reached = nearestAllowed({ x: -40, y: -20 }, { x: -30, y: 10 }, wave, SIZE);
		let judged = 0;
		let moves = 0;
		for (let x = -29; x <= 40; x++) {
			const pointer = { x, y: 10 };
			const look = counted(wave);
			reached = nearestAllowed(reached.point, pointer, look.allowed, SIZE, reached.slide);
			judged += look.judged();
			moves++;
			expect(wave(reached.point)).toBe(true);
			expect(distance(reached.point, pointer) - distance(nearestOnWave(pointer), pointer)).toBeLessThan(0.05);
		}
		expect(judged / moves).toBeLessThan(70);
	});

	it('goes on along a straight edge with few looks, and back the other way', () => {
		const below = (p: Vec) => p.y <= 0;
		const first = nearestAllowed({ x: 0, y: -10 }, { x: 20, y: 15 }, below, SIZE);
		expect(first.slide).not.toBeNull();
		const look = counted(below);
		const next = nearestAllowed(first.point, { x: 24, y: 15 }, look.allowed, SIZE, first.slide);
		expect(distance(next.point, { x: 24, y: 0 })).toBeLessThan(0.1);
		expect(look.judged()).toBeLessThan(40);
		const back = nearestAllowed(next.point, { x: 10, y: 15 }, below, SIZE, next.slide);
		expect(distance(back.point, { x: 10, y: 0 })).toBeLessThan(0.1);
	});

	it('stays where it is when it may not be there', () => {
		expect(nearestAllowed({ x: 0, y: 5 }, { x: 0, y: 20 }, (p) => p.y <= 0, SIZE).point).toEqual({ x: 0, y: 5 });
	});

	it('never leaves where the point may be', () => {
		const shapes: Array<(p: Vec) => boolean> = [
			(p) => p.y <= 0.3 * p.x,
			(p) => Math.hypot(p.x - 30, p.y) >= 25,
			(p) => p.y <= 10 * Math.sin(p.x / 15),
			(p) => p.x <= 0 || p.y <= -5
		];
		for (const allowed of shapes) {
			for (let k = 0; k < 40; k++) {
				const { point } = nearestAllowed({ x: -60, y: -40 }, { x: -60 + 3 * k, y: 30 }, allowed, SIZE);
				expect(allowed(point)).toBe(true);
			}
		}
	});
});
