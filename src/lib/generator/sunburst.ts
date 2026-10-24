/** Four extra strips travel around the central field. The two papers cross at
 * the circle's diagonal points; cuts within a single paper remain separate.
 * This gives eight outer rays without running extra cuts through the motif. */
import {
	add,
	arc,
	compile,
	frameRing,
	ray,
	type Edge,
	type Ring,
	type Point
} from './geometry';
export function sunburstBorder<T extends { edges: Edge[]; artwork: Ring[] }>(
	inner: T,
	size: number,
	crown = .8
) {
	const circle = frameRing('circle', size),
		edges = inner.edges.slice();
	const ports = [1, 3, 5, 7].map((i) =>
		ray(circle, [50, 50], (i * Math.PI) / 4)
	);
	const [se, sw, nw, ne] = ports;
	const inset = Math.max(4, (100 - size) * 0.25);
	const path = (points: Point[], family: 'A' | 'B') =>
		add(edges, points, family, 'frame');
	path([[inset, 0], ...arc(circle, sw, nw).reverse(), [inset, 100]], 'A');
	path([[100 - inset, 0], ...arc(circle, ne, se), [100 - inset, 100]], 'A');
	path([[0, inset], ...arc(circle, nw, ne), [100, inset]], 'B');
	path(
		[[0, 100 - inset], ...arc(circle, se, sw).reverse(), [100, 100 - inset]],
		'B'
	);
	return {
		...inner,
		edges,
		geometry: compile(edges),
		domain: [frameRing('circle', size * crown)]
	};
}
