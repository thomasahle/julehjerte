<!--
  The hero's hanging hearts — docs/redesign/DESIGN.md §3 "Hero".

  The layer fills its (position: relative) parent and places one HangingHeart per
  slot. It starts invisible and Hero.svelte raises it once the random set is in
  the DOM, so the prerendered hearts the page ships with are never seen by a
  visitor whose browser runs the swap. Without JavaScript nothing raises it, so
  `html.no-js` (see app.html) shows the prerendered set outright instead.

  `idPrefix` must be unique per instance (PaperHeartSVG's clip-path ids are
  global), hence "hero-d" / "hero-m" from the page — both are in the DOM at once,
  only one of them displayed.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import type { HeartDesign } from '$lib/types/heart';
	import type { HeroSlot } from './heroSlots';

	interface Props {
		slots: readonly HeroSlot[];
		/** Heart ids, one per slot; a missing design leaves the slot empty. */
		ids: readonly string[];
		designs: Record<string, HeartDesign>;
		/** Unique per instance — see the note above. */
		idPrefix: string;
		/** Fade the layer in. Stays false until the hearts to show are rendered. */
		shown?: boolean;
	}

	let { slots, ids, designs, idPrefix, shown = false }: Props = $props();
</script>

<div class="layer" class:shown aria-hidden="true">
	{#each slots as slot, i (i)}
		{@const design = designs[ids[i]]}
		{#if design}
			<div class="slot" style={slot.style}>
				<HangingHeart
					{design}
					size={slot.size}
					ribbon={slot.ribbon}
					delay={slot.delay}
					idPrefix="{idPrefix}-{i}-{design.id}"
				/>
			</div>
		{/if}
	{/each}
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		/* Hidden until the page says otherwise: the hearts in the prerendered
		   markup are placeholders for a set picked after mount, and showing them
		   for even one frame is the flash this hides. */
		opacity: 0;
		/* Hero.svelte sets --hero-fade from the same constant it waits on. */
		transition: opacity var(--hero-fade, 300ms) ease;
	}

	.layer.shown {
		opacity: 1;
	}

	/* No JavaScript, so no swap and nothing to hide — app.html removes this class
	   before the body paints, so a scripted visitor never matches it. */
	:global(html.no-js) .layer {
		opacity: 1;
	}

	.slot {
		position: absolute;
	}

	@media (prefers-reduced-motion: reduce) {
		.layer {
			transition: none;
		}
	}
</style>
