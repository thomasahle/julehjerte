/**
 * The two papers of the weaving film: the colours the visitor has the heart in, and what the
 * film's steps call each of them.
 *
 * The simulator calls its two halves red and white. On the page the "red" one is the heart's
 * right-hand paper and the "white" one its left-hand paper, whatever colours they have: the
 * header's pair, or the heart's own pair in colourful mode.
 *
 * A step names a paper by its colour ("den røde strimmel"). A paper has a colour word only
 * when the word is beyond doubt: a clear red, green or blue, or plain white or black. The
 * pale and greyed papers of the colourful pairs (linen, sand, blush, teal) are called the
 * light or the dark one instead, and so are both papers when they would share a word.
 */
import { tArray, type Language } from '$lib/i18n';

export type Rgb = readonly [number, number, number];

/** The colour words, in the order of the language file's `weavePaperNames`. */
export const PAPER_NAMES = [
	'red',
	'pink',
	'orange',
	'brown',
	'yellow',
	'green',
	'blue',
	'purple',
	'white',
	'black',
	'grey',
	'light',
	'dark'
] as const;
export type PaperName = (typeof PAPER_NAMES)[number];

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)`, as the page's --paper-left / --paper-right are written. */
export function parsePaper(css: string): Rgb | null {
	const value = css.trim();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
	if (hex) {
		const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
		const n = parseInt(full, 16);
		return [n >> 16, (n >> 8) & 255, n & 255];
	}
	const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(value);
	return rgb ? [Math.min(255, +rgb[1]), Math.min(255, +rgb[2]), Math.min(255, +rgb[3])] : null;
}

/** 0xRRGGBB, as the player takes a colour. */
export const paperNumber = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b;

/** Lightness (0 to 1), chroma and hue (degrees) in OKLCH, where equal steps look equal. */
function oklch([r8, g8, b8]: Rgb): [number, number, number] {
	const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	const r = linear(r8 / 255);
	const g = linear(g8 / 255);
	const b = linear(b8 / 255);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/** The colour word nobody would argue with, or null for a pale, greyed or in-between paper. */
function sureName(paper: Rgb): PaperName | null {
	const [L, C, hue] = oklch(paper);
	if (C < 0.03) {
		if (L >= 0.95) return 'white';
		if (L <= 0.3) return 'black';
		return C < 0.015 && L >= 0.4 && L <= 0.75 ? 'grey' : null;
	}
	// A pastel reads as "light" long before it reads as its hue; so does a greyed colour as "dark".
	if (C < 0.05 || (L > 0.8 && C < 0.1)) return null;
	if (hue < 40 || hue >= 340) return L >= 0.7 ? 'pink' : 'red';
	if (hue < 70) return L < 0.6 ? 'brown' : 'orange';
	// Ochre and olive are neither yellow nor brown to everybody.
	if (hue < 115) return L >= 0.75 ? 'yellow' : null;
	if (hue < 175) return 'green';
	// Teal: green to some, blue to others.
	if (hue < 215) return null;
	if (hue < 285) return 'blue';
	return 'purple';
}

/** What the film's steps call the two papers: `red` the simulator's red half, `white` its white. */
export interface PaperWords {
	red: string;
	white: string;
}

/** The two papers' names: each its own colour word where it has one the other does not share. */
export function paperNames(red: Rgb, white: Rgb): { red: PaperName; white: PaperName } {
	const redSure = sureName(red);
	const whiteSure = sureName(white);
	const apart = redSure !== whiteSure;
	const redLighter = oklch(red)[0] > oklch(white)[0];
	return {
		red: (apart && redSure) || (redLighter ? 'light' : 'dark'),
		white: (apart && whiteSure) || (redLighter ? 'dark' : 'light')
	};
}

export function paperWords(red: Rgb, white: Rgb, lang: Language): PaperWords {
	const words = tArray('weavePaperNames', lang);
	const names = paperNames(red, white);
	const word = (name: PaperName) => words[PAPER_NAMES.indexOf(name)] ?? name;
	return { red: word(names.red), white: word(names.white) };
}
