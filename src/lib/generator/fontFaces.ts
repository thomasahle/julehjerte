/**
 * The fonts the design page writes with, as Fontsource has them: the nine we
 * ship, any Google font a visitor finds, and the symbol and emoji fonts that
 * stand in for a character the chosen font lacks. No outlines here: they are
 * read from the font files where they are needed ($lib/generator/fontLibrary).
 */

/** A font on Fontsource: its id and the weight written with. */
export type FontFace = { id: string; weight: number };

/**
 * The fonts we ship, each at its weight, as Fontsource's static files of their
 * Latin subsets in static/generator/fonts/ (`{name}-latin.woff`,
 * `{name}-latin-ext.woff`, with the font's licence beside them). Kalam's and
 * Cinzel's hairlines are thinner than paper strips cut by hand, so their
 * letters grow by `grow` ems all round, as the outlines the site shipped until
 * 22 Oct 2026 were grown.
 */
export const SHIPPED_FONTS: Record<string, FontFace & { grow?: number }> = {
	nunito: { id: 'nunito', weight: 800 },
	breeserif: { id: 'bree-serif', weight: 400 },
	oswald: { id: 'oswald', weight: 600 },
	kalam: { id: 'kalam', weight: 700, grow: .025 },
	cinzel: { id: 'cinzel', weight: 900, grow: .04 },
	righteous: { id: 'righteous', weight: 400 },
	josefinsans: { id: 'josefin-sans', weight: 700 },
	alfaslabone: { id: 'alfa-slab-one', weight: 400 },
	bungee: { id: 'bungee', weight: 400 }
};

/** The subsets of the fonts we ship that are in static/generator/fonts/; the
 * others come from Fontsource when a text needs them. */
export const SHIPPED_SUBSETS = ['latin', 'latin-ext'] as const;

/**
 * Where a character no subset of the chosen font has is looked for, in order:
 * the symbols (♥ ★ ❄ ✓ ✝ ☃ …), then the emoji as outlines, not colour (🎄 🎅
 * ⭐ …), at its boldest.
 */
export const FALLBACK_FONTS: FontFace[] = [
	{ id: 'noto-sans-symbols-2', weight: 400 },
	{ id: 'noto-emoji', weight: 700 }
];

const CHOICE = /^gf:([a-z0-9]+(?:-[a-z0-9]+)*):([1-9]00)$/;

/** The face a font choice names: one of ours by its name, or a Google font's `gf:{id}:{weight}`. */
export function fontFace(choice: string): FontFace | undefined {
	const shipped = SHIPPED_FONTS[choice];
	if (shipped) return shipped;
	const [, id, weight] = CHOICE.exec(choice) ?? [];
	return id ? { id, weight: Number(weight) } : undefined;
}

export const isGoogleFont = (choice: string) => CHOICE.test(choice);

/** A subset's file on Fontsource's CDN: woff, whose zlib browsers can
 * inflate, where woff2's Brotli they cannot. */
export const fontsourceUrl = ({ id, weight }: FontFace, subset: string) =>
	`https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${weight}-normal.woff`;

/** Fontsource's description of a font, with its subsets' Unicode ranges. */
export const fontsourceApiUrl = (id: string) => `https://api.fontsource.org/v1/fonts/${id}`;

/** A CSS unicode-range ("U+0000-00FF,U+0131,U+1F3??") as [first, last] code points. */
export function unicodeRanges(range: string): [number, number][] {
	return range.split(',').map(part => part.trim().replace(/^u\+/i, '')).filter(Boolean).map(part => {
		if (part.includes('?')) return [parseInt(part.replace(/\?/g, '0'), 16), parseInt(part.replace(/\?/g, 'f'), 16)];
		const [first, last = first] = part.split('-');
		return [parseInt(first, 16), parseInt(last, 16)];
	});
}

/** The characters dropped from a text before it is written: the variation
 * selectors that ask for an emoji's colour or text form, the joiner that
 * builds one emoji from several (each is then drawn on its own), and the skin
 * tones, which a paper heart has no colour for. */
export const INVISIBLE = /\uFE0E|\uFE0F|\u200D|\p{Emoji_Modifier}/gu;
