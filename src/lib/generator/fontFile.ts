/**
 * Letter outlines read from a font file, as `scripts/generator/build-outlines.py`
 * made them for the fonts we ship until 22 Oct 2026: curves flattened within
 * .0005 em, the contours that overlap merged under the non-zero rule, in ems
 * with y down, each ring's area positive. Reads TrueType outlines from a TrueType or WOFF
 * file, which is what Fontsource serves for every font, ours among them (see
 * `fontLibrary`); a static instance only, as variations are not applied.
 */
import ClipperLib from 'clipper-lib';
import type { Font, Point, Ring } from './geometry';

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

type CharacterMap = {
	/** The glyph a character maps to, 0 where none. */
	glyph: (code: number) => number;
	/** The characters it maps, those of each range that map to a glyph. */
	codes: () => number[];
};

/** The font's Unicode map: the full repertoire's (format 12) before the
 * basic plane's (format 4). */
function characterMap(cmap: DataView): CharacterMap {
	let best: { format: number; offset: number } | undefined;
	for (let i = 0; i < cmap.getUint16(2); i++) {
		const platform = cmap.getUint16(4 + 8 * i), encoding = cmap.getUint16(6 + 8 * i);
		const offset = cmap.getUint32(8 + 8 * i), format = cmap.getUint16(offset);
		if ((platform === 0 || platform === 3 && (encoding === 1 || encoding === 10))
			&& (format === 12 || format === 4 && best?.format !== 12)) best = { format, offset };
	}
	if (!best) throw new FontFileError('No Unicode map');
	const { format, offset } = best;
	const mapped = (glyph: (code: number) => number, ranges: [number, number][]): CharacterMap => ({
		glyph,
		codes: () => ranges.flatMap(([first, last]) =>
			Array.from({ length: last - first + 1 }, (_, i) => first + i).filter(code => glyph(code)))
	});
	if (format === 12) {
		const groups = Array.from({ length: cmap.getUint32(offset + 12) }, (_, g) => offset + 16 + 12 * g);
		return mapped(code => {
			for (const at of groups)
				if (code >= cmap.getUint32(at) && code <= cmap.getUint32(at + 4))
					return cmap.getUint32(at + 8) + code - cmap.getUint32(at);
			return 0;
		}, groups.map((at): [number, number] => [cmap.getUint32(at), cmap.getUint32(at + 4)]));
	}
	const segments = cmap.getUint16(offset + 6), ends = offset + 14, starts = ends + segments + 2;
	const deltas = starts + segments, ranges = deltas + segments;
	const spans = Array.from({ length: segments / 2 }, (_, k): [number, number] =>
		[cmap.getUint16(starts + 2 * k), cmap.getUint16(ends + 2 * k)]).filter(([first]) => first !== 0xffff);
	return mapped(code => {
		for (let s = 0; s < segments; s += 2) {
			if (code > cmap.getUint16(ends + s)) continue;
			const start = cmap.getUint16(starts + s), delta = cmap.getUint16(deltas + s), range = cmap.getUint16(ranges + s);
			if (code < start) return 0;
			if (!range) return (code + delta) & 0xffff;
			const glyph = cmap.getUint16(ranges + s + range + 2 * (code - start));
			return glyph ? (glyph + delta) & 0xffff : 0;
		}
		return 0;
	}, spans);
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

/** The distance from a point to the segment from p to q. */
function segmentDistance([x, y]: Point, [px, py]: Point, [qx, qy]: Point): number {
	const dx = qx - px, dy = qy - py, length = dx * dx + dy * dy;
	const t = length ? Math.max(0, Math.min(1, ((x - px) * dx + (y - py) * dy) / length)) : 0;
	return Math.hypot(x - (px + t * dx), y - (py + t * dy));
}

/** A curve's points after its first, as the build flattened curves: each
 * piece halved until its chord strays by at most `tolerance` at its quarter
 * points, or fourteen times. */
function flattened(at: (t: number) => Point, tolerance: number): Point[] {
	const result: Point[] = [];
	const step = (a: number, b: number, p: Point, q: Point, depth: number) => {
		const error = Math.max(...[.25, .5, .75].map(v => segmentDistance(at(a + (b - a) * v), p, q)));
		if (error <= tolerance || depth >= 14) {
			result.push(q);
			return;
		}
		const m = (a + b) / 2, r = at(m);
		step(a, m, p, r, depth + 1);
		step(m, b, r, q, depth + 1);
	};
	step(0, 1, at(0), at(1), 0);
	return result;
}

/** A contour as a ring in ems, y down: its quadratic curves flattened within
 * `tolerance` ems (`flattened`), the control points between two of them
 * standing for the on-curve point halfway, as TrueType has it. */
function polyline(spline: Spline, em: number, tolerance: number): Point[] {
	const k = spline.findIndex(p => p.on);
	// Start on the curve: at its first point there, or between the first and
	// last control points of a contour that has none.
	const points = (k < 0
		? [{ x: (spline[0].x + spline.at(-1)!.x) / 2, y: (spline[0].y + spline.at(-1)!.y) / 2, on: true }, ...spline]
		: [...spline.slice(k), ...spline.slice(0, k)]).map(p => ({ x: p.x / em, y: -p.y / em, on: p.on }));
	const ring: Point[] = [[points[0].x, points[0].y]];
	const curve = (bx: number, by: number, cx: number, cy: number) => {
		const [ax, ay] = ring.at(-1)!;
		ring.push(...flattened(t => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * bx + t * t * cx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * by + t * t * cy], tolerance));
	};
	let control: (typeof points)[number] | undefined;
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
	const [x0, y0] = ring[0], [x1, y1] = ring.at(-1)!;
	if (x0 === x1 && y0 === y1) ring.pop();
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

/** A character the text can be written with: not a control character. */
const printable = (code: number) => code >= 0x20 && !(code >= 0x7f && code <= 0x9f);

/** A font file opened: its characters, and each one's outline when first asked for. */
export type FontReader = {
	/** Every character the file maps that a text can be written with. */
	characters(): string[];
	/** The character's outline, or undefined where the file lacks it. */
	glyph(char: string): Font['glyphs'][string] | undefined;
};

/** The font in a file's bytes, its tables read once. */
export async function openFont(bytes: Uint8Array<ArrayBuffer>): Promise<FontReader> {
	const t = await tables(bytes);
	const head = t.get('head')!, loca = t.get('loca')!, hmtx = t.get('hmtx')!, glyf = t.get('glyf')!;
	const em = head.getUint16(18), long = head.getInt16(50) === 1;
	const glyphCount = t.get('maxp')!.getUint16(4), metrics = t.get('hhea')!.getUint16(34);
	if (!em || !metrics) throw new FontFileError('No metrics');
	const start = (id: number) => long ? loca.getUint32(4 * id) : 2 * loca.getUint16(2 * id);
	const map = characterMap(t.get('cmap')!);
	const outlined = new Map<string, Font['glyphs'][string] | undefined>();
	return {
		characters: () => map.codes().filter(printable).map(code => String.fromCodePoint(code)),
		glyph(char) {
			if (outlined.has(char)) return outlined.get(char);
			const id = map.glyph(char.codePointAt(0)!);
			let glyph: Font['glyphs'][string] | undefined;
			if (id && id < glyphCount) {
				const rings = splines(glyf, start, id)
					.filter(s => s.length > 2)
					.map(s => polyline(s, em, TOLERANCE));
				glyph = {
					advance: Math.round(hmtx.getUint16(4 * Math.min(id, metrics - 1)) / em * 1e5) / 1e5,
					contours: filled(rings)
				};
			}
			outlined.set(char, glyph);
			return glyph;
		}
	};
}

/** The font's outlines of `characters`, from its file's bytes: by default
 * every character the file maps. Characters it lacks are left out. */
export async function readFont(bytes: Uint8Array<ArrayBuffer>, characters?: string): Promise<Font> {
	const reader = await openFont(bytes);
	const glyphs: Font['glyphs'] = {};
	for (const char of characters === undefined ? reader.characters() : [...characters]) {
		const glyph = reader.glyph(char);
		if (glyph) glyphs[char] = glyph;
	}
	return { glyphs };
}
