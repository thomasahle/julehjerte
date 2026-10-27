/**
 * Where between the cells a photograph's edges lie, for the mask read from it.
 *
 * The engine reads a photograph one point a cell and keeps only which paper
 * each point is nearer, so a curve arrives in Mal as the cells' stair. The
 * photograph knows better: where two papers meet, its pixels mix the two
 * colours, and a pixel 30 % yellow lies 30 % of the way across the edge. So
 * each cell beside the other paper is read again here, as the mean of its own
 * patch of the photograph, and its level (`Mask.level`) is how far that colour
 * lies from the one paper's towards the other's, the papers' colours taken
 * from the cells round it that are wholly one paper, so a shadow across the
 * heart does not move its edges. The cells stay what the engine made them:
 * each level is held to the side of one half its cell is on.
 *
 * Tried on two photographs of woven hearts (2026-10-27): a coarse mask read
 * finer, against the photograph read finer, misplaced 0.56 % of the area with
 * these levels and 1.54 % without, and 0.91 % against 1.67 %. A photograph
 * that does not look like two papers (a printed paper, a crop that is off)
 * gives no levels: when the cells away from the edges do not mostly match
 * their own paper's colour, the mask keeps whole cells.
 */

import type { Point } from '$lib/inverse/client';
import type { Mask } from './mask';

/** RGBA pixels, row by row, as the import dialog decodes them. */
export type PhotoPixels = { rgba: ArrayLike<number>; width: number; height: number };

/** Cells a side of the blocks the papers' local colours are summed in. */
const BLOCK = 8;
/** Blocks either side of a cell's own that its papers' colours are read from. */
const REACH = 1;
/** Whole cells of a paper a local colour needs; fewer, and the whole mask's is used. */
const ENOUGH = 8;
/** The share of whole cells nearer the other paper's colour past which the photograph is not read. */
const MISMATCH = 0.04;
/** How far apart, in RGB, the two papers' colours must be to tell a mix of them. */
const DISTINCT = 24;

/**
 * Where a point of the woven square, `u` and `v` from 0 to 1, lies in the
 * photograph, in pixel centres: the engine's own mapping, the corners in
 * the order it takes them (top cleft, then round as a clock goes), counted in
 * pixel edges. A square photograph without corners is the square itself.
 */
function squareToPhoto(quad: readonly Point[] | null, width: number, height: number): ((u: number, v: number) => [number, number]) | null {
	if (!quad) return (u, v) => [u * width - 0.5, v * height - 0.5];
	if (quad.length !== 4) return null;
	// The homography taking the unit square's corners to the four, by an 8 × 8 solve.
	const rows: number[][] = [];
	([[0, 0], [1, 0], [1, 1], [0, 1]] as const).forEach(([u, v], i) => {
		const [x, y] = quad[i]!;
		rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x], [0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	});
	for (let c = 0; c < 8; c++) {
		let pivot = c;
		for (let r = c + 1; r < 8; r++) if (Math.abs(rows[r]![c]!) > Math.abs(rows[pivot]![c]!)) pivot = r;
		[rows[c], rows[pivot]] = [rows[pivot]!, rows[c]!];
		if (Math.abs(rows[c]![c]!) < 1e-12) return null;
		for (let r = 0; r < 8; r++) {
			if (r === c) continue;
			const f = rows[r]![c]! / rows[c]![c]!;
			for (let k = c; k <= 8; k++) rows[r]![k]! -= f * rows[c]![k]!;
		}
	}
	const h = rows.map((row, i) => row[8]! / row[i]!);
	return (u, v) => {
		const w = h[6]! * u + h[7]! * v + 1;
		return [(h[0]! * u + h[1]! * v + h[2]!) / w - 0.5, (h[3]! * u + h[4]! * v + h[5]!) / w - 0.5];
	};
}

/**
 * The levels of `mask`, read from the photograph it was read from, or null
 * when the photograph does not look like two papers.
 */
export function photoLevels(mask: Mask, photo: PhotoPixels, quad: readonly Point[] | null): Uint8Array | null {
	const n = mask.size, data = mask.data, known = mask.validMask, { rgba, width, height } = photo;
	const map = squareToPhoto(quad, width, height);
	if (!map || rgba.length !== width * height * 4 || n < 2) return null;

	/** The mean colour of `s` × `s` points spread over the cell, read bilinearly. */
	const colourOf = (x: number, y: number, s: number, out: Float64Array) => {
		out.fill(0);
		for (let j = 0; j < s; j++)
			for (let i = 0; i < s; i++) {
				const [px, py] = map((x + (i + 0.5) / s) / n, (y + (j + 0.5) / s) / n);
				const cx = Math.max(0, Math.min(width - 1, px)), cy = Math.max(0, Math.min(height - 1, py));
				const x0 = Math.min(width - 2, Math.floor(cx)), y0 = Math.min(height - 2, Math.floor(cy)), tx = cx - x0, ty = cy - y0;
				for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
					const k = 4 * ((y0 + dy) * width + x0 + dx);
					out[0]! += w * rgba[k]!;
					out[1]! += w * rgba[k + 1]!;
					out[2]! += w * rgba[k + 2]!;
				}
			}
		for (let c = 0; c < 3; c++) out[c]! /= s * s;
	};

	// The cells beside the other paper, where an edge passes.
	const isKnown = (i: number) => !known || known[i] === 1;
	const edge = new Uint8Array(n * n);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const i = y * n + x;
			if (!isKnown(i)) continue;
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
				const X = x + dx, Y = y + dy, j = Y * n + X;
				if (X >= 0 && Y >= 0 && X < n && Y < n && isKnown(j) && data[j] !== data[i]) edge[i] = 1;
			}
		}

	// The whole cells' colours, summed per paper in blocks for the local colours and over the mask.
	const blocks = Math.ceil(n / BLOCK), sums = [new Float64Array(blocks * blocks * 4), new Float64Array(blocks * blocks * 4)];
	const total = [new Float64Array(4), new Float64Array(4)];
	const whole = new Float32Array(n * n * 3), colour = new Float64Array(3);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const i = y * n + x;
			if (edge[i] || !isKnown(i)) continue;
			colourOf(x, y, 2, colour);
			whole.set(colour, 3 * i);
			const paper = data[i]!, b = 4 * (Math.floor(y / BLOCK) * blocks + Math.floor(x / BLOCK));
			for (let c = 0; c < 3; c++) {
				sums[paper]![b + c]! += colour[c]!;
				total[paper]![c]! += colour[c]!;
			}
			sums[paper]![b + 3]!++;
			total[paper]![3]!++;
		}
	if (total[0]![3]! < ENOUGH || total[1]![3]! < ENOUGH) return null;
	const papers = total.map((t) => [t[0]! / t[3]!, t[1]! / t[3]!, t[2]! / t[3]!]);
	if (Math.hypot(...papers[1]!.map((v, c) => v - papers[0]![c]!)) < DISTINCT) return null;
	// Does the photograph look like the mask, two papers? Count whole cells nearer the other paper's colour.
	let astray = 0;
	for (let i = 0; i < n * n; i++) {
		if (edge[i] || !isKnown(i)) continue;
		const d = (p: number[]) => (whole[3 * i]! - p[0]!) ** 2 + (whole[3 * i + 1]! - p[1]!) ** 2 + (whole[3 * i + 2]! - p[2]!) ** 2;
		if (d(papers[data[i]!]!) > d(papers[1 - data[i]!]!)) astray++;
	}
	if (astray > MISMATCH * (total[0]![3]! + total[1]![3]!)) return null;

	// A cell's patch of the photograph has as many points as it has pixels, about two a pixel each way.
	const corner = (u: number, v: number) => map(u, v);
	const [a, b, c, d] = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
	const side = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);
	const perCell = (side(a, b) + side(b, c) + side(c, d) + side(d, a)) / (4 * n);
	const points = Math.max(2, Math.min(8, Math.ceil(2 * perCell)));

	const level = new Uint8Array(n * n);
	const local = [new Float64Array(4), new Float64Array(4)];
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const i = y * n + x, cell = data[i]!;
			level[i] = cell * 255;
			if (!edge[i]) continue;
			// The two papers' colours round the cell, or over the mask where it has too few.
			const bx = Math.floor(x / BLOCK), by = Math.floor(y / BLOCK);
			local[0]!.fill(0);
			local[1]!.fill(0);
			for (let Y = Math.max(0, by - REACH); Y <= Math.min(blocks - 1, by + REACH); Y++)
				for (let X = Math.max(0, bx - REACH); X <= Math.min(blocks - 1, bx + REACH); X++)
					for (const paper of [0, 1])
						for (let k = 0; k < 4; k++) local[paper]![k]! += sums[paper]![4 * (Y * blocks + X) + k]!;
			const [p0, p1] = [0, 1].map((paper) =>
				local[paper]![3]! >= ENOUGH ? [0, 1, 2].map((k) => local[paper]![k]! / local[paper]![3]!) : papers[paper]!
			) as [number[], number[]];
			colourOf(x, y, points, colour);
			let along = 0, length2 = 0;
			for (let k = 0; k < 3; k++) {
				along += (colour[k]! - p0[k]!) * (p1[k]! - p0[k]!);
				length2 += (p1[k]! - p0[k]!) ** 2;
			}
			const share = Math.round(255 * Math.max(0, Math.min(1, length2 > 0 ? along / length2 : cell)));
			level[i] = cell ? Math.max(128, share) : Math.min(127, share);
		}
	return level;
}
