/**
 * Udtvær: the paper under the brush dragged along, turned about it, swelled out
 * from it or drawn in — what makes a hvirvel or a glaskuppel out of a plain board.
 *
 * A stroke never resamples its own output, which would wear an edge into steps
 * a little more with every dab. It keeps the mask as it was when the stroke
 * began, and a field saying where in that mask each cell's paper now comes
 * from; a dab moves the field, and the cells under it are read afresh from the
 * kept mask. Reading is bilinear and cut at one half, so an edge comes out as
 * the smooth curve between cell centres rather than as the stair of a nearest
 * cell, and the mask stays two papers.
 *
 * Nor does the next stroke, while nothing else has touched the mask: it carries
 * on with the last one's kept mask and field, so four holds of Krymp are one
 * long hold. Started afresh after a pen or an undo, a stroke reads the mask's
 * `level`, which every stroke leaves, the share of paper it read before the
 * cut, as the other tools leave theirs (see `Mask.level`). That is where
 * between the cells each edge lies, so neither a fresh stroke nor the screen
 * sees the stair the cut leaves in `data`, which a stretching dab would
 * otherwise magnify (2026-10-27: four holds of Krymp left the edges rugged).
 *
 * Under symmetry every dab is made at each image of the brush as well (a turn
 * mirrored turns the other way), so a symmetric mask stays symmetric without
 * copying cells about afterwards.
 *
 * The brush's hold fades from its centre to the rim of the pen's head, round,
 * square, diamond or chisel (see `brushHead.ts`). Every symmetry of the mask
 * maps the first three onto themselves; the chisel, a bar, an image whose
 * symmetry swaps the mask's axes holds turned a quarter.
 *
 * Nothing here knows about pointers or canvases; cells have their centres on
 * whole coordinates, as the pen's do.
 */

import type { Vec } from '$lib/types/heart';
import { clampBox, emptyBox, isEmptyBox, shareAt, unionBox, type Box, type Mask } from './mask';
import { closedPointMaps, type Transform } from './symmetry';
import type { BrushShape } from './toolset';
import { headGauge, headReach } from './brushHead';

type PointMap = (x: number, y: number, size: number) => { x: number; y: number };

/** How a point under the brush is moved: where its paper is now read from. */
type Warp = (x: number, y: number, weight: number) => [number, number];

/** The hold at a point a `gauge` of the way out to the head's rim: whole at the centre, none at the rim. */
function weightAt(gauge: number): number {
	const t = 1 - gauge * gauge;
	return t > 0 ? t * t : 0;
}

/** Whether two optional cell arrays hold the same cells. */
function same(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
	if (!a || !b) return a === b;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/** Whether a symmetry swaps the mask's two axes, turning a chisel a quarter. */
function swapsAxes(map: PointMap, size: number): boolean {
	const o = map(0, 0, size), a = map(1, 0, size);
	return Math.abs(a.x - o.x) < 0.5;
}

/** Whether a symmetry turns the plane over, so that a turn under it runs the other way. */
function turnsOver(map: PointMap, size: number): boolean {
	const o = map(0, 0, size), a = map(1, 0, size), b = map(0, 1, size);
	return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) < 0;
}

export type Smudge = ReturnType<typeof createSmudge>;

/** What a stroke hands the next: the mask it reads from, and where each cell's paper comes from in it. */
type Carried = { source: Float32Array; observed: Uint8Array | undefined; fx: Float32Array; fy: Float32Array };

/**
 * One Udtvær stroke on `mask`, from its press to its release. Each call changes
 * the mask in place and returns the box it changed, as the other tools do.
 * `previous` is the stroke before, carried on from if the mask is still exactly
 * as it left it.
 */
export function createSmudge(
	mask: Mask,
	transforms: Transform[] = [],
	shape: BrushShape = 'round',
	previous: { carry(mask: Mask): Carried | null } | null = null
) {
	const n = mask.size;
	const carried = previous?.carry(mask) ?? null;
	// A level the cells no longer agree with was left before a tool painted over it.
	const level = (mask.level ??= new Uint8Array(n * n));
	if (!carried) for (let i = 0; i < n * n; i++) level[i] = shareAt(mask, i);
	const source = carried?.source ?? Float32Array.from(level, (l) => l / 255);
	const observed = carried ? carried.observed : mask.validMask?.slice();
	// Where each cell's paper comes from, as an offset from the cell.
	const fx = carried?.fx ?? new Float32Array(n * n), fy = carried?.fy ?? new Float32Array(n * n);
	// The cells as this stroke leaves them, to tell whether the next may carry on.
	const left = mask.data.slice(), leftKnown = mask.validMask?.slice();
	// The brush itself, and its images under the symmetries on (which
	// `closedPointMaps` hands out without the identity).
	const images: { map: PointMap | null; over: boolean; turned: boolean }[] = [
		{ map: null, over: false, turned: false },
		...(transforms.length ? closedPointMaps(transforms) : []).map((map) => ({ map, over: turnsOver(map, n), turned: swapsAxes(map, n) }))
	];
	const place = (map: PointMap | null, x: number, y: number): Vec => (map ? map(x, y, n) : { x, y });

	/** The kept mask, bilinear, at a point; cut at one half by the caller. */
	function sourceAt(x: number, y: number): number {
		const cx = Math.max(0, Math.min(n - 1, x)), cy = Math.max(0, Math.min(n - 1, y));
		const x0 = Math.min(n - 2, Math.floor(cx)), y0 = Math.min(n - 2, Math.floor(cy));
		const tx = cx - x0, ty = cy - y0, i = y0 * n + x0;
		return (source[i]! * (1 - tx) + source[i + 1]! * tx) * (1 - ty) +
			(source[i + n]! * (1 - tx) + source[i + n + 1]! * tx) * ty;
	}

	/**
	 * Move the field under one dab made at every image of the brush at once:
	 * each cell moves by the sum of what the images do to it, read from the old
	 * field. All at once and summed, so where a brush overlaps its own mirror
	 * image the dab is still exactly as symmetric as the brushes are.
	 */
	function deform(dabs: { at: Vec; warp: Warp; turned: boolean }[], radius: number, reach: number): Box {
		const r = Math.max(1, radius), held = headReach(shape, r), side = Math.max(held.x, held.y);
		let box = emptyBox();
		for (const { at } of dabs) box = unionBox(box, clampBox(mask, at.x - side, at.y - side, at.x + side + 1, at.y + side + 1));
		if (isEmptyBox(box)) return box;
		// Every point the dab reads from lies within `reach` of the box.
		const near = clampBox(mask, box.x0 - reach - 1, box.y0 - reach - 1, box.x1 + reach + 1, box.y1 + reach + 1);
		const w = near.x1 - near.x0, h = near.y1 - near.y0;
		const ox = new Float32Array(w * h), oy = new Float32Array(w * h);
		for (let y = 0; y < h; y++) {
			ox.set(fx.subarray((near.y0 + y) * n + near.x0, (near.y0 + y) * n + near.x1), y * w);
			oy.set(fy.subarray((near.y0 + y) * n + near.x0, (near.y0 + y) * n + near.x1), y * w);
		}
		const fieldAt = (x: number, y: number): [number, number] => {
			const cx = Math.max(near.x0, Math.min(near.x1 - 1, x)) - near.x0;
			const cy = Math.max(near.y0, Math.min(near.y1 - 1, y)) - near.y0;
			const x0 = Math.min(Math.max(0, w - 2), Math.floor(cx)), y0 = Math.min(Math.max(0, h - 2), Math.floor(cy));
			const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
			const tx = Math.min(1, cx - x0), ty = Math.min(1, cy - y0);
			const a = y0 * w + x0, b = y0 * w + x1, c = y1 * w + x0, d = y1 * w + x1;
			return [
				(ox[a]! * (1 - tx) + ox[b]! * tx) * (1 - ty) + (ox[c]! * (1 - tx) + ox[d]! * tx) * ty,
				(oy[a]! * (1 - tx) + oy[b]! * tx) * (1 - ty) + (oy[c]! * (1 - tx) + oy[d]! * tx) * ty
			];
		};
		for (let y = box.y0; y < box.y1; y++) {
			for (let x = box.x0; x < box.x1; x++) {
				let mx = 0, my = 0;
				for (const { at, warp, turned } of dabs) {
					const weight = weightAt(headGauge(shape, r, x - at.x, y - at.y, turned));
					if (!weight) continue;
					const [px, py] = warp(x, y, weight);
					mx += px - x;
					my += py - y;
				}
				if (!mx && !my) continue;
				const [dx, dy] = fieldAt(x + mx, y + my);
				fx[y * n + x] = mx + dx;
				fy[y * n + x] = my + dy;
			}
		}
		return box;
	}

	/** Read the cells of `box` afresh through the field, the share read kept as their level. */
	function render(box: Box): Box {
		let changed = emptyBox();
		for (let y = box.y0; y < box.y1; y++) {
			for (let x = box.x0; x < box.x1; x++) {
				const i = y * n + x, sx = x + fx[i]!, sy = y + fy[i]!;
				// Rounded, 127.5 goes up: a share of one half is paper 1 both ways.
				const share = Math.round(sourceAt(sx, sy) * 255), value = share >= 128 ? 1 : 0;
				const seen = observed?.[Math.max(0, Math.min(n - 1, Math.round(sy))) * n + Math.max(0, Math.min(n - 1, Math.round(sx)))];
				if (mask.data[i] === value && level[i] === share && (!mask.validMask || mask.validMask[i] === seen)) continue;
				mask.data[i] = left[i] = value;
				level[i] = share;
				if (mask.validMask && seen !== undefined) mask.validMask[i] = seen;
				if (leftKnown && seen !== undefined) leftKnown[i] = seen;
				changed = unionBox(changed, { x0: x, y0: y, x1: x + 1, y1: y + 1 });
			}
		}
		return changed;
	}

	/** One dab at every image of the brush, then the cells it moved. */
	function dab(c: Vec, radius: number, reach: number, warp: (image: { map: PointMap | null; over: boolean }, at: Vec) => Warp): Box {
		const dabs = images.map((image) => {
			const at = place(image.map, c.x, c.y);
			return { at, warp: warp(image, at), turned: image.turned };
		});
		return render(deform(dabs, radius, reach));
	}

	return {
		/**
		 * This stroke's kept mask and field, for the next stroke on `next` — only
		 * if it is this mask, its cells exactly as this stroke left them: a pen,
		 * a fence putting cells back or an undo since, and the next starts afresh.
		 */
		carry(next: Mask): Carried | null {
			if (next !== mask || next.level !== level || !same(next.data, left) || !same(next.validMask, leftKnown)) return null;
			return { source, observed, fx, fy };
		},
		/**
		 * Drag the paper from `from` to `to`: whole at the brush's centre, less
		 * towards its rim, and at a `strength` under 1 only that share of the way,
		 * so the paper lags behind the pointer. A long move is made in steps of a
		 * quarter brush, so the paper is carried along the way and not lifted and
		 * dropped at the end.
		 */
		push(from: Vec, to: Vec, radius: number, strength = 1): Box {
			const length = Math.hypot(to.x - from.x, to.y - from.y);
			const steps = Math.max(1, Math.ceil(length / Math.max(1, radius / 4)));
			const vx = (to.x - from.x) / steps, vy = (to.y - from.y) / steps;
			let changed = emptyBox();
			for (let k = 0; k < steps; k++) {
				const c = { x: from.x + vx * k, y: from.y + vy * k };
				changed = unionBox(changed, dab(c, radius, Math.hypot(vx, vy), (image, at) => {
					const end = place(image.map, c.x + vx, c.y + vy), ux = end.x - at.x, uy = end.y - at.y;
					return (x, y, weight) => [x - strength * weight * ux, y - strength * weight * uy];
				}));
			}
			return changed;
		},
		/** Turn the paper about `at` by `angle` radians at the centre, clockwise on screen when positive. */
		twirl(at: Vec, radius: number, angle: number): Box {
			return dab(at, radius, 1, (image, c) => {
				const turn = image.over ? -angle : angle;
				return (x, y, weight) => {
					const a = -turn * weight, cos = Math.cos(a), sin = Math.sin(a), dx = x - c.x, dy = y - c.y;
					return [c.x + dx * cos - dy * sin, c.y + dx * sin + dy * cos];
				};
			});
		},
		/**
		 * Swell the paper out from `at` by `amount` (a share of each point's distance
		 * at the centre); a negative amount draws it in.
		 */
		bulge(at: Vec, radius: number, amount: number): Box {
			const a = Math.max(-.9, Math.min(.9, amount));
			return dab(at, radius, 1, (_, c) => (x, y, weight) => {
				const k = 1 - a * weight;
				return [c.x + (x - c.x) * k, c.y + (y - c.y) * k];
			});
		}
	};
}
