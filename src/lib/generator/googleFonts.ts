/**
 * Any Google font for the text, found by name: the families in our index
 * (`scripts/generator/google-fonts.mjs`, most popular first), each fetched
 * when chosen from Fontsource's copy of Google Fonts on jsDelivr, rather than
 * from Google, outlined in the browser (see `fontFile`) and, where its strokes
 * are thinner than ours, thickened (see `strokes`). Unlike the fonts we ship,
 * none is tested: the generator says when one is hard to cut.
 */
import type { Font } from './geometry';

/** A family in the index: Fontsource's id, its name, and the weight fetched. */
export type GoogleFamily = readonly [id: string, family: string, weight: number];

/** The state names a Google font by its id and weight. */
const CHOICE = /^gf:([a-z0-9]+(?:-[a-z0-9]+)*):([1-9]00)$/;
export const isGoogleFont = (font: string) => CHOICE.test(font);
export const googleFontChoice = ([id, , weight]: GoogleFamily) => `gf:${id}:${weight}`;

/** The fonts we ship that Google Fonts also has: their search results choose
 * ours, tested and, where thin, thickened. */
export const SHIPPED: Record<string, string> = {
	nunito: 'nunito', 'bree-serif': 'breeserif', oswald: 'oswald', kalam: 'kalam', cinzel: 'cinzel',
	righteous: 'righteous', 'josefin-sans': 'josefinsans', 'alfa-slab-one': 'alfaslabone', bungee: 'bungee'
};

/** The family's file with its Latin letters: woff, whose zlib browsers can
 * inflate, where woff2's Brotli they cannot. */
export function googleFontUrl(choice: string): string {
	const [, id, weight] = CHOICE.exec(choice) ?? [];
	if (!id) throw new Error(`Not a Google font: ${choice}`);
	return `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-${weight}-normal.woff`;
}

/** A family's name from its id, until the index has the real one. */
export const familyName = (choice: string, index: readonly GoogleFamily[] = []) =>
	index.find(f => googleFontChoice(f) === choice)?.[1]
	?? (CHOICE.exec(choice)?.[1] ?? choice).split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The families whose names hold every word searched for, spaces or not:
 * the one named so first, then those with a word starting with each (or
 * starting with them all, spaces left out), then the rest, each in the
 * index's order, the popular first. */
export function matchingFamilies(index: readonly GoogleFamily[], query: string): GoogleFamily[] {
	const words = fold(query).split(/\s+/).filter(Boolean), whole = words.join('');
	if (!words.length) return [];
	const rank = (name: string) => name.replace(/\s/g, '') === whole ? 0
		: name.replace(/\s/g, '').startsWith(whole) || words.every(w => name.split(/\s+/).some(part => part.startsWith(w))) ? 1 : 2;
	return index
		.map(family => ({ family, name: fold(family[1]) }))
		.filter(({ name }) => words.every(w => name.replace(/\s/g, '').includes(w)))
		.map(({ family, name }) => ({ family, rank: rank(name) }))
		.sort((a, b) => a.rank - b.rank)
		.map(({ family }) => family);
}

const loaded = new Map<string, Promise<Font>>();

/** The outlines in a font file, thickened where thin: in a worker of their
 * own, as measuring the strokes takes a moment, where the browser has one. */
function outlined(bytes: ArrayBuffer): Promise<Font> {
	if (typeof Worker === 'undefined')
		return Promise.all([import('./fontFile'), import('./strokes')])
			.then(async ([{ readFont }, { thickened }]) => thickened(await readFont(new Uint8Array(bytes))));
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./fontWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<{ font?: Font; error?: string }>) => {
			worker.terminate();
			if (event.data.font) resolve(event.data.font);
			else reject(new Error(event.data.error));
		};
		worker.onerror = event => {
			worker.terminate();
			reject(new Error(event.message));
		};
		worker.postMessage(bytes, [bytes]);
	});
}

/** The family's outlines, fetched and read once a visit; a failed request
 * is tried again the next time. */
export function loadGoogleFont(choice: string): Promise<Font> {
	let font = loaded.get(choice);
	if (!font) {
		font = fetch(googleFontUrl(choice))
			.then(response => {
				if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
				return response.arrayBuffer();
			})
			.then(outlined);
		font.catch(() => loaded.delete(choice));
		loaded.set(choice, font);
	}
	return font;
}

/** The CSS family that shows a Google family's name in its own letters. */
export const previewFamily = (choice: string) => `juleflet-${choice.replace(/:/g, '-')}`;

const previews = new Set<string>();

/** Loads that family from the same file as its outlines, once. */
export function loadPreview(choice: string): void {
	if (previews.has(choice) || typeof FontFace === 'undefined') return;
	previews.add(choice);
	const face = new FontFace(previewFamily(choice), `url(${googleFontUrl(choice)}) format('woff')`);
	document.fonts.add(face);
	face.load().catch(() => {
		/* The name shows in the page's own letters. */
	});
}

/** The sample "Aa" the font buttons show, from the font's outlines. */
export function fontSample(font: Font): { d: string; viewBox: string } | undefined {
	const rings: [number, number][][] = [];
	let x = 0;
	for (const char of 'Aa') {
		const glyph = font.glyphs[char];
		if (!glyph) return;
		rings.push(...glyph.contours.map(r => r.map(([u, v]): [number, number] => [u + x, v])));
		x += glyph.advance + .05;
	}
	const points = rings.flat();
	if (!points.length) return;
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const [left, top] = [Math.min(...xs), Math.min(...ys)];
	const [width, height] = [Math.max(...xs) - left, Math.max(...ys) - top];
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return {
		d: rings.map(r => 'M' + r.map(([u, v]) => `${round(u)},${round(v)}`).join('L') + 'Z').join(''),
		viewBox: [left - .03, top - .03, width + .06, height + .06].map(round).join(' ')
	};
}
