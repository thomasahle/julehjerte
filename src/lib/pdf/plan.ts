/**
 * Which folded templates go where on which page of the printer PDF —
 * docs/redesign/DOWNLOAD.md "Printer PDF at a chosen size".
 *
 * The "Hent skabelon" dialog shows page 1 of this plan and says how many pages
 * there are; generateTemplatesPDF in ./template.ts draws the same plan with
 * jsPDF. Keeping the maths here, without jsPDF, is what lets the dialog preview
 * a PDF it has not made and lets the planning be tested on its own.
 */
import type { HeartDesign } from '$lib/types/heart';
import { SITE_DOMAIN } from '$lib/config';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { t, type Language } from '$lib/i18n';
import { heartScale } from '$lib/laser/unfold';
import { layoutSheet, type Placement, type SheetSize } from '$lib/laser/sheet';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';

/**
 * Above each template, the two lines the PDF has always printed there: the
 * heart's name (8 pt, baseline 4 mm down) and its address (6 pt, at 7 mm),
 * with 2 mm before the ear starts.
 */
export const TEMPLATE_HEADER_MM = 9;

/**
 * Kept clear at the foot of every page for the site's name, so a template
 * reaching the bottom margin does not run into it.
 */
export const PAGE_FOOTER_MM = 5;

/** One folded template on paper. */
export interface TemplatePiece {
	design: HeartDesign;
	/** The lobe whose template is drawn. */
	lobe: TemplateLobe;
	/**
	 * Both lobes cut from this one template, so its label carries no
	 * "Venstre"/"Højre". The right lobe's template is drawn then, as the
	 * gallery's PDF has always done.
	 */
	shared: boolean;
	/** Millimetres per template unit; the same for both pieces of a heart. */
	scale: number;
	/** The folded template: its width, and its height from the ear's top to the fold. */
	widthMm: number;
	heightMm: number;
	stripWidthMm: number;
}

/**
 * A heart's two templates at a heart width of `widthMm`, left first. Both
 * pieces share one scale (`heartScale`), so on a non-square grid `widthMm` is
 * the wider piece's and the strips of the two still match — as the laser
 * export's pieces do.
 */
export function templatePair(design: HeartDesign, widthMm: number): [TemplatePiece, TemplatePiece] {
	const scale = heartScale(design, widthMm);
	const shared = lobesShareTemplate(design.fingers, design.gridSize);
	const piece = (lobe: TemplateLobe): TemplatePiece => {
		const data = getTemplateData(design, lobe);
		const stripsAcross = lobe === 'left' ? design.gridSize.y : design.gridSize.x;
		return {
			design,
			lobe,
			shared,
			scale,
			widthMm: data.templateWidth * scale,
			heightMm: data.templateHeight * scale,
			stripWidthMm: (data.templateWidth * scale) / stripsAcross
		};
	};
	if (shared) {
		const one = piece('right');
		return [one, one];
	}
	return [piece('left'), piece('right')];
}

/**
 * Every template the PDF prints: two per heart (a heart is two pieces), so
 * `hearts` copies of each design's pair, design by design.
 */
export function templatePieces(designs: readonly HeartDesign[], widthMm: number, hearts: number): TemplatePiece[] {
	const pieces: TemplatePiece[] = [];
	for (const design of designs) {
		const pair = templatePair(design, widthMm);
		for (let i = 0; i < hearts; i++) pieces.push(...pair);
	}
	return pieces;
}

/** The template's name line, as the PDF prints it. */
export function templateLabel(piece: Pick<TemplatePiece, 'design' | 'lobe' | 'shared'>, lang: Language): string {
	if (piece.shared) return piece.design.name;
	return `${piece.design.name} (${t(piece.lobe === 'left' ? 'lobeLeft' : 'lobeRight', lang)})`;
}

const GALLERY_IDS = new Set<string>(ALL_HEART_IDS);

/**
 * The address printed under a template's name. A gallery heart has its own page,
 * which is the shortest way back to exactly this template; a heart the visitor
 * drew has none, so it gets the site.
 */
export function templateAddress(design: HeartDesign): string {
	return GALLERY_IDS.has(design.id) ? `${SITE_DOMAIN}/hjerte/${design.id}` : SITE_DOMAIN;
}

export interface TemplatePageOptions {
	sheet: SheetSize;
	gapMm?: number;
	marginMm?: number;
	headerMm?: number;
	footerMm?: number;
}

export interface TemplatePagePlan {
	sheet: SheetSize;
	/**
	 * Per page, where each piece's box goes: `index` into the pieces asked
	 * for, `x`/`y` the box's top-left corner in mm. A box is the template's
	 * width by its height plus the header; the template itself starts
	 * `headerMm` below `y`.
	 */
	pages: Placement[][];
	/** False when one template is too big for an empty page: then there are no pages at all. */
	fits: boolean;
}

/**
 * The pieces in order, on as many pages as they need: each page is the laser
 * sheet's row layout (`layoutSheet`, 5 mm gap and margin) over what is left,
 * on the page less its footer.
 */
export function planTemplatePages(
	pieces: ReadonlyArray<{ widthMm: number; heightMm: number }>,
	{ sheet, gapMm = 5, marginMm = 5, headerMm = TEMPLATE_HEADER_MM, footerMm = PAGE_FOOTER_MM }: TemplatePageOptions
): TemplatePagePlan {
	const boxes = pieces.map((p) => ({ widthMm: p.widthMm, heightMm: p.heightMm + headerMm }));
	const area: SheetSize = { widthMm: sheet.widthMm, heightMm: sheet.heightMm - footerMm };
	const pages: Placement[][] = [];
	let start = 0;
	while (start < boxes.length) {
		const layout = layoutSheet(boxes.slice(start), { sheet: area, gapMm, marginMm });
		// Nothing fits on an empty page: more pages would not help.
		if (layout.fitted === 0) return { sheet, pages: [], fits: false };
		pages.push(layout.placements.map((p) => ({ ...p, index: p.index + start })));
		start += layout.fitted;
	}
	return { sheet, pages, fits: true };
}
