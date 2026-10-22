<!--
  The front page's gallery — docs/redesign/DESIGN.md §3 "Gallery".

  The decorative frame, the heading, the sticky gallery bar, one row per category and
  "Mine hjerter" at the foot. Selection and the download dialog belong to the page;
  this composes the pieces and owns the column's own layout.

  The frame is only drawn from 1400px up and has to be exactly as tall as the
  gallery, so its height is measured here rather than guessed at prerender time.

  On the desktop layout the gallery also follows the hero's hill line
  (docs/redesign/GALLERY-CURVE.md): this measures the landscape, the chips and
  the first row's cards, asks $lib/front/hillLine where the curve is, and hands
  the bar its chip lifts and every grid column its strand (amendment 3).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import GalleryFrame from './GalleryFrame.svelte';
	import GalleryBar from './GalleryBar.svelte';
	import CategorySection from './CategorySection.svelte';
	import MyHearts from './MyHearts.svelte';
	import { NARROW_QUERY, WIDE_FRAME_QUERY } from '$lib/breakpoints';
	import { cardDrop, chipLift, hillTopPage, type LandRect } from '$lib/front/hillLine';
	import { clearLevelBootstrap, clearStrandBootstrap } from '$lib/front/strandBootstrap';
	import { LEVELS, levelValue, matchesLevels } from '$lib/front/levelFilter';
	import type { DifficultyLevel } from '$lib/utils/difficulty';
	import { CLAIM_PRERENDERED } from '$lib/front/galleryHearts';
	import { categoryTitle, makeOwnLink } from '$lib/data/categories';
	import { t, type Language } from '$lib/i18n';
	import type { HeartDesign } from '$lib/types/heart';
	import type { GalleryHeart } from '$lib/front/galleryHearts';

	interface Props {
		lang: Language;
		/** The gallery's own rows, in gallery order. */
		categories: { id: string; hearts: GalleryHeart[] }[];
		/**
		 * The gallery hearts' finished SVGs, by id, when they are already in the
		 * prerendered HTML — see $lib/front/galleryHearts.
		 */
		markup: Record<string, string> | null;
		/** The designs to draw them from, by id, when they are not. */
		designs: Record<string, HeartDesign> | null;
		/** The visitor's own hearts, read from localStorage after mount. */
		myHearts: GalleryHeart[];
		/** Their designs, by id — they are always drawn in the browser. */
		myDesigns: Record<string, HeartDesign>;
		selectedIds: Set<string>;
		/**
		 * Ticked hearts that actually exist on this page. Not `selectedIds.size`:
		 * a shared `?selected=` can name hearts this browser has no card for, and
		 * the bar must not offer a PDF of them.
		 */
		selectedCount: number;
		/** "Hent skabeloner": open the download dialog for the ticked hearts. */
		onDownload: () => void;
		onSelect: (heart: GalleryHeart) => void;
		onClick: (heart: GalleryHeart) => void;
		onDelete: (heart: GalleryHeart) => void;
		/**
		 * Called once the gallery has been measured and its strands written,
		 * after every measure: the page waits for it before landing a hash it
		 * loaded with, because the browser's own jump happened before the
		 * pull-up, the bar's room and the strands were known.
		 */
		onLayout?: () => void;
		/**
		 * The inline script that lays the gallery out on the hill line before it
		 * paints ($lib/front/strandBootstrap); null in the browser, where it has
		 * already run or, after a client-side navigation, is not needed.
		 */
		strandScript?: string | null;
		/**
		 * The difficulty filter (GALLERY-BAR.md, "As built: difficulty
		 * filter"): the levels shown, none meaning all. "Mine hjerter" is not
		 * filtered.
		 */
		levels?: ReadonlySet<DifficultyLevel>;
		/**
		 * The page has read the filter from the URL or the tab's storage, so
		 * what the gallery shows is final and the inline script's first-paint
		 * stand-in for it can go.
		 */
		levelsRestored?: boolean;
		onToggleLevel?: (level: DifficultyLevel) => void;
		onClearLevels?: () => void;
	}

	let {
		lang,
		categories,
		markup,
		designs,
		myHearts,
		myDesigns,
		selectedIds,
		selectedCount,
		onDownload,
		onSelect,
		onClick,
		onDelete,
		onLayout,
		strandScript = null,
		levels = new Set(),
		levelsRestored = false,
		onToggleLevel = () => {},
		onClearLevels = () => {}
	}: Props = $props();

	/** The levels any gallery heart has, easiest first: one menu item each. */
	let availableLevels = $derived(
		LEVELS.filter((level) =>
			categories.some((category) => category.hearts.some((heart) => heart.difficulty === level))
		)
	);

	/** How many of each category's hearts the filter leaves, in gallery order. */
	let visibleCounts = $derived(
		categories.map(
			(category) => category.hearts.filter((heart) => matchesLevels(levels, heart.difficulty)).length
		)
	);

	/**
	 * The first category with hearts on show: it is the one that starts on the
	 * hill line (`first`), so a filter that empties "Klassiske" hands that
	 * role to the next.
	 */
	let firstShown = $derived(visibleCounts.findIndex((count) => count > 0));

	/** Changes whenever the filter does, for the measure below. */
	let levelKey = $derived(levelValue(levels));

	// The page has applied the filter it loaded with (this runs after the DOM
	// shows it), so the inline script's rules for the first paint can go.
	$effect(() => {
		if (browser && levelsRestored) clearLevelBootstrap();
	});

	// Measured by the bar; the sections' scroll-margin-top reads it so a chip's
	// anchor lands under the bar rather than behind it. Left unset until it is
	// known, so the prerendered page falls back to the stylesheet's estimate.
	let barHeight = $state(0);

	let galleryWrapEl = $state.raw<HTMLElement | null>(null);
	let frameHeight = $state(0);

	$effect(() => {
		if (!browser || !galleryWrapEl) return;
		const el = galleryWrapEl;
		const wideEnough = window.matchMedia(WIDE_FRAME_QUERY);
		// In the next frame, not inside the ResizeObserver callback: a layout
		// write during delivery is what WebKit reports as "ResizeObserver
		// loop completed with undelivered notifications" (see the hill
		// measure below and GalleryBar's height). One frame at a time.
		let frame = 0;
		const measure = () => {
			frame = 0;
			frameHeight = wideEnough.matches ? Math.round(el.getBoundingClientRect().height) : 0;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		measure();
		const observer = new ResizeObserver(schedule);
		observer.observe(el);
		wideEnough.addEventListener('change', schedule);
		return () => {
			observer.disconnect();
			wideEnough.removeEventListener('change', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	// The hill line (desktop only). `wrapLift` is the wrap's margin-top that
	// puts the gallery's top — the bar's top — on `hillTop`, the line's highest
	// point inside the content column; null leaves the stylesheet's estimate.
	let galleryEl = $state.raw<HTMLElement | null>(null);
	let wrapLift = $state<number | null>(null);
	let chipLifts = $state.raw<number[]>([]);
	/** The hill has been measured at least once, so the chips' lifts are known (or none). */
	let hillMeasured = $state(false);
	/** drop_k per grid column (GALLERY-CURVE.md amendment 3); empty: no strands. */
	let strandDrops = $state.raw<number[]>([]);
	/** D, the largest drop: how far below its layout every card hangs once level. */
	let strandRoom = $derived(strandDrops.length > 0 ? Math.max(...strandDrops) : 0);

	/** To a tenth of a pixel: precise enough, and stable from one measure to the next. */
	const round = (px: number) => Math.round(px * 10) / 10;

	const sameNumbers = (a: readonly number[], b: readonly number[]) =>
		a.length === b.length && a.every((value, i) => value === b[i]);

	$effect(() => {
		if (!browser || !galleryWrapEl || !galleryEl) return;
		const wrap = galleryWrapEl;
		const gallery = galleryEl;
		// Re-run when the chips or the bar's right-hand controls change: "Mine
		// hjerter" gets a chip once read from localStorage, and the selection
		// controls take room from the chips' row.
		void myHearts.length;
		void (selectedCount > 0);
		// And when the difficulty filter changes: the chips' counts change
		// their widths, the first row may now belong to another category, and
		// the wrap's height changes while its width does not.
		void levelKey;
		const narrow = window.matchMedia(NARROW_QUERY);
		let frame = 0;

		const measure = () => {
			frame = 0;
			measured = true;
			hillMeasured = true;
			const land = document.querySelector('[data-scene-land] > svg');
			if (narrow.matches || !land) {
				wrapLift = null;
				if (chipLifts.length) chipLifts = [];
				if (strandDrops.length) strandDrops = [];
				schedulePush();
				return;
			}
			const { scrollX, scrollY } = window;
			const landBox = land.getBoundingClientRect();
			const landRect: LandRect = {
				left: landBox.left + scrollX,
				top: landBox.top + scrollY,
				width: landBox.width
			};

			const galleryBox = gallery.getBoundingClientRect();
			const galleryStyle = getComputedStyle(gallery);
			const columnLeft = galleryBox.left + scrollX + parseFloat(galleryStyle.paddingLeft);
			const columnRight = galleryBox.right + scrollX - parseFloat(galleryStyle.paddingRight);
			const hillTop = hillTopPage(columnLeft, columnRight, landRect);

			// Where the wrap would start without its margin: the foot of the hero.
			const wrapTop =
				wrap.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(wrap).marginTop);
			wrapLift = round(hillTop - wrapTop);

			// The chips as they sit right-aligned on the curve, worked out from
			// their widths rather than read off the screen, so the answer is the
			// same while the bar is stuck (left-aligned) or sliding between the two.
			const nav = gallery.querySelector<HTMLElement>('[data-hill-chips]');
			const items = nav ? Array.from(nav.querySelectorAll<HTMLElement>('[data-hill-chip]')) : [];
			let chipSpan: [number, number] | null = null;
			const lifts: number[] = [];
			if (nav && items.length > 0) {
				const navBox = nav.getBoundingClientRect();
				const navStyle = getComputedStyle(nav);
				const rowLeft = navBox.left + scrollX + parseFloat(navStyle.paddingLeft);
				const rowRight = navBox.right + scrollX - parseFloat(navStyle.paddingRight);
				const gap = parseFloat(navStyle.columnGap) || 0;
				// The items in row order, the difficulty toggles' group flattened:
				// it is a flex row with the same gap, so its toggles sit exactly
				// where they would as the row's own items.
				// The group's own margin after its last toggle sets the two groups apart.
				const widths = items.map((chip) => chip.offsetWidth);
				const after = items.map((chip) =>
					chip.parentElement !== nav && chip === chip.parentElement?.lastElementChild
						? gap + (parseFloat(getComputedStyle(chip.parentElement).marginRight) || 0)
						: gap
				);
				const total =
					widths.reduce((sum, width, i) => sum + width + after[i], 0) - after[after.length - 1];
				let x = Math.max(rowLeft, rowRight - total);
				chipSpan = [x, x + total];
				widths.forEach((width, i) => {
					lifts.push(round(chipLift(x + width / 2, landRect, hillTop)));
					x += width + after[i];
				});
			}
			if (!sameNumbers(lifts, chipLifts)) chipLifts = lifts;

			// The strands: one per grid column, all category grids sharing the
			// same columns. Their centres come from the first grid's track sizes,
			// not from its cards — the first category can have fewer cards than
			// there are columns.
			const grid = gallery.querySelector<HTMLElement>('[data-hill-row]');
			const drops: number[] = [];
			if (grid) {
				const gridStyle = getComputedStyle(grid);
				const tracks = gridStyle.gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite);
				const gap = parseFloat(gridStyle.columnGap) || 0;
				let x = grid.getBoundingClientRect().left + scrollX;
				for (const track of tracks) {
					drops.push(round(cardDrop(x + track / 2, landRect, hillTop, chipSpan)));
					x += track + gap;
				}
			}
			if (!sameNumbers(drops, strandDrops)) strandDrops = drops;
			schedulePush();
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		const schedulePush = () => {
			if (!pushFrame) pushFrame = requestAnimationFrame(push);
		};

		// The strands (GALLERY-CURVE.md amendment 3), scroll-linked: every card
		// in column k hangs at y_k = drop_k + clamp(s + bar − (rowTop + drop_k),
		// 0, D − drop_k) — on the hill at rest, then carried down by the stuck
		// bar's bottom edge (the push line) until every strand is level at D.
		// One custom property per column on the gallery, read by the cards, so
		// a frame writes a handful of variables rather than a style per card.
		let pushFrame = 0;
		let strandsSet = 0;
		/** A measure has run since the last push: report the layout after it. */
		let measured = false;
		const push = () => {
			pushFrame = 0;
			strands();
			// The gallery's own values are all written now (the pull-up and the
			// cards' columns in the measure's flush, the strands just above), so
			// the inline script's first-paint stand-ins on <html> can go.
			clearStrandBootstrap();
			if (measured) {
				measured = false;
				onLayout?.();
			}
		};
		const strands = () => {
			const drops = strandDrops;
			const grid = gallery.querySelector<HTMLElement>('[data-hill-row]');
			for (let k = drops.length; k < strandsSet; k++) gallery.style.removeProperty(`--strand-${k}`);
			strandsSet = drops.length;
			if (!grid || drops.length === 0) return;
			const s = window.scrollY;
			// The first row's laid-out top, H + 6: the grid itself is never moved.
			const rowTop = grid.getBoundingClientRect().top + s;
			const lowest = Math.max(...drops);
			// The stuck bar's bottom edge: its box less the room on top.
			const bar = gallery.querySelector('[data-gallery-bar]');
			const room = chipLifts.length > 0 ? Math.max(...chipLifts) : 0;
			const line = s + (bar ? bar.getBoundingClientRect().height - room : 50);
			drops.forEach((drop, k) => {
				const y = drop + Math.min(Math.max(line - (rowTop + drop), 0), lowest - drop);
				gallery.style.setProperty(`--strand-${k}`, `${y}px`);
			});
		};

		// Untracked: measure() reads the lifts it compares against.
		untrack(measure);
		const observer = new ResizeObserver(schedule);
		observer.observe(wrap);
		const nav = gallery.querySelector('[data-hill-chips]');
		if (nav) {
			observer.observe(nav);
			for (const chip of nav.querySelectorAll('[data-hill-chip]')) observer.observe(chip);
		}
		const land = document.querySelector('[data-scene-land] > svg');
		if (land) observer.observe(land);
		narrow.addEventListener('change', schedule);
		window.addEventListener('scroll', schedulePush, { passive: true });
		// Chip widths change once the web font is in.
		document.fonts?.ready.then(schedule);
		return () => {
			observer.disconnect();
			narrow.removeEventListener('change', schedule);
			window.removeEventListener('scroll', schedulePush);
			if (frame) cancelAnimationFrame(frame);
			if (pushFrame) cancelAnimationFrame(pushFrame);
		};
	});
</script>

<!-- Lays the gallery out on the hill line while the page is still parsing, so
     the prerendered page paints it where this component's measure puts it —
     see $lib/front/strandBootstrap. It belongs right before the gallery: the
     hero's scene above has been parsed by then and the gallery not yet. In
     the browser the block claims the <script> the page came with. -->
<!-- svelte-ignore hydration_html_changed -->
{@html strandScript ?? CLAIM_PRERENDERED}

<div
	class="gallery-wrap"
	bind:this={galleryWrapEl}
	style:margin-top={wrapLift === null ? undefined : `${wrapLift}px`}
>
	<GalleryFrame height={frameHeight} />

	<div
		class="gallery"
		id="skabeloner"
		bind:this={galleryEl}
		style:--gallery-bar-height={barHeight > 0 ? `${barHeight}px` : undefined}
		style:--bar-room={chipLifts.length > 0 ? `${Math.max(...chipLifts)}px` : undefined}
		style:--strand-room={strandRoom > 0 ? `${strandRoom}px` : undefined}
	>
		<!-- The section keeps a heading for the nav's "Skabeloner" anchor and for
		     screen readers; visually the gallery starts with the first category. -->
		<h2 class="sr-only">{t('galleryHeading', lang)}</h2>

		<GalleryBar
			{lang}
			categories={categories.map((category, i) => ({
				id: category.id,
				count: visibleCounts[i],
				total: category.hearts.length
			}))}
			{levels}
			{availableLevels}
			{onToggleLevel}
			{onClearLevels}
			myHeartCount={myHearts.length}
			bind:height={barHeight}
			lifts={chipLifts}
			measured={hillMeasured}
			{strandRoom}
			{selectedCount}
			{onDownload}
		/>

		{#each categories as category, i (category.id)}
			<CategorySection
				id={category.id}
				title={categoryTitle(category.id, lang)}
				hearts={category.hearts}
				make={makeOwnLink(category.id, lang)}
				{markup}
				{designs}
				{lang}
				{selectedIds}
				{onSelect}
				{onClick}
				first={i === firstShown}
				columns={strandDrops.length}
				{levels}
			/>
		{/each}

		<MyHearts
			{lang}
			hearts={myHearts}
			designs={myDesigns}
			{selectedIds}
			{onSelect}
			{onClick}
			{onDelete}
		/>
	</div>
</div>

<style>
	/* On the desktop layout the gallery starts up in the hero's snow: its top,
	   which is the bar's top, sits on the hill line's highest point inside the
	   content column, and the first row steps down along the line under it
	   (docs/redesign/GALLERY-CURVE.md). The drawing's front snow and the page
	   background are the same colour, so the bar and the cards simply carry on
	   over it. The bar is transparent until it sticks (see GalleryBar), so its
	   background never shows as a paler rectangle over the snow hill.

	   The exact lift is measured after mount. Before that the prerendered page
	   paints it from --gallery-pull, which the inline strand script works out
	   while the page parses ($lib/front/strandBootstrap) to what the measure
	   will find; without JavaScript, from the stylesheet's estimate, the hill's
	   highest point at 1440 (y 498 of the drawing's 724, which spans the
	   viewport's width). Below 900 there is no
	   overlap at all: the landscape is an in-flow band there, with the scroll
	   hint on it. */
	.gallery-wrap {
		position: relative;
		/* Above the hero's scene, which is positioned as well. */
		z-index: 1;
		margin-top: var(--gallery-pull, calc(-100vw * 226 / 2172));
	}

	.gallery {
		position: relative;
		display: flex;
		flex-direction: column;
		max-width: 1280px;
		width: 100%;
		margin: 0 auto;
		padding: 0 40px 56px;
		box-sizing: border-box;
	}


	@media (max-width: 899px) {
		.gallery-wrap {
			margin-top: 0;
		}

		.gallery {
			padding: 16px 24px 40px;
		}

	}

	@media (max-width: 599px) {
		.gallery {
			padding: 16px 16px 32px;
		}
	}
</style>
