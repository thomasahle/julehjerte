/**
 * The painting tools, as operations on cells.
 *
 * Every operation mutates the mask in place and returns the box it changed: the
 * canvas repaints that rectangle instead of pushing 160 KB of pixels for a dab of
 * the pen. Nothing here knows about pointers, canvases or colours — a tool takes
 * mask coordinates and a value, so the same code runs in a test.
 */

import type { Vec } from '$lib/types/heart';
import { clampBox, createMask, emptyBox, get, isEmptyBox, MASK_SIZE, paintCell, unionBox, type Box, type Mask } from './mask';
import { closedPointMaps, type Transform } from './symmetry';
import type { BrushShape } from './toolset';
import { headPlanes, headReach } from './brushHead';

/**
 * What the pen lays down: a radius in cells, the paper colour it paints, and
 * its head — round unless it says otherwise (see `brushHead.ts`).
 */
export type Brush = { radius: number; value: 0 | 1; shape?: BrushShape };

/**
 * Fill one dab of the brush: the cells whose centre lies in its head, placed
 * at the point.
 */
export function stamp(m: Mask, x: number, y: number, brush: Brush): Box {
	return stroke(m, { x, y }, { x, y }, brush);
}

/**
 * Paint from one point to another: every cell the brush's head passes over as
 * it slides along the segment, so the stroke is gapless however fast the hand
 * moved between two pointer events.
 *
 * The swept shape is filled in one pass over its box, a cell at a time: a round
 * head sweeps the cells within its radius of the segment; a head with straight
 * sides (a convex polygon, its half-planes) the cells it holds at some one point
 * of the segment, which each half-plane narrows to an interval of the way
 * along. Stamping a dab every cell along the way gives nearly the same cells,
 * but a broad brush (radius 200) then visits each cell of its box hundreds of
 * times over.
 */
export function stroke(m: Mask, from: Vec, to: Vec, brush: Brush): Box {
	const r = Math.max(0, brush.radius), planes = headPlanes(brush.shape, r), reach = headReach(brush.shape, r);
	const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
	const box = clampBox(m, Math.min(from.x, to.x) - reach.x, Math.min(from.y, to.y) - reach.y, Math.max(from.x, to.x) + reach.x + 1, Math.max(from.y, to.y) + reach.y + 1);
	if (isEmptyBox(box)) return box;
	const r2 = r * r, eps = 1e-9;
	let changed = emptyBox();
	for (let cy = box.y0; cy < box.y1; cy++) {
		const py = cy - from.y, row = cy * m.size;
		for (let cx = box.x0; cx < box.x1; cx++) {
			const px = cx - from.x;
			if (planes) {
				// The head at t along the way holds the cell where n·p − t·n·d ≤ h for each side.
				let lo = 0, hi = 1;
				for (const [nx, ny, h] of planes) {
					const a = nx * dx + ny * dy, c = nx * px + ny * py - h;
					if (Math.abs(a) < eps) {
						if (c > eps) hi = -1;
					} else if (a > 0) lo = Math.max(lo, c / a);
					else hi = Math.min(hi, c / a);
				}
				if (lo > hi + eps) continue;
			} else {
				const t = length2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / length2)) : 0;
				if ((px - t * dx) ** 2 + (py - t * dy) ** 2 > r2 + eps) continue;
			}
			if (!paintCell(m, row + cx, brush.value)) continue;
			changed = unionBox(changed, { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 });
		}
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
			if (!paintCell(m, row + cx, value)) continue;
			changed = unionBox(changed, { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 });
		}
	}
	return changed;
}

/**
 * Fill the ellipse inscribed in the rectangle two corners span, in either
 * order: the cells whose centre lies in it, the corner cells' own halves
 * counted, so a drag one cell wide paints a line as the rectangle does.
 */
export function ellipse(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box {
	const x0 = Math.round(Math.min(a.x, b.x)), x1 = Math.round(Math.max(a.x, b.x));
	const y0 = Math.round(Math.min(a.y, b.y)), y1 = Math.round(Math.max(a.y, b.y));
	const box = clampBox(m, x0, y0, x1 + 1, y1 + 1);
	if (isEmptyBox(box)) return box;
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
	let changed = emptyBox();
	for (let y = box.y0; y < box.y1; y++) {
		const row = y * m.size, v = (y - cy) / ry;
		for (let x = box.x0; x < box.x1; x++) {
			const u = (x - cx) / rx;
			if (u * u + v * v > 1 + 1e-9) continue;
			if (!paintCell(m, row + x, value)) continue;
			changed = unionBox(changed, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
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
 *
 * With a `fence` (one byte per cell, the visitor's selection), cells outside it
 * are walls: the fill stays in the part of its region that is selected, and
 * does not leak out of the selection and back in somewhere else.
 */
export function floodFill(m: Mask, x: number, y: number, value: 0 | 1, fence?: Uint8Array | null): Box {
	const sx = Math.round(x);
	const sy = Math.round(y);
	if (sx < 0 || sy < 0 || sx >= m.size || sy >= m.size) return emptyBox();
	if (fence && !fence[sy * m.size + sx]) return emptyBox();
	const target = get(m, sx, sy);
	if (target === value && (!m.validMask || m.validMask.every(Boolean))) return emptyBox();
	// Same-colour fill still observes missing cells. Colour cannot mark visited
	// spans in that case, so track them separately to avoid cycling forever.
	const seen = target === value ? new Uint8Array(m.data.length) : null;
	const open = (i: number) => m.data[i] === target && !seen?.[i] && (!fence || !!fence[i]);

	let changed = emptyBox();
	const stack: number[] = [sx, sy];
	while (stack.length) {
		const py = stack.pop()!;
		const px = stack.pop()!;
		const row = py * m.size;
		if (!open(row + px)) continue;

		let left = px;
		while (left > 0 && open(row + left - 1)) left--;
		let right = px;
		while (right < m.size - 1 && open(row + right + 1)) right++;
		let first = right + 1, last = left - 1;
		for (let i = left; i <= right; i++) {
			if (paintCell(m, row + i, value)) { first = Math.min(first, i); last = i; }
			if (seen) seen[row + i] = 1;
		}
		if (first <= last) changed = unionBox(changed, { x0: first, y0: py, x1: last + 1, y1: py + 1 });

		for (const ny of [py - 1, py + 1]) {
			if (ny < 0 || ny >= m.size) continue;
			const nrow = ny * m.size;
			let inSpan = false;
			for (let i = left; i <= right; i++) {
				if (open(nrow + i)) {
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
 * Which paper cell (x, y) of an `n` × `n` checkerboard is: a plain woven heart
 * of `n` strips, its corner squares the left paper as in a classic 3 × 3. A
 * cell belongs to the square its centre lies in. On the 400-cell mask no
 * square's edge passes through a centre unless 32 divides `n`, so the squares
 * mirror exactly.
 */
export function checkAt(x: number, y: number, n: number, size: number): 0 | 1 {
	return ((Math.floor((x + .5) * n / size) + Math.floor((y + .5) * n / size)) & 1) as 0 | 1;
}

/**
 * The board Mal starts on and Ryd goes back to: a plain woven heart of five
 * strips, never an empty mask (the owner's choice, 2026-10-26).
 */
export const DEFAULT_CHECKS = 5;

/** A mask holding the board Mal starts on (see `DEFAULT_CHECKS`). */
export function defaultMask(size: number = MASK_SIZE): Mask {
	const m = createMask(0, size);
	checks(m, DEFAULT_CHECKS);
	return m;
}

/** Whether a mask is still the board Mal starts on, every cell known and untouched. */
export function isDefaultMask(m: Mask): boolean {
	for (let y = 0; y < m.size; y++)
		for (let x = 0; x < m.size; x++) {
			const i = y * m.size + x;
			if (m.data[i] !== checkAt(x, y, DEFAULT_CHECKS, m.size) || (m.validMask && !m.validMask[i])) return false;
		}
	return true;
}

/**
 * Lay an `n` × `n` checkerboard over the mask (Tern), inside `fence` only when
 * there is one: the selection is then a window onto the same board.
 */
export function checks(m: Mask, n: number, fence?: Uint8Array | null): Box {
	let changed = emptyBox();
	for (let y = 0; y < m.size; y++) {
		const row = y * m.size;
		let x0 = m.size, x1 = -1;
		for (let x = 0; x < m.size; x++) {
			if (fence && !fence[row + x]) continue;
			if (!paintCell(m, row + x, checkAt(x, y, n, m.size))) continue;
			x0 = Math.min(x0, x);
			x1 = x;
		}
		if (x1 >= x0) changed = unionBox(changed, { x0, y0: y, x1: x1 + 1, y1: y + 1 });
	}
	return changed;
}

/**
 * Whether an `n` × `n` checkerboard is its own image under every symmetry on.
 * Not for even `n` under a mirror within the lobe: a mirror carries an even
 * board's corner square onto the opposite corner, which is the other paper.
 */
export function checksKeepSymmetry(n: number, transforms: Transform[]): boolean {
	const maps = closedPointMaps(transforms);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++)
			for (const map of maps) {
				const p = map(x, y, n);
				if (checkAt(p.x, p.y, n, n) !== checkAt(x, y, n, n)) return false;
			}
	return true;
}

/** A point map of the closed symmetry group, as `closedPointMaps` hands them out. */
type PointMap = (x: number, y: number, size: number) => { x: number; y: number };

/**
 * The box and all its images — what the canvas has to repaint after a spread.
 *
 * A square symmetry maps a rectangle to a rectangle, so the mapped corners bound
 * each copy and their union bounds the lot.
 */
function imagesOf(m: Mask, box: Box, maps: PointMap[]): Box {
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
 * Painting the left paper is the same operation with `value` 0, which a colour-blind
 * rule could not do — at a mirror line the two papers want opposite answers from the
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

	const changed = imagesOf(m, box, maps);

	for (let y = box.y0; y < box.y1; y++) {
		const row = y * m.size;
		for (let x = box.x0; x < box.x1; x++) {
			if (m.data[row + x] !== value || m.validMask && !m.validMask[row + x]) continue;
			for (const map of maps) {
				const p = map(x, y, m.size);
				paintCell(m, p.y * m.size + p.x, value);
			}
		}
	}
	return changed;
}

/**
 * How an edit that lays down both papers at once marks the cells it wrote, for
 * `applySymmetricEdit` to spread: one byte per mask cell.
 *
 * A stroke is one colour, so `applySymmetric` can find its cells by their value.
 * Moving a patch of mask is not: it clears the area the cells came from and lays
 * down cells of either colour where they landed, and where a mirror line runs
 * between the two, one orbit is claimed twice — by the hole and by the patch.
 * The marks say which claim wins.
 */
export const EDIT_NONE = 0;
/** Cleared on the way: the area a moved patch was lifted from. */
export const EDIT_CLEARED = 1;
/** Laid down: the patch itself. This wins where the two mirror onto each other. */
export const EDIT_LAID = 2;

/** The order the layers are spread in; the last one written is the one that shows. */
const EDIT_LAYERS = [EDIT_CLEARED, EDIT_LAID];

/**
 * Spread an edit that laid down both papers at once under the active symmetries.
 *
 * Every marked cell hands its value to its whole orbit, in layer order, and every
 * value is read from a copy of the mask taken before any of it is written. Both
 * halves matter, and a patch dragged onto its own reflection is where:
 *
 *  - Reading the mask as it is written mirrors the hole over the cells the patch
 *    has just laid down, and a second pass then finds nothing left to restore —
 *    a single drag can blank the whole drawing that way.
 *  - Marking only the cells whose value actually changed leaves a patch that
 *    landed on cells already holding its own colours out of the spread, so the
 *    hole wins there by default.
 *
 * The mask must have been symmetric under `transforms` before the edit, exactly
 * as `applySymmetric` requires and for the same reason: the cells outside the
 * marks are assumed to already agree with their images.
 */
export function applySymmetricEdit(
	m: Mask,
	box: Box,
	marks: Uint8Array,
	transforms: Transform[]
): Box {
	if (isEmptyBox(box) || !transforms.length) return { ...box };
	const maps = closedPointMaps(transforms);
	if (!maps.length) return { ...box };

	const changed = imagesOf(m, box, maps);
	const before = m.data.slice(), observed = m.validMask?.slice();
	for (const layer of EDIT_LAYERS) {
		for (let y = box.y0; y < box.y1; y++) {
			const row = y * m.size;
			for (let x = box.x0; x < box.x1; x++) {
				if (marks[row + x] !== layer) continue;
				const value = before[row + x]!;
				// The cell itself as well as its images: the layer below may have
				// mirrored its own value over this very cell a moment ago.
				m.data[row + x] = value;
				if (m.validMask && observed) m.validMask[row + x] = observed[row + x]!;
				if (m.level) m.level[row + x] = value * 255;
				for (const map of maps) {
					const p = map(x, y, m.size);
					m.data[p.y * m.size + p.x] = value;
					if (m.validMask && observed) m.validMask[p.y * m.size + p.x] = observed[row + x]!;
					if (m.level) m.level[p.y * m.size + p.x] = value * 255;
				}
			}
		}
	}
	return changed;
}
