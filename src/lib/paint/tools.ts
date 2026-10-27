/**
 * The painting tools, as operations on cells.
 *
 * Every operation mutates the mask in place and returns the box it changed: the
 * canvas repaints that rectangle instead of pushing 160 KB of pixels for a dab of
 * the pen. Nothing here knows about pointers, canvases or colours — a tool takes
 * mask coordinates and a value, so the same code runs in a test.
 */

import type { Vec } from '$lib/types/heart';
import {
	clampBox, createMask, EDGE_BAND, edgeShare, emptyBox, get, growBox, isEmptyBox, levels, MASK_SIZE, paintCell, paintEdge,
	shareAt, unionBox, type Box, type Mask
} from './mask';
import { closedPointMaps, type Transform } from './symmetry';
import type { BrushShape } from './toolset';
import { headReach, sweep } from './brushHead';

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
 * head sweeps the cells within its radius of the segment, a head with straight
 * sides the convex hull of itself at both ends (see `brushHead.ts`). Stamping
 * a dab every cell along the way gives nearly the same cells, but a broad
 * brush (radius 200) then visits each cell of its box hundreds of times over.
 * Each cell within a cell of the shape's edge is told how far it lies from it
 * (`paintEdge`), so the stroke's edge is drawn where the head went and not on
 * the cells' stair.
 */
export function stroke(m: Mask, from: Vec, to: Vec, brush: Brush): Box {
	const r = Math.max(0, brush.radius), swept = sweep(brush.shape, r, from, to), reach = headReach(brush.shape, r);
	const box = clampBox(m, Math.min(from.x, to.x) - reach.x - EDGE_BAND, Math.min(from.y, to.y) - reach.y - EDGE_BAND,
		Math.max(from.x, to.x) + reach.x + EDGE_BAND + 1, Math.max(from.y, to.y) + reach.y + EDGE_BAND + 1);
	if (isEmptyBox(box)) return box;
	const value = brush.value, whole = value * 255, data = m.data, level = levels(m), known = m.validMask, eps = 1e-9;
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	/** One cell `depth` inside the edge (negative outside), deep enough inside or not: whole, or its edge's level. */
	const lay = (x: number, y: number, depth: number, inside: boolean) => {
		const i = y * m.size + x;
		if (depth >= EDGE_BAND) {
			if (data[i] === value && level[i] === whole && (!known || known[i])) return;
			data[i] = value;
			level[i] = whole;
			if (known) known[i] = 1;
		} else if (!paintEdge(m, i, value, depth, inside)) return;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		y1 = y;
	};
	if ('sides' in swept) {
		const sides = swept.sides;
		for (let cy = box.y0; cy < box.y1; cy++) {
			// Along a row each side bounds x on one side, so the cells within the
			// edge's reach, and those deep inside, are each one span of the row.
			let near0 = box.x0, near1 = box.x1 - 1, deep0 = box.x0, deep1 = box.x1 - 1;
			for (const [nx, ny, h] of sides) {
				const c = h - ny * cy;
				if (Math.abs(nx) < eps) {
					if (c <= -EDGE_BAND) near1 = -1;
					if (c < EDGE_BAND) deep1 = -1;
				} else if (nx > 0) {
					near1 = Math.min(near1, Math.floor((c + EDGE_BAND) / nx + 1e-7));
					deep1 = Math.min(deep1, Math.floor((c - EDGE_BAND) / nx - 1e-7));
				} else {
					near0 = Math.max(near0, Math.ceil((c + EDGE_BAND) / nx - 1e-7));
					deep0 = Math.max(deep0, Math.ceil((c - EDGE_BAND) / nx + 1e-7));
				}
			}
			for (let cx = near0; cx <= near1; cx++) {
				if (cx >= deep0 && cx <= deep1) {
					lay(cx, cy, EDGE_BAND, true);
					continue;
				}
				let depth = Infinity;
				for (const [nx, ny, h] of sides) depth = Math.min(depth, h - nx * cx - ny * cy);
				if (depth > -EDGE_BAND) lay(cx, cy, depth, depth >= -eps);
			}
		}
	} else {
		const { a, b, r: rr } = swept, dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
		const r2 = rr * rr, deep2 = rr >= EDGE_BAND ? (rr - EDGE_BAND) ** 2 : -1, far2 = (rr + EDGE_BAND) ** 2;
		for (let cy = box.y0; cy < box.y1; cy++) {
			const py = cy - a.y;
			for (let cx = box.x0; cx < box.x1; cx++) {
				const px = cx - a.x, t = length2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / length2)) : 0;
				const d2 = (px - t * dx) ** 2 + (py - t * dy) ** 2;
				if (d2 >= far2) continue;
				if (d2 <= deep2) lay(cx, cy, EDGE_BAND, true);
				else lay(cx, cy, rr - Math.sqrt(d2), d2 <= r2 + eps);
			}
		}
	}
	return x1 < x0 ? emptyBox() : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * The line tool. Identical to a stroke — the difference is in the UI, which shows
 * the line while the visitor drags and commits it on release.
 */
export function line(m: Mask, from: Vec, to: Vec, brush: Brush): Box {
	return stroke(m, from, to, brush);
}

/**
 * Fill the rectangle spanned by two corners, in either order, clipped to the
 * mask: the cells from the one under the first corner to the one under the
 * second, its sides half a cell beyond their centres.
 */
export function rect(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box {
	const x0 = Math.round(Math.min(a.x, b.x));
	const y0 = Math.round(Math.min(a.y, b.y));
	const x1 = Math.round(Math.max(a.x, b.x));
	const y1 = Math.round(Math.max(a.y, b.y));
	if (x1 < 0 || y1 < 0 || x0 >= m.size || y0 >= m.size) return emptyBox();
	const box = clampBox(m, x0 - EDGE_BAND, y0 - EDGE_BAND, x1 + EDGE_BAND + 1, y1 + EDGE_BAND + 1);
	const changed = growBox();
	for (let cy = box.y0; cy < box.y1; cy++) {
		const row = cy * m.size;
		for (let cx = box.x0; cx < box.x1; cx++) {
			const depth = Math.min(cx - x0, x1 - cx, cy - y0, y1 - cy) + 0.5;
			if (paintEdge(m, row + cx, value, depth, depth > 0)) changed.add(cx, cy);
		}
	}
	return changed.box();
}

/**
 * Fill the ellipse inscribed in the rectangle two corners span, in either
 * order: the cells whose centre lies in it, the corner cells' own halves
 * counted, so a drag one cell wide paints a line as the rectangle does.
 */
export function ellipse(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box {
	const x0 = Math.round(Math.min(a.x, b.x)), x1 = Math.round(Math.max(a.x, b.x));
	const y0 = Math.round(Math.min(a.y, b.y)), y1 = Math.round(Math.max(a.y, b.y));
	if (x1 < 0 || y1 < 0 || x0 >= m.size || y0 >= m.size) return emptyBox();
	const box = clampBox(m, x0 - EDGE_BAND, y0 - EDGE_BAND, x1 + EDGE_BAND + 1, y1 + EDGE_BAND + 1);
	const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 + 0.5, ry = (y1 - y0) / 2 + 0.5;
	const changed = growBox();
	for (let y = box.y0; y < box.y1; y++) {
		const row = y * m.size, v = (y - cy) / ry;
		for (let x = box.x0; x < box.x1; x++) {
			const u = (x - cx) / rx;
			// How far inside the edge, near it: Quílez's estimate, exact for a circle.
			const k0 = Math.hypot(u, v), k1 = Math.hypot(u / rx, v / ry);
			const depth = k1 > 0 ? (k0 * (1 - k0)) / k1 : Math.min(rx, ry);
			if (depth <= -EDGE_BAND || !paintEdge(m, row + x, value, depth, u * u + v * v <= 1 + 1e-9)) continue;
			changed.add(x, y);
		}
	}
	return changed.box();
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
			// Paper of its own colour keeps the edge it has: the fill only observes it.
			if (seen ? observe(m, row + i) : paintCell(m, row + i, value)) { first = Math.min(first, i); last = i; }
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

/** Mark an unknown cell known, its paper as it is; whether it was unknown. */
function observe(m: Mask, index: number): boolean {
	if (!m.validMask || m.validMask[index]) return false;
	m.validMask[index] = 1;
	return true;
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
 * there is one: the selection is then a window onto the same board. Each cell
 * is told how far its centre lies inside its square, so the squares' sides lie
 * where they fall, 400/n cells apart, and not on the nearest cell's side.
 */
export function checks(m: Mask, n: number, fence?: Uint8Array | null): Box {
	const level = levels(m), span = 2 * m.size;
	// A centre's distance to its square's nearest side, in 1/(2n) of a cell:
	// whole numbers, so the board mirrors exactly.
	const inset = (x: number) => {
		const offset = ((2 * x + 1) * n) % span;
		return Math.min(offset, span - offset);
	};
	const changed = growBox();
	for (let y = 0; y < m.size; y++) {
		const row = y * m.size, insetY = inset(y);
		for (let x = 0; x < m.size; x++) {
			const i = row + x;
			if (fence && !fence[i]) continue;
			const value = checkAt(x, y, n, m.size), own = edgeShare(Math.min(inset(x), insetY) / (2 * n), true);
			const share = value ? own : 255 - own;
			if (m.data[i] === value && level[i] === share && (!m.validMask || m.validMask[i])) continue;
			m.data[i] = value;
			level[i] = share;
			if (m.validMask) m.validMask[i] = 1;
			changed.add(x, y);
		}
	}
	return changed.box();
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
 * The edge goes along: where `value` is 1 a cell hands each image the greater
 * of their two levels, where 0 the lesser, so a stroke's edge lies where the
 * stroke's own does in every image, and cells beside the stroke that only had
 * their level moved (see `paintEdge`) move their images' too.
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
	// A cell whole of the other paper has nothing to hand on.
	const nothing = value ? 0 : 255;
	for (let y = box.y0; y < box.y1; y++) {
		const row = y * m.size;
		for (let x = box.x0; x < box.x1; x++) {
			const i = row + x, own = shareAt(m, i);
			if (own === nothing || m.validMask && !m.validMask[i]) continue;
			// A cell of the painted paper makes its images known, as painting them would.
			const painted = m.data[i] === value;
			for (const map of maps) {
				const p = map(x, y, m.size), j = p.y * m.size + p.x, theirs = shareAt(m, j);
				const share = value ? Math.max(own, theirs) : Math.min(own, theirs);
				m.data[j] = share >= 128 ? 1 : 0;
				if (share % 255 || m.level) levels(m)[j] = share;
				if (painted && m.validMask) m.validMask[j] = 1;
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
/** Cleared on the way: the area a moved patch was lifted from, and the cells beside it where only an edge moved. */
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
	const shares = m.level ? Uint8Array.from(before, (_, i) => shareAt(m, i)) : null;
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
				if (m.level) m.level[row + x] = shares![row + x]!;
				for (const map of maps) {
					const p = map(x, y, m.size);
					m.data[p.y * m.size + p.x] = value;
					if (m.validMask && observed) m.validMask[p.y * m.size + p.x] = observed[row + x]!;
					if (m.level) m.level[p.y * m.size + p.x] = shares![row + x]!;
				}
			}
		}
	}
	return changed;
}
