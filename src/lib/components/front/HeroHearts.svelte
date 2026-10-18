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
	import { goto } from '$app/navigation';
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import { loadPaperHeart } from '$lib/components/loadPaperHeart';
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
		/**
		 * Called before going to a card, so the page can show it first if the
		 * difficulty filter hides it (GALLERY-BAR.md, "As built: difficulty
		 * filter"); the DOM is up to date when it returns. It returns the
		 * query string the URL is to have then, if that changes.
		 */
		onReveal?: (anchorId: string) => string | undefined;
	}

	let { lang, slots, hearts, idPrefix, revealed = false, onReveal }: Props = $props();

	function goToCard(event: MouseEvent, anchorId: string) {
		const revealedSearch = onReveal?.(anchorId);
		const card = document.getElementById(anchorId);
		if (!card) return; // let the plain anchor navigation handle it
		event.preventDefault();
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const scroll = () => card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
		// Through the router, not history.replaceState: the page store has to
		// see the new hash, or the language toggle links to the other language
		// without it. (SvelteKit's replaceState is shallow routing and leaves
		// page.url alone too.) The load reads only params, so it does not rerun.
		// The scroll waits for the navigation, which would stop a smooth scroll
		// already under way.
		const { pathname } = window.location;
		const search = revealedSearch ?? window.location.search;
		goto(`${pathname}${search}#${anchorId}`, { replaceState: true, noScroll: true, keepFocus: true }).then(
			scroll,
			scroll
		);
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
						loadPaper={loadPaperHeart}
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

	/* Off the heart a little more than the base ring, but the same idea: --blue
	   is only 2.60:1 on the sky, so a --page ring fills the whole offset gap and
	   the blue's inner edge clears 3:1 against it (SC 1.4.11). */
	.slot-link:focus-visible {
		outline: 3px solid var(--blue);
		outline-offset: 4px;
		box-shadow: 0 0 0 4px var(--page);
	}
</style>
