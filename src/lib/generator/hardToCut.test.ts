import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { generateTextGrid } from './textGrid';
import { trickyLetters } from './trickyLetters';
import type { Font, Ring } from './geometry';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import type { HeartDesign } from '$lib/types/heart';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import nunito from '../../../static/generator/fonts/nunito.json';
import coffee from '../../../static/generator/motifs/ph-coffee.json';
const colors = { left: '#fffdf5', right: '#b72f2b' };

/** A hard-to-cut heart still survives both handoffs with the same weave and no
 * cutouts, keeps its stated spacing everywhere, and really has narrow paper. */
function validateHardToCut(design: HeartDesign, spacing: number) {
	const original = rasterizeDesign(design, 160).data;
	for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
		expect(restored?.fingers.length).toBe(design.fingers.length);
		expect(restored).not.toHaveProperty('rightCutouts');
		expect(restored).not.toHaveProperty('leftCutouts');
		const rect = inferOverlapRect(restored!.fingers, restored!.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(restored!.gridSize.x, restored!.gridSize.y));
		expect(findFingersWithIssues(restored!.fingers, margin * spacing, margin).size).toBe(0);
		expect(findFingersWithIssues(restored!.fingers, margin).size).toBeGreaterThan(0);
		const actual = rasterizeDesign(restored!, 160).data;
		expect(actual.reduce((sum, pixel, i) => sum + Number(pixel !== original[i]), 0) / actual.length).toBeLessThan(.002);
	}
}

describe('hard-to-cut results instead of refusals', () => {
	it('weaves the exact Cinzel 2026 in a circle and names the 6', () => {
		const result = generate({ mode: 'text', name: '2026', text: '2026', font: cinzel as unknown as Font,
			textFrame: 'circle', colors });
		expect(result.hardToCut?.letters).toEqual(['6']);
		validateHardToCut(result.design, result.hardToCut!.spacing);
	}, 30_000);

	it('keeps a framed coffee cup with narrow paper and names no letters', () => {
		const result = generate({ mode: 'figure', name: 'coffee', contours: coffee.contours as Ring[], frame: 'circle',
			style: 'sunburst', colors });
		expect(result.hardToCut?.letters).toEqual([]);
		validateHardToCut(result.design, result.hardToCut!.spacing);
	}, 30_000);

	it('names only the letters beside narrow paper', () => {
		const font = cinzel as unknown as Font, construction = generateTextGrid('A-B', font, false, 'circle');
		expect(trickyLetters(construction, 'A-B', font, gridClearance(5))).toEqual(['B']);
	});

	it('leaves clean results unflagged', () => {
		const result = generate({ mode: 'text', name: 'ANNA', text: 'ANNA', font: nunito as unknown as Font,
			textFrame: 'circle', colors });
		expect(result.hardToCut).toBeUndefined();
	});
});
