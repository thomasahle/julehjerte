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
import { layoutEar, picturePixels, type EarLayout, type MeasureText } from './earLayout';

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
	/** The rounded end's radius: half the width. Its name and picture go inside it (./earLayout.ts). */
	earRadiusMm: number;
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
			earRadiusMm: data.earRadius * scale,
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

/**
 * What goes inside this template's rounded end: the picture (when it is
 * printed), the name and the address. The PDF passes jsPDF's own text
 * measure; the preview makes do with an estimate.
 */
export function templateEar(
	piece: TemplatePiece,
	{ lang, picture, measure }: { lang: Language; picture: boolean; measure?: MeasureText }
): EarLayout {
	return layoutEar({
		widthMm: piece.widthMm,
		heightMm: piece.heightMm,
		earRadiusMm: piece.earRadiusMm,
		picture,
		name: templateLabel(piece, lang),
		address: templateAddress(piece.design),
		measure
	});
}

/**
 * The pixel size the heart's picture is rendered at: one rendering per design,
 * sharp enough for the largest template it is printed in. The dialog's preview
 * asks for the same rendering, so what it shows is the PDF's picture.
 */
export function templatePicturePixels(pieces: readonly TemplatePiece[], lang: Language): number {
	const sizes = pieces.map((p) => templateEar(p, { lang, picture: true }).picture?.size ?? 0);
	return picturePixels(Math.max(0, ...sizes));
}

export interface TemplatePageOptions {
	sheet: SheetSize;
	gapMm?: number;
	marginMm?: number;
	footerMm?: number;
}

export interface TemplatePagePlan {
	sheet: SheetSize;
	/**
	 * Per page, where each template goes: `index` into the pieces asked for,
	 * `x`/`y` its top-left corner (the top of the ear) in mm. The box is the
	 * template itself: its name and address are printed inside its rounded end,
	 * not above it, so nothing else needs room.
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
	{ sheet, gapMm = 5, marginMm = 5, footerMm = PAGE_FOOTER_MM }: TemplatePageOptions
): TemplatePagePlan {
	const boxes = pieces.map((p) => ({ widthMm: p.widthMm, heightMm: p.heightMm }));
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
