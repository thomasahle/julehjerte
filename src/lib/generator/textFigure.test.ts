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
import { arrangement, placeMotif, stripFigures, withCrowdedHiddenCuts } from './stripFigure';
import { shippedFont } from './fonts.test-helpers';
import { normalizeContours } from './contours';

const [nunito, josefinsans, cinzel, kalam] = await Promise.all(['nunito', 'josefinsans', 'cinzel', 'kalam'].map(shippedFont));

const colors = { left: '#ffffff', right: '#cc0000' };
const fonts = { nunito: nunito as unknown as Font, josefinsans: josefinsans as unknown as Font, cinzel: cinzel as unknown as Font, kalam: kalam as unknown as Font };
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

	it('keeps hidden cuts that only come too close to the cuts around them as a last resort', () => {
		// In a long word, letters share squares and the cuts that join each to
		// the board come near the next letter.
		const placed = placeMotif(textOutline('JULEMAND', fonts.cinzel), .7, 0);
		const normal = arrangement(placed, 4, 'motif'), crowded = withCrowdedHiddenCuts(() => arrangement(placed, 4, 'motif'));
		if (normal === 'degenerate' || crowded === 'degenerate') throw Error('degenerate');
		expect(normal.crowdedLeftOut).toBe(true);
		expect(crowded.pieces.length).toBeGreaterThan(normal.pieces.length);
	});

	it('lets two hidden cuts leave one corner of an outline', () => {
		// In Kalam's ANNA on four strips, crowded hidden cuts are let stand and
		// two meet the outline at one corner: the piece between is that point.
		const rings = normalizeContours(textOutline('ANNA', fonts.kalam));
		expect(() => withCrowdedHiddenCuts(() => stripFigures(rings, 4, .7).next())).not.toThrow();
	});

	it('moves a letter reaching into the one before until they are apart', () => {
		// Cinzel's serifs cross their neighbours' at the usual tracking.
		const crossing = (rings: Ring[]) => rings.some((a, i) => rings.some((b, j) => j > i && a.some((p, k) => {
			const q = a[(k + 1) % a.length];
			return b.some((r, m) => {
				const t = b[(m + 1) % b.length], side = (u: number[], v: number[], w: number[]) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
				return side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
			});
		})));
		expect(crossing(textOutline('EMMA', fonts.cinzel))).toBe(false);
		expect(textOutline('EMMA', fonts.cinzel).length).toBe(5);
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
		// In Cinzel's FAR some hidden cuts across one square must crowd each
		// other on four strips: no sheets keep every strip whole without them,
		// at the place its heart takes or any other.
		const rings = textOutline('FAR', fonts.cinzel), at = () => stripFigures(rings, 4, .7, 4000, .75, 'alone').next().done;
		expect(at()).toBe(true);
		expect(withCrowdedHiddenCuts(at)).toBe(false);
	});

	slow('weaves a long word no board up to six strips can on a finer one, rather than refuse it', () => {
		// KÆRLIGHED in Kalam leaves no sheets that keep every strip whole on
		// three to six strips; eight do.
		const { design } = generate(text('KÆRLIGHED', 'strips', fonts.kalam));
		expect(design.gridSize.x).toBeGreaterThan(6);
	}, 120000);
	slow('names the letters that are hard to cut in the checks', () => {
		const { hardToCut } = generate(text('Søren', 'strips', fonts.nunito, 4));
		expect(hardToCut?.letters).toContain('ø');
	});
});
