import type { Point, CubicBezierSegment, FingerPath } from '../types';

/**
 * Mirror a point across the vertical center axis (x = 0.5)
 * Used for symmetry between left and right lobes
 */
export function mirrorPointHorizontally(p: Point): Point {
  return {
    x: 1 - p.x,
    y: p.y
  };
}

/**
 * Mirror a point across the horizontal center axis (y = 0.5)
 * Used for symmetry within a lobe
 */
export function mirrorPointVertically(p: Point): Point {
  return {
    x: p.x,
    y: 1 - p.y
  };
}

/**
 * Mirror a point across both axes (180° rotation around center)
 */
export function mirrorPointDiagonally(p: Point): Point {
  return {
    x: 1 - p.x,
    y: 1 - p.y
  };
}

/**
 * Mirror a Bézier segment across the vertical center axis
 */
export function mirrorSegmentHorizontally(segment: CubicBezierSegment): CubicBezierSegment {
  return {
    p0: mirrorPointHorizontally(segment.p3), // swap start and end
    p1: mirrorPointHorizontally(segment.p2),
    p2: mirrorPointHorizontally(segment.p1),
    p3: mirrorPointHorizontally(segment.p0)
  };
}

/**
 * Mirror a Bézier segment across the horizontal center axis
 */
export function mirrorSegmentVertically(segment: CubicBezierSegment): CubicBezierSegment {
  return {
    p0: mirrorPointVertically(segment.p3),
    p1: mirrorPointVertically(segment.p2),
    p2: mirrorPointVertically(segment.p1),
    p3: mirrorPointVertically(segment.p0)
  };
}

/**
 * Mirror a complete finger path across the vertical axis
 * This creates the corresponding finger on the opposite lobe
 */
export function mirrorFingerPathHorizontally(path: FingerPath, newId: string): FingerPath {
  return {
    id: newId,
    lobe: path.lobe === 'left' ? 'right' : 'left',
    segments: path.segments.map(mirrorSegmentHorizontally).reverse(),
    startBorderT: 1 - path.endBorderT, // swap and mirror
    endBorderT: 1 - path.startBorderT
  };
}

/**
 * Mirror a complete finger path across the horizontal axis
 * This creates a mirrored finger within the same lobe
 */
export function mirrorFingerPathVertically(path: FingerPath, newId: string): FingerPath {
  return {
    id: newId,
    lobe: path.lobe,
    segments: path.segments.map(mirrorSegmentVertically).reverse(),
    startBorderT: 1 - path.endBorderT,
    endBorderT: 1 - path.startBorderT
  };
}

/**
 * Apply a transformation to a point based on symmetry settings
 */
export function applySymmetryToPoint(
  originalPoint: Point,
  delta: Point,
  mirrorHorizontal: boolean,
  mirrorVertical: boolean
): Point {
  let newPoint = {
    x: originalPoint.x + delta.x,
    y: originalPoint.y + delta.y
  };

  if (mirrorHorizontal) {
    newPoint = mirrorPointHorizontally(newPoint);
  }

  if (mirrorVertical) {
    newPoint = mirrorPointVertically(newPoint);
  }

  return newPoint;
}

/**
 * Generate IDs for mirrored paths
 */
export function getMirroredPathId(pathId: string, suffix: 'h' | 'v' | 'hv'): string {
  return `${pathId}_mirror_${suffix}`;
}

/**
 * Check if a path ID is a mirrored path
 */
export function isMirroredPath(pathId: string): boolean {
  return pathId.includes('_mirror_');
}

/**
 * Get the original path ID from a mirrored path ID
 */
export function getOriginalPathId(mirroredPathId: string): string {
  return mirroredPathId.split('_mirror_')[0];
}
