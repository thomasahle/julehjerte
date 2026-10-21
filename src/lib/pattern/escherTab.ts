/**
 * Tegn's Escher tab, as functions of the heart it edits: the tile that a type
 * chosen, a size, a reopened tab or a drag makes, and the cuts a tile draws.
 * Tegn keeps the state — the tile, the tab, the cuts and their history — and
 * checks every edit the tab makes as it checks any other; this module is how a
 * tile becomes the heart's cuts and how an edit to the cuts goes back into the
 * tile (`editorBridge` underneath). Tegn loads it only when the tab is used.
 */

import type { TranslationKey } from '$lib/i18n';
import type { Finger, GridSize, HeartPattern, LobeId, Vec } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { getCenteredRectParams, inferOverlapRect, type OverlapRect } from '$lib/utils/overlapRect';
import {
	cutOfFinger,
	cutsAre,
	dragPlacedPoint,
	followEdit,
	generateEditorFingers,
	locatePlacedPoint,
	nodeAtCutEnd,
	panBy,
	placedPointAt,
	READ_TOLERANCE,
	readTile,
	settledTile,
	slideCutEnd,
	specialNodes,
	tileAfterFingerEdit,
	turnedTo,
	turnLimits,
	weaveParityOf,
	type PlacedPoint,
	type SpecialNode
} from './editorBridge';
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '$lib/constants';
import { ALL_RULES, COMMON_RULES, latticeOf, ruleInfo, ruleKey, ruleSymmetry, sameRule, type TileRule } from './rules';
import { cutCounts, fitLines, tileShape, tileTurn, type PatternTile, type SideCurve } from './tiling';
import { isStraightTile, ruleStart, switchRule } from './starts';

export { cutOfFinger, cutsAre, followEdit, generateEditorFingers, READ_TOLERANCE, sameRule, specialNodes, weaveParityOf };
export type { PatternTile, SpecialNode, TileRule };

/** The heart as the Escher tab finds it: its cuts, edges and all, its grid, the square they fill, and which of its cells show the right lobe's colour. */
export interface EscherHeart {
	fingers: Finger[];
	gridSize: GridSize;
	rect: OverlapRect;
	weaveParity: 0 | 1;
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

 /**
 * The tile a type chosen in the Escher tab draws, its lines fitted. The curves
 * the new type reads the same way carry over (and the lean, when the new type
 * lets tiles lean), so tying one pair of sides differently keeps the other pair
 * as drawn, as long as the heart still weaves (else the type starts afresh,
 * `switchRule`); cuts that already are a tile of the new type stay as they are;
 * anything else starts as the type starts, with one bent curve on every side,
 * at the pattern's size. A plain chequerboard has nothing to keep, so it starts
 * there too.
 */
export function tileForRule(rule: TileRule, current: PatternTile | null, heart: EscherHeart): PatternTile {
	const n = current ? current.cuts + 1 : Math.min(7, Math.max(3, heart.gridSize.x, heart.gridSize.y));
	if (current && !isStraightTile(current)) return fitLines(switchRule(current, rule, n - 1, tileWeaves));
	const found = current ? null : readTile(heart, [rule]);
	if (found && !isStraightTile(found)) return found;
	return fitLines(ruleStart(rule, n - 1));
}

/** The types from the most symmetric down (see `ruleSymmetry`): cuts that fit several are of the first. */
const BY_SYMMETRY = [...ALL_RULES].sort((a, b) => ruleSymmetry(b) - ruleSymmetry(a));

/**
 * The tile the Escher tab takes up when it is opened again, or a heart is opened
 * whose cuts are a tile: the one it was left with, if the cuts are still the ones
 * it makes; else a tile the cuts already are (a heart drawn in the tab and saved,
 * or drawn from a tile before the tab was there, like the gallery's Dag og nat),
 * however its tiles were moved, sized, turned or leant (`readTile`), unchanged, of
 * the most symmetric type that fits: two shapes fit every tile, a moved tile is
 * also a mirrored one's equal only by chance. A plain chequerboard fits every
 * type, so it waits for one to be chosen; null then.
 */
export function resumedTile(last: PatternTile | null, heart: EscherHeart): PatternTile | null {
	const { fingers, gridSize, rect } = heart;
	const grid = last ? tileGrid(last) : null;
	if (last && grid && grid.x === gridSize.x && grid.y === gridSize.y && cutsAre(fingers, generateEditorFingers(last, rect))) return last;
	const found = readTile(heart, BY_SYMMETRY);
	return found && !isStraightTile(found) ? found : null;
}

/**
 * The tile the Escher tab opens on, which always has a type: the one it was
 * left with or a tile the cuts already are (`resumedTile`), taken up as it is
 * (`drawn` false); else the cuts drawn afresh (`drawn` true): as the tile the tab
 * was left with, where the cuts have been changed in the Normal tab since, or as
 * the first type the tab offers starts, at the heart's size.
 */
export function openedTile(last: PatternTile | null, heart: EscherHeart): { tile: PatternTile; drawn: boolean } {
	const resumed = resumedTile(last, heart);
	if (resumed) return { tile: resumed, drawn: false };
	return { tile: last ?? tileForRule(COMMON_RULES[0]!, null, heart), drawn: true };
}

/** The tile drawn again as its type starts, at its size: the tab's "Start forfra". */
export const restartedTile = (tile: PatternTile): PatternTile => fitLines(ruleStart(tile.rule, tile.cuts));

/**
 * The tile drawn n × n on the heart's square, its lines fitted again, or null
 * when the pattern is too tight for that size: the tiles keep their shape in
 * cells, but the paper between two cuts has to stay as wide in the heart. Tiles
 * stretched, slanted or turned keep that too, at the size of a cell of the n × n grid.
 */
export function resizedTile(tile: PatternTile, n: number): PatternTile | null {
	const { shape, ...plain } = tile;
	const area = shape ? Math.abs(shape.x.x * shape.y.y - shape.y.x * shape.x.y) : 1;
	const unit = (v: Vec) => ({ x: v.x / Math.sqrt(area), y: v.y / Math.sqrt(area) });
	const next = fitLines({ ...plain, cuts: n - 1, ...(shape ? { shape: { x: unit(shape.x), y: unit(shape.y) } } : {}) });
	return tileWeaves(next) ? next : null;
}

/** The size the tab's buttons show the tile at: n for tiles a cell of the n × n grid in size, stretched, slanted or turned or not; null for a size dragged by hand. */
export function patternSize(tile: PatternTile): number | null {
	const { x, y } = tileShape(tile);
	return Math.abs(x.x * y.y - y.x * x.y - 1) < 1e-9 ? tile.cuts + 1 : null;
}

/**
 * What the black points do to the tiles of a type, as the tab's hint says it and as the line above the
 * heart does for a black point chosen: longer, shorter or aslant where the type's cells may be any
 * parallelogram; longer or shorter where it keeps them rectangular; bigger, smaller or aslant where
 * rhombic; bigger or smaller where square (`latticeOf`).
 */
const FRAME_TEXT = {
	oblique: ['patternPointsSlant', 'patternPointSlant'],
	rectangular: ['patternPointsStretch', 'patternPointStretch'],
	rhombic: ['patternPointsGrowSlant', 'patternPointGrowSlant'],
	square: ['patternPointsGrow', 'patternPointGrow']
} as const satisfies Record<string, readonly [TranslationKey, TranslationKey]>;

/** What the Escher tab's hint says the black points do, for the tile's type (`FRAME_TEXT`). */
export const frameHint = (tile: PatternTile): TranslationKey => FRAME_TEXT[latticeOf(tile.rule)][0];

/** What the line above the heart says a black point chosen does, for the tile's type (`FRAME_TEXT`). */
export const frameChip = (tile: PatternTile): TranslationKey => FRAME_TEXT[latticeOf(tile.rule)][1];

const DEGREES = 180 / Math.PI;

/** How far the tile's pattern is turned, in degrees: what the turn control shows. */
export const turnDegrees = (tile: PatternTile): number => tileTurn(tile) * DEGREES;

/** How far the turn control may turn the pattern, in degrees, from and to (`turnLimits`). */
export const turnRange = (tile: PatternTile): [number, number] => turnLimits(tile).map((a) => a * DEGREES) as [number, number];

/** The pattern turned to `degrees` about the middle of the heart, its cells keeping their shape (`turnedTo`); null where it would not fit. */
export const turnedTile = (tile: PatternTile, degrees: number): PatternTile | null => turnedTo(tile, degrees / DEGREES);

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
 * A drag the tile answers itself: on a point of the tiling it places — a
 * crossing, the middle of a half-turn S — which sizes, stretches and slants the
 * tiles (`frame`); on the end of a cut where the edge cuts a curve, which slides
 * along the edge and reshapes the curve (`slide`); or on a cut or one of the
 * square's edges, which moves the whole pattern (`pan`). `base` is the tile the
 * drag started from, `start` where the pointer was.
 */
export type TileDrag =
	| { mode: 'frame'; base: PatternTile; fingerId: string; anchor: number; point: PlacedPoint | null; start: Vec }
	| { mode: 'slide'; base: PatternTile; fingerId: string; end: 'first' | 'last'; start: Vec }
	| { mode: 'pan'; base: PatternTile; start: Vec; lobe: LobeId | null };

/** A drag starting on Tegn's anchor `anchor` of cut `fingerId`, a point the tile places (`special`). */
export function startTileDrag(tile: PatternTile, fingerId: string, anchor: number, special: SpecialNode, start: Vec): TileDrag | null {
	if (special === 'slide') {
		// The curve gets a node where the edge cuts it, for the drag to move.
		const base = nodeAtCutEnd(tile, fingerId, anchor);
		return base ? { mode: 'slide', base, fingerId, end: anchor === 0 ? 'first' : 'last', start } : null;
	}
	// A crossing or the middle of an S is followed as the tiles change; an end of the cut on a
	// straight side is where the edge cuts it, which is somewhere else once they have.
	return { mode: 'frame', base: tile, fingerId, anchor, point: placedPointAt(tile, fingerId, anchor), start };
}

/** A drag on a cut of `lobe`, or on an edge of the square (`lobe` null), which moves the whole pattern. */
export const startPanDrag = (tile: PatternTile, start: Vec, lobe: LobeId | null): TileDrag => ({ mode: 'pan', base: tile, start, lobe });

/** A frame drag from `base` let go: the cells on the plain grid exactly where they were let go a hair from it, or null (`settledTile`). */
export { settledTile };

/** The tile with what was dragged moved by `delta` pixels from where the drag started: sized and slanted, moved or reshaped. */
export function dragTile(drag: TileDrag, delta: Vec, rect: OverlapRect): PatternTile | null {
	if (drag.mode === 'pan') return panBy(drag.base, delta, rect);
	return drag.mode === 'frame' ? dragPlacedPoint(drag.base, drag.fingerId, drag.anchor, delta, rect) : slideCutEnd(drag.base, drag.fingerId, drag.end, delta, rect);
}

/**
 * Where the point a frame drag follows shows in the heart now: the cut and
 * Tegn's anchor there, under the pointer, though the tiles' new size may have put
 * it on another cut, or a repeat on. Null when it is not on a cut the heart shows.
 */
export function followedPoint(drag: TileDrag & { mode: 'frame' }, next: PatternTile, pointer: Vec, rect: OverlapRect): { fingerId: string; anchor: number } | null {
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
		...(tile.shape ? { shape: [tile.shape.x.x, tile.shape.x.y, tile.shape.y.x, tile.shape.y.y] } : {}),
		...(tile.turn !== undefined ? { turn: tile.turn } : {}),
		...(tile.pan ? { pan: pair(tile.pan) } : {}),
		...(tile.lines ? { lines: { V: [tile.lines.V.first, tile.lines.V.count], H: [tile.lines.H.first, tile.lines.H.count] } } : {})
	};
}

/**
 * The tile a heart kept, or null where it cannot be one of ours: a type we do not
 * have, a move past any repeat, a shape turned inside out, or no line or more
 * than a heart has cut one way. Curves its type does not read are left behind.
 */
export function tileOfPattern(saved: HeartPattern): PatternTile | null {
	const rule = RULE_BY_KEY.get(saved.rule);
	if (!rule) return null;
	if (saved.pan && saved.pan.some((v) => Math.abs(v) > 4)) return null;
	if (saved.shape && saved.shape[0] * saved.shape[3] - saved.shape[2] * saved.shape[1] <= 0) return null;
	if (saved.lines && [saved.lines.V[1], saved.lines.H[1]].some((count) => count < MIN_GRID_SIZE - 1 || count > MAX_GRID_SIZE - 1)) return null;
	const reads = new Set<string>(ruleInfo(rule).curves);
	const vec = (x: number, y: number) => ({ x, y });
	const curve = (segments: number[][]): SideCurve => segments.map((n) => ({ p0: vec(n[0]!, n[1]!), p1: vec(n[2]!, n[3]!), p2: vec(n[4]!, n[5]!), p3: vec(n[6]!, n[7]!) }));
	return {
		rule,
		cuts: saved.cuts,
		curves: Object.fromEntries(Object.entries(saved.curves).filter(([key]) => reads.has(key)).map(([key, segments]) => [key, curve(segments)])),
		...(saved.offset ? { offset: vec(...saved.offset) } : {}),
		...(saved.shape ? { shape: { x: vec(saved.shape[0], saved.shape[1]), y: vec(saved.shape[2], saved.shape[3]) } } : {}),
		...(saved.turn !== undefined ? { turn: saved.turn } : {}),
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
	return cutsAre(heart.fingers, generateEditorFingers(tile, heart.rect), READ_TOLERANCE) ? tile : null;
}
