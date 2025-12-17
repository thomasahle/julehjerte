import type { Point, CubicBezierSegment } from "../types";
import { clamp01 } from "$lib/utils/math";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  // Bernstein basis
  return (
    u * u * u * p0 +
    3 * u * u * t * p1 +
    3 * u * t * t * p2 +
    t * t * t * p3
  );
}

function cubicPointAt(seg: CubicBezierSegment, t: number): Point {
  const tt = clamp01(t);
  return {
    x: cubicAt(seg.p0.x, seg.p1.x, seg.p2.x, seg.p3.x, tt),
    y: cubicAt(seg.p0.y, seg.p1.y, seg.p2.y, seg.p3.y, tt),
  };
}

function cubicDerivativeAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  // 3 * quadratic Bézier of the control point deltas
  return (
    3 *
    (u * u * (p1 - p0) +
      2 * u * t * (p2 - p1) +
      t * t * (p3 - p2))
  );
}

function cubicTangentAt(seg: CubicBezierSegment, t: number): Point {
  const tt = clamp01(t);
  return {
    x: cubicDerivativeAt(seg.p0.x, seg.p1.x, seg.p2.x, seg.p3.x, tt),
    y: cubicDerivativeAt(seg.p0.y, seg.p1.y, seg.p2.y, seg.p3.y, tt),
  };
}

function dist(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalize(v: Point): Point {
  const d = Math.hypot(v.x, v.y);
  return d > 1e-12 ? { x: v.x / d, y: v.y / d } : { x: 0, y: 0 };
}

function solveQuadratic(a: number, b: number, c: number): number[] {
  const eps = 1e-12;
  if (Math.abs(a) < eps) {
    if (Math.abs(b) < eps) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < -eps) return [];
  if (Math.abs(disc) < eps) return [-b / (2 * a)];
  const s = Math.sqrt(Math.max(0, disc));
  // Numerically stable form
  const q = -0.5 * (b + Math.sign(b || 1) * s);
  const r1 = q / a;
  const r2 = c / q;
  return [r1, r2];
}

function cubicDerivativeRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative quadratic coefficients from the power basis.
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 2 * (3 * p0 - 6 * p1 + 3 * p2);
  const c = -3 * p0 + 3 * p1;
  return solveQuadratic(a, b, c).filter((t) => t >= 0 && t <= 1);
}

/**
 * Sample points along a cubic Bézier segment
 */
export function sampleBezier(segment: CubicBezierSegment, steps = 50): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(cubicPointAt(segment, t));
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
  return cubicPointAt(segment, t);
}

/**
 * Get the derivative (tangent) at parameter t
 */
export function getTangentOnBezier(segment: CubicBezierSegment, t: number): Point {
  return cubicTangentAt(segment, t);
}

/**
 * Get the normal at parameter t
 */
export function getNormalOnBezier(segment: CubicBezierSegment, t: number): Point {
  const tan = cubicTangentAt(segment, t);
  const n = normalize({ x: -tan.y, y: tan.x });
  return n;
}

/**
 * Find intersections between a Bézier curve and a horizontal line
 */
export function intersectBezierWithHorizontal(segment: CubicBezierSegment, y: number): Point[] {
  // Simple numeric root find: sample for sign changes and bisection.
  const steps = 128;
  const points: Point[] = [];
  let prevT = 0;
  let prevY = getPointOnBezier(segment, 0).y - y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const dy = getPointOnBezier(segment, t).y - y;
    if (dy === 0 || prevY === 0 || (dy > 0) !== (prevY > 0)) {
      let lo = prevT;
      let hi = t;
      for (let it = 0; it < 30; it++) {
        const mid = (lo + hi) / 2;
        const my = getPointOnBezier(segment, mid).y - y;
        if ((my > 0) === (prevY > 0)) lo = mid;
        else hi = mid;
      }
      const tt = (lo + hi) / 2;
      points.push(getPointOnBezier(segment, tt));
    }
    prevT = t;
    prevY = dy;
  }
  return points;
}

/**
 * Find intersections between two Bézier curves
 */
export function intersectBezierCurves(seg1: CubicBezierSegment, seg2: CubicBezierSegment): Point[] {
  // Approximate intersections by polyline sampling.
  const a = sampleBezier(seg1, 80);
  const b = sampleBezier(seg2, 80);

  const points: Point[] = [];
  const segIntersect = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
    const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(den) < 1e-12) return null;
    const ua =
      ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
    const ub =
      ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;
    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
    return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
  };

  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const p = segIntersect(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!);
      if (p) points.push(p);
    }
  }
  return points;
}

/**
 * Split a Bézier curve at parameter t
 */
export function splitBezier(segment: CubicBezierSegment, t: number): [CubicBezierSegment, CubicBezierSegment] {
  const tt = clamp01(t);
  const a = lerpPoint(segment.p0, segment.p1, tt);
  const b = lerpPoint(segment.p1, segment.p2, tt);
  const c = lerpPoint(segment.p2, segment.p3, tt);
  const d = lerpPoint(a, b, tt);
  const e = lerpPoint(b, c, tt);
  const p = lerpPoint(d, e, tt);

  return [
    { p0: segment.p0, p1: a, p2: d, p3: p },
    { p0: p, p1: e, p2: c, p3: segment.p3 },
  ];
}

/**
 * Get the bounding box of a Bézier curve
 */
export function getBezierBBox(segment: CubicBezierSegment): { x: number; y: number; width: number; height: number } {
  const tx = cubicDerivativeRoots(segment.p0.x, segment.p1.x, segment.p2.x, segment.p3.x);
  const ty = cubicDerivativeRoots(segment.p0.y, segment.p1.y, segment.p2.y, segment.p3.y);
  const ts = [0, 1, ...tx, ...ty].filter((t) => t >= 0 && t <= 1);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const t of ts) {
    const p = cubicPointAt(segment, t);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Get the approximate length of a Bézier curve
 */
export function getBezierLength(segment: CubicBezierSegment): number {
  const steps = 80;
  let total = 0;
  let prev = cubicPointAt(segment, 0);
  for (let i = 1; i <= steps; i++) {
    const p = cubicPointAt(segment, i / steps);
    total += dist(prev, p);
    prev = p;
  }
  return total;
}

/**
 * Find the closest point on a Bézier curve to a target point
 */
export function closestPointOnBezier(segment: CubicBezierSegment, target: Point): { t: number; point: Point; distance: number } {
  // Coarse sample + local refinement (good enough for UI).
  let bestT = 0;
  let bestP = cubicPointAt(segment, 0);
  let bestD = dist(bestP, target);

  const samples = 80;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const p = cubicPointAt(segment, t);
    const d = dist(p, target);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestP = p;
    }
  }

  // Refine by shrinking window search.
  let window = 1 / samples;
  for (let it = 0; it < 12; it++) {
    const a = clamp01(bestT - window);
    const b = clamp01(bestT + window);
    const m1 = lerp(a, b, 1 / 3);
    const m2 = lerp(a, b, 2 / 3);
    const p1 = cubicPointAt(segment, m1);
    const p2 = cubicPointAt(segment, m2);
    const d1 = dist(p1, target);
    const d2 = dist(p2, target);
    if (d1 < d2) {
      bestT = m1;
      bestP = p1;
      bestD = d1;
    } else {
      bestT = m2;
      bestP = p2;
      bestD = d2;
    }
    window *= 0.5;
  }

  return { t: bestT, point: bestP, distance: bestD };
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
