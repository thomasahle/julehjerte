import type { Finger, HeartDesign } from '$lib/types/heart';
import { segmentsToPathData } from '$lib/geometry/bezierSegments';
import { inferOverlapRect } from '$lib/utils/overlapRect';

export type TemplateLobe = 'left' | 'right';

export interface TemplateData {
  lobe: TemplateLobe;
  overlapTop: number;
  overlapLeft: number;
  overlapWidth: number;
  overlapHeight: number;
  earRadius: number;
  templateWidth: number;
  templateHeight: number;
  earPath: string;
  cutPaths: string[];
}

export interface TemplateSvgOptions {
  previewSvgs?: Array<{ viewBox: string; markup: string }>;
}

const DEFAULT_STROKE = '#333';
const DEFAULT_STROKE_WIDTH = 1.5;
const DEFAULT_DASH = '8 4';
const DEFAULT_PADDING = 20;
const DEFAULT_GAP = 24;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startX = cx + r * Math.cos(startAngle);
  const startY = cy + r * Math.sin(startAngle);
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
}

function transformPathData(
  pathData: string,
  overlapTop: number,
  overlapLeft: number,
  overlapWidth: number,
  overlapHeight: number,
  earRadius: number,
  lobe: TemplateLobe
): string {
  const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
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
        const newX = y - overlapTop;
        const newY = overlapWidth - (x - overlapLeft) + earRadius;
        result += `M ${newX} ${newY} `;
      } else {
        const newX = x - overlapLeft;
        const newY = y - overlapTop + earRadius;
        result += `M ${newX} ${newY} `;
      }
    } else if (type === 'C') {
      if (lobe === 'left') {
        const newArgs = [];
        for (let i = 0; i < args.length; i += 2) {
          const x = args[i];
          const y = args[i + 1];
          const newX = y - overlapTop;
          const newY = overlapWidth - (x - overlapLeft) + earRadius;
          newArgs.push(newX, newY);
        }
        result += `C ${newArgs.join(' ')} `;
      } else {
        const newArgs = [];
        for (let i = 0; i < args.length; i += 2) {
          const x = args[i];
          const y = args[i + 1];
          const newX = x - overlapLeft;
          const newY = y - overlapTop + earRadius;
          newArgs.push(newX, newY);
        }
        result += `C ${newArgs.join(' ')} `;
      }
    } else if (type === 'L') {
      const [x, y] = args;
      if (lobe === 'left') {
        const newX = y - overlapTop;
        const newY = overlapWidth - (x - overlapLeft) + earRadius;
        result += `L ${newX} ${newY} `;
      } else {
        const newX = x - overlapLeft;
        const newY = y - overlapTop + earRadius;
        result += `L ${newX} ${newY} `;
      }
    }
  }

  return result.trim();
}

function getTemplateDimensions(
  overlapWidth: number,
  overlapHeight: number,
  lobe: TemplateLobe
) {
  const earRadius = lobe === 'left' ? overlapHeight / 2 : overlapWidth / 2;
  const bodyWidth = lobe === 'left' ? overlapHeight : overlapWidth;
  const bodyHeight = lobe === 'left' ? overlapWidth : overlapHeight;
  return {
    earRadius,
    width: bodyWidth,
    height: bodyHeight + earRadius
  };
}

export function getTemplateData(design: HeartDesign, lobe: TemplateLobe): TemplateData {
  const rect = inferOverlapRect(design.fingers, design.gridSize);
  const overlapWidth = rect.width;
  const overlapHeight = rect.height;
  const { earRadius, width, height } = getTemplateDimensions(overlapWidth, overlapHeight, lobe);
  const earPath = arcPath(width / 2, earRadius, earRadius, Math.PI, 2 * Math.PI);
  const lobeFingers = design.fingers.filter((f: Finger) => f.lobe === lobe);
  const cutPaths = lobeFingers.map((finger) =>
    transformPathData(
      segmentsToPathData(finger.segments),
      rect.top,
      rect.left,
      overlapWidth,
      overlapHeight,
      earRadius,
      lobe
    )
  );

  return {
    lobe,
    overlapTop: rect.top,
    overlapLeft: rect.left,
    overlapWidth,
    overlapHeight,
    earRadius,
    templateWidth: width,
    templateHeight: height,
    earPath,
    cutPaths
  };
}

function renderTemplateGroup(
  data: TemplateData,
  offsetX: number,
  offsetY: number,
  stroke: string,
  strokeWidth: number,
  dash: string,
  previewSvg?: { viewBox: string; markup: string }
): string[] {
  const { lobe, earRadius, templateWidth, templateHeight, earPath, cutPaths } = data;

  const lines: string[] = [];
  lines.push(
    `  <g data-lobe="${lobe}" transform="translate(${offsetX} ${offsetY})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}">`
  );
  lines.push(`    <path d="${earPath}" />`);
  lines.push(`    <line x1="0" y1="${earRadius}" x2="0" y2="${templateHeight}" />`);
  lines.push(`    <line x1="${templateWidth}" y1="${earRadius}" x2="${templateWidth}" y2="${templateHeight}" />`);
  lines.push(
    `    <line x1="0" y1="${templateHeight}" x2="${templateWidth}" y2="${templateHeight}" stroke-dasharray="${dash}" />`
  );
  for (const pathD of cutPaths) {
    lines.push(`    <path d="${pathD}" />`);
  }
  if (previewSvg) {
    const previewSize = Math.min(templateWidth * 0.35, templateHeight * 0.25);
    const previewCenterX = templateWidth / 2;
    const previewCenterY = (templateHeight / 3) * 0.6;
    lines.push(
      `    <svg x="${previewCenterX - previewSize / 2}" y="${previewCenterY - previewSize / 2}" width="${previewSize}" height="${previewSize}" viewBox="${previewSvg.viewBox}" preserveAspectRatio="xMidYMid meet">${previewSvg.markup}</svg>`
    );
  }
  lines.push('  </g>');

  return lines;
}

export function serializeTemplateToSVG(
  design: HeartDesign,
  lobes: TemplateLobe[],
  options: TemplateSvgOptions = {}
): string {
  const templates: TemplateLobe[] = lobes.length ? lobes : ['left'];
  const templateData = templates.map((lobe) => getTemplateData(design, lobe));

  const maxWidth = Math.max(...templateData.map((item) => item.templateWidth));
  const totalHeight = templateData.reduce((sum, item) => sum + item.templateHeight, 0);
  const height = totalHeight + DEFAULT_PADDING * 2 + DEFAULT_GAP * (templateData.length - 1);
  const width = maxWidth + DEFAULT_PADDING * 2;

  const lines: string[] = [
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `  <title>${escapeXml(`${design.name} Template`)}</title>`
  ];

  let currentY = DEFAULT_PADDING;
  for (const [index, item] of templateData.entries()) {
    const x = DEFAULT_PADDING + (maxWidth - item.templateWidth) / 2;
    lines.push(
      ...renderTemplateGroup(
        item,
        x,
        currentY,
        DEFAULT_STROKE,
        DEFAULT_STROKE_WIDTH,
        DEFAULT_DASH,
        options.previewSvgs?.[index]
      )
    );
    currentY += item.templateHeight + DEFAULT_GAP;
  }

  lines.push('</svg>');
  return lines.join('\n');
}
