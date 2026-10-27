/**
 * The painted mask: the woven square as two-colour pixels.
 *
 * Paint mode never edits curves. It edits a fixed grid of cells over the woven
 * square — the same square the inverse engine solves in — where `0` is the left
 * lobe's paper colour and `1` the right lobe's. That is the convention the
 * engine uses for `prepared.mask`, so a mask can travel to the engine and back
 * without anyone having to remember which colour is which.
 *
 * The painting resolution is fixed at `MASK_SIZE`, without a cell-size setting.
 * An imported picture also retains its original sampling: enlarging its binary
 * pixels for painting must not move the boundaries the solver sees. Everything
 * here is plain data, so undo and comparisons do not depend on the DOM.
 */

/** Cells per side of the painting surface. */
export const MASK_SIZE = 400;

/** Row-major cells, `data[y * size + x]`, each `0` (left colour) or `1` (right). */
export type MaskRaster = {
	size: number;
	data: Uint8Array;
	/** Real photo or painted cells; zero is unobserved. Absent means all known. */
	validMask?: Uint8Array;
};

export type Mask = MaskRaster & {
	/** Original imported cells. Usable only while their enlargement still matches. */
	sourceRaster?: MaskRaster;
	/**
	 * Where between the cells an edge lies: each cell's paper as a share of 255,
	 * 128 and up being paper 1, so an edge is the curve where the cells, read
	 * bilinearly, cross one half. A tool that draws a shape gives the cells
	 * round its edge their distance from it (`paintEdge`), Udtvær the share it
	 * read (see `smudge.ts`) and Markér the share it moved; the screen, Udtvær
	 * and Markér read it. The cells in `data` stay what everything else reads,
	 * Find snit included. Trusted only where it agrees with `data` (see
	 * `shareAt`), so a write that forgets it costs at most a sub-cell nudge.
	 * Absent means whole cells, as a mask read from a picture is.
	 */
	level?: Uint8Array;
};

/**
 * A half-open region of cells, `x0 <= x < x1`, used to report what an edit
 * changed so the canvas can repaint that rectangle instead of the whole mask.
 * Half-open because it makes the empty box (`x0 === x1`) representable, which an
 * inclusive box cannot do without a separate flag.
 */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** A box covering nothing. Fresh each call: callers pass boxes around and union them in place. */
export function emptyBox(): Box {
	return { x0: 0, y0: 0, x1: 0, y1: 0 };
}

export function isEmptyBox(b: Box): boolean {
	return b.x1 <= b.x0 || b.y1 <= b.y0;
}

/** The smallest box containing both, treating an empty box as "nothing to include". */
export function unionBox(a: Box, b: Box): Box {
	if (isEmptyBox(a)) return { ...b };
	if (isEmptyBox(b)) return { ...a };
	return {
		x0: Math.min(a.x0, b.x0),
		y0: Math.min(a.y0, b.y0),
		x1: Math.max(a.x1, b.x1),
		y1: Math.max(a.y1, b.y1)
	};
}

/**
 * A box grown a cell at a time, for a tool to report the cells it changed
 * without a box made for each of them.
 */
export function growBox() {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	return {
		add(x: number, y: number): void {
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		},
		box(): Box {
			return x1 < x0 ? emptyBox() : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
		}
	};
}

/** The box `[x0,x1) × [y0,y1)` cut down to the mask, empty when it misses entirely. */
export function clampBox(m: Mask, x0: number, y0: number, x1: number, y1: number): Box {
	const cx0 = Math.max(0, Math.min(m.size, Math.floor(x0)));
	const cy0 = Math.max(0, Math.min(m.size, Math.floor(y0)));
	const cx1 = Math.max(cx0, Math.min(m.size, Math.ceil(x1)));
	const cy1 = Math.max(cy0, Math.min(m.size, Math.ceil(y1)));
	return { x0: cx0, y0: cy0, x1: cx1, y1: cy1 };
}

/**
 * A mask filled with one value. The size argument exists for the rasteriser and
 * the tests, which work at smaller resolutions; painting always uses the default.
 */
export function createMask(fill: 0 | 1 = 0, size: number = MASK_SIZE): Mask {
	const data = new Uint8Array(size * size);
	if (fill) data.fill(1);
	return { size, data };
}

export function cloneMask(m: Mask): Mask {
	return {
		...cloneRaster(m),
		...(m.sourceRaster ? { sourceRaster: cloneRaster(m.sourceRaster) } : {}),
		...(m.level ? { level: m.level.slice() } : {})
	};
}

/** A cell's paper as a share of 255: its `level` where that agrees with the cell, else the cell itself, whole. */
export function shareAt(m: Mask, index: number): number {
	const value = m.data[index]!, level = m.level?.[index];
	return level !== undefined && (level >= 128) === (value === 1) ? level : value * 255;
}

/** A cell's paper between 0 and 1 (see `shareAt`). */
export function levelAt(m: Mask, index: number): number {
	return shareAt(m, index) / 255;
}

/** The mask's levels, made from its cells, whole, if it has none yet. */
export function levels(m: Mask): Uint8Array {
	if (!m.level) {
		m.level = new Uint8Array(m.data.length);
		for (let i = 0; i < m.data.length; i++) m.level[i] = m.data[i]! * 255;
	}
	return m.level;
}

/**
 * How steeply a drawn edge's level runs across it: half a paper a cell, so the
 * cells within a cell of the edge say where it lies. Read bilinearly, that
 * puts a straight edge within a hundredth of a cell of where it was drawn and
 * a circle of radius 3 within a twentieth; the cells alone, up to half a cell
 * off. Steeper misplaces edges that cross a cell's corners, shallower lets two
 * shapes a cell or two apart run together (scratchpad edge/slope2.mjs).
 */
export const EDGE_RAMP = 0.5;

/** How far outside a shape its edge still reaches a cell's level, in cells. */
export const EDGE_BAND = 0.5 / EDGE_RAMP;

/**
 * A shape's own share of a cell `depth` cells inside its edge (negative
 * outside), kept on the side of one half that `inside` says: the shape decides
 * by its own test which cells it holds, and the share only where its edge lies.
 */
export function edgeShare(depth: number, inside: boolean): number {
	const share = Math.round(255 * (0.5 + EDGE_RAMP * depth));
	return inside ? Math.max(128, Math.min(255, share)) : Math.max(0, Math.min(127, share));
}

/**
 * Lay paper `value` over a cell `depth` cells inside a shape's edge (negative
 * outside): the cell takes the paper where `inside`, as `paintCell` would
 * have it, and its level keeps whichever edge is nearer, the shape's or the
 * paper's own, so the two papers' edge is the shape's where it lies outside
 * the paper and the paper's where it lies inside. A cell within `EDGE_BAND`
 * outside changes no paper, only where the edge beside it lies.
 */
export function paintEdge(m: Mask, index: number, value: 0 | 1, depth: number, inside: boolean): boolean {
	const level = levels(m), own = edgeShare(depth, inside), was = shareAt(m, index);
	const share = value ? Math.max(was, own) : Math.min(was, 255 - own);
	const cell = share >= 128 ? 1 : 0;
	const changed = m.data[index] !== cell || level[index] !== share || inside && !!m.validMask && !m.validMask[index];
	m.data[index] = cell;
	level[index] = share;
	if (inside && m.validMask) m.validMask[index] = 1;
	return changed;
}

function cloneRaster(m: MaskRaster): MaskRaster {
	return { size: m.size, data: m.data.slice(), ...(m.validMask ? { validMask: m.validMask.slice() } : {}) };
}

/**
 * Use original photo sampling only when it still describes every painted cell.
 * Check the actual bytes, not a dirty flag: brushes, symmetry, selection, undo
 * and same-colour writes into unknown pixels must all respect the current mask.
 * Callers copy the returned raster before transferring it to the worker.
 */
export function solverRaster(mask: Mask): MaskRaster {
	const source = mask.sourceRaster;
	if (!source || !Number.isInteger(source.size) || source.size < 32 || source.size >= mask.size ||
		source.data.length !== source.size ** 2 || source.data.some(v => v !== 0 && v !== 1) ||
		source.validMask && (source.validMask.length !== source.data.length || source.validMask.some(v => v !== 0 && v !== 1))) return mask;
	if (mask.data.length !== mask.size ** 2 || mask.validMask && mask.validMask.length !== mask.data.length) return mask;
	for (let y = 0; y < mask.size; y++) {
		const sy = Math.min(source.size - 1, Math.floor((y + .5) * source.size / mask.size));
		for (let x = 0; x < mask.size; x++) {
			const sx = Math.min(source.size - 1, Math.floor((x + .5) * source.size / mask.size));
			const i = y * mask.size + x, j = sy * source.size + sx;
			if (mask.data[i] !== source.data[j] || (mask.validMask?.[i] ?? 1) !== (source.validMask?.[j] ?? 1)) return mask;
		}
	}
	return source;
}

/**
 * An explicit write also specifies previously unknown cells, and makes the
 * cell whole: for writes with no edge of their own to say where between the
 * cells it lies, such as a fill's, whose region meets the other paper nowhere.
 */
export function paintCell(m: Mask, index: number, value: 0 | 1): boolean {
	const changed = m.data[index] !== value || !!m.validMask && !m.validMask[index] || !!m.level && m.level[index] !== value * 255;
	m.data[index] = value;
	if (m.validMask) m.validMask[index] = 1;
	if (m.level) m.level[index] = value * 255;
	return changed;
}

/** True when nothing has been painted: every cell is the left colour. */
export function isEmpty(m: Mask): boolean {
	return !m.data.some((v) => v !== 0);
}

/** Read a cell, or `0` outside the mask, so callers need no bounds checks. */
export function get(m: Mask, x: number, y: number): 0 | 1 {
	if (x < 0 || y < 0 || x >= m.size || y >= m.size) return 0;
	return m.data[y * m.size + x] ? 1 : 0;
}

/**
 * Nearest-neighbour resize of raw cells. The engine may answer at a lower
 * resolution than ours, and the mask is two-colour, so interpolation would only
 * invent a third value that neither side can use.
 */
export function resample(data: Uint8Array, from: number, to: number): Uint8Array {
	if (from === to) return new Uint8Array(data);
	const out = new Uint8Array(to * to);
	for (let y = 0; y < to; y++) {
		// Sample at the centre of the destination cell, so scaling up and back down
		// is stable instead of drifting towards one corner.
		const sy = Math.min(from - 1, Math.floor(((y + 0.5) * from) / to));
		const rowIn = sy * from;
		const rowOut = y * to;
		for (let x = 0; x < to; x++) {
			const sx = Math.min(from - 1, Math.floor(((x + 0.5) * from) / to));
			out[rowOut + x] = data[rowIn + sx]!;
		}
	}
	return out;
}

/**
 * The share of cells where two equally sized masks disagree, 0 to 1.
 *
 * This is the number the success panel shows as "difference from the mask", and
 * the yardstick every comparison in the tests uses. It lives here rather than
 * beside the rasteriser because it compares two masks and knows nothing about
 * where either came from; the caller pairs it with `resample` when the two were
 * measured at different resolutions.
 */
export function maskMismatch(a: Uint8Array, b: Uint8Array, validMask?: Uint8Array): number {
	if (a.length !== b.length || !a.length) throw new Error('Masks must have the same size.');
	if (validMask && validMask.length !== a.length) throw new Error('Observation mask must match the compared masks.');
	let differing = 0, counted = 0;
	for (let i = 0; i < a.length; i++) {
		if (validMask && !validMask[i]) continue;
		counted++;
		if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) differing++;
	}
	if (!counted) throw new Error('Comparison requires observed pixels.');
	return differing / counted;
}

/**
 * The mask as one ASCII string: bits packed eight to a byte, then base64.
 *
 * A 400 × 400 mask becomes about 27 KB of text — small enough to hand to a future
 * save format, which is the only reason the pair exists (see `session.serialize`).
 * `btoa` and `atob` are global in browsers, workers and Node alike, so the module
 * still needs no DOM.
 */
export function packMask(m: Mask): string {
	const bytes = new Uint8Array(Math.ceil(m.data.length / 8));
	for (let i = 0; i < m.data.length; i++) {
		if (m.data[i]) bytes[i >> 3]! |= 0x80 >> (i & 7);
	}
	// String.fromCharCode takes its arguments on the stack, so a full mask goes over
	// in chunks rather than in one call that would overflow it.
	let binary = '';
	for (let i = 0; i < bytes.length; i += 8192) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
	}
	return btoa(binary);
}

/** The inverse of `packMask`; null when the text is not a mask of that size. */
export function unpackMask(size: number, packed: string): Mask | null {
	if (!Number.isInteger(size) || size <= 0) return null;
	const cells = size * size;
	let binary: string;
	try {
		binary = atob(packed);
	} catch {
		return null; // not base64 at all
	}
	if (binary.length < Math.ceil(cells / 8)) return null;
	const mask = createMask(0, size);
	for (let i = 0; i < cells; i++) {
		mask.data[i] = (binary.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
	}
	return mask;
}

/** A mask's levels as ASCII, a byte a cell in base64, for the same save as `packMask`. */
export function packLevels(level: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < level.length; i += 8192) {
		binary += String.fromCharCode(...level.subarray(i, i + 8192));
	}
	return btoa(binary);
}

/** The inverse of `packLevels`; null when the text is not the levels of a mask of that size. */
export function unpackLevels(size: number, packed: string): Uint8Array | null {
	if (!Number.isInteger(size) || size <= 0) return null;
	let binary: string;
	try {
		binary = atob(packed);
	} catch {
		return null;
	}
	if (binary.length !== size * size) return null;
	const level = new Uint8Array(size * size);
	for (let i = 0; i < level.length; i++) level[i] = binary.charCodeAt(i);
	return level;
}
