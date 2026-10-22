import { jsPDF } from 'jspdf';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { prerenderHeartImages } from './heartRenderer';
import { SITE_DOMAIN } from '$lib/config';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import { inferOverlapRect as inferOverlapRectShared } from '$lib/utils/overlapRect';
import { transformPathData } from '$lib/utils/templateSvg';
import { markStrokes, type PlacedMark } from '$lib/utils/orientationMarks';
import { heartFileStem, slugify } from '$lib/utils/slug';
import { t, type Language } from '$lib/i18n';
import { SHEETS, type SheetSize } from '$lib/laser/sheet';
import { designPrintSettings, sheetSize } from './designPrint';
import {
  planTemplatePages,
  templateEar,
  templateLabel,
  templatePicturePixels,
  templatePieces,
  TEMPLATE_HEADER_MM,
  TEMPLATE_LABEL_BASELINE_MM,
  TEMPLATE_LABEL_PT
} from './plan';

function inferOverlapRect(design: HeartDesign) {
  const rect = inferOverlapRectShared(design.fingers, design.gridSize);
  return {
    overlapLeft: rect.left,
    overlapTop: rect.top,
    overlapWidth: rect.width,
    overlapHeight: rect.height
  };
}

// Parse SVG path data and draw it
function drawSVGPath(
  pdf: jsPDF,
  pathData: string,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (type === 'M') {
      currentX = args[0];
      currentY = args[1];
    } else if (type === 'C') {
      // Cubic bezier: C x1 y1 x2 y2 x y
      const points: Vec[] = [];
      const segments = 20;
      const p0 = { x: currentX, y: currentY };
      const p1 = { x: args[0], y: args[1] };
      const p2 = { x: args[2], y: args[3] };
      const p3 = { x: args[4], y: args[5] };

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        points.push({
          x: offsetX + (mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x) * scale,
          y: offsetY + (mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y) * scale
        });
      }

      for (let i = 0; i < points.length - 1; i++) {
        pdf.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }

      currentX = args[4];
      currentY = args[5];
    } else if (type === 'L') {
      pdf.line(
        offsetX + currentX * scale,
        offsetY + currentY * scale,
        offsetX + args[0] * scale,
        offsetY + args[1] * scale
      );
      currentX = args[0];
      currentY = args[1];
    }
  }
}

// Draw a semicircle arc
function drawArc(
  pdf: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const segments = 32;
  const points: Vec[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / segments;
    points.push({
      x: offsetX + (cx + radius * Math.cos(angle)) * scale,
      y: offsetY + (cy + radius * Math.sin(angle)) * scale
    });
  }

  for (let i = 0; i < points.length - 1; i++) {
    pdf.line(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
  }
}

/**
 * The orientation marks ($lib/utils/orientationMarks) on a template drawn at
 * (offsetX, offsetY) and `scale` mm per unit: thin crosses in the template's
 * own black, ⊗ with its circle. Nothing for a heart that needs none.
 */
function drawMarks(pdf: jsPDF, marks: readonly PlacedMark[], offsetX: number, offsetY: number, scale: number) {
  if (!marks.length) return;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.2);
  for (const mark of marks) {
    const at = (p: Vec) => ({ x: offsetX + p.x * scale, y: offsetY + p.y * scale });
    for (const [a, b] of markStrokes(mark)) {
      const p = at(a);
      const q = at(b);
      pdf.line(p.x, p.y, q.x, q.y);
    }
    if (mark.kind === 'circled') {
      const c = at(mark);
      pdf.circle(c.x, c.y, mark.r * scale, 'S');
    }
  }
}

// Draw a single lobe template with its top-left corner (the ear's bounding
// box) at (offsetX, offsetY), at `scale` mm per template unit, the size the
// visitor chose.
function drawLobeTemplateAt(
  pdf: jsPDF,
  design: HeartDesign,
  lobe: 'left' | 'right',
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const rect = inferOverlapRect(design);
  const overlapWidth = rect.overlapWidth;
  const overlapHeight = rect.overlapHeight;
  const earRadius = lobe === 'left' ? overlapHeight / 2 : overlapWidth / 2;
  const bodyWidth = lobe === 'left' ? overlapHeight : overlapWidth;
  const bodyHeight = lobe === 'left' ? overlapWidth : overlapHeight;
  const templateWidth = bodyWidth;
  const templateHeight = bodyHeight + earRadius;
  const scaledWidth = templateWidth * scale;
  const scaledHeight = templateHeight * scale;

  // Transform coordinates: we want vertical template with ear at top
  // Original left lobe: ear on left, fold on bottom
  // Original right lobe: ear on top, fold on left
  // Target: ear on top, fold on bottom

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);

  if (lobe === 'left') {
    // Transform left lobe: rotate 90° counterclockwise
    // Original: ear at left (x=squareLeft), fold at bottom
    // Target: ear at top, fold at bottom

    // Draw outline - ear at top
    // Semicircle at top (center at bottom of arc, arc extends upward)
    drawArc(
      pdf,
      0,
      earRadius,
      earRadius,
      Math.PI,
      2 * Math.PI,
      offsetX + scaledWidth / 2,
      offsetY,
      scale
    );

    // Left edge
    pdf.line(
      offsetX,
      offsetY + earRadius * scale,
      offsetX,
      offsetY + scaledHeight
    );

    // Right edge
    pdf.line(
      offsetX + scaledWidth,
      offsetY + earRadius * scale,
      offsetX + scaledWidth,
      offsetY + scaledHeight
    );

    // Bottom edge (fold line - dashed)
    pdf.setLineDashPattern([2, 1], 0);
    pdf.line(
      offsetX,
      offsetY + scaledHeight,
      offsetX + scaledWidth,
      offsetY + scaledHeight
    );
    pdf.setLineDashPattern([], 0);

    // Draw cut lines (finger boundaries) - transform from horizontal to vertical
    const leftFingers = design.fingers.filter((f) => f.lobe === 'left');
    for (const finger of leftFingers) {
      const transformedPath = transformPathData(
        segmentsToPathData(finger.segments),
        rect.overlapTop,
        rect.overlapLeft,
        overlapWidth,
        overlapHeight,
        earRadius,
        'left'
      );
      drawSVGPath(pdf, transformedPath, offsetX, offsetY, scale);
    }
  } else {
    // Right lobe is already oriented correctly (ear at top)
    // Just need to adjust coordinates

    // Semicircle at top (center at bottom of arc, arc extends upward)
    drawArc(
      pdf,
      templateWidth / 2,
      earRadius,
      earRadius,
      Math.PI,
      2 * Math.PI,
      offsetX,
      offsetY,
      scale
    );

    // Left edge
    pdf.line(
      offsetX,
      offsetY + earRadius * scale,
      offsetX,
      offsetY + scaledHeight
    );

    // Right edge
    pdf.line(
      offsetX + scaledWidth,
      offsetY + earRadius * scale,
      offsetX + scaledWidth,
      offsetY + scaledHeight
    );

    // Bottom edge (fold line - dashed)
    pdf.setLineDashPattern([2, 1], 0);
    pdf.line(
      offsetX,
      offsetY + scaledHeight,
      offsetX + scaledWidth,
      offsetY + scaledHeight
    );
    pdf.setLineDashPattern([], 0);

    // Draw cut lines (finger boundaries)
    const rightFingers = design.fingers.filter((f) => f.lobe === 'right');
    for (const finger of rightFingers) {
      // Transform pathData to local coordinates
      const transformedPath = transformPathData(
        segmentsToPathData(finger.segments),
        rect.overlapTop,
        rect.overlapLeft,
        overlapWidth,
        overlapHeight,
        earRadius,
        'right'
      );
      drawSVGPath(pdf, transformedPath, offsetX, offsetY, scale);
    }
  }
}

// ---- The "Hent skabelon" dialog's PDF (docs/redesign/DOWNLOAD.md) ----------

export interface TemplatesPDFOptions {
  /** The heart's width: its wider template's, as the laser export reads it. */
  widthMm: number;
  /** Hearts per design; each heart is two templates. */
  hearts: number;
  /** The page. */
  sheet: SheetSize;
  lang?: Language;
  /** Print the heart's picture in each template's ear. */
  previewImage?: boolean;
  /** The file name's stem for a single heart, in place of its id (`templatesFilename`). */
  fileStem?: string;
}

/** jsPDF's own names for the two standard sheets, so a printer sees "A4", not 210 × 297 mm. */
function pageFormat(sheet: SheetSize): { format: string | [number, number]; orientation: 'portrait' | 'landscape' } {
  const same = (a: SheetSize) => a.widthMm === sheet.widthMm && a.heightMm === sheet.heightMm;
  if (same(SHEETS.A4)) return { format: 'a4', orientation: 'portrait' };
  if (same(SHEETS.A3)) return { format: 'a3', orientation: 'portrait' };
  // jsPDF turns [w, h] to match the orientation it is given, so it has to be
  // the one the sheet already has.
  return {
    format: [sheet.widthMm, sheet.heightMm],
    orientation: sheet.widthMm > sheet.heightMm ? 'landscape' : 'portrait'
  };
}

/**
 * The templates at true size: each heart's two folded templates at
 * `widthMm`, laid out by planTemplatePages on as many pages as they take.
 * Every template has the heart's name above it (`templateLabel`, on the paper
 * around it) and, inside its rounded end (`templateEar`), the heart's picture
 * (optionally) and its address; every page has the footer.
 */
export async function generateTemplatesPDF(designs: HeartDesign[], options: TemplatesPDFOptions): Promise<jsPDF> {
  const lang = options.lang ?? 'da';
  const pieces = templatePieces(designs, options.widthMm, options.hearts);
  const plan = planTemplatePages(pieces, { sheet: options.sheet });
  if (!plan.fits) throw new Error('A template is larger than the page.');

  const { format, orientation } = pageFormat(options.sheet);
  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  // One picture per design, rendered for the largest template it appears in;
  // the dialog's preview asks for the same rendering.
  const picture = options.previewImage ?? true;
  const heartImages = picture
    ? await prerenderHeartImages(designs, templatePicturePixels(pieces, lang))
    : new Map<string, string>();
  // jsPDF's own widths for its Helvetica, in mm, so the address is shrunk
  // only if it really would not fit the ear.
  const measure = (text: string, sizePt: number) =>
    (pdf.getStringUnitWidth(text) * sizePt) / pdf.internal.scaleFactor;

  for (const [pageIndex, placements] of plan.pages.entries()) {
    if (pageIndex > 0) pdf.addPage(format, orientation);

    for (const { index, x, y } of placements) {
      const piece = pieces[index]!;
      // The heart's name above the template, on the paper around it.
      pdf.setFontSize(TEMPLATE_LABEL_PT);
      pdf.setTextColor(0);
      pdf.text(templateLabel(piece, lang), x + piece.widthMm / 2, y + TEMPLATE_LABEL_BASELINE_MM, { align: 'center' });

      const top = y + TEMPLATE_HEADER_MM;
      drawLobeTemplateAt(pdf, piece.design, piece.lobe, x, top, piece.scale);
      drawMarks(pdf, piece.marks, x, top, piece.scale);

      // Inside the rounded end, which no cut crosses and folding keeps whole:
      // a template cut out of the sheet still shows what it is and says where
      // it is from (a sheet often ends up far from the rest — a school, a workshop).
      const imageData = heartImages.get(piece.design.id);
      const ear = templateEar(piece, { picture: picture && imageData !== undefined, measure, lang });
      if (ear.picture && imageData) {
        const { x: px, y: py, size } = ear.picture;
        pdf.addImage(imageData, 'PNG', x + px, top + py, size, size);
      }
      if (ear.address) {
        pdf.setFontSize(ear.address.sizePt);
        pdf.setTextColor(128);
        pdf.text(ear.address.text, x + ear.address.x, top + ear.address.baseline, { align: 'center' });
      }
    }

    pdf.setFontSize(7);
    pdf.setTextColor(128);
    pdf.text(SITE_DOMAIN, options.sheet.widthMm / 2, options.sheet.heightMm - 3, { align: 'center' });
  }

  return pdf;
}

/**
 * "classic-3x3-80mm.pdf": the heart's id (as the laser files are named,
 * `heartFileStem`), or `stem` when the caller names the file otherwise (a
 * heart received by link is named after its name), and the width it was
 * printed at; for several hearts (SELECTION.md) "julehjerter-3-skabeloner.pdf",
 * the count.
 */
export function templatesFilename(
  designs: HeartDesign | readonly HeartDesign[],
  widthMm: number,
  lang: Language = 'da',
  stem?: string
): string {
  const list = Array.isArray(designs) ? (designs as readonly HeartDesign[]) : [designs as HeartDesign];
  if (list.length > 1) return `${t('pdfMultiFilename', lang, { n: list.length })}.pdf`;
  return `${heartFileStem(stem ?? list[0]!.id)}-${widthMm}mm.pdf`;
}

export async function downloadTemplatesPDF(designs: HeartDesign[], options: TemplatesPDFOptions) {
  if (designs.length === 0) return;
  const pdf = await generateTemplatesPDF(designs, options);
  pdf.save(templatesFilename(designs, options.widthMm, options.lang, options.fileStem));
}

/**
 * Tegn's, Mal's and the design page's "Hent PDF": the heart's templates as the
 * "Hent skabelon" dialog prints them, at the width, on the sheet and with the
 * picture the visitor last downloaded with (80 mm on A4 until then), named
 * after the heart. Until 2026-10-22 these buttons printed a page of their own,
 * nine templates to an A4 page, so each came out 51 mm wide, not the 80 mm the
 * guide and the gallery's download give (a user tester's "five centimetres in
 * the top third of the page"). A stored width the sheet cannot take falls back
 * to the dialog's defaults. The design page asks for a wider print where its
 * paper would tear at the visitor's (`widthMm`, see ./designPrint).
 */
export async function downloadDesignPDF(design: HeartDesign, lang: Language = 'da', widthMm?: number) {
  await downloadTemplatesPDF([design], designPDFOptions(design, lang, widthMm));
}

/** What `downloadDesignPDF` prints the heart with. */
export function designPDFOptions(design: HeartDesign, lang: Language = 'da', widthMm?: number): TemplatesPDFOptions {
  const settings = designPrintSettings(design, widthMm);
  return {
    widthMm: settings.widthMm,
    hearts: 1,
    sheet: sheetSize(settings.sheet),
    lang,
    previewImage: settings.previewImage,
    fileStem: slugify(design.name) || undefined
  };
}
