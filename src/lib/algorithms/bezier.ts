import type paper from 'paper';

export function bezierPoint(
  p0: paper.Point,
  p1: paper.Point,
  p2: paper.Point,
  p3: paper.Point,
  t: number
): paper.Point {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  const x = b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x;
  const y = b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y;
  const out = p0.clone();
  out.x = x;
  out.y = y;
  return out;
}

export function bernsteinWeight(control: 'p1' | 'p2', t: number): number {
  const u = 1 - t;
  if (control === 'p1') return 3 * u * u * t;
  return 3 * u * t * t;
}
