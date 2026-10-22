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
			let rings = glyph.contours.map(ring => ring.map(([u, v]): Point => [u + x, v + row * LEADING]));
			// A letter reaching into the one before (Cinzel's serifs) moves on
			// until they are apart: outlines that cross cannot be woven.
			const shift = overlapShift(placed, rings);
			if (shift > 0) {
				rings = rings.map(ring => ring.map(([u, v]): Point => [u + shift, v]));
				x += shift;
			}
			placed.push(...rings);
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

/** How far right `next` must move to keep half the tracking clear of
 * `before` where their outlines cross; nothing where they do not. Measured
 * in thin horizontal bands, each ring's points taken every hundredth of an
 * em along its sides. */
function overlapShift(before: Ring[], next: Ring[]): number {
	if (!before.length || !next.some(ring => before.some(other => ringsCross(ring, other)))) return 0;
	const band = .01, step = .01;
	const extremes = (rings: Ring[], pick: (a: number, b: number) => number, start: number) => {
		const found = new Map<number, number>();
		for (const ring of rings)
			for (let i = 0; i < ring.length; i++) {
				const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
				const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
				for (let k = 0; k <= n; k++) {
					const u = a[0] + (b[0] - a[0]) * k / n, v = a[1] + (b[1] - a[1]) * k / n, key = Math.floor(v / band);
					found.set(key, pick(found.get(key) ?? start, u));
				}
			}
		return found;
	};
	const right = extremes(before, Math.max, -Infinity), left = extremes(next, Math.min, Infinity);
	let shift = 0;
	for (const [key, u] of left)
		for (const near of [key - 1, key, key + 1]) {
			const v = right.get(near);
			if (v !== undefined) shift = Math.max(shift, v - u + TRACKING / 2);
		}
	return shift;
}

/** Whether two rings' sides cross. */
function ringsCross(a: Ring, b: Ring): boolean {
	const side = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	for (let i = 0; i < a.length; i++) {
		const [p, q] = [a[i], a[(i + 1) % a.length]];
		for (let j = 0; j < b.length; j++) {
			const [r, t] = [b[j], b[(j + 1) % b.length]];
			if (side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0) return true;
		}
	}
	return false;
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
