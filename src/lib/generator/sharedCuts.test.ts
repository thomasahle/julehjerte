import { describe, expect, it } from 'vitest';
import { rerouteSharedCuts } from './sharedCuts';
import { add, mix, type Edge, type Ring } from './geometry';
import { fingerHasIntersectionIssues } from '$lib/editor/curveIssues';
import type { Finger } from '$lib/types/heart';

const obstacle: Ring = [[45, 47], [55, 47], [55, 53], [45, 53], [45, 47]];
const finger = (id: string, points: Ring): Finger => ({
	id, lobe: 'left', segments: points.slice(1).map((p, i) => {
		const a = points[i], b = mix(a, p, 1 / 3), c = mix(a, p, 2 / 3);
		return {
			p0: { x: a[0], y: a[1] }, p1: { x: b[0], y: b[1] },
			p2: { x: c[0], y: c[1] }, p3: { x: p[0], y: p[1] }
		};
	})
});

describe('invisible connection detours', () => {
	it('routes around an intervening outline with the editor clearance intact', () => {
		const edges: Edge[] = [];
		add(edges, obstacle, 'A', 'outline');
		add(edges, [[20, 50], [80, 50]], 'AB', 'shared');
		const result = rerouteSharedCuts(edges, 1), shared = result.filter(e => e.family === 'AB');
		expect(result.filter(e => e.kind === 'outline')).toEqual(edges.slice(0, 4));
		expect(shared.length).toBeGreaterThan(1);
		expect(shared[0].from).toEqual([20, 50]);
		expect(shared.at(-1)!.to).toEqual([80, 50]);
		for (let i = 1; i < shared.length; i++) expect(shared[i].from).toEqual(shared[i - 1].to);
		const routed = finger('connection', [shared[0].from, ...shared.map(e => e.to)]);
		expect(fingerHasIntersectionIssues(routed, [routed, finger('obstacle', obstacle)], 1)).toBe(false);
	});
	it('keeps a connection that already has room', () => {
		const edges: Edge[] = [];
		add(edges, obstacle, 'A', 'outline');
		add(edges, [[20, 40], [80, 40]], 'AB', 'shared');
		expect(rerouteSharedCuts(edges, 1)).toBe(edges);
	});
	for (const angle of [0, Math.PI / 4, Math.PI / 2])
		it(`still detours around a close noncrossing outline at angle ${angle}`, () => {
			const rotate = (ring: Ring): Ring => ring.map(([x, y]) => [
				50 + (x - 50) * Math.cos(angle) - (y - 50) * Math.sin(angle),
				50 + (x - 50) * Math.sin(angle) + (y - 50) * Math.cos(angle)
			]);
			const edges: Edge[] = [], outline = rotate(obstacle);
			add(edges, outline, 'A', 'outline');
			// The original segment misses the outline but leaves only 0.75
			// units of paper. Pruning distant obstacles must retain this one.
			add(edges, rotate([[20, 46.25], [80, 46.25]]), 'AB', 'shared');
			const shared = rerouteSharedCuts(edges, 1).filter(edge => edge.family === 'AB');
			expect(shared.length).toBeGreaterThan(1);
			const routed = finger('connection', [shared[0].from, ...shared.map(edge => edge.to)]);
			expect(fingerHasIntersectionIssues(routed, [routed, finger('obstacle', outline)], 1)).toBe(false);
		});
	it('retains an unroutable connection for rejection by the complete validator', () => {
		const edges: Edge[] = [];
		add(edges, obstacle, 'A', 'outline');
		add(edges, [[50, 50], [80, 50]], 'AB', 'shared');
		expect(rerouteSharedCuts(edges, 1)).toEqual(edges);
	});
});
