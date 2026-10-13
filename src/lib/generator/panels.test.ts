import { it, expect } from 'vitest';
import { clipContours, generatePanelFigure } from './panels';
import { convertValidatedCutGeometry } from '$lib/inverse/toHeartDesign';
import { type Ring, inside } from './geometry';
import cat from '../../../static/generator/motifs/ph-cat.json';
const square = (r: number): Ring => [
	[-r, -r],
	[r, -r],
	[r, r],
	[-r, r]
];
it('opens a hole onto a divider without filling or deleting it', () => {
	const rings = [square(10), square(4)],
		parts = clipContours(rings, 0, true);
	expect(parts).toHaveLength(1);
	expect(inside([-2, 0], parts[0])).toBe(false);
	expect(inside([-8, 0], parts[0])).toBe(true);
});
it('spreads cat details across several cuts', () => {
	const r = generatePanelFigure(cat.contours as Ring[], 'circle', 70, 0.7);
	const { design } = convertValidatedCutGeometry(r.geometry, {
		name: 'Cat',
		tolerance: 0.025
	});
	expect(design.gridSize.x).toBeGreaterThanOrEqual(4);
	expect(design.gridSize.y).toBeGreaterThanOrEqual(4);
	const lengths = [
		...r.geometry.A_overlap_paths,
		...r.geometry.B_overlap_paths
	].map((path) =>
		path.reduce((sum, ref) => {
			const p = r.geometry.curves[ref.curve].control_points;
			return sum + Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1]);
		}, 0)
	);
	// At 100 mm paper width, the old four-port cat had a 268 mm cutting path.
	expect(Math.max(...lengths)).toBeLessThan(230);
});
