import { describe, expect, it } from 'vitest';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { ALL_RULES, SIDE_LINKS, freeSides, halfOf, neighbours, opposite, ruleInfo, ruleKey, sameRule } from './rules';
import { patternToDesign, straightCurve, type PatternTile } from './tiling';
import { carryCurves, isStraightTile, ruleCode, ruleStart, ruleText, switchRule } from './presets';
import { EXAMPLES, exampleTile, knobTile } from './examples';

const problems = (tile: PatternTile) => {
	const design = patternToDesign(tile, { name: ruleKey(tile.rule) });
	return [...findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize)))];
};

describe('pattern rules and their starting tiles', () => {
	it('has every way of tying the sides, once, and the types a woven heart allows besides', () => {
		// thirteen ways of tying the sides in three families, and nineteen more of McLean's types
		expect(ALL_RULES).toHaveLength(32);
		expect(new Set(ALL_RULES.map(ruleKey)).size).toBe(ALL_RULES.length);
	});

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

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('starts %s from low peaks of straight lines on the plain grid, which weave at every size', (_key, rule) => {
		const tile = ruleStart(rule, 3);
		expect(sameRule(tile.rule, rule)).toBe(true);
		expect(tile.cuts).toBe(3);
		expect(tile.offset).toBeUndefined();
		expect(isStraightTile(tile)).toBe(false);
		// every piece straight: its handles on its ends
		for (const curve of Object.values(tile.curves)) for (const s of curve!) expect([s.p1, s.p2]).toEqual([s.p0, s.p3]);
		for (const cuts of [2, 3, 4, 5, 6]) expect(problems({ ...tile, cuts }), `${cuts} cuts`).toEqual([]);
	});

	// McLean's other types have no knobs of their own: their knob tile is their start, checked above.
	it.each(ALL_RULES.filter((rule) => rule.sides !== 'type').map((rule) => [ruleKey(rule), rule] as const))(
		'draws the knob tile of %s so that it weaves at every size',
		(_key, rule) => {
			for (const cuts of [2, 3, 4, 5, 6]) expect(problems({ ...knobTile(rule), cuts }), `${cuts} cuts`).toEqual([]);
		}
	);

	it('carries over the curves the new rule reads the same way: tying one pair differently keeps the other as drawn', () => {
		const tc = { ...knobTile(opposite('move', 'turn')), cuts: 3 };
		// the moved pair, now mirrored, keeps its curve; the S pair stays as it is
		const gc = carryCurves(tc, opposite('mirror', 'turn'));
		expect(gc.curves).toEqual(tc.curves);
		// the moved pair, now S sides, starts as the new rule starts; the S pair stays as it is
		const cc = carryCurves(tc, opposite('turn', 'turn'));
		const windmill = ruleStart(opposite('turn', 'turn'), 3);
		expect(cc.curves.ne).toEqual(tc.curves.ne);
		expect(cc.curves.sw).toEqual(tc.curves.sw);
		expect(cc.curves.nw).toEqual(windmill.curves.nw);
		expect(cc.curves.se).toEqual(windmill.curves.se);
		// a whole side is not half an S: with nothing to keep, the new rule's start
		expect(carryCurves(windmill, freeSides())).toEqual(ruleStart(freeSides(), 3));
		// the lean goes along only where the new rule lets tiles lean
		const waves = { ...ruleStart(freeSides(), 3), offset: { x: 0.2, y: -0.1 } };
		const arrows = carryCurves(waves, neighbours('mirror'));
		expect(arrows.curves.nw).toEqual(waves.curves.nw);
		expect(arrows.curves.se).toEqual(waves.curves.se);
		expect(arrows.offset).toBeUndefined();
		// and a tile that does not lean takes no lean: mirrored neighbours, given two shapes, keep their
		// two curves on the plain grid and take the other two from the new rule's start
		const mirrored = exampleTile(EXAMPLES.find((p) => p.id === 'arrows')!);
		const shapes = carryCurves(mirrored, freeSides());
		expect(shapes.offset).toBeUndefined();
		expect(shapes.curves.nw).toEqual(mirrored.curves.nw);
		expect(shapes.curves.ne).toEqual(ruleStart(freeSides(), 3).curves.ne);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('switches every example and every knob tile to %s as a tile that weaves', (_key, rule) => {
		const from = [...EXAMPLES.map((p) => [p.id, exampleTile(p)] as const), ...ALL_RULES.map((r) => [`knobs ${ruleKey(r)}`, knobTile(r)] as const)];
		// Many tiles carry over to the same one (with nothing to keep, the rule's start): each is checked once.
		const verdicts = new Map<string, boolean>();
		const weaves = (tile: PatternTile) => {
			const key = JSON.stringify(tile);
			if (!verdicts.has(key)) verdicts.set(key, problems(tile).length === 0);
			return verdicts.get(key)!;
		};
		for (const [name, tile] of from) {
			for (const cuts of [2, 5]) {
				const shown = switchRule(tile, rule, cuts, weaves);
				// the curves carried over where they weave, else the rule's start, which weaves at every size
				expect(shown, `${name} at ${cuts} cuts`).toEqual(weaves(carryCurves(tile, rule, cuts)) ? carryCurves(tile, rule, cuts) : ruleStart(rule, cuts));
			}
		}
	});

	it("starts afresh where the curves it would keep come too close to the new rule's own", () => {
		// The windmill's S sides are half circles, which meet a crossing square on; beside a peak, the cut
		// turns back on itself there, closer than the paper allows.
		const windmill = exampleTile(EXAMPLES.find((p) => p.id === 'windmill')!);
		const weaves = (tile: PatternTile) => problems(tile).length === 0;
		const carried = carryCurves(windmill, opposite('mirror', 'turn'), 2);
		expect(weaves(carried)).toBe(false);
		expect(switchRule(windmill, opposite('mirror', 'turn'), 2, weaves)).toEqual(ruleStart(opposite('mirror', 'turn'), 2));
		// where they do weave, they are kept
		const kept = switchRule(windmill, opposite('turn', 'turn'), 2, weaves);
		expect(kept.curves).toEqual(windmill.curves);
	});

	it('tells a plain chequerboard from a tile with shapes', () => {
		for (const rule of ALL_RULES) {
			const straight = { rule, cuts: 3, curves: Object.fromEntries(ruleInfo(rule).curves.map((k) => [k, straightCurve(!!halfOf(rule, k))])) };
			expect(isStraightTile(straight), ruleKey(rule)).toBe(true);
			expect(isStraightTile(knobTile(rule)), ruleKey(rule)).toBe(false);
		}
		for (const preset of EXAMPLES) expect(isStraightTile(exampleTile(preset)), preset.id).toBe(false);
	});
});
