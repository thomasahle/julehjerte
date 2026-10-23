import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import type { HeartDesign } from '$lib/types/heart';
import { cutTipPoints } from './cutQuality';

type Point = number[];
type CutNetwork = Pick<CutGeometry, 'curves' | 'A_overlap_paths' | 'B_overlap_paths'>;
const key = (p: Point) => p.map(v => v.toFixed(7)).join(',');
const unit = (p: Point): Point => {
	const length = Math.hypot(...p);
	return length > 1e-12 ? p.map(v => v / length) : [0, 0];
};

/** Approach each outline across its tangent instead of grazing its edge.
 * Only coincident cuts change; the visible outline and path connections stay
 * fixed. Curving a shared cut may open a narrow passage, but can also cross a
 * neighbouring cut, so the complete candidate still requires validation.
 * An optional endpoint filter confines a quality repair to existing sharp tips.
 * Shorter handles can retain the normal approach in a crowded component grid. */
export function curveSharedCuts<T extends CutNetwork>(geometry: T, at?: (point: Point) => boolean, handleFraction = .2): T | undefined {
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
			if (at && !at(p[end])) continue;
			const directions = outlines.get(key(p[end]));
			if (directions?.length !== 2) continue;
			const [u, v] = directions, t = unit([u[0] - v[0], u[1] - v[1]]);
			if (!(t[0] || t[1])) continue;
			const normal = [-t[1], t[0]],
				forward = normal[0] * (p[other][0] - p[end][0]) + normal[1] * (p[other][1] - p[end][1]),
				distance = length * handleFraction * (forward < 0 ? -1 : 1),
				next = p[end].map((a, i) => a + normal[i] * distance);
			if (next.every((v, i) => Math.abs(v - p[control][i]) < 1e-12)) continue;
			p[control] = next;
			changed = true;
		}
	}
	return changed ? result : undefined;
}

/** Work on the already fitted cutting paths so a quality improvement cannot
 * refit unrelated outlines or narrow their paper necks. Only handles at sharp
 * ends of coincident curves change, at every sharp tip or those `only` keeps.
 * The caller must validate spacing afterward. */
export function curveSharpSharedTips<T extends Pick<HeartDesign, 'fingers'>>(design: T,
	only?: (point: { x: number; y: number }) => boolean): T | undefined {
	const points = cutTipPoints(design).filter(point => !only || only(point));
	if (!points.length) return;
	const geometry: CutNetwork = { curves: {}, A_overlap_paths: [], B_overlap_paths: [] };
	const ids = new Map<string, { curve: string; reverse: boolean }>();
	const curveKey = (points: Point[]) => points.map(key).join(';');
	let nextId = 0;
	const references = design.fingers.map(finger => {
		const path = finger.segments.map(segment => {
			const points = [segment.p0, segment.p1, segment.p2, segment.p3].map(p => [p.x, p.y]);
			const k = curveKey(points);
			let ref = ids.get(k);
			if (!ref) {
				const curve = String(nextId++);
				geometry.curves[curve] = { control_points: points };
				ref = { curve, reverse: false };
				ids.set(k, ref);
				ids.set(curveKey([...points].reverse()), { curve, reverse: true });
			}
			return ref;
		});
		(finger.lobe === 'right' ? geometry.A_overlap_paths : geometry.B_overlap_paths).push(path);
		return path;
	});
	const curved = curveSharedCuts(geometry,
		p => points.some(q => Math.hypot(p[0] - q.x, p[1] - q.y) < 1e-7));
	if (!curved) return;
	const result = structuredClone(design);
	for (let f = 0; f < references.length; f++) for (let s = 0; s < references[f].length; s++) {
		const ref = references[f][s], before = geometry.curves[ref.curve].control_points,
			after = curved.curves[ref.curve].control_points;
		for (const control of [1, 2] as const) {
			const index = ref.reverse ? 3 - control : control;
			if (after[index][0] !== before[index][0] || after[index][1] !== before[index][1])
				result.fingers[f].segments[s][control === 1 ? 'p1' : 'p2'] = { x: after[index][0], y: after[index][1] };
		}
	}
	return result;
}
