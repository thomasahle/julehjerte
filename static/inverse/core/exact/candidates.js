/** Candidate hidden segments of a position grid with the routes they are drawn
 * along (the reference solver's sat_exact.Routes): per face, every pair of its
 * tokens with a straight route the rules allow, the template's own routes, and
 * pruning to each token's nearest partners. Tokens are ['s', e, j, side]. */
import {act} from './symmetry.js';

export const tokenKey = t => `${t[1]}:${t[2]}:${t[3]}`;

/** Per face, its boundary cycles as token lists (sat_weave.face_tokens). */
export function faceTokens(st, positions) {
  return st.faces.map(face => face.runs.map(runs => {
    const cycle = [];
    for (const run of runs) {
      if (run[0] !== 'edge') throw new Error('Only reading N (no corner ends) is supported.');
      const [, e, d] = run, q = (positions.get(e) || []).length;
      for (let k = 1; k <= q; k++) cycle.push(['s', e, d === 1 ? k : q + 1 - k, d === 1 ? 'L' : 'R']);
    }
    return cycle;
  }));
}

export class Candidates {
  constructor(st, outline, rules, positions, {deadline = Infinity} = {}) {
    this.st = st;
    this.outline = outline;
    this.rules = rules;  // RouteRules
    this.positions = positions;
    this.faces = faceTokens(st, positions);
    this.faceOf = new Map();
    this.order = new Map();  // token -> index in its face's token order
    this.faces.forEach((cycles, fi) => {
      let i = 0;
      for (const cycle of cycles) for (const t of cycle) { this.faceOf.set(tokenKey(t), fi); this.order.set(tokenKey(t), i++); }
    });
    this.cost = new Map();  // `fi|a|b` -> cost; a before b in face order
    this.route = new Map();
    this.kind = new Map();
    this.pair = new Map();  // key -> [fi, a, b]
    const R = outline.rules;
    this.faces.forEach((cycles, fi) => {
      const flat = cycles.flat().filter(t => {
        const p = this.point(t);
        return Math.min(p[0], p[1], 12 - p[0], 12 - p[1]) >= R.border;
      });
      for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
        if (performance.now() > deadline) throw new Error('Candidate routes ran out of time.');
        const a = flat[i], b = flat[j];
        if (a[1] === b[1] && outline.along(a[1], this.arc(a), this.arc(b)) < 2 * R.gap) continue;
        const line = rules.straight(a, this.arc(a), b, this.arc(b));
        if (!line || !rules.clear(line, a, this.arc(a), b, this.arc(b))) continue;
        this.set(fi, a, b, line, 'straight', rules.niceness(line, a, this.arc(a), b, this.arc(b)));
      }
    });
  }

  arc(t) { return this.positions.get(t[1])[t[2] - 1]; }
  point(t) { return this.outline.at(t[1], this.arc(t)); }
  keyOf(a, b) {
    const fi = this.faceOf.get(tokenKey(a));
    const [x, y] = this.order.get(tokenKey(a)) < this.order.get(tokenKey(b)) ? [a, b] : [b, a];
    return `${fi}|${tokenKey(x)}|${tokenKey(y)}`;
  }

  set(fi, a, b, route, kind, cost) {
    const key = this.keyOf(a, b), forward = key.split('|')[1] === tokenKey(a);
    this.cost.set(key, cost);
    this.route.set(key, forward ? route : [...route].reverse());
    this.kind.set(key, kind);
    this.pair.set(key, forward ? [fi, a, b] : [fi, b, a]);
  }

  /** One more candidate from a to b along `route` (a template's own hidden cut),
   * kept if it obeys the rules and is cheaper than the one there. */
  add(a, b, route, kind = 'template') {
    const fa = this.faceOf.get(tokenKey(a));
    if (fa === undefined || fa !== this.faceOf.get(tokenKey(b)) || route.length < 2) return false;
    if (!this.rules.valid(route, a, this.arc(a), b, this.arc(b))) return false;
    // A template's curve is its designer's choice: its length alone.
    let cost = 0;
    for (let i = 1; i < route.length; i++) cost += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    const key = this.keyOf(a, b);
    if (this.cost.has(key) && this.cost.get(key) <= cost) return false;
    this.set(fa, a, b, route, kind, cost);
    return true;
  }

  /** The key of a segment's image under a tie, or null across two faces. */
  imageKey(tie, key) {
    const [, a, b] = this.pair.get(key), x = tie.tokens.get(tokenKey(a)), y = tie.tokens.get(tokenKey(b));
    if (!x || !y || this.faceOf.get(tokenKey(x)) !== this.faceOf.get(tokenKey(y))) return null;
    return this.keyOf(x, y);
  }

  /** Whole orbits under the `ties` only, each segment drawn as the image of one
   * of them, with equal costs: the cut set is then exactly symmetric where the
   * outline is (sat_exact.Routes.symmetric). An image is added where its route
   * obeys the rules; an orbit with one that does not goes. */
  symmetric(ties) {
    if (!ties.length) return;
    const keep = new Map(), done = new Set();
    for (const key of [...this.cost.keys()].sort()) {
      if (done.has(key)) continue;
      const [fi, a, b] = this.pair.get(key), orbit = new Map([[key, {pair: [fi, a, b], route: this.route.get(key), kind: this.kind.get(key)}]]);
      let ok = true;
      for (const tie of ties) {
        const x = tie.tokens.get(tokenKey(a)), y = tie.tokens.get(tokenKey(b));
        if (!x || !y || this.faceOf.get(tokenKey(x)) !== this.faceOf.get(tokenKey(y))) { ok = false; break; }
        const image = this.keyOf(x, y);
        if (orbit.has(image)) continue;
        const forward = image.split('|')[1] === tokenKey(x), [p, q] = forward ? [x, y] : [y, x];
        const route = this.route.get(key).map(pt => act(tie.name, pt));
        if (!forward) route.reverse();
        route[0] = this.point(p);
        route[route.length - 1] = this.point(q);
        // Images must obey the rules too: a hand-drawn outline's image of a cut can meet it at a shallower angle.
        if (!this.rules.valid(route, p, this.arc(p), q, this.arc(q))) { ok = false; break; }
        orbit.set(image, {pair: [this.faceOf.get(tokenKey(p)), p, q], route, kind: this.kind.get(key)});
      }
      for (const k of orbit.keys()) done.add(k);
      if (!ok) continue;
      const costs = [...orbit.keys()].map(k => this.cost.get(k) ?? this.cost.get(key)), mean = costs.reduce((s, c) => s + c, 0) / costs.length;
      for (const [k, item] of orbit) keep.set(k, {...item, cost: mean});
    }
    this.cost = new Map([...keep].map(([k, x]) => [k, x.cost]));
    this.route = new Map([...keep].map(([k, x]) => [k, x.route]));
    this.kind = new Map([...keep].map(([k, x]) => [k, x.kind]));
    this.pair = new Map([...keep].map(([k, x]) => [k, x.pair]));
  }

  /** `e:j` -> [[key, cost]] of the candidates ending at position j of edge e. */
  byPosition() {
    const out = new Map();
    for (const [key, c] of this.cost) for (const t of this.pair.get(key).slice(1)) {
      const k = `${t[1]}:${t[2]}`;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push([key, c]);
    }
    return out;
  }

  /** Each token's `neighbours` cheapest segments (never two consecutive switches
   * of one edge, which would close a loop), its cheapest to every other edge of
   * its face, the `required` token pairs, and the images of all these under
   * the `ties`. */
  prune(neighbours = 8, required = [], ties = []) {
    const byToken = new Map(), push = (t, item) => { const k = tokenKey(t); if (!byToken.has(k)) byToken.set(k, []); byToken.get(k).push(item); };
    for (const [key, c] of this.cost) {
      const [, a, b] = this.pair.get(key);
      if (a[1] === b[1] && Math.abs(a[2] - b[2]) === 1) continue;
      push(a, [c, key]);
      push(b, [c, key]);
    }
    const chosen = new Set();
    for (const [t, items] of byToken) {
      items.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
      for (const [, key] of items.slice(0, neighbours)) chosen.add(key);
      const best = new Map(), e = Number(t.split(':')[0]);
      for (const [c, key] of items) {
        const [, a, b] = this.pair.get(key), other = tokenKey(a) === t ? b : a;
        if (other[1] !== e && (!best.has(other[1]) || c < best.get(other[1])[0])) best.set(other[1], [c, key]);
      }
      for (const [, key] of best.values()) chosen.add(key);
    }
    const wanted = new Set(required.map(([a, b]) => [tokenKey(a), tokenKey(b)].sort().join('|')));
    for (const key of this.cost.keys()) {
      const [, a, b] = this.pair.get(key);
      if (wanted.has([tokenKey(a), tokenKey(b)].sort().join('|'))) chosen.add(key);
    }
    for (const key of [...chosen]) for (const tie of ties) {
      const image = this.imageKey(tie, key);
      if (image && this.cost.has(image)) chosen.add(image);
    }
    for (const key of [...this.cost.keys()]) if (!chosen.has(key)) {
      this.cost.delete(key); this.route.delete(key); this.kind.delete(key); this.pair.delete(key);
    }
  }
}
