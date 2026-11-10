/**
 * Tegn's checks of an edit: whether the cuts it would make may be there, and if not, why
 * (`CutProblem`). The editor asks them of every edit a button makes and of every place a drag's
 * search tries, against the heart as it is (`JudgedHeart`) and, in a drag, the heart as the drag
 * found it (`DragJudge`).
 */
import type { Finger, GridSize, Vec } from '$lib/types/heart';
import { inferOverlapRect, type OverlapRect } from '$lib/utils/overlapRect';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { bezierPathBBox } from '$lib/geometry/curves';
import {
	fingerHasIntersectionIssues,
	fingerPairHasIntersectionIssues,
	findFingersWithIssues,
	intersectionMarginPx,
	segmentsIntersect
} from '$lib/editor/curveIssues';
import { boundaryCurveCount, boundaryIndexFromId, idForBoundary } from '$lib/editor/cutIds';

/**
 * Why a cut may not be where an edit would put it: it would cross another cut of its lobe (or pass
 * the end of one), cross itself, or leave the woven square; or, in a drag, come closer than the
 * margin to the next cut or to itself, where the paper would be too thin.
 */
export type CutProblem = 'cross' | 'self' | 'outside' | 'close';

/** The heart an edit is judged against: its cuts as they are, its grid, and the square they weave in. */
export type JudgedHeart = { fingers: Finger[]; gridSize: GridSize; rect: OverlapRect };

/** A whole set of cuts, edges and all, on a grid of its own (see `candidateProblem`). */
export type WholeCuts = { fingers: Finger[]; gridSize: GridSize };

/**
 * The drag in progress, as its checks see it: the cut dragged (null for none), the cuts as the drag
 * began, and which of them it found too close already, by their ids (`wasClose`), kept for the drag.
 */
export type DragJudge = { cut: string | null; start: Finger[]; close: Map<string, boolean> };

/**
 * `whole`: judge the candidate among this set of cuts, edges and all, on this grid, instead of
 * the heart's own (a moved pattern that gains or loses a cut, see `fitLines`). `checks`: only
 * the quick ones (its ends and the square), only the crossings, or all; `checked`: cuts whose
 * crossings with this one were checked already.
 */
export function candidateProblem(
	heart: JudgedHeart,
	fingerId: string,
	candidate: Finger,
	overrides?: Map<string, Finger>,
	whole?: WholeCuts,
	checks: 'quick' | 'crossings' | 'all' = 'all',
	checked?: Set<string>
): CutProblem | null {
	const { left: minX, right: maxX, top: minY, bottom: maxY } = heart.rect;
	const orderEps = 1;
	const tol = 0.5;
	const pool = whole?.fingers ?? heart.fingers;
	const byId = (id: string) => pool.find((f) => f.id === id);

	const idx = boundaryIndexFromId(candidate.id);
	const boundaryCount = boundaryCurveCount(whole?.gridSize ?? heart.gridSize, candidate.lobe);
	const isFirstBoundary = idx <= 0;
	const isLastBoundary = idx >= boundaryCount - 1;
	const prev = idx > 0 ? (overrides?.get(idForBoundary(candidate.lobe, idx - 1)) ?? byId(idForBoundary(candidate.lobe, idx - 1))) : undefined;
	const next =
		idx < boundaryCount - 1
			? (overrides?.get(idForBoundary(candidate.lobe, idx + 1)) ?? byId(idForBoundary(candidate.lobe, idx + 1)))
			: undefined;

	const candidateSegments = candidate.segments;
	const candidateFirst = candidateSegments[0];
	const candidateLast = candidateSegments[candidateSegments.length - 1];
	if (!candidateFirst || !candidateLast) return 'self';

	if (checks !== 'crossings') {
		const prevSegments = prev ? prev.segments : null;
		const nextSegments = next ? next.segments : null;
		const prevFirst = prevSegments?.[0];
		const prevLast = prevSegments?.[prevSegments.length - 1];
		const nextFirst = nextSegments?.[0];
		const nextLast = nextSegments?.[nextSegments.length - 1];

		// An end past the next cut's end crosses that cut; an outer edge's end past the square leaves it.
		const order = (v: number, lo: number, hi: number): CutProblem | null =>
			v < lo ? (isFirstBoundary ? 'outside' : 'cross') : v > hi ? (isLastBoundary ? 'outside' : 'cross') : null;
		if (candidate.lobe === 'left') {
			const minP0Y = isFirstBoundary ? minY : (prevFirst?.p0.y ?? minY) + orderEps;
			const maxP0Y = isLastBoundary ? maxY : (nextFirst?.p0.y ?? maxY) - orderEps;
			const minP3Y = isFirstBoundary ? minY : (prevLast?.p3.y ?? minY) + orderEps;
			const maxP3Y = isLastBoundary ? maxY : (nextLast?.p3.y ?? maxY) - orderEps;
			const ends = order(candidateFirst.p0.y, minP0Y, maxP0Y) ?? order(candidateLast.p3.y, minP3Y, maxP3Y);
			if (ends) return ends;
		} else {
			const minP0X = isFirstBoundary ? minX : (prevFirst?.p0.x ?? minX) + orderEps;
			const maxP0X = isLastBoundary ? maxX : (nextFirst?.p0.x ?? maxX) - orderEps;
			const minP3X = isFirstBoundary ? minX : (prevLast?.p3.x ?? minX) + orderEps;
			const maxP3X = isLastBoundary ? maxX : (nextLast?.p3.x ?? maxX) - orderEps;
			const ends = order(candidateFirst.p0.x, minP0X, maxP0X) ?? order(candidateLast.p3.x, minP3X, maxP3X);
			if (ends) return ends;
		}

		const bounds = bezierPathBBox(candidateSegments);
		const insideSquare =
			bounds.x >= minX - tol &&
			bounds.x + bounds.width <= maxX + tol &&
			bounds.y >= minY - tol &&
			bounds.y + bounds.height <= maxY + tol;
		if (!insideSquare) return 'outside';
		if (checks === 'quick') return null;
	}
	if (segmentsIntersect(candidateSegments, candidateSegments, { skipAdjacent: true })) return 'self';

	for (const otherBase of pool) {
		if (otherBase.id === fingerId || checked?.has(otherBase.id)) continue;
		const other = overrides?.get(otherBase.id) ?? otherBase;
		if (other.lobe !== candidate.lobe) continue;
		const otherSegments = other.segments;
		if (segmentsIntersect(candidateSegments, otherSegments)) return 'cross';
	}

	return null;
}

/**
 * The first problem among these cuts, each judged by `candidateProblem`, or null when there is
 * none. Every cut's quick checks come first: an Escher edit makes every cut again, and the search
 * for how far a refused drag may go judges many such sets, mostly refused by those. Two of the cuts
 * are checked against each other once.
 */
export function cutsProblem(heart: JudgedHeart, cuts: Iterable<Finger>, overrides?: Map<string, Finger>, whole?: WholeCuts): CutProblem | null {
	const list = [...cuts];
	for (const cut of list) {
		const problem = candidateProblem(heart, cut.id, cut, overrides, whole, 'quick');
		if (problem) return problem;
	}
	const checked = new Set<string>();
	for (const cut of list) {
		const problem = candidateProblem(heart, cut.id, cut, overrides, whole, 'crossings', checked);
		if (problem) return problem;
		checked.add(cut.id);
	}
	return null;
}

/** The first problem among the cuts an edit would make (see `candidateProblem`), or null when there is none. */
export function overridesProblem(heart: JudgedHeart, overrides: Map<string, Finger>): CutProblem | null {
	return cutsProblem(heart, overrides.values(), overrides);
}

/** The first problem among a whole new set of cuts on a grid of its own (see `candidateProblem`). */
export function fingersProblem(heart: JudgedHeart, all: Finger[], grid: GridSize): CutProblem | null {
	const inner = all.filter((f) => {
		const idx = boundaryIndexFromId(f.id);
		return idx >= 1 && idx <= boundaryCurveCount(grid, f.lobe) - 2;
	});
	return cutsProblem(heart, inner, undefined, { fingers: all, gridSize: grid });
}

/** The least gap the red cuts allow between two cuts of a lobe, in the heart's units (`findFingersWithIssues`). */
export function clearanceMargin(cuts: Finger[], size: GridSize): number {
	return intersectionMarginPx(inferOverlapRect(cuts, size), gridClearanceScale(size.x, size.y));
}

/** How many of the cuts are red at the heart's size (`findFingersWithIssues`). */
export function redCount(cuts: Finger[], size: GridSize): number {
	return findFingersWithIssues(cuts, clearanceMargin(cuts, size)).size;
}

/**
 * Whether `next`, the heart's cuts as an edit would leave them on its grid, has a red cut the heart
 * has not now. A cut that comes newly too close to another is red, and so is the other, so one of the
 * changed cuts (those not the heart's own, by reference) is red then: the whole heart is measured only
 * when one is.
 */
export function makesRedCuts(heart: WholeCuts, next: Finger[]): boolean {
	const margin = clearanceMargin(heart.fingers, heart.gridSize);
	const changed = next.filter((f) => !heart.fingers.includes(f));
	if (!changed.some((f) => fingerHasIntersectionIssues(f, next, margin))) return false;
	const now = findFingersWithIssues(heart.fingers, margin);
	for (const id of findFingersWithIssues(next, margin)) if (!now.has(id)) return true;
	return false;
}

/** Whether two sets of cuts are the same cuts, to a millionth of a pixel. */
export function sameCuts(a: Finger[], b: Finger[]): boolean {
	const close = (p: Vec, q: Vec) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
	return (
		a.length === b.length &&
		a.every((f, i) => {
			const g = b[i]!;
			const fs = f.segments;
			const gs = g.segments;
			return f.id === g.id && fs.length === gs.length && fs.every((seg, k) => close(seg.p0, gs[k]!.p0) && close(seg.p1, gs[k]!.p1) && close(seg.p2, gs[k]!.p2) && close(seg.p3, gs[k]!.p3));
		})
	);
}

/**
 * Whether two cuts of a lobe, or a cut and itself (`a` = `b`), were closer than the margin already
 * when the drag in progress began: a drag may leave such a heart as it found it. Worked out once a
 * drag for each pair, the margin the heart's as it is then.
 */
export function wasClose(heart: JudgedHeart, drag: DragJudge, a: string, b: string): boolean {
	const key = a < b ? `${a} ${b}` : `${b} ${a}`;
	let close = drag.close.get(key);
	if (close === undefined) {
		const before = drag.start;
		const cutA = before.find((f) => f.id === a);
		const cutB = before.find((f) => f.id === b);
		const margin = clearanceMargin(heart.fingers, heart.gridSize);
		close = !!cutA && !!cutB && (a === b ? fingerHasIntersectionIssues(cutA, [cutA], margin) : fingerPairHasIntersectionIssues(cutA, cutB, margin));
		drag.close.set(key, close);
	}
	return close;
}

/**
 * Whether the cuts an edit would make come closer than the margin to a next cut of their lobe,
 * where they were not that close as the drag began: the red cuts' rule, which a drag keeps to
 * (GitHub issue #4). Only next cuts are measured: a cut lies between its two neighbours, so a cut
 * further off is further away still.
 */
export function closeProblem(heart: JudgedHeart, drag: DragJudge, overrides: Map<string, Finger>): CutProblem | null {
	const margin = clearanceMargin(heart.fingers, heart.gridSize);
	const measured = new Set<string>();
	for (const cut of overrides.values()) {
		const idx = boundaryIndexFromId(cut.id);
		const count = boundaryCurveCount(heart.gridSize, cut.lobe);
		for (const k of [idx - 1, idx + 1]) {
			if (k < 0 || k >= count) continue;
			const id = idForBoundary(cut.lobe, k);
			const key = cut.id < id ? `${cut.id} ${id}` : `${id} ${cut.id}`;
			if (measured.has(key)) continue;
			measured.add(key);
			const next = overrides.get(id) ?? heart.fingers.find((f) => f.id === id);
			if (next && fingerPairHasIntersectionIssues(cut, next, margin) && !wasClose(heart, drag, cut.id, id)) return 'close';
		}
	}
	return null;
}

/**
 * Whether the dragged cut, as an edit would make it, comes closer to itself than the margin (a
 * fold, short of crossing itself), where it did not as the drag began: the red cuts' rule too. It
 * takes many times the other checks, so a drag's search leaves it out, and the place the search
 * finds is refused for it (Tegn's `dragKept`).
 */
export function foldProblem(heart: JudgedHeart, drag: DragJudge, overrides: Map<string, Finger>): CutProblem | null {
	const own = drag.cut !== null ? overrides.get(drag.cut) : undefined;
	if (!own || !fingerHasIntersectionIssues(own, [own], clearanceMargin(heart.fingers, heart.gridSize)) || wasClose(heart, drag, own.id, own.id)) return null;
	return 'close';
}

/** The first problem among the cuts a drag's edit would make: `overridesProblem`'s, or their coming too close to the next (`closeProblem`). */
export function dragProblem(heart: JudgedHeart, drag: DragJudge, overrides: Map<string, Finger>): CutProblem | null {
	return overridesProblem(heart, overrides) ?? closeProblem(heart, drag, overrides);
}

/** An edit a drag tries: the cuts it makes, and the first problem among them, or null. */
export type JudgedEdit = { overrides: Map<string, Finger>; problem: CutProblem | null };

/**
 * Judges the edits a drag's search tries, by where they take the dragged point, each once (by
 * `problemOf`, the drag's checks): the search starts every round from where the last one got to,
 * the pointer's own place is judged again to tell why the drag stopped, and the place the search
 * got to is the edit made.
 */
export function judgeOnce(
	overridesAt: (at: Vec) => Map<string, Finger>,
	problemOf: (overrides: Map<string, Finger>) => CutProblem | null
): (at: Vec) => JudgedEdit {
	const judged = new Map<string, JudgedEdit>();
	return (at) => {
		const key = `${at.x} ${at.y}`;
		let edit = judged.get(key);
		if (!edit) {
			// A plain point: the search's own may end up in the cuts.
			const overrides = overridesAt({ x: at.x, y: at.y });
			edit = { overrides, problem: problemOf(overrides) };
			judged.set(key, edit);
		}
		return edit;
	};
}
