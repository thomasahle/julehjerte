import { FIGURE_STYLES, FRAMES, type FigureStyle, type Frame, type TextFrame } from './geometry';
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
	/** The strips per side of the figure in the checks' board. */
	strips: number;
	/** Where the visitor dragged the figure in the checks, how far down the
	 * heart's middle; absent, its default size chooses. */
	place?: number;
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
/** The strips per side a state asks of the figure in the checks' board. */
export function stripCount(s: GeneratorState): number | undefined {
	return s.mode === 'figure' && s.style === 'strips' ? s.strips : undefined;
}
/** How far the figure in the checks can be dragged up or down the middle. */
export const PLACE_RANGE = 30;
/** Where a state puts the figure in the checks, if the visitor chose. */
export function stripPlace(s: GeneratorState): number | undefined {
	return s.mode === 'figure' && s.style === 'strips' ? s.place : undefined;
}
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
		if (['diamond', 'hexagon', 'oval', 'rounded', 'scalloped'].includes(raw.textFrame)) raw.textFrame = 'circle';
		// The circle with a plain edge was removed: it mostly repeated the rays or the checks.
		if (raw.style === 'plain') raw.style = 'rays';
		for (const [k, allowed] of Object.entries<readonly string[]>({
			mode: ['start', 'figure', 'text'],
			font: ['nunito', 'breeserif', 'oswald', 'kalam', 'cinzel', 'righteous'],
			frame: [...FRAMES],
			style: [...FIGURE_STYLES],
			textFrame: ['woven', 'air', 'checkered', ...FRAMES],
			cells: [...CELLS]
		}))
			if (allowed.includes(raw[k])) Object.assign(s, { [k]: raw[k] });
		if (typeof raw.text === 'string') s.text = normalizeText(raw.text);
		if (typeof raw.motif === 'string' && /^[a-z0-9-]{1,80}$/.test(raw.motif))
			s.motif = raw.motif;
		if (typeof raw.place === 'number' && Number.isFinite(raw.place))
			s.place = Math.round(Math.max(-PLACE_RANGE, Math.min(PLACE_RANGE, raw.place)) * 4) / 4;
		for (const [k, min, max] of [
			['frameSize', 50, 80],
			['scale', 45, largestScale(s.style)],
			['spacing', 0, 15],
			['strips', 3, 6]
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
