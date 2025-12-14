import type { HeartState, FingerPath, CubicBezierSegment, Point } from './types';
import { createJulehjerteLobeOutline, getPointOnPath } from './geometry/heart';

/**
 * Create a default heart state with the specified grid size
 * Default is 2 fingers per lobe to match traditional julehjerter
 */
export function createDefaultHeart(gridSize = 2): HeartState {
  const leftLobe = createJulehjerteLobeOutline('left');
  const rightLobe = createJulehjerteLobeOutline('right');

  const fingers: Record<string, FingerPath> = {};

  // Create default fingers for each column
  for (let col = 0; col < gridSize; col++) {
    const leftFinger = createDefaultFinger(`L-${col}`, 'left', col, gridSize, leftLobe.pathPoints, rightLobe.pathPoints);
    const rightFinger = createDefaultFinger(`R-${col}`, 'right', col, gridSize, rightLobe.pathPoints, leftLobe.pathPoints);

    fingers[leftFinger.id] = leftFinger;
    fingers[rightFinger.id] = rightFinger;
  }

  return {
    gridSize,
    lobes: {
      left: leftLobe,
      right: rightLobe
    },
    fingers,
    symmetry: {
      betweenLobes: false,
      withinLobe: false
    }
  };
}

/**
 * Create a single default finger path
 * Fingers run horizontally across the rotated rectangle lobes.
 */
function createDefaultFinger(
  id: string,
  lobe: 'left' | 'right',
  rowIndex: number,
  gridSize: number,
  ownLobePoints: Point[],
  oppositeLobePoints: Point[]
): FingerPath {
  // Match the simple lobe geometry (rectangle + semicircle, rotated 45°)
  const lobeWidth = 0.22;
  const lobeHeight = 0.50;
  const tipX = 0.5;
  const tipY = 0.85;
  const rotationAngle = lobe === 'left' ? -Math.PI / 4 : Math.PI / 4;

  // Helper to transform local coords to world coords (same as in heart.ts)
  function transformPoint(localX: number, localY: number): Point {
    const rotatedX = localX * Math.cos(rotationAngle) - localY * Math.sin(rotationAngle);
    const rotatedY = localX * Math.sin(rotationAngle) + localY * Math.cos(rotationAngle);
    const pivotLocalX = lobe === 'left' ? lobeWidth / 2 : -lobeWidth / 2;
    const pivotLocalY = lobeHeight;
    const pivotRotatedX = pivotLocalX * Math.cos(rotationAngle) - pivotLocalY * Math.sin(rotationAngle);
    const pivotRotatedY = pivotLocalX * Math.sin(rotationAngle) + pivotLocalY * Math.cos(rotationAngle);
    return {
      x: tipX + rotatedX - pivotRotatedX,
      y: tipY + rotatedY - pivotRotatedY
    };
  }

  // Fingers are evenly spaced along the rectangle height
  const fingerSpacing = 1.0 / (gridSize + 1);
  const fingerT = (rowIndex + 1) * fingerSpacing;

  // In local coordinates, finger goes from outer edge to inner edge at a certain Y
  const localY = fingerT * lobeHeight;  // 0 at top, lobeHeight at bottom

  // Start on outer edge (-lobeWidth/2 for left, +lobeWidth/2 for right)
  const outerLocalX = lobe === 'left' ? -lobeWidth / 2 : lobeWidth / 2;
  // End on inner edge (+lobeWidth/2 for left, -lobeWidth/2 for right)
  // But extend a bit past center for overlap
  const innerLocalX = lobe === 'left' ? lobeWidth / 2 + 0.05 : -lobeWidth / 2 - 0.05;

  const startPoint = transformPoint(outerLocalX, localY);
  const endPoint = transformPoint(innerLocalX, localY);

  // Create the curved path segment (slight curve for visual interest)
  const segment = createFingerSegment(startPoint, endPoint, lobe, rowIndex, gridSize);

  // Find the t values on the lobe border (approximation)
  const startBorderT = findClosestBorderT(startPoint, ownLobePoints);
  const endBorderT = findClosestBorderT(endPoint, oppositeLobePoints);

  return {
    id,
    lobe,
    segments: [segment],
    startBorderT,
    endBorderT
  };
}

/**
 * Create a Bézier segment for a finger
 * Fingers are mostly horizontal with a slight bow for visual interest
 */
function createFingerSegment(
  start: Point,
  end: Point,
  lobe: 'left' | 'right',
  rowIndex: number,
  gridSize: number
): CubicBezierSegment {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Add a slight downward bow to the finger
  const bowAmount = 0.03;

  return {
    p0: start,
    p1: {
      x: start.x + dx * 0.33,
      y: start.y + dy * 0.33 + bowAmount
    },
    p2: {
      x: start.x + dx * 0.67,
      y: start.y + dy * 0.67 + bowAmount
    },
    p3: end
  };
}

/**
 * Add a new finger path to the heart
 */
export function addFingerPath(
  heart: HeartState,
  startPoint: Point,
  endPoint: Point,
  lobe: 'left' | 'right'
): HeartState {
  const id = `${lobe[0].toUpperCase()}-${Date.now()}`;

  // Find the border parameters for start and end
  const ownLobePoints = heart.lobes[lobe].pathPoints;
  const oppositeLobe = lobe === 'left' ? 'right' : 'left';
  const oppositeLobePoints = heart.lobes[oppositeLobe].pathPoints;

  // For now, use simple estimates
  const startBorderT = findClosestBorderT(startPoint, ownLobePoints);
  const endBorderT = findClosestBorderT(endPoint, oppositeLobePoints);

  const segment: CubicBezierSegment = {
    p0: startPoint,
    p1: {
      x: startPoint.x + (endPoint.x - startPoint.x) * 0.33,
      y: startPoint.y + (endPoint.y - startPoint.y) * 0.33
    },
    p2: {
      x: startPoint.x + (endPoint.x - startPoint.x) * 0.67,
      y: startPoint.y + (endPoint.y - startPoint.y) * 0.67
    },
    p3: endPoint
  };

  const newFinger: FingerPath = {
    id,
    lobe,
    segments: [segment],
    startBorderT,
    endBorderT
  };

  return {
    ...heart,
    fingers: {
      ...heart.fingers,
      [id]: newFinger
    }
  };
}

/**
 * Remove a finger path from the heart
 */
export function removeFingerPath(heart: HeartState, fingerId: string): HeartState {
  const { [fingerId]: removed, ...remainingFingers } = heart.fingers;
  return {
    ...heart,
    fingers: remainingFingers
  };
}

/**
 * Update a finger path's segment
 */
export function updateFingerSegment(
  heart: HeartState,
  fingerId: string,
  segmentIndex: number,
  segment: CubicBezierSegment
): HeartState {
  const finger = heart.fingers[fingerId];
  if (!finger) return heart;

  const newSegments = [...finger.segments];
  newSegments[segmentIndex] = segment;

  return {
    ...heart,
    fingers: {
      ...heart.fingers,
      [fingerId]: {
        ...finger,
        segments: newSegments
      }
    }
  };
}

/**
 * Update a single control point on a finger path
 */
export function updateControlPoint(
  heart: HeartState,
  fingerId: string,
  segmentIndex: number,
  pointKey: 'p0' | 'p1' | 'p2' | 'p3',
  newPosition: Point
): HeartState {
  const finger = heart.fingers[fingerId];
  if (!finger) return heart;

  const segment = finger.segments[segmentIndex];
  if (!segment) return heart;

  // Constrain endpoints to their respective lobe borders
  let constrainedPosition = newPosition;
  let startBorderT = finger.startBorderT;
  let endBorderT = finger.endBorderT;

  if (pointKey === 'p0' || pointKey === 'p3') {
    const isStart = pointKey === 'p0';
    const lobeId = isStart ? finger.lobe : finger.lobe === 'left' ? 'right' : 'left';
    const lobePoints = heart.lobes[lobeId].pathPoints;
    const { point, t } = projectToBorder(newPosition, lobePoints);
    constrainedPosition = point;
    if (isStart) {
      startBorderT = t;
    } else {
      endBorderT = t;
    }
  }

  const newSegment = {
    ...segment,
    [pointKey]: constrainedPosition
  };

  const nextHeart = updateFingerSegment(heart, fingerId, segmentIndex, newSegment);

  // Persist updated border params if an endpoint moved
  if (pointKey === 'p0' || pointKey === 'p3') {
    return {
      ...nextHeart,
      fingers: {
        ...nextHeart.fingers,
        [fingerId]: {
          ...nextHeart.fingers[fingerId],
          startBorderT,
          endBorderT
        }
      }
    };
  }

  return nextHeart;
}

/**
 * Find the closest border parameter (t) for a point on a path
 */
function findClosestBorderT(point: Point, pathPoints: Point[]): number {
  let minDist = Infinity;
  let bestT = 0;

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dist = dx * dx + dy * dy;

    if (dist < minDist) {
      minDist = dist;
      bestT = i / (pathPoints.length - 1);
    }
  }

  return bestT;
}

/**
 * Project an arbitrary point to the closest point on a border path
 * Returns both the snapped point and its parameter t (0-1)
 */
function projectToBorder(point: Point, pathPoints: Point[]): { point: Point; t: number } {
  let minDist = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < pathPoints.length; i++) {
    const p = pathPoints[i];
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dist = dx * dx + dy * dy;

    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }

  return {
    point: pathPoints[bestIdx],
    t: bestIdx / Math.max(1, pathPoints.length - 1)
  };
}

/**
 * Translate an entire finger by a delta, then re-clamp endpoints to borders
 */
export function translateFinger(
  heart: HeartState,
  fingerId: string,
  delta: Point
): HeartState {
  const finger = heart.fingers[fingerId];
  if (!finger) return heart;

  const translatedSegments = finger.segments.map(seg => ({
    p0: { x: seg.p0.x + delta.x, y: seg.p0.y + delta.y },
    p1: { x: seg.p1.x + delta.x, y: seg.p1.y + delta.y },
    p2: { x: seg.p2.x + delta.x, y: seg.p2.y + delta.y },
    p3: { x: seg.p3.x + delta.x, y: seg.p3.y + delta.y }
  }));

  // Re-clamp endpoints to lobe borders
  const startLobePoints = heart.lobes[finger.lobe].pathPoints;
  const endLobeId = finger.lobe === 'left' ? 'right' : 'left';
  const endLobePoints = heart.lobes[endLobeId].pathPoints;

  const startClamp = projectToBorder(translatedSegments[0].p0, startLobePoints);
  const endClamp = projectToBorder(
    translatedSegments[translatedSegments.length - 1].p3,
    endLobePoints
  );

  translatedSegments[0].p0 = startClamp.point;
  translatedSegments[translatedSegments.length - 1].p3 = endClamp.point;

  const updatedHeart = updateFingerSegment(
    heart,
    fingerId,
    0,
    translatedSegments[0]
  );

  // Replace remaining segments (if any)
  let currentHeart = updatedHeart;
  for (let i = 1; i < translatedSegments.length; i++) {
    currentHeart = updateFingerSegment(currentHeart, fingerId, i, translatedSegments[i]);
  }

  return {
    ...currentHeart,
    fingers: {
      ...currentHeart.fingers,
      [fingerId]: {
        ...currentHeart.fingers[fingerId],
        segments: translatedSegments,
        startBorderT: startClamp.t,
        endBorderT: endClamp.t
      }
    }
  };
}

/**
 * Update the grid size and regenerate fingers
 */
export function setGridSize(heart: HeartState, newGridSize: number): HeartState {
  return createDefaultHeart(newGridSize);
}
