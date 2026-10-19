import { expect, it } from 'vitest';
import { createLocalRouter } from './localRoutes';
import type { Edge, Point } from './geometry';

const gates: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const inner: Point[] = [[3, 3], [7, 3], [7, 7], [3, 7]];
const edges: Edge[] = [
	...gates.map((from, i): Edge => ({ from, to: inner[i], family: 'AB', kind: 'shared' })),
	...inner.map((from, i): Edge => ({ from, to: inner[(i + 1) % 4], family: i % 2 ? 'A' : 'B', kind: 'outline' }))
];
const expected = [
	[gates[0], inner[0], inner[3], gates[3]], [gates[1], inner[1], inner[2], gates[2]],
	[gates[0], inner[0], inner[1], gates[1]], [gates[2], inner[2], inner[3], gates[3]]
];

it('retains the four open sheet pairings and exact outline points', () => {
	const routes = createLocalRouter()(edges, gates);
	expect(routes).toEqual(expected);
	expect(routes![0][1]).toBe(inner[0]);
});

it('handles reversed edges and separately allocated copies of the same junction', () => {
	const reversed = edges.map(e => ({ ...e, from: [...e.to] as Point, to: [...e.from] as Point })).reverse();
	expect(createLocalRouter()(reversed, gates)).toEqual(expected);
});

it('rejects different sheet pairings even when all vertex degrees are valid', () => {
	const swapped = edges.map(e => ({ ...e, family: e.family === 'A' ? 'B' as const : e.family === 'B' ? 'A' as const : e.family }));
	expect(createLocalRouter()(swapped, gates)).toBeNull();
});

it('rejects a detached cutting cycle', () => {
	const cycle: Point[] = [[20, 20], [24, 20], [24, 24]];
	const detached = cycle.map((from, i): Edge => ({ from, to: cycle[(i + 1) % 3], family: 'A', kind: 'outline' }));
	expect(createLocalRouter()([...edges, ...detached], gates)).toBeNull();
});

it('does not retain adjacency after a refused branch, missing edge or changed sheet', () => {
	const route = createLocalRouter();
	for (const invalid of [
		[...edges, { from: inner[0], to: [2, 5] as Point, family: 'A' as const, kind: 'shared' as const }],
		edges.slice(1), edges.map(e => ({ ...e, family: 'A' as const }))
	]) {
		expect(route(invalid, gates)).toBeNull();
		expect(route(edges, gates)).toEqual(expected);
	}
});

it('reuses storage for new coordinates and then for a two-gate motif', () => {
	const route = createLocalRouter(), shift = ([x, y]: Point): Point => [x + .123456789, y + 30];
	for (let i = 0; i < 5; i++) {
		expect(route(edges.map(e => ({ ...e, from: shift(e.from), to: shift(e.to) })), gates.map(shift)))
			.toEqual(expected.map(r => r.map(shift)));
		expect(route(edges, gates)).toEqual(expected);
	}
	const pair: Point[] = [gates[0], gates[2]], ends = edges.filter((_, i) => i !== 1 && i !== 3);
	expect(route(ends, pair)).toBeNull(); // Removing two ports still leaves four unmatched outline ends.
	const simple: Edge[] = [{ from: pair[0], to: pair[1], family: 'AB', kind: 'shared' }];
	expect(route(simple, pair)).toEqual([[...pair], [...pair]]);
	expect(route(edges, gates)).toEqual(expected);
});
