import { describe, expect, it } from 'vitest';
import { FontFileError, readFont } from './fontFile';
import { inside, type Point, type Ring } from './geometry';

const files = import.meta.glob<string>('/docs/design-start/assets/fonts/*.ttf', { eager: true, query: '?inline', import: 'default' });
const woffs = import.meta.glob<string>('/static/generator/fonts/*.woff', { eager: true, query: '?inline', import: 'default' });
const bytes = (data: string) => Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
const file = (name: string) => bytes(files[`/docs/design-start/assets/fonts/${name}.ttf`]);
const shipped = (name: string, subset = 'latin') => bytes(woffs[`/static/generator/fonts/${name}-${subset}.woff`]);

/** The area the rings fill, each ring inside an odd number of others a hole. */
const filledArea = (rings: Ring[]) => rings.reduce((sum, ring, i) => {
	const area = Math.abs(ring.reduce((s, a, k) => {
		const b = ring[(k + 1) % ring.length];
		return s + a[0] * b[1] - b[0] * a[1];
	}, 0) / 2);
	return sum + (rings.filter((other, j) => j !== i && inside(ring[0], other)).length % 2 ? -area : area);
}, 0);

/** Whether two of the rings' sides cross, the rings' own neighbours apart. */
function crossing(rings: Ring[]): boolean {
	const turn = (a: Point, b: Point, c: Point) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
	const sides = rings.flatMap((ring, r) => ring.map((p, i) => ({ r, i, n: ring.length, a: p, b: ring[(i + 1) % ring.length] })));
	return sides.some((s, k) => sides.slice(k + 1).some(t => {
		if (s.r === t.r && (Math.abs(s.i - t.i) <= 1 || Math.abs(s.i - t.i) === s.n - 1)) return false;
		return turn(s.a, s.b, t.a) * turn(s.a, s.b, t.b) < 0 && turn(t.a, t.b, s.a) * turn(t.a, t.b, s.b) < 0;
	}));
}

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const reader = new ReadableStream<BufferSource>({
		start(controller) {
			controller.enqueue(data);
			controller.close();
		}
	}).pipeThrough(new CompressionStream('deflate')).getReader();
	const chunks: Uint8Array[] = [];
	for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	chunks.reduce((at, c) => (out.set(c, at), at + c.length), 0);
	return out;
}

/** A TrueType file as WOFF, each table compressed where that makes it smaller. */
async function woff(ttf: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength), count = view.getUint16(4);
	const tables = await Promise.all(Array.from({ length: count }, async (_, i) => {
		const at = 12 + 16 * i, offset = view.getUint32(at + 8);
		const data = ttf.subarray(offset, offset + view.getUint32(at + 12)), packed = await deflate(data);
		return { at, data, stored: packed.length < data.length ? packed : data };
	}));
	let size = 44 + 20 * count;
	const offsets = tables.map(({ stored }) => {
		const offset = size;
		size += Math.ceil(stored.length / 4) * 4;
		return offset;
	});
	const out = new Uint8Array(size), w = new DataView(out.buffer);
	out.set([...'wOFF'].map(c => c.charCodeAt(0)));
	w.setUint32(4, view.getUint32(0));
	w.setUint32(8, size);
	w.setUint16(12, count);
	tables.forEach(({ at, data, stored }, i) => {
		out.set(ttf.subarray(at, at + 4), 44 + 20 * i);
		w.setUint32(48 + 20 * i, offsets[i]);
		w.setUint32(52 + 20 * i, stored.length);
		w.setUint32(56 + 20 * i, data.length);
		out.set(stored, offsets[i]);
	});
	return out;
}

describe('font files', () => {
	it('reads every character of a file, the letters of the files we ship as their TrueType originals', async () => {
		// The static ones, whose files are the same design; Righteous has 2048 units to the em.
		for (const name of ['alfaslabone', 'breeserif', 'bungee', 'righteous']) {
			const font = await readFont(shipped(name)), reference = await readFont(file(name), 'AÆØÅaæøå09&!');
			for (const char of '~?,:;\'"()/@%€éñçß') expect(font.glyphs[char], `${name} ${char}`).toBeDefined();
			expect(Object.keys(font.glyphs).length, name).toBeGreaterThan(200);
			for (const [char, glyph] of Object.entries(reference.glyphs)) {
				const ours = font.glyphs[char];
				expect(ours.contours.length, `${name} ${char}`).toBe(glyph.contours.length);
				expect(ours.advance, `${name} ${char}`).toBeCloseTo(glyph.advance, 4);
				expect(Math.abs(filledArea(ours.contours) / filledArea(glyph.contours) - 1), `${name} ${char}`).toBeLessThan(.01);
			}
		}
		// Polish, Czech and the like are in the second file.
		expect((await readFont(shipped('nunito', 'latin-ext'))).glyphs['ł']).toBeDefined();
	});

	it('merges contours that overlap, as variable fonts draw them', async () => {
		// Cinzel's letters are stems, bars and serifs drawn over each other;
		// merged, they make the build's rings (its P and R have open bowls,
		// its K arms apart from the stem).
		const font = await readFont(file('cinzel'));
		for (const [chars, rings] of [['EFHILMNPRTVWXYZ', 1], ['ABDK', 2]] as const)
			for (const char of chars) expect(font.glyphs[char].contours, char).toHaveLength(rings);
		for (const char of 'AHRØ&') expect(crossing(font.glyphs[char].contours), char).toBe(false);
	});

	it('reads WOFF files as the TrueType files they hold', async () => {
		const ttf = file('righteous');
		expect(await readFont(await woff(ttf))).toEqual(await readFont(ttf));
	});

	it('leaves out characters the font lacks and refuses what is not a font', async () => {
		expect(Object.keys((await readFont(file('righteous'), 'A雪 ')).glyphs)).toEqual(['A', ' ']);
		await expect(readFont(new TextEncoder().encode('<html>Not found</html>'))).rejects.toThrow(FontFileError);
	});
});
