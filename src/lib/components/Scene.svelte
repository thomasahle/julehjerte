<!--
  A "scene": the sky panel the winter landscape sits along the bottom of.

  Used by the front page's hero and by the heart detail page, which had a byte
  identical copy of these rules each (docs/redesign/DESIGN.md §2). The recipe is
  three things that have to agree:

    * a sky background whose bottom 12px is snow-coloured, so a fractional SVG
      edge can never leave a sky hairline under the drawing;
    * `overflow: hidden`, because the drawing is wider than the column on narrow
      viewports;
    * the landscape in a wrapper pinned to `bottom: -1px` with `line-height: 0`,
      at the drawing's own aspect ratio.

  Renders <Landscape> itself, which keeps the "inline the landscape exactly once
  per page" rule easy to honour: one <Scene> per page and it is taken care of.

  Class hooks (both styled here, so a page never needs to reach in):
    .scene           the <section>; add your own class for page layout
    .scene-land      the landscape's wrapper
    .scene-land-svg  the landscape <svg>

  `[data-scene-land] > svg` finds the drawing from outside (the front page's
  gallery measures its rect to follow the hill line, $lib/front/hillLine);
  the classes above are scoped and are not for that.

  The landscape comes *last* in the markup. The page paints while it is still
  parsing, and on a phone the band is an in-flow strip at the foot of the scene:
  had it come first it would paint at the top with nothing above it yet and then
  jump down by the height of the content when that arrived (CLS 0.35 on the
  front page). Being last, it is parsed where it ends up. It still paints under
  everything else in the scene at every width: the scene is its own stacking
  context and the landscape sits at z-index -1 in it.

  Pass `band` to get the front page's variant: below 900px the landscape leaves
  the absolute layer and becomes an in-flow strip that many pixels tall, showing
  the right-hand part of the drawing. A banded scene is a column flex box at
  every width, so the band's box model never changes across the breakpoint.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Landscape from './Landscape.svelte';
	import { LANDSCAPE_HEIGHT, LANDSCAPE_WIDTH } from '$lib/landscape';

	interface Props {
		/** Extra classes on the <section>, for the page's own layout. */
		class?: string;
		/** Height in px of the in-flow landscape band below 900px; null keeps it absolute. */
		band?: number | null;
		children: Snippet;
	}

	let { class: className = '', band = null, children }: Props = $props();
</script>

<section
	class="scene {className}"
	class:banded={band !== null}
	style:--scene-land-aspect="{LANDSCAPE_WIDTH} / {LANDSCAPE_HEIGHT}"
	style:--scene-band-height={band === null ? null : `${band}px`}
>
	{@render children()}
	<div class="scene-land" data-scene-land><Landscape class="scene-land-svg" /></div>
</section>

<style>
	.scene {
		position: relative;
		/* A stacking context of its own, so the landscape's z-index: -1 puts it
		   just above this background and under the rest of the scene. */
		isolation: isolate;
		overflow: hidden;
		background: linear-gradient(var(--sky), var(--sky)) 0 0 / 100% calc(100% - 12px) no-repeat
			var(--page);
	}

	/* The band below 900px is in flow at the foot of the scene, which it is by
	   being last in the markup (`order: 10` keeps it there whatever a page puts
	   after it). The scene is a column flex box at every width so the box model
	   never changes across the breakpoint. */
	.banded {
		display: flex;
		flex-direction: column;
	}

	.scene-land {
		position: absolute;
		/* Last in the markup, but painted first: see the note at the top. */
		z-index: -1;
		left: 0;
		right: 0;
		bottom: -1px;
		line-height: 0;
	}

	.scene-land :global(.scene-land-svg) {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: var(--scene-land-aspect);
	}

	@media (max-width: 899px) {
		/* The band variant: the drawing joins the flow at the foot of the scene and
		   is cropped to its right-hand part, which is where the hearts hang. */
		.banded .scene-land {
			position: relative;
			top: 1px;
			order: 10;
			height: var(--scene-band-height);
			overflow: hidden;
		}

		.banded .scene-land :global(.scene-land-svg) {
			position: absolute;
			right: 0;
			bottom: 0;
			width: max(100%, 720px);
		}
	}
</style>
