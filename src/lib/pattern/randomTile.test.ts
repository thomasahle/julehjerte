import { describe, expect, it } from 'vitest';
import { randomTileDraw, randomTileKind } from './randomTile';
import { randomTile, tileFingers, tileGrid } from './escherTab';
import { halfOf, ruleInfo } from './rules';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { halvesCrossCleanly } from '$lib/editor/slivers';

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

describe('randomTile', () => {
	it("is a tile whose heart weaves: no red cuts, and no sliver between the lobes' cuts", () => {
		for (let i = 1; i <= 40; i++) {
			const { tile } = randomTile(seeded(i));
			const fingers = tileFingers(tile);
			const grid = tileGrid(tile);
			const margin = intersectionMarginPx(inferOverlapRect(fingers, grid), gridClearanceScale(grid.x, grid.y));
			expect(findFingersWithIssues(fingers, margin).size).toBe(0);
			expect(halvesCrossCleanly(fingers, margin)).toBe(true);
		}
	});

	it('explores: most types, every size the tab offers, leaning tiles and turned patterns', () => {
		const tiles = Array.from({ length: 80 }, (_, i) => randomTile(seeded(100 + i)));
		expect(new Set(tiles.map((t) => t.rule)).size).toBeGreaterThan(20);
		expect(new Set(tiles.map((t) => t.tile.cuts)).size).toBe(5);
		expect(tiles.some((t) => t.tile.offset && (t.tile.offset.x !== 0 || t.tile.offset.y !== 0))).toBe(true);
		expect(tiles.some((t) => t.tile.turn !== undefined && Math.abs(t.tile.turn) > 1e-6)).toBe(true);
		expect(tiles.some((t) => t.tile.shape && Math.abs(t.tile.shape.x.x - t.tile.shape.y.y) > 0.05)).toBe(true);
	});
});
