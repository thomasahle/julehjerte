/**
 * Has the app taken over from the prerendered HTML in this tab?
 *
 * `browser` alone cannot tell two situations apart that the front page's load
 * function has to handle differently: *hydrating* the prerendered HTML, where
 * every gallery heart is already drawn in the DOM and must not be built a
 * second time (see $lib/front/galleryHearts), and rendering the same route
 * from scratch after a client-side navigation, where none of it is in the DOM.
 *
 * Load functions run before the first render, so the flag is still false while
 * hydrating and true for every navigation after it — including a `hover`
 * preload, which is a navigation the visitor has not committed to yet.
 */
let started = false;

/** Called once from the root layout's `onMount`, i.e. after the first render. */
export function markAppStarted(): void {
	started = true;
}

export function appHasStarted(): boolean {
	return started;
}
