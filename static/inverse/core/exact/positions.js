/** Candidate switch positions per outline edge (the reference solver's
 * sat_exact.exact_positions, without symmetry): every corner, evenly spaced
 * points between them (a side's middle where it gets one), points at fixed
 * offsets from corners, a template's own switches, and the perpendicular
 * projections of other edges' positions onto straight sides. */
import {project, segmentAt} from './polyline.js';

export const OFFSETS = [.6, 1.2];  // from corners, in reference units
const round12 = x => Math.round(x * 1e12) / 1e12;

/** Per edge, the arc lengths of the nearest points to other edges' positions
 * within `reach` that fall on a straight side (one polyline segment between
 * corners): a cut to them meets that side perpendicularly. */
export function projections(outline, positions, {reach = 3, margin = .05} = {}) {
  const out = new Map(), pts = [];
  for (const [f, grid] of positions) for (const s of grid) pts.push([f, outline.at(f, s)]);
  outline.E.forEach((ed, e) => {
    const cl = outline.geo[e], L = outline.L[e];
    const ends = [...outline.corners[e], ...(ed.loop ? [] : [0, L])];
    for (const [f, p] of pts) {
      if (f === e) continue;
      const {distance, arc: s} = project(ed.pts, cl, p);
      if (distance > reach || !(ed.loop || (margin < s && s < L - margin))) continue;
      const i = Math.max(0, Math.min(cl.length - 2, segmentAt(cl, s)));
      if ([...ends, 0].some(c => Math.abs(c - cl[i]) < 1e-9) && [...ends, L].some(c => Math.abs(c - cl[i + 1]) < 1e-9)
        && cl[i + 1] - cl[i] > 2 * margin) {
        if (!out.has(e)) out.set(e, []);
        out.get(e).push(s);
      }
    }
  });
  return out;
}

function grid(outline, e, spacing, floor, extra = [], firm = [], near = new Set()) {
  const L = outline.L[e], loop = outline.E[e].loop, apart = 1e-3, end = .05;
  // Points within `apart` of each other are one (a template's switch first, then
  // a corner, then the rest); none within 0.05 of an open edge's end, but a
  // template's own switches; none within 0.05 of a `firm` point.
  const distinct = points => {
    const kept = [...firm];
    for (const c of points) {
      if ((loop || (end < c && c < L - end) || (near.has(c) && 1e-6 < c && c < L - 1e-6))
        && kept.every(d => outline.along(e, c, d) > apart) && firm.every(f => outline.along(e, c, f) > .05)) kept.push(c);
    }
    return kept;
  };
  const corners = outline.corners[e], cuts = distinct([...extra, ...[...corners].sort((a, b) => a - b)]).sort((a, b) => a - b);
  let sides;
  if (!loop) {
    const bounds = [0, ...cuts, L];
    sides = bounds.slice(1).map((b, i) => [bounds[i], b]);
  } else if (cuts.length) sides = cuts.map((c, i) => [c, i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + L]);
  else sides = [[0, L]];
  let out = [...cuts];
  const need = !cuts.length && !loop ? Math.max(floor, Math.ceil(L / spacing)) : 0, cornerSet = new Set(corners);
  for (const [a, b] of sides) {
    const n = Math.max(need, 1, Math.round((b - a) / spacing)), pts = [];
    for (let k = 0; k < n; k++) pts.push(a + (b - a) * (k + .5) / n);
    // Points at fixed offsets from a corner: a cut leaving there keeps a paper
    // passage clear of a cut at the corner.
    for (const d of OFFSETS) for (const [c, sign] of [[a, 1], [b, -1]]) {
      if (cornerSet.has(loop ? c % L : c) && b - a > 2 * d + .1) {
        const t = c + sign * d;
        if (pts.every(u => Math.abs(t - u) >= .2)) pts.push(t);
      }
    }
    out.push(...pts.map(t => loop ? t % L : t));
  }
  if (loop && !cuts.length) {
    const r = Math.max(floor, Math.ceil(L / spacing));
    out = Array.from({length: r}, (_, k) => L * (k + .5) / r);
  }
  return distinct([...cuts, ...out.map(round12)]).sort((a, b) => a - b);
}

function merged(outline, e, base, added, tol = .15) {
  const out = [...base];
  for (const v of [...added].sort((a, b) => a - b)) if (out.every(k => outline.along(e, v, k) >= tol)) out.push(v);
  return out.sort((a, b) => a - b);
}

/** Positions per edge: Map e -> sorted arcs. `forced` and `firm`: Map e -> arcs.
 * With `sym` (a StructureSymmetry), closed under its group. */
export function exactPositions(outline, {spacing = .75, floor = 3, project: withProjections = true, forced = new Map(), firm = new Map(), sym = null} = {}) {
  if (sym) {
    const base = symmetricGrid(outline, sym, spacing, floor, forced, new Map());
    return withProjections ? symmetricGrid(outline, sym, spacing, floor, forced, projections(outline, base)) : base;
  }
  const base = new Map(outline.E.map((_, e) => {
    const f = forced.get(e) || [];
    return [e, grid(outline, e, spacing, floor, f, firm.get(e) || [], new Set(f))];
  }));
  if (!withProjections) return base;
  const extra = projections(outline, base);
  return new Map(outline.E.map((_, e) => {
    const f = forced.get(e) || [];
    return [e, merged(outline, e, grid(outline, e, spacing, floor, f, firm.get(e) || [], new Set(f)), extra.get(e) || [])];
  }));
}

/** The grid of each orbit's first edge, from every orbit edge's corners, forced
 * points and `extra` mapped onto it and the fixed points of mirrors across it
 * (a paper-swapping one forces a switch there), closed under the stabilizer;
 * the orbit's other edges get its images (sat_exact.exact_positions_base). */
function symmetricGrid(outline, sym, spacing, floor, forced, extra) {
  const out = new Map(), E = outline.E, onto = (e0, e) => sym.names.find(n => sym.edge[n][e][0] === e0);
  for (const orbit of sym.orbits()) {
    const e0 = orbit[0], L = outline.L[e0], stab = sym.names.filter(n => sym.edge[n][e0][0] === e0);
    const more = [], added = [], fixed = [], near = new Set();
    for (const e of orbit) {
      const name = onto(e0, e);
      for (const c of [...outline.corners[e], ...(forced.get(e) || [])]) more.push(sym.arcImage(name, e, c)[1]);
      for (const c of forced.get(e) || []) near.add(sym.arcImage(name, e, c)[1]);
      for (const c of extra.get(e) || []) added.push(sym.arcImage(name, e, c)[1]);
    }
    // The point a mirror maps onto itself, from a guess: on a hand-drawn outline
    // the arc map is only roughly s -> c - s.
    const settle = (n, s) => {
      for (let k = 0; k < 40; k++) {
        let d = sym.arcImage(n, e0, s)[1] - s;
        if (E[e0].loop) d = ((d + L / 2) % L + L) % L - L / 2;
        if (Math.abs(d) < 1e-10) break;
        s = E[e0].loop ? ((s + d / 2) % L + L) % L : Math.min(L, Math.max(0, s + d / 2));
      }
      return s;
    };
    for (const n of stab) if (sym.edge[n][e0][1] === -1) {
      if (E[e0].loop) { const a = sym.arcImage(n, e0, 0)[1]; fixed.push(settle(n, (a / 2) % L), settle(n, (a / 2 + L / 2) % L)); }
      else fixed.push(settle(n, L / 2));
    }
    const base = merged(outline, e0, grid(outline, e0, spacing, floor, more, fixed, near), added, .25);
    // Closed under the stabilizer: each point's whole orbit, unless a position
    // lies within `apart` of it already (on a hand-drawn outline an image lands
    // a little off its original, and two switches that close degenerate).
    // Mirror fixed points first, then corners, then the rest.
    const apart = .05, isCorner = s => outline.corners[e0].some(c => Math.abs(c - s) < 1e-9);
    const closed = [];
    const order = [...fixed.filter(f => base.some(b => Math.abs(f - b) < 1e-9)), ...base.filter(isCorner), ...base.filter(b => !isCorner(b))];
    for (const s of order) {
      if (closed.some(c => outline.along(e0, s, c) < apart)) continue;
      for (const n of stab) {
        const t = sym.arcImage(n, e0, s)[1];
        if (closed.every(c => outline.along(e0, t, c) >= apart)) closed.push(t);
      }
    }
    // A position near a corner, on it.
    for (const c of outline.corners[e0]) {
      let k = -1;
      closed.forEach((u, i) => { if (k < 0 || outline.along(e0, u, c) < outline.along(e0, closed[k], c)) k = i; });
      if (k >= 0 && outline.along(e0, closed[k], c) < apart) closed[k] = c;
    }
    // Images are projections: two positions either side of a corner can land on
    // one point of an image edge (khatam). Keep the first, and only positions
    // whose stabilizer images stay.
    let keep = closed.sort((a, b) => a - b);
    for (;;) {
      const seen = new Map(orbit.slice(1).map(e => [e, []])), kept = [];
      for (const s of keep) {
        const images = orbit.slice(1).map(e => [e, sym.arcImage(onto(e, e0), e0, s)[1]]);
        if (images.every(([e, t]) => seen.get(e).every(u => outline.along(e, t, u) > .005))) {
          kept.push(s);
          for (const [e, t] of images) seen.get(e).push(t);
        }
      }
      const next = kept.filter(s => stab.every(n => kept.some(u => outline.along(e0, sym.arcImage(n, e0, s)[1], u) < apart)));
      if (next.length === keep.length && next.every((v, i) => v === keep[i])) break;
      keep = next;
    }
    out.set(e0, keep);
    for (const e of orbit.slice(1)) {
      const mapped = keep.map(s => sym.arcImage(onto(e, e0), e0, s)[1]).sort((a, b) => a - b);
      // A corner takes its nearest image where that moves it a sixth of the closest spacing.
      const room = Math.min(outline.L[e], ...mapped.slice(1).map((b, i) => b - mapped[i]));
      for (const c of outline.corners[e]) {
        let k = -1;
        mapped.forEach((m, i) => { if (k < 0 || outline.along(e, m, c) < outline.along(e, mapped[k], c)) k = i; });
        if (k >= 0 && outline.along(e, mapped[k], c) < Math.min(.05, room / 6)) mapped[k] = c;
      }
      out.set(e, mapped.sort((a, b) => a - b));
    }
  }
  return out;
}
