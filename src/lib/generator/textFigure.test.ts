import { describe, expect, it } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate, type GeneratorRequest, type GeneratorResult } from './generate';
import { picture } from './picture';
import { geometryKey } from './cache';
import { defaults, readGeneratorState, stripCount } from './state';
import { TEXT_TEMPLATES } from './templates';
import { TEXT_FIGURES, textFigureRequest, textOutline } from './textFigure';
import { ConstructionError, inside, type Font, type Ring } from './geometry';
import { rasterizeDesign } from '$lib/paint/rasterize';
import nunito from '../../../static/generator/fonts/nunito.json';
import josefinsans from '../../../static/generator/fonts/josefinsans.json';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import { stripFigures, withCrowdedHiddenCuts } from './stripFigure';

const colors = { left: '#ffffff', right: '#cc0000' };
const fonts = { nunito: nunito as unknown as Font, josefinsans: josefinsans as unknown as Font, cinzel: cinzel as unknown as Font };
const text = (value: string, textFrame: 'strips' | 'layers', font = fonts.nunito, board?: number): GeneratorRequest =>
	({ mode: 'text', name: value, text: value, font, textFrame, colors, board });

/** The share of the square where the picture and the finished heart differ,
 * the picture knowing where the heart put the letters and on which board. */
function mismatch(request: GeneratorRequest, result: GeneratorResult, n = 100): number {
	const mask = rasterizeDesign(result.design, n).data;
	const { rings } = picture(request, { place: result.place, board: result.design.gridSize.x })!;
	let differ = 0;
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const p: [number, number] = [(x + .5) * 100 / n, (y + .5) * 100 / n];
			if (rings.reduce((odd, ring) => odd ^ Number(inside(p, ring as Ring)), 0) !== mask[y * n + x]) differ++;
		}
	return differ / n / n;
}

describe('text in a figure frame', () => {
	it('lays the text out as a motif, every glyph moved and scaled', () => {
		const rings = textOutline('GOD\nJUL', fonts.nunito), points = rings.flat();
		const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
		// Centred on 0, its larger side 1, as the motif files are.
		expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 9);
		expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 9);
		expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeCloseTo(1, 9);
		// The glyphs' own contours in order, the second line under the first.
		const glyphs = [...'GODJUL'].map(char => fonts.nunito.glyphs[char].contours);
		expect(rings.map(ring => ring.length)).toEqual(glyphs.flat().map(ring => ring.length));
		const lines = [rings.slice(0, glyphs.slice(0, 3).flat().length), rings.slice(glyphs.slice(0, 3).flat().length)];
		const [top, bottom] = lines.map(line => line.flat().map(p => p[1]));
		expect(Math.max(...top)).toBeLessThan(Math.min(...bottom));
		// Each line centred.
		for (const line of lines) {
			const lx = line.flat().map(p => p[0]);
			expect(Math.abs(Math.max(...lx) + Math.min(...lx))).toBeLessThan(.02);
		}
		// One outline per text and font, for the pictures' caches.
		expect(textOutline('GOD\nJUL', fonts.nunito)).toBe(rings);
		expect(() => textOutline('JUL☃', fonts.nunito)).toThrow(ConstructionError);
		expect(() => textOutline(' \n ', fonts.nunito)).toThrow(ConstructionError);
	});

	it('offers the letters in the checks and the medallion, the first on the strips the visitor chooses', () => {
		expect(TEXT_TEMPLATES.map(t => t.id).slice(-2)).toEqual([...TEXT_FIGURES]);
		const state = { ...defaults, mode: 'text' as const };
		for (const textFrame of TEXT_FIGURES)
			expect(readGeneratorState('#make=' + JSON.stringify({ ...state, textFrame })).textFrame).toBe(textFrame);
		const checks = { ...state, textFrame: 'strips' as const };
		// The frame chooses until the visitor does, within the figure in the
		// checks' three to six strips.
		expect(stripCount(checks)).toBeUndefined();
		expect(stripCount({ ...checks, board: 5 })).toBe(5);
		expect(stripCount({ ...checks, board: 9 })).toBe(6);
		expect(geometryKey({ ...checks, board: 5 })).not.toBe(geometryKey(checks));
		// The other text frames have no strips to choose.
		for (const textFrame of ['layers', 'woven', 'circle'] as const) {
			expect(stripCount({ ...state, textFrame, board: 5 })).toBeUndefined();
			expect(geometryKey({ ...state, textFrame, board: 5 })).toBe(geometryKey({ ...state, textFrame }));
		}
		// The figure in the checks takes the text's outline at its default
		// size; the medallion is the largest a figure's can be.
		expect(textFigureRequest(text('JUL', 'strips', fonts.nunito, 5))).toMatchObject({ mode: 'figure', style: 'strips', scale: .7, board: 5 });
		expect(textFigureRequest(text('JUL', 'layers', fonts.nunito, 5))).toMatchObject({ mode: 'figure', style: 'layers', frameSize: 80, board: undefined });
	});

	it('swaps the checks inside the letters, as its picture shows', () => {
		const request = text('JUL', 'strips', fonts.josefinsans, 4), result = generate(request);
		expect(result.design.gridSize).toEqual({ x: 4, y: 4 });
		expect(result.hardToCut).toBeUndefined();
		expect(mismatch(request, result)).toBeLessThan(.01);
	});

	it('sets the letters in the medallion, in the other colour, as its picture shows', () => {
		const request = text('JUL', 'layers'), result = generate(request);
		expect(result.design.gridSize).toEqual({ x: 7, y: 7 });
		expect(result.hardToCut).toBeUndefined();
		expect(mismatch(request, result)).toBeLessThan(.01);
	});

	slow('chooses the strips that cut cleanly until the visitor chooses, and keeps theirs', () => {
		// On four strips NOEL's O passes close to a line; five cut cleanly.
		const chosen = generate(text('NOEL', 'strips', fonts.josefinsans));
		expect(chosen.hardToCut).toBeUndefined();
		expect(chosen.design.gridSize).toEqual({ x: 5, y: 5 });
		const kept = generate(text('NOEL', 'strips', fonts.josefinsans, 4));
		expect(kept.design.gridSize).toEqual({ x: 4, y: 4 });
		expect(kept.hardToCut?.letters.length).toBeGreaterThan(0);
	});

	it('cuts hidden cuts that come too close rather than refuse the letters, as a last resort', () => {
		// In Cinzel's ANNA some hidden cuts across one square must crowd each
		// other on four strips: no sheets keep every strip whole without them.
		const rings = textOutline('ANNA', fonts.cinzel);
		expect(stripFigures(rings, 4, .7).next().done).toBe(true);
		expect(withCrowdedHiddenCuts(() => stripFigures(rings, 4, .7).next().done)).toBe(false);
	});

	slow('names the letters that are hard to cut in the checks', () => {
		const { hardToCut } = generate(text('Søren', 'strips', fonts.nunito, 4));
		expect(hardToCut?.letters).toContain('ø');
	});
});
