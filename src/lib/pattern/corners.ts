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
import { ruleKey, ruleMotions, type TileRule } from './rules';

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
	// Columns: each motion's own shift s (x, y), then the crossings' shifts in ORDER.
	const S = 2 * motions.length;
	const width = S + ORDER.length;
	const column = new Map(ORDER.map((c, k) => [`${cornerClass(c.i, c.j)}${c.axis}`, S + k]));
	const col = (i: number, j: number, axis: 'x' | 'y') => column.get(`${cornerClass(i, j)}${axis}`)!;
	const rows: number[][] = [];
	motions.forEach((m, g) => {
		for (let i = 0; i < N; i++)
			for (let j = 0; j < N; j++) {
				const to = { i: m.a * i + m.b * j + m.e, j: m.c * i + m.d * j + m.f };
				// δ(g(c)) − M·δ(c) − s = 0, along x and along y.
				for (const [axis, mx, my] of [
					['x', m.a, m.b],
					['y', m.c, m.d]
				] as const) {
					const row = new Array<number>(width).fill(0);
					row[col(to.i, to.j, axis)]! += 1;
					row[col(i, j, 'x')]! -= mx;
					row[col(i, j, 'y')]! -= my;
					row[2 * g + (axis === 'x' ? 0 : 1)]! -= 1;
					rows.push(row);
				}
			}
	});
	// The crossing (0, 0) stays where it is: moving everything is no freedom.
	for (const axis of ['x', 'y'] as const) {
		const row = new Array<number>(width).fill(0);
		row[col(0, 0, axis)] = 1;
		rows.push(row);
	}
	const pivots = reduce(rows, width);
	const pivotOf = new Map(pivots.map((c, r) => [c, r]));
	// The free coordinates nearest (0, 0) first, x before y.
	const freeCols = Array.from({ length: ORDER.length }, (_, k) => S + k)
		.filter((c) => !pivotOf.has(c))
		.reverse();
	// Each motion's shift is never free: it is what its crossings' shifts make it.
	if (Array.from({ length: S }, (_, c) => c).some((c) => !pivotOf.has(c))) throw new Error(`A motion of ${key} moves nothing.`);
	const basis = freeCols.map((f) => {
		const value = (c: number) => (c === f ? 1 : pivotOf.has(c) ? -rows[pivotOf.get(c)!]![f]! : 0);
		return Array.from({ length: N * N }, (_, k) => {
			const [i, j] = [Math.floor(k / N), k % N];
			return { x: clean(value(col(i, j, 'x'))), y: clean(value(col(i, j, 'y'))) };
		});
	});
	const freedom = { free: freeCols.map((c) => ORDER[c - S]!), basis };
	byRule.set(key, freedom);
	return freedom;
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
