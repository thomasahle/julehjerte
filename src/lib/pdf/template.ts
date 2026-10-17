import { jsPDF } from 'jspdf';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { prerenderHeartImages } from './heartRenderer';
import { SITE_DOMAIN } from '$lib/config';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import { inferOverlapRect as inferOverlapRectShared } from '$lib/utils/overlapRect';
import { lobesShareTemplate, SHARED_TEMPLATE_LOBE } from '$lib/utils/symmetry';
import { transformPathData } from '$lib/utils/templateSvg';
import { slugify } from '$lib/utils/slug';
import { t, type Language } from '$lib/i18n';
import { SHEETS, type SheetSize } from '$lib/laser/sheet';
import {
  planTemplatePages,
  templateAddress,
  templateEar,
  templateLabel,
  templatePicturePixels,
  templatePieces,
  TEMPLATE_HEADER_MM,
  TEMPLATE_LABEL_BASELINE_MM,
  TEMPLATE_LABEL_PT
} from './plan';

// A4 dimensions in mm
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PREVIEW_DPI = 300;

// The editor's and paint mode's one-page PDF: nine templates to an A4 page.
// (The front page's small/medium/large choice went with its own PDF path,
// docs/redesign/SELECTION.md; the front page uses the download dialog now.)
const GRID = { cols: 3, rows: 3 };

interface PDFOptions {
  lang?: Language;
}

function getTemplateDimensions() {
  const COMPACT_MARGIN = 5;
  const FOOTER_HEIGHT = 5;
  const availableWidth = PAGE_WIDTH - COMPACT_MARGIN * 2;
  const availableHeight = PAGE_HEIGHT - COMPACT_MARGIN * 2 - FOOTER_HEIGHT;

  const { cols, rows } = GRID;

  const maxWidth = (availableWidth - COMPACT_MARGIN * (cols - 1)) / cols;
  const maxHeight = (availableHeight - COMPACT_MARGIN * (rows - 1)) / rows;

  // Maintain heart template aspect ratio (~1.5 height/width)
  const aspectRatio = 1.5;
  let width = maxWidth;
  let height = width * aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height / aspectRatio;
  }

  return { width, height, cols, rows, margin: COMPACT_MARGIN, footerHeight: FOOTER_HEIGHT };
}

function previewSizePx(): number {
  const { width, height } = getTemplateDimensions();
  const previewSizeMm = Math.min(width * 0.35, height * 0.25);
  return Math.max(200, Math.round((previewSizeMm / 25.4) * PREVIEW_DPI));
}

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

// Draw a single lobe template (vertical orientation with ear at top), as large
// as fits in a box centred on (centerX, centerY): the gallery's fixed layouts.
function drawLobeTemplate(
  pdf: jsPDF,
  design: HeartDesign,
  lobe: 'left' | 'right',
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number
) {
  const rect = inferOverlapRect(design);
  const overlapWidth = rect.overlapWidth;
  const overlapHeight = rect.overlapHeight;
  const earRadius = lobe === 'left' ? overlapHeight / 2 : overlapWidth / 2;
  const bodyWidth = lobe === 'left' ? overlapHeight : overlapWidth;
  const bodyHeight = lobe === 'left' ? overlapWidth : overlapHeight;

  // Calculate scale to fit template in available space
  // Template is squareSize wide and squareSize + earRadius tall
  const templateWidth = bodyWidth;
  const templateHeight = bodyHeight + earRadius;

  const scaleX = maxWidth / templateWidth;
  const scaleY = maxHeight / templateHeight;
  const scale = Math.min(scaleX, scaleY) * 0.95; // Use 95% to leave minimal padding

  // Calculate offset to center the template
  const offsetX = centerX - (templateWidth * scale) / 2;
  const offsetY = centerY - (templateHeight * scale) / 2;

  drawLobeTemplateAt(pdf, design, lobe, offsetX, offsetY, scale);
}

// Draw a single lobe template with its top-left corner (the ear's bounding
// box) at (offsetX, offsetY), at `scale` mm per template unit. The dialog's
// PDF uses this directly, since there the size is the visitor's to choose.
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

interface TemplateSlot {
  design: HeartDesign;
  lobe: 'left' | 'right' | 'both';
}

// Collect templates needed for all designs
function collectTemplates(designs: HeartDesign[]): TemplateSlot[] {
  const templates: TemplateSlot[] = [];

  for (const design of designs) {
    if (lobesShareTemplate(design.fingers, design.gridSize)) {
      // Symmetric - only need one template
      templates.push({ design, lobe: 'both' });
    } else {
      // Asymmetric - need both templates
      templates.push({ design, lobe: 'left' });
      templates.push({ design, lobe: 'right' });
    }
  }

  return templates;
}

function addTemplatesPage(
  pdf: jsPDF,
  templates: TemplateSlot[],
  startIndex: number,
  isFirstPage: boolean,
  heartImages: Map<string, string>,
  lang: Language = 'da'
): number {
  if (!isFirstPage) {
    pdf.addPage();
  }

  const { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, cols, rows, margin: COMPACT_MARGIN, footerHeight: FOOTER_HEIGHT } = getTemplateDimensions();

  const maxPerPage = cols * rows;

  // Calculate grid positions based on layout
  const totalGridWidth = TEMPLATE_WIDTH * cols + COMPACT_MARGIN * (cols - 1);
  const totalGridHeight = TEMPLATE_HEIGHT * rows + COMPACT_MARGIN * (rows - 1);
  const startX = (PAGE_WIDTH - totalGridWidth) / 2 + TEMPLATE_WIDTH / 2;
  const startY = (PAGE_HEIGHT - FOOTER_HEIGHT - totalGridHeight) / 2 + TEMPLATE_HEIGHT / 2;

  const positions: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        x: startX + col * (TEMPLATE_WIDTH + COMPACT_MARGIN),
        y: startY + row * (TEMPLATE_HEIGHT + COMPACT_MARGIN)
      });
    }
  }

  // Preview size: scales with template size, max 30% of template width
  const PREVIEW_SIZE = Math.min(TEMPLATE_WIDTH * 0.35, TEMPLATE_HEIGHT * 0.25);
  const HEADER_SPACE = 7; // Two lines: the name, and the template's own address

  let drawn = 0;
  for (let i = 0; i < maxPerPage && startIndex + i < templates.length; i++) {
    const template = templates[startIndex + i];
    const pos = positions[i];

    // Calculate vertical layout within slot
    const slotTop = pos.y - TEMPLATE_HEIGHT / 2;
    const slotBottom = pos.y + TEMPLATE_HEIGHT / 2;

    // Draw template name at top
    pdf.setFontSize(8);
    pdf.setTextColor(0);
    const label = template.lobe === 'both'
      ? template.design.name
      : `${template.design.name} (${t(template.lobe === 'left' ? 'lobeLeft' : 'lobeRight', lang)})`;
    pdf.text(label, pos.x, slotTop + 4, { align: 'center' });
    // A sheet often ends up separated from the rest (a school, a workshop), so
    // each template carries the address that leads back to it.
    pdf.setFontSize(6);
    pdf.setTextColor(128);
    pdf.text(templateAddress(template.design), pos.x, slotTop + HEADER_SPACE, { align: 'center' });

    // Calculate template dimensions to position preview inside the ear
    const templateTop = slotTop + HEADER_SPACE + 2;
    const templateHeight = slotBottom - templateTop;
    const templateCenterY = templateTop + templateHeight / 2;

    // Draw the template first
    const lobeToUse = template.lobe === 'both' ? SHARED_TEMPLATE_LOBE : template.lobe;
    drawLobeTemplate(
      pdf,
      template.design,
      lobeToUse,
      pos.x,
      templateCenterY,
      TEMPLATE_WIDTH - 4,
      templateHeight - 2
    );

    // Draw colored preview heart image inside the ear (semicircle) portion
    const earHeight = templateHeight / 3; // Approximate ear portion
    const previewCenterY = templateTop + earHeight * 0.6; // Slightly below ear center
    const imageData = heartImages.get(template.design.id);
    if (imageData) {
      pdf.addImage(
        imageData,
        'PNG',
        pos.x - PREVIEW_SIZE / 2,
        previewCenterY - PREVIEW_SIZE / 2,
        PREVIEW_SIZE,
        PREVIEW_SIZE
      );
    }

    drawn++;
  }

  // Add footer with source attribution
  pdf.setFontSize(7);
  pdf.setTextColor(128);
  pdf.text(SITE_DOMAIN, PAGE_WIDTH / 2, PAGE_HEIGHT - 3, { align: 'center' });

  return drawn;
}

async function generatePDF(design: HeartDesign, options: PDFOptions = {}): Promise<jsPDF> {
  const lang = options.lang ?? 'da';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const heartImages = await prerenderHeartImages([design], previewSizePx());
  const templates = collectTemplates([design]);
  addTemplatesPage(pdf, templates, 0, true, heartImages, lang);

  return pdf;
}

/** "juletrae-template.pdf" — one heart's template, named after the heart. */
function singleFilename(design: HeartDesign): string {
  return `${slugify(design.name)}-template.pdf`;
}

export async function downloadPDF(design: HeartDesign, options: PDFOptions = {}) {
  const pdf = await generatePDF(design, options);
  pdf.save(singleFilename(design));
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
    ? await prerenderHeartImages(designs, templatePicturePixels(pieces))
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

      // Inside the rounded end, which no cut crosses and folding keeps whole:
      // a template cut out of the sheet still shows what it is and says where
      // it is from (a sheet often ends up far from the rest — a school, a workshop).
      const imageData = heartImages.get(piece.design.id);
      const ear = templateEar(piece, { picture: picture && imageData !== undefined, measure });
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
 * "klassisk-80mm.pdf": the heart, and the width it was printed at; for
 * several hearts (SELECTION.md) "julehjerter-3-skabeloner.pdf", the count.
 */
export function templatesFilename(
  designs: HeartDesign | readonly HeartDesign[],
  widthMm: number,
  lang: Language = 'da'
): string {
  const list = Array.isArray(designs) ? (designs as readonly HeartDesign[]) : [designs as HeartDesign];
  if (list.length > 1) return `${t('pdfMultiFilename', lang, { n: list.length })}.pdf`;
  return `${slugify(list[0]!.name)}-${widthMm}mm.pdf`;
}

export async function downloadTemplatesPDF(designs: HeartDesign[], options: TemplatesPDFOptions) {
  if (designs.length === 0) return;
  const pdf = await generateTemplatesPDF(designs, options);
  pdf.save(templatesFilename(designs, options.widthMm, options.lang));
}
