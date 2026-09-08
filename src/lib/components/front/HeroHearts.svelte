<!--
  The hero's hanging hearts — docs/redesign/DESIGN.md §3 "Hero".

  The layer fills its (position: relative) parent and places one HangingHeart per
  slot. Which hearts hang there is decided while the page is still parsing, by
  the inline script in $lib/front/heroBootstrap: it draws at random from the
  gallery below and clones the finished SVGs out of the cards. The page is
  prerendered with a fixed set instead — that is what a visitor without
  JavaScript is left with, and what the script's clones replace.

  So the layer starts invisible and only the script's `html.hero-ready` shows
  it, and no frame ever shows the fixed set. Without JavaScript nothing sets
  that class, so `html.no-js` (see app.html) shows the prerendered set outright.
  `revealed` is the third case: a client-side navigation to the front page,
  where there is no prerendered gallery to copy from, the hearts are drawn here
  and there is nothing to wait for.

  Each heart is a link to its own card in the gallery (`#heart-<id>`), so a
  visitor who likes what hangs in the hero lands where it can be ticked for
  printing instead of hunting through the gallery. The scroll is done by hand so
  it can be smooth (or instant under prefers-reduced-motion) and centre the card.
  The bootstrap rewrites the href and the label along with the heart.

  `idPrefix` must be unique per instance (PaperHeartSVG's clip-path ids are
  global), hence "hero-d" / "hero-m" from the page — both are in the DOM at once,
  only one of them displayed. It doubles as `data-hero-layer`, which is how the
  bootstrap finds the layers and names the ids of the hearts it clones in.
-->
<script lang="ts">
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import type { HeroHeart } from '$lib/front/galleryHearts';
	import { t, type Language } from '$lib/i18n';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
	import type { HeroSlot } from './heroSlots';

	interface Props {
		lang: Language;
		slots: readonly HeroSlot[];
		/** One heart per slot; a missing one leaves the slot empty. */
		hearts: readonly (HeroHeart | undefined)[];
		/** Unique per instance — see the note above. */
		idPrefix: string;
		/** Show the layer without waiting for the bootstrap script. */
		revealed?: boolean;
	}

	let { lang, slots, hearts, idPrefix, revealed = false }: Props = $props();

	function goToCard(event: MouseEvent, anchorId: string) {
		const card = document.getElementById(anchorId);
		if (!card) return; // let the plain anchor navigation handle it
		event.preventDefault();
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
		history.replaceState(history.state, '', `#${anchorId}`);
	}
</script>

<div class="layer" class:revealed data-hero-layer={idPrefix}>
	{#each slots as slot, i (i)}
		{@const heart = hearts[i]}
		{@const anchorId = heart ? makeHeartAnchorId(heart.id) : ''}
		{#if heart}
			<div class="slot" style={slot.style}>
				<a
					class="slot-link"
					href="#{anchorId}"
					aria-label={t('heroGoToHeart', lang, { name: heart.name })}
					onclick={(event) => goToCard(event, anchorId)}
				>
					<HangingHeart
						design={heart.design}
						markup={heart.markup}
						size={slot.size}
						ribbon={slot.ribbon}
						delay={slot.delay}
						idPrefix="{idPrefix}-{i}-{heart.id}"
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
		/* Hidden until the bootstrap script has hung the chosen hearts: the set in
		   the prerendered markup is a stand-in, and showing it for even one frame
		   is the flash this hides. No transition — the hearts are meant to be
		   there from the first frame that has anything in it, not to arrive. */
		opacity: 0;
		/* Also out of the tab order while hidden: the hearts are links now. */
		visibility: hidden;
	}

	/* The bootstrap script's own flag, set the moment the slots are filled. */
	:global(html.hero-ready) .layer,
	/* No JavaScript, so no bootstrap and nothing to hide — app.html removes this
	   class before the body paints, so a scripted visitor never matches it. */
	:global(html.no-js) .layer,
	.layer.revealed {
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
</style>
