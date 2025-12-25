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
function sampleBezier(segment: CubicBezierSegment, steps = 50): Point[] {
  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(cubicPointAt(segment, t));
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
 * Get the bounding box of a Bézier curve
 */
type BBox = { x: number; y: number; width: number; height: number };

export function bezierBBox(segment: CubicBezierSegment): BBox {
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
