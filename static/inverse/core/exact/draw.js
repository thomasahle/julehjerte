/** Drawing a witness on the exact outline: each paper's slits traced from its
 * border ends along the outline pieces it cuts and the hidden routes (the
 * reference solver's sat_exact.slit_pieces), and the polylines as an app
 * solution whose visible cuts are the outline itself. */
import {CurveGraph} from '../direct/curves.js';
import {Cubic} from '../bezier.js';
import {sampleWeave} from '../validate.js';
import {pointKey} from './structure.js';
import {subPolyline} from './polyline.js';
import {toApp} from './target.js';

/** Each paper's slits as lists of {line, piece}: `positions` (edge -> sorted switch
 * arcs), `labels` ('e,i' -> 1 for paper A, 0 for B; run i lies between switches i
 * and i + 1), `chords` ({a, b, route}, tokens ['s', e, j, side]). */
export function slitPieces(st, outline, positions, labels, chords) {
  const links = new Map(), link = (fam, at, entry) => {
    const k = `${fam}|${at}`;
    if (!links.has(k)) links.set(k, []);
    links.get(k).push(entry);
  };
  st.edges.forEach((ed, e) => {
    const grid = positions.get(e) || [];
    const at = i => i === 0 ? `node:${pointKey(ed.u)}` : i === grid.length + 1 ? `node:${pointKey(ed.v)}` : `slot:${e}:${i}`;
    for (let i = 0; i <= grid.length; i++) {
      const s0 = i ? grid[i - 1] : 0, s1 = i < grid.length ? grid[i] : outline.L[e];
      const line = subPolyline(ed.pts, outline.geo[e], s0, s1), fam = labels.get(`${e},${i}`) ? 'A' : 'B', piece = `run:${e}:${i}`;
      link(fam, at(i), {piece, to: at(i + 1), line});
      link(fam, at(i + 1), {piece, to: at(i), line: [...line].reverse()});
    }
  });
  chords.forEach(({a, b, route}, c) => {
    const p = `slot:${a[1]}:${a[2]}`, q = `slot:${b[1]}:${b[2]}`, piece = `hid:${c}`;
    for (const fam of ['A', 'B']) {
      link(fam, p, {piece, to: q, line: route});
      link(fam, q, {piece, to: p, line: [...route].reverse()});
    }
  });
  const out = {A: [], B: []};
  const starts = side => [...st.nodes].filter(([, n]) => n.typ === 'end' && n.side === side)
    .sort(([, a], [, b]) => side === 'T' ? a.p[0] - b.p[0] : b.p[1] - a.p[1]);
  for (const [fam, side] of [['A', 'T'], ['B', 'L']]) {
    for (const [key] of starts(side)) {
      let cur = `node:${key}`, prev = null;
      const slit = [];
      for (let guard = 0; guard < 100000; guard++) {
        const step = (links.get(`${fam}|${cur}`) || []).filter(x => x.piece !== prev);
        if (!step.length) break;
        const {piece, to, line} = step[0];
        prev = piece;
        cur = to;
        slit.push({line, piece});
        if (cur.startsWith('node:') && st.nodes.get(cur.slice(5)).typ === 'end') break;
      }
      out[fam].push(slit);
    }
  }
  return out;
}

/** {A, B}: each slit as one polyline (reference frame). */
export function drawing(pieces) {
  const out = {};
  for (const fam of ['A', 'B']) out[fam] = pieces[fam].map(slit => {
    const line = [];
    for (const {line: part} of slit) for (const p of part)
      if (!line.length || Math.hypot(line.at(-1)[0] - p[0], line.at(-1)[1] - p[1]) > 1e-9) line.push(p);
    return line;
  });
  return out;
}

// A segment both papers cut, in either direction, must become the same cubic,
// or the app sees two edges there: build it from its lexicographically first end.
const segment = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? Cubic.line(a, b).p : Cubic.line(b, a).p.toReversed();

/** The app solution of a drawing on `target` (its source image decides the colour phase). */
export function drawingSolution(xy, target, cfg) {
  const width = target.width;
  const paths = ['A', 'B'].map(f => xy[f].map(line => {
    const pts = line.map(p => toApp(p, width));
    return pts.slice(1).map((p, i) => segment(pts[i], p));
  }));
  const graph = new CurveGraph(paths, width);
  const input = {sourceImage: target.sourceImage, metadata: {...target.metadata, input: 'exact-outline template', paperColors: cfg.paperColors}};
  let phase = 1, solution = graph.solution(graph.points, phase, input);
  const source = target.sourceImage;
  if (source?.mask) {
    const mask = sampleWeave(solution, source.resolution), errors = mask.reduce((s, v, i) => s + Number(v !== source.mask[i]), 0);
    if (errors > mask.length / 2) { phase = -1; solution = graph.solution(graph.points, phase, input); }
  }
  // Visible cuts are the outline: later cleanup may move hidden routes only.
  input.metadata = {...input.metadata, preserveVisibleBoundary: true,
    originalVisibleBoundary: solution.graph.edges.filter(e => e.visible).map(e => e.curve.p.map(p => p.slice()))};
  solution = graph.solution(graph.points, phase, input);
  solution.report = {algorithm: 'exact-outline'};
  return solution;
}
