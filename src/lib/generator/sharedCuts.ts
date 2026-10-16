import { sub, dot, cross, mix, distance, type Point, type Edge } from './geometry';

/** Move only coincident A/B connections around neighbouring cuts. The graph
 * endpoints and all visible outlines stay fixed. This bounded visibility graph
 * is a routing construction; its result still needs the full-sheet validators. */
export function rerouteSharedCuts(source: Edge[], margin: number): Edge[] {
	let edges = source;
	const project = (p: Point, a: Point, b: Point) => Math.max(0, Math.min(1,
		dot(sub(p, a), sub(b, a)) / Math.max(1e-20, dot(sub(b, a), sub(b, a)))));
	for (const original of source.filter(e => e.family === 'AB' && e.kind === 'shared')) {
		const from = original.from, to = original.to, reach = margin * 7;
		const bounds = [
			Math.min(from[0], to[0]) - reach, Math.min(from[1], to[1]) - reach,
			Math.max(from[0], to[0]) + reach, Math.max(from[1], to[1]) + reach
		];
		const relevant = edges.filter(e => e !== original &&
			Math.min(e.from[0], e.to[0]) <= bounds[2] && Math.max(e.from[0], e.to[0]) >= bounds[0] &&
			Math.min(e.from[1], e.to[1]) <= bounds[3] && Math.max(e.from[1], e.to[1]) >= bounds[1]);
		const padded = relevant.map(edge => ({
			edge,
			left: Math.min(edge.from[0], edge.to[0]) - margin * 1.1,
			right: Math.max(edge.from[0], edge.to[0]) + margin * 1.1,
			top: Math.min(edge.from[1], edge.to[1]) - margin * 1.1,
			bottom: Math.max(edge.from[1], edge.to[1]) + margin * 1.1
		}));
		const clear = (a: Point, b: Point) => {
			const u = sub(b, a), left = Math.min(a[0], b[0]), right = Math.max(a[0], b[0]),
				top = Math.min(a[1], b[1]), bottom = Math.max(a[1], b[1]);
			for (const obstacle of padded) {
				// Candidate segments are often much shorter than the original
				// connection's search box. Disjoint padded boxes cannot cross or
				// violate the distance test below; retain its exact checks nearby.
				if (right < obstacle.left || left > obstacle.right || bottom < obstacle.top || top > obstacle.bottom) continue;
				const e = obstacle.edge;
				const c = e.from, d = e.to, v = sub(d, c), det = cross(u, v);
				if (Math.abs(det) > 1e-7) {
					const t = cross(sub(c, a), v) / det, s = cross(sub(c, a), u) / det;
					if (t > 1e-7 && t < 1 - 1e-7 && s >= -1e-7 && s <= 1 + 1e-7) return false;
				} else if (Math.abs(cross(sub(c, a), u)) < 1e-7) {
					// Sharing an endpoint is allowed; following another cut is not.
					const length = dot(u, u);
					if (length > 1e-14) {
						const p = dot(sub(c, a), u) / length, q = dot(sub(d, a), u) / length;
						if (Math.min(1, Math.max(p, q)) - Math.max(0, Math.min(p, q)) > 1e-7) return false;
					}
				}
				const pairs: [Point, Point][] = [
					[a, mix(c, d, project(a, c, d))], [b, mix(c, d, project(b, c, d))],
					[mix(a, b, project(c, a, b)), c], [mix(a, b, project(d, a, b)), d]
				];
				for (const [p, q] of pairs) {
					if (distance(p, q) >= margin * 1.1) continue;
					// The connection must meet its outline. Check that final join
					// as part of the complete paper path, not as two separate cuts.
					if ([from, to].some(end => distance(p, end) < margin * 2 && distance(q, end) < margin * 2)) continue;
					return false;
				}
			}
			return true;
		};
		if (clear(from, to)) continue;
		const candidates: Point[] = [from, to];
		points: for (let i = 0; i < relevant.length; i += 2) {
			const e = relevant[i], u = sub(e.to, e.from), length = Math.hypot(...u);
			if (length < 1e-5) continue;
			for (const p of [e.from, e.to]) for (const sign of [-1, 1]) {
				const q: Point = [p[0] + sign * u[1] / length * margin * 1.5, p[1] - sign * u[0] / length * margin * 1.5];
				if (q[0] <= 0 || q[0] >= 100 || q[1] <= 0 || q[1] >= 100) continue;
				if (q[0] >= bounds[0] && q[0] <= bounds[2] && q[1] >= bounds[1] && q[1] <= bounds[3] &&
					!candidates.some(p => distance(p, q) < margin * .4)) candidates.push(q);
				if (candidates.length === 240) break points;
			}
		}
		const best = candidates.map(() => Infinity), previous = candidates.map(() => -1),
			done = new Set<number>(), visible = new Map<string, boolean>();
		best[0] = 0;
		for (let step = 0; step < candidates.length; step++) {
			let at = -1;
			for (let i = 0; i < best.length; i++)
				if (!done.has(i) && (at === -1 || best[i] < best[at])) at = i;
			if (at === 1 || at < 0 || !Number.isFinite(best[at])) break;
			done.add(at);
			for (let i = 1; i < best.length; i++) {
				if (done.has(i)) continue;
				const score = best[at] + distance(candidates[at], candidates[i]);
				if (score >= best[i]) continue;
				const key = Math.min(i, at) + ':' + Math.max(i, at);
				let safe = visible.get(key);
				if (safe === undefined) {
					safe = clear(candidates[at], candidates[i]);
					visible.set(key, safe);
				}
				if (safe) { best[i] = score; previous[i] = at; }
			}
		}
		if (previous[1] < 0) continue;
		const path: Point[] = [];
		for (let i = 1; i >= 0; i = previous[i]) path.unshift(candidates[i]);
		const index = edges.indexOf(original);
		edges = [...edges.slice(0, index), ...path.slice(1).map((p, i) => ({ ...original, from: path[i], to: p })), ...edges.slice(index + 1)];
	}
	return edges;
}
