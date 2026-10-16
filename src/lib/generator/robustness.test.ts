import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { generateComponentFigure } from './components';
import { generateTextGrid } from './textGrid';
import { cutTipCounts } from './cutQuality';
import { convertValidatedCutGeometry } from '$lib/inverse/toHeartDesign';
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
// The larger offline corpus covers 2,028 text and 1,122 figure configurations.
describe('generator robustness regressions', () => {
	for (const [name, motif, narrowTips] of [['Stars', tablerStars, 0], ['Snow', snow, 7]] as const)
		it(`keeps ${name} cuts clear of the outer sunburst corners`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[],
				frame: 'circle', style: 'sunburst', colors });
			expect(design.gridSize).toEqual({ x: 6, y: 6 });
			expect(cutTipCounts(design)).toEqual([0, narrowTips]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6, 6));
			expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of ['air', 'circle', 'diamond', 'oval', 'rounded', 'scalloped'] as const)
		it(`keeps all Oswald ÆØÅ components connected in the ${textFrame} frame`, () => {
			const { design } = generate({ mode: 'text', name: 'ÆØÅ', text: 'ÆØÅ',
				font: fonts.oswald, textFrame, colors });
			expect(design.gridSize).toEqual({ x: 6, y: 6 });
			expect(cutTipCounts(design)).toEqual([2, 2]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6, 6));
			expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	it('divides Cinzel BO into open strips inside the original hexagon', () => {
		const { design } = generate({ mode: 'text', name: 'BO', text: 'BO',
			font: fonts.cinzel, textFrame: 'hexagon', colors });
		expect(design.gridSize).toEqual({ x: 6, y: 6 });
		expect(cutTipCounts(design)).toEqual([1, 6]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6, 6));
		expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	}, 20000);
	for (const style of ['plain', 'rays', 'check'] as const)
		it(`joins the paw through wider gaps in the oval ${style} frame`, () => {
			const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[],
				frame: 'oval', style, colors });
			expect(design.gridSize).toEqual({ x: 7, y: 7 });
			expect(cutTipCounts(design)).toEqual(style === 'rays' ? [0, 4] : [0, 0]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(7, 7));
			expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	it('opens all three crown counters without closed cuts in the layered frame', () => {
		const { design } = generate({ mode: 'figure', name: 'Crown', contours: crown.contours as Ring[],
			style: 'layers', colors });
		expect(design.gridSize).toEqual({ x: 9, y: 9 });
		expect(cutTipCounts(design)).toEqual([0, 0]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(9, 9));
		expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	});
	it('keeps the wider Oswald JULEMAND cuts when notch relief creates a thin neck', () => {
		const { design } = generate({ mode: 'text', name: 'JULEMAND', text: 'JULEMAND',
			font: fonts.oswald, textFrame: 'repeat-check', colors });
		// A candidate with only 16 tips loses the clearance reserve and has an
		// uncertain material core. Keep the established 24-tip construction.
		expect(design.gridSize).toEqual({ x: 8, y: 8 });
		expect(cutTipCounts(design)).toEqual([24, 24]);
		validateHandoffs(design);
	}, 20000);
	for (const [fontId, text, tips] of [
		['oswald', 'jul', [0, 3]], ['righteous', 'jul', [0, 0]],
		['righteous', 'Sofie', [4, 10]], ['righteous', 'William', [0, 0]]
	] as const) it(`connects detached dots to clear gates in the ${fontId} ${text} repeat`, () => {
		const { design } = generate({ mode: 'text', name: text, text,
			font: fonts[fontId], textFrame: 'repeat', colors });
		expect(design.gridSize).toEqual({ x: text.length * 2, y: text.length });
		expect(cutTipCounts(design)).toEqual(tips);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(design.gridSize.x, design.gridSize.y));
		expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	});
	for (const style of ['plain', 'rays', 'check'] as const)
		it(`connects both sailboat parts through the oval ${style} frame`, () => {
			const { design } = generate({ mode: 'figure', name: 'sailboat', contours: sailboat.contours as Ring[],
				frame: 'oval', style, colors });
			expect(design.gridSize).toEqual({ x: 3, y: 3 });
			expect(cutTipCounts(design)).toEqual([0, 0]);
			const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(3, 3));
			expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
			validateHandoffs(design);
		}, 20000);
	it('opens repeated Kalam EMMA with multiple shared connections and intact counters', () => {
		const { design } = generate({ mode: 'text', name: 'EMMA', text: 'EMMA',
			font: fonts.kalam, textFrame: 'repeat', colors });
		expect(design.gridSize).toEqual({ x: 8, y: 4 });
		expect(cutTipCounts(design)).toEqual([4, 4]);
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(8, 4));
		expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
		validateHandoffs(design);
	}, 30000);
	for (const fontId of ['nunito', 'breeserif', 'oswald', 'kalam', 'righteous'])
		it(`keeps three ${fontId} text rows inside the diamond frame`, () => {
			const { design } = generate({ mode: 'text', name: 'A B O', text: 'A\nB\nO',
				font: fonts[fontId], textFrame: 'diamond', colors });
			expect(design.gridSize).toEqual({ x: 5, y: 5 });
			validateHandoffs(design);
		}, 20000);
	for (const [text, strips] of [['B', 6], ['BO', 8]] as const)
		it(`separates the divided Cinzel ${text} cuts outside the diamond frame`, () => {
			const { design } = generate({ mode: 'text', name: text, text,
				font: fonts.cinzel, textFrame: 'diamond', colors });
			expect(design.gridSize).toEqual({ x: strips, y: strips });
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of ['diamond', 'hexagon'] as const)
		it(`gives ten Nunito letters room with curved shared cuts in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'ABCDEFGHIJ', text: 'ABCDEFGHIJ',
				font: fonts.nunito, textFrame, colors });
			expect(design.gridSize).toEqual({ x: 12, y: 12 });
			validateHandoffs(design);
		}, 30000);
	it('connects the separate strokes of lowercase m in a checkerboard', () => {
		const { design } = generate({ mode: 'text', name: 'amy', text: 'amy', font: fonts.nunito, textFrame: 'repeat-check', colors });
		expect(design.gridSize).toEqual({ x: 6, y: 6 });
		// Curved coincident connections remove nine extra tips without changing
		// the letters or putting the whole pattern on a single paper strip.
		expect(cutTipCounts(design)).toEqual([3, 3]);
		validateHandoffs(design);
	}, 30000);
	it('uses stroke-tip attachments for Bree Serif jul in the repeating letter field', () => {
		const { design } = generate({ mode: 'text', name: 'jul', text: 'jul', font: fonts.breeserif, textFrame: 'repeat', colors });
		expect(design.gridSize).toEqual({ x: 6, y: 3 });
		validateHandoffs(design);
	}, 20000);
	for (const [fontId, text, tips] of [
		['kalam', 'Anna', [0, 0]], ['kalam', 'ANNA', [0, 4]], ['oswald', 'A-B', [6, 9]]
	] as const) it(`retains the simpler existing ${fontId} ${text} checkerboard cuts`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame: 'repeat-check', colors });
		const actual = cutTipCounts(design);
		expect(actual[0]).toBeLessThanOrEqual(tips[0]);
		expect(actual[1]).toBeLessThanOrEqual(tips[1]);
	}, 20000);
	for (const [fontId, text, n] of [
		['nunito', 'Anna', 4], ['nunito', 'William', 14], ['oswald', 'GOD JUL', 6],
		['kalam', 'ABCDEFGHIJ', 10], ['kalam', 'GOD JUL', 6]
	] as const) it(`combines two- and four-connection letters for ${fontId} ${text}`, () => {
		const { design } = generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame: 'repeat-check', colors });
		expect(design.gridSize).toEqual({ x: n, y: n });
		validateHandoffs(design);
	}, 30000);
	it('fits a grid around all three stars while preserving the empty space between them', () => {
		const { design } = generate({ mode: 'figure', name: 'Stars', contours: tablerStars.contours as Ring[], style: 'fitted', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const frame of ['circle', 'diamond', 'hexagon', 'rounded', 'scalloped'] as const)
		it(`gives the paw's four toes separate cells in ${frame}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Paw', contours: tablerPaw.contours as Ring[], frame, style: 'rays', colors });
			expect(design.gridSize).toEqual({ x: 7, y: 7 });
			validateHandoffs(design);
		}, 20000);
	for (const [name, motif] of [['Gift', gift], ['Paw', paw]] as const)
		it(`counts the sunburst's outer strips when routing ${name}`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'sunburst', colors });
			expect(design.gridSize).toEqual({ x: 5, y: 5 });
			validateHandoffs(design);
		}, 20000);
	for (const style of ['plain', 'rays', 'check'] as const)
		it(`keeps the butterfly's touching wings in the oval-${style} frame`, () => {
			const { design } = generate({ mode: 'figure', name: 'Butterfly', contours: phosphorButterfly.contours as Ring[], frame: 'oval', style, colors });
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
		['bicycle', bicycle, 'circle', 'sunburst', 5],
		['bicycle', bicycle, 'scalloped', 'plain', 3]
	] as const)
		it(`detours shared cuts around neighbouring outlines for ${name}/${frame}-${style}`, () => {
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
	for (const [frame, style] of [['circle', 'rays'], ['hexagon', 'check'], ['rounded', 'plain']] as const)
		it(`routes the bicycle's separate components through ${frame}-${style}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Bicycle', contours: bicycle.contours as Ring[], frame, style, colors });
			expect(design.gridSize).toEqual({ x: 4, y: 4 });
			validateHandoffs(design);
		}, 20000);
	it('keeps the gift bow and both papers intact inside the sunburst frame', () => {
		const { design } = generate({ mode: 'figure', name: 'Gift', contours: tablerGift.contours as Ring[], style: 'sunburst', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const textFrame of ['air', 'woven', 'circle', 'diamond', 'rounded', 'scalloped'] as const)
		it(`opens the counter of Cinzel P with clear shared connections in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'P', text: 'P', textFrame, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: 3, y: 3 });
			validateHandoffs(design);
		}, 20000);
	for (const text of ['William', 'ÆØÅ'])
		it(`retains the repeating ${text} field with bent shared connections`, () => {
			const { design } = generate({ mode: 'text', name: text, text, textFrame: 'repeat', font: fonts.nunito, colors });
			expect(design.gridSize).toEqual({ x: text.length * 2, y: text.length });
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of ['circle', 'scalloped'] as const)
		it(`divides the ink of Cinzel BO into useful panels in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: 'BO', text: 'BO', textFrame, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: 10, y: 10 });
			validateHandoffs(design);
		}, 20000);
	it('joins Cinzel BO panels without branching cuts in air', () => {
		const { design } = generate({ mode: 'text', name: 'BO', text: 'BO', textFrame: 'air', font: fonts.cinzel, colors });
		expect(design.gridSize).toEqual({ x: 8, y: 8 });
		validateHandoffs(design);
	}, 20000);
	it('aligns adaptive Cinzel BO seams through the oval frame', () => {
		const construction = generateTextGrid('BO', fonts.cinzel, false, 'oval', {
			columns: 2, slices: 3, filled: true, spread: true,
			practical: true, compound: true, guardSeams: true, adaptivePanels: true
		});
		const { design } = convertValidatedCutGeometry(construction.geometry, {
			name: 'BO', colors, tolerance: .025, clearanceScale: gridClearanceScale(8, 8)
		});
		expect(design.gridSize).toEqual({ x: 8, y: 8 });
		validateHandoffs(design);
	});
	for (const [text, textFrame, size] of [
		['B', 'woven', 5], ['B', 'air', 6], ['B', 'circle', 6],
		['B', 'rounded', 6], ['B', 'scalloped', 6], ['BO', 'rounded', 8]
	] as [string, TextFrame, number][])
		it(`divides Cinzel ${text} through solid seams in ${textFrame}`, () => {
			const { design } = generate({ mode: 'text', name: text, text, textFrame, font: fonts.cinzel, colors });
			expect(design.gridSize).toEqual({ x: size, y: size });
			validateHandoffs(design);
		}, 20000);
	for (const textFrame of TEXT_TEMPLATES)
		it(`weaves lowercase shoulders in the ${textFrame} frame`, () => {
			const { design } = generate({ mode: 'text', name: 'anna', text: 'anna', font: fonts.nunito, textFrame, colors });
			if (textFrame === 'repeat-check') expect(cutTipCounts(design)).toEqual([2, 2]);
			validateHandoffs(design);
		}, 20000);
	for (const [text, textFrame] of [
		['OSCAR', 'repeat'], ['juleman', 'hexagon'], ['juleman', 'rounded'],
		['JULEMAND', 'hexagon'], ['JULEMAND', 'rounded'], ['LOVE', 'hexagon'],
		['Sofie', 'repeat'], ['i', 'repeat'], ['Åse', 'repeat'], ['A\u030A', 'repeat'],
		['OSCAR', 'rounded'], ['BO', 'woven'],
		['æøå', 'diamond'], ['æøå', 'hexagon'], ['æøå', 'rounded'],
		['Anna', 'repeat'], ['SØREN', 'repeat']
	] as [string, TextFrame][])
		it(`preserves ${text} in ${textFrame} through the editor and SVG`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts.nunito, textFrame, colors }).design);
		}, 20000);
	for (const [fontId, text, textFrame] of [
		['breeserif', 'Anna', 'air'], ['oswald', 'anna', 'woven'],
		['oswald', 'ANNA', 'repeat-check'], ['cinzel', 'ANNA', 'repeat-check'],
		['breeserif', 'ÆØÅ', 'air'], ['breeserif', 'æøå', 'air'],
		['kalam', 'ANNA', 'woven'], ['kalam', 'juleman', 'woven'],
		['kalam', 'SØREN', 'air'], ['kalam', 'M&M', 'woven'],
		['kalam', 'A', 'repeat'], ['breeserif', 'amy', 'repeat'],
		['oswald', 'William', 'repeat'],
		['breeserif', 'i', 'repeat'], ['oswald', 'i', 'repeat'],
		['kalam', 'i', 'repeat'], ['righteous', 'i', 'repeat'],
		['kalam', 'anna', 'woven'], ['kalam', 'BO', 'woven'],
		['kalam', 'i', 'woven'], ['kalam', 'i', 'air'],
		['kalam', 'juleman', 'air'], ['kalam', 'amy', 'circle'],
		['kalam', 'ANNA', 'circle'], ['kalam', 'ANNA', 'diamond'],
		['kalam', 'ANNA', 'oval'], ['kalam', 'ANNA', 'rounded'],
		['kalam', 'ANNA', 'repeat'], ['kalam', 'B', 'repeat-check'],
		['nunito', 'jul', 'repeat-check'], ['nunito', 'Hej!', 'repeat-check'],
		['breeserif', 'Anna', 'repeat-check'], ['breeserif', 'M&M', 'repeat-check'],
		['oswald', 'William', 'repeat-check'], ['oswald', 'ANNA\nBO', 'repeat-check'],
		['kalam', 'ANNA', 'repeat-check'], ['kalam', 'A\u030A', 'repeat-check'],
		['righteous', 'Sofie', 'repeat-check'],
		['oswald', 'anna', 'scalloped'], ['oswald', 'juleman', 'hexagon'],
		['oswald', 'æøå', 'woven'], ['oswald', 'Åse', 'hexagon'],
		['kalam', 'ANNA', 'air'], ['kalam', 'ANNA', 'hexagon'],
		['kalam', 'ANNA', 'scalloped'], ['kalam', 'anna', 'oval'],
		['kalam', 'ÆØÅ', 'circle'], ['kalam', 'JULE\nMAND', 'hexagon'],
		['kalam', 'ANNA\nBO', 'hexagon'], ['kalam', 'A\nB\nO', 'air'],
		['righteous', 'ÆØÅ', 'hexagon'], ['righteous', 'æøå', 'scalloped'],
		['righteous', 'Hej!', 'air']
	] as [string, string, TextFrame][])
		it(`keeps ${text} in ${fontId} through the ${textFrame} frame`, () => {
			validateHandoffs(generate({ mode: 'text', name: text, text, font: fonts[fontId], textFrame, colors }).design);
		}, 20000);
	for (const [name, motif] of [['Paw', paw], ['Butterfly', butterfly], ['Rabbit', rabbit], ['Sun', sun], ['Phosphor butterfly', phosphorButterfly]] as const)
		it(`routes the disconnected parts of ${name} from visible attachments`, () => {
			validateHandoffs(generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame: 'circle', style: 'rays', colors }).design);
		}, 20000);
	for (const [fontId, font] of Object.entries(fonts))
		for (const text of (fontId === 'kalam' ? ['JUL', 'O'] : ['JUL', 'O', 'A']))
			it(`handles ${text} in ${fontId}`, () => {
				validateHandoffs(generate({ mode: 'text', name: text, text, font, textFrame: 'repeat', colors }).design);
			}, 20000);
	for (const style of ['rays', 'check', 'plain'] as const)
		it(`retains the original paw routing in oval-${style}`, () => {
			validateHandoffs(generate({ mode: 'figure', name: 'Pote', contours: paw.contours as Ring[], frame: 'oval', style, colors }).design);
		}, 20000);
	for (const [name, motif] of [['Gift', gift], ['Paw', paw], ['Tabler gift', tablerGift]] as const)
		it(`distributes ${name} across a close-fitting panel grid`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'fitted', colors });
			expect(Math.min(design.gridSize.x, design.gridSize.y)).toBeGreaterThanOrEqual(4);
			validateHandoffs(design);
		}, 20000);
	for (const style of ['rays', 'check', 'plain'] as const)
		it(`distributes the gift over several strips in oval-${style}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Gave', contours: gift.contours as Ring[], frame: 'oval', style, colors });
			expect(design.gridSize.x).toBeGreaterThanOrEqual(5);
			validateHandoffs(design);
		}, 20000);
	for (const [name, motif] of [['Angel', angel], ['Snow', snow], ['Sun', sun], ['Smiley', smiley]] as const)
		it(`distributes ${name} inside the layered medallion without losing either border`, () => {
			const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'layers', colors });
			expect(Math.min(design.gridSize.x, design.gridSize.y)).toBeGreaterThanOrEqual(8);
			validateHandoffs(design);
		}, 20000);
	for (const [name, motif, frame] of [['Gift', tablerGift, 'hexagon'], ['Gift', tablerGift, 'oval'], ['Palette', palette, 'scalloped']] as const)
		for (const style of ['rays', 'check', 'plain'] as const)
			it(`uses a wider choice of attachments for ${name} in ${frame}-${style}`, () => {
				validateHandoffs(generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame, style, colors }).design);
			}, 20000);
	for (const frame of ['diamond', 'hexagon', 'oval'] as const)
		for (const style of ['rays', 'check', 'plain'] as const)
			it(`keeps the sun's rays when shifting panels inside ${frame}-${style}`, () => {
				const { design } = generate({ mode: 'figure', name: 'Sun', contours: sun.contours as Ring[], frame, style, colors });
				expect(design.gridSize).toEqual({ x: 5, y: 5 });
				validateHandoffs(design);
			}, 20000);
	it('fits the sun silhouette with offset panel seams', () => {
		const { design } = generate({ mode: 'figure', name: 'Sun', contours: sun.contours as Ring[], frame: 'circle', style: 'fitted', colors });
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		validateHandoffs(design);
	}, 20000);
	for (const style of ['rays', 'check', 'plain'] as const)
		it(`routes the bicycle's touching counter through an oval-${style}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Bicycle', contours: bicycle.contours as Ring[], frame: 'oval', style, colors });
			expect(design.gridSize).toEqual({ x: 3, y: 3 });
			validateHandoffs(design);
		}, 20000);
	for (const frame of ['diamond', 'oval'] as const)
		for (const style of ['rays', 'check', 'plain'] as const)
			it(`connects moon and stars through filled seams in ${frame}-${style}`, () => {
				const { design } = generate({ mode: 'figure', name: 'Moon and stars', contours: moonStars.contours as Ring[], frame, style, colors });
				expect(design.gridSize).toEqual({ x: 5, y: 5 });
				validateHandoffs(design);
			}, 20000);
	for (const frame of ['circle', 'diamond', 'hexagon', 'rounded', 'scalloped'] as const)
		it(`spreads the snow motif across clear connections in ${frame}`, () => {
			const { design } = generate({ mode: 'figure', name: 'Snow', contours: snow.contours as Ring[], frame, style: 'check', colors });
			expect(design.gridSize).toEqual({ x: 8, y: 8 });
			validateHandoffs(design);
		}, 20000);
});
