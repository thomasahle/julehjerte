/**
 * Stored hidden cuts: a heart solved once offline by the exact-outline search
 * (static/inverse/core/exact), kept as where its cuts run on the picture, and
 * drawn again on the picture of any size whose outline has the same corners.
 *
 * A picture's outline is its rings (see `picture`); a recipe names places on
 * them by corner, not by coordinate: the k-th corner of ring r, and how far
 * along from it to the next. A corner is a vertex turning more than
 * `CORNER_TURN`, or one the ring shares with another (two checks meeting at a
 * point); a ring without any (a circle) is measured from its first vertex. As
 * the circle grows, a ring keeps its corners while its arcs take more
 * vertices, so the same recipe draws every size of one outline, its cuts
 * moving with the corners they join.
 *
 * The picture's rings overlap where its parts are combined even–odd (a
 * check and the circle over it), so its outline can turn from one ring to
 * another at a corner of one lying on the other's side: a place there is
 * named by that corner, and a stretch along the other ring starts or ends
 * where the corner meets it. Where two rings cross at a vertex of neither (a
 * motif over a check's side), the place is their crossing, named on one of
 * them with the other as `x`.
 *
 * Each slit of each paper (A crosses the sheet in y, B in x, as `compile`
 * reads them) is a list of pieces: a stretch of a ring's outline, which that
 * paper alone cuts, or a hidden cut both papers cut, straight between two
 * places on the outline or bent where the search bent it (each bend given in
 * the cut's own frame: along it and across it, as shares of its length).
 *
 * A board's recipe is a topology's, not a motif's. Inside the circle the
 * board's lines are cleared, so a motif there is an island crossing none of
 * the board's outline, and any motif whose rings nest alike (one outline, an
 * outline with a hole, ...) can be drawn into any other without touching the
 * board: one recipe cuts them all. Its places on the board are named by
 * corner as above; on the motif, by their order round each ring (see
 * `motifRings`), and where they fall on a particular motif is chosen when it
 * is drawn (see `placeMotif`): the hidden cuts to them as short as they can
 * be without crossing the outline, each place kept in its order.
 */
import { compile, ConstructionError, type Edge, type Point, type Ring } from './geometry';
import type { Known } from './picture';
import type { OutlineFrame } from './topologyTransfer';

/** A place on the outline: ring `r`, `u` of the way from its `k`-th corner to
 * the next; where ring `x` crosses it there (two rings crossing at a vertex of
 * neither), the crossing itself. */
export type RecipeAnchor = { r: number; k: number; u: number; x?: number };
/** A stretch of ring `v` from `a` to `b`, in the ring's own order (`f`) or against it. */
export type RecipeStretch = { v: number; a: RecipeAnchor; b: RecipeAnchor; f: boolean };
/** A hidden cut from one place to another, through its bends. */
export type RecipeChord = { h: [RecipeAnchor, RecipeAnchor]; bends: [number, number][] };
export type RecipePiece = RecipeStretch | RecipeChord;
/** A motif's own recipe, solved on its picture in a frame. */
export type MotifRecipe = {
	/** The frame and, on a board, its strips. */
	style: string;
	strips?: number;
	/** The size settings, in whole percents, it was found to cut at no worse
	 * than the generator's own construction, at the space around the motif
	 * `gap` (see `GeneratorRequest`). */
	steps: number[];
	gap: number;
	/** The corners of each ring: an outline with others is another. */
	sig: number[];
	/** What the generator's own heart told the picture it was solved on
	 * (where it keeps a motif whole, or on its enclosing circle; see
	 * `picture`), so the stored heart shows the picture the generator's would. */
	known?: Known;
	A: RecipePiece[][];
	B: RecipePiece[][];
};
/** A place in a topology's recipe: on the board's outline, `t` of the way
 * along its edge `e` (see `boardOutline`); the motif's ring `m`'s place `i`;
 * or a point `p` of the sheet on neither, where a hidden cut bends (where the
 * board's lines cross inside the circle, the same at every size). */
export type TopologyAnchor = { e: number; t: number } | { m: number; i: number } | { p: Point };
/** A stretch of the board's edge `e`, from `t[0]` of the way along it to
 * `t[1]`; a stretch of the motif's ring `m` from its place `i[0]` to `i[1]`,
 * in the ring's order (`f`) or against it; or a hidden cut both papers cut,
 * from one place to another through its bends, `inside` where it runs
 * through the motif. */
export type TopologyPiece = { e: number; t: [number, number] } | { m: number; i: [number, number]; f: boolean }
	| { h: [TopologyAnchor, TopologyAnchor]; bends: [number, number][]; inside?: boolean };
/** A topology's recipe (see `topologyRecipes`), for every motif of it. */
export type TopologyRecipe = {
	style: string;
	strips?: number;
	/** The size settings, in whole percents, it is drawn at. */
	steps: number[];
	/** The board's outline as a graph (see `boardOutline`): a board whose
	 * outline is another graph is another topology. */
	outline: string;
	/** How its motif's rings nest (see `nestingOf`), and on each, in
	 * `motifRings` order, its places in the ring's order, each where it lay
	 * on the motif solved: its direction from the ring's centre in degrees
	 * and its distance as a share of the ring's mean radius (see `placeMotif`). */
	motif: string;
	places: [number, number][][];
	/** Where a place lay on the motif solved, by ring and place, where it lay a
	 * hair off the outline (the search merging it with a board corner near
	 * it): a held recipe draws it there, for the solve itself. */
	exact?: (Point | null)[][];
	/** Where each of its motif's rings lay on the motif solved (its centre,
	 * see `whereIn`), by which a motif's rings nesting alike are named as the
	 * recipe's (see `motifRings`). */
	rings?: [number, number][];
	/** Whether its places stay where they lay on the motif solved, wherever
	 * their cuts cross nothing from there, rather than being made short: the
	 * solve itself on that motif and on ones like it. */
	held?: boolean;
	/** The sizes its solve was made for on its own motif: there it is drawn
	 * first of that motif's own (see `storedHearts`). */
	solved?: number[];
	/** A pair's recipe (see pairs.mjs): its board's outline as it is carried
	 * to every other of the pair's (the board's blobs and its motif's nesting;
	 * see `carryTopology`), where it is drawn at every size on every board,
	 * its `steps` and `strips` aside. */
	frame?: OutlineFrame;
	A: TopologyPiece[][];
	B: TopologyPiece[][];
};
export type Recipe = MotifRecipe | TopologyRecipe;
export const isTopology = (recipe: Recipe): recipe is TopologyRecipe => 'outline' in recipe;
export type RecipeFile = { version: 1; recipes: Recipe[] };

/** The least turn, in degrees, that makes a ring's vertex a corner. */
export const CORNER_TURN = 20;

const key = (p: Point) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/** A ring's arc lengths: to each vertex, and around. */
function arcs(ring: Ring) {
	const cum = [0];
	for (let i = 1; i <= ring.length; i++) {
		const a = ring[i - 1], b = ring[i % ring.length];
		cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
	}
	return { cum, length: cum[ring.length] };
}

/** Each ring's corners, as vertex indices in its order (see the module's comment). */
export function ringCorners(rings: Ring[]): number[][] {
	const shared = new Map<string, number>();
	for (const ring of rings) for (const p of new Set(ring.map(key))) shared.set(p, (shared.get(p) ?? 0) + 1);
	return rings.map(ring => {
		const corners: number[] = [];
		ring.forEach((p, i) => {
			const a = ring[(i + ring.length - 1) % ring.length], b = ring[(i + 1) % ring.length];
			const turn = Math.abs(Math.atan2((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]),
				(p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1]))) * 180 / Math.PI;
			if (turn > CORNER_TURN || (shared.get(key(p)) ?? 0) > 1) corners.push(i);
		});
		return corners.length ? corners : [0];
	});
}

/** The outline a recipe is drawn on: its rings with their corners and arc lengths. */
export type RecipeOutline = { rings: Ring[]; corners: number[][]; arcs: { cum: number[]; length: number }[] };
export function recipeOutline(rings: Ring[]): RecipeOutline {
	return { rings, corners: ringCorners(rings), arcs: rings.map(arcs) };
}

/** How far on from arc `from` arc `to` lies along a ring `length` round. */
const ahead = (from: number, to: number, length: number) => ((to - from) % length + length) % length;

/** An anchor's arc length along its ring. */
function arcOf(o: RecipeOutline, { r, k, u }: RecipeAnchor): number {
	const corners = o.corners[r], { cum, length } = o.arcs[r];
	if (k >= corners.length) throw new ConstructionError('topology', 'A stored cut names a corner the outline lacks');
	const from = cum[corners[k]], to = cum[corners[(k + 1) % corners.length]];
	const span = corners.length === 1 ? length : ahead(from, to, length);
	return (from + u * span) % length;
}

/** The point at arc `s` of ring `r`: a vertex exactly where `s` is one's. */
function pointAt(o: RecipeOutline, r: number, s: number): Point {
	const ring = o.rings[r], { cum } = o.arcs[r];
	let i = 0;
	while (i < ring.length - 1 && cum[i + 1] <= s) i++;
	const a = ring[i], b = ring[(i + 1) % ring.length], t = cum[i + 1] > cum[i] ? (s - cum[i]) / (cum[i + 1] - cum[i]) : 0;
	return t ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : a;
}

/** Where two rings' sides cross nearest to `q` (`q` itself where they do not cross). */
function crossingNear(a: Ring, b: Ring, q: Point): Point {
	let best: Point = q, least = Infinity;
	for (let i = 0; i < a.length; i++) {
		const p0 = a[i], p1 = a[(i + 1) % a.length];
		for (let j = 0; j < b.length; j++) {
			const q0 = b[j], q1 = b[(j + 1) % b.length];
			const d = (p1[0] - p0[0]) * (q1[1] - q0[1]) - (p1[1] - p0[1]) * (q1[0] - q0[0]);
			if (!d) continue;
			const t = ((q0[0] - p0[0]) * (q1[1] - q0[1]) - (q0[1] - p0[1]) * (q1[0] - q0[0])) / d;
			const u = ((q0[0] - p0[0]) * (p1[1] - p0[1]) - (q0[1] - p0[1]) * (p1[0] - p0[0])) / d;
			if (t < 0 || t > 1 || u < 0 || u > 1) continue;
			const c: Point = [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])], e = Math.hypot(c[0] - q[0], c[1] - q[1]);
			if (e < least) { least = e; best = c; }
		}
	}
	return best;
}

/** The arc of ring `r` nearest to `p`. */
function project(o: RecipeOutline, r: number, p: Point): number {
	const ring = o.rings[r], { cum } = o.arcs[r];
	let best = { d: Infinity, s: 0 };
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
		const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
		const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
		if (d < best.d) best = { d, s: cum[i] + t * (cum[i + 1] - cum[i]) };
	}
	return best.s;
}

/** Whether a recipe's outline is this one: as many rings, each with as many corners. */
export const fitsOutline = (recipe: MotifRecipe, o: RecipeOutline) =>
	recipe.sig.length === o.rings.length && recipe.sig.every((n, r) => o.corners[r].length === n);

/** Where a place lies: on its ring, or where it is a crossing, there; at the
 * vertex of any ring it falls on (`vertices`), so pieces meeting there meet
 * exactly. */
export function anchorPoint(o: RecipeOutline, an: RecipeAnchor, vertices = o.rings.flat()): Point {
	const q = pointAt(o, an.r, arcOf(o, an));
	return an.x !== undefined ? crossingNear(o.rings[an.r], o.rings[an.x], q)
		: vertices.find(v => Math.abs(v[0] - q[0]) < 1e-4 && Math.abs(v[1] - q[1]) < 1e-4) ?? q;
}

/** A recipe's cuts on the outline, as edges: each stretch its paper's, each
 * hidden cut both papers' (once, though every slit through it names it). */
export function recipeEdges(recipe: MotifRecipe, o: RecipeOutline): Edge[] {
	if (!fitsOutline(recipe, o)) throw new ConstructionError('topology', 'The stored cuts are for another outline');
	// One point per place, so pieces meeting there meet exactly: where one
	// ring's corner lies on another's side, the place on that side is the corner.
	const vertices = o.rings.flat(), places = new Map<string, Point>();
	const at = (an: RecipeAnchor) => {
		const k = `${an.r}:${an.k}:${an.u}:${an.x ?? ''}`;
		let p = places.get(k);
		if (!p) places.set(k, p = anchorPoint(o, an, vertices));
		return p;
	};
	const edges: Edge[] = [], chords = new Set<string>();
	const line = (pts: Point[], family: Edge['family'], kind: Edge['kind']) => {
		for (let i = 1; i < pts.length; i++) if (key(pts[i - 1]) !== key(pts[i])) edges.push({ from: pts[i - 1], to: pts[i], family, kind });
	};
	for (const family of ['A', 'B'] as const) for (const slit of recipe[family]) for (const piece of slit) {
		if ('v' in piece) {
			const { cum, length } = o.arcs[piece.v], ring = o.rings[piece.v];
			// An end anchored on another ring's corner (where the picture's rings
			// overlap, its outline turns from one to the other) is found on this one.
			const end = (an: RecipeAnchor) => an.r === piece.v ? arcOf(o, an) : project(o, piece.v, at(an));
			const s0 = end(piece.a), s1 = end(piece.b), run = piece.f ? ahead(s0, s1, length) : ahead(s1, s0, length);
			// The ring's vertices strictly between, in the direction of travel.
			const inner = ring.map((_, i) => i).filter(i => { const d = piece.f ? ahead(s0, cum[i], length) : ahead(cum[i], s0, length); return d > 1e-9 && d < run - 1e-9; })
				.sort((i, j) => piece.f ? ahead(s0, cum[i], length) - ahead(s0, cum[j], length) : ahead(cum[i], s0, length) - ahead(cum[j], s0, length));
			line([at(piece.a), ...inner.map(i => ring[i]), at(piece.b)], family, 'outline');
		} else {
			const [a, b] = piece.h, id = [a, b].map(an => `${an.r}:${an.k}:${an.u}:${an.x ?? ''}`).sort().join('|');
			if (chords.has(id)) continue;
			chords.add(id);
			const P = at(a), Q = at(b), d = [Q[0] - P[0], Q[1] - P[1]];
			line([P, ...piece.bends.map(([u, v]): Point => [P[0] + u * d[0] - v * d[1], P[1] + u * d[1] + v * d[0]]), Q], 'AB', 'shared');
		}
	}
	return edges;
}

/** The stored recipes for a request's size setting and space: those found to
 * hold there; none for a size no recipe was checked at, nor a motif's own at
 * another space. Each is drawn only on its own outline (see `fitsOutline`,
 * `outlineFor`). */
export function recipesAt(recipes: readonly Recipe[], style: string, strips: number | undefined, setting: number, gap: number): Recipe[] {
	const step = Math.round(setting * 100);
	if (Math.abs(setting * 100 - step) > 1e-6) return [];
	return recipes.filter(r => r.style === style && r.strips === strips && (isTopology(r) || r.gap === gap) && r.steps.includes(step));
}

/** The stored recipe for a picture: one that holds at its size and space,
 * whose outline is this one's. */
export function chooseRecipe(recipes: readonly Recipe[], style: string, strips: number | undefined, setting: number, gap: number, o: RecipeOutline): MotifRecipe | undefined {
	return recipesAt(recipes, style, strips, setting, gap).find((r): r is MotifRecipe => !isTopology(r) && fitsOutline(r, o));
}

/** A motif's recipe drawn as a construction on its outline: its edges compiled into slits. */
export function recipeConstruction(recipe: MotifRecipe, o: RecipeOutline) {
	const edges = recipeEdges(recipe, o);
	return { geometry: compile(edges), edges, artwork: o.rings, strips: recipe.A.length + 1 };
}

/** The outline a motif's recipe is drawn on in a picture, or none where it
 * does not have the recipe's corners. */
export function outlineFor(recipe: MotifRecipe, picture: { rings: Ring[] }): RecipeOutline | undefined {
	const o = recipeOutline(picture.rings);
	return fitsOutline(recipe, o) ? o : undefined;
}
