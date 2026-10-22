import { describe, expect, it } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate } from './generate';
import { generateComponentFigure } from './components';
import { generateTextGrid } from './textGrid';
import { cutTipCounts } from './cutQuality';
import { convertValidatedCutGeometry } from '$lib/inverse/toHeartDesign';
import type { Font, TextFrame, Ring } from './geometry';
import { TEXT_TEMPLATES } from './templates';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues } from './searchClearance';
import { normalizeHeartDesign, serializeHeartDesign, parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import type { HeartDesign } from '$lib/types/heart';
import gift from '../../../static/generator/motifs/gift.json';
import paw from '../../../static/generator/motifs/ph-paw-print.json';
import tablerPaw from '../../../static/generator/motifs/tb-paw.json';
import butterfly from '../../../static/generator/motifs/tb-butterfly.json';
import rabbit from '../../../static/generator/motifs/ph-rabbit.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
import phosphorButterfly from '../../../static/generator/motifs/ph-butterfly.json';
import tablerGift from '../../../static/generator/motifs/tb-gift.json';
import angel from '../../../static/generator/motifs/angel.json';
import snow from '../../../static/generator/motifs/snow.json';
import sailboat from '../../../static/generator/motifs/ph-sailboat.json';
import smiley from '../../../static/generator/motifs/ph-smiley.json';
import palette from '../../../static/generator/motifs/tb-palette.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';
import moonStars from '../../../static/generator/motifs/ph-moon-stars.json';
import tablerStars from '../../../static/generator/motifs/tb-stars.json';
import crown from '../../../static/generator/motifs/ph-crown.json';
import { shippedFont } from './fonts.test-helpers';

const [nunito, breeserif, oswald, kalam, cinzel, righteous] = await Promise.all(['nunito', 'breeserif', 'oswald', 'kalam', 'cinzel', 'righteous'].map(shippedFont));
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
		expect(findSearchIssues(restored!.fingers, margin).size).toBe(0);
		const actual = rasterizeDesign(restored!, 160).data;
		expect(actual.reduce((sum, pixel, i) => sum + Number(pixel !== original[i]), 0) / actual.length).toBeLessThan(.002);
	}
}
// These are expected successes, never a test that passes by accepting a refusal.
// The larger offline corpus covers 816 text and 510 figure configurations.
describe('generator robustness regressions', () => {
	slow('removes the three narrow Cinzel B tips without adding paper strips', () => {
		const { design } = generate({ mode: 'text', name: 'B', text: 'B', font: fonts.cinzel,
			textFrame: 'circle', colors });
		expect(design.gridSize).toEqual({ x: 6, y: 6 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	}, 20000);
	it('weaves Cinzel B whole in the spacious frame, as large as one letter gets', () => {
		// Letter-sized cells fill the heart; B no longer needs the six-strip
		// panels whose tip improvement once threatened to rearrange them.
		const { design } = generate({ mode: 'text', name: 'B', text: 'B', font: fonts.cinzel,
			textFrame: 'air', fittedCells: true, colors });
		expect(design.gridSize).toEqual({ x: 3, y: 3 });
		validateHandoffs(design);
	}, 20000);
	slow('separates nearly touching paw outlines between the checked corners', () => {
		const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[],
			frame: 'circle', style: 'corners', colors });
		expect(design.gridSize).toEqual({ x: 6, y: 6 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	});
	for (const textFrame of ['circle'] as const)
		it(`keeps overlapping Cinzel E serifs on separate strips in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'E', text: 'E', font: fonts.cinzel, textFrame, colors });
			expect(design.gridSize).toEqual({ x: 6, y: 6 });
			expect(cutTipCounts(design)).toEqual([0, 0]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6));
			expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		});
	for (const textFrame of ['circle'] as const)
		it(`joins branched Cinzel Hej! letters through clear gaps in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'Hej!', text: 'Hej!', font: fonts.cinzel, textFrame, colors });
			expect(design.gridSize).toEqual({ x: 10, y: 10 });
			expect(cutTipCounts(design)).toEqual([0, 0]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(10));
			expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		});
	slow('clears neighbouring toes at the fitted paw grid attachments', () => {
		const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[],
			frame: 'circle', style: 'fitted', colors });
		expect(design.gridSize).toEqual({ x: 7, y: 7 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(7, 7));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	}, 20000);
	slow('routes the paw grid around the sunburst border without narrow paper tips', () => {
		const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[],
			frame: 'circle', style: 'sunburst', colors });
		expect(design.gridSize).toEqual({ x: 9, y: 9 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(9, 9));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	}, 20000);
	for (const [name, motif, narrowTips] of [['Stars', tablerStars, 0], ['Snow', snow, 7]] as const)
		slow(`keeps ${name} cuts clear of the outer sunburst corners`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[],
				frame: 'circle', style: 'sunburst', colors });
			expect(design.gridSize).toEqual({ x: 6, y: 6 });
			expect(cutTipCounts(design)).toEqual([0, narrowTips]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6, 6));
			expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of ['air', 'circle'] as const)
		slow(`keeps all Oswald ÆØÅ components connected in the ${textFrame} frame`, () => {
			const { design } = generate({ mode: 'text', name: 'ÆØÅ', text: 'ÆØÅ',
				font: fonts.oswald, textFrame, colors });
			expect(design.gridSize).toEqual({ x: 6, y: 6 });
			expect(cutTipCounts(design)).toEqual([2, 2]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6, 6));
			expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	it('opens all three crown counters without closed cuts in the layered frame', () => {
		const { design } = generate({ mode: 'figure', name: 'Crown', contours: crown.contours as Ring[],
			style: 'layers', colors });
		expect(design.gridSize).toEqual({ x: 9, y: 9 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(9, 9));
		expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	});
	it('weaves Oswald JULEMAND once across an 8×8 checkerboard', () => {
		const { design } = generate({ mode: 'text', name: 'JULEMAND', text: 'JULEMAND',
			font: fonts.oswald, textFrame: 'checkered', colors });
		expect(design.gridSize).toEqual({ x: 8, y: 8 });
		validateHandoffs(design);
	}, 20000);
	slow('connects the separate strokes of lowercase m in a checkerboard', () => {
		const { design } = generate({ mode: 'text', name: 'amy', text: 'amy', font: fonts.nunito, textFrame: 'checkered', colors });
		expect(design.gridSize).toEqual({ x: 3, y: 3 });
		validateHandoffs(design);
	}, 30000);
	for (const [fontId, text, n] of [
		['kalam', 'Anna', 4], ['kalam', 'ANNA', 4], ['oswald', 'A-B', 3],
		['nunito', 'Anna', 4], ['oswald', 'GOD JUL', 7],
		['kalam', 'ABCDEFGHIJ', 10], ['kalam', 'GOD JUL', 7]
	] as const) slow(`weaves ${fontId} ${text} once on its checkerboard`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame: 'checkered', colors });
		expect(design.gridSize).toEqual({ x: n, y: n });
		validateHandoffs(design);
	}, 30000);
	slow('keeps William on its checkerboard with every letter the size of its W', () => {
		// The wide W makes the other letters small, so the heart may be hard to
		// cut in these fonts; it is still made, with the usual warning.
		for (const font of [fonts.nunito, fonts.oswald]) {
			const { design } = generate({ mode: 'text', name: 'William', text: 'William', font, textFrame: 'checkered', colors });
			expect(design.gridSize).toEqual({ x: 7, y: 7 });
		}
	}, 60000);
	it('fits a grid around all three stars while preserving the empty space between them', () => {
		const { design } = generate({ mode: 'figure', name: 'Stars', contours: tablerStars.contours as Ring[], style: 'fitted', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const frame of ['circle'] as const)
		it(`gives the paw's four toes separate cells in ${frame}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[], frame, style: 'rays', colors });
			expect(design.gridSize).toEqual({ x: 7, y: 7 });
			validateHandoffs(design);
		}, 20000);
	for (const [name, motif] of [['Gift', gift], ['Paw', paw]] as const)
		slow(`counts the sunburst's outer strips when routing ${name}`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'sunburst', colors });
			expect(design.gridSize).toEqual({ x: 5, y: 5 });
			validateHandoffs(design);
		}, 20000);
	it('retains the rabbit inside both layers when a panel crosses a touching contour', () => {
		const { design } = generate({ mode: 'figure', name: 'Rabbit', contours: rabbit.contours as Ring[], style: 'layers', colors });
		expect(design.gridSize).toEqual({ x: 10, y: 10 });
		validateHandoffs(design);
	}, 20000);
	for (const [name, motif, frame, style, size] of [
		['stars', tablerStars, 'circle', 'corners', 6],
		['palette', palette, 'circle', 'layers', 7],
		['bicycle', bicycle, 'circle', 'sunburst', 5]
	] as const)
		slow(`detours shared cuts around neighbouring outlines for ${name}/${frame}-${style}`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame, style, colors });
			expect(design.gridSize).toEqual({ x: size, y: size });
			validateHandoffs(design);
		}, 20000);
	it('joins an odd number of separate islands without creating detached paper', () => {
		const rings: Ring[] = [[-.2, -.22, .13], [.2, -.22, .13], [0, .2, .25]].map(([x, y, r]) =>
			Array.from({ length: 48 }, (_, i) => [x + r * Math.cos(i * Math.PI / 24), y + r * Math.sin(i * Math.PI / 24)]));
		const result = generateComponentFigure(rings);
		const { design } = convertValidatedCutGeometry(result.geometry, {
			name: 'Three islands', tolerance: .025, clearanceScale: gridClearanceScale(5, 5)
		});
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		expect(result.artwork).toHaveLength(3);
		validateHandoffs(design);
	});
	for (const [frame, style] of [['circle', 'rays']] as const)
		slow(`routes the bicycle's separate components through ${frame}-${style}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Bicycle', contours: bicycle.contours as Ring[], frame, style, colors });
			expect(design.gridSize).toEqual({ x: 4, y: 4 });
			validateHandoffs(design);
		}, 20000);
	slow('keeps the gift bow and both papers intact inside the sunburst frame', () => {
		const { design } = generate({ mode: 'figure', name: 'Gift', contours: tablerGift.contours as Ring[], style: 'sunburst', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const textFrame of ['air', 'woven', 'circle'] as const)
		slow(`opens the counter of Cinzel P with clear shared connections in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'P', text: 'P', textFrame, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: 3, y: 3 });
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of ['circle'] as const)
		slow(`divides the ink of Cinzel BO into useful panels in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'BO', text: 'BO', textFrame, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: 10, y: 10 });
			validateHandoffs(design);
		}, 20000);
	slow('joins Cinzel BO panels without branching cuts in air', () => {
		const { design } = generate({ mode: 'text', name: 'BO', text: 'BO', textFrame: 'air', font: fonts.cinzel, colors });
		expect(design.gridSize).toEqual({ x: 8, y: 8 });
		validateHandoffs(design);
	}, 20000);
	for (const [text, textFrame, size] of [
		['B', 'woven', 5], ['B', 'circle', 6]
	] as [string, TextFrame, number][])
		slow(`divides Cinzel ${text} through solid seams in ${textFrame}`, () => {
			// Larger letters; square cells weave B whole on the regular 3×3 board.
			const fittedCells = textFrame === 'circle' ? undefined : true;
			const { design } = generate({ mode: 'text', name: text, text, textFrame, fittedCells, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: size, y: size });
			validateHandoffs(design);
			if (fittedCells) {
				const square = generate({ mode: 'text', name: text, text, textFrame, fittedCells: false, font: fonts.cinzel, colors }).design;
				expect(square.gridSize).toEqual({ x: 3, y: 3 });
				validateHandoffs(square);
			}
		}, 20000);
	for (const { id, textFrame, cells } of TEXT_TEMPLATES)
		slow(`weaves lowercase shoulders in the ${id} frame`, () => {
			const { design } = generate({ mode: 'text', name: 'anna', text: 'anna', font: fonts.nunito, textFrame,
				fittedCells: cells && cells === 'letters', colors });
			validateHandoffs(design);
		}, 20000);
	for (const [text, textFrame] of [
		['BO', 'woven']
	] as [string, TextFrame][])
		it(`preserves ${text} in ${textFrame} through the editor and SVG`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts.nunito, textFrame, colors }).design);
		}, 20000);
	for (const [fontId, text, textFrame] of [
		['breeserif', 'Anna', 'air'], ['oswald', 'anna', 'woven'],
		['oswald', 'ANNA', 'checkered'], ['cinzel', 'ANNA', 'checkered'],
		['breeserif', 'ÆØÅ', 'air'], ['breeserif', 'æøå', 'air'],
		['kalam', 'ANNA', 'woven'], ['kalam', 'juleman', 'woven'],
		['kalam', 'SØREN', 'air'], ['kalam', 'M&M', 'woven'],
		['kalam', 'anna', 'woven'], ['kalam', 'BO', 'woven'],
		['kalam', 'i', 'woven'], ['kalam', 'i', 'air'],
		['kalam', 'juleman', 'air'], ['kalam', 'amy', 'circle'],
		['kalam', 'ANNA', 'circle'], ['kalam', 'B', 'checkered'],
		['nunito', 'jul', 'checkered'], ['nunito', 'Hej!', 'checkered'],
		['breeserif', 'Anna', 'checkered'], ['breeserif', 'M&M', 'checkered'],
		['oswald', 'ANNA\nBO', 'checkered'],
		['kalam', 'ANNA', 'checkered'], ['kalam', 'A\u030A', 'checkered'],
		['righteous', 'Sofie', 'checkered'], ['oswald', 'æøå', 'woven'],
		['kalam', 'ANNA', 'air'], ['kalam', 'ÆØÅ', 'circle'],
		['kalam', 'A\nB\nO', 'air'], ['righteous', 'Hej!', 'air']
	] as [string, string, TextFrame][])
		slow(`keeps ${text} in ${fontId} through the ${textFrame} frame`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame, colors }).design);
		}, 20000);
	for (const [name, motif] of [['Paw', paw], ['Butterfly', butterfly], ['Rabbit', rabbit], ['Sun', sun], ['Phosphor butterfly', phosphorButterfly]] as const)
		it(`routes the disconnected parts of ${name} from visible attachments`, () => {
			validateHandoffs(generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame: 'circle', style: 'rays', colors }).design);
		}, 20000);
	for (const [fontId, font] of Object.entries(fonts))
		for (const text of (fontId === 'kalam' ? ['JUL', 'O'] : ['JUL', 'O', 'A']))
			slow(`handles ${text} in ${fontId}`, () => {
				validateHandoffs(generate({ mode: 'text', name: text, text, font, textFrame: 'checkered', colors }).design);
			}, 20000);
	for (const [name, motif] of [['Gift', gift], ['Paw', paw], ['Tabler gift', tablerGift]] as const)
		it(`distributes ${name} across a close-fitting panel grid`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'fitted', colors });
			expect(Math.min(design.gridSize.x, design.gridSize.y)).toBeGreaterThanOrEqual(4);
			validateHandoffs(design);
		}, 20000);
	for (const [name, motif] of [['Angel', angel], ['Snow', snow], ['Sun', sun], ['Smiley', smiley]] as const)
		slow(`distributes ${name} inside the layered medallion without losing either border`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'layers', colors });
			expect(Math.min(design.gridSize.x, design.gridSize.y)).toBeGreaterThanOrEqual(8);
			validateHandoffs(design);
		}, 20000);
	it('fits the sun silhouette with offset panel seams', () => {
		const { design } = generate({ mode: 'figure', name: 'Sun', contours: sun.contours as Ring[], frame: 'circle', style: 'fitted', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const frame of ['circle'] as const)
		it(`spreads the snow motif across clear connections in ${frame}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Snow', contours: snow.contours as Ring[], frame, style: 'check', colors });
			expect(design.gridSize).toEqual({ x: 8, y: 8 });
			validateHandoffs(design);
		}, 20000);
});
