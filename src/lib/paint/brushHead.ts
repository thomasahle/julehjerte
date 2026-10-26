/**
 * The brush's heads as shapes on the mask, about the brush's centre, in cells.
 *
 * Each head is convex, so the pen's stroke (the head slid along a segment) is
 * what `stroke` fills, Udtvær's hold fades out to the head's own rim, and the
 * line tool's preview is the hull of the head at both ends. The heart turns
 * the mask a quarter of a right angle, so a head is named by how it looks on
 * the drawing:
 *
 *   - round: a disc of the radius;
 *   - square: a square along the mask's axes, the strips — a diamond on screen;
 *   - diamond: a square across them, upright on screen, its sides along the
 *     heart's own vertical and horizontal;
 *   - chisel: a flat nib, a bar a quarter as thick as it is long, lying from
 *     lower left to upper right on screen, for thick and thin strokes.
 *
 * Every head holds the disc of its radius, so "Radius: 6 px" is the narrowest
 * a stroke of it comes out in any direction but the chisel's thin one.
 */

import type { Vec } from '$lib/types/heart';
import type { BrushShape } from './toolset';

/** A diamond head's half-diagonal: its sides lie the radius from the centre. */
const DIAMOND = Math.SQRT2;
/** The chisel's half-thickness, as a share of its half-length (the radius). */
const CHISEL = 1 / 4;

/** The chisel's half-thickness at a radius: never thinner than a cell. */
const chiselThickness = (r: number) => Math.max(0.5, r * CHISEL);

/** A half-plane `nx·x + ny·y ≤ h` about the head's centre. */
export type HeadPlane = readonly [nx: number, ny: number, h: number];

/** The half-planes that bound a head, or null for the round one. */
export function headPlanes(shape: BrushShape | undefined, r: number): HeadPlane[] | null {
	if (shape === 'square') return [[1, 0, r], [-1, 0, r], [0, 1, r], [0, -1, r]];
	if (shape === 'diamond') {
		const d = r * DIAMOND;
		return [[1, 1, d], [1, -1, d], [-1, 1, d], [-1, -1, d]];
	}
	if (shape === 'chisel') {
		const t = chiselThickness(r);
		return [[1, 0, t], [-1, 0, t], [0, 1, r], [0, -1, r]];
	}
	return null;
}

/** A head's corners in order round it, for drawing it; null for the round one. */
export function headCorners(shape: BrushShape | undefined, r: number): Vec[] | null {
	if (shape === 'square') return [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
	if (shape === 'diamond') {
		const d = r * DIAMOND;
		return [{ x: 0, y: -d }, { x: d, y: 0 }, { x: 0, y: d }, { x: -d, y: 0 }];
	}
	if (shape === 'chisel') {
		const t = chiselThickness(r);
		return [{ x: -t, y: -r }, { x: t, y: -r }, { x: t, y: r }, { x: -t, y: r }];
	}
	return null;
}

/** How far a head reaches from its centre along each axis. */
export function headReach(shape: BrushShape | undefined, r: number): Vec {
	if (shape === 'diamond') return { x: r * DIAMOND, y: r * DIAMOND };
	if (shape === 'chisel') return { x: chiselThickness(r), y: r };
	return { x: r, y: r };
}

/**
 * How far out in a head a point `dx`, `dy` from its centre lies: 0 at the
 * centre, 1 on the rim. `turned` reads the chisel turned a quarter, as a
 * symmetry that swaps the mask's axes shows it.
 */
export function headGauge(shape: BrushShape | undefined, r: number, dx: number, dy: number, turned = false): number {
	if (r <= 0) return dx || dy ? Infinity : 0;
	const ax = Math.abs(turned ? dy : dx), ay = Math.abs(turned ? dx : dy);
	if (shape === 'square') return Math.max(ax, ay) / r;
	if (shape === 'diamond') return (ax + ay) / (r * DIAMOND);
	if (shape === 'chisel') return Math.max(ax / chiselThickness(r), ay / r);
	return Math.hypot(ax, ay) / r;
}

/**
 * The shape a head sweeps sliding from `from` to `to`, as the corners of a
 * convex polygon in order (the hull of the head at both ends); null for the
 * round head, whose sweep is a capsule.
 */
export function sweptCorners(shape: BrushShape | undefined, r: number, from: Vec, to: Vec): Vec[] | null {
	const corners = headCorners(shape, r);
	if (!corners) return null;
	const points = [...corners.map((c) => ({ x: from.x + c.x, y: from.y + c.y })), ...corners.map((c) => ({ x: to.x + c.x, y: to.y + c.y }))];
	return hull(points);
}

/** The convex hull of a few points, counter-clockwise (Andrew's monotone chain). */
function hull(points: Vec[]): Vec[] {
	const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Vec[] = [], upper: Vec[] = [];
	for (const p of sorted) {
		while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
		lower.push(p);
	}
	for (const p of sorted.reverse()) {
		while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
