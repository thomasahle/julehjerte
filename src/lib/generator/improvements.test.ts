import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { type Font, type Ring, FRAMES, FIGURE_STYLES } from './geometry';
import { defaults, readGeneratorState, normalizeText } from './state';
import { FIGURE_TEMPLATES, templateVariants } from './templates';
import { matchingMotifs, motifLabel } from './catalog';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
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
				gridClearanceScale(design.gridSize.x, design.gridSize.y)
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
	it('keeps line breaks through saved designs and SVG without prescribing print size', () => {
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
			expect(restored?.templateWidthMm).toBeUndefined();
		}
	});
	it('preserves multiline links, accents and sensible input limits', () => {
		const text = 'GLÆDELIG\r\nJUL';
		expect(
			readGeneratorState(
				'#make=' + encodeURIComponent(JSON.stringify({ text }))
			).text
		).toBe('GLÆDELIG\nJUL');
		expect(normalizeText('12345678901\nA\nB\nC\nD\nE\nF')).toBe('1234567890\nA\nB\nC\nD\nE');
	});
});

describe('grid-aware spacing', () => {
	it('allows denser grids to use finer cuts without selecting a print size', () => {
		expect(gridClearance(2)).toBe(1.5);
		expect(gridClearance(6)).toBe(1);
		expect(intersectionMarginPx({ width: 100, height: 100 }, gridClearanceScale(2))).toBe(1.5);
		expect(intersectionMarginPx({ width: 100, height: 100 }, gridClearanceScale(6))).toBe(1);
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
		expect(design.templateWidthMm).toBeUndefined();
	});
	it('offers each figure frame once and opens links to the removed centre shapes and plain circle', () => {
		expect(FIGURE_TEMPLATES.map((t) => t.style)).toEqual([...FIGURE_STYLES]);
		const link = (value: object) => '#make=' + encodeURIComponent(JSON.stringify(value));
		const state = { ...defaults, mode: 'figure' as const, style: 'check' as const };
		const text = { ...defaults, mode: 'text' as const, textFrame: 'circle' as const };
		for (const frame of ['diamond', 'hexagon', 'oval', 'rounded', 'scalloped']) {
			expect(readGeneratorState(link({ ...state, frame }))).toEqual(state);
			expect(readGeneratorState(link({ ...text, textFrame: frame }))).toEqual(text);
		}
		expect(templateVariants(state).find((t) => t.id === 'circle-check')?.state).toEqual(state);
		// The circle with a plain edge mostly repeated the rays or the checks.
		expect(readGeneratorState(link({ ...state, style: 'plain' })).style).toBe('rays');
	});
	it('starts with seasonal choices from both libraries and searches the full set', () => {
		const initial = matchingMotifs(catalog, '');
		expect(initial.some((i) => i.id === 'tb-candle')).toBe(true);
		expect(initial.some((i) => i.id === 'tb-gift')).toBe(true);
		expect(initial.some((i) => i.id === 'tb-bow')).toBe(false);
		expect(motifLabel(catalog.find(i => i.id === 'tb-bow')!, 'da')).toBe('Bue og pil');
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
