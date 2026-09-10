import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { createBezierLoopClipper, straightBezier } from './clipBezierLoop';
import { reverseSegments, segmentsToPathData } from './bezierSegments';
import { bezierBBox } from './curves';

const rect = { left: 0, right: 100, top: 0, bottom: 100 };
const polygon = (points: number[][]) => points.map(([x, y], i) => {
	const [xx, yy] = points[(i + 1) % points.length]!;
	return straightBezier({ x: x!, y: y! }, { x: xx!, y: yy! });
});
const pixels = (loops: BezierSegment[][]) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><path d="${loops.filter(p => p.length).map(p => segmentsToPathData(p) + ' Z').join(' ')}" fill="black" fill-rule="evenodd"/></svg>`, { fitTo: { mode: 'width', value: 400 } }).render().pixels;

// An independent scanline oracle samples the original cubics uniformly; it
// neither calls the clipper's roots nor uses the SVG rasterizer's tessellation.
function probeMask(loops: BezierSegment[][]) {
	const polygons = loops.map(loop => loop.flatMap(s => Array.from({ length: 2048 }, (_, i) => {
		const t = i / 2048, u = 1 - t;
		return { x: u*u*u*s.p0.x + 3*u*u*t*s.p1.x + 3*u*t*t*s.p2.x + t*t*t*s.p3.x,
			y: u*u*u*s.p0.y + 3*u*u*t*s.p1.y + 3*u*t*t*s.p2.y + t*t*t*s.p3.y };
	})));
	const result: number[] = [];
	for (let row = 0; row < 47; row++) {
		const y = (row + .38197) * 100 / 47, hits: number[] = [];
		for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
			const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
			if ((a.y > y) !== (b.y > y)) hits.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
		}
		hits.sort((a, b) => a - b);
		for (let col = 0; col < 53; col++) result.push(hits.filter(x => x > (col + .61803) * 100 / 53).length % 2);
	}
	return result;
}

function check(loops: BezierSegment[][]) {
	const original = JSON.stringify(loops), clip = createBezierLoopClipper(rect);
	const clipped = loops.map(clip), before = pixels(loops), after = pixels(clipped);
	let error = 0, stableDrift = 0;
	for (let i = 0; i < before.length; i += 4) {
		const delta = Math.abs(before[i]! - after[i]!);
		error += delta;
		const x = (i / 4) % 400, y = Math.floor(i / 4 / 400);
		if (x < 1 || y < 1 || x >= 399 || y >= 399 || delta <= 1) continue;
		let uniform = before[i] === 0 || before[i] === 255;
		for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (before[i + 4 * (dy * 400 + dx)] !== before[i]) uniform = false;
		if (uniform) stableDrift = Math.max(stableDrift, delta);
	}
	// Clipping long diagonal cubics changes resvg's edge antialiasing. Limit
	// its pixel error, check uniform regions, and separately require exact
	// parity at 2491 off-edge probes against the independent curve oracle.
	expect(error / (255 * before.length / 4)).toBeLessThan(0.002);
	expect(probeMask(clipped)).toEqual(probeMask(loops));
	expect(stableDrift).toBe(0);
	for (const loop of clipped) for (let i = 0; i < loop.length; i++) {
		const s = loop[i]!, b = bezierBBox(s);
		expect(s.p3).toEqual(loop[(i + 1) % loop.length]!.p0);
		expect(Math.min(b.x, b.y)).toBeGreaterThanOrEqual(-1e-9);
		expect(Math.max(b.x + b.width, b.y + b.height)).toBeLessThanOrEqual(100 + 1e-9);
	}
	expect(JSON.stringify(loops)).toBe(original);
	return clipped;
}

describe('closed cubic clipping', () => {
	it('retains an enclosed rectangle even when every original vertex is outside', () => {
		const [result] = check([polygon([[-30, -20], [130, -20], [130, 120], [-30, 120]])]);
		expect(result).toHaveLength(4);
	});

	it('removes disjoint loops and preserves wholly interior curves', () => {
		const inside = polygon([[20, 20], [80, 20], [80, 80], [20, 80]]);
		const [outside, actual] = check([polygon([[-30, -30], [-20, -30], [-20, -20], [-30, -20]]), inside]);
		expect(outside).toEqual([]);
		expect(actual).toEqual(inside);
	});

	it('preserves concave disconnected pieces and holes with retraced boundary connectors', () => {
		const comb = polygon([[-20, -20], [20, -20], [20, 80], [40, 80], [40, -20], [60, -20], [60, 80], [80, 80], [80, -20], [120, -20], [120, 120], [-20, 120]]);
		const hole = polygon([[10, 85], [90, 85], [90, 95], [10, 95]]);
		check([comb, hole]);
		check([reverseSegments(comb), reverseSegments(hole)]);
	});

	it('finds all three crossings of a cubic, rather than testing only its endpoints', () => {
		// x(t) = 100 (t-.2)(t-.5)(t-.8), y(t) = 100t.
		const curve = { p0: { x: -8, y: 0 }, p1: { x: 14, y: 100 / 3 }, p2: { x: -14, y: 200 / 3 }, p3: { x: 8, y: 100 } };
		const loop = [curve, straightBezier(curve.p3, { x: 100, y: 100 }), straightBezier({ x: 100, y: 100 }, { x: 100, y: 0 }), straightBezier({ x: 100, y: 0 }, curve.p0)];
		const [clipped] = check([loop]);
		const cuts = clipped!.flatMap(s => [s.p0, s.p3]).filter(p => p.x === 0).map(p => p.y);
		for (const y of [20, 50, 80]) expect(cuts.some(actual => Math.abs(actual - y) < 1e-9)).toBe(true);
	});

	it('retains a tangency and handles simultaneous corner intersections', () => {
		const tangent = { p0: { x: 25, y: 0 }, p1: { x: -25 / 3, y: 100 / 3 }, p2: { x: -25 / 3, y: 200 / 3 }, p3: { x: 25, y: 100 } };
		check([[tangent, straightBezier(tangent.p3, { x: 120, y: 100 }), straightBezier({ x: 120, y: 100 }, { x: 120, y: 0 }), straightBezier({ x: 120, y: 0 }, tangent.p0)]]);
		check([polygon([[-50, -50], [150, 150], [-50, 150], [150, -50]])]);
	});

	it('reuses bit-identical splits of reversed shared curves across loops', () => {
		const curve = { p0: { x: -20, y: -20 }, p1: { x: 140, y: 30 }, p2: { x: -50, y: 70 }, p3: { x: 120, y: 120 } };
		const loop = [curve, straightBezier(curve.p3, { x: 130, y: -30 }), straightBezier({ x: 130, y: -30 }, curve.p0)];
		const clip = createBezierLoopClipper(rect), a = clip(loop), b = clip(reverseSegments(loop));
		const signature = (s: BezierSegment) => [s.p0, s.p1, s.p2, s.p3].map(p => [p.x, p.y]);
		const canonical = (s: BezierSegment) => [signature(s), signature(s).toReversed()].map(value => JSON.stringify(value)).sort()[0];
		expect(a.map(canonical).sort()).toEqual(b.map(canonical).sort());
		check([loop, reverseSegments(loop)]);
	});

	it('matches independent raster clipping for deterministic curved loops', () => {
		let state = 731;
		const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
		for (let n = 0; n < 12; n++) {
			const points: Vec[] = Array.from({ length: 6 }, () => ({ x: -50 + 200 * random(), y: -50 + 200 * random() }));
			const loop = points.map((p0, i) => ({ p0, p1: { x: -50 + 200 * random(), y: -50 + 200 * random() }, p2: { x: -50 + 200 * random(), y: -50 + 200 * random() }, p3: points[(i + 1) % points.length]! }));
			check([loop]);
		}
	});
});
