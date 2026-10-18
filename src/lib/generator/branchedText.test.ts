import { it, expect } from 'vitest';
import { generate } from './generate';
import { cutTipCounts } from './cutQuality';
import type { Font } from './geometry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import cinzel from '../../../static/generator/fonts/cinzel.json';

for (const [text, textFrame, strips, tips] of [
	['EM', 'circle', 8, 3], ['ME', 'circle', 8, 1],
	['EMMA', 'circle', 11, 2]
] as const)
	it(`joins the Cinzel ${text} branches into open strips in ${textFrame}`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: cinzel as unknown as Font,
			textFrame, colors: { left: '#fffdf5', right: '#b72f2b' } });
		expect(design.gridSize).toEqual({ x: strips, y: strips });
		expect(cutTipCounts(design)[0]).toBe(0);
		expect(cutTipCounts(design)[1]).toBeLessThanOrEqual(tips);
		const rect = inferOverlapRect(design.fingers, design.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(strips));
		expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
		const before = rasterizeDesign(design, 240).data;
		for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
			expect(restored).not.toBeNull();
			expect(restored!.fingers).toHaveLength(design.fingers.length);
			expect(restored).not.toHaveProperty('leftCutouts');
			expect(restored).not.toHaveProperty('rightCutouts');
			const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
			expect(findFingersWithIssues(restored!.fingers, intersectionMarginPx(rect, gridClearanceScale(strips))).size).toBe(0);
			const after = rasterizeDesign(restored!, 240).data;
			expect(after.reduce((count, value, i) => count + Number(value !== before[i]), 0) / after.length).toBeLessThan(.002);
		}
	}, 20000);
