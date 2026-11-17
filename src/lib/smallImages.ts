/**
 * The smaller copies of the site's photographs (scripts/small-images.mjs): a `srcset` for a
 * picture, so that a browser fetches the copy that fits the size it is shown at.
 */
import LIST from '$lib/data/small-images.json';

const COPIES = LIST as unknown as Record<string, [number, string][]>;

/**
 * The `srcset` of a picture: its smaller copies and the picture itself, each with its width.
 * `src` is the root-relative address (/hearts/photos/sun.jpg) and `width` the picture's own;
 * `base` goes in front of every address. Undefined for a picture without copies.
 */
export function smallSrcset(src: string, width: number, base = ''): string | undefined {
	const copies = COPIES[src];
	if (!copies?.length) return undefined;
	return [...copies, [width, src] as [number, string]].map(([w, address]) => `${base}${address} ${w}w`).join(', ');
}
