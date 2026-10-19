/**
 * One page of the printer PDF as an inline SVG, for the "Hent skabelon"
 * dialog's preview — docs/redesign/DOWNLOAD.md.
 *
 * It draws the same plan generateTemplatesPDF draws (./plan.ts), from the same
 * template geometry (`getTemplateData`), in the classes the laser preview
 * already styles: `sheet` for the paper, `cut` for outlines and cuts, and
 * `fold` for the dashed fold the PDF prints. Above each template it puts the
 * heart's name as the PDF prints it (`templateLabel`); inside its rounded
 * end it puts what the PDF puts there (`templateEar`): the heart's picture —
 * the very PNG the PDF embeds, once it has been rendered — and the address
 * line, so what the visitor sees is where things will be on paper.
 * One user unit is one millimetre; the strokes do not scale.
 */
import { SITE_DOMAIN } from '$lib/config';
import type { Language } from '$lib/i18n';
import { getTemplateData } from '$lib/utils/templateSvg';
import { coord } from '$lib/laser/format';
import { PT_MM } from './earLayout';
import {
	TEMPLATE_HEADER_MM,
	TEMPLATE_LABEL_BASELINE_MM,
	TEMPLATE_LABEL_PT,
	templateEar,
	templateLabel,
	type TemplatePagePlan,
	type TemplatePiece
} from './plan';
import { escapeXml } from '$lib/utils/xml';
import { markPathData } from '$lib/utils/orientationMarks';

export interface TemplatePreviewOptions {
	page: number;
	lang: Language;
	/** Print the heart's picture in the ear (the dialog's checkbox). */
	previewImage: boolean;
	/**
	 * The pictures rendered so far, a PNG data URL per design id. A design
	 * missing here (still rendering, or failed) gets no picture and no
	 * placeholder: the address stays where it will print with it.
	 */
	images?: ReadonlyMap<string, string>;
	title: string;
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

	// One copy of each picture, placed by <use>: a data URL repeated for every
	// template on the page would be re-parsed on every change of a setting.
	const page = plan.pages[options.page] ?? [];
	const symbols = new Map<string, string>();
	if (options.previewImage && options.images) {
		for (const { index } of page) {
			const id = pieces[index]!.design.id;
			const href = options.images.get(id);
			if (!href || symbols.has(id)) continue;
			const symbol = `template-picture-${symbols.size}`;
			symbols.set(id, symbol);
			lines.push(
				`  <symbol id="${symbol}" viewBox="0 0 1 1"><image href="${escapeXml(href)}" width="1" height="1" /></symbol>`
			);
		}
	}

	for (const { index, x, y } of page) {
		const piece = pieces[index]!;
		const data = getTemplateData(piece.design, piece.lobe);
		lines.push(
			`  <text class="label" x="${coord(x + piece.widthMm / 2)}" y="${coord(y + TEMPLATE_LABEL_BASELINE_MM)}" font-size="${coord(TEMPLATE_LABEL_PT * PT_MM)}" text-anchor="middle">${escapeXml(templateLabel(piece, options.lang))}</text>`
		);
		const top = y + TEMPLATE_HEADER_MM;
		// The template's own units, scaled into place: the paths are the ones the
		// PDF's drawing is made from.
		const { templateWidth: tw, templateHeight: th, earRadius: r } = data;
		lines.push(`  <g transform="translate(${coord(x)} ${coord(top)}) scale(${piece.scale})" fill="none">`);
		lines.push('    <g class="cut">');
		lines.push(`      <path d="${data.earPath}" ${stroke} />`);
		lines.push(`      <path d="M 0 ${r} L 0 ${th} M ${tw} ${r} L ${tw} ${th}" ${stroke} />`);
		for (const d of data.cutPaths) lines.push(`      <path d="${d}" ${stroke} />`);
		lines.push('    </g>');
		lines.push(`    <g class="fold"><path d="M 0 ${th} L ${tw} ${th}" ${stroke} /></g>`);
		// The orientation mark, as the PDF prints it: thin, in the template's colour.
		for (const mark of piece.marks) {
			lines.push(`    <g class="mark" data-mark="${mark.kind}"><path d="${markPathData(mark)}" ${stroke} /></g>`);
		}
		lines.push('  </g>');

		const ear = templateEar(piece, { picture: options.previewImage, lang: options.lang });
		const symbol = symbols.get(piece.design.id);
		if (ear.picture && symbol) {
			const { x: px, y: py, size } = ear.picture;
			lines.push(
				`  <use class="picture" href="#${symbol}" x="${coord(x + px)}" y="${coord(top + py)}" width="${coord(size)}" height="${coord(size)}" />`
			);
		}
		if (ear.address) {
			const a = ear.address;
			lines.push(
				`  <text class="address" x="${coord(x + a.x)}" y="${coord(top + a.baseline)}" font-size="${coord(a.sizePt * PT_MM)}" text-anchor="middle">${escapeXml(a.text)}</text>`
			);
		}
	}

	lines.push(
		`  <text class="address" x="${coord(W / 2)}" y="${coord(H - 3)}" font-size="2.5" text-anchor="middle">${SITE_DOMAIN}</text>`
	);
	lines.push('</svg>');
	return lines.join('\n');
}
