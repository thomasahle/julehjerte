import type { Point, LobeOutline } from '../types';

// Canvas dimensions (normalized 0-1 will be scaled to these)
export const CANVAS_WIDTH = 600;
export const CANVAS_HEIGHT = 600;

// Heart shape parameters
const HEART_CENTER_X = 0.5;
const HEART_TOP_Y = 0.15;
const HEART_BOTTOM_Y = 0.9;
const HEART_LOBE_WIDTH = 0.35;

/**
 * Generate a heart-shaped lobe outline using cubic Bézier approximation
 * The heart is made of two lobes that overlap in the middle
 */
export function createLobeOutline(side: 'left' | 'right'): LobeOutline {
  const points: Point[] = [];
  const steps = 100;

  // Mirror x for right side
  const mirrorX = (x: number) => side === 'left' ? x : 1 - x;

  // The lobe is roughly a rounded rectangle with a curved top (half circle)
  // and a pointed bottom that meets at the heart's tip

  // Start from the top center and go around
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x: number, y: number;

    if (t < 0.25) {
      // Top curve (half circle for the lobe)
      const angle = Math.PI * (1 - t * 4); // PI to 0
      const cx = HEART_CENTER_X - HEART_LOBE_WIDTH / 2;
      const cy = HEART_TOP_Y + HEART_LOBE_WIDTH / 2;
      x = cx + (HEART_LOBE_WIDTH / 2) * Math.cos(angle);
      y = cy - (HEART_LOBE_WIDTH / 2) * Math.sin(angle);
    } else if (t < 0.5) {
      // Right side going down
      const localT = (t - 0.25) / 0.25;
      x = HEART_CENTER_X;
      y = HEART_TOP_Y + HEART_LOBE_WIDTH / 2 + localT * (HEART_BOTTOM_Y - HEART_TOP_Y - HEART_LOBE_WIDTH / 2);
    } else if (t < 0.75) {
      // Bottom point (the tip of the heart)
      const localT = (t - 0.5) / 0.25;
      x = HEART_CENTER_X - localT * HEART_LOBE_WIDTH;
      y = HEART_BOTTOM_Y - localT * (HEART_BOTTOM_Y - HEART_TOP_Y - HEART_LOBE_WIDTH) * 0.3;
    } else {
      // Left side going up
      const localT = (t - 0.75) / 0.25;
      x = HEART_CENTER_X - HEART_LOBE_WIDTH + localT * (HEART_LOBE_WIDTH / 2);
      y = HEART_TOP_Y + HEART_LOBE_WIDTH / 2 + (1 - localT) * (HEART_BOTTOM_Y - HEART_TOP_Y - HEART_LOBE_WIDTH);
    }

    points.push({ x: mirrorX(x), y });
  }

  return {
    id: side,
    pathPoints: points
  };
}

/**
 * Generate a proper julehjerter lobe shape
 *
 * SIMPLE APPROACH:
 * 1. Draw a rectangle + semicircle in local coordinates
 * 2. Rotate the whole thing 45° outward
 * 3. Position it so the bottom corners meet at the heart tip
 */
export function createJulehjerteLobeOutline(side: 'left' | 'right'): LobeOutline {
  const points: Point[] = [];
  const steps = 80;

  // Lobe dimensions (in local coordinates before rotation)
  const lobeWidth = 0.22;      // Width of the rectangle part
  const lobeHeight = 0.50;     // Height of the rectangle part
  const earRadius = lobeWidth / 2;  // Semicircle radius = half the width

  // Rotation angle: 45° outward
  const rotationAngle = side === 'left' ? -Math.PI / 4 : Math.PI / 4;
  // Nudge lobes inward to create overlap at the center
  const overlapOffset = lobeWidth * 0.25;

  // The heart tip position (where both lobes meet)
  const tipX = 0.5;
  const tipY = 0.85;

  // Helper to rotate a point around origin, then translate
  function transformPoint(localX: number, localY: number): Point {
    // Rotate
    const rotatedX = localX * Math.cos(rotationAngle) - localY * Math.sin(rotationAngle);
    const rotatedY = localX * Math.sin(rotationAngle) + localY * Math.cos(rotationAngle);

    // The bottom-inner corner of the lobe should be at the tip
    // After rotation, we translate so that point lands at (tipX, tipY)
    // The bottom-inner corner in local coords is at (lobeWidth/2, lobeHeight) for left
    // and (-lobeWidth/2, lobeHeight) for right
    const pivotLocalX = side === 'left' ? lobeWidth / 2 : -lobeWidth / 2;
    const pivotLocalY = lobeHeight;
    const pivotRotatedX = pivotLocalX * Math.cos(rotationAngle) - pivotLocalY * Math.sin(rotationAngle);
    const pivotRotatedY = pivotLocalX * Math.sin(rotationAngle) + pivotLocalY * Math.cos(rotationAngle);

    return {
      x: tipX + rotatedX - pivotRotatedX + (side === 'left' ? overlapOffset : -overlapOffset),
      y: tipY + rotatedY - pivotRotatedY
    };
  }

  // Draw the shape in local coordinates (rectangle + semicircle on top)
  // Local coordinate system: origin at center of rectangle bottom edge
  // x: -lobeWidth/2 to +lobeWidth/2
  // y: 0 (bottom) to lobeHeight (top of rectangle), then semicircle above

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let localX: number, localY: number;

    if (t < 0.25) {
      // SEMICIRCLE (top of lobe)
      // Goes from one side to the other, bulging upward
      const localT = t / 0.25;
      const angle = Math.PI * (1 - localT);  // π to 0 (counterclockwise from left to right)
      localX = earRadius * Math.cos(angle);
      localY = -earRadius * Math.sin(angle);  // Semicircle at top (y=0 is bottom in local)

    } else if (t < 0.50) {
      // RIGHT EDGE (outer edge for left lobe, inner for right)
      const localT = (t - 0.25) / 0.25;
      localX = lobeWidth / 2;
      localY = localT * lobeHeight;

    } else if (t < 0.75) {
      // BOTTOM EDGE (just connects the two bottom corners through the tip area)
      const localT = (t - 0.50) / 0.25;
      localX = lobeWidth / 2 - localT * lobeWidth;
      localY = lobeHeight;

    } else {
      // LEFT EDGE (inner edge for left lobe, outer for right)
      const localT = (t - 0.75) / 0.25;
      localX = -lobeWidth / 2;
      localY = lobeHeight - localT * lobeHeight;
    }

    points.push(transformPoint(localX, localY));
  }

  return {
    id: side,
    pathPoints: points
  };
}

/**
 * Convert normalized coordinates (0-1) to screen coordinates
 */
export function toScreen(p: Point, width = CANVAS_WIDTH, height = CANVAS_HEIGHT): Point {
  return {
    x: p.x * width,
    y: p.y * height
  };
}

/**
 * Convert screen coordinates to normalized (0-1)
 */
export function fromScreen(x: number, y: number, width = CANVAS_WIDTH, height = CANVAS_HEIGHT): Point {
  return {
    x: x / width,
    y: y / height
  };
}

/**
 * Get the total length of a path (approximate)
 */
export function getPathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

/**
 * Get a point along a path at parameter t (0-1)
 */
export function getPointOnPath(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  const totalLength = getPathLength(points);
  const targetLength = t * totalLength;

  let accumulatedLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (accumulatedLength + segmentLength >= targetLength) {
      const localT = (targetLength - accumulatedLength) / segmentLength;
      return {
        x: points[i - 1].x + localT * dx,
        y: points[i - 1].y + localT * dy
      };
    }

    accumulatedLength += segmentLength;
  }

  return points[points.length - 1];
}

/**
 * Find the closest point on a path to a given point
 * Returns the t parameter (0-1) along the path
 */
export function findClosestPointOnPath(points: Point[], target: Point): { t: number; point: Point; distance: number } {
  let minDistance = Infinity;
  let bestT = 0;
  let bestPoint = points[0];

  const totalLength = getPathLength(points);
  let accumulatedLength = 0;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];

    // Find closest point on this segment
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (segmentLength === 0) continue;

    // Project target onto line segment
    const t = Math.max(0, Math.min(1,
      ((target.x - p1.x) * dx + (target.y - p1.y) * dy) / (segmentLength * segmentLength)
    ));

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;

    const distX = target.x - closestX;
    const distY = target.y - closestY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (distance < minDistance) {
      minDistance = distance;
      bestPoint = { x: closestX, y: closestY };
      bestT = (accumulatedLength + t * segmentLength) / totalLength;
    }

    accumulatedLength += segmentLength;
  }

  return { t: bestT, point: bestPoint, distance: minDistance };
}
