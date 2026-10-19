import { describe, expect, it } from 'vitest';
import type { BezierSegment, Finger, Vec } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { getCenteredRectParams, inferOverlapRect } from '$lib/utils/overlapRect';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { ALL_RULES, freeSides, halfOf, opposite, ruleRepeat, ruleInfo, ruleKey, stretchSource, type CurveKey, type TileRule } from './rules';
import { cutCounts, firstLine, fitLines, patternCuts, patternToDesign, sourceCurve, straightCurve, type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './starts';
import { EXAMPLES, exampleTile, knobTile } from './examples';
import {
	cutOfFinger,
	extractTile,
	fitsTile,
	followEdit,
	generateEditorFingers,
	anchorOfPlacedPoint,
	dragPlacedPoint,
	leanTo,
	locatePlacedPoint,
	nodeAtCutEnd,
	placedPointAt,
	slideCutEnd,
	specialNodes,
	stretchesOfCut,
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

	// Reading a tile back from cuts keeps the crossings on the plain grid, so it reads only the tiles that do.
	const plain = EXAMPLES.filter((p) => !p.offset);
	it.each(plain.map((p) => [p.id, p] as const))('reads example %s back off the fingers it wrote', (_id, preset) => {
		const tile = exampleTile(preset);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const fingers = generateEditorFingers(tile, rect);
		const back = extractTile(fingers, tile.rule, tile.cuts, rect);
		expect(back).not.toBeNull();
		for (const key of ruleInfo(tile.rule).curves) expect(sameCurve(back!.curves[key]!, tile.curves[key]!, 1e-6), key).toBe(true);
		expect(fitsTile(fingers, back!, rect)).toBe(true);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('reads the knob tile of %s back off the fingers it wrote', (_key, rule) => {
		for (const cuts of [2, 3, 5]) {
			const tile = { ...knobTile(rule), cuts };
			const rect = getCenteredRectParams({ x: cuts + 1, y: cuts + 1 });
			const fingers = generateEditorFingers(tile, rect);
			const back = extractTile(fingers, rule, cuts, rect);
			expect(back).not.toBeNull();
			for (const key of ruleInfo(rule).curves) {
				const want = tile.curves[key] ?? straightCurve(!!halfOf(rule, key));
				expect(sameCurve(back!.curves[key]!, want, 1e-6), `${key} at ${cuts} cuts`).toBe(true);
			}
			expect(fitsTile(fingers, back!, rect)).toBe(true);
		}
	});

	it('does not take the cuts of a leaning tile, or of a free drawing, for a plain tile', () => {
		const birds = exampleTile(EXAMPLES.find((p) => p.id === 'birds')!);
		const rect = getCenteredRectParams({ x: birds.cuts + 1, y: birds.cuts + 1 });
		const fingers = generateEditorFingers(birds, rect);
		const back = extractTile(fingers, birds.rule, birds.cuts, rect);
		expect(back === null || !fitsTile(fingers, back, rect)).toBe(true);
		// one cut of a plain pattern bent by a tool the Escher tab does not know about
		const leaf = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const edited = generateEditorFingers(leaf, rect);
		const first = edited[0]!;
		const bent = first.segments.map((s, k) => (k === 1 ? { ...s, p1: { x: s.p1.x + 9, y: s.p1.y - 9 } } : s));
		edited[0] = { ...first, segments: bent };
		const read = extractTile(edited, leaf.rule, leaf.cuts, rect);
		expect(read === null || !fitsTile(edited, read, rect)).toBe(true);
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
		const raw = stretchesOfCut([], 'H', 2, tile.cuts);
		expect(raw).toBeNull();
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
			const preset = EXAMPLES.find((p) => p.id === id)!;
			const tile = exampleTile(preset);
			return [...specialNodes(tile, 'R-1').values()];
		};
		// cut R-1 crosses every left-lobe cut once, and on the plain grid it ends on two corners on the edges
		const waves = exampleTile(EXAMPLES.find((p) => p.id === 'waves')!);
		const tegnOrder = [...specialNodes(waves, 'R-1').entries()].sort(([a], [b]) => a - b).map(([, kind]) => kind);
		expect(tegnOrder).toEqual(['edge', ...Array(waves.cuts).fill('lean'), 'edge']);
		// a rule that keeps its tiles square: its corners move the whole pattern
		expect(at('leaf').filter((k) => k === 'pan').length).toBeGreaterThanOrEqual(3);
		expect(at('leaf').filter((k) => k === 'pan-edge').length).toBe(2);
		expect(at('leaf')).not.toContain('lean');
		// the birds lean, so the edges cut their curves: the ends slide
		const birds = specialNodes(exampleTile(EXAMPLES.find((p) => p.id === 'birds')!), 'R-1');
		const last = Math.max(...birds.keys());
		expect([birds.get(0), birds.get(last)]).toEqual(['slide', 'slide']);
		// half turn: the crossings lean, the middle of every S side moves the whole pattern
		const windmill = at('windmill');
		expect(windmill.filter((k) => k === 'lean').length).toBeGreaterThanOrEqual(3);
		expect(windmill.filter((k) => k === 'pan').length).toBeGreaterThanOrEqual(3);
	});

	it('dragging a crossing leans every tile, and the crossing follows the pointer', () => {
		for (const id of ['waves', 'birds', 'windmill']) {
			const tile = exampleTile(EXAMPLES.find((p) => p.id === id)!);
			const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
			const [anchor] = [...specialNodes(tile, 'R-2').entries()].find(([, kind]) => kind === 'lean')!;
			const crossing = placedPointAt(tile, 'R-2', anchor)!;
			const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
			const delta = { x: 6, y: -4 };
			const next = leanTo(tile, 'R-2', anchor, delta, rect)!;
			expect(next.offset).toBeDefined();
			const after = anchorOfPlacedPoint(next, 'R-2', crossing);
			expect(after, id).toBeGreaterThan(0);
			const now = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!.segments[after]!.p0;
			expect(near(now, { x: was.x + delta.x, y: was.y + delta.y }, 1e-6), id).toBe(true);
		}
		const leaf = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const rect = getCenteredRectParams({ x: leaf.cuts + 1, y: leaf.cuts + 1 });
		const [anchor] = [...specialNodes(leaf, 'R-2').keys()];
		expect(leanTo(leaf, 'R-2', anchor!, { x: 6, y: -4 }, rect)).toBeNull();
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

	it('a corner at the end of a cut slides along the edge, and follows the pointer along it', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'waves')!);
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		for (const id of ['R-2', 'L-1']) {
			const before = generateEditorFingers(tile, rect).find((f) => f.id === id)!;
			const was = before.segments[0]!.p0;
			const delta = { x: 7, y: -5 };
			const next = leanTo(tile, id, 0, delta, rect)!;
			const now = generateEditorFingers(next, rect).find((f) => f.id === id)!.segments[0]!.p0;
			// right-lobe cuts end on the top and bottom edges and slide along x; left-lobe cuts along y
			const along = id.startsWith('R') ? { x: was.x + delta.x, y: was.y } : { x: was.x, y: was.y + delta.y };
			expect(near(now, along, 1e-6), id).toBe(true);
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
						expect(ends.every((e) => e === 'edge' || e === 'pan-edge'), `${preset.id} ${cuts} cuts ${id}: ${ends}`).toBe(true);
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

	it('a point the rule fixes in the tiling moves the whole pattern, and follows the pointer', () => {
		// corners of rules that keep their tiles square, and the middle of a half-turn S
		for (const [id, want] of [
			['leaf', 'pan'],
			['bone', 'pan'],
			['hearts', 'pan'],
			['arrows', 'pan'],
			['windmill', 'pan']
		] as const) {
			const tile = exampleTile(EXAMPLES.find((p) => p.id === id)!);
			const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
			const [anchor] = [...specialNodes(tile, 'R-2').entries()].find(([, kind]) => kind === want)!;
			const point = placedPointAt(tile, 'R-2', anchor)!;
			const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-2')!.segments[anchor]!.p0;
			const delta = { x: 5, y: -7 };
			const next = dragPlacedPoint(tile, 'R-2', anchor, delta, rect)!;
			expect(next.pan, id).toBeDefined();
			expect(next.curves, id).toEqual(tile.curves);
			const after = anchorOfPlacedPoint(next, 'R-2', point);
			expect(after, id).toBeGreaterThan(0);
			const now = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!.segments[after]!.p0;
			expect(near(now, { x: was.x + delta.x, y: was.y + delta.y }, 1e-6), id).toBe(true);
		}
		// at an end of the cut, on the edge, only along the edge
		const leaf = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const rect = getCenteredRectParams({ x: leaf.cuts + 1, y: leaf.cuts + 1 });
		const was = generateEditorFingers(leaf, rect).find((f) => f.id === 'R-2')!.segments[0]!.p0;
		const next = dragPlacedPoint(leaf, 'R-2', 0, { x: 6, y: 9 }, rect)!;
		const now = generateEditorFingers(next, rect).find((f) => f.id === 'R-2')!.segments[0]!.p0;
		expect(near(now, { x: was.x + 6, y: was.y }, 1e-6)).toBe(true);
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
				// the peaks the rule starts from stand at most an eighth of a cell off their line.
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

	it.each(['hearts', 'leaf', 'windmill'])('moves the %s pattern without end when a point the rule fixes is dragged, the point staying under the pointer', (id) => {
		// on the way, the heart gains a strip where an edge strip grows wide, and loses it again
		let reshaped = false;
		const tile = { ...exampleTile(EXAMPLES.find((p) => p.id === id)!), cuts: 5 };
		const rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 });
		const cell = rect.width / (tile.cuts + 1);
		// a point the rule fixes on the middle cut, away from its ends
		const middle = [...specialNodes(tile, 'R-3').entries()].filter(([, k]) => k === 'pan').map(([a]) => a);
		const anchor = middle[Math.floor(middle.length / 2)]!;
		const point = placedPointAt(tile, 'R-3', anchor)!;
		const was = generateEditorFingers(tile, rect).find((f) => f.id === 'R-3')!.segments[anchor]!.p0;
		for (let step = 1; step <= 12; step++) {
			const delta = { x: step * 0.2 * cell, y: -step * 0.1 * cell };
			const next = dragPlacedPoint(tile, 'R-3', anchor, delta, rect)!;
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
				const tile = fitLines({ ...ruleStart(rule, 4), pan });
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

	it('a node dragged where the edge cuts off a node before it is a node further along the cut made again', () => {
		const tile = fitLines({ ...ruleStart(opposite('turn', 'move'), 4), pan: { x: 0.37, y: -0.21 } });
		const moved = nudges(tile, { x: 1.5, y: -1 }).filter(({ id, k, next }) => followEdit(tile, next, id).anchor(k) !== k);
		expect(moved.length).toBeGreaterThan(0);
		for (const { id, k, drawn, next, nodes } of moved) expect(near(nodes[followEdit(tile, next, id).anchor(k)]!, drawn), `${id} node ${k}`).toBe(true);
	});
});
