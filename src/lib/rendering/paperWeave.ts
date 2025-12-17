import type paperPkg from 'paper';
import type { Finger, GridSize, LobeId, Vec } from '../types/heart';
import { fingerToSegments } from '../geometry/bezierSegments';
import type { HeartColors } from '../stores/colors';
import { STRIP_WIDTH, BASE_CANVAS_SIZE, BASE_CENTER } from '../constants';
import { getCenteredRectParams } from '../utils/overlapRect';

// Re-export constants for backward compatibility
export { STRIP_WIDTH, BASE_CANVAS_SIZE, BASE_CENTER };

// Re-export getCenteredRectParams as getOverlapParams for backward compatibility
export { getCenteredRectParams as getOverlapParams };

export function toPoint(paper: paper.PaperScope, v: Vec): paper.Point {
  return new paper.Point(v.x, v.y);
}

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
      }
    : { r: 1, g: 1, b: 1 };
}

export function lobeFillColor(paper: paper.PaperScope, lobe: LobeId, colors: HeartColors) {
  const rgb = hexToRgb01(lobe === 'left' ? colors.left : colors.right);
  return new paper.Color(rgb.r, rgb.g, rgb.b, 1);
}

export function itemArea(item: paper.Item | null | undefined): number {
  const area = (item as unknown as { area?: number }).area;
  return typeof area === 'number' ? area : 0;
}

export function cleanupPathItem(paper: paper.PaperScope, item: paper.PathItem, minArea: number = 10): paper.PathItem {
  if (item.className !== 'CompoundPath') return item;
  const compound = item as paper.CompoundPath;
  const children = compound.children.slice();
  for (const child of children) {
    if (Math.abs(itemArea(child)) < minArea) child.remove();
  }
  if (compound.children.length === 1) {
    const single = compound.children[0] as paper.Path;
    single.fillColor = compound.fillColor;
    single.strokeColor = compound.strokeColor;
    single.strokeWidth = compound.strokeWidth;
    single.remove();
    compound.remove();
    return single;
  }
  return compound;
}

export function withInsertItemsDisabled<T>(paper: paper.PaperScope, fn: () => T): T {
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    return fn();
  } finally {
    paper.settings.insertItems = prev;
  }
}

export function buildLobeShape(
  paper: paper.PaperScope,
  kind: LobeId,
  colors: HeartColors,
  overlapLeft: number,
  overlapTop: number,
  overlapWidth: number,
  overlapHeight: number
): paper.PathItem {
  const overlapRect = new paper.Path.Rectangle(
    new paper.Point(overlapLeft, overlapTop),
    new paper.Size(overlapWidth, overlapHeight)
  );

  let semi: paper.PathItem;
  if (kind === 'left') {
    const earRadius = overlapHeight / 2;
    const ear = new paper.Path.Circle(new paper.Point(overlapLeft, overlapTop + overlapHeight / 2), earRadius);
    const cut = new paper.Path.Rectangle(
      new paper.Point(overlapLeft, overlapTop),
      new paper.Point(overlapLeft + earRadius, overlapTop + overlapHeight)
    );
    semi = ear.subtract(cut);
    ear.remove();
    cut.remove();
  } else {
    const earRadius = overlapWidth / 2;
    const ear = new paper.Path.Circle(new paper.Point(overlapLeft + overlapWidth / 2, overlapTop), earRadius);
    const cut = new paper.Path.Rectangle(
      new paper.Point(overlapLeft, overlapTop),
      new paper.Point(overlapLeft + overlapWidth, overlapTop + earRadius)
    );
    semi = ear.subtract(cut);
    ear.remove();
    cut.remove();
  }

  const lobe = overlapRect.unite(semi);
  overlapRect.remove();
  semi.remove();

  lobe.fillColor = lobeFillColor(paper, kind, colors);
  lobe.strokeColor = null;
  lobe.strokeWidth = 0;
  return lobe;
}

export function buildFingerPath(paper: paper.PaperScope, finger: Finger): paper.Path {
  const segs = fingerToSegments(finger);
  if (!segs.length) return new paper.Path();

  const path = new paper.Path();
  path.moveTo(toPoint(paper, segs[0]!.p0));
  for (const seg of segs) {
    path.cubicCurveTo(toPoint(paper, seg.p1), toPoint(paper, seg.p2), toPoint(paper, seg.p3));
  }
  return path;
}

function cloneSegment(paper: paper.PaperScope, seg: paper.Segment): paper.Segment {
  return new paper.Segment(seg.point.clone(), seg.handleIn.clone(), seg.handleOut.clone());
}

function reverseSegmentsInPlace(segments: paper.Segment[]) {
  segments.reverse();
  for (const seg of segments) {
    const tmp = seg.handleIn;
    seg.handleIn = seg.handleOut;
    seg.handleOut = tmp;
  }
}

function samplePath(path: paper.Path, samples: number): paper.Point[] {
  const length = path.length;
  if (!length) return [];
  const pts: paper.Point[] = [];
  const start = path.getPointAt(0) ?? path.firstSegment?.point?.clone();
  const end = path.getPointAt(length) ?? path.lastSegment?.point?.clone();
  if (start) pts.push(start);
  for (let i = 1; i < samples; i++) {
    const offset = (length * i) / samples;
    const pt = path.getPointAt(offset);
    if (pt) pts.push(pt);
  }
  if (end) pts.push(end);
  return pts;
}

function buildRibbonBetweenSampled(paper: paper.PaperScope, a: paper.Path, b: paper.Path, samples: number): paper.Path {
  const aPts = samplePath(a, samples);
  const bPts = samplePath(b, samples);
  const ribbon = new paper.Path();
  ribbon.addSegments(aPts.map((p) => new paper.Segment(p)));
  ribbon.addSegments(bPts.reverse().map((p) => new paper.Segment(p)));
  ribbon.closed = true;
  return ribbon;
}

export function buildStripRegionBetween(
  paper: paper.PaperScope,
  a: paper.Path,
  b: paper.Path,
  overlap: paper.PathItem
): paper.PathItem | null {
  return withInsertItemsDisabled(paper, () => {
    // Paper.js boolean ops internally flatten curves; sampling here makes the
    // strip geometry stable and consistent across renderers.
    const ribbon = buildRibbonBetweenSampled(paper, a, b, 80);
    const clipped = ribbon.intersect(overlap, { insert: false });
    ribbon.remove();
    return clipped ? cleanupPathItem(paper, clipped, 10) : null;
  });
}

export function buildLobeStrips(
  paper: paper.PaperScope,
  lobe: LobeId,
  colors: HeartColors,
  fingers: Finger[],
  overlap: paper.PathItem,
  overlapLeft: number,
  overlapTop: number,
  overlapWidth: number,
  overlapHeight: number,
  stripParity: 0 | 1 | null = null
): Array<{ index: number; item: paper.PathItem }> {
  const boundariesFingers = fingers
    .filter((f) => f.lobe === lobe)
    .map((finger) => {
      const segs = fingerToSegments(finger);
      const p0 = segs[0]?.p0 ?? { x: 0, y: 0 };
      return { finger, p0 };
    })
    .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x))
    .map(({ finger }) => finger);

  // `fingers` contains *all* boundary curves, including the two outer edges for each lobe.
  // This keeps rendering in sync with the editor model (and avoids implicit edge lines).
  const boundaries: Array<() => paper.Path> = boundariesFingers.map(
    (f) => () => buildFingerPath(paper, f)
  );

  const strips: Array<{ index: number; item: paper.PathItem }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (stripParity != null && i % 2 !== stripParity) continue;
    const a = boundaries[i]!();
    const b = boundaries[i + 1]!();
    const strip = buildStripRegionBetween(paper, a, b, overlap);
    a.remove();
    b.remove();
    if (!strip || Math.abs(itemArea(strip)) < 1) {
      strip?.remove();
      continue;
    }
    strip.fillColor = lobeFillColor(paper, lobe, colors);
    strip.strokeColor = null;
    strips.push({ index: i, item: strip });
  }

  return strips;
}

export function buildOddWeaveMask(
  paper: paper.PaperScope,
  leftStrips: Array<{ index: number; item: paper.PathItem }>,
  rightStrips: Array<{ index: number; item: paper.PathItem }>
): paper.PathItem | null {
  return withInsertItemsDisabled(paper, () => {
    const children = [
      ...leftStrips.map((s) => s.item),
      ...rightStrips.map((s) => s.item)
    ];
    if (!children.length) return null;
    const mask = new paper.CompoundPath({ children });
    mask.fillRule = 'evenodd';
    return cleanupPathItem(paper, mask, 10);
  });
}

export function buildEvenWeaveMask(
  paper: paper.PaperScope,
  overlap: paper.PathItem,
  oddMask: paper.PathItem
): paper.PathItem | null {
  return withInsertItemsDisabled(paper, () => {
    const even = overlap.subtract(oddMask, { insert: false });
    return even ? cleanupPathItem(paper, even, 10) : null;
  });
}
