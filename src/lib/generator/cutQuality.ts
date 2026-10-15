import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import type { HeartDesign, Vec } from '$lib/types/heart';

/** Count narrow paper tips at joins of the actual cutting paths. A turn of
 * more than 150° leaves a tip below 30°; more than 135° leaves one below 45°.
 * Prefer removing the narrowest tips first. Spacing is checked separately. */
export function cutTipCounts(cuts: CutGeometry | Pick<HeartDesign, 'fingers'>): [number, number] {
	const paths = 'fingers' in cuts ? cuts.fingers.map(f => f.segments)
		: [...cuts.A_overlap_paths, ...cuts.B_overlap_paths].map(path => path.map(ref => {
			const points = cuts.curves[ref.curve].control_points.map(([x, y]) => ({ x, y }));
			if (ref.reverse) points.reverse();
			return { p0: points[0], p1: points[1], p2: points[2], p3: points[3] };
		}));
	const tangent = (a: Vec, candidates: Vec[]) => {
		for (const b of candidates) {
			const d = { x: b.x - a.x, y: b.y - a.y };
			if (Math.hypot(d.x, d.y) > 1e-10) return d;
		}
		return { x: 0, y: 0 };
	};
	let needles = 0, sharp = 0;
	for (const path of paths) for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i];
		const incoming = tangent(a.p3, [a.p2, a.p1, a.p0]);
		const outgoing = tangent(b.p0, [b.p1, b.p2, b.p3]);
		if (!(incoming.x || incoming.y) || !(outgoing.x || outgoing.y)) continue;
		const turn = Math.atan2(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x),
			-incoming.x * outgoing.x - incoming.y * outgoing.y);
		if (turn > 5 * Math.PI / 6) needles++;
		if (turn > 3 * Math.PI / 4) sharp++;
	}
	return [needles, sharp];
}

export function fewerCutTips(a: [number, number], b: [number, number]): boolean {
	return a[0] < b[0] || a[0] === b[0] && a[1] < b[1];
}
