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

/**
 * A clip for the PNG, as a CSS `clip-path`, that keeps only what lies well inside every heart's
 * outline: the square on its point drawn in a little, and each lobe as a polygon inside its
 * half circle. The front page lays the picture under a card's own heart (HangingHeart), which
 * then covers all of it, in whatever papers the heart is shown. In % of the image.
 */
export function heartImageInside(): string {
	const { left, top, size } = HEART_IMAGE_BOX;
	// In the box's own unit: the square's corners are at 0.128 (cleft), 0.937 (point) and
	// 0.096 / 0.904 (sides, at 0.5325 down); a lobe's half circle has radius 0.286.
	const lobe: [number, number][] = [
		[0.14, 0.54],
		[0.121, 0.507],
		[0.048, 0.33],
		[0.121, 0.153],
		[0.298, 0.08],
		[0.475, 0.153]
	];
	const points: [number, number][] = [
		[0.5, 0.9],
		...lobe,
		[0.5, 0.18],
		...lobe.map(([x, y]): [number, number] => [1 - x, y]).reverse()
	];
	const pct = (v: number) => `${Number((v * 100).toFixed(2))}%`;
	return `polygon(${points
		.map(([x, y]) => `${pct((left + x * size) / HEART_IMAGE_SIZE)} ${pct((top + y * size) / HEART_IMAGE_SIZE)}`)
		.join(', ')})`;
}
