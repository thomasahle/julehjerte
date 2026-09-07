<!--
  The row of buttons under the detail page's info panel — docs/redesign/DESIGN.md
  §4: download the PDF template, open the heart in the editor, share it, and for a
  heart someone sent by link, save it to "Mine hjerter".

  The note underneath reports how the last save or share went.
-->
<script lang="ts">
	import { DownloadIcon, PencilIcon, ShareIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';

	interface Props {
		lang: Language;
		/** Null until the design has loaded; the PDF button waits for it. */
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
		onSaveShared
	}: Props = $props();
</script>

<div class="actions">
	{#if isShared && hasDesign}
		{#if savedShared}
			<a class="btn btn-dark" href={galleryHref}>{t('showInGallery', lang)}</a>
		{:else}
			<button class="btn btn-dark" type="button" onclick={onSaveShared}>
				{t('saveToMyHearts', lang)}
			</button>
		{/if}
	{/if}
	<button class="btn btn-primary" type="button" onclick={onDownload} disabled={!hasDesign}>
		<DownloadIcon size={18} />
		{t('downloadPdfTemplate', lang)}
	</button>
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

{#if isShared && savedShared}
	<p class="save-note" role="status">{t('savedToMyHearts', lang)}</p>
{:else if errorNote}
	<p class="save-note save-error" role="alert">{errorNote}</p>
{/if}

<style>
	/* The gap to whatever sits above is the parent column's, not ours. */
	.actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
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
