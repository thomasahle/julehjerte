import type { Point, LobeOutline } from '../types';
import { findClosestPointOnPath, getPointOnPath } from './heart';

/**
 * Constrain a point to lie on a lobe's border
 * Returns the constrained point and its t parameter
 */
export function constrainToBorder(
  point: Point,
  lobe: LobeOutline
): { point: Point; t: number } {
  const result = findClosestPointOnPath(lobe.pathPoints, point);
  return {
    point: result.point,
    t: result.t
  };
}

/**
 * Get a point on the lobe border at parameter t
 */
export function getPointOnBorder(lobe: LobeOutline, t: number): Point {
  return getPointOnPath(lobe.pathPoints, t);
}

/**
 * Check if a point is inside a lobe (approximate using ray casting)
 */
export function isPointInLobe(point: Point, lobe: LobeOutline): boolean {
  const points = lobe.pathPoints;
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is near the border of a lobe
 */
export function isPointNearBorder(
  point: Point,
  lobe: LobeOutline,
  threshold = 0.02
): boolean {
  const result = findClosestPointOnPath(lobe.pathPoints, point);
  return result.distance < threshold;
}

/**
 * Clamp a value to 0-1 range
 */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Clamp a point to the canvas bounds (0-1 normalized space)
 */
export function clampToCanvas(point: Point): Point {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y)
  };
}

/**
 * Calculate the distance between two points
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Linear interpolation between two points
 */
export function lerp(p1: Point, p2: Point, t: number): Point {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
  };
}

/**
 * Move a point towards a target by a maximum distance
 */
export function moveTowards(from: Point, to: Point, maxDist: number): Point {
  const d = distance(from, to);
  if (d <= maxDist) return to;

  const t = maxDist / d;
  return lerp(from, to, t);
}
