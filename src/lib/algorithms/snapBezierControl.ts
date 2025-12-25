import type { PointLike } from '$lib/geometry/pointLike';
import { bernsteinWeight } from './bezier';
import { solve2DProjection, type LinearConstraint } from './projection2d';
import { moveHandleToward } from './snap';

export type SquareBounds = { minX: number; maxX: number; minY: number; maxY: number };

type SnapResult<P> = { point: P; iterations: number };

type PointCtor<P> = new (x: number, y: number) => P;

function makePoint<P extends PointLike<P>>(seed: P, x: number, y: number): P {
  const ctor = (seed as unknown as { constructor: PointCtor<P> }).constructor;
  return new (ctor as unknown as PointCtor<P>)(x, y);
}

export function nearestObstacle<P extends PointLike<P>>(
  point: P,
  obstacles: Array<{ getNearestLocation: (p: P) => { point: P; distance: number } | null }>
): { point: P; dist: number } {
  let best: { point: P; dist: number } = { point, dist: Infinity };
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

function affineSample<P extends PointLike<P>>(
  control: BezierControlKey,
  p0: P,
  fixedOther: P,
  p3: P,
  t: number
): { A: P; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = bernsteinWeight(control, t);
  const A =
    control === 'p1'
      ? p0.multiply(b0).add(fixedOther.multiply(b2)).add(p3.multiply(b3))
      : p0.multiply(b0).add(fixedOther.multiply(b1)).add(p3.multiply(b3));
  return { A, w };
}

function affineSampleJunctionPrev<P extends PointLike<P>>(
  p0: P,
  p1: P,
  p2: P,
  junction0: P,
  t: number
): { A: P; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = b2 + b3;
  const A = p0.multiply(b0).add(p1.multiply(b1)).add(p2.subtract(junction0).multiply(b2));
  return { A, w };
}

function affineSampleJunctionNext<P extends PointLike<P>>(
  p1: P,
  p2: P,
  p3: P,
  junction0: P,
  t: number
): { A: P; w: number } {
  const { b0, b1, b2, b3 } = basisCoeffs(t);
  const w = b0 + b1;
  const A = p1.subtract(junction0).multiply(b1).add(p2.multiply(b2)).add(p3.multiply(b3));
  return { A, w };
}

// Sampler abstraction: returns affine samples { A, w } for a given t value
type AffineSampler<P> = (t: number) => Array<{ A: P; w: number }>;

// Create a sampler for control point (p1 or p2) dragging
export function createControlSampler<P extends PointLike<P>>(
  control: BezierControlKey,
  p0: P,
  fixedOther: P,
  p3: P
): AffineSampler<P> {
  return (t: number) => [affineSample(control, p0, fixedOther, p3, t)];
}

// Create a sampler for junction (midpoint) dragging
export function createJunctionSampler<P extends PointLike<P>>(
  prevP0: P,
  prevP1: P,
  prevP2: P,
  from: P,
  nextP1: P,
  nextP2: P,
  nextP3: P
): AffineSampler<P> {
  return (t: number) => [
    affineSampleJunctionPrev(prevP0, prevP1, prevP2, from, t),
    affineSampleJunctionNext(nextP1, nextP2, nextP3, from, t)
  ];
}

// Unified sequential QP snapping function
export function snapSequentialQP<TCandidate, P extends PointLike<P>>(
  buildCandidateAt: (pos: P) => TCandidate,
  from: P,
  desired: P,
  isValidCandidate: (candidate: TCandidate) => boolean,
  sampler: AffineSampler<P>,
  obstacles: Array<{ getNearestLocation: (p: P) => { point: P; distance: number } | null }>,
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: P;
    stickiness?: number;
  } = {}
): SnapResult<P> {
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
    const constraints: Array<LinearConstraint<P>> = [];

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

// Wrapper for backward compatibility - delegates to unified snapSequentialQP
export function snapSequentialQPBezierControl<TCandidate, P extends PointLike<P>>(
  buildCandidateAt: (pos: P) => TCandidate,
  from: P,
  desired: P,
  isValidCandidate: (candidate: TCandidate) => boolean,
  control: BezierControlKey,
  p0: P,
  fixedOther: P,
  p3: P,
  obstacles: Array<{ getNearestLocation: (p: P) => { point: P; distance: number } | null }>,
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: P;
    stickiness?: number;
  } = {}
): SnapResult<P> {
  const sampler = createControlSampler(control, p0, fixedOther, p3);
  return snapSequentialQP(buildCandidateAt, from, desired, isValidCandidate, sampler, obstacles, square, opts);
}

// Wrapper for backward compatibility - delegates to unified snapSequentialQP
export function snapSequentialQPBezierJunction<TCandidate, P extends PointLike<P>>(
  buildCandidateAt: (junction: P) => TCandidate,
  from: P,
  desired: P,
  isValidCandidate: (candidate: TCandidate) => boolean,
  prevP0: P,
  prevP1: P,
  prevP2: P,
  nextP1: P,
  nextP2: P,
  nextP3: P,
  obstacles: Array<{ getNearestLocation: (p: P) => { point: P; distance: number } | null }>,
  square: SquareBounds,
  opts: {
    tSamples?: number[];
    margin?: number;
    iters?: number;
    obstacleThreshold?: number;
    previousSolution?: P;
    stickiness?: number;
  } = {}
): SnapResult<P> {
  const sampler = createJunctionSampler(prevP0, prevP1, prevP2, from, nextP1, nextP2, nextP3);
  return snapSequentialQP(buildCandidateAt, from, desired, isValidCandidate, sampler, obstacles, square, opts);
}
