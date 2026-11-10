import type { GridSize, LobeId } from '$lib/types/heart';

/**
 * Tegn's names for a heart's cuts: `L-i` in the left lobe, `R-i` in the right, `i` counted from one
 * outer edge of the square to the other, the two edges included.
 */
export function lobePrefix(lobe: LobeId) {
	return lobe === 'left' ? 'L' : 'R';
}

export function idForBoundary(lobe: LobeId, index: number) {
	return `${lobePrefix(lobe)}-${index}`;
}

export function boundaryIndexFromId(id: string): number {
	const idx = Number(id.split('-')[1]);
	return Number.isFinite(idx) ? idx : 0;
}

/** How many cuts a lobe has on this grid, its two outer edges included. */
export function boundaryCurveCount(size: GridSize, lobe: LobeId) {
	const strips = lobe === 'left' ? size.y : size.x;
	return Math.max(0, strips + 1);
}
