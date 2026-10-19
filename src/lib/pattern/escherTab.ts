/**
 * Tegn's Escher tab, as functions of the heart it edits: the tile that a type
 * chosen, a size, a reopened tab or a drag makes, and the cuts a tile draws.
 * Tegn keeps the state — the tile, the tab, the cuts and their history — and
 * checks every edit the tab makes as it checks any other; this module is how a
 * tile becomes the heart's cuts and how an edit to the cuts goes back into the
 * tile (`editorBridge` underneath). Tegn loads it only when the tab is used.
 */

import type { TranslationKey } from '$lib/i18n';
import type { Finger, GridSize, HeartPattern, Vec } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { fingerToSegments } from '$lib/geometry/bezierSegments';
import { getCenteredRectParams, inferOverlapRect, type OverlapRect } from '$lib/utils/overlapRect';
import {
	cutOfFinger,
	dragPlacedPoint,
	extractTile,
	fitsTile,
	followEdit,
	generateEditorFingers,
	locatePlacedPoint,
	nodeAtCutEnd,
	placedPointAt,
	slideCutEnd,
	specialNodes,
	tileAfterFingerEdit,
	weaveParityOf,
	type PlacedPoint,
	type SpecialNode
} from './editorBridge';
import { ALL_RULES, canLean, ruleInfo, ruleKey, ruleSymmetry, sameRule, type TileRule } from './rules';
import { cutCounts, fitLines, type PatternTile, type SideCurve } from './tiling';
import { isStraightTile, ruleStart, switchRule } from './starts';

export { cutOfFinger, followEdit, generateEditorFingers, sameRule, specialNodes, weaveParityOf };
export type { PatternTile, SpecialNode, TileRule };

/** The heart as the Escher tab finds it: its cuts, edges and all, its grid, and the square they fill. */
export interface EscherHeart {
	fingers: Finger[];
	gridSize: GridSize;
	rect: OverlapRect;
}

/** The grid a tile's heart has: a strip more than its cuts, each way. */
export function tileGrid(tile: PatternTile): GridSize {
	const counts = cutCounts(tile);
	return { x: counts.V + 1, y: counts.H + 1 };
}

/**
 * Every cut generated from `tile`, edges and all, in the frame of its n × n
 * square (or `rect`): the edges as Tegn's own heart draws them, the left lobe's
 * from right to left and the right lobe's from bottom to top. A moved pattern can
 * have a cut more one way than n − 1 (`cutCounts`): the square stays the same,
 * and its far edges are numbered after the last cut.
 */
export function tileFingers(tile: PatternTile, rect = getCenteredRectParams({ x: tile.cuts + 1, y: tile.cuts + 1 })): Finger[] {
	const counts = cutCounts(tile);
	const inner = generateEditorFingers(tile, rect);
	const straight = (id: string, lobe: 'left' | 'right', p0: Vec, p3: Vec): Finger => ({ id, lobe, segments: [{ p0, p1: { ...p0 }, p2: { ...p3 }, p3 }] });
	const across = (id: string, y: number) => straight(id, 'left', { x: rect.right, y }, { x: rect.left, y });
	const down = (id: string, x: number) => straight(id, 'right', { x, y: rect.bottom }, { x, y: rect.top });
	return [
		across('L-0', rect.top),
		...inner.filter((f) => f.lobe === 'left'),
		across(`L-${counts.H + 1}`, rect.bottom),
		down('R-0', rect.left),
		...inner.filter((f) => f.lobe === 'right'),
		down(`R-${counts.V + 1}`, rect.right)
	];
}

/** Whether the heart a tile makes, its lines fitted (`fitLines`), weaves, by the check the heart's own cuts get. */
function tileWeaves(tile: PatternTile): boolean {
	const fitted = fitLines(tile);
	const made = tileFingers(fitted);
	return findFingersWithIssues(made, intersectionMarginPx(inferOverlapRect(made, tileGrid(fitted)))).size === 0;
}

/** Whether the heart's cuts include exactly these: every one of `generated` is there, node for node, to `tolerance` pixels. */
export function cutsAre(fingers: Finger[], generated: Finger[], tolerance = 1e-6): boolean {
	const close = (p: Vec, q: Vec) => Math.abs(p.x - q.x) < tolerance && Math.abs(p.y - q.y) < tolerance;
	return generated.every((g) => {
		const f = fingers.find((x) => x.id === g.id);
		const segs = f ? fingerToSegments(f) : null;
		const want = fingerToSegments(g);
		return !!segs && segs.length === want.length && segs.every((seg, k) => close(seg.p0, want[k]!.p0) && close(seg.p1, want[k]!.p1) && close(seg.p2, want[k]!.p2) && close(seg.p3, want[k]!.p3));
	});
}

/**
 * The tile a type chosen in the Escher tab draws, its lines fitted. The curves
 * the new type reads the same way carry over (and the lean, when the new type
 * lets tiles lean), so tying one pair of sides differently keeps the other pair
 * as drawn, as long as the heart still weaves (else the type starts afresh,
 * `switchRule`); cuts that already are a tile of the new type stay as they are;
 * anything else starts as the type starts, with a low peak of straight lines on
 * every curve, at the pattern's size. A plain chequerboard has nothing to keep,
 * so it starts there too.
 */
export function tileForRule(rule: TileRule, current: PatternTile | null, heart: EscherHeart): PatternTile {
	const { fingers, gridSize, rect } = heart;
	const n = current ? current.cuts + 1 : Math.min(7, Math.max(3, gridSize.x, gridSize.y));
	const found = !current && gridSize.x === n && gridSize.y === n ? extractTile(fingers, rule, n - 1, rect) : null;
	if (current && !isStraightTile(current)) return fitLines(switchRule(current, rule, n - 1, tileWeaves));
	if (found && !isStraightTile(found) && fitsTile(fingers, found, rect)) return fitLines(found);
	return fitLines(ruleStart(rule, n - 1));
}

/** The types from the most symmetric down (see `ruleSymmetry`): cuts that fit several are of the first. */
const BY_SYMMETRY = [...ALL_RULES].sort((a, b) => ruleSymmetry(b) - ruleSymmetry(a));

/**
 * The tile the Escher tab takes up when it is opened again: the one it was left
 * with, if the cuts are still the ones it makes (a moved pattern's heart can have
 * a strip more one way); else, on a square grid, a tile the cuts already are (a
 * heart drawn in the tab and saved, say), unchanged, of the most symmetric type
 * that fits: two shapes fit every tile, a moved tile is also a mirrored one's
 * equal only by chance. A plain chequerboard fits every type, so it waits for
 * one to be chosen; null then.
 */
export function resumedTile(last: PatternTile | null, heart: EscherHeart): PatternTile | null {
	const { fingers, gridSize, rect } = heart;
	const grid = last ? tileGrid(last) : null;
	if (last && grid && grid.x === gridSize.x && grid.y === gridSize.y && cutsAre(fingers, generateEditorFingers(last, rect))) return last;
	if (gridSize.x !== gridSize.y) return null;
	for (const rule of BY_SYMMETRY) {
		const found = extractTile(fingers, rule, gridSize.x - 1, rect);
		if (found && !isStraightTile(found) && fitsTile(fingers, found, rect)) return found;
	}
	return null;
}

/**
 * The tile drawn n × n on the heart's square, its lines fitted again, or null
 * when the pattern is too tight for that size: the tiles keep their shape in
 * cells, but the paper between two cuts has to stay as wide in the heart.
 */
export function resizedTile(tile: PatternTile, n: number): PatternTile | null {
	const next = fitLines({ ...tile, cuts: n - 1 });
	return tileWeaves(next) ? next : null;
}

/** What the Escher tab's hint says about the crossings, for the tile's type. */
export function cornerHint(tile: PatternTile): TranslationKey {
	if (!canLean(tile.rule)) return 'patternCornersPan';
	return tile.rule.sides === 'opposite' ? 'patternCornersHalfturn' : 'patternCornersLean';
}

/**
 * An edit to one of the tile's cuts read back into the tile (the stretches that
 * changed), and every inner cut made again from it: the copies are the whole
 * heart. Null for a finger that is not one of the tile's cuts.
 */
export function editTile(tile: PatternTile, edited: Finger, rect: OverlapRect): { tile: PatternTile; cuts: Finger[] } | null {
	if (!cutOfFinger(edited.id, cutCounts(tile))) return null;
	const next = tileAfterFingerEdit(tile, edited, rect);
	return { tile: next, cuts: generateEditorFingers(next, rect) };
}

/**
 * A drag on a point the tile places: a corner, which leans every tile where the
 * type allows it and otherwise moves the whole pattern (on the square's edge,
 * along it); the middle of a half-turn S, which moves the whole pattern; or the
 * end of a cut where the edge cuts a curve, which slides along the edge and
 * reshapes the curve. `base` is the tile the drag started from, `start` where
 * the pointer was.
 */
export type TileDrag =
	| { mode: 'corner'; base: PatternTile; fingerId: string; anchor: number; point: PlacedPoint | null; start: Vec }
	| { mode: 'slide'; base: PatternTile; fingerId: string; end: 'first' | 'last'; start: Vec };

/** A drag starting on Tegn's anchor `anchor` of cut `fingerId`, a point the tile places (`special`). */
export function startTileDrag(tile: PatternTile, fingerId: string, anchor: number, special: SpecialNode, start: Vec): TileDrag | null {
	if (special === 'slide') {
		// The curve gets a node where the edge cuts it, for the drag to move.
		const base = nodeAtCutEnd(tile, fingerId, anchor);
		return base ? { mode: 'slide', base, fingerId, end: anchor === 0 ? 'first' : 'last', start } : null;
	}
	// A crossing or the middle of an S is followed as the pattern moves; an end of the cut on a
	// straight side, which only moves the pattern along the edge, is not.
	return { mode: 'corner', base: tile, fingerId, anchor, point: placedPointAt(tile, fingerId, anchor), start };
}

/** The tile with the dragged point moved by `delta` pixels from where the drag started: leaned, moved or reshaped. */
export function dragTile(drag: TileDrag, delta: Vec, rect: OverlapRect): PatternTile | null {
	return drag.mode === 'corner' ? dragPlacedPoint(drag.base, drag.fingerId, drag.anchor, delta, rect) : slideCutEnd(drag.base, drag.fingerId, drag.end, delta, rect);
}

/**
 * Where the point a corner drag follows shows in the heart now: the cut and
 * Tegn's anchor there, under the pointer, though the pattern may have moved it
 * onto another cut, or a repeat on. Null when it is not on a cut the heart shows.
 */
export function followedPoint(drag: TileDrag & { mode: 'corner' }, next: PatternTile, pointer: Vec, rect: OverlapRect): { fingerId: string; anchor: number } | null {
	const kind = cutOfFinger(drag.fingerId, cutCounts(drag.base))?.kind;
	return kind && drag.point ? locatePlacedPoint(next, drag.point, kind, pointer, rect) : null;
}

const RULE_BY_KEY = new Map(ALL_RULES.map((rule) => [ruleKey(rule), rule]));

/** The tile as a heart keeps it (`HeartPattern`): plain numbers, the type by its key. */
export function savedPattern(tile: PatternTile): HeartPattern {
	const pair = (v: Vec): [number, number] => [v.x, v.y];
	const numbers = (curve: SideCurve) => curve.map((s) => [s.p0.x, s.p0.y, s.p1.x, s.p1.y, s.p2.x, s.p2.y, s.p3.x, s.p3.y]);
	return {
		rule: ruleKey(tile.rule),
		cuts: tile.cuts,
		curves: Object.fromEntries(Object.entries(tile.curves).map(([key, curve]) => [key, numbers(curve!)])),
		...(tile.offset ? { offset: pair(tile.offset) } : {}),
		...(tile.pan ? { pan: pair(tile.pan) } : {}),
		...(tile.lines ? { lines: { V: [tile.lines.V.first, tile.lines.V.count], H: [tile.lines.H.first, tile.lines.H.count] } } : {})
	};
}

/**
 * The tile a heart kept, or null where it cannot be one of ours: a type we do not
 * have, a move past any repeat, or more lines cut than a moved pattern ever has.
 * Curves its type does not read are left behind.
 */
export function tileOfPattern(saved: HeartPattern): PatternTile | null {
	const rule = RULE_BY_KEY.get(saved.rule);
	if (!rule) return null;
	if (saved.pan && saved.pan.some((v) => Math.abs(v) > 4)) return null;
	if (saved.lines && [saved.lines.V[1], saved.lines.H[1]].some((count) => count < saved.cuts || count > saved.cuts + 1)) return null;
	const reads = new Set<string>(ruleInfo(rule).curves);
	const vec = (x: number, y: number) => ({ x, y });
	const curve = (segments: number[][]): SideCurve => segments.map((n) => ({ p0: vec(n[0]!, n[1]!), p1: vec(n[2]!, n[3]!), p2: vec(n[4]!, n[5]!), p3: vec(n[6]!, n[7]!) }));
	return {
		rule,
		cuts: saved.cuts,
		curves: Object.fromEntries(Object.entries(saved.curves).filter(([key]) => reads.has(key)).map(([key, segments]) => [key, curve(segments)])),
		...(saved.offset ? { offset: vec(...saved.offset) } : {}),
		...(saved.pan ? { pan: vec(...saved.pan) } : {}),
		...(saved.lines ? { lines: { V: { first: saved.lines.V[0], count: saved.lines.V[1] }, H: { first: saved.lines.H[0], count: saved.lines.H[1] } } } : {})
	};
}

/**
 * The tile a heart was saved with, if its cuts are still the ones it makes, to a
 * thousandth of a pixel: then the Escher tab opens on it. Null for a tile that is
 * none of ours (`tileOfPattern`), or where the cuts have changed since, in the
 * Normal tab or anywhere else.
 */
export function restoredTile(saved: HeartPattern, heart: EscherHeart): PatternTile | null {
	const tile = tileOfPattern(saved);
	if (!tile) return null;
	const grid = tileGrid(tile);
	if (grid.x !== heart.gridSize.x || grid.y !== heart.gridSize.y) return null;
	return cutsAre(heart.fingers, generateEditorFingers(tile, heart.rect), 1e-3) ? tile : null;
}
