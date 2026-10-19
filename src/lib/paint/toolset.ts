/**
 * The six painting tools, brush radius, and the keys that pick them.
 *
 * `tools.ts` says what an operation does to the cells; this says which of them
 * the visitor has chosen and what a keystroke means. It is plain data and one
 * pure function, so the key table can be read and tested in one place instead of
 * being spelled out inside a keydown handler.
 */

export type PaintTool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'select';

/** XOR is an editing action; the mask still contains only paper 0 and paper 1. */
export type PaintValue = 0 | 1 | 'xor';

/** Brush radius in mask cells, shared by the slider and keyboard shortcuts. */
export type BrushSize = number;
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 40;
export const DEFAULT_BRUSH_SIZE = 6;

export function clampBrush(size: number): BrushSize {
	return Number.isFinite(size)
		? Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size)))
		: DEFAULT_BRUSH_SIZE;
}

/** The brush one step bigger or smaller, stopping at both ends. */
export function stepBrush(current: BrushSize, delta: number): BrushSize {
	return clampBrush(current + delta);
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
	e: 'eraser',
	f: 'fill',
	l: 'line',
	r: 'rect',
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
