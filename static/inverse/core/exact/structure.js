/** The outline's structure for the exact-outline search, as the reference
 * solver's archive builds it (minwit.build_from_segments): the outline Gamma
 * split at its nodes (touchings, ends on the border, closed curves' starts)
 * into edges, and the faces of Gamma together with the square's border.
 *
 * Frame: the reference square, 12 units, y up. Segments [a, b] share end
 * points exactly and are oriented with the mask on their left. */
import {pointInRing} from '../geometry.js';

export const SIZE = 12, EPS = 1e-9;
export const CORNERS = Object.freeze({TL: [0, SIZE], TR: [SIZE, SIZE], BR: [SIZE, 0], BL: [0, 0]});
export const pointKey = p => `${p[0]},${p[1]}`;

/** The square's sides a point lies on: T, B, L, R. */
export function sidesOf(p) {
  const s = new Set();
  if (Math.abs(p[1] - SIZE) < EPS) s.add('T');
  if (Math.abs(p[1]) < EPS) s.add('B');
  if (Math.abs(p[0]) < EPS) s.add('L');
  if (Math.abs(p[0] - SIZE) < EPS) s.add('R');
  return s;
}
export const onBoundary = p => sidesOf(p).size > 0;
export const isCorner = p => sidesOf(p).size === 2;
const cornerName = p => {
  const s = sidesOf(p);
  return (s.has('T') ? 'T' : 'B') + (s.has('L') ? 'L' : 'R');
};

/** The clockwise parameter along the border, from the top left: T, R, B, L. */
export function cwParam([x, y]) {
  if (Math.abs(y - SIZE) < EPS) return x;
  if (Math.abs(x - SIZE) < EPS) return SIZE + (SIZE - y);
  if (Math.abs(y) < EPS) return 2 * SIZE + (SIZE - x);
  if (Math.abs(x) < EPS) return (3 * SIZE + y) % (4 * SIZE);
  throw new Error('Not on the border.');
}

const lexicographic = (a, b) => a[0] - b[0] || a[1] - b[1];
const area = (half, cycle) => .5 * cycle.reduce((s, h) => s + half[h].p[0] * half[h].q[1] - half[h].q[0] * half[h].p[1], 0);

/** The structure of Gamma from its segments. `readingK` allows outline ends at
 * the square's corners (the archive's reading K); otherwise they are an error. */
export function buildStructure(segs, {readingK = false} = {}) {
  const adj = new Map(), point = new Map();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = pointKey(p);
      if (!adj.has(k)) { adj.set(k, []); point.set(k, p); }
      adj.get(k).push(i);
    }
  });
  const deg = new Map([...adj].map(([k, list]) => [k, list.length]));
  for (const [k, d] of deg) if (![1, 2, 4].includes(d)) throw new Error(`An outline vertex of degree ${d} at ${k}.`);
  const nodeset = new Set([...deg].filter(([, d]) => d !== 2).map(([k]) => k));
  const used = new Array(segs.length).fill(false), edges = [];

  const walk = (start, sid) => {
    const pts = [point.get(start)], sids = [];
    let cur = start;
    for (;;) {
      used[sid] = true;
      sids.push(sid);
      const [a, b] = segs[sid], next = pointKey(a) === cur ? b : a, nk = pointKey(next);
      pts.push(next);
      if (nodeset.has(nk)) return {pts, sids};
      const [s1, s2] = adj.get(nk);
      sid = s1 === sid ? s2 : s1;
      cur = nk;
    }
  };
  const byPoint = keys => [...keys].sort((a, b) => lexicographic(point.get(a), point.get(b)));
  for (const v of byPoint(nodeset)) for (const sid of adj.get(v)) if (!used[sid]) {
    const {pts, sids} = walk(v, sid);
    edges.push({u: pts[0], v: pts.at(-1), pts, sids, loop: false});
  }
  const plain = new Set();
  while (used.includes(false)) {
    // A closed curve without a node starts at its smallest vertex.
    const sid = used.indexOf(false), [a, b] = segs[sid], v = pointKey(lexicographic(a, b) <= 0 ? a : b);
    nodeset.add(v);
    plain.add(v);
    const {pts, sids} = walk(v, adj.get(v).find(s => !used[s]));
    if (pointKey(pts.at(-1)) !== v) throw new Error('A closed outline curve does not close.');
    edges.push({u: point.get(v), v: point.get(v), pts, sids, loop: true});
  }

  const nodes = new Map();
  for (const v of byPoint(nodeset)) {
    const p = point.get(v);
    let typ, side = null;
    if (plain.has(v)) typ = 'plain';
    else if (deg.get(v) === 4) typ = 'touch';
    else {
      if (deg.get(v) !== 1 || !onBoundary(p)) throw new Error(`A loose outline end at ${v}.`);
      if (isCorner(p)) {
        if (!readingK) throw new Error('The outline reaches a corner of the square.');
        typ = 'cornerend';
        side = cornerName(p);
      } else {
        typ = 'end';
        side = [...sidesOf(p)][0];
      }
    }
    nodes.set(v, {p, typ, side, ends: []});
  }
  edges.forEach((ed, e) => {
    nodes.get(pointKey(ed.u)).ends.push([e, 0]);
    nodes.get(pointKey(ed.v)).ends.push([e, 1]);
  });
  for (const [v, nd] of nodes) {
    const want = {plain: 2, touch: 4, end: 1, cornerend: 1}[nd.typ];
    if (nd.ends.length !== want) throw new Error(`Node ${v} has ${nd.ends.length} edge ends, not ${want}.`);
  }
  const seginfo = new Map();  // segment -> [edge, index along it, +1 if oriented as the edge]
  edges.forEach((ed, e) => ed.sids.forEach((sid, i) => {
    const [a] = segs[sid];
    seginfo.set(sid, [e, i, pointKey(ed.pts[i]) === pointKey(a) ? 1 : -1]);
  }));

  // Half-edges of Gamma together with the square's border.
  const bkeys = new Set([...deg.keys()].filter(k => onBoundary(point.get(k))));
  for (const c of Object.values(CORNERS)) {
    const k = pointKey(c);
    if (!point.has(k)) point.set(k, c);
    bkeys.add(k);
  }
  const border = [...bkeys].sort((a, b) => cwParam(point.get(a)) - cwParam(point.get(b)));
  const half = [];  // {p, q, kind: 'g' | 'q', sid}
  segs.forEach(([a, b], sid) => half.push({p: a, q: b, kind: 'g', sid}, {p: b, q: a, kind: 'g', sid}));
  border.forEach((k, i) => {
    const p = point.get(k), q = point.get(border[(i + 1) % border.length]);
    half.push({p, q, kind: 'q', sid: null}, {p: q, q: p, kind: 'q', sid: null});
  });
  const out = new Map(), index = new Map();
  half.forEach((h, i) => {
    const k = pointKey(h.p);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(i);
    index.set(`${k}|${pointKey(h.q)}`, i);
  });
  for (const [, list] of out) list.sort((i, j) => Math.atan2(half[i].q[1] - half[i].p[1], half[i].q[0] - half[i].p[0]) -
    Math.atan2(half[j].q[1] - half[j].p[1], half[j].q[0] - half[j].p[0]));
  const twin = half.map(h => index.get(`${pointKey(h.q)}|${pointKey(h.p)}`));
  const next = i => {
    const list = out.get(pointKey(half[i].q)), j = list.indexOf(twin[i]);
    return list[(j - 1 + list.length) % list.length];
  };
  const seen = new Array(half.length).fill(false), cycles = [];
  half.forEach((_, h0) => {
    if (seen[h0]) return;
    const cycle = [];
    for (let h = h0; !seen[h]; h = next(h)) { seen[h] = true; cycle.push(h); }
    cycles.push(cycle);
  });
  const positive = cycles.filter(c => area(half, c) > EPS), negative = cycles.filter(c => area(half, c) < -EPS);
  const outside = negative.reduce((m, c) => area(half, c) < area(half, m) ? c : m);
  if (Math.abs(area(half, outside) + SIZE * SIZE) > 1e-6) throw new Error('The outer border cycle is not the square.');
  const faces = positive.map(c => ({cycles: [c], area: area(half, c)}));
  const rings = positive.map(c => c.map(h => half[h].p));
  for (const c of negative) {
    if (c === outside) continue;
    // A point just left of a half-edge: outside the floating component it bounds.
    const {p: [x0, y0], q: [x1, y1]} = half[c[0]], len = Math.hypot(x1 - x0, y1 - y0);
    const p = [(x0 + x1) / 2 - 1e-6 * (y1 - y0) / len, (y0 + y1) / 2 + 1e-6 * (x1 - x0) / len];
    let best = null;
    rings.forEach((ring, fi) => {
      if (pointInRing(p, ring) && (best === null || faces[fi].area < faces[best].area)) best = fi;
    });
    if (best === null) throw new Error('A floating outline component lies in no face.');
    faces[best].cycles.push(c);
  }

  const breakpoints = new Set([...nodeset, ...bkeys]), faceL = new Map(), faceR = new Map();
  faces.forEach((F, fi) => {
    F.black = null;
    F.runs = F.cycles.map(c0 => {
      const j = c0.findIndex(h => breakpoints.has(pointKey(half[h].p)));
      const c = [...c0.slice(j), ...c0.slice(0, j)], runs = [];
      for (const h of c) {
        const {p, q, kind, sid} = half[h];
        if (kind === 'q') {
          const name = Object.entries(CORNERS).find(([, v]) => pointKey(v) === pointKey(p))?.[0];
          if (readingK && name && !deg.has(pointKey(p))) runs.push(['corner', name]);
          continue;
        }
        const [e, i] = seginfo.get(sid), ed = edges[e];
        const d = pointKey(p) === pointKey(ed.pts[i]) && pointKey(q) === pointKey(ed.pts[i + 1]) ? 1 : -1;
        if (F.black === null) F.black = pointKey(p) === pointKey(segs[sid][0]) && pointKey(q) === pointKey(segs[sid][1]);
        const last = runs.at(-1);
        if (!last || last[0] !== 'edge' || last[1] !== e || last[2] !== d) runs.push(['edge', e, d]);
        (d === 1 ? faceL : faceR).set(e, fi);
      }
      return runs;
    });
    F.holes = F.cycles.length - 1;
    F.cyclepts = F.cycles.map(c => c.map(h => half[h].p));
  });
  edges.forEach((_, e) => {
    if (!faceL.has(e) || !faceR.has(e) || faceL.get(e) === faceR.get(e)) throw new Error(`Edge ${e} lacks two different faces.`);
  });

  // Gamma's components, through shared nodes (for lower bounds).
  const comp = edges.map((_, e) => e), find = x => { while (comp[x] !== x) x = comp[x] = comp[comp[x]]; return x; };
  for (const nd of nodes.values()) for (const [e] of nd.ends.slice(1)) comp[find(e)] = find(nd.ends[0][0]);
  const groups = new Map();
  edges.forEach((_, e) => { const r = find(e); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
  const comps = [...groups.values()], ecomp = new Map();
  comps.forEach((es, ci) => es.forEach(e => ecomp.set(e, ci)));
  const anchored = comps.map(es => es.some(e => ['u', 'v'].some(k => ['end', 'cornerend'].includes(nodes.get(pointKey(edges[e][k])).typ))));
  const cornersFree = readingK ? Object.entries(CORNERS).filter(([, v]) => !deg.has(pointKey(v))).map(([k]) => k) : [];
  return {segs, edges, nodes, faces, faceL, faceR, readingK, comps, ecomp, anchored, cornersFree};
}

/** Counts that identify a structure (minwit.describe), for comparisons. */
export function describe(st) {
  const ends = {};
  let touchings = 0;
  for (const nd of st.nodes.values()) {
    if (nd.typ === 'touch') touchings++;
    if (nd.typ === 'end') ends[nd.side] = (ends[nd.side] || 0) + 1;
  }
  return {edges: st.edges.length, touchings, ends, faces: st.faces.length, holes: st.faces.map(f => f.holes),
    comps: st.comps.length, floating: st.anchored.filter(a => !a).length};
}
