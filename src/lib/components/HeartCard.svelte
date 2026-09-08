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

  The card has no entrance animation and nothing to wait for: a gallery heart is
  handed over as the SVG the prerender already put in the HTML (`markup`, see
  $lib/front/galleryHearts), so it is finished before this component exists. A
  heart the visitor drew comes as a `design` and is drawn here.

  `data-heart-id` / `data-heart-name` are the hero's contract with the gallery:
  its inline bootstrap picks cards by them and clones their SVGs
  ($lib/front/heroBootstrap). `data-user` marks the ones it must not draw from.
-->
<script lang="ts">
	import type { HeartDesign } from '$lib/types/heart';
	import type { GalleryHeart } from '$lib/front/galleryHearts';
	import { t, type Language } from '$lib/i18n';
	import { heartHref } from '$lib/i18n/routes';
	import HangingHeart from '$lib/components/HangingHeart.svelte';
	import DifficultyDots from '$lib/components/DifficultyDots.svelte';
	import { TrashIcon } from '$lib/components/icons';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';

	interface Props {
		heart: GalleryHeart;
		/** The heart's SVG, when it is already in the prerendered HTML. */
		markup?: string;
		/** The design to draw it from, when it is not. */
		design?: HeartDesign;
		selected?: boolean;
		lang: Language;
		onSelect?: (heart: GalleryHeart) => void;
		onClick?: (heart: GalleryHeart) => void;
		onDelete?: (heart: GalleryHeart) => void;
		/** Position in its category grid — drives the ribbon length and the sway. */
		index?: number;
	}

	let {
		heart,
		markup = undefined,
		design = undefined,
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
	let detailsHref = $derived(heartHref(heart.id, lang));

	function handleDetails() {
		onClick?.(heart);
	}

	function handleSelect() {
		onSelect?.(heart);
	}

	function handleDelete() {
		onDelete?.(heart);
	}
</script>

<article
	class="card"
	class:is-selected={selected}
	id={makeHeartAnchorId(heart.id)}
	data-heart-id={heart.id}
	data-heart-name={heart.name}
	data-user={heart.isUserCreated ? '' : undefined}
	style="height: {SIZE + 136}px;"
>
	<button
		class="card-select"
		type="button"
		onclick={handleSelect}
		aria-pressed={selected}
		aria-label="{t('selectForPdf', lang)}: {heart.name}"
	></button>

	<div class="card-heart">
		<HangingHeart
			{design}
			{markup}
			colors={heart.colors}
			size={SIZE}
			{ribbon}
			delay={swayDelay}
			idPrefix="card-{heart.id}"
		/>
	</div>

	<a
		class="details"
		href={detailsHref}
		onclick={handleDetails}
		aria-label="{t('details', lang)}: {heart.name}"
		style="top: {ribbon + SIZE - 30}px;"
	>
		{t('details', lang)}
	</a>

	<div class="card-meta">
		<span class="name">{heart.name}</span>
		<DifficultyDots level={heart.difficulty} {lang} />
	</div>

	{#if heart.isUserCreated && onDelete}
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
		box-shadow: var(--shadow-chip);
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
		background: rgb(var(--deep-rgb) / 0.84);
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
		background: rgb(var(--deep-rgb) / 0.96);
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
	}
</style>
