import type { Point, CubicBezierSegment } from "../types";
import { clamp01 } from "$lib/utils/math";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

/** A line with affine parameterization, allowing only floating-point roundoff.
 * Collinear handles with unequal spacing can reverse direction, so they must
 * still use the cubic calculations below. Generated polygon cuts are affine. */
export function isLinearBezier(seg: CubicBezierSegment): boolean {
  for (const axis of ['x', 'y'] as const) {
    const a = seg.p0[axis], b = seg.p3[axis], d = b - a;
    const tolerance = 16 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
    if (Math.abs(seg.p1[axis] - (a + d / 3)) > tolerance ||
        Math.abs(seg.p2[axis] - (a + d * 2 / 3)) > tolerance) return false;
  }
  return true;
}

function projectOnLine(a: Point, b: Point, target: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const t = length2 ? clamp01(((target.x - a.x) * dx + (target.y - a.y) * dy) / length2) : 0;
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, distance: Math.hypot(point.x - target.x, point.y - target.y) };
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

export function cubicDerivativeRoots(p0: number, p1: number, p2: number, p3: number): number[] {
  // Derivative quadratic coefficients from the power basis.
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 2 * (3 * p0 - 6 * p1 + 3 * p2);
  const c = -3 * p0 + 3 * p1;
  return solveQuadratic(a, b, c).filter((t) => t >= 0 && t <= 1);
}

/**
 * Sample points along a cubic Bézier segment
 */
function sampleBezier(segment: CubicBezierSegment, steps = 50): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(cubicPointAt(segment, t));
  }

  return points;
}

/**
 * How far apart the boxes of two pieces, neither longer than `longest`, must be before the test in
 * `intersectBezierCurves` cannot report a crossing between them; Infinity when no distance is sure.
 * The test computes with rounding, so a crossing it reports can lie off both pieces, the more so the
 * nearer they are to parallel. Down to |den| = 1e-12, where it stops, the reported crossing is never
 * farther from both than 2L(1.51K + 1.01u)/(1 − K), with L = `longest`, u = 2⁻⁵³ and
 * K = 16.04uL²/(1e-12 − 8.02uL²). This allows four times that.
 */
function sureGap(longest: number): number {
  const u = 2 ** -53, l2 = longest * longest;
  const den = 1e-12 - 8.02 * u * l2, k = (16.04 * u * l2) / den;
  return den > 0 && k < 0.5 ? (8 * longest * (1.51 * k + 1.01 * u)) / (1 - k) : Infinity;
}

/** Pieces in a run, whose box `intersectBezierCurves` looks at before the pieces'. */
const RUN = 8;

/**
 * Each piece's box of a polyline (min x, min y, max x, max y), each run of RUN pieces' box, and a
 * length no piece is longer than (NaN when a point is).
 */
function pieceBoxes(points: Point[]) {
  const n = points.length - 1, runs = Math.ceil(n / RUN);
  const piece = new Float64Array(4 * n), run = new Float64Array(4 * runs);
  let longest = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i]!, q = points[i + 1]!;
    const x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y), x1 = Math.max(p.x, q.x), y1 = Math.max(p.y, q.y);
    piece[4 * i] = x0;
    piece[4 * i + 1] = y0;
    piece[4 * i + 2] = x1;
    piece[4 * i + 3] = y1;
    longest = Math.max(longest, x1 - x0 + (y1 - y0));
    const r = 4 * ((i / RUN) | 0), opens = i % RUN === 0;
    run[r] = opens ? x0 : Math.min(run[r]!, x0);
    run[r + 1] = opens ? y0 : Math.min(run[r + 1]!, y0);
    run[r + 2] = opens ? x1 : Math.max(run[r + 2]!, x1);
    run[r + 3] = opens ? y1 : Math.max(run[r + 3]!, y1);
  }
  return { piece, run, runs, longest };
}

/** True when box `i` of `a` and box `j` of `b` (offsets into pieceBoxes' arrays) are more than `gap` apart. */
function apart(a: Float64Array, i: number, b: Float64Array, j: number, gap: number): boolean {
  return b[j]! - a[i + 2]! > gap || a[i]! - b[j + 2]! > gap || b[j + 1]! - a[i + 3]! > gap || a[i + 1]! - b[j + 3]! > gap;
}

/**
 * `f`, kept for each segment with the coordinates it was worked out from: a segment met again costs
 * a lookup, and one whose coordinates have changed is worked out again. What `f` returns is shared,
 * so read only.
 */
export function perSegment<T>(f: (seg: CubicBezierSegment) => T): (seg: CubicBezierSegment) => T {
  const kept = new WeakMap<CubicBezierSegment, { at: number[]; value: T }>();
  return (seg) => {
    const { p0, p1, p2, p3 } = seg;
    const k = kept.get(seg);
    if (k) {
      const a = k.at;
      if (Object.is(a[0], p0.x) && Object.is(a[1], p0.y) && Object.is(a[2], p1.x) && Object.is(a[3], p1.y) &&
          Object.is(a[4], p2.x) && Object.is(a[5], p2.y) && Object.is(a[6], p3.x) && Object.is(a[7], p3.y)) return k.value;
    }
    const value = f(seg);
    kept.set(seg, { at: [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y], value });
    return value;
  };
}

/** A curve as `intersectBezierCurves` tries it: its two ends when straight, else 80 pieces; and their boxes. */
const crossingPolyline = perSegment((seg) => {
  const points = isLinearBezier(seg) ? [seg.p0, seg.p3] : sampleBezier(seg, 80);
  return { points, boxes: pieceBoxes(points) };
});

/**
 * Find intersections between two Bézier curves. `first`: stop at the first point found, all a caller
 * asking whether they cross at all needs.
 */
export function intersectBezierCurves(seg1: CubicBezierSegment, seg2: CubicBezierSegment, first = false): Point[] {
  // Approximate intersections by polyline sampling.
  const { points: a, boxes: boxesA } = crossingPolyline(seg1);
  const { points: b, boxes: boxesB } = crossingPolyline(seg2);

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

  // Pieces whose boxes are far apart cannot cross (see `sureGap`), so only the others are tried, in
  // the same order.
  const gap = sureGap(Math.max(boxesA.longest, boxesB.longest));
  const near = new Uint8Array(boxesA.runs * boxesB.runs);
  for (let r = 0; r < boxesA.runs; r++)
    for (let s = 0; s < boxesB.runs; s++) near[r * boxesB.runs + s] = apart(boxesA.run, 4 * r, boxesB.run, 4 * s, gap) ? 0 : 1;
  for (let i = 0; i < a.length - 1; i++) {
    const row = ((i / RUN) | 0) * boxesB.runs;
    for (let s = 0; s < boxesB.runs; s++) {
      if (!near[row + s]) continue;
      for (let j = s * RUN, end = Math.min(b.length - 1, j + RUN); j < end; j++) {
        if (apart(boxesA.piece, 4 * i, boxesB.piece, 4 * j, gap)) continue;
        const p = segIntersect(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!);
        if (p) {
          points.push(p);
          if (first) return points;
        }
      }
    }
  }
  return points;
}

/**
 * Get the bounding box of a Bézier curve
 */
type BBox = { x: number; y: number; width: number; height: number };

export function bezierBBox(segment: CubicBezierSegment): BBox {
  if (isLinearBezier(segment)) return {
    x: Math.min(segment.p0.x, segment.p3.x),
    y: Math.min(segment.p0.y, segment.p3.y),
    width: Math.abs(segment.p3.x - segment.p0.x),
    height: Math.abs(segment.p3.y - segment.p0.y)
  };
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

export function bezierPathBBox(segments: CubicBezierSegment[]): BBox {
  if (segments.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const seg of segments) {
    const b = bezierBBox(seg);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Find the closest point on a Bézier curve to a target point
 */
export function closestPointOnBezier(segment: CubicBezierSegment, target: Point): { t: number; point: Point; distance: number } {
  if (isLinearBezier(segment)) return projectOnLine(segment.p0, segment.p3, target);
  // Coarse sample + local refinement (good enough for UI).
  // Implementation notes:
  // - Compare squared distances (avoids sqrt in inner loops).
  // - Evaluate cubic using power basis + Horner (fewer ops, no temporary Points).

  const { p0, p1, p2, p3 } = segment;

  // Power basis coefficients:
  // B(t) = ((a*t + b)*t + c)*t + d
  const ax = -p0.x + 3 * p1.x - 3 * p2.x + p3.x;
  const bx = 3 * p0.x - 6 * p1.x + 3 * p2.x;
  const cx = -3 * p0.x + 3 * p1.x;
  const dx = p0.x;

  const ay = -p0.y + 3 * p1.y - 3 * p2.y + p3.y;
  const by = 3 * p0.y - 6 * p1.y + 3 * p2.y;
  const cy = -3 * p0.y + 3 * p1.y;
  const dy = p0.y;

  const dist2At = (t: number): number => {
    const x = ((ax * t + bx) * t + cx) * t + dx;
    const y = ((ay * t + by) * t + cy) * t + dy;
    const ddx = x - target.x;
    const ddy = y - target.y;
    return ddx * ddx + ddy * ddy;
  };

  let bestT = 0;
  let bestD2 = dist2At(0);

  const samples = 80;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const d2 = dist2At(t);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestT = t;
    }
  }

  // Refine by shrinking window search.
  let window = 1 / samples;
  for (let it = 0; it < 12; it++) {
    const a = clamp01(bestT - window);
    const b = clamp01(bestT + window);
    const m1 = lerp(a, b, 1 / 3);
    const m2 = lerp(a, b, 2 / 3);

    const d1 = dist2At(m1);
    const d2 = dist2At(m2);
    if (d1 < d2) {
      bestT = m1;
      bestD2 = d1;
    } else {
      bestT = m2;
      bestD2 = d2;
    }
    window *= 0.5;
  }

  const x = ((ax * bestT + bx) * bestT + cx) * bestT + dx;
  const y = ((ay * bestT + by) * bestT + cy) * bestT + dy;
  return { t: bestT, point: { x, y }, distance: Math.sqrt(bestD2) };
}

type ClosestPointsBetweenBeziersResult = {
  u: number;
  v: number;
  pointA: Point;
  pointB: Point;
  distance: number;
};

type ClosestPointsBetweenBeziersOptions = {
  /**
   * Sample count per curve for initial seeding.
   * Total seeds evaluated is `samplesPerCurve^2` (capped by `maxSeeds`).
   */
  samplesPerCurve?: number;
  /** Max number of Newton seeds to refine (best-first). */
  maxSeeds?: number;
  /** Max damped Newton iterations per seed. */
  newtonIterations?: number;
};

type CubicPower2D = {
  ax: number; bx: number; cx: number; dx: number;
  ay: number; by: number; cy: number; dy: number;
};

function cubicToPowerBasis2D(seg: CubicBezierSegment): CubicPower2D {
  const { p0, p1, p2, p3 } = seg;
  return {
    ax: -p0.x + 3 * p1.x - 3 * p2.x + p3.x,
    bx: 3 * p0.x - 6 * p1.x + 3 * p2.x,
    cx: -3 * p0.x + 3 * p1.x,
    dx: p0.x,
    ay: -p0.y + 3 * p1.y - 3 * p2.y + p3.y,
    by: 3 * p0.y - 6 * p1.y + 3 * p2.y,
    cy: -3 * p0.y + 3 * p1.y,
    dy: p0.y,
  };
}

/**
 * Approximate closest points between two cubic Bézier segments.
 *
 * Strategy:
 * - Coarse grid sampling to pick good (u,v) seeds.
 * - Damped Newton refinement on the stationarity equations:
 *   (P(u)-Q(v))·P'(u)=0 and (P(u)-Q(v))·Q'(v)=0.
 * - Always consider boundary candidates via point→curve projection.
 */
export function closestPointsBetweenBeziers(
  segA: CubicBezierSegment,
  segB: CubicBezierSegment,
  options: ClosestPointsBetweenBeziersOptions = {}
): ClosestPointsBetweenBeziersResult {
  if (isLinearBezier(segA) && isLinearBezier(segB)) {
    const ax = segA.p3.x - segA.p0.x, ay = segA.p3.y - segA.p0.y;
    const bx = segB.p3.x - segB.p0.x, by = segB.p3.y - segB.p0.y;
    const dx = segB.p0.x - segA.p0.x, dy = segB.p0.y - segA.p0.y;
    const determinant = ax * by - ay * bx;
    if (determinant !== 0) {
      const u = (dx * by - dy * bx) / determinant;
      const v = (dx * ay - dy * ax) / determinant;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const pointA = { x: segA.p0.x + u * ax, y: segA.p0.y + u * ay };
        const pointB = { x: segB.p0.x + v * bx, y: segB.p0.y + v * by };
        return { u, v, pointA, pointB, distance: Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y) };
      }
    }
    // A non-crossing pair attains its minimum at an endpoint projection.
    // This also handles parallel, collinear, and zero-length segments.
    let best: ClosestPointsBetweenBeziersResult | undefined;
    for (const u of [0, 1]) {
      const pointA = u ? segA.p3 : segA.p0;
      const hit = projectOnLine(segB.p0, segB.p3, pointA);
      if (!best || hit.distance < best.distance)
        best = { u, v: hit.t, pointA, pointB: hit.point, distance: hit.distance };
    }
    for (const v of [0, 1]) {
      const pointB = v ? segB.p3 : segB.p0;
      const hit = projectOnLine(segA.p0, segA.p3, pointB);
      if (hit.distance < best!.distance)
        best = { u: hit.t, v, pointA: hit.point, pointB, distance: hit.distance };
    }
    return { ...best!, pointA: { ...best!.pointA }, pointB: { ...best!.pointB } };
  }
  const samplesPerCurve = Math.max(2, Math.floor(options.samplesPerCurve ?? 5));
  const maxSeeds = Math.max(1, Math.floor(options.maxSeeds ?? 8));
  const newtonIterations = Math.max(1, Math.floor(options.newtonIterations ?? 10));

  const A = cubicToPowerBasis2D(segA);
  const B = cubicToPowerBasis2D(segB);

  const clamp01Fast = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

  const evalPos = (C: CubicPower2D, t: number): { x: number; y: number } => {
    const x = ((C.ax * t + C.bx) * t + C.cx) * t + C.dx;
    const y = ((C.ay * t + C.by) * t + C.cy) * t + C.dy;
    return { x, y };
  };

  const closestTOnCurveToPoint = (
    C: CubicPower2D,
    px: number,
    py: number,
    coarseSamples: number,
    refineIterations: number
  ): { t: number; x: number; y: number; d2: number } => {
    let bestT = 0;
    let bestX = C.dx;
    let bestY = C.dy;
    const dx0 = bestX - px;
    const dy0 = bestY - py;
    let bestD2 = dx0 * dx0 + dy0 * dy0;

    for (let i = 1; i <= coarseSamples; i++) {
      const t = i / coarseSamples;
      const x = ((C.ax * t + C.bx) * t + C.cx) * t + C.dx;
      const y = ((C.ay * t + C.by) * t + C.cy) * t + C.dy;
      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestT = t;
        bestX = x;
        bestY = y;
      }
    }

    let window = 1 / coarseSamples;
    for (let it = 0; it < refineIterations; it++) {
      const a = clamp01Fast(bestT - window);
      const b = clamp01Fast(bestT + window);
      const m1 = lerp(a, b, 1 / 3);
      const m2 = lerp(a, b, 2 / 3);

      const x1 = ((C.ax * m1 + C.bx) * m1 + C.cx) * m1 + C.dx;
      const y1 = ((C.ay * m1 + C.by) * m1 + C.cy) * m1 + C.dy;
      const dx1 = x1 - px;
      const dy1 = y1 - py;
      const d1 = dx1 * dx1 + dy1 * dy1;

      const x2 = ((C.ax * m2 + C.bx) * m2 + C.cx) * m2 + C.dx;
      const y2 = ((C.ay * m2 + C.by) * m2 + C.cy) * m2 + C.dy;
      const dx2 = x2 - px;
      const dy2 = y2 - py;
      const d2 = dx2 * dx2 + dy2 * dy2;

      if (d1 < d2) {
        bestT = m1;
        bestD2 = d1;
        bestX = x1;
        bestY = y1;
      } else {
        bestT = m2;
        bestD2 = d2;
        bestX = x2;
        bestY = y2;
      }
      window *= 0.5;
    }

    return { t: bestT, x: bestX, y: bestY, d2: bestD2 };
  };

  const dist2 = (u: number, v: number): number => {
    const ax = ((A.ax * u + A.bx) * u + A.cx) * u + A.dx;
    const ay = ((A.ay * u + A.by) * u + A.cy) * u + A.dy;
    const bx = ((B.ax * v + B.bx) * v + B.cx) * v + B.dx;
    const by = ((B.ay * v + B.by) * v + B.cy) * v + B.dy;
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };

  type Seed = { u: number; v: number; d2: number };
  const seeds: Seed[] = [];
  const pushSeed = (seed: Seed) => {
    // Insert into sorted list (ascending d2) up to maxSeeds.
    let idx = 0;
    while (idx < seeds.length && seeds[idx]!.d2 <= seed.d2) idx++;
    seeds.splice(idx, 0, seed);
    if (seeds.length > maxSeeds) seeds.length = maxSeeds;
  };

  // Pre-sample positions for both curves.
  const us: number[] = [];
  const vs: number[] = [];
  const axSamples: number[] = [];
  const aySamples: number[] = [];
  const bxSamples: number[] = [];
  const bySamples: number[] = [];

  for (let i = 0; i < samplesPerCurve; i++) {
    const t = i / (samplesPerCurve - 1);
    us.push(t);
    const pa = evalPos(A, t);
    axSamples.push(pa.x);
    aySamples.push(pa.y);
  }
  for (let j = 0; j < samplesPerCurve; j++) {
    const t = j / (samplesPerCurve - 1);
    vs.push(t);
    const pb = evalPos(B, t);
    bxSamples.push(pb.x);
    bySamples.push(pb.y);
  }

  let bestU = 0;
  let bestV = 0;
  let bestD2 = dist2(0, 0);

  for (let i = 0; i < samplesPerCurve; i++) {
    const u = us[i]!;
    const pax = axSamples[i]!;
    const pay = aySamples[i]!;
    for (let j = 0; j < samplesPerCurve; j++) {
      const v = vs[j]!;
      const dx = pax - bxSamples[j]!;
      const dy = pay - bySamples[j]!;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestU = u;
        bestV = v;
      }
      pushSeed({ u, v, d2 });
    }
  }

  const refineSeed = (u0: number, v0: number): { u: number; v: number; d2: number } => {
    let u = clamp01Fast(u0);
    let v = clamp01Fast(v0);
    let curD2 = dist2(u, v);

    let outU = u;
    let outV = v;
    let outD2 = curD2;

    for (let it = 0; it < newtonIterations; it++) {
      // Positions.
      const px = ((A.ax * u + A.bx) * u + A.cx) * u + A.dx;
      const py = ((A.ay * u + A.by) * u + A.cy) * u + A.dy;
      const qx = ((B.ax * v + B.bx) * v + B.cx) * v + B.dx;
      const qy = ((B.ay * v + B.by) * v + B.cy) * v + B.dy;

      const dx = px - qx;
      const dy = py - qy;

      // First derivatives.
      const pdx = (3 * A.ax * u + 2 * A.bx) * u + A.cx;
      const pdy = (3 * A.ay * u + 2 * A.by) * u + A.cy;
      const qdx = (3 * B.ax * v + 2 * B.bx) * v + B.cx;
      const qdy = (3 * B.ay * v + 2 * B.by) * v + B.cy;

      // Second derivatives.
      const pddx = 6 * A.ax * u + 2 * A.bx;
      const pddy = 6 * A.ay * u + 2 * A.by;
      const qddx = 6 * B.ax * v + 2 * B.bx;
      const qddy = 6 * B.ay * v + 2 * B.by;

      const F = dx * pdx + dy * pdy;
      const G = dx * qdx + dy * qdy;

      const pp = pdx * pdx + pdy * pdy;
      const qq = qdx * qdx + qdy * qdy;
      const pq = pdx * qdx + pdy * qdy;

      const A11 = pp + (dx * pddx + dy * pddy);
      const A22 = -qq + (dx * qddx + dy * qddy);
      const det = A11 * A22 + pq * pq;

      if (!Number.isFinite(det) || Math.abs(det) < 1e-18) break;

      const du = -(A22 * F + pq * G) / det;
      const dv = (pq * F - A11 * G) / det;
      if (!Number.isFinite(du) || !Number.isFinite(dv)) break;

      if (Math.abs(du) + Math.abs(dv) < 1e-10) break;

      // Damped step to ensure we improve distance.
      let step = 1;
      let improved = false;
      for (let bt = 0; bt < 10; bt++) {
        const nu = clamp01Fast(u + step * du);
        const nv = clamp01Fast(v + step * dv);
        const nd2 = dist2(nu, nv);
        if (nd2 <= curD2) {
          u = nu;
          v = nv;
          curD2 = nd2;
          improved = true;
          break;
        }
        step *= 0.5;
      }

      if (!improved) break;

      if (curD2 < outD2) {
        outD2 = curD2;
        outU = u;
        outV = v;
      }
    }

    return { u: outU, v: outV, d2: outD2 };
  };

  // Refine a handful of best coarse seeds.
  for (const s of seeds) {
    const r = refineSeed(s.u, s.v);
    if (r.d2 < bestD2) {
      bestD2 = r.d2;
      bestU = r.u;
      bestV = r.v;
    }
    if (bestD2 < 1e-18) break;
  }

  // Boundary candidates: endpoints projected onto the other curve.
  const boundaryCoarse = Math.max(12, samplesPerCurve * 3);
  const boundaryRefine = 8;

  const bHitA0 = closestTOnCurveToPoint(B, segA.p0.x, segA.p0.y, boundaryCoarse, boundaryRefine);
  if (bHitA0.d2 < bestD2) {
    bestD2 = bHitA0.d2;
    bestU = 0;
    bestV = bHitA0.t;
  }

  const bHitA1 = closestTOnCurveToPoint(B, segA.p3.x, segA.p3.y, boundaryCoarse, boundaryRefine);
  if (bHitA1.d2 < bestD2) {
    bestD2 = bHitA1.d2;
    bestU = 1;
    bestV = bHitA1.t;
  }

  const aHitB0 = closestTOnCurveToPoint(A, segB.p0.x, segB.p0.y, boundaryCoarse, boundaryRefine);
  if (aHitB0.d2 < bestD2) {
    bestD2 = aHitB0.d2;
    bestU = aHitB0.t;
    bestV = 0;
  }

  const aHitB1 = closestTOnCurveToPoint(A, segB.p3.x, segB.p3.y, boundaryCoarse, boundaryRefine);
  if (aHitB1.d2 < bestD2) {
    bestD2 = aHitB1.d2;
    bestU = aHitB1.t;
    bestV = 1;
  }

  const pointA = evalPos(A, bestU);
  const pointB = evalPos(B, bestV);
  return {
    u: bestU,
    v: bestV,
    pointA,
    pointB,
    distance: Math.sqrt(bestD2),
  };
}
