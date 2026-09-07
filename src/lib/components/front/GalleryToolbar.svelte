<!--
  The gallery's sticky toolbar — docs/redesign/DESIGN.md §3 "Gallery".

  "Hent skabeloner (n)" with its PDF-layout menu as one split button, select all
  / select none, and the three-step strip on the right. It only reports what was
  clicked; the selection itself and the PDF generation stay on the page.
-->
<script lang="ts">
	import { t, type Language } from '$lib/i18n';
	import { DownloadIcon, GearIcon } from '$lib/components/icons';
	import type { LayoutMode } from '$lib/pdf/template';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import StepsStrip from './StepsStrip.svelte';

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

	// aria-disabled rather than `disabled`: a disabled button is not focusable, so
	// the tooltip explaining why ("Vælg hjerter først") was mouse-only.
	let printDisabled = $derived(selectedCount === 0 || generating);
</script>

<div class="toolbar">
	<span class="split">
		<Tooltip.Root disabled={selectedCount > 0 || generating}>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="split-main"
						onclick={() => {
							if (!printDisabled) onPrint();
						}}
						aria-disabled={printDisabled}
						aria-describedby={printDisabled ? 'print-selected-hint' : undefined}
					>
						<DownloadIcon size={18} />
						{generating ? t('generating', lang) : t('printSelected', lang)}
						{#if !generating}
							<span class="split-count">{selectedCount}</span>
						{/if}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{t('selectHeartsFirst', lang)}</p>
			</Tooltip.Content>
		</Tooltip.Root>
		{#if printDisabled}
			<span id="print-selected-hint" class="sr-only">{t('selectHeartsFirst', lang)}</span>
		{/if}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="split-gear"
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

	<button
		type="button"
		class="btn btn-ghost"
		onclick={onSelectAll}
		disabled={allSelected || generating}
	>
		{t('selectAll', lang)}
	</button>
	<button
		type="button"
		class="btn btn-ghost"
		onclick={onSelectNone}
		disabled={selectedCount === 0 || generating}
	>
		{t('selectNone', lang)}
	</button>

	<StepsStrip {lang} />
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
		background: var(--page);
	}

	/* "Hent skabeloner (n)" and its PDF settings gear, as one red split button. */
	.split {
		display: inline-flex;
		border-radius: 10px;
		box-shadow: 0 2px 8px rgb(var(--deep-rgb) / 0.12);
	}

	.split-main,
	.split-gear {
		display: inline-flex;
		align-items: center;
		height: 44px;
		border: none;
		background: var(--red);
		color: var(--white);
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.split-main {
		gap: 8px;
		padding: 0 18px;
		border-radius: 10px 0 0 10px;
	}

	.split-gear {
		justify-content: center;
		width: 44px;
		padding: 0;
		border-radius: 0 10px 10px 0;
		border-left: 1px solid rgb(255 255 255 / 0.35);
	}

	.split-main:hover:not([aria-disabled="true"]),
	.split-gear:hover:not(:disabled) {
		background: var(--red-hover);
	}

	/* Dimmed, but the red still has to read as the toolbar's anchor. */
	.split-main[aria-disabled="true"] {
		opacity: 0.75;
		cursor: not-allowed;
	}

	.split-count {
		padding: 1px 9px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.22);
		font-size: 13px;
	}

	@media (max-width: 699px) {
		.toolbar {
			gap: 8px;
			padding: 10px 0;
		}
	}
</style>
