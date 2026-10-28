/**
 * How far a rule lets the tiles' corners move. A rule's motions are motions of
 * the square grid (`ruleMotions`), and on the plain grid every crossing stands
 * on a whole cell. But a tiling keeps its rule wherever its corners stand, so
 * long as every motion still takes the tiling onto itself: the crossings can
 * stand off the grid by a shift that repeats with the tiling, `δ(i, j)`, and
 * each motion `p ↦ M·p + e` of the grid becomes `p ↦ M·p + e + s` of the
 * tiling, `s` its own. That is `δ(g(c)) = M·δ(c) + s` for every motion `g` and
 * crossing `c`: linear, so the shifts a rule allows are a space, worked out
 * once a rule (`cornerFreedom`). Moving the whole tiling is no freedom: the
 * crossing (0, 0) stays on the grid.
 *
 * Some rules allow none (moved across both pairs: every corner is every other
 * moved), some a slide along a line (mirrored and moved: the mirror line slides
 * across, and every other row of corners with it), some any shift of every other
 * corner (two shapes, and opposite sides each their own S: the tiles lean). The
 * cells' size and shape are no part of it: that is the tile's `shape`, which
 * acts on the shifts as on everything else.
 *
 * A space is given by its free coordinates: the shifts of particular crossings,
 * along x or y (`CornerFreedom.free`). Fixing them fixes every shift, so a tile
 * keeps its corners as those numbers (`PatternTile.corners`).
 */

import type { Vec } from '$lib/types/heart';
import { isRedCell, moveBy, ruleKey, ruleMotions, type TileRule } from './rules';

/** Every tiling here repeats within four cells each way: its shifts are those of the 4 × 4 crossings (i, j), i, j in 0…3. */
const N = 4;
const mod4 = (x: number) => ((x % N) + N) % N;
/** The index of crossing (i, j)'s shift among the 16, the same for every repeat of it. */
export const cornerClass = (i: number, j: number) => mod4(i) * N + mod4(j);

/**
 * The shifts a rule allows: `basis[k]` the 16 crossings' shifts when free
 * coordinate k is 1 and the others 0 (`free[k]` which crossing's x or y that is).
 * Any allowed shifts are a sum of these, `Σ corners[k] · basis[k]`.
 */
export interface CornerFreedom {
	free: Array<{ i: number; j: number; axis: 'x' | 'y' }>;
	basis: Vec[][];
}

const byRule = new Map<string, CornerFreedom>();

/**
 * The order the shifts' coordinates come in, those preferred as free coordinates
 * last: the elimination below takes its pivots from the left, so the free ones
 * are the crossings nearest (0, 0).
 */
const ORDER: Array<{ i: number; j: number; axis: 'x' | 'y' }> = Array.from({ length: N * N }, (_, k) => ({ i: Math.floor(k / N), j: k % N }))
	.sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i)
	.flatMap(({ i, j }) => [
		{ i, j, axis: 'x' as const },
		{ i, j, axis: 'y' as const }
	])
	.reverse();

export function cornerFreedom(rule: TileRule): CornerFreedom {
	const key = ruleKey(rule);
	const cached = byRule.get(key);
	if (cached) return cached;
	const motions = ruleMotions(rule);
	const freedom = spaceOf(2 * motions.length, (row) => {
		motions.forEach((m, g) => {
			for (let i = 0; i < N; i++)
				for (let j = 0; j < N; j++) {
					const to = { i: m.a * i + m.b * j + m.e, j: m.c * i + m.d * j + m.f };
					// δ(g(c)) − M·δ(c) − s = 0, along x and along y: each motion's own shift s is its columns 2g, 2g + 1.
					row([[to, 'x', 1], [{ i, j }, 'x', -m.a], [{ i, j }, 'y', -m.b]], [2 * g, -1]);
					row([[to, 'y', 1], [{ i, j }, 'x', -m.c], [{ i, j }, 'y', -m.d]], [2 * g + 1, -1]);
				}
		});
		// The crossing (0, 0) stays where it is: moving everything is no freedom.
		row([[{ i: 0, j: 0 }, 'x', 1]]);
		row([[{ i: 0, j: 0 }, 'y', 1]]);
	});
	byRule.set(key, freedom);
	return freedom;
}

type Term = [{ i: number; j: number }, 'x' | 'y', number];

/**
 * The space of the 16 crossings' vectors the rows `build` adds keep to (each row a sum
 * of terms, a crossing's x or y times a number, and of an extra unknown of the S given,
 * that is 0), by its free coordinates: brought to reduced row echelon form, the extra
 * unknowns first, so that they are never free.
 */
function spaceOf(S: number, build: (row: (terms: Term[], extra?: [number, number]) => void) => void): CornerFreedom {
	const width = S + ORDER.length;
	const column = new Map(ORDER.map((c, k) => [`${cornerClass(c.i, c.j)}${c.axis}`, S + k]));
	const col = (i: number, j: number, axis: 'x' | 'y') => column.get(`${cornerClass(i, j)}${axis}`)!;
	const rows: number[][] = [];
	build((terms, extra) => {
		const row = new Array<number>(width).fill(0);
		for (const [{ i, j }, axis, v] of terms) row[col(i, j, axis)]! += v;
		if (extra) row[extra[0]]! += extra[1];
		rows.push(row);
	});
	const pivots = reduce(rows, width);
	const pivotOf = new Map(pivots.map((c, r) => [c, r]));
	// The free coordinates nearest (0, 0) first, x before y.
	const freeCols = Array.from({ length: ORDER.length }, (_, k) => S + k)
		.filter((c) => !pivotOf.has(c))
		.reverse();
	if (Array.from({ length: S }, (_, c) => c).some((c) => !pivotOf.has(c))) throw new Error('An extra unknown is free.');
	const basis = freeCols.map((f) => {
		const value = (c: number) => (c === f ? 1 : pivotOf.has(c) ? -rows[pivotOf.get(c)!]![f]! : 0);
		return Array.from({ length: N * N }, (_, k) => {
			const [i, j] = [Math.floor(k / N), k % N];
			return { x: clean(value(col(i, j, 'x'))), y: clean(value(col(i, j, 'y'))) };
		});
	});
	return { free: freeCols.map((c) => ORDER[c - S]!), basis };
}

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9);

/** Rows brought to reduced row echelon form in place, the zero rows dropped; the pivot column of each row left. */
function reduce(rows: number[][], width: number): number[] {
	const pivots: number[] = [];
	let r = 0;
	for (let c = 0; c < width && r < rows.length; c++) {
		let best = r;
		for (let k = r + 1; k < rows.length; k++) if (Math.abs(rows[k]![c]!) > Math.abs(rows[best]![c]!)) best = k;
		if (Math.abs(rows[best]![c]!) < 1e-9) continue;
		[rows[r], rows[best]] = [rows[best]!, rows[r]!];
		const p = rows[r]![c]!;
		for (let k = 0; k < width; k++) rows[r]![k]! /= p;
		for (let k = 0; k < rows.length; k++) {
			if (k === r || Math.abs(rows[k]![c]!) < 1e-12) continue;
			const f = rows[k]![c]!;
			for (let q = 0; q < width; q++) rows[k]![q]! -= f * rows[r]![q]!;
		}
		pivots.push(c);
		r++;
	}
	rows.length = r;
	return pivots;
}

/** Whether a rule lets any corner move. */
export const cornersMove = (rule: TileRule): boolean => cornerFreedom(rule).free.length > 0;

/** Whether crossing (i, j) moves when the corners do: the crossings that stay on the grid hold the cells' size and shape. */
export const crossingMoves = (rule: TileRule, i: number, j: number): boolean =>
	cornerFreedom(rule).basis.some((field) => field[cornerClass(i, j)]!.x !== 0 || field[cornerClass(i, j)]!.y !== 0);

/** The shift of crossing (i, j) for free coordinates `corners`, in cells. */
export function cornerShift(freedom: CornerFreedom, corners: readonly number[], i: number, j: number): Vec {
	const k = cornerClass(i, j);
	let x = 0;
	let y = 0;
	freedom.basis.forEach((field, f) => {
		const w = corners[f] ?? 0;
		x += w * field[k]!.x;
		y += w * field[k]!.y;
	});
	return { x, y };
}

/** The shifts' mean over the repeat: where the corners have taken the tiling's middle, in cells. */
export function meanShift(freedom: CornerFreedom, corners: readonly number[]): Vec {
	let x = 0;
	let y = 0;
	freedom.basis.forEach((field, f) => {
		const w = corners[f] ?? 0;
		for (const v of field) {
			x += w * v.x;
			y += w * v.y;
		}
	});
	return { x: x / (N * N), y: y / (N * N) };
}

/**
 * The free coordinates that bring the corners nearest `shift(i, j)` for every
 * crossing given, by least squares over the crossings' shifts (`cornerShift`);
 * the shortest where several do as well. What a rule cannot follow it leaves.
 */
export function nearestCorners(freedom: CornerFreedom, shifts: Array<{ i: number; j: number; shift: Vec }>): number[] {
	const k = freedom.basis.length;
	if (!k) return [];
	// Normal equations, a hair of the identity added for the shortest: (BᵀB + εI) w = Bᵀd.
	const m = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
	for (const { i, j, shift } of shifts) {
		const c = cornerClass(i, j);
		const col = freedom.basis.map((field) => field[c]!);
		for (let r = 0; r < k; r++) {
			for (let q = 0; q < k; q++) m[r]![q]! += col[r]!.x * col[q]!.x + col[r]!.y * col[q]!.y;
			m[r]![k]! += col[r]!.x * shift.x + col[r]!.y * shift.y;
		}
	}
	for (let r = 0; r < k; r++) m[r]![r]! += 1e-9;
	return solve(m, k).map(clean);
}

/** The solution of the k × k system augmented in `m`, by elimination with partial pivoting. */
function solve(m: number[][], k: number): number[] {
	for (let c = 0; c < k; c++) {
		let best = c;
		for (let r = c + 1; r < k; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[best]![c]!)) best = r;
		[m[c], m[best]] = [m[best]!, m[c]!];
		const p = m[c]![c]!;
		if (Math.abs(p) < 1e-15) continue;
		for (let r = 0; r < k; r++) {
			if (r === c) continue;
			const f = m[r]![c]! / p;
			for (let q = c; q <= k; q++) m[r]![q]! -= f * m[c]![q]!;
		}
	}
	return m.map((row, r) => (Math.abs(row[r]!) < 1e-15 ? 0 : row[k]! / row[r]!));
}

/** Which colour's tiles join across a crossing opened into a joint: the other colour's tiles float (`jointFreedom`). */
export type JoinColour = 'red' | 'white';

/**
 * Whether the two cuts at crossing (i, j) run along its joint the same way: so they do where the tiles that
 * join, across the joint, are the ones beside the crossing to one side and the other, cells (i, j − 1) and
 * (i − 1, j); the other way where they are the ones above and below it, (i − 1, j − 1) and (i, j).
 */
export const sameWayAt = (join: JoinColour, i: number, j: number): boolean => isRedCell(i, j - 1) === (join === 'red');

const jointsByRule = new Map<string, CornerFreedom | null>();

/**
 * How far a rule lets its crossings open, where `join`'s tiles join across them
 * and the other colour's float apart: at crossing c the cuts run together along a
 * straight joint from c − u(c) to c + u(c), the right lobe's cut coming in at the
 * first end, the left lobe's at the first end too where they run the same way
 * (`sameWayAt`) and at the second where not. Every motion of the rule has to take
 * every joint onto a joint, the end a cut comes in at onto the end its image comes
 * in at, so that u(g(c)) = ±M·u(c): linear, like the corners (`cornerFreedom`).
 * Null where the rule's motions swap the colours: a joint that joins white tiles
 * would join red ones where a motion takes it, so no colour floats.
 */
export function jointFreedom(rule: TileRule, join: JoinColour): CornerFreedom | null {
	const key = `${ruleKey(rule)}:${join}`;
	if (jointsByRule.has(key)) return jointsByRule.get(key)!;
	const motions = ruleMotions(rule);
	const swaps = motions.some((m) => {
		const centre = moveBy(m, { x: 0.5, y: 0.5 });
		return !isRedCell(Math.floor(centre.x), Math.floor(centre.y));
	});
	const freedom = swaps
		? null
		: spaceOf(0, (row) => {
				for (const m of motions)
					for (let i = 0; i < N; i++)
						for (let j = 0; j < N; j++) {
							// Where the motion takes the right lobe's cut coming in at (i, j): which cut, and in or out.
							const from = moveBy(m, { x: i, y: j - 1 });
							const to = moveBy(m, { x: i, y: j });
							const right = Math.abs(from.x - to.x) < 1e-9;
							const coming = right ? to.y > from.y : to.x > from.x;
							const t = { i: Math.round(to.x), j: Math.round(to.y) };
							// The first end there takes the right lobe's cut coming in, and the left lobe's coming in where
							// they run the same way.
							const first = right ? coming : coming === sameWayAt(join, t.i, t.j);
							const e = first ? 1 : -1;
							row([[t, 'x', 1], [{ i, j }, 'x', -e * m.a], [{ i, j }, 'y', -e * m.b]]);
							row([[t, 'y', 1], [{ i, j }, 'x', -e * m.c], [{ i, j }, 'y', -e * m.d]]);
						}
			});
	jointsByRule.set(key, freedom);
	return freedom;
}

/**
 * The free coordinates of joints `length` cells long, as near as the rule lets them, each along the diagonal
 * its cuts run along it by (`sameWayAt`): where a joint opens out to begin with.
 */
export function jointsOfLength(freedom: CornerFreedom, join: JoinColour, length: number): number[] {
	const h = length / 2 / Math.SQRT2;
	const shifts = Array.from({ length: N * N }, (_, k) => ({ i: Math.floor(k / N), j: k % N })).map(({ i, j }) => ({
		i,
		j,
		shift: { x: sameWayAt(join, i, j) ? h : -h, y: h }
	}));
	return nearestCorners(freedom, shifts);
}
