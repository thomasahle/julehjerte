/**
 * Where the mask sits on screen.
 *
 * The mask is the woven square, and the visitor paints on the heart — so the
 * square is drawn turned a quarter of a right angle, with a lobe hanging off
 * two of its edges, exactly as `PaperHeartSVG` turns a finished heart. One
 * transform describes that, and both directions of it are needed: the canvas
 * draws through it, and every pointer event comes back through it to find the
 * cell under the finger.
 *
 * Square units run 0…1 across the woven square, so nothing here knows the mask's
 * resolution; `toMask` multiplies at the end. Keeping the transform in one
 * matrix is also what would make zoom and pan (PAINT.md §2, not this version) a
 * change to two numbers rather than to every drawing call.
 */

/** cos 45° = sin 45°, the whole rotation in one number. */
const R = Math.SQRT1_2;

/**
 * The heart's outline in square units, relative to the square's centre.
 *
 * The square's corners land at distance √½ straight up, right, down and left
 * (the top cleft, and the bottom tip). Each lobe is a half-disc of radius ½ on
 * the far side of one edge, and turning moves its centre to distance ½ diagonally
 * up-left and up-right — so the two lobes reach ½ + √½⁄2 out to each side and up,
 * and the bottom tip is the lowest point.
 */
export const HEART_BOUNDS = {
	minX: -(0.5 + R / 2),
	maxX: 0.5 + R / 2,
	minY: -(0.5 + R / 2),
	maxY: R
};

export const HEART_WIDTH = HEART_BOUNDS.maxX - HEART_BOUNDS.minX;
export const HEART_HEIGHT = HEART_BOUNDS.maxY - HEART_BOUNDS.minY;

/** Screen pixels per square unit, and where the square's centre lands. */
export type HeartLayout = { scale: number; cx: number; cy: number };

/** A point, in whichever frame the function that returns it says. */
export type Pt = { x: number; y: number };

/** The largest heart that fits in a `width` × `height` box, with `padding` to spare. */
export function fitHeart(width: number, height: number, padding = 0): HeartLayout {
	const usableW = Math.max(1, width - 2 * padding);
	const usableH = Math.max(1, height - 2 * padding);
	const scale = Math.min(usableW / HEART_WIDTH, usableH / HEART_HEIGHT);
	// The heart is not centred on the square: it reaches further up (two lobes)
	// than down (one tip), so the square's centre sits below the box's.
	const centreOffsetY = (HEART_BOUNDS.minY + HEART_BOUNDS.maxY) / 2;
	return { scale, cx: width / 2, cy: height / 2 - scale * centreOffsetY };
}

/** A point of the square (0…1 in each axis) in screen pixels. */
export function toScreen(layout: HeartLayout, u: number, v: number): Pt {
	const dx = u - 0.5;
	const dy = v - 0.5;
	return {
		x: layout.cx + layout.scale * (R * dx - R * dy),
		y: layout.cy + layout.scale * (R * dx + R * dy)
	};
}

/** A screen point in square units — 0…1 inside the woven square, outside it beyond. */
export function toSquare(layout: HeartLayout, x: number, y: number): Pt {
	const rx = (x - layout.cx) / layout.scale;
	const ry = (y - layout.cy) / layout.scale;
	return { x: R * rx + R * ry + 0.5, y: -R * rx + R * ry + 0.5 };
}

/**
 * A screen point as mask cell coordinates, which the tools take.
 *
 * Not rounded and not clipped: a stroke is drawn between two such points, and
 * cutting it off at the edge would bend the line the visitor drew. The caller
 * asks `insideSquare` when it needs to know whether the pointer is on the mask
 * at all.
 */
export function toMask(layout: HeartLayout, size: number, x: number, y: number): Pt {
	const p = toSquare(layout, x, y);
	return { x: p.x * size, y: p.y * size };
}

/** Whether mask coordinates fall on a cell of a `size` × `size` mask. */
export function insideSquare(p: Pt, size: number): boolean {
	return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}
