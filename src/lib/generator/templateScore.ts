/**
 * One number for how good a heart's templates are, as a weighted sum of terms
 * (lower is better), for any heart: a generated figure or text, or a gallery
 * design. Nothing here knows how the heart was made: it reads the two lobes'
 * cuts alone.
 *
 * - `thin`: the narrowest neck of paper a piece hangs by on each lobe's
 *   template (`thinnestNeck`), as log(NECK_FREE / its width), none past
 *   NECK_FREE: halving a neck costs the same wherever it started.
 * - `hidden`: the length of the hidden cuts, where both lobes cut the same
 *   line and the picture shows none, in hundredths of the square's side.
 * - `winding`: how much longer a cut is than the straight line between its
 *   ends (length / chord - 1), as the mean over the cuts of both lobes, the
 *   square's sides among them: a heart of straight cuts has none, one whose
 *   cuts are half as long again .5. Between two templates of one picture it
 *   moves with `hidden` (a hidden cut is a detour of two cuts); it tells
 *   hearts of different pictures apart by how hard they are to cut.
 * - `tips`: sharp tips at joins of the cuts, a needle as NEEDLE of them.
 * - `turns`: how far the hidden cuts turn in all, in quarter turns.
 *
 * The weights (see WEIGHTS) are fitted to pairs of templates judged by eye;
 * the terms are returned too, so that hearts can be compared term by term.
 */
import type { BezierSegment, Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import { PRINT_WIDTH_MM, thinnestNeck } from '$lib/geometry/paperNecks';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { cutTipCounts } from './cutQuality';

/** The width, in millimetres on the printed template, from which a neck costs nothing. */
export const NECK_FREE = 4.5;
/** What a needle counts as, in sharp tips. */
const NEEDLE = 3;
/** How near, in hundredths of the square's side, the two lobes' cuts lie where they are one hidden cut. */
const SHARED = .15;
/** The step, in hundredths of the square's side, the cuts are walked in. */
const STEP = .5;

export type TemplateTerms = { thin: number; hidden: number; winding: number; tips: number; turns: number };
/**
 * What each term weighs: a hundredth of the square's side of hidden cut is one. `thin`, NECK_FREE and `tips` are what
 * the judged pairs of 2026-11-25 ask for (necks past 4.5 mm were worth nothing against shorter cuts); those pairs do
 * not tell `winding`'s and `turns`' weights from others near them.
 */
export const WEIGHTS: TemplateTerms = { thin: 20, hidden: 1, winding: 50, tips: 5, turns: 3 };

export type TemplateScore = {
	score: number;
	terms: TemplateTerms;
	/** Each lobe's narrowest neck, in millimetres, narrowest first. */
	necks: number[];
	/** Each cut's length over the straight line between its ends, less one: the left lobe's cuts, then the right's. */
	cuts: number[];
};

type Point = [number, number];

/** A cut as points STEP apart, in hundredths of the square's side. */
function walked(segments: BezierSegment[], unit: (p: Vec) => Point): Point[] {
	const out: Point[] = [];
	for (const s of segments) {
		const chord = Math.hypot(...unit(s.p3).map((v, k) => v - unit(s.p0)[k])), control = [s.p0, s.p1, s.p2, s.p3].map(unit);
		const length = Math.max(chord, control.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - control[k][0], p[1] - control[k][1]), 0));
		const n = Math.max(1, Math.ceil(length / STEP));
		for (let k = out.length ? 1 : 0; k <= n; k++) {
			const t = k / n, u = 1 - t;
			out.push([0, 1].map(c => u * u * u * control[0][c] + 3 * u * u * t * control[1][c] + 3 * u * t * t * control[2][c] + t * t * t * control[3][c]) as Point);
		}
	}
	return out;
}

const toSegment = (p: Point, a: Point, b: Point) => {
	const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
	return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};

/** The narrowest neck of each lobe's paper, narrowest first; a lobe where nothing hangs by a neck has none. */
export function narrowestNecks(design: HeartDesign): number[] {
	return (['left', 'right'] as const).map(lobe => thinnestNeck(design, { lobes: [lobe] })).filter(Number.isFinite).sort((a, b) => a - b);
}

/** Each lobe's cuts walked, in hundredths of the square's side. */
function walkedCuts(design: HeartDesign): Record<LobeId, Point[][]> {
	const rect = inferOverlapRect(design.fingers, design.gridSize), side = Math.max(rect.width, rect.height);
	const unit = (p: Vec): Point => [(p.x - rect.left) / side * 100, (p.y - rect.top) / side * 100];
	const cuts = (lobe: LobeId) => design.fingers.filter((f: Finger) => f.lobe === lobe).map(f => walked(f.segments, unit)).filter(points => points.length > 1);
	return { left: cuts('left'), right: cuts('right') };
}

/** A walked cut's length over the straight line between its ends, less one; none for a cut with no chord to speak of. */
function excess(points: Point[]): number {
	const a = points[0], b = points[points.length - 1], chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const length = points.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - points[k][0], p[1] - points[k][1]), 0);
	return chord > 1 ? Math.max(0, length / chord - 1) : 0;
}

/** How much longer each cut is than the straight line between its ends (length / chord - 1): the left lobe's cuts, then the right's. */
export function cutExcesses(design: HeartDesign): number[] {
	const lobes = walkedCuts(design);
	return [...lobes.left, ...lobes.right].map(excess);
}

/** A heart's templates scored (see the module's comment). */
export function templateScore(design: HeartDesign, weights: TemplateTerms = WEIGHTS): TemplateScore {
	const lobes = walkedCuts(design);

	// Hidden cuts: the left lobe's cuts where the right lobe cuts the same line; their length and turning.
	const other = lobes.right.flatMap(points => points.slice(1).map((q, k): [Point, Point] => [points[k], q]));
	const cell = 4, grid = new Map<string, [Point, Point][]>();
	for (const piece of other) {
		const [x0, x1] = [Math.min(piece[0][0], piece[1][0]), Math.max(piece[0][0], piece[1][0])].map(v => Math.floor(v / cell));
		const [y0, y1] = [Math.min(piece[0][1], piece[1][1]), Math.max(piece[0][1], piece[1][1])].map(v => Math.floor(v / cell));
		for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = y0 - 1; y <= y1 + 1; y++) {
			const key = `${x},${y}`;
			if (!grid.has(key)) grid.set(key, []);
			grid.get(key)!.push(piece);
		}
	}
	const shared = (p: Point) => (grid.get(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`) ?? []).some(([a, b]) => toSegment(p, a, b) < SHARED);
	let hidden = 0, turning = 0;
	for (const points of lobes.left) {
		const on = points.map(shared);
		let last: number | undefined;
		for (let k = 1; k < points.length; k++) {
			if (!on[k] || !on[k - 1]) { last = undefined; continue; }
			const d = [points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]], l = Math.hypot(d[0], d[1]);
			if (!l) continue;
			hidden += l;
			const heading = Math.atan2(d[1], d[0]);
			if (last !== undefined) {
				let turn = Math.abs(heading - last);
				if (turn > Math.PI) turn = 2 * Math.PI - turn;
				turning += turn;
			}
			last = heading;
		}
	}

	const necks = narrowestNecks(design), excesses = [...lobes.left, ...lobes.right].map(excess);
	const [needles, sharp] = cutTipCounts(design);
	const terms: TemplateTerms = {
		thin: necks.reduce((sum, mm) => sum + Math.max(0, Math.log(NECK_FREE / Math.max(mm, .05))), 0),
		hidden,
		winding: excesses.length ? excesses.reduce((sum, e) => sum + e, 0) / excesses.length : 0,
		tips: sharp + NEEDLE * needles,
		turns: turning / (Math.PI / 2)
	};
	const score = (Object.keys(terms) as (keyof TemplateTerms)[]).reduce((sum, key) => sum + weights[key] * terms[key], 0);
	return { score, terms, necks, cuts: excesses };
}

/** The print width the necks are measured at. */
export const SCORED_AT_MM = PRINT_WIDTH_MM;
