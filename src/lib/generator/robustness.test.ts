import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import type { Font, TextFrame, Ring } from './geometry';
import { TEXT_TEMPLATES } from './templates';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import type { HeartDesign } from '$lib/types/heart';
import nunito from '../../../static/generator/fonts/nunito.json';
import breeserif from '../../../static/generator/fonts/breeserif.json';
import oswald from '../../../static/generator/fonts/oswald.json';
import kalam from '../../../static/generator/fonts/kalam.json';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import righteous from '../../../static/generator/fonts/righteous.json';
import gift from '../../../static/generator/motifs/gift.json';
import paw from '../../../static/generator/motifs/ph-paw-print.json';
import butterfly from '../../../static/generator/motifs/tb-butterfly.json';
const colors = { left: '#fffdf5', right: '#b72f2b' };
const fonts = { nunito, breeserif, oswald, kalam, cinzel, righteous } as unknown as Record<string, Font>;
function validateHandoffs(design: HeartDesign) {
	const original = rasterizeDesign(design, 160).data;
	for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
		expect(restored?.fingers.length).toBe(design.fingers.length);
		expect(restored).not.toHaveProperty('rightCutouts');
		expect(restored).not.toHaveProperty('leftCutouts');
		const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
		const margin = intersectionMarginPx(rect, gridClearanceScale(restored!.gridSize.x, restored!.gridSize.y));
		expect(findFingersWithIssues(restored!.fingers, margin).size).toBe(0);
		const actual = rasterizeDesign(restored!, 160).data;
		expect(actual.reduce((sum, pixel, i) => sum + Number(pixel !== original[i]), 0) / actual.length).toBeLessThan(.002);
	}
}
// These are expected successes, never a test that passes by accepting a refusal.
// The larger offline corpus covers 1,008 text and 1,122 figure configurations.
describe('generator robustness regressions', () => {
	for (const textFrame of TEXT_TEMPLATES)
		it(`weaves lowercase shoulders in the ${textFrame} frame`, () => {
			const { design } = generate({ mode: 'text', name: 'anna', text: 'anna', font: fonts.nunito, textFrame, colors });
			validateHandoffs(design);
		}, 20000);
	for (const [text, textFrame] of [
		['OSCAR', 'repeat'], ['juleman', 'hexagon'], ['juleman', 'rounded'],
		['JULEMAND', 'hexagon'], ['JULEMAND', 'rounded'], ['LOVE', 'hexagon'],
		['Sofie', 'repeat'], ['i', 'repeat'], ['Åse', 'repeat'], ['A\u030A', 'repeat'],
		['OSCAR', 'rounded'], ['BO', 'woven']
	] as [string, TextFrame][])
		it(`preserves ${text} in ${textFrame} through the editor and SVG`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts.nunito, textFrame, colors }).design);
		}, 20000);
	for (const [fontId, text, textFrame] of [
		['breeserif', 'Anna', 'air'], ['oswald', 'anna', 'woven'],
		['oswald', 'ANNA', 'repeat-check'], ['cinzel', 'ANNA', 'repeat-check'],
		['kalam', 'anna', 'woven'], ['kalam', 'BO', 'woven'],
		['kalam', 'i', 'woven'], ['kalam', 'i', 'air']
	] as [string, string, TextFrame][])
		it(`keeps ${text} in ${fontId} using additional letter panels`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame, colors }).design);
		}, 20000);
	for (const [name, motif] of [['Paw', paw], ['Butterfly', butterfly]] as const)
		it(`routes the disconnected parts of ${name} from visible attachments`, () => {
			validateHandoffs(generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame: 'circle', style: 'rays', colors }).design);
		}, 20000);
	for (const [fontId, font] of Object.entries(fonts))
		for (const text of (fontId === 'kalam' ? ['JUL', 'O'] : ['JUL', 'O', 'A']))
			it(`handles ${text} in ${fontId}`, () => {
				validateHandoffs(generate({ mode: 'text', name: text, text, font, textFrame: 'repeat', colors }).design);
			}, 20000);
	for (const style of ['rays', 'check', 'plain'] as const)
		it(`distributes the gift over several strips in oval-${style}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Gave', contours: gift.contours as Ring[], frame: 'oval', style, colors });
			expect(design.gridSize.x).toBeGreaterThanOrEqual(5);
			validateHandoffs(design);
		}, 20000);
});
