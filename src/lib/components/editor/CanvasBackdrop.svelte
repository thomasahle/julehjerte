<!--
  The picture behind the editor's canvas: the hero's sky with the winter
  landscape along the bottom (docs/redesign/DESIGN.md §2 and §7).

  It is a *backdrop*, not part of the drawing. It sits under the drawing surface,
  the tool rail and the panel, it takes no pointer events, and it does not pan or
  zoom with the heart — the heart moves over a still picture. Nothing here can
  reach an export either: the SVG, the template and the PDF are all built from
  the design in memory, never from what is on screen.

  <Scene> supplies the whole recipe (sky ground with the snow-coloured bottom
  strip, overflow hidden, the drawing pinned at `bottom: -1px` at its own aspect
  ratio), so this is one more place that inlines <Landscape> exactly once for its
  page — which is why the editor page must not grow a second one.

  The one thing added on top is the wash. At full strength the drawing competes
  with the heart being edited; a flat sheet of --sky at 40% over the scene leaves
  the landscape at an effective 60% and the sky untouched (sky over sky is sky).
  Fading the drawing with `opacity` instead would have left its snow lighter than
  the strip under it and put a seam across the bottom edge; washing everything,
  strip included, keeps that join invisible.
-->
<script lang="ts">
	import Scene from '$lib/components/Scene.svelte';
</script>

<div class="canvas-backdrop" aria-hidden="true">
	<Scene class="canvas-backdrop-scene">
		<div class="canvas-backdrop-wash"></div>
	</Scene>
</div>

<style>
	.canvas-backdrop {
		position: absolute;
		inset: 0;
		/* Same layer as the editor itself, earlier in the document, so it paints
		   under every part of it without needing a z-index of its own above 0. */
		z-index: 0;
		pointer-events: none;
	}

	.canvas-backdrop :global(.canvas-backdrop-scene) {
		height: 100%;
	}

	.canvas-backdrop-wash {
		position: absolute;
		inset: 0;
		background: var(--sky);
		opacity: 0.4;
	}

	/* Below 900px the canvas is a short box with the tool rail floating across its
	   top and the three panels across its foot, and the landscape came out as a
	   torn strip of firs behind them rather than as a horizon. So the wash goes
	   opaque and the canvas keeps the sky alone. The drawing stays in the page
	   (hidden under a solid sheet, not unrendered) so its ids are there at every
	   width and crossing the breakpoint needs no remount. */
	@media (max-width: 899px) {
		.canvas-backdrop-wash {
			opacity: 1;
		}
	}
</style>
