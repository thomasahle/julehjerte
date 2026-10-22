/**
 * A random tile for the Escher tab's "Tilfældig flise" button (docs/redesign/DESIGN.md §7), for exploring
 * what the tab can draw: not a pick from a few prepared tiles, but a draw from the whole space of tiles
 * the tab makes, limited only by what its types require.
 *
 *   type   any of the tab's types, each as likely
 *   size   2–6 cuts, so 3–7 tiles across, as the tab's size buttons offer
 *   sides  every side the type draws: two times in three one to three features (lobes, knobs, spikes,
 *          swoops: the beaks, fins and tails of Escher's figures) with straight runs between, else a free
 *          chain of 1–4 cubic pieces; 0.3–0.75 of a cell across at most
 *   lean   for the types whose tiles lean, seven times in ten the odd corners moved up to 0.9 of a cell
 *   shape  half the time the cells sized (0.8–1.3), stretched (to about 1.3 : 1) and slanted (up to 0.3), as far as the
 *          type keeps its motions (`shapeFor`): the black points' drag, drawn at random
 *
 * Curves are in a side's own frame (see `tiling.ts`): from (0, 0) to (1, 0), y towards the stretch's
 * high side, in units of a cell. A side the type draws as half an S ends on the side's middle, (0.5, 0),
 * and the tab turns it about that point; a side drawn as half of its own mirror image ends at the middle,
 * level, so the mirror makes one arch (see `starts.ts`). Whether the heart a tile makes weaves, and the
 * pattern's turn, are the Escher tab's business (`randomTile` in escherTab.ts).
 */
import { chamfer } from '$lib/editor/slivers';
import { randomChain } from '$lib/geometry/randomChain';
import type { Vec } from '$lib/types/heart';
import { ALL_RULES, canLean, halfOf, ruleInfo, type HalfKind, type TileRule } from './rules';
import { cellOutline, shapeFields, shapeFor, type PatternTile, type SideCurve } from './tiling';

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

type Seg = { p0: Vec; p1: Vec; p2: Vec; p3: Vec };
const line = (a: Vec, b: Vec): Seg => ({
	p0: a,
	p1: v(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3),
	p2: v(a.x + (2 * (b.x - a.x)) / 3, a.y + (2 * (b.y - a.y)) / 3),
	p3: b
});

/**
 * One feature on the stretch of a side from x = a to x = b, rising to `h` (− for the other side): a lobe
 * (round, or with a neck like a jigsaw knob), a spike (a beak or a fin: a sharp tip, skewed), or a swoop
 * (an S). Its ends are on the line, corners there; Escher's figures are mostly such features, a beak, a
 * fin, a tail, put together. A knob is rarer: many look like a jigsaw.
 */
function feature(a: number, b: number, h: number, rng: Rng): Seg[] {
	const L = b - a;
	const m = (a + b) / 2;
	const kind = pick(rng, [
		['lobe', 3],
		['knob', 1],
		['spike', 1],
		['swoop', 2]
	] as [string, number][]);
	switch (kind) {
		case 'lobe':
			return [{ p0: v(a, 0), p1: v(a + 0.1 * L, (4 * h) / 3), p2: v(b - 0.1 * L, (4 * h) / 3), p3: v(b, 0) }];
		case 'knob': {
			// Narrow at the line, wide above it: the handles reach out past the feature's ends.
			const top = v(m, h);
			return [
				{ p0: v(a, 0), p1: v(a + 0.35 * L, 0.45 * h), p2: v(a - 0.15 * L, h), p3: top },
				{ p0: top, p1: v(b + 0.15 * L, h), p2: v(b - 0.35 * L, 0.45 * h), p3: v(b, 0) }
			];
		}
		case 'spike': {
			// Lower than it is wide and leaving the line smoothly, so a beak or a fin with one sharp tip, not a
			// tooth: rows of teeth make a saw.
			h = Math.sign(h) * Math.min(Math.abs(h), 0.6 * L);
			const tip = v(a + L * between(rng, 0.25, 0.75), h);
			return [
				{ p0: v(a, 0), p1: v(a + 0.45 * (tip.x - a), 0), p2: v(tip.x - 0.25 * (tip.x - a), 0.6 * h), p3: tip },
				{ p0: tip, p1: v(tip.x + 0.25 * (b - tip.x), 0.6 * h), p2: v(b - 0.45 * (b - tip.x), 0), p3: v(b, 0) }
			];
		}
		default:
			return [{ p0: v(a, 0), p1: v(a + 0.35 * L, 1.6 * h), p2: v(b - 0.35 * L, -1.6 * h), p3: v(b, 0) }];
	}
}

/**
 * A side from (0, 0) to (end, 0): one to three features, mostly one or two, which read, with straight runs
 * between them, each feature its own width, place, height (`reach` at most) and side.
 */
function featureSide(end: number, reach: number, rng: Rng): Seg[] {
	const count = pick(rng, [
		[1, 4],
		[2, 3],
		[3, 1]
	] as [number, number][]);
	// Feature widths and the runs between them, as shares of the side.
	const parts = Array.from({ length: 2 * count + 1 }, (_, i) =>
		i % 2 === 1 ? between(rng, 0.6, 1.4) : rng() < 0.4 ? 0 : between(rng, 0.05, 0.4)
	);
	const total = parts.reduce((x, y) => x + y, 0);
	const segs: Seg[] = [];
	let at = 0;
	parts.forEach((part, i) => {
		// The last part ends exactly at `end`, whatever the sum's rounding.
		const next = i === parts.length - 1 ? end : at + (part / total) * end;
		if (next - at > 1e-6) {
			if (i % 2 === 1) segs.push(...feature(at, next, (rng() < 0.5 ? -1 : 1) * reach * between(rng, 0.5, 1), rng));
			else segs.push(line(v(at, 0), v(next, 0)));
		}
		at = next;
	});
	return segs;
}

/**
 * One side as the type draws it: whole, half an S (to (0.5, 0)), or half an arch (to the middle, level).
 * Two times in three made of features (`featureSide`), else a free chain (`randomChain`, its nodes bold).
 */
function randomSide(half: HalfKind | null, reach: number, rng: Rng): SideCurve {
	const featured = rng() < 2 / 3;
	if (half === 'turn')
		return featured ? featureSide(0.5, reach, rng) : randomChain(v(0, 0), v(0.5, 0), int(rng, 1, 2), reach, rng, undefined, true);
	if (half === 'mirror') {
		const top = (rng() < 0.5 ? -1 : 1) * reach * between(rng, 0.45, 1);
		if (!featured) return randomChain(v(0, 0), v(0.5, top), int(rng, 1, 2), reach, rng, 0, true);
		// Features on the way up, then level at the middle, where the mirror image continues it.
		const rise = featureSide(0.35, reach, rng);
		return [...rise, { p0: v(0.35, 0), p1: v(0.4, 0), p2: v(0.43, top), p3: v(0.5, top) }];
	}
	return featured ? featureSide(1, reach, rng) : randomChain(v(0, 0), v(1, 0), pick(rng, PIECES), reach, rng, undefined, true);
}

/** One tile's figure (`tileFigure`), the least or most of its two colours' tiles. */
export interface TileFigure {
	/** The widest disc inside the tile, its diameter as a share of the tile's size (the root of its area), the less of the two. */
	body: number;
	/** The share of the tile thinner than 0.14 of its size: teeth and necks, the more of the two. */
	thin: number;
}

const FIGURE_SAMPLES = 64;

/** The figure of one tile, the cell (c, d) of the pattern: rasterised over its bounding square. */
function cellFigure(tile: PatternTile, c: number, d: number): { body: number; thin: number } {
	const outline: Vec[] = [];
	for (const s of cellOutline(tile, c, d))
		for (let i = 0; i < 12; i++) {
			const t = i / 12;
			const u = 1 - t;
			outline.push(
				v(
					u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
					u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
				)
			);
		}
	let area = 0;
	for (let i = 0; i < outline.length; i++) {
		const a = outline[i]!;
		const b = outline[(i + 1) % outline.length]!;
		area += a.x * b.y - b.x * a.y;
	}
	const size = Math.sqrt(Math.abs(area) / 2);
	const xs = outline.map((p) => p.x);
	const ys = outline.map((p) => p.y);
	// A sample's margin of outside all round, so the distance to outside is measured from every side.
	const R = FIGURE_SAMPLES;
	const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	const step = span / (R - 4);
	const x0 = Math.min(...xs) - 2 * step;
	const y0 = Math.min(...ys) - 2 * step;
	const inside = new Uint8Array(R * R);
	for (let r = 0; r < R; r++) {
		// Where the outline crosses the row, sorted: inside between each odd and even crossing.
		const y = y0 + (r + 0.5) * step;
		const xings: number[] = [];
		for (let i = 0; i < outline.length; i++) {
			const a = outline[i]!;
			const b = outline[(i + 1) % outline.length]!;
			if (a.y > y !== b.y > y) xings.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
		}
		xings.sort((p, q) => p - q);
		for (let k = 0; k + 1 < xings.length; k += 2)
			for (let col = Math.max(0, Math.ceil((xings[k]! - x0) / step - 0.5)); col < R && x0 + (col + 0.5) * step < xings[k + 1]!; col++)
				inside[r * R + col] = 1;
	}
	// Distances in steps, to outside and then to the core (the samples at least `radius` inside).
	const toOutside = chamfer(R, (i) => !inside[i]);
	const depth = (i: number) => toOutside[i]! / 3 - 0.5;
	let deepest = 0;
	for (let i = 0; i < R * R; i++) if (inside[i]) deepest = Math.max(deepest, depth(i));
	const radius = (0.07 * size) / step;
	const toCore = chamfer(R, (i) => !!inside[i] && depth(i) >= radius);
	let count = 0;
	let thin = 0;
	for (let i = 0; i < R * R; i++)
		if (inside[i]) {
			count++;
			if (toCore[i]! / 3 - 0.5 > radius + 1) thin++;
		}
	return { body: (2 * deepest * step) / size, thin: count ? thin / count : 1 };
}

/**
 * The shape of a tile as a figure, both colours' tiles (they differ where the sides are free): how much of
 * it is body, how much teeth. Escher's birds have a body 0.64 of their size, the rest beak, wings and tail;
 * a tile whose body is most of it is a chequerboard with dents, one with much thin is a saw.
 */
export function tileFigure(tile: PatternTile): TileFigure {
	const a = cellFigure(tile, 0, 0);
	const b = cellFigure(tile, 1, 0);
	return { body: Math.min(a.body, b.body), thin: Math.max(a.thin, b.thin) };
}

/**
 * Whether a tile reads as a figure (`tileFigure`): a body between 0.45 and 0.75 of its size, so neither a
 * splinter nor a square with dents, and at most 5 % of it thin. `square` lets the body be up to 0.9, for
 * the scales and the plain interlocking shapes (the tab's examples are 0.62–0.88), never the chequerboard.
 */
export function isFigure(tile: PatternTile, square = false): boolean {
	const { body, thin } = tileFigure(tile);
	return thin <= 0.05 && body >= 0.45 && body <= (square ? 0.9 : 0.75);
}

/** A random type and size: the round of draws `randomTileDraw` keeps them for. */
export function randomTileKind(rng: Rng = Math.random): { rule: TileRule; cuts: number } {
	return { rule: ALL_RULES[int(rng, 0, ALL_RULES.length - 1)]!, cuts: pick(rng, CUTS) };
}

/** A random tile of the type and size, not yet checked: every side the type draws, a lean and a shape; `shrink` makes them all smaller. */
export function randomTileDraw(rng: Rng, kind: { rule: TileRule; cuts: number }, shrink = 1): PatternTile {
	const { rule, cuts } = kind;
	const reach = between(rng, 0.3, 0.75) * shrink;
	const curves = Object.fromEntries(
		ruleInfo(rule).curves.map((key) => [key, randomSide(halfOf(rule, key), reach * between(rng, 0.6, 1), rng)])
	);
	// Escher's birds lean their tiles almost a cell (0.98 and −0.66): a strong lean makes a figure as much as the sides do.
	const lean = canLean(rule) && rng() < 0.7 ? { offset: v(between(rng, -0.9, 0.9) * shrink, between(rng, -0.9, 0.9) * shrink) } : {};
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
