import { it, expect } from 'vitest';
import { generateTextGrid, squareCellScale } from './textGrid';
import { generateCheckedText, type Font } from './geometry';
import { generate, type GeneratorRequest } from './generate';
import { defaults, fittedCells, readGeneratorState, textRoom } from './state';
import { TEXT_TEMPLATES, templateVariants } from './templates';
import { geometryKey } from './cache';
import nunito from '../../../static/generator/fonts/nunito.json';

const font = nunito as unknown as Font;
// Where the cuts reaching the paper's top edges meet it, in order.
const topEdge = (edges: ReturnType<typeof generateTextGrid>['edges']) => edges
	.flatMap(e => [e.from, e.to]).filter(p => p[1] === 0 && p[0] > 0 && p[0] < 100)
	.map(p => p[0]).sort((a, b) => a - b);
const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);

it('keeps every check of the weave around the letters square', () => {
	for (const layout of [
		generateTextGrid('J\nUL\nL', font, false),
		generateTextGrid('ANNA\nBO', font, true),
		generateCheckedText('WILLIAM', font, false)
	]) {
		const steps = gaps(topEdge(layout.edges));
		expect(steps.length).toBeGreaterThan(3);
		// A row's cells follow each glyph's own height by a few thousandths.
		for (const step of steps) expect(step).toBeCloseTo(steps[0], 1);
	}
});

it('fits cells to the letters as the fallback when square cells leave too little paper', () => {
	const steps = gaps(topEdge(generateCheckedText('WILLIAM', font, false, undefined, true).edges));
	expect(Math.max(...steps) - Math.min(...steps)).toBeGreaterThan(1);
});

it('measures how much smaller square cells make narrow letters', () => {
	// Letters of similar widths lose little; i, l and j would leave gaps.
	expect(squareCellScale('ANNA', font)).toBeGreaterThan(.9);
	expect(squareCellScale('J\nUL\nL', font)).toBeGreaterThan(.9);
	expect(squareCellScale('William', font)).toBeLessThan(.6);
	expect(squareCellScale('JUL', font)).toBeLessThan(.85);
});

it('offers square and letter-sized cells as a pair, with a slider for the space around the text', () => {
	expect(TEXT_TEMPLATES.map(t => t.id)).toEqual(['woven-square', 'woven-letters', 'checkered', 'circle']);
	const state = { ...defaults, mode: 'text' as const };
	expect(state.cells).toBe('square');
	expect(readGeneratorState('#make=' + JSON.stringify({ ...state, cells: 'letters' })).cells).toBe('letters');
	expect(readGeneratorState('#make=' + JSON.stringify({ ...state, cells: 'round' })).cells).toBe('square');
	expect(geometryKey({ ...state, cells: 'letters' })).not.toBe(geometryKey(state));
	// The circle and the checkerboard do not depend on the choice.
	for (const textFrame of ['circle', 'checkered'] as const) {
		expect(geometryKey({ ...state, textFrame, cells: 'letters' })).toBe(geometryKey({ ...state, textFrame }));
		expect(fittedCells({ ...state, textFrame })).toBeUndefined();
	}
	expect(templateVariants(state).find(v => v.id === 'woven-letters')?.state).toEqual({ ...state, cells: 'letters' });
	// The space around the letters: the woven frame's own by default, the
	// former airy frame's in its older links.
	expect(textRoom(state)).toBeCloseTo(.22, 9);
	const { room: _, ...older } = state;
	const airy = readGeneratorState('#make=' + JSON.stringify({ ...older, textFrame: 'air' }));
	expect([airy.textFrame, textRoom(airy)]).toEqual(['woven', .5]);
	expect(readGeneratorState('#make=' + JSON.stringify({ ...state, room: 90 })).room).toBe(35);
	expect(geometryKey({ ...state, room: 20 })).not.toBe(geometryKey(state));
	for (const textFrame of ['circle', 'checkered'] as const) {
		expect(geometryKey({ ...state, textFrame, room: 20 })).toBe(geometryKey({ ...state, textFrame }));
		expect(textRoom({ ...state, textFrame })).toBeUndefined();
	}
});

it('weaves the space around the text the visitor sets, the former airy frame at 25%', () => {
	const colors = { left: '#fffdf5', right: '#b72f2b' };
	const cuts = (request: Partial<GeneratorRequest>) => JSON.stringify(generate({
		mode: 'text', name: 'KIM', text: 'KIM', font, colors, textFrame: 'woven', fittedCells: false, ...request }).design.fingers);
	expect(cuts({ room: .5 })).toBe(cuts({ textFrame: 'air' }));
	expect(cuts({ room: .22 })).toBe(cuts({}));
	expect(cuts({ room: .35 })).not.toBe(cuts({}));
});

it('weaves the chosen kind of cells, even where the automatic choice differs', () => {
	const colors = { left: '#fffdf5', right: '#b72f2b' };
	const cuts = (fittedCells?: boolean) => JSON.stringify(generate({
		mode: 'text', name: 'William', text: 'William', font, colors, textFrame: 'woven', fittedCells }).design.fingers);
	// Square cells would make William's letters about half their fitted size.
	const fitted = cuts(true);
	expect(cuts()).toBe(fitted);
	expect(cuts(false)).not.toBe(fitted);
}, 40000);

it('lays square cells on a regular board, as in Brodal’s hearts', () => {
	// Every straight cut of the weave around the letters lies on a line of an
	// n × n board, so every strip, the outer ones too, is equally wide.
	const onBoard = ({ edges, geometry }: Pick<ReturnType<typeof generateTextGrid>, 'edges' | 'geometry'>) => {
		const n = geometry.A_overlap_paths.length + 1;
		for (const e of edges.filter(e => e.kind === 'frame')) for (const axis of [0, 1])
			if (Math.abs(e.from[axis] - e.to[axis]) < 1e-9) {
				const k = e.from[axis] / (100 / n);
				expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
			}
		return n;
	};
	// One line of k characters, spaces included, on the middle row of k + 2 strips.
	expect(onBoard(generateCheckedText('amy', font, false))).toBe(5);
	expect(onBoard(generateCheckedText('GOD JUL', font, false))).toBe(9);
	// A block of rows × columns cells on columns + rows + 1 strips.
	expect(onBoard(generateTextGrid('J\nUL\nL', font, false))).toBe(6);
	expect(onBoard(generateTextGrid('ANNA', font, true))).toBe(6);
	// Letter-sized cells are larger instead, and their board is not regular.
	expect(() => onBoard(generateCheckedText('William', font, false, undefined, true))).toThrow();
});

it('weaves the geometric, poster and block fonts, with every letter the generator takes', async () => {
	const colors = { left: '#fffdf5', right: '#b72f2b' };
	for (const id of ['josefinsans', 'alfaslabone', 'bungee']) {
		const added = (await import(`../../../static/generator/fonts/${id}.json`)).default as Font;
		for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÆØÅæøå0123456789+-&.! ')
			expect(added.glyphs[char], `${id} ${char}`).toBeDefined();
		const { hardToCut } = generate({ mode: 'text', name: 'JUL', text: 'JUL', font: added, colors, textFrame: 'woven', fittedCells: false });
		expect(hardToCut, id).toBeUndefined();
	}
});
