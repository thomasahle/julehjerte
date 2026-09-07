import type { HeartColors } from '$lib/types/heart';

/**
 * A heart's own paper colours.
 *
 * A design may carry `colors` (docs/redesign/DESIGN.md §7): the pair the visitor
 * picked in the editor, saved with the heart and carried in share links, while a
 * gallery heart carries none and follows the site-wide colour store. Everything
 * that reads a design from outside the app — the `#design=` fragment, the
 * localStorage collection, an imported SVG — runs the value through
 * `parseHeartColors`, so a hand-edited link cannot put arbitrary text into a
 * `fill` attribute.
 *
 * The on-disk form is `#rrggbb`, which is also the only form
 * `<input type="color">` accepts; `toHexColor` converts the store's legacy
 * `rgb(r, g, b)` default on the way in.
 */

/** `#rgb` or `#rrggbb` — the only colour syntax a design may carry. */
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

/** One colour as lowercase `#rrggbb`, or null if it is not a hex colour. */
export function parseHexColor(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!HEX_COLOR.test(value)) return null;
	const hex = value.slice(1).toLowerCase();
	// Expand the shorthand so a round trip through the editor is a no-op.
	return hex.length === 3 ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}` : `#${hex}`;
}

/**
 * A design's `colors` field, or undefined when it is absent or malformed —
 * in which case the heart falls back to the site-wide colours, as it always has.
 * Both lobes must be valid: half a pair would render one lobe from the design
 * and the other from the store, which is not a state the editor can produce.
 */
export function parseHeartColors(raw: unknown): HeartColors | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const { left, right } = raw as { left?: unknown; right?: unknown };
	const parsedLeft = parseHexColor(left);
	const parsedRight = parseHexColor(right);
	if (!parsedLeft || !parsedRight) return undefined;
	return { left: parsedLeft, right: parsedRight };
}

/**
 * `value` as `#rrggbb` for an `<input type="color">`, or `fallback` when it is
 * neither hex nor `rgb(r, g, b)`. The site-wide store still holds its default
 * red as `rgb(185, 19, 19)`, so both the footer's swatches and the editor's
 * colour inputs have to accept that form.
 */
export function toHexColor(value: string | undefined | null, fallback: string): string {
	if (!value) return fallback;
	const hex = parseHexColor(value);
	if (hex) return hex;
	const match = value.trim().match(RGB_COLOR);
	if (!match) return fallback;
	const channel = (raw: string) =>
		Math.max(0, Math.min(255, Number(raw))).toString(16).padStart(2, '0');
	return `#${channel(match[1]!)}${channel(match[2]!)}${channel(match[3]!)}`;
}

/** Both of a pair as `#rrggbb`, for the editor's two colour inputs. */
export function toHexColors(colors: HeartColors, fallback: HeartColors): HeartColors {
	return {
		left: toHexColor(colors.left, fallback.left),
		right: toHexColor(colors.right, fallback.right)
	};
}
