/**
 * Where a heart's cuts cross, when every inner cut of one lobe crosses every
 * inner cut of the other at a node of both: the mark of cuts drawn from a tile,
 * whose stretches meet at the crossings. Cheap enough to ask of every heart Tegn
 * opens, so the Escher tab's code is loaded to read a tile out of the cuts
 * (`readTile`) only where it holds.
 */

import type { Finger, GridSize, Vec } from '$lib/types/heart';

/**
 * How near, in pixels, the nodes where two cuts cross, and a heart's cuts and a
 * tile's, have to come to be read as the same: rounding to the thousandths of
 * the square a heart is saved in stays well inside it.
 */
export const READ_TOLERANCE = 0.01;

/** Where left-lobe cut `L-j` and right-lobe cut `R-i` cross: a node of each, by Tegn's anchor index, and the point. */
export interface SharedCrossing {
	left: number;
	right: number;
	at: Vec;
}

const anchors = (f: Finger): Vec[] => (f.segments.length ? [f.segments[0]!.p0, ...f.segments.map((s) => s.p3)] : []);

/**
 * The crossings of a heart's inner cuts, `[j - 1][i - 1]` for `L-j` and `R-i`,
 * each where a node of one lies within `tolerance` pixels of a node of the other,
 * the cuts' ends aside; or null where some pair has no such nodes. Along each cut
 * the crossings come in order, as the other lobe's cuts do.
 */
export function sharedCrossings(fingers: Finger[], gridSize: GridSize, tolerance: number): SharedCrossing[][] | null {
	const byId = new Map(fingers.map((f) => [f.id, f]));
	const cuts = (prefix: 'L' | 'R', count: number) => Array.from({ length: count }, (_, k) => byId.get(`${prefix}-${k + 1}`));
	const left = cuts('L', gridSize.y - 1);
	const right = cuts('R', gridSize.x - 1);
	if (!left.length || !right.length || left.some((f) => !f) || right.some((f) => !f)) return null;
	const rightAnchors = right.map((f) => anchors(f!));
	const rows: SharedCrossing[][] = [];
	for (const l of left) {
		const la = anchors(l!);
		const row: SharedCrossing[] = [];
		for (const ra of rightAnchors) {
			let best: SharedCrossing | null = null;
			let bestD = tolerance;
			for (let a = 1; a < la.length - 1; a++) {
				for (let b = 1; b < ra.length - 1; b++) {
					const d = Math.hypot(la[a]!.x - ra[b]!.x, la[a]!.y - ra[b]!.y);
					if (d <= bestD) {
						bestD = d;
						best = { left: a, right: b, at: la[a]! };
					}
				}
			}
			if (!best) return null;
			row.push(best);
		}
		rows.push(row);
	}
	// In order along every cut: Tegn runs a left-lobe cut from right to left, crossing the right
	// lobe's last cut first, and a right-lobe cut from the bottom up, crossing the last left cut first.
	const ordered = (indices: number[]) => indices.every((v, k) => k === 0 || v < indices[k - 1]!);
	if (!rows.every((row) => ordered(row.map((c) => c.left)))) return null;
	if (!right.every((_, i) => ordered(rows.map((row) => row[i]!.right)))) return null;
	return rows;
}
