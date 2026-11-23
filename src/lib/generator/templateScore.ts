/**
 * One number for how good a heart's templates are, as a weighted sum of terms
 * (lower is better), for any heart: a generated figure or text, or a gallery
 * design. Nothing here knows how the heart was made: it reads the two lobes'
 * cuts alone.
 *
 * - `thin`: the narrowest necks of paper a piece hangs by (`thinnestNeck`),
 *   each as log(NECK_FREE / its width), none past NECK_FREE: halving a neck
 *   costs the same wherever it started.
 * - `hidden`: the length of the hidden cuts, where both lobes cut the same
 *   line and the picture shows none, in hundredths of the square's side.
 * - `concave`: each strip of paper's share of its convex hull that it leaves
 *   empty, summed over the strips of both lobes: a strip that is a plain band
 *   has none, one that winds round a motif much.
 * - `tips`: sharp tips at joins of the cuts, a needle as NEEDLE of them.
 * - `turns`: how far the hidden cuts turn in all, in quarter turns.
 *
 * The weights are a first proposal (see WEIGHTS); the terms are returned too,
 * so that hearts can be compared term by term.
 */
import type { BezierSegment, Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import { PRINT_WIDTH_MM, thinnestNeck, type Spared, type WeakPiece } from '$lib/geometry/paperNecks';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { cutTipCounts } from './cutQuality';

/** The width, in millimetres on the printed template, from which a neck costs nothing. */
export const NECK_FREE = 6;
/** How many of the narrowest necks are counted. */
export const NECKS = 4;
/** What a needle counts as, in sharp tips. */
const NEEDLE = 3;
/** How near, in hundredths of the square's side, the two lobes' cuts lie where they are one hidden cut. */
const SHARED = .15;
/** The step, in hundredths of the square's side, the cuts are walked in. */
const STEP = .5;

export type TemplateTerms = { thin: number; hidden: number; concave: number; tips: number; turns: number };
/** What each term weighs: a hundredth of the square's side of hidden cut is one. */
export const WEIGHTS: TemplateTerms = { thin: 40, hidden: 1, concave: 50, tips: 10, turns: 3 };

export type TemplateScore = {
	score: number;
	terms: TemplateTerms;
	/** The narrowest necks, in millimetres, narrowest first. */
	necks: number[];
	/** Each strip's concavity, the left lobe's then the right's, across each lobe. */
	strips: number[];
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

/** A polygon's area. */
const area = (ring: Point[]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** The convex hull of points (Andrew's chain). */
function hull(points: Point[]): Point[] {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const half = (list: Point[]) => {
		const out: Point[] = [];
		for (const p of list) {
			while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
			out.push(p);
		}
		return out.slice(0, -1);
	};
	return [...half(sorted), ...half(sorted.reverse())];
}

/** The narrowest necks of a heart's paper, narrowest first: each found with the paper about those before it
 * left out, and none narrower than the one before (with that paper cut away, a way round it may look narrower
 * than any the heart has). */
export function narrowestNecks(design: HeartDesign, count = NECKS): number[] {
	const necks: number[] = [], spared: Spared[] = [];
	for (let k = 0; k < count; k++) {
		const at: WeakPiece[] = [], mm = thinnestNeck(design, { at, spared });
		if (!Number.isFinite(mm)) break;
		necks.push(Math.max(mm, necks[necks.length - 1] ?? 0));
		if (!at.length) break;
		spared.push(at[0]);
	}
	return necks;
}

/** A heart's templates scored (see the module's comment). */
export function templateScore(design: HeartDesign, weights: TemplateTerms = WEIGHTS): TemplateScore {
	const rect = inferOverlapRect(design.fingers, design.gridSize), side = Math.max(rect.width, rect.height);
	const unit = (p: Vec): Point => [(p.x - rect.left) / side * 100, (p.y - rect.top) / side * 100];
	const size: Point = [rect.width / side * 100, rect.height / side * 100];
	const cuts = (lobe: LobeId) => design.fingers.filter((f: Finger) => f.lobe === lobe).map(f => walked(f.segments, unit)).filter(points => points.length > 1);
	const lobes = { left: cuts('left'), right: cuts('right') };

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

	// Each strip of paper: between two neighbouring cuts of a lobe, or a cut and the square's side.
	const strips: number[] = [];
	for (const lobe of ['left', 'right'] as const) {
		// The left lobe's cuts run across the square from left to right, the right lobe's from top to bottom.
		const along = lobe === 'left' ? 0 : 1, across = 1 - along;
		const lines = lobes[lobe].map(points => points[0][along] <= points[points.length - 1][along] ? points : [...points].reverse())
			.sort((a, b) => a.reduce((s, p) => s + p[across], 0) / a.length - b.reduce((s, p) => s + p[across], 0) / b.length);
		const edge = (at: number): Point[] => along === 0 ? [[0, at], [size[0], at]] : [[at, 0], [at, size[1]]];
		const bounds = [edge(0), ...lines, edge(size[across])];
		for (let k = 1; k < bounds.length; k++) {
			// A lobe's first and last cuts may be the square's own sides: no strip lies between those and the side.
			const ring = [...bounds[k - 1], ...[...bounds[k]].reverse()], full = area(hull(ring));
			if (full > 1) strips.push(Math.max(0, 1 - area(ring) / full));
		}
	}

	const necks = narrowestNecks(design);
	const [needles, sharp] = cutTipCounts(design);
	const terms: TemplateTerms = {
		thin: necks.reduce((sum, mm) => sum + Math.max(0, Math.log(NECK_FREE / Math.max(mm, .05))), 0),
		hidden,
		concave: strips.reduce((sum, c) => sum + c, 0),
		tips: sharp + NEEDLE * needles,
		turns: turning / (Math.PI / 2)
	};
	const score = (Object.keys(terms) as (keyof TemplateTerms)[]).reduce((sum, key) => sum + weights[key] * terms[key], 0);
	return { score, terms, necks, strips };
}

/** The print width the necks are measured at. */
export const SCORED_AT_MM = PRINT_WIDTH_MM;
