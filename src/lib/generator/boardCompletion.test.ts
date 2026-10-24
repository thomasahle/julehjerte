import { describe, it, expect } from 'vitest';
import { completionLegs } from './boardCompletion';
import { BOARD_PATTERNS, WHOLE_PATTERNS } from './boardPatterns';
import type { Edge, Point } from './geometry';

/** The hidden cuts a completion adds, each as one polyline. */
function hiddenCuts(strips: number, radius: number, pattern: (typeof BOARD_PATTERNS)[number]['pattern']): Point[][] {
	const edges: Edge[] = [], cuts: Point[][] = [];
	completionLegs(edges, [], strips, radius, pattern, radius - 6);
	for (const { from, to, family } of edges) {
		if (family !== 'AB') continue;
		const last = cuts.at(-1);
		if (last && Math.hypot(last.at(-1)![0] - from[0], last.at(-1)![1] - from[1]) < 1e-9) last.push(to);
		else cuts.push([from, to]);
	}
	return cuts;
}
const corners = (cut: Point[]) => cut.slice(1, -1).filter((p, i) => {
	const a = [p[0] - cut[i][0], p[1] - cut[i][1]], b = [cut[i + 2][0] - p[0], cut[i + 2][1] - p[1]];
	return (a[0] * b[0] + a[1] * b[1]) / Math.hypot(a[0], a[1]) / Math.hypot(b[0], b[1]) < Math.cos(25 * Math.PI / 180);
}).length;
function apart(a: Point[], b: Point[]): number {
	const to = (p: Point, c: Point, d: Point) => {
		const dx = d[0] - c[0], dy = d[1] - c[1], l = dx * dx + dy * dy;
		const t = l ? Math.max(0, Math.min(1, ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / l)) : 0;
		return Math.hypot(p[0] - c[0] - t * dx, p[1] - c[1] - t * dy);
	};
	let near = Infinity;
	for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++)
		near = Math.min(near, to(a[i - 1], b[j - 1], b[j]), to(a[i], b[j - 1], b[j]), to(b[j - 1], a[i - 1], a[i]), to(b[j], a[i - 1], a[i]));
	return near;
}

describe('board circle completions', () => {
	it('pulls their hidden cuts taut, still apart', () => {
		// Drawn along the stretch of the circle's edge each cuts off, the
		// hidden cuts went round three sides of every white square outside the
		// circle they passed, three or four corners a cut; pulled taut they
		// cross it, and keep as far from each other as they were.
		for (const { strips, lo, hi, pattern } of [...BOARD_PATTERNS, ...WHOLE_PATTERNS]) {
			const cuts = hiddenCuts(strips, (lo + hi) / 2, pattern), label = `${strips} ${lo.toFixed(1)}`;
			expect(cuts.reduce((sum, cut) => sum + corners(cut), 0) / cuts.length, label).toBeLessThanOrEqual(2);
			for (let x = 0; x < cuts.length; x++) for (let y = x + 1; y < cuts.length; y++)
				expect(apart(cuts[x], cuts[y]), `${label} ${x} ${y}`).toBeGreaterThan(.9);
		}
	});
	it('leaves no speck in a hidden cut', () => {
		// At a range's end (nine strips at 35.6, 85%) a step straight in from a
		// switch point and the drawn cut's corner a hair behind it turned the
		// cut back on itself in a 0.014 speck: a needle in both sheets.
		for (const { strips, lo, hi, pattern } of [...BOARD_PATTERNS, ...WHOLE_PATTERNS]) for (const radius of [lo, (lo + hi) / 2, hi])
			for (const cut of hiddenCuts(strips, radius, pattern)) cut.slice(1).forEach((q, i) =>
				expect(Math.hypot(q[0] - cut[i][0], q[1] - cut[i][1]), `${strips} ${radius.toFixed(2)}`).toBeGreaterThan(.05));
	});
	it('never turns a hidden cut back on itself', () => {
		// Two switch points whose chord lay just past the slant allowed from
		// both left straight in and hooked round (nine strips at 90%), and a
		// slanted exit could join a point behind its switch point (at 88%).
		for (const { strips, lo, hi, pattern } of [...BOARD_PATTERNS, ...WHOLE_PATTERNS]) for (const radius of [lo + .01, (lo + hi) / 2, hi - .01])
			for (const cut of hiddenCuts(strips, radius, pattern)) cut.slice(1, -1).forEach((p, i) => {
				const a = [p[0] - cut[i][0], p[1] - cut[i][1]], b = [cut[i + 2][0] - p[0], cut[i + 2][1] - p[1]];
				expect((a[0] * b[0] + a[1] * b[1]) / Math.hypot(a[0], a[1]) / Math.hypot(b[0], b[1]), `${strips} ${radius.toFixed(2)}`)
					.toBeGreaterThan(Math.cos(135 * Math.PI / 180));
			});
	});
});
