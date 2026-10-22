/**
 * A random heart for Tegn's "Tilfældigt mønster" button (docs/redesign/DESIGN.md §7).
 *
 * Random, but not chaotic: a heart picks one square grid (2–6 strips, mostly 3–5), one shape and
 * one arrangement, and every cut is a row of that shape, one bump per stretch between two
 * crossings, in the direction the arrangement says:
 *
 *   shapes        arc (scales), hill (soft waves), zigzag (sawtooth), step (square teeth),
 *                 wave (an S in each stretch)
 *   arrangements  scales (all one way), waves (alternating along the cut), checker (alternating
 *                 along the cut and from cut to cut), rows (alternating from cut to cut),
 *                 sparse (a few bumps, the rest straight), centre (bumps in the middle only)
 *
 * It also picks the three symmetry rows (Inden i kurve, Inden i lap, Mellem lapper), each Fra, Sym
 * or Anti, and builds them in exactly: cuts that a symmetry maps onto others are made from their
 * mates, as the editor's own rows would make them, so the rows the heart opens with are true.
 *
 * Each stretch is described by its shape and a sign (−1, 0, +1: away, straight, towards), so the
 * symmetries act on those descriptions; the shapes are symmetric about the stretch's middle except
 * the S, which a mirror turns over. The cuts come out in the editor's coordinates (the square
 * centred on CENTER, STRIP_WIDTH a strip), ids `L-0`…`L-n` and `R-0`…`R-n` with the outer edges
 * straight, as `createDefaultFingers` makes them, and are checked with the red cuts' own rule
 * (`findFingersWithIssues`) before they are returned: a draw that comes too close is drawn again,
 * smaller after many tries, and failing all, the plain straight grid is returned.
 */
import { CENTER, STRIP_WIDTH } from '$lib/constants';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import type { Finger, GridSize, NodeType, Vec } from '$lib/types/heart';

export type SymmetryMode = 'off' | 'sym' | 'anti';

export interface RandomSymmetry {
	withinCurveMode: SymmetryMode;
	withinLobeMode: SymmetryMode;
	betweenLobesMode: SymmetryMode;
}

export type BumpShape = 'arc' | 'hill' | 'zigzag' | 'step' | 'wave';
export type Arrangement = 'scales' | 'waves' | 'checker' | 'rows' | 'sparse' | 'centre';

export interface RandomHeart {
	gridSize: GridSize;
	fingers: Finger[];
	symmetry: RandomSymmetry;
	weaveParity: 0 | 1;
	shape: BumpShape;
	arrangement: Arrangement;
}

/** One stretch of a cut, between two crossings: its shape and which way it bulges (0: straight). */
type Bump = { shape: BumpShape; s: number };
/** A cut as its stretches, from its start (p0) to its end (p3). */
type CutSpec = Bump[];

type Rng = () => number;

const GRID_WEIGHTS: [number, number][] = [
	[2, 0.5],
	[3, 3],
	[4, 4],
	[5, 3],
	[6, 2]
];
const SHAPE_WEIGHTS: [BumpShape, number][] = [
	['arc', 3],
	['hill', 3],
	['zigzag', 2],
	['step', 2],
	['wave', 1]
];
const ARRANGEMENT_WEIGHTS: [Arrangement, number][] = [
	['scales', 3],
	['waves', 2],
	['checker', 2],
	['rows', 1],
	['sparse', 2],
	['centre', 1]
];
const MODE_WEIGHTS: [SymmetryMode, number][] = [
	['off', 3],
	['sym', 4],
	['anti', 3]
];

/** How far a bump reaches, as a share of a strip: low and high end of the draw. */
const AMPLITUDE: Record<BumpShape, [number, number]> = {
	arc: [0.22, 0.38],
	hill: [0.22, 0.4],
	zigzag: [0.22, 0.38],
	step: [0.18, 0.32],
	wave: [0.25, 0.4]
};

/**
 * A grid and shape are kept for TRIES draws of the rest before both are drawn again, so a shape
 * that often comes too close (steep arcs hug a straight cut through their crossing) is as common
 * as its weight says; after ROUNDS of them, the straight grid is returned. Bumps shrink in the
 * second half of the rounds.
 */
const ROUNDS = 12;
const TRIES = 10;

function pick<T>(rng: Rng, weights: [T, number][]): T {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let r = rng() * total;
	for (const [value, w] of weights) {
		r -= w;
		if (r < 0) return value;
	}
	return weights[weights.length - 1]![0];
}

// What the symmetries do to one stretch. Every shape but the S is symmetric about the stretch's
// middle, so a mirror along the cut keeps it and a half-turn turns it over; the S is the other way
// round. A flip across the cut turns every shape over.
const mirrorBump = (b: Bump): Bump => (b.shape === 'wave' ? { shape: b.shape, s: -b.s } : b);
const rotateBump = (b: Bump): Bump => (b.shape === 'wave' ? b : { shape: b.shape, s: -b.s });
const flipBump = (b: Bump): Bump => ({ shape: b.shape, s: -b.s });
const sameBump = (a: Bump, b: Bump) => a.shape === b.shape && a.s === b.s;

/** The cut turned half a turn about its chord's middle (Inden i kurve, Anti; Inden i lap and Mellem lapper, Anti). */
const rotateCut = (cut: CutSpec): CutSpec => cut.map((_, k) => rotateBump(cut[cut.length - 1 - k]!));
/** The cut flipped across its own line (a lobe's mirror, Inden i lap, Sym). */
const flipCut = (cut: CutSpec): CutSpec => cut.map(flipBump);

/**
 * The cut made symmetric under `op` (mirrorBump or rotateBump, paired with the stretch on the other
 * side): the second half is made from the first, and a middle stretch the symmetry would change is
 * straightened.
 */
function symmetrizeCut(cut: CutSpec, op: (b: Bump) => Bump): CutSpec {
	const n = cut.length;
	const out = cut.slice();
	for (let k = 0; k < n; k++) {
		const mate = n - 1 - k;
		if (mate < k) out[k] = op(out[mate]!);
	}
	if (n % 2 === 1) {
		const mid = (n - 1) / 2;
		const b = out[mid]!;
		if (!sameBump(op(b), b)) out[mid] = { shape: b.shape, s: 0 };
	}
	return out;
}

function sign(arrangement: Arrangement, cut: number, k: number, n: number, rng: Rng): number {
	switch (arrangement) {
		case 'scales':
			return 1;
		case 'waves':
			return k % 2 === 0 ? 1 : -1;
		case 'checker':
			return (k + cut) % 2 === 0 ? 1 : -1;
		case 'rows':
			return cut % 2 === 0 ? 1 : -1;
		case 'sparse': {
			const r = rng();
			return r < 0.3 ? 1 : r < 0.6 ? -1 : 0;
		}
		case 'centre':
			return Math.abs(k - (n - 1) / 2) < 1 ? (rng() < 0.5 ? 1 : -1) : 0;
	}
}

/**
 * One lobe's inner cuts, index 1…n−1 (0 and n, the outer edges, stay undefined), with the
 * within-curve and within-lobe rows built in.
 */
function lobeSpecs(n: number, shape: BumpShape, arrangement: Arrangement, symmetry: RandomSymmetry, rng: Rng): (CutSpec | undefined)[] {
	const cuts: (CutSpec | undefined)[] = new Array(n + 1).fill(undefined);
	for (let c = 1; c < n; c++) {
		let cut: CutSpec = Array.from({ length: n }, (_, k) => ({
			shape,
			s: sign(arrangement, c, k, n, rng)
		}));
		if (symmetry.withinCurveMode !== 'off') {
			cut = symmetrizeCut(cut, symmetry.withinCurveMode === 'sym' ? mirrorBump : rotateBump);
		}
		cuts[c] = cut;
	}
	if (symmetry.withinLobeMode !== 'off') {
		const anti = symmetry.withinLobeMode === 'anti';
		for (let c = 1; c < n - c; c++) {
			cuts[n - c] = anti ? rotateCut(cuts[c]!) : flipCut(cuts[c]!);
		}
		if (n % 2 === 0) {
			// The middle cut is its own mate. A lobe's mirror maps it onto itself turned over, so
			// it is straight; the half-turn needs it to be symmetric under a half-turn of its own,
			// which a within-curve mirror as well leaves only straight.
			const mid = n / 2;
			const cut = cuts[mid]!;
			cuts[mid] = !anti || symmetry.withinCurveMode === 'sym' ? cut.map((b) => ({ shape: b.shape, s: 0 })) : symmetrizeCut(cut, rotateBump);
		}
	}
	return cuts;
}

/** A stretch from t = a to t = b as cubic segments in the cut's own frame: t along it, w across. */
function bumpSegments(bump: Bump, a: number, b: number, h: number): [Vec, Vec, Vec, Vec][] {
	const L = b - a;
	const line = (p: Vec, q: Vec): [Vec, Vec, Vec, Vec] => [
		p,
		{ x: p.x + (q.x - p.x) / 3, y: p.y + (q.y - p.y) / 3 },
		{ x: p.x + (2 * (q.x - p.x)) / 3, y: p.y + (2 * (q.y - p.y)) / 3 },
		q
	];
	const A = { x: a, y: 0 };
	const B = { x: b, y: 0 };
	if (bump.s === 0) return [line(A, B)];
	const s = bump.s;
	// Two controls at height c put a cubic's middle at 0.75c: c = 4h/3 reaches h.
	const c = (4 * h) / 3;
	// Hills, zigzags and S's bulge from the middle of the stretch and run straight for `inset` at
	// either end: there the other half's cut crosses, and two cuts leaving a crossing at a slant
	// would run alongside each other (see `halvesRunTogether`). Arcs leave it steeply enough.
	const inset = 0.18 * L;
	const A1 = { x: a + inset, y: 0 };
	const B1 = { x: b - inset, y: 0 };
	const inner = L - 2 * inset;
	switch (bump.shape) {
		case 'arc':
			// Steep sides, so neighbouring bumps meet in a point; not quite upright, since two arcs
			// leaving one point along the same line would touch there (the red cuts' rule).
			return [[A, { x: a + 0.12 * L, y: s * c }, { x: b - 0.12 * L, y: s * c }, B]];
		case 'hill':
			return [line(A, A1), [A1, { x: A1.x + inner / 3, y: s * c }, { x: B1.x - inner / 3, y: s * c }, B1], line(B1, B)];
		case 'zigzag': {
			const peak = { x: a + L / 2, y: s * h };
			return [line(A, A1), line(A1, peak), line(peak, B1), line(B1, B)];
		}
		case 'step': {
			const q = L / 4;
			const p1 = { x: a + q, y: 0 };
			const p2 = { x: a + q, y: s * h };
			const p3 = { x: b - q, y: s * h };
			const p4 = { x: b - q, y: 0 };
			return [line(A, p1), line(p1, p2), line(p2, p3), line(p3, p4), line(p4, B)];
		}
		case 'wave': {
			const m = a + L / 2;
			const half = inner / 2;
			const cw = (4 * h * 0.8) / 3;
			return [
				line(A, A1),
				[A1, { x: A1.x + half / 3, y: s * cw }, { x: m - half / 3, y: s * cw }, { x: m, y: 0 }],
				[{ x: m, y: 0 }, { x: m + half / 3, y: -s * cw }, { x: B1.x - half / 3, y: -s * cw }, B1],
				line(B1, B)
			];
		}
	}
}

/** Smooth where the handles on either side of a node point in opposite directions along one line. */
function nodeTypesOf(segments: BezierSegment[]): Record<string, NodeType> | undefined {
	const types: Record<string, NodeType> = {};
	for (let i = 1; i < segments.length; i++) {
		const node = segments[i]!.p0;
		const inH = {
			x: segments[i - 1]!.p2.x - node.x,
			y: segments[i - 1]!.p2.y - node.y
		};
		const outH = {
			x: segments[i]!.p1.x - node.x,
			y: segments[i]!.p1.y - node.y
		};
		const li = Math.hypot(inH.x, inH.y);
		const lo = Math.hypot(outH.x, outH.y);
		if (li < 1e-6 || lo < 1e-6) continue;
		const cross = (inH.x * outH.y - inH.y * outH.x) / (li * lo);
		const dot = (inH.x * outH.x + inH.y * outH.y) / (li * lo);
		if (Math.abs(cross) < 1e-6 && dot < 0) types[String(i)] = 'smooth';
	}
	return Object.keys(types).length ? types : undefined;
}

/**
 * A cut in the editor's coordinates. Left cuts run across, from the square's right side (p0) to
 * its left (p3), at y = top + c·strip, bulging down for + ; right cuts run up, from the bottom (p0)
 * to the top (p3), at x = left + c·strip, bulging right for +.
 */
function cutFinger(lobe: 'left' | 'right', c: number, spec: CutSpec, n: number, amplitude: number): Finger {
	const side = n * STRIP_WIDTH;
	const left = CENTER.x - side / 2;
	const top = CENTER.y - side / 2;
	const h = amplitude / n;
	const toEditor = (p: Vec): Vec =>
		lobe === 'left'
			? { x: left + (1 - p.x) * side, y: top + (c / n + p.y) * side }
			: { x: left + (c / n + p.y) * side, y: top + (1 - p.x) * side };
	const segments: BezierSegment[] = [];
	spec.forEach((bump, k) => {
		for (const [p0, p1, p2, p3] of bumpSegments(bump, k / n, (k + 1) / n, h)) {
			segments.push({
				p0: toEditor(p0),
				p1: toEditor(p1),
				p2: toEditor(p2),
				p3: toEditor(p3)
			});
		}
	});
	const finger: Finger = {
		id: `${lobe === 'left' ? 'L' : 'R'}-${c}`,
		lobe,
		segments
	};
	const nodeTypes = nodeTypesOf(segments);
	if (nodeTypes) finger.nodeTypes = nodeTypes;
	return finger;
}

/** An outer edge, straight with its handles on its ends, as `createDefaultFingers` makes it. */
function edgeFinger(lobe: 'left' | 'right', c: number, n: number): Finger {
	const side = n * STRIP_WIDTH;
	const left = CENTER.x - side / 2;
	const top = CENTER.y - side / 2;
	const p0: Vec = lobe === 'left' ? { x: left + side, y: top + (c / n) * side } : { x: left + (c / n) * side, y: top + side };
	const p3: Vec = lobe === 'left' ? { x: left, y: top + (c / n) * side } : { x: left + (c / n) * side, y: top };
	return {
		id: `${lobe === 'left' ? 'L' : 'R'}-${c}`,
		lobe,
		segments: [{ p0, p1: { ...p0 }, p2: { ...p3 }, p3 }]
	};
}

function heartFingers(left: (CutSpec | undefined)[], right: (CutSpec | undefined)[], n: number, amplitude: number): Finger[] {
	const out: Finger[] = [];
	for (const [lobe, specs] of [
		['left', left],
		['right', right]
	] as const) {
		for (let c = 0; c <= n; c++) {
			const spec = specs[c];
			out.push(c === 0 || c === n || !spec ? edgeFinger(lobe, c, n) : cutFinger(lobe, c, spec, n, amplitude));
		}
	}
	return out;
}

/** Points along a cut, about every `step` units, for the closeness check below. */
function samplePoints(finger: Finger, step: number): Vec[] {
	const points: Vec[] = [];
	for (const seg of finger.segments) {
		const length = Math.hypot(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y) + Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y);
		const count = Math.max(4, Math.ceil(length / step));
		for (let i = 0; i < count; i++) {
			const t = i / count;
			const u = 1 - t;
			points.push({
				x: u * u * u * seg.p0.x + 3 * u * u * t * seg.p1.x + 3 * u * t * t * seg.p2.x + t * t * t * seg.p3.x,
				y: u * u * u * seg.p0.y + 3 * u * u * t * seg.p1.y + 3 * u * t * t * seg.p2.y + t * t * t * seg.p3.y
			});
		}
	}
	return points;
}

/**
 * Whether a left cut runs alongside a right cut, closer than `close` for longer than `run`: the two
 * halves' cuts may cross, but where they nearly follow each other the paper between them is a
 * sliver too thin to cut or weave, and on the screen a hairline. Two cuts crossing at a fair angle
 * are close only for a short way either side of the crossing.
 */
function halvesRunTogether(fingers: Finger[], close: number, run: number): boolean {
	const step = close / 2;
	const inner = (f: Finger) => f.segments.some((s) => s.p1.x !== s.p0.x || s.p1.y !== s.p0.y);
	const right = fingers.filter((f) => f.lobe === 'right' && inner(f)).flatMap((f) => samplePoints(f, step));
	for (const finger of fingers.filter((f) => f.lobe === 'left' && inner(f))) {
		let together = 0;
		for (const p of samplePoints(finger, step)) {
			const near = right.some(
				(q) => Math.abs(q.x - p.x) < close && Math.abs(q.y - p.y) < close && Math.hypot(q.x - p.x, q.y - p.y) < close
			);
			together = near ? together + step : 0;
			if (together > run) return true;
		}
	}
	return false;
}

/**
 * Whether the cuts are fit to cut: they keep the red cuts' distance from each other and themselves
 * on their own grid, and the two halves' cuts never run alongside each other (`halvesRunTogether`).
 */
export function randomHeartIsValid(fingers: Finger[], n: number): boolean {
	const side = n * STRIP_WIDTH;
	const margin = intersectionMarginPx({ width: side, height: side }, gridClearanceScale(n, n));
	if (findFingersWithIssues(fingers, margin).size > 0) return false;
	return !halvesRunTogether(fingers, 2 * margin, 6 * margin);
}

function drawSymmetry(rng: Rng): RandomSymmetry {
	for (let tries = 0; ; tries++) {
		const symmetry = {
			withinCurveMode: pick(rng, MODE_WEIGHTS),
			withinLobeMode: pick(rng, MODE_WEIGHTS),
			betweenLobesMode: pick(rng, MODE_WEIGHTS)
		};
		// A heart with no symmetry at all is allowed, but rarer: one draw in four would be.
		const none = symmetry.withinCurveMode === 'off' && symmetry.withinLobeMode === 'off' && symmetry.betweenLobesMode === 'off';
		if (!none || tries > 0) return symmetry;
	}
}

/** A random heart (see the top of this file); `rng` returns numbers in [0, 1), Math.random by default. */
export function randomHeart(rng: Rng = Math.random): RandomHeart {
	for (let round = 0; round < ROUNDS; round++) {
		const n = pick(rng, GRID_WEIGHTS);
		// Many strips are busy enough: there, only the calmer shapes and arrangements.
		const shape = pick(rng, n >= 6 ? SHAPE_WEIGHTS.filter(([s]) => s !== 'step' && s !== 'wave') : SHAPE_WEIGHTS);
		const arrangements =
			n >= 6 ? ARRANGEMENT_WEIGHTS.filter(([a]) => a === 'scales' || a === 'waves' || a === 'rows') : ARRANGEMENT_WEIGHTS;
		const shrink = round < ROUNDS / 2 ? 1 : 0.75;
		for (let attempt = 0; attempt < TRIES; attempt++) {
			const arrangement = pick(rng, arrangements);
			const symmetry = drawSymmetry(rng);
			const [lo, hi] = AMPLITUDE[shape];
			const amplitude = (lo + rng() * (hi - lo)) * shrink;

			const left = lobeSpecs(n, shape, arrangement, symmetry, rng);
			let right: (CutSpec | undefined)[];
			if (symmetry.betweenLobesMode === 'sym') {
				right = left.slice();
			} else if (symmetry.betweenLobesMode === 'anti') {
				right = left.map((_, c) => (c === 0 || c === n ? undefined : rotateCut(left[n - c]!)));
			} else {
				right = lobeSpecs(n, shape, arrangement, symmetry, rng);
			}

			// All straight is the grid the editor starts with, not a pattern.
			const bumps = [...left, ...right].some((cut) => cut?.some((b) => b.s !== 0));
			if (!bumps) continue;

			const fingers = heartFingers(left, right, n, amplitude);
			if (!randomHeartIsValid(fingers, n)) continue;
			return {
				gridSize: { x: n, y: n },
				fingers,
				symmetry,
				weaveParity: rng() < 0.5 ? 0 : 1,
				shape,
				arrangement
			};
		}
	}
	const n = 3;
	const straight = new Array(n + 1).fill(undefined);
	return {
		gridSize: { x: n, y: n },
		fingers: heartFingers(straight, straight, n, 0),
		symmetry: {
			withinCurveMode: 'sym',
			withinLobeMode: 'sym',
			betweenLobesMode: 'sym'
		},
		weaveParity: 0,
		shape: 'arc',
		arrangement: 'scales'
	};
}
