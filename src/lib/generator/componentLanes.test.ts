import { it, expect } from 'vitest';
import { generateComponentLanes, hasStackedComponents } from './componentLanes';
import { generate } from './generate';
import { normalizeContours } from './contours';
import { cutTipCounts } from './cutQuality';
import { frameRing, uprightToSheet, type Ring } from './geometry';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import coffee from '../../../static/generator/motifs/ph-coffee.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';
import gift from '../../../static/generator/motifs/gift.json';

it('recognizes stacked marks above a counter-bearing body without relying on motif names', () => {
	expect(hasStackedComponents(coffee.contours as Ring[])).toBe(true);
	expect(hasStackedComponents(bicycle.contours as Ring[])).toBe(false);
	expect(hasStackedComponents(gift.contours as Ring[])).toBe(false);
	const shifted = (coffee.contours as Ring[]).map(r => r.map(([x, y]): [number, number] => [3 * x + 7, 3 * y - 2]));
	expect(hasStackedComponents(shifted.reverse())).toBe(true);
	expect(hasStackedComponents(shifted.map(r => r.map(([x, y]) => [x, -y])))).toBe(false);
});

it('changes the lane axis without rotating the motif or its oval frame', () => {
	const contours = normalizeContours(coffee.contours as Ring[]);
	const construction = generateComponentLanes(contours, 'oval', 70, .7, 'plain', false, 0, { tilt: -.08 });
	expect(construction.artwork).toEqual(contours.map(r => r.map(([x, y]) => uprightToSheet([x * 36.75, y * 36.75]))));
	expect(construction.domain).toEqual([frameRing('oval', 70)]);
	expect(construction.geometry.A_overlap_paths).toHaveLength(3);
	expect(construction.geometry.B_overlap_paths).toHaveLength(3);
});

it('opens the cup and its handle in the plain oval with four usable strips', () => {
	const { design } = generate({ mode: 'figure', name: 'Stacked figure', contours: coffee.contours as Ring[],
		frame: 'oval', style: 'plain', colors: { left: '#fff', right: '#b91313' } });
	expect(design.gridSize).toEqual({ x: 4, y: 4 });
	expect(cutTipCounts(design)).toEqual([0, 2]);
	expect(design).not.toHaveProperty('leftCutouts');
	expect(design).not.toHaveProperty('rightCutouts');
	const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(4, 4));
	expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
});

it('keeps the cup, its handle and separate steam contours in the original frame', () => {
	const contours = normalizeContours(coffee.contours as Ring[]);
	for (const aligned of [false, true]) {
		const construction = generateComponentLanes(contours, 'circle', 70, .7, 'check', aligned);
		expect(construction.artwork).toEqual(contours.map(r => r.map(([x, y]) => uprightToSheet([x * 49, y * 49]))));
		expect(construction.domain).toEqual([frameRing('circle', 70)]);
		expect(construction.geometry.A_overlap_paths).toHaveLength(3);
		expect(construction.geometry.B_overlap_paths).toHaveLength(3);
	}
});

for (const [name, motif, frame, style, tips] of [
	['coffee', coffee, 'circle', 'check', [0, 2]],
	['coffee', coffee, 'scalloped', 'rays', [0, 2]],
	['coffee', coffee, 'oval', 'rays', [0, 0]],
	['bicycle', bicycle, 'diamond', 'plain', [0, 1]]
] as const) it(`keeps a clearance reserve for ${name} in ${frame}-${style}, including both exports`, () => {
	const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame, style,
		colors: { left: '#fff', right: '#b91313' } });
	expect(design.gridSize).toEqual({ x: 4, y: 4 });
	expect(cutTipCounts(design)).toEqual(tips);
	const before = rasterizeDesign(design, 240).data;
	for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
		expect(restored).not.toBeNull();
		expect(restored!.fingers).toHaveLength(design.fingers.length);
		expect(restored).not.toHaveProperty('leftCutouts');
		expect(restored).not.toHaveProperty('rightCutouts');
		const rect = inferOverlapRect(restored!.fingers, restored!.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(4, 4));
		expect(findFingersWithIssues(restored!.fingers, margin * 1.1).size).toBe(0);
		expect(rasterizeDesign(restored!, 240).data).toEqual(before);
	}
}, 20000);
