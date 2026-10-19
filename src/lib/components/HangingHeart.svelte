<!--
  A heart hanging in a paper ribbon — the redesign's basic display unit
  (hero, gallery cards, detail stage, related hearts). docs/redesign/DESIGN.md §3.

  The ribbon is cut from the same paper as the heart: it takes the right-hand
  lobe colour, so it follows the heart's own colours or, failing those, the
  site-wide pair the header's swatches edit. A hardcoded red left every
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

  `badge` is rendered inside .heart, after the heart, so a parent can place
  something on the heart box itself (the gallery card's tick, SELECTION.md):
  it then sits at the same spot of the heart whatever the ribbon's length, and
  sways with it.

  A heart that is already drawn in the prerendered HTML is given as `markup`
  instead of being drawn from `design` — see $lib/front/galleryHearts.

  A heart that follows the site's pair also carries its pair for the colourful
  mode ($lib/utils/palette, picked by `heartId`): `data-pair` and two custom
  properties on .hang, always, so the mode is a class on <html> and a reload
  with it on paints the right colours first (src/app.css, "Colourful mode").

  A heart drawn from `design` needs PaperHeartSVG and the weave renderer under
  it. It is not imported here, because the front page hangs every heart as
  `markup` and would otherwise download that code for nothing. The parent supplies it instead: `paper`, the component itself, from a
  page that draws `design` into its prerendered HTML and has it anyway (the
  heart page); or `loadPaper`, from a page that only draws in the browser (the
  front page after a client-side navigation, and the visitor's own hearts in
  its gallery), whose heart then shows its ribbon a moment before its paper the
  first time. The dynamic import lives with the front page's components, not
  here: SvelteKit drops a component's stylesheet from a page that imports it
  statically when a chunk listed before it also imports it dynamically. The
  ribbon follows the header's swatches through --paper-right either way; the
  frozen SVG follows them through the --paper-* tokens below.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	// Type only: the component itself is either handed in (`paper`) or loaded on
	// demand, see the note above.
	import type PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
	import { swayAnimationDelay } from '$lib/utils/sway';
	import type { HeartColors } from '$lib/stores/colors';
	import type { HeartDesign } from '$lib/types/heart';
	import { pairAttributes } from '$lib/utils/palette';

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
		/**
		 * The heart's id, which picks its pair in the colourful mode
		 * ($lib/utils/palette). Defaults to the design's; a heart given as
		 * `markup` has to name it.
		 */
		heartId?: string;
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
		/** Rendered inside the heart box, after the heart — see the note above. */
		badge?: Snippet;
		/**
		 * PaperHeartSVG, for a heart drawn from `design` on a page that has the
		 * component anyway and draws the heart into its prerendered HTML (the
		 * heart's own page) — see the note above.
		 */
		paper?: typeof PaperHeartSVG;
		/**
		 * Loads PaperHeartSVG in the browser, for a heart drawn from `design` on a
		 * page that does not otherwise need it (the front page): see the note
		 * above and $lib/components/loadPaperHeart.
		 */
		loadPaper?: () => Promise<{ default: typeof PaperHeartSVG }>;
	}

	let {
		design,
		markup = undefined,
		colors = undefined,
		heartId = undefined,
		size = 168,
		ribbon = 40,
		delay = 0,
		idPrefix,
		class: className = undefined,
		badge = undefined,
		paper = undefined,
		loadPaper = undefined
	}: Props = $props();

	// Only a heart that has to be drawn here fetches the drawing code. The front
	// page's hearts arrive as `markup`, so its first load never asks for it.
	let loadedPaper = $state<typeof PaperHeartSVG | undefined>(undefined);
	let Paper = $derived(paper ?? loadedPaper);

	$effect(() => {
		if (markup !== undefined || !design || Paper || !loadPaper) return;
		let live = true;
		loadPaper().then((module) => {
			if (live) loadedPaper = module.default;
		});
		return () => {
			live = false;
		};
	});

	let ownColors = $derived(colors ?? design?.colors);
	// A heart that follows the site's pair hangs from the site's right-hand
	// paper through its token rather than the store's value: the token is in
	// the CSS from the first frame, and the colourful mode swaps it for the
	// heart's own pair (src/app.css). The hero's bootstrap copies this value
	// from a card to the slot it hangs the card's heart in.
	let ribbonColor = $derived(ownColors?.right ?? 'var(--paper-right)');

	// The colourful mode's pair, for a heart that follows the site's pair: a
	// heart with its own colours keeps them in that mode too.
	let pair = $derived.by(() => {
		const id = heartId ?? design?.id;
		return ownColors === undefined && id ? pairAttributes(id) : undefined;
	});

	// A heart handed over as markup cannot repaint itself, so one that follows the
	// site-wide pair does it in CSS instead (see the style block). A heart with
	// its own colours is fixed anyway and is left alone.
	let sitePaper = $derived(markup !== undefined && ownColors === undefined);

	// The ribbon disappears into the cleft between the lobes; the overlap is a
	// share of the width so it survives the max-width: 100% shrink.
	let dip = $derived(Math.round(size * 0.24));
	let ribbonWidth = $derived(Math.max(8, Math.round(size * 0.055)));
</script>

<div
	class="hang {className ?? ''}"
	data-pair={pair?.['data-pair']}
	data-pair-edge={pair?.['data-pair-edge']}
	style="width: {size}px; animation-delay: {swayAnimationDelay(delay)};{pair ? ` ${pair.style}` : ''}"
>
	<div
		class="ribbon"
		style="width: {ribbonWidth}px; height: {ribbon + dip}px; background: {ribbonColor};"
	></div>
	<div class="heart" class:site-paper={sitePaper}>
		{#if markup !== undefined}
			<!-- svelte-ignore hydration_html_changed -->
			{@html markup}
		{:else if design && Paper}
			<Paper
				readonly
				{idPrefix}
				initialFingers={design.fingers}
				initialGridSize={design.gridSize}
				initialWeaveParity={design.weaveParity ?? 0}
				colors={design.colors}
				size={400}
			/>
		{/if}
		{@render badge?.()}
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
	   pair, and no longer re-renders when the header's swatches change. A CSS
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
