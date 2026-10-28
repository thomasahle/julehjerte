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

/**
 * Where left-lobe cut `L-j` and right-lobe cut `R-i` cross: a node of each, by
 * Tegn's anchor index, and the point. Where they run together along a joint
 * instead (`PatternTile.joints`), `along` is its other end, the next node of each.
 */
export interface SharedCrossing {
	left: number;
	right: number;
	at: Vec;
	along?: { left: number; right: number; at: Vec };
}

/**
 * Whether the segments of the two cuts between two places they share, a node of each at either end, are one
 * segment, run either way: the cuts run along each other there, a joint.
 */
function sameSegment(left: Finger, right: Finger, p: SharedCrossing, q: SharedCrossing, tolerance: number): boolean {
	if (Math.abs(p.left - q.left) !== 1 || Math.abs(p.right - q.right) !== 1) return false;
	const l = left.segments[Math.min(p.left, q.left)]!;
	const r = right.segments[Math.min(p.right, q.right)]!;
	const near = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
	return (near(l.p0, r.p0) && near(l.p1, r.p1) && near(l.p2, r.p2) && near(l.p3, r.p3)) || (near(l.p0, r.p3) && near(l.p1, r.p2) && near(l.p2, r.p1) && near(l.p3, r.p0));
}

const anchors = (f: Finger): Vec[] => (f.segments.length ? [f.segments[0]!.p0, ...f.segments.map((s) => s.p3)] : []);

/**
 * The crossings of a heart's inner cuts, `[j - 1][i - 1]` for `L-j` and `R-i`,
 * each where a node of one lies within `tolerance` pixels of a node of the other,
 * the cuts' ends aside, or where two such nodes follow one another along both, the
 * cuts running together between them (a joint); or null where some pair has no such
 * nodes, or more. Along each cut the crossings come in order, as the other lobe's
 * cuts do.
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
		for (const [ri, ra] of rightAnchors.entries()) {
			const r = right[ri];
			const near: SharedCrossing[] = [];
			for (let a = 1; a < la.length - 1; a++) {
				for (let b = 1; b < ra.length - 1; b++) {
					if (Math.hypot(la[a]!.x - ra[b]!.x, la[a]!.y - ra[b]!.y) <= tolerance) near.push({ left: a, right: b, at: la[a]! });
				}
			}
			// Nodes a hair apart (a cut drawn with a node twice over) are one place.
			const places = near.filter((c, k) => near.findIndex((d) => Math.hypot(c.at.x - d.at.x, c.at.y - d.at.y) <= tolerance) === k);
			// The nearest pair of nodes, the last of those as near.
			const gap = (c: SharedCrossing) => Math.hypot(c.at.x - ra[c.right]!.x, c.at.y - ra[c.right]!.y);
			if (!near.length) return null;
			if (places.length === 2 && near.length === 2 && sameSegment(l!, r!, near[0]!, near[1]!, tolerance)) {
				// A joint: its end first along the left cut as Tegn runs it, the other along.
				const [first, other] = near[0]!.left < near[1]!.left ? [near[0]!, near[1]!] : [near[1]!, near[0]!];
				row.push({ ...first, along: other });
			} else row.push(near.reduce((best, c) => (gap(c) <= gap(best) ? c : best)));
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
