import { describe, expect, it } from 'vitest';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import type { Finger } from '$lib/types/heart';
import { getCenteredRectParams, inferOverlapRect } from '$lib/utils/overlapRect';
import { ALL_RULES, COMMON_RULES, freeSides, neighbours, opposite, ruleKey } from './rules';
import { cutCounts, fitLines, type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './starts';
import { knobTile } from './examples';
import {
	cutsAre,
	dragTile,
	editTile,
	followedPoint,
	frameHint,
	openedTile,
	patternSize,
	resizedTile,
	restartedTile,
	restoredTile,
	resumedTile,
	savedPattern,
	specialNodes,
	startPanDrag,
	startTileDrag,
	tileFingers,
	tileForRule,
	tileGrid,
	tileOfPattern,
	weaveParityOf
} from './escherTab';

/** Whether two tiles' curves are the same, to a millionth of a cell: a tile read back off its cuts comes back with rounding. */
const sameCurves = (a: PatternTile['curves'], b: PatternTile['curves']) =>
	JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()) &&
	Object.entries(a).every(([key, curve]) => {
		const other = b[key as keyof typeof b]!;
		return curve!.length === other.length && curve!.every((s, k) => (['p0', 'p1', 'p2', 'p3'] as const).every((q) => Math.hypot(s[q].x - other[k]![q].x, s[q].y - other[k]![q].y) < 1e-6));
	});

const heartOf = (tile: PatternTile) => {
	const fingers = tileFingers(tile);
	return { fingers, gridSize: tileGrid(tile), rect: getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 }), weaveParity: weaveParityOf(tile) };
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

	it("reads the gallery's Dag og nat, drawn from Escher's birds before the tab was there, as two shapes leaning, a cell 28 hundredths of the square", () => {
		const design = loadHeart('dagognat');
		// as Tegn numbers the cuts, from the top and from the left, the square's edges first and last
		const sorted = (lobe: 'left' | 'right', axis: 'x' | 'y', prefix: string) =>
			design.fingers
				.filter((f) => f.lobe === lobe)
				.sort((a, b) => a.segments[0]!.p0[axis] - b.segments[0]!.p0[axis])
				.map((f, k) => ({ ...f, id: `${prefix}-${k}` }));
		const fingers = [...sorted('left', 'y', 'L'), ...sorted('right', 'x', 'R')];
		const heart = { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize), weaveParity: design.weaveParity as 0 | 1 };
		const tile = resumedTile(null, heart)!;
		expect(ruleKey(tile.rule)).toBe('free');
		expect(tile.offset!.x).toBeCloseTo(0.9795, 3);
		expect(tile.offset!.y).toBeCloseTo(-0.6626, 3);
		// the size of a cell, as a part of the square, and not turned
		const { x, y } = tile.shape!;
		expect(Math.hypot(x.x, x.y) / (tile.cuts + 1)).toBeCloseTo(0.28, 3);
		expect(Math.hypot(y.x, y.y) / (tile.cuts + 1)).toBeCloseTo(0.28, 3);
		expect(Math.abs(x.y) + Math.abs(y.x)).toBeLessThan(1e-6);
		expect(weaveParityOf(tile)).toBe(heart.weaveParity);
	});

	it('opens on a type: on cuts that are a tile, that tile as it is; on any other heart, the first type the tab offers, drawn as it starts', () => {
		const tile = { ...knobTile(opposite('move', 'turn')), cuts: 3 };
		const taken = openedTile(null, heartOf(tile));
		expect(taken.drawn).toBe(false);
		expect(ruleKey(taken.tile.rule)).toBe('opposite:move:turn');
		expect(sameCurves(taken.tile.curves, tile.curves)).toBe(true);
		// a plain chequerboard is a tile of every type, with nothing to keep
		const plain = heartOf({ rule: opposite('move', 'move'), cuts: 3, curves: {} });
		expect(openedTile(null, plain)).toEqual({ tile: fitLines(ruleStart(COMMON_RULES[0]!, 3)), drawn: true });
		// left for the Normal tab and changed there: the tile the tab was left with, drawn again
		expect(openedTile(tile, plain)).toEqual({ tile, drawn: true });
		expect(restartedTile(tile)).toEqual(fitLines(ruleStart(opposite('move', 'turn'), 3)));
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

	it('says what the black points do for each kind of type: stretch the tiles, or grow them where the type keeps them square or rhombic', () => {
		expect(frameHint(ruleStart(opposite('move', 'move'), 2))).toBe('patternPointsStretch');
		expect(frameHint(ruleStart(opposite('mirror', 'mirror'), 2))).toBe('patternPointsStretch');
		expect(frameHint(ruleStart(neighbours('mirror'), 2))).toBe('patternPointsGrow');
		expect(frameHint(ruleStart(neighbours('both'), 2))).toBe('patternPointsGrow');
	});

	it('sizes stretched and turned tiles a cell of the n × n grid, keeping how they are stretched and turned', () => {
		const tile = { ...ruleStart(opposite('move', 'move'), 3), shape: { x: { x: 0.9, y: 0.2 }, y: { x: -0.3, y: 1.35 } } };
		expect(patternSize(tile)).toBeNull();
		const sized = resizedTile(tile, 5)!;
		expect(sized.cuts).toBe(4);
		expect(patternSize(sized)).toBe(5);
		const { x, y } = sized.shape!;
		expect(Math.atan2(x.y, x.x)).toBeCloseTo(Math.atan2(0.2, 0.9), 12);
		expect(Math.hypot(x.x, x.y) / Math.hypot(y.x, y.y)).toBeCloseTo(Math.hypot(0.9, 0.2) / Math.hypot(-0.3, 1.35), 12);
		expect(patternSize(ruleStart(opposite('move', 'move'), 3))).toBe(4);
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

	it('sizes and turns the tiles with a point of the tiling, the point staying under the pointer, and moves the pattern with a cut', () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const { fingers, rect } = heartOf(tile);
		const [anchor, kind] = [...specialNodes(tile, 'R-2').entries()].sort(([a], [b]) => a - b).find(([a, k]) => a > 1 && k === 'frame')!;
		const was = fingers.find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
		const drag = startTileDrag(tile, 'R-2', anchor, kind, was)!;
		if (drag.mode !== 'frame') throw new Error('a crossing starts a frame drag');
		const delta = { x: 0.2 * (rect.width / 5), y: 0.1 * (rect.width / 5) };
		const next = dragTile(drag, delta, rect)!;
		expect(next.shape).toBeDefined();
		const pointer = { x: was.x + delta.x, y: was.y + delta.y };
		const at = followedPoint(drag, next, pointer, rect)!;
		const p = tileFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0;
		expect(Math.hypot(p.x - pointer.x, p.y - pointer.y)).toBeLessThan(1e-6);
		// a cut dragged moves the whole pattern, by as much
		const moved = dragTile(startPanDrag(tile, was, 'right'), { x: 0.3 * (rect.width / 5), y: 0 }, rect)!;
		expect(moved.pan?.x).toBeCloseTo(0.3);
		expect(moved.shape).toBeUndefined();
	});

	it('keeps a moved, leaning, stretched and turned tile through saving and reading back, the lines it cuts with it', () => {
		const tile = fitLines({ ...ruleStart(freeSides(), 2), offset: { x: 0.1, y: -0.05 }, shape: { x: { x: 0.8, y: 0.15 }, y: { x: -0.1, y: 1.2 } }, pan: { x: 0.4, y: 0.1 } });
		expect(tile.lines).toBeDefined();
		const saved = JSON.parse(JSON.stringify(savedPattern(tile)));
		expect(saved.rule).toBe('free');
		expect(tileOfPattern(saved)).toEqual(tile);
		// a shape turned inside out is none of ours
		expect(tileOfPattern({ ...saved, shape: [0, 1, 1, 0] })).toBeNull();
	});

	it('opens a saved heart on its tile only while the cuts are still its own', () => {
		const tile = fitLines({ ...ruleStart(opposite('move', 'move'), 3), pan: { x: 0.4, y: 0 } });
		const heart = heartOf(tile);
		const saved = savedPattern(tile);
		expect(restoredTile(saved, heart)).toEqual(tile);
		// a cut changed since, or a tile of no type of ours, or more lines than a moved pattern cuts
		const bent = heart.fingers.map((f): Finger =>
			f.id === 'R-2' ? { ...f, segments: f.segments.map((s, k) => (k === 1 ? { ...s, p3: { x: s.p3.x + 5, y: s.p3.y } } : s)) } : f
		);
		expect(restoredTile(saved, { ...heart, fingers: bent })).toBeNull();
		expect(restoredTile({ ...saved, rule: 'ih99' }, heart)).toBeNull();
		expect(tileOfPattern({ ...saved, lines: { V: [0, 25], H: [1, 3] } })).toBeNull();
		expect(tileOfPattern({ ...saved, lines: { V: [0, 0], H: [1, 3] } })).toBeNull();
	});
});
