import type paper from 'paper';

import { bernsteinWeight } from './bezier';
import { solve2DProjection, type LinearConstraint } from './projection2d';
import { moveHandleToward } from './snap';

export type SquareBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type SnapResult = { point: paper.Point; iterations: number };

type PointCtor = new (x: number, y: number) => paper.Point;

function makePoint(seed: paper.Point, x: number, y: number): paper.Point {
  const ctor = (seed as unknown as { constructor: PointCtor }).constructor;
  return new ctor(x, y);
}

export function nearestObstacle(
  point: paper.Point,
  obstacles: paper.Path[]
): { point: paper.Point; dist: number } {
  let best: { point: paper.Point; dist: number } = { point, dist: Infinity };
  for (const path of obstacles) {
    const loc = path.getNearestLocation(point);
    if (!loc) continue;
    if (loc.distance < best.dist) {
      best = { point: loc.point, dist: loc.distance };
    }
  }
  return best;
}

type BezierControlKey = 'p1' | 'p2';

function basisCoeffs(t: number): { b0: number; b1: number; b2: number; b3: number } {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return { b0, b1, b2, b3 };
}

function affineSample(
  control: BezierControlKey,
  p0: paper.Point,
  fixedOther: paper.Point,
  p3: paper.Point,
  t: number
): { A: paper.Point; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = bernsteinWeight(control, t);
  const A =
    control === 'p1'
      ? p0.multiply(b0).add(fixedOther.multiply(b2)).add(p3.multiply(b3))
      : p0.multiply(b0).add(fixedOther.multiply(b1)).add(p3.multiply(b3));
  return { A, w };
}

function affineSampleJunctionPrev(
  p0: paper.Point,
  p1: paper.Point,
  p2: paper.Point,
  junction0: paper.Point,
  t: number
): { A: paper.Point; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = b2 + b3;
  const A = p0.multiply(b0).add(p1.multiply(b1)).add(p2.subtract(junction0).multiply(b2));
  return { A, w };
}

function affineSampleJunctionNext(
  p1: paper.Point,
  p2: paper.Point,
  p3: paper.Point,
  junction0: paper.Point,
  t: number
): { A: paper.Point; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = b0 + b1;
  const A = p1.subtract(junction0).multiply(b1).add(p2.multiply(b2)).add(p3.multiply(b3));
  return { A, w };
}

// Sampler abstraction: returns affine samples { A, w } for a given t value
export type AffineSampler = (t: number) => Array<{ A: paper.Point; w: number }>;

// Create a sampler for control point (p1 or p2) dragging
export function createControlSampler(
  control: BezierControlKey,
  p0: paper.Point,
  fixedOther: paper.Point,
  p3: paper.Point
): AffineSampler {
  return (t: number) => [affineSample(control, p0, fixedOther, p3, t)];
}

// Create a sampler for junction (midpoint) dragging
export function createJunctionSampler(
  prevP0: paper.Point,
  prevP1: paper.Point,
  prevP2: paper.Point,
  from: paper.Point,
  nextP1: paper.Point,
  nextP2: paper.Point,
  nextP3: paper.Point
): AffineSampler {
  return (t: number) => [
    affineSampleJunctionPrev(prevP0, prevP1, prevP2, from, t),
    affineSampleJunctionNext(nextP1, nextP2, nextP3, from, t)
  ];
}

// Unified sequential QP snapping function
export function snapSequentialQP<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  sampler: AffineSampler,
  obstacles: paper.Path[],
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: paper.Point;
    stickiness?: number;
  } = {}
): SnapResult {
  let iterations = 0;
  let pt = moveHandleToward(buildCandidateAt, from, desired, isValidCandidate);
  iterations++;
  const seed = pt;

  const tSamples = opts.tSamples ?? [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9];
  const margin = opts.margin ?? 0.75;
  const iters = opts.iters ?? 6;
  const obstacleThreshold = opts.obstacleThreshold ?? 12;
  // Stickiness: blend between desired and previous solution to reduce jumping
  const stickiness = opts.stickiness ?? 0;
  const previousSolution = opts.previousSolution;

  // Compute effective target: blend desired with previous solution for temporal smoothness
  let effectiveDesired = desired;
  if (previousSolution && stickiness > 0) {
    // Only apply stickiness if previous solution is reasonably close to desired
    const prevDist = previousSolution.getDistance(desired);
    if (prevDist < 100) {
      // Bias toward previous solution to reduce jumping between constraint boundaries
      effectiveDesired = previousSolution.add(desired.subtract(previousSolution).multiply(1 - stickiness));
    }
  }

  for (let k = 0; k < iters; k++) {
    const constraints: LinearConstraint[] = [];

    for (const t of tSamples) {
      const samples = sampler(t);
      for (const { A, w } of samples) {
        if (w < 1e-3) continue;

        const x = A.add(pt.multiply(w));

        // Square constraints at sample points.
        constraints.push({ a: makePoint(seed, w, 0), b: square.minX - A.x });
        constraints.push({ a: makePoint(seed, -w, 0), b: A.x - square.maxX });
        constraints.push({ a: makePoint(seed, 0, w), b: square.minY - A.y });
        constraints.push({ a: makePoint(seed, 0, -w), b: A.y - square.maxY });

        // Obstacle half-space constraints from nearest point + normal.
        const nearest = nearestObstacle(x, obstacles);
        if (!Number.isFinite(nearest.dist) || nearest.dist < 1e-6) continue;
        if (nearest.dist < obstacleThreshold) {
          const n = x.subtract(nearest.point).normalize();
          const a = n.multiply(w);
          const rhs = margin - n.dot(A.subtract(nearest.point));
          constraints.push({ a, b: rhs });
        }
      }
    }

    const projected = solve2DProjection(effectiveDesired, constraints);
    const next = moveHandleToward(buildCandidateAt, pt, projected, isValidCandidate);
    iterations++;
    if (next.getDistance(pt) < 0.25) break;
    if (next.getDistance(effectiveDesired) + 0.01 >= pt.getDistance(effectiveDesired)) break;
    pt = next;
  }

  return { point: pt, iterations };
}

export function snapProjectedGradientBezierControl<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  control: BezierControlKey,
  p0: paper.Point,
  fixedOther: paper.Point,
  p3: paper.Point,
  obstacles: paper.Path[],
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    repelRadius?: number;
    repelGain?: number;
    iters?: number;
  } = {}
): SnapResult {
  let iterations = 0;
  const zero = from.multiply(0);

  // Start from the furthest valid point along the drag ray.
  let pt = moveHandleToward(buildCandidateAt, from, desired, isValidCandidate);
  iterations++;

  const tSamples = opts.tSamples ?? [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9];
  const repelRadius = opts.repelRadius ?? 10;
  const repelGain = opts.repelGain ?? 2.0;
  const iters = opts.iters ?? 8;

  for (let k = 0; k < iters; k++) {
    const toDesired = desired.subtract(pt);
    const distToDesired = toDesired.length;
    if (distToDesired < 0.25) break;

    let repulse = zero;
    for (const t of tSamples) {
      const { A, w } = affineSample(control, p0, fixedOther, p3, t);
      if (w < 1e-3) continue;

      const x = A.add(pt.multiply(w));
      const nearest = nearestObstacle(x, obstacles);
      const d = nearest.dist;
      if (d <= repelRadius && Number.isFinite(d) && d >= 1e-6) {
        const n = x.subtract(nearest.point).normalize();
        const m = (repelRadius - d) / repelRadius;
        repulse = repulse.add(n.multiply(m * w));
      }

      // Soft square repulsion (keeps search stable near edges)
      const margin = 4;
      if (x.x < square.minX + margin)
        repulse = repulse.add(makePoint(from, w * ((square.minX + margin) - x.x) / margin, 0));
      if (x.x > square.maxX - margin)
        repulse = repulse.add(makePoint(from, w * ((square.maxX - margin) - x.x) / margin, 0));
      if (x.y < square.minY + margin)
        repulse = repulse.add(makePoint(from, 0, w * ((square.minY + margin) - x.y) / margin));
      if (x.y > square.maxY - margin)
        repulse = repulse.add(makePoint(from, 0, w * ((square.maxY - margin) - x.y) / margin));
    }

    const dir = toDesired.add(repulse.multiply(repelGain)).normalize();
    const step = Math.min(25, Math.max(3, distToDesired));
    const target = pt.add(dir.multiply(step));
    const next = moveHandleToward(buildCandidateAt, pt, target, isValidCandidate);
    iterations++;
    if (next.getDistance(desired) + 0.01 >= pt.getDistance(desired)) break;
    if (next.getDistance(pt) < 0.25) break;
    pt = next;
  }

  return { point: pt, iterations };
}

// Wrapper for backward compatibility - delegates to unified snapSequentialQP
export function snapSequentialQPBezierControl<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  control: BezierControlKey,
  p0: paper.Point,
  fixedOther: paper.Point,
  p3: paper.Point,
  obstacles: paper.Path[],
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: paper.Point;
    stickiness?: number;
  } = {}
): SnapResult {
  const sampler = createControlSampler(control, p0, fixedOther, p3);
  return snapSequentialQP(buildCandidateAt, from, desired, isValidCandidate, sampler, obstacles, square, opts);
}

// Wrapper for backward compatibility - delegates to unified snapSequentialQP
export function snapSequentialQPBezierJunction<TCandidate>(
  buildCandidateAt: (junction: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  prevP0: paper.Point,
  prevP1: paper.Point,
  prevP2: paper.Point,
  nextP1: paper.Point,
  nextP2: paper.Point,
  nextP3: paper.Point,
  obstacles: paper.Path[],
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: paper.Point;
    stickiness?: number;
  } = {}
): SnapResult {
  const sampler = createJunctionSampler(prevP0, prevP1, prevP2, from, nextP1, nextP2, nextP3);
  return snapSequentialQP(buildCandidateAt, from, desired, isValidCandidate, sampler, obstacles, square, opts);
}

export function snapPenalizedNewtonBezierControl<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  control: BezierControlKey,
  p0: paper.Point,
  fixedOther: paper.Point,
  p3: paper.Point,
  obstacles: paper.Path[],
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    iters?: number;
    penaltyGain?: number;
    repelRadius?: number;
    maxStep?: number;
    edgeMargin?: number;
    edgeGain?: number;
  } = {}
): SnapResult {
  let iterations = 0;
  let pt = moveHandleToward(buildCandidateAt, from, desired, isValidCandidate);
  iterations++;

  const tSamples = opts.tSamples ?? [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9];
  const iters = opts.iters ?? 6;
  const penaltyGain = opts.penaltyGain ?? 10;
  const repelRadius = opts.repelRadius ?? 10;
  const maxStepDefault = opts.maxStep ?? 25;
  const edgeMargin = opts.edgeMargin ?? 4;
  const edgeGain = opts.edgeGain ?? penaltyGain * 0.25;

  const zero = pt.multiply(0);

  for (let k = 0; k < iters; k++) {
    const distToDesired = pt.getDistance(desired);
    if (distToDesired < 0.25) break;

    // Objective: ||p - desired||^2 + penaltyGain * Σ max(0, r - d(x(p)))^2.
    let g = pt.subtract(desired).multiply(2);
    let hxx = 2;
    let hxy = 0;
    let hyy = 2;

    for (const t of tSamples) {
      const { A, w } = affineSample(control, p0, fixedOther, p3, t);
      if (w < 1e-3) continue;

      const x = A.add(pt.multiply(w));

      const nearest = nearestObstacle(x, obstacles);
      const d = nearest.dist;
      if (Number.isFinite(d) && d >= 1e-6 && d < repelRadius) {
        const n = x.subtract(nearest.point).normalize();
        const slack = repelRadius - d;
        g = g.add(n.multiply(-2 * penaltyGain * slack * w));

        const hc = 2 * penaltyGain * w * w;
        hxx += hc * n.x * n.x;
        hxy += hc * n.x * n.y;
        hyy += hc * n.y * n.y;
      }

      // Soft edge penalty at the curve sample points.
      const leftSlack = square.minX + edgeMargin - x.x;
      if (leftSlack > 0) {
        g = g.add(makePoint(zero, -2 * edgeGain * leftSlack * w, 0));
        hxx += 2 * edgeGain * w * w;
      }
      const rightSlack = x.x - (square.maxX - edgeMargin);
      if (rightSlack > 0) {
        g = g.add(makePoint(zero, 2 * edgeGain * rightSlack * w, 0));
        hxx += 2 * edgeGain * w * w;
      }
      const topSlack = square.minY + edgeMargin - x.y;
      if (topSlack > 0) {
        g = g.add(makePoint(zero, 0, -2 * edgeGain * topSlack * w));
        hyy += 2 * edgeGain * w * w;
      }
      const bottomSlack = x.y - (square.maxY - edgeMargin);
      if (bottomSlack > 0) {
        g = g.add(makePoint(zero, 0, 2 * edgeGain * bottomSlack * w));
        hyy += 2 * edgeGain * w * w;
      }
    }

    const det = hxx * hyy - hxy * hxy;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;

    // step = -inv(H) * g
    const step = makePoint(zero, -(hyy * g.x - hxy * g.y) / det, -(-hxy * g.x + hxx * g.y) / det);

    const maxStep = Math.min(maxStepDefault, Math.max(3, distToDesired));
    const delta = step.length > maxStep ? step.normalize().multiply(maxStep) : step;
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) break;

    const target = pt.add(delta);
    const next = moveHandleToward(buildCandidateAt, pt, target, isValidCandidate);
    iterations++;
    if (next.getDistance(pt) < 0.25) break;
    if (next.getDistance(desired) + 0.01 >= pt.getDistance(desired)) break;
    pt = next;
  }

  return { point: pt, iterations };
}
