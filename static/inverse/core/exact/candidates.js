/** Candidate hidden segments of a position grid with the routes they are drawn
 * along (the reference solver's sat_exact.Routes): per face, every pair of its
 * tokens with a straight route the rules allow, the template's own routes, and
 * pruning to each token's nearest partners. Tokens are ['s', e, j, side]. */
import {act} from './symmetry.js';
import {SIZE} from './structure.js';

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

const routeLength = route => route.reduce((sum, p, i) => i ? sum + Math.hypot(p[0] - route[i - 1][0], p[1] - route[i - 1][1]) : sum, 0);

/** Each candidate's score from a cut-proposal network's maps ({size, hidden,
 * switch, dir: [cos 2a, sin 2a], ...}, size x size, rows from the top of the
 * square): the hidden-cut probability along its route, counted fully where the
 * predicted direction agrees with the route's and half where it does not, as a
 * mean, plus half the smaller switch probability near its two ends (within two
 * pixels), as OpenPose scores limbs. A Map key -> score. */
export function rankScores(cand, maps) {
  // The reference frame's y runs up (target.js toReference), the maps' rows down.
  const n = maps.size, row = y => Math.min(n - 1, Math.max(0, Math.floor((SIZE - y) * n / SIZE))), cell = (x, y) => row(y) * n + Math.min(n - 1, Math.max(0, Math.floor(x * n / SIZE)));
  const near = ([x, y]) => {
    let best = 0;
    const x0 = Math.floor(x * n / SIZE), y0 = Math.floor((SIZE - y) * n / SIZE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const u = x0 + dx, v = y0 + dy;
      if (u >= 0 && v >= 0 && u < n && v < n) best = Math.max(best, maps.switch[v * n + u]);
    }
    return best;
  };
  const out = new Map();
  for (const [key, route] of cand.route) {
    if (!cand.cost.has(key)) continue;
    let sum = 0, count = 0;
    for (let i = 1; i < route.length; i++) {
      const [x0, y0] = route[i - 1], [x1, y1] = route[i], steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * n / SIZE * 2)), a = 2 * Math.atan2(y0 - y1, x1 - x0);
      for (let k = 0; k < steps; k++) {
        const j = cell(x0 + (x1 - x0) * (k + .5) / steps, y0 + (y1 - y0) * (k + .5) / steps);
        sum += maps.hidden[j] * (.5 + .5 * Math.max(0, Math.cos(a) * maps.dir[0][j] + Math.sin(a) * maps.dir[1][j]));
        count++;
      }
    }
    const [, a, b] = cand.pair.get(key);
    out.set(key, (count ? sum / count : 0) + .5 * Math.min(near(cand.point(a)), near(cand.point(b))));
  }
  return out;
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
   * its face, its cheapest along its own edge in each band of arc distance
   * doubling from `reach`, the `required` token pairs, and the images of all
   * these under the `ties`. The bands keep a long cut across a face one edge
   * bounds: Uret's inner circle, whose four hidden segments run a quarter of
   * the way round it, past the nearest partners (the designer's template, read
   * on the traced outline, then passes; without them its segments cross).
   * With `rank` ({maps, k, short}: a cut-proposal network's maps, rankScores)
   * the `k` best ranked and every one up to `short` units long instead. */
  prune(neighbours = 8, required = [], ties = [], {reach = 1, rank = null} = {}) {
    if (rank) return this.keep(this.ranked(rank), required, ties);
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
      const best = new Map(), far = new Map(), e = Number(t.split(':')[0]);
      for (const [c, key] of items) {
        const [, a, b] = this.pair.get(key), other = tokenKey(a) === t ? b : a;
        if (other[1] !== e) {
          if (!best.has(other[1]) || c < best.get(other[1])[0]) best.set(other[1], [c, key]);
          continue;
        }
        const band = Math.floor(Math.log2(this.outline.along(e, this.arc(a), this.arc(b)) / reach));
        if (band >= 0 && (!far.has(band) || c < far.get(band)[0])) far.set(band, [c, key]);
      }
      for (const [, key] of [...best.values(), ...far.values()]) chosen.add(key);
    }
    this.keep(chosen, required, ties);
  }

  /** The `k` candidates the maps rank best (rankScores), and every one up to
   * `short` units long: the stubs of crossings and tips, which the hidden-cut
   * field hardly shows. */
  ranked({maps, k, short = 0}) {
    const scores = rankScores(this, maps), chosen = new Set([...scores].sort((x, y) => y[1] - x[1]).slice(0, k).map(([key]) => key));
    if (short > 0) for (const [key, route] of this.route) if (routeLength(route) <= short) chosen.add(key);
    return chosen;
  }

  /** Only the `chosen` candidates kept, with the `required` token pairs and the
   * images of all of them under the `ties`. */
  keep(chosen, required = [], ties = []) {
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
