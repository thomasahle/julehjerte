import { describe, expect, it } from 'vitest';
import { ALL_RULES, SIDE_LINKS, opposite, ruleKey } from './rules';
import { ruleCode, ruleText } from './names';

describe('the rules in words', () => {
	it('names each rule and says what it does; opposite pairs tied two ways read the same either way round', () => {
		for (const rule of ALL_RULES) {
			const { name, hint } = ruleText(rule);
			expect(name, ruleKey(rule)).not.toBe(hint);
		}
		for (const v of SIDE_LINKS) for (const h of SIDE_LINKS) expect(ruleText(opposite(v, h))).toEqual(ruleText(opposite(h, v)));
		// thirteen ways, three of them the same tile type turned a quarter, and nineteen types more
		expect(new Set(ALL_RULES.map((r) => ruleText(r).name)).size).toBe(29);
	});

	it("gives Heesch's name for each of his four-sided types a woven heart allows, and Grünbaum and Shephard's number for the others", () => {
		expect(ALL_RULES.map(ruleCode)).toEqual([
			null, // free sides: two shapes, not one tile
			'TTTT',
			'TGTG',
			'TCTC',
			'TGTG',
			'G1G2G1G2',
			'CGCG',
			'TCTC',
			'CGCG',
			'CCCC',
			'G1G1G2G2',
			'C4C4C4C4',
			'IH73', // a tile that is its own mirror image: not one of his types
			'IH42',
			'IH45',
			'IH49',
			'IH50',
			'CCGG', // the one his types have, of the others
			'IH54',
			'IH56',
			'IH57',
			'IH58',
			'IH59',
			'IH61',
			'IH62',
			'IH64',
			'IH66',
			'IH67',
			'IH68',
			'IH69',
			'IH71',
			'IH74'
		]);
	});

});
