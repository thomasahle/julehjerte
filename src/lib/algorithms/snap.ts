import type { PointLike } from '$lib/geometry/pointLike';

function makeDirections<P extends PointLike<P>>(seed: P, count: number): P[] {
  const dirs: P[] = [];
  const origin = seed.clone();
  origin.x = 0;
  origin.y = 0;
  for (let i = 0; i < count; i++) {
    const a = (i * 2 * Math.PI) / count;
    const dir = origin.clone();
    dir.x = Math.cos(a);
    dir.y = Math.sin(a);
    dirs.push(dir);
  }
  return dirs;
}

const DIRS_BY_POINT_CLASS = new WeakMap<object, unknown>();

function dirs8<P extends PointLike<P>>(seed: P): P[] {
  const ctor = (seed as unknown as { constructor: object }).constructor;
  const cached = DIRS_BY_POINT_CLASS.get(ctor) as P[] | undefined;
  if (cached) return cached;
  const dirs = makeDirections(seed, 8);
  DIRS_BY_POINT_CLASS.set(ctor, dirs as unknown);
  return dirs;
}

export function moveHandleToward<TCandidate, P extends PointLike<P>>(
  buildCandidateAt: (pos: P) => TCandidate,
  from: P,
  to: P,
  isValidCandidate: (candidate: TCandidate) => boolean,
  binarySearchSteps = 8
): P {
  const desired = buildCandidateAt(to);
  if (isValidCandidate(desired)) return to;

  const startOk = isValidCandidate(buildCandidateAt(from));
  if (!startOk) return from;

  const delta = to.subtract(from);
  let lo = 0;
  let hi = 1;
  let best = 0;
  for (let i = 0; i < binarySearchSteps; i++) {
    const mid = (lo + hi) / 2;
    const pt = from.add(delta.multiply(mid));
    const cand = buildCandidateAt(pt);
    if (isValidCandidate(cand)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return from.add(delta.multiply(best));
}

function snapHandlePosition<TCandidate, P extends PointLike<P>>(
  buildCandidateAt: (pos: P) => TCandidate,
  from: P,
  desired: P,
  isValidCandidate: (candidate: TCandidate) => boolean
): P {
  const direct = buildCandidateAt(desired);
  if (isValidCandidate(direct)) return desired;

  // Start with the furthest point toward the cursor that remains valid
  let pt = moveHandleToward(buildCandidateAt, from, desired, isValidCandidate);
  let bestDist = pt.getDistance(desired);
  const dirs = dirs8(from);

  const startStep = Math.min(30, Math.max(4, bestDist));
  for (let step = startStep; step >= 1; step /= 2) {
    for (let iter = 0; iter < 4; iter++) {
      let improved = false;
      let bestPt = pt;
      let bestLocalDist = bestDist;

      for (const dir of dirs) {
        const target = pt.add(dir.multiply(step));
        const candPt = moveHandleToward(buildCandidateAt, pt, target, isValidCandidate);
        const d = candPt.getDistance(desired);
        if (d + 0.1 < bestLocalDist) {
          bestPt = candPt;
          bestLocalDist = d;
          improved = true;
        }
      }

      if (!improved) break;
      pt = bestPt;
      bestDist = bestLocalDist;
    }
  }

  return pt;
}
