/** The app's prepared target as the exact-outline search reads it: its boundary
 * curves, noded where they meet, flattened and simplified in the reference
 * frame (12 units, y up), and oriented with the target's colour on the left. */
import {nodeCurves, pointInRing} from '../geometry.js';
import {SIZE, buildStructure, pointKey} from './structure.js';
import {PointGrid, cumlen, pointAt, project, segmentNearest} from './polyline.js';
import {act, group as closure, inverse} from './symmetry.js';

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
export function joinNearTouchings(lines, distance, {turn = .8, window = Math.max(distance, .15), symmetry = []} = {}) {
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
  // Each corner joins once. Under `symmetry` (the outline symmetric), a pair
  // with its images, all or none: of two pairs as near, the first would take
  // a corner from the other's image (amy-flowering's corner arcs, a petal
  // joined to one and not to its mirror).
  const orbit = orbitOf(corners, symmetry);
  const used = new Set(), decided = new Set(), pairKey = (c, d) => [c.key, d.key].sort().join('|');
  let joined = 0;
  for (const [, c, d] of pairs.sort((a, b) => a[0] - b[0])) {
    if (decided.has(pairKey(c, d))) continue;
    const all = orbit(c, d);
    all.forEach(([a, b]) => decided.add(pairKey(a, b)));
    const ends = all.flatMap(([a, b]) => [a.key, b.key]);
    if (new Set(ends).size !== ends.length || ends.some(k => used.has(k)) || all.some(([a, b]) => strip(a, b))) continue;
    for (const [a, b] of all) {
      used.add(a.key); used.add(b.key);
      partner.set(a.key, b.key); partner.set(b.key, a.key);
      const m = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2];
      for (const [i, k] of [...a.occ, ...b.occ]) { lines[i][k][0] = m[0]; lines[i][k][1] = m[1]; }
      joined++;
    }
  }
  return joined;
}

/** The pairs of `corners` a pair's images under the group `symmetry`
 * generates are, itself first; the pair alone where an image is no corner. */
function orbitOf(corners, symmetry) {
  const elements = symmetry.length ? closure(symmetry).filter(g => g !== 'identity') : [];
  const grid = new PointGrid(corners.map(c => c.p), .01);
  const at = p => { const [y] = grid.within(p, 1e-6); return y === undefined ? null : corners[y]; };
  return (c, d) => {
    const out = [[c, d]], seen = new Set([[c.key, d.key].sort().join('|')]);
    for (const g of elements) {
      const a = at(act(g, c.p)), b = at(act(g, d.p));
      if (!a || !b) return [[c, d]];
      const k = [a.key, b.key].sort().join('|');
      if (!seen.has(k)) { seen.add(k); out.push([a, b]); }
    }
    return out;
  };
}

/** Segments [a, b] of the target's outline, each with the target's colour on its
 * left. `tolerance` (reference units) simplifies each curve between its ends;
 * with `nearTouch`, curves' corners that close are joined (joinNearTouchings). */
export function targetSegments(target, {tolerance = .002, merge = 1e-4, nearTouch = target.metadata?.nearTouch ?? 0, symmetry = []} = {}) {
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
  // Under symmetry ties, the outline made symmetric where it nearly is
  // (symmetricLines).
  const even = pts => symmetry.length && symmetricLines(pts, symmetry, {simplified: tolerance}) || pts;
  if (!(nearTouch > 0)) return segmentsOf(even(lines), target, tolerance, merge);
  // Joined where corners nearly touch; should that leave no outline to build
  // on (a case the joining missed), as traced. Under ties made symmetric
  // first, each pair of corners joined with its images, and made symmetric
  // again: the joins' midpoints are images only to a rounding error.
  lines.splice(0, lines.length, ...even(lines));
  const unjoined = structuredClone(lines);
  joinNearTouchings(lines, nearTouch, {symmetry});
  lines.splice(0, lines.length, ...even(lines));
  try {
    return segmentsOf(lines, target, tolerance, merge);
  } catch {
    return segmentsOf(unjoined, target, tolerance, merge);
  }
}

/** `lines` (reference frame, ends shared as one point) made symmetric under
 * the group the square symmetries `names` generate: each chain of them between
 * junctions matched with its image under each element within `tolerance`,
 * each junction and each chain replaced by the mean of its images carried
 * back onto it, and carried out again; null when some chain or junction has
 * no image. A symmetric mask is traced only roughly symmetric, its curves
 * fitted from one end (balls' circles, davidsstjerne-circ's points), and
 * the ties then find positions on one side with no image on the other. */
export function symmetricLines(lines, names, {tolerance = .2, simplified = 0} = {}) {
  const group = closure(names);
  if (group.length < 2) return lines;
  // A vertex more than one line passes through (corners joined in the middle
  // of curves, joinNearTouchings) is a junction too.
  const passes = new Map();
  for (const pts of lines) for (const p of pts) passes.set(pointKey(p), (passes.get(pointKey(p)) || 0) + 1);
  lines = lines.flatMap(pts => {
    const out = [];
    let piece = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      piece.push(pts[k]);
      if (k < pts.length - 1 && passes.get(pointKey(pts[k])) > 1) { out.push(piece); piece = [pts[k]]; }
    }
    return [...out, piece];
  });
  const ends = new Map(), point = new Map();
  lines.forEach((pts, i) => [0, 1].forEach(end => {
    const p = end ? pts.at(-1) : pts[0], k = pointKey(p);
    if (!ends.has(k)) { ends.set(k, []); point.set(k, p); }
    ends.get(k).push([i, end]);
  }));
  // Chains through points two lines share; a ring of them is closed.
  const used = new Uint8Array(lines.length), chains = [];
  const walk = (i, end) => {
    const pts = [...(end ? [...lines[i]].reverse() : lines[i])];
    used[i] = 1;
    for (;;) {
      const at = ends.get(pointKey(pts.at(-1)));
      if (at.length !== 2) break;
      const next = at.find(([j]) => !used[j]);
      if (!next) break;
      const [j, e] = next;
      used[j] = 1;
      pts.push(...(e ? [...lines[j]].reverse() : lines[j]).slice(1));
    }
    const closed = pointKey(pts[0]) === pointKey(pts.at(-1)) && ends.get(pointKey(pts[0])).length === 2;
    chains.push({pts, closed});
  };
  lines.forEach((pts, i) => { if (!used[i]) for (const end of [0, 1]) if (!used[i] && ends.get(pointKey(end ? pts.at(-1) : pts[0])).length !== 2) walk(i, end); });
  lines.forEach((_, i) => { if (!used[i]) walk(i, 0); });
  chains.forEach(c => { c.cl = cumlen(c.pts); c.L = c.cl.at(-1); });
  // Junctions and loose ends, and where each element takes them.
  const nodes = [...new Set(chains.filter(c => !c.closed).flatMap(c => [pointKey(c.pts[0]), pointKey(c.pts.at(-1))]))];
  const node = new Map(nodes.map((k, i) => [k, i])), at = nodes.map(k => point.get(k));
  const nodeImage = {};
  for (const g of group) {
    const image = at.map(p => {
      const q = act(g, p);
      let best = -1, d = Infinity;
      at.forEach((r, j) => { const e = Math.hypot(r[0] - q[0], r[1] - q[1]); if (e < d) { d = e; best = j; } });
      return d <= tolerance ? best : -1;
    });
    if (image.includes(-1) || new Set(image).size !== image.length) return null;
    nodeImage[g] = image;
  }
  // Each chain's image under each element: [chain, +1 or -1 as it runs].
  const samples = c => Array.from({length: 9}, (_, k) => pointAt(c.pts, c.cl, c.L * (k + 1) / 10));
  const chainImage = {};
  for (const g of group) {
    const image = chains.map(c => {
      const mapped = samples(c).map(p => act(g, p));
      const from = !c.closed && nodeImage[g][node.get(pointKey(c.pts[0]))], to = !c.closed && nodeImage[g][node.get(pointKey(c.pts.at(-1)))];
      let best = null;
      chains.forEach((d, j) => {
        if (d.closed !== c.closed) return;
        const a = !d.closed && node.get(pointKey(d.pts[0])), b = !d.closed && node.get(pointKey(d.pts.at(-1)));
        if (!c.closed && !((a === from && b === to) || (a === to && b === from))) return;
        const arcs = mapped.map(p => project(d.pts, d.cl, p)), far = Math.max(...arcs.map(r => r.distance));
        if (far > tolerance || (best && far >= best[2])) return;
        let step = arcs[5].arc - arcs[3].arc;
        if (d.closed) step = ((step + d.L / 2) % d.L + d.L) % d.L - d.L / 2;
        best = [j, step > 0 ? 1 : -1, far];
      });
      return best;
    });
    if (image.includes(null) || new Set(image.map(([j]) => j)).size !== chains.length) return null;
    chainImage[g] = image;
  }
  // Junctions: the mean of their images carried back.
  const mean = points => points.reduce((m, p) => [m[0] + p[0] / points.length, m[1] + p[1] / points.length], [0, 0]);
  const onSide = v => Math.abs(v) < 1e-9 ? 0 : Math.abs(v - SIZE) < 1e-9 ? SIZE : v;
  const even = at.map((_, v) => mean(group.map(g => act(inverse(g), at[nodeImage[g][v]]))).map(onSide));
  // Chains: an orbit's mean on its first chain's own vertices (each the mean
  // of its nearest points on the orbit's chains carried back, near where it
  // is along them), so that a corner stays one; made symmetric under the
  // elements mapping that chain onto itself (exactlyInvariant); each member
  // that carried out.
  const out = new Array(chains.length);
  chains.forEach((c, i) => {
    if (out[i]) return;
    const back = group.map(g => {
      const [j, way] = chainImage[g][i], h = inverse(g);
      let pts = chains[j].pts.map(p => act(h, p));
      if (way < 0) pts.reverse();
      if (c.closed) {
        const cl = cumlen(pts), {arc} = project(pts, cl, c.pts[0]), L = cl.at(-1);
        const after = pts.filter((_, k) => cl[k] > arc + 1e-12 && k < pts.length - 1), before = pts.filter((_, k) => cl[k] < arc - 1e-12 && k > 0);
        const start = pointAt(pts, cl, arc);
        pts = arc <= 1e-12 || arc >= L - 1e-12 ? pts : [start, ...after, pts[0], ...before, start];
      }
      const cl = cumlen(pts);
      return {pts, cl, L: cl.at(-1)};
    });
    let q = c.pts.map((p, k) => mean(back.map(b => nearestAround(b, p, c.cl[k] / c.L * b.L, Math.max(.3, .05 * b.L), c.closed))));
    if (!c.closed) { q[0] = even[node.get(pointKey(c.pts[0]))]; q[q.length - 1] = even[node.get(pointKey(c.pts.at(-1)))]; }
    else q[q.length - 1] = q[0];
    const stabilizer = group.filter(g => chainImage[g][i][0] === i);
    if (stabilizer.length > 1) {
      q = exactlyInvariant(q, stabilizer.map(g => [g, chainImage[g][i][1]]), c.closed);
      if (!q) { out.fill(null); return; }
    }
    q = simplify(q, simplified).filter((p, k, a) => k === 0 || pointKey(p) !== pointKey(a[k - 1]));
    group.forEach(g => {
      const [j, way] = chainImage[g][i];
      if (out[j]) return;
      let pts = q.map(p => act(g, p));
      if (way < 0) pts.reverse();
      const d = chains[j];
      if (!d.closed) { pts[0] = even[node.get(pointKey(d.pts[0]))]; pts[pts.length - 1] = even[node.get(pointKey(d.pts.at(-1)))]; }
      else pts[pts.length - 1] = pts[0];
      out[j] = pts;
    });
  });
  return out.some(pts => !pts || pts.length < 2) ? null : out;
}

/** The point of polyline `b` nearest `p` among its segments within `w` of arc
 * `s` (round a ring when `closed`): a chain coming back near itself, a tip,
 * is not read on its other side. */
function nearestAround(b, p, s, w, closed) {
  let best = null;
  for (let i = 0; i + 1 < b.pts.length; i++) {
    let d = (b.cl[i] + b.cl[i + 1]) / 2 - s;
    if (closed) d = ((d + b.L / 2) % b.L + b.L) % b.L - b.L / 2;
    if (Math.abs(d) > w + (b.cl[i + 1] - b.cl[i]) / 2) continue;
    const [distance, f] = segmentNearest(p, b.pts[i], b.pts[i + 1]);
    if (!best || distance < best[0]) best = [distance, i, f];
  }
  if (!best) return pointAt(b.pts, b.cl, Math.min(Math.max(s, 0), b.L));
  const [, i, f] = best, a = b.pts[i], c = b.pts[i + 1];
  return [a[0] + f * (c[0] - a[0]), a[1] + f * (c[1] - a[1])];
}

// Square symmetries of the reference frame as lines they fix: a mirror its
// axis (n . p = n . centre), a half turn the centre.
const C = SIZE / 2, AXES = {mirrorX: [1, 0], mirrorY: [0, 1], transpose: [1, -1], antiTranspose: [1, 1]};
const across = (name, p) => AXES[name][0] * (p[0] - C) + AXES[name][1] * (p[1] - C);
/** The point between `a` and `b` on the mirror's axis. */
function onAxis(name, a, b) {
  const fa = across(name, a), fb = across(name, b), t = fa === fb ? .5 : fa / (fa - fb);
  const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return act(name, p).map((v, k) => (v + p[k]) / 2);
}

/** Polyline `q`, which the elements `stabilizer` ([name, way]: as it runs,
 * or reversed) map onto itself roughly, made so exactly: an open one
 * reversed by a mirror, its half up to the axis and that half's image; by a
 * half turn, its half up to the centre; along a mirror's axis, on it. A ring:
 * under mirrors, its arc between two crossings of their axes unfolded, each
 * next arc the last one's image in the mirror its end is on; under turns
 * alone, its arc from its start to the start's image and that arc turned
 * round. Null where it cannot be. */
function exactlyInvariant(q, stabilizer, closed) {
  const others = stabilizer.filter(([g]) => g !== 'identity'), mirrors = others.filter(([g]) => AXES[g]);
  if (!closed) {
    if (others.length !== 1) return null;
    const [[g, way]] = others;
    if (way > 0) return AXES[g] ? q.map(p => act(g, p).map((v, k) => (v + p[k]) / 2)) : null;
    let k = -1, x;
    if (AXES[g]) {
      // The crossing nearest its middle: one with both ends on the axis (a
      // curve leaving a touching on a diagonal and coming back to it) starts
      // on it too (stjerne-ramme).
      const cl = cumlen(q), L = cl.at(-1), side = p => Math.abs(across(g, p)) < 1e-9 ? 0 : Math.sign(across(g, p));
      for (let i = 0; i + 1 < q.length; i++) {
        const middle = Math.abs((cl[i] + cl[i + 1]) / 2 - L / 2);
        const crosses = side(q[i]) * side(q[i + 1]) < 0 || (side(q[i]) === 0 && i > 0) || (side(q[i + 1]) === 0 && i + 1 < q.length - 1);
        if (crosses && (k < 0 || middle < Math.abs((cl[k] + cl[k + 1]) / 2 - L / 2))) k = i;
      }
      if (k < 0) return null;
      x = side(q[k]) === 0 && k > 0 ? q[k].slice() : side(q[k + 1]) === 0 ? q[k + 1].slice() : onAxis(g, q[k], q[k + 1]);
      if (side(q[k + 1]) === 0) k++;
    } else if (g === 'rotate180') {
      let d = Infinity;
      for (let i = 0; i + 1 < q.length; i++) { const [e] = segmentNearest([C, C], q[i], q[i + 1]); if (e < d) { d = e; k = i; } }
      x = [C, C];
    } else return null;
    const half = [...q.slice(0, k + 1), x].filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1]));
    return [...half, ...half.slice(0, -1).map(p => act(g, p)).reverse()];
  }
  const ring = q.slice(0, -1), n = ring.length;
  if (mirrors.length) {
    // Crossings of the axes in order round the ring: [segment, how far
    // along it, point, mirror]; a vertex on an axis once, at its own segment.
    const crossings = [], side = (g, p) => Math.abs(across(g, p)) < 1e-9 ? 0 : Math.sign(across(g, p));
    for (let i = 0; i < n; i++) for (const [g] of mirrors) {
      const a = ring[i], b = ring[(i + 1) % n];
      if (side(g, a) === 0) crossings.push([i, 0, a.slice(), g]);
      else if (side(g, a) * side(g, b) < 0) crossings.push([i, across(g, a) / (across(g, a) - across(g, b)), onAxis(g, a, b), g]);
    }
    if (crossings.length < 2) return null;
    crossings.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
    const [[i0, , x0], [i1, , x1, m1]] = crossings;
    let piece = [x0, ...ring.slice(i0 + 1, i1 + 1), x1].filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1]));
    const out = [...piece];
    let mirror = m1;
    for (let k = 1; k < 2 * stabilizer.length; k++) {
      piece = piece.map(p => act(mirror, p)).reverse();
      out.push(...piece.slice(1));
      const end = piece.at(-1);
      if (Math.hypot(end[0] - x0[0], end[1] - x0[1]) < 1e-6) { out[out.length - 1] = out[0]; return out; }
      mirror = mirrors.map(([g]) => g).find(g => Math.abs(across(g, end)) < 1e-6);
      if (!mirror) return null;
    }
    return null;
  }
  // Turns alone: the smallest that carries the start ahead along the ring.
  const cl = cumlen(q), L = cl.at(-1);
  for (const [g] of others) {
    const order = g === 'rotate180' ? 2 : 4, target = act(g, q[0]), {arc} = project(q, cl, target);
    if (Math.abs(arc - L / order) > .1 * L) continue;
    const k = cl.findIndex(s => s >= arc) - 1, piece = [...q.slice(0, k + 1), target].filter((p, i, a) => i === 0 || pointKey(p) !== pointKey(a[i - 1]));
    const out = [...piece];
    let turned = piece;
    for (let t = 1; t < order; t++) { turned = turned.map(p => act(g, p)); out.push(...turned.slice(1)); }
    out[out.length - 1] = out[0];
    return out;
  }
  return null;
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
