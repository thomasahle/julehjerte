/**
 * A heart's SVG as a string, for the prerender — see $lib/front/galleryHearts
 * for why the front page hands its hearts around as markup instead of geometry.
 *
 * The string is rendered by <PaperHeartSVG> itself rather than by a second
 * SVG writer, so the HTML is byte for byte what the component has always
 * emitted, down to its scoped class, and cannot drift from it.
 *
 * Import this module only while prerendering (`if (!browser)`): it pulls in
 * `svelte/server` and the component, and none of that is any use in a browser
 * that already has the drawing.
 */
import { render } from 'svelte/server';
import PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
import type { HeartDesign } from '$lib/types/heart';

/** `render()` wraps its output in the root fragment's hydration markers. */
const OPEN = '<!--[-->';
const CLOSE = '<!--]-->';

/**
 * @param idPrefix must be unique per heart on the page — PaperHeartSVG's
 * clip-path ids are document-global (see the note in HangingHeart).
 */
export function renderHeartSvg(design: HeartDesign, idPrefix: string, size = 400): string {
	const { body } = render(PaperHeartSVG, {
		props: {
			readonly: true,
			idPrefix,
			initialFingers: design.fingers,
			initialGridSize: design.gridSize,
			initialWeaveParity: design.weaveParity ?? 0,
			colors: design.colors,
			size
		}
	});

	// A changed wrapper would silently put stray comments in every card, and the
	// hero's bootstrap clones these nodes; fail the build instead.
	if (!body.startsWith(OPEN) || !body.endsWith(CLOSE)) {
		throw new Error('renderHeartSvg: unexpected wrapper around svelte/server render() output');
	}
	return body.slice(OPEN.length, body.length - CLOSE.length);
}
