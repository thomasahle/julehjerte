/** The cutting rules as nogoods for the exact model (the reference solver's
 * sat_exact.visible_nogoods, route_nogoods and geometry_nogoods). A nogood is a
 * list of literals that may not all hold: ['lab', [e, i], 1] (run i of edge e is
 * cut by paper A; 0: by B), ['x', key, 1] (hidden segment `key` is used; 0: not),
 * ['sw', [e, j], 1] (position j of e switches; 0: it does not). */
import {PointGrid, angle, cumlen, pointAt, subPolyline, segmentNearest} from './polyline.js';
import {pointKey} from './structure.js';
import {tokenKey} from './candidates.js';

/** The label run of edge e holding arc length s (run i lies between positions i and i + 1). */
export function runOf(positions, e, s) {
  const grid = positions.get(e) || [];
  let n = 0;
  while (n < grid.length && grid[n] <= s) n++;
  return n;
}

const litKey = ([kind, ref, v]) => `${kind}:${Array.isArray(ref) ? ref.join(',') : ref}:${v}`;
export const nogoodKey = n => n.map(litKey).sort().join('&');
class NogoodSet {
  constructor() { this.map = new Map(); }
  add(lits) { const n = [...lits].sort((a, b) => litKey(a) < litKey(b) ? -1 : 1); this.map.set(nogoodKey(n), n); }
  list() { return [...this.map.values()]; }
}

// Within 1.5 mm, at least 3 mm along (the app's return search), with sampling margins.
const RETURN_GAP = 1.55, RETURN_ALONG = 2.9;  // mm

/** Corners turning by more than the maximum turn: (edge, arc); each needs a switch. */
export function spikes(outline) {
  const out = [], limit = 180 - outline.rules.maxTurn + 2;
  outline.corners.forEach((cs, e) => {
    for (const c of cs) {
      const sides = outline.sides(e, c);
      if (sides.length === 2 && angle(sides[0], sides[1]) < limit) out.push([e, c]);
    }
  });
  return out;
}

/** Where one edge comes back within 1.5 mm of itself 3 mm to `local` further
 * along, turning by 190 degrees or more between, which one slit cannot follow:
 * [e, lo, hi, wraps, tip], the arcs from lo to hi (past the end of a loop when
 * it wraps) and the vertex turning most between. */
export function returns(outline) {
  const R = outline.rules, gap = RETURN_GAP * R.mm, along = RETURN_ALONG * R.mm, out = [];
  outline.E.forEach((ed, e) => {
    const idx = [];
    outline.edge.forEach((f, i) => { if (f === e) idx.push(i); });
    if (idx.length < 2) return;
    const poly = ed.pts, cl = outline.geo[e], L = outline.L[e], loop = ed.loop, vertex = [], turn = [], at = [];
    for (let i = loop ? 0 : 1; i < poly.length - 1; i++) {
      const prev = i ? poly[i - 1] : poly.at(-2);
      vertex.push(cl[i]);
      at.push(poly[i]);
      turn.push(angle([poly[i][0] - prev[0], poly[i][1] - prev[1]], [poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]]));
    }
    const local = new PointGrid(idx.map(i => outline.P[i]), Math.max(gap, .05));
    idx.forEach((i, a) => {
      for (const b of local.within(outline.P[i], gap)) {
        if (b <= a) continue;
        const [s, t] = [outline.arc[i], outline.arc[idx[b]]].sort((x, y) => x - y);
        for (const [lo, hi, wraps] of [[s, t, false], ...(loop ? [[t, s + L, true]] : [])]) {
          if (!(along <= hi - lo && hi - lo <= R.local)) continue;
          let total = 0, tip = -1;
          vertex.forEach((v, k) => {
            if (!(wraps ? (v > lo || v < hi - L) : (v > lo && v < hi))) return;
            total += turn[k];
            if (tip < 0 || turn[k] > turn[tip]) tip = k;
          });
          if (total >= 190) out.push([e, lo, hi, wraps, at[tip]]);
        }
      }
    });
  });
  return out;
}

/** The static rules on the outline: side borders, close visible pieces, sharp touchings, returns, spikes. */
export function visibleNogoods(outline, cand) {
  const R = outline.rules, positions = cand.positions, out = new NogoodSet();
  // Side borders: A may not come within `border` of x = 0, 12, nor B of y = 0, 12.
  outline.P.forEach(([x, y], i) => {
    const e = outline.edge[i], s = outline.arc[i];
    const nearX = Math.min(x, 12 - x) < R.border, nearY = Math.min(y, 12 - y) < R.border;
    if (nearX !== nearY) out.add([['lab', [e, runOf(positions, e, s)], nearX ? 1 : 0]]);
  });
  // Close pairs that no slit joins locally are cut by different papers, unless
  // one short hidden segment between them is used.
  const byPosition = cand.byPosition();
  outline.P.forEach((p, i) => {
    for (const j of outline.grid.within(p, R.gap)) {
      if (j <= i) continue;
      const e = outline.edge[i], s = outline.arc[i], f = outline.edge[j], t = outline.arc[j];
      if (outline.nearLocally(e, s, f, t, R.local)) continue;
      const ra = [e, runOf(positions, e, s)], rb = [f, runOf(positions, f, t)], joins = new Map();
      for (const [g, sg, h, sh] of [[e, s, f, t], [f, t, e, s]]) {
        (positions.get(g) || []).forEach((ps, k0) => {
          const da = outline.along(g, sg, ps);
          if (da > R.local) return;
          for (const [key, c] of byPosition.get(`${g}:${k0 + 1}`) || []) {
            const [, a, b] = cand.pair.get(key), other = a[1] === g && a[2] === k0 + 1 ? b : a;
            if (other[1] === h && da + c + outline.along(h, sh, positions.get(h)[other[2] - 1]) <= R.local) joins.set(key, ['x', key, 0]);
          }
        });
      }
      if (ra[0] === rb[0] && ra[1] === rb[1] && !joins.size) continue;  // one run turning back: the exact check
      for (const v of [1, 0]) out.add([['lab', ra, v], ['lab', rb, v], ...joins.values()]);
    }
  });
  // A touching: the two half-edges one paper takes must not meet at a sharp angle.
  const half = new Map(), sharp = 180 - R.maxTurn + 2;
  outline.E.forEach((ed, e) => {
    if (ed.loop) return;
    const pts = ed.pts, q = (positions.get(e) || []).length;
    for (const [p, p0, p1, r] of [[ed.u, pts[0], pts[1], 0], [ed.v, pts.at(-1), pts.at(-2), q]]) {
      const k = pointKey(p);
      if (outline.nodes.get(k).typ !== 'touch') continue;
      if (!half.has(k)) half.set(k, []);
      half.get(k).push([[p1[0] - p0[0], p1[1] - p0[1]], [e, r]]);
    }
  });
  for (const items of half.values()) for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const [d1, ra] = items[a], [d2, rb] = items[b];
    if ((ra[0] !== rb[0] || ra[1] !== rb[1]) && angle(d1, d2) < sharp) {
      out.add([['lab', ra, 1], ['lab', rb, 1]]);
      out.add([['lab', ra, 0], ['lab', rb, 0]]);
    }
  }
  // Returns: along one edge a switch lies between.
  for (const [e, lo, hi, wraps] of returns(outline)) {
    const L = outline.L[e], between = [];
    (positions.get(e) || []).forEach((x, k) => { if (wraps ? (x > lo || x < hi - L) : (lo < x && x < hi)) between.push(k + 1); });
    if (between.length) out.add(between.map(k => ['sw', [e, k], 0]));
  }
  // A spike: the outline turns by more than the limit, so no paper follows it.
  for (const [e, c] of spikes(outline)) {
    const at = (positions.get(e) || []).findIndex(s => outline.along(e, s, c) < 1e-6);
    if (at >= 0) out.add([['sw', [e, at + 1], 0]]);
  }
  return out.list();
}

// Distance between two polylines (segment pairs, with a bounding-box test).
function polylineDistance(a, b, bound) {
  let best = Infinity;
  for (let i = 0; i + 1 < a.length; i++) for (let j = 0; j + 1 < b.length; j++) {
    const [p, q] = [a[i], a[i + 1]], [r, s] = [b[j], b[j + 1]];
    if (Math.min(p[0], q[0]) - bound > Math.max(r[0], s[0]) || Math.min(r[0], s[0]) - bound > Math.max(p[0], q[0])
      || Math.min(p[1], q[1]) - bound > Math.max(r[1], s[1]) || Math.min(r[1], s[1]) - bound > Math.max(p[1], q[1])) continue;
    best = Math.min(best, segmentNearest(p, r, s)[0], segmentNearest(q, r, s)[0], segmentNearest(r, p, q)[0], segmentNearest(s, p, q)[0]);
  }
  return best;
}

/** Static rules between hidden segments (cut in both papers): two routes closer
 * than a strip are not both used, except a short ladder joined at both ends; a
 * route close to the outline near one of its ends blocks switches between. */
export function routeNogoods(outline, cand) {
  const R = outline.rules, positions = cand.positions, out = new NogoodSet(), keys = [...cand.cost.keys()];
  const lines = keys.map(k => cand.route.get(k)), lengths = lines.map(l => cumlen(l).at(-1));
  const boxes = lines.map(l => [Math.min(...l.map(p => p[0])), Math.min(...l.map(p => p[1])), Math.max(...l.map(p => p[0])), Math.max(...l.map(p => p[1]))]);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = boxes[i], B = boxes[j], g = R.routeGap;
    if (A[0] - g > B[2] || B[0] - g > A[2] || A[1] - g > B[3] || B[1] - g > A[3]) continue;
    const [, a1, a2] = cand.pair.get(keys[i]), [, b1, b2] = cand.pair.get(keys[j]);
    const slots = new Set([a1, a2].map(t => `${t[1]}:${t[2]}`));
    if ([b1, b2].some(t => slots.has(`${t[1]}:${t[2]}`))) continue;  // one switch has one hidden segment
    if (polylineDistance(lines[i], lines[j], g) >= g) continue;
    const arc = t => cand.arc(t);
    const ladder = lengths[i] + lengths[j] <= 2 * R.local && [[b1, b2], [b2, b1]].some(([tb, tc]) =>
      outline.nearLocally(a1[1], arc(a1), tb[1], arc(tb), R.local) && outline.nearLocally(a2[1], arc(a2), tc[1], arc(tc), R.local));
    if (!ladder) out.add([['x', keys[i], 1], ['x', keys[j], 1]]);
  }
  // Shadows: where a route comes within a strip of its own edge near one end, no
  // other switch may lie between that end and there.
  keys.forEach((key, ki) => {
    const route = lines[ki], cl = cumlen(route), total = cl.at(-1), [, t1, t2] = cand.pair.get(key);
    const n = Math.max(2, Math.ceil(total / R.step) + 1), blocked = new Set();
    for (let k = 0; k < n; k++) {
      const s = total * k / (n - 1), p = pointAt(route, cl, s);
      for (const i of outline.grid.within(p, R.gap)) {
        const f = outline.edge[i], t = outline.arc[i];
        for (const [tok, d] of [[t1, s], [t2, total - s]]) {
          const e = tok[1], s0 = cand.arc(tok);
          if (e !== f || outline.along(e, s0, t) + d > R.local) continue;
          let [lo, hi] = [s0, t].sort((x, y) => x - y);
          const L = outline.L[e];
          if (outline.E[e].loop && hi - lo > L / 2) [lo, hi] = [hi, lo + L];
          (positions.get(e) || []).forEach((p0, j) => {
            if (((lo - 1e-9 < p0 && p0 < hi + 1e-9) || (lo - 1e-9 < p0 + L && p0 + L < hi + 1e-9)) && !(e === tok[1] && j + 1 === tok[2])) blocked.add(`${e},${j + 1}`);
          });
        }
      }
    }
    for (const b of blocked) out.add([['x', key, 1], ['sw', b.split(',').map(Number), 1]]);
  });
  return out.list();
}

/** Each paper's slits as {line, piece} lists for labels on every position (the
 * lazy check's view): pieces ['run', e, i] or ['hid', key]. */
export function slitPiecesOn(st, outline, cand, labels, used, geometry = null) {
  const links = new Map(), link = (fam, at, entry) => { const k = `${fam}|${at}`; if (!links.has(k)) links.set(k, []); links.get(k).push(entry); };
  st.edges.forEach((ed, e) => {
    const grid = cand.positions.get(e) || [];
    const at = i => i === 0 ? `node:${pointKey(ed.u)}` : i === grid.length + 1 ? `node:${pointKey(ed.v)}` : `slot:${e}:${i}`;
    for (let i = 0; i <= grid.length; i++) {
      const s0 = i ? grid[i - 1] : 0, s1 = i < grid.length ? grid[i] : outline.L[e];
      const line = geometry ? geometry.line(e, s0, s1) : subPolyline(ed.pts, outline.geo[e], s0, s1), fam = labels.get(`${e},${i}`) ? 'A' : 'B', piece = ['run', e, i];
      // On a geometry with curves (refine.js geometryOnCurves), the run's cubics too.
      const curves = geometry?.curves?.(e, s0, s1) ?? null;
      link(fam, at(i), {piece, to: at(i + 1), line, curves});
      link(fam, at(i + 1), {piece, to: at(i), line: [...line].reverse(), curves: curves && curves.map(c => [...c].reverse()).reverse()});
    }
  });
  for (const key of used) {
    const [, a, b] = cand.pair.get(key), p = `slot:${a[1]}:${a[2]}`, q = `slot:${b[1]}:${b[2]}`, piece = ['hid', key];
    let line = cand.route.get(key);
    // On `geometry` (refine.js) the route's ends move with the runs' ends.
    if (geometry) {
      const at = t => geometry.point(t[1], cand.arc(t)), pa = at(a), pb = at(b), first = cand.point(a);
      const forward = Math.hypot(line[0][0] - first[0], line[0][1] - first[1]) <= Math.hypot(line.at(-1)[0] - first[0], line.at(-1)[1] - first[1]);
      line = [forward ? pa : pb, ...line.slice(1, -1), forward ? pb : pa];
    }
    for (const fam of ['A', 'B']) {
      link(fam, p, {piece, to: q, line});
      link(fam, q, {piece, to: p, line: [...line].reverse()});
    }
  }
  const out = {A: [], B: []}, same = (x, y) => x && y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
  for (const [fam, side] of [['A', 'T'], ['B', 'L']]) {
    const starts = [...st.nodes].filter(([, n]) => n.typ === 'end' && n.side === side).sort(([, a], [, b]) => side === 'T' ? a.p[0] - b.p[0] : b.p[1] - a.p[1]);
    for (const [key] of starts) {
      let cur = `node:${key}`, prev = null;
      const slit = [];
      for (let guard = 0; guard < 100000; guard++) {
        const step = (links.get(`${fam}|${cur}`) || []).filter(x => !same(x.piece, prev));
        if (!step.length) break;
        const {piece, to, line, curves} = step[0];
        prev = piece;
        cur = to;
        slit.push({line, piece, curves});
        if (cur.startsWith('node:') && st.nodes.get(cur.slice(5)).typ === 'end') break;
      }
      out[fam].push(slit);
    }
  }
  return out;
}

/** The exact slit check of one solution: nogoods excluding every pair of one
 * paper's pieces closer than `gap` outside one slit's local arc (with the
 * switches between them on one edge), and every return. */
export function geometryNogoods(st, outline, cand, labels, used, switches, {gap = null, keep = null} = {}) {
  const R = outline.rules, limit = gap ?? R.checkGap, out = new NogoodSet(), positions = cand.positions;
  const pieces = slitPiecesOn(st, outline, cand, labels, used);
  for (const fam of ['A', 'B']) {
    const pts = [], piece = [], slitOf = [], arc = [];
    pieces[fam].forEach((slit, k) => {
      let a0 = 0;
      for (const {line, piece: item} of slit) {
        const cl = cumlen(line), n = Math.max(2, Math.ceil(cl.at(-1) / R.step) + 1);
        for (let m = 0; m < n; m++) {
          const s = cl.at(-1) * m / (n - 1);
          pts.push(pointAt(line, cl, s)); piece.push(item); slitOf.push(k); arc.push(a0 + s);
        }
        a0 += cl.at(-1);
      }
    });
    if (!pts.length) continue;
    // Two slits of one paper need the validator's inter-slit clearance, a little more.
    const far = gap ?? R.interGap, reach = Math.max(limit, far), limitOf = (i, j) => slitOf[i] === slitOf[j] ? limit : Math.max(limit, far);
    const grid = new PointGrid(pts, Math.max(reach + R.step, .05)), seen = new Set();
    const pieceKey = p => p[0] === 'run' ? `run:${p[1]}:${p[2]}` : `hid:${p[1]}`;
    pts.forEach((p, i) => {
      for (const j of grid.within(p, reach + R.step)) {
        if (j <= i || (slitOf[i] === slitOf[j] && Math.abs(arc[i] - arc[j]) <= R.checkLocal)) continue;
        const pair = [pieceKey(piece[i]), pieceKey(piece[j])].sort().join('|'), need = limitOf(i, j);
        if (seen.has(pair) || (keep && !keep(fam, pts[i], pts[j]))) continue;
        // The pieces' own distance near the samples decides.
        if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= need + 2 * R.step) continue;
        const win = k => { const lo = Math.max(0, k - 1), hi = Math.min(pts.length - 1, k + 1); return [pts[lo], pts[k], pts[hi]].filter((_, x) => piece[[lo, k, hi][x]] === piece[k]); };
        if (polylineDistance(win(i), win(j), need) >= need) continue;
        seen.add(pair);
        const lits = [], spots = [], own = new Set();
        [piece[i], piece[j]].forEach((item, sideOf) => {
          if (item[0] === 'hid') {
            lits.push(['x', item[1], 1]);
            const [, a, b] = cand.pair.get(item[1]);
            for (const t of [a, b]) { spots.push([sideOf, t[1], t[2], t[2]]); own.add(`${t[1]},${t[2]}`); }
          } else {
            lits.push(['lab', [item[1], item[2]], fam === 'A' ? 1 : 0]);
            spots.push([sideOf, item[1], item[2], item[2] + 1]);
          }
        });
        const between = new Set();
        for (let x = 0; x < spots.length; x++) for (let y = x + 1; y < spots.length; y++) {
          const [s1, e, lo1, hi1] = spots[x], [s2, f, lo2, hi2] = spots[y];
          if (s1 === s2 || e !== f || st.edges[e].loop) continue;
          const [lo, hi] = hi1 <= lo2 ? [hi1, lo2] : [hi2, lo1];
          for (let k = Math.max(1, lo); k <= Math.min((positions.get(e) || []).length, hi); k++)
            if (!own.has(`${e},${k}`) && switches.has(`${e},${k}`)) between.add(`${e},${k}`);
        }
        if (!between.size) out.add(lits);
        for (const b of between) out.add([...lits, ['sw', b.split(',').map(Number), 1]]);
      }
    });
    // Returns (return-search.js): one slit within 1.5 mm of itself 3 mm to
    // `checkLocal` further along, turning by 190 degrees or more between, as
    // visibleNogoods, now through hidden segments too (5star's points). The
    // nogood names every piece of the slit from one point to the other.
    const gapR = RETURN_GAP * R.mm, along = RETURN_ALONG * R.mm, done = new Set();
    for (const slit of pieces[fam]) {
      const line = [], owner = [];
      for (const {line: poly, piece: item} of slit) for (const p of poly) {
        if (!line.length || Math.hypot(line.at(-1)[0] - p[0], line.at(-1)[1] - p[1]) > 1e-9) { line.push(p); owner.push(item); }
      }
      if (line.length < 3) continue;
      const cl = cumlen(line), turn = line.map((p, i) => i && i < line.length - 1
        ? angle([p[0] - line[i - 1][0], p[1] - line[i - 1][1]], [line[i + 1][0] - p[0], line[i + 1][1] - p[1]]) : 0);
      const n = Math.max(2, Math.ceil(cl.at(-1) / R.step) + 1), arcs = Array.from({length: n}, (_, m) => cl.at(-1) * m / (n - 1));
      const samples = arcs.map(a => pointAt(line, cl, a)), grid = new PointGrid(samples, Math.max(gapR, .05));
      samples.forEach((p, i) => {
        for (const j of grid.within(p, gapR)) {
          if (j <= i) continue;
          const a = arcs[i], b = arcs[j];
          if (!(along <= b - a && b - a <= R.checkLocal)) continue;
          let total = 0;
          for (let m = 0; m < line.length; m++) if (cl[m] > a && cl[m] < b) total += turn[m];
          if (total < 190) continue;
          // The vertices from the one at or before a to the one at or after b.
          let lo = 0, hi = line.length - 1;
          while (lo + 1 < line.length && cl[lo + 1] <= a) lo++;
          while (hi > 0 && cl[hi - 1] >= b) hi--;
          const items = new Map();
          for (let m = lo; m <= hi; m++) items.set(pieceKey(owner[m]), owner[m]);
          const lits = [...items.values()].map(item => item[0] === 'hid' ? ['x', item[1], 1] : ['lab', [item[1], item[2]], fam === 'A' ? 1 : 0]);
          const key = lits.map(l => JSON.stringify(l)).sort().join('|');
          if (!done.has(key)) { done.add(key); out.add(lits); }
        }
      });
    }
  }
  return out.list();
}
