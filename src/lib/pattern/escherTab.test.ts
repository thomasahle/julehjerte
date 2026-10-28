import { describe, expect, it } from 'vitest';
import { HEARTS_INDEX as hearts } from '$lib/data/heartsIndex';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import type { Finger } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { getCenteredRectParams, inferOverlapRect } from '$lib/utils/overlapRect';
import { ALL_RULES, COMMON_RULES, freeSides, neighbours, opposite, ruleInfo, ruleKey, twoShapes } from './rules';
import { carryNodeTypes, cutCounts, fitLines, tileTurn, unturnedShape, type PatternTile, type SideCurve } from './tiling';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { ruleStart } from './starts';
import { knobTile } from './examples';
import { wholeTileArea } from './centre';
import {
	canFloat,
	centredTile,
	cutsAre,
	floatedTile,
	floatingOf,
	dragTile,
	editTile,
	followedPoint,
	frameChip,
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
	turnDegrees,
	turnedTile,
	turnRange,
	weaveParityOf
} from './escherTab';

/** Whether two tiles' curves are the same, to a millionth of a cell: a tile read back off its cuts comes back with rounding. */
const sameCurves = (a: PatternTile['curves'], b: PatternTile['curves']) =>
	JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()) &&
	Object.entries(a).every(([key, curve]) => {
		const other = b[key as keyof typeof b]!;
		return curve!.length === other.length && curve!.every((s, k) => (['p0', 'p1', 'p2', 'p3'] as const).every((q) => Math.hypot(s[q].x - other[k]![q].x, s[q].y - other[k]![q].y) < 1e-6));
	});

/** A heart's cuts as Tegn numbers them, from the top and from the left, the square's edges first and last. */
function sortedAsTegn(fingers: Finger[]): Finger[] {
	const sorted = (lobe: 'left' | 'right', axis: 'x' | 'y', prefix: string) =>
		fingers
			.filter((f) => f.lobe === lobe)
			.sort((a, b) => a.segments[0]!.p0[axis] - b.segments[0]!.p0[axis])
			.map((f, k) => ({ ...f, id: `${prefix}-${k}` }));
	return [...sorted('left', 'y', 'L'), ...sorted('right', 'x', 'R')];
}

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
		const fingers = sortedAsTegn(design.fingers);
		const heart = { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize), weaveParity: design.weaveParity as 0 | 1 };
		const tile = resumedTile(null, heart)!;
		expect(ruleKey(tile.rule)).toBe('free');
		expect(tile.corners![0]).toBeCloseTo(0.9795, 3);
		expect(tile.corners![1]).toBeCloseTo(-0.6626, 3);
		// the size of a cell, as a part of the square, and not turned
		const { x, y } = tile.shape!;
		expect(Math.hypot(x.x, x.y) / (tile.cuts + 1)).toBeCloseTo(0.28, 3);
		expect(Math.hypot(y.x, y.y) / (tile.cuts + 1)).toBeCloseTo(0.28, 3);
		expect(Math.abs(x.y) + Math.abs(y.x)).toBeLessThan(1e-6);
		expect(weaveParityOf(tile)).toBe(heart.weaveParity);
	});

	it("centres the gallery's Dag og nat: the pattern moved so that twice as much of the heart is whole birds, and there it stays", () => {
		const design = loadHeart('dagognat');
		const fingers = sortedAsTegn(design.fingers);
		const tile = resumedTile(null, { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize), weaveParity: design.weaveParity as 0 | 1 })!;
		const centred = centredTile(tile)!;
		// Two birds whole of the square's 10 000, then four.
		expect(wholeTileArea(tile)).toBeCloseTo(1568, 0);
		expect(wholeTileArea(centred)).toBeCloseTo(3136, 0);
		const made = tileFingers(centred), grid = tileGrid(centred);
		expect(findFingersWithIssues(made, intersectionMarginPx(inferOverlapRect(made, grid), gridClearanceScale(grid.x, grid.y))).size).toBe(0);
		// Pressed again, nothing moves.
		expect(centredTile(centred)!.pan).toEqual(centred.pan);
	});

	it("centres the gallery's Dag og nat at 3 × 3 turned half a degree, where its birds fill nearly twice as much", () => {
		const design = loadHeart('dagognat');
		const fingers = sortedAsTegn(design.fingers);
		const tile = resizedTile(resumedTile(null, { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize), weaveParity: design.weaveParity as 0 | 1 })!, 3)!;
		const centred = centredTile(tile)!;
		expect(wholeTileArea(tile)).toBeCloseTo(1138, 0);
		expect(wholeTileArea(centred)).toBeCloseTo(2222, 0);
		expect(turnDegrees(centred)).toBeCloseTo(-0.5, 6);
	});

	it("opens the gallery's tilings (Fliser) on the Escher tab, as Tegn does: on the tile each was saved with, else on one its cuts are", () => {
		// Tilings that open in the Normal tab: Origami is Tre former 6 (its red tiles two shapes, its white
		// ones a third, the colours swapped) in its middle, but its edge strips are cut off straight where the
		// tiling would go on; Plus repeats only in its middle, its cut ends each their own.
		const noTypeYet = ['plus', 'origami'];
		const fliser = hearts.categories.find((c) => c.id === 'fliser')!.hearts;
		for (const id of fliser) {
			const design = loadHeart(id);
			const fingers = sortedAsTegn(design.fingers);
			const heart = { fingers, gridSize: design.gridSize, rect: inferOverlapRect(fingers, design.gridSize), weaveParity: design.weaveParity as 0 | 1 };
			const saved = design.pattern ? restoredTile(design.pattern, heart) : null;
			if (design.pattern) expect(saved, `${id} is its saved tile`).not.toBeNull();
			if (noTypeYet.includes(id)) expect(saved ?? resumedTile(null, heart), id).toBeNull();
			else expect(saved ?? resumedTile(null, heart), id).not.toBeNull();
		}
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
		// a thin finger of paper, five hundredths of a cell wide: 1.7 units wide in a 3 × 3 heart, where
		// cuts may come 1.5 apart, and 0.7 in a 7 × 7 one, where they may come 0.86 apart
		const finger: SideCurve = [
			[0, 0, 0.4, 0],
			[0.4, 0, 0.4, 0.3],
			[0.4, 0.3, 0.45, 0.3],
			[0.45, 0.3, 0.45, 0],
			[0.45, 0, 1, 0]
		].map(([ax, ay, bx, by]) => ({ p0: { x: ax!, y: ay! }, p1: { x: ax!, y: ay! }, p2: { x: bx!, y: by! }, p3: { x: bx!, y: by! } }));
		const tile: PatternTile = { rule: opposite('move', 'move'), cuts: 2, curves: { vertical: finger } };
		expect(resizedTile(tile, 3)).not.toBeNull();
		expect(resizedTile(tile, 7)).toBeNull();
		expect(resizedTile(ruleStart(opposite('move', 'move'), 2), 7)?.cuts).toBe(6);
	});

	it('judges a size by the gap the red cuts keep at it, which a denser grid makes finer', () => {
		// a knob reaching nearly into the next tile's: nearer it than 1.5 units in a 6 × 6 heart, the
		// gap on 3 × 3 and 4 × 4, but not nearer than 1, the gap on 6 × 6
		const k = (4 / 3) * -0.925;
		const knob: SideCurve = [
			{ p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 0.1, y: 0 }, p3: { x: 0.1, y: 0 } },
			{ p0: { x: 0.1, y: 0 }, p1: { x: 0.1, y: k }, p2: { x: 0.6, y: k }, p3: { x: 0.6, y: 0 } },
			{ p0: { x: 0.6, y: 0 }, p1: { x: 0.6, y: 0 }, p2: { x: 1, y: 0 }, p3: { x: 1, y: 0 } }
		];
		const sized = resizedTile({ rule: freeSides(), cuts: 2, curves: { nw: knob } }, 6)!;
		expect(sized).not.toBeNull();
		const { fingers, gridSize } = heartOf(sized);
		const rect = inferOverlapRect(fingers, gridSize);
		expect(findFingersWithIssues(fingers, intersectionMarginPx(rect, gridClearanceScale(gridSize.x, gridSize.y))).size).toBe(0);
		expect(findFingersWithIssues(fingers, intersectionMarginPx(rect)).size).toBeGreaterThan(0);
	});

	it('says what the black points do for each kind of type: stretch and slant the tiles, only stretch them where the type keeps them rectangular, grow and slant them where rhombic, only grow them where square', () => {
		expect(frameHint(ruleStart(opposite('move', 'move'), 2))).toBe('patternPointsSlant');
		expect(frameHint(ruleStart(opposite('mirror', 'mirror'), 2))).toBe('patternPointsStretch');
		expect(frameHint(ruleStart(neighbours('mirror'), 2))).toBe('patternPointsGrowSlant');
		expect(frameHint(ruleStart(neighbours('both'), 2))).toBe('patternPointsGrow');
		// and so does the line above the heart for a black point chosen
		expect(frameChip(ruleStart(opposite('move', 'move'), 2))).toBe('patternPointSlant');
		expect(frameChip(ruleStart(neighbours('both'), 2))).toBe('patternPointGrow');
	});

	it('gives every copy of a curve the node types the visitor gave it, keeps them through saving, and on their nodes as the curve gains one', () => {
		const start = ruleStart(opposite('move', 'move'), 3);
		const key = ruleInfo(start.rule).curves[0]!;
		const split = splitBezierAt(start.curves[key]![0]!, 0.5);
		const plain: PatternTile = { ...start, curves: { ...start.curves, [key]: split } };
		const typed: PatternTile = { ...plain, nodeTypes: { [key]: { '1': 'corner' } } };
		// the node splits a bent curve smoothly, so only the type makes it a corner, on every copy
		const corners = (tile: PatternTile) => tileFingers(tile).flatMap((f) => Object.values(f.nodeTypes ?? {})).filter((t) => t === 'corner').length;
		const copies = tileFingers(plain).filter((f) => f.segments.length > 4).length;
		expect(corners(typed) - corners(plain)).toBeGreaterThanOrEqual(copies);
		// saved and read back
		expect(tileOfPattern(JSON.parse(JSON.stringify(savedPattern(typed))))).toEqual(typed);
		// a node added before it: the type stays on its node, now the second
		const more: PatternTile = { ...typed, curves: { ...typed.curves, [key]: [...splitBezierAt(split[0]!, 0.5), split[1]!] } };
		expect(carryNodeTypes(typed, more).nodeTypes).toEqual({ [key]: { '2': 'corner' } });
		// the node removed: the type goes with it
		expect(carryNodeTypes(typed, start).nodeTypes).toBeUndefined();
	});

	it('turns the pattern by the turn control, in degrees, as far as keeps every side within 15° of its axis, and keeps the turn through saving', () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		expect(turnDegrees(tile)).toBe(0);
		expect(turnRange(tile)[0]).toBeCloseTo(-15, 9);
		expect(turnRange(tile)[1]).toBeCloseTo(15, 9);
		const turned = turnedTile(tile, 7.5)!;
		expect(turnDegrees(turned)).toBeCloseTo(7.5, 9);
		expect(turnDegrees(turnedTile(tile, 20)!)).toBeCloseTo(15, 9);
		const saved = JSON.parse(JSON.stringify(savedPattern(turned)));
		expect(saved.turn).toBeCloseTo((7.5 * Math.PI) / 180, 12);
		expect(tileOfPattern(saved)).toEqual(turned);
		// a shape saved before the turn was kept apart: the turn its sides share
		const { turn: _turn, ...older } = saved;
		expect(tileTurn(tileOfPattern(older)!)).toBeCloseTo((7.5 * Math.PI) / 180, 12);
		const own = unturnedShape(tileOfPattern(older)!);
		expect(Math.hypot(own.x.x - 1, own.x.y)).toBeLessThan(1e-12);
	});

	it('sizes stretched, slanted and turned tiles a cell of the n × n grid, keeping how they are stretched, slanted and turned', () => {
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

	it('sizes and slants the tiles with a point of the tiling, the point staying under the pointer, and moves the pattern with a cut', () => {
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
		const tile = fitLines({ ...ruleStart(freeSides(), 2), corners: [0.1, -0.05], shape: { x: { x: 0.8, y: 0.15 }, y: { x: -0.1, y: 1.2 } }, pan: { x: 0.4, y: 0.1 } });
		expect(tile.lines).toBeDefined();
		const saved = JSON.parse(JSON.stringify(savedPattern(tile)));
		expect(saved.rule).toBe('free');
		expect(tileOfPattern(saved)).toEqual(tile);
		// a shape turned inside out is none of ours
		expect(tileOfPattern({ ...saved, shape: [0, 1, 1, 0] })).toBeNull();
	});

	it('floats one colour of a type of two shapes, the other joining across the joints, and keeps it through saving and reading back', () => {
		expect(ALL_RULES.filter(canFloat).map(ruleKey)).toEqual(ALL_RULES.filter((r) => r.sides === 'free' || r.sides === 'two' || r.sides === 'three').map(ruleKey));
		const tile = fitLines(ruleStart(twoShapes(14), 4));
		expect(floatingOf(tile)).toBeNull();
		const red = floatedTile(tile, 'red')!;
		expect(floatingOf(red)).toBe('red');
		expect(red.joints!.join).toBe('white');
		expect(floatingOf(floatedTile(red, 'white')!)).toBe('white');
		expect(floatedTile(red, null)).toEqual(fitLines(tile));
		const back = tileOfPattern(JSON.parse(JSON.stringify(savedPattern(red))))!;
		expect(back.joints).toEqual(red.joints);
		expect(restoredTile(savedPattern(red), heartOf(red))).not.toBeNull();
		// and the tab reads the cuts back as the same tile, joints and all
		expect(resumedTile(null, heartOf(red))?.joints?.join).toBe('white');
		// a type whose motions swap the colours lets neither float
		expect(floatedTile(fitLines(ruleStart(opposite('move', 'move'), 4)), 'red')).toBeNull();
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
