<!--
  The gallery's sticky bar — docs/redesign/DESIGN.md §3 "Gallery bar" and
  docs/redesign/GALLERY-BAR.md.

  One row, left to right: the Juleflet.dk wordmark, which only shows once the
  bar has stuck (the page header carrying the same wordmark has scrolled away
  by then); one chip per category, with scroll-spy marking the one being read;
  and, only while hearts are ticked, the selection controls — "Hent skabeloner
  (n)" with its PDF-layout menu as one split button, then select all / select
  none. Ticking is the exception (docs/redesign/FRONT-SIMPLIFY.md — a card
  click opens the heart's page), so a visitor who never ticks anything never
  sees a disabled download button asking them to. The bar only reports what
  was clicked; the selection itself and the PDF generation stay on the page.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Language } from '$lib/i18n';
	import { href } from '$lib/i18n/routes';
	import { categoryTitle, MY_HEARTS_CATEGORY_ID } from '$lib/data/categories';
	import { activeSection, ANCHOR_GAP, isAtPageBottom } from '$lib/front/scrollSpy';
	import { DownloadIcon, GearIcon } from '$lib/components/icons';
	import type { LayoutMode } from '$lib/pdf/template';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	/** The three A4 layouts the PDF menu offers, in menu order. */
	const LAYOUT_OPTIONS: {
		value: LayoutMode;
		labelKey: 'layoutSmall' | 'layoutMedium' | 'layoutLarge';
	}[] = [
		{ value: 'small', labelKey: 'layoutSmall' },
		{ value: 'medium', labelKey: 'layoutMedium' },
		{ value: 'large', labelKey: 'layoutLarge' }
	];

	interface Props {
		lang: Language;
		/** The gallery's categories, in gallery order, with their heart counts. */
		categories: { id: string; count: number }[];
		/** How many hearts the visitor has drawn ("Mine hjerter"). */
		myHeartCount: number;
		/** Hearts currently ticked; shown in the button's badge. */
		selectedCount: number;
		/** A PDF is being built, so every control is inert. */
		generating: boolean;
		/** Every heart on the page is already ticked. */
		allSelected: boolean;
		/** The chosen A4 layout; bound so the page can pass it to the PDF. */
		pdfLayout: LayoutMode;
		/**
		 * The bar's height in px, bound by the gallery for the sections'
		 * `scroll-margin-top`: a chip's anchor has to land under the bar, and the
		 * bar is taller while the selection controls show (two rows on a phone).
		 */
		height?: number;
		onPrint: () => void;
		onSelectAll: () => void;
		onSelectNone: () => void;
	}

	let {
		lang,
		categories,
		myHeartCount,
		selectedCount,
		generating,
		allSelected,
		pdfLayout = $bindable(),
		height = $bindable(0),
		onPrint,
		onSelectAll,
		onSelectNone
	}: Props = $props();

	let hasSelection = $derived(selectedCount > 0);

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
	// sticks, which a 1px sentinel just above it detects: the sentinel leaves the
	// viewport at the same moment the bar reaches top: 0.
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
		let frame = 0;
		const measure = () => {
			frame = 0;
			const box = bar.getBoundingClientRect();
			// Until the bar sticks the visitor is still above the gallery, on the
			// hero — even though the first row already sits right under the bar,
			// exactly ANCHOR_GAP below it, and the rule alone would light its chip.
			if (box.top > 1) {
				activeIndex = -1;
				return;
			}
			const line = box.bottom + ANCHOR_GAP;
			const tops = ids.map(
				(id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity
			);
			const root = document.documentElement;
			activeIndex = activeSection(
				tops,
				line,
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
		const chip = row.children[index];
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

<div class="bar-sentinel" bind:this={sentinel} aria-hidden="true"></div>
<div class="gallery-bar" class:stuck bind:this={barEl} bind:offsetHeight={height}>
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

	<nav class="chips" aria-label={t('galleryCategories', lang)} bind:this={chipRow}>
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

	{#if hasSelection}
		<div class="selection">
			<span class="split">
				<button
					type="button"
					class="btn btn-primary split-main"
					onclick={onPrint}
					disabled={generating}
				>
					<DownloadIcon size={18} />
					{generating ? t('generating', lang) : t('printSelected', lang)}
					{#if !generating}
						<span class="split-count">{selectedCount}</span>
					{/if}
				</button>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="btn btn-primary btn-icon split-gear"
								aria-label={t('pdfSettings', lang)}
								title={t('pdfLayout', lang)}
							>
								<GearIcon size={18} />
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="border-0">
						<DropdownMenu.RadioGroup bind:value={pdfLayout}>
							{#each LAYOUT_OPTIONS as option (option.value)}
								<DropdownMenu.RadioItem value={option.value}>
									{t(option.labelKey, lang)}
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</span>

			{#if !allSelected}
				<button type="button" class="btn btn-ghost" onclick={onSelectAll} disabled={generating}>
					{t('selectAll', lang)}
				</button>
			{/if}
			<button type="button" class="btn btn-ghost" onclick={onSelectNone} disabled={generating}>
				{t('selectNone', lang)}
			</button>
		</div>
	{/if}
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

	.selection {
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
	}

	/* "Hent skabeloner (n)" and its PDF settings gear are two .btn-primary halves
	   butted together; all that is left here is the shared corner radii, the
	   square gear and the divider between them. */
	.split {
		display: inline-flex;
		border-radius: 10px;
		box-shadow: 0 2px 8px rgb(var(--deep-rgb) / 0.12);
	}

	/* No border: .btn-primary's 1px would push the label a pixel inwards and add
	   a second edge next to the divider. */
	.split-main,
	.split-gear {
		border: none;
	}

	.split-main {
		padding: 0 18px;
		border-radius: 10px 0 0 10px;
	}

	.split-gear {
		border-radius: 0 10px 10px 0;
		border-left: 1px solid rgb(255 255 255 / 0.35);
	}

	/* Dimmed while the PDF is being built, but the red still has to read as the
	   bar's anchor — .btn's own 0.5 would wash it out. */
	.split-main:disabled {
		opacity: 0.75;
	}

	.split-count {
		padding: 1px 9px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.22);
		font-size: 13px;
	}

	/* A phone has no room for the controls beside the chips, so they take a
	   second row of their own, still under the sticky background. */
	@media (max-width: 699px) {
		.gallery-bar {
			flex-wrap: wrap;
			gap: 8px;
			padding: 8px 0;
		}

		.wordmark {
			font-size: 16px;
		}

		.selection {
			flex-basis: 100%;
			gap: 8px;
		}
	}
</style>
