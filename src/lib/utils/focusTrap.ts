/**
 * Tab kept inside a dialog that declares `aria-modal`.
 *
 * Shared by Modal.svelte and the tracing mode (TraceMode.svelte), which is a
 * full-screen dialog of its own rather than a card on a scrim.
 */

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Call from the dialog's keydown handler; anything but Tab is left alone. */
export function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
	if (event.key !== 'Tab' || !container) return;
	const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
	if (items.length === 0) {
		event.preventDefault();
		container.focus();
		return;
	}
	const first = items[0];
	const last = items[items.length - 1];
	const active = document.activeElement;
	if (event.shiftKey && (active === first || active === container)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && active === last) {
		event.preventDefault();
		first.focus();
	}
}
