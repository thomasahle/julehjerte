<!--
  The gallery's sticky bar — docs/redesign/DESIGN.md §3 "Gallery bar" and
  docs/redesign/GALLERY-BAR.md.

  One row, left to right: the Juleflet.dk wordmark, which only shows once the
  bar has stuck (the page header carrying the same wordmark has scrolled away
  by then); then the right-aligned chip row: only while hearts are ticked, one
  red "Hent skabeloner (n)" button (docs/redesign/SELECTION.md), which opens
  the download dialog for them, and one chip per category, with scroll-spy
  marking the one being read. The button is the row's first item and behaves
  as a chip — its own lift on the hill, pushed down with the chips — and the
  row is right-aligned, so it comes and goes without moving the chips. Ticking is
  the exception (docs/redesign/FRONT-SIMPLIFY.md — a card click opens the
  heart's page), so a visitor who never ticks anything never sees a disabled
  download button asking them to. The bar only reports the click; the
  selection and the dialog stay on the page.

  On the desktop layout, at rest, the chips are right-aligned and each steps
  down onto the hero's hill line (docs/redesign/GALLERY-CURVE.md); the gallery
  measures the curve and hands each chip its lift. Scrolling, the top of the
  screen pushes each chip down the page as it reaches it until they are all
  flat and left-aligned, and only then does the bar stick (amendment 1). For
  that the bar's box is L (the largest lift) taller, chips at its bottom, and
  sticks at `top: -L`; everything is scroll-linked, nothing transitions.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';
	import { categoryTitle, MY_HEARTS_CATEGORY_ID } from '$lib/data/categories';
	import { ANCHOR_GAP, currentSection, isAtPageBottom } from '$lib/front/scrollSpy';
	import { DownloadIcon } from '$lib/components/icons';

	interface Props {
		lang: Language;
		/** The gallery's categories, in gallery order, with their heart counts. */
		categories: { id: string; count: number }[];
		/** How many hearts the visitor has drawn ("Mine hjerter"). */
		myHeartCount: number;
		/** Hearts currently ticked; shown in the button's badge. */
		selectedCount: number;
		/**
		 * The bar's height in px, bound by the gallery for the sections'
		 * `scroll-margin-top`: a chip's anchor has to land under the bar, and on
		 * a phone the bar takes a second row while the button shows.
		 */
		height?: number;
		/**
		 * How far down each chip steps at rest, in px, in chip order (desktop
		 * only; measured by the gallery). Empty: flat, and the bar as on a phone.
		 */
		lifts?: readonly number[];
		/**
		 * D: how far below its layout a gallery category's rows hang once the
		 * strands are level (GALLERY-CURVE.md amendment 3), so the scroll-spy
		 * sees where a category's hearts are rather than its box. 0: none.
		 */
		strandRoom?: number;
		/** "Hent skabeloner": open the download dialog for the ticked hearts. */
		onDownload: () => void;
	}

	let {
		lang,
		categories,
		myHeartCount,
		selectedCount,
		height = $bindable(0),
		lifts = [],
		strandRoom = 0,
		onDownload
	}: Props = $props();

	let hasSelection = $derived(selectedCount > 0);

	// L: the extra height the bar's box gets on top, so the chips can rest on
	// the curve above their flat place. The chips' row is a scroller
	// (overflow-x), so it gets the same room on top, which its negative margin
	// takes back out of the bar's layout.
	let liftRoom = $derived(Math.max(0, ...lifts));

	// The box's full height, L included; `height` reports what is left on
	// screen once stuck, which is what an anchor has to clear.
	let boxHeight = $state(0);
	$effect(() => {
		height = Math.max(0, boxHeight - liftRoom);
	});

	// One chip per section that has hearts, in page order, so every chip leads
	// somewhere; "Mine hjerter" only once the visitor has drawn any — its
	// empty-state panel is not worth a chip of its own.
	let sections = $derived([
		...categories.filter((category) => category.count > 0),
		...(myHeartCount > 0 ? [{ id: MY_HEARTS_CATEGORY_ID, count: myHeartCount }] : [])
	]);

	// The bar starts up on the hero's snow (Gallery.svelte pulls the gallery
	// over the drawing), where an opaque background would show as a paler
	// rectangle over the snow hill. So it is transparent until it actually
	// sticks, which a 1px sentinel at its top detects (moved down by L on the
	// desktop layout, where the bar sticks at -L): the sentinel leaves the
	// viewport at the same moment the bar reaches its sticky top.
	let sentinel = $state.raw<HTMLElement | null>(null);
	let stuck = $state(false);

	onMount(() => {
		// Effects and onMount only run in the browser, so no `browser` guard.
		if (!sentinel) return;
		const observer = new IntersectionObserver(([entry]) => {
			stuck = !entry.isIntersecting && entry.boundingClientRect.top < 0;
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	let barEl = $state.raw<HTMLElement | null>(null);
	let chipRow = $state.raw<HTMLElement | null>(null);

	// The push (GALLERY-CURVE.md amendment 1), scroll-linked: with p = s − H,
	// how far the page has scrolled past the bar's resting top (clamped to
	// [0, L]), chip i sits at translateY(max(p, lift_i) − L): on the curve at
	// rest, then carried down by the top of the screen once p passes its lift,
	// flat at p = L, when the bar sticks. The download button is the row's
	// first item and moves as a chip, with its own lift (SELECTION.md). The
	// `translate` property, not `transform`, so nothing else that transforms a
	// chip is overridden.
	$effect(() => {
		if (!barEl || !chipRow) return;
		const bar = barEl;
		const row = chipRow;
		const room = liftRoom;
		const chipLifts = lifts;
		// Re-run when the chips come and go.
		void sections.length;
		void hasSelection;
		let frame = 0;
		const update = () => {
			frame = 0;
			const chips = Array.from(row.children) as HTMLElement[];
			if (room <= 0) {
				for (const chip of chips) chip.style.removeProperty('translate');
				return;
			}
			const p = Math.min(Math.max(-bar.getBoundingClientRect().top, 0), room);
			chips.forEach((chip, i) => {
				chip.style.translate = `0 ${Math.max(p, chipLifts[i] ?? 0) - room}px`;
			});
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		return () => {
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	/** Index into `sections` of the section being read, or -1 above the first. */
	let activeIndex = $state(-1);

	// Scroll-spy. The sections are measured rather than observed: the rule is
	// "the last section that has reached the bar", which needs every section's
	// position at once, and five getBoundingClientRect() calls a frame are cheap.
	$effect(() => {
		if (!barEl) return;
		const bar = barEl;
		// Re-run when the chips change — "Mine hjerter" joins after mount, once
		// the visitor's hearts have been read from localStorage.
		const ids = sections.map((section) => section.id);
		const shift = strandRoom;
		let frame = 0;
		const measure = () => {
			frame = 0;
			const box = bar.getBoundingClientRect();
			// The bar is stuck once its top has reached its sticky top (-L).
			// Until then the visitor is still above the gallery, on the hero —
			// even though the first row already sits right under the bar, exactly
			// ANCHOR_GAP below it, and the rule alone would light its chip.
			const barStuck = box.top <= 1 - liftRoom;
			if (!barStuck) {
				activeIndex = -1;
				return;
			}
			const line = box.bottom + ANCHOR_GAP;
			const tops = ids.map(
				(id) =>
					(document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) +
					(id === MY_HEARTS_CATEGORY_ID ? 0 : shift)
			);
			const root = document.documentElement;
			activeIndex = currentSection(
				tops,
				line,
				barStuck,
				isAtPageBottom(window.scrollY, window.innerHeight, root.scrollHeight)
			);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		measure();
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		return () => {
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	});

	// Keep the current chip in sight on a phone, where the row is wider than the
	// screen. This scrolls the row itself rather than calling scrollIntoView():
	// the spy fires in the middle of the window's own smooth scroll after a chip
	// click, and scrollIntoView() is allowed to scroll every ancestor, the
	// window included — it must not get the chance to cut that scroll short.
	$effect(() => {
		const index = activeIndex;
		const row = chipRow;
		if (!row || index < 0) return;
		const chip = row.querySelectorAll('.chip')[index];
		// jsdom has no layout and no Element.scrollBy.
		if (!(chip instanceof HTMLElement) || typeof row.scrollBy !== 'function') return;
		const rowBox = row.getBoundingClientRect();
		const chipBox = chip.getBoundingClientRect();
		if (chipBox.left < rowBox.left) row.scrollBy({ left: chipBox.left - rowBox.left });
		else if (chipBox.right > rowBox.right) row.scrollBy({ left: chipBox.right - rowBox.right });
	});

	// A chip is a plain anchor, so the browser and SvelteKit's router do the
	// jump and the URL hash. It is only made smooth for this one jump: a site-wide
	// `scroll-behavior: smooth` on <html> would also animate SvelteKit's own
	// scroll resets, so coming back from a heart's page would visibly slide down
	// to where the visitor left off. app.css limits the class to visitors who
	// have not asked for reduced motion.
	let smoothTimer: ReturnType<typeof setTimeout> | undefined;

	function smoothJump() {
		const root = document.documentElement;
		const done = () => {
			clearTimeout(smoothTimer);
			window.removeEventListener('scrollend', done);
			root.classList.remove('smooth-anchors');
		};
		done();
		root.classList.add('smooth-anchors');
		window.addEventListener('scrollend', done, { once: true });
		// scrollend never fires when there is nothing to scroll (the chip of the
		// section already in place), and older Safari has no scrollend at all.
		smoothTimer = setTimeout(done, 1500);
	}

	$effect(() => () => {
		clearTimeout(smoothTimer);
		document.documentElement.classList.remove('smooth-anchors');
	});
</script>

<div
	class="bar-sentinel"
	bind:this={sentinel}
	aria-hidden="true"
	style:top={liftRoom > 0 ? `${liftRoom}px` : undefined}
></div>
<div
	class="gallery-bar"
	data-gallery-bar
	class:stuck
	bind:this={barEl}
	bind:offsetHeight={boxHeight}
	style:--bar-room={liftRoom > 0 ? `${liftRoom}px` : undefined}
>
	<!-- Always in the DOM, so nothing shifts when it appears; hidden from the
	     keyboard and screen readers until then, because the header's own
	     wordmark is still on screen. -->
	<a
		class="wordmark"
		href={href('home', lang)}
		aria-hidden={stuck ? undefined : 'true'}
		tabindex={stuck ? undefined : -1}
	>
		{t('siteWordmark', lang)}
	</a>


	<nav
		class="chips"
		aria-label={t('galleryCategories', lang)}
		bind:this={chipRow}
		data-hill-chips
	>
		{#if hasSelection}
			<button type="button" class="get" onclick={onDownload}>
				<DownloadIcon size={16} />
				{t('printSelected', lang)}
				<span class="get-count">{selectedCount}</span>
			</button>
		{/if}
		{#each sections as section, i (section.id)}
			<a
				class="chip"
				href="#{section.id}"
				aria-current={i === activeIndex ? 'true' : undefined}
				onclick={smoothJump}
			>
				{categoryTitle(section.id, lang)}
				<span class="chip-count">{section.count}</span>
			</a>
		{/each}
	</nav>

</div>

<style>
	.gallery-bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		background: transparent;
	}

	.gallery-bar.stuck {
		background: var(--page);
	}

	.bar-sentinel {
		position: relative;
		height: 1px;
		margin-top: -1px;
	}

	/* The header's wordmark (PageHeader's .nav-logo), at bar size. */
	.wordmark {
		flex: none;
		font-size: 20px;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		text-decoration: none;
		color: var(--deep);
		opacity: 0;
		/* Invisible is not enough: a transparent link still takes clicks. */
		pointer-events: none;
		/* Until the bar sticks the wordmark takes no room either, so the chips
		   start at the content's left edge; the negative margin eats the row's gap. */
		max-width: 0;
		margin-right: -12px;
		overflow: hidden;
		transition:
			opacity 150ms ease,
			max-width 150ms ease,
			margin-right 150ms ease;
	}

	.stuck .wordmark {
		opacity: 1;
		pointer-events: auto;
		max-width: 200px;
		margin-right: 0;
	}

	.wordmark:hover {
		color: var(--green);
	}

	/* The row scrolls sideways when the chips do not fit (a phone), without a
	   scrollbar: the cut-off chip at the edge already says there is more. */
	.chips {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		gap: 8px;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: none;
		/* Room for the chips' focus ring, which overflow would otherwise clip. */
		padding: 5px;
		margin: -5px;
		/* The snap area starts inside that room, so the first chip snaps to
		   its rest place (scrollLeft 0, in line with the cards) rather than to
		   the padding edge, 5px further left with its focus ring cut off. */
		scroll-padding-inline: 5px;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.chips {
			scroll-behavior: smooth;
		}
	}

	.chip {
		flex: none;
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: rgb(255 255 255 / 0.8);
		color: var(--deep);
		font-size: 13px;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		text-decoration: none;
		scroll-snap-align: start;
	}

	.chip:hover {
		background: var(--cream2);
		color: var(--deep);
	}

	/* No border on the current chip, but the same box: the border goes
	   transparent instead of away, so the row does not shift by 2px. */
	.chip[aria-current='true'] {
		border-color: transparent;
		background: var(--deep);
		color: var(--white);
	}

	.chip-count {
		font-weight: 500;
		color: var(--muted);
	}

	.chip[aria-current='true'] .chip-count {
		color: inherit;
		opacity: 0.75;
	}

	/* The desktop layout's unstuck bar lies over the hero's snow, with the
	   first row of hearts starting right behind it — L more of it now — so it
	   lets clicks through to them everywhere but on its own controls.

	   The box is L taller on top (--bar-room, set from the lifts) and sticks
	   at -L, so it sticks when exactly its bottom, a normal bar, is left on
	   screen. The chips are right-aligned by a spacer, stuck or not: the screen
	   pushes them straight down, never sideways (its -8px eats the row's gap).
	   The wordmark keeps its room here (only its opacity changes), so nothing
	   moves sideways when it appears either. */
	@media (min-width: 900px) {
		.gallery-bar {
			top: calc(-1 * var(--bar-room, 0px));
			padding-top: calc(10px + var(--bar-room, 0px));
		}

		.gallery-bar:not(.stuck),
		.chips {
			pointer-events: none;
		}

		.chip,
		.get {
			pointer-events: auto;
		}

		.chips {
			padding-top: calc(5px + var(--bar-room, 0px));
			margin-top: calc(-5px - var(--bar-room, 0px));
		}

		.chips::before {
			content: '';
			flex: 1 0 0;
			margin-right: -8px;
		}

		.wordmark {
			max-width: 200px;
			margin-right: 0;
		}
	}

	/* "Hent skabeloner (n)", the chip row's first item: an opaque red pill the
	   chips' size (13px, their 6px vertical padding), 32px tall. Its -2px
	   margins keep its box inside the chips' 29.4px line, so it never changes
	   the bar's height. Opaque, as ribbons may run behind it at rest. */
	.get {
		flex: none;
		/* Where the row scrolls (a phone), the button stays in view at its
		   start and the chips pass under it. */
		position: sticky;
		left: 0;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		margin: -2px 0;
		padding: 6px 8px 6px 12px;
		border: none;
		border-radius: 999px;
		box-sizing: border-box;
		background: var(--red);
		color: var(--white);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
		box-shadow: 0 2px 8px rgb(var(--deep-rgb) / 0.12);
	}

	.get:hover {
		background: var(--red-hover);
	}

	.get:focus-visible {
		outline: 3px solid var(--blue);
		outline-offset: 2px;
	}

	.get-count {
		padding: 1px 8px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.22);
	}

	/* A phone: the row wraps (when nothing is ticked the chips simply scroll). */
	@media (max-width: 699px) {
		.gallery-bar {
			flex-wrap: wrap;
			gap: 8px;
			padding: 8px 0;
		}

		.wordmark {
			font-size: 16px;
		}
	}
</style>
