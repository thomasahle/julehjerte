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
 *   shape  half the time the cells stretched (0.7–1.5 a side) and slanted (up to 0.35), as far as the
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

/** One side as the type draws it: whole, half an S (to (0.5, 0)), or half an arch (to the middle, level). */
function randomSide(half: HalfKind | null, reach: number, rng: Rng): SideCurve {
	if (half === 'turn') return randomChain(v(0, 0), v(0.5, 0), int(rng, 1, 2), reach, rng);
	if (half === 'mirror') return randomChain(v(0, 0), v(0.5, between(rng, -reach, reach)), int(rng, 1, 2), reach, rng, 0);
	return randomChain(v(0, 0), v(1, 0), int(rng, 1, 4), reach, rng);
}

/** A random type and size: the round of draws `randomTileDraw` keeps them for. */
export function randomTileKind(rng: Rng = Math.random): { rule: TileRule; cuts: number } {
	return { rule: ALL_RULES[int(rng, 0, ALL_RULES.length - 1)]!, cuts: int(rng, 2, 6) };
}

/** A random tile of the type and size, not yet checked: every side the type draws, a lean and a shape; `shrink` makes them all smaller. */
export function randomTileDraw(rng: Rng, kind: { rule: TileRule; cuts: number }, shrink = 1): PatternTile {
	const { rule, cuts } = kind;
	const reach = between(rng, 0.05, 0.7) * shrink;
	const curves = Object.fromEntries(
		ruleInfo(rule).curves.map((key) => [key, randomSide(halfOf(rule, key), reach * between(rng, 0.4, 1), rng)])
	);
	const lean = canLean(rule) && rng() < 0.5 ? { offset: v(between(rng, -0.4, 0.4) * shrink, between(rng, -0.4, 0.4) * shrink) } : {};
	const shaped =
		rng() < 0.5
			? shapeFields(
					rule,
					shapeFor(rule, {
						x: v(1 + between(rng, -0.3, 0.5) * shrink, between(rng, -0.35, 0.35) * shrink),
						y: v(between(rng, -0.35, 0.35) * shrink, 1 + between(rng, -0.3, 0.5) * shrink)
					}),
					0
				)
			: {};
	return { rule, cuts, curves, ...lean, ...shaped };
}
