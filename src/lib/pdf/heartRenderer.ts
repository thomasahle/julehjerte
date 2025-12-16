import paperPkg from 'paper';
import { getColors, type HeartColors } from '$lib/stores/colors';
import type { HeartDesign } from '$lib/types/heart';
import {
  BASE_CENTER,
  STRIP_WIDTH,
  buildLobeShape,
  buildLobeStrips,
  buildOddWeaveMask,
  getOverlapParams,
  itemArea,
  lobeFillColor
} from '$lib/rendering/paperWeave';
import { fingerToSegments } from '$lib/geometry/bezierSegments';

const { PaperScope } = paperPkg;

const DEFAULT_CANVAS_SIZE = 300; // Larger preview size to prevent cropping
const REFERENCE_GRID_SIZE = 4;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function inferOverlapRect(design: HeartDesign) {
  const { width: expectedW, height: expectedH, left: centeredLeft, top: centeredTop } = getOverlapParams(design.gridSize, {
    x: BASE_CENTER,
    y: BASE_CENTER
  });

  const leftCandidates: number[] = [];
  const rightCandidates: number[] = [];
  const topCandidates: number[] = [];
  const bottomCandidates: number[] = [];

  for (const f of design.fingers) {
    const segs = fingerToSegments(f);
    if (!segs.length) continue;
    const start = segs[0]!.p0;
    const end = segs[segs.length - 1]!.p3;
    if (f.lobe === 'left') {
      leftCandidates.push(Math.min(start.x, end.x));
      rightCandidates.push(Math.max(start.x, end.x));
    } else {
      topCandidates.push(Math.min(start.y, end.y));
      bottomCandidates.push(Math.max(start.y, end.y));
    }
  }

  let left = leftCandidates.length ? median(leftCandidates) : centeredLeft;
  let right = rightCandidates.length ? median(rightCandidates) : centeredLeft + expectedW;
  let top = topCandidates.length ? median(topCandidates) : centeredTop;
  let bottom = bottomCandidates.length ? median(bottomCandidates) : centeredTop + expectedH;

  if (Math.abs(right - left - expectedW) <= 3) right = left + expectedW;
  if (Math.abs(bottom - top - expectedH) <= 3) bottom = top + expectedH;

  return { left, top, width: right - left, height: bottom - top };
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

  const { left: overlapLeft, top: overlapTop, width: overlapWidth, height: overlapHeight } = inferOverlapRect(design);

  // Scale everything to fit in our canvas using REFERENCE_GRID_SIZE for consistency
  // This ensures all hearts appear the same size regardless of grid size
  const referenceSquareSize = REFERENCE_GRID_SIZE * STRIP_WIDTH;
  const referenceExtent = (referenceSquareSize + referenceSquareSize / 2) * Math.SQRT2;
  const scale = (canvasSize * 0.85) / referenceExtent; // Use 85% of canvas, fixed scale

  const items: paper.Item[] = [];

  // Build lobes
  const leftLobe = buildLobeShape(paper, 'left', colors, overlapLeft, overlapTop, overlapWidth, overlapHeight);
  const rightLobe = buildLobeShape(paper, 'right', colors, overlapLeft, overlapTop, overlapWidth, overlapHeight);

  const prevInsert = paper.settings.insertItems;
  paper.settings.insertItems = false;
  const overlapSquare = new paper.Path.Rectangle(
    new paper.Point(overlapLeft, overlapTop),
    new paper.Size(overlapWidth, overlapHeight)
  );
  paper.settings.insertItems = prevInsert;

  // Base fill:
  // - Paint the left lobe (including overlap square) in left color.
  // - Paint the red-on-top regions as a single united shape to avoid AA seams
  //   where two red fills touch (the fold line when weave reaches it).
  leftLobe.fillColor = lobeFillColor(paper, 'left', colors);
  leftLobe.strokeColor = null;
  items.push(leftLobe);

  const rightOutsideOverlap = rightLobe.subtract(overlapSquare, { insert: false }) as paper.PathItem;
  rightLobe.remove();
  rightOutsideOverlap.fillColor = lobeFillColor(paper, 'right', colors);
  rightOutsideOverlap.strokeColor = null;

  // Build strips
  // Only even-index strips are needed for the even-odd weave mask.
  const leftStrips = buildLobeStrips(
    paper,
    'left',
    colors,
    design.fingers,
    overlapSquare,
    overlapLeft,
    overlapTop,
    overlapWidth,
    overlapHeight,
    true
  );
  const rightStrips = buildLobeStrips(
    paper,
    'right',
    colors,
    design.fingers,
    overlapSquare,
    overlapLeft,
    overlapTop,
    overlapWidth,
    overlapHeight,
    true
  );

  // Fast weave: even-odd fill rule (no boolean ops).
  // Render overlap in left color, then overlay odd-parity cells in right color.
  const oddMask = buildOddWeaveMask(paper, leftStrips, rightStrips);

  if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
    // Render oddMask and rightOutsideOverlap separately (not united).
    // Paper.js boolean operations don't correctly handle CompoundPath with
    // evenodd fill rule - unite() treats all child path areas as filled
    // rather than respecting the evenodd intersection semantics.
    oddMask.fillColor = lobeFillColor(paper, 'right', colors);
    oddMask.strokeColor = null;
    items.push(oddMask);

    rightOutsideOverlap.fillColor = lobeFillColor(paper, 'right', colors);
    rightOutsideOverlap.strokeColor = null;
    items.push(rightOutsideOverlap);
  } else {
    oddMask?.remove();
    items.push(rightOutsideOverlap);
  }

  overlapSquare.remove();

  // Group and transform
  const group = new paper.Group(items);
  group.rotate(45, new paper.Point(BASE_CENTER, BASE_CENTER));

  // Normalize size
  const normalizeScale = REFERENCE_GRID_SIZE / Math.max(design.gridSize.x, design.gridSize.y);
  if (normalizeScale !== 1) {
    group.scale(normalizeScale, new paper.Point(BASE_CENTER, BASE_CENTER));
  }

  // Scale and center in canvas
  group.scale(scale, new paper.Point(BASE_CENTER, BASE_CENTER));
  group.position = new paper.Point(canvasSize / 2, canvasSize / 2);

  // Force render
  paper.view.update();

  // Get data URL
  const dataURL = canvas.toDataURL('image/png');

  // Cleanup
  paper.project.clear();

  return dataURL;
}
