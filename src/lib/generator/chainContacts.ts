import {
	add, centroid, contourChain, distance, dot, sub, mix,
	type Edge, type Point, type Ring, type Contour
} from './geometry';

export type ContourChain = { nodes: Contour[]; start: Point; end: Point };

/** Join the nearest points, including projections onto edges. A centre ray can
 * miss a nearly touching pair and leave a narrow return beside the bridge. */
function nearest(a: Ring, b: Ring): [Point, Point] {
	let best = Infinity, pair: [Point, Point] = [a[0], b[0]];
	for (const [first, second, reverse] of [[a, b, false], [b, a, true]] as const)
		for (const p of first) for (let i = 0; i < second.length; i++) {
			const u = second[i], v = second[(i + 1) % second.length], d = sub(v, u), length = dot(d, d),
				q = length > 1e-20 ? mix(u, v, Math.max(0, Math.min(1, dot(sub(p, u), d) / length))) : u,
				gap = distance(p, q);
			if (gap < best) { best = gap; pair = reverse ? [q, p] : [p, q]; }
		}
	return pair;
}

/** Nearby facing outlines should belong to opposite sheets. Each two-terminal
 * contour can reverse its A/B arcs without changing its outline or open paths.
 * Build a contact forest, closest pairs first; conflicting later preferences
 * cannot override a tighter contact. Full-sheet validation remains mandatory. */
export function separateChainContacts(groups: Edge[][], margin: number, invert = false): Edge[][] {
	const contacts: { a: number; b: number; flip: number; gap: number }[] = [];
	const outlines = groups.map(group => group.filter(e => e.kind === 'outline' && e.family !== 'AB')
		.map(e => {
			const d = sub(e.to, e.from), length = Math.hypot(...d);
			return { e, d, length, normal: [d[1] / length, -d[0] / length] as Point, middle: mix(e.from, e.to, .5) };
		}));
	for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
		const best = new Map<number, number>();
		for (const u of outlines[a]) for (const v of outlines[b]) {
			if (dot(u.normal, v.normal) > -.8) continue;
			for (const [source, target] of [[u, v], [v, u]]) {
				const p = source.middle, t = Math.max(0, Math.min(1,
					dot(sub(p, target.e.from), target.d) / (target.length * target.length))),
					q = mix(target.e.from, target.e.to, t), gap = distance(p, q);
				if (gap < 1e-7 || gap > margin * 2) continue;
				const vector: Point = [(q[0] - p[0]) / gap, (q[1] - p[1]) / gap];
				// Ignore edges meeting around a bridge endpoint. Their normals
				// must face across the gap, not along either outline.
				if (dot(source.normal, vector) < .7 || dot(target.normal, vector) > -.7) continue;
				const flip = Number(u.e.family === v.e.family);
				best.set(flip, Math.min(best.get(flip) ?? Infinity, gap));
			}
		}
		for (const [flip, gap] of best) contacts.push({ a, b, flip, gap });
	}
	const neighbors: { to: number; flip: number }[][] = groups.map(() => []);
	const connected = (a: number, b: number) => {
		const seen = new Set<number>(), pending = [a];
		while (pending.length) {
			const at = pending.pop()!;
			if (at === b) return true;
			if (seen.has(at)) continue;
			seen.add(at);
			pending.push(...neighbors[at].map(n => n.to));
		}
		return false;
	};
	for (const { a, b, flip } of contacts.sort((a, b) => a.gap - b.gap)) {
		if (connected(a, b)) continue;
		neighbors[a].push({ to: b, flip }); neighbors[b].push({ to: a, flip });
	}
	const phases: (number | undefined)[] = groups.map(() => undefined);
	for (let i = 0; i < groups.length; i++) if (phases[i] === undefined) {
		phases[i] = Number(invert);
		const pending = [i];
		while (pending.length) {
			const at = pending.pop()!;
			for (const { to, flip } of neighbors[at]) if (phases[to] === undefined) {
				phases[to] = phases[at]! ^ flip;
				pending.push(to);
			}
		}
	}
	return groups.map((group, i) => group.map(e => !phases[i] || e.family === 'AB' ? e : {
		...e, family: e.family === 'A' ? 'B' : 'A'
	}));
}

/** Keep complete components in three open lanes. Counters use the existing
 * two-terminal construction; bridges coincide on both sheets. Sheet assignment
 * is decided across all lanes so a close pair in different lanes also clears. */
export function contactChains(chains: ContourChain[], angle: number, margin: number, invert = false): Edge[] {
	const edges: Edge[] = [], groups: Edge[][] = [], direction: Point = [Math.cos(angle), Math.sin(angle)];
	for (const { nodes, start, end } of chains) {
		const ordered = [...nodes].sort((a, b) => dot(centroid(a.ring), direction) - dot(centroid(b.ring), direction));
		if (!ordered.length) { add(edges, [start, end], 'AB', 'shared'); continue; }
		const joins = [nearest([start], ordered[0].ring),
			...ordered.slice(1).map((node, i) => nearest(ordered[i].ring, node.ring)),
			nearest(ordered.at(-1)!.ring, [end])];
		for (const pair of joins) add(edges, pair, 'AB', 'shared');
		for (let i = 0; i < ordered.length; i++) {
			const local: Edge[] = [];
			contourChain(local, [ordered[i]], angle, joins[i][1], joins[i + 1][0], 'B', true, false, true);
			groups.push(local);
		}
	}
	return [...edges, ...separateChainContacts(groups, margin, invert).flat()];
}
