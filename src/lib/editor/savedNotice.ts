/**
 * The heart "Gem" just put in "Mine hjerter", for the page "Gem" goes to — the
 * front page at the heart's card, or the heart's own page — to say so on arrival
 * (`SavedToast`), so that saving does not pass in silence. Kept in the module,
 * which a client-side navigation keeps, and read once.
 */

let saved: { name: string } | null = null;

/** "Gem" saved the heart named `name`: the next page says so. */
export function noteSaved(name: string): void {
	saved = { name };
}

/** The heart "Gem" just saved, once; null when there is none to tell. */
export function takeSaved(): { name: string } | null {
	const heart = saved;
	saved = null;
	return heart;
}
