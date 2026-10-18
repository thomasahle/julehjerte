<!--
  The row of buttons under the detail page's info panel — docs/redesign/DESIGN.md
  §4: get the template (the "Hent skabelon" dialog, for the printer PDF or a
  laser-cutter file — docs/redesign/DOWNLOAD.md), trace it from the screen
  (docs/redesign/TRACE.md), open the heart in the editor, share it, and for a
  heart someone sent by link, save it to "Mine hjerter".

  The note underneath reports how the last save or share went.
-->
<script lang="ts">
	import { CheckIcon, CloseIcon, DownloadIcon, PencilIcon, ShareIcon, TabletIcon } from '$lib/components/icons';
	import { onMount } from 'svelte';
	import { t, type Language } from '$lib/i18n';

	interface Props {
		lang: Language;
		/** False until the design has loaded; the download and tracing buttons wait for it. */
		hasDesign: boolean;
		/** Link target for "Rediger i editor". */
		editHref: string;
		/** A heart someone sent by link, which can be saved to this browser. */
		isShared?: boolean;
		savedShared?: boolean;
		/** Message from a failed save; shown in red. */
		errorNote?: string | null;
		/** Where "Vis i galleriet" goes once a shared heart has been saved. */
		galleryHref?: string;
		shareStatus: 'idle' | 'copied' | 'error';
		/** Opens the "Hent skabelon" dialog. */
		onDownload: (event: MouseEvent) => void;
		onEdit: () => void;
		onShare: () => void;
		onSaveShared: () => void;
		/** Gets the click, so the page knows which button to return focus to. */
		onTrace: (event: MouseEvent) => void;
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
		onTrace
	}: Props = $props();

	// Both buttons open something the page's script draws (the dialog, the
	// tracing view), so in the prerendered HTML, and for a visitor without
	// JavaScript, they are disabled with a short reason rather than enabled
	// and dead. Hydration renders the same, then this turns them on.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});
	let waitTitle = $derived(hydrated ? undefined : t('needsJavaScript', lang));
</script>

<!-- One row: the two ways to get the template (download it, or trace it from
     the screen) carry labels; editing and sharing are glyph-only, with their
     names as tooltips and for screen readers, so the four fit on one line. -->
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
	<button
		class="btn btn-primary"
		type="button"
		onclick={onDownload}
		disabled={!hasDesign || !hydrated}
		title={waitTitle}
	>
		<DownloadIcon size={18} />
		{t('getTemplate', lang)}
	</button>
	<button
		class="btn btn-outline"
		type="button"
		onclick={onTrace}
		disabled={!hasDesign || !hydrated}
		title={waitTitle}
	>
		<TabletIcon size={18} />
		{t('traceFromScreen', lang)}
	</button>
	<a
		class="btn btn-outline btn-icon"
		href={editHref}
		onclick={onEdit}
		title={t('openInEditor', lang)}
		aria-label={t('openInEditor', lang)}
	>
		<PencilIcon size={18} />
	</a>
	<button
		class="btn btn-ghost btn-icon"
		type="button"
		onclick={onShare}
		title={t('share', lang)}
		aria-label={t('share', lang)}
	>
		{#if shareStatus === 'copied'}
			<CheckIcon size={18} />
		{:else if shareStatus === 'error'}
			<CloseIcon size={18} />
		{:else}
			<ShareIcon size={18} />
		{/if}
	</button>
	<!-- The share button is a glyph, so its outcome is announced here. -->
	<span class="sr-only" role="status">
		{#if shareStatus === 'copied'}{t('copied', lang)}{:else if shareStatus === 'error'}{t('failed', lang)}{/if}
	</span>
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

	/* At 600px and up the row fits as the shared .btn draws it. Below that the
	   two labelled buttons tighten (10px padding, 6px icon gap, 14px text) and
	   the row's gap drops to 8px, so all four still sit on one line on a 390px
	   or 412px phone (348px of the 358px a 390 screen leaves). The two glyph
	   buttons keep their 44px. */
	@media (max-width: 599px) {
		.actions {
			gap: 8px;
		}

		.actions .btn:not(.btn-icon) {
			gap: 6px;
			padding: 0 10px;
			font-size: 14px;
		}
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
