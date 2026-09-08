/**
 * A heart, drawn as a mask.
 *
 * This is the "Mal på hjertet" direction: strips in, cells out. It must draw
 * exactly what the site draws, so it takes the same `computeWeaveData` the SVG
 * renderer takes and fills the same shapes under the same even-odd rule — a base
 * of the left colour (0) with the union of every strip on top (1), inside the
 * overlap rectangle. Sampling the finished SVG would need a browser; this is
 * plain arithmetic, so it runs in a test and in a worker.
 */

import type { BezierSegment, HeartDesign } from '$lib/types/heart';
import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { createMask, MASK_SIZE, type Mask } from './mask';

/** How far a flattened curve may stray from the true one, in mask cells. */
const FLATNESS_CELLS = 0.25;

/** One edge of a flattened outline, in the design's pixel frame. */
type Edge = { x0: number; y0: number; x1: number; y1: number };

/**
 * How many straight pieces a cubic needs to stay within `tolerance`.
 *
 * The error of an n-piece flattening is at most 3·D/(4n²), where D is the larger
 * of the two second differences of the control points, so the count follows in
 * closed form — no subdivision, no allocation per piece.
 */
function flatteningSteps(seg: BezierSegment, tolerance: number): number {
	const ax = seg.p0.x - 2 * seg.p1.x + seg.p2.x;
	const ay = seg.p0.y - 2 * seg.p1.y + seg.p2.y;
	const bx = seg.p1.x - 2 * seg.p2.x + seg.p3.x;
	const by = seg.p1.y - 2 * seg.p2.y + seg.p3.y;
	const d = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
	if (d <= 0) return 1;
	return Math.max(1, Math.ceil(Math.sqrt((3 * d) / (4 * tolerance))));
}

function pointOnCubic(seg: BezierSegment, t: number): { x: number; y: number } {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * seg.p0.x + b * seg.p1.x + c * seg.p2.x + d * seg.p3.x,
		y: a * seg.p0.y + b * seg.p1.y + c * seg.p2.y + d * seg.p3.y
	};
}

/** Turn one closed strip outline into edges, closing it back to its first point. */
function outlineToEdges(pathData: string, tolerance: number, out: Edge[]): void {
	const segments = parsePathDataToSegments(pathData);
	if (!segments.length) return;
	let from = segments[0]!.p0;
	const first = from;
	for (const seg of segments) {
		const steps = flatteningSteps(seg, tolerance);
		for (let i = 1; i <= steps; i++) {
			const to = i === steps ? seg.p3 : pointOnCubic(seg, i / steps);
			out.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y });
			from = to;
		}
	}
	if (from.x !== first.x || from.y !== first.y) {
		out.push({ x0: from.x, y0: from.y, x1: first.x, y1: first.y });
	}
}

/**
 * The heart's weave as a `size` × `size` mask of the overlap rectangle.
 *
 * Cells are sampled at their centres with an even-odd scanline: a cell is 1 when
 * an odd number of strip outlines lie to its left, which is exactly the fill rule
 * the SVG uses to make the checkerboard.
 */
export function rasterizeDesign(design: HeartDesign, size: number = MASK_SIZE): Mask {
	const mask = createMask(0, size);
	if (!design.fingers.length || size <= 0) return mask;

	const weave = computeWeaveData(design.fingers, design.gridSize, (design.weaveParity ?? 0) as 0 | 1);
	const { left, top, width, height } = weave.overlap;
	if (!(width > 0) || !(height > 0)) return mask;

	const cellW = width / size;
	const cellH = height / size;
	const tolerance = FLATNESS_CELLS * Math.min(cellW, cellH);

	const edges: Edge[] = [];
	for (const strip of [...weave.rightOnTopStrips, ...weave.leftOnTopStrips]) {
		outlineToEdges(strip.pathData, tolerance, edges);
	}
	if (!edges.length) return mask;

	const crossings: number[] = [];
	for (let py = 0; py < size; py++) {
		const y = top + (py + 0.5) * cellH;
		crossings.length = 0;
		for (const e of edges) {
			// Half-open in y: an edge counts when it straddles the scanline, so a
			// vertex sitting exactly on it is counted once, not twice or never.
			if ((e.y0 <= y) === (e.y1 <= y)) continue;
			crossings.push(e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0));
		}
		if (crossings.length < 2) continue;
		crossings.sort((a, b) => a - b);
		const row = py * size;
		for (let i = 0; i + 1 < crossings.length; i += 2) {
			// Cell centres are at left + (px + 0.5) · cellW, so a span [a, b) covers
			// the cells from ceil((a - left)/cellW - 0.5) up to the same for b.
			const from = Math.max(0, Math.ceil((crossings[i]! - left) / cellW - 0.5));
			const to = Math.min(size, Math.ceil((crossings[i + 1]! - left) / cellW - 0.5));
			for (let px = from; px < to; px++) mask.data[row + px] = 1;
		}
	}
	return mask;
}
