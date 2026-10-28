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

/** Where two corners of the outline come within `distance` (reference units)
 * of each other, they meet at the midpoint: a touching. A picture's checker
 * corner, its pixels blending four colours, is sampled as two corners a
 * fraction of a millimetre apart, which only a hidden cut could join; no cut
 * could follow a passage that narrow anyway. A corner is a point of a boundary
 * (a vertex, or the end two curves share) where it turns by at least `turn`
 * radians within `window` either way; curves running close side by side do not
 * turn, and stay apart. The two are of different boundaries or far apart along
 * one. Every curve ending at a corner moves with it, in place. */
export function joinNearTouchings(lines, distance, {turn = .8, window = Math.max(distance, .15)} = {}) {
  const at = new Map();
  lines.forEach((pts, i) => pts.forEach((p, k) => {
    const key = pointKey(p);
    if (!at.has(key)) at.set(key, {p, occ: []});
    at.get(key).occ.push([i, k]);
  }));
  // The next vertex along a boundary from vertex k of line i, `step` its way
  // there: [line, vertex, step], on through the end a line shares with the next,
  // or null where the boundary meets others or ends.
  const shared = new Map();
  for (const {occ} of at.values()) if (occ.length === 2) for (const [i, k] of occ) shared.set(`${i}:${k}`, occ.find(([j, l]) => j !== i || l !== k));
  const advance = (i, k, step) => {
    if (k + step >= 0 && k + step < lines[i].length) return [i, k + step, step];
    const next = shared.get(`${i}:${k}`);
    if (!next) return null;
    const s = next[1] === 0 ? 1 : -1;
    return [next[0], next[1] + s, s];
  };
  // A point's boundary either way: the first vertex `window` from it, or null
  // where the boundary ends sooner. Wider than a traced corner's chamfer (two
  // turns of 45 degrees a fraction of a millimetre apart).
  const walk = (i, k, step) => {
    const o = lines[i][k];
    for (let here = advance(i, k, step), guard = 0; here && guard < 4096; here = advance(...here), guard++) {
      const q = lines[here[0]][here[1]];
      if (Math.hypot(q[0] - o[0], q[1] - o[1]) >= window) return q;
    }
    return null;
  };
  const corners = [];
  for (const [key, {p, occ}] of at) {
    let a, b;
    if (occ.length === 1) {
      const [i, k] = occ[0];
      if (k === 0 || k === lines[i].length - 1) continue;
      [a, b] = [walk(i, k, -1), walk(i, k, 1)];
      if (!a || !b) continue;
    } else if (occ.length === 2) {
      const ends = occ.map(([i, k]) => k === 0 ? walk(i, k, 1) : k === lines[i].length - 1 ? walk(i, k, -1) : null);
      if (ends.includes(null)) continue;
      [a, b] = ends;
    } else continue;
    const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
    const angle = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    if (angle >= turn) corners.push({key, p, occ});
  }
  // The points along a corner's boundary within `arc` of it either way: two
  // corners of one boundary this near (a pixel's notch) would pinch off a loop
  // of no area, not touch.
  const along = (c, arc) => {
    const keys = new Set();
    for (const [i, k] of c.occ) for (const step of [-1, 1]) {
      let prev = lines[i][k], left = arc;
      for (let here = advance(i, k, step), guard = 0; here && guard < 4096; here = advance(...here), guard++) {
        const q = lines[here[0]][here[1]];
        left -= Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        if (left < 0) break;
        keys.add(pointKey(q));
        prev = q;
      }
    }
    return keys;
  };
  const near = new Map(), nearOf = c => near.get(c) ?? near.set(c, along(c, 4 * window)).get(c);
  const grid = new PointGrid(corners.map(c => c.p), distance), pairs = [];
  corners.forEach((c, x) => {
    for (const y of grid.within(c.p, distance)) {
      if (y <= x) continue;
      const d = corners[y], gap = Math.hypot(c.p[0] - d.p[0], c.p[1] - d.p[1]);
      if (gap > 0 && gap <= distance && !nearOf(c).has(d.key)) pairs.push([gap, c, d]);
    }
  });
  // From each corner along its boundary either way to the next corner (its key
  // and the points passed), or to a junction of curves (none).
  const cornerAt = new Map(corners.map(c => [c.key, c])), chains = new Map();
  for (const c of corners) {
    const out = [];
    for (const [i, k] of c.occ) for (const step of k === 0 ? [1] : k === lines[i].length - 1 ? [-1] : [-1, 1]) {
      const pts = [lines[i][k]];
      for (let here = advance(i, k, step), guard = 0; here && guard < 65536; here = advance(...here), guard++) {
        const q = lines[here[0]][here[1]], key = pointKey(q);
        pts.push(q);
        if (key !== c.key && cornerAt.has(key)) { out.push([key, pts]); break; }
      }
    }
    chains.set(c.key, out);
  }
  // Joining both ends of a strip narrower than `distance` (both its sides run
  // between the same two joins) would lay its two sides on top of each other:
  // the second join is left out.
  const partner = new Map();
  const ringArea = ring => Math.abs(ring.reduce((sum, p, k) => { const q = ring[(k + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const arc = pts => pts.reduce((sum, p, k) => k ? sum + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0, 0);
  const strip = (c, d) => chains.get(c.key).some(([c2, P]) => partner.has(c2) && chains.get(d.key).some(([d2, Q]) =>
    d2 === partner.get(c2) && ringArea([...P, ...[...Q].reverse()]) < distance * Math.max(arc(P), arc(Q))));
  // Each corner joins once.
  const used = new Set();
  let joined = 0;
  for (const [, c, d] of pairs.sort((a, b) => a[0] - b[0])) {
    if (used.has(c.key) || used.has(d.key) || strip(c, d)) continue;
    used.add(c.key); used.add(d.key);
    partner.set(c.key, d.key); partner.set(d.key, c.key);
    const m = [(c.p[0] + d.p[0]) / 2, (c.p[1] + d.p[1]) / 2];
    for (const [i, k] of [...c.occ, ...d.occ]) { lines[i][k][0] = m[0]; lines[i][k][1] = m[1]; }
    joined++;
  }
  return joined;
}

/** Segments [a, b] of the target's outline, each with the target's colour on its
 * left. `tolerance` (reference units) simplifies each curve between its ends;
 * with `nearTouch`, curves' corners that close are joined (joinNearTouchings). */
export function targetSegments(target, {tolerance = .002, merge = 1e-4, nearTouch = target.metadata?.nearTouch ?? 0} = {}) {
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
  if (!(nearTouch > 0)) return segmentsOf(lines, target, tolerance, merge);
  // Joined where corners nearly touch; should that leave no outline to build
  // on (a case the joining missed), as traced.
  const unjoined = structuredClone(lines);
  joinNearTouchings(lines, nearTouch);
  try {
    return segmentsOf(lines, target, tolerance, merge);
  } catch {
    return segmentsOf(unjoined, target, tolerance, merge);
  }
}

function segmentsOf(lines, target, tolerance, merge) {
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
  let merged = lines.map((pts, k) => [point.get(find(2 * k)), ...pts.slice(1, -1), point.get(find(2 * k + 1))])
    .map(pts => pts.filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1])))
    // A sliver the merge closed up goes; a short piece to a merged point stays.
    .filter(pts => pts.length >= 2 && (pts[0] !== pts.at(-1) || pts.some(p => Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > tolerance)));
  merged = withoutClosedSlivers(merged, tolerance);
  const segs = merged.flatMap(pts => pts.slice(1).map((p, i) => [pts[i], p]));
  return orient(segs, target.phase === 1);
}

/** `lines` without the chains of them, through points only two share, that
 * leave a point and come back to it within three `tolerance`s of it: two touchings a
 * hair apart, joined by tiny curves either way round, merged into one point
 * (stjernegitter's rhombi, traced as touchings 0.06 pixels apart, became one
 * point of eight curves, which no template has). */
export function withoutClosedSlivers(lines, tolerance) {
  const at = new Map();
  lines.forEach((pts, i) => { for (const end of [0, 1]) { const k = pointKey(end ? pts.at(-1) : pts[0]); if (!at.has(k)) at.set(k, []); at.get(k).push([i, end]); } });
  const drop = new Set();
  lines.forEach((pts, i) => {
    if (drop.has(i)) return;
    const start = pointKey(pts[0]);
    if (at.get(start).length <= 2) return;
    // Along the chain from this line's start until a point not two lines share.
    const chain = [i];
    let line = i, far = pts.at(-1), key = pointKey(far), size = 0;
    for (const p of pts) size = Math.max(size, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]));
    while (at.get(key).length === 2 && chain.length < 64) {
      const [next, end] = at.get(key).find(([j]) => j !== line);
      if (chain.includes(next)) break;
      chain.push(next); line = next;
      const q = lines[next];
      for (const p of q) size = Math.max(size, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]));
      far = end ? q[0] : q.at(-1); key = pointKey(far);
    }
    if (key === start && chain.length > 1 && size <= 3 * tolerance) chain.forEach(j => drop.add(j));
  });
  return drop.size ? lines.filter((_, i) => !drop.has(i)) : lines;
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
