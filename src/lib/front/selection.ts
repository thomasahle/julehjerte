/**
 * The front page mirrors which hearts are ticked into `?selected=` so a
 * selection can be linked or reloaded (docs/redesign/DESIGN.md §3).
 *
 * Pure string and Set work, kept out of the route so it can be tested: the
 * route is left with the `goto()` call around it.
 *
 * Two rules the tests pin down. A cleared selection removes the parameter
 * rather than writing an empty one, and every function returns a *new* Set —
 * the page swaps the value to make Svelte re-render, and never mutates in
 * place.
 */

/** Ids in `?selected=a,b,c`. Empty for a missing, empty or malformed value. */
export function parseSelected(search: string): Set<string> {
	const raw = new URLSearchParams(search).get('selected');
	if (!raw) return new Set();
	return new Set(raw.split(',').filter(Boolean));
}

/** `selected` with `id` added if it was absent, removed if it was present. */
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
	const next = new Set(selected);
	if (!next.delete(id)) next.add(id);
	return next;
}

/**
 * `search` with `selected` set to `ids` — the query string including its `?`,
 * or '' when nothing is left. Other parameters are kept, in their own order.
 */
export function selectionSearch(search: URLSearchParams, ids: ReadonlySet<string>): string {
	const next = new URLSearchParams(search);
	if (ids.size > 0) {
		next.set('selected', [...ids].join(','));
	} else {
		next.delete('selected');
	}
	const query = next.toString();
	return query ? `?${query}` : '';
}
