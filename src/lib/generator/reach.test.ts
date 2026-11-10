import { describe, expect, it } from 'vitest';
import { closestPort, distance, type Point, type Ring } from './geometry';
import { pairwise, reachVia, sharedReach } from './reach';

type Wall = [Point, Point];
const side = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const crosses = (a: Point, b: Point, [c, d]: Wall) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
/** A step is open where it crosses none of the walls. */
const past = (walls: Wall[]) => (a: Point, b: Point) => !walls.some(wall => crosses(a, b, wall));
const square = (x: number, y: number, r = 1): Ring => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
const along = (path: Ring) => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);

/** The shortest way's length by trying every pass from every pass. */
function shortest(from: Point, ring: Ring, passes: Point[], open: (a: Point, b: Point) => boolean): number {
	const points = [from, ...passes], cost = points.map((_, i) => i ? Infinity : 0), done = points.map(() => false);
	let best = Infinity;
	for (;;) {
		let i = -1;
		for (let k = 0; k < points.length; k++) if (!done[k] && cost[k] < Infinity && (i < 0 || cost[k] < cost[i])) i = k;
		if (i < 0) return best;
		done[i] = true;
		const port = closestPort(ring, points[i], open);
		if (open(points[i], port.point)) best = Math.min(best, cost[i] + distance(points[i], port.point));
		for (let k = 1; k < points.length; k++)
			if (!done[k] && open(points[i], points[k])) cost[k] = Math.min(cost[k], cost[i] + distance(points[i], points[k]));
	}
}

function random(seed: number) {
	return () => {
		seed = seed + 0x6D2B79F5 | 0;
		let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

describe('reachVia', () => {
	it('goes straight to the nearest point of a ring it sees', () => {
		const way = reachVia([[5, 5]], () => true)([0, 0], square(10, 0));
		expect(way?.path).toEqual([[0, 0], [9, 0]]);
		expect(way?.length).toBe(9);
		expect(way?.port.point).toEqual([9, 0]);
	});

	it('goes round the nearer end of a wall', () => {
		const walls: Wall[] = [[[5, -2], [5, 6]]], passes: Point[] = [[5, -3], [5, 7]];
		const way = reachVia(passes, past(walls))([0, 0], square(10, 0))!;
		expect(way.path[1]).toEqual([5, -3]);
		expect(way.length).toBeCloseTo(along(way.path));
		expect(way.length).toBeCloseTo(shortest([0, 0], square(10, 0), passes, past(walls)));
	});

	it('finds no way where none is open', () => {
		expect(reachVia([[5, 5]], () => false)([0, 0], square(10, 0))).toBeUndefined();
	});

	it('gives the same way again, begun at the point asked from', () => {
		let asked = 0;
		const walls: Wall[] = [[[5, -2], [5, 6]]], open = (a: Point, b: Point) => (asked++, past(walls)(a, b));
		const reach = reachVia([[5, -3], [5, 7]], open), ring = square(10, 0), from: Point = [0, 0];
		const first = reach(from, ring)!, before = asked, again = reach([0, 0], ring)!;
		expect(asked).toBe(before);
		expect(again).toEqual(first);
		expect(again.path[0]).not.toBe(from);
	});

	it('finds the shortest way through walls scattered at random', () => {
		const next = random(7);
		let detours = 0, none = 0;
		for (let round = 0; round < 40; round++) {
			const at = (): Point => [100 * next(), 100 * next()];
			const walls = Array.from({ length: 12 }, (): Wall => {
				const a = at(), turn = 2 * Math.PI * next(), length = 10 + 30 * next();
				return [a, [a[0] + length * Math.cos(turn), a[1] + length * Math.sin(turn)]];
			});
			const passes = Array.from({ length: 30 }, at), open = past(walls), from = at(), ring = square(...at(), 3);
			const way = reachVia(passes, open)(from, ring), length = shortest(from, ring, passes, open);
			if (!way) {
				expect(length).toBe(Infinity);
				none++;
				continue;
			}
			if (way.path.length > 2) detours++;
			expect(way.length).toBeCloseTo(length, 9);
			expect(along(way.path)).toBeCloseTo(length, 9);
			expect(way.path[0]).toEqual(from);
			expect(way.path.at(-1)).toEqual(way.port.point);
			for (let i = 1; i < way.path.length; i++) expect(open(way.path[i - 1], way.path[i])).toBe(true);
		}
		// The walls are in the way often enough for the search to matter.
		expect(detours).toBeGreaterThan(10);
		expect(none).toBeGreaterThan(0);
	});
});

describe('sharedReach', () => {
	it('is one for the same outlines and passes, another for others', () => {
		const contours = [square(10, 0)], passes: Point[] = [[5, 5]], open = () => true;
		const reach = sharedReach(contours, undefined, passes, open);
		expect(sharedReach(contours, undefined, [[5, 5]], open)).toBe(reach);
		expect(sharedReach(contours, undefined, [[5, 6]], open)).not.toBe(reach);
		expect(sharedReach([square(10, 0)], undefined, passes, open)).not.toBe(reach);
		expect(sharedReach(contours, [square(20, 0)], passes, open)).not.toBe(reach);
	});
});

describe('pairwise', () => {
	it('asks of each pair once', () => {
		const asked: string[] = [];
		const among = pairwise([[0, 0], [1, 0], [2, 0]], (a, b) => (asked.push(`${a}-${b}`), a[0] + b[0] < 3));
		expect([among(0, 1), among(1, 2), among(0, 1), among(1, 2)]).toEqual([true, false, true, false]);
		expect(asked).toEqual(['0,0-1,0', '1,0-2,0']);
	});
});
