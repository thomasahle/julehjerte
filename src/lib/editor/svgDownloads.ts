/**
 * The editor's SVG download: "Eksportér SVG", the heart as an SVG file the
 * editor can open again. (The templates come from "Hent skabelon"'s dialog.)
 */
import type { HeartDesign } from '$lib/types/heart';
import { downloadBlob } from '$lib/utils/download';
import { serializeHeartToSVG } from '$lib/utils/heartDesign';
import { slugify } from '$lib/utils/slug';

/** `{name}.svg`: the heart itself. */
export function downloadHeartSvg(design: HeartDesign): void {
	const svg = serializeHeartToSVG(design);
	downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slugify(design.name)}.svg`);
}
