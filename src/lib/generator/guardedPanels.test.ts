import { it, expect } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate } from './generate';
import { cutTipCounts } from './cutQuality';
import type { Font } from './geometry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues } from './searchClearance';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { shippedFont } from './fonts.test-helpers';

const [cinzel, breeserif] = await Promise.all(['cinzel', 'breeserif'].map(shippedFont));

const fonts = { cinzel, breeserif } as unknown as Record<string, Font>;
for (const [fontId, text, textFrame, strips, tips] of [
	['cinzel', 'LOVE', 'circle', 11, 0],
	['cinzel', 'MEME', 'circle', 12, 3],
	['cinzel', 'MILLE', 'circle', 11, 1]
] as const)
	slow(`keeps ${fontId} ${text} attachments clear of the ${textFrame} panel seams`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: fonts[fontId],
			textFrame, colors: { left: '#fffdf5', right: '#b72f2b' } });
		expect(design.gridSize).toEqual({ x: strips, y: strips });
		expect(cutTipCounts(design)[0]).toBe(0);
		expect(cutTipCounts(design)[1]).toBeLessThanOrEqual(tips);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(strips));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		const before = rasterizeDesign(design, 240).data;
		for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
			expect(restored).not.toBeNull();
			expect(restored!.fingers).toHaveLength(design.fingers.length);
			expect(restored).not.toHaveProperty('leftCutouts');
			expect(restored).not.toHaveProperty('rightCutouts');
			const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
			expect(findSearchIssues(restored!.fingers, intersectionMarginPx(rect, gridClearanceScale(strips))).size).toBe(0);
			const after = rasterizeDesign(restored!, 240).data;
			expect(after.reduce((count, value, i) => count + Number(value !== before[i]), 0) / after.length).toBeLessThan(.002);
		}
	}, 20000);
