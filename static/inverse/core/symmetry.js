/** Optional identical-sheet constraint, inferred from the visible mask only. */
import { Cubic, realRoots01, distance } from './bezier.js';
import { sampleTarget } from './input.js';

export function transposeTarget(target, maximumChange = .01) {
  const source = target.sourceImage || { mask: sampleTarget(target, 400), resolution: 400 }, n = source.resolution;
  let difference = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) difference += source.mask[y * n + x] !== source.mask[x * n + y];
  if (difference / (n * n) > maximumChange) throw new Error('Matching sheets require a motif symmetric across the overlap diagonal. Turn off matching sheets for this artwork.');
  const curves = [];
  for (const c of target.curves) {
    const q = c.p.map(p => p[0] - p[1]);
    if (q.every(x => Math.abs(x) < 1e-8)) continue;
    const ts = [0, ...realRoots01([q[0], 3 * (q[1] - q[0]), 3 * (q[2] - 2 * q[1] + q[0]), q[3] - 3 * q[2] + 3 * q[1] - q[0]]), 1];
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] < 1e-10) continue;
      const s = c.subcurve(ts[i - 1], ts[i]);
      if (s.point(.5)[0] < s.point(.5)[1] || distance(s.p[0], s.p[3]) < 1e-7) continue;
      curves.push(s, new Cubic(s.p.map(([x, y]) => [y, x])));
    }
  }
  const sampled = sampleTarget({ ...target, curves }, n);
  const changes = sampled.reduce((s, c, i) => s + Number(c !== source.mask[i]), 0);
  return { ...target, curves, metadata: { ...target.metadata, preprocessing: { ...target.metadata.preprocessing, totalChangedPixels: changes, totalChangeFraction: changes / (n * n) }, identicalSheets: { transform: 'transpose', sourceDifferenceFraction: difference / (n * n), method: 'Reflect one half of the traced artwork; exported weave remains checked against the original classified image.' } } };
}

export const transposedKey = c => c.p.map(([x, y]) => [y, x]);
export function curveKey(points) {
  const key = p => p.map(v => v.map(x => Math.abs(x) < 1e-7 ? '0.000000' : x.toFixed(6)).join(',')).join(';');
  return [key(points), key(points.slice().reverse())].sort()[0];
}
