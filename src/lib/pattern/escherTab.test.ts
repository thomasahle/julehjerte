import { describe, expect, it } from 'vitest';
import type { Finger } from '$lib/types/heart';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { ALL_RULES, cutCounts, fitLines, freeSides, opposite, ruleKey, type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './presets';
import { knobTile } from './examples';
import { cornerHint, cutsAre, dragTile, editTile, followedPoint, resizedTile, resumedTile, specialNodes, startTileDrag, tileFingers, tileForRule, tileGrid } from './escherTab';

/** Whether two tiles' curves are the same, to a millionth of a cell: a tile read back off its cuts comes back with rounding. */
const sameCurves = (a: PatternTile['curves'], b: PatternTile['curves']) =>
	JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()) &&
	Object.entries(a).every(([key, curve]) => {
		const other = b[key as keyof typeof b]!;
		return curve!.length === other.length && curve!.every((s, k) => (['p0', 'p1', 'p2', 'p3'] as const).every((q) => Math.hypot(s[q].x - other[k]![q].x, s[q].y - other[k]![q].y) < 1e-6));
	});

const heartOf = (tile: PatternTile) => {
	const fingers = tileFingers(tile);
	return { fingers, gridSize: tileGrid(tile), rect: getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 }) };
};

describe("Tegn's Escher tab", () => {
	it("draws a tile's cuts between the square's edges, the far edges numbered after the last cut", () => {
		const tile = ruleStart(opposite('move', 'move'), 2);
		expect(tileFingers(tile).map((f) => f.id)).toEqual(['L-0', 'L-1', 'L-2', 'L-3', 'R-0', 'R-1', 'R-2', 'R-3']);
		// moved four tenths of a cell, the right lobe's wide edge strip takes the next line
		const moved = fitLines({ ...tile, pan: { x: 0.4, y: 0 } });
		expect(cutCounts(moved)).toEqual({ V: 3, H: 2 });
		expect(tileGrid(moved)).toEqual({ x: 4, y: 3 });
		const fingers = tileFingers(moved);
		expect(fingers.map((f) => f.id)).toEqual(['L-0', 'L-1', 'L-2', 'L-3', 'R-0', 'R-1', 'R-2', 'R-3', 'R-4']);
		// the edges are the square's, straight
		const rect = getCenteredRectParams({ x: 3, y: 3 });
		const edge = (id: string) => fingers.find((f) => f.id === id)!.segments[0]!;
		expect([edge('R-0').p0.x, edge('R-4').p0.x, edge('L-0').p0.y, edge('L-3').p0.y]).toEqual([rect.left, rect.right, rect.top, rect.bottom]);
		expect(edge('R-4').p1).toEqual(edge('R-4').p0);
	});

	it('starts a type on a plain heart as the type starts, at the heart’s size', () => {
		// a chequerboard: every side straight, a tile of every type, with nothing to keep
		const plain = heartOf({ rule: opposite('move', 'move'), cuts: 3, curves: {} });
		expect(tileForRule(freeSides(), null, plain)).toEqual(ruleStart(freeSides(), 3));
	});

	it('keeps the curves a new type reads the same way, and takes up cuts that already are a tile of it', () => {
		const tc = { ...knobTile(opposite('move', 'turn')), cuts: 3 };
		const gc = tileForRule(opposite('mirror', 'turn'), tc, heartOf(tc));
		expect(ruleKey(gc.rule)).toBe('opposite:mirror:turn');
		expect(gc.curves).toEqual(tc.curves);
		// no tile yet, but the cuts are one: taken up as it is
		expect(sameCurves(tileForRule(opposite('move', 'turn'), null, heartOf(tc)).curves, tc.curves)).toBe(true);
	});

	it('takes the tile it was left with up again only while the cuts are still the ones it makes', () => {
		const tile = { ...knobTile(opposite('move', 'move')), cuts: 3 };
		const heart = heartOf(tile);
		expect(resumedTile(tile, heart)).toBe(tile);
		// a cut changed in the Normal tab: the tile is left behind, and the cuts are no tile of any type
		const bent = heart.fingers.map((f): Finger =>
			f.id === 'R-2' ? { ...f, segments: f.segments.map((s, k) => (k === 1 ? { ...s, p1: { x: s.p1.x + 20, y: s.p1.y } } : s)) } : f
		);
		expect(cutsAre(bent, tileFingers(tile))).toBe(false);
		expect(resumedTile(tile, { ...heart, fingers: bent })).toBeNull();
		// left with no tile, cuts drawn from one are read back into it, of its own type and not two shapes,
		// which fit every tile
		const back = resumedTile(null, heart)!;
		expect(ruleKey(back.rule)).toBe('opposite:move:move');
		expect(sameCurves(back.curves, tile.curves)).toBe(true);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('reads the %s start back as that type: it is a tile of no more symmetric one', (_key, rule) => {
		for (const cuts of [2, 4]) expect(ruleKey(resumedTile(null, heartOf(ruleStart(rule, cuts)))!.rule), `${cuts} cuts`).toBe(ruleKey(rule));
	});

	it('refuses a size the pattern is too tight for: the paper between two cuts keeps its width in the heart', () => {
		// a thin finger of paper, six hundredths of a cell wide: two units wide in a 3 × 3 heart, less
		// than one in a 7 × 7 one
		const finger: SideCurve = [
			[0, 0, 0.4, 0],
			[0.4, 0, 0.4, 0.3],
			[0.4, 0.3, 0.46, 0.3],
			[0.46, 0.3, 0.46, 0],
			[0.46, 0, 1, 0]
		].map(([ax, ay, bx, by]) => ({ p0: { x: ax!, y: ay! }, p1: { x: ax!, y: ay! }, p2: { x: bx!, y: by! }, p3: { x: bx!, y: by! } }));
		const tile: PatternTile = { rule: opposite('move', 'move'), cuts: 2, curves: { vertical: finger } };
		expect(resizedTile(tile, 3)).not.toBeNull();
		expect(resizedTile(tile, 7)).toBeNull();
		expect(resizedTile(ruleStart(opposite('move', 'move'), 2), 7)?.cuts).toBe(6);
	});

	it('says what the crossings do for each kind of type', () => {
		expect(cornerHint(ruleStart(opposite('move', 'move'), 2))).toBe('patternCornersPan');
		expect(cornerHint(ruleStart(opposite('turn', 'turn'), 2))).toBe('patternCornersHalfturn');
		expect(cornerHint(ruleStart(freeSides(), 2))).toBe('patternCornersLean');
	});

	it("reads an edit to one of the tile's cuts back into the tile, and leaves the square's edges alone", () => {
		const tile = ruleStart(opposite('move', 'move'), 3);
		const { fingers, rect } = heartOf(tile);
		expect(editTile(tile, fingers.find((f) => f.id === 'R-0')!, rect)).toBeNull();
		const cut = fingers.find((f) => f.id === 'R-2')!;
		const moved = { ...cut, segments: cut.segments.map((s, k) => (k === 1 ? { ...s, p3: { x: s.p3.x + 6, y: s.p3.y } } : s)) };
		const edit = editTile(tile, moved, rect)!;
		expect(edit.tile.curves).not.toEqual(tile.curves);
		expect(edit.cuts.map((f) => f.id)).toEqual(['L-1', 'L-2', 'L-3', 'R-1', 'R-2', 'R-3']);
	});

	it('moves the whole pattern with a point the type fixes, the point staying under the pointer', () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const { fingers, rect } = heartOf(tile);
		const [anchor, kind] = [...specialNodes(tile, 'R-2').entries()].find(([, k]) => k === 'pan')!;
		const was = fingers.find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
		const drag = startTileDrag(tile, 'R-2', anchor, kind, was)!;
		if (drag.mode !== 'corner') throw new Error('a crossing starts a corner drag');
		const delta = { x: 0.3 * (rect.width / 5), y: 0 };
		const next = dragTile(drag, delta, rect)!;
		expect(next.pan?.x).toBeCloseTo(0.3);
		const pointer = { x: was.x + delta.x, y: was.y + delta.y };
		const at = followedPoint(drag, next, pointer, rect)!;
		const p = tileFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0;
		expect(Math.hypot(p.x - pointer.x, p.y - pointer.y)).toBeLessThan(1e-6);
	});
});
