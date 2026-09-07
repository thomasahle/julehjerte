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

  Each heart is a link to its own card in the gallery (`#heart-<id>`), so a
  visitor who likes what hangs in the hero lands where it can be ticked for
  printing instead of hunting through the gallery. The scroll is done by hand so
  it can be smooth (or instant under prefers-reduced-motion) and centre the card.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import type { HeartDesign } from '$lib/types/heart';
	import { t, type Language } from '$lib/i18n';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
	import type { HeroSlot } from './heroSlots';

	interface Props {
		lang: Language;
		slots: readonly HeroSlot[];
		/** Heart ids, one per slot; a missing design leaves the slot empty. */
		ids: readonly string[];
		designs: Record<string, HeartDesign>;
		/** Unique per instance — see the note above. */
		idPrefix: string;
		/** Fade the layer in. Stays false until the hearts to show are rendered. */
		shown?: boolean;
	}

	let { lang, slots, ids, designs, idPrefix, shown = false }: Props = $props();

	function goToCard(event: MouseEvent, anchorId: string) {
		const card = document.getElementById(anchorId);
		if (!card) return; // let the plain anchor navigation handle it
		event.preventDefault();
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
		history.replaceState(history.state, '', `#${anchorId}`);
	}
</script>

<div class="layer" class:shown>
	{#each slots as slot, i (i)}
		{@const design = designs[ids[i]]}
		{@const anchorId = design ? makeHeartAnchorId(design.id) : ''}
		{#if design}
			<div class="slot" style={slot.style}>
				<a
					class="slot-link"
					href="#{anchorId}"
					aria-label={t('heroGoToHeart', lang, { name: design.name })}
					onclick={(event) => goToCard(event, anchorId)}
				>
					<HangingHeart
						{design}
						size={slot.size}
						ribbon={slot.ribbon}
						delay={slot.delay}
						idPrefix="{idPrefix}-{i}-{design.id}"
					/>
				</a>
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
		/* Also out of the tab order while hidden: the hearts are links now. */
		visibility: hidden;
		/* Hero.svelte sets --hero-fade from the same constant it waits on. */
		transition: opacity var(--hero-fade, 300ms) ease;
	}

	.layer.shown {
		opacity: 1;
		visibility: visible;
	}

	/* No JavaScript, so no swap and nothing to hide — app.html removes this class
	   before the body paints, so a scripted visitor never matches it. */
	:global(html.no-js) .layer {
		opacity: 1;
		visibility: visible;
	}

	.slot {
		position: absolute;
	}

	.slot-link {
		display: block;
		border-radius: 12px;
	}

	.slot-link:focus-visible {
		outline: 3px solid var(--blue);
		outline-offset: 6px;
	}

	@media (prefers-reduced-motion: reduce) {
		.layer {
			transition: none;
		}
	}
</style>
