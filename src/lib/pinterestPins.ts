/**
 * A gallery heart's Pin on Pinterest, where visitors can comment on it.
 *
 * Pinterest makes one Pin per heart from our feed ($lib/pinterest); which Pin that became is
 * read back from the board by scripts/pinterest-pins.mjs into pinterest-pins.json. A heart
 * that is not out yet, or not read back yet, has none.
 */
import pins from '$lib/data/pinterest-pins.json';
import { ALL_HEART_IDS } from '$lib/data/categories';

const PINS = pins as Record<string, string>;

/** The address of the heart's Pin, or null. Only for hearts in the gallery. */
export function pinterestPinUrl(id: string): string | null {
	const pin = PINS[id];
	return pin && ALL_HEART_IDS.includes(id) ? `https://www.pinterest.com/pin/${pin}/` : null;
}
