/**
 * What a heart will look like before its cuts are found, to draw at once
 * while the visitor tries motifs, frames, sizes and places. A woven heart's
 * picture flips colour across every visible cut, so a frame's picture is its
 * board, its frame and its motif laid over each other: rings whose even-odd
 * fill, in the paper's square (0–100, as the constructions draw it), is where
 * the right sheet shows. The cuts found afterwards (see `generate`) make this
 * picture, or, where the generator had to fall back, the one it shows then.
 * Frames without a picture here return none.
 */
import type { GeneratorRequest } from './generate';
import { arc, frameRing, outerFrame, uprightToSheet, FITTED, SILHOUETTE, WEDGES, type Font, type Point, type Ring } from './geometry';
import { fillSquare, fitCircle } from './frameFit';
import { fittedPicture } from './fitted';
import { normalizeContours } from './contours';
import { STRIPS, boardChecks, placeMotif, placeRange, shifts, slidePlace } from './stripFigure';
import { checkeredLayout, checkeredLetters } from './checkeredGrid';
import { measureTextGrid } from './textGrid';
import { MOTIF, MOTIF_PATTERNS, boardScale } from './boardMotif';

/** The clearest place for each motif and board, where the search starts when
 * its default size's place is not known yet. */
const clearest = new WeakMap<Ring[], Map<number, number>>();

/** A heart's picture; for the figure in the checks, where it puts the motif
 * down the heart's middle, and how far the motif can move and keep its size. */
export type Picture = { rings: Ring[]; place?: number; range?: [number, number] };

/** What a heart already made of the motif in this frame, at its default size,
 * tells the next picture: where the figure in the checks lay, and the board's
 * strips per side. */
export type Known = { place?: number; board?: number };

/** The picture for a request, or none where this frame has none yet, or the
 * generator is known to build this motif differently. */
export function picture(request: GeneratorRequest, known: Known = {}): Picture | undefined {
	try {
		if (request.mode === 'text' && request.textFrame === 'checkered' && request.font)
			return checkered(request.text ?? '', request.font, request.letterScale);
		if (request.mode === 'text' && (request.textFrame === 'woven' || request.textFrame === 'air') && request.font && request.fittedCells === false)
			return woven(request.text ?? '', request.font, request.textFrame === 'air');
		if (request.mode === 'figure' && request.style === 'motifs' && request.contours?.length) {
			// The motif as the one letter of a pattern on the checkerboard,
			// the one its default size chose once that heart is made.
			const contours = normalizeContours(request.contours);
			if (!contours.length) return;
			const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours } } };
			return checkered(MOTIF_PATTERNS[request.layout?.alternative ?? 0], font, boardScale(request));
		}
		if (request.mode === 'figure' && request.style === 'squares' && request.contours?.length && (known.board ?? 3) === 3) {
			// The motif as the one letter of the woven frame, in the centre square
			// of a board of three strips: as the default size chose, up to a
			// tenth larger in it, or in the airy frame (see `frameAlternatives`).
			const contours = normalizeContours(request.contours), alternative = request.layout?.alternative ?? 0;
			if (!contours.length || alternative > 3) return;
			const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours } } };
			return woven(MOTIF, font, alternative === 3, Math.min(1.1, boardScale(request) * [1, 1.05, 1.1, 1][alternative]));
		}
		if (request.mode === 'figure' && request.style === 'strips') return stripsPicture(request, known.place);
		// A motif that needs panels gets a finer board, which crosses the
		// corners its frame turns over with more stripes.
		if (request.mode === 'figure' && (request.style === 'rays' || request.style === 'check') && (known.board ?? 3) === 3)
			return circlePicture(request);
		if (request.mode === 'figure' && (request.style === 'wedges' || request.style === 'fitted' || request.style === 'silhouette') && request.contours?.length
			&& (known.board ?? (request.style === 'fitted' ? 5 : 3)) === (request.style === 'fitted' ? 5 : 3)) {
			// The open frames' legs, as their first construction draws them, on
			// its board: three strips, five with the fitted frame's outer strips.
			const sized = fillSquare(request), frame = { wedges: WEDGES, fitted: FITTED, silhouette: SILHOUETTE }[request.style];
			const rings = fittedPicture(normalizeContours(request.contours), sized.frameSize ?? 70, sized.scale ?? .7, { ...frame, gap: request.gap ?? frame.gap });
			return rings.length ? { rings } : undefined;
		}
	} catch {
		// A character the font lacks, say: the generator reports it.
	}
}

/** Letters on the alternate squares of a checkerboard, every letter at the
 * size of the widest, which fills its square (see `generateCheckeredGrid`). */
function checkered(text: string, font: Font, letterScale = 1): Picture {
	const { matrix } = checkeredLayout(text, 0), n = matrix.length, cell = 100 / n;
	const letter = checkeredLetters(matrix, font, .82 * letterScale), rings: Ring[] = [];
	for (let row = 0; row < n; row++)
		for (let col = 0; col < n; col++) {
			if ((row + col) % 2) rings.push([[col * cell, row * cell], [(col + 1) * cell, row * cell], [(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
			const char = matrix[row][col];
			if (char !== undefined) rings.push(...letter(char, row, col));
		}
	return { rings };
}

/** A circle frame with rays or checks on its usual board of three strips: the
 * motif in its circle, and the four corners its frame's cuts turn over (see
 * `outerFrame`). A motif that needs panels or a finer board can differ. */
function circlePicture(request: GeneratorRequest): Picture | undefined {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) return;
	const fitted = fitCircle(request), size = fitted.frameSize ?? 70, scale = fitted.scale ?? .7;
	const frame = frameRing(request.frame ?? 'circle', size), style = request.style === 'check' ? 'check' : 'rays';
	const motif = contours.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const corner = (angle: number): Point => [50 + 50 * Math.sign(Math.cos(angle)), 50 + 50 * Math.sign(Math.sin(angle))];
	const corners = outerFrame([], frame, [0, 1, 2, 3], style).map(gate =>
		[gate.lp, ...arc(frame, gate.low, gate.high), gate.hp, corner(gate.angle)]);
	return { rings: [...motif, ...corners] };
}

/** Letters in square cells on the regular checkerboard of the woven and airy
 * frames (see `generateTextGrid`): a board of columns + rows + 1 strips,
 * every cell a diamond around one of its squares that reaches the centres of
 * the four beside it, the checks cleared inside it and its letter drawn. */
function woven(text: string, font: Font, air: boolean, letterScale = 1): Picture {
	const { matrix, rows, cols, cy, cellHeight, widths, span, fullHeight, scale } = measureTextGrid(text, font, air, undefined, { fittedCells: false });
	const n = cols + rows + 1, side = 100 / n, rings: Ring[] = [];
	const square = (i: number, j: number): Ring => [[i * side, j * side], [(i + 1) * side, j * side], [(i + 1) * side, (j + 1) * side], [i * side, (j + 1) * side]];
	// Every cell lies on a square of one parity, which is dark.
	const dark = (i: number, j: number) => (i + j + cols + 1) % 2 === 0;
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (dark(i, j)) rings.push(square(i, j));
	for (let row = 0; row < rows; row++) {
		let cursor = -span / 2;
		for (let col = 0; col < cols; col++) {
			const { glyph } = matrix[row][col];
			const x = (cursor + widths[col] / 2) * scale, y = (-fullHeight / 2 + (row + .5) * cellHeight) * scale;
			cursor += widths[col];
			if (!glyph.contours.length) continue;
			const [cx0, cy0] = uprightToSheet([x, y]), i = Math.floor(cx0 / side), j = Math.floor(cy0 / side);
			// The dark parts of the cell turn back: its own square, or the four
			// quarters of the squares beside it.
			if (dark(i, j)) rings.push(square(i, j));
			else for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
				const mid: Point = [cx0 + dx * side / 2, cy0 + dy * side / 2];
				rings.push([[mid[0] - dy * side / 2, mid[1] - dx * side / 2], [mid[0] + dy * side / 2, mid[1] + dx * side / 2], [cx0 + dx * side, cy0 + dy * side]]);
			}
			const xs = glyph.contours.flat().map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			rings.push(...glyph.contours.map(ring => ring.map(([px, py]) => uprightToSheet([x + (px - cx) * scale * letterScale, y + (py - cy) * scale * letterScale]))));
		}
	}
	return { rings };
}

/** The figure in the checks: its board, and the motif at its place. */
function stripsPicture(request: GeneratorRequest, place?: number): Picture | undefined {
	if (!request.contours?.length) return;
	const rings = normalizeContours(request.contours), strips = request.board ?? STRIPS, scale = request.scale ?? .7;
	if (!rings.length) return;
	let guesses = clearest.get(request.contours);
	if (!guesses) clearest.set(request.contours, guesses = new Map());
	if (place === undefined && request.place === undefined && !guesses.has(strips)) guesses.set(strips, shifts(rings, strips, .7)[0]);
	const at = request.place ?? slidePlace(rings, scale, place ?? guesses.get(strips)!);
	return { rings: [...placeMotif(rings, scale, at), ...boardChecks(strips)], place: at, range: placeRange(rings, scale) };
}
