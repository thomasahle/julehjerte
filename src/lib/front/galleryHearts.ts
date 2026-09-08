/**
 * What the front page knows about a heart — and how a heart that is already
 * drawn in the prerendered HTML gets on screen without being drawn again.
 * docs/redesign/DESIGN.md §3.
 *
 * The gallery ships 38 finished heart SVGs in the HTML. Building them a second
 * time in the browser cost ~530 ms of script and a 295 KB (61 KB gzipped)
 * download of the bezier geometry the drawing needs — for a picture that was
 * already on the screen. So a card is given its heart as *markup* rather than
 * as geometry, and that markup only ever exists while prerendering: the browser
 * gets `CLAIM_PRERENDERED` instead and keeps the SVG the HTML came with.
 *
 * What a card still needs in the browser is the little that is not the drawing
 * — its name, its difficulty and its own paper colours, if it has any. That is
 * `GalleryHeart`, and it comes from `heart-meta.json`, which is measured in
 * kilobytes rather than hundreds of them.
 */
import type { DifficultyLevel } from '$lib/utils/difficulty';
import { calculateDifficulty } from '$lib/utils/difficulty';
import type { HeartColors, HeartDesign } from '$lib/types/heart';

/**
 * The value the `{@html}` block holding a prerendered heart is given in the
 * browser.
 *
 * Hydrating an `{@html}` block whose value is not empty makes Svelte walk the
 * server's nodes from the block's opening comment to its closing one and adopt
 * them exactly as they are — "the client value will be ignored in favour of the
 * server value". Nothing is parsed, nothing is rebuilt, and the value itself is
 * never seen. It must not be the empty string: that is the block's own initial
 * value, so Svelte would skip the block and leave the hydration cursor inside
 * it, which is a mismatch. The comment is also what the block renders if it is
 * ever run outside hydration, and a comment renders as nothing.
 */
export const CLAIM_PRERENDERED = '<!--prerendered heart-->';

/** A heart as the gallery shows it, without the geometry it is drawn from. */
export interface GalleryHeart {
	id: string;
	name: string;
	difficulty: DifficultyLevel;
	/** The heart's own paper colours, if it has any; otherwise the site's pair. */
	colors?: HeartColors;
	/** Drawn by the visitor, so it can be deleted. */
	isUserCreated?: boolean;
}

/** One of the hero's hanging hearts, which links to its card in the gallery. */
export interface HeroHeart {
	id: string;
	name: string;
	/** The heart's SVG, when it is already in the prerendered HTML. */
	markup?: string;
	/** The design to draw it from, when it is not. */
	design?: HeartDesign;
}

/**
 * A heart the visitor drew, as a card. Their hearts are read from localStorage
 * and are few, so unlike the gallery's they are drawn in the browser and their
 * difficulty is worked out there too.
 */
export function toGalleryHeart(design: HeartDesign): GalleryHeart {
	return {
		id: design.id,
		name: design.name,
		difficulty: calculateDifficulty(design).level,
		colors: design.colors,
		isUserCreated: true
	};
}
