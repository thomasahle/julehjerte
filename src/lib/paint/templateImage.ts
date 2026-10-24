/**
 * Reading a picture of a woven heart's cut template.
 *
 * About a quarter of the pictures people find online are not a woven heart but
 * its template: the two lobes drawn flat — each a rectangle (the woven square's
 * side by side) with a half disc on one end, the fold on the opposite straight
 * edge — and the slits drawn inside each rectangle, from the fold to the ear's
 * base. For those the right answer is not a fit to some mask: it is the
 * template itself, read back as the site's own `HeartDesign`.
 *
 * The reader works on plain pixels (no DOM, no canvas), so it runs in a test,
 * in node and in a web worker:
 *
 * 1. Ink. Each pixel's darkness against the local paper (a coarse, dilated
 *    brightest-block estimate), so grey paper, shading and JPEG haze drop out.
 * 2. Lobes. On a ≤1000 px copy, the ink is closed a little, each connected
 *    drawing has its holes filled (or, when its outline is open — a dashed
 *    fold — its convex hull taken), and every filled shape is fitted with the
 *    lobe's shape — a rectangle with a half disc on one end, any rotation — by
 *    overlap (IoU). Shapes the lobe does not fit clearly better than a plain
 *    rectangle are dropped: a text box, a photo or a preview heart is not a
 *    lobe. A drawing that fails is tried again filled, and split by an opening
 *    (two lobes joined by a label laid across both, a photo against a template).
 * 3. Outline. At full resolution the fitted shape is sharpened on the ink
 *    itself: walks across both long sides, the fold and the round end collect
 *    the centres of every stroke they cross, and the line (or circle) most
 *    walks agree on is taken (RANSAC, the outermost of near ties, so a label or
 *    a cut just inside does not pull it). The ear's base is the circle's
 *    centre, or the line drawn there when there is one. Their intersections are
 *    the square's four corners.
 * 4. Strips. The square is resampled into its own frame (u across, v from the
 *    ear's base to the fold), a thin margin cut off all round so the outline
 *    itself is gone, and the paper inside is split into connected pieces. The
 *    pieces reaching from the fold to the ear's base are the strips; anything
 *    else (a drawn star, a dimension number, an eye) lies inside a strip and is
 *    not a cut.
 * 5. Cuts. Between strip k and k+1 the cut is the line equally far from the
 *    strips on either side (a distance transform of each group and marching
 *    squares on their difference): the slit's centre line, whatever its shape.
 *    It is pulled onto the stroke's ink centre, extended to the two edges and
 *    fitted with as few cubics as the tolerance allows, corners kept.
 * 6. Heart. The lobes are assigned and oriented (see `TemplateRead.layout`
 *    and `mirrored`), every cut is written in the heart's 0–100 frame and the
 *    result goes through `normalizeHeartDesign`, the same normalisation a saved
 *    heart gets. `confidence` says how far to trust it (≥ 0.5: use it).
 *
 * Orientation. In the heart's (editor) frame the left lobe's ear is to the LEFT
 * of the square, its cuts run left–right (`lobe: 'left'`, x = ear base → fold),
 * and the right lobe's ear is ABOVE the square, its cuts run up–down. The mask
 * `rasterizeDesign` makes is 0 where the left lobe's paper shows and 1 where the
 * right lobe's does. A folded piece turned over is its own mirror image, so a
 * template fixes each lobe only up to a mirror across its ear–fold axis; the
 * reader takes the convention of the layout it sees (`layout`).
 */

import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import type { HeartDesign, HeartDesignJson, LobeId, Vec } from '$lib/types/heart';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { inferOverlapRect } from '$lib/utils/overlapRect';

/** An RGBA picture, as `ImageData` has it. */
export type TemplatePixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export interface TemplateReadOptions {
	/** The weave parity the design gets; a template does not say which strip goes over first. */
	weaveParity?: 0 | 1;
	/** Pictures larger than this many pixels are averaged down first (default 4 M). */
	maxPixels?: number;
	/** The design's id and name. */
	id?: string;
	name?: string;
	/** Called with a line about each step, for tuning. */
	debug?: (message: string) => void;
	/** Called with intermediate pictures (0–1 values), for tuning. */
	debugPicture?: (name: string, picture: { w: number; h: number; d: ArrayLike<number> }) => void;
}

/** One lobe as read, in the picture's own pixels. */
export interface TemplateLobeRead {
	lobe: LobeId;
	/**
	 * The square's corners: ear base at u = 0, ear base at u = 1, fold at u = 1,
	 * fold at u = 0, where u runs across the lobe the way the design's other
	 * coordinate does (y for the left lobe, x for the right).
	 */
	square: [Vec, Vec, Vec, Vec];
	/** The round end's circle. */
	ear: { center: Vec; radius: number };
	/** Unit vector from the square toward the ear. */
	earDirection: Vec;
	/** Each cut as read, a polyline from the fold to the ear's base. */
	cuts: Vec[][];
	/** How well the lobe's shape covers the filled outline (IoU, 0–1). */
	shapeFit: number;
	/** Pieces of paper inside the square that reach only one edge: a broken or touching cut. */
	strayPieces: number;
	/** 0–1, this lobe's share of `TemplateRead.confidence`. */
	confidence: number;
}

export interface TemplateRead {
	design: HeartDesign;
	/**
	 * 0–1: how sure the reader is that this is a template and that it read it
	 * whole. Below about 0.5 treat the picture as something else.
	 */
	confidence: number;
	/**
	 * How the lobes were placed, which sets how each one is oriented:
	 * - `in-place`: two lobes at right angles, each drawn as it sits in the
	 *   heart (the flettedehjerter.dk layout: one lying with its round end left,
	 *   one standing with it up). The standing lobe is the right lobe, the lying
	 *   one the left, and both are read as seen (in the mirror when the lying
	 *   one points right: `mirrored`). With neither standing, the lobe whose ear
	 *   points 90° anticlockwise of the other's is the left lobe.
	 * - `side-by-side`: two lobes pointing the same way (the site's own template
	 *   page: both standing). The first in reading order is the left lobe; it is
	 *   read as the site prints it (its across-axis is the square's y), the
	 *   other as seen.
	 * - `single`: one lobe; both lobes are cut from it (a mirror-symmetric heart,
	 *   as the site prints a heart whose lobes share a template).
	 */
	layout: 'in-place' | 'side-by-side' | 'single';
	/**
	 * An in-place page drawn mirrored: the standing lobe's ear up but the lying
	 * lobe's to the right (and its preview heart likewise). Both lobes are then
	 * read in the mirror, which is the heart the page shows from its other side.
	 */
	mirrored: boolean;
	lobes: TemplateLobeRead[];
	/** Short notes on anything the reader was unsure of. */
	notes: string[];
}

// ----------------------------------------------------------------------------
// Fields
// ----------------------------------------------------------------------------

/** A scalar picture. */
type Field = { w: number; h: number; d: Float32Array };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function sample(f: Field, x: number, y: number): number {
	if (!(x >= 0 && y >= 0 && x <= f.w - 1 && y <= f.h - 1)) return 0;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = x0 + 1 < f.w ? x0 + 1 : x0;
	const y1 = y0 + 1 < f.h ? y0 + 1 : y0;
	const fx = x - x0;
	const fy = y - y0;
	const d = f.d;
	const a = d[y0 * f.w + x0] + (d[y0 * f.w + x1] - d[y0 * f.w + x0]) * fx;
	const b = d[y1 * f.w + x0] + (d[y1 * f.w + x1] - d[y1 * f.w + x0]) * fx;
	return a + (b - a) * fy;
}

/** Luminance (0–255, on white where transparent), averaged down by an integer factor. */
function luminance(img: TemplatePixels, factor: number): Field {
	const w = Math.floor(img.width / factor);
	const h = Math.floor(img.height / factor);
	const d = new Float32Array(w * h);
	const src = img.data;
	const area = factor * factor;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let sum = 0;
			for (let dy = 0; dy < factor; dy++) {
				let i = ((y * factor + dy) * img.width + x * factor) * 4;
				for (let dx = 0; dx < factor; dx++, i += 4) {
					const alpha = src[i + 3] / 255;
					const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
					sum += lum * alpha + 255 * (1 - alpha);
				}
			}
			d[y * w + x] = sum / area;
		}
	}
	return { w, h, d };
}

/**
 * Ink: how much darker each pixel is than the paper around it, 0–1.
 *
 * The paper is the brightest of each block, spread over its neighbours (so a
 * drawn line or a small dark patch does not count as paper) and smoothed.
 */
function inkField(lum: Field): Field {
	const { w, h } = lum;
	const block = Math.max(8, Math.round(Math.max(w, h) / 64));
	const bw = Math.ceil(w / block);
	const bh = Math.ceil(h / block);
	const bright = new Float32Array(bw * bh);
	for (let by = 0; by < bh; by++) {
		for (let bx = 0; bx < bw; bx++) {
			// A high percentile rather than the maximum, so noise does not lift the paper.
			const values: number[] = [];
			for (let y = by * block; y < Math.min(h, (by + 1) * block); y += 2) {
				for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x += 2) values.push(lum.d[y * w + x]);
			}
			values.sort((a, b) => a - b);
			bright[by * bw + bx] = values.length ? values[Math.floor(values.length * 0.95)] : 255;
		}
	}
	// Spread the bright blocks two blocks each way, then smooth one block.
	const spread = new Float32Array(bw * bh);
	for (let by = 0; by < bh; by++) {
		for (let bx = 0; bx < bw; bx++) {
			let m = 0;
			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const x = bx + dx;
					const y = by + dy;
					if (x >= 0 && y >= 0 && x < bw && y < bh) m = Math.max(m, bright[y * bw + x]);
				}
			}
			spread[by * bw + bx] = m;
		}
	}
	const smooth = new Float32Array(bw * bh);
	for (let by = 0; by < bh; by++) {
		for (let bx = 0; bx < bw; bx++) {
			let s = 0;
			let n = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const x = bx + dx;
					const y = by + dy;
					if (x >= 0 && y >= 0 && x < bw && y < bh) {
						s += spread[y * bw + x];
						n++;
					}
				}
			}
			smooth[by * bw + bx] = s / n;
		}
	}
	const paper: Field = { w: bw, h: bh, d: smooth };
	const d = new Float32Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const bg = sample(paper, Math.min(bw - 1, Math.max(0, (x + 0.5) / block - 0.5)), Math.min(bh - 1, Math.max(0, (y + 0.5) / block - 0.5)));
			d[y * w + x] = clamp01((bg - lum.d[y * w + x]) / Math.max(60, bg - 20));
		}
	}
	return { w, h, d };
}

/** The q-quantile of the values (a sample of at most ~20 000 of them). */
function quantile(values: ArrayLike<number>, q: number): number {
	const step = Math.max(1, Math.floor(values.length / 20000));
	const picked: number[] = [];
	for (let i = 0; i < values.length; i += step) picked.push(values[i]);
	picked.sort((a, b) => a - b);
	return picked.length ? picked[Math.min(picked.length - 1, Math.floor(q * picked.length))] : 0;
}

/** A binary picture of where the ink is, at 1/`factor` scale (max-pooled, so thin lines survive). */
function inkMask(ink: Field, factor: number, threshold: number): { w: number; h: number; d: Uint8Array } {
	const w = Math.ceil(ink.w / factor);
	const h = Math.ceil(ink.h / factor);
	const d = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let m = 0;
			for (let yy = y * factor; yy < Math.min(ink.h, (y + 1) * factor); yy++) {
				for (let xx = x * factor; xx < Math.min(ink.w, (x + 1) * factor); xx++) m = Math.max(m, ink.d[yy * ink.w + xx]);
			}
			d[y * w + x] = m >= threshold ? 1 : 0;
		}
	}
	return { w, h, d };
}

/** Square dilation by `r` (separable max). */
function dilate(m: { w: number; h: number; d: Uint8Array }, r: number): Uint8Array {
	const { w, h } = m;
	const tmp = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		let last = -Infinity;
		// Two sweeps per row: the distance to the nearest set pixel on either side.
		for (let x = 0; x < w; x++) {
			if (m.d[y * w + x]) last = x;
			if (x - last <= r) tmp[y * w + x] = 1;
		}
		last = Infinity;
		for (let x = w - 1; x >= 0; x--) {
			if (m.d[y * w + x]) last = x;
			if (last - x <= r) tmp[y * w + x] = 1;
		}
	}
	const out = new Uint8Array(w * h);
	for (let x = 0; x < w; x++) {
		let last = -Infinity;
		for (let y = 0; y < h; y++) {
			if (tmp[y * w + x]) last = y;
			if (y - last <= r) out[y * w + x] = 1;
		}
		last = Infinity;
		for (let y = h - 1; y >= 0; y--) {
			if (tmp[y * w + x]) last = y;
			if (last - y <= r) out[y * w + x] = 1;
		}
	}
	return out;
}

// ----------------------------------------------------------------------------
// Lobe shape: a rectangle with a half disc on one end
// ----------------------------------------------------------------------------

/**
 * A lobe's shape in a frame centred on (cx, cy): `s` runs along the unit vector
 * at angle `theta` (toward the ear), `t` across it. The fold is at s = s0, the
 * ear's tip at s = s1, the centre line at t = t0, the width is w; the ear's
 * radius is w/2, so the ear's base is at s1 - w/2.
 */
type Shape = { cx: number; cy: number; theta: number; t0: number; w: number; s0: number; s1: number };

function shapeArea(p: Shape, round: boolean): number {
	const r = p.w / 2;
	if (!round) return p.w * Math.max(0, p.s1 - p.s0);
	return p.w * Math.max(0, p.s1 - r - p.s0) + (Math.PI * r * r) / 2;
}

/** IoU of the shape with the silhouette's pixels `xs`, `ys` (each standing for `weight` pixels). */
function shapeIoU(p: Shape, round: boolean, xs: Float32Array, ys: Float32Array, weight: number, total: number): number {
	const ax = Math.cos(p.theta);
	const ay = Math.sin(p.theta);
	const r = p.w / 2;
	const base = p.s1 - r;
	if (p.w <= 0 || p.s1 - p.s0 <= (round ? r : 0)) return 0;
	let inside = 0;
	for (let i = 0; i < xs.length; i++) {
		const dx = xs[i] - p.cx;
		const dy = ys[i] - p.cy;
		const s = dx * ax + dy * ay;
		const t = -dx * ay + dy * ax - p.t0;
		if (t < -r || t > r || s < p.s0 || s > p.s1) continue;
		if (round && s > base) {
			const ds = s - base;
			if (ds * ds + t * t > r * r) continue;
		}
		inside++;
	}
	const inter = inside * weight;
	return inter / (total + shapeArea(p, round) - inter);
}

/** Improve the shape by coordinate search on IoU. */
function refineShape(p: Shape, round: boolean, xs: Float32Array, ys: Float32Array, weight: number, total: number): { shape: Shape; iou: number } {
	let best = { ...p };
	let bestIoU = shapeIoU(best, round, xs, ys, weight, total);
	const keys: Array<keyof Shape> = ['theta', 't0', 'w', 's0', 's1'];
	let step = 0.04;
	for (let level = 0; level < 6; level++, step /= 2) {
		for (let pass = 0; pass < 3; pass++) {
			let improved = false;
			for (const key of keys) {
				const delta = key === 'theta' ? step * 0.5 : step * best.w;
				for (const sign of [1, -1]) {
					const trial = { ...best, [key]: best[key] + sign * delta };
					const iou = shapeIoU(trial, round, xs, ys, weight, total);
					if (iou > bestIoU + 1e-6) {
						best = trial;
						bestIoU = iou;
						improved = true;
						break;
					}
				}
			}
			if (!improved) break;
		}
	}
	return { shape: best, iou: bestIoU };
}

type Candidate = { shape: Shape; iou: number; rectIoU: number };

/** The lobe's shape fitted to one filled silhouette, or null when it is not one. */
function fitLobeShape(px: Int32Array, w: number): Candidate | null {
	const n = px.length;
	let mx = 0;
	let my = 0;
	for (let i = 0; i < n; i++) {
		mx += px[i] % w;
		my += Math.floor(px[i] / w);
	}
	mx /= n;
	my /= n;
	let sxx = 0;
	let syy = 0;
	let sxy = 0;
	for (let i = 0; i < n; i++) {
		const dx = (px[i] % w) - mx;
		const dy = Math.floor(px[i] / w) - my;
		sxx += dx * dx;
		syy += dy * dy;
		sxy += dx * dy;
	}
	const major = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	// At most ~20 000 pixels, picked at random (every k-th pixel of a row-ordered
	// list would line up in columns and bias the fit), stand for the silhouette.
	const m = Math.min(n, 20000);
	const xs = new Float32Array(m);
	const ys = new Float32Array(m);
	let seed = 12345;
	for (let j = 0; j < m; j++) {
		let i = j;
		if (m < n) {
			seed = (seed * 1103515245 + 12345) >>> 0;
			i = Math.floor((seed / 4294967296) * n);
		}
		xs[j] = px[i] % w;
		ys[j] = Math.floor(px[i] / w);
	}
	const weight = n / m;
	let best: Candidate | null = null;
	for (const theta of [major, major + Math.PI / 2, major + Math.PI, major - Math.PI / 2]) {
		const ax = Math.cos(theta);
		const ay = Math.sin(theta);
		const ss: number[] = [];
		const ts: number[] = [];
		for (let i = 0; i < m; i++) {
			const dx = xs[i] - mx;
			const dy = ys[i] - my;
			ss.push(dx * ax + dy * ay);
			ts.push(-dx * ay + dy * ax);
		}
		ss.sort((a, b) => a - b);
		ts.sort((a, b) => a - b);
		const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
		const t0 = (q(ts, 0.003) + q(ts, 0.997)) / 2;
		const width = q(ts, 0.997) - q(ts, 0.003) + 1;
		const s0 = q(ss, 0.003) - 0.5;
		const s1 = q(ss, 0.997) + 0.5;
		if (width < 8 || s1 - s0 - width / 2 < 0.3 * width) continue;
		const start: Shape = { cx: mx, cy: my, theta, t0, w: width, s0, s1 };
		const fit = refineShape(start, true, xs, ys, weight, n);
		if (!best || fit.iou > best.iou) best = { shape: fit.shape, iou: fit.iou, rectIoU: 0 };
	}
	if (!best) return null;
	// The same silhouette as a plain rectangle: a lobe must be clearly rounder.
	best.rectIoU = refineShape(best.shape, false, xs, ys, weight, n).iou;
	return best;
}

/** Filled silhouettes of the connected drawings in a binary picture, largest first. */
type Silhouette = { pixels: Int32Array; filled: Int32Array };

function filledComponents(mask: Uint8Array, w: number, h: number, minSide: number): Silhouette[] {
	const label = new Int32Array(w * h).fill(-1);
	const out: Silhouette[] = [];
	const stack = new Int32Array(w * h);
	let next = 0;
	for (let start = 0; start < w * h; start++) {
		if (!mask[start] || label[start] >= 0) continue;
		const id = next++;
		let top = 0;
		stack[top++] = start;
		label[start] = id;
		let x0 = w;
		let y0 = h;
		let x1 = -1;
		let y1 = -1;
		while (top) {
			const p = stack[--top];
			const x = p % w;
			const y = (p - x) / w;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const xx = x + dx;
					const yy = y + dy;
					if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
					const q = yy * w + xx;
					if (mask[q] && label[q] < 0) {
						label[q] = id;
						stack[top++] = q;
					}
				}
			}
		}
		if (x1 - x0 + 1 < minSide || y1 - y0 + 1 < minSide) continue;
		// Fill the holes: everything in the box the outside cannot reach.
		const bw = x1 - x0 + 3;
		const bh = y1 - y0 + 3;
		const outside = new Uint8Array(bw * bh);
		const inBox = (bx: number, by: number) => {
			const x = bx + x0 - 1;
			const y = by + y0 - 1;
			return x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === id;
		};
		let t2 = 0;
		const queue = new Int32Array(bw * bh);
		for (let bx = 0; bx < bw; bx++) {
			for (const by of [0, bh - 1]) {
				const q = by * bw + bx;
				if (!outside[q] && !inBox(bx, by)) {
					outside[q] = 1;
					queue[t2++] = q;
				}
			}
		}
		for (let by = 0; by < bh; by++) {
			for (const bx of [0, bw - 1]) {
				const q = by * bw + bx;
				if (!outside[q] && !inBox(bx, by)) {
					outside[q] = 1;
					queue[t2++] = q;
				}
			}
		}
		let head = 0;
		while (head < t2) {
			const q = queue[head++];
			const bx = q % bw;
			const by = (q - bx) / bw;
			const near = [q - 1, q + 1, q - bw, q + bw];
			const ok = [bx > 0, bx < bw - 1, by > 0, by < bh - 1];
			for (let k = 0; k < 4; k++) {
				const r = near[k];
				if (!ok[k] || outside[r]) continue;
				if (inBox(r % bw, (r - (r % bw)) / bw)) continue;
				outside[r] = 1;
				queue[t2++] = r;
			}
		}
		const filled: number[] = [];
		for (let by = 1; by < bh - 1; by++) {
			for (let bx = 1; bx < bw - 1; bx++) {
				if (!outside[by * bw + bx]) filled.push((by + y0 - 1) * w + (bx + x0 - 1));
			}
		}
		// A lobe is convex, so its hull is its silhouette even when the outline is
		// open (a dashed fold, a gap where the ear meets the side). The filled
		// drawing is kept when it covers its hull: it is not swollen by a stray
		// dimension line or a label touching the outline.
		const hull = hullPixels(label, id, w, x0, y0, x1, y1);
		const holes = Int32Array.from(filled);
		out.push({ pixels: filled.length >= 0.85 * hull.length ? holes : hull, filled: holes });
	}
	return out.sort((a, b) => b.pixels.length - a.pixels.length);
}

/**
 * A filled drawing that is not one lobe may be two touching ones (a label laid
 * across both outlines, two lobes drawn edge to edge): an opening by `r` cuts
 * the thin bridges, and each piece left is tried on its own.
 */
function splitByOpening(filled: Int32Array, w: number, r: number): Int32Array[] {
	let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
	for (const p of filled) {
		const x = p % w;
		const y = (p - x) / w;
		if (x < x0) x0 = x;
		if (x > x1) x1 = x;
		if (y < y0) y0 = y;
		if (y > y1) y1 = y;
	}
	const pad = r + 1;
	const bw = x1 - x0 + 1 + 2 * pad;
	const bh = y1 - y0 + 1 + 2 * pad;
	const box = { w: bw, h: bh, d: new Uint8Array(bw * bh) };
	for (const p of filled) {
		const x = p % w;
		const y = (p - x) / w;
		box.d[(y - y0 + pad) * bw + (x - x0 + pad)] = 1;
	}
	// Erode (dilate the outside), then dilate back.
	const outside = { w: bw, h: bh, d: box.d.map((v) => 1 - v) };
	const eroded = dilate(outside, r).map((v) => 1 - v);
	const opened = dilate({ w: bw, h: bh, d: eroded }, r);
	const label = new Int32Array(bw * bh).fill(-1);
	const pieces: Int32Array[] = [];
	const stack = new Int32Array(bw * bh);
	for (let start = 0; start < bw * bh; start++) {
		if (!opened[start] || !box.d[start] || label[start] >= 0) continue;
		const id = pieces.length;
		const members: number[] = [];
		let top = 0;
		stack[top++] = start;
		label[start] = id;
		while (top) {
			const q = stack[--top];
			const x = q % bw;
			const y = (q - x) / bw;
			members.push((y - pad + y0) * w + (x - pad + x0));
			for (const n of [q - 1, q + 1, q - bw, q + bw]) {
				if (n < 0 || n >= bw * bh || !opened[n] || !box.d[n] || label[n] >= 0) continue;
				if ((n === q - 1 && x === 0) || (n === q + 1 && x === bw - 1)) continue;
				label[n] = id;
				stack[top++] = n;
			}
		}
		pieces.push(Int32Array.from(members));
	}
	return pieces.filter((piece) => piece.length >= 0.1 * filled.length).sort((a, b) => b.length - a.length);
}

/** The pixels whose centres lie inside the convex hull of component `id` (box x0..x1, y0..y1). */
function hullPixels(label: Int32Array, id: number, w: number, x0: number, y0: number, x1: number, y1: number): Int32Array {
	const pts: Vec[] = [];
	for (let y = y0; y <= y1; y++) {
		let lo = -1;
		let hi = -1;
		for (let x = x0; x <= x1; x++) {
			if (label[y * w + x] !== id) continue;
			if (lo < 0) lo = x;
			hi = x;
		}
		if (lo < 0) continue;
		pts.push({ x: lo, y }, { x: hi + 1, y }, { x: lo, y: y + 1 }, { x: hi + 1, y: y + 1 });
	}
	pts.sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Vec[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper: Vec[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	const poly = [...lower.slice(0, -1), ...upper.slice(0, -1)];
	const out: number[] = [];
	for (let y = y0; y <= y1; y++) {
		const cy = y + 0.5;
		let lo = Infinity;
		let hi = -Infinity;
		for (let i = 0; i < poly.length; i++) {
			const a = poly[i];
			const b = poly[(i + 1) % poly.length];
			if ((a.y <= cy) === (b.y <= cy)) continue;
			const x = a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x);
			if (x < lo) lo = x;
			if (x > hi) hi = x;
		}
		for (let x = Math.max(x0, Math.ceil(lo - 0.5)); x <= Math.min(x1, Math.floor(hi - 0.5)); x++) out.push(y * w + x);
	}
	return Int32Array.from(out);
}

// ----------------------------------------------------------------------------
// Outline on the ink
// ----------------------------------------------------------------------------

type Hit = { offset: number; width: number; peak: number };

/** A lobe's outline sharpened on the ink, in field pixels. */
type Outline = {
	/** Unit vectors: toward the ear, and across (side A at -, side B at +). */
	a: Vec;
	b: Vec;
	/** Corners: ear base on side A, on side B, fold on side B, fold on side A. */
	corners: [Vec, Vec, Vec, Vec];
	ear: { center: Vec; radius: number };
	/** The outline's stroke: width in pixels and darkness. */
	stroke: number;
	darkness: number;
	/** Whether the ear's base is drawn as a line. */
	baseDrawn: boolean;
	/** 0–1: how much of the outline was found on ink, and how well its parts agree. */
	support: number;
};

/** Where two lines meet: t = α₁ + β₁ s and s = α₂ + β₂ t. */
function meet(side: { a: number; b: number }, end: { a: number; b: number }): { s: number; t: number } {
	const s = (end.a + end.b * side.a) / (1 - side.b * end.b);
	return { s, t: side.a + side.b * s };
}

/**
 * Every stroke met walking from `p` along `dir` for `length` pixels, outermost first: the
 * ink-weighted centre of each run above `threshold`, how wide it is and how dark.
 * Runs wider than `maxWidth` (a line along the walk, not across it) are left out.
 */
function strokesAlong(ink: Field, p: Vec, dir: Vec, length: number, threshold: number, maxWidth: number): Hit[] {
	const step = 0.5;
	const n = Math.max(2, Math.ceil(length / step));
	const values = new Float32Array(n + 1);
	for (let i = 0; i <= n; i++) values[i] = sample(ink, p.x + dir.x * i * step, p.y + dir.y * i * step);
	const runs: Hit[] = [];
	for (let i = 0; i <= n; i++) {
		if (values[i] < threshold) continue;
		let j = i;
		let peak = 0;
		while (j <= n && values[j] >= threshold) peak = Math.max(peak, values[j++]);
		let sw = 0;
		let so = 0;
		for (let k = Math.max(0, i - 2); k < Math.min(n + 1, j + 2); k++) {
			const wgt = Math.max(0, values[k] - peak * 0.4);
			sw += wgt;
			so += wgt * k * step;
		}
		const width = (j - i) * step;
		// A run that starts or ends the walk is cut off: its centre is unknown.
		if (width <= maxWidth && i > 0 && j <= n) runs.push({ offset: sw > 0 ? so / sw : ((i + j - 1) / 2) * step, width, peak });
		i = j;
	}
	return runs;
}

/** A candidate point for a fit: where a walk met a stroke, which walk, and how far in. */
type Candidate2 = { x: number; y: number; walk: number; hit: Hit };

let ransacSeed = 1;
const ransacRandom = () => ((ransacSeed = (ransacSeed * 1103515245 + 12345) >>> 0) / 4294967296);

/**
 * The line y = a + b·x that the most walks agree on (each walk counts once, by
 * its candidate nearest the line, within `tol`), found by trying lines through
 * pairs of candidates. Among lines nearly as well supported, the one met first
 * from outside wins, so a parallel cut just inside the outline does not.
 */
function ransacLine(cands: Candidate2[], walks: number, tol: number, outermost: boolean): { a: number; b: number; inliers: Candidate2[] } | null {
	if (cands.length < 4) return null;
	const byWalk: Candidate2[][] = Array.from({ length: walks }, () => []);
	for (const c of cands) byWalk[c.walk].push(c);
	const score = (a: number, b: number) => {
		let support = 0;
		let depth = 0;
		const inliers: Candidate2[] = [];
		for (const list of byWalk) {
			let best: Candidate2 | null = null;
			let bestRes = tol;
			for (const c of list) {
				const res = Math.abs(c.y - (a + b * c.x));
				if (res <= bestRes) {
					bestRes = res;
					best = c;
				}
			}
			if (best) {
				support++;
				depth += best.hit.offset;
				inliers.push(best);
			}
		}
		return { support, depth: support ? depth / support : Infinity, inliers };
	};
	const xs = cands.map((c) => c.x);
	const span = Math.max(...xs) - Math.min(...xs);
	const tries: Array<{ a: number; b: number; support: number; depth: number; inliers: Candidate2[] }> = [];
	const n = cands.length;
	const pairs = (n * (n - 1)) / 2;
	const attempt = (i: number, j: number) => {
		const p = cands[i];
		const q = cands[j];
		if (p.walk === q.walk || Math.abs(p.x - q.x) < 0.25 * span) return;
		const b = (q.y - p.y) / (q.x - p.x);
		const a = p.y - b * p.x;
		tries.push({ a, b, ...score(a, b) });
	};
	if (pairs <= 600) {
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) attempt(i, j);
	} else {
		for (let k = 0; k < 600; k++) attempt(Math.floor(ransacRandom() * n), Math.floor(ransacRandom() * n));
	}
	if (!tries.length) return null;
	const top = Math.max(...tries.map((t) => t.support));
	if (top < 4) return null;
	const good = tries.filter((t) => t.support >= Math.max(4, (outermost ? 0.85 : 1) * top));
	good.sort((p, q) => (outermost ? p.depth - q.depth : q.support - p.support));
	let fit = good[0];
	// Least squares on the inliers, twice.
	for (let iter = 0; iter < 2; iter++) {
		const pts = fit.inliers;
		let sx = 0, sy = 0, sxx = 0, sxy = 0;
		for (const p of pts) {
			sx += p.x;
			sy += p.y;
			sxx += p.x * p.x;
			sxy += p.x * p.y;
		}
		const m = pts.length;
		const den = m * sxx - sx * sx;
		if (m < 3 || Math.abs(den) < 1e-9) break;
		const b = (m * sxy - sx * sy) / den;
		const a = (sy - b * sx) / m;
		const again = score(a, b);
		if (again.support < 0.9 * fit.support) break;
		fit = { a, b, ...again };
	}
	return { a: fit.a, b: fit.b, inliers: fit.inliers };
}

/** Kåsa's circle through points (least squares). */
function circleThrough(pts: Vec[]): { c: Vec; r: number } | null {
	if (pts.length < 3) return null;
	let mx = 0;
	let my = 0;
	for (const p of pts) {
		mx += p.x;
		my += p.y;
	}
	mx /= pts.length;
	my /= pts.length;
	let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
	for (const p of pts) {
		const u = p.x - mx;
		const v = p.y - my;
		suu += u * u;
		svv += v * v;
		suv += u * v;
		suuu += u * u * u;
		svvv += v * v * v;
		suvv += u * v * v;
		svuu += v * u * u;
	}
	const det = suu * svv - suv * suv;
	if (Math.abs(det) < 1e-9) return null;
	const b1 = 0.5 * (suuu + suvv);
	const b2 = 0.5 * (svvv + svuu);
	const uc = (b1 * svv - b2 * suv) / det;
	const vc = (b2 * suu - b1 * suv) / det;
	return { c: { x: uc + mx, y: vc + my }, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / pts.length) };
}

/** The circle the most walks agree on, as `ransacLine` does for lines. */
function ransacCircle(cands: Candidate2[], walks: number, tol: number): { c: Vec; r: number; inliers: Candidate2[] } | null {
	if (cands.length < 6) return null;
	const byWalk: Candidate2[][] = Array.from({ length: walks }, () => []);
	for (const c of cands) byWalk[c.walk].push(c);
	const score = (c: Vec, r: number) => {
		let support = 0;
		let depth = 0;
		const inliers: Candidate2[] = [];
		for (const list of byWalk) {
			let best: Candidate2 | null = null;
			let bestRes = tol;
			for (const q of list) {
				const res = Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - r);
				if (res <= bestRes) {
					bestRes = res;
					best = q;
				}
			}
			if (best) {
				support++;
				depth += best.hit.offset;
				inliers.push(best);
			}
		}
		return { support, depth: support ? depth / support : Infinity, inliers };
	};
	const tries: Array<{ c: Vec; r: number; support: number; depth: number; inliers: Candidate2[] }> = [];
	const n = cands.length;
	for (let k = 0; k < 500; k++) {
		const picks = [0, 1, 2].map(() => cands[Math.floor(ransacRandom() * n)]);
		if (new Set(picks.map((p) => p.walk)).size < 3) continue;
		const walksPicked = picks.map((p) => p.walk).sort((x, y) => x - y);
		if (walksPicked[2] - walksPicked[0] < walks / 3) continue;
		const circle = circleThrough(picks);
		if (!circle) continue;
		tries.push({ ...circle, ...score(circle.c, circle.r) });
	}
	if (!tries.length) return null;
	const top = Math.max(...tries.map((t) => t.support));
	if (top < 6) return null;
	const good = tries.filter((t) => t.support >= Math.max(6, 0.85 * top));
	good.sort((p, q) => p.depth - q.depth);
	let fit = good[0];
	for (let iter = 0; iter < 2; iter++) {
		const circle = circleThrough(fit.inliers);
		if (!circle) break;
		const again = score(circle.c, circle.r);
		if (again.support < 0.9 * fit.support) break;
		fit = { ...circle, ...again };
	}
	return { c: fit.c, r: fit.r, inliers: fit.inliers };
}

function sharpenOutline(ink: Field, shape: Shape, bias: number, debug?: (m: string) => void): Outline | null {
	const a = { x: Math.cos(shape.theta), y: Math.sin(shape.theta) };
	const b = { x: -a.y, y: a.x };
	const at = (s: number, t: number): Vec => ({ x: shape.cx + s * a.x + t * b.x, y: shape.cy + s * a.y + t * b.y });
	let { t0, w, s0, s1 } = shape;
	let r = w / 2;
	let stroke = 2;
	let darkness = 0.5;
	let sides: Array<{ a: number; b: number }> = [];
	let fold: { a: number; b: number } | null = null;
	let circle: { c: Vec; r: number } | null = null;
	let support = 0;
	let threshold = 0.2;
	ransacSeed = 1;
	for (let pass = 0; pass < 2; pass++) {
		// The first estimate lies outside the stroke (it is fitted to the closed,
		// filled drawing), so the first pass starts a little outside it and walks
		// well in; the second starts from the stroke itself. Starting far outside
		// would meet the next lobe's outline on a page where they nearly touch.
		const outward = pass === 0 ? 0.5 * bias + 3 + 0.008 * w : Math.max(4, 2.5 * stroke + 2);
		const reach = outward + (pass === 0 ? bias + Math.max(0.03 * w, 6) : Math.max(4, 2.5 * stroke + 2));
		const maxWidth = Math.max(4, pass === 0 ? 0.03 * w : 2.5 * stroke + 2);
		const tol = pass === 0 ? Math.max(2, stroke) : Math.max(1, 0.75 * stroke);
		const h = s1 - r - s0;
		const hits: Hit[] = [];
		let tried = 0;
		sides = [];
		for (const sign of [-1, 1]) {
			const cands: Candidate2[] = [];
			for (let i = 0; i < 40; i++) {
				const s = s0 + (0.05 + (0.9 * i) / 39) * h;
				const from = at(s, t0 + sign * (r + outward));
				for (const hit of strokesAlong(ink, from, { x: -sign * b.x, y: -sign * b.y }, reach, threshold, maxWidth)) {
					cands.push({ x: s, y: t0 + sign * (r + outward - hit.offset), walk: i, hit });
				}
			}
			tried += 40;
			const line = ransacLine(cands, 40, tol, true);
			if (!line) {
				debug?.(`pass ${pass}: side ${sign}: ${cands.length} candidates, no line`);
				return null;
			}
			sides.push(line);
			hits.push(...line.inliers.map((c) => c.hit));
		}
		const foldCands: Candidate2[] = [];
		for (let i = 0; i < 40; i++) {
			const t = t0 + (-0.44 + (0.88 * i) / 39) * w;
			for (const hit of strokesAlong(ink, at(s0 - outward, t), a, reach, threshold, maxWidth)) {
				foldCands.push({ x: t, y: s0 - outward + hit.offset, walk: i, hit });
			}
		}
		tried += 40;
		const foldLine = ransacLine(foldCands, 40, tol, true);
		if (!foldLine) {
			debug?.(`pass ${pass}: fold: ${foldCands.length} candidates, no line`);
			return null;
		}
		fold = foldLine;
		hits.push(...foldLine.inliers.map((c) => c.hit));
		const arcCands: Candidate2[] = [];
		const centre = { s: s1 - r, t: t0 };
		for (let i = 0; i < 31; i++) {
			const phi = ((-72 + (144 * i) / 30) * Math.PI) / 180;
			const ds = Math.cos(phi);
			const dt = Math.sin(phi);
			const from = { s: centre.s + ds * (r + outward), t: centre.t + dt * (r + outward) };
			for (const hit of strokesAlong(ink, at(from.s, from.t), { x: -(ds * a.x + dt * b.x), y: -(ds * a.y + dt * b.y) }, reach, threshold, maxWidth)) {
				arcCands.push({ x: from.s - ds * hit.offset, y: from.t - dt * hit.offset, walk: i, hit });
			}
		}
		tried += 31;
		const arc = ransacCircle(arcCands, 31, tol);
		if (!arc) {
			debug?.(`pass ${pass}: arc: ${arcCands.length} candidates, no circle`);
			return null;
		}
		circle = arc;
		hits.push(...arc.inliers.map((c) => c.hit));
		support = hits.length / tried;
		const widths = hits.map((x) => x.width).sort((x, y) => x - y);
		const peaks = hits.map((x) => x.peak).sort((x, y) => x - y);
		if (widths.length) stroke = Math.max(1, widths[Math.floor(widths.length / 2)]);
		if (peaks.length) darkness = peaks[Math.floor(peaks.length / 2)];
		threshold = Math.max(0.12, Math.min(0.3, darkness * 0.4));
		// The next pass starts from what this one found.
		const tA = sides[0].a + sides[0].b * (s0 + h / 2);
		const tB = sides[1].a + sides[1].b * (s0 + h / 2);
		t0 = (tA + tB) / 2;
		w = tB - tA;
		r = w / 2;
		s0 = fold.a + fold.b * t0;
		s1 = circle.c.x + r;
	}
	if (!fold || !circle || sides.length !== 2) return null;
	// The ear's base: the drawn line when there is one near the circle's centre, else the centre.
	const sBase = circle.c.x;
	// Drawn ears are not always true half discs, so the line may sit a little off the centre.
	const reach = Math.max(4, 0.08 * w);
	const baseCands: Candidate2[] = [];
	for (let i = 0; i < 30; i++) {
		const t = t0 + (-0.42 + (0.84 * i) / 29) * w;
		for (const hit of strokesAlong(ink, at(sBase - reach, t), a, 2 * reach, Math.max(0.12, 0.6 * threshold), 2.5 * stroke + 2)) {
			baseCands.push({ x: t, y: sBase - reach + hit.offset, walk: i, hit });
		}
	}
	const slope = -(sides[0].b + sides[1].b) / 2;
	let base: { a: number; b: number } = { a: sBase - slope * circle.c.y, b: slope };
	let baseDrawn = false;
	const drawn = ransacLine(baseCands, 30, Math.max(1, 0.75 * stroke), false);
	debug?.(`ear base: circle centre ${sBase.toFixed(1)}, r ${circle.r.toFixed(1)} (w/2 ${(w / 2).toFixed(1)}), drawn ${drawn ? `${(drawn.a + drawn.b * t0).toFixed(1)} with ${drawn.inliers.length}/30` : 'none'}`);
	if (drawn && drawn.inliers.length >= 18 && Math.abs(drawn.a + drawn.b * t0 - sBase) < 0.08 * w && Math.abs(drawn.b) < 0.1) {
		base = drawn;
		baseDrawn = true;
	}
	const corner = (side: { a: number; b: number }, end: { a: number; b: number }) => {
		const m = meet(side, end);
		return at(m.s, m.t);
	};
	const corners: [Vec, Vec, Vec, Vec] = [corner(sides[0], base), corner(sides[1], base), corner(sides[1], fold), corner(sides[0], fold)];
	// How well the parts agree: the circle's radius against half the width.
	const roundness = 1 - Math.min(1, Math.abs(circle.r - w / 2) / (0.1 * w));
	return {
		a,
		b,
		corners,
		ear: { center: at(circle.c.x, circle.c.y), radius: circle.r },
		stroke,
		darkness,
		baseDrawn,
		support: Math.min(1, support) * (0.5 + 0.5 * roundness)
	};
}

// ----------------------------------------------------------------------------
// The square's own frame
// ----------------------------------------------------------------------------

/** A projective map from the unit square to a quad, and back. */
type Homography = { m: number[]; inv: number[] };

function squareToQuad(q: [Vec, Vec, Vec, Vec]): Homography {
	// Corners of the unit square (0,0), (1,0), (1,1), (0,1) go to q[0..3] (Heckbert).
	const [p0, p1, p2, p3] = q;
	const dx1 = p1.x - p2.x;
	const dx2 = p3.x - p2.x;
	const dx3 = p0.x - p1.x + p2.x - p3.x;
	const dy1 = p1.y - p2.y;
	const dy2 = p3.y - p2.y;
	const dy3 = p0.y - p1.y + p2.y - p3.y;
	let g = 0;
	let h = 0;
	if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
		const det = dx1 * dy2 - dx2 * dy1;
		g = (dx3 * dy2 - dx2 * dy3) / det;
		h = (dx1 * dy3 - dx3 * dy1) / det;
	}
	const m = [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h, 1];
	const [a, b, c, d, e, f, gg, hh, i] = m;
	const A = e * i - f * hh;
	const B = -(d * i - f * gg);
	const C = d * hh - e * gg;
	const det = a * A + b * B + c * C;
	const inv = [A, -(b * i - c * hh), b * f - c * e, B, a * i - c * gg, -(a * f - c * d), C, -(a * hh - b * gg), a * e - b * d].map((v) => v / det);
	return { m, inv };
}

function apply(m: number[], u: number, v: number): Vec {
	const z = m[6] * u + m[7] * v + m[8];
	return { x: (m[0] * u + m[1] * v + m[2]) / z, y: (m[3] * u + m[4] * v + m[5]) / z };
}

/** Exact Euclidean squared distance to the nearest set cell (Felzenszwalb–Huttenlocher). */
function distanceSquared(feature: Uint8Array, w: number, h: number): Float32Array {
	const INF = 1e20;
	const out = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) out[i] = feature[i] ? 0 : INF;
	const n = Math.max(w, h);
	const f = new Float64Array(n);
	const d = new Float64Array(n);
	const v = new Int32Array(n);
	const z = new Float64Array(n + 1);
	const pass = (len: number) => {
		let k = 0;
		v[0] = 0;
		z[0] = -INF;
		z[1] = INF;
		for (let q = 1; q < len; q++) {
			let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			while (s <= z[k]) {
				k--;
				s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			}
			k++;
			v[k] = q;
			z[k] = s;
			z[k + 1] = INF;
		}
		k = 0;
		for (let q = 0; q < len; q++) {
			while (z[k + 1] < q) k++;
			d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
		}
	};
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) f[y] = out[y * w + x];
		pass(h);
		for (let y = 0; y < h; y++) out[y * w + x] = d[y];
	}
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) f[x] = out[y * w + x];
		pass(w);
		for (let x = 0; x < w; x++) out[y * w + x] = d[x];
	}
	return out;
}

/**
 * The zero line of `f` (values at cell centres of a w × h grid) that runs from
 * the bottom row to the top row, by marching squares; null when there is none.
 */
function zeroLine(f: Float32Array, w: number, h: number): Vec[] | null {
	// Crossing points live on grid edges: horizontal edge (x,y)-(x+1,y) is 2·(y·w+x),
	// vertical edge (x,y)-(x,y+1) is 2·(y·w+x)+1.
	const links = new Map<number, number[]>();
	const link = (e1: number, e2: number) => {
		(links.get(e1) ?? links.set(e1, []).get(e1)!).push(e2);
		(links.get(e2) ?? links.set(e2, []).get(e2)!).push(e1);
	};
	const pos = (x: number, y: number) => f[y * w + x] > 0;
	for (let y = 0; y < h - 1; y++) {
		for (let x = 0; x < w - 1; x++) {
			const c0 = pos(x, y);
			const c1 = pos(x + 1, y);
			const c2 = pos(x + 1, y + 1);
			const c3 = pos(x, y + 1);
			const code = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0);
			if (code === 0 || code === 15) continue;
			const top = 2 * (y * w + x);
			const bottom = 2 * ((y + 1) * w + x);
			const left = 2 * (y * w + x) + 1;
			const right = 2 * (y * w + x + 1) + 1;
			const edges: number[] = [];
			if (c0 !== c1) edges.push(top);
			if (c1 !== c2) edges.push(right);
			if (c2 !== c3) edges.push(bottom);
			if (c3 !== c0) edges.push(left);
			if (edges.length === 2) link(edges[0], edges[1]);
			else if (edges.length === 4) {
				// A saddle: decide by the centre.
				const centre = (f[y * w + x] + f[y * w + x + 1] + f[(y + 1) * w + x + 1] + f[(y + 1) * w + x]) / 4 > 0;
				if (centre === c0) {
					link(top, right);
					link(bottom, left);
				} else {
					link(top, left);
					link(bottom, right);
				}
			}
		}
	}
	const point = (e: number): Vec => {
		const cell = e >> 1;
		const x = cell % w;
		const y = (cell - x) / w;
		const fa = f[y * w + x];
		if ((e & 1) === 0) {
			const fb = f[y * w + x + 1];
			return { x: x + fa / (fa - fb), y };
		}
		const fb = f[(y + 1) * w + x];
		return { x, y: y + fa / (fa - fb) };
	};
	const onRow = (e: number, row: number) => (e & 1) === 0 && Math.floor((e >> 1) / w) === row;
	let best: Vec[] | null = null;
	for (const [start, ends] of links) {
		if (ends.length !== 1 || !onRow(start, h - 1)) continue;
		const chain = [start];
		let prev = -1;
		let cur = start;
		for (;;) {
			const next = (links.get(cur) ?? []).find((e) => e !== prev);
			if (next === undefined || chain.length > 4 * w * h) break;
			chain.push(next);
			prev = cur;
			cur = next;
			if ((links.get(cur) ?? []).length === 1) break;
		}
		if (!onRow(cur, 0)) continue;
		if (!best || chain.length > best.length) best = chain.map(point);
	}
	return best;
}

type Piece = { area: number; top: boolean; bottom: boolean; sideA: boolean; sideB: boolean; firstU: number; minX: number; maxX: number };

/**
 * The paper inside a lobe's square (canonical ink `inkAt`, `cw` × `ch`) split
 * into pieces at `threshold`: the strips (pieces from the fold to the ear's
 * base, ordered across), the scrap cut off along either side, and how many
 * pieces reach only one edge (a broken cut, or two that touch).
 */
function segmentPaper(inkAt: Float32Array, cw: number, ch: number, threshold: number) {
	const paper = new Uint8Array(cw * ch);
	for (let i = 0; i < cw * ch; i++) paper[i] = inkAt[i] < threshold ? 1 : 0;
	// Pieces of paper (4-connected).
	const label = new Int32Array(cw * ch).fill(-1);
	const pieces: Piece[] = [];
	const stack = new Int32Array(cw * ch);
	for (let start = 0; start < cw * ch; start++) {
		if (!paper[start] || label[start] >= 0) continue;
		const id = pieces.length;
		const piece: Piece = { area: 0, top: false, bottom: false, sideA: false, sideB: false, firstU: Infinity, minX: Infinity, maxX: -1 };
		pieces.push(piece);
		let top = 0;
		stack[top++] = start;
		label[start] = id;
		while (top) {
			const p = stack[--top];
			const x = p % cw;
			const y = (p - x) / cw;
			piece.area++;
			if (y === 0) piece.top = true;
			if (x < piece.minX) piece.minX = x;
			if (x > piece.maxX) piece.maxX = x;
			if (x === 0) piece.sideA = true;
			if (x === cw - 1) piece.sideB = true;
			if (y === ch - 1) {
				piece.bottom = true;
				if (x < piece.firstU) piece.firstU = x;
			}
			if (x > 0 && paper[p - 1] && label[p - 1] < 0) {
				label[p - 1] = id;
				stack[top++] = p - 1;
			}
			if (x < cw - 1 && paper[p + 1] && label[p + 1] < 0) {
				label[p + 1] = id;
				stack[top++] = p + 1;
			}
			if (y > 0 && paper[p - cw] && label[p - cw] < 0) {
				label[p - cw] = id;
				stack[top++] = p - cw;
			}
			if (y < ch - 1 && paper[p + cw] && label[p + cw] < 0) {
				label[p + cw] = id;
				stack[top++] = p + cw;
			}
		}
	}
	const minArea = 0.002 * cw * ch;
	const strips = pieces
		.map((piece, id) => ({ ...piece, id }))
		.filter((piece) => piece.top && piece.bottom && piece.area >= minArea)
		.sort((p, q) => p.firstU - q.firstU);
	const isStrip = new Uint8Array(pieces.length);
	for (const strip of strips) isStrip[strip.id] = 1;
	// Paper cut off along a side: pieces against the side that are not strips (a
	// cut whose bumps touch the edge leaves a row of them). The cut that cuts
	// them off is a cut too, between them (and the side) and the first strip.
	const scrap = (side: 'sideA' | 'sideB') => {
		const ids = pieces.flatMap((piece, id) => (!isStrip[id] && piece[side] ? [id] : []));
		// A sliver along the side is the outline itself, a little inside the margin: not a cut.
		const deep = ids.some((id) => (side === 'sideA' ? pieces[id].maxX : cw - 1 - pieces[id].minX) >= 0.03 * cw);
		return deep && ids.reduce((sum, id) => sum + pieces[id].area, 0) >= 3 * minArea ? new Set(ids) : null;
	};
	const scrapA = strips.length ? scrap('sideA') : null;
	const scrapB = strips.length ? scrap('sideB') : null;
	const strayPieces = pieces.filter((piece, id) => piece.top !== piece.bottom && piece.area >= minArea && !scrapA?.has(id) && !scrapB?.has(id)).length;
	return { label, pieces, strips, scrapA, scrapB, strayPieces, threshold };
}

/** A lobe's cuts, read in its own frame: u across (side A → B), v from the ear's base (0) to the fold (1). */
type LobeCuts = {
	cuts: Vec[][];
	strayPieces: number;
	strips: number;
	inkShare: number;
	/** With no strips found: where (v, 0–1) the slits end when they all stop short of the ear's base. */
	cutsEnd?: number | null;
	/** Strokes leaving the fold that are no cut read: slits stopping inside the square. */
	danglingSlits?: number;
};

/**
 * Where the slits end, as v (0 at the ear's base, 1 at the fold), when they all
 * stop a little short of the ear's base — some books draw the ear taller than a
 * half disc and the square ends where the slits do. The first row from the top
 * from which on most rows are crossed by about as many strokes as the middle
 * of the square is; null when there is no such row in the top quarter.
 */
function cutsEnd(inkAt: Float32Array, cw: number, ch: number, threshold: number, top: number, nv: number): number | null {
	const crossings = new Int32Array(ch);
	for (let y = 0; y < ch; y++) {
		let n = 0;
		for (let x = 1; x < cw; x++) if (inkAt[y * cw + x] >= threshold && inkAt[y * cw + x - 1] < threshold) n++;
		crossings[y] = n;
	}
	const middle = Array.from(crossings.slice(Math.floor(0.3 * ch), Math.ceil(0.7 * ch))).sort((a, b) => a - b);
	const k = middle[Math.floor(middle.length / 2)] ?? 0;
	if (k < 1) return null;
	const enough = Math.max(1, k - 1);
	for (let y = 0; y < Math.floor(0.25 * ch); y++) {
		let rows = 0;
		for (let d = 0; d < 6 && y + d < ch; d++) if (crossings[y + d] >= enough) rows++;
		if (rows >= 5) return y === 0 ? null : top + y / nv;
	}
	return null;
}

function readCuts(ink: Field, outline: Outline, debugPicture?: TemplateReadOptions['debugPicture']): LobeCuts {
	const [eA, eB, fB, fA] = outline.corners;
	const H = squareToQuad([eA, eB, fB, fA]);
	const widthPx = (Math.hypot(eB.x - eA.x, eB.y - eA.y) + Math.hypot(fB.x - fA.x, fB.y - fA.y)) / 2;
	const heightPx = (Math.hypot(fA.x - eA.x, fA.y - eA.y) + Math.hypot(fB.x - eB.x, fB.y - eB.y)) / 2;
	const nu = Math.round(Math.min(800, Math.max(240, widthPx)));
	const nv = Math.round(Math.min(1600, Math.max(120, (nu * heightPx) / widthPx)));
	const scale = nu / widthPx;
	// The margin clears the outline's own stroke, and a little error in where it is.
	const stroke = outline.stroke * scale;
	const mu = Math.ceil(Math.max(3, 0.012 * nu, 1.5 * stroke + 2));
	const mv = Math.ceil(Math.max(3, 0.012 * nv, 1.5 * stroke + 2));
	const cw = nu - 2 * mu;
	const ch = nv - 2 * mv;
	const inkAt = new Float32Array(cw * ch);
	for (let y = 0; y < ch; y++) {
		for (let x = 0; x < cw; x++) {
			const p = apply(H.m, (x + mu + 0.5) / nu, (y + mv + 0.5) / nv);
			inkAt[y * cw + x] = sample(ink, p.x, p.y);
		}
	}
	debugPicture?.('square-ink', { w: cw, h: ch, d: inkAt });
	// Where ink ends and paper begins. Slits are often drawn thinner and lighter
	// than the outline, so a threshold near the paper's own grain finds them
	// whole; but it also thickens every stroke, and two cuts that nearly touch
	// (a narrow neck) then run together. Both are tried, and the reading with
	// the fewest pieces that reach only one edge, then the most strips, is kept.
	const grain = quantile(inkAt, 0.75);
	const high = Math.max(0.1, Math.min(0.3, 0.4 * outline.darkness));
	const low = Math.min(high, Math.max(0.12, 2 * grain + 0.04));
	const tries = low < 0.8 * high ? [high, (high + low) / 2, low] : [high];
	let seg = segmentPaper(inkAt, cw, ch, tries[0]);
	for (const t of tries.slice(1)) {
		const other = segmentPaper(inkAt, cw, ch, t);
		if (other.strayPieces < seg.strayPieces || (other.strayPieces === seg.strayPieces && other.strips.length > seg.strips.length)) seg = other;
	}
	const { label, pieces, strips, scrapA, scrapB, strayPieces, threshold } = seg;
	const cuts: Vec[][] = [];
	let onInk = 0;
	let total = 0;
	// Groups in order across the lobe: [scrap at side A], the strips, [scrap at side B].
	const group = new Int32Array(cw * ch).fill(-1);
	const first = scrapA ? 1 : 0;
	const groups = first + strips.length + (scrapB ? 1 : 0);
	if (groups < 2) return { cuts, strayPieces, strips: strips.length, inkShare: 0, cutsEnd: cutsEnd(inkAt, cw, ch, threshold, mv / nv, nv) };
	const order = new Int32Array(pieces.length).fill(-1);
	strips.forEach((s, k) => (order[s.id] = first + k));
	for (let i = 0; i < cw * ch; i++) {
		const l = label[i];
		const x = i % cw;
		if (l >= 0 && order[l] >= 0) group[i] = order[l];
		else if (scrapA && ((l >= 0 && scrapA.has(l)) || x === 0)) group[i] = 0;
		else if (scrapB && ((l >= 0 && scrapB.has(l)) || x === cw - 1)) group[i] = groups - 1;
	}
	for (let k = 0; k < groups - 1; k++) {
		const left = new Uint8Array(cw * ch);
		const right = new Uint8Array(cw * ch);
		for (let i = 0; i < cw * ch; i++) {
			const g = group[i];
			if (g < 0) continue;
			if (g <= k) left[i] = 1;
			else right[i] = 1;
		}
		const dl = distanceSquared(left, cw, ch);
		const dr = distanceSquared(right, cw, ch);
		const f = new Float32Array(cw * ch);
		for (let i = 0; i < cw * ch; i++) f[i] = Math.sqrt(dl[i]) - Math.sqrt(dr[i]);
		const line = zeroLine(f, cw, ch);
		if (!line) continue;
		// Back to the canonical frame, then onto the stroke's centre in the picture.
		const pts = resample(
			line.map((p) => ({ x: p.x + mu + 0.5, y: p.y + mv + 0.5 })),
			1
		);
		const centred = centreOnInk(ink, H, pts, nu, nv, outline.stroke, threshold);
		for (const p of centred.points) {
			total++;
			const x = Math.round(p.x - mu - 0.5);
			const y = Math.round(p.y - mv - 0.5);
			let hit = false;
			for (let dy = -1; dy <= 1 && !hit; dy++) {
				for (let dx = -1; dx <= 1 && !hit; dx++) {
					const xx = x + dx;
					const yy = y + dy;
					if (xx >= 0 && yy >= 0 && xx < cw && yy < ch && inkAt[yy * cw + xx] >= threshold) hit = true;
				}
			}
			if (hit) onInk++;
		}
		cuts.push(extendToEdges(centred.points.map((p) => ({ x: p.x / nu, y: p.y / nv }))));
	}
	// Slits that leave the fold but stop inside the square split no strip, so the
	// reading above passes them over: the heart has slits the site's hearts do not
	// (every cut runs from the fold to the ear's base). Count the strokes crossing
	// rows near the fold that no cut read explains: those are such slits.
	// A stroke is one of the cuts read when a cut crosses the row there; one much
	// lighter than the cuts is a guide line or a hatching, not a slit.
	const cutInk: number[] = [];
	for (const cut of cuts) {
		for (let i = 0; i < cut.length; i += 3) {
			const x = Math.round(cut[i].x * nu - mu - 0.5);
			const y = Math.round(cut[i].y * nv - mv - 0.5);
			let peak = 0;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < cw && y + dy < ch) peak = Math.max(peak, inkAt[(y + dy) * cw + x + dx]);
			cutInk.push(peak);
		}
	}
	cutInk.sort((a, b) => a - b);
	const slitInk = Math.max(threshold, 0.7 * (cutInk[Math.floor(cutInk.length / 2)] ?? 0));
	let danglingSlits = Infinity;
	// Rows up from the fold itself: a slit starts at the fold; a drawing above it does not.
	for (const f of [0.85, 0.9, 0.95, 1]) {
		const y = Math.min(ch - 1, Math.round(f * ch));
		const v = (y + mv + 0.5) / nv;
		const crossings: number[] = [];
		for (const cut of cuts) {
			for (let i = 0; i + 1 < cut.length; i++) {
				const a = cut[i];
				const b = cut[i + 1];
				if ((a.y <= v) === (b.y <= v)) continue;
				crossings.push((a.x + ((v - a.y) / (b.y - a.y)) * (b.x - a.x)) * nu - mu - 0.5);
			}
		}
		let unexplained = 0;
		for (let x = 1; x < cw; x++) {
			if (!(inkAt[y * cw + x] >= threshold && inkAt[y * cw + x - 1] < threshold)) continue;
			let end = x;
			let peak = inkAt[y * cw + x];
			while (end + 1 < cw && inkAt[y * cw + end + 1] >= threshold) peak = Math.max(peak, inkAt[y * cw + ++end]);
			if (peak >= slitInk && !crossings.some((c) => c >= x - 2 * stroke - 2 && c <= end + 2 * stroke + 2)) unexplained++;
			x = end;
		}
		danglingSlits = Math.min(danglingSlits, unexplained);
	}
	return { cuts, strayPieces, strips: strips.length, inkShare: total ? onInk / total : 0, danglingSlits };
}

/** The polyline resampled at `spacing`. */
function resample(points: Vec[], spacing: number): Vec[] {
	if (points.length < 2) return points.slice();
	const out: Vec[] = [points[0]];
	let carry = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len === 0) continue;
		let t = spacing - carry;
		while (t <= len) {
			out.push({ x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len });
			t += spacing;
		}
		carry = len - (t - spacing);
	}
	const last = points[points.length - 1];
	const end = out[out.length - 1];
	if (Math.hypot(last.x - end.x, last.y - end.y) > spacing * 0.3) out.push(last);
	else out[out.length - 1] = last;
	return out;
}

/**
 * Pull each point of a cut (canonical pixels) onto the centre of the stroke it
 * lies on, measured across the stroke in the picture itself, then smooth a
 * little. Points where the stroke is not clean (a junction, a blob) stay put.
 */
function centreOnInk(ink: Field, H: Homography, pts: Vec[], nu: number, nv: number, stroke: number, threshold: number): { points: Vec[] } {
	const n = pts.length;
	if (n < 5) return { points: pts };
	const img = pts.map((p) => apply(H.m, p.x / nu, p.y / nv));
	const moved: Vec[] = img.map((p) => ({ ...p }));
	const reach = 1.5 * stroke + 1.5;
	for (let i = 0; i < n; i++) {
		const a = img[Math.max(0, i - 2)];
		const b = img[Math.min(n - 1, i + 2)];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		if (len < 1e-6) continue;
		const nx = -(b.y - a.y) / len;
		const ny = (b.x - a.x) / len;
		const steps = Math.ceil(reach / 0.25);
		let peak = 0;
		const vals: number[] = [];
		for (let k = -steps; k <= steps; k++) {
			const v = sample(ink, img[i].x + nx * k * 0.25, img[i].y + ny * k * 0.25);
			vals.push(v);
			peak = Math.max(peak, v);
		}
		if (peak < threshold) continue;
		// The run above half the peak that holds the sample nearest the point.
		let best = -1;
		for (let k = 0; k < vals.length; k++) {
			if (vals[k] >= peak * 0.5 && (best < 0 || Math.abs(k - steps) < Math.abs(best - steps))) best = k;
		}
		let lo = best;
		let hi = best;
		while (lo > 0 && vals[lo - 1] >= peak * 0.5) lo--;
		while (hi < vals.length - 1 && vals[hi + 1] >= peak * 0.5) hi++;
		if (lo === 0 || hi === vals.length - 1) continue;
		if ((hi - lo) * 0.25 > 2.2 * stroke + 1) continue;
		let sw = 0;
		let so = 0;
		for (let k = lo; k <= hi; k++) {
			const wgt = vals[k] - peak * 0.4;
			sw += wgt;
			so += wgt * (k - steps) * 0.25;
		}
		const off = so / sw;
		if (Math.abs(off) > stroke + 1) continue;
		moved[i] = { x: img[i].x + nx * off, y: img[i].y + ny * off };
	}
	// Back to canonical pixels.
	const back = moved.map((p) => {
		const q = apply(H.inv, p.x, p.y);
		return { x: q.x * nu, y: q.y * nv };
	});
	// A light [1 2 1] smoothing; the ends stay.
	const smooth = back.map((p, i) =>
		i === 0 || i === n - 1 ? p : { x: (back[i - 1].x + 2 * p.x + back[i + 1].x) / 4, y: (back[i - 1].y + 2 * p.y + back[i + 1].y) / 4 }
	);
	return { points: smooth };
}

/** Run a cut (u, v in 0–1, from the fold toward the ear's base) on to both edges. */
function extendToEdges(points: Vec[]): Vec[] {
	if (points.length < 2) return points;
	const extend = (end: Vec, inner: Vec, edge: number): Vec => {
		const dv = end.y - inner.y;
		let du = end.x - inner.x;
		// A direction nearly along the edge would run far sideways; go straight instead.
		if (Math.abs(dv) < 1e-6 || Math.abs(du / dv) > 1.5) du = 0;
		const t = dv === 0 ? 0 : (edge - end.y) / dv;
		return { x: Math.min(1, Math.max(0, end.x + du * t)), y: edge };
	};
	const k = Math.min(points.length - 1, 4);
	const first = extend(points[0], points[k], 1);
	const last = extend(points[points.length - 1], points[points.length - 1 - k], 0);
	return [first, ...points, last];
}

// ----------------------------------------------------------------------------
// Curves
// ----------------------------------------------------------------------------

const vsub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const vadd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const vmul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const vdot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const vlen = (a: Vec) => Math.hypot(a.x, a.y);
const vnorm = (a: Vec): Vec => {
	const l = vlen(a);
	return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};

function bezierAt(c: BezierSegment, t: number): Vec {
	const u = 1 - t;
	return {
		x: u * u * u * c.p0.x + 3 * u * u * t * c.p1.x + 3 * u * t * t * c.p2.x + t * t * t * c.p3.x,
		y: u * u * u * c.p0.y + 3 * u * u * t * c.p1.y + 3 * u * t * t * c.p2.y + t * t * t * c.p3.y
	};
}

/** Least-squares cubic through points[first..last] with fixed end tangents (Schneider). */
function generateBezier(pts: Vec[], first: number, last: number, u: number[], t1: Vec, t2: Vec): BezierSegment {
	const p0 = pts[first];
	const p3 = pts[last];
	let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
	for (let i = 0; i < u.length; i++) {
		const t = u[i];
		const m = 1 - t;
		const b0 = m * m * m;
		const b1 = 3 * m * m * t;
		const b2 = 3 * m * t * t;
		const b3 = t * t * t;
		const a1 = vmul(t1, b1);
		const a2 = vmul(t2, b2);
		c00 += vdot(a1, a1);
		c01 += vdot(a1, a2);
		c11 += vdot(a2, a2);
		const tmp = vsub(pts[first + i], vadd(vmul(p0, b0 + b1), vmul(p3, b2 + b3)));
		x0 += vdot(a1, tmp);
		x1 += vdot(a2, tmp);
	}
	const det = c00 * c11 - c01 * c01;
	let alpha1 = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
	let alpha2 = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
	const seg = vlen(vsub(p3, p0));
	if (alpha1 < 1e-6 * seg || alpha2 < 1e-6 * seg) alpha1 = alpha2 = seg / 3;
	return { p0, p1: vadd(p0, vmul(t1, alpha1)), p2: vadd(p3, vmul(t2, alpha2)), p3 };
}

function newtonStep(c: BezierSegment, p: Vec, t: number): number {
	const u = 1 - t;
	const q = bezierAt(c, t);
	const d1 = {
		x: 3 * (u * u * (c.p1.x - c.p0.x) + 2 * u * t * (c.p2.x - c.p1.x) + t * t * (c.p3.x - c.p2.x)),
		y: 3 * (u * u * (c.p1.y - c.p0.y) + 2 * u * t * (c.p2.y - c.p1.y) + t * t * (c.p3.y - c.p2.y))
	};
	const d2 = {
		x: 6 * (u * (c.p2.x - 2 * c.p1.x + c.p0.x) + t * (c.p3.x - 2 * c.p2.x + c.p1.x)),
		y: 6 * (u * (c.p2.y - 2 * c.p1.y + c.p0.y) + t * (c.p3.y - 2 * c.p2.y + c.p1.y))
	};
	const diff = vsub(q, p);
	const num = vdot(diff, d1);
	const den = vdot(d1, d1) + vdot(diff, d2);
	if (Math.abs(den) < 1e-12) return t;
	return Math.min(1, Math.max(0, t - num / den));
}

function fitRun(pts: Vec[], first: number, last: number, t1: Vec, t2: Vec, tol: number, out: BezierSegment[], depth = 0): void {
	const n = last - first + 1;
	if (n === 2 || depth > 24) {
		const d = vlen(vsub(pts[last], pts[first])) / 3;
		out.push({ p0: pts[first], p1: vadd(pts[first], vmul(t1, d)), p2: vadd(pts[last], vmul(t2, d)), p3: pts[last] });
		return;
	}
	let u: number[] = [0];
	for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + vlen(vsub(pts[i], pts[i - 1])));
	const total = u[u.length - 1] || 1;
	u = u.map((v) => v / total);
	let curve = generateBezier(pts, first, last, u, t1, t2);
	let worst = 0;
	let split = first + Math.floor(n / 2);
	const measure = () => {
		worst = 0;
		for (let i = 1; i < n - 1; i++) {
			const d = vlen(vsub(bezierAt(curve, u[i]), pts[first + i]));
			if (d > worst) {
				worst = d;
				split = first + i;
			}
		}
	};
	measure();
	if (worst <= tol) {
		out.push(curve);
		return;
	}
	if (worst <= tol * 6) {
		for (let iter = 0; iter < 12; iter++) {
			u = u.map((t, i) => newtonStep(curve, pts[first + i], t));
			curve = generateBezier(pts, first, last, u, t1, t2);
			measure();
			if (worst <= tol) {
				out.push(curve);
				return;
			}
		}
	}
	split = Math.min(last - 1, Math.max(first + 1, split));
	const centre = vnorm(vsub(pts[Math.max(first, split - 2)], pts[Math.min(last, split + 2)]));
	fitRun(pts, first, split, t1, centre, tol, out, depth + 1);
	fitRun(pts, split, last, vmul(centre, -1), t2, tol, out, depth + 1);
}

/** Unit tangent leaving point `i` toward increasing (dir = 1) or decreasing (-1) index, over `span` length. */
function tangentAt(pts: Vec[], i: number, dir: 1 | -1, span: number): Vec {
	let acc = 0;
	let j = i;
	while (j + dir >= 0 && j + dir < pts.length && acc < span) {
		acc += vlen(vsub(pts[j + dir], pts[j]));
		j += dir;
	}
	return vnorm(vsub(pts[j], pts[i]));
}

/**
 * Cubics through a polyline (in any units), corners kept: points where the
 * direction turns by more than ~40° over `cornerSpan` start a new piece.
 */
function fitPolyline(pts: Vec[], tol: number, cornerSpan: number): BezierSegment[] {
	if (pts.length < 2) return [];
	const n = pts.length;
	const turn = new Float32Array(n);
	for (let i = 1; i < n - 1; i++) {
		const back = tangentAt(pts, i, -1, cornerSpan);
		const fwd = tangentAt(pts, i, 1, cornerSpan);
		turn[i] = Math.acos(Math.max(-1, Math.min(1, -vdot(back, fwd))));
	}
	const corners: number[] = [];
	const minTurn = (40 * Math.PI) / 180;
	for (let i = 1; i < n - 1; i++) {
		if (turn[i] < minTurn) continue;
		let isMax = true;
		let acc = 0;
		for (let j = i - 1; j > 0 && acc < cornerSpan; j--) {
			acc += vlen(vsub(pts[j + 1], pts[j]));
			if (turn[j] > turn[i]) isMax = false;
		}
		acc = 0;
		for (let j = i + 1; j < n - 1 && acc < cornerSpan; j++) {
			acc += vlen(vsub(pts[j], pts[j - 1]));
			if (turn[j] >= turn[i]) isMax = false;
		}
		if (isMax) corners.push(i);
	}
	const breaks = [0, ...corners, n - 1];
	const out: BezierSegment[] = [];
	const span = Math.max(cornerSpan * 0.5, tol * 4);
	for (let k = 0; k < breaks.length - 1; k++) {
		const a = breaks[k];
		const b = breaks[k + 1];
		if (b <= a) continue;
		const t1 = tangentAt(pts.slice(a, b + 1), 0, 1, span);
		const t2 = tangentAt(pts.slice(a, b + 1), b - a, -1, span);
		fitRun(pts, a, b, t1, t2, tol, out);
	}
	return out;
}

// ----------------------------------------------------------------------------
// Reading
// ----------------------------------------------------------------------------

type FoundLobe = {
	shape: Shape;
	shapeFit: number;
	outline: Outline;
	read: LobeCuts;
	/** Width across and length from fold to ear base, field pixels. */
	width: number;
	length: number;
	centre: Vec;
	quality: number;
};

function lobeQuality(shapeFit: number, rectFit: number, outline: Outline, read: LobeCuts): number {
	const round = Math.min(1, Math.max(0, (shapeFit - rectFit) / 0.03));
	const fit = Math.min(1, Math.max(0, (shapeFit - 0.8) / 0.15));
	const clean = read.strayPieces === 0 ? 1 : read.strayPieces === 1 ? 0.75 : 0.5;
	const cuts = read.cuts.length ? Math.min(1, Math.max(0, (read.inkShare - 0.6) / 0.35)) : 0;
	const whole = !read.danglingSlits ? 1 : read.danglingSlits === 1 ? 0.7 : 0.4;
	return Math.min(1, outline.support * 1.1) * (0.5 + 0.5 * fit) * (0.6 + 0.4 * round) * clean * cuts * whole;
}

/**
 * Read a template picture as a heart. Null when no lobe with slits is found:
 * the picture is not a template (or not one this reader can see).
 */
export function readTemplateImage(image: TemplatePixels, options: TemplateReadOptions = {}): TemplateRead | null {
	if (!(image.width > 16 && image.height > 16) || image.data.length < image.width * image.height * 4) return null;
	const notes: string[] = [];
	const maxPixels = options.maxPixels ?? 4_000_000;
	const factor = Math.max(1, Math.ceil(Math.sqrt((image.width * image.height) / maxPixels)));
	const ink = inkField(luminance(image, factor));
	// Finding the lobes: a ≤1000 px copy, the ink closed a little.
	const work = Math.max(1, Math.ceil(Math.max(ink.w, ink.h) / 1000));
	const lines = inkMask(ink, work, 0.25);
	const close = Math.max(1, Math.round(Math.max(lines.w, lines.h) / 320));
	const closed = dilate(lines, close);
	const minSide = Math.max(24, 0.06 * Math.min(lines.w, lines.h));
	const silhouettes = filledComponents(closed, lines.w, lines.h, minSide).slice(0, 24);
	const found: FoundLobe[] = [];
	const debug = options.debug;
	debug?.(`field ${ink.w}x${ink.h} (1/${factor}), work 1/${work}, close ${close}, ${silhouettes.length} silhouettes`);
	// Every lobe outline found, read or not: a sheet of several templates has more than one heart's worth.
	const outlines: Array<{ x: number; y: number; width: number }> = [];
	const tryLobe = (px: Int32Array): FoundLobe | null => {
		const fit = fitLobeShape(px, lines.w);
		debug?.(`silhouette ${px.length} px: ${fit ? `iou ${fit.iou.toFixed(3)} rect ${fit.rectIoU.toFixed(3)} w ${fit.shape.w.toFixed(0)}` : 'no fit'}`);
		if (!fit || fit.iou < 0.86 || fit.iou - fit.rectIoU < 0.012) return null;
		const s = fit.shape;
		const shape: Shape = { cx: (s.cx + 0.5) * work - 0.5, cy: (s.cy + 0.5) * work - 0.5, theta: s.theta, t0: s.t0 * work, w: s.w * work, s0: s.s0 * work, s1: s.s1 * work };
		debug?.(`shape c ${shape.cx.toFixed(1)},${shape.cy.toFixed(1)} theta ${((shape.theta * 180) / Math.PI).toFixed(1)} t0 ${shape.t0.toFixed(1)} w ${shape.w.toFixed(1)} s ${shape.s0.toFixed(1)}..${shape.s1.toFixed(1)}`);
		const outline = sharpenOutline(ink, shape, (close + 1) * work, debug);
		debug?.(outline ? `outline support ${outline.support.toFixed(2)} stroke ${outline.stroke.toFixed(1)} dark ${outline.darkness.toFixed(2)} base ${outline.baseDrawn}` : 'outline failed');
		if (!outline) return null;
		const [eA, eB, fB, fA] = outline.corners;
		const width = (Math.hypot(eB.x - eA.x, eB.y - eA.y) + Math.hypot(fB.x - fA.x, fB.y - fA.y)) / 2;
		let length = (Math.hypot(fA.x - eA.x, fA.y - eA.y) + Math.hypot(fB.x - eB.x, fB.y - eB.y)) / 2;
		if (!(width > 20) || length < 0.3 * width || length > 4 * width) return null;
		outlines.push({ x: (eA.x + fB.x) / 2, y: (eA.y + fB.y) / 2, width });
		let read = readCuts(ink, outline, options.debugPicture);
		if (!read.cuts.length && read.cutsEnd) {
			// The slits stop short of the ear's base: the square starts where they end.
			const v = read.cutsEnd;
			const along = (e: Vec, f: Vec): Vec => ({ x: e.x + v * (f.x - e.x), y: e.y + v * (f.y - e.y) });
			outline.corners = [along(eA, fA), along(eB, fB), fB, fA];
			read = readCuts(ink, outline, options.debugPicture);
			debug?.(`slits end at v ${v.toFixed(3)}: ${read.strips} strips, ${read.cuts.length} cuts`);
			if (read.cuts.length) length *= 1 - v;
		}
		debug?.(`lobe ${width.toFixed(0)}x${length.toFixed(0)}: ${read.strips} strips, ${read.cuts.length} cuts, ${read.strayPieces} stray, ink ${read.inkShare.toFixed(2)}`);
		if (!read.cuts.length) return null;
		const centre = { x: (eA.x + eB.x + fB.x + fA.x) / 4, y: (eA.y + eB.y + fB.y + fA.y) / 4 };
		return { shape, shapeFit: fit.iou, outline, read, width, length, centre, quality: lobeQuality(fit.iou, fit.rectIoU, outline, read) };
	};
	// A drawing that is not a lobe may still hold one: drawn without the label or
	// dimension line that swelled its hull, or as one of two touching ones (a label
	// laid across both outlines, a photo against the template) that an opening parts.
	const queue: Array<{ px: Int32Array; filled: Int32Array | null }> = silhouettes.map((s) => ({ px: s.pixels, filled: s.filled }));
	for (let qi = 0; qi < queue.length && qi < 48; qi++) {
		const { px, filled } = queue[qi];
		if (px.length < 0.002 * lines.w * lines.h) continue;
		const lobe = tryLobe(px);
		if (lobe) {
			// The same lobe found twice (whole and as a piece) counts once, the better reading.
			const twin = found.findIndex((f) => Math.hypot(f.centre.x - lobe.centre.x, f.centre.y - lobe.centre.y) < 0.2 * Math.min(f.width, lobe.width));
			if (twin < 0) found.push(lobe);
			else if (lobe.quality > found[twin].quality) found[twin] = lobe;
			continue;
		}
		if (!filled) continue;
		if (filled !== px && filled.length >= 0.3 * px.length) queue.push({ px: filled, filled: null });
		if (filled.length >= 0.3 * px.length) {
			const side = Math.sqrt(filled.length);
			const pieces = splitByOpening(filled, lines.w, Math.max(3, Math.round(0.035 * side)));
			debug?.(`split into ${pieces.length}: ${pieces.map((p) => p.length).join(', ')}`);
			if (pieces.length > 1 || (pieces.length === 1 && pieces[0].length < 0.9 * filled.length)) {
				for (const piece of pieces) queue.push({ px: piece, filled: null });
			}
		}
	}
	if (!found.length) return null;
	found.sort((p, q) => q.quality - p.quality);

	// Which lobes make the heart: the best pair of matching size, else the best one.
	let pair: [FoundLobe, FoundLobe] | null = null;
	let pairScore = 0;
	for (let i = 0; i < found.length; i++) {
		for (let j = i + 1; j < found.length; j++) {
			const p = found[i];
			const q = found[j];
			// The left lobe's width is the right lobe's length and the other way round.
			const crossed = Math.max(Math.abs(p.width - q.length) / q.length, Math.abs(p.length - q.width) / q.width);
			const same = Math.max(Math.abs(p.width - q.width) / q.width, Math.abs(p.length - q.length) / q.length);
			const mismatch = Math.min(crossed, same);
			if (mismatch > 0.12) continue;
			const score = Math.min(p.quality, q.quality) * (1 - mismatch);
			if (score > pairScore) {
				pairScore = score;
				pair = [p, q];
			}
		}
	}
	let layout: TemplateRead['layout'];
	let left: FoundLobe;
	let right: FoundLobe;
	// Across-axis for each: +1 reads u from side A to B, -1 from B to A.
	let leftHand: 1 | -1;
	let rightHand: 1 | -1;
	let mirrored = false;
	const hand = (l: FoundLobe, sign: 1 | -1): 1 | -1 => {
		// The across direction wanted in the picture, as a multiple of the lobe's own b.
		const a = l.outline.a;
		const want = sign > 0 ? { x: a.y, y: -a.x } : { x: -a.y, y: a.x };
		return vdot(want, l.outline.b) >= 0 ? 1 : -1;
	};
	// Two lobes of matching size are the heart's two, even when one is read less
	// cleanly; only a pair far worse than the best lone lobe gives way to it.
	const single = !pair || pairScore < 0.25 * found[0].quality;
	if (pair && !single) {
		const [p, q] = pair;
		const cross = p.outline.a.x * q.outline.a.y - p.outline.a.y * q.outline.a.x;
		const dot = vdot(p.outline.a, q.outline.a);
		if (Math.abs(cross) > 0.7) {
			layout = 'in-place';
			// The right lobe's ear is the left lobe's turned 90° clockwise on screen: (x, y) → (-y, x).
			const turned = (l: FoundLobe) => ({ x: -l.outline.a.y, y: l.outline.a.x });
			const up = (l: FoundLobe) => -l.outline.a.y;
			const standing = up(p) > 0.7 ? p : up(q) > 0.7 ? q : null;
			if (standing) {
				// Pages are drawn upright: the standing lobe is the right lobe. When the
				// lying one's ear then points right, not left, the page is drawn
				// mirrored (its preview heart too), and both lobes are read in the mirror.
				right = standing;
				left = standing === p ? q : p;
				mirrored = vdot(turned(left), right.outline.a) < 0;
			} else {
				[left, right] = vdot(turned(p), q.outline.a) > 0 ? [p, q] : [q, p];
			}
			leftHand = hand(left, mirrored ? -1 : 1);
			rightHand = hand(right, mirrored ? 1 : -1);
			if (mirrored) notes.push('the page is drawn mirrored (the lying lobe points right): read in the mirror');
		} else {
			layout = 'side-by-side';
			if (dot < 0.7) notes.push('the two lobes point opposite ways');
			// Reading order: along the line between them, the first is the left lobe.
			const dx = q.centre.x - p.centre.x;
			const dy = q.centre.y - p.centre.y;
			const first = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? p : q) : dy > 0 ? p : q;
			left = first;
			right = first === p ? q : p;
			leftHand = hand(left, -1);
			rightHand = hand(right, -1);
		}
	} else {
		layout = 'single';
		left = right = found[0];
		leftHand = hand(left, -1);
		rightHand = hand(right, -1);
	}

	// The cuts in the heart's 0–100 frame.
	const toHeart = (l: FoundLobe, lobe: LobeId, handed: 1 | -1) => {
		const tol = 0.35 / Math.max(240, Math.min(800, l.width));
		return l.read.cuts.map((cut) => {
			const pts = cut.map((p) => {
				const u = handed > 0 ? p.x : 1 - p.x;
				return lobe === 'left' ? { x: 100 * p.y, y: 100 * u } : { x: 100 * u, y: 100 * p.y };
			});
			// Fold first: the left lobe's cuts run right to left, the right lobe's bottom to top.
			const curve = fitPolyline(pts, 100 * tol, 100 * Math.max(0.01, (3 * l.outline.stroke) / l.width));
			return curve;
		});
	};
	const leftCuts = toHeart(left, 'left', leftHand);
	const rightCuts = toHeart(right, 'right', rightHand);
	// The square's proportions: width over height.
	const aspectL = left.length / left.width;
	const aspectR = right.width / right.length;
	const aspect = layout === 'single' ? 1 : (aspectL + aspectR) / 2;
	const grid = { x: rightCuts.length + 1, y: leftCuts.length + 1 };
	const json: HeartDesignJson = {
		id: options.id ?? 'template',
		name: options.name ?? 'Skabelon',
		author: '',
		weaveParity: options.weaveParity ?? 0,
		gridSize: grid,
		...(Math.abs(aspect - grid.x / grid.y) > 0.03 * (grid.x / grid.y) ? { overlapAspectRatio: aspect } : {}),
		fingers: [
			...leftCuts.map((segments, i) => ({ id: `L-${i}`, lobe: 'left' as const, pathData: segmentsToPathData(segments) })),
			...rightCuts.map((segments, i) => ({ id: `R-${i}`, lobe: 'right' as const, pathData: segmentsToPathData(segments) }))
		]
	};
	const warn = console.warn;
	let design: HeartDesign | null;
	try {
		// The site's validation warns about anything unusual; the notes say it instead.
		console.warn = () => {};
		design = normalizeHeartDesign(json);
	} finally {
		console.warn = warn;
	}
	if (!design) return null;

	const scale = factor;
	const toImage = (p: Vec): Vec => ({ x: (p.x + 0.5) * scale - 0.5, y: (p.y + 0.5) * scale - 0.5 });
	const describe = (l: FoundLobe, lobe: LobeId, handed: 1 | -1): TemplateLobeRead => {
		const [eA, eB, fB, fA] = l.outline.corners;
		const square: [Vec, Vec, Vec, Vec] = handed > 0 ? [eA, eB, fB, fA] : [eB, eA, fA, fB];
		const H = squareToQuad([eA, eB, fB, fA]);
		return {
			lobe,
			square: square.map(toImage) as [Vec, Vec, Vec, Vec],
			ear: { center: toImage(l.outline.ear.center), radius: l.outline.ear.radius * scale },
			earDirection: l.outline.a,
			cuts: l.read.cuts.map((cut) => cut.map((p) => toImage(apply(H.m, p.x, p.y)))),
			shapeFit: l.shapeFit,
			strayPieces: l.read.strayPieces,
			confidence: l.quality
		};
	};
	const lobes = layout === 'single' ? [describe(right, 'right', rightHand)] : [describe(left, 'left', leftHand), describe(right, 'right', rightHand)];
	for (const l of layout === 'single' ? [right] : [left, right]) {
		if (l.read.strayPieces) notes.push(`${l.read.strayPieces} piece(s) of paper reach only one edge: a cut may be broken or two may touch`);
		if (l.read.inkShare < 0.9) notes.push(`a cut runs off the ink (${Math.round(100 * l.read.inkShare)}% on ink)`);
		if (l.read.danglingSlits) notes.push(`${l.read.danglingSlits} slit(s) leave the fold but stop inside the square: not read`);
	}
	let confidence = layout === 'single' ? right.quality * 0.9 : Math.min(left.quality, right.quality);
	// Two lobes drawn alike (both standing) with different strip counts are as
	// likely two different hearts' templates as one heart's.
	if (layout === 'side-by-side' && left.read.cuts.length !== right.read.cuts.length) confidence *= 0.6;
	// More lobe outlines of this size than the heart has: a sheet of several templates.
	const used = layout === 'single' ? [right] : [left, right];
	const distinct: Array<{ x: number; y: number; width: number }> = [];
	for (const o of outlines) {
		if (!used.some((l) => Math.abs(o.width - l.width) < 0.25 * l.width)) continue;
		if (!distinct.some((d) => Math.hypot(d.x - o.x, d.y - o.y) < 0.3 * o.width)) distinct.push(o);
	}
	if (distinct.length > used.length) {
		confidence *= 0.4;
		notes.push(`${distinct.length} lobe outlines of this size: perhaps a sheet of several templates`);
	}
	return { design, confidence, layout, mirrored, lobes, notes };
}

/**
 * The same heart with one lobe's piece turned over: its cuts mirrored across
 * the lobe's ear–fold axis (the left lobe's y, the right lobe's x). A template
 * fixes each piece only up to this, so a reader can offer it as the other
 * reading; for a single template (`layout: 'single'`) mirroring the left lobe
 * turns the mirror-symmetric reading into the rotation-symmetric one.
 */
export function mirrorLobe(design: HeartDesign, lobe: LobeId): HeartDesign {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const flip = (p: Vec): Vec =>
		lobe === 'left' ? { x: p.x, y: 2 * rect.top + rect.height - p.y } : { x: 2 * rect.left + rect.width - p.x, y: p.y };
	return {
		...design,
		fingers: design.fingers.map((f) =>
			f.lobe !== lobe ? f : { ...f, segments: f.segments.map((seg) => ({ p0: flip(seg.p0), p1: flip(seg.p1), p2: flip(seg.p2), p3: flip(seg.p3) })) }
		)
	};
}
