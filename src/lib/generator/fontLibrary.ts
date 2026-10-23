/**
 * The letters a text is written with, read from the fonts' own files: every
 * character a font has, in any of its Fontsource subsets, fetched when a text
 * first needs it; for a character it has in none, the symbol font's or the
 * emoji font's ($lib/generator/fontFaces), scaled to the font's capitals. The
 * nine fonts we ship keep the growth their outlines always had; a thin Google
 * font is thickened as `strokes` decides, one character at a time, as growing
 * a letter is what takes the time.
 *
 * The files come through `FontFiles`: fetched in the browser's font worker
 * ($lib/generator/fontWorker), read from static/ on the server and in tests.
 */
import ClipperLib from 'clipper-lib';
import type { Font, Point, Ring } from './geometry';
import { openFont, type FontReader } from './fontFile';
import { MEASURED_LETTERS, THIN_WIDTH, grownGlyph, thinGrowth } from './strokes';
import {
	FALLBACK_FONTS, INVISIBLE, SHIPPED_FONTS, SHIPPED_SUBSETS, fontFace, fontsourceUrl, unicodeRanges, type FontFace
} from './fontFaces';

type Glyph = Font['glyphs'][string];

/** How the font files are reached. */
export type FontFiles = {
	/** The bytes of a file, or null where there is none. */
	file(url: string): Promise<Uint8Array<ArrayBuffer> | null>;
	/** Fontsource's subsets of a font and their Unicode ranges ("U+0000-00FF,…"). */
	subsets(id: string): Promise<Record<string, string>>;
	/** Where the fonts we ship are: the URL of static/generator/fonts/. */
	shipped: string;
};

const SCALE = 1e6;
const toPaths = (rings: Ring[]) => rings.map(r => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })));
const signedArea = (r: Ring) => r.reduce((s, a, i) => {
	const b = r[(i + 1) % r.length];
	return s + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;
/** Clipper's paths as the font's rings: each area positive, to 1e-5 em. */
const toRings = (paths: ClipperLib.Paths): Ring[] => paths
	.map(path => path.map(({ X, Y }): Point => [Math.round(X / SCALE * 1e5) / 1e5, Math.round(Y / SCALE * 1e5) / 1e5]))
	.filter(r => r.length > 2 && signedArea(r) !== 0)
	.map(r => signedArea(r) < 0 ? r.reverse() : r);

/**
 * The glyph grown `by` ems all round with round corners, as the build grew
 * Kalam and Cinzel (a buffer, simplified within .0005 em), where that keeps
 * its rings as many: a letter whose parts or counters would merge keeps its
 * outline.
 */
export function buildGrown(glyph: Glyph, by: number): Glyph {
	if (!glyph.contours.length) return glyph;
	const union = new ClipperLib.Clipper(), filled: ClipperLib.Paths = [];
	union.AddPaths(toPaths(glyph.contours), ClipperLib.PolyType.ptSubject, true);
	union.Execute(ClipperLib.ClipType.ctUnion, filled, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
	// Shapely's buffer draws a quarter circle in 16 steps.
	const offset = new ClipperLib.ClipperOffset(2, by * SCALE * (1 - Math.cos(Math.PI / 64)));
	const grown: ClipperLib.Paths = [];
	offset.AddPaths(filled, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	offset.Execute(grown, by * SCALE);
	const contours = toRings(grown).map(ring => simplified(ring, .0005)).filter(r => r.length > 2 && signedArea(r) !== 0);
	return contours.length === glyph.contours.length ? { advance: glyph.advance, contours } : glyph;
}

/** A ring with the points Douglas and Peucker's simplification drops within
 * `tolerance` left out, as Shapely's `simplify` leaves a ring: from its first
 * point round to itself again. */
function simplified(ring: Ring, tolerance: number): Ring {
	const line = [...ring, ring[0]], keep = new Uint8Array(line.length), stack: [number, number][] = [[0, line.length - 1]];
	keep[0] = keep[line.length - 1] = 1;
	while (stack.length) {
		const [a, b] = stack.pop()!;
		let far = -1, most = tolerance;
		for (let i = a + 1; i < b; i++) {
			const d = segmentDistance(line[i], line[a], line[b]);
			if (d > most) { most = d; far = i; }
		}
		if (far < 0) continue;
		keep[far] = 1;
		stack.push([a, far], [far, b]);
	}
	return ring.filter((_, i) => keep[i]);
}

const segmentDistance = (p: Point, a: Point, b: Point) => {
	const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
	const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
	return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/** The band a font's capitals stand in: its H's height and side bearing. */
function capitals(font: Font): { height: number; bearing: number } {
	const h = font.glyphs.H, ys = h?.contours.flat().map(p => p[1]) ?? [], xs = h?.contours.flat().map(p => p[0]) ?? [];
	if (!h || !ys.length) return { height: .7, bearing: .05 };
	return { height: Math.max(...ys) - Math.min(...ys), bearing: Math.max(0, (h.advance - (Math.max(...xs) - Math.min(...xs))) / 2) };
}

/** The least area, in square ems, of a stand-in's part or hole: a disc
 * twice the thinnest stroke across. An emoji's specks are details no knife
 * follows at a letter's size, and each would cost the generator a search. */
export const SPECK = Math.PI * THIN_WIDTH ** 2;

/**
 * Another font's glyph as one of `font`'s: as tall as its capitals (no wider
 * than half as much again), centred between the baseline and the capitals'
 * tops, with its H's side bearings; without its specks (`SPECK`) and the
 * points within .002 em of the line through their neighbours (an emoji's
 * curves are drawn in many); thickened as a thin font's letters are,
 * measured on itself.
 */
export function fallbackGlyph(glyph: Glyph, font: Font): Glyph {
	const points = glyph.contours.flat();
	if (!points.length) return glyph;
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const [left, top] = [Math.min(...xs), Math.min(...ys)];
	const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
	const cap = capitals(font), s = Math.min(cap.height / height, 1.5 * cap.height / width);
	// y is down, the baseline at 0.
	const dy = -cap.height / 2 - (height * s) / 2;
	const scaled = glyph.contours.map(r => r.map(([x, y]): Point => [(x - left) * s + cap.bearing, (y - top) * s + dy]));
	const placed: Glyph = {
		advance: Math.round((width * s + 2 * cap.bearing) * 1e5) / 1e5,
		contours: toRings(ClipperLib.Clipper.CleanPolygons(toPaths(scaled.filter(r => Math.abs(signedArea(r)) >= SPECK)), .002 * SCALE))
	};
	const by = thinGrowth({ glyphs: { x: placed } }, 'x');
	return by ? grownGlyph(placed, by) : placed;
}

/** A font's subsets, each file fetched and opened the first time a text needs it. */
class Face {
	private readonly opened = new Map<string, Promise<FontReader | null>>();
	private ranges?: Promise<[string, [number, number][]][]>;

	/** `first`: the subsets tried, in order, before Fontsource is asked which holds a character; `local`: ours on the site. */
	constructor(readonly face: FontFace, private readonly files: FontFiles,
		private readonly first: readonly string[] = [], private readonly local: Record<string, string> = {}) {}

	/** The subset's file opened, once; null where there is none. */
	open(subset: string): Promise<FontReader | null> {
		let reader = this.opened.get(subset);
		if (!reader) {
			reader = this.files.file(this.local[subset] ?? fontsourceUrl(this.face, subset)).then(bytes => bytes && openFont(bytes));
			reader.catch(() => this.opened.delete(subset));
			this.opened.set(subset, reader);
		}
		return reader;
	}

	/** The character's outline from the first of the font's subsets that has it, or undefined. */
	async glyph(char: string): Promise<Glyph | undefined> {
		for (const subset of this.first) {
			const glyph = (await this.open(subset))?.glyph(char);
			if (glyph) return glyph;
		}
		this.ranges ??= this.files.subsets(this.face.id).then(map => Object.entries(map)
			// The emoji's numbered subsets are "[0]" in the ranges, "0" in the files' names.
			.map(([subset, range]): [string, [number, number][]] => [subset.replace(/^\[(\d+)\]$/, '$1'), unicodeRanges(range)])
			.filter(([subset]) => !this.first.includes(subset)));
		const code = char.codePointAt(0)!;
		for (const [subset, ranges] of await this.ranges) {
			if (!ranges.some(([first, last]) => code >= first && code <= last)) continue;
			const glyph = (await this.open(subset))?.glyph(char);
			if (glyph) return glyph;
		}
		return undefined;
	}
}

/** The font a choice writes with, and how its letters grow. */
class Writer {
	readonly face: Face;
	private growth?: Promise<number>;
	private readonly grown = new Map<string, Promise<Glyph | undefined>>();
	private readonly shipped?: (typeof SHIPPED_FONTS)[string];

	constructor(choice: string, face: FontFace, files: FontFiles, private readonly fallbacks: Face[]) {
		this.shipped = SHIPPED_FONTS[choice] === face ? face : undefined;
		this.face = this.shipped
			? new Face(face, files, SHIPPED_SUBSETS, Object.fromEntries(SHIPPED_SUBSETS.map(subset => [subset, `${files.shipped}${choice}-${subset}.woff`])))
			: new Face(face, files, ['latin']);
	}

	/** How far a letter grows: as ours always have, and for a Google font what its Latin letters need. */
	private by(): Promise<number> {
		this.growth ??= (async () => {
			if (this.shipped) return this.shipped.grow ?? 0;
			const latin = await this.face.open('latin');
			const glyphs: Font['glyphs'] = {};
			for (const char of MEASURED_LETTERS) {
				const glyph = latin?.glyph(char);
				if (glyph) glyphs[char] = glyph;
			}
			return thinGrowth({ glyphs });
		})();
		return this.growth;
	}

	/** The character as this font writes it, grown, or from a fallback font; undefined where none has it. */
	glyph(char: string): Promise<Glyph | undefined> {
		let glyph = this.grown.get(char);
		if (!glyph) {
			glyph = (async () => {
				const own = await this.face.glyph(char);
				if (own) {
					const by = await this.by();
					return !by ? own : this.shipped ? buildGrown(own, by) : grownGlyph(own, by);
				}
				for (const fallback of this.fallbacks) {
					const other = await fallback.glyph(char);
					if (!other) continue;
					const H = await this.face.glyph('H');
					return fallbackGlyph(other, { glyphs: H ? { H } : {} });
				}
				return undefined;
			})();
			glyph.catch(() => this.grown.delete(char));
			this.grown.set(char, glyph);
		}
		return glyph;
	}
}

/** The fonts of one page (or one test), each file read once. */
export class FontLibrary {
	private readonly writers = new Map<string, Writer>();
	private readonly fallbacks: Face[];

	constructor(private readonly files: FontFiles) {
		this.fallbacks = FALLBACK_FONTS.map(face => new Face(face, files));
	}

	/**
	 * The glyphs `text` is written with in the chosen font: each of its
	 * characters the font or a fallback has. One that none has is left out, and
	 * the generator names it (the 'character' error).
	 */
	async font(choice: string, text: string): Promise<Font> {
		const face = fontFace(choice);
		if (!face) throw new Error(`Not a font: ${choice}`);
		let writer = this.writers.get(choice);
		if (!writer) this.writers.set(choice, writer = new Writer(choice, face, this.files, this.fallbacks));
		const chars = [...new Set(text.replace(INVISIBLE, '').replace(/\n/g, ''))];
		const glyphs: Font['glyphs'] = {};
		await Promise.all(chars.map(async char => {
			const glyph = await writer.glyph(char);
			if (glyph) glyphs[char] = glyph;
		}));
		return { glyphs };
	}
}
