import { it, expect } from 'vitest';
import { generate } from './generate';
import { generateBranchedText, fittedBranchedTextFill } from './branchedText';
import { contoursWithinBoundary } from './contours';
import { cutTipCounts } from './cutQuality';
import type { Font } from './geometry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import breeserif from '../../../static/generator/fonts/breeserif.json';

const fonts = { cinzel, breeserif } as unknown as Record<string, Font>;
for (const [text, frame, fill] of [['LOVE', 'hexagon', .9], ['ME', 'scalloped', .84]] as const)
	it(`rejects ${text} extending beyond its ${frame} instead of cropping the letters`, () => {
		expect(() => generateBranchedText(text, fonts.cinzel, frame, .55, true, [.2, .35], fill, true))
			.toThrow('The letters extend beyond the frame');
	});
it('fits complete letters inside concave frames and skips already fitting layouts', () => {
	expect(fittedBranchedTextFill('LOVE', fonts.cinzel, 'hexagon')).toBeUndefined();
	for (const text of ['ME', 'EM']) {
		const fill = fittedBranchedTextFill(text, fonts.cinzel, 'scalloped');
		expect(fill).toBeGreaterThan(.7);
		expect(fill).toBeLessThan(.84);
		const construction = generateBranchedText(text, fonts.cinzel, 'scalloped', .55, true, [.15, .3], fill, true);
		expect(contoursWithinBoundary(construction.artwork, construction.domain[0])).toBe(true);
	}
});
for (const [fontId, text, textFrame, strips, tips] of [
	['cinzel', 'LOVE', 'circle', 11, 0],
	['cinzel', 'LOVE', 'hexagon', 11, 2],
	['cinzel', 'MEME', 'circle', 12, 3],
	['cinzel', 'MILLE', 'circle', 11, 1],
	['cinzel', 'ME', 'scalloped', 8, 1],
	['cinzel', 'ME', 'hexagon', 8, 4],
	['cinzel', 'EM', 'scalloped', 8, 3],
	['cinzel', 'EM', 'hexagon', 8, 6],
	['breeserif', 'ÆØÅ', 'scalloped', 6, 0]
] as const)
	it(`keeps ${fontId} ${text} attachments clear of the ${textFrame} panel seams`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: fonts[fontId],
			textFrame, colors: { left: '#fffdf5', right: '#b72f2b' } });
		expect(design.gridSize).toEqual({ x: strips, y: strips });
		expect(cutTipCounts(design)[0]).toBe(0);
		expect(cutTipCounts(design)[1]).toBeLessThanOrEqual(tips);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(strips));
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
