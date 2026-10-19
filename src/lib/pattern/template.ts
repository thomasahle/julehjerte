/**
 * A tile type as one of Tom McLean's templates ("Isohedral tilings and their
 * templates", mirrored at jaapsch.net/tilings/mclean): the tile with half an
 * arrowhead on every side. Sides with the same colour have the same shape; the
 * arrowhead's direction says which way round, and being half an arrowhead,
 * which side of the line the shape is on. A side that is its own S carries two,
 * turned about its middle; a side that is its own mirror image two, mirrored
 * about its middle (a bow tie); a side the tiles are mirrored in, which stays
 * straight, a whole arrowhead. McLean also puts a dog in the middle, to show the
 * tile's own symmetry; the Escher tab leaves it out.
 *
 * The arrowheads go where the rule puts curves: a tile whose curves are
 * arrowheads is laid out like any other (`stretchCurve`), so a template shows
 * exactly how its rule ties the sides.
 */

import type { BezierSegment, Vec } from '$lib/types/heart';
import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';
import { edgeClasses, halfOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type TileRule } from './rules';
import { stretchCurve, stretchFrame, toFrame, type PatternTile, type SideCurve } from './tiling';

/** The four sides of the red tile (0, 0), as the template shows them. */
const TILE_SIDES: Array<{ side: 'nw' | 'ne' | 'se' | 'sw'; kind: StretchKind; i: number; j: number }> = [
	{ side: 'nw', kind: 'V', i: 0, j: 0 },
	{ side: 'ne', kind: 'H', i: 0, j: 0 },
	{ side: 'se', kind: 'V', i: 1, j: 0 },
	{ side: 'sw', kind: 'H', i: 0, j: 1 }
];

/**
 * The colour of a curve's arrowheads, on every side that carries it. The two
 * families keep the editor's lobe colours — orange for the right lobe's cuts
 * (the vertical stretches), cyan for the left lobe's (the horizontal ones) — in
 * a light and a dark shade where a family has two curves.
 */
export const CURVE_COLORS: Record<CurveKey, string> = {
	nw: LOBE_OUTLINE_COLORS.right,
	se: '#b55d00',
	ne: LOBE_OUTLINE_COLORS.left,
	sw: '#007c99',
	vertical: LOBE_OUTLINE_COLORS.right,
	horizontal: LOBE_OUTLINE_COLORS.left,
	side: '#7a3fc4'
};

const straight = (a: Vec, b: Vec): BezierSegment => ({ p0: a, p1: a, p2: b, p3: b });
/** A closed polygon as a chain of straight segments, three to a triangle. */
const polygon = (points: Vec[]): SideCurve => points.map((p, k) => straight(p, points[(k + 1) % points.length]!));

/** Half an arrowhead on a whole side, in its curve's own frame: along the side, pointing on, on its high side. */
const WHOLE = polygon([
	{ x: 0.16, y: 0 },
	{ x: 0.84, y: 0 },
	{ x: 0.16, y: 0.24 }
]);
/** The same on the half of a side drawn as half (an S, or a side that is its own mirror image). */
const HALF = polygon([
	{ x: 0.05, y: 0 },
	{ x: 0.45, y: 0 },
	{ x: 0.05, y: 0.2 }
]);
/** A whole arrowhead, on both sides of the line: a side the tiles are mirrored in. */
const WHOLE_HEAD: Vec[][] = [
	[
		{ x: 0.16, y: -0.18 },
		{ x: 0.84, y: 0 },
		{ x: 0.16, y: 0.18 }
	]
];
/** Two, back to back: a side the tiles are mirrored in that is also the same either way round. */
const WHOLE_HEADS: Vec[][] = [
	[
		{ x: 0.5, y: -0.18 },
		{ x: 0.9, y: 0 },
		{ x: 0.5, y: 0.18 }
	],
	[
		{ x: 0.5, y: -0.18 },
		{ x: 0.1, y: 0 },
		{ x: 0.5, y: 0.18 }
	]
];

/**
 * The arrowheads on stretch `kind (i, j)` of a rule's template, each a triangle, in
 * cells: laid out as the rule lays out curves, on a tile whose curves are half
 * arrowheads; a straight side's whole arrowhead turned as the side's source says.
 */
export function arrowheadsOn(rule: TileRule, kind: StretchKind, i: number, j: number): Vec[][] {
	const frame = stretchFrame({ rule, cuts: 3, curves: {} }, kind, i, j);
	const src = stretchSource(rule, kind, i, j);
	const straight = edgeClasses(rule).find((c) => c.key === src.curve && c.shape === 'I');
	if (straight) {
		const heads = straight.eitherWay ? WHOLE_HEADS : WHOLE_HEAD;
		return heads.map((head) => head.map((p) => toFrame(frame, { x: src.reverse ? 1 - p.x : p.x, y: src.negate ? -p.y : p.y })));
	}
	const marks: PatternTile = {
		rule,
		cuts: 3,
		curves: Object.fromEntries(ruleInfo(rule).curves.map((key) => [key, halfOf(rule, key) ? HALF : WHOLE]))
	};
	const corners = stretchCurve(marks, kind, i, j).map((s) => toFrame(frame, s.p0));
	const heads: Vec[][] = [];
	for (let k = 0; k + 3 <= corners.length; k += 3) heads.push(corners.slice(k, k + 3));
	return heads;
}

/** A side of the red tile (0, 0) in a template: the curve it carries and its arrowheads, each a triangle, in cells. */
export interface TemplateSide {
	side: (typeof TILE_SIDES)[number]['side'];
	curve: CurveKey;
	arrowheads: Vec[][];
}

export function templateOf(rule: TileRule): TemplateSide[] {
	return TILE_SIDES.map(({ side, kind, i, j }) => ({ side, curve: stretchSource(rule, kind, i, j).curve, arrowheads: arrowheadsOn(rule, kind, i, j) }));
}
