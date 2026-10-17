<!--
  The gallery's sticky bar — docs/redesign/DESIGN.md §3 "Gallery bar" and
  docs/redesign/GALLERY-BAR.md.

  One row, left to right: the Juleflet.dk wordmark, which only shows once the
  bar has stuck (the page header carrying the same wordmark has scrolled away
  by then); then the right-aligned chip row: only while hearts are ticked, one
  red "Hent skabeloner (n)" button (docs/redesign/SELECTION.md), which opens
  the download dialog for them, and one chip per category, with scroll-spy
  marking the one being read. Below 900, where the chip row scrolls, the
  button sits before the row instead, outside it. Otherwise it is the row's first item and behaves
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
	import { ANCHOR_GAP, chipRowScroll, currentSection, isAtPageBottom } from '$lib/front/scrollSpy';
	import { DownloadIcon } from '$lib/components/icons';
	import { NARROW_QUERY } from '$lib/breakpoints';

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
		 * `scroll-margin-top`: a chip's anchor has to land under the bar.
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
	// sticks: until its own top has reached its sticky top (-L on the desktop
	// layout, 0 below 900), read from its box by the scroll-spy's frame below
	// on every scroll and resize. A 1px sentinel at its top (moved down by L)
	// leaves the viewport at that same moment; its IntersectionObserver only
	// asks for a measure, as a backstop. On its own it went stale: after a
	// jump scroll (scrollTo(0, 3000) from the top, and back) and in mobile
	// emulation the bar kept the state it had before.
	let sentinel = $state.raw<HTMLElement | null>(null);
	let stuck = $state(false);
	/** The spy's frame request; set once the spy runs. */
	let remeasure = () => {};

	onMount(() => {
		// Effects and onMount only run in the browser, so no `browser` guard.
		if (!sentinel) return;
		const observer = new IntersectionObserver(() => remeasure());
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Below 900 the chip row scrolls sideways (a phone, a narrow tablet), and
	// the download button sits outside it, before it, so the chips scroll
	// beside it. Inside the row, as on the desktop layout's hill, the row grew
	// by the button's width when a heart was ticked: scroll anchoring then
	// moved the row's scrollLeft by as much, and the sticky button covered
	// the first chips.
	let narrow = $state(false);

	onMount(() => {
		// jsdom has no matchMedia.
		if (typeof window.matchMedia !== 'function') return;
		const query = window.matchMedia(NARROW_QUERY);
		const update = () => {
			narrow = query.matches;
		};
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	let barEl = $state.raw<HTMLElement | null>(null);

	// The box's height, observed rather than bound (bind:offsetHeight): the
	// gallery turns it into the first section's margin, so writing it from
	// inside the ResizeObserver callback changed the layout of elements the
	// gallery observes while WebKit was still delivering, which it reports
	// as "ResizeObserver loop completed with undelivered notifications". The
	// read and the write wait for the next frame, once per frame however
	// often the observer fires.
	//
	// `height` is what is left on screen once stuck, which is what an anchor
	// has to clear: the box less the room on top. It is read off the box's
	// own padding, not worked out as the box less `liftRoom`, so it never
	// depends on L. The first section's margin is 6px − height − L (see
	// CategorySection), so the first row stays at the bar's top + 6 whatever
	// L is: when the download button appears with a larger lift than the
	// chips', L grows, and `height` must not. Read as box − L it did not:
	// the observer only watches the content box, which L's padding leaves
	// alone, so the box − L went stale and the whole first row dropped by
	// the change in L (5.8px at 1440). Unrounded, unlike offsetHeight, which
	// left the row up to 0.5px off its line.
	$effect(() => {
		if (!barEl) return;
		const bar = barEl;
		let frame = 0;
		const read = () => {
			frame = 0;
			const style = getComputedStyle(bar);
			const room = parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
			height = Math.max(0, bar.getBoundingClientRect().height - Math.max(0, room || 0));
		};
		read();
		const observer = new ResizeObserver(() => {
			if (!frame) frame = requestAnimationFrame(read);
		});
		observer.observe(bar);
		return () => {
			observer.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});

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

	/**
	 * How close to its sticky top the bar's top counts as there: box tops are
	 * in layout units (1/64px) and L is rounded to a tenth.
	 */
	const STUCK_SLACK = 0.5;

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
			const barStuck = box.top <= STUCK_SLACK - liftRoom;
			stuck = barStuck;
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
		remeasure = schedule;
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		return () => {
			remeasure = () => {};
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
	// Fully in sight: inside the row's box less its focus-ring padding. Also
	// when the row narrows because the download button has appeared beside
	// it (below 900) or the wordmark has.
	$effect(() => {
		const index = activeIndex;
		const row = chipRow;
		void hasSelection;
		void narrow;
		void stuck;
		if (!row || index < 0) return;
		const chip = row.querySelectorAll('.chip')[index];
		// jsdom has no layout and no Element.scrollTo.
		if (!(chip instanceof HTMLElement) || typeof row.scrollTo !== 'function') return;
		// In the row's own content coordinates (the row is the chips'
		// offsetParent), not screen rects: during the row's smooth scroll
		// WebKit's scrollLeft can already report where it is going while the
		// chips are still drawn where they were, so a rect-based delta added
		// to scrollLeft overshot. Offsets do not move with the scroll. The
		// jump is instant, not the row's smooth scroll: WebKit cut that short
		// when the row narrowed under it (the wordmark coming in as the bar
		// sticks), and the row stopped part-way with the chip still cut off.
		const reveal = () => {
			const style = getComputedStyle(row);
			const view = row.scrollLeft;
			const left = chipRowScroll(
				chip.offsetLeft,
				chip.offsetLeft + chip.offsetWidth,
				view + parseFloat(style.paddingLeft),
				view + row.clientWidth - parseFloat(style.paddingRight)
			);
			if (Math.abs(left) >= 1) row.scrollTo({ left: view + left, behavior: 'instant' });
		};
		reveal();
		// The wordmark takes its room over 150ms once the bar sticks.
		const later = setTimeout(reveal, 200);
		return () => clearTimeout(later);
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


	{#snippet getButton()}
		<button type="button" class="get" onclick={onDownload}>
			<DownloadIcon size={16} />
			<span class="get-label">{t('printSelected', lang)}</span>
			<span class="get-count">{selectedCount}</span>
		</button>
	{/snippet}

	{#if hasSelection && narrow}
		{@render getButton()}
	{/if}

	<nav
		class="chips"
		aria-label={t('galleryCategories', lang)}
		bind:this={chipRow}
		data-hill-chips
	>
		{#if hasSelection && !narrow}
			{@render getButton()}
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
		/* The chips' offsetParent, for keeping the current one in sight. */
		position: relative;
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
		   the padding edge, 5px further left with its focus ring cut off. The
		   same 5px snap at first layout also fired a scroll before the first
		   paint, which made Chrome stop looking for the page's largest
		   contentful paint, so the front page reported none on phones. */
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

	/* --muted (5.1:1 on the page) fell to 3.98:1 where a chip rests on the
	   hill with a dark fir showing through its translucent white; the darker
	   --muted-on-sky keeps the count above 4.5:1 there too. */
	.chip-count {
		font-weight: 500;
		color: var(--muted-on-sky);
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

		/* Should the row ever scroll here, the button stays in view at its
		   start and the chips pass under it. */
		.get {
			position: sticky;
			left: 0;
			z-index: 1;
		}
	}

	/* "Hent skabeloner (n)", the chip row's first item on the desktop layout,
	   and the item before the chip row below 900: an opaque red pill the
	   chips' size (13px, their 6px vertical padding), 32px tall. Its -2px
	   margins keep its box inside the chips' 29.4px line, so it never changes
	   the bar's height. Opaque, as ribbons may run behind it at rest. */
	.get {
		flex: none;
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

	/* A phone: still one row (GALLERY-BAR.md), the wordmark (once stuck) and
	   the chip row side by side, the chips scrolling beside it. It never
	   wraps: the chip row's content is wider than the screen, so a wrapping
	   bar always put it on a second row under the wordmark, empty at rest,
	   and made the bar 70px tall. The padding stays 10px, so the bar is the
	   desktop's 49-50px and a chip jump lands 8px under it there too. */
	@media (max-width: 699px) {
		.gallery-bar {
			gap: 8px;
		}

		.wordmark {
			font-size: 16px;
			margin-right: -8px;
		}

		.stuck .wordmark {
			margin-right: 0;
		}

		/* Stuck, the wordmark and the full button would leave the chips less
		   than one chip's width (89px on an iPhone 13), so no current chip
		   could be shown whole. The button keeps its icon and count there;
		   its name stays for screen readers, as with Tailwind's sr-only. */
		.stuck .get-label {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
	}
</style>
