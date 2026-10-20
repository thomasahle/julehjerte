/**
 * The Pinterest picture of each gallery heart: static/og/pins/<id>.png, drawn
 * at build time by scripts/generate-heart-data.mjs (gitignored, like the other
 * images under static/og) and served to Pinterest by the /pinterest.xml feed
 * ($lib/pinterest, docs/PINTEREST.md).
 *
 * 2:3 portrait, Pinterest's preferred shape: the heart hangs in its ribbon in
 * the upper two thirds on the scene's sky colour (the white lobe would vanish
 * on the page colour), with its Danish name, a line saying what it is and the
 * domain below.
 *
 * This module imports nothing: the build script loads it outside SvelteKit.
 */

/** Width and height of the PNG, in px. */
export const PIN_IMAGE_WIDTH = 1000;
export const PIN_IMAGE_HEIGHT = 1500;

/** The tagline under the heart's name. */
export const PIN_IMAGE_TAGLINE = 'Gratis skabelon til flettet julehjerte';

/** Root-relative URL of a gallery heart's Pinterest picture. */
export function pinImagePath(id: string): string {
	return `/og/pins/${id}.png`;
}
