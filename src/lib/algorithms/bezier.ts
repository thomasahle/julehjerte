export function bernsteinWeight(control: 'p1' | 'p2', t: number): number {
  const u = 1 - t;
  if (control === 'p1') return 3 * u * u * t;
  return 3 * u * t * t;
}
