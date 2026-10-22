/**
 * A random tile for the Escher tab's "Tilfældig flise" button (docs/redesign/DESIGN.md §7), for exploring
 * what the tab can draw: not a pick from a few prepared tiles, but a draw from the whole space of tiles
 * the tab makes, limited only by what its types require.
 *
 *   type   any of the tab's types, each as likely
 *   size   2–6 cuts, so 3–7 tiles across, as the tab's size buttons offer
 *   sides  every side the type draws: a chain of 1–4 cubic pieces, its nodes anywhere along the side and
 *          up to 0.7 of a cell across it, smooth or corners, its handles any length and any way forward
 *   lean   for the types whose tiles lean, half the time the odd corners moved up to 0.4 of a cell
 *   shape  half the time the cells sized (0.8–1.3), stretched (to about 1.3 : 1) and slanted (up to 0.3), as far as the
 *          type keeps its motions (`shapeFor`): the black points' drag, drawn at random
 *
 * Curves are in a side's own frame (see `tiling.ts`): from (0, 0) to (1, 0), y towards the stretch's
 * high side, in units of a cell. A side the type draws as half an S ends on the side's middle, (0.5, 0),
 * and the tab turns it about that point; a side drawn as half of its own mirror image ends at the middle,
 * level, so the mirror makes one arch (see `starts.ts`). Whether the heart a tile makes weaves, and the
 * pattern's turn, are the Escher tab's business (`randomTile` in escherTab.ts).
 */
import { randomChain } from '$lib/geometry/randomChain';
import type { Vec } from '$lib/types/heart';
import { ALL_RULES, canLean, halfOf, ruleInfo, type HalfKind, type TileRule } from './rules';
import { shapeFields, shapeFor, type PatternTile, type SideCurve } from './tiling';

type Rng = () => number;

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const v = (x: number, y: number): Vec => ({ x, y });

function pick<T>(rng: Rng, weights: [T, number][]): T {
	const total = weights.reduce((sum, [, w]) => sum + w, 0);
	let r = rng() * total;
	for (const [value, w] of weights) {
		r -= w;
		if (r < 0) return value;
	}
	return weights[weights.length - 1]![0];
}

/** Pieces a whole side has: mostly one or two, which bulge, and fewer of the wigglier three and four. */
const PIECES: [number, number][] = [
	[1, 3],
	[2, 3],
	[3, 2],
	[4, 1]
];
/** Cuts, so tiles across: mostly 3–5 big tiles, whose shapes read, and fewer of the finer 6 and 7. */
const CUTS: [number, number][] = [
	[2, 3],
	[3, 3],
	[4, 2],
	[5, 1],
	[6, 0.5]
];

/** One side as the type draws it: whole, half an S (to (0.5, 0)), or half an arch (to the middle, level); its nodes bold (`randomChain`). */
function randomSide(half: HalfKind | null, reach: number, rng: Rng): SideCurve {
	const sign = rng() < 0.5 ? -1 : 1;
	if (half === 'turn') return randomChain(v(0, 0), v(0.5, 0), int(rng, 1, 2), reach, rng, undefined, true);
	if (half === 'mirror') return randomChain(v(0, 0), v(0.5, sign * reach * between(rng, 0.45, 1)), int(rng, 1, 2), reach, rng, 0, true);
	return randomChain(v(0, 0), v(1, 0), pick(rng, PIECES), reach, rng, undefined, true);
}

/**
 * How far a tile's sides stand off straight, on average, in cells: each side the type draws sampled along
 * its length. A tile under MIN_BOLDNESS is close to a chequerboard with a ripple, which reads as noise
 * rather than as a figure.
 */
export function tileBoldness(tile: PatternTile): number {
	const sides = Object.values(tile.curves).filter((c): c is SideCurve => !!c);
	if (!sides.length) return 0;
	const offset = (side: SideCurve) => {
		let sum = 0;
		let count = 0;
		for (const s of side) {
			for (let i = 0; i < 12; i++) {
				const t = (i + 0.5) / 12;
				const u = 1 - t;
				sum += Math.abs(u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y);
				count++;
			}
		}
		return sum / count;
	};
	return sides.reduce((total, side) => total + offset(side), 0) / sides.length;
}

/** Below this, in cells, a tile's sides are too nearly straight to make a figure (`tileBoldness`). */
export const MIN_BOLDNESS = 0.16;

/** A random type and size: the round of draws `randomTileDraw` keeps them for. */
export function randomTileKind(rng: Rng = Math.random): { rule: TileRule; cuts: number } {
	return { rule: ALL_RULES[int(rng, 0, ALL_RULES.length - 1)]!, cuts: pick(rng, CUTS) };
}

/** A random tile of the type and size, not yet checked: every side the type draws, a lean and a shape; `shrink` makes them all smaller. */
export function randomTileDraw(rng: Rng, kind: { rule: TileRule; cuts: number }, shrink = 1): PatternTile {
	const { rule, cuts } = kind;
	const reach = between(rng, 0.2, 0.75) * shrink;
	const curves = Object.fromEntries(
		ruleInfo(rule).curves.map((key) => [key, randomSide(halfOf(rule, key), reach * between(rng, 0.6, 1), rng)])
	);
	const lean = canLean(rule) && rng() < 0.5 ? { offset: v(between(rng, -0.4, 0.4) * shrink, between(rng, -0.4, 0.4) * shrink) } : {};
	// The cells' size and stretch: never more than about 1.3 to 1, or the tiles read as stripes.
	const stretch = 1 + between(rng, -0.2, 0.3) * shrink;
	const aspect = 1 + between(rng, -0.2, 0.25) * shrink;
	const shaped =
		rng() < 0.5
			? shapeFields(
					rule,
					shapeFor(rule, {
						x: v(stretch, between(rng, -0.3, 0.3) * shrink),
						y: v(between(rng, -0.3, 0.3) * shrink, stretch * aspect)
					}),
					0
				)
			: {};
	return { rule, cuts, curves, ...lean, ...shaped };
}
