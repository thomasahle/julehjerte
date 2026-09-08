/**
 * Markér: a rectangle of cells lifted off the mask, then moved, scaled and turned.
 *
 * The mask itself is untouched while a selection floats — everything here works on
 * the copy in `Selection.cells` and on a `Placement`, which is where that copy
 * stands now. That is what makes Escape free (there is nothing to put back) and
 * undo one snapshot per commit rather than one per drag: only `commit` writes.
 *
 * Resampling is nearest-neighbour, and it has to be: the mask is two colours, and
 * an interpolating turn would invent greys that neither paper explains. The
 * mapping runs backwards — every destination cell asks which source cell its
 * centre falls in — so a turn or an enlargement leaves no holes, which a forward
 * scatter would.
 *
 * Nothing here knows about pointers, canvases or symmetry; `MaskCanvas` turns
 * pointer positions into cells and spreads the committed box under the active
 * transforms, exactly as it does for the pen.
 */

import type { Vec } from '$lib/types/heart';
import { clampBox, emptyBox, isEmptyBox, unionBox, type Box, type Mask } from './mask';
import { EDIT_CLEARED, EDIT_LAID, rect } from './tools';

/** Half-open cell rectangle, `x0 <= x < x1`, in the same coordinates as `Box`. */
export type CellRect = Box;

/**
 * Where a lifted patch stands: the centre of its rectangle in cells, how wide and
 * tall that rectangle is now, and how far it has been turned clockwise on screen
 * (the mask's y runs down, so a positive angle turns the way the handle is dragged).
 */
export type Placement = { cx: number; cy: number; width: number; height: number; angle: number };

export type Selection = {
	/** The rectangle the cells were read from — the area a commit vacates. */
	source: CellRect;
	/** Those cells, row-major, `source` wide and `source` tall. */
	cells: Uint8Array;
	/** Where they stand now. A fresh selection stands exactly where it was lifted. */
	placement: Placement;
};

/**
 * What one commit wrote: the area to repaint, and which cells it laid which
 * layer on (`EDIT_*` in `tools.ts`), for `applySymmetricEdit` to spread.
 *
 * The marks cover every cell the edit *touched* and not only the ones whose value
 * came out different. A patch that lands on cells already holding its own colours
 * has still been put there by the visitor, and symmetry has to know it: otherwise
 * the hole it came from is the only claim on that orbit, and a mirror line
 * between the two carries the hole over the patch.
 */
export type Edit = { box: Box; marks: Uint8Array };

/** The four corners of the marquee, named as they are before it is turned. */
export type Handle = 'nw' | 'ne' | 'se' | 'sw';

/**
 * The smallest a selection may be scaled to. One cell, because below that the
 * patch has no cells left to show and the corner handles would fold through each
 * other and flip the picture.
 */
export const MIN_SIZE = 1;

/** Which corner stays put while its opposite one is dragged. */
const OPPOSITE: Record<Handle, Handle> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

/** Each corner as signed half-widths along the placement's own axes. */
const CORNER_SIGNS: Record<Handle, { u: -1 | 1; v: -1 | 1 }> = {
	nw: { u: -1, v: -1 },
	ne: { u: 1, v: -1 },
	se: { u: 1, v: 1 },
	sw: { u: -1, v: 1 }
};

/** The corners in drawing order, so a marquee is one closed path. */
export const HANDLES: Handle[] = ['nw', 'ne', 'se', 'sw'];

/**
 * The marquee's chrome, in screen pixels — the side of a corner grip, how near a
 * pointer has to come to take hold of one, and how far the turner sits out beyond
 * the top edge. They are here rather than in the canvas because they are what
 * `rotateHandleAt` and the hit test are measured in, and a test that reaches for a
 * handle has to reach for the same place the canvas drew it.
 */
export const HANDLE_PX = 9;
export const GRAB_PX = 11;
export const ROTATE_GAP_PX = 22;

export function isEmptyRect(r: CellRect): boolean {
	return isEmptyBox(r);
}

/**
 * The whole cells two dragged points span, clipped to the mask.
 *
 * Rounded outwards rather than to the nearest cell: the visitor drags a box around
 * what they can see, and a cell they touched at all is a cell they meant to take.
 */
export function rectFrom(a: Vec, b: Vec, m: Mask): CellRect {
	return clampBox(
		m,
		Math.min(a.x, b.x),
		Math.min(a.y, b.y),
		Math.max(a.x, b.x),
		Math.max(a.y, b.y)
	);
}

/** Where a rectangle of cells stands before anything has been done to it. */
export function placementOf(r: CellRect): Placement {
	return {
		cx: (r.x0 + r.x1) / 2,
		cy: (r.y0 + r.y1) / 2,
		width: r.x1 - r.x0,
		height: r.y1 - r.y0,
		angle: 0
	};
}

/**
 * Copy the cells of `r` out of the mask. Null for a rectangle with no cells in it,
 * so a stray click never leaves an empty marquee on screen.
 */
export function lift(m: Mask, r: CellRect): Selection | null {
	if (isEmptyRect(r)) return null;
	const w = r.x1 - r.x0;
	const h = r.y1 - r.y0;
	const cells = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		const from = (r.y0 + y) * m.size + r.x0;
		cells.set(m.data.subarray(from, from + w), y * w);
	}
	return { source: { ...r }, cells, placement: placementOf(r) };
}

/** The placement's own axes on the mask: `u` across it, `v` down it. */
function axes(p: Placement): { u: Vec; v: Vec } {
	const cos = Math.cos(p.angle);
	const sin = Math.sin(p.angle);
	return { u: { x: cos, y: sin }, v: { x: -sin, y: cos } };
}

/** One corner of the marquee, in mask cells. */
export function cornerAt(p: Placement, handle: Handle): Vec {
	const { u, v } = axes(p);
	const s = CORNER_SIGNS[handle];
	const du = (s.u * p.width) / 2;
	const dv = (s.v * p.height) / 2;
	return { x: p.cx + u.x * du + v.x * dv, y: p.cy + u.y * du + v.y * dv };
}

/** All four corners, in drawing order. */
export function corners(p: Placement): Vec[] {
	return HANDLES.map((h) => cornerAt(p, h));
}

/**
 * Where the rotate handle sits: straight out from the top edge, `gap` cells clear
 * of it, so it never sits on a corner however flat the selection is squashed.
 */
export function rotateHandleAt(p: Placement, gap: number): Vec {
	const { v } = axes(p);
	const out = p.height / 2 + gap;
	return { x: p.cx - v.x * out, y: p.cy - v.y * out };
}

/** Whether a point lies inside the turned marquee — the area that drags it. */
export function contains(p: Placement, point: Vec): boolean {
	const { u, v } = axes(p);
	const dx = point.x - p.cx;
	const dy = point.y - p.cy;
	const du = dx * u.x + dy * u.y;
	const dv = dx * v.x + dy * v.y;
	return Math.abs(du) <= p.width / 2 && Math.abs(dv) <= p.height / 2;
}

export function moveBy(p: Placement, dx: number, dy: number): Placement {
	return { ...p, cx: p.cx + dx, cy: p.cy + dy };
}

/**
 * Grow or shrink about the patch's own centre — what Shift and an arrow key do.
 * Free rather than uniform, because one arrow names one axis; the centre stays
 * put so that the patch does not wander while it is being sized.
 */
export function resizeBy(p: Placement, du: number, dv: number): Placement {
	return {
		...p,
		width: Math.max(MIN_SIZE, p.width + du),
		height: Math.max(MIN_SIZE, p.height + dv)
	};
}

/** Turn by a fixed step, the keyboard's answer to dragging the turner. */
export function turnBy(p: Placement, radians: number): Placement {
	return { ...p, angle: p.angle + radians };
}

/**
 * A frame over the middle of the mask: where a keyboard selection starts, since
 * there is no drag to cut one out with. Half the mask across, which is large
 * enough to hold something worth moving and small enough to move it.
 */
export function middleRect(m: Mask): CellRect {
	const quarter = Math.max(1, Math.round(m.size / 4));
	return clampBox(m, quarter, quarter, m.size - quarter, m.size - quarter);
}

/**
 * Drag one corner to `point`.
 *
 * The opposite corner is the anchor and does not move, which is what makes a
 * corner handle feel like a corner handle. `uniform` keeps the shape and is the
 * default (Shift gives free scaling): the mask is a picture, and stretching one
 * axis of it is the rarer wish of the two.
 *
 * Nothing may pass through zero — a negative width would mirror the patch, which
 * is a different edit and one the symmetry rows already offer — so both sides stop
 * at `MIN_SIZE`.
 */
export function scaleTo(p: Placement, handle: Handle, point: Vec, uniform: boolean): Placement {
	const anchor = cornerAt(p, OPPOSITE[handle]);
	const { u, v } = axes(p);
	const s = CORNER_SIGNS[handle];
	const dx = point.x - anchor.x;
	const dy = point.y - anchor.y;
	let width = Math.max(MIN_SIZE, s.u * (dx * u.x + dy * u.y));
	let height = Math.max(MIN_SIZE, s.v * (dx * v.x + dy * v.y));
	if (uniform && p.width > 0 && p.height > 0) {
		// The larger of the two factors, so the drag never shrinks the axis it is
		// pulling: the corner may run ahead of the pointer, which is what every
		// aspect-locked handle does.
		const factor = Math.max(width / p.width, height / p.height);
		width = p.width * factor;
		height = p.height * factor;
	}
	return {
		...p,
		width,
		height,
		cx: anchor.x + (u.x * s.u * width) / 2 + (v.x * s.v * height) / 2,
		cy: anchor.y + (u.y * s.u * width) / 2 + (v.y * s.v * height) / 2
	};
}

/**
 * Turn the selection about its own centre so that the rotate handle points at
 * `point`. The handle starts straight above the centre, hence the quarter turn.
 */
export function rotateTo(p: Placement, point: Vec): Placement {
	const dx = point.x - p.cx;
	const dy = point.y - p.cy;
	if (!dx && !dy) return p;
	return { ...p, angle: Math.atan2(dy, dx) + Math.PI / 2 };
}

/** The cells a placement can possibly touch: its turned corners, clipped to the mask. */
export function boundsOf(p: Placement, m: Mask): CellRect {
	const pts = corners(p);
	const xs = pts.map((c) => c.x);
	const ys = pts.map((c) => c.y);
	return clampBox(m, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

/**
 * Draw the lifted cells where the placement puts them, nearest-neighbour.
 *
 * Backwards: each destination cell's centre is carried into the patch's own frame
 * and rounded down to a source cell. Cells whose centre falls outside the patch are
 * left alone, so a turned selection lays down a turned rectangle and not its
 * bounding box.
 *
 * `marks`, when given, is where the cells the patch covered are recorded — every
 * one of them, including any that already held the value being laid on it, which
 * is what `Edit` above explains. The box that comes back is the bounding box of
 * that same area, which is what the canvas repaints.
 */
export function stamp(m: Mask, sel: Selection, marks?: Uint8Array): Box {
	const p = sel.placement;
	const w = sel.source.x1 - sel.source.x0;
	const h = sel.source.y1 - sel.source.y0;
	if (w <= 0 || h <= 0 || p.width <= 0 || p.height <= 0) return emptyBox();
	const area = boundsOf(p, m);
	if (isEmptyBox(area)) return area;

	// The inverse turn: the placement turns by +angle, so reading back turns by −.
	const cos = Math.cos(-p.angle);
	const sin = Math.sin(-p.angle);
	let covered = emptyBox();
	for (let cy = area.y0; cy < area.y1; cy++) {
		const dy = cy + 0.5 - p.cy;
		const row = cy * m.size;
		for (let cx = area.x0; cx < area.x1; cx++) {
			const dx = cx + 0.5 - p.cx;
			const ux = cos * dx - sin * dy;
			const uy = sin * dx + cos * dy;
			const sx = Math.floor((ux / p.width + 0.5) * w);
			const sy = Math.floor((uy / p.height + 0.5) * h);
			if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
			if (marks) marks[row + cx] = EDIT_LAID;
			covered = unionBox(covered, { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 });
			m.data[row + cx] = sel.cells[sy * w + sx]!;
		}
	}
	return covered;
}

/**
 * Paint a rectangle of cells one value — what a commit does to the area it left.
 * The box that comes back is the rectangle itself, not the cells within it that
 * came out different, for the reason `Edit` gives.
 */
export function fill(m: Mask, r: CellRect, value: 0 | 1, marks?: Uint8Array): Box {
	if (isEmptyRect(r)) return emptyBox();
	rect(m, { x: r.x0, y: r.y0 }, { x: r.x1 - 1, y: r.y1 - 1 }, value);
	if (marks) {
		for (let y = r.y0; y < r.y1; y++) marks.fill(EDIT_CLEARED, y * m.size + r.x0, y * m.size + r.x1);
	}
	return { ...r };
}

/**
 * Put the selection down: the area it was lifted from becomes paper 0, and the
 * cells land where the placement puts them. Returns the area both together
 * touched, which is what the canvas repaints, and the marks symmetry spreads by.
 *
 * The vacated area is written first, so a patch dragged only a little still covers
 * the part of its own source it overlaps — and marked first, so that where a
 * mirror line runs through the edit it is the cells the visitor moved that win,
 * not the hole they came from.
 */
export function commit(m: Mask, sel: Selection): Edit {
	const marks = new Uint8Array(m.data.length);
	const vacated = fill(m, sel.source, 0, marks);
	return { box: unionBox(vacated, stamp(m, sel, marks)), marks };
}

/** Delete: the selected cells go, and nothing is put back down. */
export function clear(m: Mask, sel: Selection): Edit {
	const marks = new Uint8Array(m.data.length);
	return { box: fill(m, sel.source, 0, marks), marks };
}

/**
 * Whether the patch still stands exactly where it was lifted from, in which case
 * committing it writes the same cells back and changes nothing at all.
 *
 * The canvas asks before taking an undo snapshot: framing a patch and pressing
 * Enter without moving it would otherwise push a step that restores an identical
 * mask and mark the drawing as changed.
 */
export function isUnmoved(sel: Selection): boolean {
	const home = placementOf(sel.source);
	const p = sel.placement;
	return (
		p.cx === home.cx &&
		p.cy === home.cy &&
		p.width === home.width &&
		p.height === home.height &&
		p.angle === 0
	);
}
