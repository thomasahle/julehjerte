/** A finished template (an app solution, e.g. the editor's own fitter's) read as
 * a witness on the exact outline (the reference solver's
 * sat_exact.template_witness, for the app's explicit curves).
 *
 * The template's visible cuts approximate the outline, but need not meet at its
 * touchings (the editor's fitter lets the two papers' cuts cross there). So each
 * paper's visible cuts are sampled, every sample votes for its nearest outline
 * point. The switches (the hidden runs' ends, each on one of the edges near
 * it) and the papers along each edge, which alternate at its switches, are
 * chosen together: the most votes the outline's nodes allow. Which side a run
 * leaves is the face its route runs in, or else read on the template's own
 * geometry and turned into the edge's direction. */
import {LinearModel, solverRuntime} from '../solver.js';
import {pointInRing} from '../geometry.js';
import {PointGrid, cumlen, dist, pointAt, project} from './polyline.js';
import {pointKey} from './structure.js';
import {simplify, toReference} from './target.js';

/** The outline point nearest to p: {e, s, distance}, optionally among `edges`. */
export function nearestOnOutline(outline, p, reach, edges = null) {
  if (!edges) {
    const near = outline.grid.within(p, Math.max(reach, outline.rules.step) * 2);
    edges = new Set(near.length ? near.map(i => outline.edge[i]) : [outline.edge[outline.grid.nearest(p)[1]]]);
  }
  let best = null;
  for (const e of edges) {
    const {distance, arc} = project(outline.E[e].pts, outline.geo[e], p);
    if (!best || distance < best.distance) best = {e, s: arc, distance};
  }
  return best;
}

// Evenly spaced points of a polyline, `step` apart.
function samples(pts, step) {
  const cl = cumlen(pts), n = Math.max(2, Math.ceil(cl.at(-1) / step) + 1);
  return Array.from({length: n}, (_, i) => pointAt(pts, cl, cl.at(-1) * i / (n - 1)));
}

/** The template's switches and papers on the outline, chosen together: each
 * run end goes to one of its `candidates` ({e, s, cost}), every edge's papers
 * alternate at the switches it gets, and the choice keeps the most `votes`
 * ([s, paper] per edge, paper 0 = A) that the model's node rules allow: a
 * border end's piece is that border's paper, a plain node's two pieces agree,
 * a touching has two of each, a closed curve's ends agree, and a run's ends
 * border a common face. Breaking a node rule costs more than every vote.
 * Returns {chosen: candidate index per end, first: edge -> paper (1 = A) of
 * its first piece}. */
async function chooseSwitches(outline, ends, votes, faces, {pad = .05} = {}) {
  const m = new LinearModel(), E = outline.E, total = votes.reduce((s, v) => s + v.length, 0) + 1;
  const big = 10 * total;
  const z = ends.map(end => end.candidates.map(c => m.variable({cost: c.cost, binary: true})));
  z.forEach(vs => m.row(vs.map(v => [v, 1]), 1, 1));
  const xor = (s, a, b) => {  // a XOR s = b
    m.row([[s, 1], [a, -1], [b, 1]], 0, Infinity);
    m.row([[s, 1], [a, 1], [b, -1]], 0, Infinity);
    m.row([[s, 1], [a, -1], [b, -1]], -Infinity, 0);
    m.row([[s, 1], [a, 1], [b, 1]], -Infinity, 2);
  };
  // Per edge: its candidate switches in order, and a paper between each two.
  const pieces = E.map((ed, e) => {
    const here = [];
    ends.forEach((end, r) => end.candidates.forEach((c, i) => { if (c.e === e) here.push({s: c.s, v: z[r][i]}); }));
    here.sort((a, b) => a.s - b.s);
    const bounds = [0, ...here.map(h => h.s), outline.L[e]], labels = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const lo = bounds[i], hi = bounds[i + 1], w = Math.min(pad, (hi - lo) / 4), count = [0, 0];
      for (const [s, k] of votes[e]) if (s > lo + w && s < hi - w) count[k]++;
      // Paper A (1) disagrees with B's votes, B with A's.
      labels.push(m.variable({cost: count[1] - count[0], binary: true}));
    }
    here.forEach((h, i) => xor(h.v, labels[i], labels[i + 1]));
    if (ed.loop) m.row([[labels[0], 1], [labels.at(-1), -1]], 0, 0);
    return labels;
  });
  const soft = (terms, lo, hi) => {
    const over = m.variable({cost: big, lo: 0, hi: Infinity}), under = m.variable({cost: big, lo: 0, hi: Infinity});
    m.row([...terms, [over, -1], [under, 1]], lo, hi);
  };
  const at = new Map();
  E.forEach((ed, e) => {
    if (ed.loop) return;
    for (const [k, v] of [[pointKey(ed.u), pieces[e][0]], [pointKey(ed.v), pieces[e].at(-1)]]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(v);
    }
  });
  for (const [k, list] of at) {
    const node = outline.nodes.get(k);
    if (node.typ === 'end') { const paper = 'TB'.includes(node.side) ? 1 : 0; soft(list.map(v => [v, 1]), paper, paper); }
    else if (node.typ === 'touch') soft(list.map(v => [v, 1]), 2, 2);
    else if (node.typ === 'plain' && list.length === 2) soft([[list[0], 1], [list[1], -1]], 0, 0);
  }
  // A run's two ends on edges with a common face.
  for (let r = 0; r + 1 < ends.length; r += 2) for (const [i, a] of ends[r].candidates.entries()) for (const [j, b] of ends[r + 1].candidates.entries())
    if (!faces(a.e).some(f => faces(b.e).includes(f))) soft([[z[r][i], 1], [z[r + 1][j], 1]], -Infinity, 1);
  const highs = await solverRuntime(), native = highs.createModel(m.data());
  try {
    native.options.set({output_flag: false, time_limit: 5, mip_rel_gap: 0});
    native.run();
    if (native.info.get('primal_solution_status') !== highs.constants.solutionStatus.feasible) return null;
    const val = native.getSolution().colValue;
    return {chosen: z.map(vs => vs.findIndex(v => val[v] > .5)), first: pieces.map(labels => val[labels[0]] > .5 ? 1 : 0)};
  } finally {
    native.dispose();
  }
}

/** The witness a solution's template gives on `outline`, or {error} when it does
 * not fit: positions (edge -> switch arcs), labels ('e,i' -> 1 for paper A),
 * chords ({a, b, route}). A slit's sample is on the outline within `near`; a
 * stretch of paper A's slit off it that the template hides somewhere, or that
 * paper B cuts too (within `shareTolerance`), is a hidden segment, whatever the
 * template draws around it (its visible cuts may leave the outline, to cross a
 * neck or cut a tip). A hidden segment's end may
 * go on any edge within `margin` of its nearest, on a corner within
 * `cornerSnap` of it; `hair`: a switch this close to an edge's end moves
 * inside it. */
export async function readTemplate(solution, outline, {near = .12, margin = .15, shareTolerance = .05, cornerSnap = .06, hair = 1e-3, tolerance = .002, step = .02, clear = .08, smooth = .01} = {}) {
  const width = solution.graph.target.width, tol = tolerance * width / 12 / 4, {edges: E} = solution.graph, st = outline.st;
  // Each slit as samples: where it is, whether the template hides it there, and
  // the outline point nearest to it.
  const slits = solution.paths.map(paths => paths.map(slit => {
    const out = [];
    for (const [e, forward] of slit) {
      const pts = E[e].curve.flatten(tol).map(p => toReference(p, width));
      if (!forward) pts.reverse();
      samples(pts, step).forEach((p, i) => {
        if (i || !out.length) out.push({p, hidden: !E[e].visible, at: nearestOnOutline(outline, p, near)});
      });
    }
    for (const x of out) x.off = x.hidden || x.at.distance > near;
    return out;
  }));
  // Votes: every visible sample on the outline, for its nearest point.
  const votes = outline.E.map(() => []);  // per edge: [s, paper]
  let stray = 0, all = 0;
  slits.forEach((paths, k) => paths.forEach(slit => slit.forEach(x => {
    if (x.hidden) return;
    all++;
    if (x.off) stray++;
    else votes[x.at.e].push([x.at.s, k]);
  })));
  if (!all || stray > all / 4) return {error: `The template strays from the outline (${Math.round(100 * stray / Math.max(1, all))}% of it).`};
  // Hidden segments: paper A's stretches off the outline that the template
  // hides somewhere or paper B cuts too, each from the last sample on the
  // outline before it to the first after it. Their ends' candidate switches:
  // the nearest point of every edge about as near as the nearest, preferring
  // the edge the slit ran along.
  const offB = new PointGrid(slits[1].flat().filter(x => x.off).map(x => x.p), .05);
  const shared = stretch => stretch.some(x => x.hidden) || stretch.filter(x => offB.nearest(x.p, shareTolerance)[1] >= 0).length >= stretch.length / 2;
  const runs = [], ends = [];
  for (const slit of slits[0]) {
    for (let i = 0; i < slit.length; i++) {
      if (!slit[i].off) continue;
      let j = i;
      while (j + 1 < slit.length && slit[j + 1].off) j++;
      if (i > 0 && j + 1 < slit.length && shared(slit.slice(i, j + 1))) {
        const r = runs.length;
        runs.push(slit.slice(i - 1, j + 2));
        for (const [end, at, dir] of [[0, i - 1, -1], [1, j + 1, 1]]) {
          const p = slit[at].p, tally = new Map();
          for (let k = at, n = 0; k >= 0 && k < slit.length && n < 6; k += dir, n++) if (!slit[k].off) tally.set(slit[k].at.e, (tally.get(slit[k].at.e) || 0) + 1);
          const voters = [...tally.values()].reduce((a, b) => a + b, 0) || 1;
          const edges = new Set(outline.grid.within(p, Math.max(near, outline.rules.step) * 2).map(g => outline.edge[g]));
          edges.add(slit[at].at.e);
          const options = [...edges].map(e => nearestOnOutline(outline, p, near, [e]));
          const closest = Math.min(...options.map(o => o.distance));
          const candidates = options.filter(o => o.distance <= closest + margin).map(({e, s, distance}) => {
            // Near a corner, on it: the template's own corner is only near the outline's.
            const corner = outline.corners[e].find(c => outline.along(e, s, c) < cornerSnap);
            if (corner !== undefined) s = corner;
            else if (!outline.E[e].loop) s = Math.min(Math.max(s, hair), outline.L[e] - hair);
            return {e, s: outline.onVertex(e, s), cost: distance + 1 - (tally.get(e) || 0) / voters};
          });
          ends.push({r, end, p, inside: slit[Math.min(Math.max(at - dir * 3, i), j)].p, candidates});
        }
      }
      i = j;
    }
  }
  const faces = e => [st.faceL.get(e), st.faceR.get(e)];
  const choice = await chooseSwitches(outline, ends, votes, faces);
  if (!choice) return {error: 'The template\'s switches do not fit the outline.'};
  ends.forEach((x, i) => Object.assign(x, x.candidates[choice.chosen[i]]));
  // Sides: the one face both ends of a segment border, or the face its route
  // runs in, or else the side of the edge its route leaves to.
  const inFace = (f, p) => { const rings = st.faces[f].cyclepts; return pointInRing(p, rings[0]) && !rings.slice(1).some(ring => pointInRing(p, ring)); };
  for (const [r, run] of runs.entries()) {
    const [a, b] = [ends[2 * r], ends[2 * r + 1]], fa = faces(a.e), fb = faces(b.e);
    let common = [...new Set(fa)].filter(f => fb.includes(f));
    if (common.length > 1) {
      const pts = run.map(x => x.p), cl = cumlen(pts), mid = pointAt(pts, cl, cl.at(-1) / 2), inside = common.filter(f => inFace(f, mid));
      if (inside.length === 1) common = inside;
    }
    for (const [x, fx] of [[a, fa], [b, fb]]) {
      if (common.length === 1) { x.side = fx[0] === common[0] ? 'L' : 'R'; continue; }
      const P = outline.at(x.e, x.s), [back, fwd] = outline.sides(x.e, x.s), te = [fwd[0] - back[0], fwd[1] - back[1]];
      x.side = te[0] * (x.inside[1] - P[1]) - te[1] * (x.inside[0] - P[0]) > 0 ? 'L' : 'R';
    }
  }
  const positions = new Map(), tokens = new Map(), labels = new Map();
  for (let e = 0; e < outline.E.length; e++) {
    // Two switches at one point would make an empty piece: part them.
    const list = ends.filter(x => x.e === e).sort((a, b) => a.s - b.s);
    for (let i = 1; i < list.length; i++) if (list[i].s - list[i - 1].s < 1e-6) list[i].s = Math.min(list[i - 1].s + 2e-6, outline.L[e] - hair / 2);
    positions.set(e, list.map(x => x.s));
    list.forEach((x, i) => tokens.set(`${x.r},${x.end}`, ['s', e, i + 1, x.side]));
    for (let i = 0; i <= list.length; i++) labels.set(`${e},${i}`, i % 2 ? 1 - choice.first[e] : choice.first[e]);
  }
  const chords = runs.map((run, r) => {
    const a = tokens.get(`${r},0`), b = tokens.get(`${r},1`);
    // Its samples near the outline dropped: there it followed the template's
    // own outline, and would leave the exact one at a sharp angle.
    // Simplified, so the samples' noise does not bend it.
    const inner = run.slice(1, -1).map(x => x.p).filter(p => outline.grid.nearest(p, clear)[1] < 0);
    return {a, b, route: simplify([outline.at(a[1], positions.get(a[1])[a[2] - 1]), ...inner, outline.at(b[1], positions.get(b[1])[b[2] - 1])], smooth)};
  });
  return {positions, labels, chords, stray: stray / all, ends};
}

export {dist};
