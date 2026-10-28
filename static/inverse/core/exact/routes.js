/** Hidden routes on the exact outline: whether a route may be cut (inside its
 * face, a strip clear of the outline away from its own ends, leaving the edge
 * at a fair angle) and what it costs (the reference solver's sat_exact.Routes:
 * _straight, _clear, _departs, niceness). Tokens are ['s', e, j, side] at
 * arc length `arcs` along edge e; side L faces faceL. */
import {angle, cumlen, pointAt} from './polyline.js';
import {pointInRing} from '../geometry.js';

export class RouteRules {
  constructor(st, outline) {
    this.st = st;
    this.outline = outline;
    this.rules = outline.rules;
  }

  /** The face a token's hidden cut runs into. */
  face(t) { return t[3] === 'L' ? this.st.faceL.get(t[1]) : this.st.faceR.get(t[1]); }

  /** The normal into the token's side, averaged over both legs at a corner;
   * at an open edge's very end (a topological start's position can lie there:
   * flower), along its one leg. */
  normal(t, s) {
    const sides = this.outline.sides(t[1], s), [back, fwd] = sides.length > 1 ? sides : s <= 0 ? [[-sides[0][0], -sides[0][1]], sides[0]] : [sides[0], [-sides[0][0], -sides[0][1]]];
    const d = [fwd[0] - back[0], fwd[1] - back[1]], n = Math.hypot(d[0], d[1]) || 1;
    const left = [-d[1] / n, d[0] / n];
    return t[3] === 'L' ? left : [-left[0], -left[1]];
  }

  /** A cut leaving token t (at arc s) along d: into its side, at least the
   * minimum angle from both directions along the edge and its own segments. */
  departs(t, s, d) {
    const n = this.normal(t, s);
    if (d[0] * n[0] + d[1] * n[1] <= 0) return false;
    const e = t[1];
    return [...this.outline.sides(e, s), ...this.outline.legs(e, s)].every(side => angle(d, side) >= this.rules.minAngle);
  }

  /** Whether segment pq stays inside face f (it may end on its boundary). */
  insideFace(f, p, q) {
    const rings = this.st.faces[f].cyclepts;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (properCross(p, q, a, b)) return false;
    }
    // Its middle inside the outer ring and in no hole.
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return pointInRing(m, rings[0]) && !rings.slice(1).some(r => pointInRing(m, r));
  }

  /** A straight route from token a (arc sa) to token b (arc sb), or null. */
  straight(a, sa, b, sb) {
    const f = this.face(a);
    if (f !== this.face(b)) return null;
    const p = this.outline.at(a[1], sa), r = this.outline.at(b[1], sb), d = [r[0] - p[0], r[1] - p[1]];
    if (Math.hypot(d[0], d[1]) < 1e-9 || !this.departs(a, sa, d) || !this.departs(b, sb, [-d[0], -d[1]])) return null;
    return this.insideFace(f, p, r) ? [p, r] : null;
  }

  /** Every sample of the route a strip clear of the outline, except of outline
   * near its own ends along the outline (there the cut is one slit's joint),
   * and inner samples clear of the square's border. */
  clear(route, a, sa, b, sb) {
    const {rules, outline} = this, cl = cumlen(route), total = cl.at(-1);
    const n = Math.max(2, Math.ceil(total / rules.step) + 1);
    for (let k = 0; k < n; k++) {
      const s = total * k / (n - 1), p = pointAt(route, cl, s);
      if (k > 0 && k < n - 1 && Math.min(p[0], p[1], 12 - p[0], 12 - p[1]) < rules.border) return false;
      for (const i of outline.grid.within(p, rules.routeGap)) {
        const e = outline.edge[i], t = outline.arc[i];
        if (!outline.nearLocally(a[1], sa, e, t, rules.local - s) && !outline.nearLocally(b[1], sb, e, t, rules.local - (total - s))) return false;
      }
    }
    return true;
  }

  /** A route's cost: its length, plus `bend` per radian it turns and `depart`
   * per 90 degrees it leaves an edge off the perpendicular. */
  niceness(route, a, sa, b, sb, {bend = .3, depart = .2} = {}) {
    let cost = cumlen(route).at(-1);
    for (let i = 0; i + 2 < route.length; i++) {
      const [p, q, r] = [route[i], route[i + 1], route[i + 2]];
      cost += bend * angle([q[0] - p[0], q[1] - p[1]], [r[0] - q[0], r[1] - q[1]]) * Math.PI / 180;
    }
    for (const [t, s, p, q] of [[a, sa, route[0], route[1]], [b, sb, route.at(-1), route.at(-2)]]) {
      const d = [q[0] - p[0], q[1] - p[1]];
      cost += depart * Math.max(...this.outline.sides(t[1], s).map(side => Math.abs(90 - angle(d, side)))) / 90;
    }
    return cost;
  }

  /** Whether a whole route may be cut: its ends' departures, inside its face, clear. */
  valid(route, a, sa, b, sb) {
    const f = this.face(a);
    // Without points on top of each other, whose direction is none at all.
    route = route.filter((p, i) => i === 0 || i === route.length - 1 ? true : Math.hypot(p[0] - route[i - 1][0], p[1] - route[i - 1][1]) > 1e-6);
    if (f !== this.face(b) || route.length < 2 || route.slice(1).some((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]) <= 1e-6)) return false;
    const out = [route[1][0] - route[0][0], route[1][1] - route[0][1]], back = [route.at(-2)[0] - route.at(-1)[0], route.at(-2)[1] - route.at(-1)[1]];
    if (!this.departs(a, sa, out) || !this.departs(b, sb, back)) return false;
    for (let i = 0; i + 1 < route.length; i++) if (!this.insideFace(f, route[i], route[i + 1])) return false;
    // Its own bends within the turn limit, and it never crosses itself.
    for (let i = 0; i + 2 < route.length; i++) {
      const [p, q, r] = [route[i], route[i + 1], route[i + 2]];
      if (angle([q[0] - p[0], q[1] - p[1]], [r[0] - q[0], r[1] - q[1]]) > this.rules.maxTurn - 2) return false;
    }
    for (let i = 0; i + 1 < route.length; i++) for (let j = i + 2; j + 1 < route.length; j++)
      if (properCross(route[i], route[i + 1], route[j], route[j + 1])) return false;
    return this.clear(route, a, sa, b, sb);
  }
}

// Segments pq and ab cross at a point interior to both (shared ends excepted).
function properCross(p, q, a, b) {
  const o = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  const d1 = o(a, b, p), d2 = o(a, b, q), d3 = o(p, q, a), d4 = o(p, q, b), eps = 1e-12;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}
