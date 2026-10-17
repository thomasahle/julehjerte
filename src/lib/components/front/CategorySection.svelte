<!--
  One titled row of heart cards in the gallery — a category, or the visitor's own
  "Mine hjerter" (docs/redesign/DESIGN.md §3 "Gallery").

  The section carries the category id, because the detail page links back to
  `#<category>` and `#heart-<id>` anchors inside it, and the gallery bar's chips
  link to `#<category>` too; `scroll-margin-top` keeps an anchored row clear of
  the sticky bar.

  A gallery category shows no heading (docs/redesign/GALLERY-CURVE.md): its
  name stays in the page as a screen-reader-only <h3>, and the chips in the
  bar name the rows. "Mine hjerter" (`apart`) keeps its visible heading.
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
		/**
		 * The first category: on the desktop layout its first row starts just
		 * under the hero's hill line, right behind the gallery bar.
		 */
		first?: boolean;
		/**
		 * The gallery's column count, measured on the desktop layout, where
		 * each column is a strand hanging from the hill line (GALLERY-CURVE.md
		 * amendment 3); 0: no strands.
		 */
		columns?: number;
		/** "Mine hjerter": set apart from the gallery categories above it. */
		apart?: boolean;
		/** Shown instead of the grid when `hearts` is empty. */
		empty?: Snippet;
	}

	let {
		id,
		title,
		hearts,
		markup = null,
		designs = null,
		lang,
		selectedIds,
		onSelect,
		onClick,
		onDelete,
		first = false,
		columns = 0,
		apart = false,
		empty
	}: Props = $props();
</script>

<section class="cat" class:first class:apart {id}>
	{#if apart}
		<div class="cat-head">
			<h3>{title}</h3>
		</div>
	{:else}
		<h3 class="sr-only">{title}</h3>
	{/if}
	{#if hearts.length === 0 && empty}
		{@render empty()}
	{:else}
		<div class="cat-grid" data-hill-row={first ? '' : undefined}>
			{#each hearts as heart, index (heart.id)}
				<HeartCard
					{heart}
					markup={markup?.[heart.id]}
					design={designs?.[heart.id]}
					{lang}
					{index}
					strand={columns > 0 ? index % columns : undefined}
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
		/* Margin, not padding, so the section's box starts at its heading. That
		   box is what an anchor lands on and what the bar's scroll-spy measures:
		   with padding, a chip would park the first row further down than
		   "just under the bar", and the spy would switch chips while the
		   previous row's last hearts still filled the screen. The gallery is a
		   flex column, so the margins do not collapse and nothing moves.
		   With no visible heading, one category's last row and the next one's
		   first row are the grid's own row-gap apart. */
		margin-top: 28px;
		/* The bar is sticky, so a category anchor must not land behind it. Its
		   height is measured (Gallery.svelte); 49px is the one-row bar, for the
		   prerendered page before it is. The 8px is ANCHOR_GAP in
		   $lib/front/scrollSpy, which the spy uses as the same line. */
		scroll-margin-top: calc(var(--gallery-bar-height, 49px) + 8px);
	}

	.cat.first {
		margin-top: 8px;
	}

	/* On the desktop layout the gallery bar's top sits on the hill line's
	   highest point (Gallery.svelte), and the first row starts 6px under that,
	   behind the transparent bar, instead of under it. The bar's box is
	   --bar-room taller than the --gallery-bar-height it reports (the room its
	   chips rest in on the curve, GALLERY-CURVE.md amendment 1). */
	@media (min-width: 900px) {
		.cat.first {
			margin-top: calc(6px - var(--gallery-bar-height, 49px) - var(--bar-room, 0px));
		}
	}

	.cat.apart {
		margin-top: 48px;
		gap: 12px;
	}

	/* The strands (Gallery.svelte, GALLERY-CURVE.md amendment 3) hang every
	   gallery card up to --strand-room (D) below its layout, and all of them
	   exactly D once level. So an anchored category lands D higher, which
	   puts its level row just under the bar, and "Mine hjerter", which is not
	   a strand, keeps D more room above it. */
	@media (min-width: 900px) {
		.cat:not(.apart) {
			scroll-margin-top: calc(var(--gallery-bar-height, 49px) + 8px - var(--strand-room, 0px));
		}

		.cat.apart {
			margin-top: calc(48px + var(--strand-room, 0px));
		}
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

	.cat-grid {
		display: grid;
		/* Cells are just wider than the 200px heart, so the hearts nearly fill
		   their columns: five per row at 1440, four at 1024, three at 768. */
		grid-template-columns: repeat(auto-fill, minmax(204px, 1fr));
		column-gap: 16px;
		row-gap: 28px;
		/* A first-row card stepped down by the hill line makes its row taller
		   instead of stretching the row's other cards. */
		align-items: start;
	}

	@media (max-width: 599px) {
		.cat {
			margin-top: 32px;
		}

		.cat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 14px;
			row-gap: 32px;
		}
	}
</style>
