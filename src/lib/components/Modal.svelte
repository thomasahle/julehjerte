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
    * Escape and a click on the scrim, both closing;
    * Tab kept inside the dialog while it is open;
    * focus moved in on open — to `initialFocus` if the caller gives one,
      otherwise to the dialog itself.

  What it leaves to the caller: returning focus to whatever opened the dialog,
  because only the caller knows whether that element still exists (the front
  page's delete button does not: the card is gone).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';

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
		onClose,
		children
	}: Props = $props();

	let dialogEl = $state.raw<HTMLDivElement | null>(null);

	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	$effect(() => {
		if (!open) return;
		tick().then(() => (initialFocus ?? dialogEl)?.focus());
	});

	/** Keep Tab inside the dialog while it is open. */
	function trapTab(event: KeyboardEvent): void {
		if (event.key !== 'Tab' || !dialogEl) return;
		const items = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
		if (items.length === 0) {
			event.preventDefault();
			dialogEl.focus();
			return;
		}
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && (active === first || active === dialogEl)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

{#if open}
	<div
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
				else trapTab(e);
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
