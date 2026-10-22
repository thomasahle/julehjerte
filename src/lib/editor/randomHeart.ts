/**
 * A random heart for Tegn's "Tilfældigt mønster" button in the Normal tab (docs/redesign/DESIGN.md §7).
 *
 * Not a tiling (the Escher tab's "Tilfældig flise" draws those) but one picture over the whole square, the
 * way the gallery's Ramme, Amy's pattern, Amy's flowering and Amy's weave 2 are drawn: a few long cuts in
 * each lobe, each one or two smooth curves across the square, placed unevenly — in close pairs that make
 * bands, in frames that narrow towards the edges, round a wide middle — and bowed more or less with their
 * place, so that together they make a ring, a frame, a lens, a star or a flower. A heart picks:
 *
 *   strips    3–8, mostly 5–7
 *   spacing   even, bands (a narrow gap between wide ones), frames (narrower towards the edges), or a wide
 *             middle; always the same from either edge
 *   shape     bow, point (two bows meeting in a point in the middle), double (two bumps), wave (an S),
 *             swing (one S-shaped curve), or lean (a bow off its middle, with slanted ends)
 *   profile   how far each cut bows with its place: outward (the outer cuts bow towards the edges: a ring
 *             or frame), inward (towards the middle: a lens or diamond), or alternate (each pair of
 *             neighbouring cuts bows apart: bands that swell)
 *
 * and the three symmetry rows (Inden i kurve, Inden i lap, Mellem lapper), each Fra, Sym or Anti, built in
 * exactly: the shape is one the within-curve row keeps (a mirror keeps bows, points and double bumps; a
 * half turn keeps waves and swings; Fra allows any, slanted ones too), the lobe's other half is made from
 * the first by the within-lobe row, and the right lobe from the left by the between-lobes row (else drawn
 * the same way on its own). So the rows the heart opens with are true, as the editor's own rows would
 * make them.
 *
 * The cuts are in the editor's coordinates (the square centred on CENTER, STRIP_WIDTH a strip), ids
 * `L-0`…`L-n` and `R-0`…`R-n` with the outer edges straight, as `createDefaultFingers` makes them; and
 * are checked before they are returned, with the red cuts' rule (`findFingersWithIssues`) and for a left
 * and a right cut running alongside each other (`halvesRunTogether`): such a draw is drawn again.
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

export type CutShape = 'bow' | 'point' | 'double' | 'wave' | 'swing' | 'lean';
export type Spacing = 'even' | 'bands' | 'frames' | 'middle';
export type Profile = 'outward' | 'inward' | 'alternate';

export interface RandomHeart {
	gridSize: GridSize;
	fingers: Finger[];
	symmetry: RandomSymmetry;
	weaveParity: 0 | 1;
	shape: CutShape;
	spacing: Spacing;
	profile: Profile;
}

type Rng = () => number;
/** A cut in the unit square, (u, v) = (0, 0) its upper-left corner: cubic segments. */
type Cut = BezierSegment[];

const GRID_WEIGHTS: [number, number][] = [
	[3, 0.5],
	[4, 1.5],
	[5, 4],
	[6, 3],
	[7, 3],
	[8, 1]
];
const SPACING_WEIGHTS: [Spacing, number][] = [
	['even', 2],
	['bands', 4],
	['frames', 2],
	['middle', 2]
];
const PROFILE_WEIGHTS: [Profile, number][] = [
	['outward', 4],
	['inward', 3],
	['alternate', 2]
];
/**
 * How often each row is Fra, Sym or Anti. Mostly Sym, as in the gallery's hearts of this kind: all four
 * are mirrored between the lobes, three within the lobe and three within the curve. A twist (Anti) or no
 * tie at all is the exception, so as not to make a crooked heart often.
 */
const MODE_WEIGHTS: Record<keyof RandomSymmetry, [SymmetryMode, number][]> = {
	withinCurveMode: [
		['off', 1],
		['sym', 7],
		['anti', 2]
	],
	withinLobeMode: [
		['off', 1],
		['sym', 6],
		['anti', 2]
	],
	betweenLobesMode: [
		['off', 1],
		['sym', 7],
		['anti', 2]
	]
};
/** The shapes each within-curve row keeps, and how often each is drawn. */
const SHAPES: Record<SymmetryMode, [CutShape, number][]> = {
	sym: [
		['bow', 4],
		['point', 3],
		['double', 2]
	],
	anti: [
		['wave', 3],
		['swing', 2]
	],
	off: [
		['bow', 2],
		['point', 2],
		['wave', 1],
		['lean', 1]
	]
};

/**
 * A grid, spacing, symmetry and shape are kept for TRIES draws of the rest (profile and bow, the bow a
 * little smaller each time) before they are drawn again, so a combination that often comes too close is
 * as common as its weights say; after ROUNDS, the straight grid.
 */
const ROUNDS = 12;
const TRIES = 10;
/** The narrowest gap between two cuts of a lobe, as a share of the square (Amy's weave 2 has 2.6 %). */
const MIN_GAP = 0.035;

function pick<T>(rng: Rng, weights: [T, number][]): T {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let r = rng() * total;
	for (const [value, w] of weights) {
		r -= w;
		if (r < 0) return value;
	}
	return weights[weights.length - 1]![0];
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/**
 * Where a lobe's k = n − 1 cuts lie across the square, from the top (0) to the bottom (1): the k + 1 gaps
 * between the edges and the cuts, the same from either edge, scaled to fill the square.
 */
function cutPositions(n: number, spacing: Spacing, rng: Rng): number[] {
	const gaps: number[] = [];
	for (let i = 0; i <= n - 1; i++) {
		const fromEdge = Math.min(i, n - 1 - i);
		switch (spacing) {
			case 'even':
				gaps.push(1);
				break;
			case 'bands':
				// Wide gaps at the edges and between bands, narrow ones inside them.
				gaps.push(fromEdge % 2 === 0 ? 1 : 0);
				break;
			case 'frames':
				gaps.push(1 + fromEdge);
				break;
			case 'middle':
				gaps.push(fromEdge === Math.floor((n - 1) / 2) ? 2.5 : 1);
				break;
		}
	}
	// A band's width, the same for every band of the heart.
	const narrow = between(rng, 0.18, 0.32);
	const sized = gaps.map((g) => (g === 0 ? narrow : g));
	const total = sized.reduce((a, b) => a + b, 0);
	const positions: number[] = [];
	let at = 0;
	for (let i = 0; i < n - 1; i++) {
		at += sized[i]! / total;
		positions.push(at);
	}
	return positions;
}

/** How far the cut at `pos` bows, as a share of the square: + towards the bottom of the square. */
function bowAt(pos: number, index: number, profile: Profile, amplitude: number): number {
	const side = (pos - 0.5) / 0.5; // −1 at the top edge, +1 at the bottom
	switch (profile) {
		case 'outward':
			return amplitude * side;
		case 'inward':
			return -amplitude * side;
		case 'alternate':
			// Neighbouring cuts bow apart: the band between a pair swells.
			return amplitude * (0.35 + 0.65 * Math.abs(side)) * (index % 2 === 0 ? -1 : 1);
	}
}

const V = (x: number, y: number): Vec => ({ x, y });

/**
 * One cut's segments in its own frame, from t = 0 (the square's right side) to t = 1 (its left), w the
 * offset from its line, towards the bottom: shapes kept by a mirror across the middle are built as a half
 * and its mirror image, shapes kept by a half turn as a half and its turned copy, so they keep their row
 * exactly.
 */
function cutShape(shape: CutShape, b: number, rng: Rng): [Vec, Vec, Vec, Vec][] {
	const mirrored = (half: [Vec, Vec, Vec, Vec][]): [Vec, Vec, Vec, Vec][] => [
		...half,
		...half
			.slice()
			.reverse()
			.map(([p0, p1, p2, p3]) => [V(1 - p3.x, p3.y), V(1 - p2.x, p2.y), V(1 - p1.x, p1.y), V(1 - p0.x, p0.y)] as [Vec, Vec, Vec, Vec])
	];
	const turned = (half: [Vec, Vec, Vec, Vec][]): [Vec, Vec, Vec, Vec][] => [
		...half,
		...half
			.slice()
			.reverse()
			.map(([p0, p1, p2, p3]) => [V(1 - p3.x, -p3.y), V(1 - p2.x, -p2.y), V(1 - p1.x, -p1.y), V(1 - p0.x, -p0.y)] as [Vec, Vec, Vec, Vec])
	];
	// A cubic with both controls at height c peaks at 0.75c: c = 4b/3 reaches b.
	const c = (4 * b) / 3;
	switch (shape) {
		case 'bow': {
			const reach = between(rng, 0.22, 0.38);
			return mirrored([[V(0, 0), V(reach, c * 0.75), V(0.5 - 0.15, b), V(0.5, b)]]);
		}
		case 'point': {
			// Flat at the edges, rising steeply to a point in the middle, not quite upright: two halves
			// meeting along one line would touch there (the red cuts' rule).
			const flat = between(rng, 0.18, 0.3);
			return mirrored([[V(0, 0), V(flat, 0), V(0.5 - 0.07, b * 0.55), V(0.5, b)]]);
		}
		case 'double':
			return mirrored([[V(0, 0), V(0.12, c), V(0.38, c), V(0.5, 0)]]);
		case 'wave':
			return turned([[V(0, 0), V(0.12, c), V(0.38, c), V(0.5, 0)]]);
		case 'swing':
			return [[V(0, 0), V(0.35, 1.6 * b), V(0.65, -1.6 * b), V(1, 0)]];
		case 'lean': {
			// A bow whose top is off the middle, and whose ends are not level: off its middle both ways.
			const top = between(rng, 0.3, 0.7);
			const slant = between(rng, -0.6, 0.6) * Math.abs(b);
			return [[V(0, 0), V(top * 0.6, c), V(top + (1 - top) * 0.4, c + slant / 2), V(1, slant)]];
		}
	}
}

/** A left cut at `pos` (top 0, bottom 1) in the unit square: from its right end (u = 1) to its left (u = 0). */
function leftCut(pos: number, local: [Vec, Vec, Vec, Vec][]): Cut {
	const at = (p: Vec): Vec => ({ x: 1 - p.x, y: pos + p.y });
	return local.map(([p0, p1, p2, p3]) => ({ p0: at(p0), p1: at(p1), p2: at(p2), p3: at(p3) }));
}

/** The cut with every point moved by `f`, and run the other way when `reverse`. */
function mapCut(cut: Cut, f: (p: Vec) => Vec, reverse = false): Cut {
	const mapped = cut.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) }));
	if (!reverse) return mapped;
	return mapped.reverse().map((s) => ({ p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 }));
}

/**
 * One lobe's inner cuts as left cuts, index 1…n−1 at [1]…[n−1]: the first half drawn, the rest made from
 * it by the within-lobe row; a middle cut, which is its own mate, straight under the lobe's mirror and an
 * S under its half turn.
 */
function drawLobe(
	n: number,
	positions: number[],
	shape: CutShape,
	profile: Profile,
	amplitude: number,
	symmetry: RandomSymmetry,
	rng: Rng
): (Cut | undefined)[] {
	const cuts: (Cut | undefined)[] = new Array(n + 1).fill(undefined);
	const lobeMode = symmetry.withinLobeMode;
	const draw = (c: number, s: CutShape) => leftCut(positions[c - 1]!, cutShape(s, bowAt(positions[c - 1]!, c, profile, amplitude), rng));
	for (let c = 1; c < n; c++) {
		const mate = n - c;
		if (lobeMode !== 'off' && mate < c) {
			cuts[c] =
				lobeMode === 'sym'
					? mapCut(cuts[mate]!, (p) => ({ x: p.x, y: 1 - p.y }))
					: mapCut(cuts[mate]!, (p) => ({ x: 1 - p.x, y: 1 - p.y }), true);
		} else if (lobeMode !== 'off' && mate === c) {
			// The middle cut: a lobe's mirror maps it onto itself turned over, so it is straight; a half
			// turn keeps an S (and a straight cut, which a within-curve mirror as well leaves the only one).
			const s = lobeMode === 'anti' && symmetry.withinCurveMode !== 'sym' ? 'swing' : null;
			cuts[c] = s ? leftCut(0.5, cutShape(s, amplitude * 0.6 * (rng() < 0.5 ? 1 : -1), rng)) : leftCut(0.5, cutShape('bow', 0, rng));
		} else {
			cuts[c] = draw(c, shape);
		}
	}
	return cuts;
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
 * halves' cuts may cross, but where they nearly follow each other the paper between them is a sliver
 * too thin to cut or weave, and on the screen a hairline. Two cuts crossing at a fair angle are close
 * only for a short way either side of the crossing.
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
 * Whether the cuts are fit to cut: they keep the red cuts' distance from each other and themselves on their
 * own grid, and the two halves' cuts never run alongside each other (`halvesRunTogether`).
 */
export function randomHeartIsValid(fingers: Finger[], n: number): boolean {
	const side = n * STRIP_WIDTH;
	const margin = intersectionMarginPx({ width: side, height: side }, gridClearanceScale(n, n));
	if (findFingersWithIssues(fingers, margin).size > 0) return false;
	// Close: within 1.5 margins, for 10 margins: two cuts crossing at less than about 18° (a sliver or a
	// hairline); the wedges of an ordinary curved crossing pass.
	return !halvesRunTogether(fingers, 1.5 * margin, 10 * margin);
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
function heartFingers(left: (Cut | undefined)[], right: (Cut | undefined)[], n: number): Finger[] {
	const side = n * STRIP_WIDTH;
	const x0 = CENTER.x - side / 2;
	const y0 = CENTER.y - side / 2;
	const at = (p: Vec): Vec => ({ x: x0 + p.x * side, y: y0 + p.y * side });
	const edge = (lobe: 'left' | 'right', c: number): Cut => {
		const t = c / n;
		const [p0, p3] = lobe === 'left' ? [V(1, t), V(0, t)] : [V(t, 1), V(t, 0)];
		return [{ p0, p1: { ...p0 }, p2: { ...p3 }, p3 }];
	};
	const out: Finger[] = [];
	for (const [lobe, cuts] of [
		['left', left],
		['right', right]
	] as const) {
		for (let c = 0; c <= n; c++) {
			const cut = c === 0 || c === n ? edge(lobe, c) : cuts[c]!;
			const segments = cut.map((s) => ({ p0: at(s.p0), p1: at(s.p1), p2: at(s.p2), p3: at(s.p3) }));
			const finger: Finger = { id: `${lobe === 'left' ? 'L' : 'R'}-${c}`, lobe, segments };
			const nodeTypes = nodeTypesOf(segments);
			if (nodeTypes) finger.nodeTypes = nodeTypes;
			out.push(finger);
		}
	}
	return out;
}

function drawSymmetry(rng: Rng): RandomSymmetry {
	return {
		withinCurveMode: pick(rng, MODE_WEIGHTS.withinCurveMode),
		withinLobeMode: pick(rng, MODE_WEIGHTS.withinLobeMode),
		betweenLobesMode: pick(rng, MODE_WEIGHTS.betweenLobesMode)
	};
}

/** A random heart (see the top of this file); `rng` returns numbers in [0, 1), Math.random by default. */
export function randomHeart(rng: Rng = Math.random): RandomHeart {
	for (let round = 0; round < ROUNDS; round++) {
		const n = pick(rng, GRID_WEIGHTS);
		const spacing = n <= 3 && rng() < 0.5 ? 'even' : pick(rng, SPACING_WEIGHTS);
		const positions = cutPositions(n, spacing, rng);
		const gaps = [positions[0]!, ...positions.slice(1).map((p, i) => p - positions[i]!), 1 - positions[positions.length - 1]!];
		if (Math.min(...gaps) < MIN_GAP) continue;
		const shrink = round < ROUNDS / 2 ? 1 : 0.7;
		const symmetry = drawSymmetry(rng);
		const shape = pick(rng, SHAPES[symmetry.withinCurveMode]);
		for (let attempt = 0; attempt < TRIES; attempt++) {
			const profile = pick(rng, PROFILE_WEIGHTS);
			const amplitude = between(rng, 0.08, 0.2) * shrink * (1 - attempt / (2 * TRIES));

			const left = drawLobe(n, positions, shape, profile, amplitude, symmetry, rng);
			let right: (Cut | undefined)[];
			if (symmetry.betweenLobesMode === 'sym') {
				right = left.map((cut) => cut && mapCut(cut, (p) => ({ x: p.y, y: p.x })));
			} else if (symmetry.betweenLobesMode === 'anti') {
				right = left.map((_, c) => (c === 0 || c === n ? undefined : mapCut(left[n - c]!, (p) => ({ x: 1 - p.y, y: 1 - p.x }), true)));
			} else {
				// The right lobe drawn the same way on its own, its positions the same so the grid stays plaid.
				const own = drawLobe(n, positions, shape, pick(rng, PROFILE_WEIGHTS), between(rng, 0.08, 0.2) * shrink, symmetry, rng);
				right = own.map((cut) => cut && mapCut(cut, (p) => ({ x: p.y, y: p.x })));
			}

			const fingers = heartFingers(left, right, n);
			if (!randomHeartIsValid(fingers, n)) continue;
			return { gridSize: { x: n, y: n }, fingers, symmetry, weaveParity: rng() < 0.5 ? 0 : 1, shape, spacing, profile };
		}
	}
	const n = 3;
	const straight = [
		undefined,
		leftCut(1 / 3, [[V(0, 0), V(1 / 3, 0), V(2 / 3, 0), V(1, 0)]]),
		leftCut(2 / 3, [[V(0, 0), V(1 / 3, 0), V(2 / 3, 0), V(1, 0)]]),
		undefined
	];
	return {
		gridSize: { x: n, y: n },
		fingers: heartFingers(
			straight,
			straight.map((cut) => cut && mapCut(cut, (p) => ({ x: p.y, y: p.x }))),
			n
		),
		symmetry: { withinCurveMode: 'sym', withinLobeMode: 'sym', betweenLobesMode: 'sym' },
		weaveParity: 0,
		shape: 'bow',
		spacing: 'even',
		profile: 'outward'
	};
}
