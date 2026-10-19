import { expect, it, vi } from 'vitest';
import { validateRawFingers } from './validatePaths';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import type { Vec } from '$lib/types/heart';

/** Independent exhaustive reference for the import warning's sampled lines. */
function reference(segments: BezierSegment[]) {
	const points = segments.flatMap((s, segIdx) => Array.from({ length: 11 }, (_, i) => {
		const t = i / 10, u = 1 - t;
		return { segIdx, x: u ** 3 * s.p0.x + 3 * u ** 2 * t * s.p1.x + 3 * u * t ** 2 * s.p2.x + t ** 3 * s.p3.x,
			y: u ** 3 * s.p0.y + 3 * u ** 2 * t * s.p1.y + 3 * u * t ** 2 * s.p2.y + t ** 3 * s.p3.y };
	}));
	const side = (a: Vec, b: Vec, p: Vec) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
	const opposite = (a: number, b: number) => a > 0 && b < 0 || a < 0 && b > 0;
	const warnings: string[] = [];
	for (let i = 0; i < points.length - 1; i++) for (let j = i + 3; j < points.length - 1; j++) {
		const a = points[i], b = points[i + 1], c = points[j], d = points[j + 1];
		if (opposite(side(a, b, c), side(a, b, d)) && opposite(side(c, d, a), side(c, d, b))) {
			warnings.push(`Self-intersection detected between segment ${a.segIdx} and segment ${c.segIdx}`);
			break;
		}
	}
	return [...new Set(warnings)];
}

it('keeps the exhaustive intersection warnings and their order after the bounding-box sweep', () => {
	let seed = 27;
	const point = (): Vec => {
		const number = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 * 98 + 1; };
		return { x: number(), y: number() };
	};
	const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		for (let sample = 0; sample < 8; sample++) {
			let previous = point();
			const segments = Array.from({ length: 12 }, () => {
				const segment = { p0: previous, p1: point(), p2: point(), p3: point() };
				previous = segment.p3;
				return segment;
			});
			const pathData = `M ${segments[0].p0.x} ${segments[0].p0.y} ` + segments.map(s => `C ${s.p1.x} ${s.p1.y} ${s.p2.x} ${s.p2.y} ${s.p3.x} ${s.p3.y}`).join(' ');
			spy.mockClear();
			validateRawFingers('test', [{ lobe: 'right', id: 'cut', pathData }]);
			const expected = reference(segments);
			expect(expected.length).toBeGreaterThan(0);
			expect(spy.mock.calls.map(([message]) => message)).toEqual([
				...expected.map(message => `[Heart: test] Finger cut: ${message}`),
				'[Heart: test] JSON coordinates should be in 0-100 range (overlap area)'
			]);
		}
	} finally { spy.mockRestore(); }
});

it('does not report crossings on a long open zigzag', () => {
	const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const pathData = 'M 10 0 ' + Array.from({ length: 1000 }, (_, i) => `L ${i % 2 ? 10 : 90} ${(i + 1) / 10}`).join(' ');
		validateRawFingers('long', [{ lobe: 'right', pathData }]);
		expect(spy).not.toHaveBeenCalled();
	} finally { spy.mockRestore(); }
});
