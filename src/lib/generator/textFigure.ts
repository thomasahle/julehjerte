/**
 * Text frames that are figure frames with the text's outline as the motif:
 * the letters in the checks, which swap the board's squares as a motif does
 * in the figure in the checks, and the circle with a double border, whose
 * medallion holds the letters in the other colour. Shared by the generator
 * and the pictures drawn before the cuts (see `picture`).
 */
import type { GeneratorRequest } from './generate';
import { ConstructionError, type Font, type Point, type Ring, type TextFrame } from './geometry';

/** The text frames made as the figure frame of the same name. */
export const TEXT_FIGURES = ['strips', 'layers'] as const;
export type TextFigure = (typeof TEXT_FIGURES)[number];
export const isTextFigure = (frame: TextFrame | undefined): frame is TextFigure =>
	TEXT_FIGURES.includes(frame as TextFigure);

/** The room between letters and the distance between lines' baselines, in
 * the font's em. */
const TRACKING = .08, LEADING = 1.1;

/** The strips per side the letters in the checks try, in turn, when the
 * visitor has not chosen: the figure in the checks' own four first, then the
 * finer boards, on which the letters cross more lines and fewer of their
 * counters lie alone in a square, and the coarsest last. */
export const TEXT_STRIPS = [4, 5, 6, 3] as const;

const outlines = new WeakMap<Font, Map<string, Ring[]>>();

/** The text's outline as a motif's: each line centred under the one before,
 * its letters at their advances, the whole centred on 0 with its larger side
 * 1. Every letter keeps its glyph's outline, moved and scaled, so the hard
 * letters can be named (see `trickyLetters`). */
export function textOutline(text: string, font: Font): Ring[] {
	const key = text.normalize('NFC');
	let known = outlines.get(font);
	if (!known) outlines.set(font, known = new Map());
	const cached = known.get(key);
	if (cached) return cached;
	const rings: Ring[] = [];
	for (const [row, line] of key.split('\n').entries()) {
		const placed: Ring[] = [];
		let x = 0;
		for (const char of line) {
			const glyph = font.glyphs[char];
			if (!glyph) throw new ConstructionError('character', char);
			placed.push(...glyph.contours.map(ring => ring.map(([u, v]): Point => [u + x, v + row * LEADING])));
			x += glyph.advance + TRACKING;
		}
		const width = x - TRACKING;
		rings.push(...placed.map(ring => ring.map(([u, v]): Point => [u - width / 2, v])));
	}
	const points = rings.flat();
	if (!points.length) throw new ConstructionError('empty', 'Empty text');
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	const size = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
	const outline = rings.map(ring => ring.map(([u, v]): Point => [(u - cx) / size, (v - cy) / size]));
	known.set(key, outline);
	return outline;
}

/** The figure request a text in one of these frames makes: its outline at
 * the figure in the checks' default size, on the board the visitor chose, if
 * any, or in the largest medallion, a little larger than a figure at its
 * default size, keeping the text and font to name the letters that are hard
 * to cut. */
export function textFigureRequest(request: GeneratorRequest): GeneratorRequest {
	if (request.mode !== 'text' || !isTextFigure(request.textFrame) || !request.font)
		throw new ConstructionError('empty', 'Not a text figure');
	const strips = request.textFrame === 'strips';
	return {
		mode: 'figure', name: request.name, colors: request.colors, text: request.text, font: request.font,
		contours: textOutline(request.text ?? '', request.font), style: request.textFrame,
		frame: 'circle', frameSize: strips ? 70 : 80, scale: strips ? .7 : .75, board: strips ? request.board : undefined
	};
}
