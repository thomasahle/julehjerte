/**
 * Thin fonts made as thick as the fonts we ship. How thin a font's strokes
 * are is measured on its letters drawn as pixels: the share of their area in
 * strokes thinner than a width is what no disc of that width inside a letter
 * covers (the letters "opened" by it). A font with more of its letters that
 * thin than ours have is grown all round, as our thin ones are
 * (`fontLibrary`'s `buildGrown`), by the least that leaves no more;
 * each letter by less where growing would make the paper round it, in its
 * counters and notches, thin instead.
 */
import ClipperLib from 'clipper-lib';
import type { Font, Point, Ring } from './geometry';

/** Of the letters' area, the share that may lie in thinner strokes than THIN_WIDTH. */
export const THIN_SHARE = .01;
/** The width in ems that the fonts we ship have all but THIN_SHARE of their
 * letters' area in thicker strokes than (Cinzel, our thinnest, .055). */
export const THIN_WIDTH = .05;
/** The letters whose strokes are measured: those the text is mostly written in. */
export const MEASURED_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Ems per pixel. */
const PIXEL = .004;
/** Pixels round each letter: room for it to grow by half THIN_WIDTH and
 * for a disc THIN_WIDTH across beyond that. */
const MARGIN = Math.ceil(THIN_WIDTH / PIXEL) + 2;

type Raster = { width: number; height: number; inside: Uint8Array };

/** The rings filled under the even-odd rule (the font's are apart), sampled
 * at pixel centres, with MARGIN pixels round them. */
function raster(rings: Ring[]): Raster | null {
	const points = rings.flat();
	if (!points.length) return null;
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const x0 = Math.min(...xs) - MARGIN * PIXEL, y0 = Math.min(...ys) - MARGIN * PIXEL;
	const width = Math.ceil((Math.max(...xs) - x0) / PIXEL) + MARGIN, height = Math.ceil((Math.max(...ys) - y0) / PIXEL) + MARGIN;
	const inside = new Uint8Array(width * height), crossings: number[] = [];
	for (let row = 0; row < height; row++) {
		const y = y0 + (row + .5) * PIXEL;
		crossings.length = 0;
		for (const ring of rings)
			for (let i = 0; i < ring.length; i++) {
				const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
				if ((ay <= y) !== (by <= y)) crossings.push(ax + (y - ay) / (by - ay) * (bx - ax));
			}
		crossings.sort((a, b) => a - b);
		for (let k = 0; k + 1 < crossings.length; k += 2) {
			const from = Math.max(0, Math.ceil((crossings[k] - x0) / PIXEL - .5));
			const to = Math.min(width - 1, Math.floor((crossings[k + 1] - x0) / PIXEL - .5));
			if (to >= from) inside.fill(1, row * width + from, row * width + to + 1);
		}
	}
	return { width, height, inside };
}

/** Squared distances in pixels from every pixel to the nearest pixel not in
 * `set` (Felzenszwalb and Huttenlocher's transform, rows then columns). */
function squaredDistances({ width, height }: Raster, set: Uint8Array): Float64Array {
	const far = 1e20, out = new Float64Array(width * height);
	for (let i = 0; i < out.length; i++) out[i] = set[i] ? far : 0;
	const n = Math.max(width, height), f = new Float64Array(n), d = new Float64Array(n),
		v = new Int32Array(n), z = new Float64Array(n + 1);
	const pass = (length: number, start: number, stride: number) => {
		for (let i = 0; i < length; i++) f[i] = out[start + i * stride];
		let k = 0;
		v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
		for (let q = 1; q < length; q++) {
			let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			while (s <= z[k]) {
				k--;
				s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			}
			k++;
			v[k] = q; z[k] = s; z[k + 1] = Infinity;
		}
		k = 0;
		for (let q = 0; q < length; q++) {
			while (z[k + 1] < q) k++;
			d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
		}
		for (let i = 0; i < length; i++) out[start + i * stride] = d[i];
	};
	for (let row = 0; row < height; row++) pass(width, row * width, 1);
	for (let col = 0; col < width; col++) pass(height, col, width);
	return out;
}

/** The pixels in `set` that no disc of radius `radius` pixels inside it
 * covers, from how far each is from the nearest pixel not in it (`depth`,
 * squared): the centres such discs can have are as far in as `radius`, and a
 * pixel is covered within `radius` of one. */
function thinIn(r: Raster, set: Uint8Array, radius: number, depth = squaredDistances(r, set)): Uint8Array {
	const notCentre = new Uint8Array(depth.length);
	for (let i = 0; i < depth.length; i++) notCentre[i] = depth[i] >= radius * radius ? 0 : 1;
	const covered = squaredDistances(r, notCentre), thin = new Uint8Array(depth.length);
	for (let i = 0; i < depth.length; i++) thin[i] = set[i] && covered[i] > radius * radius ? 1 : 0;
	return thin;
}

const count = (pixels: Uint8Array) => {
	let n = 0;
	for (let i = 0; i < pixels.length; i++) n += pixels[i];
	return n;
};

/** A letter's pixels, how deep inside it each is and, once it grows, how far outside. */
type Letter = { raster: Raster; depth: Float64Array; reach?: Float64Array };

const letterOf = (r: Raster): Letter => ({ raster: r, depth: squaredDistances(r, r.inside) });

/** The letter's pixels once grown by `g` pixels all round (`inside`), or what is left round it (`!inside`). */
function grownPixels(letter: Letter, g: number, inside = true): Uint8Array {
	const r = letter.raster, out = new Uint8Array(r.inside.length);
	if (g <= 0) {
		for (let i = 0; i < out.length; i++) out[i] = inside ? r.inside[i] : 1 - r.inside[i];
		return out;
	}
	if (!letter.reach) {
		for (let i = 0; i < out.length; i++) out[i] = 1 - r.inside[i];
		letter.reach = squaredDistances(r, out);
	}
	const { reach } = letter;
	for (let i = 0; i < out.length; i++) out[i] = (reach[i] <= g * g) === inside ? 1 : 0;
	return out;
}

/** The measured letters of each font, once for each set of characters. */
const measured = new WeakMap<Font, Map<string, Letter[]>>();

function letters(font: Font, chars = MEASURED_LETTERS): Letter[] {
	let sets = measured.get(font);
	if (!sets) measured.set(font, sets = new Map());
	let known = sets.get(chars);
	if (!known) {
		known = [];
		for (const char of chars) {
			const glyph = font.glyphs[char];
			const r = glyph && raster(glyph.contours);
			if (r) known.push(letterOf(r));
		}
		sets.set(chars, known);
	}
	return known;
}

/** The letters' thin pixels, as `thinShare`; once more than `most` of them
 * are found, the count so far. */
function thinPixels(font: Font, width: number, grow: number, most = Infinity, chars = MEASURED_LETTERS): { thin: number; total: number } {
	const radius = width / 2 / PIXEL, g = grow / PIXEL;
	const grown = letters(font, chars).map(letter => ({ letter, inside: g > 0 ? grownPixels(letter, g) : letter.raster.inside }));
	let total = 0, thin = 0;
	for (const { inside } of grown) for (let i = 0; i < inside.length; i++) total += inside[i];
	for (const { letter, inside } of grown) {
		thin += count(thinIn(letter.raster, inside, radius, g > 0 ? undefined : letter.depth));
		if (thin > most * total) break;
	}
	return { thin, total };
}

/** The share of the letters' area, once grown by `grow` ems all round, in
 * strokes thinner than `width` ems: what no disc of that width inside a
 * letter covers. */
export function thinShare(font: Font, width: number, grow = 0): number {
	const { thin, total } = thinPixels(font, width, grow);
	return total ? thin / total : 0;
}

/** Whether more than THIN_SHARE of the letters, grown by `grow`, is thinner than THIN_WIDTH. */
const tooThin = (font: Font, grow: number, chars = MEASURED_LETTERS) => {
	const { thin, total } = thinPixels(font, THIN_WIDTH, grow, THIN_SHARE, chars);
	return thin > THIN_SHARE * total;
};

/** The width in ems, up to `most`, below which `share` of the letters' area
 * lies: the font's thin strokes, to the pixel. */
export function thinWidth(font: Font, share = THIN_SHARE, most = .4): number {
	if (thinShare(font, most) <= share) return most;
	let low = 0, high = most;
	while (high - low > PIXEL / 2) {
		const mid = (low + high) / 2;
		if (thinShare(font, mid) <= share) low = mid;
		else high = mid;
	}
	return low;
}

/** The least the letters (`chars` of the font, its Latin letters unless
 * told) must grow by, all round, to have no more than THIN_SHARE of their
 * area thinner than THIN_WIDTH: none for a font as thick as ours, at most
 * half THIN_WIDTH, to the pixel. */
export function thinGrowth(font: Font, chars = MEASURED_LETTERS): number {
	if (!tooThin(font, 0, chars)) return 0;
	let low = 0, high = THIN_WIDTH / 2;
	if (tooThin(font, high, chars)) return high;
	while (high - low > PIXEL) {
		const mid = (low + high) / 2;
		if (tooThin(font, mid, chars)) low = mid;
		else high = mid;
	}
	return high;
}

const SCALE = 1e6;

type Shape = { outer: ClipperLib.Path; holes: ClipperLib.Path[] }[];

/** A glyph's rings (apart, each area positive) as Clipper's shapes. */
function shapeOf(contours: Ring[]): Shape {
	const clipper = new ClipperLib.Clipper(), tree = new ClipperLib.PolyTree();
	clipper.AddPaths(contours.map(r => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))),
		ClipperLib.PolyType.ptSubject, true);
	clipper.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
	return ClipperLib.JS.PolyTreeToExPolygons(tree);
}

/** The shape grown by `by` ems all round, its corners rounded within the
 * outlines' own .0005 em. */
function grownShape(shape: Shape, by: number): Shape {
	const offset = new ClipperLib.ClipperOffset(2, .0005 * SCALE), tree = new ClipperLib.PolyTree();
	offset.AddPaths(shape.flatMap(({ outer, holes }) => [outer, ...holes]), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	offset.Execute(tree, by * SCALE);
	return ClipperLib.JS.PolyTreeToExPolygons(tree);
}

/** Whether two shapes have as many parts, with as many counters each. */
const sameParts = (a: Shape, b: Shape) =>
	a.length === b.length && a.map(p => p.holes.length).sort().join() === b.map(p => p.holes.length).sort().join();

const signedArea = (r: Ring) => r.reduce((s, a, i) => {
	const b = r[(i + 1) % r.length];
	return s + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;

/** The shape's rings in the font's way: each outer one followed by its
 * holes, moved right by `dx`, each ring's area positive. */
const ringsOf = (shape: Shape, dx: number): Ring[] => shape
	.flatMap(({ outer, holes }) => [outer, ...holes])
	.map(path => path.map(({ X, Y }): Point => [Math.round((X / SCALE + dx) * 1e5) / 1e5, Math.round(Y / SCALE * 1e5) / 1e5]))
	.filter(r => r.length > 2 && signedArea(r) !== 0)
	.map(r => signedArea(r) < 0 ? r.reverse() : r);

/**
 * Of a growth `by` ems, how much the glyph takes, to the pixel: as much as
 * leaves every passage in the paper round it (between its serifs, into its
 * counters, between its parts) at least THIN_WIDTH wide, so none that was
 * narrower is narrowed, and none of its counters or notches with more of its
 * area thinner than THIN_WIDTH than before, or than a half or a quarter of
 * that, by more than THIN_SHARE of the letter's area: a counter or notch may
 * narrow to THIN_WIDTH, and one narrower already may not become a sliver
 * (though it may fill in), while a crook between a serif and its stem, which
 * growing fills from its tip, costs nothing.
 */
export function glyphGrowth(contours: Ring[], by: number): number {
	const r = raster(contours);
	if (!r || by <= 0) return 0;
	// A passage narrower than THIN_WIDTH closes when the glyph grows by half that more.
	const shape = shapeOf(contours), open = (grow: number) => sameParts(grownShape(shape, grow + THIN_WIDTH / 2), shape);
	const letter = letterOf(r), allowed = THIN_SHARE * count(r.inside), radii = [2, 4, 8].map(k => THIN_WIDTH / k / PIXEL);
	const thinRound = (grow: number) => {
		const round = grownPixels(letter, grow / PIXEL, false), depth = squaredDistances(r, round);
		return radii.map(radius => count(thinIn(r, round, radius, depth)));
	};
	if (!open(0)) return 0;
	const before = thinRound(0), fits = (grow: number) => open(grow) && thinRound(grow).every((n, k) => n - before[k] <= allowed);
	if (fits(by)) return by;
	let low = 0, high = by;
	while (high - low > PIXEL) {
		const mid = (low + high) / 2;
		if (fits(mid)) low = mid;
		else high = mid;
	}
	return low;
}

/** The glyph grown by what it takes of `most` ems (`glyphGrowth`), or as
 * near it as keeps its parts apart and its counters; moved right and its
 * advance widened by what it grew, so the letters keep their spacing. */
export function grownGlyph(glyph: Font['glyphs'][string], most: number): Font['glyphs'][string] {
	const by = glyphGrowth(glyph.contours, most);
	if (!by) return glyph;
	const shape = shapeOf(glyph.contours);
	const kept = (grow: number) => {
		const next = grownShape(shape, grow);
		return sameParts(next, shape) ? next : null;
	};
	let grow = by, best = kept(by);
	if (!best) {
		let low = 0, high = by;
		for (let step = 0; step < 5; step++) {
			const mid = (low + high) / 2, next = kept(mid);
			if (next) [low, best] = [mid, next];
			else high = mid;
		}
		grow = low;
	}
	if (!best) return glyph;
	return { advance: Math.round((glyph.advance + 2 * grow) * 1e5) / 1e5, contours: ringsOf(best, grow) };
}

/** The font with its thin strokes as thick as ours (`thinGrowth`): each
 * glyph grown by as much, or as near it as leaves the paper round it as it
 * was (`glyphGrowth`). A font as thick as ours comes back as it is. */
export function thickened(font: Font): Font {
	const by = thinGrowth(font);
	if (!by) return font;
	return { glyphs: Object.fromEntries(Object.entries(font.glyphs).map(([char, glyph]) => [char, grownGlyph(glyph, by)])) };
}

