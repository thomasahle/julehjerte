import { Bezier } from 'bezier-js';
import type { Point, CubicBezierSegment } from '../types';

/**
 * Create a Bezier.js instance from our segment type
 */
export function toBezierJs(segment: CubicBezierSegment): Bezier {
  return new Bezier(
    segment.p0.x, segment.p0.y,
    segment.p1.x, segment.p1.y,
    segment.p2.x, segment.p2.y,
    segment.p3.x, segment.p3.y
  );
}

/**
 * Sample points along a cubic Bézier segment
 */
export function sampleBezier(segment: CubicBezierSegment, steps = 50): Point[] {
  const bezier = toBezierJs(segment);
  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = bezier.get(t);
    points.push({ x: pt.x, y: pt.y });
  }

  return points;
}

/**
 * Sample points along multiple chained Bézier segments
 */
export function sampleBezierPath(segments: CubicBezierSegment[], stepsPerSegment = 30): Point[] {
  const points: Point[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segmentPoints = sampleBezier(segments[i], stepsPerSegment);
    // Skip first point of subsequent segments to avoid duplicates
    const startIdx = i === 0 ? 0 : 1;
    for (let j = startIdx; j < segmentPoints.length; j++) {
      points.push(segmentPoints[j]);
    }
  }

  return points;
}

/**
 * Get a point on a Bézier curve at parameter t
 */
export function getPointOnBezier(segment: CubicBezierSegment, t: number): Point {
  const bezier = toBezierJs(segment);
  const pt = bezier.get(t);
  return { x: pt.x, y: pt.y };
}

/**
 * Get the derivative (tangent) at parameter t
 */
export function getTangentOnBezier(segment: CubicBezierSegment, t: number): Point {
  const bezier = toBezierJs(segment);
  const d = bezier.derivative(t);
  return { x: d.x, y: d.y };
}

/**
 * Get the normal at parameter t
 */
export function getNormalOnBezier(segment: CubicBezierSegment, t: number): Point {
  const bezier = toBezierJs(segment);
  const n = bezier.normal(t);
  return { x: n.x, y: n.y };
}

/**
 * Find intersections between a Bézier curve and a horizontal line
 */
export function intersectBezierWithHorizontal(segment: CubicBezierSegment, y: number): Point[] {
  const bezier = toBezierJs(segment);

  // Create a horizontal line from x=-1 to x=2 (well beyond normalized space)
  const line = { p1: { x: -1, y }, p2: { x: 2, y } };

  const intersections = bezier.intersects(line);
  const points: Point[] = [];

  // intersections is an array of t values
  if (Array.isArray(intersections)) {
    for (const t of intersections) {
      const tNum = typeof t === 'string' ? parseFloat(t) : t;
      if (tNum >= 0 && tNum <= 1) {
        const pt = bezier.get(tNum);
        points.push({ x: pt.x, y: pt.y });
      }
    }
  }

  return points;
}

/**
 * Find intersections between two Bézier curves
 */
export function intersectBezierCurves(seg1: CubicBezierSegment, seg2: CubicBezierSegment): Point[] {
  const b1 = toBezierJs(seg1);
  const b2 = toBezierJs(seg2);

  const intersections = b1.intersects(b2);
  const points: Point[] = [];

  if (Array.isArray(intersections)) {
    for (const pair of intersections) {
      const t1 =
        typeof pair === 'string'
          ? parseFloat(pair.split('/')[0] ?? '')
          : typeof pair === 'number'
            ? pair
            : NaN;
      if (!isNaN(t1) && t1 >= 0 && t1 <= 1) {
        const pt = b1.get(t1);
        points.push({ x: pt.x, y: pt.y });
      }
    }
  }

  return points;
}

/**
 * Split a Bézier curve at parameter t
 */
export function splitBezier(segment: CubicBezierSegment, t: number): [CubicBezierSegment, CubicBezierSegment] {
  const bezier = toBezierJs(segment);
  const { left, right } = bezier.split(t);

  const toSegment = (b: Bezier): CubicBezierSegment => ({
    p0: { x: b.points[0].x, y: b.points[0].y },
    p1: { x: b.points[1].x, y: b.points[1].y },
    p2: { x: b.points[2].x, y: b.points[2].y },
    p3: { x: b.points[3].x, y: b.points[3].y }
  });

  return [toSegment(left), toSegment(right)];
}

/**
 * Get the bounding box of a Bézier curve
 */
export function getBezierBBox(segment: CubicBezierSegment): { x: number; y: number; width: number; height: number } {
  const bezier = toBezierJs(segment);
  const bbox = bezier.bbox();

  return {
    x: bbox.x.min,
    y: bbox.y.min,
    width: bbox.x.max - bbox.x.min,
    height: bbox.y.max - bbox.y.min
  };
}

/**
 * Get the approximate length of a Bézier curve
 */
export function getBezierLength(segment: CubicBezierSegment): number {
  const bezier = toBezierJs(segment);
  return bezier.length();
}

/**
 * Find the closest point on a Bézier curve to a target point
 */
export function closestPointOnBezier(segment: CubicBezierSegment, target: Point): { t: number; point: Point; distance: number } {
  const bezier = toBezierJs(segment);
  const projection = bezier.project(target);

  return {
    t: projection.t ?? 0,
    point: { x: projection.x, y: projection.y },
    distance: projection.d ?? Math.sqrt(
      Math.pow(projection.x - target.x, 2) + Math.pow(projection.y - target.y, 2)
    )
  };
}

/**
 * Create a simple straight-line Bézier segment between two points
 */
export function createLinearBezier(start: Point, end: Point): CubicBezierSegment {
  // Control points at 1/3 and 2/3 along the line
  return {
    p0: start,
    p1: {
      x: start.x + (end.x - start.x) / 3,
      y: start.y + (end.y - start.y) / 3
    },
    p2: {
      x: start.x + (end.x - start.x) * 2 / 3,
      y: start.y + (end.y - start.y) * 2 / 3
    },
    p3: end
  };
}

/**
 * Create a curved Bézier segment between two points with some curvature
 */
export function createCurvedBezier(start: Point, end: Point, curvature = 0.3): CubicBezierSegment {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Perpendicular offset for curvature
  const perpX = -dy * curvature;
  const perpY = dx * curvature;

  return {
    p0: start,
    p1: {
      x: start.x + dx / 3 + perpX,
      y: start.y + dy / 3 + perpY
    },
    p2: {
      x: start.x + dx * 2 / 3 + perpX,
      y: start.y + dy * 2 / 3 + perpY
    },
    p3: end
  };
}
