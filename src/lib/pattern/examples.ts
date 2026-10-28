/**
 * Hand-drawn tiles the pattern engine is tested on: one or more per rule, mostly
 * from the gallery's own Escher-type and Alhambra hearts (Escher's birds, a leaf,
 * a windmill, hearts, arrowheads), some leaning, and a tile with knobs for every
 * rule. They put real curves, S's and leaning tiles through the engine; the Escher
 * tab itself starts every rule from plain bends (`ruleStart`). Curves are in a
 * side's own frame (see `tiling.ts`): from (0, 0) to (1, 0), y towards the
 * stretch's high side, in units of a cell.
 */

import type { BezierSegment, Vec } from '$lib/types/heart';
import { reverseSegments, splitBezierAt } from '$lib/geometry/bezierSegments';
import { freeSides, neighbours, opposite, type CurveKey, type SideLink, type TileRule } from './rules';
import { type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './starts';

/** A hand-drawn tile, its rule and size, and its name. */
export interface PatternExample {
	id: string;
	rule: TileRule;
	cuts: number;
	curves: Partial<Record<CurveKey, SideCurve>>;
	/** Leaning tiles (two shapes, or opposite sides each their own S): where the odd corners stand off the grid (see `PatternTile.corners`). */
	offset?: Vec;
	name: { da: string; en: string };
}

const v = (x: number, y: number): Vec => ({ x, y });

function line(a: Vec, b: Vec): BezierSegment {
	return { p0: a, p1: v(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3), p2: v(a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3), p3: b };
}

function polyline(points: Vec[]): SideCurve {
	return points.slice(1).map((p, i) => line(points[i]!, p));
}

/** A circular arc as cubics of at most a quarter turn each; angles in radians, y up. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): SideCurve {
	const pieces = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
	const out: BezierSegment[] = [];
	for (let i = 0; i < pieces; i++) {
		const t0 = a0 + ((a1 - a0) * i) / pieces;
		const t1 = a0 + ((a1 - a0) * (i + 1)) / pieces;
		const k = (4 / 3) * Math.tan((t1 - t0) / 4) * r;
		const p0 = v(cx + r * Math.cos(t0), cy + r * Math.sin(t0));
		const p3 = v(cx + r * Math.cos(t1), cy + r * Math.sin(t1));
		out.push({ p0, p1: v(p0.x - k * Math.sin(t0), p0.y + k * Math.cos(t0)), p2: v(p3.x + k * Math.sin(t1), p3.y - k * Math.cos(t1)), p3 });
	}
	return out;
}

const negate = (curve: SideCurve): SideCurve =>
	curve.map((s) => ({ p0: v(s.p0.x, -s.p0.y), p1: v(s.p1.x, -s.p1.y), p2: v(s.p2.x, -s.p2.y), p3: v(s.p3.x, -s.p3.y) }));

/** The curve run from its other end. */
const reversed = (curve: SideCurve): SideCurve =>
	reverseSegments(curve.map((s) => ({ p0: v(1 - s.p0.x, s.p0.y), p1: v(1 - s.p1.x, s.p1.y), p2: v(1 - s.p2.x, s.p2.y), p3: v(1 - s.p3.x, s.p3.y) })));

/** One smooth hump of height `h` (negative for a dent). */
const hump = (h: number, shoulder = 1 / 3): SideCurve => [{ p0: v(0, 0), p1: v(shoulder, (4 * h) / 3), p2: v(1 - shoulder, (4 * h) / 3), p3: v(1, 0) }];

// Hernando's Nasrid leaf: the semicircle on the next side, then the arc round the opposite corner.
const LEAF = [...arc(0, 0.5, 0.5, -Math.PI / 2, Math.atan2(-0.3, 0.4)), ...arc(1, 1, 1, Math.atan2(-0.8, -0.6), -Math.PI / 2)];
// The nail: straight in along the diagonal, then the same arc.
const NAIL_A = 1 - Math.SQRT1_2;
const NAIL = [line(v(0, 0), v(NAIL_A, NAIL_A)), ...arc(1, 1, 1, (-3 * Math.PI) / 4, -Math.PI / 2)];
// Leaf and nail are their own mirror images: both pairs of turned sides are the one curve, run out
// from the corner the pair turns about.
const quarterTurned = (curve: SideCurve) => ({ nw: reversed(negate(curve)), se: negate(curve) });
// Half of the windmill's S: a semicircle on the first half of the side.
const SAIL = arc(0.25, 0, 0.25, Math.PI, 0);
// A heart's lobe: straight off the corners, then an arc bulging 0.3 of a side towards the notch, so
// two lobes meeting at a cell's top corner leave a clear cleft between them.
const LOBE_IN = 0.08;
const LOBE_SAG = 0.3;
const LOBE_R = ((0.5 - LOBE_IN) ** 2 + LOBE_SAG ** 2) / (2 * LOBE_SAG);
const LOBE_CY = LOBE_R - LOBE_SAG;
const LOBE_A = Math.atan2(-LOBE_CY, 0.5 - LOBE_IN);
const LOBE = [
	line(v(0, 0), v(LOBE_IN, 0)),
	...arc(0.5, LOBE_CY, LOBE_R, Math.PI - LOBE_A, 2 * Math.PI + LOBE_A),
	line(v(1 - LOBE_IN, 0), v(1, 0))
];

// The bird of M.C. Escher's regular division no. 18 (1938, Day and Night), from the trace the gallery's
// Dag og nat heart is built on: four sides, the tile leaning so its odd corners stand 0.9795 and
// -0.6626 of a cell off the grid.
const BIRD = {
	offset: v(0.9795, -0.6626),
	ne: [
		{ p0: v(0, 0), p1: v(0.0225, -0.0038), p2: v(0.0642, -0.011), p3: v(0.1048, -0.0214) },
		{ p0: v(0.1048, -0.0214), p1: v(0.1616, -0.0361), p2: v(0.2174, -0.0537), p3: v(0.2169, -0.0535) },
		{ p0: v(0.2169, -0.0535), p1: v(0.2169, -0.0535), p2: v(0.2853, -0.0507), p3: v(0.3179, -0.0505) },
		{ p0: v(0.3179, -0.0505), p1: v(0.3504, -0.0502), p2: v(0.422, -0.0603), p3: v(0.422, -0.0603) },
		{ p0: v(0.422, -0.0603), p1: v(0.422, -0.0603), p2: v(0.459, -0.0337), p3: v(0.5006, 0.0034) },
		{ p0: v(0.5006, 0.0034), p1: v(0.5595, 0.0559), p2: v(0.5742, 0.0733), p3: v(0.6262, 0.0691) },
		{ p0: v(0.6262, 0.0691), p1: v(0.659, 0.0664), p2: v(0.6865, 0.0558), p3: v(0.7092, 0.0428) },
		{ p0: v(0.7092, 0.0428), p1: v(0.7361, 0.0274), p2: v(0.7559, 0.0075), p3: v(0.774, 0.0013) },
		{ p0: v(0.774, 0.0013), p1: v(0.8144, -0.0127), p2: v(0.8514, 0.0069), p3: v(0.8922, 0.0105) },
		{ p0: v(0.8922, 0.0105), p1: v(0.9492, 0.0155), p2: v(0.982, 0.005), p3: v(1, 0) }
	],
	se: [
		{ p0: v(0, 0), p1: v(0, 0), p2: v(0.0409, 0.001), p3: v(0.0864, -0.0112) },
		{ p0: v(0.0864, -0.0112), p1: v(0.147, -0.0275), p2: v(0.1957, -0.0578), p3: v(0.232, -0.0595) },
		{ p0: v(0.232, -0.0595), p1: v(0.2565, -0.0624), p2: v(0.3009, -0.056), p3: v(0.3556, -0.0535) },
		{ p0: v(0.3556, -0.0535), p1: v(0.4095, -0.0586), p2: v(0.432, -0.0669), p3: v(0.432, -0.0669) },
		{ p0: v(0.432, -0.0669), p1: v(0.4563, -0.0385), p2: v(0.4804, -0.0083), p3: v(0.5038, 0.0284) },
		{ p0: v(0.5038, 0.0284), p1: v(0.5209, 0.0533), p2: v(0.54, 0.0752), p3: v(0.5651, 0.0888) },
		{ p0: v(0.5651, 0.0888), p1: v(0.5651, 0.0888), p2: v(0.6251, 0.0816), p3: v(0.6862, 0.0561) },
		{ p0: v(0.6862, 0.0561), p1: v(0.7201, 0.0418), p2: v(0.749, 0.0062), p3: v(0.7801, -0.0048) },
		{ p0: v(0.7801, -0.0048), p1: v(0.8143, -0.0169), p2: v(0.852, -0.0028), p3: v(0.8955, 0.0028) },
		{ p0: v(0.8955, 0.0028), p1: v(0.9321, 0.0076), p2: v(0.9694, 0.0069), p3: v(1, 0) }
	],
	sw: [
		{ p0: v(0, 0), p1: v(0.2855, 0.1204), p2: v(0.6533, 0.1007), p3: v(1, 0) }
	],
	nw: [
		{ p0: v(0, 0), p1: v(0.087, 0.0492), p2: v(0.4129, 0.1964), p3: v(0.6074, 0.1869) },
		{ p0: v(0.6074, 0.1869), p1: v(0.597, 0.1427), p2: v(0.5528, 0.0489), p3: v(0.5053, -0.0339) },
		{ p0: v(0.5053, -0.0339), p1: v(0.4561, -0.1197), p2: v(0.4039, -0.1937), p3: v(0.4039, -0.1937) },
		{ p0: v(0.4039, -0.1937), p1: v(0.5262, -0.1742), p2: v(0.6199, -0.1547), p3: v(0.7322, -0.117) },
		{ p0: v(0.7322, -0.117), p1: v(0.8317, -0.0838), p2: v(0.9174, -0.0428), p3: v(1, 0) }
	]
};

export const EXAMPLES: PatternExample[] = [
	{
		id: 'birds',
		rule: freeSides(),
		cuts: 4,
		curves: { ne: BIRD.ne, se: BIRD.se, sw: BIRD.sw, nw: BIRD.nw },
		offset: BIRD.offset,
		name: { da: 'Eschers fugle', en: "Escher's birds" }
	},
	{
		id: 'waves',
		rule: freeSides(),
		cuts: 3,
		curves: {
			nw: [{ p0: v(0, 0), p1: v(0.3, -0.35), p2: v(0.7, 0.35), p3: v(1, 0) }],
			ne: hump(-0.2),
			se: [{ p0: v(0, 0), p1: v(0.35, 0.3), p2: v(0.6, 0.3), p3: v(1, 0) }],
			sw: hump(0.12)
		},
		name: { da: 'Bølger', en: 'Waves' }
	},
	{
		id: 'leaf',
		rule: neighbours('turn'),
		cuts: 3,
		curves: quarterTurned(LEAF),
		name: { da: 'Nasridisk blad', en: 'Nasrid leaf' }
	},
	{
		id: 'nail',
		rule: neighbours('turn'),
		cuts: 3,
		curves: quarterTurned(NAIL),
		name: { da: 'Nasridisk søm', en: 'Nasrid nail' }
	},
	{
		id: 'bone',
		rule: neighbours('both'),
		cuts: 4,
		// Half the side: the other half is its mirror image.
		curves: { side: polyline([v(0, 0), v(0.25, 0.25), v(0.5, 0.25)]) },
		name: { da: 'Nasridisk knogle', en: 'Nasrid bone' }
	},
	{
		id: 'scales',
		rule: neighbours('both'),
		cuts: 3,
		curves: { side: [splitBezierAt(hump(0.2)[0]!, 0.5)[0]] },
		name: { da: 'Drageskæl', en: 'Dragon scales' }
	},
	{
		id: 'windmill',
		rule: opposite('turn', 'turn'),
		cuts: 3,
		curves: { nw: negate(SAIL), se: negate(SAIL), ne: SAIL, sw: SAIL },
		name: { da: 'Mølle', en: 'Windmill' }
	},
	{
		id: 'hearts',
		rule: opposite('move', 'move'),
		cuts: 3,
		curves: { vertical: LOBE, horizontal: LOBE },
		name: { da: 'Hjertefliser', en: 'Heart tiles' }
	},
	{
		id: 'arrows',
		rule: neighbours('mirror'),
		cuts: 3,
		curves: {
			nw: polyline([v(0, 0), v(0.5, 0.22), v(1, 0)]),
			se: [{ p0: v(0, 0), p1: v(0.15, -0.3), p2: v(0.65, -0.3), p3: v(1, 0) }]
		},
		name: { da: 'Pilespidser', en: 'Arrowheads' }
	}
];

export function exampleTile(preset: PatternExample): PatternTile {
	return {
		rule: preset.rule,
		cuts: preset.cuts,
		curves: structuredClone(preset.curves),
		...(preset.offset ? { corners: [preset.offset.x, preset.offset.y] } : {})
	};
}

/**
 * A knob on a side: a round bump of height `h` (negative bulges to the side's low
 * side) between x = `a` and x = `b`, the rest of the side straight. Set off the
 * middle, it has a front and a back, so a moved, mirrored or turned copy shows
 * which it is.
 */
function knob(h: number, a: number, b: number, end = 1): SideCurve {
	const k = (4 / 3) * h;
	return [
		line(v(0, 0), v(a, 0)),
		{ p0: v(a, 0), p1: v(a, k), p2: v(b, k), p3: v(b, 0) },
		line(v(b, 0), v(end, 0))
	];
}

/** Half a side for an S: a knob on its first half; the half turn makes the second half the matching notch. */
const sHalf = (h: number) => knob(h, 0.06, 0.38, 0.5);

/**
 * A tile with knobs for each rule, from how its sides are tied. Knobs set off the
 * middle of a side tell a moved copy from a mirrored or turned one: a moved pair
 * is notched on one side and knobbed on the other, a mirrored pair carries its
 * knob off-centre so the mirror shows, a pair of S sides bulges out first on one
 * and in first on the other. Free sides have one knob, so red and white are
 * plainly two shapes. Turned neighbours have a knob by the corner each pair turns
 * about, a different one for each pair; mirrored and turned at once, a bone.
 * McLean's other types start as the Escher tab starts them.
 */
export function knobTile(rule: TileRule): PatternTile {
	const tile = (curves: Partial<Record<CurveKey, SideCurve>>): PatternTile => ({ rule, cuts: 3, curves });
	if (rule.sides === 'type' || rule.sides === 'two') return ruleStart(rule, 3);
	if (rule.sides === 'free') return tile({ nw: knob(-0.26, 0.1, 0.6) });
	if (rule.sides === 'neighbour') {
		if (rule.link === 'mirror') return tile({ nw: knob(-0.24, 0.1, 0.55) });
		if (rule.link === 'turn') return tile({ nw: knob(-0.24, 0.45, 0.9), se: knob(0.16, 0.12, 0.42) });
		return tile({ side: polyline([v(0, 0), v(0.25, 0.25), v(0.5, 0.25)]) });
	}
	const pair = (link: SideLink, whole: CurveKey, ends: [CurveKey, CurveKey], moved: SideCurve) =>
		link === 'turn' ? { [ends[0]]: sHalf(-0.22), [ends[1]]: sHalf(0.22) } : { [whole]: link === 'move' ? moved : knob(-0.24, 0.1, 0.55) };
	return tile({
		...pair(rule.v, 'vertical', ['nw', 'se'], knob(0.22, 0.12, 0.58)),
		...pair(rule.h, 'horizontal', ['ne', 'sw'], knob(0.22, 0.42, 0.88))
	});
}
