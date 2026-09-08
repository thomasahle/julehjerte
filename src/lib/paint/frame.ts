/**
 * "Kanten": the protected motif and the band around it (docs/redesign/PAINT.md
 * §11, "Free and soft cells", and docs/inverse/MOTIF-BORDER.md).
 *
 * The archive the site is modelled on is full of hearts that are a motif in the
 * middle and a plain weave around the edges, and Codex's motif-border benchmark
 * showed why: an isolated silhouette has nothing for the fitter to weave with
 * near the edges, and a band of supporting weave gives it that. So the visitor
 * says how much of the square is *theirs* — a shape, centred, with a size — and
 * what should happen to the rest: keep it as painted (Fast), or let the search
 * fill it in (Fri).
 *
 * Everything here is geometry on the unit square, `0…1` in each axis, x right
 * and y down — the woven square's own frame, the same one the mask's cells
 * index. Nothing in this file knows about the canvas, the DOM or the engine.
 *
 * ## The two frames
 *
 * The mask is drawn turned a quarter of a right angle (`$lib/paint/heartLayout`),
 * so the square's corners are the heart's top cleft, its two sides and its tip.
 * That is why the shapes are named as they *appear in the heart*: "Rude" is an
 * axis-aligned square in mask coordinates, which the turn shows as a diamond;
 * "Sekskant" has a flat top and bottom in the heart, which in mask coordinates
 * is a hexagon turned −45°. The circle is the same in both.
 *
 * Heart coordinates are used inside the hexagon test and nowhere else:
 *
 *   h = (a − b)/√2   (the heart's left-right axis)
 *   w = (a + b)/√2   (the heart's up-down axis, positive downwards)
 *
 * for `a = u − ½`, `b = v − ½`. The four drag handles sit on those two axes,
 * which in mask coordinates are the square's diagonals.
 *
 * ## Size
 *
 * One number for all three shapes: the span of the shape's bounding box **in
 * the square's own axes**, as a share of the square. So 0.64 is Codex's 18 %
 * inset on each edge, whichever shape is chosen, and the three shapes at the
 * same size cover the square to the same depth.
 */

import type { Mask } from './mask';

/** The three protected shapes, named as they appear in the heart. */
export type FrameShape = 'diamond' | 'circle' | 'hexagon';

/**
 * What happens to the band outside the shape.
 *
 * `fixed` is the mask as painted — today's behaviour, and what a heart made
 * without thinking about the frame still is. `free` throws the band's colours
 * away and lets the search put a supporting weave there. A third state ("Må
 * rettes": keep the cells but let the engine change what it must) needs per-cell
 * loss weights in the engine and waits for them; see §11 and `frameWeights`.
 */
export type FrameMode = 'fixed' | 'free';

export type Frame = { mode: FrameMode; shape: FrameShape; size: number };

/** The narrowest and widest protected motif the slider offers. */
export const FRAME_MIN_SIZE = 0.3;
export const FRAME_MAX_SIZE = 0.84;

/** Fast, a rude, and Codex's 18 % inset on every edge. */
export const DEFAULT_FRAME: Frame = { mode: 'fixed', shape: 'diamond', size: 0.64 };

/** Checker cells per side of the square; the range the benchmark tested. */
export const FRAME_MIN_CELLS = 3;
export const FRAME_MAX_CELLS = 5;
export const DEFAULT_FRAME_CELLS = 4;

/** The heart's four axes, which are the mask's two diagonals. */
export type FrameAxis = 'up' | 'right' | 'down' | 'left';
export const FRAME_AXES: readonly FrameAxis[] = ['up', 'right', 'down', 'left'];

export type Pt = { x: number; y: number };

/** cos 15°: the hexagon's widest vertex, measured along the square's own axis. */
const COS15 = Math.cos(Math.PI / 12);

const ROOT3 = Math.sqrt(3);

/** A size the slider and a dragged handle may both produce, brought into range. */
export function clampFrameSize(size: number): number {
	if (!Number.isFinite(size)) return DEFAULT_FRAME.size;
	return Math.min(FRAME_MAX_SIZE, Math.max(FRAME_MIN_SIZE, size));
}

/** A checker count brought into range; anything unreadable goes back to the default. */
export function clampFrameCells(cells: number): number {
	if (!Number.isFinite(cells)) return DEFAULT_FRAME_CELLS;
	return Math.min(FRAME_MAX_CELLS, Math.max(FRAME_MIN_CELLS, Math.round(cells)));
}

/** The hexagon's circumradius for a bounding box of `size` in the square's axes. */
function hexRadius(size: number): number {
	return size / (2 * COS15);
}

/**
 * Whether a point of the unit square lies inside the protected shape.
 *
 * The boundary counts as inside, so the shape at its largest still protects the
 * cells the outline runs through rather than leaving a one-cell seam.
 */
export function insideShape(shape: FrameShape, size: number, u: number, v: number): boolean {
	const a = u - 0.5;
	const b = v - 0.5;
	const half = size / 2;
	if (shape === 'diamond') return Math.abs(a) <= half && Math.abs(b) <= half;
	if (shape === 'circle') return a * a + b * b <= half * half;
	// A regular hexagon with a flat top and bottom in the heart is the
	// intersection of three slabs: one across the flat edges, two across the
	// slanted pairs. Turning it back into mask coordinates is what h and w do.
	const h = (a - b) * Math.SQRT1_2;
	const w = (a + b) * Math.SQRT1_2;
	const r = hexRadius(size);
	return Math.abs(w) <= (r * ROOT3) / 2 && ROOT3 * Math.abs(h) + Math.abs(w) <= ROOT3 * r;
}

/** Whether the cell `(x, y)` of a `maskSize`-cell mask has its centre in the shape. */
export function insideCell(frame: Frame, maskSize: number, x: number, y: number): boolean {
	return insideShape(frame.shape, frame.size, (x + 0.5) / maskSize, (y + 0.5) / maskSize);
}

/**
 * The protected cells as a mask-shaped flag array: 1 inside, 0 in the band.
 *
 * One pass, reused by the weights, the solve mask, the two mismatch numbers and
 * the symmetry region, so those four cannot disagree about where the band is.
 */
export function shapeCells(frame: Frame, maskSize: number): Uint8Array {
	const cells = new Uint8Array(maskSize * maskSize);
	for (let y = 0; y < maskSize; y++) {
		const row = y * maskSize;
		for (let x = 0; x < maskSize; x++) {
			if (insideCell(frame, maskSize, x, y)) cells[row + x] = 1;
		}
	}
	return cells;
}

/** The unit vector of one heart axis, in the square's own coordinates. */
export function axisVector(axis: FrameAxis): Pt {
	const r = Math.SQRT1_2;
	if (axis === 'up') return { x: -r, y: -r };
	if (axis === 'right') return { x: r, y: -r };
	if (axis === 'down') return { x: r, y: r };
	return { x: -r, y: r };
}

/**
 * How far the outline is from the centre along one heart axis.
 *
 * The rude's diagonal meets its corner, so it reaches furthest; the circle meets
 * its radius; and the hexagon meets a vertex left and right but the middle of a
 * flat edge above and below, which is why the four handles of a hexagon do not
 * all sit at the same distance.
 */
export function handleDistance(shape: FrameShape, size: number, axis: FrameAxis): number {
	if (shape === 'diamond') return size * Math.SQRT1_2;
	if (shape === 'circle') return size / 2;
	const r = hexRadius(size);
	return axis === 'right' || axis === 'left' ? r : (r * ROOT3) / 2;
}

/** Where one drag handle sits, in unit-square coordinates. */
export function handlePoint(frame: Frame, axis: FrameAxis): Pt {
	const d = handleDistance(frame.shape, frame.size, axis);
	const dir = axisVector(axis);
	return { x: 0.5 + dir.x * d, y: 0.5 + dir.y * d };
}

/** All four handles, in the order `FRAME_AXES` names them. */
export function frameHandles(frame: Frame): { axis: FrameAxis; point: Pt }[] {
	return FRAME_AXES.map((axis) => ({ axis, point: handlePoint(frame, axis) }));
}

/**
 * The size a handle dragged to `point` asks for, already clamped.
 *
 * Only the distance along that handle's own axis counts: the shape stays centred
 * and keeps its proportions, so a drag sideways is not a stretch but a smaller
 * or larger version of the same shape.
 */
export function sizeFromHandle(shape: FrameShape, axis: FrameAxis, point: Pt): number {
	const dir = axisVector(axis);
	const d = Math.max(0, (point.x - 0.5) * dir.x + (point.y - 0.5) * dir.y);
	if (shape === 'diamond') return clampFrameSize(d * Math.SQRT2);
	if (shape === 'circle') return clampFrameSize(2 * d);
	// Invert `handleDistance`: a vertex left and right, an apothem up and down.
	const r = axis === 'right' || axis === 'left' ? d : (2 * d) / ROOT3;
	return clampFrameSize(2 * r * COS15);
}

/**
 * The outline to draw, in unit-square coordinates.
 *
 * A shape either has corners or it has not, and the two callers — a canvas in
 * the paint page and an SVG over the found heart — both need the same answer,
 * so the outline is described once here rather than built twice.
 */
export type FrameOutline =
	| { kind: 'polygon'; points: Pt[] }
	| { kind: 'circle'; cx: number; cy: number; r: number };

export function shapeOutline(shape: FrameShape, size: number): FrameOutline {
	if (shape === 'circle') return { kind: 'circle', cx: 0.5, cy: 0.5, r: size / 2 };
	const half = size / 2;
	if (shape === 'diamond') {
		return {
			kind: 'polygon',
			points: [
				{ x: 0.5 - half, y: 0.5 - half },
				{ x: 0.5 + half, y: 0.5 - half },
				{ x: 0.5 + half, y: 0.5 + half },
				{ x: 0.5 - half, y: 0.5 + half }
			]
		};
	}
	// Six vertices a sixth of a turn apart in the heart's frame, carried back
	// into the square's — which is the −45° turn the shape is named for.
	const r = hexRadius(size);
	const points: Pt[] = [];
	for (let k = 0; k < 6; k++) {
		const angle = (k * Math.PI) / 3;
		const h = r * Math.cos(angle);
		const w = r * Math.sin(angle);
		points.push({ x: 0.5 + (h + w) * Math.SQRT1_2, y: 0.5 + (w - h) * Math.SQRT1_2 });
	}
	return { kind: 'polygon', points };
}

/**
 * The share of differing cells inside the protected shape, 0 to 1.
 *
 * The number MOTIF-BORDER.md asks for: a large, accurately woven band dilutes an
 * error in the middle, so the middle has to be reported on its own before a
 * result is called good. Both arrays are `size × size` cells of the same square.
 */
export function mismatchInside(a: Uint8Array, b: Uint8Array, size: number, frame: Frame): number {
	if (a.length !== b.length || a.length !== size * size) {
		throw new Error('Masks must both be size × size cells.');
	}
	let inside = 0;
	let differing = 0;
	for (let y = 0; y < size; y++) {
		const row = y * size;
		for (let x = 0; x < size; x++) {
			if (!insideCell(frame, size, x, y)) continue;
			inside++;
			if ((a[row + x] ? 1 : 0) !== (b[row + x] ? 1 : 0)) differing++;
		}
	}
	return inside ? differing / inside : 0;
}

/**
 * Which of the two checker phases to lay down, 0 or 1.
 *
 * The rule, in one line: **the phase that agrees with the visitor's own band
 * cells more often**. At the sizes on offer the band is thinner than a single
 * checker cell — an 18 % band against a quarter-square checker — so every band
 * cell is a cell along the protected outline, and agreeing with the band is the
 * same thing as continuing the colour the motif has at its edge. A tie keeps
 * phase 0, so the answer does not depend on which cell was counted first.
 */
export function checkerPhase(mask: Mask, frame: Frame, cells: number): 0 | 1 {
	const block = mask.size / clampFrameCells(cells);
	let agree = 0;
	let total = 0;
	for (let y = 0; y < mask.size; y++) {
		const row = y * mask.size;
		const by = Math.floor(y / block);
		for (let x = 0; x < mask.size; x++) {
			if (insideCell(frame, mask.size, x, y)) continue;
			total++;
			const checker = (Math.floor(x / block) + by) & 1;
			if (checker === (mask.data[row + x] ? 1 : 0)) agree++;
		}
	}
	return total && agree * 2 < total ? 1 : 0;
}

/**
 * The mask the engine is actually asked to weave when the band is free.
 *
 * Keep every cell inside the protected shape; replace the band with a checker of
 * `cells × cells` blocks over the whole square, which is exactly what
 * `scripts/inverse/motif-border-benchmark.mjs` did to get a weavable target out
 * of an isolated silhouette. The visitor's mask is not touched: they keep on
 * painting the picture they painted, and only the search sees this one.
 *
 * **This function is the whole of the substitution and exists to be deleted.**
 * When the engine takes per-cell loss weights (Codex's lane, PAINT.md §11) the
 * band goes over as weight 0 and the target stays the visitor's own mask; the
 * checker is a stand-in for a weight the engine cannot read yet.
 */
export function substituteCheckerBand(mask: Mask, frame: Frame, cells: number): Mask {
	const count = clampFrameCells(cells);
	const block = mask.size / count;
	const phase = checkerPhase(mask, frame, count);
	const data = new Uint8Array(mask.data);
	for (let y = 0; y < mask.size; y++) {
		const row = y * mask.size;
		const by = Math.floor(y / block);
		for (let x = 0; x < mask.size; x++) {
			if (insideCell(frame, mask.size, x, y)) continue;
			data[row + x] = ((Math.floor(x / block) + by + phase) & 1) as 0 | 1;
		}
	}
	return { size: mask.size, data };
}

/**
 * The target one search is run against: the visitor's mask when the band is
 * fixed, and the same mask with a woven band when it is free.
 *
 * A copy either way, so the caller may fold it under the symmetry rows without
 * touching what is on the canvas.
 */
export function solveTargetMask(mask: Mask, frame: Frame, cells: number): Mask {
	if (frame.mode !== 'free') return { size: mask.size, data: new Uint8Array(mask.data) };
	return substituteCheckerBand(mask, frame, cells);
}
