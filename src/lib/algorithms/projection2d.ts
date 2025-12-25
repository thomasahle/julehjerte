import type { PointLike } from '$lib/geometry/pointLike';

export type LinearConstraint<P> = { a: P; b: number };

function isFeasiblePoint<P extends PointLike<P>>(
  p: P,
  constraints: Array<LinearConstraint<P>>,
  eps = 1e-6
): boolean {
  for (const c of constraints) {
    if (c.a.dot(p) + eps < c.b) return false;
  }
  return true;
}

export function solve2DProjection<P extends PointLike<P>>(
  desired: P,
  constraints: Array<LinearConstraint<P>>
): P {
  if (!constraints.length) return desired;
  if (isFeasiblePoint(desired, constraints)) return desired;

  let best: P | null = null;
  let bestD = Infinity;

  const consider = (p: P) => {
    if (!isFeasiblePoint(p, constraints)) return;
    const d = p.getDistance(desired);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  };

  // Active set size 1.
  for (const c of constraints) {
    const denom = c.a.dot(c.a);
    if (denom < 1e-8) continue;
    const t = (c.b - c.a.dot(desired)) / denom;
    const p = desired.add(c.a.multiply(t));
    consider(p);
  }

  // Active set size 2.
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const a1 = constraints[i]!.a;
      const b1 = constraints[i]!.b;
      const a2 = constraints[j]!.a;
      const b2 = constraints[j]!.b;
      const det = a1.x * a2.y - a1.y * a2.x;
      if (Math.abs(det) < 1e-8) continue;
      const x = (b1 * a2.y - a1.y * b2) / det;
      const y = (a1.x * b2 - b1 * a2.x) / det;
      const p = desired.clone();
      p.x = x;
      p.y = y;
      consider(p);
    }
  }

  return best ?? desired;
}
