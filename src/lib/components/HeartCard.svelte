<!--
  One gallery card — docs/redesign/DESIGN.md §3 "Card".

  The heart hangs in a ribbon whose length varies with the card's index, so a row
  of cards hangs at staggered heights while the names stay aligned at the bottom
  of the fixed-height card.

  Interaction (docs/redesign/FRONT-SIMPLIFY.md): opening a heart is what most
  visitors came for, a PDF of several is for the few, so
    - the WHOLE card is one link to the heart's page (absolute inset 0,
      transparent, named after the heart);
    - a small checkbox in the top-left corner, above the link, ticks the heart
      for the multi-heart PDF. It stays out of sight until the card is hovered
      or focused, or is ticked — and is always shown on touch screens, which
      have no hover to reveal it;
    - selection shows as a red ring around the heart plus a check badge, and the
      name turns red;
    - a user-created heart also gets a delete button, top right.
  The controls are siblings over the link rather than inside it — nothing
  interactive is nested in anything else interactive, so the card stays keyboard
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

	/** Heart width in px; the card is this plus 120px for the ribbon slack, name and difficulty. */
	const SIZE = 200;
	/** Ribbon lengths cycled through the grid, so neighbours hang at different heights. */
	const RIBBONS = [26, 54, 38, 66, 44];

	let ribbon = $derived(RIBBONS[index % RIBBONS.length]);
	let swayDelay = $derived((index * 0.7) % 5);
	let href = $derived(heartHref(heart.id, lang));
	let pickId = $derived(`pick-${heart.id}`);

	function handleOpen() {
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
	style="height: {SIZE + 120}px;"
>
	<a class="card-link" {href} onclick={handleOpen} aria-label={heart.name}></a>

	<!-- The ✓ is a text glyph, not an icon: the hero clones the first <svg> in
	     the card, which has to stay the heart's own. -->
	<span class="pick">
		<input
			id={pickId}
			class="pick-box"
			type="checkbox"
			checked={selected}
			onchange={handleSelect}
		/>
		<span class="pick-mark" aria-hidden="true">✓</span>
		<label class="sr-only" for={pickId}>{t('selectForPdf', lang)}: {heart.name}</label>
	</span>

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

	/* The whole card opens the heart's page. */
	.card-link {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: 14px;
		background: transparent;
	}

	/* The PDF checkbox: a real input, restyled, with the tick laid over it. */
	.pick {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 2;
		display: inline-flex;
		width: 24px;
		height: 24px;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.card:hover .pick,
	.card:focus-within .pick,
	.card.is-selected .pick {
		opacity: 1;
	}

	.pick-box {
		appearance: none;
		width: 100%;
		height: 100%;
		margin: 0;
		border: 1.5px solid var(--line);
		border-radius: 50%;
		background: var(--white);
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.pick-box:hover {
		border-color: var(--red);
	}

	.pick-box:checked {
		border-color: var(--red);
		background: var(--red);
	}

	.pick-mark {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--white);
		font-size: 13px;
		font-weight: 700;
		pointer-events: none;
		opacity: 0;
	}

	.pick-box:checked + .pick-mark {
		opacity: 1;
	}

	/* No hover to reveal it on a touch screen, so it is always there — a little
	   smaller and slightly see-through, to stay quiet over the ribbon. */
	@media (hover: none) {
		.pick {
			opacity: 1;
			width: 22px;
			height: 22px;
		}

		.pick-box:not(:checked) {
			background: rgb(255 255 255 / 0.9);
		}
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
		right: 4px;
		z-index: 2;
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
