import { describe, expect, it } from 'vitest';
import type { BezierSegment } from '$lib/types/heart';
import { bezierPoint, bezierPointByPowers, bezierPointClamped, cubicAt, segmentIntersection, splitBezierAt } from './cubic';

const S: BezierSegment = { p0: { x: 0, y: 0 }, p1: { x: 10, y: 30 }, p2: { x: 40, y: -20 }, p3: { x: 50, y: 10 } };

describe('cubicAt', () => {
	it('interpolates between its end points', () => {
		expect(cubicAt(0, 1, 2, 3, 0)).toBe(0);
		expect(cubicAt(0, 1, 2, 3, 1)).toBe(3);
		expect(cubicAt(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5, 12);
	});

	it('is the Bernstein form, multiplied left to right', () => {
		const t = 0.3, u = 1 - t;
		expect(cubicAt(1.1, 2.2, 3.3, 4.4, t)).toBe(u * u * u * 1.1 + 3 * u * u * t * 2.2 + 3 * u * t * t * 3.3 + t * t * t * 4.4);
	});
});

describe('bezierPoint', () => {
	it('starts and ends at the end points', () => {
		expect(bezierPoint(S, 0)).toEqual(S.p0);
		expect(bezierPoint(S, 1)).toEqual(S.p3);
	});

	it('is cubicAt per coordinate', () => {
		for (const t of [0.1, 0.37, 0.5, 0.9]) {
			expect(bezierPoint(S, t)).toEqual({ x: cubicAt(0, 10, 40, 50, t), y: cubicAt(0, 30, -20, 10, t) });
		}
	});

	it('takes t outside [0, 1] as given; the clamped one does not', () => {
		expect(bezierPoint(S, 1.5)).not.toEqual(bezierPoint(S, 1));
		expect(bezierPointClamped(S, 1.5)).toEqual(bezierPoint(S, 1));
		expect(bezierPointClamped(S, -2)).toEqual(bezierPoint(S, 0));
		expect(bezierPointClamped(S, 0.25)).toEqual(bezierPoint(S, 0.25));
	});
});

describe('bezierPointByPowers', () => {
	it('is the same curve as bezierPoint', () => {
		for (let k = 0; k <= 20; k++) {
			const a = bezierPointByPowers(S, k / 20), b = bezierPoint(S, k / 20);
			expect(a.x).toBeCloseTo(b.x, 10);
			expect(a.y).toBeCloseTo(b.y, 10);
		}
	});

	it('rounds differently from bezierPoint somewhere, which is why it is its own function', () => {
		const seg: BezierSegment = { p0: { x: 0.1, y: 0.7 }, p1: { x: 123.456, y: -9.87 }, p2: { x: 3.3, y: 77.7 }, p3: { x: 600, y: 1 / 3 } };
		const differs = Array.from({ length: 81 }, (_, k) => k / 80).some((t) => {
			const a = bezierPointByPowers(seg, t), b = bezierPoint(seg, t);
			return !Object.is(a.x, b.x) || !Object.is(a.y, b.y);
		});
		expect(differs).toBe(true);
	});
});

describe('splitBezierAt', () => {
	it('splits into halves that meet on the curve and keep its end points', () => {
		for (const t of [0.25, 0.5, 0.8]) {
			const [a, b] = splitBezierAt(S, t);
			expect(a.p0).toBe(S.p0);
			expect(b.p3).toBe(S.p3);
			expect(a.p3).toBe(b.p0);
			const at = bezierPoint(S, t);
			expect(a.p3.x).toBeCloseTo(at.x, 12);
			expect(a.p3.y).toBeCloseTo(at.y, 12);
			// The first half at s is the whole at s·t.
			const p = bezierPoint(a, 0.5), q = bezierPoint(S, 0.5 * t);
			expect(p.x).toBeCloseTo(q.x, 12);
			expect(p.y).toBeCloseTo(q.y, 12);
		}
	});
});

describe('segmentIntersection', () => {
	const o = { x: 0, y: 0 };
	it('finds a crossing', () => {
		expect(segmentIntersection(o, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 })).toEqual({ x: 1, y: 1 });
	});

	it('counts a touch at an end', () => {
		expect(segmentIntersection(o, { x: 2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 5 })).toEqual({ x: 2, y: 0 });
	});

	it('misses segments whose lines cross elsewhere', () => {
		expect(segmentIntersection(o, { x: 1, y: 1 }, { x: 0, y: 4 }, { x: 4, y: 0 })).toBeNull();
	});

	it('gives nothing for parallel and collinear segments', () => {
		expect(segmentIntersection(o, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 })).toBeNull();
		expect(segmentIntersection(o, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 })).toBeNull();
	});
});
