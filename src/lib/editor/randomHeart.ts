/**
 * A random heart for Tegn's "Tilfældigt mønster" button in the Normal tab (docs/redesign/DESIGN.md §7), for
 * exploring what the editor can draw: not a pick from a few prepared designs, but a draw from the whole
 * space of hearts the Normal tab makes, limited only by what makes a heart one at all.
 *
 *   strips     2–8, the same number in both lobes: a heart's woven square is square, strips × STRIP_WIDTH
 *              a side, whatever the cuts' places
 *   symmetry   the three rows (Inden i kurve, Inden i lap, Mellem lapper), each Fra, Sym or Anti
 *   places     where each cut meets the square's sides: anywhere, at least MIN_GAP apart
 *   cuts       each a chain of 1–6 cubic pieces: its nodes anywhere along and across it, each smooth or
 *              a corner, its handles any length and any way forward; a cut no row ties may also end
 *              higher or lower than it starts
 *   bow        how far the cuts reach from their line: from nearly straight to more than a strip
 *   parity     which colour the woven cells start with
 *
 * The rows are built in exactly, as the editor's own rows would make them: a cut the within-curve row
 * ties is a random first half and its mirror image (Sym) or its half-turned copy (Anti); the lobe's other
 * half is made from the first by the within-lobe row (a middle cut, its own mate, straight under the
 * mirror and turned onto itself under the half turn); the right lobe from the left by the between-lobes
 * row, or drawn the same way on its own. So the rows the heart opens with are true.
 *
 * A draw is kept only if it is fit to cut: no red cuts (`findFingersWithIssues`), and no left and right
 * cut running alongside each other (`halvesRunTogether`); else it is drawn again, and after many tries
 * with smaller bows. The cuts are in the editor's coordinates (the square centred on CENTER, STRIP_WIDTH a
 * strip), ids `L-0`…`L-n` and `R-0`…`R-m` with the outer edges straight, as `createDefaultFingers` makes
 * them.
 */
import { CENTER, STRIP_WIDTH } from '$lib/constants';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { randomChain } from '$lib/geometry/randomChain';
import { halvesCrossCleanly, MIN_PIECE, smallestPiece, weavesWell } from '$lib/editor/slivers';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import type { Finger, GridSize, NodeType, Vec } from '$lib/types/heart';

export type SymmetryMode = 'off' | 'sym' | 'anti';

export interface RandomSymmetry {
	withinCurveMode: SymmetryMode;
	withinLobeMode: SymmetryMode;
	betweenLobesMode: SymmetryMode;
}

export interface RandomHeart {
	gridSize: GridSize;
	fingers: Finger[];
	symmetry: RandomSymmetry;
	weaveParity: 0 | 1;
	/** The most pieces any cut has, for the analytics event. */
	pieces: number;
}

type Rng = () => number;
/** Cubic pieces in the unit square, (u, v) = (0, 0) its upper-left corner; or in a cut's own frame. */
type Cut = BezierSegment[];

const MODES: SymmetryMode[] = ['off', 'sym', 'anti'];
/** The narrowest gap between two cuts of a lobe, or a cut and an edge, where they meet the square's side. */
const MIN_GAP = 0.04;
/**
 * A grid and its rows are kept for TRIES draws of the rest, the bows a little smaller each time, before
 * they are drawn again, so every grid and row setting turns up as often as any other, the many-stripped
 * ones too, which more often come too close; after ROUNDS, the straight grid.
 */
const ROUNDS = 25;
const TRIES = 20;

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const V = (x: number, y: number): Vec => ({ x, y });
const STRAIGHT: Cut = [{ p0: V(0, 0), p1: V(1 / 3, 0), p2: V(2 / 3, 0), p3: V(1, 0) }];

/** The chain mirrored across x = 0.5 (`turn`: and across y = 0, a half turn about (0.5, 0)), run backwards: the second half of a tied cut. */
function secondHalf(half: Cut, turn: boolean): Cut {
	const f = (p: Vec) => V(1 - p.x, turn ? -p.y : p.y);
	return half
		.slice()
		.reverse()
		.map((s) => ({ p0: f(s.p3), p1: f(s.p2), p2: f(s.p1), p3: f(s.p0) }));
}

/**
 * One cut in its own frame, from (0, 0) at the square's far side to (1, end) at its near side: random, or
 * a random half and its mirror image (Sym) or half-turned copy (Anti), as the within-curve row ties it.
 */
function randomCut(curveMode: SymmetryMode, reach: number, slant: number, rng: Rng): Cut {
	if (curveMode === 'off') return randomChain(V(0, 0), V(1, between(rng, -slant, slant)), int(rng, 1, 6), reach, rng);
	const pieces = int(rng, 1, 3);
	if (curveMode === 'anti') {
		const half = randomChain(V(0, 0), V(0.5, 0), pieces, reach, rng);
		return [...half, ...secondHalf(half, true)];
	}
	// A mirror's middle node is on the mirror line; arriving level makes it smooth, else a point.
	const half = randomChain(V(0, 0), V(0.5, between(rng, -reach, reach)), pieces, reach, rng, rng() < 0.5 ? 0 : undefined);
	return [...half, ...secondHalf(half, false)];
}

/** A left cut at `pos` from a cut in its own frame: from its right end (u = 1) to its left (u = 0), y down. */
function leftCut(pos: number, local: Cut): Cut {
	const at = (p: Vec): Vec => V(1 - p.x, pos + p.y);
	return local.map((s) => ({ p0: at(s.p0), p1: at(s.p1), p2: at(s.p2), p3: at(s.p3) }));
}

/** The cut with every point moved by `f`, and run the other way when `reverse`. */
function mapCut(cut: Cut, f: (p: Vec) => Vec, reverse = false): Cut {
	const mapped = cut.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) }));
	if (!reverse) return mapped;
	return mapped.reverse().map((s) => ({ p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 }));
}

/** Where a lobe's n − 1 cuts meet the square's far side, top (0) to bottom (1): random, at least MIN_GAP apart, the same from either edge when `mirrored`. */
function randomPlaces(n: number, mirrored: boolean, rng: Rng): number[] | null {
	const k = n - 1;
	const half = mirrored ? Math.floor(k / 2) : k;
	const free = Array.from({ length: half }, () => between(rng, MIN_GAP, mirrored ? 0.5 - MIN_GAP / 2 : 1 - MIN_GAP)).sort((a, b) => a - b);
	const places = mirrored ? [...free, ...(k % 2 === 1 ? [0.5] : []), ...free.map((p) => 1 - p).reverse()] : free;
	const all = [0, ...places, 1];
	for (let i = 1; i < all.length; i++) if (all[i]! - all[i - 1]! < MIN_GAP) return null;
	return places;
}

/**
 * One lobe's inner cuts as left cuts, index 1…n−1 at [1]…[n−1]: the first half drawn, the rest made from
 * it by the within-lobe row; a middle cut, its own mate, straight under the lobe's mirror and an S under
 * its half turn (straight too if the within-curve row mirrors it).
 */
function randomLobe(n: number, places: number[], symmetry: RandomSymmetry, reach: number, rng: Rng): (Cut | undefined)[] {
	const cuts: (Cut | undefined)[] = new Array(n + 1).fill(undefined);
	const lobeMode = symmetry.withinLobeMode;
	for (let c = 1; c < n; c++) {
		const mate = n - c;
		const pos = places[c - 1]!;
		const own = reach * between(rng, 0.25, 1);
		if (lobeMode !== 'off' && mate < c) {
			cuts[c] = lobeMode === 'sym' ? mapCut(cuts[mate]!, (p) => V(p.x, 1 - p.y)) : mapCut(cuts[mate]!, (p) => V(1 - p.x, 1 - p.y), true);
		} else if (lobeMode !== 'off' && mate === c) {
			const turnable = lobeMode === 'anti' && symmetry.withinCurveMode !== 'sym';
			cuts[c] = leftCut(0.5, turnable ? randomCut('anti', own, 0, rng) : STRAIGHT);
		} else {
			// A cut may end higher or lower only where no row needs its ends level: up to half its gaps.
			const room = lobeMode === 'off' ? Math.min(pos - (places[c - 2] ?? 0), (places[c] ?? 1) - pos) / 2 : 0;
			cuts[c] = leftCut(pos, randomCut(symmetry.withinCurveMode, own, room, rng));
		}
	}
	return cuts;
}

/**
 * Whether the cuts are fit to cut: they keep the red cuts' distance from each other and themselves on their
 * own grid, the two halves' cuts never run alongside each other (`halvesCrossCleanly`), and no piece of
 * the woven picture is a crumb (`smallestPiece`).
 */
export function randomHeartIsValid(fingers: Finger[], grid: GridSize): boolean {
	const margin = intersectionMarginPx({ width: grid.x * STRIP_WIDTH, height: grid.y * STRIP_WIDTH }, gridClearanceScale(grid.x, grid.y));
	if (findFingersWithIssues(fingers, margin).size > 0 || !halvesCrossCleanly(fingers, margin)) return false;
	const width = grid.x * STRIP_WIDTH;
	const height = grid.y * STRIP_WIDTH;
	const rect = { left: CENTER.x - width / 2, top: CENTER.y - height / 2, width, height };
	return weavesWell(fingers, rect, grid.x) && smallestPiece(fingers, rect, grid.x * grid.y) >= MIN_PIECE;
}

/** Smooth where the handles on either side of a node point in opposite directions along one line. */
function nodeTypesOf(segments: BezierSegment[]): Record<string, NodeType> | undefined {
	const types: Record<string, NodeType> = {};
	for (let i = 1; i < segments.length; i++) {
		const node = segments[i]!.p0;
		const inH = { x: segments[i - 1]!.p2.x - node.x, y: segments[i - 1]!.p2.y - node.y };
		const outH = { x: segments[i]!.p1.x - node.x, y: segments[i]!.p1.y - node.y };
		const li = Math.hypot(inH.x, inH.y);
		const lo = Math.hypot(outH.x, outH.y);
		if (li < 1e-9 || lo < 1e-9) continue;
		const cross = (inH.x * outH.y - inH.y * outH.x) / (li * lo);
		const dot = (inH.x * outH.x + inH.y * outH.y) / (li * lo);
		if (Math.abs(cross) < 1e-6 && dot < 0) types[String(i)] = 'smooth';
	}
	return Object.keys(types).length ? types : undefined;
}

/** The heart's fingers in the editor's coordinates: both lobes' edges and cuts, in the editor's order. */
function heartFingers(left: (Cut | undefined)[], right: (Cut | undefined)[], grid: GridSize): Finger[] {
	const width = grid.x * STRIP_WIDTH;
	const height = grid.y * STRIP_WIDTH;
	const x0 = CENTER.x - width / 2;
	const y0 = CENTER.y - height / 2;
	const at = (p: Vec): Vec => V(x0 + p.x * width, y0 + p.y * height);
	const out: Finger[] = [];
	for (const [lobe, cuts, n] of [
		['left', left, grid.y],
		['right', right, grid.x]
	] as const) {
		for (let c = 0; c <= n; c++) {
			let cut: Cut;
			if (c === 0 || c === n) {
				const t = c / n;
				const [p0, p3] = lobe === 'left' ? [V(1, t), V(0, t)] : [V(t, 1), V(t, 0)];
				cut = [{ p0, p1: { ...p0 }, p2: { ...p3 }, p3 }];
			} else cut = cuts[c]!;
			const segments = cut.map((s) => ({ p0: at(s.p0), p1: at(s.p1), p2: at(s.p2), p3: at(s.p3) }));
			const finger: Finger = { id: `${lobe === 'left' ? 'L' : 'R'}-${c}`, lobe, segments };
			const nodeTypes = nodeTypesOf(segments);
			if (nodeTypes) finger.nodeTypes = nodeTypes;
			out.push(finger);
		}
	}
	return out;
}

/** Whether every point of the cut lies on the line through its ends. */
function isStraight(cut: Cut): boolean {
	const a = cut[0]!.p0;
	const b = cut[cut.length - 1]!.p3;
	const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
	const off = (p: Vec) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
	return cut.every((s) => off(s.p1) < 1e-9 && off(s.p2) < 1e-9 && off(s.p3) < 1e-9);
}

/** How far a lobe of n strips' cuts may reach from their lines: from a tenth of a strip to more than one. */
const reachFor = (n: number, rng: Rng, shrink: number) => (between(rng, 0.1, 1.3) / n) * shrink;

/** One draw on a given grid and rows: the heart, unchecked, or null where its cuts' places came too close, or none of them curves. */
function draw(rng: Rng, shrink: number, symmetry: RandomSymmetry, nL: number, nR: number): Omit<RandomHeart, 'weaveParity'> | null {
	const mirrored = symmetry.withinLobeMode !== 'off';
	const placesL = randomPlaces(nL, mirrored, rng);
	if (!placesL) return null;
	const left = randomLobe(nL, placesL, symmetry, reachFor(nL, rng, shrink), rng);
	let right: (Cut | undefined)[];
	if (symmetry.betweenLobesMode === 'sym') {
		right = left.map((cut) => cut && mapCut(cut, (p) => V(p.y, p.x)));
	} else if (symmetry.betweenLobesMode === 'anti') {
		right = left.map((_, c) => (c === 0 || c === nL ? undefined : mapCut(left[nL - c]!, (p) => V(1 - p.y, 1 - p.x), true)));
	} else {
		const placesR = randomPlaces(nR, mirrored, rng);
		if (!placesR) return null;
		right = randomLobe(nR, placesR, symmetry, reachFor(nR, rng, shrink), rng).map((cut) => cut && mapCut(cut, (p) => V(p.y, p.x)));
	}
	// Only straight cuts (two strips and a mirrored lobe leave nothing else) is the plain grid, not a draw.
	if ([...left, ...right].every((cut) => !cut || cut === STRAIGHT || isStraight(cut))) return null;
	const gridSize = { x: nR, y: nL };
	const pieces = Math.max(...[...left, ...right].map((cut) => cut?.length ?? 0));
	return { gridSize, fingers: heartFingers(left, right, gridSize), symmetry, pieces };
}

/** A random heart (see the top of this file); `rng` returns numbers in [0, 1), Math.random by default. */
export function randomHeart(rng: Rng = Math.random): RandomHeart {
	for (let round = 0; round < ROUNDS; round++) {
		const symmetry: RandomSymmetry = {
			withinCurveMode: MODES[int(rng, 0, 2)]!,
			withinLobeMode: MODES[int(rng, 0, 2)]!,
			betweenLobesMode: MODES[int(rng, 0, 2)]!
		};
		const nL = int(rng, 2, 8);
		// Both lobes the same number of strips: the woven square is square (a lobe's strips set its side).
		const nR = nL;
		for (let attempt = 0; attempt < TRIES; attempt++) {
			const heart = draw(rng, 1 - (0.6 * attempt) / TRIES, symmetry, nL, nR);
			if (!heart || !randomHeartIsValid(heart.fingers, heart.gridSize)) continue;
			return { ...heart, weaveParity: rng() < 0.5 ? 0 : 1 };
		}
	}
	const straight = (n: number): (Cut | undefined)[] =>
		Array.from({ length: n + 1 }, (_, c) => (c === 0 || c === n ? undefined : leftCut(c / n, STRAIGHT)));
	const gridSize = { x: 3, y: 3 };
	return {
		gridSize,
		fingers: heartFingers(
			straight(3),
			straight(3).map((cut) => cut && mapCut(cut, (p) => V(p.y, p.x))),
			gridSize
		),
		symmetry: { withinCurveMode: 'sym', withinLobeMode: 'sym', betweenLobesMode: 'sym' },
		weaveParity: 0,
		pieces: 1
	};
}
