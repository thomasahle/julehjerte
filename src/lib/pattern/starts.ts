/**
 * The tiles the Escher tab starts a rule from, and what it keeps when another is
 * chosen. Curves are in a side's own frame (see `tiling.ts`): from (0, 0) to
 * (1, 0), y towards the stretch's high side, in units of a cell.
 */

import type { BezierSegment, Vec } from '$lib/types/heart';
import { canLean, halfOf, ruleInfo, type TileRule } from './rules';
import type { PatternTile, SideCurve } from './tiling';

const v = (x: number, y: number): Vec => ({ x, y });

/**
 * Where each of a rule's (up to four) curves has its peak: along the side, and
 * how far to which side of it. No peak is another turned half round, mirrored
 * across the middle of the side or flipped over it, so no two curves are copies
 * of each other in any way a tile could be, by accident.
 */
const PEAKS: Vec[] = [v(0.4, 0.12), v(0.66, -0.08), v(0.28, -0.1), v(0.58, 0.07)];

/** A straight piece of side as Tegn draws one: its handles on its ends, so a dragged end keeps it straight. */
const straight = (a: Vec, b: Vec): BezierSegment => ({ p0: a, p1: a, p2: b, p3: b });

/**
 * A low peak on a side, whole or the first half of one: two straight lines and
 * a corner, off the middle so it has a front and a back. A rule's curves each
 * have their own (`PEAKS`), so no tile is its own mirror image, turns onto
 * itself, or shows a tie its rule does not make, by accident.
 */
function peak(k: number, half: boolean): SideCurve {
	const end = half ? 0.5 : 1;
	const top = { x: PEAKS[k % PEAKS.length]!.x * end, y: PEAKS[k % PEAKS.length]!.y };
	return [straight(v(0, 0), top), straight(top, v(end, 0))];
}

/**
 * The tile a rule starts from in Tegn's Escher tab: a low peak of straight lines
 * on every curve it reads, on the plain grid. Plain on purpose: enough to show
 * how the sides are tied, and the visitor does the drawing.
 */
export function ruleStart(rule: TileRule, cuts: number): PatternTile {
	return { rule, cuts, curves: Object.fromEntries(ruleInfo(rule).curves.map((key, k) => [key, peak(k, !!halfOf(rule, key))])) };
}

/**
 * A tile moved to another rule, keeping what can be kept: every curve the new
 * rule reads that the tile has, drawn the same way (whole, or as the same kind
 * of half), is the visitor's own; the rest are the new rule's start, and the
 * tiles lean only as they did, where the new rule lets them. Changing how one
 * pair of sides is tied leaves the other pair as drawn. With nothing to keep,
 * the tile is the new rule's start.
 */
export function carryCurves(tile: PatternTile, rule: TileRule, cuts = tile.cuts): PatternTile {
	const kept = ruleInfo(rule).curves.filter((k) => tile.curves[k] && halfOf(tile.rule, k) === halfOf(rule, k) && ruleInfo(tile.rule).curves.includes(k));
	if (!kept.length) return ruleStart(rule, cuts);
	const curves = { ...ruleStart(rule, cuts).curves };
	for (const k of kept) curves[k] = structuredClone(tile.curves[k]!);
	const offset = canLean(rule) && canLean(tile.rule) ? tile.offset : undefined;
	const lean = offset ? { offset: { ...offset } } : {};
	return { rule, cuts, curves, ...lean, ...(tile.pan ? { pan: { ...tile.pan } } : {}) };
}

/**
 * The tile the Escher tab shows when the visitor picks `rule` with `tile` drawn:
 * the curves carried over (`carryCurves`) when the heart they make weaves, by
 * `weaves`; else the rule's start. Kept curves beside the new rule's own can
 * come too close (a deep S beside a peak, at a crossing), and Tegn never shows
 * cuts that do not weave; Fortryd brings the drawing back.
 */
export function switchRule(tile: PatternTile, rule: TileRule, cuts: number, weaves: (tile: PatternTile) => boolean): PatternTile {
	const carried = carryCurves(tile, rule, cuts);
	return weaves(carried) ? carried : ruleStart(rule, cuts);
}

/** Whether every side of the tile is straight: a plain chequerboard, which fits every rule and has nothing to keep. */
export function isStraightTile(tile: PatternTile): boolean {
	return ruleInfo(tile.rule).curves.every((k) => (tile.curves[k] ?? []).every((s) => [s.p0, s.p1, s.p2, s.p3].every((p) => Math.abs(p.y) < 1e-6)));
}
