/**
 * The painting tools, as operations on cells.
 *
 * Every operation mutates the mask in place and returns the box it changed: the
 * canvas repaints that rectangle instead of pushing 160 KB of pixels for a dab of
 * the pen. Nothing here knows about pointers, canvases or colours — a tool takes
 * mask coordinates and a value, so the same code runs in a test.
 */

import type { Vec } from '$lib/types/heart';
import { clampBox, emptyBox, get, isEmptyBox, unionBox, type Box, type Mask } from './mask';
import { closedPointMaps, type Transform } from './symmetry';

/** What the pen lays down: a radius in cells, and the paper colour it paints. */
export type Brush = { radius: number; value: 0 | 1 };

/** Fill one disc of the brush. Cells are inside when their centre is within the radius. */
export function stampCircle(m: Mask, x: number, y: number, brush: Brush): Box {
	const r = Math.max(0, brush.radius);
	const box = clampBox(m, x - r, y - r, x + r + 1, y + r + 1);
	if (isEmptyBox(box)) return box;
	const r2 = r * r;
	let changed = emptyBox();
	for (let cy = box.y0; cy < box.y1; cy++) {
		const dy = cy - y;
		const row = cy * m.size;
		for (let cx = box.x0; cx < box.x1; cx++) {
			const dx = cx - x;
			if (dx * dx + dy * dy > r2) continue;
			if (m.data[row + cx] === brush.value) continue;
			m.data[row + cx] = brush.value;
			changed = unionBox(changed, { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 });
		}
	}
	return changed;
}

/**
 * Paint from one point to another.
 *
 * Pointer events arrive metres apart when the hand moves fast, so a stroke is
 * discs stamped along the segment. They are stamped one cell apart rather than a
 * brush-width apart: that is gapless for every brush size including the finest,
 * and the cost is a few hundred stamps for a stroke across the whole mask.
 */
export function stroke(m: Mask, from: Vec, to: Vec, brush: Brush): Box {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
	let changed = stampCircle(m, from.x, from.y, brush);
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		changed = unionBox(changed, stampCircle(m, from.x + dx * t, from.y + dy * t, brush));
	}
	return changed;
}

/**
 * The line tool. Identical to a stroke — the difference is in the UI, which shows
 * the line while the visitor drags and commits it on release.
 */
export function line(m: Mask, from: Vec, to: Vec, brush: Brush): Box {
	return stroke(m, from, to, brush);
}

/** Fill the rectangle spanned by two corners, in either order, clipped to the mask. */
export function rect(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box {
	const x0 = Math.round(Math.min(a.x, b.x));
	const y0 = Math.round(Math.min(a.y, b.y));
	const x1 = Math.round(Math.max(a.x, b.x));
	const y1 = Math.round(Math.max(a.y, b.y));
	const box = clampBox(m, x0, y0, x1 + 1, y1 + 1);
	if (isEmptyBox(box)) return box;
	let changed = emptyBox();
	for (let cy = box.y0; cy < box.y1; cy++) {
		const row = cy * m.size;
		for (let cx = box.x0; cx < box.x1; cx++) {
			if (m.data[row + cx] === value) continue;
			m.data[row + cx] = value;
			changed = unionBox(changed, { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 });
		}
	}
	return changed;
}

/**
 * Fill the 4-connected region of equal cells around (x, y).
 *
 * Scanline flood fill, iterative: recursion overflows the stack long before a
 * 400 × 400 region is done, and this pushes one seed per span rather than one per
 * cell, so the stack stays in the hundreds even when the whole mask is filled.
 */
export function floodFill(m: Mask, x: number, y: number, value: 0 | 1): Box {
	const sx = Math.round(x);
	const sy = Math.round(y);
	if (sx < 0 || sy < 0 || sx >= m.size || sy >= m.size) return emptyBox();
	const target = get(m, sx, sy);
	if (target === value) return emptyBox();

	let changed = emptyBox();
	const stack: number[] = [sx, sy];
	while (stack.length) {
		const py = stack.pop()!;
		const px = stack.pop()!;
		const row = py * m.size;
		if (m.data[row + px] !== target) continue;

		let left = px;
		while (left > 0 && m.data[row + left - 1] === target) left--;
		let right = px;
		while (right < m.size - 1 && m.data[row + right + 1] === target) right++;
		for (let i = left; i <= right; i++) m.data[row + i] = value;
		changed = unionBox(changed, { x0: left, y0: py, x1: right + 1, y1: py + 1 });

		for (const ny of [py - 1, py + 1]) {
			if (ny < 0 || ny >= m.size) continue;
			const nrow = ny * m.size;
			let inSpan = false;
			for (let i = left; i <= right; i++) {
				if (m.data[nrow + i] === target) {
					if (!inSpan) {
						stack.push(i, ny);
						inSpan = true;
					}
				} else {
					inSpan = false;
				}
			}
		}
	}
	return changed;
}

/**
 * Copy what the edit painted in `box` to every symmetric position.
 *
 * `transforms` are the generators from `transformsFor`; the copies cover the whole
 * group they generate, so a stroke drawn with transpose and both mirrors on also
 * appears a quarter turn away.
 *
 * `value` is the colour the edit laid down, and it is what makes the mirror line
 * safe. A plain cell-by-cell copy is right only while the box keeps clear of the
 * mirror lines: a stroke drawn across the diagonal lands on its own image, and
 * copying would drag it to one side instead of mirroring it, because the copy reads
 * cells the same copy has just written. Spreading the painted colour along each
 * orbit has no such order: a cell of `value` inside the box hands `value` to its
 * images, everything else is left as it was, and running it twice changes nothing.
 * The eraser is the same operation with `value` 0, which a colour-blind rule could
 * not do — at a mirror line the pen and the eraser want opposite answers from the
 * very same pair of cells.
 *
 * The mask must have been symmetric before the edit, and that requirement is real:
 * `box` is the rectangle a tool changed, not the cells it wrote, and the box of a
 * diagonal stroke is most of the mask — so paint of the same colour laid down
 * earlier and lying inside the box is spread as well. Nothing here can tell the two
 * apart; the tools report a box, and asking them for the cells instead would cost a
 * copy of the box on every pointer batch. So the caller owes the invariant, and the
 * session is where it is paid: `setSymmetry` folds the mask with `symmetrize` when a
 * row is switched on, and `setMask` folds an arriving mask the same way. Switching a
 * row on by assigning `session.symmetry` skips that and breaks this.
 */
export function applySymmetric(m: Mask, box: Box, transforms: Transform[], value: 0 | 1): Box {
	if (isEmptyBox(box) || !transforms.length) return { ...box };
	const maps = closedPointMaps(transforms);
	if (!maps.length) return { ...box };

	// A square symmetry maps a rectangle to a rectangle, so the mapped corners bound
	// each copy, and their union is what the canvas has to repaint.
	let changed: Box = { ...box };
	for (const map of maps) {
		const a = map(box.x0, box.y0, m.size);
		const b = map(box.x1 - 1, box.y1 - 1, m.size);
		changed = unionBox(changed, {
			x0: Math.min(a.x, b.x),
			y0: Math.min(a.y, b.y),
			x1: Math.max(a.x, b.x) + 1,
			y1: Math.max(a.y, b.y) + 1
		});
	}

	for (let y = box.y0; y < box.y1; y++) {
		const row = y * m.size;
		for (let x = box.x0; x < box.x1; x++) {
			if (m.data[row + x] !== value) continue;
			for (const map of maps) {
				const p = map(x, y, m.size);
				m.data[p.y * m.size + p.x] = value;
			}
		}
	}
	return changed;
}
