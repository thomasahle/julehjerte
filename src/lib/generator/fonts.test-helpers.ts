/** The fonts we ship as the tests write with them: every character of their
 * files in static/generator/fonts/, grown as the page grows them. */
import type { Font } from './geometry';
import { readFont } from './fontFile';
import { buildGrown } from './fontLibrary';
import { SHIPPED_FONTS, SHIPPED_SUBSETS } from './fontFaces';
import { STATIC_FONTS, staticFontFiles } from '$lib/server/staticFonts';

const read = new Map<string, Promise<Font>>();

/** One of our fonts by its name (nunito, kalam, …). */
export function shippedFont(name: string): Promise<Font> {
	let font = read.get(name);
	if (!font) {
		font = (async () => {
			const face = SHIPPED_FONTS[name];
			if (!face) throw new Error(`Not a font we ship: ${name}`);
			const glyphs: Font['glyphs'] = {};
			for (const subset of SHIPPED_SUBSETS) {
				const bytes = await staticFontFiles.file(`${STATIC_FONTS}${name}-${subset}.woff`);
				for (const [char, glyph] of Object.entries((await readFont(bytes!)).glyphs))
					glyphs[char] ??= face.grow ? buildGrown(glyph, face.grow) : glyph;
			}
			return { glyphs };
		})();
		read.set(name, font);
	}
	return font;
}
