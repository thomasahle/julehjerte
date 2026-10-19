import type { Edge, Point, Ring } from './geometry';

/** Reuse point identities and adjacency storage while trying connections for one
 * motif. Coordinate keys retain the compiler's existing six-decimal precision;
 * integer slots avoid rebuilding string-keyed graphs for every candidate. */
export function createLocalRouter() {
	const points = new WeakMap<Point, number>(), coordinates = new Map<string, number>();
	const first: number[] = [], second: number[] = [], degree: number[] = [], stamp: number[] = [];
	let generation = 0;
	const id = (p: Point) => {
		let value = points.get(p);
		if (value === undefined) {
			const key = p.map(x => x.toFixed(6)).join(',');
			value = coordinates.get(key);
			if (value === undefined) {
				value = coordinates.size;
				coordinates.set(key, value);
			}
			points.set(p, value);
		}
		return value;
	};
	const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;

	/** Trace the two noncrossing paths of each sheet, rejecting branches and loops.
	 * The returned paths use the candidate's exact points, never rounded keys. */
	return (edges: Edge[], gates: Point[]): Ring[] | null => {
		const fromIds = edges.map(e => id(e.from)), toIds = edges.map(e => id(e.to));
		const gateIds = gates.map(id), gateSet = new Set(gateIds), routes: Ring[] = [];
		const used = new Uint8Array(edges.length);
		for (const [family, pairs] of [
			['A', [[0, 3], [1, 2]]],
			['B', [[0, 1], [2, 3]]]
		] as const) {
			generation++;
			const active: number[] = [];
			const attach = (at: number, edge: number) => {
				if (stamp[at] !== generation) {
					stamp[at] = generation;
					degree[at] = 0;
					active.push(at);
				}
				const d = degree[at]++;
				if (d === 0) first[at] = edge;
				else if (d === 1) second[at] = edge;
			};
			let selected = 0;
			for (let i = 0; i < edges.length; i++) {
				if (edges[i].family !== family && edges[i].family !== 'AB') continue;
				selected++;
				attach(fromIds[i], i);
				attach(toIds[i], i);
			}
			for (const at of active)
				if (degree[at] !== (gateSet.has(at) ? 1 : 2)) return null;
			used.fill(0);
			let usedCount = 0;
			for (const [start, end] of gates.length === 2 ? [[0, 1]] : pairs) {
				let p = gates[start], at = gateIds[start];
				const route = [p];
				for (;;) {
					if (stamp[at] !== generation) break;
					const i = !used[first[at]] ? first[at]
						: degree[at] === 2 && !used[second[at]] ? second[at] : undefined;
					if (i === undefined) break;
					used[i] = 1;
					usedCount++;
					const e = edges[i], forward = near(p, e.from);
					p = forward ? e.to : e.from;
					at = forward ? toIds[i] : fromIds[i];
					route.push(p);
				}
				if (!near(p, gates[end])) return null;
				routes.push(route);
			}
			if (usedCount !== selected) return null;
		}
		return routes;
	};
}
