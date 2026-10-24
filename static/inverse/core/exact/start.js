/** The exact search's start, valid on the outline's topology: the template's
 * reading where its switches and segments admit papers (completed by SAT),
 * else a topological witness from the outline alone (the grid search for the
 * usual heart, the SAT search for any other, repairing the template's reading
 * where there is one), placed where the template had them or else spread over
 * each edge's candidate positions. Every start has the reader's shape:
 * positions (edge -> switch arcs), labels ('e,i' -> 1 for paper A), chords
 * ({a, b, route}). */
import {readTemplate} from './template.js';
import {completeWitness, topologicalWitness} from './topology.js';
import {exactPositions} from './positions.js';
import {gridWitness} from './grid.js';

/** A reading's switches and segments: words (edge -> sides in order) and pairs of tokens. */
export function wordsOf(reading) {
  const side = new Map(reading.chords.flatMap(c => [c.a, c.b]).map(t => [`${t[1]},${t[2]}`, t[3]]));
  const words = new Map([...reading.positions].map(([e, arcs]) => [e, arcs.map((_, k) => side.get(`${e},${k + 1}`))]));
  return {words, pairs: reading.chords.map(c => [c.a, c.b])};
}

/** A topological witness (lab, side, chords; switches in each edge's first
 * slots) in the reader's shape. An edge with as many switches as the
 * template's `reading` has there keeps the template's; others are spread over
 * its candidate positions. A segment the reading has keeps its route; others
 * are drawn straight. */
export function placedWitness(outline, topo, reading = null, routes = null) {
  const grid = exactPositions(outline), positions = new Map(), labels = new Map(), rank = new Map(), kept = new Set(), index = new Map();
  outline.E.forEach((_, e) => {
    const q = topo.q[e];
    let m = 0;
    for (let j = 1; j <= q; j++) if (topo.side.get(`${e}:${j}:L`) || topo.side.get(`${e}:${j}:R`)) rank.set(`${e},${j}`, ++m);
    const g = grid.get(e) || [], L = outline.L[e], theirs = reading?.positions.get(e) || [];
    if (theirs.length === m) { positions.set(e, [...theirs]); kept.add(e); }
    else if (g.length >= m) { index.set(e, Array.from({length: m}, (_, k) => Math.floor((k + .5) * g.length / m))); positions.set(e, index.get(e).map(i => g[i])); }
    else positions.set(e, Array.from({length: m}, (_, k) => L * (k + .5) / m));
    for (let i = 0; i <= m; i++) labels.set(`${e},${i}`, topo.lab.get(`${e},${i}`) ?? 0);
  });
  if (routes) place(outline, grid, positions, index, topo, rank, routes);
  const key = (a, b) => [a, b].map(t => `${t[1]},${t[2]},${t[3]}`).sort().join('|');
  const own = new Map((reading?.chords || []).map(c => [key(c.a, c.b), c.route]));
  const token = t => ['s', t[1], rank.get(`${t[1]},${t[2]}`), t[3]];
  const chords = topo.chords.map(c => {
    const a = token(c.t1), b = token(c.t2), at = t => outline.at(t[1], positions.get(t[1])[t[2] - 1]);
    const theirs = own.get(key(a, b));
    return {a, b, route: theirs ? [at(a), ...theirs.slice(1, -1), at(b)] : [at(a), at(b)]};
  });
  return {positions, labels, chords};
}

/** Switches spread over an edge's candidate positions (`index`, per edge, in
 * order) moved, each in turn, to the position between its neighbours whose
 * segment to its partner is the cheapest straight cut the rules allow,
 * crossing no other: coordinate descent, a few rounds. */
function place(outline, grid, positions, index, topo, rank, routes, {rounds = 4, invalid = 100} = {}) {
  const partner = new Map(), token = t => ['s', t[1], rank.get(`${t[1]},${t[2]}`), t[3]], chords = [];
  for (const c of topo.chords) {
    const a = token(c.t1), b = token(c.t2);
    chords.push([a, b]);
    partner.set(`${a[1]},${a[2]}`, [a, b]);
    partner.set(`${b[1]},${b[2]}`, [b, a]);
  }
  const crosses = (p, q, r, t) => {
    const o = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return o(p, q, r) * o(p, q, t) < -1e-12 && o(r, t, p) * o(r, t, q) < -1e-12;
  };
  const at = t => outline.at(t[1], positions.get(t[1])[t[2] - 1]);
  // A straight cut the rules allow costs its length; any other, and each
  // crossing of another segment as they stand, `invalid` more.
  const cost = (a, sa, b, sb) => {
    const p = outline.at(a[1], sa), q = outline.at(b[1], sb), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const line = routes.straight(a, sa, b, sb);
    let c = line && routes.clear(line, a, sa, b, sb) ? d : invalid + d;
    for (const [x, y] of chords) if (x !== a && y !== a && x !== b && y !== b && crosses(p, q, at(x), at(y))) c += invalid;
    return c;
  };
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (const [e, idx] of index) {
      const g = grid.get(e);
      idx.forEach((i0, k) => {
        const pair = partner.get(`${e},${k + 1}`);
        if (!pair) return;
        const [a, b] = pair, sb = positions.get(b[1])[b[2] - 1];
        const lo = k ? idx[k - 1] + 1 : 0, hi = k + 1 < idx.length ? idx[k + 1] - 1 : g.length - 1;
        let best = i0, bestCost = cost(a, g[i0], b, sb);
        for (let i = lo; i <= hi; i++) { const c = cost(a, g[i], b, sb); if (c < bestCost - 1e-9) { best = i; bestCost = c; } }
        if (best !== i0) { idx[k] = best; positions.get(e)[k] = g[best]; moved = true; }
      });
    }
    if (!moved) break;
  }
}

/** The start for `template` on the exact outline `exact` ({st, outline}) by
 * `deadline`: {witness, how} or {error}. `grid` is the grid search (st,
 * {deadline}) -> {sides, pairs} | false | null. */
export async function exactStart(exact, template, {deadline = Infinity, grid = gridWitness} = {}) {
  const {st, outline} = exact;
  const reading = template ? await readTemplate(template, outline) : {error: 'no template'};
  if (!reading.error) {
    const done = completeWitness(st, {...wordsOf(reading), labels: reading.labels}, {deadline});
    if (done.witness) {
      const labels = new Map([...reading.labels.keys()].map(k => [k, done.witness.lab.get(k) ?? reading.labels.get(k)]));
      return {witness: {...reading, labels}, how: 'template'};
    }
  }
  if (grid) {
    const found = grid(st, {deadline});
    if (found) {
      const done = completeWitness(st, {words: found.sides, pairs: found.pairs}, {deadline});
      if (done.witness) return {witness: placedWitness(outline, done.witness, null, exact.routes), how: 'grid'};
    }
  }
  // The SAT search, repairing the template's reading where there is one.
  const hint = reading.error ? null : {...wordsOf(reading), labels: reading.labels};
  const found = topologicalWitness(st, {deadline, hint});
  if (found.witness) return {witness: placedWitness(outline, found.witness, hint ? reading : null, exact.routes), how: hint ? 'repaired template' : 'topology'};
  return {error: found.error};
}
