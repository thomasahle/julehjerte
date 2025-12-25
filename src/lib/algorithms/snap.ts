import type { PointLike } from '$lib/geometry/pointLike';

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
