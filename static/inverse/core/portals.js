/** Split visible curves at guides inferred only from the artwork's border.
 * Subdivision preserves the curve exactly; no reference cutting paths are used.
 */
import { dot, distance, realRoots01 } from './bezier.js';

export function guidePortals(curves, width, tolerance = .01) {
  const border = [[], []], counts = new Map();
  for (const c of curves) for (const p of [c.p[0], c.p[3]]) {
    const key = p.map(x => x.toFixed(5)).join(',');
    const item = counts.get(key) || { p, count: 0 };
    item.count++; counts.set(key, item);
  }
  for (const { p, count } of counts.values()) if (count % 2) {
    for (const axis of [0, 1]) if (Math.min(p[1 - axis], width - p[1 - axis]) < 1e-5 && p[axis] > tolerance && p[axis] < width - tolerance) border[axis].push(p[axis]);
  }
  const guides = [];
  for (const axis of [0, 1]) {
    // Slightly different positions on opposite borders describe one guide.
    const groups = [];
    for (const value of border[axis].sort((a, b) => a - b)) {
      const group = groups.at(-1);
      if (group && value - group[0] <= 2 * tolerance) group.push(value);
      else groups.push([value]);
    }
    for (const g of groups) guides.push({ normal: axis === 0 ? [1, 0] : [0, 1], offset: g.reduce((a, b) => a + b, 0) / g.length });
  }
  // The transpose diagonal supports matching sheets; the other diagonal is not implied by that symmetry.
  guides.push({ normal: [1, -1], offset: 0 });
  if (guides.length > 42 || curves.length > 350) return { curves, guides: [], added: 0, skipped: 'Guide subdivision budget exceeded.' };
  const result = [];
  for (const c of curves) {
    const cuts = [0, 1];
    for (const { normal, offset } of guides) {
      const q = c.p.map(p => dot(p, normal) - offset);
      if (Math.max(...q.map(Math.abs)) < tolerance) continue;
      cuts.push(...realRoots01([q[0], 3 * (q[1] - q[0]), 3 * (q[2] - 2 * q[1] + q[0]), q[3] - 3 * q[2] + 3 * q[1] - q[0]]));
    }
    const unique = [0];
    for (const t of cuts.sort((a, b) => a - b)) if (t > 0 && t < 1 && distance(c.point(t), c.p[3]) > 4 * tolerance && distance(c.point(t), c.point(unique.at(-1))) > 4 * tolerance) unique.push(t);
    unique.push(1);
    for (let i = 1; i < unique.length; i++) result.push(c.subcurve(unique[i - 1], unique[i]));
  }
  if (result.length > 650) return { curves, guides: [], added: 0, skipped: 'Guide subdivision budget exceeded.' };
  return { curves: result, guides, added: result.length - curves.length };
}

export function guidePairs(points, eligible, guides, tolerance) {
  const pairs = new Set();
  for (const { normal, offset } of guides) {
    const on = eligible.filter(v => Math.abs(dot(points[v], normal) - offset) < 2 * tolerance)
      .sort((a, b) => dot(points[a], [-normal[1], normal[0]]) - dot(points[b], [-normal[1], normal[0]]));
    for (let i = 1; i < on.length; i++) pairs.add([Math.min(on[i - 1], on[i]), Math.max(on[i - 1], on[i])].join(','));
  }
  return pairs;
}
