/**
 * The painted mask: the woven square as two-colour pixels.
 *
 * Paint mode never edits curves. It edits a fixed grid of cells over the woven
 * square — the same square the inverse engine solves in — where `0` is the left
 * lobe's paper colour and `1` the right lobe's. That is the convention the
 * engine uses for `prepared.mask`, so a mask can travel to the engine and back
 * without anyone having to remember which colour is which.
 *
 * The resolution is fixed at `MASK_SIZE` rather than settable: the engine works
 * at 400 anyway, and a visible cell size would turn a drawing tool into a
 * spreadsheet. Everything here is plain data (`Uint8Array`), so masks can be
 * cloned for undo, transformed, and compared without touching the DOM.
 */

/** Cells per side of the mask. The resolution the engine solves at. */
export const MASK_SIZE = 400;

/** Row-major cells, `data[y * size + x]`, each `0` (left colour) or `1` (right). */
export type Mask = { size: number; data: Uint8Array };

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
	return { size: m.size, data: new Uint8Array(m.data) };
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

/** Write a cell; positions outside the mask are dropped. */
export function set(m: Mask, x: number, y: number, value: 0 | 1): void {
	if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
	m.data[y * m.size + x] = value;
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

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The mask as one ASCII string: bits packed eight to a byte, then base64.
 *
 * Written by hand rather than with `btoa` because this module must stay usable
 * outside a browser (tests, and any future prerender). A 400 × 400 mask becomes
 * about 27 KB of text — small enough to hand to a future save format, which is
 * the only reason the pair exists (see `session.serialize`).
 */
export function packMask(m: Mask): string {
	const bytes = new Uint8Array(Math.ceil(m.data.length / 8));
	for (let i = 0; i < m.data.length; i++) {
		if (m.data[i]) bytes[i >> 3]! |= 0x80 >> (i & 7);
	}
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i]!;
		const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
		const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
		out += BASE64[b0 >> 2];
		out += BASE64[((b0 & 3) << 4) | (b1 >> 4)];
		out += i + 1 < bytes.length ? BASE64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
		out += i + 2 < bytes.length ? BASE64[b2 & 63] : '=';
	}
	return out;
}

/** The inverse of `packMask`; null when the text is not a mask of that size. */
export function unpackMask(size: number, packed: string): Mask | null {
	if (!Number.isInteger(size) || size <= 0) return null;
	const cells = size * size;
	const wanted = Math.ceil(cells / 8);
	const bytes: number[] = [];
	let acc = 0;
	let bits = 0;
	for (const ch of packed) {
		if (ch === '=') break;
		const v = BASE64.indexOf(ch);
		if (v < 0) return null;
		acc = (acc << 6) | v;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((acc >> bits) & 0xff);
		}
	}
	if (bytes.length < wanted) return null;
	const mask = createMask(0, size);
	for (let i = 0; i < cells; i++) {
		mask.data[i] = (bytes[i >> 3]! >> (7 - (i & 7))) & 1;
	}
	return mask;
}
