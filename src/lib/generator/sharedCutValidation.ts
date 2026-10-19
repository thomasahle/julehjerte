import type { Edge, Point, Ring } from './geometry';

const EPS = 1e-7;
function segment(a: Point, b: Point) {
	const dx = b[0] - a[0], dy = b[1] - a[1];
	// The exact test allows the obstacle parameter slightly beyond [0, 1].
	// Include that extension, plus roundoff slack, in the rejection bounds.
	const padX = EPS * (1 + Math.abs(dx)), padY = EPS * (1 + Math.abs(dy));
	return {
		x: a[0], y: a[1], dx, dy,
		left: Math.min(a[0], b[0]) - padX, right: Math.max(a[0], b[0]) + padX,
		top: Math.min(a[1], b[1]) - padY, bottom: Math.max(a[1], b[1]) + padY
	};
}
type Segment = ReturnType<typeof segment>;
function crosses(a: Segment, b: Segment) {
	if (a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) return false;
	const det = a.dx * b.dy - a.dy * b.dx;
	if (Math.abs(det) < EPS) return false;
	const dx = b.x - a.x, dy = b.y - a.y;
	const t = (dx * b.dy - dy * b.dx) / det, s = (dx * a.dy - dy * a.dx) / det;
	return t > EPS && t < 1 - EPS && s >= -EPS && s <= 1 + EPS;
}

/** Reuse the unchanged motif's segment bounds across candidate connections.
 * Only disjoint bounds skip the original intersection test. This is the local
 * crossing check; full paper-path spacing is still checked after construction. */
export function createSharedCutValidator(contours: Ring[]) {
	const outlines = contours.flatMap(ring => ring.map((p, i) => segment(p, ring[(i + 1) % ring.length])));
	return (edges: Edge[]): boolean => {
		const shared = edges.filter(edge => edge.family === 'AB').map(edge => segment(edge.from, edge.to));
		for (let i = 0; i < shared.length; i++) {
			for (const outline of outlines) if (crosses(shared[i], outline)) return false;
			for (let j = i + 1; j < shared.length; j++) if (crosses(shared[i], shared[j])) return false;
		}
		return true;
	};
}
