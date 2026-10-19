/**
 * The Escher tab's rules in words — each one's name, what it does, and its type's
 * name — and the tile each starts from. Curves are in a side's own frame (see
 * `tiling.ts`): from (0, 0) to (1, 0), y towards the stretch's high side, in
 * units of a cell.
 */

import type { TranslationKey } from '$lib/i18n';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { canLean, halfOf, ruleInfo, type NeighbourLink, type SideLink, type TileRule, type TypeNumber } from './rules';
import { type PatternTile, type SideCurve } from './tiling';

const LETTER: Record<SideLink, string> = { move: 'T', mirror: 'G', turn: 'C' };

const NEIGHBOUR_TEXT: Record<NeighbourLink, { name: TranslationKey; hint: TranslationKey }> = {
	mirror: { name: 'patternRuleMirror', hint: 'patternRuleMirrorHint' },
	turn: { name: 'patternRuleQuarter', hint: 'patternRuleQuarterHint' },
	both: { name: 'patternRuleBone', hint: 'patternRuleBoneHint' }
};

const TYPE_TEXT: Record<TypeNumber, { name: TranslationKey; hint: TranslationKey }> = {
	42: { name: 'patternType42', hint: 'patternType42Hint' },
	45: { name: 'patternType45', hint: 'patternType45Hint' },
	49: { name: 'patternType49', hint: 'patternType49Hint' },
	50: { name: 'patternType50', hint: 'patternType50Hint' },
	53: { name: 'patternType53', hint: 'patternType53Hint' },
	54: { name: 'patternType54', hint: 'patternType54Hint' },
	56: { name: 'patternType56', hint: 'patternType56Hint' },
	57: { name: 'patternType57', hint: 'patternType57Hint' },
	58: { name: 'patternType58', hint: 'patternType58Hint' },
	59: { name: 'patternType59', hint: 'patternType59Hint' },
	61: { name: 'patternType61', hint: 'patternType61Hint' },
	62: { name: 'patternType62', hint: 'patternType62Hint' },
	64: { name: 'patternType64', hint: 'patternType64Hint' },
	66: { name: 'patternType66', hint: 'patternType66Hint' },
	67: { name: 'patternType67', hint: 'patternType67Hint' },
	68: { name: 'patternType68', hint: 'patternType68Hint' },
	69: { name: 'patternType69', hint: 'patternType69Hint' },
	71: { name: 'patternType71', hint: 'patternType71Hint' },
	74: { name: 'patternType74', hint: 'patternType74Hint' }
};

/**
 * A rule's name and what it does, from how its sides are tied. Opposite pairs read
 * the same either way round: moved-and-mirrored is one type, turned a quarter.
 * McLean's other types have a name and a hint each, by number.
 */
export function ruleText(rule: TileRule): { name: TranslationKey; hint: TranslationKey } {
	if (rule.sides === 'free') return { name: 'patternRuleShift', hint: 'patternRuleShiftHint' };
	if (rule.sides === 'neighbour') return NEIGHBOUR_TEXT[rule.link];
	if (rule.sides === 'type') return TYPE_TEXT[rule.ih];
	const pair = [rule.v, rule.h].sort().join('+');
	const TEXT: Record<string, [TranslationKey, TranslationKey]> = {
		'move+move': ['patternRuleSame', 'patternRuleSameHint'],
		'mirror+move': ['patternRuleTg', 'patternRuleTgHint'],
		'move+turn': ['patternRuleTc', 'patternRuleTcHint'],
		'mirror+mirror': ['patternRuleGg', 'patternRuleGgHint'],
		'mirror+turn': ['patternRuleGc', 'patternRuleGcHint'],
		'turn+turn': ['patternRuleHalfturn', 'patternRuleHalfturnHint']
	};
	const [name, hint] = TEXT[pair]!;
	return { name, hint };
}

/**
 * Heesch's name for a rule's tile type: a letter per side for how it is tied to
 * its partner (T moved, G mirrored, C its own S, C4 turned a quarter). Opposite
 * pairs read as his canonical names do, T before C before G. Free sides (two
 * shapes) are no type; a tile with straight sides or a symmetry of its own is
 * not among his types, and goes by Grünbaum and Shephard's number (IH73 for
 * neighbours tied both ways).
 */
export function ruleCode(rule: TileRule): string | null {
	if (rule.sides === 'free') return null;
	if (rule.sides === 'type') return rule.ih === 53 ? 'CCGG' : `IH${rule.ih}`;
	if (rule.sides === 'neighbour') return { mirror: 'G1G1G2G2', turn: 'C4C4C4C4', both: 'IH73' }[rule.link];
	if (rule.v === 'mirror' && rule.h === 'mirror') return 'G1G2G1G2';
	const [a, b] = [LETTER[rule.v], LETTER[rule.h]].sort((x, y) => 'TCG'.indexOf(x) - 'TCG'.indexOf(y));
	return `${a}${b}${a}${b}`;
}

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
