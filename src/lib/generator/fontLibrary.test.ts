import { describe, expect, it } from 'vitest';
import { FontLibrary, SPECK, buildGrown, fallbackGlyph, type FontFiles } from './fontLibrary';
import { readFont } from './fontFile';
import { FALLBACK_FONTS, fontsourceUrl, unicodeRanges } from './fontFaces';
import { normalizeText } from './state';
import type { Font, Ring } from './geometry';
import { STATIC_FONTS, staticFontFiles } from '$lib/server/staticFonts';

const ours = (name: string, subset: string) => `${STATIC_FONTS}${name}-${subset}.woff`;
const box = (rings: Ring[]) => {
	const xs = rings.flat().map(p => p[0]), ys = rings.flat().map(p => p[1]);
	return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
};

/** Fontsource as the tests see it: each URL one of our files, each font's subsets as given; what was asked for, counted. */
function fakeFiles(urls: Record<string, string>, subsets: Record<string, Record<string, string>>) {
	const asked: string[] = [];
	const files: FontFiles = {
		shipped: STATIC_FONTS,
		async file(url) {
			asked.push(url);
			return staticFontFiles.file(urls[url] ?? url);
		},
		async subsets(id) {
			asked.push(`api:${id}`);
			return subsets[id] ?? {};
		}
	};
	return { files, asked };
}

describe('the letters a text is written with', () => {
	it('takes every character our fonts have, from their own files, as the page does', async () => {
		const library = new FontLibrary(staticFontFiles);
		const font = await library.font('nunito', 'J~?,:;\'"()/@%€éñçłß ');
		expect(Object.keys(font.glyphs).sort()).toEqual([...'J~?,:;\'"()/@%€éñçłß '].sort());
		// Kalam and Cinzel grow as their outlines always did, a letter at a time.
		const kalam = await library.font('kalam', 'H'), raw = await readFont((await staticFontFiles.file(ours('kalam', 'latin')))!, 'H');
		expect(kalam.glyphs.H).toEqual(buildGrown(raw.glyphs.H, .025));
	});

	it("fetches a Google font's other subsets when a text needs them, and asks Fontsource only then", async () => {
		const face = { id: 'example', weight: 400 };
		const { files, asked } = fakeFiles(
			{ [fontsourceUrl(face, 'latin')]: ours('nunito', 'latin'), [fontsourceUrl(face, 'latin-ext')]: ours('nunito', 'latin-ext') },
			{ example: { latin: 'U+0000-00FF', 'latin-ext': 'U+0100-02BA' } });
		const library = new FontLibrary(files);
		expect(Object.keys((await library.font('gf:example:400', 'Aa')).glyphs)).toEqual(['A', 'a']);
		expect(asked).toEqual([fontsourceUrl(face, 'latin')]);
		const polish = await library.font('gf:example:400', 'ł');
		expect(polish.glyphs['ł'].advance).toBe((await new FontLibrary(staticFontFiles).font('nunito', 'ł')).glyphs['ł'].advance);
		expect(asked).toEqual([fontsourceUrl(face, 'latin'), 'api:example', fontsourceUrl(face, 'latin-ext')]);
	});

	it("writes a character the font lacks in the symbol font, else the emoji font, as tall as the font's capitals", async () => {
		// Stand-ins: a font with only its Latin file, the symbols Nunito's second file, the emoji Bungee's.
		const [symbols, emoji] = FALLBACK_FONTS, plain = { id: 'plain', weight: 400 };
		const { files } = fakeFiles({
			[fontsourceUrl(plain, 'latin')]: ours('alfaslabone', 'latin'),
			[fontsourceUrl(symbols, 'symbols')]: ours('nunito', 'latin-ext'),
			[fontsourceUrl(emoji, '7')]: ours('bungee', 'latin-ext')
		}, { [symbols.id]: { symbols: 'U+0100-017F' }, [emoji.id]: { '[7]': 'U+0180-024F' } });
		const library = new FontLibrary(files);
		const font = await library.font('gf:plain:400', 'HłƏ雪');
		expect(Object.keys(font.glyphs).sort()).toEqual(['H', 'ł', 'Ə'].sort());
		const cap = box(font.glyphs.H.contours);
		for (const char of 'łƏ') {
			const placed = box(font.glyphs[char].contours);
			// Within the capitals' band, as tall as it (no wider than half as much again), centred in it.
			expect(placed.top, char).toBeGreaterThanOrEqual(cap.top - .03);
			expect(placed.bottom, char).toBeLessThanOrEqual(cap.bottom + .03);
			expect((placed.top + placed.bottom) / 2, char).toBeCloseTo((cap.top + cap.bottom) / 2, 1);
			expect(placed.left, char).toBeGreaterThan(0);
			expect(placed.right, char).toBeLessThan(font.glyphs[char].advance);
		}
	});

	it('scales a stand-in to the capitals, keeping its proportions', () => {
		const H: Font['glyphs'][string] = { advance: .8, contours: [[[.1, -.7], [.7, -.7], [.7, 0], [.1, 0]]] };
		const heart: Font['glyphs'][string] = { advance: 2, contours: [[[0, -2], [1, -2], [1, 0], [0, 0]]] };
		const placed = box(fallbackGlyph(heart, { glyphs: { H } }).contours);
		expect(placed.bottom - placed.top).toBeCloseTo(.7, 4);
		expect(placed.right - placed.left).toBeCloseTo(.35, 4);
		expect(placed.left).toBeCloseTo(.1, 4);
	});

	it("leaves out a stand-in's specks, too small to cut, and keeps its holes that are not", () => {
		const H: Font['glyphs'][string] = { advance: .8, contours: [[[.1, -.7], [.7, -.7], [.7, 0], [.1, 0]]] };
		const square = (x: number, y: number, side: number): Ring => [[x, y], [x + side, y], [x + side, y + side], [x, y + side]];
		// A tree 1 em tall with a hole .4 em across and an ornament .02 em across.
		const tree: Font['glyphs'][string] = { advance: 1, contours: [square(0, -1, 1), square(.3, -.7, .4), square(.1, -.15, .02)] };
		const placed = fallbackGlyph(tree, { glyphs: { H } });
		expect(placed.contours).toHaveLength(2);
		expect(.02 * .02 * .7 * .7).toBeLessThan(SPECK);
	});

	it('leaves out the characters that only choose an emoji’s form or join emoji', () => {
		expect(normalizeText('❤️ 👨‍👩‍👧 👍🏽')).toBe('❤ 👨👩👧 👍');
	});

	it('reads a CSS unicode-range', () => {
		expect(unicodeRanges('U+0000-00FF, U+0131,U+1F3??')).toEqual([[0, 0xff], [0x131, 0x131], [0x1f300, 0x1f3ff]]);
	});
});
