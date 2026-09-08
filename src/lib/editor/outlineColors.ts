import type { LobeId } from '$lib/types/heart';

/**
 * The colour each lobe's cuts are drawn in on the editor canvas.
 *
 * Cyan and orange are not decoration: they are how a visitor tells the two
 * lobes' cuts apart while they overlap in the woven square, and the "Vis
 * omrids" and "Snap til den anden laps punkter" icons repeat them so the
 * checkbox shows the same two colours the canvas will. They therefore have to
 * be one value, not a literal in the canvas and another in the icon.
 *
 * Plain hex rather than a palette token: these are drawn into the SVG as
 * attributes (and travel into exports), not read from the page's cascade, and
 * they belong to the drawing rather than to the site chrome — the same reason
 * heart paper colours live in $lib/stores/colors.ts.
 */
export const LOBE_OUTLINE_COLORS: Record<LobeId, string> = {
	left: '#00ddff',
	right: '#ff8800'
};
