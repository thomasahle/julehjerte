/**
 * Pieces on a sheet — docs/redesign/LASER.md "Sheet layout".
 *
 * Rows from the top left, as a person would lay paper pieces out: no rotation
 * (the cuts run along the paper's grain the same way on every piece, and a
 * turned piece is harder to recognise in the preview), and one sheet per file.
 */
import type { UnfoldedPiece } from './unfold';

export interface SheetSize {
	widthMm: number;
	heightMm: number;
}

export interface SheetOptions {
	sheet: SheetSize;
	/** Between neighbouring pieces. */
	gapMm?: number;
	/** Kept clear around the sheet's edge. */
	marginMm?: number;
}

export interface Placement {
	/** Index into the pieces asked for. */
	index: number;
	x: number;
	y: number;
}

export interface SheetLayout {
	sheet: SheetSize;
	/** The pieces that fit, in the order asked for; the rest are left off. */
	placements: Placement[];
	/** How many of the pieces asked for fit: always a prefix of them. */
	fitted: number;
}

/** A piece that fits exactly must not miss by a rounding error. */
const EPS = 1e-9;

export const SHEETS = {
	A4: { widthMm: 210, heightMm: 297 },
	A3: { widthMm: 297, heightMm: 420 }
} as const satisfies Record<string, SheetSize>;

/** Shelf packing: each piece goes right of the last one, or starts a new row under the tallest of its row. */
export function layoutSheet(
	pieces: ReadonlyArray<{ widthMm: number; heightMm: number }>,
	{ sheet, gapMm = 5, marginMm = 5 }: SheetOptions
): SheetLayout {
	const right = sheet.widthMm - marginMm;
	const bottom = sheet.heightMm - marginMm;
	const placements: Placement[] = [];
	let x = marginMm;
	let y = marginMm;
	let rowHeight = 0;

	for (const [index, piece] of pieces.entries()) {
		if (x > marginMm && x + piece.widthMm > right + EPS) {
			x = marginMm;
			y += rowHeight + gapMm;
			rowHeight = 0;
		}
		// The pieces are filled in order, so the first one that misses ends it:
		// a smaller one further on slotting into a gap would split a heart's pair.
		if (x + piece.widthMm > right + EPS || y + piece.heightMm > bottom + EPS) break;
		placements.push({ index, x, y });
		x += piece.widthMm + gapMm;
		rowHeight = Math.max(rowHeight, piece.heightMm);
	}

	return { sheet, placements, fitted: placements.length };
}

/** An unfolded piece with its place on the sheet; what the writers draw. */
export interface PlacedPiece {
	piece: UnfoldedPiece;
	x: number;
	y: number;
}

/** A sheet ready to write: its size and the pieces on it. */
export interface LaserSheet {
	sheet: SheetSize;
	pieces: PlacedPiece[];
}
