import { describe, expect, it } from 'vitest';
import { contactChains, separateChainContacts } from './chainContacts';
import { forest, type Edge, type Ring } from './geometry';
import { createLocalRouter } from './localRoutes';

describe('component-chain contacts', () => {
	it('puts close facing outlines on opposite sheets without changing shared cuts or inputs', () => {
		const groups: Edge[][] = [
			[{ from: [10, 0], to: [10, 10], family: 'A', kind: 'outline' }],
			[{ from: [10.4, 10], to: [10.4, 0], family: 'A', kind: 'outline' },
				{ from: [10, 5], to: [10.4, 5], family: 'AB', kind: 'shared' }]
		];
		const original = structuredClone(groups), result = separateChainContacts(groups, 1);
		expect(result.map(g => g[0].family)).toEqual(['A', 'B']);
		expect(result[1][1]).toEqual(groups[1][1]);
		expect(result[1][0].from).toEqual(groups[1][0].from);
		expect(groups).toEqual(original);
		expect(separateChainContacts(groups, 1, true).map(g => g[0].family)).toEqual(['B', 'A']);
	});

	it('does not reverse parallel outlines that face the same way', () => {
		const groups: Edge[][] = [10, 10.4].map(x => [
			{ from: [x, 0], to: [x, 10], family: 'A', kind: 'outline' }
		]);
		expect(separateChainContacts(groups, 1)).toEqual(groups);
	});

	it('joins at an edge projection and keeps both complete entry-to-exit paper paths', () => {
		const rings: Ring[] = [
			[[0, 0], [10, 0], [10, 10], [0, 10]],
			[[10.2, 4], [15, 1], [20, 4], [15, 8]]
		], gates: Ring = [[-5, 5], [25, 4]];
		const edges = contactChains([{ nodes: forest(rings), start: gates[0], end: gates[1] }], 0, 1);
		expect(edges).toContainEqual({ from: [10, 4], to: [10.2, 4], family: 'AB', kind: 'shared' });
		const routes = createLocalRouter()(edges, gates);
		expect(routes).toHaveLength(2);
		for (const route of routes!) {
			expect(route[0]).toEqual(gates[0]);
			expect(route.at(-1)).toEqual(gates[1]);
		}
		const outlineLength = edges.filter(e => e.kind === 'outline')
			.reduce((length, e) => length + Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]), 0);
		const originalLength = rings.reduce((length, ring) => length + ring.reduce((sum, p, i) =>
			sum + Math.hypot(p[0] - ring[(i + 1) % ring.length][0], p[1] - ring[(i + 1) % ring.length][1]), 0), 0);
		expect(outlineLength).toBeCloseTo(originalLength, 10);
	});
});
