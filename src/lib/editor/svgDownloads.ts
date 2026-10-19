/**
 * The editor's two SVG downloads: "Eksportér SVG" (the heart as an SVG file
 * the editor can open again) and the template SVG.
 */
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { renderHeartSvgInline } from '$lib/rendering/heartSvg';
import { downloadBlob } from '$lib/utils/download';
import { serializeHeartToSVG } from '$lib/utils/heartDesign';
import { slugify } from '$lib/utils/slug';
import { detectSymmetry } from '$lib/utils/symmetry';
import { serializeTemplateToSVG, type TemplateLobe } from '$lib/utils/templateSvg';

/** `{name}.svg`: the heart itself. */
export function downloadHeartSvg(design: HeartDesign): void {
	const svg = serializeHeartToSVG(design);
	downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slugify(design.name)}.svg`);
}

/** `{name}-template.svg`: one template for a mirror-symmetric square heart, else both. */
export function downloadTemplateSvg(design: HeartDesign, colors: HeartColors): void {
	const isSymmetric =
		design.gridSize.x === design.gridSize.y && detectSymmetry(design.fingers).mirrorSymmetry;
	const lobes: TemplateLobe[] = isSymmetric ? ['left'] : ['left', 'right'];
	const previewSvgs = lobes.map((lobe, index) =>
		renderHeartSvgInline(design, colors, {
			idPrefix: `template-preview-${design.id}-${lobe}-${index}`,
			outline: { color: '#111' }
		})
	);
	const svg = serializeTemplateToSVG(design, lobes, { previewSvgs });
	downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${slugify(design.name)}-template.svg`);
}
