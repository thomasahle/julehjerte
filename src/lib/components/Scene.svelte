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

  Pass `band` to get the front page's variant: below 900px the landscape leaves
  the absolute layer and becomes an in-flow strip that many pixels tall, showing
  the right-hand part of the drawing. A banded scene is a column flex box at
  every width, because that is what lets the band order itself last.
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
	<div class="scene-land"><Landscape class="scene-land-svg" /></div>
	{@render children()}
</section>

<style>
	.scene {
		position: relative;
		overflow: hidden;
		background: linear-gradient(var(--sky), var(--sky)) 0 0 / 100% calc(100% - 12px) no-repeat
			var(--page);
	}

	/* The band below 900px takes `order: 10` to sit last, which needs a flex
	   container; the scene is one at every width so the box model never changes
	   across the breakpoint. */
	.banded {
		display: flex;
		flex-direction: column;
	}

	.scene-land {
		position: absolute;
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
