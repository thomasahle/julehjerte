/**
 * The heart "Gem" just put in "Mine hjerter", said for a few seconds where the visitor is, with a
 * way to its card (`SavedToast`, in the root layout), so that saving does not pass in silence.
 */

export const savedNotice = $state<{ heart: { name: string; href: string } | null }>({ heart: null });

/** "Gem" saved the heart named `name`, whose card is at `href`: say so now. */
export function noteSaved(name: string, href: string): void {
	savedNotice.heart = { name, href };
}
