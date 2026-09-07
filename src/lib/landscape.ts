/**
 * The hand-drawn winter landscape (2172x724) that the whole redesign hangs on.
 *
 * The drawing is inlined into the page by `Landscape.svelte` (never as an <img>),
 * because its <defs> carry reusable ids that other inline SVGs on the same page
 * reference with `<use href="#…">`:
 *
 *   pine-a, pine-b, pine-c   fir silhouettes, tip at (0,0), base at y = 202, width about ±65
 *   snow-cap                 frost, drawn with fill="#fbfcfa" in the same group as a pine
 *   star                     34-unit star, drawn with fill="#e0b75a" (--gold)
 *   sky, distant-hill, middle-hill, near-hill, snow   gradients used by the drawing itself
 *
 * Those ids are global to the document, so **the landscape may be inlined only
 * once per page** and no other inline SVG may define ids with those names. Any
 * page that renders <Fir> or a `<use href="#star">` must also render <Landscape>,
 * otherwise the references resolve to nothing and the shape disappears.
 */
import landscapeSvg from '$lib/assets/landscape.svg?raw';

export const LANDSCAPE_WIDTH = 2172;
export const LANDSCAPE_HEIGHT = 724;
export const LANDSCAPE_VIEWBOX = `0 0 ${LANDSCAPE_WIDTH} ${LANDSCAPE_HEIGHT}`;

/** Fir fills from the drawing, dark to light. Index 0 is the front-most green. */
export const FIR_FILLS = ['#35503f', '#3b5d46', '#3e5948', '#34523f'] as const;

/** The frost colour a pine's `snow-cap` is drawn in. */
export const SNOW_CAP_FILL = '#fbfcfa';

/** The gold the landscape's stars are drawn in (= --gold). */
export const STAR_FILL = '#e0b75a';

/** Height in user units of `pine-a`/`pine-b`/`pine-c` at scale 1. */
export const PINE_BASE_HEIGHT = 202;

export type PineSymbol = 'pine-a' | 'pine-b' | 'pine-c';

/**
 * A decoration placed on a drawing's own coordinate grid: position plus one
 * size number — `scale` for a star, `r` for a snow dot. Used by the hero's sky
 * overlay and by the gallery frame, which draw the same two loops.
 */
export type Placed = readonly [x: number, y: number, k: number];

/**
 * The drawing's markup without its outer <svg> element, <title> and <desc>:
 * the payload `Landscape.svelte` re-wraps in an aria-hidden <svg>. Computed once
 * at module load, not per component instance.
 */
export const LANDSCAPE_INNER = landscapeSvg
	.replace(/^[\s\S]*?<svg[^>]*>/, '')
	.replace(/<\/svg>\s*$/, '')
	.replace(/\s*<title[\s\S]*?<\/title>/, '')
	.replace(/\s*<desc[\s\S]*?<\/desc>/, '')
	.trim();

/**
 * The transform that places one of the drawing's pines with its tip at (x, tipY)
 * and the given height in the surrounding SVG's user units. `mirrored` flips it
 * horizontally; `widthFactor` squeezes it. Mirrors `landPine()` in the mockup
 * generator — use it when building a transform attribute by hand; otherwise use
 * `Fir.svelte`, which is the same maths.
 */
export function firTransform(
	x: number,
	tipY: number,
	height: number,
	mirrored = false,
	widthFactor = 1
): string {
	const k = height / PINE_BASE_HEIGHT;
	const kx = (mirrored ? -1 : 1) * k * widthFactor;
	return `translate(${x} ${tipY}) scale(${kx.toFixed(3)} ${k.toFixed(3)})`;
}
