import paperPkg from 'paper';
import type { HeartDesign, Finger, Vec, LobeId } from '$lib/types/heart';
import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';
import { getColors, type HeartColors } from '$lib/stores/colors';

const { PaperScope } = paperPkg;

const DEFAULT_CANVAS_SIZE = 300; // Larger preview size to prevent cropping
const REFERENCE_GRID_SIZE = 4;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
      }
    : { r: 1, g: 1, b: 1 };
}

function toPoint(paper: paper.PaperScope, v: Vec): paper.Point {
  return new paper.Point(v.x, v.y);
}

function lobeFillColor(paper: paper.PaperScope, lobe: LobeId, colors: HeartColors) {
  const rgb = hexToRgb(lobe === 'left' ? colors.left : colors.right);
  return new paper.Color(rgb.r, rgb.g, rgb.b, 1);
}

function buildLobeShape(
  paper: paper.PaperScope,
  kind: LobeId,
  colors: HeartColors,
  squareLeft: number,
  squareTop: number,
  squareSize: number,
  earRadius: number
): paper.PathItem {
  const squareRect = new paper.Path.Rectangle(
    new paper.Point(squareLeft, squareTop),
    new paper.Size(squareSize, squareSize)
  );

  let semi: paper.PathItem;
  if (kind === 'left') {
    const ear = new paper.Path.Circle(
      new paper.Point(squareLeft, squareTop + squareSize / 2),
      earRadius
    );
    const cut = new paper.Path.Rectangle(
      new paper.Point(squareLeft, squareTop),
      new paper.Point(squareLeft + earRadius, squareTop + squareSize)
    );
    semi = ear.subtract(cut);
    ear.remove();
    cut.remove();
  } else {
    const ear = new paper.Path.Circle(
      new paper.Point(squareLeft + squareSize / 2, squareTop),
      earRadius
    );
    const cut = new paper.Path.Rectangle(
      new paper.Point(squareLeft, squareTop),
      new paper.Point(squareLeft + squareSize, squareTop + earRadius)
    );
    semi = ear.subtract(cut);
    ear.remove();
    cut.remove();
  }

  const lobe = squareRect.unite(semi);
  squareRect.remove();
  semi.remove();

  lobe.fillColor = lobeFillColor(paper, kind, colors);
  lobe.strokeColor = null;
  lobe.strokeWidth = 0;

  return lobe;
}

function buildFingerPath(paper: paper.PaperScope, finger: Finger): paper.Path {
  return new paper.Path(finger.pathData);
}

function samplePath(path: paper.Path, samples: number): paper.Point[] {
  const length = path.length;
  if (!length) return [];
  const pts: paper.Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const offset = (length * i) / samples;
    const pt = path.getPointAt(offset);
    if (pt) pts.push(pt);
  }
  return pts;
}

function buildRibbonBetween(
  paper: paper.PaperScope,
  a: paper.Path,
  b: paper.Path,
  samples = 40
): paper.Path {
  const aPts = samplePath(a, samples);
  const bPts = samplePath(b, samples);
  const ribbon = new paper.Path();
  ribbon.addSegments(aPts.map((p) => new paper.Segment(p)));
  ribbon.addSegments(bPts.reverse().map((p) => new paper.Segment(p)));
  ribbon.closed = true;
  return ribbon;
}

function itemArea(item: paper.Item | null | undefined): number {
  const area = (item as unknown as { area?: number }).area;
  return typeof area === 'number' ? area : 0;
}

// Clean up compound paths by removing very small children (artifacts from boolean ops)
function cleanupPath(paper: paper.PaperScope, item: paper.PathItem, minArea: number = 10): paper.PathItem {
  if (item.className === 'CompoundPath') {
    const compound = item as paper.CompoundPath;
    const children = compound.children.slice();
    for (const child of children) {
      if (Math.abs(itemArea(child)) < minArea) {
        child.remove();
      }
    }
    // If only one child left, return it directly
    if (compound.children.length === 1) {
      const single = compound.children[0] as paper.Path;
      single.fillColor = compound.fillColor;
      single.remove();
      compound.remove();
      return single;
    }
  }
  return item;
}

function buildStripRegionBetween(
  paper: paper.PaperScope,
  a: paper.Path,
  b: paper.Path,
  overlap: paper.PathItem
): paper.PathItem | null {
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    const ribbon = buildRibbonBetween(paper, a, b, 60);
    const clipped = ribbon.intersect(overlap, { insert: false });
    ribbon.remove();
    return clipped;
  } finally {
    paper.settings.insertItems = prev;
  }
}

function buildLobeStrips(
  paper: paper.PaperScope,
  lobe: LobeId,
  colors: HeartColors,
  fingers: Finger[],
  overlap: paper.PathItem,
  squareLeft: number,
  squareTop: number,
  squareSize: number,
  onlyEvenStrips = false
): Array<{ index: number; item: paper.PathItem }> {
  const squareRight = squareLeft + squareSize;
  const squareBottom = squareTop + squareSize;

  const internal = fingers
    .filter((f) => f.lobe === lobe)
    .map((finger) => {
      const segs = parsePathDataToSegments(finger.pathData);
      const p0 = segs[0]?.p0 ?? { x: 0, y: 0 };
      return { finger, p0 };
    })
    .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x))
    .map(({ finger }) => finger);

  const boundaries: Array<() => paper.Path> = [];

  if (lobe === 'left') {
    boundaries.push(
      () =>
        new paper.Path.Line(
          new paper.Point(squareRight, squareTop),
          new paper.Point(squareLeft, squareTop)
        )
    );
    internal.forEach((f) => boundaries.push(() => buildFingerPath(paper, f)));
    boundaries.push(
      () =>
        new paper.Path.Line(
          new paper.Point(squareRight, squareBottom),
          new paper.Point(squareLeft, squareBottom)
        )
    );
  } else {
    boundaries.push(
      () =>
        new paper.Path.Line(
          new paper.Point(squareLeft, squareBottom),
          new paper.Point(squareLeft, squareTop)
        )
    );
    internal.forEach((f) => boundaries.push(() => buildFingerPath(paper, f)));
    boundaries.push(
      () =>
        new paper.Path.Line(
          new paper.Point(squareRight, squareBottom),
          new paper.Point(squareRight, squareTop)
        )
    );
  }

  const strips: Array<{ index: number; item: paper.PathItem }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (onlyEvenStrips && i % 2 === 1) continue;
    const a = boundaries[i]();
    const b = boundaries[i + 1]();
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

function buildOddWeaveMask(
  paper: paper.PaperScope,
  leftStrips: Array<{ index: number; item: paper.PathItem }>,
  rightStrips: Array<{ index: number; item: paper.PathItem }>
): paper.PathItem | null {
  // Odd parity cells are where (leftIndex + rightIndex) % 2 === 1.
  // Represent as XOR(L_even, R_even) via even-odd fill rule (no boolean ops).
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    const children = [
      ...leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item),
      ...rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item)
    ];
    if (!children.length) return null;
    const mask = new paper.CompoundPath({ children });
    mask.fillRule = 'evenodd';
    return mask;
  } finally {
    paper.settings.insertItems = prev;
  }
}

/**
 * Renders a heart design to a canvas and returns it as a data URL
 */
export async function renderHeartToDataURL(
  design: HeartDesign,
  options: { size?: number; colors?: HeartColors } = {}
): Promise<string> {
  const canvasSize = options.size ?? DEFAULT_CANVAS_SIZE;
  const colors = options.colors ?? getColors();

  // Create an off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  // Create a new Paper.js scope for this render
  const paper = new PaperScope();
  paper.setup(canvas);
  paper.view.viewSize = new paper.Size(canvasSize, canvasSize);

  const STRIP_WIDTH = 75;
  const gridSize = design.gridSize;
  const squareSize = gridSize * STRIP_WIDTH;

  // Scale everything to fit in our canvas using REFERENCE_GRID_SIZE for consistency
  // This ensures all hearts appear the same size regardless of grid size
  const baseCenter = 300; // Original design center
  const referenceSquareSize = REFERENCE_GRID_SIZE * STRIP_WIDTH;
  const referenceExtent = (referenceSquareSize + referenceSquareSize / 2) * Math.SQRT2;
  const scale = (canvasSize * 0.85) / referenceExtent; // Use 85% of canvas, fixed scale

  const squareLeft = baseCenter - squareSize / 2;
  const squareTop = baseCenter - squareSize / 2;
  const earRadius = squareSize / 2;

  const items: paper.Item[] = [];

  // Build lobes
  const leftLobe = buildLobeShape(paper, 'left', colors, squareLeft, squareTop, squareSize, earRadius);
  const rightLobe = buildLobeShape(paper, 'right', colors, squareLeft, squareTop, squareSize, earRadius);

  // Overlap and outside fills
  const overlap = leftLobe.intersect(rightLobe, { insert: false });
  const leftOutside = leftLobe.subtract(overlap, { insert: false });
  const rightOutside = rightLobe.subtract(overlap, { insert: false });
  leftLobe.remove();
  rightLobe.remove();

  leftOutside.fillColor = lobeFillColor(paper, 'left', colors);
  leftOutside.strokeColor = null;
  rightOutside.fillColor = lobeFillColor(paper, 'right', colors);
  rightOutside.strokeColor = null;
  items.push(leftOutside, rightOutside);

  // Build strips
  // Only even-index strips are needed for the even-odd weave mask.
  const leftStrips = buildLobeStrips(paper, 'left', colors, design.fingers, overlap, squareLeft, squareTop, squareSize, true);
  const rightStrips = buildLobeStrips(paper, 'right', colors, design.fingers, overlap, squareLeft, squareTop, squareSize, true);

  // Fast weave: even-odd fill rule (no boolean ops).
  // Render overlap in left color, then overlay odd-parity cells in right color.
  const oddMask = buildOddWeaveMask(paper, leftStrips, rightStrips);

  overlap.fillColor = lobeFillColor(paper, 'left', colors);
  overlap.strokeColor = null;
  items.push(overlap);

  if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
    oddMask.fillColor = lobeFillColor(paper, 'right', colors);
    oddMask.strokeColor = null;
    items.push(oddMask);
  } else {
    oddMask?.remove();
  }

  // Group and transform
  const group = new paper.Group(items);
  group.rotate(45, new paper.Point(baseCenter, baseCenter));

  // Normalize size
  const normalizeScale = REFERENCE_GRID_SIZE / gridSize;
  if (normalizeScale !== 1) {
    group.scale(normalizeScale, new paper.Point(baseCenter, baseCenter));
  }

  // Scale and center in canvas
  group.scale(scale, new paper.Point(baseCenter, baseCenter));
  group.position = new paper.Point(canvasSize / 2, canvasSize / 2);

  // Force render
  paper.view.update();

  // Get data URL
  const dataURL = canvas.toDataURL('image/png');

  // Cleanup
  paper.project.clear();

  return dataURL;
}
