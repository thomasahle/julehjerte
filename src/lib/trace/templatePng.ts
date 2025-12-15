import type { Finger, Vec } from '$lib/types/heart';

type Rect = { x0: number; y0: number; x1: number; y1: number };
type BinaryMask = { data: Uint8Array; width: number; height: number };

export type PngTemplateLayout = 'single' | 'double';

export interface TracePngOptions {
  gridSize: number;
  layout: PngTemplateLayout;
  swapHalves?: boolean;
  maxDimension?: number;
}

type BezierSegment = { p0: Vec; p1: Vec; p2: Vec; p3: Vec };

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function computeSquare(gridSize: number) {
  const STRIP_WIDTH = 75;
  const BASE_CANVAS_SIZE = 600;
  const squareSize = gridSize * STRIP_WIDTH;
  const center = BASE_CANVAS_SIZE / 2;
  const squareLeft = center - squareSize / 2;
  const squareTop = center - squareSize / 2;
  return {
    center,
    squareSize,
    squareLeft,
    squareTop,
    squareRight: squareLeft + squareSize,
    squareBottom: squareTop + squareSize
  };
}

async function fileToImageData(file: File, maxDimension: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function otsuThreshold(hist: Uint32Array, total: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;

    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  return threshold;
}

function toBinaryMask(image: ImageData): BinaryMask {
  const { data, width, height } = image;
  const n = width * height;

  const hist = new Uint32Array(256);
  const gray = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const r = data[i * 4 + 0] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    const a = data[i * 4 + 3] ?? 255;
    if (a < 32) {
      gray[i] = 255;
      hist[255]++;
      continue;
    }
    const lum = Math.round((r * 2126 + g * 7152 + b * 722) / 10000);
    gray[i] = lum;
    hist[lum]++;
  }

  const thr = otsuThreshold(hist, n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    mask[i] = gray[i] < thr ? 1 : 0;
  }

  return { data: mask, width, height };
}

function rectWidth(r: Rect) {
  return Math.max(0, r.x1 - r.x0);
}

function rectHeight(r: Rect) {
  return Math.max(0, r.y1 - r.y0);
}

function findLongestRun(values: Uint32Array, threshold: number): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let runStart: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const on = values[i] >= threshold;
    if (on) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      const runEnd = i;
      if (!best || runEnd - runStart > best.end - best.start) {
        best = { start: runStart, end: runEnd };
      }
      runStart = null;
    }
  }
  if (runStart !== null) {
    const runEnd = values.length;
    if (!best || runEnd - runStart > best.end - best.start) {
      best = { start: runStart, end: runEnd };
    }
  }
  return best;
}

function findVerticalCutRoi(mask: BinaryMask, rect: Rect): Rect {
  const { data, width } = mask;
  const w = rectWidth(rect);
  const h = rectHeight(rect);
  if (w <= 0 || h <= 0) return rect;

  // Heuristic: many templates include a photo/decoration near the top that can dominate
  // thresholding. Focus ROI detection on the lower part where the cut lines live.
  // Start at 45% down to skip decorative elements at the top.
  const scanY0 = rect.y0 + Math.floor(h * 0.45);
  const scanY1 = rect.y1 - Math.floor(h * 0.05); // Also skip bottom margin
  const scanH = Math.max(1, scanY1 - scanY0);

  const xA = rect.x0 + Math.floor(w * 0.2);
  const xB = rect.x0 + Math.floor(w * 0.8);

  const rowSums = new Uint32Array(scanH);
  let maxRow = 0;

  for (let yy = 0; yy < scanH; yy++) {
    const y = scanY0 + yy;
    let sum = 0;
    const rowIdx = y * width;
    for (let x = xA; x < xB; x++) {
      sum += data[rowIdx + x] ?? 0;
    }
    rowSums[yy] = sum;
    if (sum > maxRow) maxRow = sum;
  }

  const rowThr = Math.max(12, Math.round(maxRow * 0.2));
  const run = findLongestRun(rowSums, rowThr);
  // Use the detected run to find where cut lines exist, but extend upward
  // to capture curved portions that may not be detected in the scan band.
  // Start from 35% down (after decorations) to the detected end.
  const y0 = rect.y0 + Math.floor(h * 0.35);
  const y1 = run ? scanY0 + run.end : scanY1;

  const yLen = Math.max(1, y1 - y0);
  const colSums = new Uint32Array(w);
  for (let xx = 0; xx < w; xx++) {
    const x = rect.x0 + xx;
    let sum = 0;
    for (let y = y0; y < y1; y++) {
      sum += data[y * width + x] ?? 0;
    }
    colSums[xx] = sum;
  }

  // Lower threshold for thin cut lines (they won't fill much of the column)
  const colThr = Math.max(8, Math.round(yLen * 0.15));
  let left = 0;
  while (left < w && colSums[left]! < colThr) left++;
  let right = w - 1;
  while (right >= 0 && colSums[right]! < colThr) right--;

  if (left >= right) {
    return { x0: rect.x0, y0, x1: rect.x1, y1 };
  }

  // Shrink significantly to exclude the template outline.
  // The outline is typically much thicker than cut lines and sits at the edges.
  const shrinkX = Math.max(5, Math.round((right - left) * 0.12));
  const shrinkY = Math.max(1, Math.round((y1 - y0) * 0.02));

  return {
    x0: rect.x0 + left + shrinkX,
    x1: rect.x0 + right - shrinkX,
    y0: y0 + shrinkY,
    y1: y1 - shrinkY
  };
}

function pickLineXs(mask: BinaryMask, roi: Rect, gridSize: number): number[] {
  const { data, width } = mask;
  const w = rectWidth(roi);
  const h = rectHeight(roi);
  if (w <= 0 || h <= 0) return [];

  // Scan middle-bottom region to find cut lines.
  // Some templates have cut lines that don't extend to the very bottom.
  const scanHeight = Math.max(10, Math.floor(h * 0.15));
  const scanY0 = roi.y1 - Math.floor(h * 0.3);

  // Count dark pixels in the scan region for each column.
  const bottomCounts = new Uint32Array(w);
  for (let xx = 0; xx < w; xx++) {
    const x = roi.x0 + xx;
    let count = 0;
    for (let y = scanY0; y < scanY0 + scanHeight; y++) {
      if (data[y * width + x]) count++;
    }
    bottomCounts[xx] = count;
  }

  // Also compute vertical run scores (longest run in each column).
  const colScores = new Uint32Array(w);
  for (let xx = 0; xx < w; xx++) {
    const x = roi.x0 + xx;
    let maxRun = 0;
    let currentRun = 0;
    for (let y = roi.y0; y < roi.y1; y++) {
      if (data[y * width + x]) {
        currentRun++;
        if (currentRun > maxRun) maxRun = currentRun;
      } else {
        currentRun = 0;
      }
    }
    colScores[xx] = maxRun;
  }

  // Combine: use vertical run score, with bonus for bottom presence.
  // This works for both vertical lines (strong runs) and diagonal lines (present at bottom).
  const colSums = new Uint32Array(w);
  for (let xx = 0; xx < w; xx++) {
    colSums[xx] = colScores[xx] + (bottomCounts[xx] > 0 ? bottomCounts[xx] * 2 : 0);
  }

  // Find peaks - actual line positions (not forced to be evenly spaced).
  const minGap = Math.max(10, Math.round(w / (gridSize + 1) * 0.4));
  const threshold = 10;
  const edgeMargin = Math.max(5, Math.round(w * 0.05));
  const peaks: { x: number; score: number }[] = [];

  for (let xx = edgeMargin; xx < w - edgeMargin; xx++) {
    const score = colSums[xx];
    if (score > threshold && score >= colSums[xx - 1] && score >= colSums[xx + 1]) {
      peaks.push({ x: roi.x0 + xx, score });
    }
  }

  // Sort by score and take top N with minimum gap.
  peaks.sort((a, b) => b.score - a.score);

  const selected: number[] = [];
  for (const peak of peaks) {
    if (selected.length >= gridSize - 1) break;
    const tooClose = selected.some((x) => Math.abs(x - peak.x) < minGap);
    if (!tooClose) {
      selected.push(peak.x);
    }
  }

  // Sort by x position.
  selected.sort((a, b) => a - b);

  // Fall back to evenly spaced if not enough peaks found.
  const stripW = w / gridSize;
  if (selected.length < gridSize - 1) {
    return Array.from({ length: gridSize - 1 }, (_, k) => roi.x0 + Math.round((k + 1) * stripW));
  }

  // Check if peaks are bunched together (likely watermark/outline artifacts).
  // Only fallback if there's a very small gap between consecutive peaks.
  const minExpectedGap = stripW * 0.4;
  if (selected.length >= 2) {
    for (let i = 1; i < selected.length; i++) {
      const gap = selected[i] - selected[i - 1];
      if (gap < minExpectedGap) {
        // Bunched peaks detected, use evenly spaced fallback
        return Array.from({ length: gridSize - 1 }, (_, k) => roi.x0 + Math.round((k + 1) * stripW));
      }
    }
  }

  return selected;
}

function movingAverage(values: number[], radius: number): number[] {
  if (radius <= 0) return values;
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j < 0 || j >= values.length) continue;
      sum += values[j] ?? 0;
      count++;
    }
    out[i] = count ? sum / count : values[i] ?? 0;
  }
  return out;
}

function traceVerticalLine(mask: BinaryMask, roi: Rect, startX: number, gridSize: number): Vec[] {
  const { data, width, height } = mask;
  const w = rectWidth(roi);
  const h = rectHeight(roi);
  const stripW = w / gridSize;
  const search = Math.max(3, Math.round(stripW * 0.2));
  const stepY = Math.max(1, Math.round(h / 220));

  // Pre-compute vertical run lengths for each pixel.
  // This helps us prefer pixels that are part of long vertical lines (cut lines)
  // over scattered pixels (noise, text).
  const runLength = new Uint16Array(width * height);
  for (let x = roi.x0; x < roi.x1; x++) {
    let run = 0;
    for (let y = roi.y1 - 1; y >= roi.y0; y--) {
      if (data[y * width + x]) {
        run++;
      } else {
        for (let yy = y + 1; yy <= y + run; yy++) {
          runLength[yy * width + x] = run;
        }
        run = 0;
      }
    }
    for (let yy = roi.y0; yy < roi.y0 + run; yy++) {
      runLength[yy * width + x] = run;
    }
  }

  const pts: Vec[] = [];
  let xCenter = startX;

  for (let y = roi.y1 - 1; y >= roi.y0; y -= stepY) {
    const rowIdx = y * width;
    const a = Math.max(roi.x0, Math.round(xCenter - search));
    const b = Math.min(roi.x1 - 1, Math.round(xCenter + search));

    // Weight pixels by their vertical run length (prefer line pixels over noise)
    let sumX = 0;
    let sumWeight = 0;
    for (let x = a; x <= b; x++) {
      const rl = runLength[rowIdx + x];
      if (rl > 5) {
        sumX += x * rl;
        sumWeight += rl;
      }
    }
    if (sumWeight > 0) {
      xCenter = sumX / sumWeight;
    }
    pts.push({ x: xCenter, y });
  }

  // Smooth x coordinates a bit.
  const xs = movingAverage(pts.map((p) => p.x), 2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    p.x = xs[i] ?? p.x;
  }

  return pts;
}

function pointLineDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function simplifyRdp(points: Vec[], epsilon: number): Vec[] {
  if (points.length <= 2) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<{ a: number; b: number }> = [{ a: 0, b: points.length - 1 }];

  while (stack.length) {
    const { a, b } = stack.pop()!;
    const pA = points[a]!;
    const pB = points[b]!;

    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointLineDistance(points[i]!, pA, pB);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }

    if (maxD > epsilon && idx !== -1) {
      keep[idx] = 1;
      stack.push({ a, b: idx }, { a: idx, b });
    }
  }

  const out: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

function catmullRomToBezier(points: Vec[]): BezierSegment[] {
  if (points.length < 2) return [];
  const segs: BezierSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p3 = points[i + 1]!;
    const pM = points[i - 1] ?? p0;
    const pP = points[i + 2] ?? p3;

    const p1: Vec = {
      x: p0.x + (p3.x - pM.x) / 6,
      y: p0.y + (p3.y - pM.y) / 6
    };
    const p2: Vec = {
      x: p3.x - (pP.x - p0.x) / 6,
      y: p3.y - (pP.y - p0.y) / 6
    };
    segs.push({ p0, p1, p2, p3 });
  }
  return segs;
}

function segmentsToPathData(segments: BezierSegment[]): string {
  if (segments.length === 0) return '';
  const fmt = (n: number) => Math.round(n * 10) / 10;

  let d = `M ${fmt(segments[0].p0.x)} ${fmt(segments[0].p0.y)}`;
  for (const seg of segments) {
    d += ` C ${fmt(seg.p1.x)} ${fmt(seg.p1.y)} ${fmt(seg.p2.x)} ${fmt(seg.p2.y)} ${fmt(seg.p3.x)} ${fmt(seg.p3.y)}`;
  }
  return d;
}

function mapPointToSquare(p: Vec, roi: Rect, gridSize: number): Vec {
  const { squareLeft, squareTop, squareSize } = computeSquare(gridSize);
  const rx = rectWidth(roi) || 1;
  const ry = rectHeight(roi) || 1;
  const nx = (p.x - roi.x0) / rx;
  const ny = (p.y - roi.y0) / ry;
  return { x: squareLeft + nx * squareSize, y: squareTop + ny * squareSize };
}

function rotate90CCW(p: Vec, center: number): Vec {
  const dx = p.x - center;
  const dy = p.y - center;
  return { x: center - dy, y: center + dx };
}

function buildFingerFromPoints(id: string, lobe: 'left' | 'right', points: Vec[]): Finger {
  if (points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 };
    return { id, lobe, p0: p, p1: p, p2: p, p3: p };
  }

  const simplified = simplifyRdp(points, 2.25);
  const segs = catmullRomToBezier(simplified);
  if (segs.length <= 1) {
    const seg = segs[0]!;
    return { id, lobe, p0: seg.p0, p1: seg.p1, p2: seg.p2, p3: seg.p3 };
  }

  const d = segmentsToPathData(segs);
  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  return {
    id,
    lobe,
    p0: first.p0,
    p1: first.p1,
    p2: first.p2,
    p3: last.p3,
    pathData: d
  };
}

function traceHalf(mask: BinaryMask, rect: Rect, gridSize: number) {
  const roi = findVerticalCutRoi(mask, rect);
  const xs = pickLineXs(mask, roi, gridSize);
  const lines = xs.map((x) => traceVerticalLine(mask, roi, x, gridSize));
  return { roi, lines };
}

function buildFingersForLobe(
  half: { roi: Rect; lines: Vec[][] },
  lobe: 'left' | 'right',
  gridSize: number
): Finger[] {
  const { center, squareLeft, squareTop, squareRight, squareBottom } = computeSquare(gridSize);

  const fingers: Finger[] = [];
  for (let i = 0; i < half.lines.length; i++) {
    const raw = half.lines[i] ?? [];
    let pts = raw.map((p) => mapPointToSquare(p, half.roi, gridSize));

    if (lobe === 'left') {
      pts = pts.map((p) => rotate90CCW(p, center)).reverse();
      if (pts[0]) pts[0] = { ...pts[0], x: squareRight };
      if (pts[pts.length - 1]) pts[pts.length - 1] = { ...pts[pts.length - 1], x: squareLeft };
    } else {
      if (pts[0]) pts[0] = { ...pts[0], y: squareBottom };
      if (pts[pts.length - 1]) pts[pts.length - 1] = { ...pts[pts.length - 1], y: squareTop };
    }

    fingers.push(buildFingerFromPoints(`${lobe === 'left' ? 'L' : 'R'}-${i}`, lobe, pts));
  }
  return fingers;
}

/**
 * Best-effort tracing of julehjerte strip boundaries from a PNG template image.
 *
 * Assumptions:
 * - The template cut lines are dark on a light background.
 * - The image contains either 1 half-template or 2 halves side-by-side.
 * - Both halves use vertical cut lines (common for printed templates).
 */
export async function traceHeartFromPng(
  file: File,
  options: TracePngOptions
): Promise<{ gridSize: number; fingers: Finger[] }> {
  const gridSize = clampInt(options.gridSize, 2, 8);
  const image = await fileToImageData(file, options.maxDimension ?? 900);
  const mask = toBinaryMask(image);

  const full: Rect = { x0: 0, y0: 0, x1: mask.width, y1: mask.height };

  let leftHalfRect: Rect = full;
  let rightHalfRect: Rect = full;
  if (options.layout === 'double') {
    const mid = Math.floor(mask.width / 2);
    leftHalfRect = { x0: 0, y0: 0, x1: mid, y1: mask.height };
    rightHalfRect = { x0: mid, y0: 0, x1: mask.width, y1: mask.height };
  }

  const leftHalf = traceHalf(mask, leftHalfRect, gridSize);
  const rightHalf = options.layout === 'double' ? traceHalf(mask, rightHalfRect, gridSize) : leftHalf;

  const swap = options.layout === 'double' && options.swapHalves;
  const lobeSource = swap ? rightHalf : leftHalf;
  const rightSource = swap ? leftHalf : rightHalf;

  const leftFingers = buildFingersForLobe(lobeSource, 'left', gridSize);
  const rightFingers = buildFingersForLobe(rightSource, 'right', gridSize);

  return { gridSize, fingers: [...leftFingers, ...rightFingers] };
}
