import { describe, it, expect } from 'vitest';
import { closestPointOnBezier, closestPointsBetweenBeziers } from './curves';
import type { CubicBezierSegment, Point } from '$lib/types';

function cubicPointAt(seg: CubicBezierSegment, t: number): Point {
	const u = 1 - t;
	const b0 = u * u * u;
	const b1 = 3 * u * u * t;
	const b2 = 3 * u * t * t;
	const b3 = t * t * t;
	return {
		x: b0 * seg.p0.x + b1 * seg.p1.x + b2 * seg.p2.x + b3 * seg.p3.x,
		y: b0 * seg.p0.y + b1 * seg.p1.y + b2 * seg.p2.y + b3 * seg.p3.y
	};
}

function dist(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.hypot(dx, dy);
}

function bruteForceClosest(seg: CubicBezierSegment, target: Point, steps = 20000) {
	let bestT = 0;
	let bestP = cubicPointAt(seg, 0);
	let bestD = dist(bestP, target);
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const p = cubicPointAt(seg, t);
		const d = dist(p, target);
		if (d < bestD) {
			bestD = d;
			bestT = t;
			bestP = p;
		}
	}
	return { t: bestT, point: bestP, distance: bestD };
}

function lineBezier(a: Point, b: Point): CubicBezierSegment {
	return {
		p0: a,
		p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
		p2: { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 },
		p3: b
	};
}

describe('closestPointOnBezier', () => {
	it('hits the orthogonal projection on a straight line', () => {
		const seg: CubicBezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 1 / 3, y: 0 },
			p2: { x: 2 / 3, y: 0 },
			p3: { x: 1, y: 0 }
		};
		const target = { x: 0.25, y: 1 };
		const hit = closestPointOnBezier(seg, target);
		expect(hit.t).toBeCloseTo(0.25, 2);
		expect(hit.point.x).toBeCloseTo(0.25, 3);
		expect(hit.point.y).toBeCloseTo(0, 6);
		expect(hit.distance).toBeCloseTo(1, 6);
	});

	it('is close to brute force on a curved segment', () => {
		const seg: CubicBezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 1 },
			p2: { x: 1, y: 1 },
			p3: { x: 1, y: 0 }
		};
		const target = { x: 0.4, y: 0.2 };

		const hit = closestPointOnBezier(seg, target);
		const brute = bruteForceClosest(seg, target, 50000);

		// Our implementation is approximate; accept a small slack vs brute force sampling.
		expect(hit.distance).toBeLessThanOrEqual(brute.distance + 1e-3);
		expect(dist(hit.point, target)).toBeCloseTo(hit.distance, 10);
	});

	it('returns an endpoint when the target is far past it', () => {
		const seg: CubicBezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 1 },
			p2: { x: 1, y: 1 },
			p3: { x: 1, y: 0 }
		};
		const target = { x: 10, y: 0 };
		const hit = closestPointOnBezier(seg, target);
		expect(hit.t).toBeCloseTo(1, 2);
		expect(hit.point.x).toBeCloseTo(1, 3);
		expect(hit.point.y).toBeCloseTo(0, 2);
	});
});

describe('closestPointsBetweenBeziers', () => {
	function bruteForceMinDistance(a: CubicBezierSegment, b: CubicBezierSegment, stepsA = 600, stepsB = 600) {
		const ptsA: Point[] = [];
		const ptsB: Point[] = [];
		for (let i = 0; i <= stepsA; i++) ptsA.push(cubicPointAt(a, i / stepsA));
		for (let j = 0; j <= stepsB; j++) ptsB.push(cubicPointAt(b, j / stepsB));

		let best = Infinity;
		for (const pa of ptsA) {
			for (const pb of ptsB) {
				const d = dist(pa, pb);
				if (d < best) best = d;
			}
		}
		return best;
	}

	it('returns ~1 for parallel unit segments 1 apart', () => {
		const a = lineBezier({ x: 0, y: 0 }, { x: 1, y: 0 });
		const b = lineBezier({ x: 0, y: 1 }, { x: 1, y: 1 });
		const hit = closestPointsBetweenBeziers(a, b);
		expect(hit.distance).toBeCloseTo(1, 3);
		expect(Math.abs(hit.pointA.y - hit.pointB.y)).toBeCloseTo(1, 3);
	});

	it('returns ~0 for crossing line segments', () => {
		const a = lineBezier({ x: 0, y: 0 }, { x: 1, y: 1 });
		const b = lineBezier({ x: 0, y: 1 }, { x: 1, y: 0 });
		const hit = closestPointsBetweenBeziers(a, b);
		expect(hit.distance).toBeLessThan(1e-3);
	});

	it('handles endpoint-to-endpoint minima', () => {
		const a = lineBezier({ x: 0, y: 0 }, { x: 1, y: 0 });
		const b = lineBezier({ x: 2, y: 0 }, { x: 3, y: 0 });
		const hit = closestPointsBetweenBeziers(a, b);
		expect(hit.distance).toBeCloseTo(1, 3);
	});

	it('is close to brute force on curved segments', () => {
		const a: CubicBezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 1 },
			p2: { x: 1, y: 1 },
			p3: { x: 1, y: 0 }
		};
		const b: CubicBezierSegment = {
			p0: { x: 0.2, y: -0.3 },
			p1: { x: 0.2, y: 0.7 },
			p2: { x: 1.2, y: 0.7 },
			p3: { x: 1.2, y: -0.3 }
		};

		const hit = closestPointsBetweenBeziers(a, b);
		const brute = bruteForceMinDistance(a, b, 800, 800);
		expect(hit.distance).toBeLessThanOrEqual(brute + 1e-3);
	});
});
