import { expect, it } from 'vitest';
import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import { curveSharedCuts, curveSharpSharedTips } from './curvedCuts';
import { cutTipCounts } from './cutQuality';
import type { Finger } from '$lib/types/heart';

const line = (a: number[], b: number[]) => ({
	control_points: [a, a.map((v, i) => v + (b[i] - v) / 3), a.map((v, i) => v + 2 * (b[i] - v) / 3), b]
});
function junction(): CutGeometry {
	return { square_width_mm: 100, phase: 0, curves: {
		lower: line([50, 20], [50, 50]), upper: line([50, 50], [50, 80]),
		shared: line([50, 50], [80, 80])
	}, A_overlap_paths: [[{ curve: 'lower', reverse: false }, { curve: 'shared', reverse: false }]],
	B_overlap_paths: [[{ curve: 'shared', reverse: true }, { curve: 'upper', reverse: false }]] };
}

it('preserves the visible boundary and common path references when bending a hidden connection', () => {
	const input = junction(), before = structuredClone(input), result = curveSharedCuts(input)!;
	expect(input).toEqual(before);
	expect(result.A_overlap_paths).toEqual(input.A_overlap_paths);
	expect(result.B_overlap_paths).toEqual(input.B_overlap_paths);
	expect(result.curves.lower).toEqual(input.curves.lower);
	expect(result.curves.upper).toEqual(input.curves.upper);
	const [start, handle, , end] = result.curves.shared.control_points;
	expect(start).toEqual([50, 50]);
	expect(end).toEqual([80, 80]);
	// Both papers reach the vertical outline at a right angle, using one curve.
	expect(handle[1]).toBe(start[1]);
	expect(handle[0]).toBeGreaterThan(start[0]);
});

it('uses the outline tangent even when its first control handle is collapsed', () => {
	const input = junction(), lower = input.curves.lower.control_points;
	lower[2] = lower[3];
	const shared = curveSharedCuts(input)!.curves.shared.control_points;
	expect(shared[1][1]).toBe(shared[0][1]);
	expect(shared[1][0]).toBeGreaterThan(shared[0][0]);
});

it('does not alter a single-sheet cut or add new connections', () => {
	const input = junction();
	input.B_overlap_paths = [[{ curve: 'upper', reverse: false }]];
	expect(curveSharedCuts(input)).toBeUndefined();
});

it('leaves an unselected connection end alone when repairing a sharp tip', () => {
	const input = junction();
	input.curves.secondLower = line([80, 60], [80, 80]);
	input.curves.secondUpper = line([80, 80], [80, 100]);
	input.A_overlap_paths[0].push({ curve: 'secondUpper', reverse: false });
	input.B_overlap_paths[0].unshift({ curve: 'secondLower', reverse: false });
	const result = curveSharedCuts(input, p => p[0] === 50 && p[1] === 50)!;
	expect(result.curves.shared.control_points[1]).not.toEqual(input.curves.shared.control_points[1]);
	expect(result.curves.shared.control_points[2]).toEqual(input.curves.shared.control_points[2]);
	expect(curveSharedCuts(input, () => false)).toBeUndefined();
});

it('rounds an exported shared tip on both sheets without refitting any other cut', () => {
	const segment = (a: number[], b: number[]) => {
		const [p0, p1, p2, p3] = line(a, b).control_points.map(([x, y]) => ({ x, y }));
		return { p0, p1, p2, p3 };
	};
	const fingers: Finger[] = [
		{ id: 'A', lobe: 'right', segments: [segment([50, 20], [50, 50]), segment([50, 50], [55, 20])] },
		{ id: 'B', lobe: 'left', segments: [segment([55, 20], [50, 50]), segment([50, 50], [50, 80])] }
	];
	const input = { fingers }, before = structuredClone(input), result = curveSharpSharedTips(input)!;
	expect(cutTipCounts(input)).toEqual([1, 1]);
	expect(cutTipCounts(result)).toEqual([0, 0]);
	expect(input).toEqual(before);
	expect(result.fingers[0].segments[0]).toEqual(fingers[0].segments[0]);
	expect(result.fingers[1].segments[1]).toEqual(fingers[1].segments[1]);
	const a = result.fingers[0].segments[1], b = result.fingers[1].segments[0];
	expect(a.p1).toEqual(b.p2);
	expect(a.p0).toEqual(fingers[0].segments[1].p0);
	expect(a.p2).toEqual(fingers[0].segments[1].p2);
	expect(a.p3).toEqual(fingers[0].segments[1].p3);
	// Similar endpoints alone do not make two different curves coincident.
	fingers[1].segments[0].p1.x += .001;
	expect(curveSharpSharedTips(input)).toBeUndefined();
});
