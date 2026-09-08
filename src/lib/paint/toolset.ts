/**
 * The five painting tools, the three brush sizes, and the keys that pick them.
 *
 * `tools.ts` says what an operation does to the cells; this says which of them
 * the visitor has chosen and what a keystroke means. It is plain data and one
 * pure function, so the key table can be read and tested in one place instead of
 * being spelled out inside a keydown handler.
 */

export type PaintTool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect';

export type BrushSize = 'fine' | 'medium' | 'coarse';

/** Brush radii in mask cells: a fine line, a finger, and a broad sweep. */
export const BRUSH_RADII: Record<BrushSize, number> = { fine: 2, medium: 6, coarse: 14 };

/** Smallest first, so `[` and `]` can step along them. */
export const BRUSH_SIZES: BrushSize[] = ['fine', 'medium', 'coarse'];

/** The brush one step bigger or smaller, stopping at both ends. */
export function stepBrush(current: BrushSize, delta: number): BrushSize {
	const at = BRUSH_SIZES.indexOf(current);
	const next = Math.max(0, Math.min(BRUSH_SIZES.length - 1, at + delta));
	return BRUSH_SIZES[next]!;
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
	r: 'rect'
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
