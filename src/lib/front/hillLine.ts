/**
 * The hill line the front page's gallery follows (docs/redesign/GALLERY-CURVE.md):
 * the top edge of the landscape drawing's `snow-field` layer, in the drawing's
 * own units (2172 x 724, see $lib/landscape).
 *
 * Pure geometry, free of the DOM: the gallery measures the landscape's rect
 * and its own cards and chips, and asks this module how far down each one has
 * to go to sit on the curve.
 */
import { LANDSCAPE_WIDTH } from '$lib/landscape';

/** The `snow-field` path's top edge, as drawn in $lib/assets/landscape.svg. */
export const HILL_PATH =
	'M0 523 C267 481 476 493 681 533 C870 569 1025 612 1220 601 C1457 593 1679 514 1909 508 C2033 502 2114 511 2172 519';

/** How far below the hill line a chip's top sits, in px. */
export const CHIP_GAP = 4;

/** How far below `hillTop` the first row of cards starts, in px. */
export const CARD_GAP = 6;

/** The extra drop of a card whose centre lies under the chip row, in px. */
export const UNDER_CHIPS = 54;

type Point = readonly [x: number, y: number];
type Segment = readonly [Point, Point, Point, Point];

/** HILL_PATH as cubic segments: one move-to followed by absolute `C`s only. */
function parseHillPath(d: string): Segment[] {
	const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
	if (!/^M[\d\s.-]+(C[\d\s.-]+)+$/.test(d.trim()) || (numbers.length - 2) % 6 !== 0) {
		throw new Error(`Not a move-to followed by cubic curves: ${d}`);
	}
	const segments: Segment[] = [];
	let start: Point = [numbers[0], numbers[1]];
	for (let i = 2; i < numbers.length; i += 6) {
		const c1: Point = [numbers[i], numbers[i + 1]];
		const c2: Point = [numbers[i + 2], numbers[i + 3]];
		const end: Point = [numbers[i + 4], numbers[i + 5]];
		segments.push([start, c1, c2, end]);
		start = end;
	}
	return segments;
}

/**
 * Every segment's x is monotonic in t (its control points' x increase), which
 * is what lets hillY() solve for t by bisection.
 */
export const HILL_SEGMENTS = parseHillPath(HILL_PATH);

/** One coordinate of a cubic Bézier at t. */
export function cubic(a: number, b: number, c: number, d: number, t: number): number {
	const u = 1 - t;
	return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** The parameter t at which the segment reaches x, by bisection. */
function solveT(segment: Segment, x: number): number {
	const [p0, p1, p2, p3] = segment;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (cubic(p0[0], p1[0], p2[0], p3[0], mid) < x) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

function segmentAt(x: number): Segment {
	return (
		HILL_SEGMENTS.find((segment) => x <= segment[3][0]) ?? HILL_SEGMENTS[HILL_SEGMENTS.length - 1]
	);
}

/**
 * x folded into the drawing: past its right edge the scene shows the drawing's
 * mirror image (Scene.svelte), so the line there is the line at 2W - x. Left of
 * 0 and past the mirror the line stays level at its end value.
 */
export function foldX(x: number): number {
	const mirrored = x > LANDSCAPE_WIDTH ? 2 * LANDSCAPE_WIDTH - x : x;
	return Math.min(Math.max(mirrored, 0), LANDSCAPE_WIDTH);
}

/** The hill line's y at x, both in drawing units; see foldX for x outside the drawing. */
export function hillY(x: number): number {
	const clamped = foldX(x);
	const segment = segmentAt(clamped);
	const t = solveT(segment, clamped);
	const [p0, p1, p2, p3] = segment;
	return cubic(p0[1], p1[1], p2[1], p3[1], t);
}

/** Real roots in (0, 1) of a t^2 + b t + c. */
function rootsInUnit(a: number, b: number, c: number): number[] {
	let roots: number[];
	if (Math.abs(a) < 1e-12) roots = Math.abs(b) < 1e-12 ? [] : [-c / b];
	else {
		const disc = b * b - 4 * a * c;
		if (disc < 0) return [];
		const s = Math.sqrt(disc);
		roots = [(-b + s) / (2 * a), (-b - s) / (2 * a)];
	}
	return roots.filter((t) => t > 0 && t < 1);
}

/**
 * The highest point (smallest y) of the hill line between x0 and x1, in
 * drawing units: the ends of the range and every turning point of y inside it.
 */
export function hillTopBetween(x0: number, x1: number): number {
	const lo = Math.min(x0, x1);
	const hi = Math.max(x0, x1);
	// A range reaching into the mirror image: its two halves, folded.
	if (hi > LANDSCAPE_WIDTH) {
		const mirrored = hillTopWithin(foldX(hi), foldX(Math.max(lo, LANDSCAPE_WIDTH)));
		return lo >= LANDSCAPE_WIDTH ? mirrored : Math.min(mirrored, hillTopWithin(lo, LANDSCAPE_WIDTH));
	}
	return hillTopWithin(lo, hi);
}

function hillTopWithin(x0: number, x1: number): number {
	const from = Math.min(Math.max(Math.min(x0, x1), 0), LANDSCAPE_WIDTH);
	const to = Math.min(Math.max(Math.max(x0, x1), 0), LANDSCAPE_WIDTH);
	let top = Math.min(hillY(from), hillY(to));
	for (const segment of HILL_SEGMENTS) {
		const [p0, p1, p2, p3] = segment;
		if (p3[0] < from || p0[0] > to) continue;
		// y'(t)/3 = a t^2 + b t + c
		const [y0, y1, y2, y3] = [p0[1], p1[1], p2[1], p3[1]];
		const a = -y0 + 3 * y1 - 3 * y2 + y3;
		const b = 2 * (y0 - 2 * y1 + y2);
		const c = y1 - y0;
		for (const t of rootsInUnit(a, b, c)) {
			const x = cubic(p0[0], p1[0], p2[0], p3[0], t);
			if (x >= from && x <= to) top = Math.min(top, cubic(y0, y1, y2, y3, t));
		}
	}
	return top;
}

/** Where the landscape drawing is on the page: its rendered rect, in page px. */
export interface LandRect {
	left: number;
	top: number;
	width: number;
}

/** Page px per drawing unit. */
function landScale(land: LandRect): number {
	return land.width / LANDSCAPE_WIDTH;
}

/** A page x in drawing units. */
export function toUnitsX(pageX: number, land: LandRect): number {
	return (pageX - land.left) / landScale(land);
}

/** A drawing y in page px. */
export function toPageY(yUnits: number, land: LandRect): number {
	return land.top + yUnits * landScale(land);
}

/** The hill line's page y under a page x. */
export function hillPageY(pageX: number, land: LandRect): number {
	return toPageY(hillY(toUnitsX(pageX, land)), land);
}

/** `hillTop`: the hill line's highest page y between two page xs (the content column). */
export function hillTopPage(pageX0: number, pageX1: number, land: LandRect): number {
	return toPageY(hillTopBetween(toUnitsX(pageX0, land), toUnitsX(pageX1, land)), land);
}

/** How far down a chip centred at pageX moves to sit CHIP_GAP under the line. */
export function chipLift(pageX: number, land: LandRect, hillTop: number): number {
	return hillPageY(pageX, land) + CHIP_GAP - hillTop;
}

/**
 * A first-row card's `margin-top`: the drop from the flat row at
 * `hillTop + CARD_GAP` to the hill under its centre, plus UNDER_CHIPS when that
 * centre lies under the chip row's horizontal span.
 */
export function cardDrop(
	pageX: number,
	land: LandRect,
	hillTop: number,
	chipSpan: readonly [left: number, right: number] | null
): number {
	const underChips = chipSpan !== null && pageX >= chipSpan[0] && pageX <= chipSpan[1];
	return hillPageY(pageX, land) - hillTop + (underChips ? UNDER_CHIPS : 0);
}
