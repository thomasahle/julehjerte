<!--
  One layer of the hero's hanging hearts — docs/redesign/DESIGN.md §3 "Hero".

  The layer fills its (position: relative) parent and places one HangingHeart per
  slot. The front page renders two layers on top of each other while it swaps the
  prerendered hearts for a random set: the old layer fades out as the new one
  fades in, and the old one is dropped once the transition is over.

  `idPrefix` must be unique per layer (PaperHeartSVG's clip-path ids are global),
  hence "hero-a" / "hero-b" from the page.
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
		/** Unique per layer — see the note above. */
		idPrefix: string;
		/** Fade this layer out (the cross-fade's outgoing half). */
		faded?: boolean;
	}

	let { slots, ids, designs, idPrefix, faded = false }: Props = $props();
</script>

<div class="layer" class:faded aria-hidden="true">
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
		/* Hero.svelte sets --hero-fade from the same constant its timer uses, so
		   the outgoing layer is never dropped mid-transition. */
		transition: opacity var(--hero-fade, 400ms) ease;
	}

	.layer.faded {
		opacity: 0;
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
