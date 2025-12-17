import paperPkg from 'paper';
import { getColors, type HeartColors } from '$lib/stores/colors';
import type { HeartDesign } from '$lib/types/heart';
import {
  BASE_CENTER,
  STRIP_WIDTH,
  buildLobeShape,
  buildLobeStrips,
  buildOddWeaveMask,
  itemArea,
  lobeFillColor
} from '$lib/rendering/paperWeave';
import { inferOverlapRect as inferOverlapRectShared } from '$lib/utils/overlapRect';

const { PaperScope } = paperPkg;

const DEFAULT_CANVAS_SIZE = 300; // Larger preview size to prevent cropping
const REFERENCE_GRID_SIZE = 4;

function inferOverlapRect(design: HeartDesign) {
  return inferOverlapRectShared(design.fingers, design.gridSize);
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

  // Build strips for the even-odd weave mask.
  // Alternate strips are sufficient; which cells are red-on-top is controlled by `weaveParity`.
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
    0
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
    (design.weaveParity ?? 0) as 0 | 1
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
