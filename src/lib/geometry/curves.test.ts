import { describe, it, expect } from 'vitest';
import { bezierBBox, closestPointOnBezier, closestPointsBetweenBeziers, intersectBezierCurves, isLinearBezier } from './curves';
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

describe('affine straight cuts', () => {
	it('preserves parameters and distances under rotation, reversal and translation', () => {
		for (let i = 0; i < 32; i++) {
			const angle = i * Math.PI / 16;
			const move = (x: number, y: number): Point => ({ x: 317 + x * Math.cos(angle) - y * Math.sin(angle), y: -123 + x * Math.sin(angle) + y * Math.cos(angle) });
			const a = lineBezier(move(0, 0), move(10, 0));
			const b = lineBezier(move(3, 8), move(3, 2));
			expect(isLinearBezier(a)).toBe(true);
			const hit = closestPointsBetweenBeziers(a, b);
			expect(hit.u).toBeCloseTo(.3, 10);
			expect(hit.v).toBe(1);
			expect(hit.distance).toBeCloseTo(2, 10);
			expect(dist(cubicPointAt(a, hit.u), hit.pointA)).toBeLessThan(1e-10);
			expect(dist(cubicPointAt(b, hit.v), hit.pointB)).toBeLessThan(1e-10);
			const crossing = lineBezier(move(7, -3), move(7, 1));
			const cross = closestPointsBetweenBeziers(a, crossing);
			expect(cross.u).toBeCloseTo(.7, 10);
			expect(cross.v).toBeCloseTo(.75, 10);
			expect(cross.distance).toBeLessThan(1e-10);
			expect(intersectBezierCurves(a, crossing)).toHaveLength(1);
		}
	});
	it('handles points, parallel overlaps and endpoint minima without iteration', () => {
		for (const [from, to, expected] of [
			[[3, 2], [3, 2], 2], [[3, 2], [7, 2], 2],
			[[7, 0], [3, 0], 0], [[15, 0], [12, 0], 2]
		] as [number[], number[], number][]) {
			const a = lineBezier({ x: 0, y: 0 }, { x: 10, y: 0 });
			const b = lineBezier({ x: from[0], y: from[1] }, { x: to[0], y: to[1] });
			for (const [first, second] of [[a, b], [b, a]]) {
				const hit = closestPointsBetweenBeziers(first, second);
				expect(hit.distance).toBeCloseTo(expected, 10);
				// UI callers may edit the returned point without editing the cut.
				expect([first.p0, first.p3, second.p0, second.p3]).not.toContain(hit.pointA);
				expect([first.p0, first.p3, second.p0, second.p3]).not.toContain(hit.pointB);
			}
		}
		const point = lineBezier({ x: 3, y: 2 }, { x: 3, y: 2 });
		expect(closestPointsBetweenBeziers(point, point).distance).toBe(0);
		expect(closestPointOnBezier(point, { x: 6, y: 6 }).distance).toBe(5);
		expect(bezierBBox(point)).toEqual({ x: 3, y: 2, width: 0, height: 0 });
	});
	it('keeps the cubic path for collinear handles that backtrack or change speed', () => {
		const seg = lineBezier({ x: 0, y: 0 }, { x: 10, y: 0 });
		seg.p1.x = 30;
		seg.p2.x = 20;
		expect(isLinearBezier(seg)).toBe(false);
		expect(bezierBBox(seg).width).toBeGreaterThan(10);
		const hit = closestPointOnBezier(seg, { x: 18, y: 1 });
		expect(hit.distance).toBeCloseTo(1, 4);
		expect(dist(cubicPointAt(seg, hit.t), hit.point)).toBeLessThan(1e-10);
		seg.p1.x = 0;
		seg.p2.x = 10;
		expect(isLinearBezier(seg)).toBe(false);
		const slow = closestPointOnBezier(seg, { x: 2, y: 1 });
		expect(Math.abs(slow.t - .2)).toBeGreaterThan(.05);
	});
});

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

/** Deterministic noise: the same curves on every machine and every run. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** `intersectBezierCurves` trying every piece of one curve against every piece of the other. */
function everyPieceCrossing(seg1: CubicBezierSegment, seg2: CubicBezierSegment): Point[] {
	const polyline = (seg: CubicBezierSegment) => (isLinearBezier(seg) ? [seg.p0, seg.p3] : Array.from({ length: 81 }, (_, i) => cubicPointAt(seg, i / 80)));
	const a = polyline(seg1), b = polyline(seg2);
	const points: Point[] = [];
	for (let i = 0; i < a.length - 1; i++)
		for (let j = 0; j < b.length - 1; j++) {
			const p1 = a[i]!, p2 = a[i + 1]!, p3 = b[j]!, p4 = b[j + 1]!;
			const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
			if (Math.abs(den) < 1e-12) continue;
			const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
			const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;
			if (ua < 0 || ua > 1 || ub < 0 || ub > 1) continue;
			points.push({ x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) });
		}
	return points;
}

describe('intersectBezierCurves', () => {
	it('finds the crossings, in order, that trying every pair of pieces finds, where rounding is hardest', () => {
		const random = mulberry32(5);
		const r = (lo: number, hi: number) => lo + (hi - lo) * random();
		const P = (x: number, y: number): Point => ({ x, y });
		const pairs: [CubicBezierSegment, CubicBezierSegment][] = [];
		for (const S of [0.01, 1, 100, 400, 1e4])
			for (let k = 0; k < 60; k++) {
				// Two curves along nearly one line, shifted along it by a gap or an overlap and off it by a hair.
				const angle = r(0, Math.PI), dx = Math.cos(angle), dy = Math.sin(angle);
				const at = (s: number, off = 0) => P(S * (0.3 + s * dx - off * dy), S * (0.7 + s * dy + off * dx));
				const length = r(0.05, 1), shift = length * r(0.5, 1.5), hair = [0, 1e-15, 1e-12, 1e-9][k % 4]!;
				pairs.push([
					{ p0: at(0), p1: at(length * r(0.05, 0.6)), p2: at(length * r(0.4, 0.95)), p3: at(length) },
					{ p0: at(shift, hair), p1: at(shift + length * r(0.05, 0.6), hair), p2: at(shift + length * r(0.4, 0.95), hair), p3: at(shift + length, hair) }
				]);
				// Nearly parallel neighbours, as the cuts of a pattern run.
				const off = S * [1e-9, 1e-6, 1e-3, 0.02][k % 4]!;
				const a = { p0: P(0, 0), p1: P(S * r(0.2, 0.4), S * r(-0.2, 0.2)), p2: P(S * r(0.6, 0.8), S * r(-0.2, 0.2)), p3: P(S, 0) };
				pairs.push([a, { p0: P(0, off), p1: P(a.p1.x, a.p1.y + off), p2: P(a.p2.x, a.p2.y + off), p3: P(S, off) }]);
				// Neighbouring segments of a cut, which share an end; any curve and a straight line.
				const c = () => P(r(0, S), r(0, S));
				const m = c();
				pairs.push([{ p0: c(), p1: c(), p2: c(), p3: m }, { p0: m, p1: c(), p2: c(), p3: c() }]);
				pairs.push([{ p0: c(), p1: c(), p2: c(), p3: c() }, lineBezier(c(), c())]);
			}
		let crossing = 0;
		for (const [a, b] of pairs) {
			const all = everyPieceCrossing(a, b);
			if (all.length) crossing++;
			expect(intersectBezierCurves(a, b)).toStrictEqual(all);
			expect(intersectBezierCurves(a, b, true)).toStrictEqual(all.slice(0, 1));
			expect(intersectBezierCurves(b, a)).toStrictEqual(everyPieceCrossing(b, a));
		}
		expect(crossing).toBeGreaterThan(pairs.length / 4);
	});

	it('keeps what rounding finds where no distance is sure: pieces 150 long, and points that are not numbers', () => {
		const P = (x: number, y: number): Point => ({ x, y });
		// Two curves along one line, overlapping. One of the 11 crossings is between pieces 840 apart:
		// rounding puts it at the start of both.
		const a = { p0: P(3000, 7000), p1: P(3616.041465905792, 7367.944606689053), p2: P(8399.190679955173, 10224.787942243986), p3: P(11568.033264936246, 12117.45037345878) };
		const b = { p0: P(8139.635501433433, 10069.762780204172), p1: P(11456.898213229171, 12051.072466852114), p2: P(15029.814433568143, 14185.076955482758), p3: P(16707.668766369676, 15187.213153662953) };
		expect(everyPieceCrossing(a, b)).toHaveLength(11);
		expect(intersectBezierCurves(a, b)).toStrictEqual(everyPieceCrossing(a, b));
		// A curve with a point that is not a number crosses every piece of the other.
		for (const bad of [NaN, Infinity]) {
			const c = { p0: P(67, 81), p1: P(bad, 89), p2: P(93, 2), p3: P(92, 70) };
			const d = { p0: P(7, 76), p1: P(16, 83), p2: P(2, 26), p3: P(6, 50) };
			expect(intersectBezierCurves(c, d)).toStrictEqual(everyPieceCrossing(c, d));
		}
	});
});
