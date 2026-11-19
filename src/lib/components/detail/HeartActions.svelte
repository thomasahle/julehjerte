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
		/** The heart's Pin on Pinterest, where it can be commented on; null for a heart without one. */
		pinHref?: string | null;
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
		pinHref = null,
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
     names as tooltips and for screen readers, so the four fit on one line (five with the
     link to the heart's Pin). -->
<div class="actions" class:has-pin={!!pinHref}>
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
		class="btn btn-primary get"
		type="button"
		onclick={onDownload}
		disabled={!hasDesign || !hydrated}
		title={waitTitle}
	>
		<DownloadIcon size={18} />
		{t('getTemplate', lang)}
	</button>
	<button
		class="btn btn-outline trace"
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
	{#if pinHref}
		<!-- The heart's Pin: the place to leave a comment on it. -->
		<a
			class="btn btn-ghost btn-icon"
			href={pinHref}
			target="_blank"
			rel="noopener"
			title={t('commentOnPinterest', lang)}
			aria-label={t('commentOnPinterest', lang)}
		>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
				<path
					d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.62 11.17-.1-.95-.2-2.4.04-3.44.22-.94 1.4-5.96 1.4-5.96s-.35-.72-.35-1.78c0-1.66.97-2.9 2.17-2.9 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.2.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.2 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34-.09.38-.3 1.2-.34 1.36-.05.22-.17.27-.4.16-1.5-.7-2.43-2.88-2.43-4.64 0-3.77 2.74-7.24 7.9-7.24 4.15 0 7.38 2.96 7.38 6.91 0 4.12-2.6 7.44-6.21 7.44-1.21 0-2.35-.63-2.74-1.37l-.75 2.84c-.27 1.04-1 2.35-1.49 3.14C9.57 23.81 10.76 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z"
				/>
			</svg>
		</a>
	{/if}
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

		/* On a phone the red button is "Tegn af": few phones have a printer at
		   hand, and tracing from the screen is the way that needs none. */
		.actions .trace {
			background: var(--red);
			border-color: var(--red);
			color: var(--white);
		}

		.actions .trace:hover:not(:disabled) {
			background: var(--red-hover);
			border-color: var(--red-hover);
			color: var(--white);
		}

		.actions .get {
			background: var(--white);
			border: 1.5px solid var(--green);
			color: var(--green);
		}

		.actions .get:hover:not(:disabled) {
			background: var(--cream2);
			color: var(--green);
		}

		/* A fifth button, the heart's Pin: the labelled two give up their icons
		   so the row is still one line on a 390px phone. */
		.actions.has-pin .btn:not(.btn-icon) :global(svg) {
			display: none;
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
