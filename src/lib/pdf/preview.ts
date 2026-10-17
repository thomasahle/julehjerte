/**
 * One page of the printer PDF as an inline SVG, for the "Hent skabelon"
 * dialog's preview — docs/redesign/DOWNLOAD.md.
 *
 * It draws the same plan generateTemplatesPDF draws (./plan.ts), from the same
 * template geometry (`getTemplateData`), in the classes the laser preview
 * already styles: `sheet` for the paper, `cut` for outlines and cuts, `score`
 * for the dashed fold. The name and address lines are drawn as the PDF prints
 * them, and the heart's picture as a light square where the PDF puts it, so
 * what the visitor sees is where things will be on paper. One user unit is one
 * millimetre; the strokes do not scale.
 */
import { SITE_DOMAIN } from '$lib/config';
import type { Language } from '$lib/i18n';
import { getTemplateData } from '$lib/utils/templateSvg';
import { coord } from '$lib/laser/format';
import {
	TEMPLATE_HEADER_MM,
	templateAddress,
	templateLabel,
	type TemplatePagePlan,
	type TemplatePiece
} from './plan';

export interface TemplatePreviewOptions {
	page: number;
	lang: Language;
	/** Draw the square the heart's picture takes in the ear. */
	previewImage: boolean;
	title: string;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Where the PDF puts the heart's picture inside a template of this size. */
export function previewImageBox(widthMm: number, heightMm: number): { cx: number; cy: number; size: number } {
	return { cx: widthMm / 2, cy: (heightMm / 3) * 0.6, size: Math.min(widthMm * 0.35, heightMm * 0.25) };
}

export function serializeTemplatePageSvg(
	plan: TemplatePagePlan,
	pieces: readonly TemplatePiece[],
	options: TemplatePreviewOptions
): string {
	const { widthMm: W, heightMm: H } = plan.sheet;
	const lines = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${coord(W)} ${coord(H)}">`,
		`  <title>${escapeXml(options.title)}</title>`,
		`  <rect class="sheet" x="0" y="0" width="${coord(W)}" height="${coord(H)}" />`
	];
	const stroke = 'vector-effect="non-scaling-stroke"';

	for (const { index, x, y } of plan.pages[options.page] ?? []) {
		const piece = pieces[index]!;
		const data = getTemplateData(piece.design, piece.lobe);
		const cx = coord(x + piece.widthMm / 2);
		lines.push(
			`  <text class="label" x="${cx}" y="${coord(y + 4)}" font-size="2.8" text-anchor="middle">${escapeXml(templateLabel(piece, options.lang))}</text>`,
			`  <text class="address" x="${cx}" y="${coord(y + 7)}" font-size="2.1" text-anchor="middle">${escapeXml(templateAddress(piece.design))}</text>`
		);
		// The template's own units, scaled into place: the paths are the ones the
		// PDF's drawing is made from.
		const top = y + TEMPLATE_HEADER_MM;
		const { templateWidth: tw, templateHeight: th, earRadius: r } = data;
		lines.push(`  <g transform="translate(${coord(x)} ${coord(top)}) scale(${piece.scale})" fill="none">`);
		lines.push('    <g class="cut">');
		lines.push(`      <path d="${data.earPath}" ${stroke} />`);
		lines.push(`      <path d="M 0 ${r} L 0 ${th} M ${tw} ${r} L ${tw} ${th}" ${stroke} />`);
		for (const d of data.cutPaths) lines.push(`      <path d="${d}" ${stroke} />`);
		lines.push('    </g>');
		lines.push(`    <g class="score"><path d="M 0 ${th} L ${tw} ${th}" ${stroke} /></g>`);
		lines.push('  </g>');
		if (options.previewImage) {
			const box = previewImageBox(piece.widthMm, piece.heightMm);
			lines.push(
				`  <rect class="thumb" x="${coord(x + box.cx - box.size / 2)}" y="${coord(top + box.cy - box.size / 2)}" width="${coord(box.size)}" height="${coord(box.size)}" rx="1" />`
			);
		}
	}

	lines.push(
		`  <text class="address" x="${coord(W / 2)}" y="${coord(H - 3)}" font-size="2.5" text-anchor="middle">${SITE_DOMAIN}</text>`
	);
	lines.push('</svg>');
	return lines.join('\n');
}
