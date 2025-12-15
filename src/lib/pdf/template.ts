import { jsPDF } from 'jspdf';
import type { HeartDesign, Finger, Vec } from '$lib/types/heart';
import { renderHeartToDataURL } from './heartRenderer';
import { SITE_DOMAIN } from '$lib/config';

const STRIP_WIDTH = 75;
const CENTER = { x: 300, y: 300 };

// A4 dimensions in mm
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 10;

// Layout modes for PDF generation
export type LayoutMode = 'small' | 'medium' | 'large';

const LAYOUTS = {
  small: { cols: 4, rows: 4 },   // 16 per page
  medium: { cols: 3, rows: 3 },  // 9 per page
  large: { cols: 2, rows: 2 }    // 4 per page
};

export interface PDFOptions {
  layout?: LayoutMode;
}

// Calculate template dimensions based on layout mode
function getTemplateDimensions(layout: LayoutMode) {
  const COMPACT_MARGIN = 5;
  const FOOTER_HEIGHT = 5;
  const availableWidth = PAGE_WIDTH - COMPACT_MARGIN * 2;
  const availableHeight = PAGE_HEIGHT - COMPACT_MARGIN * 2 - FOOTER_HEIGHT;

  const { cols, rows } = LAYOUTS[layout];

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

interface LobeParams {
  squareLeft: number;
  squareTop: number;
  squareSize: number;
  earRadius: number;
}

function getSquareParams(gridSize: number): LobeParams {
  const squareSize = gridSize * STRIP_WIDTH;
  const squareLeft = CENTER.x - squareSize / 2;
  const squareTop = CENTER.y - squareSize / 2;
  const earRadius = squareSize / 2;
  return { squareSize, squareLeft, squareTop, earRadius };
}

// Check if two fingers have the same curve (mirrored between lobes)
function fingersAreSymmetric(leftFingers: Finger[], rightFingers: Finger[]): boolean {
  if (leftFingers.length !== rightFingers.length) return false;

  // For symmetric hearts, left finger curves should mirror right finger curves
  // This is a simplified check - could be made more precise
  for (let i = 0; i < leftFingers.length; i++) {
    const left = leftFingers[i];
    const right = rightFingers[i];

    // If either has pathData, they need to match (or be equivalent when mirrored)
    if (left.pathData || right.pathData) {
      // For now, if pathData exists, assume they might be different
      if (left.pathData !== right.pathData) return false;
    }

    // Check if control points are mirrored
    // Left lobe: horizontal curves, Right lobe: vertical curves
    // For a symmetric heart, p1.y offset from center should equal p1.x offset for right
    const { squareLeft, squareTop, squareSize } = getSquareParams(3); // Use base params
    const cx = squareLeft + squareSize / 2;
    const cy = squareTop + squareSize / 2;

    // Simple symmetry check: control point offsets should be similar
    const leftP1Offset = Math.abs(left.p1.y - left.p0.y);
    const rightP1Offset = Math.abs(right.p1.x - right.p0.x);

    if (Math.abs(leftP1Offset - rightP1Offset) > 5) return false;
  }

  return true;
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

// Draw a cubic bezier curve using line segments
function drawBezier(
  pdf: jsPDF,
  p0: Vec,
  p1: Vec,
  p2: Vec,
  p3: Vec,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const segments = 20;
  const points: Vec[] = [];

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
}

// Transform SVG path data coordinates for template rotation
function transformPathData(
  pathData: string,
  squareTop: number,
  squareLeft: number,
  squareSize: number,
  lobe: 'left' | 'right'
): string {
  const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
  const earRadius = squareSize / 2;
  let result = '';

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (type === 'M') {
      const [x, y] = args;
      if (lobe === 'left') {
        // Rotate 90° counterclockwise, then shift down by earRadius for ear at top
        // new_x = y - squareTop, new_y = squareLeft + squareSize - x + earRadius
        const newX = y - squareTop;
        const newY = squareLeft + squareSize - x + earRadius;
        result += `M ${newX} ${newY} `;
      } else {
        // Right lobe: just translate to local coordinates
        const newX = x - squareLeft;
        const newY = y - squareTop + earRadius;
        result += `M ${newX} ${newY} `;
      }
    } else if (type === 'C') {
      // Cubic bezier: C x1 y1 x2 y2 x y
      if (lobe === 'left') {
        const newArgs = [];
        for (let i = 0; i < args.length; i += 2) {
          const x = args[i];
          const y = args[i + 1];
          const newX = y - squareTop;
          const newY = squareLeft + squareSize - x + earRadius;
          newArgs.push(newX, newY);
        }
        result += `C ${newArgs.join(' ')} `;
      } else {
        const newArgs = [];
        for (let i = 0; i < args.length; i += 2) {
          const x = args[i];
          const y = args[i + 1];
          const newX = x - squareLeft;
          const newY = y - squareTop + earRadius;
          newArgs.push(newX, newY);
        }
        result += `C ${newArgs.join(' ')} `;
      }
    } else if (type === 'L') {
      const [x, y] = args;
      if (lobe === 'left') {
        const newX = y - squareTop;
        const newY = squareLeft + squareSize - x + earRadius;
        result += `L ${newX} ${newY} `;
      } else {
        const newX = x - squareLeft;
        const newY = y - squareTop + earRadius;
        result += `L ${newX} ${newY} `;
      }
    }
  }

  return result.trim();
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

// Draw a single lobe template (vertical orientation with ear at top)
function drawLobeTemplate(
  pdf: jsPDF,
  design: HeartDesign,
  lobe: 'left' | 'right',
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number
) {
  const { squareLeft, squareTop, squareSize, earRadius } = getSquareParams(design.gridSize);

  // Calculate scale to fit template in available space
  // Template is squareSize wide and squareSize + earRadius tall
  const templateWidth = squareSize;
  const templateHeight = squareSize + earRadius;

  const scaleX = maxWidth / templateWidth;
  const scaleY = maxHeight / templateHeight;
  const scale = Math.min(scaleX, scaleY) * 0.95; // Use 95% to leave minimal padding

  // Calculate offset to center the template
  const scaledWidth = templateWidth * scale;
  const scaledHeight = templateHeight * scale;
  const offsetX = centerX - scaledWidth / 2;
  const offsetY = centerY - scaledHeight / 2;

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
      if (finger.pathData) {
        // Transform pathData: rotate 90° counterclockwise
        // new_x = y - squareTop, new_y = squareLeft + squareSize - x + earRadius
        const transformedPath = transformPathData(finger.pathData, squareTop, squareLeft, squareSize, 'left');
        drawSVGPath(pdf, transformedPath, offsetX, offsetY, scale);
      } else {
        // Transform: rotate 90° counterclockwise, then shift down by earRadius to account for ear at top
        const transformedP0 = { x: finger.p0.y - squareTop, y: squareLeft + squareSize - finger.p0.x + earRadius };
        const transformedP1 = { x: finger.p1.y - squareTop, y: squareLeft + squareSize - finger.p1.x + earRadius };
        const transformedP2 = { x: finger.p2.y - squareTop, y: squareLeft + squareSize - finger.p2.x + earRadius };
        const transformedP3 = { x: finger.p3.y - squareTop, y: squareLeft + squareSize - finger.p3.x + earRadius };
        drawBezier(pdf, transformedP0, transformedP1, transformedP2, transformedP3, offsetX, offsetY, scale);
      }
    }
  } else {
    // Right lobe is already oriented correctly (ear at top)
    // Just need to adjust coordinates

    // Semicircle at top (center at bottom of arc, arc extends upward)
    drawArc(
      pdf,
      squareSize / 2,
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
      if (finger.pathData) {
        // Transform pathData to local coordinates
        const transformedPath = transformPathData(finger.pathData, squareTop, squareLeft, squareSize, 'right');
        drawSVGPath(pdf, transformedPath, offsetX, offsetY, scale);
      } else {
        // Transform to local coordinates (relative to template origin)
        const localP0 = { x: finger.p0.x - squareLeft, y: finger.p0.y - squareTop + earRadius };
        const localP1 = { x: finger.p1.x - squareLeft, y: finger.p1.y - squareTop + earRadius };
        const localP2 = { x: finger.p2.x - squareLeft, y: finger.p2.y - squareTop + earRadius };
        const localP3 = { x: finger.p3.x - squareLeft, y: finger.p3.y - squareTop + earRadius };
        drawBezier(pdf, localP0, localP1, localP2, localP3, offsetX, offsetY, scale);
      }
    }
  }
}

// Pre-render heart images for all unique designs
async function prerenderHeartImages(designs: HeartDesign[]): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const uniqueDesigns = [...new Map(designs.map(d => [d.id, d])).values()];

  for (const design of uniqueDesigns) {
    try {
      const dataURL = await renderHeartToDataURL(design);
      imageMap.set(design.id, dataURL);
    } catch (e) {
      console.error(`Failed to render heart ${design.id}:`, e);
    }
  }

  return imageMap;
}

interface TemplateSlot {
  design: HeartDesign;
  lobe: 'left' | 'right' | 'both';
}

// Collect templates needed for all designs
function collectTemplates(designs: HeartDesign[]): TemplateSlot[] {
  const templates: TemplateSlot[] = [];

  for (const design of designs) {
    const leftFingers = design.fingers.filter(f => f.lobe === 'left');
    const rightFingers = design.fingers.filter(f => f.lobe === 'right');

    if (fingersAreSymmetric(leftFingers, rightFingers)) {
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
  layout: LayoutMode = 'medium'
): number {
  if (!isFirstPage) {
    pdf.addPage();
  }

  // Get dimensions based on layout mode
  const { width: TEMPLATE_WIDTH, height: TEMPLATE_HEIGHT, cols, rows, margin: COMPACT_MARGIN, footerHeight: FOOTER_HEIGHT } = getTemplateDimensions(layout);

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
  const HEADER_SPACE = 4; // Space for name text

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
      : `${template.design.name} (${template.lobe === 'left' ? 'Venstre' : 'Højre'})`;
    pdf.text(label, pos.x, slotTop + HEADER_SPACE, { align: 'center' });

    // Calculate template dimensions to position preview inside the ear
    const templateTop = slotTop + HEADER_SPACE + 2;
    const templateHeight = slotBottom - templateTop;
    const templateCenterY = templateTop + templateHeight / 2;

    // Draw the template first
    const lobeToUse = template.lobe === 'both' ? 'right' : template.lobe;
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

export async function generatePDF(design: HeartDesign, options: PDFOptions = {}): Promise<jsPDF> {
  const layout = options.layout ?? 'medium';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const heartImages = await prerenderHeartImages([design]);
  const templates = collectTemplates([design]);
  addTemplatesPage(pdf, templates, 0, true, heartImages, layout);

  return pdf;
}

export async function generateMultiPDF(designs: HeartDesign[], options: PDFOptions = {}): Promise<jsPDF> {
  const layout = options.layout ?? 'medium';

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const heartImages = await prerenderHeartImages(designs);
  const templates = collectTemplates(designs);
  let index = 0;
  let isFirst = true;

  while (index < templates.length) {
    const drawn = addTemplatesPage(pdf, templates, index, isFirst, heartImages, layout);
    index += drawn;
    isFirst = false;
  }

  return pdf;
}

export async function downloadPDF(design: HeartDesign, options: PDFOptions = {}) {
  const pdf = await generatePDF(design, options);
  pdf.save(`${design.name.toLowerCase().replace(/\s+/g, '-')}-template.pdf`);
}

export async function downloadMultiPDF(designs: HeartDesign[], options: PDFOptions = {}) {
  if (designs.length === 0) return;

  const pdf = await generateMultiPDF(designs, options);
  const filename = designs.length === 1
    ? `${designs[0].name.toLowerCase().replace(/\s+/g, '-')}-template.pdf`
    : `julehjerter-${designs.length}-templates.pdf`;
  pdf.save(filename);
}
