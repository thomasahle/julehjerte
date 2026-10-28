/**
 * The Escher tab's rules in words: each one's name and what it does, as
 * translation keys, and the name of its tile type — Heesch's, or Grünbaum and
 * Shephard's number where he has none, or for two shapes, the pattern's
 * wallpaper group.
 */

import type { TranslationKey } from '$lib/i18n';
import type { NeighbourLink, SideLink, ThreeNumber, TileRule, TwoNumber, TypeNumber } from './rules';

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

const TWO_TEXT: Record<TwoNumber, { name: TranslationKey; hint: TranslationKey }> = {
	2: { name: 'patternTwo2', hint: 'patternTwo2Hint' },
	3: { name: 'patternTwo3', hint: 'patternTwo3Hint' },
	4: { name: 'patternTwo4', hint: 'patternTwo4Hint' },
	5: { name: 'patternTwo5', hint: 'patternTwo5Hint' },
	6: { name: 'patternTwo6', hint: 'patternTwo6Hint' },
	7: { name: 'patternTwo7', hint: 'patternTwo7Hint' },
	8: { name: 'patternTwo8', hint: 'patternTwo8Hint' },
	9: { name: 'patternTwo9', hint: 'patternTwo9Hint' },
	10: { name: 'patternTwo10', hint: 'patternTwo10Hint' },
	11: { name: 'patternTwo11', hint: 'patternTwo11Hint' },
	12: { name: 'patternTwo12', hint: 'patternTwo12Hint' },
	13: { name: 'patternTwo13', hint: 'patternTwo13Hint' },
	14: { name: 'patternTwo14', hint: 'patternTwo14Hint' },
	15: { name: 'patternTwo15', hint: 'patternTwo15Hint' },
	16: { name: 'patternTwo16', hint: 'patternTwo16Hint' },
	17: { name: 'patternTwo17', hint: 'patternTwo17Hint' },
	18: { name: 'patternTwo18', hint: 'patternTwo18Hint' }
};

const THREE_TEXT: Record<ThreeNumber, { name: TranslationKey; hint: TranslationKey }> = {
	1: { name: 'patternThree1', hint: 'patternThree1Hint' },
	2: { name: 'patternThree2', hint: 'patternThree2Hint' },
	3: { name: 'patternThree3', hint: 'patternThree3Hint' },
	4: { name: 'patternThree4', hint: 'patternThree4Hint' },
	5: { name: 'patternThree5', hint: 'patternThree5Hint' },
	6: { name: 'patternThree6', hint: 'patternThree6Hint' },
	7: { name: 'patternThree7', hint: 'patternThree7Hint' },
	8: { name: 'patternThree8', hint: 'patternThree8Hint' },
	9: { name: 'patternThree9', hint: 'patternThree9Hint' },
	10: { name: 'patternThree10', hint: 'patternThree10Hint' }
};

/** The wallpaper group of each way of three shapes (two.test.ts holds the symmetries to it). */
export const THREE_GROUP: Record<ThreeNumber, string> = {
	1: 'p2',
	2: 'pgg',
	3: 'pm',
	4: 'pm',
	5: 'pmg',
	6: 'p4',
	7: 'p4g',
	8: 'pmm',
	9: 'pmm',
	10: 'p4m'
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
	if (rule.sides === 'two') return TWO_TEXT[rule.n];
	if (rule.sides === 'three') return THREE_TEXT[rule.n];
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
	if (rule.sides === 'three') return THREE_GROUP[rule.n];
	if (rule.sides === 'type') return rule.ih === 53 ? 'CCGG' : `IH${rule.ih}`;
	if (rule.sides === 'neighbour') return { mirror: 'G1G1G2G2', turn: 'C4C4C4C4', both: 'IH73' }[rule.link];
	if (rule.v === 'mirror' && rule.h === 'mirror') return 'G1G2G1G2';
	const [a, b] = [LETTER[rule.v], LETTER[rule.h]].sort((x, y) => 'TCG'.indexOf(x) - 'TCG'.indexOf(y));
	return `${a}${b}${a}${b}`;
}
