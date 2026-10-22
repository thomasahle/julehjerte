import { describe, expect, it } from 'vitest';
import { isFigure, randomTileDraw, randomTileKind, tileFigure } from './randomTile';
import { randomTile, tileFingers, tileGrid } from './escherTab';
import { freeSides, halfOf, ruleInfo } from './rules';
import { EXAMPLES, exampleTile } from './examples';
import { straightCurve, type PatternTile } from './tiling';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { edgeGap, halvesCrossCleanly, longestCloseRun, weavesWell } from '$lib/editor/slivers';
import type { Finger } from '$lib/types/heart';

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('randomTileDraw', () => {
	it('draws every side the type draws, whole sides from (0, 0) to (1, 0), halves to the middle as the type completes them', () => {
		for (let i = 1; i <= 120; i++) {
			const rng = seeded(i);
			const tile = randomTileDraw(rng, randomTileKind(rng));
			const info = ruleInfo(tile.rule);
			expect(Object.keys(tile.curves).sort()).toEqual([...info.curves].sort());
			for (const key of info.curves) {
				const curve = tile.curves[key]!;
				const start = curve[0]!.p0;
				const end = curve[curve.length - 1]!.p3;
				expect(close(start.x, 0) && close(start.y, 0)).toBe(true);
				for (let k = 1; k < curve.length; k++) expect(curve[k]!.p0).toEqual(curve[k - 1]!.p3);
				const half = halfOf(tile.rule, key);
				if (half === 'turn') expect(close(end.x, 0.5) && close(end.y, 0)).toBe(true);
				else if (half === 'mirror') {
					// Level at the middle, so the mirror image continues it into one arch.
					const last = curve[curve.length - 1]!;
					expect(close(end.x, 0.5) && close(last.p2.y, end.y)).toBe(true);
				} else expect(close(end.x, 1) && close(end.y, 0)).toBe(true);
			}
		}
	});
});

/** The plain chequerboard: four straight sides. */
const plain = (cuts: number): PatternTile => ({
	rule: freeSides(),
	cuts,
	curves: { ne: straightCurve(), se: straightCurve(), sw: straightCurve(), nw: straightCurve() }
});

const birds = () => exampleTile(EXAMPLES.find((e) => e.id === 'birds')!);

describe('tileFigure', () => {
	it("finds Escher's birds a body with beak, wings and tail, and the chequerboard all body", () => {
		const bird = tileFigure(birds());
		expect(bird.body).toBeGreaterThan(0.6);
		expect(bird.body).toBeLessThan(0.7);
		expect(bird.thin).toBeLessThan(0.05);
		expect(isFigure(birds())).toBe(true);
		const square = tileFigure(plain(3));
		expect(square.body).toBeGreaterThan(0.95);
		expect(square.thin).toBeLessThan(0.01);
		expect(isFigure(plain(3), true)).toBe(false);
	});

	it('lets every example tile of the tab through when the tiles may be square', () => {
		for (const ex of EXAMPLES) expect(isFigure(exampleTile(ex), true), ex.id).toBe(true);
	});
});

describe('weavesWell', () => {
	const fingers = tileFingers(plain(3));
	const rect = inferOverlapRect(fingers, tileGrid(plain(3)));
	const strip = rect.height / 4;
	const lefts = fingers.filter((f) => f.lobe === 'left').sort((a, b) => a.segments[0]!.p0.y - b.segments[0]!.p0.y);
	/** The heart with these left cuts moved down by `dy`. */
	const moved = (ids: string[], dy: number): Finger[] =>
		fingers.map((f) =>
			ids.includes(f.id)
				? {
						...f,
						segments: f.segments.map((s) => ({
							p0: { ...s.p0, y: s.p0.y + dy },
							p1: { ...s.p1, y: s.p1.y + dy },
							p2: { ...s.p2, y: s.p2.y + dy },
							p3: { ...s.p3, y: s.p3.y + dy }
						}))
					}
				: f
		);

	it('passes the chequerboard: a strip between neighbours, every edge a strip from the first cut', () => {
		expect(edgeGap(fingers, rect, 4)).toBeCloseTo(1, 1);
		expect(longestCloseRun(fingers, 'neighbours', 4, rect.width, 0.2)).toBe(0);
		expect(weavesWell(fingers, rect, 4, 1.6)).toBe(true);
	});

	it('fails two neighbouring cuts a tenth of a strip apart, and an edge the cuts leave bare for 1.8 strips', () => {
		// The first inner cut down to a tenth of a strip above the second.
		expect(weavesWell(moved([lefts[1]!.id], 0.9 * strip), rect, 4)).toBe(false);
		// The first two inner cuts down by 0.8 of a strip: the top band is bare for 1.8.
		const bare = moved([lefts[1]!.id, lefts[2]!.id], 0.8 * strip);
		expect(edgeGap(bare, rect, 4)).toBeCloseTo(1.8, 1);
		expect(weavesWell(bare, rect, 4, 1.6)).toBe(false);
	});
});

describe('randomTile', () => {
	it('is a tile whose heart weaves and reads as a figure: no red cuts, sliver, thin strip or bare edge', { timeout: 60_000 }, () => {
		for (let i = 1; i <= 40; i++) {
			const { tile } = randomTile(seeded(i));
			const fingers = tileFingers(tile);
			const grid = tileGrid(tile);
			const rect = inferOverlapRect(fingers, grid);
			const margin = intersectionMarginPx(rect, gridClearanceScale(grid.x, grid.y));
			expect(findFingersWithIssues(fingers, margin).size).toBe(0);
			expect(halvesCrossCleanly(fingers, margin)).toBe(true);
			expect(weavesWell(fingers, rect, tile.cuts + 1, 1.6)).toBe(true);
			expect(isFigure(tile, true)).toBe(true);
		}
	});

	it('leans the tiles of the types that lean, now and then', () => {
		const leaned = Array.from({ length: 40 }, (_, i) => {
			const rng = seeded(300 + i);
			return randomTileDraw(rng, { rule: { sides: 'free' }, cuts: 3 });
		}).filter((t) => t.offset && (t.offset.x !== 0 || t.offset.y !== 0));
		expect(leaned.length).toBeGreaterThan(15);
	});

	it('explores: most types, every size the tab offers, stretched cells and turned patterns', { timeout: 120_000 }, () => {
		const tiles = Array.from({ length: 80 }, (_, i) => randomTile(seeded(100 + i)));
		expect(new Set(tiles.map((t) => t.rule)).size).toBeGreaterThan(20);
		expect(new Set(tiles.map((t) => t.tile.cuts)).size).toBe(5);
		expect(tiles.some((t) => t.tile.turn !== undefined && Math.abs(t.tile.turn) > 1e-6)).toBe(true);
		expect(tiles.some((t) => t.tile.shape && Math.abs(t.tile.shape.x.x - t.tile.shape.y.y) > 0.05)).toBe(true);
	});
});
