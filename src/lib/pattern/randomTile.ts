/**
 * A random tile for the Escher tab's "Tilfældig flise" button (docs/redesign/DESIGN.md §7): a type, a
 * size and a curve for every side the type draws, in one style for the whole tile, so the tiles stay
 * one figure and not a scribble.
 *
 *   type   any of the tab's types, its four first ones (`COMMON_RULES`) twice as often
 *   size   2–5 cuts, so 3–6 tiles across the heart, mostly 4–5
 *   style  bend (one smooth bend, a bulge or an S), zigzag (a few straight pieces), or knob (straight,
 *          with a rounded knob in the middle, as in a jigsaw)
 *
 * Curves are in a side's own frame (see `tiling.ts`): from (0, 0) to (1, 0), y towards the stretch's
 * high side, in units of a cell. A side the type draws as half an S ends on the side's middle, (0.5, 0),
 * and the tab turns it about that point; a side drawn as half of its own mirror image ends at the middle
 * level, (0.5, top), so the mirror makes one arch (see `starts.ts`). Whether the heart a tile makes
 * weaves is the Escher tab's business (`randomTile` in escherTab.ts draws again until it does).
 */
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ALL_RULES, COMMON_RULES, halfOf, ruleInfo, type HalfKind, type TileRule } from './rules';
import type { PatternTile, SideCurve } from './tiling';

type Rng = () => number;
export type TileStyle = 'bend' | 'zigzag' | 'knob';

const SIZE_WEIGHTS: [number, number][] = [
	[2, 1],
	[3, 3],
	[4, 3],
	[5, 1]
];
const STYLE_WEIGHTS: [TileStyle, number][] = [
	['bend', 5],
	['zigzag', 2],
	['knob', 2]
];

function pick<T>(rng: Rng, weights: [T, number][]): T {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let r = rng() * total;
	for (const [value, w] of weights) {
		r -= w;
		if (r < 0) return value;
	}
	return weights[weights.length - 1]![0];
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const sign = (rng: Rng) => (rng() < 0.5 ? -1 : 1);
const v = (x: number, y: number): Vec => ({ x, y });

function line(a: Vec, b: Vec): BezierSegment {
	return {
		p0: a,
		p1: v(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3),
		p2: v(a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3),
		p3: b
	};
}

/** A whole side, from (0, 0) to (1, 0). */
function wholeSide(style: TileStyle, rng: Rng): SideCurve {
	const h = sign(rng) * between(rng, 0.12, 0.28);
	switch (style) {
		case 'bend': {
			// A bulge, or an S when the second handle is on the other side.
			const s = rng() < 0.4 ? -1 : 1;
			return [
				{
					p0: v(0, 0),
					p1: v(between(rng, 0.15, 0.4), h * 1.3),
					p2: v(between(rng, 0.6, 0.85), s * h * between(rng, 0.8, 1.3)),
					p3: v(1, 0)
				}
			];
		}
		case 'zigzag': {
			const peaks = rng() < 0.5 ? [v(0.5, h)] : [v(0.3, h), v(0.7, -h * between(rng, 0.6, 1))];
			const points = [v(0, 0), ...peaks, v(1, 0)];
			return points.slice(1).map((p, i) => line(points[i]!, p));
		}
		case 'knob': {
			const a = between(rng, 0.3, 0.38);
			const b = 1 - a;
			return [
				line(v(0, 0), v(a, 0)),
				{ p0: v(a, 0), p1: v(a - 0.08, h * 1.4), p2: v(b + 0.08, h * 1.4), p3: v(b, 0) },
				line(v(b, 0), v(1, 0))
			];
		}
	}
}

/** Half a side the tab completes by a half turn about (0.5, 0): from (0, 0) to the middle of the side. */
function halfTurnSide(style: TileStyle, rng: Rng): SideCurve {
	const h = sign(rng) * between(rng, 0.12, 0.26);
	switch (style) {
		case 'bend':
			return [{ p0: v(0, 0), p1: v(between(rng, 0.08, 0.2), h * 1.3), p2: v(between(rng, 0.3, 0.42), h * 1.3), p3: v(0.5, 0) }];
		case 'zigzag':
			return [line(v(0, 0), v(0.25, h)), line(v(0.25, h), v(0.5, 0))];
		case 'knob':
			return [
				line(v(0, 0), v(0.15, 0)),
				{ p0: v(0.15, 0), p1: v(0.1, h * 1.4), p2: v(0.4, h * 1.4), p3: v(0.35, 0) },
				line(v(0.35, 0), v(0.5, 0))
			];
	}
}

/** Half a side the tab completes by its mirror image: from (0, 0) to (0.5, top), level there, so the two halves make one arch. */
function halfMirrorSide(style: TileStyle, rng: Rng): SideCurve {
	const top = sign(rng) * between(rng, 0.1, 0.24);
	switch (style) {
		case 'bend':
			return [{ p0: v(0, 0), p1: v(between(rng, 0.1, 0.25), top * 0.7), p2: v(between(rng, 0.3, 0.4), top), p3: v(0.5, top) }];
		case 'zigzag':
			return [line(v(0, 0), v(0.3, top)), line(v(0.3, top), v(0.5, top))];
		case 'knob':
			return [line(v(0, 0), v(0.25, 0)), { p0: v(0.25, 0), p1: v(0.25, top * 0.9), p2: v(0.35, top), p3: v(0.5, top) }];
	}
}

function randomSide(style: TileStyle, half: HalfKind | null, rng: Rng): SideCurve {
	if (half === 'turn') return halfTurnSide(style, rng);
	if (half === 'mirror') return halfMirrorSide(style, rng);
	return wholeSide(style, rng);
}

/** The weights of the types: the four the tab offers first twice as often as the rest. */
const RULE_WEIGHTS: [TileRule, number][] = ALL_RULES.map((rule) => [
	rule,
	COMMON_RULES.some((c) => JSON.stringify(c) === JSON.stringify(rule)) ? 2 : 1
]);

/** A random tile on the plain grid, not yet checked: a type, a size, and every side the type draws, in one style. */
export function randomTileDraw(rng: Rng = Math.random): { tile: PatternTile; style: TileStyle } {
	const rule = pick(rng, RULE_WEIGHTS);
	const cuts = pick(rng, SIZE_WEIGHTS);
	const style = pick(rng, STYLE_WEIGHTS);
	const curves = Object.fromEntries(ruleInfo(rule).curves.map((key) => [key, randomSide(style, halfOf(rule, key), rng)]));
	return { tile: { rule, cuts, curves }, style };
}
