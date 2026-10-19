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
import type { Font, Ring } from './geometry';
import { normalizeContours } from './contours';
import { STRIPS, boardChecks, placeMotif, placeRange, shifts, slidePlace } from './stripFigure';
import { checkeredLayout, checkeredLetters } from './checkeredGrid';
import { MOTIF, MOTIF_PATTERNS, boardScale } from './boardMotif';

/** The clearest place for each motif and board, where the search starts when
 * its default size's place is not known yet. */
const clearest = new WeakMap<Ring[], Map<number, number>>();

/** A heart's picture; for the figure in the checks, where it puts the motif
 * down the heart's middle, and how far the motif can move and keep its size. */
export type Picture = { rings: Ring[]; place?: number; range?: [number, number] };

/** The picture for a request. `place` is where the figure in the checks lay
 * at its default size, when that heart has been made. */
export function picture(request: GeneratorRequest, place?: number): Picture | undefined {
	try {
		if (request.mode === 'text' && request.textFrame === 'checkered' && request.font)
			return checkered(request.text ?? '', request.font, request.letterScale);
		if (request.mode === 'figure' && request.style === 'motifs' && request.contours?.length) {
			// The motif as the one letter of a pattern on the checkerboard,
			// the one its default size chose once that heart is made.
			const contours = normalizeContours(request.contours);
			if (!contours.length) return;
			const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours } } };
			return checkered(MOTIF_PATTERNS[request.layout?.alternative ?? 0], font, boardScale(request));
		}
		if (request.mode === 'figure' && request.style === 'strips') return stripsPicture(request, place);
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
