import paperPkg from 'paper';
import type { HeartDesign, Finger, Vec, LobeId } from '$lib/types/heart';

const { PaperScope } = paperPkg;

const CANVAS_SIZE = 300; // Larger preview size to prevent cropping
const CENTER: Vec = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
const LEFT_FILL = { r: 1, g: 1, b: 1, a: 1 }; // White
const RIGHT_FILL = { r: 0.85, g: 0.15, b: 0.15, a: 1 }; // Red
const REFERENCE_GRID_SIZE = 4;

function toPoint(paper: paper.PaperScope, v: Vec): paper.Point {
  return new paper.Point(v.x, v.y);
}

function lobeFillColor(paper: paper.PaperScope, lobe: LobeId) {
  return lobe === 'left'
    ? new paper.Color(LEFT_FILL.r, LEFT_FILL.g, LEFT_FILL.b, LEFT_FILL.a)
    : new paper.Color(RIGHT_FILL.r, RIGHT_FILL.g, RIGHT_FILL.b, RIGHT_FILL.a);
}

function buildLobeShape(
  paper: paper.PaperScope,
  kind: LobeId,
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

  lobe.fillColor = lobeFillColor(paper, kind);
  lobe.strokeColor = null;
  lobe.strokeWidth = 0;

  return lobe;
}

function buildFingerPath(paper: paper.PaperScope, finger: Finger): paper.Path {
  if (finger.pathData) {
    return new paper.Path(finger.pathData);
  }
  const path = new paper.Path();
  path.moveTo(toPoint(paper, finger.p0));
  path.cubicCurveTo(
    toPoint(paper, finger.p1),
    toPoint(paper, finger.p2),
    toPoint(paper, finger.p3)
  );
  return path;
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
  fingers: Finger[],
  overlap: paper.PathItem,
  squareLeft: number,
  squareTop: number,
  squareSize: number
): Array<{ index: number; item: paper.PathItem }> {
  const squareRight = squareLeft + squareSize;
  const squareBottom = squareTop + squareSize;

  const internal = fingers
    .filter((f) => f.lobe === lobe)
    .slice()
    .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x));

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
    const a = boundaries[i]();
    const b = boundaries[i + 1]();
    const strip = buildStripRegionBetween(paper, a, b, overlap);
    a.remove();
    b.remove();
    if (!strip || Math.abs(itemArea(strip)) < 1) {
      strip?.remove();
      continue;
    }
    strip.fillColor = lobeFillColor(paper, lobe);
    strip.strokeColor = null;
    strips.push({ index: i, item: strip });
  }
  return strips;
}

/**
 * Renders a heart design to a canvas and returns it as a data URL
 */
export async function renderHeartToDataURL(design: HeartDesign): Promise<string> {
  // Create an off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  // Create a new Paper.js scope for this render
  const paper = new PaperScope();
  paper.setup(canvas);
  paper.view.viewSize = new paper.Size(CANVAS_SIZE, CANVAS_SIZE);

  const STRIP_WIDTH = 50;
  const gridSize = design.gridSize;
  const squareSize = gridSize * STRIP_WIDTH;

  // Scale everything to fit in our canvas
  // After 45° rotation, the diagonal is sqrt(2) times larger
  // Heart extends squareSize + earRadius in each dimension before rotation
  const baseCenter = 300; // Original design center
  const heartExtent = (squareSize + squareSize / 2) * Math.SQRT2; // Rotated bounding box
  const scale = (CANVAS_SIZE * 0.85) / heartExtent; // Use 85% of canvas

  const squareLeft = baseCenter - squareSize / 2;
  const squareTop = baseCenter - squareSize / 2;
  const earRadius = squareSize / 2;

  const items: paper.Item[] = [];

  // Build lobes
  const leftLobe = buildLobeShape(paper, 'left', squareLeft, squareTop, squareSize, earRadius);
  const rightLobe = buildLobeShape(paper, 'right', squareLeft, squareTop, squareSize, earRadius);

  // Overlap and outside fills
  const overlap = leftLobe.intersect(rightLobe, { insert: false });
  const leftOutside = leftLobe.subtract(overlap, { insert: false });
  const rightOutside = rightLobe.subtract(overlap, { insert: false });
  leftLobe.remove();
  rightLobe.remove();

  leftOutside.fillColor = lobeFillColor(paper, 'left');
  leftOutside.strokeColor = null;
  rightOutside.fillColor = lobeFillColor(paper, 'right');
  rightOutside.strokeColor = null;
  items.push(leftOutside, rightOutside);

  // Build strips
  const leftStrips = buildLobeStrips(paper, 'left', design.fingers, overlap, squareLeft, squareTop, squareSize);
  const rightStrips = buildLobeStrips(paper, 'right', design.fingers, overlap, squareLeft, squareTop, squareSize);

  // Weave
  for (const l of leftStrips) {
    for (const r of rightStrips) {
      const inter = l.item.intersect(r.item, { insert: false });
      if (!inter || Math.abs(itemArea(inter)) < 1) {
        inter?.remove();
        continue;
      }
      const leftOnTop = (l.index + r.index) % 2 === 0;
      if (leftOnTop) {
        const fill = r.item.fillColor;
        const next = r.item.subtract(inter, { insert: false });
        next.fillColor = fill;
        next.strokeColor = null;
        r.item.remove();
        r.item = next;
      } else {
        const fill = l.item.fillColor;
        const next = l.item.subtract(inter, { insert: false });
        next.fillColor = fill;
        next.strokeColor = null;
        l.item.remove();
        l.item = next;
      }
      inter.remove();
    }
  }

  leftStrips.forEach((s) => items.push(s.item));
  rightStrips.forEach((s) => items.push(s.item));

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
  group.position = new paper.Point(CANVAS_SIZE / 2, CANVAS_SIZE / 2);

  // Force render
  paper.view.update();

  // Get data URL
  const dataURL = canvas.toDataURL('image/png');

  // Cleanup
  paper.project.clear();

  return dataURL;
}
