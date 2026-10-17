<!--
  The row of buttons under the detail page's info panel — docs/redesign/DESIGN.md
  §4: download the PDF template (or, from its caret, a laser-cutter file —
  docs/redesign/LASER.md), open the heart in the editor, share it, trace it
  from the screen (docs/redesign/TRACE.md), and for a heart someone sent by link,
  save it to "Mine hjerter".

  The note underneath reports how the last save or share went.
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		DownloadIcon,
		PencilIcon,
		ShareIcon,
		TabletIcon
	} from '$lib/components/icons';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { t, type Language } from '$lib/i18n';

	interface Props {
		lang: Language;
		/** False until the design has loaded; the PDF and tracing buttons wait for it. */
		hasDesign: boolean;
		/** Link target for "Rediger i editor". */
		editHref: string;
		/** A heart someone sent by link, which can be saved to this browser. */
		isShared?: boolean;
		savedShared?: boolean;
		/** Message from a failed save or a failed PDF; shown in red. */
		errorNote?: string | null;
		/** Where "Vis i galleriet" goes once a shared heart has been saved. */
		galleryHref?: string;
		shareStatus: 'idle' | 'copied' | 'error';
		onDownload: () => void;
		onEdit: () => void;
		onShare: () => void;
		onSaveShared: () => void;
		onTrace: () => void;
		/**
		 * "Til laserskærer…" in the download button's menu. Hands over the caret,
		 * which is where focus goes back to when the dialog closes: the menu item
		 * that was clicked is gone by then.
		 */
		onLaser: (opener: HTMLElement | null) => void;
	}

	let {
		lang,
		hasDesign,
		editHref,
		isShared = false,
		savedShared = false,
		errorNote = null,
		galleryHref = '',
		shareStatus,
		onDownload,
		onEdit,
		onShare,
		onSaveShared,
		onTrace,
		onLaser
	}: Props = $props();

	let caret = $state.raw<HTMLElement | null>(null);

	// The menu puts focus back on its caret as it closes, which would pull it out
	// of the dialog the laser item has just opened; the dialog takes it instead.
	let openingDialog = false;

	function chooseLaser(): void {
		openingDialog = true;
		onLaser(caret);
	}
</script>

<!-- Two rows: first the two ways to get the template (print it, or trace it
     from the screen), then what else can be done with the heart. -->
<div class="actions">
	<div class="actions-row">
		{#if isShared && hasDesign}
			{#if savedShared}
				<a class="btn btn-dark" href={galleryHref}>{t('showInGallery', lang)}</a>
			{:else}
				<button class="btn btn-dark" type="button" onclick={onSaveShared}>
					{t('saveToMyHearts', lang)}
				</button>
			{/if}
		{/if}
		<!-- One split button, as the gallery toolbar's: a click on the label
		     still downloads the PDF, the caret offers the other files. -->
		<span class="split">
			<button class="btn btn-primary split-main" type="button" onclick={onDownload} disabled={!hasDesign}>
				<DownloadIcon size={18} />
				{t('downloadPdfTemplate', lang)}
			</button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger bind:ref={caret} disabled={!hasDesign}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="btn btn-primary btn-icon split-caret"
							aria-label={t('moreDownloadOptions', lang)}
						>
							<ChevronDownIcon size={18} />
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					align="end"
					class="border-0"
					onCloseAutoFocus={(e) => {
						if (openingDialog) e.preventDefault();
						openingDialog = false;
					}}
				>
					<DropdownMenu.Item onSelect={onDownload}>{t('pdfForPrinting', lang)}</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={chooseLaser}>{t('laserMenuItem', lang)}</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</span>
		<button class="btn btn-outline" type="button" onclick={onTrace} disabled={!hasDesign}>
			<TabletIcon size={18} />
			{t('traceFromScreen', lang)}
		</button>
	</div>
	<div class="actions-row">
		<a class="btn btn-outline" href={editHref} onclick={onEdit}>
			<PencilIcon size={18} />
			{t('openInEditor', lang)}
		</a>
		<button class="btn btn-ghost" type="button" onclick={onShare} aria-label={t('share', lang)}>
			{#if shareStatus === 'copied'}
				{t('copied', lang)}
			{:else if shareStatus === 'error'}
				{t('failed', lang)}
			{:else}
				<ShareIcon size={18} />
				{t('share', lang)}
			{/if}
		</button>
	</div>
</div>

{#if isShared && savedShared}
	<p class="save-note" role="status">{t('savedToMyHearts', lang)}</p>
{:else if errorNote}
	<p class="save-note save-error" role="alert">{errorNote}</p>
{/if}

<style>
	/* The gap to whatever sits above is the parent column's, not ours. */
	.actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.actions-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	/* Under the panel the row crosses the landscape drawing, and a fully
	   transparent ghost button lost its label wherever a dark fir came through.
	   The same translucent white the thumbnails' captions wear keeps it readable
	   without turning it into a second outline button. */
	.actions .btn-ghost {
		background: rgb(255 255 255 / 0.8);
	}

	.actions .btn-ghost:hover {
		background: var(--cream2);
	}

	/* "Download PDF-skabelon" and its caret: two .btn-primary halves butted
	   together, with the gallery bar's radii and divider (GalleryBar.svelte). */
	.split {
		display: inline-flex;
		border-radius: 10px;
	}

	.split-main,
	.split-caret {
		border: none;
	}

	.split-main {
		border-radius: 10px 0 0 10px;
	}

	.split-caret {
		border-radius: 0 10px 10px 0;
		border-left: 1px solid rgb(255 255 255 / 0.35);
	}

	.save-note {
		margin: 0;
		color: var(--green);
		font-size: 14px;
	}

	.save-error {
		color: var(--red);
	}
</style>
