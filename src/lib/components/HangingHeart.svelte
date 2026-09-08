<!--
  A heart hanging in a paper ribbon — the redesign's basic display unit
  (hero, gallery cards, detail stage, related hearts). docs/redesign/DESIGN.md §3.

  The ribbon is cut from the same paper as the heart: it takes the right-hand
  lobe colour, so it follows the heart's own colours or, failing those, the
  site-wide pair the footer's swatches edit. A hardcoded red left every
  blue-and-white heart hanging from a colour used nowhere else on the page.

  The block is `size` px wide but shrinks with its container (max-width: 100%);
  the ribbon runs on behind the heart into the cleft between the lobes, so its
  drawn length is `ribbon` plus a 24% overlap that scales with the width.

  `idPrefix` is required and must be unique for every instance on the page:
  PaperHeartSVG names its clip path `overlap-<idPrefix>`, and duplicate ids make
  the browser resolve `url(#…)` to the first match, which renders later hearts
  clipped or blank. Use e.g. "hero-0-jul", "card-jul", "rel-jul", "stage-jul".

  Class hooks for parents (from a parent, target them through :global(), since
  Svelte's scoping hash is not applied inside this component):
    .hang    the whole block — sways, sets the width
    .heart   the square heart box, position: relative, so a parent can hang a
             selection ring or badge on ::before / ::after.

  A heart that is already drawn in the prerendered HTML is given as `markup`
  instead of being drawn from `design` — see $lib/front/galleryHearts. The
  ribbon is a real element either way, so the footer's colour swatches keep
  reaching it; the frozen SVG follows them through the --paper-* tokens below.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
	import { swayAnimationDelay } from '$lib/utils/sway';
	import {
		DEFAULT_COLORS,
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import type { HeartDesign } from '$lib/types/heart';

	interface Props {
		/** The design to draw the heart from. Not needed when `markup` is given. */
		design?: HeartDesign;
		/**
		 * The heart's finished SVG, when it is already in the prerendered HTML —
		 * see $lib/front/galleryHearts. Given, the heart is never drawn here.
		 */
		markup?: string;
		/**
		 * The heart's own paper colours, when it has any and there is no `design`
		 * to read them off. They fix the ribbon's colour and the heart's.
		 */
		colors?: HeartColors;
		/** Width of the block in px. The heart box is size x size. */
		size?: number;
		/** Visible ribbon length in px, above the heart. */
		ribbon?: number;
		/**
		 * How far into the sway cycle this heart starts, in seconds — used to keep
		 * neighbours out of step. Spent as a *negative* `animation-delay`; see
		 * $lib/utils/sway for why a positive one makes the heart jump.
		 */
		delay?: number;
		/** Unique id prefix for this instance — see the note above. */
		idPrefix: string;
		/** Extra class on the root .hang element. */
		class?: string;
	}

	let {
		design,
		markup = undefined,
		colors = undefined,
		size = 168,
		ribbon = 40,
		delay = 0,
		idPrefix,
		class: className = undefined
	}: Props = $props();

	// The site-wide pair, read after mount so the prerendered markup and the
	// hydrated one agree — the same dance PaperHeartSVG does for the lobes.
	let storeColors = $state<HeartColors>({ ...DEFAULT_COLORS });

	onMount(() => {
		storeColors = getColors();
		return subscribeColors((c) => {
			storeColors = c;
		});
	});

	let ownColors = $derived(colors ?? design?.colors);
	let ribbonColor = $derived(ownColors?.right ?? storeColors.right);

	// A heart handed over as markup cannot repaint itself, so one that follows the
	// site-wide pair does it in CSS instead (see the style block). A heart with
	// its own colours is fixed anyway and is left alone.
	let sitePaper = $derived(markup !== undefined && ownColors === undefined);

	// The ribbon disappears into the cleft between the lobes; the overlap is a
	// share of the width so it survives the max-width: 100% shrink.
	let dip = $derived(Math.round(size * 0.24));
	let ribbonWidth = $derived(Math.max(8, Math.round(size * 0.055)));
</script>

<div class="hang {className ?? ''}" style="width: {size}px; animation-delay: {swayAnimationDelay(delay)};">
	<div
		class="ribbon"
		style="width: {ribbonWidth}px; height: {ribbon + dip}px; background: {ribbonColor};"
	></div>
	<div class="heart" class:site-paper={sitePaper}>
		{#if markup !== undefined}
			<!-- svelte-ignore hydration_html_changed -->
			{@html markup}
		{:else if design}
			<PaperHeartSVG
				readonly
				{idPrefix}
				initialFingers={design.fingers}
				initialGridSize={design.gridSize}
				initialWeaveParity={design.weaveParity ?? 0}
				colors={design.colors}
				size={400}
			/>
		{/if}
	</div>
</div>

<style>
	.hang {
		display: flex;
		flex-direction: column;
		align-items: center;
		max-width: 100%;
		transform-origin: 50% 0;
		/* 7s must match SWAY_DURATION_S in $lib/utils/sway, which turns the `delay`
		   prop into the negative animation-delay on this element. */
		animation: sway 7s ease-in-out infinite alternate;
	}

	/* The same shadow the heart's SVG carries below, so the strip of paper is lit
	   the same way. The ribbon is painted first, so where it runs on behind the
	   heart its shadow is covered by the heart itself and only the length above
	   the cleft casts one — which is the length that is actually in front. */
	.ribbon {
		flex: none;
		filter: drop-shadow(0 8px 12px var(--shadow-color));
	}

	.heart {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		/* The ribbon runs on behind the heart into the cleft. */
		margin-top: -24%;
	}

	/* A prerendered heart is frozen paper: it was drawn once, with the default
	   pair, and no longer re-renders when the footer's swatches change. A CSS
	   `fill` beats the `fill` presentation attribute in the markup, so the two
	   default colours are the hooks the site-wide pair reaches it through
	   (--paper-left / --paper-right, kept up to date in the root layout). Only
	   hearts that follow the site's pair carry .site-paper, so a heart with its
	   own colours is never repainted. */
	.heart.site-paper :global(svg [fill='#ffffff']) {
		fill: var(--paper-left);
	}

	.heart.site-paper :global(svg [fill='rgb(185, 19, 19)']) {
		fill: var(--paper-right);
	}

	/* Overrides PaperHeartSVG's own `max-width: 100%; height: auto` so the heart
	   fills the square box exactly. */
	.heart :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		filter: drop-shadow(0 8px 12px var(--shadow-color));
	}

	@keyframes sway {
		from {
			transform: rotate(-1.4deg);
		}
		to {
			transform: rotate(1.4deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hang {
			animation: none;
		}
	}
</style>
