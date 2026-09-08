<!--
  One titled row of heart cards in the gallery — a category, or the visitor's own
  "Mine hjerter" (docs/redesign/DESIGN.md §3 "Gallery").

  The section carries the category id, because the detail page links back to
  `#<category>` and `#heart-<id>` anchors inside it; `scroll-margin-top` keeps an
  anchored row clear of the sticky toolbar.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import HeartCard from '$lib/components/HeartCard.svelte';
	import type { HeartDesign } from '$lib/types/heart';
	import type { GalleryHeart } from '$lib/front/galleryHearts';
	import type { Language } from '$lib/i18n';

	interface Props {
		/** Category id; also the anchor the front page scrolls to. */
		id: string;
		title: string;
		/** e.g. "12 hjerter". Omitted for "Mine hjerter", which is the heading alone. */
		count?: string;
		hearts: GalleryHeart[];
		/**
		 * The hearts' finished SVGs, by id, when they are already in the
		 * prerendered HTML — see $lib/front/galleryHearts.
		 */
		markup?: Record<string, string> | null;
		/** The designs to draw them from, by id, when they are not. */
		designs?: Record<string, HeartDesign> | null;
		lang: Language;
		selectedIds: Set<string>;
		onSelect: (heart: GalleryHeart) => void;
		onClick: (heart: GalleryHeart) => void;
		/** Only the visitor's own hearts can be deleted. */
		onDelete?: (heart: GalleryHeart) => void;
		/** The first row under the toolbar sits closer to it. */
		first?: boolean;
		/** "Mine hjerter": set apart from the gallery categories above it. */
		apart?: boolean;
		/** Shown instead of the grid when `hearts` is empty. */
		empty?: Snippet;
	}

	let {
		id,
		title,
		count,
		hearts,
		markup = null,
		designs = null,
		lang,
		selectedIds,
		onSelect,
		onClick,
		onDelete,
		first = false,
		apart = false,
		empty
	}: Props = $props();
</script>

<section class="cat" class:first class:apart {id}>
	<div class="cat-head">
		<h3>{title}</h3>
		{#if count}<span>{count}</span>{/if}
	</div>
	{#if hearts.length === 0 && empty}
		{@render empty()}
	{:else}
		<div class="cat-grid">
			{#each hearts as heart, index (heart.id)}
				<HeartCard
					{heart}
					markup={markup?.[heart.id]}
					design={designs?.[heart.id]}
					{lang}
					{index}
					selected={selectedIds.has(heart.id)}
					{onSelect}
					{onClick}
					{onDelete}
				/>
			{/each}
		</div>
	{/if}
</section>

<style>
	.cat {
		display: flex;
		flex-direction: column;
		padding-top: 44px;
		/* The toolbar is sticky, so a category anchor must not land underneath it. */
		scroll-margin-top: calc(var(--nav-height) + 16px);
	}

	.cat.first {
		padding-top: 8px;
	}

	.cat.apart {
		padding-top: 48px;
		gap: 12px;
	}

	.cat-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 4px;
		margin-bottom: 10px;
	}

	.cat-head h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}

	.cat-head span {
		font-size: 13px;
		color: var(--muted);
	}

	.cat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
		column-gap: 24px;
		row-gap: 40px;
	}

	@media (max-width: 899px) {
		.cat {
			scroll-margin-top: calc(var(--nav-height-sm) + 12px);
		}
	}

	@media (max-width: 599px) {
		.cat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 14px;
			row-gap: 32px;
		}
	}
</style>
