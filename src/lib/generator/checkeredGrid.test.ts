import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { generateCheckeredGrid, checkeredGridCache, checkeredLayout, checkeredLayouts, checkeredMatrix } from './checkeredGrid';
import { defaults, readGeneratorState } from './state';
import { geometryKey } from './cache';
import { templateVariants } from './templates';
import { usableMotif, type Font } from './geometry';
import nunito from '../../../static/generator/fonts/nunito.json';
import breeserif from '../../../static/generator/fonts/breeserif.json';
import oswald from '../../../static/generator/fonts/oswald.json';
import kalam from '../../../static/generator/fonts/kalam.json';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import righteous from '../../../static/generator/fonts/righteous.json';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues } from './searchClearance';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { cutTipCounts } from './cutQuality';

const font = nunito as unknown as Font;
const fonts = { nunito, breeserif, oswald, kalam, cinzel, righteous };
const colors = { left: '#fffdf5', right: '#b72f2b' };
const make = (text: string) => generate({ mode: 'text', name: text, text, font, colors, textFrame: 'checkered' }).design;
const rows = (text: string) => checkeredMatrix(text).map(row => row.map(char => char ?? '.').join(''));
// The board as the heart shows it: one string per horizontal row of the diamond, left to right.
const diamond = (text: string) => {
	const matrix = checkeredMatrix(text), n = matrix.length;
	return Array.from({ length: 2 * n - 1 }, (_, v) => Array.from({ length: n - Math.abs(n - 1 - v) }, (_, i) => {
		const row = Math.min(v, n - 1) - i;
		return matrix[row][v - row] ?? '.';
	}).join(''));
};

describe('typed letters on alternating squares', () => {
	it('reads each typed line across the heart, on the smallest board that fits', () => {
		expect(diamond('abc')).toEqual(['.', '..', 'abc', '..', '.']);
		expect(diamond('abc\nde')).toEqual(['.', '..', 'abc', 'de', '.']);
		// A line that cannot be centred on its row sits half a square to the left.
		expect(diamond('abc\ndef')).toEqual(['.', '..', '...', 'abc.', 'def', '..', '.']);
		expect(diamond('a\nbc\nd')).toEqual(['a', 'bc', 'd']);
		expect(diamond('ANNA')).toEqual(['.', '..', '...', 'ANNA', '...', '..', '.']);
		expect(diamond('GOD JUL')[6]).toBe('GOD.JUL');
		// A decomposed Å is one character, like the composed one. Alone, it
		// takes the top square rather than sitting beside the centre.
		expect(diamond('A\u030A')).toEqual(['\u00C5', '..', '.']);
		// Every square of a board can carry a letter, the tips included.
		expect(diamond('J\nUL\nJUL\nUL\nJ')).toEqual(['J', 'UL', 'JUL', 'UL', 'J']);
		expect(diamond('JUL\nul\nb')).toEqual(['.', '..', 'JUL', 'ul', 'b']);
		expect(diamond('J\nJU\nJUL')).toEqual(['J', 'JU', 'JUL', '..', '.']);
		// Lines that can fill their rows pack into a tip of the diamond.
		expect(diamond('J\nJU\nJUL\nJULE')).toEqual(['J', 'JU', 'JUL', 'JULE', '...', '..', '.']);
	});

	it('connects each letter through one junction at its corner, apart from other junctions where the board allows', () => {
		const neighbours = (text: string) => {
			const { matrix, groups, letterGroup } = checkeredLayout(text);
			for (const [row, line] of matrix.entries()) for (const [col, char] of line.entries())
				if (char !== undefined) expect(groups[letterGroup.get(`${row},${col}`)!].cells).toContainEqual([row, col]);
			return groups.flatMap((a, i) => groups.slice(i + 1).filter(b => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1)).length;
		};
		for (const text of ['abc', 'abc\nde', 'abc\ndef', 'JULE\nMAND', 'GOD JUL', 'ABCDEFGHIJ\nABCDEFGHIJ\nABCDEFGHIJ', 'J\nJU\nJUL\nJULE\nJUL\nJU\nJ'])
			expect(neighbours(text)).toBe(0);
		// On 3×3 the four junctions are the corners of the centre square, and
		// each tip square touches only one of them. Neighbouring junctions keep
		// their connections in their own halves of the edge they share.
		expect(neighbours('J\nUL\nJUL\nUL\nJ')).toBe(4);
		expect(neighbours('JUL\nul\nb')).toBe(2);
		// The 4×4 board without neighbouring junctions remains, after them.
		expect(checkeredLayouts('JUL\nul\nb').map(layout => layout.matrix.length)).toEqual([3, 3, 3, 4, 4, 4]);
	});

	it('weaves full 3×3 boards through neighbouring junctions in every font', () => {
		for (const [fontId, other] of Object.entries(fonts)) for (const text of ['J\nUL\nJUL\nUL\nJ', 'JUL\nJU\nL']) {
			const result = generate({ mode: 'text', name: text, text, font: other as unknown as Font, colors, textFrame: 'checkered' });
			expect(result.design.gridSize, `${fontId} ${text}`).toEqual({ x: 3, y: 3 });
			expect(result.hardToCut, `${fontId} ${text}`).toBeUndefined();
			const rect = inferOverlapRect(result.design.fingers, result.design.gridSize);
			expect(findSearchIssues(result.design.fingers, intersectionMarginPx(rect, gridClearanceScale(3))).size).toBe(0);
		}
	}, 60000);

	it('draws every letter of a text at one size, so a narrow I stays as tall as its neighbours', () => {
		const { artwork } = generateCheckeredGrid('PHILIP', font), cell = 100 / checkeredLayout('PHILIP').matrix.length;
		const onGrid = (v: number) => Math.abs(v / cell - Math.round(v / cell)) < 1e-9;
		// Upright heights, along the diagonal the heart shows as vertical, per lettered square.
		const letters = new Map<string, number[]>();
		for (const ring of artwork.filter(ring => !ring.every(([x, y]) => onGrid(x) && onGrid(y)))) {
			const [cx, cy] = ring.reduce(([a, b], [x, y]) => [a + x / ring.length, b + y / ring.length], [0, 0]);
			const key = `${Math.floor(cx / cell)},${Math.floor(cy / cell)}`;
			letters.set(key, [...letters.get(key) ?? [], ...ring.map(([x, y]) => (x + y) * Math.SQRT1_2)]);
		}
		const heights = [...letters.values()].map(u => Math.max(...u) - Math.min(...u));
		expect(heights).toHaveLength(6);
		for (const height of heights) expect(height / heights[0]).toBeCloseTo(1, 1);
	});

	it('weaves the letters in their squares and leaves the other squares plain', () => {
		const design = make('ANNA');
		expect(design.gridSize).toEqual({ x: 4, y: 4 });
		const mask = rasterizeDesign(design, 400).data;
		const sample = (x: number, y: number) => mask[Math.floor(y * 4) * 400 + Math.floor(x * 4)];
		for (const [row, line] of rows('ANNA').entries())
			for (const [col, char] of [...line].entries()) {
				const x = (col + .5) * 25, y = (row + .5) * 25, background = (row + col) % 2;
				expect(sample(col * 25 + 1, row * 25 + 1)).toBe(background);
				// N's diagonal crosses the centre; A's counter stays background paper.
				expect(sample(x, y)).toBe(Number(char === 'N') ^ background);
				if (char === 'A') expect(sample(x + 2.5, y + 2.5)).toBe(1 ^ background);
				if (char === '.') expect(sample(x + 5, y - 5)).toBe(background);
			}
	}, 20000);

	it('reuses clear letters while moving only the connections that need repair', () => {
		const cache = checkeredGridCache();
		generateCheckeredGrid('jul\nulj\nlju', font, .82, .35, { cache });
		const completed = new Map([...cache].filter(([, piece]) => usableMotif(piece.edges, piece.gates, gridClearance(4))));
		expect(completed.size).toBeGreaterThan(0);
		generateCheckeredGrid('jul\nulj\nlju', font, .82, .35, { cache, repair: true });
		for (const [key, piece] of completed) expect(cache.get(key)).toBe(piece);
		for (const [, piece] of [...cache].filter(([key]) => key.endsWith(':repair'))) {
			expect(piece.usable).toBe(true);
			expect(piece.insets[0]).toBeLessThan(.5);
			expect(piece.insets[1]).toBeGreaterThan(.5);
		}
	}, 20000);

	it('keeps ANNA free of narrow paper tips', () => {
		expect(cutTipCounts(make('ANNA'))).toEqual([0, 0]);
	}, 20000);

	for (const [text, n] of [['ANNA', 4], ['JUL', 3], ['O', 2], ['anna', 4], ['SØREN', 5], ['M&M', 3],
		['Å', 2], ['abc\nde', 3], ['JULE\nMAND', 5], ['GOD JUL', 7], ['J\nUL\nJUL\nUL\nJ', 3],
		['JUL\nJUL\nJUL\nJUL\nJUL\nJUL', 6]] as const)
		it(`preserves ${JSON.stringify(text)} and its checkerboard through JSON and SVG`, () => {
			const design = make(text), original = rasterizeDesign(design, 160).data;
			expect(design.gridSize).toEqual({ x: n, y: n });
			for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
				expect(restored?.fingers.length).toBe(design.fingers.length);
				expect(restored).not.toHaveProperty('rightCutouts');
				expect(restored).not.toHaveProperty('leftCutouts');
				const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
				expect(rect.width).toBeCloseTo(rect.height);
				const margin = intersectionMarginPx(rect, gridClearanceScale(n));
				expect(findSearchIssues(restored!.fingers, margin).size).toBe(0);
				const actual = rasterizeDesign(restored!, 160).data;
				expect(actual.reduce((sum, v, i) => sum + Number(v !== original[i]), 0) / actual.length).toBeLessThan(.002);
			}
		}, 20000);

	it('is a distinct shareable frame and opens links to the former repeating frames', () => {
		const state = { ...defaults, mode: 'text' as const, textFrame: 'checkered' as const };
		const link = (value: object) => '#make=' + encodeURIComponent(JSON.stringify(value));
		expect(readGeneratorState(link(state))).toEqual(state);
		expect(readGeneratorState(link({ ...state, textFrame: 'repeat-check' }))).toEqual(state);
		expect(readGeneratorState(link({ ...state, textFrame: 'repeat' })).textFrame).toBe(defaults.textFrame);
		expect(templateVariants(state).find(v => v.id === 'checkered')?.state).toEqual(state);
		expect(templateVariants(state).map(v => v.id)).not.toContain('repeat');
		expect(geometryKey(state)).not.toBe(geometryKey({ ...state, textFrame: 'woven' }));
	});

	it('refuses empty text and missing characters before building cuts', () => {
		expect(() => make(' ')).toThrow(/Empty text/);
		expect(() => make('♥')).toThrow();
	});
});
