/**
 * Letter outlines read from a font file, as `scripts/generator/build-outlines.py`
 * makes them for the fonts we ship: curves flattened within .0005 em, the
 * contours that overlap merged under the non-zero rule, in ems with y down,
 * each ring's area positive. Reads TrueType outlines from a TrueType or WOFF
 * file, which is what Fontsource serves for every Google font (see
 * `googleFonts`); a static instance only, as variations are not applied.
 */
import ClipperLib from 'clipper-lib';
import type { Font, Point, Ring } from './geometry';

/** The characters the fonts we ship carry. */
export const FONT_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÆØÅæøåÄÖÜäöüÉé0123456789+-&.! ';

/** A file that is not a font, or one whose outlines this does not read. */
export class FontFileError extends Error {}

/** A contour as the font stores it: points on the curve, and the control
 * points of the quadratic curves between them. */
type Spline = { x: number; y: number; on: boolean }[];

const TOLERANCE = .0005, SCALE = 1e6;
/** The tables read, and the ones that must be there. */
const NEEDED = ['head', 'maxp', 'hhea', 'hmtx', 'cmap', 'loca', 'glyf'];

const tag = (view: DataView, at: number) =>
	String.fromCharCode(...[0, 1, 2, 3].map(i => view.getUint8(at + i)));

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const reader = new ReadableStream<BufferSource>({
		start(controller) {
			controller.enqueue(data);
			controller.close();
		}
	}).pipeThrough(new DecompressionStream('deflate')).getReader();
	const chunks: Uint8Array[] = [];
	for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	chunks.reduce((at, c) => (out.set(c, at), at + c.length), 0);
	return out;
}

/** The tables this reads, from a WOFF file (each zlib-compressed) or a
 * TrueType one. */
async function tables(bytes: Uint8Array<ArrayBuffer>): Promise<Map<string, DataView>> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length < 12) throw new FontFileError('Not a font');
	const signature = tag(view, 0), woff = signature === 'wOFF';
	const flavor = woff ? tag(view, 4) : signature;
	if (flavor === 'OTTO') throw new FontFileError('PostScript outlines');
	if (flavor !== '\0\x01\0\0' && flavor !== 'true') throw new FontFileError('Not a font');
	const result = new Map<string, DataView>();
	const count = view.getUint16(woff ? 12 : 4);
	for (let i = 0; i < count; i++) {
		const at = woff ? 44 + 20 * i : 12 + 16 * i, name = tag(view, at);
		if (!NEEDED.includes(name)) continue;
		const offset = view.getUint32(at + (woff ? 4 : 8)), length = view.getUint32(at + (woff ? 8 : 12));
		if (offset + length > bytes.length) throw new FontFileError('Truncated font');
		let data = bytes.subarray(offset, offset + length);
		if (woff && length < view.getUint32(at + 12)) data = await inflate(data);
		result.set(name, new DataView(data.buffer, data.byteOffset, data.byteLength));
	}
	for (const name of NEEDED) if (!result.has(name)) throw new FontFileError(`No ${name} table`);
	return result;
}

/** The glyph a character maps to, from the font's Unicode map: the full
 * repertoire's (format 12) before the basic plane's (format 4). */
function characterMap(cmap: DataView): (code: number) => number {
	let best: { format: number; offset: number } | undefined;
	for (let i = 0; i < cmap.getUint16(2); i++) {
		const platform = cmap.getUint16(4 + 8 * i), encoding = cmap.getUint16(6 + 8 * i);
		const offset = cmap.getUint32(8 + 8 * i), format = cmap.getUint16(offset);
		if ((platform === 0 || platform === 3 && (encoding === 1 || encoding === 10))
			&& (format === 12 || format === 4 && best?.format !== 12)) best = { format, offset };
	}
	if (!best) throw new FontFileError('No Unicode map');
	const { format, offset } = best;
	if (format === 12)
		return code => {
			for (let g = 0, at = offset + 16; g < cmap.getUint32(offset + 12); g++, at += 12)
				if (code >= cmap.getUint32(at) && code <= cmap.getUint32(at + 4))
					return cmap.getUint32(at + 8) + code - cmap.getUint32(at);
			return 0;
		};
	const segments = cmap.getUint16(offset + 6), ends = offset + 14, starts = ends + segments + 2;
	const deltas = starts + segments, ranges = deltas + segments;
	return code => {
		for (let s = 0; s < segments; s += 2) {
			if (code > cmap.getUint16(ends + s)) continue;
			const start = cmap.getUint16(starts + s), delta = cmap.getUint16(deltas + s), range = cmap.getUint16(ranges + s);
			if (code < start) return 0;
			if (!range) return (code + delta) & 0xffff;
			const glyph = cmap.getUint16(ranges + s + range + 2 * (code - start));
			return glyph ? (glyph + delta) & 0xffff : 0;
		}
		return 0;
	};
}

/** A glyph's contours in font units, y up, its components placed. */
function splines(glyf: DataView, start: (id: number) => number, id: number, depth = 0): Spline[] {
	const at0 = start(id), end = start(id + 1);
	if (end <= at0) return [];
	const count = glyf.getInt16(at0);
	if (count >= 0) {
		const ends = Array.from({ length: count }, (_, i) => glyf.getUint16(at0 + 10 + 2 * i));
		const points = count ? ends[count - 1] + 1 : 0;
		let at = at0 + 10 + 2 * count;
		at += 2 + glyf.getUint16(at);
		const flags: number[] = [];
		while (flags.length < points) {
			const flag = glyf.getUint8(at++);
			flags.push(flag);
			if (flag & 8) for (let r = glyf.getUint8(at++); r > 0; r--) flags.push(flag);
		}
		flags.length = points;
		// Each coordinate is a byte (its sign in a flag), a repeat of the last, or a word.
		const coordinates = (short: number, same: number) => {
			let value = 0;
			return flags.map(flag => {
				if (flag & short) value += (flag & same ? 1 : -1) * glyf.getUint8(at++);
				else if (!(flag & same)) {
					value += glyf.getInt16(at);
					at += 2;
				}
				return value;
			});
		};
		const xs = coordinates(2, 16), ys = coordinates(4, 32);
		return ends.map((last, i) => {
			const first = i ? ends[i - 1] + 1 : 0;
			return flags.slice(first, last + 1).map((flag, k) => ({ x: xs[first + k], y: ys[first + k], on: !!(flag & 1) }));
		});
	}
	if (depth > 8) throw new FontFileError('Components nest too deep');
	const result: Spline[] = [];
	const f2dot14 = (at: number) => glyf.getInt16(at) / 16384;
	let at = at0 + 10, flags: number;
	do {
		flags = glyf.getUint16(at);
		const component = glyf.getUint16(at + 2), xy = flags & 2;
		let a1: number, a2: number;
		if (flags & 1) {
			[a1, a2] = xy ? [glyf.getInt16(at + 4), glyf.getInt16(at + 6)] : [glyf.getUint16(at + 4), glyf.getUint16(at + 6)];
			at += 8;
		} else {
			[a1, a2] = xy ? [glyf.getInt8(at + 4), glyf.getInt8(at + 5)] : [glyf.getUint8(at + 4), glyf.getUint8(at + 5)];
			at += 6;
		}
		let [a, b, c, d] = [1, 0, 0, 1];
		if (flags & 8) {
			a = d = f2dot14(at);
			at += 2;
		} else if (flags & 0x40) {
			[a, d] = [f2dot14(at), f2dot14(at + 2)];
			at += 4;
		} else if (flags & 0x80) {
			[a, b, c, d] = [f2dot14(at), f2dot14(at + 2), f2dot14(at + 4), f2dot14(at + 6)];
			at += 8;
		}
		const parts = splines(glyf, start, component, depth + 1)
			.map(s => s.map(p => ({ x: a * p.x + c * p.y, y: b * p.x + d * p.y, on: p.on })));
		let dx: number, dy: number;
		if (xy) [dx, dy] = flags & 0x800 ? [a * a1 + c * a2, b * a1 + d * a2] : [a1, a2];
		else {
			// The component placed so that its point a2 meets the glyph's point a1.
			const ours = result.flat()[a1], theirs = parts.flat()[a2];
			if (!ours || !theirs) throw new FontFileError('Bad component anchor');
			[dx, dy] = [ours.x - theirs.x, ours.y - theirs.y];
		}
		result.push(...parts.map(s => s.map(p => ({ x: p.x + dx, y: p.y + dy, on: p.on }))));
	} while (flags & 0x20);
	return result;
}

/** A contour as a ring, each quadratic curve split into pieces that stray
 * from it by at most `tolerance`. */
function polyline(spline: Spline, tolerance: number): Point[] {
	const k = spline.findIndex(p => p.on);
	// Start on the curve: at its first point there, or between the first and
	// last control points of a contour that has none.
	const points = k < 0
		? [{ x: (spline[0].x + spline.at(-1)!.x) / 2, y: (spline[0].y + spline.at(-1)!.y) / 2, on: true }, ...spline]
		: [...spline.slice(k), ...spline.slice(0, k)];
	const ring: Point[] = [[points[0].x, points[0].y]];
	const curve = (cx: number, cy: number, x: number, y: number) => {
		const [x0, y0] = ring.at(-1)!;
		// A quadratic's chords of a parameter step h stray by at most h²|p0 - 2c + p1| / 4.
		const n = Math.max(1, Math.ceil(Math.sqrt(Math.hypot(x0 - 2 * cx + x, y0 - 2 * cy + y) / 4 / tolerance)));
		for (let i = 1; i <= n; i++) {
			const t = i / n, u = 1 - t;
			ring.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
		}
	};
	let control: Spline[number] | undefined;
	for (const p of [...points.slice(1), points[0]]) {
		if (p.on) {
			if (control) curve(control.x, control.y, p.x, p.y);
			else ring.push([p.x, p.y]);
			control = undefined;
		} else {
			if (control) curve(control.x, control.y, (control.x + p.x) / 2, (control.y + p.y) / 2);
			control = p;
		}
	}
	ring.pop();
	return ring;
}

const area = (r: Ring) => r.reduce((s, a, i) => {
	const b = r[(i + 1) % r.length];
	return s + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;

/** The region the rings fill under the non-zero rule, as rings: each outer
 * one followed by its holes. */
function filled(rings: Ring[]): Ring[] {
	const clipper = new ClipperLib.Clipper(), tree = new ClipperLib.PolyTree();
	clipper.AddPaths(rings.map(r => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))),
		ClipperLib.PolyType.ptSubject, true);
	clipper.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
	return ClipperLib.JS.PolyTreeToExPolygons(tree)
		.flatMap(({ outer, holes }) => [outer, ...holes])
		.map(path => path.map(({ X, Y }): Point => [Math.round(X / SCALE * 1e5) / 1e5, Math.round(Y / SCALE * 1e5) / 1e5]))
		.filter(r => r.length > 2 && area(r) !== 0)
		.map(r => area(r) < 0 ? r.reverse() : r);
}

/** The font's outlines of the characters we use, from its file's bytes.
 * Characters it lacks are left out, as the shipped fonts leave them. */
export async function readFont(bytes: Uint8Array<ArrayBuffer>, characters = FONT_CHARACTERS): Promise<Font> {
	const t = await tables(bytes);
	const head = t.get('head')!, loca = t.get('loca')!, hmtx = t.get('hmtx')!;
	const em = head.getUint16(18), long = head.getInt16(50) === 1;
	const glyphCount = t.get('maxp')!.getUint16(4), metrics = t.get('hhea')!.getUint16(34);
	if (!em || !metrics) throw new FontFileError('No metrics');
	const start = (id: number) => long ? loca.getUint32(4 * id) : 2 * loca.getUint16(2 * id);
	const glyphOf = characterMap(t.get('cmap')!);
	const glyphs: Font['glyphs'] = {};
	for (const char of characters) {
		const id = glyphOf(char.codePointAt(0)!);
		if (!id || id >= glyphCount) continue;
		const rings = splines(t.get('glyf')!, start, id)
			.filter(s => s.length > 2)
			.map(s => polyline(s, TOLERANCE * em).map(([x, y]): Point => [x / em, -y / em]));
		glyphs[char] = {
			advance: Math.round(hmtx.getUint16(4 * Math.min(id, metrics - 1)) / em * 1e5) / 1e5,
			contours: filled(rings)
		};
	}
	return { glyphs };
}
