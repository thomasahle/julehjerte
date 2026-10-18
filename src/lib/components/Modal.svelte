<!--
  The site's modal dialog: a scrim, a white card, and the keyboard behaviour a
  dialog with `aria-modal` has to have.

  The front page's delete confirmation and the editor's help dialog each
  hand-rolled this — the same eleven overlay declarations, the same
  overlay-click / Escape / stopPropagation plumbing, and two different tab
  traps. Both now render through here, so the box and its behaviour are one
  thing.

  What it owns:
    * the scrim and the card, at one radius, padding and shadow (`width` and
      `maxHeight` are the only per-dialog geometry);
    * Escape and a click on the scrim, both closing — Escape also when focus
      has fallen out of the dialog onto the page (a button that disables
      itself while it works drops focus to <body>);
    * Tab kept inside the dialog while it is open;
    * the page behind the scrim held still while it is open;
    * focus moved in on open — to `initialFocus` if the caller gives one,
      otherwise to the dialog itself;
    * a history entry while it is open, so the phone's Back closes it
      (utils/overlayHistory.ts; `closeOnBack={false}` opts out).

  What it leaves to the caller: returning focus to whatever opened the dialog,
  because only the caller knows whether that element still exists (the front
  page's delete button does not: the card is gone).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick, untrack } from 'svelte';
	import { focusableIn, trapTab } from '$lib/utils/focusTrap';
	import { openOverlay } from '$lib/utils/overlayHistory';

	interface Props {
		open: boolean;
		/** id of the heading inside `children` that names the dialog. */
		labelledBy: string;
		/** CSS width of the card. */
		width?: string;
		/** CSS max-height of the card. */
		maxHeight?: string;
		/**
		 * Lay the card out as a column, for a dialog with a fixed header whose
		 * body scrolls. Off by default: in a plain block the content's margins
		 * collapse the way ordinary prose expects.
		 */
		column?: boolean;
		/** Focused when the dialog opens; the dialog itself if not given. */
		initialFocus?: HTMLElement | null;
		/** Give the open dialog a history entry, so Back closes it. */
		closeOnBack?: boolean;
		onClose: () => void;
		children: Snippet;
	}

	let {
		open,
		labelledBy,
		width = 'min(520px, 100%)',
		maxHeight = '90vh',
		column = false,
		initialFocus = null,
		closeOnBack = true,
		onClose,
		children
	}: Props = $props();

	let dialogEl = $state.raw<HTMLDivElement | null>(null);

	$effect(() => {
		if (!open) return;
		tick().then(() => (initialFocus ?? dialogEl)?.focus());
	});

	// Back closes the dialog. The entry is taken off again when the dialog
	// closes any other way; `open` is read after onClose so a dialog that
	// declines to close (busy) keeps its entry.
	$effect(() => {
		if (!open || !closeOnBack) return;
		return untrack(() =>
			openOverlay(labelledBy, () => {
				onClose();
				return !open;
			})
		);
	});

	let overlayEl = $state.raw<HTMLDivElement | null>(null);

	// Keys that reach the window from outside the dialog. Focus can land on
	// <body> while the dialog is open — Chromium drops it there when the focused
	// button becomes disabled — and the dialog's own handler then hears nothing:
	// Escape would not close it and Tab would walk the page behind the scrim.
	// Keys from inside the dialog are its own handler's (it stops them), so this
	// only ever sees the stray ones.
	function onWindowKeydown(e: KeyboardEvent): void {
		if (!open || !dialogEl) return;
		const target = e.target;
		if (target instanceof Node && overlayEl?.contains(target)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		} else if (e.key === 'Tab') {
			e.preventDefault();
			const items = focusableIn(dialogEl);
			const next = e.shiftKey ? items[items.length - 1] : items[0];
			(next ?? dialogEl).focus();
		}
	}

	// A dialog that declares aria-modal has to *be* modal: without this the page
	// behind the scrim still scrolls on a wheel or trackpad gesture and slides
	// away under a dialog that stays put. The scrollbar's width is handed back as
	// padding so hiding it does not shift the page sideways.
	$effect(() => {
		if (!open) return;
		const body = document.body;
		const previousOverflow = body.style.overflow;
		const previousPadding = body.style.paddingRight;
		const scrollbar = window.innerWidth - document.documentElement.clientWidth;
		body.style.overflow = 'hidden';
		if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
		return () => {
			body.style.overflow = previousOverflow;
			body.style.paddingRight = previousPadding;
		};
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div
		bind:this={overlayEl}
		class="modal-overlay"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="presentation"
	>
		<div
			bind:this={dialogEl}
			class="modal"
			class:column
			style:--modal-width={width}
			style:--modal-max-height={maxHeight}
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby={labelledBy}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				// Escape first: stopPropagation would otherwise swallow it before the
				// overlay's handler ever sees it.
				if (e.key === 'Escape') onClose();
				else trapTab(e, dialogEl);
				e.stopPropagation();
			}}
		>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		/* Above everything: the nav is 30 and the editor's floating panel is 30. */
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--scrim);
	}

	.modal {
		width: var(--modal-width);
		max-height: var(--modal-max-height);
		overflow: auto;
		padding: 24px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--white);
		box-shadow: var(--shadow-modal);
		box-sizing: border-box;
	}

	.modal.column {
		display: flex;
		flex-direction: column;
	}
</style>
