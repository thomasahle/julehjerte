import { expect, it } from 'vitest';
import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import { curveSharedCuts } from './curvedCuts';

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
