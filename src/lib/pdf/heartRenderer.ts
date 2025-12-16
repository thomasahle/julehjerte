import paperPkg from 'paper';
import { getColors, type HeartColors } from '$lib/stores/colors';
import type { HeartDesign } from '$lib/types/heart';
import {
  BASE_CENTER,
  STRIP_WIDTH,
  buildLobeShape,
  buildLobeStrips,
  buildOddWeaveMask,
  getSquareParams,
  itemArea,
  lobeFillColor
} from '$lib/rendering/paperWeave';

const { PaperScope } = paperPkg;

const DEFAULT_CANVAS_SIZE = 300; // Larger preview size to prevent cropping
const REFERENCE_GRID_SIZE = 4;

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

  const gridSize = design.gridSize;
  const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(gridSize, {
    x: BASE_CENTER,
    y: BASE_CENTER
  });

  // Scale everything to fit in our canvas using REFERENCE_GRID_SIZE for consistency
  // This ensures all hearts appear the same size regardless of grid size
  const referenceSquareSize = REFERENCE_GRID_SIZE * STRIP_WIDTH;
  const referenceExtent = (referenceSquareSize + referenceSquareSize / 2) * Math.SQRT2;
  const scale = (canvasSize * 0.85) / referenceExtent; // Use 85% of canvas, fixed scale

  const items: paper.Item[] = [];

  // Build lobes
  const leftLobe = buildLobeShape(paper, 'left', colors, squareLeft, squareTop, squareSize, earRadius);
  const rightLobe = buildLobeShape(paper, 'right', colors, squareLeft, squareTop, squareSize, earRadius);

  const prevInsert = paper.settings.insertItems;
  paper.settings.insertItems = false;
  const overlapSquare = new paper.Path.Rectangle(new paper.Point(squareLeft, squareTop), new paper.Size(squareSize, squareSize));
  paper.settings.insertItems = prevInsert;

  // Base fill:
  // - Paint the left lobe (including overlap square) in left color.
  // - Paint only the right lobe *outside* the overlap square in right color.
  // This avoids anti-alias seams along the overlap boundary from two adjacent
  // fills meeting edge-to-edge.
  leftLobe.fillColor = lobeFillColor(paper, 'left', colors);
  leftLobe.strokeColor = null;
  items.push(leftLobe);

  const rightOutsideOverlap = rightLobe.subtract(overlapSquare, { insert: false });
  rightLobe.remove();
  rightOutsideOverlap.fillColor = lobeFillColor(paper, 'right', colors);
  rightOutsideOverlap.strokeColor = null;
  items.push(rightOutsideOverlap);

  // Build strips
  // Only even-index strips are needed for the even-odd weave mask.
  const leftStrips = buildLobeStrips(paper, 'left', colors, design.fingers, overlapSquare, squareLeft, squareTop, squareSize, true);
  const rightStrips = buildLobeStrips(paper, 'right', colors, design.fingers, overlapSquare, squareLeft, squareTop, squareSize, true);

  // Fast weave: even-odd fill rule (no boolean ops).
  // Render overlap in left color, then overlay odd-parity cells in right color.
  const oddMask = buildOddWeaveMask(paper, leftStrips, rightStrips);

  if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
    oddMask.fillColor = lobeFillColor(paper, 'right', colors);
    oddMask.strokeColor = null;

    const clip = overlapSquare.clone({ insert: false }) as paper.PathItem;
    clip.clipMask = true;
    clip.fillColor = null;
    clip.strokeColor = null;
    const clipCenter = new paper.Point(squareLeft + squareSize / 2, squareTop + squareSize / 2);
    const clipInsetPx = 0;
    const clipScale = (squareSize - clipInsetPx) / squareSize;
    clip.scale(clipScale, clipCenter);
    const clippedOdd = new paper.Group([clip, oddMask]);
    items.push(clippedOdd);
  } else {
    oddMask?.remove();
  }

  overlapSquare.remove();

  // Group and transform
  const group = new paper.Group(items);
  group.rotate(45, new paper.Point(BASE_CENTER, BASE_CENTER));

  // Normalize size
  const normalizeScale = REFERENCE_GRID_SIZE / gridSize;
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
