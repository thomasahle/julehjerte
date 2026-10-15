import type { CutGeometry } from '$lib/inverse/toHeartDesign';

type Point = number[];
const key = (p: Point) => p.map(v => v.toFixed(7)).join(',');
const unit = (p: Point): Point => {
	const length = Math.hypot(...p);
	return length > 1e-12 ? p.map(v => v / length) : [0, 0];
};

/** Approach each outline across its tangent instead of grazing its edge.
 * Only coincident cuts change; the visible outline and path connections stay
 * fixed. Curving a shared cut may open a narrow passage, but can also cross a
 * neighbouring cut, so the complete candidate still requires validation. */
export function curveSharedCuts(geometry: CutGeometry): CutGeometry | undefined {
	const uses = new Map<string, number>(), outlines = new Map<string, Point[]>();
	for (const path of [...geometry.A_overlap_paths, ...geometry.B_overlap_paths])
		for (const ref of path) uses.set(ref.curve, (uses.get(ref.curve) ?? 0) + 1);
	for (const [id, curve] of Object.entries(geometry.curves)) {
		if (uses.get(id) !== 1) continue;
		const p = curve.control_points;
		for (const [a, candidates] of [[p[0], p.slice(1)], [p[3], p.slice(0, 3).reverse()]] as [Point, Point[]][]) {
			const b = candidates.find(b => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-12);
			if (!b) continue;
			const k = key(a), vectors = outlines.get(k) ?? [];
			vectors.push(unit([b[0] - a[0], b[1] - a[1]]));
			outlines.set(k, vectors);
		}
	}
	const result = structuredClone(geometry);
	let changed = false;
	for (const [id, curve] of Object.entries(result.curves)) {
		if (uses.get(id) !== 2) continue;
		const p = curve.control_points, length = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1]);
		for (const [end, control, other] of [[0, 1, 3], [3, 2, 0]]) {
			const directions = outlines.get(key(p[end]));
			if (directions?.length !== 2) continue;
			const [u, v] = directions, t = unit([u[0] - v[0], u[1] - v[1]]);
			if (!(t[0] || t[1])) continue;
			const normal = [-t[1], t[0]],
				forward = normal[0] * (p[other][0] - p[end][0]) + normal[1] * (p[other][1] - p[end][1]),
				distance = length * .2 * (forward < 0 ? -1 : 1),
				next = p[end].map((a, i) => a + normal[i] * distance);
			if (next.every((v, i) => Math.abs(v - p[control][i]) < 1e-12)) continue;
			p[control] = next;
			changed = true;
		}
	}
	return changed ? result : undefined;
}
