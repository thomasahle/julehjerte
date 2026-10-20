import { describe, expect, it } from 'vitest';
import type { BezierSegment, Finger, Vec } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { getCenteredRectParams, inferOverlapRect } from '$lib/utils/overlapRect';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { ALL_RULES, freeSides, halfOf, latticeOf, neighbours, opposite, ruleRepeat, ruleInfo, ruleKey, stretchSource, type CurveKey, type TileRule } from './rules';
import { cellsToRaw, crossing, cutCounts, firstLine, fitLines, patternCuts, patternToDesign, sourceCurve, straightCurve, tileShape, type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './starts';
import { EXAMPLES, exampleTile, knobTile } from './examples';
import {
	cutOfFinger,
	cutsAre,
	followEdit,
	generateEditorFingers,
	anchorOfPlacedPoint,
	dragPlacedPoint,
	locatePlacedPoint,
	panBy,
	nodeAtCutEnd,
	placedPointAt,
	slideCutEnd,
	readTile,
	specialNodes,
	tileAfterFingerEdit,
	weaveParityOf
} from './editorBridge';

/** A tile with straight sides for every curve its rule reads. */
const straightTile = (rule: TileRule, cuts: number): PatternTile => ({
	rule,
	cuts,
	curves: Object.fromEntries(ruleInfo(rule).curves.map((key) => [key, straightCurve(!!halfOf(rule, key))]))
});
/** Whether Tegn's anchor `anchor` of cut `fingerId` is a crossing of the tiling. */
const isCrossing = (tile: PatternTile, fingerId: string, anchor: number) => {
	const point = placedPointAt(tile, fingerId, anchor);
	return !!point && 'crossing' in point;
};

const near = (a: Vec, b: Vec, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
const sameCurve = (a: SideCurve, b: SideCurve, eps = 1e-6) =>
	a.length === b.length && a.every((s, k) => near(s.p0, b[k]!.p0, eps) && near(s.p1, b[k]!.p1, eps) && near(s.p2, b[k]!.p2, eps) && near(s.p3, b[k]!.p3, eps));
const problems = (tile: PatternTile) => {
	const design = patternToDesign(tile, { name: ruleKey(tile.rule) });
	return [...findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize)))];
};

describe("the bridge between a tile and Tegn's cuts", () => {
	it('reads finger ids as cuts and leaves the square edges alone', () => {
		expect(cutOfFinger('R-2', 3)).toEqual({ kind: 'V', index: 2 });
		expect(cutOfFinger('L-1', 3)).toEqual({ kind: 'H', index: 1 });
		expect(cutOfFinger('L-0', 3)).toBeNull();
		expect(cutOfFinger('R-4', 3)).toBeNull();
	});

	it('writes Tegn fingers in its own direction: left cuts right to left, right cuts bottom to top', () => {
		const tile = straightTile(freeSides(), 3);
		const rect = getCenteredRectParams({ x: 4, y: 4 });
		const fingers = generateEditorFingers(tile, rect);
		const l1 = fingers.find((f) => f.id === 'L-1')!;
		const r1 = fingers.find((f) => f.id === 'R-1')!;
		expect(near(l1.segments[0]!.p0, { x: rect.right, y: rect.top + rect.height / 4 })).toBe(true);
		expect(near(l1.segments[l1.segments.length - 1]!.p3, { x: rect.left, y: rect.top + rect.height / 4 })).toBe(true);
		expect(near(r1.segments[0]!.p0, { x: rect.left + rect.width / 4, y: rect.bottom })).toBe(true);
	});

	/** The heart a tile makes, as `readTile` reads one: its inner cuts, grid, square and colours. */
	const heartOf = (tile: PatternTile) => {
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const counts = cutCounts(tile);
		return { fingers: generateEditorFingers(tile, rect), gridSize: { x: counts.V + 1, y: counts.H + 1 }, rect, weaveParity: weaveParityOf(tile) };
	};
	/** Whether `back` makes the cuts `tile` makes, node for node. */
	const makesSame = (back: PatternTile, tile: PatternTile) => {
		const heart = heartOf(tile);
		return cutsAre(heart.fingers, generateEditorFingers(back, heart.rect), 1e-6) && cutsAre(generateEditorFingers(back, heart.rect), heart.fingers, 1e-6);
	};

	it.each(EXAMPLES.map((p) => [p.id, p] as const))('reads example %s back off the fingers it wrote, leaning or not', (_id, preset) => {
		const tile = exampleTile(preset);
		const back = readTile(heartOf(tile), [tile.rule]);
		expect(back).not.toBeNull();
		for (const key of ruleInfo(tile.rule).curves) expect(sameCurve(back!.curves[key]!, tile.curves[key]!, 1e-6), key).toBe(true);
		expect(makesSame(back!, tile)).toBe(true);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('reads the knob tile of %s back off the fingers it wrote', (_key, rule) => {
		for (const cuts of [2, 3, 5]) {
			const tile = { ...knobTile(rule), cuts };
			const back = readTile(heartOf(tile), [rule]);
			expect(back, `${cuts} cuts`).not.toBeNull();
			for (const key of ruleInfo(rule).curves) {
				const want = tile.curves[key] ?? straightCurve(!!halfOf(rule, key));
				expect(sameCurve(back!.curves[key]!, want, 1e-6), `${key} at ${cuts} cuts`).toBe(true);
			}
			expect(makesSame(back!, tile), `${cuts} cuts`).toBe(true);
		}
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('reads the %s tile back however its tiles were moved, sized, stretched or turned', (_key, rule) => {
		const tile = knobTile(rule);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const anchor = [...specialNodes(tile, 'R-1').keys()].filter((a) => isCrossing(tile, 'R-1', a)).sort((a, b) => a - b)[1]!;
		for (const delta of [{ x: 14, y: 20 }, { x: -18, y: -9 }]) {
			const framed = dragPlacedPoint(tile, 'R-1', anchor, delta, rect)!;
			const moved = panBy(framed, { x: 11, y: -7 }, rect);
			const back = readTile(heartOf(moved), [rule]);
			const where = `${delta.x}, ${delta.y}`;
			expect(back, where).not.toBeNull();
			expect(makesSame(back!, moved), where).toBe(true);
		}
	});

	it('reads no tile out of cuts that are none: a cut bent by a tool the Escher tab does not know about, or cuts crossing between nodes', () => {
		const leaf = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const heart = heartOf(leaf);
		const first = heart.fingers[0]!;
		const bent = first.segments.map((s, k) => (k === 1 ? { ...s, p1: { x: s.p1.x + 9, y: s.p1.y - 9 } } : s));
		expect(readTile({ ...heart, fingers: [{ ...first, segments: bent }, ...heart.fingers.slice(1)] }, ALL_RULES)).toBeNull();
		// one piece a cut, so the cuts cross where neither has a node
		const lines = heart.fingers.map((f) => ({ ...f, segments: [{ ...f.segments[0]!, p3: f.segments[f.segments.length - 1]!.p3 }] }));
		expect(readTile({ ...heart, fingers: lines }, ALL_RULES)).toBeNull();
	});

	it('an edit to one stretch reaches every stretch carrying the same curve', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const fingers = generateEditorFingers(tile, rect);
		const before = fingers.find((f) => f.id === 'R-2')!;
		// Nudge one handle inside the cut's second segment (well away from any crossing).
		const edited: Finger = { ...before, segments: before.segments.map((s, k) => (k === 1 ? { ...s, p1: { x: s.p1.x + 6, y: s.p1.y - 4 } } : s)) };
		const next = tileAfterFingerEdit(tile, edited, rect);
		// one curve of the two the leaf's turned pairs have, the edited stretch's
		const changed = (Object.keys(tile.curves) as CurveKey[]).filter((k) => !sameCurve(next.curves[k]!, tile.curves[k]!));
		expect(changed).toHaveLength(1);
		// Generated again, the edited stretch (the cut's first two segments, as Tegn orders them)
		// is exactly what was drawn, and the cut's other stretches, copies of the same curve, moved too.
		const again = generateEditorFingers(next, rect);
		const r2 = again.find((f) => f.id === 'R-2')!;
		expect(r2.segments.length).toBe(edited.segments.length);
		for (const k of [0, 1]) expect(near(r2.segments[k]!.p1, edited.segments[k]!.p1, 1e-6), `segment ${k}`).toBe(true);
		expect(r2.segments.slice(2).some((s, k) => !near(s.p1, before.segments[k + 2]!.p1))).toBe(true);
		const l1Before = fingers.find((f) => f.id === 'L-1')!;
		const l1After = again.find((f) => f.id === 'L-1')!;
		expect(l1After.segments.some((s, k) => !near(s.p1, l1Before.segments[k]!.p1))).toBe(true);
	});

	it('a dragged crossing goes back to the crossing, so it changes nothing', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'bone')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const fingers = generateEditorFingers(tile, rect);
		const before = fingers.find((f) => f.id === 'L-2')!;
		// the first inner crossing on the cut, with the handles on either side of it
		const c = [...Array(before.segments.length).keys()].find((a) => a > 0 && isCrossing(tile, 'L-2', a))!;
		const d = { x: 7, y: 5 };
		const moved: BezierSegment[] = before.segments.map((s, k) => {
			if (k === c - 1) return { ...s, p2: { x: s.p2.x + d.x, y: s.p2.y + d.y }, p3: { x: s.p3.x + d.x, y: s.p3.y + d.y } };
			if (k === c) return { ...s, p0: { x: s.p0.x + d.x, y: s.p0.y + d.y }, p1: { x: s.p1.x + d.x, y: s.p1.y + d.y } };
			return s;
		});
		const next = tileAfterFingerEdit(tile, { ...before, segments: moved }, rect);
		expect(sameCurve(next.curves.side!, tile.curves.side!)).toBe(true);
	});

	it('a node added in one stretch is added to every copy', () => {
		const tile = straightTile(opposite('move', 'move'), 3);
		const rect = getCenteredRectParams({ x: 4, y: 4 });
		const fingers = generateEditorFingers(tile, rect);
		const before = fingers.find((f) => f.id === 'R-1')!;
		const [a, b] = splitBezierAt(before.segments[0]!, 0.5);
		const edited: Finger = { ...before, segments: [a, b, ...before.segments.slice(1)] };
		const next = tileAfterFingerEdit(tile, edited, rect);
		expect(next.curves.vertical!.length).toBe(tile.curves.vertical!.length + 1);
		const src = stretchSource(opposite('move', 'move'), 'V', 1, 0);
		expect(sourceCurve(next, src).length).toBe(3);
	});

	it('names the points the tile places, and none of them is locked', () => {
		const at = (id: string) => {
			const tile = exampleTile(EXAMPLES.find((p) => p.id === id)!);
			return [...specialNodes(tile, 'R-1').entries()].sort(([a], [b]) => a - b).map(([, kind]) => kind);
		};
		// cut R-1 crosses every left-lobe cut once, and on the plain grid it ends on two corners on the
		// edges: every one a point of the tiling
		const waves = exampleTile(EXAMPLES.find((p) => p.id === 'waves')!);
		expect(at('waves')).toEqual(Array(waves.cuts + 2).fill('frame'));
		// the birds lean, so the edges cut their curves: the ends slide, the crossings between are points
		// of the tiling
		const birds = at('birds');
		expect([birds[0], birds[birds.length - 1]]).toEqual(['slide', 'slide']);
		expect(birds.slice(1, -1).every((k) => k === 'frame')).toBe(true);
		// half turn: the middle of every S side is a point of the tiling too, besides the crossings
		const windmill = exampleTile(EXAMPLES.find((p) => p.id === 'windmill')!);
		expect(at('windmill').length).toBeGreaterThanOrEqual(2 * windmill.cuts + 1);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))(
		'a crossing of the %s tiling, dragged, sizes and turns every tile so that it follows the pointer, about the crossing of its line nearest the middle',
		(_key, rule) => {
			const tile = ruleStart(rule, 4);
			const rect = getCenteredRectParams({ x: 5, y: 5 });
			const lattice = latticeOf(rule);
			for (const id of ['R-1', 'L-3']) {
				const kind = id.startsWith('R') ? 'V' : 'H';
				const line = firstLine(tile, kind) + Number(id.slice(2)) - 1;
				const crossings = [...specialNodes(tile, id).keys()].filter((a) => isCrossing(tile, id, a)).sort((a, b) => a - b);
				for (const anchor of [crossings[1]!, crossings[crossings.length - 2]!]) {
					const point = placedPointAt(tile, id, anchor)!;
					const was = generateEditorFingers(tile, rect).find((f) => f.id === id)!.segments[anchor]!.p0;
					// across a right-lobe cut is x, along it y; a left-lobe cut the other way round; both far
					// enough not to snap back to the plain grid's size or straightness
					for (const delta of [{ x: 18, y: 12 }, { x: -13, y: -15 }, { x: 15, y: -14 }]) {
						const where = `${id} node ${anchor} by ${delta.x}, ${delta.y}`;
						const next = dragPlacedPoint(tile, id, anchor, delta, rect)!;
						expect(next, where).not.toBeNull();
						const pointer = { x: was.x + delta.x, y: was.y + delta.y };
						const at = locatePlacedPoint(next, point, kind, pointer, rect)!;
						expect(at, where).not.toBeNull();
						expect(near(generateEditorFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0, pointer, 1e-6), where).toBe(true);
						// one crossing of the same line stays where it was: the one it turned about
						const stays = [0, 1, 2, 3, 4, 5].filter((a) => {
							const [i, j] = kind === 'V' ? [line, a] : [a, line];
							return near(cellsToRaw(tile, crossing(tile, i, j)), cellsToRaw(next, crossing(next, i, j)), 1e-9);
						});
						expect(stays, where).toHaveLength(1);
						// the cells take only the shapes the type keeps
						const { x, y } = tileShape(next);
						if (lattice === 'rectangular' || lattice === 'square') expect(Math.abs(x.x * y.x + x.y * y.y), where).toBeLessThan(1e-9);
						if (lattice === 'rhombic' || lattice === 'square') expect(Math.hypot(x.x, x.y) - Math.hypot(y.x, y.y), where).toBeCloseTo(0, 9);
						expect(problems(next), where).toEqual([]);
					}
				}
			}
		}
	);

	it('narrows the tiles one way where the type lets them stretch, and the heart gets more strips that way than the other', () => {
		const rect = getCenteredRectParams({ x: 5, y: 5 });
		const drag = (rule: TileRule) => {
			const tile = ruleStart(rule, 4);
			// the second crossing of a left-lobe cut, dragged along it towards the middle: the cells grow shorter along x
			const anchor = [...specialNodes(tile, 'L-2').keys()].filter((a) => isCrossing(tile, 'L-2', a)).sort((a, b) => a - b)[1]!;
			const was = generateEditorFingers(tile, rect).find((f) => f.id === 'L-2')!.segments[anchor]!.p0;
			const toward = Math.sign(rect.left + rect.width / 2 - was.x);
			return dragPlacedPoint(tile, 'L-2', anchor, { x: toward * 0.45 * (rect.width / 5), y: 0 }, rect)!;
		};
		const narrow = drag(opposite('move', 'move'));
		const { x, y } = tileShape(narrow);
		expect(Math.hypot(x.x, x.y)).toBeLessThan(0.8);
		expect(Math.hypot(y.x, y.y)).toBeCloseTo(1, 9);
		expect(cutCounts(narrow).V).toBeGreaterThan(cutCounts(narrow).H);
		expect(problems(narrow)).toEqual([]);
		// a type that keeps its tiles square makes them smaller both ways instead
		const small = drag(neighbours('both'));
		const s = tileShape(small);
		expect(Math.hypot(s.x.x, s.x.y)).toBeLessThan(0.8);
		expect(Math.hypot(s.x.x, s.x.y)).toBeCloseTo(Math.hypot(s.y.x, s.y.y), 9);
		expect(cutCounts(small).V).toBe(cutCounts(small).H);
		expect(problems(small)).toEqual([]);
	});

	it('snaps back to the plain grid, square and straight, near it', () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const rect = getCenteredRectParams({ x: 5, y: 5 });
		const anchor = [...specialNodes(tile, 'R-1').keys()].filter((a) => isCrossing(tile, 'R-1', a)).sort((a, b) => a - b)[1]!;
		// a little along the cut and across it: still the plain grid
		expect(dragPlacedPoint(tile, 'R-1', anchor, { x: 2, y: 2 }, rect)!.shape).toBeUndefined();
		// stretched and turned, then dragged back to within a hair of the plain grid
		const out = dragPlacedPoint(tile, 'R-1', anchor, { x: 25, y: 30 }, rect)!;
		expect(out.shape).toBeDefined();
		const back = dragPlacedPoint(out, 'R-1', anchor, { x: -24, y: -29 }, rect);
		expect(back?.shape, 'dragged back').toBeUndefined();
	});

	it('the middle of an S, dragged, sizes and turns the tiles too, and follows the pointer', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'windmill')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const middles = [...specialNodes(tile, 'R-2').keys()].filter((a) => {
			const point = placedPointAt(tile, 'R-2', a);
			return !!point && 'middle' in point;
		});
		const anchor = middles.sort((a, b) => a - b)[middles.length - 1]!;
		const point = placedPointAt(tile, 'R-2', anchor)!;
		const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
		const delta = { x: 14, y: -20 };
		const next = dragPlacedPoint(tile, 'R-2', anchor, delta, rect)!;
		expect(next.shape).toBeDefined();
		const pointer = { x: was.x + delta.x, y: was.y + delta.y };
		const at = locatePlacedPoint(next, point, 'V', pointer, rect)!;
		expect(near(generateEditorFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0, pointer, 1e-6)).toBe(true);
	});

	it('on leaning tiles, an edit reaches every copy, also the ones the edge cuts short', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'birds')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const fingers = generateEditorFingers(tile, rect);
		const before = fingers.find((f) => f.id === 'L-2')!;
		const special = specialNodes(tile, 'L-2');
		// a free node in the middle of the cut, and its handles with it
		const mid = Math.floor(before.segments.length / 2);
		const k = [...Array(before.segments.length).keys()].find((a) => a >= mid && a > 0 && !special.has(a))!;
		const d = { x: 2.5, y: -1.5 };
		const moved = before.segments.map((seg, a) => {
			if (a === k - 1) return { ...seg, p2: { x: seg.p2.x + d.x, y: seg.p2.y + d.y }, p3: { x: seg.p3.x + d.x, y: seg.p3.y + d.y } };
			if (a === k) return { ...seg, p0: { x: seg.p0.x + d.x, y: seg.p0.y + d.y }, p1: { x: seg.p1.x + d.x, y: seg.p1.y + d.y } };
			return seg;
		});
		const next = tileAfterFingerEdit(tile, { ...before, segments: moved }, rect);
		expect(next.offset).toEqual(tile.offset);
		const again = generateEditorFingers(next, rect);
		const l2 = again.find((f) => f.id === 'L-2')!;
		expect(l2.segments.length).toBe(before.segments.length);
		expect(near(l2.segments[k]!.p0, moved[k]!.p0, 1e-6)).toBe(true);
		// With free sides the left lobe's cuts carry the tiles' upper-right and lower-left sides, both
		// of them on every one of its cuts: the edit reaches all of them, and none of the right lobe's.
		const changed = again
			.filter((f) => {
				const old = fingers.find((g) => g.id === f.id)!;
				return f.segments.length !== old.segments.length || f.segments.some((seg, a) => !near(seg.p0, old.segments[a]!.p0, 1e-6));
			})
			.map((f) => f.id)
			.sort();
		expect(changed).toEqual(Array.from({ length: tile.cuts }, (_, i) => `L-${i + 1}`));
	});

	it('a half-turn side reads back from whichever half was edited', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'windmill')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const before = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!;
		const special = specialNodes(tile, 'R-2');
		const d = { x: 1.5, y: 2 };
		for (const k of [...Array(before.segments.length).keys()].filter((a) => a > 0 && !special.has(a)).slice(0, 4)) {
			const moved = before.segments.map((seg, a) => {
				if (a === k - 1) return { ...seg, p2: { x: seg.p2.x + d.x, y: seg.p2.y + d.y }, p3: { x: seg.p3.x + d.x, y: seg.p3.y + d.y } };
				if (a === k) return { ...seg, p0: { x: seg.p0.x + d.x, y: seg.p0.y + d.y }, p1: { x: seg.p1.x + d.x, y: seg.p1.y + d.y } };
				return seg;
			});
			const next = tileAfterFingerEdit(tile, { ...before, segments: moved }, rect);
			const r2 = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!;
			expect(near(r2.segments[k]!.p0, moved[k]!.p0, 1e-6), `node ${k}`).toBe(true);
		}
	});

	it('a corner at the end of a cut is a point of the tiling: dragged into the heart, it comes in under the pointer', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'waves')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		for (const id of ['R-2', 'L-1']) {
			const kind = id.startsWith('R') ? 'V' : 'H';
			const point = placedPointAt(tile, id, 0)!;
			expect('crossing' in point, id).toBe(true);
			const was = generateEditorFingers(tile, rect).find((f) => f.id === id)!.segments[0]!.p0;
			// Tegn's first anchor of a right-lobe cut is on the bottom edge, of a left-lobe one on the right
			const delta = id.startsWith('R') ? { x: 12, y: -22 } : { x: -22, y: 12 };
			const next = dragPlacedPoint(tile, id, 0, delta, rect)!;
			const pointer = { x: was.x + delta.x, y: was.y + delta.y };
			const at = locatePlacedPoint(next, point, kind, pointer, rect)!;
			expect(at, id).not.toBeNull();
			expect(near(generateEditorFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0, pointer, 1e-6), id).toBe(true);
		}
	});

	it('where the edge cuts a curve, the end of the cut slides along the edge and reshapes every copy', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'birds')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const fingers = generateEditorFingers(tile, rect);
		const r1 = fingers.find((f) => f.id === 'R-1')!;
		const last = r1.segments.length;
		// a node where the edge cuts the curve changes no cut's shape
		const withNode = nodeAtCutEnd(tile, 'R-1', last)!;
		const same = generateEditorFingers(withNode, rect).find((f) => f.id === 'R-1')!;
		expect(near(same.segments[same.segments.length - 1]!.p3, r1.segments[last - 1]!.p3, 1e-6)).toBe(true);
		expect(near(same.segments[0]!.p0, r1.segments[0]!.p0, 1e-6)).toBe(true);
		// sliding it moves the cut's end along the edge, by the pointer's move along it
		const delta = { x: 5, y: 9 };
		const next = slideCutEnd(withNode, 'R-1', 'last', delta, rect)!;
		const moved = generateEditorFingers(next, rect);
		const end = moved.find((f) => f.id === 'R-1')!.segments;
		const was = r1.segments[last - 1]!.p3;
		expect(near(end[end.length - 1]!.p3, { x: was.x + delta.x, y: was.y }, 1e-3)).toBe(true);
		// and every copy of the curve changed with it
		const changed = moved.filter((f) => {
			const old = fingers.find((g) => g.id === f.id)!;
			return f.segments.length !== old.segments.length || f.segments.some((seg, a) => !near(seg.p1, old.segments[a]!.p1, 1e-6));
		});
		expect(changed.length).toBeGreaterThan(2);
	});

	it("a handle on a piece the edge cuts short moves the curve's own handle; the one at the edge stays", () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'birds')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		let took = 0;
		for (const id of ['R-1', 'R-2', 'L-1', 'L-2', 'L-3']) {
			const before = generateEditorFingers(tile, rect).find((f) => f.id === id)!;
			// Tegn's first segment is the cut's raw end: p2 is the handle of its inner node, p1 the edge's
			const first = before.segments[0]!;
			const d = { x: 1.2, y: -0.8 };
			const inner = tileAfterFingerEdit(tile, { ...before, segments: [{ ...first, p2: { x: first.p2.x + d.x, y: first.p2.y + d.y } }, ...before.segments.slice(1)] }, rect);
			const again = generateEditorFingers(inner, rect).find((f) => f.id === id)!.segments[0]!;
			const want = { x: first.p2.x + d.x, y: first.p2.y + d.y };
			const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
			// It moves toward where it was put: the edge then cuts the curve a little elsewhere, so the
			// part that shows, and with it the handle, changes length (a drag closes in over its moves).
			// When too little of the segment shows, it stays.
			const moved = { x: again.p2.x - first.p2.x, y: again.p2.y - first.p2.y };
			if (near(again.p2, first.p2, 1e-6)) continue;
			expect(dist(again.p2, want), id).toBeLessThan(dist(first.p2, want));
			expect(moved.x * d.x + moved.y * d.y, id).toBeGreaterThan(0);
			took++;
			const edge = tileAfterFingerEdit(tile, { ...before, segments: [{ ...first, p1: { x: first.p1.x + d.x, y: first.p1.y + d.y } }, ...before.segments.slice(1)] }, rect);
			expect(edge.curves, id).toEqual(tile.curves);
		}
		expect(took).toBeGreaterThanOrEqual(3);
	});

	it('on the plain grid every cut ends on corners, also where its curve meets the edge almost along it', () => {
		for (const preset of EXAMPLES.filter((p) => !p.offset)) {
			for (const cuts of [2, 4, 6]) {
				const tile = { ...exampleTile(preset), cuts };
				for (let k = 1; k <= cuts; k++) {
					for (const id of [`R-${k}`, `L-${k}`]) {
						const special = specialNodes(tile, id);
						const last = Math.max(...special.keys());
						const ends = [special.get(0), special.get(last)];
						expect(ends.every((e) => e === 'frame') && isCrossing(tile, id, 0) && isCrossing(tile, id, last), `${preset.id} ${cuts} cuts ${id}: ${ends}`).toBe(true);
					}
				}
			}
		}
	});

	it('a mirrored side reads back from whichever half was edited, and its middle moves across the side', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'bone')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const before = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!;
		const special = specialNodes(tile, 'R-2');
		const d = { x: 1.5, y: 2 };
		let exact = 0;
		let middles = 0;
		for (const k of [...Array(before.segments.length).keys()].filter((a) => a > 0 && !special.has(a)).slice(0, 8)) {
			const moved = before.segments.map((seg, a) => {
				if (a === k - 1) return { ...seg, p2: { x: seg.p2.x + d.x, y: seg.p2.y + d.y }, p3: { x: seg.p3.x + d.x, y: seg.p3.y + d.y } };
				if (a === k) return { ...seg, p0: { x: seg.p0.x + d.x, y: seg.p0.y + d.y }, p1: { x: seg.p1.x + d.x, y: seg.p1.y + d.y } };
				return seg;
			});
			const next = tileAfterFingerEdit(tile, { ...before, segments: moved }, rect);
			const now = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!.segments[k]!.p0;
			const was = before.segments[k]!.p0;
			if (near(now, moved[k]!.p0, 1e-6)) exact++;
			else {
				// the middle of a side stays on the side's mirror line, so only the move across the
				// side counts (along x: the right lobe's cuts run up Tegn's drawing)
				expect(near(now, { x: was.x + d.x, y: was.y }, 1e-6), `node ${k}`).toBe(true);
				middles++;
			}
		}
		expect(exact).toBeGreaterThan(0);
		expect(middles).toBeGreaterThan(0);
	});

	it("a mirrored side's middle follows a drag across the side, however far along it the drag goes", () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'bone')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const before = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!;
		// every side is the half drawn and its mirror image, so its middle node is half a side in
		const per = 2 * tile.curves.side!.length;
		const middles = [...Array(before.segments.length).keys()].filter((a) => a % per === per / 2);
		expect(middles).toHaveLength(tile.cuts + 1);
		const cell = { x: rect.width / (tile.cuts + 1), y: rect.height / (tile.cuts + 1) };
		// the right lobe's cuts run up Tegn's drawing: along a side is y, across it x
		for (const [across, along] of [
			[0, 0.06],
			[0, 0.2],
			[0.08, 0.12],
			[-0.05, -0.2]
		] as const) {
			const d = { x: across * cell.x, y: along * cell.y };
			for (const k of middles) {
				const what = `node ${k}, ${across} of a cell across and ${along} along`;
				const moved = before.segments.map((seg, a) => {
					if (a === k - 1) return { ...seg, p2: { x: seg.p2.x + d.x, y: seg.p2.y + d.y }, p3: { x: seg.p3.x + d.x, y: seg.p3.y + d.y } };
					if (a === k) return { ...seg, p0: { x: seg.p0.x + d.x, y: seg.p0.y + d.y }, p1: { x: seg.p1.x + d.x, y: seg.p1.y + d.y } };
					return seg;
				});
				const next = tileAfterFingerEdit(tile, { ...before, segments: moved }, rect);
				// still half a side, ending on its mirror line: every side is its own mirror image
				const half = next.curves.side!;
				expect(half.length, what).toBe(tile.curves.side!.length);
				expect(half[half.length - 1]!.p3.x, what).toBe(0.5);
				const r2 = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!;
				expect(r2.segments.length, what).toBe(before.segments.length);
				const was = before.segments[k]!.p0;
				expect(near(r2.segments[k]!.p0, { x: was.x + d.x, y: was.y }, 1e-6), what).toBe(true);
				expect(problems(next), what).toEqual([]);
			}
		}
	});

	it('a cut dragged moves the whole pattern, what was grabbed staying under the pointer', () => {
		for (const id of ['leaf', 'bone', 'hearts', 'arrows', 'windmill', 'birds']) {
			const tile = exampleTile(EXAMPLES.find((p) => p.id === id)!);
			const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
			// a crossing on the cut stands for the place grabbed
			const anchor = [...specialNodes(tile, 'R-2').keys()].sort((a, b) => a - b).find((a) => a > 0 && isCrossing(tile, 'R-2', a))!;
			const point = placedPointAt(tile, 'R-2', anchor)!;
			const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
			const delta = { x: 5, y: -7 };
			const next = panBy(tile, delta, rect);
			expect(next.pan, id).toBeDefined();
			expect(next.curves, id).toEqual(tile.curves);
			const pointer = { x: was.x + delta.x, y: was.y + delta.y };
			const at = locatePlacedPoint(next, point, 'V', pointer, rect)!;
			expect(at, id).not.toBeNull();
			expect(near(generateEditorFingers(next, rect).find((f) => f.id === at.fingerId)!.segments[at.anchor]!.p0, pointer, 1e-6), id).toBe(true);
		}
	});
});

describe('a pattern moved within the heart', () => {
	const sameCuts = (a: PatternTile, b: PatternTile) => {
		const [x, y] = [patternCuts(a), patternCuts(b)];
		return [...x.left, ...x.right].every((cut, k) => {
			const other = [...y.left, ...y.right][k]!;
			return cut.length === other.length && cut.every((seg, q) => near(seg.p0, other[q]!.p0, 1e-6) && near(seg.p3, other[q]!.p3, 1e-6));
		});
	};

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))(
		'cuts the lines of the %s tiling nearest the middle of the heart, so the edges never go odd',
		(_key, rule) => {
			const base = ruleStart(rule, 4);
			const n = base.cuts + 1;
			// every quarter cell, the half cells where the heart moves on to the next line among them
			for (let x = -1; x < 1; x += 0.25) {
				const tile: PatternTile = { ...base, pan: { x, y: -x / 2 } };
				const where = `pan ${x}`;
				// The first cut lies between half a cell and one and a half in, the last as far from the far edge.
				const right = patternCuts(tile).right;
				const across = (cut: BezierSegment[]) => cut.reduce((sum, seg) => sum + seg.p0.x, 0) / cut.length / (100 / n);
				expect(across(right[0]!), where).toBeGreaterThan(0.5 - 0.2);
				expect(across(right[0]!), where).toBeLessThan(1.5 + 0.2);
				expect(across(right[right.length - 1]!), where).toBeGreaterThan(n - 1.5 - 0.2);
				expect(problems(tile), where).toEqual([]);
				// A pan of one repeat more is the same heart.
				const repeat = ruleRepeat(rule);
				expect(sameCuts(tile, { ...tile, pan: { x: x + repeat.x, y: -x / 2 - repeat.y } }), where).toBe(true);
			}
		}
	);

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))(
		'fills an edge strip of the moved %s pattern wider than a cell with the next line, where its cut fits, and drops none',
		(_key, rule) => {
			const base = ruleStart(rule, 4);
			const n = base.cuts + 1;
			const cell = 100 / n;
			let grew = false;
			for (let x = -1; x < 1; x += 0.25) {
				const moved: PatternTile = { ...base, pan: { x, y: -x / 2 } };
				const tile = fitLines(moved);
				const where = `pan ${x}`;
				for (const kind of ['V', 'H'] as const) {
					// every line the n − 1 nearest the middle are is still cut
					const [near, fitted] = [firstLine(moved, kind), firstLine(tile, kind)];
					expect(fitted, where).toBeLessThanOrEqual(near);
					expect(fitted + cutCounts(tile)[kind], where).toBeGreaterThanOrEqual(near + base.cuts);
				}
				grew ||= cutCounts(tile).V > base.cuts || cutCounts(tile).H > base.cuts;
				// Every cut keeps a strip of paper from the edge, and no edge strip is much wider than a cell:
				// the bends the rule starts from stand less than a fifth of a cell off their line.
				const { left, right } = patternCuts(tile);
				const extent = (cuts: BezierSegment[][], axis: 'x' | 'y') => cuts.map((cut) => cut.flatMap((s) => [s.p0[axis], s.p3[axis]]));
				for (const [cuts, axis] of [[right, 'x'], [left, 'y']] as const) {
					const ends = extent(cuts, axis);
					expect(Math.min(...ends.flat()), where).toBeGreaterThan(0.15 * cell - 1e-6);
					expect(Math.max(...ends.flat()), where).toBeLessThan(100 - 0.15 * cell + 1e-6);
					const middles = ends.map((e) => e.reduce((a, b) => a + b, 0) / e.length / cell);
					expect(Math.min(...middles), where).toBeLessThan(1.3);
					expect(Math.max(...middles), where).toBeGreaterThan(n - 1.3);
				}
				expect(problems(tile), where).toEqual([]);
				// A pan of one repeat more is the same heart.
				const repeat = ruleRepeat(rule);
				expect(sameCuts(tile, fitLines({ ...moved, pan: { x: x + repeat.x, y: -x / 2 - repeat.y } })), where).toBe(true);
			}
			expect(grew, 'a strip more somewhere').toBe(true);
		}
	);

	it('keeps an unmoved pattern as it was: n − 1 cuts each way, nearest the middle', () => {
		for (const rule of ALL_RULES) expect(fitLines(ruleStart(rule, 4)), ruleKey(rule)).toEqual(ruleStart(rule, 4));
	});

	it.each(['hearts', 'leaf', 'windmill'])('moves the %s pattern without end when a cut is dragged, the place grabbed staying under the pointer', (id) => {
		// on the way, the heart gains a strip where an edge strip grows wide, and loses it again
		let reshaped = false;
		const tile = { ...exampleTile(EXAMPLES.find((p) => p.id === id)!), cuts: 5 };
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const cell = rect.width / (tile.cuts + 1);
		// a crossing on the middle cut, away from its ends, stands for the place grabbed
		const middle = [...specialNodes(tile, 'R-3').keys()].filter((a) => isCrossing(tile, 'R-3', a)).sort((a, b) => a - b);
		const anchor = middle[Math.floor(middle.length / 2)]!;
		const point = placedPointAt(tile, 'R-3', anchor)!;
		const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-3')!.segments[anchor]!.p0;
		for (let step = 1; step <= 12; step++) {
			const delta = { x: step * 0.2 * cell, y: -step * 0.1 * cell };
			const next = panBy(tile, delta, rect);
			const where = `${id} moved ${step * 0.2} cells`;
			reshaped ||= cutCounts(next).V !== tile.cuts || cutCounts(next).H !== tile.cuts;
			expect(Math.abs(next.pan!.x), where).toBeLessThanOrEqual(1);
			expect(problems(next), where).toEqual([]);
			const pointer = { x: was.x + delta.x, y: was.y + delta.y };
			const at = locatePlacedPoint(next, point, 'V', pointer, rect)!;
			expect(at, where).not.toBeNull();
			const segs = generateEditorFingers(next, rect).find((f) => f.id === at.fingerId)!.segments;
			expect(near(segs[at.anchor]!.p0, pointer, 1e-6), where).toBe(true);
		}
		expect(reshaped).toBe(true);
	});

	it('keeps the drawn tiles red: the weave parity follows the lines the heart starts at', () => {
		const base = ruleStart(opposite('move', 'move'), 4);
		expect(weaveParityOf(base)).toBe(1);
		for (const [pan, parity] of [
			[{ x: 0.3, y: 0 }, 1],
			[{ x: 0.7, y: 0 }, 0],
			[{ x: 0.7, y: -0.6 }, 1],
			[{ x: -0.6, y: 0.2 }, 0]
		] as const) {
			const tile = { ...base, pan };
			expect(weaveParityOf(tile), JSON.stringify(pan)).toBe(parity);
			// the parity flips exactly when the heart starts an odd number of lines further on
			expect((firstLine(tile, 'V') + firstLine(tile, 'H') + parity) % 2).toBe(1);
		}
	});

	/** A rule's start with a node in the middle of every piece, as a double-click adds one: the shape unchanged. */
	const noded = (rule: TileRule): PatternTile => {
		const start = ruleStart(rule, 4);
		return { ...start, curves: Object.fromEntries(Object.entries(start.curves).map(([key, curve]) => [key, curve!.flatMap((s) => splitBezierAt(s, 0.5))])) };
	};

	/** On every cut of a moved pattern with a node the tile does not place, the one nearest the middle, nudged with its handles. */
	function nudges(tile: PatternTile, d: Vec) {
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		return generateEditorFingers(tile, rect).flatMap((before) => {
			const special = specialNodes(tile, before.id);
			const middle = before.segments.length / 2;
			const free = [...before.segments.keys()].filter((a) => a > 0 && !special.has(a));
			if (!free.length) return [];
			const k = free.reduce((best, a) => (Math.abs(a - middle) < Math.abs(best - middle) ? a : best));
			const segments = before.segments.map((seg, a) => {
				if (a === k - 1) return { ...seg, p2: { x: seg.p2.x + d.x, y: seg.p2.y + d.y }, p3: { x: seg.p3.x + d.x, y: seg.p3.y + d.y } };
				if (a === k) return { ...seg, p0: { x: seg.p0.x + d.x, y: seg.p0.y + d.y }, p1: { x: seg.p1.x + d.x, y: seg.p1.y + d.y } };
				return seg;
			});
			const next = tileAfterFingerEdit(tile, { ...before, segments }, rect);
			const after = generateEditorFingers(next, rect).find((f) => f.id === before.id)!;
			return [{ id: before.id, k, drawn: segments[k]!.p0, next, nodes: after.segments.map((s) => s.p0) }];
		});
	}

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))(
		'finds a node dragged on the moved %s pattern again, where the edge now cuts off more or less of the curves before it',
		(_key, rule) => {
			const d = { x: 1.5, y: -1 };
			for (const pan of [{ x: 0.37, y: -0.21 }, { x: -0.62, y: 0.44 }, { x: 1.6, y: -1.3 }]) {
				const tile = fitLines({ ...noded(rule), pan });
				const dragged = nudges(tile, d);
				expect(dragged.length, `pan ${pan.x}, ${pan.y}`).toBeGreaterThan(0);
				for (const { id, k, drawn, next, nodes } of dragged) {
					const where = `${id} node ${k}, pan ${pan.x}, ${pan.y}`;
					// The node found again is the one nearest where it was drawn, and there, unless the
					// type keeps it on a mirror line: then the line took it no further.
					const at = followEdit(tile, next, id).anchor(k);
					const off = (a: number) => Math.hypot(nodes[a]!.x - drawn.x, nodes[a]!.y - drawn.y);
					const nearest = nodes.reduce((best, _p, a) => (off(a) < off(best) ? a : best), 0);
					expect(at, where).toBe(nearest);
					expect(off(at), where).toBeLessThan(Math.hypot(d.x, d.y));
				}
			}
		}
	);

	it('a node dragged where the edge cuts more or less of a curve before it into the cut is another node of the cut made again', () => {
		const tile = fitLines({ ...noded(opposite('turn', 'move')), pan: { x: 0.37, y: -0.21 } });
		const moved = nudges(tile, { x: -3, y: 2 }).filter(({ id, k, next }) => followEdit(tile, next, id).anchor(k) !== k);
		expect(moved.length).toBeGreaterThan(0);
		for (const { id, k, drawn, next, nodes } of moved) expect(near(nodes[followEdit(tile, next, id).anchor(k)]!, drawn), `${id} node ${k}`).toBe(true);
	});
});
