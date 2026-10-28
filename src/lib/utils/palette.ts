/**
 * The colourful mode's paper pairs, and which heart gets which —
 * docs/redesign/DESIGN.md §3 "Nav", "As built: colours in the header".
 *
 * With the header's "Farverig" button pressed, every heart that follows the
 * site's paper pair is woven from a pair of its own instead, and each press
 * deals the pairs out anew. The pairs are a
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
 *     its edge would otherwise be its drop shadow alone (ochre and white).
 *   - none of them is the site's own red and white: it is too bright beside
 *     the rest, and the header has a button of its own for it.
 *
 * Which heart gets which, in two steps. First a heart gets a *slot*, fixed in
 * its markup: a gallery heart the slot at its position in the gallery order
 * (all categories, as hearts.jsonc lists them), cycling through the twelve. Two
 * gallery hearts then share a slot only when they are a multiple of
 * PALETTE.length apart in that order, and the gallery grid is at most six
 * columns wide, so a card's neighbours left, right, above, below and
 * diagonally (1, c - 1, c and c + 1 away) never share its slot. A hash of the
 * id would leave that to chance: with twelve slots, about one card in six
 * would match its right-hand neighbour. A heart outside the gallery (a
 * visitor's own, a shared one) has no position, so it takes a stable hash of
 * its id instead. Then each press of the button draws a random permutation
 * that says which pair each slot shows. It is one-to-one, so neighbours still
 * never share a pair, and the hearts all change colour without any of their
 * markup changing: the permutation is a set of variables on <html>.
 */
import { ALL_HEART_IDS } from '$lib/data/categories';
import type { HeartColors } from '$lib/types/heart';

export interface PalettePair extends HeartColors {
	/** A short name, for the docs and the tests. */
	name: string;
	/** What the header's colour dialog calls it, in both languages. */
	label: { da: string; en: string };
	/**
	 * Its strong paper's colour family, so the colourful button's four cells
	 * can show four that differ (iconSlots).
	 */
	family: 'red' | 'green' | 'blue' | 'gold' | 'purple';
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
	// Not the site's own red and white, which is too bright beside the rest and
	// has a button of its own: the same idea, greyed down to sit with them.
	{
		name: 'rønnebær',
		family: 'red',
		label: { da: 'Rønnebær og hør', en: 'Rowan and linen' },
		left: '#e7e3dd', right: '#9b3b37'
	},
	{
		name: 'gran',
		family: 'green',
		label: { da: 'Gran og creme', en: 'Spruce and cream' },
		left: '#efe6cf', right: '#2f5d44'
	},
	{
		name: 'nat',
		family: 'blue',
		label: { da: 'Nat og guld', en: 'Navy and gold' },
		left: '#dcb55e', right: '#22385c'
	},
	{
		name: 'bordeaux',
		family: 'red',
		label: { da: 'Bordeaux og rosa', en: 'Burgundy and blush' },
		left: '#f0cbc6', right: '#7c2236'
	},
	{
		name: 'petrol',
		family: 'green',
		label: { da: 'Petrol og sand', en: 'Teal and sand' },
		left: '#e9d7b5', right: '#1f5c61'
	},
	{
		name: 'okker',
		family: 'gold',
		label: { da: 'Okker og hvid', en: 'Ochre and white' },
		left: '#fbf4e6', right: '#b8802a', edge: true
	},
	{
		name: 'skifer',
		family: 'blue',
		label: { da: 'Skifer og is', en: 'Slate and ice' },
		left: '#dde8f0', right: '#3f5c7c'
	},
	{
		name: 'blomme',
		family: 'purple',
		label: { da: 'Blomme og rosé', en: 'Plum and rose' },
		left: '#e8b9c6', right: '#5c2b50'
	},
	{
		name: 'mynte',
		family: 'green',
		label: { da: 'Skov og mynte', en: 'Forest and mint' },
		left: '#cfe3d2', right: '#3f6f55'
	},
	{
		name: 'kanel',
		family: 'gold',
		label: { da: 'Kanel og creme', en: 'Cinnamon and cream' },
		left: '#f3e2cc', right: '#9a4a2a'
	},
	{
		name: 'sort',
		family: 'red',
		label: { da: 'Sort og rød', en: 'Black and red' },
		left: '#c2362b', right: '#1f1d1d'
	},
	{
		name: 'lyng',
		family: 'purple',
		label: { da: 'Lyng og lys rosa', en: 'Heather and pale pink' },
		left: '#efdfe6', right: '#7d5a7e'
	}
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
 * The slot of whatever comes in the gallery right after the heart with this id: the card that ends
 * its row ("Lav dit eget mønster") carries on the cycle as one more heart would.
 */
export function pairSlotAfter(heartId: string): number {
	return (pairIndex(heartId) + 1) % PALETTE.length;
}

/**
 * What a heart's element carries so the mode can recolour it with CSS alone:
 * its slot (`data-pair`) and the slot's papers and outline as custom
 * properties, which read the shuffle's `--pal-<slot>-*` variables on <html>
 * (paletteVariables) and fall back to the unshuffled pair. They are written
 * whether the mode is on or not, into the prerendered HTML too, so turning it
 * on, reshuffling, or reloading with it on needs no more than the class and
 * the variables on <html> (src/app.css, "Colourful mode").
 */
export function pairAttributes(heartId: string): { 'data-pair': string; style: string } {
	const slot = pairIndex(heartId);
	return { 'data-pair': String(slot), style: slotStyle(slot) };
}

/** The custom properties a heart in this slot reads, as an inline style. */
export function slotStyle(slot: number): string {
	const pair = PALETTE[slot];
	return (
		`--pair-left: var(--pal-${slot}-l, ${pair.left}); ` +
		`--pair-right: var(--pal-${slot}-r, ${pair.right}); ` +
		`--pair-edge: var(--pal-${slot}-o, ${pair.edge ? EDGE_COLOR : 'transparent'});`
	);
}

/** The hairline round a heart whose light paper is nearly the page (`edge`). */
export const EDGE_COLOR = 'rgb(28 51 41 / 0.55)';

/**
 * The colourful mode's shuffle: slot k shows PALETTE[permutation[k]]. Every
 * reshuffle draws a new permutation; since it is one-to-one, two hearts in
 * different slots still never share a pair, so the gallery's neighbour rule
 * holds for any of them.
 */
export type Permutation = readonly number[];

/** The unshuffled palette: slot k shows pair k. */
export const IDENTITY: Permutation = PALETTE.map((_, i) => i);

/** A uniformly random permutation of the palette, never `avoid` (the one on show). */
export function randomPermutation(random: () => number = Math.random, avoid?: Permutation): number[] {
	for (;;) {
		const p = PALETTE.map((_, i) => i);
		for (let i = p.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[p[i], p[j]] = [p[j], p[i]];
		}
		if (!avoid || p.some((v, i) => v !== avoid[i])) return p;
	}
}

/** Whether this is a permutation of the palette's indices. */
export function isPermutation(p: readonly unknown[]): p is Permutation {
	if (p.length !== PALETTE.length) return false;
	const seen = new Set<number>();
	for (const v of p) {
		if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= PALETTE.length || seen.has(v)) return false;
		seen.add(v);
	}
	return true;
}

/** The `--pal-<slot>-l/-r/-o` variables a shuffle sets on <html>. */
export function paletteVariables(permutation: Permutation): Record<string, string> {
	const vars: Record<string, string> = {};
	permutation.forEach((pairIndex, slot) => {
		const pair = PALETTE[pairIndex];
		vars[`--pal-${slot}-l`] = pair.left;
		vars[`--pal-${slot}-r`] = pair.right;
		vars[`--pal-${slot}-o`] = pair.edge ? EDGE_COLOR : 'transparent';
	});
	iconPairs(permutation).forEach((pairIndex, cell) => {
		vars[`--pal-icon-${cell}`] = PALETTE[pairIndex].right;
	});
	return vars;
}

/**
 * The four pairs whose strong papers fill the colourful button's cells: the
 * first four of the shuffle, in its order, that come from different colour
 * families, so three greens never stand in for "colourful". The head's inline
 * script follows the same rule ($lib/stores/colorMode).
 */
export function iconPairs(permutation: Permutation): number[] {
	const picked: number[] = [];
	const families = new Set<string>();
	for (const pairIndex of permutation) {
		if (picked.length === 4) break;
		if (families.has(PALETTE[pairIndex].family)) continue;
		families.add(PALETTE[pairIndex].family);
		picked.push(pairIndex);
	}
	return picked;
}
