import type { Finger, Vec } from '$lib/types/heart';
import { bezierBBox } from '$lib/geometry/curves';
import type { WeaveData } from './svgWeave';

type Edge = { a: Vec; b: Vec; forward: string; backward: string };

/** Join the lobe and weave before rasterization. This changes fill contours,
 * never cutting curves. Even-odd parity lets us cancel common boundary edges
 * and reconnect the remaining edges without intersecting the interior curves. */
export function heartPaintPaths(fingers: Finger[], weave: WeaveData) {
	const strips = [...weave.rightOnTopStrips, ...weave.leftOnTopStrips];
	const separate = { left: weave.leftLobeClip, right: strips.map(s => s.pathData).join(' '), joined: false };
	const o = weave.overlap;
	const epsilon = Math.max(1, o.width, o.height) * 1e-12;
	const same = (a: number, b: number) => Math.abs(a - b) <= epsilon;
	const inside = (x: number, y: number) => x >= o.left - epsilon && x <= o.right + epsilon && y >= o.top - epsilon && y <= o.bottom + epsilon;

	// Unfinished or unrestricted drawings can leave the overlap. Keep clipping
	// them rather than allowing a strip to repaint the semicircles.
	for (const finger of fingers) for (const segment of finger.segments) {
		if (![segment.p0, segment.p1, segment.p2, segment.p3].every(p => inside(p.x, p.y))) {
			// A handle outside the square need not put the curve outside it.
			const b = bezierBBox(segment);
			if (!inside(b.x, b.y) || !inside(b.x + b.width, b.y + b.height)) return separate;
		}
	}

	const point = (p: Vec): Vec => ({
		x: same(p.x, o.left) ? o.left : same(p.x, o.right) ? o.right : p.x,
		y: same(p.y, o.top) ? o.top : same(p.y, o.bottom) ? o.bottom : p.y
	});
	const key = (p: Vec) => `${p.x} ${p.y}`;
	const edges: Edge[] = [];
	// Sorted interval endpoints on left, right, top and bottom. Two coverings
	// cancel, including a cubic outer edge against shorter straight closures.
	const events: number[][] = [[], [], [], []];
	const boundary = (points: Vec[]) => {
		const side = [o.left, o.right].findIndex(x => points.every(p => same(p.x, x)));
		const horizontal = [o.top, o.bottom].findIndex(y => points.every(p => same(p.y, y)));
		const index = side >= 0 ? side : horizontal >= 0 ? 2 + horizontal : -1;
		if (index < 0) return false;
		const a = point(points[0]!), b = point(points.at(-1)!);
		events[index]!.push(index < 2 ? a.y : a.x, index < 2 ? b.y : b.x);
		return true;
	};
	const line = (a: Vec, b: Vec) => {
		a = point(a); b = point(b);
		if (key(a) !== key(b)) edges.push({ a, b, forward: `L ${key(b)}`, backward: `L ${key(a)}` });
	};
	const close = (a: Vec, b: Vec) => { if (!boundary([a, b])) line(a, b); };
	const cubic = (a: Vec, p1: Vec, p2: Vec, b: Vec) => {
		if (boundary([a, p1, p2, b])) return;
		a = point(a); b = point(b);
		edges.push({ a, b, forward: `C ${key(p1)} ${key(p2)} ${key(b)}`, backward: `C ${key(p2)} ${key(p1)} ${key(a)}` });
	};
	const sorted = {
		left: fingers.filter(f => f.lobe === 'left').sort((a, b) => (a.segments[0]?.p0.y ?? 0) - (b.segments[0]?.p0.y ?? 0)),
		right: fingers.filter(f => f.lobe === 'right').sort((a, b) => (a.segments[0]?.p0.x ?? 0) - (b.segments[0]?.p0.x ?? 0))
	};
	for (const strip of strips) {
		const a = sorted[strip.lobe][strip.index]?.segments, b = sorted[strip.lobe][strip.index + 1]?.segments;
		if (!a?.length || !b?.length) return separate;
		const start = a[0]!.p0;
		let current = start;
		for (const s of a) { cubic(current, s.p1, s.p2, s.p3); current = s.p3; }
		close(current, b.at(-1)!.p3); current = b.at(-1)!.p3;
		for (let i = b.length - 1; i >= 0; i--) {
			const s = b[i]!;
			cubic(current, s.p2, s.p1, s.p0); current = s.p0;
		}
		close(current, start);
	}

	const topLeft = { x: o.left, y: o.top }, topRight = { x: o.right, y: o.top };
	const radius = o.width / 2;
	edges.push({ a: topLeft, b: topRight,
		forward: `A ${radius} ${radius} 0 1 1 ${key(topRight)}`,
		backward: `A ${radius} ${radius} 0 1 0 ${key(topLeft)}` });
	boundary([topRight, topLeft]);
	for (let side = 0; side < events.length; side++) {
		const coordinates = events[side]!.sort((a, b) => a - b);
		const at = (t: number) => side < 2 ? { x: side === 0 ? o.left : o.right, y: t } : { x: t, y: side === 2 ? o.top : o.bottom };
		let parity = 0;
		for (let i = 0; i < coordinates.length;) {
			const t = coordinates[i]!;
			do { parity ^= 1; i++; } while (i < coordinates.length && coordinates[i] === t);
			if (parity && i < coordinates.length) line(at(t), at(coordinates[i]!));
		}
	}

	// Identical shared cuts can also cancel before painting. Compare both
	// directions, retaining the exact controls of every remaining curve.
	const unique = new Map<string, Edge>();
	for (const edge of edges) {
		const forward = `${key(edge.a)} ${edge.forward}`, backward = `${key(edge.b)} ${edge.backward}`;
		const signature = forward < backward ? forward : backward;
		if (unique.has(signature)) unique.delete(signature); else unique.set(signature, edge);
	}
	const remaining = [...unique.values()], adjacency = new Map<string, number[]>();
	for (let i = 0; i < remaining.length; i++) for (const p of [remaining[i]!.a, remaining[i]!.b]) {
		const k = key(p), list = adjacency.get(k) ?? [];
		list.push(i); adjacency.set(k, list);
	}
	const used = new Uint8Array(remaining.length), paths: string[] = [];
	for (let i = 0; i < remaining.length; i++) {
		if (used[i]) continue;
		const start = key(remaining[i]!.a), parts = [`M ${start}`];
		let current = start, next = i;
		do {
			const edge = remaining[next]!;
			used[next] = 1;
			const forward = key(edge.a) === current;
			parts.push(forward ? edge.forward : edge.backward);
			current = key(forward ? edge.b : edge.a);
			if (current === start) break;
			const candidates = adjacency.get(current)!;
			while (candidates.length && used[candidates.at(-1)!]) candidates.pop();
			if (!candidates.length) return separate;
			next = candidates.pop()!;
		} while (current !== start);
		parts.push('Z'); paths.push(parts.join(' '));
	}
	return { left: weave.leftLobeClip, right: paths.join(' '), joined: true };
}
