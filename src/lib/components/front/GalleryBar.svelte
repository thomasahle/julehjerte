<!--
  The gallery's sticky toolbar — docs/redesign/DESIGN.md §3 "Gallery".

  The three-step strip on the right, always. Once a heart is ticked, the
  selection controls join it on the left: "Hent skabeloner (n)" with its
  PDF-layout menu as one split button, then select all / select none. Ticking
  is the exception (docs/redesign/FRONT-SIMPLIFY.md — a card click opens the
  heart's page), so a visitor who never ticks anything never sees a disabled
  download button asking them to. It only reports what was clicked; the
  selection itself and the PDF generation stay on the page.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t, type Language } from '$lib/i18n';
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
		/** Hearts currently ticked; shown in the button's badge. */
		selectedCount: number;
		/** A PDF is being built, so every control is inert. */
		generating: boolean;
		/** Every heart on the page is already ticked. */
		allSelected: boolean;
		/** The chosen A4 layout; bound so the page can pass it to the PDF. */
		pdfLayout: LayoutMode;
		onPrint: () => void;
		onSelectAll: () => void;
		onSelectNone: () => void;
	}

	let {
		lang,
		selectedCount,
		generating,
		allSelected,
		pdfLayout = $bindable(),
		onPrint,
		onSelectAll,
		onSelectNone
	}: Props = $props();

	let hasSelection = $derived(selectedCount > 0);

	// The toolbar starts up on the hero's snow (Gallery.svelte pulls the gallery
	// over the drawing), where an opaque background would show as a paler
	// rectangle over the snow hill. So it is transparent until it actually
	// sticks, which a 1px sentinel just above it detects: the sentinel leaves the
	// viewport at the same moment the toolbar reaches top: 0.
	let sentinel = $state.raw<HTMLElement | null>(null);
	let stuck = $state(false);

	onMount(() => {
		if (!browser || !sentinel) return;
		const observer = new IntersectionObserver(([entry]) => {
			stuck = !entry.isIntersecting && entry.boundingClientRect.top < 0;
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<div class="toolbar-sentinel" bind:this={sentinel} aria-hidden="true"></div>
<div class="toolbar" class:stuck class:idle={!hasSelection}>
	{#if hasSelection}
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
	{/if}

</div>

<style>
	.toolbar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		background: transparent;
	}

	.toolbar.stuck {
		background: var(--page);
	}

	.toolbar-sentinel {
		height: 1px;
		margin-top: -1px;
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
	   toolbar's anchor — .btn's own 0.5 would wash it out. */
	.split-main:disabled {
		opacity: 0.75;
	}

	.split-count {
		padding: 1px 9px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.22);
		font-size: 13px;
	}

	/* With nothing ticked there is nothing to show, and an empty sticky bar
	   would still be a strip of --page sliding over the hearts. */
	.toolbar.idle {
		display: none;
	}

	@media (max-width: 699px) {
		.toolbar {
			gap: 8px;
			padding: 10px 0;
		}
	}
</style>
