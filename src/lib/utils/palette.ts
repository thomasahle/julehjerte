/**
 * The colourful mode's paper pairs, and which heart gets which —
 * docs/redesign/DESIGN.md §3 "Nav", "As built: colours in the header".
 *
 * With the header's "Farverig" toggle on, every heart that follows the site's
 * paper pair is woven from a pair of its own instead. The pairs are a
 * Scandinavian Christmas set: deep, slightly greyed reds, greens and blues
 * against creams and pale tints, no neon. Each one keeps the site's convention
 * of the lighter paper on the left and the darker one on the right, so the
 * ribbon (cut from the right-hand paper) is always the strong colour.
 *
 * Rules every pair keeps (palette.test.ts checks them):
 *   - the two papers are at least PAIR_CONTRAST_MIN apart in luminance
 *     contrast, so the weave reads;
 *   - a light paper that is almost the page's own snow (#f9f9f3) carries
 *     `edge: true`: the mode draws a faint outline round such a heart, since
 *     its edge would otherwise be its drop shadow alone. The classic red and
 *     white is one of them, kept white because it is the default pair.
 *
 * Which heart gets which: a gallery heart takes the pair at its position in
 * the gallery order (all categories, as hearts.json lists them), cycling
 * through the palette. Two gallery hearts then share a pair only when they
 * are a multiple of PALETTE.length apart in that order, and the gallery grid
 * is at most six columns wide, so a card's neighbours left, right, above,
 * below and diagonally (1, c - 1, c and c + 1 away) never repeat its pair. A
 * hash of the id would leave that to chance: with twelve pairs, about one card
 * in six would match its right-hand neighbour. A heart outside the gallery (a
 * visitor's own, a shared one) has no position, so it takes a stable hash of
 * its id instead: the same heart keeps its colours on every page and reload.
 */
import { ALL_HEART_IDS } from '$lib/data/categories';
import { DEFAULT_COLORS_HEX } from '$lib/stores/colors';
import type { HeartColors } from '$lib/types/heart';

export interface PalettePair extends HeartColors {
	/** A short name, for the docs and the tests. */
	name: string;
	/** The light paper is close to the page background: outline the heart. */
	edge?: boolean;
}

/** The page background (`--page` in app.css), which the light papers are checked against. */
export const PAGE_BACKGROUND = '#f9f9f3';

/** The least luminance contrast between a pair's two papers. */
export const PAIR_CONTRAST_MIN = 2.2;

/** Below this contrast against the page, a light paper needs `edge`. */
export const PAGE_CONTRAST_MIN = 1.15;

/**
 * Ordered so that walking it one step at a time, as the gallery does,
 * alternates warm and cool and light and dark.
 */
export const PALETTE: readonly PalettePair[] = [
	{ name: 'klassisk', left: DEFAULT_COLORS_HEX.left, right: DEFAULT_COLORS_HEX.right, edge: true },
	{ name: 'gran', left: '#efe6cf', right: '#2f5d44' },
	{ name: 'nat', left: '#dcb55e', right: '#22385c' },
	{ name: 'bordeaux', left: '#f0cbc6', right: '#7c2236' },
	{ name: 'petrol', left: '#e9d7b5', right: '#1f5c61' },
	{ name: 'okker', left: '#fbf4e6', right: '#b8802a', edge: true },
	{ name: 'skifer', left: '#dde8f0', right: '#3f5c7c' },
	{ name: 'blomme', left: '#e8b9c6', right: '#5c2b50' },
	{ name: 'mynte', left: '#cfe3d2', right: '#3f6f55' },
	{ name: 'kanel', left: '#f3e2cc', right: '#9a4a2a' },
	{ name: 'sort', left: '#c2362b', right: '#1f1d1d' },
	{ name: 'lyng', left: '#efdfe6', right: '#7d5a7e' }
];

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
	const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!m) throw new Error(`luminance: not a #rrggbb colour: ${hex}`);
	const [r, g, b] = m.slice(1).map((h) => {
		const c = parseInt(h, 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
	const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
	return (hi + 0.05) / (lo + 0.05);
}

const GALLERY_POSITION = new Map(ALL_HEART_IDS.map((id, i) => [id, i]));

/** FNV-1a, 32 bit: a stable, well-spread hash of a short string. */
function hash(text: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** The index into PALETTE of the heart with this id — see the note at the top. */
export function pairIndex(heartId: string): number {
	const position = GALLERY_POSITION.get(heartId);
	return (position ?? hash(heartId)) % PALETTE.length;
}

/**
 * What a heart's element carries so the mode can recolour it with CSS alone:
 * the pair's index (`data-pair`), whether it wants the outline
 * (`data-pair-edge`) and the two papers as custom properties. They are written
 * whether the mode is on or not, into the prerendered HTML too, so turning it
 * on, or reloading with it on, needs no more than the class on <html>
 * (src/app.css, "Colourful mode").
 */
export function pairAttributes(heartId: string): {
	'data-pair': string;
	'data-pair-edge': '' | undefined;
	style: string;
} {
	const index = pairIndex(heartId);
	const pair = PALETTE[index];
	return {
		'data-pair': String(index),
		'data-pair-edge': pair.edge ? '' : undefined,
		style: pairStyle(pair)
	};
}

/** The two custom properties the mode's CSS reads, as an inline style. */
export function pairStyle(pair: HeartColors): string {
	return `--pair-left: ${pair.left}; --pair-right: ${pair.right};`;
}
