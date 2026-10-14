import { describe, expect, it } from 'vitest';
import type { BezierSegment } from './bezierSegments';
import { hasSelfReturn } from './curveReturns';

type Point = [number, number];
const line = (a: Point, b: Point): Point[] => [a,
	[a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
	[a[0] + 2 * (b[0] - a[0]) / 3, a[1] + 2 * (b[1] - a[1]) / 3], b];
const segments = (curves: Point[][], scale: number, origin: Point): BezierSegment[] => curves.map(curve => {
	const [p0, p1, p2, p3] = curve.map(([x, y]) => ({ x: origin[0] + x * scale, y: origin[1] + y * scale }));
	return { p0, p1, p2, p3 };
});

describe('whole-cut returns in editor coordinates', () => {
	it('keeps narrow returns near an endpoint visible at every template scale', () => {
		for (const height of [0.1, 0.5, 1, 2, 4, 8]) for (const gap of [1, 2]) {
			const middle: Point[] = [[50, height], [53, height], [53, height + gap], [50, height + gap]];
			const cut = [line([50, 0], middle[0]), middle, line(middle[3], [50, 100])];
			for (const scale of [0.25, 0.5, 1, 2, 4, 8]) for (const origin of [[0, 0], [200, 100]] as Point[]) {
				expect(hasSelfReturn(segments(cut, scale, origin), 1.5 * scale),
					`height=${height}, gap=${gap}, scale=${scale}, origin=${origin}`).toBe(gap < 1.5);
			}
		}
	});

	it('does not turn an ordinary sharp corner into a return', () => {
		const cut = [line([50, 0], [50, 50]), line([50, 50], [55, 40]), line([55, 40], [80, 40]), line([80, 40], [80, 100])];
		for (const scale of [0.25, 1, 8]) expect(hasSelfReturn(segments(cut, scale, [200, 100]), 1.5 * scale)).toBe(false);
		expect(hasSelfReturn([], 1.5)).toBe(false);
	});
});
