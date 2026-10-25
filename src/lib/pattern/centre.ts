/**
 * Where the pattern sits best in the heart, for the Escher tab's "Centrér": the
 * move of the whole pattern within one repeat of the tiling (`PatternTile.pan`)
 * that leaves the most of the heart's square to whole tiles, figures the
 * square's edges do not cut; of moves that leave as much, the one whose whole
 * tiles keep furthest from the edges, so the pattern sits in the middle, and of
 * those the least move. The rest of the square shows tiles cut by its edges, as
 * unfinished figures.
 *
 * A move translates every tile in the square alike (`cellsToRaw` is affine in
 * the pan), so each tile's box and area are found once, and a move is a matter
 * of which boxes fit.
 */
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ruleRepeat } from './rules';
import { cellOutline, cellsToRaw, fitLines, heartLines, rawToCells, tileShape, type PatternTile } from './tiling';

/** Moves tried each way across one repeat of the tiling. */
const STEPS = 48;
/** Points each cubic of a tile's outline is looked at. */
const SAMPLES = 8;
/** How far past the square's edge (of 100) a whole tile's outline may lie: one on the edge is whole. */
const ON_EDGE = 1e-6;
/** The best moves found among the boxes, looked at again with the lines the heart then cuts. */
const SHORTLIST = 16;

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

/** The tiles that can come into the square as the pattern moves up to a repeat either way. */
function tilesNear(tile: PatternTile): Tile[] {
	const repeat = ruleRepeat(tile.rule);
	const corners = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 0, y: 100 },
		{ x: 100, y: 100 }
	].map((q) => rawToCells(tile, q));
	const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
	const tiles: Tile[] = [];
	for (let c = Math.floor(Math.min(...xs) - repeat.x) - 2; c <= Math.ceil(Math.max(...xs) + repeat.x) + 1; c++)
		for (let d = Math.floor(Math.min(...ys) - repeat.y) - 2; d <= Math.ceil(Math.max(...ys) + repeat.y) + 1; d++) {
			const points = cellOutline(tile, c, d).flatMap((s) => Array.from({ length: SAMPLES }, (_, k) => cellsToRaw(tile, at(s, k / SAMPLES))));
			let area = 0;
			for (let i = 0; i < points.length; i++) {
				const p = points[i]!, q = points[(i + 1) % points.length]!;
				area += p.x * q.y - q.x * p.y;
			}
			const px = points.map((p) => p.x), py = points.map((p) => p.y);
			tiles.push({ c, d, box: [Math.min(...px), Math.min(...py), Math.max(...px), Math.max(...py)], area: Math.abs(area) / 2 });
		}
	return tiles;
}

/** How a move leaves the square: the area its whole tiles fill, how near the nearest comes to an edge, and how far it moves them. */
interface Placement {
	pan: Vec;
	whole: number;
	margin: number;
	moved: number;
}

/** The whole tiles' area and margin with every tile moved by `shift` in the square, those `counts` lets count. */
function placement(tiles: Tile[], pan: Vec, shift: Vec, counts: (t: Tile) => boolean = () => true): Placement {
	let whole = 0, margin = Infinity;
	for (const t of tiles) {
		const [x0, y0, x1, y1] = t.box;
		const room = Math.min(x0 + shift.x, y0 + shift.y, 100 - x1 - shift.x, 100 - y1 - shift.y);
		if (room < -ON_EDGE || !counts(t)) continue;
		whole += t.area;
		margin = Math.min(margin, room);
	}
	return { pan, whole, margin, moved: Math.hypot(shift.x, shift.y) };
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
const better = (a: Placement, b: Placement) =>
	same(a.whole, b.whole) ? (same(a.margin, b.margin) ? a.moved < b.moved - 1e-9 : a.margin > b.margin) : a.whole > b.whole;

/**
 * The moves of the whole pattern (`PatternTile.pan`, within one repeat) that
 * leave the most of the square to whole tiles, the best first (see the
 * module's comment), one for each area: a tile counts as whole where it lies
 * inside the square and the heart
 * cuts every side of it (a side too near the edge to cut leaves it joined to
 * the tile beside it).
 */
export function centredPans(tile: PatternTile): Vec[] {
	const tiles = tilesNear(tile), repeat = ruleRepeat(tile.rule), from = tile.pan ?? { x: 0, y: 0 };
	const h = 100 / (tile.cuts + 1), { x: a, y: b } = tileShape(tile);
	// The tiles move in the square as the pattern does in cells, through the cells' shape.
	const shiftOf = (pan: Vec): Vec => {
		const d = { x: pan.x - from.x, y: pan.y - from.y };
		return { x: h * (a.x * d.x + b.x * d.y), y: h * (a.y * d.x + b.y * d.y) };
	};
	const best = new Map<string, Placement>();
	for (let i = 0; i < STEPS; i++)
		for (let j = 0; j < STEPS; j++) {
			const pan = { x: ((i + 0.5) / STEPS - 0.5) * repeat.x, y: ((j + 0.5) / STEPS - 0.5) * repeat.y };
			const found = placement(tiles, pan, shiftOf(pan)), key = found.whole.toFixed(4);
			const kept = best.get(key);
			if (!kept || better(found, kept)) best.set(key, found);
		}
	// Looked at again with the lines the heart cuts there.
	const shortlist = [...best.values()].sort((p, q) => (better(p, q) ? -1 : better(q, p) ? 1 : 0)).slice(0, SHORTLIST);
	return shortlist
		.map(({ pan }) => {
			const fitted = fitLines({ ...tile, pan }), cut = (kind: 'V' | 'H', line: number) => {
				const { first, count } = heartLines(fitted, kind);
				return line >= first && line < first + count;
			};
			return placement(tiles, pan, shiftOf(pan), (t) => cut('V', t.c) && cut('V', t.c + 1) && cut('H', t.d) && cut('H', t.d + 1));
		})
		.sort((p, q) => (better(p, q) ? -1 : better(q, p) ? 1 : 0))
		.map(({ pan }) => pan);
}

/** The area of the heart's square (of 100 × 100) its whole tiles fill (see `centredPans`). */
export function wholeTileArea(tile: PatternTile): number {
	const fitted = fitLines(tile), cut = (kind: 'V' | 'H', line: number) => {
		const { first, count } = heartLines(fitted, kind);
		return line >= first && line < first + count;
	};
	return placement(tilesNear(fitted), fitted.pan ?? { x: 0, y: 0 }, { x: 0, y: 0 }, (t) => cut('V', t.c) && cut('V', t.c + 1) && cut('H', t.d) && cut('H', t.d + 1)).whole;
}
