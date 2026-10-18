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
import { heartName } from '$lib/utils/heartName';
import { heartPath } from '$lib/i18n/routes';
import { heartScale } from '$lib/laser/unfold';
import { layoutSheet, type Placement, type SheetSize } from '$lib/laser/sheet';
import { lobesShareTemplate, SHARED_TEMPLATE_LOBE } from '$lib/utils/symmetry';
import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';
import { layoutEar, picturePixels, type EarLayout, type MeasureText } from './earLayout';

/**
 * Above each template, on the paper outside its outline: the heart's name
 * (`templateLabel`, 8 pt, baseline 4 mm down), with room before the ear
 * starts. The same band the printer PDF had before round 2 (when the address
 * shared it, at 7 mm), so the label never touches the outline.
 */
export const TEMPLATE_HEADER_MM = 9;
/** The label's baseline, below the top of the header. */
export const TEMPLATE_LABEL_BASELINE_MM = 4;
/** The label's size. */
export const TEMPLATE_LABEL_PT = 8;

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
	/** The rounded end's radius: half the width. Its picture and address go inside it (./earLayout.ts). */
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
		const one = piece(SHARED_TEMPLATE_LOBE);
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

const GALLERY_IDS = new Set<string>(ALL_HEART_IDS);

/**
 * A template's address, printed in its rounded end. A gallery heart has its own page,
 * which is the shortest way back to exactly this template; a heart the visitor
 * drew has none, so it gets the site. The page is in the PDF's language
 * (`juleflet.dk/en/hjerte/<id>` in English), as the laser file's link is.
 */
export function templateAddress(design: HeartDesign, lang: Language): string {
	if (!GALLERY_IDS.has(design.id)) return SITE_DOMAIN;
	return `${SITE_DOMAIN}${heartPath(design.id, lang).replace(/\/$/, '')}`;
}

/**
 * The template's label, printed above it on the paper: the heart's name in the
 * PDF's language (`heartName`), and
 * for a heart whose two halves differ, which half this is ("Jul (Venstre)").
 */
export function templateLabel(piece: Pick<TemplatePiece, 'design' | 'lobe' | 'shared'>, lang: Language): string {
	const name = heartName(piece.design, lang);
	if (piece.shared) return name;
	return `${name} (${t(piece.lobe === 'left' ? 'lobeLeft' : 'lobeRight', lang)})`;
}

/**
 * What goes inside this template's rounded end: the picture (when it is
 * printed) and the address. The heart's name is printed above the template
 * instead (`templateLabel`), not on the piece. The PDF passes jsPDF's own text measure; the preview makes do with
 * an estimate.
 */
export function templateEar(
	piece: TemplatePiece,
	{ picture, measure, lang }: { picture: boolean; measure?: MeasureText; lang: Language }
): EarLayout {
	return layoutEar({
		widthMm: piece.widthMm,
		heightMm: piece.heightMm,
		earRadiusMm: piece.earRadiusMm,
		picture,
		address: templateAddress(piece.design, lang),
		measure
	});
}

/**
 * The pixel size the heart's picture is rendered at: one rendering per design,
 * sharp enough for the largest template it is printed in. The dialog's preview
 * asks for the same rendering, so what it shows is the PDF's picture.
 */
export function templatePicturePixels(pieces: readonly TemplatePiece[], lang: Language): number {
	// The address can shrink the picture in a narrow ear, so it is the language's.
	const sizes = pieces.map((p) => templateEar(p, { picture: true, lang }).picture?.size ?? 0);
	return picturePixels(Math.max(0, ...sizes));
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
	 * width by its height plus the header its label is printed in; the
	 * template itself starts `headerMm` below `y`.
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
