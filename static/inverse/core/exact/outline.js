/** The visible outline for the exact-outline search: arc lengths, corners,
 * directions and clearance queries (the reference solver's sat_exact.Outline),
 * and the cutting rules in the reference frame, from the app's settings. */
import {PointGrid, angle, cumlen, pointAt, segmentAt} from './polyline.js';
import {pointKey} from './structure.js';

/** The app's limits in reference units (12 per square width), with the small
 * margins the reference solver keeps. `strictness`: 'tight' (the validator's
 * own limits, rounding margins only), 'default' (a little more room), 'paper'
 * (3.3 mm passages, for the paper audit's lattice). */
export function rules(cfg, strictness = 'tight') {
  const mm = 12 / cfg.width, w = cfg.nominalWidth;
  const margin = {tight: .005, default: .055, paper: 3.3 - w}[strictness];
  const gap = (w + margin) * mm, local = cfg.localNeighborhoodFactor * w;  // the validator's, in mm
  return {
    // The validator's outer side clearance is the nominal width at every control point.
    mm, gap, border: (w + Math.min(margin, .055)) * mm,
    // Between two slits of one paper it measures them flattened to the geometry
    // tolerance and takes that off both: the nominal width and twice it.
    interGap: Math.max(gap, (w + 2 * cfg.geometryTolerance + margin) * mm),
    // Close cuts within `local` of each other along one slit are exempt; the
    // rules use a little less, so that sampling only makes them stricter.
    local: (local - (strictness === 'tight' ? .075 : .475)) * mm,
    checkLocal: (local - (strictness === 'tight' ? .065 : .175)) * mm,
    // The exact slit check allows a hair less than the static rules: both sample
    // the geometry, and pairs at the margin would flip between them.
    checkGap: Math.max(gap - .005 * mm, Math.min(gap, (w + .001) * mm)),
    routeGap: strictness === 'paper' ? 3.3 * mm : gap,
    // A hidden cut leaving an edge at angle a turns both sheets, by a and by its
    // supplement; each at most maxTurn, with two degrees to spare.
    minAngle: 180 - cfg.maxTurn + 2, maxTurn: cfg.maxTurn,
    step: .03,
  };
}

/** Arc lengths of a polyline's corners: vertices turning by more than
 * `threshold` degrees, none within `margin` of an open edge's ends; turns over
 * `least` within `cluster` of each other are one corner at the sharpest. */
export function corners(pts, cl, loop, {threshold = 20, margin = .05, cluster = .05, least = 5} = {}) {
  const turns = [];
  for (let i = loop ? 0 : 1; i < pts.length - 1; i++) {
    const a = i > 0 ? pts[i - 1] : pts.at(-2), u = [pts[i][0] - a[0], pts[i][1] - a[1]];
    const v = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    const t = angle(u, v) * (u[0] * v[1] - u[1] * v[0] >= 0 ? 1 : -1);
    if (Math.abs(t) > least) turns.push([cl[i], t]);
  }
  const groups = [];
  for (const [s, t] of turns) {
    if (groups.length && s - groups.at(-1)[0][0] <= cluster) groups.at(-1).push([s, t]);
    else groups.push([[s, t]]);
  }
  if (loop && groups.length > 1 && groups[0][0][0] + cl.at(-1) - groups.at(-1)[0][0] <= cluster)
    groups[0] = [...groups.pop(), ...groups[0]];
  const out = [];
  for (const group of groups) {
    const s = group.reduce((m, x) => Math.abs(x[1]) > Math.abs(m[1]) ? x : m)[0];
    const total = group.reduce((sum, x) => sum + x[1], 0);
    if (Math.abs(total) > threshold && (loop || (margin < s && s < cl.at(-1) - margin))) out.push(s);
  }
  return out.sort((a, b) => a - b);
}

// Arc length on a closed curve, as Python's s % L: ((s % L) + L) % L rounds.
const wrap = (s, L) => { s %= L; return s < 0 ? s + L : s; };

export class Outline {
  constructor(st, rule) {
    this.st = st;
    this.rules = rule;
    this.E = st.edges;
    this.nodes = st.nodes;
    this.geo = this.E.map(e => cumlen(e.pts));
    this.L = this.geo.map(g => g.at(-1));
    const P = [], edge = [], arc = [];
    this.E.forEach((ed, e) => {
      const n = Math.max(3, Math.ceil(this.L[e] / rule.step) + 1);
      for (let k = 0; k < (ed.loop ? n - 1 : n); k++) {
        const s = this.L[e] * k / (n - 1);
        P.push(pointAt(ed.pts, this.geo[e], s));
        edge.push(e);
        arc.push(s);
      }
    });
    this.P = P;
    this.edge = edge;
    this.arc = arc;
    this.grid = new PointGrid(P, Math.max(rule.gap, .05));
    this.corners = this.E.map((ed, e) => corners(ed.pts, this.geo[e], ed.loop));
  }

  at(e, s) {
    if (this.E[e].loop) s = wrap(s, this.L[e]);
    return pointAt(this.E[e].pts, this.geo[e], s);
  }

  /** Arc distance between two points of edge e. */
  along(e, s, t) {
    const d = Math.abs(s - t);
    return this.E[e].loop ? Math.min(d, this.L[e] - d) : d;
  }

  /** Unit directions back and forward along edge e from arc length s. */
  sides(e, s, eps = .05) {
    const here = this.at(e, s), out = [], L = this.L[e], loop = this.E[e].loop;
    eps = Math.min(eps, L / 10);
    if (!loop && s > 0 && s < L) eps = Math.min(eps, s / 2, (L - s) / 2);  // a position close to an end
    for (const t of [s - eps, s + eps]) {
      if (loop || (t >= 0 && t <= L)) {
        const q = this.at(e, t), d = Math.hypot(q[0] - here[0], q[1] - here[1]);
        out.push([(q[0] - here[0]) / d, (q[1] - here[1]) / d]);
      }
    }
    return out;
  }

  /** s moved onto a polyline vertex within `within`, never onto an open edge's end. */
  onVertex(e, s, within = 2e-3) {
    const cl = this.E[e].loop ? this.geo[e] : this.geo[e].slice(1, -1);
    if (!cl.length) return s;
    const near = cl.reduce((m, c) => Math.abs(c - s) < Math.abs(m - s) ? c : m);
    return Math.abs(near - s) < within ? near : s;
  }

  /** Unit directions along edge e's own polyline segments either side of arc length s. */
  legs(e, s) {
    const {pts, loop} = this.E[e], cl = this.geo[e], L = this.L[e];
    if (loop) s = wrap(s, L);
    const i = Math.max(0, Math.min(cl.length - 2, segmentAt(cl, s)));
    const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
    const out = [];
    if (Math.abs(s - cl[i]) < 1e-9) {  // on a vertex: the segments either side of it
      if (i > 0 || loop) out.push(unit(pts[i], i > 0 ? pts[i - 1] : pts.at(-2)));
      out.push(unit(pts[i], pts[i + 1]));
    } else out.push(unit(pts[i + 1], pts[i]), unit(pts[i], pts[i + 1]));
    return out;
  }

  /** [touching node key, arc distance] of edge e's touching ends. */
  ends(e, s) {
    const ed = this.E[e];
    if (ed.loop) return [];
    const out = [];
    for (const [p, d] of [[ed.u, s], [ed.v, this.L[e] - s]]) {
      const k = pointKey(p);
      if (this.nodes.get(k).typ === 'touch') out.push([k, d]);
    }
    return out;
  }

  /** {touching: {touching: arc length}} through touchings, up to 1.2 units. */
  nodeDistance() {
    if (this._nodeDistance) return this._nodeDistance;
    const touch = [...this.nodes].filter(([, n]) => n.typ === 'touch').map(([k]) => k), adj = new Map(touch.map(k => [k, []]));
    this.E.forEach((ed, e) => {
      const u = pointKey(ed.u), v = pointKey(ed.v);
      if (!ed.loop && adj.has(u) && adj.has(v)) { adj.get(u).push([v, this.L[e]]); adj.get(v).push([u, this.L[e]]); }
    });
    const out = new Map();
    for (const start of touch) {
      const best = new Map([[start, 0]]), heap = [[0, start]];
      while (heap.length) {
        heap.sort((a, b) => b[0] - a[0]);
        const [d, k] = heap.pop();
        if (d > (best.get(k) ?? Infinity) || d > 1.2) continue;
        for (const [j, w] of adj.get(k)) if (d + w < (best.get(j) ?? Infinity) && d + w <= 1.2) {
          best.set(j, d + w);
          heap.push([d + w, j]);
        }
      }
      out.set(start, best);
    }
    return (this._nodeDistance = out);
  }

  /** Whether two outline points lie within `limit` along the outline (one edge, or through touchings). */
  nearLocally(e, s, f, t, limit) {
    if (e === f && this.along(e, s, t) <= limit) return true;
    const far = this.nodeDistance();
    for (const [n1, d1] of this.ends(e, s)) for (const [n2, d2] of this.ends(f, t))
      if (d1 + (far.get(n1).get(n2) ?? Infinity) + d2 <= limit) return true;
    return false;
  }
}
