/**
 * Back closes an overlay.
 *
 * On a phone, Back is how one leaves a full-screen overlay. Without a history
 * entry of its own the overlay is not "a place" and Back leaves the page from
 * under it. So an overlay that opens pushes one shallow entry (SvelteKit's
 * `pushState`, same URL, `{ overlay: id }`):
 *
 *   * Back pops that entry, and the popstate closes the overlay. If the overlay
 *     refuses (tracing mode while the screen is locked) the entry is pushed
 *     again, so the overlay stays and keeps its entry.
 *   * Closing it any other way (✕, Escape, the scrim) takes the entry back off
 *     with `history.go(-n)`, but only while the entry on top is still one of
 *     ours: after a navigation, or a reload that left a stale entry behind, it
 *     just forgets it. A stale entry found on load is never read, so a reload
 *     with that state simply shows the page with nothing open.
 *   * The going-back waits a task. An overlay that closes while another opens
 *     in the same tick (an import dialog handing over to its confirmation)
 *     hands its entry on instead of a back and a push racing each other.
 *
 * Anything that navigates right after closing an overlay awaits
 * `settleOverlayHistory()` first, so its push does not land before our back.
 */
import { pushState } from '$app/navigation';

const STATES_KEY = 'sveltekit:states';

interface Entry {
	id: string;
	/** Called on Back; returns whether the overlay did close. */
	onBack: () => boolean;
}

const stack: Entry[] = [];
/** Entries released by a close and not yet taken off the history. */
let released = 0;
/** Pops we caused ourselves, which are not a visitor's Back. */
let expectedPops = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
let waiters: (() => void)[] = [];

function ourEntryOnTop(): boolean {
	const state = (history.state as Record<string, unknown> | null)?.[STATES_KEY] as
		| { overlay?: unknown }
		| undefined;
	return typeof state?.overlay === 'string';
}

function push(id: string): void {
	try {
		pushState('', { overlay: id });
	} catch {
		// The router is not up yet (a click before hydration); the overlay
		// still works, Back just does not close it.
	}
}

function settled(): boolean {
	return released === 0 && expectedPops === 0;
}

function wake(): void {
	if (!settled()) return;
	const ready = waiters;
	waiters = [];
	for (const resolve of ready) resolve();
}

function onPopState(): void {
	if (expectedPops > 0) {
		expectedPops -= 1;
		wake();
		return;
	}
	const top = stack.pop();
	if (!top) return;
	if (!top.onBack()) {
		stack.push(top);
		push(top.id);
	}
}

function flushReleased(): void {
	releaseTimer = undefined;
	const n = released;
	released = 0;
	if (n > 0 && ourEntryOnTop()) {
		expectedPops += 1;
		history.go(-n);
	}
	wake();
}

/**
 * Give an open overlay a history entry. `onBack` closes it and says whether it
 * did. Returns the function to call when it closes some other way (it is a
 * no-op once Back has closed it, and safe to call twice).
 */
export function openOverlay(id: string, onBack: () => boolean): () => void {
	if (typeof window === 'undefined') return () => {};
	if (!listening) {
		window.addEventListener('popstate', onPopState);
		listening = true;
	}
	const entry: Entry = { id, onBack };
	if (released > 0) released -= 1; // take over the entry just released
	else push(id);
	stack.push(entry);
	return () => {
		const i = stack.indexOf(entry);
		if (i < 0) return;
		stack.splice(i, 1);
		released += 1;
		if (releaseTimer === undefined) releaseTimer = setTimeout(flushReleased, 0);
	};
}

/** Resolves once any back we owe the history has been taken. */
export function settleOverlayHistory(): Promise<void> {
	if (typeof window === 'undefined' || settled()) return Promise.resolve();
	return new Promise((resolve) => {
		waiters.push(resolve);
		// A pop that never comes must not hold a navigation up for good.
		setTimeout(() => {
			waiters = waiters.filter((w) => w !== resolve);
			resolve();
		}, 500);
	});
}

/** For tests: forget everything. */
export function resetOverlayHistory(): void {
	stack.length = 0;
	released = 0;
	expectedPops = 0;
	if (releaseTimer !== undefined) clearTimeout(releaseTimer);
	releaseTimer = undefined;
	waiters = [];
}
