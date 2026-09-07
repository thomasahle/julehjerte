<!--
  The front page's gallery — docs/redesign/DESIGN.md §3 "Gallery".

  The decorative frame, the heading, the sticky toolbar, one row per category and
  "Mine hjerter" at the foot. Selection and PDF generation belong to the page;
  this composes the pieces and owns the column's own layout.

  The frame is only drawn from 1400px up and has to be exactly as tall as the
  gallery, so its height is measured here rather than guessed at prerender time.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import GalleryFrame from './GalleryFrame.svelte';
	import GalleryToolbar from './GalleryToolbar.svelte';
	import CategorySection from './CategorySection.svelte';
	import MyHearts from './MyHearts.svelte';
	import { WIDE_FRAME_QUERY } from '$lib/breakpoints';
	import { categoryTitle } from '$lib/data/categories';
	import { t, type Language } from '$lib/i18n';
	import type { LayoutMode } from '$lib/pdf/template';
	import type { HeartDesign } from '$lib/types/heart';

	interface Props {
		lang: Language;
		/** The gallery's own rows, in gallery order. */
		categories: { id: string; hearts: HeartDesign[] }[];
		/** The visitor's own hearts, read from localStorage after mount. */
		myHearts: HeartDesign[];
		selectedIds: Set<string>;
		/**
		 * Ticked hearts that actually exist on this page. Not `selectedIds.size`:
		 * a shared `?selected=` can name hearts this browser has no card for, and
		 * the toolbar must not offer a PDF of them.
		 */
		selectedCount: number;
		generating: boolean;
		allSelected: boolean;
		pdfLayout: LayoutMode;
		onPrint: () => void;
		onSelectAll: () => void;
		onSelectNone: () => void;
		onSelect: (design: HeartDesign) => void;
		onClick: (design: HeartDesign) => void;
		onDelete: (design: HeartDesign) => void;
	}

	let {
		lang,
		categories,
		myHearts,
		selectedIds,
		selectedCount,
		generating,
		allSelected,
		pdfLayout = $bindable(),
		onPrint,
		onSelectAll,
		onSelectNone,
		onSelect,
		onClick,
		onDelete
	}: Props = $props();

	let galleryWrapEl = $state.raw<HTMLElement | null>(null);
	let frameHeight = $state(0);

	$effect(() => {
		if (!browser || !galleryWrapEl) return;
		const el = galleryWrapEl;
		const wideEnough = window.matchMedia(WIDE_FRAME_QUERY);
		const measure = () => {
			frameHeight = wideEnough.matches ? Math.round(el.getBoundingClientRect().height) : 0;
		};
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		wideEnough.addEventListener('change', measure);
		return () => {
			observer.disconnect();
			wideEnough.removeEventListener('change', measure);
		};
	});

	/** "12 hjerter" — the row's heart count. */
	function heartCount(n: number): string {
		return t('categoryHeartCount', lang, { n });
	}
</script>

<div class="gallery-wrap" bind:this={galleryWrapEl}>
	<GalleryFrame height={frameHeight} />

	<div class="gallery" id="skabeloner">
		<div class="gallery-head">
			<h2>{t('galleryHeading', lang)}</h2>
		</div>

		<GalleryToolbar
			{lang}
			{selectedCount}
			{generating}
			{allSelected}
			bind:pdfLayout
			{onPrint}
			{onSelectAll}
			{onSelectNone}
		/>

		{#each categories as category, i (category.id)}
			<CategorySection
				id={category.id}
				title={categoryTitle(category.id, lang)}
				count={heartCount(category.hearts.length)}
				hearts={category.hearts}
				{lang}
				{selectedIds}
				{onSelect}
				{onClick}
				first={i === 0}
			/>
		{/each}

		<MyHearts {lang} hearts={myHearts} {selectedIds} {onSelect} {onClick} {onDelete} />
	</div>
</div>

<style>
	/* The gallery starts up in the hero's foreground snow instead of below it.
	   The drawing's front snow and the page background are the same colour, so
	   the heading and the toolbar simply carry on over it and the wide empty
	   band at the foot of the hero disappears.

	   Two things cap the overlap at each width, and both shrink with the
	   landscape (which is drawn at the page's own width): the heading has to
	   clear the base of the hero's left-hand firs, and the toolbar's opaque
	   --page background must not begin above the drawing's front snow edge,
	   where it would show as a paler rectangle over the snow hill behind it.
	   Below 900 there is no overlap at all: the landscape is an in-flow band
	   there, with the scroll hint on it. */
	.gallery-wrap {
		position: relative;
		/* Above the hero's scene, which is positioned as well. */
		z-index: 1;
		margin-top: -70px;
	}

	.gallery {
		position: relative;
		display: flex;
		flex-direction: column;
		max-width: 1280px;
		width: 100%;
		margin: 0 auto;
		padding: 24px 40px 56px;
		box-sizing: border-box;
	}

	.gallery-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 16px;
		padding-bottom: 6px;
	}

	.gallery-head h2 {
		margin: 0;
		font-size: 32px;
		font-weight: 600;
		color: var(--deep);
	}

	@media (max-width: 1399px) {
		.gallery-wrap {
			margin-top: -64px;
		}
	}

	@media (max-width: 1199px) {
		.gallery-wrap {
			margin-top: -44px;
		}
	}

	@media (max-width: 899px) {
		.gallery-wrap {
			margin-top: 0;
		}

		.gallery {
			padding: 16px 24px 40px;
		}

		.gallery-head h2 {
			font-size: 26px;
		}
	}

	@media (max-width: 599px) {
		.gallery {
			padding: 16px 16px 32px;
		}
	}
</style>
