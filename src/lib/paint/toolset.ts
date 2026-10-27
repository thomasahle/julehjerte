/**
 * The seven painting tools, brush radius and head, and the keys that pick them.
 *
 * `tools.ts` says what an operation does to the cells; this says which of them
 * the visitor has chosen and what a keystroke means. It is plain data and one
 * pure function, so the key table can be read and tested in one place instead of
 * being spelled out inside a keydown handler.
 */

export type PaintTool = 'pen' | 'fill' | 'line' | 'rect' | 'ellipse' | 'smudge' | 'select';

/** The tools that paint with the brush, its head and its size: the others have no use for them. */
export const BRUSH_TOOLS: readonly PaintTool[] = ['pen', 'line', 'smudge'];

/**
 * The brush's head, named by how it looks on the drawing (see `brushHead.ts`):
 * a disc; a square along the strips (a diamond on screen); a square across
 * them (upright on screen); a flat nib for thick and thin strokes.
 */
export type BrushShape = 'round' | 'square' | 'diamond' | 'chisel';

/** The heads in the order the panel offers them. */
export const BRUSH_SHAPES: readonly BrushShape[] = ['round', 'square', 'diamond', 'chisel'];

/**
 * What Udtvær does to the paper under it: drags it along with the pointer, turns
 * it about the brush (a hvirvel), swells it out from there (a glaskuppel), or
 * draws it in, as Bul backwards. Alt reverses the turn, the swell and the draw.
 */
export type SmudgeMode = 'push' | 'twirl' | 'bulge' | 'shrink';

/** XOR is an editing action; the mask still contains only paper 0 and paper 1. */
export type PaintValue = 0 | 1 | 'xor';

/**
 * Brush radius in mask cells, shared by the slider and keyboard shortcuts: up
 * to half the mask, as Udtvær's, so one dab can cover a lobe.
 */
export type BrushSize = number;
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 200;
export const DEFAULT_BRUSH_SIZE = 6;

export function clampBrush(size: number): BrushSize {
	return Number.isFinite(size)
		? Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size)))
		: DEFAULT_BRUSH_SIZE;
}

/**
 * The brush one step bigger or smaller, stopping at both ends: a cell at a
 * time while it is fine, about a tenth of its size once it is broad.
 */
export function stepBrush(current: BrushSize, delta: number): BrushSize {
	return clampBrush(current + delta * Math.max(1, Math.round(current / 10)));
}

/**
 * The size slider's positions. A size grows by the same ratio for each step
 * along it, so a pen of 2 is as easy to set as one of 150.
 */
export const SIZE_SLIDER_STEPS = 1000;

/** Where a size sits on a slider from `min` to `max`. */
export function sliderOfSize(size: number, min: number, max: number): number {
	return Math.round(SIZE_SLIDER_STEPS * Math.log(Math.max(min, Math.min(max, size)) / min) / Math.log(max / min));
}

/** The size at a slider position, whole cells. */
export function sizeOfSlider(position: number, min: number, max: number): number {
	return Math.round(min * (max / min) ** (Math.max(0, Math.min(SIZE_SLIDER_STEPS, position)) / SIZE_SLIDER_STEPS));
}

/**
 * Udtvær's own radius, in cells: a hvirvel turns most of the square at once, so
 * it reaches much further than a pen, and keeps its size apart from the pen's.
 */
export const MIN_SMUDGE_SIZE = 8;
export const MAX_SMUDGE_SIZE = 200;
export const DEFAULT_SMUDGE_SIZE = 80;
/** One press of `[` or `]` with Udtvær in hand. */
export const SMUDGE_STEP = 5;

export function clampSmudge(size: number): BrushSize {
	return Number.isFinite(size)
		? Math.max(MIN_SMUDGE_SIZE, Math.min(MAX_SMUDGE_SIZE, Math.round(size)))
		: DEFAULT_SMUDGE_SIZE;
}

/**
 * How hard Udtvær works, in percent: at 100 a push carries the paper under the
 * brush's centre all the way with the pointer and a held turn or swell goes at
 * its full pace; lower, the paper lags behind and a turn creeps, for a gentle
 * smear.
 */
export const MIN_SMUDGE_STRENGTH = 10;
export const MAX_SMUDGE_STRENGTH = 100;
/** A gentle smear to start with (the owner's choice, 2026-10-26). */
export const DEFAULT_SMUDGE_STRENGTH = 30;

export function clampStrength(strength: number): number {
	return Number.isFinite(strength)
		? Math.max(MIN_SMUDGE_STRENGTH, Math.min(MAX_SMUDGE_STRENGTH, Math.round(strength)))
		: DEFAULT_SMUDGE_STRENGTH;
}

export type PaintAction =
	| { kind: 'tool'; tool: PaintTool }
	| { kind: 'brush'; delta: -1 | 1 }
	| { kind: 'swapColour' }
	| { kind: 'undo' }
	| { kind: 'redo' };

/** Which letter picks which tool (PAINT.md §2). */
const TOOL_KEYS: Record<string, PaintTool> = {
	p: 'pen',
	f: 'fill',
	l: 'line',
	r: 'rect',
	o: 'ellipse',
	u: 'smudge',
	m: 'select'
};

/** The parts of a keyboard event the table reads. */
export type KeyStroke = {
	key: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
};

/**
 * What a keystroke means on the paint canvas, or null for one that means
 * nothing here and must be left to the browser.
 *
 * Undo is Cmd/Ctrl+Z and redo its shifted form, as everywhere else on the site.
 * The plain letters take no modifier at all: Alt+P and Ctrl+R belong to the
 * browser, and stealing them would be worse than not having a shortcut.
 */
export function shortcutFor(event: KeyStroke): PaintAction | null {
	const key = event.key.toLowerCase();
	const command = event.metaKey || event.ctrlKey;

	if (command && key === 'z') return { kind: event.shiftKey ? 'redo' : 'undo' };
	// The other Windows spelling of redo, which no shift key is involved in.
	if (command && key === 'y') return { kind: 'redo' };
	if (command || event.altKey) return null;

	if (key === '[') return { kind: 'brush', delta: -1 };
	if (key === ']') return { kind: 'brush', delta: 1 };
	if (key === 'x') return { kind: 'swapColour' };
	const tool = TOOL_KEYS[key];
	return tool ? { kind: 'tool', tool } : null;
}
