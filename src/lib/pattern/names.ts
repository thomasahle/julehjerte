/**
 * The Escher tab's rules in words: each one's name and what it does, as
 * translation keys, and the name of its tile type — Heesch's, or Grünbaum and
 * Shephard's number where he has none, or for two shapes, the pattern's
 * wallpaper group.
 */

import type { TranslationKey } from '$lib/i18n';
import type { NeighbourLink, SideLink, TileRule, TwoNumber, TypeNumber } from './rules';

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

/** The wallpaper group of each way of two shapes (two.test.ts holds the symmetries to it). */
export const TWO_GROUP: Record<TwoNumber, string> = {
	2: 'p2',
	3: 'pg',
	4: 'pg',
	5: 'pgg',
	6: 'pgg',
	7: 'p2',
	8: 'pgg',
	9: 'pm',
	10: 'pm',
	11: 'pmg',
	12: 'pmg',
	13: 'pmm',
	14: 'p4',
	15: 'p4g',
	16: 'pmm',
	17: 'pmm',
	18: 'p4m'
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
	if (rule.sides === 'two') return { name: `patternTwo${rule.n}`, hint: `patternTwo${rule.n}Hint` };
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
 * pairs read as his canonical names do, T before C before G. A tile with
 * straight sides or a symmetry of its own is not among his types, and goes by
 * Grünbaum and Shephard's number (IH73 for neighbours tied both ways). Two
 * shapes are no type of one tile: they go by the pattern's wallpaper group, p1
 * where every tile is only moved.
 */
export function ruleCode(rule: TileRule): string | null {
	if (rule.sides === 'free') return 'p1';
	if (rule.sides === 'two') return TWO_GROUP[rule.n];
	if (rule.sides === 'type') return rule.ih === 53 ? 'CCGG' : `IH${rule.ih}`;
	if (rule.sides === 'neighbour') return { mirror: 'G1G1G2G2', turn: 'C4C4C4C4', both: 'IH73' }[rule.link];
	if (rule.v === 'mirror' && rule.h === 'mirror') return 'G1G2G1G2';
	const [a, b] = [LETTER[rule.v], LETTER[rule.h]].sort((x, y) => 'TCG'.indexOf(x) - 'TCG'.indexOf(y));
	return `${a}${b}${a}${b}`;
}
