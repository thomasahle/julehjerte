import { expect, it } from 'vitest';
import type { Vec, BezierSegment, Finger } from '$lib/types/heart';
import { cutTipCounts, cutTipPoints, cellTipCounts, fewerCutTips, cutMeasures, middleNeedleBases, middleNeedles } from './cutQuality';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { HeartDesign } from '$lib/types/heart';
import type { Ring } from './geometry';
import star from './fixtures/star-board-5-100.json';
import type { Edge, Point } from './geometry';

function line(p0: Vec, p3: Vec): BezierSegment {
	return { p0, p1: { x: (2 * p0.x + p3.x) / 3, y: (2 * p0.y + p3.y) / 3 },
		p2: { x: (p0.x + 2 * p3.x) / 3, y: (p0.y + 2 * p3.y) / 3 }, p3 };
}
const finger = (segments: BezierSegment[]): Finger => ({ id: 'cut', lobe: 'right', segments });

it('counts narrow paper tips, including joins with collapsed handles', () => {
	for (const [degrees, expected] of [[0, [0, 0]], [90, [0, 0]], [140, [0, 1]], [160, [1, 1]]] as const) {
		const segments = [line({ x: 0, y: 0 }, { x: 10, y: 0 }),
			line({ x: 10, y: 0 }, { x: 10 + 10 * Math.cos(degrees * Math.PI / 180), y: 10 * Math.sin(degrees * Math.PI / 180) })];
		expect(cutTipCounts({ fingers: [finger(segments)] })).toEqual(expected);
		expect(cutTipPoints({ fingers: [finger(segments)] })).toEqual(expected[1] ? [{ x: 10, y: 0 }] : []);
		segments[0].p2 = segments[0].p3;
		segments[1].p1 = segments[1].p0;
		expect(cutTipCounts({ fingers: [finger(segments)] })).toEqual(expected);
		// Separate paths do not meet at a cutting corner.
		expect(cutTipCounts({ fingers: segments.map(s => finger([s])) })).toEqual([0, 0]);
	}
});

it('follows reversed curve references in the compiled cuts', () => {
	expect(cutTipCounts({
		schema: 'heartcurves-2', units: 'mm', square_width_mm: 100, phase: 0,
		curves: {
			first: { control_points: [[0, 0], [3, 0], [7, 0], [10, 0]] },
			second: { control_points: [[5, 1], [6, .8], [9, .2], [10, 0]] }
		},
		A_overlap_paths: [[{ curve: 'first', reverse: false }, { curve: 'second', reverse: true }]],
		B_overlap_paths: []
	})).toEqual([1, 1]);
});

it('never trades fewer mild tips for additional needle points', () => {
	expect(fewerCutTips([1, 1], [0, 20])).toBe(false);
	expect(fewerCutTips([0, 10], [0, 16])).toBe(true);
	expect(fewerCutTips([0, 16], [0, 16])).toBe(false);
});

it('includes both sheet continuations where a shared letter connection meets the grid', () => {
	const edges: Edge[] = [
		{ from: [0, 0], to: [2, 1], family: 'AB', kind: 'shared' },
		{ from: [10, 0], to: [8, 1], family: 'AB', kind: 'shared' },
		{ from: [2, 1], to: [5, 5], family: 'A', kind: 'outline' },
		{ from: [5, 5], to: [8, 1], family: 'A', kind: 'outline' },
		{ from: [2, 1], to: [5, 0], family: 'B', kind: 'outline' },
		{ from: [5, 0], to: [8, 1], family: 'B', kind: 'outline' }
	];
	for (const axis of [0, 1]) {
		const transform = ([x, y]: Point): Point => axis ? [20 - y, 30 + x] : [x, y];
		const moved = edges.map(e => ({ ...e, from: transform(e.from), to: transform(e.to) }));
		const gates = [[0, 0], [10, 0]].map(p => ({ point: transform(p as Point), axis }));
		// Both narrow tips are at the grid; the letter's own turns are broad.
		expect(cellTipCounts(moved, gates)).toEqual([2, 2]);
	}
});

it('counts the needles a heart\'s symmetry cuts on its middle as sharp tips, not as paper that may tear', () => {
	// The star on five strips at 100% with one template for both lobes: both
	// papers cut its top tip, on the heart's middle, down its middle, an 18°
	// point of each, which no heart sharing a template is without.
	const design = star.design as unknown as HeartDesign, rings = star.rings as Ring[];
	expect(middleNeedles(design)).toHaveLength(2);
	expect(cutTipCounts(design)[0]).toBe(2);
	const [torn, templates, sharp] = cutMeasures(design, rings);
	expect([torn, templates]).toEqual([0, 0]);
	expect(sharp).toBe(cutTipCounts(design)[1]);
});

it("holds the needles a heart's symmetry cuts as wide as their legs are apart where the cuts leave them", () => {
	// The star on five strips at 100%: each paper's cut leaves the top tip's flank for a hidden cut
	// 9.3 units from the tip, its point held 2.5 mm wide there, the two lobes' mirror images to within
	// a unit (its middle cut runs 0.7 units off the diagonal).
	const design = star.design as unknown as HeartDesign, rect = inferOverlapRect(design.fingers, design.gridSize);
	const bases = middleNeedleBases(design), unit = (p: Vec) => [(p.x - rect.left) / rect.width * 100, (p.y - rect.top) / rect.height * 100];
	expect(bases.map(b => b.lobe).sort()).toEqual(['left', 'right']);
	for (const b of bases) expect(b.mm).toBeCloseTo(2.48, 1);
	const [l, r] = [bases.find(b => b.lobe === 'left')!, bases.find(b => b.lobe === 'right')!].map(unit);
	expect(Math.hypot(l![0]! - r![1]!, l![1]! - r![0]!)).toBeLessThan(1);
});

