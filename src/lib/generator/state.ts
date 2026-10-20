import { FIGURE_STYLES, FRAMES, type FigureStyle, type Frame, type TextFrame } from './geometry';
import { BOARD_STRIPS, type BoardStyle } from './boardMotif';
import { TEXT_FIGURES } from './textFigure';
import { isGoogleFont } from './googleFonts';
export type GeneratorState = {
	mode: 'start' | 'figure' | 'text';
	motif: string;
	text: string;
	font: string;
	frame: Frame;
	frameSize: number;
	scale: number;
	style: FigureStyle;
	textFrame: TextFrame;
	cells: Cells;
	/** The space between the motif and the frame around it, in percent of the
	 * square: to the circle, the wedges' tips, the corner checks. */
	spacing: number;
	/** The space around each letter in its cell, beside and above it, in
	 * percent of the letters' height (see `textRoom`). */
	room: number;
	/** The strips per side of the figure in the checks' board. */
	strips: number;
	/** The strips per side the visitor chose for the small motifs or the
	 * equal squares; absent, the frame chooses (see `stripCount`). */
	board?: number;
	/** Where the visitor dragged the figure in the checks: how far down the
	 * heart's middle, and how far across it; absent, its default size
	 * chooses, on the middle. */
	place?: number;
	side?: number;
};
/** Text cells: square, so every check around the letters is a square of one
 * size, or fitted to the letters, so they can be larger. Only the frames whose
 * checks follow the cells offer the choice; the circle's outer checks follow
 * its ring, and the checkerboard's squares are the letters' own. */
export const CELLS = ['square', 'letters'] as const;
export type Cells = (typeof CELLS)[number];
export const CELL_FRAMES: readonly TextFrame[] = ['woven', 'air'];
/** Frames whose squares hold the motif, so they fix the space around it, and
 * the figure in the checks, which lies on its board. The circle on a board
 * takes a space within the radii the board allows. */
export const BOARD_STYLES: readonly FigureStyle[] = ['motifs', 'squares', 'strips'];
/** The frames whose space around the motif the visitor sets: the circle's
 * distance from it, or the legs' of a frame without a centre panel. */
export const SPACED_STYLES: readonly FigureStyle[] = FIGURE_STYLES.filter(style => !BOARD_STYLES.includes(style));
/** The frames that take the motif to 100%: the figure in the checks to the
 * paper's edge, the others as far as their frame leaves room, hard to cut
 * where they must be. The silhouette and the circle on a board are as large as
 * the square and the board allow at 85%, and a motif on squares fills its
 * square before that; the sunburst, layers and corner checks cannot yet build
 * every motif larger. */
const FULL_SIZE: readonly FigureStyle[] = ['rays', 'check', 'wedges', 'fitted', 'strips'];
/** The largest size a frame takes the motif to. */
export const largestScale = (style: FigureStyle) => FULL_SIZE.includes(style) ? 100 : 85;
/** The space a state asks between the motif and its frame, where it has one. */
export function frameGap(s: GeneratorState): number | undefined {
	return s.mode === 'figure' && SPACED_STYLES.includes(s.style) ? s.spacing : undefined;
}
/** The strips per side a state asks of a frame on a board, the nearest the
 * frame offers below it (see `BOARD_STRIPS`); none for other frames, or
 * where the frame chooses. The letters in the checks offer the figure in the
 * checks' strips, and choose until the visitor does. */
export function stripCount(s: GeneratorState): number | undefined {
	const style = s.mode === 'figure' ? s.style : s.mode === 'text' && s.textFrame === 'strips' ? s.textFrame : undefined;
	const strips = s.mode === 'figure' && s.style === 'strips' ? s.strips : s.board;
	if (!style || !(style in BOARD_STRIPS) || strips === undefined) return;
	const { min, max, step } = BOARD_STRIPS[style as BoardStyle];
	return Math.max(min, Math.min(max, min + step * Math.floor((strips - min) / step)));
}
/** No place or side of the figure in the checks lies farther out than the
 * paper reaches. */
export const PLACE_RANGE = 66;
/** Where a state puts the figure in the checks, if the visitor chose. */
export function stripPlace(s: GeneratorState): number | undefined {
	return s.mode === 'figure' && s.style === 'strips' ? s.place : undefined;
}
export function stripSide(s: GeneratorState): number | undefined {
	return s.mode === 'figure' && s.style === 'strips' ? s.side : undefined;
}
/** The room a state asks around each letter in its cell, as a fraction of
 * the letters' height (see `roomOf`), where its frame's checks follow the
 * cells: the woven frame's own 0.22 at 11%, what the airy frame had, 0.5, at
 * 25%. */
export function textRoom(s: GeneratorState): number | undefined {
	return s.mode === 'text' && CELL_FRAMES.includes(s.textFrame) ? s.room / 50 : undefined;
}
/** The space around the text the slider offers. */
export const ROOM_RANGE = [5, 35] as const;
/** The generator's choice of cells for a state, or none where it decides. */
export function fittedCells(s: GeneratorState): boolean | undefined {
	return s.mode === 'text' && CELL_FRAMES.includes(s.textFrame) ? s.cells === 'letters' : undefined;
}
export const defaults: GeneratorState = {
	mode: 'start',
	motif: 'star',
	text: 'JUL',
	font: 'nunito',
	frame: 'circle',
	frameSize: 70,
	scale: 70,
	style: 'rays',
	textFrame: 'woven',
	cells: 'square',
	spacing: 3,
	room: 11,
	strips: 4
};
export function readGeneratorState(hash: string): GeneratorState {
	const s = { ...defaults };
	try {
		const raw = JSON.parse(
			new URLSearchParams(hash.replace(/^#/, '')).get('make') ?? ''
		);
		// Older links name the checkerboard by its former repeating layout,
		// and text panels by centre shapes the generator no longer draws.
		if (raw.textFrame === 'repeat-check') raw.textFrame = 'checkered';
		// The airy frame became the woven frame with more space around the text.
		if (raw.textFrame === 'air') {
			raw.textFrame = 'woven';
			raw.room ??= 25;
		}
		if (['diamond', 'hexagon', 'oval', 'rounded', 'scalloped'].includes(raw.textFrame)) raw.textFrame = 'circle';
		// The circle with a plain edge was removed: it mostly repeated the rays or the checks.
		if (raw.style === 'plain') raw.style = 'rays';
		for (const [k, allowed] of Object.entries<readonly string[]>({
			mode: ['start', 'figure', 'text'],
			font: ['nunito', 'breeserif', 'oswald', 'kalam', 'cinzel', 'righteous', 'josefinsans', 'alfaslabone', 'bungee'],
			frame: [...FRAMES],
			style: [...FIGURE_STYLES],
			textFrame: ['woven', 'air', 'checkered', ...FRAMES, ...TEXT_FIGURES],
			cells: [...CELLS]
		}))
			if (allowed.includes(raw[k])) Object.assign(s, { [k]: raw[k] });
		if (typeof raw.font === 'string' && isGoogleFont(raw.font)) s.font = raw.font;
		if (typeof raw.text === 'string') s.text = normalizeText(raw.text);
		if (typeof raw.motif === 'string' && /^[a-z0-9-]{1,80}$/.test(raw.motif))
			s.motif = raw.motif;
		// A side only with the place down the middle it moves across from.
		for (const k of ['place', 'side'] as const)
			if (typeof raw[k] === 'number' && Number.isFinite(raw[k]) && (k === 'place' || s.place !== undefined))
				s[k] = Math.round(Math.max(-PLACE_RANGE, Math.min(PLACE_RANGE, raw[k])) * 8) / 8;
		for (const [k, min, max] of [
			['frameSize', 50, 80],
			['scale', 45, largestScale(s.style)],
			['spacing', 0, 15],
			['room', ...ROOM_RANGE],
			['strips', 3, 6],
			['board', 2, 9]
		] as const)
			if (typeof raw[k] === 'number' && Number.isFinite(raw[k]))
				Object.assign(s, {
					[k]: Math.max(min, Math.min(max, Math.round(raw[k])))
				});
	} catch {
		/* An absent or malformed link starts a fresh heart. */
	}
	return s;
}

/** The longest text the generator takes: lines, and characters per line. */
export const TEXT_LINES = 6, TEXT_LINE_LENGTH = 10;

export function normalizeText(text: string): string {
	return text
		.normalize('NFC')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.slice(0, TEXT_LINES)
		.map((line) => [...line].slice(0, TEXT_LINE_LENGTH).join(''))
		.join('\n');
}
