import { describe, it, expect } from 'vitest';
import {
	parsePathDataToSegments,
	segmentsToPathData,
	fingerToSegments,
	fingerFromPathData,
	cloneSegments,
	splitBezierAt,
	type BezierSegment
} from './bezierSegments';
import type { Finger } from '$lib/types/heart';

describe('parsePathDataToSegments', () => {
	it('parses simple M...C path', () => {
		const pathData = 'M 0 0 C 10 10 20 20 30 30';
		const segments = parsePathDataToSegments(pathData);

		expect(segments).toHaveLength(1);
		expect(segments[0]).toEqual({
			p0: { x: 0, y: 0 },
			p1: { x: 10, y: 10 },
			p2: { x: 20, y: 20 },
			p3: { x: 30, y: 30 }
		});
	});

	it('parses multiple C segments', () => {
		const pathData = 'M 0 0 C 10 10 20 20 30 30 C 40 40 50 50 60 60';
		const segments = parsePathDataToSegments(pathData);

		expect(segments).toHaveLength(2);
		expect(segments[0].p3).toEqual({ x: 30, y: 30 });
		expect(segments[1].p0).toEqual({ x: 30, y: 30 });
		expect(segments[1].p3).toEqual({ x: 60, y: 60 });
	});

	it('handles comma-separated coordinates', () => {
		const pathData = 'M 0,0 C 10,10 20,20 30,30';
		const segments = parsePathDataToSegments(pathData);

		expect(segments).toHaveLength(1);
		expect(segments[0]).toEqual({
			p0: { x: 0, y: 0 },
			p1: { x: 10, y: 10 },
			p2: { x: 20, y: 20 },
			p3: { x: 30, y: 30 }
		});
	});

	it('handles mixed whitespace and commas', () => {
		const pathData = 'M 0, 0 C 10 10, 20, 20   30 30';
		const segments = parsePathDataToSegments(pathData);

		expect(segments).toHaveLength(1);
		expect(segments[0].p3).toEqual({ x: 30, y: 30 });
	});

	it('returns empty array for empty string', () => {
		expect(parsePathDataToSegments('')).toEqual([]);
	});

	it('returns empty array for path with only M command', () => {
		expect(parsePathDataToSegments('M 0 0')).toEqual([]);
	});

	it('handles lowercase commands', () => {
		// Note: lowercase 'c' means relative coordinates, but the parser treats all as absolute
		// This tests that the parser handles case-insensitive command matching
		const pathData = 'm 0 0 c 10 10 20 20 30 30';
		const segments = parsePathDataToSegments(pathData);
		expect(segments).toHaveLength(1);
	});

	it('handles negative coordinates', () => {
		const pathData = 'M -10 -20 C -5 -10 5 10 10 20';
		const segments = parsePathDataToSegments(pathData);

		expect(segments[0].p0).toEqual({ x: -10, y: -20 });
		expect(segments[0].p3).toEqual({ x: 10, y: 20 });
	});

	it('handles floating point coordinates', () => {
		const pathData = 'M 0.5 1.5 C 10.25 10.75 20.125 20.875 30.0625 30.9375';
		const segments = parsePathDataToSegments(pathData);

		expect(segments[0].p0).toEqual({ x: 0.5, y: 1.5 });
		expect(segments[0].p3.x).toBeCloseTo(30.0625);
		expect(segments[0].p3.y).toBeCloseTo(30.9375);
	});

	it('parses real heart path data', () => {
		// From classic-3x3.json
		const pathData = 'M 412.5 262.5 C 356.25 262.5 243.75 262.5 187.5 262.5';
		const segments = parsePathDataToSegments(pathData);

		expect(segments).toHaveLength(1);
		expect(segments[0].p0).toEqual({ x: 412.5, y: 262.5 });
		expect(segments[0].p3).toEqual({ x: 187.5, y: 262.5 });
	});
});

describe('segmentsToPathData', () => {
	it('returns empty string for empty segments', () => {
		expect(segmentsToPathData([])).toBe('');
	});

	it('converts single segment to path data', () => {
		const segments: BezierSegment[] = [
			{
				p0: { x: 0, y: 0 },
				p1: { x: 10, y: 10 },
				p2: { x: 20, y: 20 },
				p3: { x: 30, y: 30 }
			}
		];
		const pathData = segmentsToPathData(segments);

		expect(pathData).toBe('M 0 0 C 10 10 20 20 30 30');
	});

	it('converts multiple segments to path data', () => {
		const segments: BezierSegment[] = [
			{
				p0: { x: 0, y: 0 },
				p1: { x: 10, y: 10 },
				p2: { x: 20, y: 20 },
				p3: { x: 30, y: 30 }
			},
			{
				p0: { x: 30, y: 30 },
				p1: { x: 40, y: 40 },
				p2: { x: 50, y: 50 },
				p3: { x: 60, y: 60 }
			}
		];
		const pathData = segmentsToPathData(segments);

		expect(pathData).toBe('M 0 0 C 10 10 20 20 30 30 C 40 40 50 50 60 60');
	});

	it('roundtrip: parse -> serialize -> parse equals original', () => {
		const original = 'M 100 200 C 150 250 200 250 250 200';
		const segments = parsePathDataToSegments(original);
		const serialized = segmentsToPathData(segments);
		const reparsed = parsePathDataToSegments(serialized);

		expect(reparsed).toEqual(segments);
	});

	it('roundtrip with multiple segments', () => {
		const original = 'M 0 0 C 10 10 20 20 30 30 C 40 40 50 50 60 60';
		const segments = parsePathDataToSegments(original);
		const serialized = segmentsToPathData(segments);
		const reparsed = parsePathDataToSegments(serialized);

		expect(reparsed).toEqual(segments);
	});
});

describe('fingerToSegments', () => {
	it('returns the segments stored on the finger', () => {
		const segments = parsePathDataToSegments('M 0 0 C 10 10 20 20 30 30');
		const finger: Finger = { id: 'test', lobe: 'left', segments };
		expect(fingerToSegments(finger)).toBe(segments);
		expect(fingerToSegments(finger)).toHaveLength(1);
	});

	it('fingerFromPathData parses pathData into segments', () => {
		const finger = fingerFromPathData({
			id: 'test',
			lobe: 'left',
			pathData: 'M 0 0 C 10 10 20 20 30 30'
		});
		expect(finger.segments).toHaveLength(1);
		expect(finger.segments[0].p0).toEqual({ x: 0, y: 0 });
		expect(finger.segments[0].p3).toEqual({ x: 30, y: 30 });
	});

	it('returns same result for same finger', () => {
		const finger = fingerFromPathData({
			id: 'test',
			lobe: 'right',
			pathData: 'M 100 100 C 150 100 150 200 100 200'
		});
		expect(fingerToSegments(finger)).toBe(finger.segments);
	});
});

describe('cloneSegments', () => {
	it('creates a deep copy of segments', () => {
		const original: BezierSegment[] = [
			{
				p0: { x: 0, y: 0 },
				p1: { x: 10, y: 10 },
				p2: { x: 20, y: 20 },
				p3: { x: 30, y: 30 }
			}
		];
		const cloned = cloneSegments(original);

		// Modify original
		original[0].p0.x = 999;

		// Clone should be unaffected
		expect(cloned[0].p0.x).toBe(0);
	});

	it('handles empty array', () => {
		expect(cloneSegments([])).toEqual([]);
	});
});

describe('splitBezierAt', () => {
	it('splits at t=0.5 into two equal parts', () => {
		const seg: BezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 0, y: 100 },
			p2: { x: 100, y: 100 },
			p3: { x: 100, y: 0 }
		};
		const [first, second] = splitBezierAt(seg, 0.5);

		// First segment should start at p0
		expect(first.p0).toEqual(seg.p0);

		// Second segment should end at p3
		expect(second.p3).toEqual(seg.p3);

		// Both should meet at the same point
		expect(first.p3).toEqual(second.p0);
	});

	it('splits at t=0 returns degenerate first segment', () => {
		const seg: BezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 10, y: 10 },
			p2: { x: 20, y: 20 },
			p3: { x: 30, y: 30 }
		};
		const [first, second] = splitBezierAt(seg, 0);

		// First segment is degenerate at p0
		expect(first.p0).toEqual(seg.p0);
		expect(first.p3).toEqual(seg.p0);

		// Second segment is essentially the original
		expect(second.p0).toEqual(seg.p0);
		expect(second.p3).toEqual(seg.p3);
	});

	it('splits at t=1 returns degenerate second segment', () => {
		const seg: BezierSegment = {
			p0: { x: 0, y: 0 },
			p1: { x: 10, y: 10 },
			p2: { x: 20, y: 20 },
			p3: { x: 30, y: 30 }
		};
		const [first, second] = splitBezierAt(seg, 1);

		// First segment is essentially the original
		expect(first.p0).toEqual(seg.p0);
		expect(first.p3).toEqual(seg.p3);

		// Second segment is degenerate at p3
		expect(second.p0).toEqual(seg.p3);
		expect(second.p3).toEqual(seg.p3);
	});
});
