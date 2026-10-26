/**
 * A topology's stored hidden cuts (see `recipes`). On the board circle the
 * board's lines are cleared inside the circle, so a motif there is an island
 * crossing none of the board's outline, and any motif whose rings nest alike
 * (one outline, an outline with a hole, ...) can be drawn into any other
 * without touching the board: one recipe cuts them all. Its board is the
 * board's outline as the picture shows it (see `boardOutline`), places on it
 * an edge of that and a share along it. Its places on the motif are named by
 * their order round each ring (see `motifRings`), and where they fall on a
 * particular motif is chosen when it is drawn (see `placeMotif`).
 *
 * A motif's solve becomes its topology's recipe by `topologyOf`; a
 * topology's recipe is drawn on a picture by `topologyConstruction`.
 */
import { compile, type Edge, type Point, type Ring } from './geometry';
import { gridClearance, gridClearanceScale } from '../geometry/clearance';
import { alongEdge, boardOutline, edgeStretch, onOutline, type BoardOutline } from './boardOutline';
import { anchorPoint, fitsOutline, recipeEdges, recipeOutline, type MotifRecipe, type RecipeAnchor, type TopologyAnchor, type TopologyPiece, type TopologyRecipe } from './recipes';

/** A ring's arc lengths: to each vertex, and around. */
function arcs(ring: Ring) {
	const cum = [0];
	for (let i = 1; i <= ring.length; i++) {
		const a = ring[i - 1], b = ring[i % ring.length];
		cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
	}
	return { cum, length: cum[ring.length] };
}

const signedArea = (ring: Ring) => ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0) / 2;

function inside(p: Point, ring: Ring) {
	let c = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
		if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < (ring[j][0] - ring[i][0]) * (p[1] - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
	return c;
}

/** The colour of the even–odd picture of some rings at a point: 1 inside an odd number. */
const colourAt = (p: Point, rings: Ring[]) => rings.reduce((v, ring) => v ^ Number(inside(p, ring)), 0);

/** A ring's centre: its area's. */
function centre(ring: Ring): Point {
	let a = 0, x = 0, y = 0;
	ring.forEach((p, i) => {
		const q = ring[(i + 1) % ring.length], c = p[0] * q[1] - q[0] * p[1];
		a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c;
	});
	return a ? [x / (3 * a), y / (3 * a)] : ring[0];
}

/** How far a ring's vertices lie from `c` on average. */
const meanRadius = (ring: Ring, c: Point) => ring.reduce((sum, p) => sum + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / ring.length;

/** Each ring's nearest ring round it, or -1 for an outer one. */
function parents(rings: Ring[]): number[] {
	return rings.map((ring, i) => {
		let best = -1, least = Infinity;
		rings.forEach((other, j) => {
			const area = Math.abs(signedArea(other));
			if (j !== i && area < least && inside(ring[0], other)) { best = j; least = area; }
		});
		return best;
	});
}

/** Each ring's nesting: the rings straight inside it, in brackets, sorted. */
function nestings(rings: Ring[], parent = parents(rings)): string[] {
	const codes: string[] = [];
	const code = (i: number): string => codes[i] ??= `(${rings.map((_, j) => j).filter(j => parent[j] === i).map(code).sort().join('')})`;
	rings.forEach((_, i) => code(i));
	return codes;
}

/** How a motif's rings nest, read alike for every motif nesting alike: each
 * outer ring as the rings straight inside it in brackets, sorted ("()" one
 * outline, "(())" an outline with a hole, "()()" two outlines apart). */
export function nestingOf(rings: Ring[]): string {
	const parent = parents(rings), codes = nestings(rings, parent);
	return rings.map((_, i) => i).filter(i => parent[i] < 0).map(i => codes[i]).sort().join('');
}

/** A motif's middle (its box's) and half its width or height, the larger. */
function motifFrame(rings: Ring[]): { mid: Point; half: number } {
	const pts = rings.flat(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
	const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return { mid: [(x0 + x1) / 2, (y0 + y1) / 2], half: Math.max(x1 - x0, y1 - y0) / 2 };
}

/** Where a point lies from a motif's middle: its direction in degrees, and
 * its distance as a share of half the motif's size (see `motifFrame`). */
function whereIn(p: Point, { mid, half }: { mid: Point; half: number }): [number, number] {
	return [Math.round(((Math.atan2(p[1] - mid[1], p[0] - mid[0]) * 180 / Math.PI + 360) % 360) * 10) / 10,
		Math.round(Math.hypot(p[0] - mid[0], p[1] - mid[1]) / half * 1000) / 1000];
}

/** A motif's rings in the order a topology's recipe names them, each running
 * with positive area (`turned` where reversed for it; `from`, which ring it
 * was): each outer ring followed by those inside it, rings nesting alike
 * under one ring in the order of their centres' directions from the motif's
 * middle, or, given where a recipe's rings lay on the motif solved (`where`,
 * see `whereIn`), each in the place of the recipe's ring it lies nearest (a
 * ring right of the middle is at 0° or 360° by a hair, so the directions
 * alone would not name it alike at every size). */
export function motifRings(rings: Ring[], where?: [number, number][]): { ring: Ring; from: number; turned: boolean }[] {
	const parent = parents(rings), codes = nestings(rings, parent), frame = motifFrame(rings), { mid } = frame;
	const direction = (i: number) => { const c = centre(rings[i]); return (Math.atan2(c[1] - mid[1], c[0] - mid[0]) * 180 / Math.PI + 360) % 360; };
	const size = (i: number): number => 1 + rings.reduce((n, _, j) => n + (parent[j] === i ? size(j) : 0), 0);
	const ordered = (of: number) => rings.map((_, i) => i).filter(i => parent[i] === of)
		.sort((i, j) => codes[i] < codes[j] ? -1 : codes[i] > codes[j] ? 1 : direction(i) - direction(j));
	const order: number[] = [];
	const visit = (i: number) => { order.push(i); place(ordered(i)); };
	// Each run of rings nesting alike, where the recipe says where they lay: the
	// order that puts each nearest the recipe's ring in its place.
	const place = (children: number[]) => {
		for (let k = 0; k < children.length;) {
			let end = k;
			while (end < children.length && codes[children[end]] === codes[children[k]]) end++;
			let run = children.slice(k, end);
			if (where && run.length > 1) {
				const step = size(run[0]), start = order.length;
				const off = (i: number, slot: number) => {
					const hint = where[start + slot * step];
					if (!hint) return 0;
					const a = hint[0] * Math.PI / 180, c = centre(rings[i]);
					return Math.hypot(c[0] - mid[0] - hint[1] * frame.half * Math.cos(a), c[1] - mid[1] - hint[1] * frame.half * Math.sin(a));
				};
				run = bestOrder(run, off);
			}
			run.forEach(visit);
			k = end;
		}
	};
	place(ordered(-1));
	return order.map(i => {
		const turned = signedArea(rings[i]) < 0;
		return { ring: turned ? [...rings[i]].reverse() : rings[i], from: i, turned };
	});
}

/** The order of `items` that costs least in all, `cost(item, slot)` for each
 * in its slot: every order of up to seven, else nearest first. */
function bestOrder(items: number[], cost: (item: number, slot: number) => number): number[] {
	if (items.length > 7) {
		const left = [...items], out: number[] = [];
		for (let slot = 0; slot < items.length; slot++) {
			const k = left.reduce((best, item, j) => cost(item, slot) < cost(left[best], slot) ? j : best, 0);
			out.push(left.splice(k, 1)[0]);
		}
		return out;
	}
	let best = items, least = Infinity;
	const permute = (done: number[], left: number[], sum: number) => {
		if (sum >= least) return;
		if (!left.length) { best = done; least = sum; return; }
		left.forEach((item, j) => permute([...done, item], left.filter((_, k) => k !== j), sum + cost(item, done.length)));
	};
	permute([], items, 0);
	return best;
}

/** Whether a motif lies on one colour of the board, crossing none of its
 * outline (sides where the board's rings cancel even–odd do not count). */
export function islandOn(board: Ring[], motif: Ring[]): boolean {
	let first: number | undefined;
	for (const ring of motif) for (let i = 0; i < ring.length; i++) {
		const a = ring[i], b = ring[(i + 1) % ring.length];
		for (const p of [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point]) {
			const c = colourAt(p, board);
			if (first === undefined) first = c;
			else if (c !== first) return false;
		}
	}
	return true;
}

/** How far apart, at most, the points a place on a motif may take lie along its outline (of the sheet's 100). */
const PLACE_STEP = 1;
/** How near a vertex (of the sheet's 100) a place's point is taken to be at it. */
const PLACE_SNAP = 1e-4;
/** How many points either side of a place's first guess its partners look at
 * while the places are found in order (see `placeMotif`). */
const GUESS_SPREAD = 6;
/** How near (of the sheet's 100) a motif's mirror image across the heart's
 * middle must lie to it for the motif to count as its own mirror image there,
 * well within what the heart's lobes may differ by and still share a template
 * (see `lobesShareTemplate`). */
const MIRROR_NEAR = 1;
/** How near, as a share of its ring's mean radius, a place's mirror image
 * must lie to another's where it lay on the motif solved for the two to be a
 * mirror pair (a solve tied so, its places at the corners nearest each other
 * across the middle). */
const MIRROR_PAIR = .08;

/** How near (of the sheet's 100) a held recipe's place must fall to where the
 * solve had it, a hair off the outline, to be drawn there: on its own motif at
 * the size solved, not at another size or on another motif. */
const EXACT_NEAR = .5;

/** The heart's middle on the sheet: the diagonal its lobes mirror across. */
const mirrored = (p: Point): Point => [p[1], p[0]];

/** Where on a ring a point lies nearest: the side and how far along it, a
 * point within PLACE_SNAP of a vertex at it (a place at a corner, as places
 * mostly are, comes back a float's hair from it). */
function nearestOn(ring: Ring, h: Point): { side: number; t: number; d: number } {
	let best = { side: 0, t: 0, d: Infinity };
	ring.forEach((p, j) => {
		const q = ring[(j + 1) % ring.length], dx = q[0] - p[0], dy = q[1] - p[1], l = dx * dx + dy * dy;
		let t = l ? Math.max(0, Math.min(1, ((h[0] - p[0]) * dx + (h[1] - p[1]) * dy) / l)) : 0;
		const d = Math.hypot(p[0] + t * dx - h[0], p[1] + t * dy - h[1]), along = t * Math.sqrt(l);
		if (along < PLACE_SNAP) t = 0;
		else if (Math.sqrt(l) - along < PLACE_SNAP) t = 1;
		if (d < best.d) best = { side: j, t, d };
	});
	return best.t === 1 ? { side: (best.side + 1) % ring.length, t: 0, d: best.d } : best;
}

/** Whether some rings are their own mirror image across the heart's middle (MIRROR_NEAR). */
function selfMirrored(rings: Ring[]): boolean {
	return rings.every(ring => ring.every(p => {
		const q = mirrored(p);
		return rings.some(other => nearestOn(other, q).d < MIRROR_NEAR);
	}));
}

/** Whether the cross product `d` of two segments' directions leaves them
 * parallel to rounding (a cut on the line of a side it ends at: its `t` and
 * `u` would be noise). */
const parallel = (d: number, p: Point, q: Point, a: Point, b: Point) => Math.abs(d) <= 1e-9 * Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Whether two segments cross between their ends. */
function crosses(p: Point, q: Point, a: Point, b: Point): boolean {
	const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
	if (parallel(d, p, q, a, b)) return false;
	const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
	return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

/** How far a point lies from a side. */
function fromSide(p: Point, a: Point, b: Point): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
	return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/** A side of the outline, and whose: the board's (-1) or a motif ring's. */
type Side = { a: Point; b: Point; of: number };

/** Sides found by where they lie: each in every cell of `CELL` units its box meets. */
const CELL = 4;
class Sides {
	private cells = new Map<number, Side[]>();
	private seen = new Map<Side, number>();
	private visit = 0;
	constructor(readonly all: Side[]) {
		for (const side of all) this.cover(side, side, (key, list) => list ? list.push(side) : this.cells.set(key, [side]));
	}
	private cover(a: { a: Point; b: Point }, _: unknown, f: (key: number, list: Side[] | undefined) => void, grow = 0) {
		const x0 = Math.floor((Math.min(a.a[0], a.b[0]) - grow) / CELL), x1 = Math.floor((Math.max(a.a[0], a.b[0]) + grow) / CELL);
		const y0 = Math.floor((Math.min(a.a[1], a.b[1]) - grow) / CELL), y1 = Math.floor((Math.max(a.a[1], a.b[1]) + grow) / CELL);
		for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = (x + 1000) * 4096 + y + 1000; f(key, this.cells.get(key)); }
	}
	/** The sides near the segment from `a` to `b`: in the cells its box, grown by `grow`, meets. */
	near(a: Point, b: Point, grow: number): Side[] {
		const out: Side[] = [], visit = ++this.visit;
		this.cover({ a, b }, null, (_, list) => {
			for (const side of list ?? []) if (this.seen.get(side) !== visit) { this.seen.set(side, visit); out.push(side); }
		}, grow);
		return out;
	}
}

/** Whether a side is part of the outline a cut's end `e` lies on (`of`):
 * through it, or near it (both its ends within `near`). */
const meets = (side: Side, e: Point, of: number, near: number) => side.of === of && (fromSide(e, side.a, side.b) < 1e-6
	|| (Math.hypot(side.a[0] - e[0], side.a[1] - e[1]) <= near && Math.hypot(side.b[0] - e[0], side.b[1] - e[1]) <= near));

/** The least angle, in degrees, a cut leaving `e` towards `to` makes with the
 * outline it meets there (see `meets`), towards each side's far end, or both
 * ends of a side through `e`. */
function meetingAngle(e: Point, of: number, to: Point, all: Sides, near: number): number {
	const l = Math.hypot(to[0] - e[0], to[1] - e[1]), d = [(to[0] - e[0]) / l, (to[1] - e[1]) / l];
	let least = 180;
	for (const side of all.near(e, e, near)) {
		if (!meets(side, e, of, near)) continue;
		const { a, b } = side, through = fromSide(e, a, b) < 1e-6;
		for (const f of through ? [a, b] : [Math.hypot(a[0] - e[0], a[1] - e[1]) > Math.hypot(b[0] - e[0], b[1] - e[1]) ? a : b]) {
			const m = Math.hypot(f[0] - e[0], f[1] - e[1]);
			if (m < 1e-6) continue;
			least = Math.min(least, Math.acos(Math.max(-1, Math.min(1, (d[0] * (f[0] - e[0]) + d[1] * (f[1] - e[1])) / m))) * 180 / Math.PI);
		}
	}
	return least;
}

/** What a straight piece of a hidden cut from `p` on the outline `pOf` to `q`
 * on `qOf` costs besides its length: Infinity where it crosses a side of the
 * outline, or passes nearer than `gap` to one away from its ends (the outline
 * it meets within three gaps of an end aside), or meets the outline at an end
 * at under 8° (a cut along a star's point into it meets it at half its tip,
 * which the generator allows); under 45°, a unit for every 5° less. A bend
 * (`of` NaN) meets nothing. */
function meeting(p: Point, pOf: number, q: Point, qOf: number, all: Sides, gap: number, strict = true): number {
	const x0 = Math.min(p[0], q[0]) - gap, x1 = Math.max(p[0], q[0]) + gap, y0 = Math.min(p[1], q[1]) - gap, y1 = Math.max(p[1], q[1]) + gap, near = 3 * gap;
	for (const side of all.near(p, q, gap)) {
		const { a, b } = side;
		if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) continue;
		const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
		if (!parallel(d, p, q, a, b)) {
			const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d;
			const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
			if (t > 1e-7 && t < 1 - 1e-7 && u >= 0 && u <= 1) return Infinity;
		}
		if (!strict || meets(side, p, pOf, near) || meets(side, q, qOf, near)) continue;
		if (Math.min(fromSide(a, p, q), fromSide(b, p, q), fromSide(p, a, b), fromSide(q, a, b)) < gap) return Infinity;
	}
	let cost = 0;
	if (!strict) return cost;
	for (const [e, of, to] of [[p, pOf, q], [q, qOf, p]] as const) {
		if (Number.isNaN(of)) continue;
		const angle = meetingAngle(e, of, to, all, near);
		if (angle < 8) return Infinity;
		if (angle < 45) cost += (45 - angle) / 5;
	}
	return cost;
}

/** A ring's thin parts: where it comes back within half a `scale` of itself
 * from three `scale`s or more round it (a thin tail, a narrow notch; the
 * generator's severe pinch, see `hasSeverePinch`), the two sides cut by one
 * paper would pinch it. Of `n` points round the ring (`at`, how far round
 * each lies, of `length`), each part's points (`part`, -1 for none: the
 * shorter way round between every two such sides, overlapping ones taken
 * together) and those every one of its stretches holds (`core`; else the
 * shortest's), where its one place must lie. */
function thinParts(points: Point[], at: number[], length: number, scale: number): { part: Int32Array; core: Uint8Array; parts: number } {
	const n = points.length, cover = new Int32Array(n), spans: [number, number][] = [];
	for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) {
		const round = at[y] - at[x];
		if (Math.min(round, length - round) < 3 * scale || Math.hypot(points[x][0] - points[y][0], points[x][1] - points[y][1]) >= scale / 2) continue;
		spans.push(round <= length / 2 ? [x, y] : [y, x]);
	}
	const each = (span: [number, number], f: (s: number) => void) => { for (let s = span[0]; ; s = (s + 1) % n) { f(s); if (s === span[1]) break; } };
	for (const span of spans) each(span, s => cover[s]++);
	const part = new Int32Array(n).fill(-1), core = new Uint8Array(n);
	if (!spans.length) return { part, core, parts: 0 };
	// Each run of covered points one part, starting after an uncovered point (where there is one).
	let parts = 0;
	const start = cover.findIndex(c => !c);
	if (start < 0) return { part: part.fill(0), core: core.fill(1), parts: 1 };
	for (let k = 1; k <= n; k++) {
		const s = (start + k) % n;
		if (cover[s]) part[s] = cover[(s + n - 1) % n] ? part[(s + n - 1) % n] : parts++;
	}
	for (let g = 0; g < parts; g++) {
		const mine = spans.filter(span => part[span[0]] === g);
		const inAll = Array.from({ length: n }, (_, s) => s).filter(s => part[s] === g && cover[s] === mine.length);
		if (inAll.length) for (const s of inAll) core[s] = 1;
		else {
			const size = (span: [number, number]) => (span[1] - span[0] + n) % n;
			each(mine.reduce((a, b) => size(a) <= size(b) ? a : b), s => { core[s] = 1; });
		}
	}
	return { part, core, parts };
}

/** The places of each of `count` places in a ring's order, among `n` points
 * round it, that cost least in all (`cost(i, s)`, place i at point s), each
 * at a point after the one before; where the ring has thin parts (see
 * `thinParts`), one place in each part's core and no other in the part. */
function cheapestInOrder(count: number, n: number, cost: (i: number, s: number) => number, thin?: ReturnType<typeof thinParts>): number[] | undefined {
	if (thin && thin.parts > count) return;
	const table = Array.from({ length: count }, (_, i) => Float64Array.from({ length: n }, (_, s) => cost(i, s)));
	let best: { total: number; picks: number[] } | undefined;
	// The first place at each of its cheapest points, the rest after it.
	const firsts = Array.from({ length: n }, (_, s) => s).filter(s => Number.isFinite(table[0][s]) && (!thin || thin.part[s] < 0 || thin.core[s]))
		.sort((a, b) => table[0][a] - table[0][b]).slice(0, 16);
	for (const s0 of firsts) {
		// From the first place on: each point's part, the part the first place is in
		// closed to the rest, and how far the next place may lie (`reach`): not past
		// the end of the next part beyond, which would leave that part without one.
		const part = (x: number) => thin ? thin.part[(s0 + x) % n] : -1, first = part(0);
		const ends = new Map<number, number>(), starts = new Map<number, number>();
		for (let x = 1; x < n; x++) {
			const g = part(x);
			if (g < 0 || g === first) continue;
			if (!starts.has(g)) starts.set(g, x);
			ends.set(g, x);
		}
		const reach = new Float64Array(n).fill(Infinity);
		for (let x = n - 2; x >= 0; x--) {
			reach[x] = reach[x + 1];
			const g = part(x + 1);
			if (g >= 0 && g !== first && starts.get(g) === x + 1) reach[x] = Math.min(reach[x], ends.get(g)!);
		}
		const open = (x: number) => !thin || (part(x) !== first || first < 0) && (part(x) < 0 || thin.core[(s0 + x) % n] === 1);
		const step = (a: number, b: number) => b <= reach[a] && !(part(a) >= 0 && part(a) === part(b));
		let last = new Float64Array(n).fill(Infinity);
		last[0] = table[0][s0];
		const from: Int32Array[] = [];
		for (let i = 1; i < count; i++) {
			const here = new Float64Array(n).fill(Infinity), back = new Int32Array(n).fill(-1), costs = table[i];
			let least = Infinity, at = -1;
			for (let j = 1; j < n; j++) {
				if (!thin) {
					if (last[j - 1] < least) { least = last[j - 1]; at = j - 1; }
				} else {
					least = Infinity;
					if (open(j)) for (let a = i - 1; a < j; a++) if (last[a] < least && step(a, j)) { least = last[a]; at = a; }
				}
				const c = least + costs[(s0 + j) % n];
				if (c < here[j]) { here[j] = c; back[j] = at; }
			}
			from.push(back);
			last = here;
		}
		// The last place leaves no part after it without one.
		let j = -1;
		for (let x = 0; x < n; x++) if (Number.isFinite(last[x]) && reach[x] === Infinity && (j < 0 || last[x] < last[j])) j = x;
		if (j < 0) continue;
		const total = last[j];
		if (!Number.isFinite(total) || (best && best.total <= total)) continue;
		const picks = [j];
		for (let i = count - 1; i >= 1; i--) picks.unshift(j = from[i - 1][j]);
		best = { total, picks: picks.map(o => (s0 + o) % n) };
	}
	return best?.picks;
}

/** A place's hidden cut (see `placeMotif`): where it goes (a point on the
 * board, or a place on the motif), its bends (from the cut's first end,
 * `first` where that is this place), and whether it runs through the motif. */
type Cut = { to: { at: Point } | { m: number; i: number }; inside: boolean; bends: [number, number][]; first: boolean };

/** Where a topology recipe's places (`wanted`, see `TopologyRecipe`) fall on
 * a motif (its rings as `motifRings` gives them), given each place's cuts,
 * which paper cuts each stretch of each ring between places (`papers`), and
 * the board's outline and hidden cuts (`board`): the motif's rings with a
 * vertex at each place, and its index there; none where some cut finds no
 * clear way. Each place is first put at the point of its ring nearest where
 * it lay on the motif solved; where those keep the recipe's order round each
 * ring and a held recipe's cuts cross nothing from them, they are the solve
 * itself; else the places are found in order, the hidden cuts to the board
 * as short as they can be without crossing or crowding the outline, a cut
 * between two places on the motif then shortened in turns. */
function placeMotif(motif: Ring[], wanted: [number, number][][], cuts: Cut[][][], papers: (string | undefined)[][], board: Side[], strips: number, held: boolean): { rings: Ring[]; places: number[][] } | undefined {
	const sides = new Sides([...board, ...motif.flatMap((ring, m) => ring.map((a, j) => ({ a, b: ring[(j + 1) % ring.length], of: m })))]);
	// The paper the generator leaves between cuts on this board (see `gridClearance`).
	const gap = gridClearance(strips);
	// The points each place may take: each vertex, between them every
	// PLACE_STEP, and the point of the ring nearest where each place lay on the
	// motif solved (on that motif, the place itself).
	const spots = motif.map((ring, m) => {
		const c = centre(ring), radius = meanRadius(ring, c);
		const nearest = wanted[m].map(([degrees, share]) => {
			const a = degrees * Math.PI / 180;
			return nearestOn(ring, [c[0] + share * radius * Math.cos(a), c[1] + share * radius * Math.sin(a)]);
		});
		return ring.flatMap((a, j) => {
			const b = ring[(j + 1) % ring.length], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / PLACE_STEP));
			const ts = [...new Set([...Array.from({ length: steps }, (_, s) => s / steps), ...nearest.filter(x => x.side === j).map(x => x.t)])].sort((u, v) => u - v);
			return ts.map(t => ({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] as Point, side: j, t }));
		});
	});
	const chosen = wanted.map(ring => ring.map(() => -1));
	const pointOf = (m: number, i: number) => spots[m][chosen[m][i]].p;
	// Held places on the motif solved need only cuts that cross nothing: the
	// generator judges them as it judged the solve (its clearance is not this
	// search's; a solve's bent cut may pass nearer the outline).
	let lenient = false;
	// A cut from a point, through its bends, to where it goes.
	const pathOf = (p: Point, cut: Cut): Point[] => {
		const q = 'at' in cut.to ? cut.to.at : pointOf(cut.to.m, cut.to.i), [P, Q] = cut.first ? [p, q] : [q, p], d = [Q[0] - P[0], Q[1] - P[1]];
		const path = [P, ...cut.bends.map(([u, v]): Point => [P[0] + u * d[0] - v * d[1], P[1] + u * d[1] + v * d[0]]), Q];
		return cut.first ? path : path.reverse();
	};
	// A cut's length from a point, Infinity where it crosses the outline or runs on the other side of the motif.
	const reach = (p: Point, m: number, cut: Cut) => {
		const path = pathOf(p, cut), last = path.length - 2;
		let length = 0, extra = 0;
		for (let k = 0; k <= last && Number.isFinite(extra); k++) {
			extra += meeting(path[k], k ? NaN : m, path[k + 1], k < last ? NaN : 'at' in cut.to ? -1 : cut.to.m, sides, gap, !lenient);
			length += Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
		}
		if (!Number.isFinite(extra)) return Infinity;
		const mid = path[Math.floor(path.length / 2) - (path.length % 2 ? 0 : 1)], next = path[Math.floor(path.length / 2)];
		if (colourAt([(mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2], motif) !== Number(cut.inside)) return Infinity;
		return length + extra;
	};
	// How far a point lies from where a place lay on the motif solved, as the ring's centre and size place it.
	const off = motif.map(ring => {
		const c = centre(ring), radius = meanRadius(ring, c);
		return (p: Point, [degrees, share]: [number, number]) => {
			const a = degrees * Math.PI / 180;
			return Math.hypot(p[0] - c[0] - share * radius * Math.cos(a), p[1] - c[1] - share * radius * Math.sin(a));
		};
	});
	// Where the papers take turns round a ring, its thin parts each need a place (see `thinParts`).
	const thin = motif.map((ring, m) => {
		const count = wanted[m].length, paper = papers[m];
		if (count % 2 || paper.some((family, k) => !family || family === '?' || family === paper[(k + 1) % count])) return undefined;
		const along = arcs(ring), at = spots[m].map(({ side, t }) => along.cum[side] + t * (along.cum[side + 1] - along.cum[side]));
		return thinParts(spots[m].map(({ p }) => p), at, along.length, gridClearanceScale(strips));
	});
	// First guesses: each place at the point of its ring nearest where it lay on the motif solved.
	wanted.forEach((places, m) => places.forEach((hint, i) => {
		chosen[m][i] = spots[m].reduce((best, { p }, s) => off[m](p, hint) < off[m](spots[m][best].p, hint) ? s : best, 0);
	}));
	// Where they fall in the recipe's order round each ring (the motif solved,
	// or one like it), they are only made short below; else they are found in
	// order, from the cheapest first place round.
	const inOrder = (picks: number[]) => {
		const start = picks.indexOf(Math.min(...picks));
		return picks.every((_, k) => k === 0 || picks[(start + k) % picks.length] > picks[(start + k - 1) % picks.length]);
	};
	for (const [m, places] of wanted.entries()) {
		if (inOrder(chosen[m])) continue;
		// Each place's cuts, those to the motif to the best point near its
		// partner's first guess (a guess from a direction misses a tip by a
		// hair), and a tenth of how far it strays from its direction, which
		// keeps places with nothing else to tell them apart in the recipe's order.
		const cost = (i: number, s: number) => {
			const p = spots[m][s].p;
			return cuts[m][i].reduce((sum, cut) => {
				if ('at' in cut.to) return sum + reach(p, m, cut);
				const { m: other, i: j } = cut.to, guess = chosen[other][j], count = spots[other].length;
				let least = Infinity;
				for (let d = -GUESS_SPREAD; d <= GUESS_SPREAD; d++) {
					chosen[other][j] = (guess + d + count) % count;
					least = Math.min(least, reach(p, m, cut));
				}
				chosen[other][j] = guess;
				return sum + least;
			}, 0) + off[m](p, places[i]) / 10;
		};
		const picks = cheapestInOrder(places.length, spots[m].length, cost, thin[m]);
		if (!picks) return;
		chosen[m] = picks;
	}
	// The cuts between places on the motif made short, a place at a time, each kept between its neighbours.
	// A place's cuts, Infinity where one comes within the gap of another cut to the motif (one it shares an end with aside).
	const ends = (m: number, i: number) => cuts[m][i].flatMap(cut => { const path = pathOf(pointOf(m, i), cut); return path.slice(1).map((q, k): [Point, Point] => [path[k], q]); });
	const total = (m: number, i: number, s: number) => {
		const held = chosen[m][i];
		chosen[m][i] = s;
		let sum = cuts[m][i].reduce((sum, cut) => sum + reach(spots[m][s].p, m, cut), 0);
		const mine = ends(m, i);
		for (const [mm, places] of wanted.entries()) for (let j = 0; j < places.length && Number.isFinite(sum); j++) {
			if (mm === m && j === i) continue;
			for (const [a, b] of ends(mm, j)) for (const [p, q] of mine) {
				const shared = [a, b].some(x => [p, q].some(y => Math.hypot(x[0] - y[0], x[1] - y[1]) < 1e-9));
				if (shared) continue;
				if ((!lenient && Math.min(fromSide(a, p, q), fromSide(b, p, q), fromSide(p, a, b), fromSide(q, a, b)) < gap) || crosses(p, q, a, b)) sum = Infinity;
			}
		}
		chosen[m][i] = held;
		return sum;
	};
	// A recipe whose places lie in mirror pairs across the heart's middle (a
	// solve tied so), drawn on a motif its own mirror image there, takes its
	// places in mirror pairs: the heart's lobes then share one template. One
	// place of each pair is kept, the other put at its mirror image, and a
	// place paired with itself goes where its ring crosses the middle; the
	// cheapest of three ways to choose which is kept, where every cut is clear
	// and the places keep the recipe's order round each ring, else the places
	// as they were.
	const mirrorPlaces = () => {
		if (!selfMirrored(motif)) return;
		const hint = (m: number, i: number): Point => {
			const c = centre(motif[m]), r = meanRadius(motif[m], c), a = wanted[m][i][0] * Math.PI / 180;
			return [c[0] + wanted[m][i][1] * r * Math.cos(a), c[1] + wanted[m][i][1] * r * Math.sin(a)];
		};
		const radius = motif.map(ring => meanRadius(ring, centre(ring)));
		const partner = wanted.map((places, m) => places.map((_, i) => {
			const q = mirrored(hint(m, i));
			let best: { m: number; i: number; d: number } = { m: -1, i: -1, d: Infinity };
			wanted.forEach((others, mm) => others.forEach((_, j) => {
				const h = hint(mm, j), d = Math.hypot(h[0] - q[0], h[1] - q[1]);
				if (d < best.d) best = { m: mm, i: j, d };
			}));
			return best.d < MIRROR_PAIR * radius[m] ? best : undefined;
		}));
		if (partner.some((places, m) => places.some((p, i) => !p || partner[p.m][p.i]?.m !== m || partner[p.m][p.i]?.i !== i))) return;
		const before = chosen.map(ring => [...ring]);
		// A point on a ring as a place may take it; a place at a corner's mirror
		// image at the corner nearest (the lobes' cuts then turn alike there).
		const spotAt = (m: number, q: Point, corner: boolean) => {
			const ring = motif[m];
			if (corner) {
				const j = ring.reduce((best, v, k) => Math.hypot(v[0] - q[0], v[1] - q[1]) < Math.hypot(ring[best][0] - q[0], ring[best][1] - q[1]) ? k : best, 0);
				if (Math.hypot(ring[j][0] - q[0], ring[j][1] - q[1]) < MIRROR_NEAR) {
					spots[m].push({ p: ring[j], side: j, t: 0 });
					return spots[m].length - 1;
				}
			}
			const { side, t } = nearestOn(ring, q), a = ring[side], b = ring[(side + 1) % ring.length];
			spots[m].push({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], side, t });
			return spots[m].length - 1;
		};
		const atCorner = (m: number, i: number) => spots[m][chosen[m][i]].t === 0;
		// Two places mirror images already, each at a corner or each between.
		const matched = (m: number, i: number, o: { m: number; i: number }) => {
			const p = mirrored(pointOf(m, i)), q = pointOf(o.m, o.i);
			return atCorner(m, i) === atCorner(o.m, o.i) && Math.hypot(p[0] - q[0], p[1] - q[1]) < (atCorner(m, i) ? MIRROR_NEAR : PLACE_SNAP);
		};
		// Where a ring crosses the heart's middle: at a corner there, and between.
		const onMiddle = (m: number) => {
			const ring = motif[m], found: number[] = [];
			ring.forEach((a, j) => {
				const b = ring[(j + 1) % ring.length], u = a[0] - a[1], v = b[0] - b[1];
				// Each crossing once: at a vertex on the middle, on the side from it.
				if (u * v > 0 || u === v || v === 0) return;
				const t = u / (u - v), q: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
				// The corner nearest that is most nearly its own mirror image.
				const corners = ring.map((c, k) => ({ k, d: Math.hypot(c[0] - q[0], c[1] - q[1]), off: Math.abs(c[0] - c[1]) }))
					.filter(({ d }) => d < MIRROR_NEAR).sort((x, y) => x.off - y.off);
				if (corners.length) found.push(spotAt(m, ring[corners[0].k], true));
				found.push(spotAt(m, q, false));
			});
			return found;
		};
		const across = (p: Point) => p[0] - p[1];
		// The places round a ring in the recipe's order: all, or place `i` between its neighbours.
		const inRecipeOrder = (m: number, i?: number) => {
			const along = arcs(motif[m]), at = chosen[m].map(s => along.cum[spots[m][s].side] + spots[m][s].t * (along.cum[spots[m][s].side + 1] - along.cum[spots[m][s].side]));
			if (i !== undefined) {
				const n = at.length, from = at[(i + n - 1) % n], round = (x: number) => ((x - from) % along.length + along.length) % along.length;
				return n < 3 || (round(at[i]) > 0 && round(at[i]) < round(at[(i + 1) % n]));
			}
			const start = at.indexOf(Math.min(...at));
			return at.every((_, k) => k === 0 || at[(start + k) % at.length] > at[(start + k - 1) % at.length]);
		};
		const pairCost = (a: { m: number; i: number }, b: { m: number; i: number }) => total(a.m, a.i, chosen[a.m][a.i]) + total(b.m, b.i, chosen[b.m][b.i]);
		// One side's places kept (`side` 1: those right of the middle, -1: left;
		// 0: of each pair the one that costs the pair less), each partner at its
		// mirror image, then each place paired with itself at the cheapest
		// crossing between its neighbours; its cost, Infinity where a cut is not
		// clear or the places leave the recipe's order round a ring.
		const attempt = (side: number) => {
			before.forEach((ring, m) => { chosen[m] = [...ring]; });
			for (const [m, places] of wanted.entries()) for (let i = 0; i < places.length; i++) {
				const o = partner[m][i]!, me = { m, i };
				if ((o.m === m && o.i === i) || o.m < m || (o.m === m && o.i < i) || matched(m, i, o)) continue;
				const mirror = (keep: { m: number; i: number }, move: { m: number; i: number }) => {
					chosen[move.m][move.i] = spotAt(move.m, mirrored(pointOf(keep.m, keep.i)), atCorner(keep.m, keep.i));
				};
				if (side) {
					const [keep, move] = side * across(pointOf(m, i)) >= side * across(pointOf(o.m, o.i)) ? [me, o] : [o, me];
					mirror(keep, move);
					continue;
				}
				const [s, so] = [chosen[m][i], chosen[o.m][o.i]];
				mirror(me, o);
				const kept = pairCost(me, o), mine = chosen[o.m][o.i];
				chosen[o.m][o.i] = so;
				mirror(o, me);
				if (!(pairCost(me, o) < kept)) { chosen[m][i] = s; chosen[o.m][o.i] = mine; }
			}
			let middle = true;
			for (const [m, places] of wanted.entries()) for (let i = 0; i < places.length; i++) {
				const o = partner[m][i]!;
				if (o.m !== m || o.i !== i || matched(m, i, o)) continue;
				let best = chosen[m][i], least = Infinity;
				for (const s of onMiddle(m)) {
					chosen[m][i] = s;
					const c = inRecipeOrder(m, i) ? total(m, i, s) : Infinity;
					if (c < least) { least = c; best = s; }
				}
				chosen[m][i] = best;
				middle &&= Number.isFinite(least);
			}
			const ordered = middle && chosen.every((_, m) => inRecipeOrder(m));
			const cost = ordered ? wanted.reduce((sum, places, m) => sum + places.reduce((sum, _, i) => sum + total(m, i, chosen[m][i]), 0), 0) : Infinity;
			return { cost, chosen: chosen.map(ring => [...ring]) };
		};
		const best = [attempt(0), attempt(1), attempt(-1)].reduce((a, b) => b.cost < a.cost ? b : a);
		(Number.isFinite(best.cost) ? best.chosen : before).forEach((ring, m) => { chosen[m] = ring; });
	};
	// A held recipe on its own motif (its places, guessed where they lay, in
	// order and cutting as the solve did) is the solve.
	lenient = held;
	lenient &&= wanted.every((places, m) => inOrder(chosen[m]) && places.every((_, i) => Number.isFinite(total(m, i, chosen[m][i]))));
	for (let round = 0; round < 3 && !lenient; round++) for (const [m, places] of wanted.entries()) for (let i = 0; i < places.length; i++) {
		if (cuts[m][i].every(cut => 'at' in cut.to) && round) continue;
		// A held recipe's place stays where it lay on the motif solved, wherever its cuts are clear from there.
		if (held && Number.isFinite(total(m, i, chosen[m][i]))) continue;
		const count = spots[m].length, prev = chosen[m][(i + places.length - 1) % places.length], next = chosen[m][(i + 1) % places.length];
		let best = chosen[m][i], least = total(m, i, best);
		// A place in a thin part stays in its core; one outside stays outside them.
		const part = thin[m]?.part[best] ?? -1;
		for (let s = (prev + 1) % count; s !== next || places.length === 1; s = (s + 1) % count) {
			if (thin[m] && (thin[m]!.part[s] !== part || (part >= 0 && !thin[m]!.core[s]))) { if (places.length === 1 && s === prev) break; continue; }
			const c = total(m, i, s);
			if (c < least) { least = c; best = s; }
			if (places.length === 1 && s === prev) break;
		}
		chosen[m][i] = best;
	}
	if (!lenient) mirrorPlaces();
	if (wanted.some((places, m) => places.some((_, i) => !Number.isFinite(total(m, i, chosen[m][i]))))) return;
	// Each ring with a vertex at each of its places.
	const rings: Ring[] = [], at: number[][] = [];
	for (const [m, ring] of motif.entries()) {
		const out: Point[] = [], index = chosen[m].map(() => -1);
		ring.forEach((p, j) => {
			const here = chosen[m].map((s, i) => ({ spot: spots[m][s], i })).filter(({ spot }) => spot.side === j).sort((a, b) => a.spot.t - b.spot.t);
			if (!here.length || here[0].spot.t > 0) out.push(p);
			for (const { spot, i } of here) { out.push(spot.p); index[i] = out.length - 1; }
		});
		rings.push(out);
		at.push(index);
	}
	return { rings, places: at };
}

/** The stretch of a ring from vertex `a` to vertex `b`, in its order (`forward`) or against it. */
function ringStretch(ring: Ring, a: number, b: number, forward: boolean): Point[] {
	const out: Point[] = [ring[a]], n = ring.length;
	for (let k = a; k !== b;) {
		k = (k + (forward ? 1 : n - 1)) % n;
		out.push(ring[k]);
	}
	return out;
}

/** A hidden cut's bends: one made short (not `held`) draws its cuts to the
 * motif straight, the solve's bends being for its own motif. */
const bendsOf = (recipe: TopologyRecipe, piece: { h: [TopologyAnchor, TopologyAnchor]; bends: [number, number][] }) =>
	!recipe.held && piece.h.some(an => 'm' in an) ? [] : piece.bends;

/** A cut from `P` to `Q` through bends given along and across it, as shares of its length. */
const bent = (P: Point, Q: Point, bends: [number, number][]): Point[] => {
	const d = [Q[0] - P[0], Q[1] - P[1]];
	return [P, ...bends.map(([u, v]): Point => [P[0] + u * d[0] - v * d[1], P[1] + u * d[1] + v * d[0]]), Q];
};

/** A topology recipe drawn on a picture whose motif's rings begin at `motif`:
 * its edges (each board stretch its paper's, each hidden cut both papers'),
 * compiled into slits, and the picture's rings with the motif's places on
 * them; none where the picture is another topology (another board outline,
 * or a motif nesting otherwise or crossing the board), or a cut finds no way
 * to the motif. */
export function topologyConstruction(recipe: TopologyRecipe, picture: { rings: Ring[]; motif?: number }, o?: BoardOutline) {
	if (picture.motif === undefined) return;
	const board = picture.rings.slice(0, picture.motif), figure = picture.rings.slice(picture.motif);
	if (recipe.places.length !== figure.length || nestingOf(figure) !== recipe.motif) return;
	o ??= boardOutline(board);
	if (o.sig !== recipe.outline || !islandOn(board, figure)) return;
	const boardPoint = (an: { e: number; t: number } | { p: Point }) => 'p' in an ? an.p : alongEdge(o!.edges[an.e], an.t);
	// The board's sides and hidden cuts, which the cuts to the motif keep clear of.
	const sides: Side[] = o.pieces.map(([a, b]) => ({ a, b, of: -1 }));
	const chords = new Map<string, { h: [TopologyAnchor, TopologyAnchor]; bends: [number, number][]; inside?: boolean }>();
	const id = (an: TopologyAnchor) => 'e' in an ? `e${an.e}:${an.t}` : 'p' in an ? `p${an.p.join(',')}` : `m${an.m}:${an.i}`;
	for (const slit of [...recipe.A, ...recipe.B]) for (const piece of slit) if ('h' in piece) chords.set(piece.h.map(id).sort().join('|'), piece);
	for (const chord of chords.values()) if (chord.h.every(an => !('m' in an))) {
		const path = bent(boardPoint(chord.h[0] as { e: number; t: number }), boardPoint(chord.h[1] as { e: number; t: number }), chord.bends);
		for (let k = 1; k < path.length; k++) sides.push({ a: path[k - 1], b: path[k], of: -1 });
	}
	// Each place's cuts, and which paper cuts each stretch of each ring between places.
	const cuts = recipe.places.map(ring => ring.map(() => [] as Cut[]));
	const end = (an: TopologyAnchor): Cut['to'] => 'm' in an ? { m: an.m, i: an.i } : { at: boardPoint(an) };
	for (const chord of chords.values()) {
		const [a, b] = chord.h, inside = !!chord.inside, bends = bendsOf(recipe, chord);
		if ('m' in a) cuts[a.m][a.i].push({ to: end(b), inside, bends, first: true });
		if ('m' in b) cuts[b.m][b.i].push({ to: end(a), inside, bends, first: false });
	}
	const papers = recipe.places.map(ring => ring.map(() => undefined as string | undefined));
	for (const family of ['A', 'B'] as const) for (const slit of recipe[family]) for (const piece of slit) {
		if (!('m' in piece)) continue;
		const count = recipe.places[piece.m].length, [i0, i1] = piece.i, paper = papers[piece.m];
		for (let k = piece.f ? i0 : i1; k !== (piece.f ? i1 : i0); k = (k + 1) % count) paper[k] = paper[k] && paper[k] !== family ? '?' : family;
	}
	const strips = recipe.A.length + 1;
	const placed = placeMotif(motifRings(figure, recipe.rings).map(({ ring }) => ring), recipe.places, cuts, papers, sides, strips, !!recipe.held);
	if (!placed) return;
	// A held recipe's place where the solve had it, a hair off the outline; else on it.
	const exact = (m: number, i: number) => {
		const p = recipe.held ? recipe.exact?.[m]?.[i] : undefined, q = p && placed.rings[m][placed.places[m][i]];
		return p && q && Math.hypot(p[0] - q[0], p[1] - q[1]) < EXACT_NEAR ? p : undefined;
	};
	const motifPoint = (an: { m: number; i: number }) => exact(an.m, an.i) ?? placed.rings[an.m][placed.places[an.m][an.i]];
	const point = (an: TopologyAnchor) => 'm' in an ? motifPoint(an) : boardPoint(an);
	const edges: Edge[] = [], key = (p: Point) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
	const line = (pts: Point[], family: Edge['family'], kind: Edge['kind']) => {
		for (let i = 1; i < pts.length; i++) if (key(pts[i - 1]) !== key(pts[i])) edges.push({ from: pts[i - 1], to: pts[i], family, kind });
	};
	for (const family of ['A', 'B'] as const) for (const slit of recipe[family]) for (const piece of slit) {
		if ('e' in piece) line(edgeStretch(o.edges[piece.e], piece.t[0], piece.t[1]), family, 'outline');
		else if ('m' in piece) {
			const [from, to] = piece.i.map(i => exact(piece.m, i));
			line([...from ? [from] : [], ...ringStretch(placed.rings[piece.m], placed.places[piece.m][piece.i[0]], placed.places[piece.m][piece.i[1]], piece.f), ...to ? [to] : []], family, 'outline');
		}
	}
	for (const chord of chords.values()) line(bent(point(chord.h[0]), point(chord.h[1]), bendsOf(recipe, chord)), 'AB', 'shared');
	const artwork = [...board, ...placed.rings];
	return { geometry: compile(edges), edges, artwork, strips };
}

/** How far, as a share of its ring's mean radius, the recipe's place lying
 * farthest from a motif's outline lies from it (see `placeMotif`): nearly
 * none on the motif the recipe was solved on (at any size), Infinity on a
 * picture of another topology. */
export function motifFit(recipe: TopologyRecipe, picture: { rings: Ring[]; motif?: number }): number {
	if (picture.motif === undefined) return Infinity;
	const figure = picture.rings.slice(picture.motif);
	if (figure.length !== recipe.places.length || nestingOf(figure) !== recipe.motif) return Infinity;
	let worst = 0;
	motifRings(figure, recipe.rings).forEach(({ ring }, m) => {
		const c = centre(ring), radius = meanRadius(ring, c);
		for (const [degrees, share] of recipe.places[m]) {
			const a = degrees * Math.PI / 180, h: Point = [c[0] + share * radius * Math.cos(a), c[1] + share * radius * Math.sin(a)];
			worst = Math.max(worst, Math.min(...ring.map((p, j) => fromSide(h, p, ring[(j + 1) % ring.length]))) / radius);
		}
	});
	return worst;
}

/** A motif's recipe as its topology's: its places on the board on the board's
 * outline (see `boardOutline`), on the motif by their order round each ring,
 * with where they and its rings lay; its hidden cuts `inside` where they ran
 * through the motif. None where the motif is not an island on the board, or a
 * place of it is on neither. */
export function topologyOf(recipe: MotifRecipe, picture: { rings: Ring[]; motif?: number }): TopologyRecipe | undefined {
	const n = picture.motif;
	if (n === undefined) return;
	const o = recipeOutline(picture.rings), board = picture.rings.slice(0, n), figure = picture.rings.slice(n);
	if (!fitsOutline(recipe, o) || !islandOn(board, figure)) return;
	const outline = boardOutline(board), rings = motifRings(figure), which = new Map(rings.map(({ from }, m) => [n + from, m]));
	const own = { rings: rings.map(({ ring }) => ring), corners: [] as number[][], arcs: rings.map(({ ring }) => arcs(ring)) };
	const vertices = o.rings.flat(), pieces = [...recipe.A, ...recipe.B].flat();
	// Each place on the motif, by how far round its ring (in the recipe's order and direction) it lies.
	const nearestOn = (m: number, p: Point) => {
		const ring = own.rings[m], { cum, length } = own.arcs[m];
		let best = { d: Infinity, s: 0 };
		ring.forEach((a, i) => {
			const b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
			const u = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0, d = Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]);
			if (d < best.d) best = { d, s: cum[i] + u * (cum[i + 1] - cum[i]) };
		});
		return { s: best.s > length - 1e-7 ? 0 : best.s, d: best.d };
	};
	// Which motif ring a place is on, by where it is (a place the search merged with a board corner
	// is named by that corner, but lies on the motif): the ring of a stretch along the motif it ends,
	// for every piece naming it, else the ring it lies within 0.02 of, if any.
	const name = (an: RecipeAnchor) => `${an.r}:${an.k}:${an.u}:${an.x ?? ''}`, ends = new Map<string, number>();
	for (const piece of pieces) if ('v' in piece && piece.v >= n) for (const an of [piece.a, piece.b]) ends.set(name(an), piece.v);
	const ringOf = (an: RecipeAnchor, stretch?: number): number | undefined => {
		if (stretch !== undefined) return stretch >= n ? which.get(stretch) : undefined;
		if (ends.has(name(an))) return which.get(ends.get(name(an))!);
		const p = anchorPoint(o, an, vertices);
		const near = own.rings.map((_, m) => nearestOn(m, p).d), m = near.indexOf(Math.min(...near));
		return near[m] < .02 ? m : undefined;
	};
	const onMotif = (an: RecipeAnchor, stretch?: number) => ringOf(an, stretch) !== undefined;
	const found = rings.map(() => [] as number[]), position = (an: RecipeAnchor, stretch?: number) => {
		const m = ringOf(an, stretch)!;
		return { m, s: nearestOn(m, anchorPoint(o, an, vertices)).s };
	};
	const offset = rings.map(() => new Map<number, Point>());
	for (const piece of pieces) for (const an of 'v' in piece ? [piece.a, piece.b] : piece.h) {
		const stretch = 'v' in piece ? piece.v : undefined;
		if (!onMotif(an, stretch)) continue;
		const { m, s } = position(an, stretch), p = anchorPoint(o, an, vertices);
		if (!found[m].some(t => Math.abs(t - s) < 1e-6)) found[m].push(s);
		if (pointOn(own.rings[m], own.arcs[m].cum, s).some((c, k) => Math.abs(c - p[k]) > 1e-6)) offset[m].set(s, p);
	}
	found.forEach(list => list.sort((a, b) => a - b));
	const motifPlace = (an: RecipeAnchor, stretch?: number) => {
		const { m, s } = position(an, stretch);
		return { m, i: found[m].findIndex(t => Math.abs(t - s) < 1e-6) };
	};
	const boardPlace = (p: Point) => onOutline(outline, p);
	let lost = false;
	const anchor = (an: RecipeAnchor): TopologyAnchor => {
		if (onMotif(an)) return motifPlace(an);
		const at = boardPlace(anchorPoint(o, an, vertices));
		// A hidden cut bending where the board's lines cross inside the circle, on no outline: that point.
		return at ?? { p: anchorPoint(o, an, vertices) };
	};
	// A board stretch as the pieces of the outline's edges it runs along.
	const along = (piece: MotifRecipe['A'][number][number]): TopologyPiece[] => {
		const edges = recipeEdges({ ...recipe, A: [[piece]], B: [] }, o), out: { e: number; from: Point; to: Point }[] = [];
		for (const { from, to } of edges) {
			const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], at = boardPlace(mid);
			if (!at) { lost = true; return []; }
			const last = out.at(-1);
			if (last && last.e === at.e) last.to = to; else out.push({ e: at.e, from, to });
		}
		return out.map(({ e, from, to }) => {
			const t = (p: Point) => {
				const edge = outline.edges[e], L = edge.cum[edge.cum.length - 1];
				let best = { d: Infinity, s: 0 };
				for (let i = 0; i + 1 < edge.points.length; i++) {
					const a = edge.points[i], b = edge.points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
					const u = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0, d = Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]);
					if (d < best.d) best = { d, s: edge.cum[i] + u * Math.sqrt(l) };
				}
				const share = L ? best.s / L : 0;
				return share < 1e-9 ? 0 : share > 1 - 1e-9 ? 1 : share;
			};
			return { e, t: [t(from), t(to)] as [number, number] };
		});
	};
	const convert = (piece: MotifRecipe['A'][number][number]): TopologyPiece[] => {
		if ('v' in piece) {
			if (piece.v < n) return along(piece);
			const m = which.get(piece.v)!;
			return [{ m, i: [motifPlace(piece.a, piece.v).i, motifPlace(piece.b, piece.v).i], f: piece.f !== rings[m].turned }];
		}
		const P = anchorPoint(o, piece.h[0], vertices), Q = anchorPoint(o, piece.h[1], vertices), path = bent(P, Q, piece.bends);
		// Whether it ran through the motif: the colour half way along it.
		const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
		let half = lengths.reduce((a, b) => a + b, 0) / 2, i = 0;
		while (i < lengths.length - 1 && half > lengths[i]) half -= lengths[i++];
		const u = lengths[i] ? half / lengths[i] : 0, mid: Point = [path[i][0] + u * (path[i + 1][0] - path[i][0]), path[i][1] + u * (path[i + 1][1] - path[i][1])];
		const inside = piece.h.some(an => onMotif(an)) && colourAt(mid, figure) === 1;
		return [{ h: [anchor(piece.h[0]), anchor(piece.h[1])], bends: piece.bends, ...inside ? { inside: true } : {} }];
	};
	const A = recipe.A.map(slit => slit.flatMap(convert)), B = recipe.B.map(slit => slit.flatMap(convert));
	if (lost) return;
	const places = found.map((list, m) => list.map((s): [number, number] => {
		const p = pointOn(own.rings[m], own.arcs[m].cum, s), c = centre(own.rings[m]);
		return [Math.round(((Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / Math.PI + 360) % 360) * 1e6) / 1e6,
			Math.round(Math.hypot(p[0] - c[0], p[1] - c[1]) / meanRadius(own.rings[m], c) * 1e8) / 1e8];
	}));
	const frame = motifFrame(figure);
	const exact = found.map((list, m) => list.map(s => offset[m].get(s) ?? null));
	return {
		style: recipe.style, ...recipe.strips !== undefined ? { strips: recipe.strips } : {}, steps: recipe.steps,
		outline: outline.sig, motif: nestingOf(figure), places, ...exact.some(list => list.some(Boolean)) ? { exact } : {},
		...rings.length > 1 ? { rings: rings.map(({ ring }) => whereIn(centre(ring), frame)) } : {},
		A, B
	};
}

/** The point at arc `s` round a ring (its arcs `cum`). */
function pointOn(ring: Ring, cum: number[], s: number): Point {
	let i = 0;
	while (i < ring.length - 1 && cum[i + 1] <= s) i++;
	const a = ring[i], b = ring[(i + 1) % ring.length], u = cum[i + 1] > cum[i] ? (s - cum[i]) / (cum[i + 1] - cum[i]) : 0;
	return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
}
