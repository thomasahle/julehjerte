import { describe, expect, it } from 'vitest';
import type { Vec } from '$lib/types/heart';
import { dropCollinear, flattenCubic } from './flatten';

function bezier(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function distanceToPolyline(p: Vec, line: Vec[]): number {
	let best = Infinity;
	for (let i = 0; i + 1 < line.length; i++) {
		const a = line[i]!;
		const b = line[i + 1]!;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
		best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
	}
	return best;
}

describe('flattenCubic', () => {
	// An S-curve across a 60 mm strip, about the size of a curved cut at 80 mm.
	const p0 = { x: 0, y: 0 };
	const p1 = { x: 40, y: 5 };
	const p2 = { x: -20, y: 35 };
	const p3 = { x: 20, y: 60 };

	it('stays within 0.05 mm of the curve', () => {
		const line = [p0, ...flattenCubic(p0, p1, p2, p3, 0.05)];
		for (let i = 0; i <= 100; i++) {
			expect(distanceToPolyline(bezier(p0, p1, p2, p3, i / 100), line)).toBeLessThanOrEqual(0.05);
		}
		// And ends exactly on the curve's end.
		expect(line[line.length - 1]).toEqual(p3);
	});

	it('uses more points for a tighter tolerance, but not absurdly many', () => {
		const coarse = flattenCubic(p0, p1, p2, p3, 0.5).length;
		const fine = flattenCubic(p0, p1, p2, p3, 0.05).length;
		expect(fine).toBeGreaterThan(coarse);
		expect(fine).toBeLessThan(100);
	});

	it('writes a straight segment as its end point alone', () => {
		const a = { x: 0, y: 0 };
		const d = { x: 0, y: 90 };
		expect(flattenCubic(a, { x: 0, y: 30 }, { x: 0, y: 60 }, d)).toEqual([d]);
	});

	it('does not take a straight cubic whose controls overshoot for a straight line', () => {
		// Collinear, but it runs past its end and back: the polyline must follow.
		const points = flattenCubic({ x: 0, y: 0 }, { x: 0, y: 150 }, { x: 0, y: 150 }, { x: 0, y: 90 });
		expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(100);
	});
});

describe('dropCollinear', () => {
	it('drops points in the middle of a straight run', () => {
		expect(
			dropCollinear([
				{ x: 0, y: 0 },
				{ x: 0, y: 5 },
				{ x: 0, y: 10 },
				{ x: 4, y: 12 }
			])
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 10 },
			{ x: 4, y: 12 }
		]);
	});

	it('keeps a point the path turns back at', () => {
		const back = [
			{ x: 0, y: 0 },
			{ x: 0, y: 10 },
			{ x: 0, y: 5 }
		];
		expect(dropCollinear(back)).toEqual(back);
	});
});
