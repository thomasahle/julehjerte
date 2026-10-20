/**
 * The square picture of each gallery heart that search engines are given:
 * static/og/hearts/<id>.png, drawn at build time by
 * scripts/generate-heart-data.mjs (gitignored, like the social cards).
 *
 * The heart is woven in the site's own red and white and hangs in its ribbon on
 * the scene's sky colour (--sky), the colour the heart page's "Hjerte"
 * thumbnail is drawn on: on white the white lobe would vanish. No shadow, so
 * the same file can stand in for that thumbnail (HeartStage), which places it
 * by the geometry below.
 *
 * This module imports nothing: the build script loads it outside SvelteKit.
 */

/** Width and height of the PNG, in px. */
export const HEART_IMAGE_SIZE = 800;

/**
 * The heart's square box in the PNG, in px: the same box (and viewBox) the
 * site's SVG heart fills. The ribbon runs from the top edge into the cleft.
 */
export const HEART_IMAGE_BOX = { left: 100, top: 160, size: 600 } as const;

/** The ribbon's width and how far it reaches into the box, as fractions of the box (HangingHeart's 5.5 % and 24 %). */
export const HEART_IMAGE_RIBBON = { width: 0.055, dip: 0.24 } as const;

/** The background, the site's --sky. */
export const HEART_IMAGE_BACKGROUND = '#d6e1d0';

/** The paper pair, the site's default (--paper-left / --paper-right). */
export const HEART_IMAGE_COLORS = { left: '#ffffff', right: '#b91313' } as const;

/** Root-relative URL of a gallery heart's square picture. */
export function heartImagePath(id: string): string {
	return `/og/hearts/${id}.png`;
}

/**
 * Where to put the PNG so that its heart box covers a square box of the page
 * exactly: the image's width and offsets as percentages of that box's width
 * (margins in % resolve against the width, so this also holds vertically).
 */
export function heartImageFit(): { width: string; left: string; top: string } {
	const { left, top, size } = HEART_IMAGE_BOX;
	const pct = (v: number) => `${Number(((v / size) * 100).toFixed(4))}%`;
	return { width: pct(HEART_IMAGE_SIZE), left: pct(-left), top: pct(-top) };
}

/**
 * The share of the PNG's height, from the top, that holds the ribbon: the
 * ribbon and the sky above the box, and the cleft it dips into, with a 2 %
 * margin. A thumbnail without a ribbon clips this band off the image.
 */
export function heartImageRibbonBand(): number {
	const { top, size } = HEART_IMAGE_BOX;
	return (top + (HEART_IMAGE_RIBBON.dip + 0.02) * size) / HEART_IMAGE_SIZE;
}
