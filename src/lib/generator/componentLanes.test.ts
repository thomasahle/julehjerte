import { it, expect } from 'vitest';
import { generateComponentLanes } from './componentLanes';
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
