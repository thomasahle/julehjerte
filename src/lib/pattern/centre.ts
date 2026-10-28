/**
 * Where the pattern sits best in the heart, for the Escher tab's "Centrér": the
 * turn of the whole pattern (as the turn control turns it) and its move within
 * one repeat of the tiling (`PatternTile.pan`) that leave the most of the
 * heart's square to whole tiles, figures the square's edges do not cut; of
 * those that leave as much, the least turn, then the one whose whole tiles keep
 * furthest from the edges, so the pattern sits in the middle, then the least
 * move. The rest of the square shows tiles cut by its edges, as
 * unfinished figures.
 *
 * A move translates every tile in the square alike (`cellsToRaw` is affine in
 * the pan), and a turn maps the same cells into it otherwise, so each tile's
 * outline is found once, and a turn and move are a matter of which boxes fit.
 */
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ruleRepeat } from './rules';
import { cellOutline, cellsToRaw, fitLines, heartLines, rawToCells, tileShape, tileTurn, type PatternTile } from './tiling';

/** Moves tried each way across one repeat of the tiling. */
const STEPS = 48;
/** Points each cubic of a tile's outline is looked at. */
const SAMPLES = 8;
/** How far past the square's edge (of 100) a whole tile's outline may lie: one on the edge is whole. */
const ON_EDGE = 1e-6;
/** The best moves of each turn found among the boxes, looked at again with the lines the heart then cuts:
 * the boxes alone think a turned pattern better than it is, its lines near the edges uncut. */
const SHORTLIST = 4;

/** A tile of the tiling near the square: cell (c, d), its box and area in the square (of 100 × 100) as the pattern is. */
interface Tile {
	c: number;
	d: number;
	box: [number, number, number, number];
	area: number;
}

const at = (s: BezierSegment, t: number): Vec => {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
};

/** A cell's outline on the tiling, in cells: the hull of its points looked at, and its area. */
interface Outline {
	hull: Vec[];
	area: number;
}

/** Cell (c, d)'s outline (see `Outline`): its box anywhere in the square is its hull's, as the square is the cells mapped straight. */
function outlineOf(tile: PatternTile, c: number, d: number): Outline {
	const points = cellOutline(tile, c, d).flatMap((s) => Array.from({ length: SAMPLES }, (_, k) => at(s, k / SAMPLES)));
	let area = 0;
	for (let i = 0; i < points.length; i++) {
		const p = points[i]!, q = points[(i + 1) % points.length]!;
		area += p.x * q.y - q.x * p.y;
	}
	// The convex hull (Andrew's monotone chain).
	const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y), cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const chain = (list: Vec[]) => {
		const out: Vec[] = [];
		for (const p of list) {
			while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
			out.push(p);
		}
		return out.slice(0, -1);
	};
	return { hull: [...chain(sorted), ...chain([...sorted].reverse())], area: Math.abs(area) / 2 };
}

/**
 * The tiles that can come into the square as the pattern moves up to a repeat
 * either way. A turn or a move only maps the cells into the square otherwise,
 * so `outlines` keeps each cell's outline for every turn of the same tile.
 */
function tilesNear(tile: PatternTile, outlines = new Map<string, Outline>()): Tile[] {
	const repeat = ruleRepeat(tile.rule);
	const corners = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 0, y: 100 },
		{ x: 100, y: 100 }
	].map((q) => rawToCells(tile, q));
	const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
	// The cells in the square, straight: a point p is o + p.x ex + p.y ey.
	const o = cellsToRaw(tile, { x: 0, y: 0 }), ex = cellsToRaw(tile, { x: 1, y: 0 }), ey = cellsToRaw(tile, { x: 0, y: 1 });
	const [ax, ay, bx, by] = [ex.x - o.x, ex.y - o.y, ey.x - o.x, ey.y - o.y], scale = Math.abs(ax * by - ay * bx);
	const tiles: Tile[] = [];
	for (let c = Math.floor(Math.min(...xs) - repeat.x) - 2; c <= Math.ceil(Math.max(...xs) + repeat.x) + 1; c++)
		for (let d = Math.floor(Math.min(...ys) - repeat.y) - 2; d <= Math.ceil(Math.max(...ys) + repeat.y) + 1; d++) {
			const key = `${c},${d}`;
			let outline = outlines.get(key);
			if (!outline) outlines.set(key, outline = outlineOf(tile, c, d));
			let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
			for (const p of outline.hull) {
				const x = o.x + p.x * ax + p.y * bx, y = o.y + p.x * ay + p.y * by;
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
			tiles.push({ c, d, box: [x0, y0, x1, y1], area: outline.area * scale });
		}
	return tiles;
}

/** How a turn and move leave the square: the area its whole tiles fill, how near the nearest comes to an edge, and how far it turns and moves them. */
interface Placement {
	tile: PatternTile;
	pan: Vec;
	whole: number;
	margin: number;
	turned: number;
	moved: number;
}

/** The whole tiles' area and margin with every tile of `tile` moved by `shift` in the square, those `counts` lets count. */
function placement(tiles: Tile[], tile: PatternTile, pan: Vec, shift: Vec, turned: number, counts: (t: Tile) => boolean = () => true): Placement {
	let whole = 0, margin = Infinity;
	for (const t of tiles) {
		const [x0, y0, x1, y1] = t.box;
		const room = Math.min(x0 + shift.x, y0 + shift.y, 100 - x1 - shift.x, 100 - y1 - shift.y);
		if (room < -ON_EDGE || !counts(t)) continue;
		whole += t.area;
		margin = Math.min(margin, room);
	}
	return { tile, pan, whole, margin, turned, moved: Math.hypot(shift.x, shift.y) };
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
const better = (a: Placement, b: Placement) =>
	!same(a.whole, b.whole) ? a.whole > b.whole
		: !same(a.turned, b.turned) ? a.turned < b.turned
			: !same(a.margin, b.margin) ? a.margin > b.margin
				: a.moved < b.moved - 1e-9;
const order = (p: Placement, q: Placement) => (better(p, q) ? -1 : better(q, p) ? 1 : 0);

/** Whether the heart `fitted` cuts every side of tile `t` (one too near the edge to cut leaves it joined to the tile beside it). */
function allCut(fitted: PatternTile, t: Tile): boolean {
	const cut = (kind: 'V' | 'H', line: number) => {
		const { first, count } = heartLines(fitted, kind);
		return line >= first && line < first + count;
	};
	return cut('V', t.c) && cut('V', t.c + 1) && cut('H', t.d) && cut('H', t.d + 1);
}

/**
 * The turns and moves of the whole pattern that leave the most of the square
 * to whole tiles, the best first (see the module's comment): of `turned`, the
 * pattern turned to each angle tried (`tile` among them, as it is), each moved
 * within one repeat. A tile counts as whole where it lies inside the square
 * and the heart cuts every side of it; the boxes alone choose the few looked
 * at so.
 */
export function centredPlacements(tile: PatternTile, turned: PatternTile[]): { tile: PatternTile; pan: Vec }[] {
	const placements: Placement[] = [], outlines = new Map<string, Outline>();
	const sameCells = (variant: PatternTile) => variant.curves === tile.curves && variant.corners === tile.corners;
	for (const variant of turned) {
		const tiles = tilesNear(variant, sameCells(variant) ? outlines : undefined), repeat = ruleRepeat(variant.rule), from = variant.pan ?? { x: 0, y: 0 };
		const h = 100 / (variant.cuts + 1), { x: a, y: b } = tileShape(variant), turn = Math.abs(tileTurn(variant) - tileTurn(tile));
		// The tiles move in the square as the pattern does in cells, through the cells' shape.
		const shiftOf = (pan: Vec): Vec => {
			const d = { x: pan.x - from.x, y: pan.y - from.y };
			return { x: h * (a.x * d.x + b.x * d.y), y: h * (a.y * d.x + b.y * d.y) };
		};
		const pans: Vec[] = [];
		for (let i = 0; i < STEPS; i++)
			for (let j = 0; j < STEPS; j++) pans.push({ x: ((i + 0.5) / STEPS - 0.5) * repeat.x, y: ((j + 0.5) / STEPS - 0.5) * repeat.y });
		// Only the tiles some move brings inside the square count for any.
		const shifts = pans.map(shiftOf), sx = shifts.map((q) => q.x), sy = shifts.map((q) => q.y);
		const [lx, hx, ly, hy] = [Math.min(...sx), Math.max(...sx), Math.min(...sy), Math.max(...sy)];
		const inside = tiles.filter(({ box: [x0, y0, x1, y1] }) => x0 + hx >= -ON_EDGE && x1 + lx <= 100 + ON_EDGE && y0 + hy >= -ON_EDGE && y1 + ly <= 100 + ON_EDGE);
		const best = new Map<string, Placement>();
		for (const [k, pan] of pans.entries()) {
			const found = placement(inside, variant, pan, shifts[k]!, turn), key = found.whole.toFixed(4);
			const kept = best.get(key);
			if (!kept || better(found, kept)) best.set(key, found);
		}
		// Looked at again with the lines the heart cuts there.
		for (const { pan } of [...best.values()].sort(order).slice(0, SHORTLIST)) {
			const fitted = fitLines({ ...variant, pan });
			placements.push(placement(tiles, variant, pan, shiftOf(pan), turn, (t) => allCut(fitted, t)));
		}
	}
	return placements.sort(order).map(({ tile: variant, pan }) => ({ tile: variant, pan }));
}

/** The area of the heart's square (of 100 × 100) its whole tiles fill (see `centredPlacements`). */
export function wholeTileArea(tile: PatternTile): number {
	const fitted = fitLines(tile);
	return placement(tilesNear(fitted), fitted, fitted.pan ?? { x: 0, y: 0 }, { x: 0, y: 0 }, 0, (t) => allCut(fitted, t)).whole;
}
