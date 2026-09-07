<!--
  One gallery card — docs/redesign/DESIGN.md §3 "Card".

  The heart hangs in a ribbon whose length varies with the card's index, so a row
  of cards hangs at staggered heights while the names stay aligned at the bottom
  of the fixed-height card.

  Interaction, in the redesign's shape:
    - the WHOLE card is one button that toggles PDF selection (absolute inset 0,
      transparent, under the details link);
    - selection shows as a red ring around the heart plus a check badge, and the
      name turns red;
    - "Detaljer" is a real link to the heart's page, revealed on hover / focus
      within the card, and always visible on touch devices;
    - a user-created heart also gets a delete button.
  Nothing is nested inside anything else interactive, so the card stays keyboard
  and screen-reader friendly.

  The card fades in and slides up the first time it scrolls into view. That is
  set up in the browser only, and only for cards that are still below the fold,
  so a card that is already visible (or a visitor who asked for reduced motion,
  or has no JS) simply gets the finished state.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { HeartDesign } from '$lib/types/heart';
	import { t, type Language } from '$lib/i18n';
	import { heartHref } from '$lib/i18n/routes';
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import DifficultyDots from '$lib/components/DifficultyDots.svelte';
	import { TrashIcon } from '$lib/components/icons';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
	import { calculateDifficulty } from '$lib/utils/difficulty';

	interface Props {
		design: HeartDesign & { isUserCreated?: boolean };
		selected?: boolean;
		lang: Language;
		onSelect?: (design: HeartDesign) => void;
		onClick?: (design: HeartDesign) => void;
		onDelete?: (design: HeartDesign) => void;
		/** Position in its category grid — drives the ribbon length and the sway. */
		index?: number;
	}

	let {
		design,
		selected = false,
		lang,
		onSelect,
		onClick,
		onDelete,
		index = 0
	}: Props = $props();

	/** Heart width in px; the card is this plus 136px of name and difficulty. */
	const SIZE = 168;
	/** Ribbon lengths cycled through the grid, so neighbours hang at different heights. */
	const RIBBONS = [26, 54, 38, 66, 44];

	let ribbon = $derived(RIBBONS[index % RIBBONS.length]);
	let swayDelay = $derived((index * 0.7) % 5);
	let difficulty = $derived(calculateDifficulty(design));
	let detailsHref = $derived(heartHref(design.id, lang));

	// Scroll-in animation. It only ever leaves 'idle' in the browser, so the
	// prerendered card is fully visible with or without JavaScript.
	//   idle      the finished state (also: reduced motion, already on screen)
	//   pending   hidden, waiting to scroll into view
	//   revealed  running the fade-and-rise, then back to idle
	type RevealPhase = 'idle' | 'pending' | 'revealed';

	let cardEl = $state.raw<HTMLElement | null>(null);
	let phase = $state<RevealPhase>('idle');
	let stagger = $state(0);

	onMount(() => {
		if (!browser || !cardEl) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const el = cardEl;
		// Already on screen (or above it): show it as it is, no animation and no flash.
		if (el.getBoundingClientRect().top < window.innerHeight - 40) return;

		// Stagger by column, derived from how many equal-width cards fit the grid.
		const grid = el.parentElement;
		const columns =
			grid && el.offsetWidth > 0 ? Math.max(1, Math.floor(grid.clientWidth / el.offsetWidth)) : 1;
		stagger = index % columns;
		phase = 'pending';

		// The root is grown upwards without limit, so "intersecting" means "no
		// longer below the fold" — a card the page jumps straight past (an anchor
		// like /#stjerner, or the deep link back from a heart's page) then reveals
		// instead of staying invisible above the viewport.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					phase = 'revealed';
					observer.disconnect();
				}
			},
			{ rootMargin: '100000px 0px -40px 0px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	// Drop the animation once it has played: an animation with fill-mode would
	// otherwise keep overriding the card's hover transform.
	function handleAnimationEnd(event: AnimationEvent) {
		if (event.target === cardEl && phase === 'revealed') phase = 'idle';
	}

	function handleDetails() {
		onClick?.(design);
	}

	function handleSelect() {
		onSelect?.(design);
	}

	function handleDelete() {
		onDelete?.(design);
	}
</script>

<article
	bind:this={cardEl}
	class="card"
	class:is-selected={selected}
	class:pending={phase === 'pending'}
	class:revealed={phase === 'revealed'}
	id={makeHeartAnchorId(design.id)}
	style="height: {SIZE + 136}px; --stagger: {stagger * 55}ms;"
	onanimationend={handleAnimationEnd}
>
	<button
		class="card-select"
		type="button"
		onclick={handleSelect}
		aria-pressed={selected}
		aria-label="{t('selectForPdf', lang)}: {design.name}"
	></button>

	<div class="card-heart">
		<HangingHeart {design} size={SIZE} {ribbon} delay={swayDelay} idPrefix="card-{design.id}" />
	</div>

	<a
		class="details"
		href={detailsHref}
		onclick={handleDetails}
		aria-label="{t('details', lang)}: {design.name}"
		style="top: {ribbon + SIZE - 30}px;"
	>
		{t('details', lang)}
	</a>

	<div class="card-meta">
		<span class="name">{design.name}</span>
		<DifficultyDots level={difficulty.level} {lang} />
	</div>

	{#if design.isUserCreated && onDelete}
		<button
			class="delete-btn"
			type="button"
			onclick={handleDelete}
			aria-label={t('delete', lang)}
			title={t('delete', lang)}
		>
			<TrashIcon size={16} />
		</button>
	{/if}
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 14px;
		transition: transform 0.2s;
	}

	.card:hover {
		transform: scale(1.02);
	}

	/* Waiting to scroll into view — only ever set from the browser. */
	.card.pending {
		opacity: 0;
	}

	.card.revealed {
		animation: card-in 0.45s ease-out var(--stagger, 0ms) both;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* The whole card toggles PDF selection. */
	.card-select {
		position: absolute;
		inset: 0;
		z-index: 1;
		padding: 0;
		border: none;
		border-radius: 14px;
		background: transparent;
		cursor: pointer;
	}

	.card-select:focus-visible {
		outline: 3px solid var(--blue);
		outline-offset: 2px;
	}

	.card-heart {
		display: flex;
		justify-content: center;
		width: 100%;
		padding: 0 4px;
		box-sizing: border-box;
	}

	/* The selection ring and check badge hang on HangingHeart's own .heart box. */
	.card.is-selected :global(.heart)::before {
		content: '';
		position: absolute;
		inset: -9px;
		border: 3px solid var(--red);
		border-radius: 20px;
		pointer-events: none;
	}

	.card.is-selected :global(.heart)::after {
		content: '✓';
		position: absolute;
		top: -10px;
		right: -10px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--red);
		color: var(--white);
		font-size: 15px;
		font-weight: 700;
		line-height: 28px;
		text-align: center;
		box-shadow: 0 2px 6px rgb(31 51 41 / 0.25);
		pointer-events: none;
	}

	.details {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		display: inline-flex;
		align-items: center;
		padding: 7px 13px;
		border-radius: 8px;
		background: rgb(28 51 41 / 0.84);
		color: var(--white);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
		opacity: 0;
		transition:
			opacity 0.2s,
			background 0.2s;
	}

	.details:hover {
		background: rgb(28 51 41 / 0.96);
		color: var(--white);
	}

	.card:hover .details,
	.card:focus-within .details {
		opacity: 1;
	}

	@media (hover: none) {
		.details {
			opacity: 1;
		}
	}

	.card-meta {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}

	.name {
		font-size: 16px;
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.card.is-selected .name {
		color: var(--red);
	}

	.delete-btn {
		position: absolute;
		top: 0;
		left: 4px;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--green);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.2s,
			color 0.2s,
			border-color 0.2s;
	}

	.card:hover .delete-btn,
	.card:focus-within .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		color: var(--red);
		border-color: var(--red);
	}

	@media (hover: none) {
		.delete-btn {
			opacity: 1;
		}
	}

	@media (max-width: 599px) {
		.details {
			font-size: 12px;
			padding: 5px 10px;
		}

		/* Two columns on phones: leave the heart room to breathe in its cell. */
		.card-heart :global(.hang) {
			max-width: 88%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}

		.card.revealed {
			animation: none;
		}
	}
</style>
