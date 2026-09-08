<!--
  Importér billede — the placeholder.

  The real dialog (docs/redesign/PAINT.md §2) is its own lane: a drop zone, the
  four corners the engine proposes and the visitor may drag, a colour
  interpretation control and a live preview of the mask as a heart. This is the
  interface it has to land on, and enough behind it that the page works end to
  end: pick a file, treat the whole square as the woven part, use the result.

  The contract, which the real dialog must keep:

      <ImportImageDialog {open} {onClose} onUse={(mask, found) => …} {lang} />

  `onUse` hands over a finished 400 × 400 mask and the symmetries detected in it,
  which is exactly what `setMask` takes. The dialog owns the engine call, so the
  page never sees a half-imported picture.
-->
<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { CloseIcon } from '$lib/components/icons';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import { getColors } from '$lib/stores/colors';
	import { prepareImage } from '$lib/inverse/engine';
	import { decodeImageFile, ImportImageError, maskFromPrepared } from '$lib/paint/importImage';
	import { detectSymmetry, type SymmetrySettings } from '$lib/paint/symmetry';
	import type { Mask } from '$lib/paint/mask';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** The finished mask, and the symmetries found in it. */
		onUse: (mask: Mask, found: SymmetrySettings) => void;
		lang: Language;
	}

	let { open, onClose, onUse, lang }: Props = $props();

	const tr = (key: TranslationKey) => t(key, lang);

	let busy = $state(false);
	let errorKey = $state<TranslationKey | null>(null);

	async function choose(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || busy) return;
		busy = true;
		errorKey = null;
		try {
			const pixels = await decodeImageFile(file);
			// No quad: the whole picture is taken as the woven square, which is what
			// the corner step will refine.
			const prepared = await prepareImage(pixels, { colors: getColors() });
			const mask = maskFromPrepared(prepared);
			onUse(mask, detectSymmetry(mask));
			onClose();
		} catch (err) {
			console.error('Importing the picture failed', err);
			errorKey = err instanceof ImportImageError ? err.key : 'paintImportFailed';
		} finally {
			busy = false;
		}
	}
</script>

<Modal {open} labelledBy="paint-import-title" width="min(560px, 100%)" column {onClose}>
	<div class="header">
		<h2 id="paint-import-title">{tr('paintImportTitle')}</h2>
		<button
			type="button"
			class="btn btn-sm btn-ghost btn-icon"
			onclick={onClose}
			aria-label={tr('paintImportClose')}
		>
			<CloseIcon size={20} />
		</button>
	</div>

	<p class="lead">{tr('paintDrop')}</p>
	<p class="formats">{tr('paintFormats')}</p>

	{#if errorKey}
		<p class="alert" role="alert">{tr(errorKey)}</p>
	{/if}

	<label class="picker">
		<input type="file" accept="image/png,image/jpeg,image/webp" onchange={choose} disabled={busy} />
		<span class="btn btn-primary">{busy ? tr('paintImportWorking') : tr('paintChooseFile')}</span>
	</label>
</Modal>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 16px;
	}

	.header h2 {
		margin: 0;
		font-size: 22px;
		color: var(--deep);
	}

	.lead {
		margin: 0 0 6px;
		color: var(--ink);
		line-height: 1.5;
	}

	.formats {
		margin: 0 0 16px;
		font-size: 13px;
		color: var(--muted);
	}

	.alert {
		margin: 0 0 16px;
		padding: 8px 10px;
		border: 1px solid var(--alert-border);
		border-radius: 8px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-size: 13px;
	}

	.picker input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	/* The label is the button: a file input cannot be styled, and wrapping it
	   keeps the keyboard behaviour the input already has. */
	.picker:focus-within .btn {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}
</style>
