/**
 * The mask drawn smooth, for the screen only.
 *
 * Drawn a pixel per cell and magnified, a mask shows every cell's square, and
 * the heart turns them a quarter of a right angle, so a curve the visitor
 * painted comes out as a stair. Here each paper's edge is drawn instead as the
 * curve where the cells, read bilinearly between their centres, cross one half
 * (the edge Udtvær keeps; see `smudge.ts`), with a rim about a pixel wide that
 * mixes the two papers, so the curve is antialiased at the size it is drawn.
 *
 * Only the picture changes. The mask keeps its two papers cell for cell, which
 * is what Find snit reads: every cell's centre is drawn more its own paper than
 * the other, only the space between centres is drawn as a curve. Where the
 * mask has a `level`, the curve is read from it instead, so an edge lies where
 * the tool drew it, Udtvær bent it or Markér moved it, and not on the cells'
 * stair (see `Mask.level`).
 * A cell the mask does not know yet (`validMask` 0, PAINT.md §11) is drawn as
 * it always was, its pattern over its whole square.
 */

import { levelAt, type Box, type Mask } from './mask';

const UNKNOWN_LIGHT = [224, 224, 224, 255] as const;
const UNKNOWN_DARK = [185, 185, 185, 255] as const;

/** Missing photo pixels have neutral hatching, distinct from either paper. */
export function missingPixelChannels(index: number, width: number): readonly number[] {
	return Math.floor((index % width + Math.floor(index / width)) / 4) % 2 ? UNKNOWN_LIGHT : UNKNOWN_DARK;
}

/**
 * The pixels per cell a smooth picture needs at `screenPerCell` screen pixels a
 * cell: up to three, which redraws the whole mask in about 18 ms (four took 42,
 * too slow for a stroke of the broadest pen); a heart drawn larger still is
 * magnified the rest of the way, smoothly.
 */
export function smoothScale(screenPerCell: number): number {
	return Math.max(1, Math.min(3, Math.ceil(screenPerCell)));
}

/**
 * Write the pixels of the cells in `box`, and of the half cell round them that
 * reads them too, into `out`: an RGBA picture `scale` pixels a cell of the
 * cells in `window`, the whole mask unless it says less (a zoomed view draws
 * only what it shows, finer). `paper` holds the two papers' RGB channels.
 * Returns the pixel box written, in the picture's own pixels.
 */
export function smoothPixels(
	mask: Mask,
	paper: readonly ArrayLike<number>[],
	scale: number,
	out: Uint8ClampedArray,
	box: Box,
	window: Box = { x0: 0, y0: 0, x1: mask.size, y1: mask.size }
): Box {
	const n = mask.size, data = mask.data, known = mask.validMask, level = mask.level;
	const [left, right] = paper as [ArrayLike<number>, ArrayLike<number>];
	const ox = window.x0 * scale, oy = window.y0 * scale, width = (window.x1 - window.x0) * scale;
	// A pixel reads the four cells round it, so a changed cell reaches a cell's
	// width of pixels further on each side.
	const px0 = Math.max(ox, (box.x0 - 1) * scale), py0 = Math.max(oy, (box.y0 - 1) * scale);
	const px1 = Math.min(window.x1 * scale, (box.x1 + 1) * scale), py1 = Math.min(window.y1 * scale, (box.y1 + 1) * scale);
	const put = (p: number, colour: ArrayLike<number>) => {
		out[p] = colour[0]!;
		out[p + 1] = colour[1]!;
		out[p + 2] = colour[2]!;
		out[p + 3] = 255;
	};
	for (let py = py0; py < py1; py++) {
		// The pixel's centre in cells, whose centres lie on whole coordinates.
		const v = Math.max(0, Math.min(n - 1, (py + 0.5) / scale - 0.5));
		const y0 = Math.min(Math.max(0, n - 2), Math.floor(v)), ty = v - y0, y1 = Math.min(n - 1, y0 + 1);
		const nearY = ty < 0.5 ? y0 : y1;
		for (let px = px0; px < px1; px++) {
			const u = Math.max(0, Math.min(n - 1, (px + 0.5) / scale - 0.5));
			const x0 = Math.min(Math.max(0, n - 2), Math.floor(u)), tx = u - x0, x1 = Math.min(n - 1, x0 + 1);
			const p = 4 * ((py - oy) * width + px - ox);
			const ia = y0 * n + x0, ib = y0 * n + x1, ic = y1 * n + x0, id = y1 * n + x1;
			if (known && !(known[ia] && known[ib] && known[ic] && known[id])) {
				// Beside an unknown cell, the cells as they always were.
				const near = nearY * n + (tx < 0.5 ? x0 : x1);
				put(p, known[near] ? (data[near] === 1 ? right : left) : missingPixelChannels(near, n));
				continue;
			}
			if (data[ia] === data[ib] && data[ib] === data[ic] && data[ic] === data[id]) {
				put(p, data[ia] === 1 ? right : left);
				continue;
			}
			const a = level ? levelAt(mask, ia) : data[ia]!, b = level ? levelAt(mask, ib) : data[ib]!;
			const c = level ? levelAt(mask, ic) : data[ic]!, d = level ? levelAt(mask, id) : data[id]!;
			const value = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
			// How far the pixel lies from the half-way curve, in pixels: the
			// field's distance from one half over its slope per pixel.
			const gx = (b - a) * (1 - ty) + (d - c) * ty, gy = (c - a) * (1 - tx) + (d - b) * tx;
			const slope = Math.hypot(gx, gy) / scale;
			const share = slope > 1e-9 ? Math.max(0, Math.min(1, 0.5 + (value - 0.5) / slope)) : value >= 0.5 ? 1 : 0;
			out[p] = left[0]! + (right[0]! - left[0]!) * share;
			out[p + 1] = left[1]! + (right[1]! - left[1]!) * share;
			out[p + 2] = left[2]! + (right[2]! - left[2]!) * share;
			out[p + 3] = 255;
		}
	}
	if (px1 <= px0 || py1 <= py0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
	return { x0: px0 - ox, y0: py0 - oy, x1: px1 - ox, y1: py1 - oy };
}

/**
 * A rectangle of cells, `width` × `height` row by row, drawn smooth as the mask
 * is, its edge levels and all: Markér's floating patch. Past its edges the
 * cells read as the edge ones, so its rim is the patch's own and not a paper
 * it does not hold.
 */
export function smoothCells(
	patch: { cells: Uint8Array; validMask?: Uint8Array; level?: Uint8Array },
	width: number,
	height: number,
	paper: readonly ArrayLike<number>[],
	scale: number
): Uint8ClampedArray<ArrayBuffer> {
	const n = Math.max(2, width, height), { cells, validMask: known, level: shares } = patch;
	const data = new Uint8Array(n * n), valid = known ? new Uint8Array(n * n) : undefined;
	const level = shares ? new Uint8Array(n * n) : undefined;
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const i = Math.min(y, height - 1) * width + Math.min(x, width - 1);
			data[y * n + x] = cells[i]!;
			if (valid) valid[y * n + x] = known![i]!;
			if (level) level[y * n + x] = shares![i]!;
		}
	const out = new Uint8ClampedArray(new ArrayBuffer(width * scale * height * scale * 4));
	const whole = { x0: 0, y0: 0, x1: width, y1: height };
	smoothPixels({ size: n, data, ...(valid ? { validMask: valid } : {}), ...(level ? { level } : {}) }, paper, scale, out, whole, whole);
	return out;
}
