import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { type Font, type Ring, FRAMES } from './geometry';
import { defaults, readGeneratorState, normalizeText } from './state';
import {
	FIGURE_TEMPLATES,
	figureTemplates,
	templateVariants
} from './templates';
import { matchingMotifs } from './catalog';
import { gridPaperWidth } from './printSize';
import {
	intersectionMarginPx,
	findFingersWithIssues
} from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import {
	normalizeHeartDesign,
	serializeHeartDesign,
	serializeHeartToSVG,
	parseHeartFromSVG
} from '$lib/utils/heartDesign';
import catalog from '../../../static/generator/catalog.json';
import nunito from '../../../static/generator/fonts/nunito.json';
import tree from '../../../static/generator/motifs/tree.json';
import gift from '../../../static/generator/motifs/gift.json';
import candle from '../../../static/generator/motifs/tb-candle.json';
import stars from '../../../static/generator/motifs/tb-stars.json';
import tablerTree from '../../../static/generator/motifs/tb-christmas-tree.json';
const colors = { left: '#fffdf5', right: '#b72f2b' };
const font = nunito as unknown as Font;

describe('longer and multiline text', () => {
	for (const text of [
		'jule',
		'man',
		'juleman',
		'JULE\nMAND',
		'GLÆDELIG\nJUL',
		'ANNA\nBO',
		'A\nB\nO'
	])
		it(`constructs ${JSON.stringify(text)} with open, adequately spaced cuts`, () => {
			const { design } = generate({
				mode: 'text',
				name: text,
				text,
				font,
				colors
			});
			expect(design.gridSize.x).toBeGreaterThanOrEqual(3);
			expect(design).not.toHaveProperty('rightCutouts');
			const margin = intersectionMarginPx(
				inferOverlapRect(design.fingers, design.gridSize),
				design.templateWidthMm
			);
			expect(findFingersWithIssues(design.fingers, margin).size).toBe(0);
		});
	for (const textFrame of FRAMES)
		it(`supports two rows in the ${textFrame} frame`, () => {
			const { design } = generate({
				mode: 'text',
				name: 'JULE\nMAND',
				text: 'JULE\nMAND',
				textFrame,
				font,
				colors
			});
			expect(design.gridSize).toEqual({ x: 7, y: 7 });
		});
	it('keeps line breaks and larger print sizes through saved designs and SVG', () => {
		const { design } = generate({
			mode: 'text',
			name: 'JULE\nMAND',
			text: 'JULE\nMAND',
			font,
			colors
		});
		for (const restored of [
			normalizeHeartDesign(serializeHeartDesign(design)),
			parseHeartFromSVG(serializeHeartToSVG(design))
		]) {
			expect(restored?.name).toBe('JULE\nMAND');
			expect(restored?.templateWidthMm).toBe(175);
		}
	});
	it('preserves multiline links, accents and sensible input limits', () => {
		const text = 'GLÆDELIG\r\nJUL';
		expect(
			readGeneratorState(
				'#make=' + encodeURIComponent(JSON.stringify({ text }))
			).text
		).toBe('GLÆDELIG\nJUL');
		expect(normalizeText('12345678901\nA\nB\nC')).toBe('1234567890\nA\nB');
	});
});

describe('physical spacing', () => {
	it('keeps a 1.5 mm gap as the grid and print size increase', () => {
		expect(gridPaperWidth(2)).toBe(100);
		expect(gridPaperWidth(6)).toBe(150);
		expect(intersectionMarginPx({ width: 100, height: 100 }, 100)).toBe(1.5);
		expect(intersectionMarginPx({ width: 100, height: 100 }, 150)).toBe(1);
	});
});

describe('figures and complete templates', () => {
	for (const [name, contours] of [
		['Gave', gift.contours],
		['Stearinlys', candle.contours],
		['Stjerner', stars.contours],
		['Juletræ', tablerTree.contours]
	] as const)
		it(`weaves ${name} without cutouts`, () => {
			const { design } = generate({
				mode: 'figure',
				name,
				contours: contours as Ring[],
				colors
			});
			expect(design).not.toHaveProperty('rightCutouts');
			expect(design.gridSize.x).toBeGreaterThanOrEqual(name === 'Gave' ? 5 : 3);
		});
	it('adds a circular sunburst with extra open strips around the figure', () => {
		const { design } = generate({
			mode: 'figure',
			name: 'Tree',
			contours: tree.contours as Ring[],
			style: 'sunburst',
			colors
		});
		expect(design.gridSize).toEqual({ x: 5, y: 5 });
		expect(design.templateWidthMm).toBe(125);
	});
	it('offers unique complete pairs and keeps old shared selections', () => {
		expect(FIGURE_TEMPLATES).toHaveLength(19);
		expect(new Set(FIGURE_TEMPLATES.map((t) => t.id)).size).toBe(19);
		const state = {
			...defaults,
			mode: 'figure' as const,
			frame: 'hexagon' as const,
			style: 'plain' as const
		};
		expect(figureTemplates(state).some((t) => t.id === 'hexagon-plain')).toBe(
			true
		);
		expect(
			templateVariants(state).find((t) => t.id === 'hexagon-plain')?.state
		).toEqual(state);
	});
	it('starts with seasonal choices from both libraries and searches the full set', () => {
		const initial = matchingMotifs(catalog, '');
		expect(initial.some((i) => i.id === 'tb-candle')).toBe(true);
		expect(initial.some((i) => i.id === 'ph-snowflake')).toBe(true);
		expect(initial.some((i) => /airplay|alarm/.test(i.id))).toBe(false);
		expect(matchingMotifs(catalog, 'airplay').length).toBeGreaterThan(0);
		expect(
			matchingMotifs(catalog, 'tabler juletræ').some(
				(i) => i.id === 'tb-christmas-tree'
			)
		).toBe(true);
	});
});
