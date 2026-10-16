import { it, expect } from 'vitest';
import { clipContours, componentSeamGate, filledSeamGate, generatePanelFigure, panelDividers, panelSeamGuard } from './panels';
import { convertValidatedCutGeometry } from '$lib/inverse/toHeartDesign';
import { type Ring, type Point, inside, uprightToSheet } from './geometry';
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
for (const [name, rings, divider] of [
	['two touching islands', [
		square(2).map(([x, y]): Point => [x - 2, y - 2]),
		square(2).map(([x, y]): Point => [x + 2, y + 2])
	], 2],
	['a counter touching its parent', [
		[[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, 0]],
		[[-4, 0], [0, -2], [2, 0], [0, 2]]
	], 1],
	['three islands meeting on the divider', [
		[[0, 0], [-4, -6], [-5, -3]],
		[[0, 0], [-6, -1], [-6, 1]],
		[[0, 0], [-5, 3], [-4, 6]]
	], 0]
] as [string, Ring[], number][])
	it(`preserves the even-odd artwork when clipping ${name}`, () => {
		const filled = (point: Point, contours: Ring[]) => contours.reduce((v, ring) => v ^ Number(inside(point, ring)), 0);
		for (const input of [rings, rings.map(r => [...r].reverse()).reverse()])
			for (const left of [false, true]) {
				const clipped = clipContours(input, divider, left);
				for (const ring of clipped)
					expect(new Set(ring.map(p => p.join(','))).size).toBe(ring.length);
				for (let y = -6.13; y < 6; y += .31) for (let x = -6.17; x < 6; x += .31)
					expect(filled([x, y], clipped)).toBe(Number(left ? x <= divider : x >= divider) * filled([x, y], rings));
			}
	});
it('joins both clipped neighbours through paper rather than a counter', () => {
	const rings = [square(10), square(4)];
	const left = clipContours(rings, 0, true), right = clipContours(rings, 0, false);
	const gate = filledSeamGate(left, 0, 0, 0);
	// Both six-unit intervals are equally wide; the upper one wins consistently.
	expect(gate).toEqual(uprightToSheet([0, -7]));
	expect(filledSeamGate(right.map(r => [...r].reverse()).reverse(), 0, 0, 0)).toEqual(gate);
	const swap = (r: Ring): Ring => r.map(([x, y]) => [y, x]);
	expect(filledSeamGate(left.map(swap), 1, 0, 0)).toEqual(uprightToSheet([-7, 0]));
});
it('selects the wider filled seam and leaves an absent seam alone', () => {
	const rings = [square(10), square(4).map(([x, y]) => [x, y + 2] as [number, number])];
	expect(filledSeamGate(clipContours(rings, 0, true), 0, 0, 8)).toEqual(uprightToSheet([0, -6]));
	expect(filledSeamGate(rings, 0, 0, 0)).toBeUndefined();
});
it('gives a small nested island an agreed gate on both sides of a divider', () => {
	// A medallion, a surrounding motif and a small counter. Cutting through
	// the centre opens the counter into an isolated filled component.
	const rings = [square(10), square(6), square(2)];
	for (const input of [rings, rings.map(r => [...r].reverse()).reverse()])
		for (const left of [false, true]) {
			const parts = clipContours(input, 0, left);
			expect(componentSeamGate(parts, 0, 0, 0)).toEqual(uprightToSheet([0, 0]));
			const swap = (r: Ring): Ring => r.map(([x, y]) => [y, x]);
			expect(componentSeamGate(parts.map(swap), 1, 0, 0)).toEqual(uprightToSheet([0, 0]));
		}
	expect(componentSeamGate(rings, 0, 0, 0)).toBeUndefined();
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

it('moves dividers away from near-coincident tips without creating narrow panels', () => {
	const vertices = [-9, -5.01, -5, -3, 0, .01, 2, 5, 5.01, 7];
	const dividers = panelDividers(vertices, -10, 10, 4);
	expect(dividers).toEqual([-4, 1.005, 6.005]);
	expect(panelDividers([...vertices].reverse(), -10, 10, 4)).toEqual(dividers);
	const boundaries = [-10, ...dividers, 10];
	expect(Math.min(...boundaries.slice(1).map((p, i) => p - boundaries[i]))).toBeGreaterThan(2.5);
	// Without a useful gap near the nominal seam, retain the uniform position.
	expect(panelDividers([-10, 10], -10, 10, 4)).toEqual([-5, 0, 5]);
});

it('permits a shared cut only at the gate belonging to its internal seam', () => {
	const gates = [[0, -10], [10, 0], [0, 10], [-10, 0]].map(p => uprightToSheet(p as Point));
	const allowed = panelSeamGuard(gates, [-10, 10, 10, -10], [true, true, false, false]);
	for (const point of [[0, 0], [0, -10], [10, 0], [-10, 4], [4, 10]])
		expect(allowed(uprightToSheet(point as Point))).toBe(true);
	for (const point of [[4, -10], [10, 4], [10, -10]])
		expect(allowed(uprightToSheet(point as Point))).toBe(false);
	// An external side's silhouette contact can fall on an internal seam.
	// That does not turn it into the agreed gate for the internal side.
	gates[2] = uprightToSheet([10, 4]);
	expect(allowed(gates[2])).toBe(false);
});
