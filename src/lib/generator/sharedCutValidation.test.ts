import { expect, it } from 'vitest';
import { createSharedCutValidator } from './sharedCutValidation';
import type { Edge, Point, Ring } from './geometry';

const shared = (from: Point, to: Point): Edge => ({ from, to, family: 'AB', kind: 'shared' });
const square: Ring = [[10, 10], [20, 10], [20, 20], [10, 20]];

it('rejects outline crossings and crossing shared cuts, while allowing outline attachments', () => {
	const clear = createSharedCutValidator([square]);
	expect(clear([shared([0, 15], [10, 15])])).toBe(true);
	expect(clear([shared([0, 15], [15, 15])])).toBe(false);
	expect(clear([shared([0, 0], [9, 9]), shared([0, 9], [9, 0])])).toBe(false);
	expect(clear([shared([0, 0], [5, 5]), shared([5, 5], [9, 0])])).toBe(true);
});

it('keeps endpoint tolerance when a connection lies just beyond an obstacle bounding box', () => {
	// The legacy intersection test includes the tiny extension past this edge.
	const clear = createSharedCutValidator([[[10, 0], [10, 10]]]);
	expect(clear([shared([0, 10 + 5e-7], [20, 10 + 5e-7])])).toBe(false);
	expect(clear([shared([0, 10 + 2e-6], [20, 10 + 2e-6])])).toBe(true);
});

it('matches the unpruned intersection rule for varied outlines and connections', () => {
	const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
	const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
	const intersects = (a: Point, b: Point, c: Point, d: Point) => {
		const u = sub(b, a), v = sub(d, c), det = cross(u, v);
		if (Math.abs(det) < 1e-7) return false;
		const t = cross(sub(c, a), v) / det, s = cross(sub(c, a), u) / det;
		return t > 1e-7 && t < 1 - 1e-7 && s >= -1e-7 && s <= 1 + 1e-7;
	};
	let seed = 72349;
	const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
	const point = (): Point => [random() * 100, random() * 100];
	let accepted = 0;
	for (let i = 0; i < 200; i++) {
		const centre = point();
		const contours: Ring[] = [Array.from({ length: 5 }, (_, j): Point =>
			[centre[0] + 8 * Math.cos(j * Math.PI * .4), centre[1] + 8 * Math.sin(j * Math.PI * .4)])];
		const edges = Array.from({ length: 1 + i % 3 }, () => shared(point(), point()));
		const expected = edges.every((edge, j) =>
			contours.every(ring => ring.every((p, k) => !intersects(edge.from, edge.to, p, ring[(k + 1) % ring.length]))) &&
			edges.slice(j + 1).every(other => !intersects(edge.from, edge.to, other.from, other.to)));
		expect(createSharedCutValidator(contours)(edges)).toBe(expected);
		if (expected) accepted++;
	}
	expect(accepted).toBeGreaterThan(20);
	expect(accepted).toBeLessThan(180);
});
