/** The app's prepared target as the exact-outline search reads it: its boundary
 * curves, noded where they meet, flattened and simplified in the reference
 * frame (12 units, y up), and oriented with the target's colour on the left. */
import {nodeCurves, pointInRing} from '../geometry.js';
import {SIZE, buildStructure, pointKey} from './structure.js';
import {PointGrid} from './polyline.js';

/** App coordinates (mm, y down) to the reference frame and back. */
export const toReference = (p, width) => [SIZE * p[0] / width, SIZE - SIZE * p[1] / width];
export const toApp = (p, width) => [width * p[0] / SIZE, width * (SIZE - p[1]) / SIZE];

// Douglas-Peucker keeping both ends (the shared nodes stay exact).
export function simplify(pts, tol) {
  if (pts.length < 3 || !tol) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(), [ax, ay] = pts[i], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let worst = -1, at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = len > 0 ? Math.abs(dx * (pts[k][1] - ay) - dy * (pts[k][0] - ax)) / len : Math.hypot(pts[k][0] - ax, pts[k][1] - ay);
      if (d > worst) { worst = d; at = k; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

const onBorder = (p, eps = 1e-9) => Math.min(p[0], p[1], SIZE - p[0], SIZE - p[1]) < eps;

/** Segments [a, b] of the target's outline, each with the target's colour on its
 * left. `tolerance` (reference units) simplifies each curve between its ends. */
export function targetSegments(target, {tolerance = .002, merge = 1e-4} = {}) {
  const width = target.width, noded = nodeCurves(target.curves, Math.max(1e-6, tolerance * width / SIZE / 10));
  // One point per shared end: noding leaves ends a rounding error apart.
  const canon = new Map(), snap = p => {
    const k = `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
    if (!canon.has(k)) canon.set(k, p.map(v => Math.abs(v) < 1e-9 ? 0 : Math.abs(v - SIZE) < 1e-9 ? SIZE : v));
    return canon.get(k);
  };
  const lines = [];
  for (const curve of noded) {
    let pts = curve.flatten(Math.max(1e-5, tolerance * width / SIZE / 4)).map(p => toReference(p, width));
    if (pts.length < 2) continue;
    pts[0] = snap(pts[0]);
    pts[pts.length - 1] = snap(pts.at(-1));
    // A curve along the square's border is no outline (the SVG loader drops these too).
    if (pts.every(p => onBorder(p)) && [0, 1].some(axis => pts.every(p => Math.abs(p[axis]) < 1e-9 || Math.abs(p[axis] - SIZE) < 1e-9)
      && pts.every(p => Math.abs(p[axis] - pts[0][axis]) < 1e-9))) continue;
    pts = simplify(pts, tolerance).filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1]));
    if (pts.length >= 2) lines.push(pts);
  }
  // Junctions and loose ends within the tolerance are one point (a near
  // touching, which noding splits into several joined by slivers), and so is a
  // curve's vertex `merge` from one; on the border if one is. Vertices of
  // curves stay apart: moved onto a junction, a dense curve's could cross another.
  const ends = lines.flatMap(pts => [pts[0], pts.at(-1)]), grid = new PointGrid(ends, tolerance), root = ends.map((_, i) => i);
  const degree = new Map(), plain = p => degree.get(pointKey(p)) === 2;
  for (const p of ends) degree.set(pointKey(p), (degree.get(pointKey(p)) || 0) + 1);
  const find = i => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
  ends.forEach((p, i) => {
    for (const j of grid.within(p, tolerance)) {
      const q = ends[j], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (plain(p) && plain(q) ? d === 0 : plain(p) || plain(q) ? d <= merge : true) root[find(j)] = find(i);
    }
  });
  const point = new Map();
  ends.forEach((p, i) => { const r = find(i); if (!point.has(r) || onBorder(p)) point.set(r, p); });
  const merged = lines.map((pts, k) => [point.get(find(2 * k)), ...pts.slice(1, -1), point.get(find(2 * k + 1))])
    .map(pts => pts.filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1])))
    // A sliver the merge closed up goes; a short piece to a merged point stays.
    .filter(pts => pts.length >= 2 && (pts[0] !== pts.at(-1) || pts.some(p => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > tolerance)));
  const segs = merged.flatMap(pts => pts.slice(1).map((p, i) => [pts[i], p]));
  return orient(segs, target.phase === 1);
}

/** The segments oriented with the coloured faces on their left. The faces of the
 * outline and the square alternate in colour across every edge; the face at the
 * square's top-left corner (the app's origin) is coloured when `cornerFilled`. */
export function orient(segs, cornerFilled) {
  const st = buildStructure(segs), colour = new Array(st.faces.length).fill(null);
  const corner = [1e-6, SIZE - 1e-6];
  const start = st.faces.findIndex(f => pointInRing(corner, f.cyclepts[0]) && !f.cyclepts.slice(1).some(r => pointInRing(corner, r)));
  if (start < 0) throw new Error('No face holds the square\'s corner.');
  colour[start] = cornerFilled;
  const across = new Map();
  st.edges.forEach((_, e) => {
    for (const [a, b] of [[st.faceL.get(e), st.faceR.get(e)], [st.faceR.get(e), st.faceL.get(e)]]) {
      if (!across.has(a)) across.set(a, []);
      across.get(a).push(b);
    }
  });
  const queue = [start];
  while (queue.length) {
    const f = queue.pop();
    for (const g of across.get(f) || []) {
      if (colour[g] === null) { colour[g] = !colour[f]; queue.push(g); }
      else if (colour[g] === colour[f]) throw new Error('The outline does not two-colour its faces.');
    }
  }
  if (colour.includes(null)) throw new Error('A face is not reached from the square\'s corner.');
  const out = segs.map(s => s);
  st.edges.forEach((ed, e) => {
    const leftColoured = colour[st.faceL.get(e)];
    ed.sids.forEach((sid, i) => {
      // As the edge runs, its left face is faceL: keep the edge's direction if that face is coloured.
      const [a, b] = [ed.pts[i], ed.pts[i + 1]];
      out[sid] = leftColoured ? [a, b] : [b, a];
    });
  });
  return out;
}

/** The coloured faces' rings of a structure (black, as polygons), for the exact disagreement. */
export function colouredRings(st) {
  return st.faces.filter(f => f.black).flatMap(f => f.cyclepts);
}

export {pointInRing};
