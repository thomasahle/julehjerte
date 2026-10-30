/** A start for the exact model from the repo's CDCL (sat.js): the model's rows
 * as counts of its binary columns (coefficients +-1; the other columns read
 * at 0), the loops and embeddings checked during the search, the other lazily
 * checked rules added as counts a round at a time. Prototype. */
import {Sat} from './sat.js';

export class EmbedTheory {
  constructor(chords, embeds) { this.chords = chords; this.embeds = embeds; this.faces = new Map(); this.log = []; }
  assign(l, trail) {
    const c = this.chords.get(l);
    if (!c) return null;
    const [face, pair] = c;
    if (!this.faces.has(face)) this.faces.set(face, []);
    const set = this.faces.get(face);
    set.push([l, pair]);
    this.log.push({trail, face});
    if (set.length < 2 || this.embeds(face, set.map(([, p]) => p))) return null;
    let bad = set.slice();
    for (const item of set) {
      if (item[0] === l) continue;
      const trial = bad.filter(d => d !== item);
      if (!this.embeds(face, trial.map(([, p]) => p))) bad = trial;
    }
    return bad.map(([lit]) => -lit);
  }
  undo(length) { while (this.log.length && this.log[this.log.length - 1].trail >= length) this.faces.get(this.log.pop().face).pop(); }
}

export class Theories {
  constructor(list) { this.list = list; }
  assign(l, trail) { for (const t of this.list) { const c = t.assign(l, trail); if (c) return c; } return null; }
  undo(length) { for (const t of this.list) t.undo(length); }
}

export class CycleTheory {
  constructor(items) {
    this.edges = new Map(items);
    this.parent = [new Map(), new Map()];
    this.adj = [new Map(), new Map()];
    this.log = [];
  }
  find(g, x) { const par = this.parent[g]; let r = x; while (par.has(r)) r = par.get(r); return r; }
  assign(l, trail) {
    const edges = this.edges.get(l);
    if (!edges) return null;
    for (const [g, a, b] of edges) {
      const ra = this.find(g, a), rb = this.find(g, b);
      if (ra === rb) return this.loop(g, a, b, l);
      this.parent[g].set(ra, rb);
      for (const [u, v] of [[a, b], [b, a]]) { if (!this.adj[g].has(u)) this.adj[g].set(u, []); this.adj[g].get(u).push([v, l]); }
      this.log.push({trail, g, a, b, child: ra});
    }
    return null;
  }
  undo(length) {
    while (this.log.length && this.log[this.log.length - 1].trail >= length) {
      const {g, a, b, child} = this.log.pop();
      this.parent[g].delete(child);
      this.adj[g].get(a).pop(); this.adj[g].get(b).pop();
    }
  }
  loop(g, a, b, l) {
    const from = new Map([[a, null]]), queue = [a];
    for (let i = 0; i < queue.length && !from.has(b); i++) for (const [v, lit] of this.adj[g].get(queue[i]) || []) if (!from.has(v)) { from.set(v, [queue[i], lit]); queue.push(v); }
    const clause = new Set([-l]);
    for (let p = b; from.get(p);) { const [u, lit] = from.get(p); clause.add(-lit); p = u; }
    return [...clause];
  }
}

export function countModel(m) {
  for (let j = 0; j < m.cost.length; j++) if (m.integer[j] ? (m.lb[j] < 0 || m.ub[j] > 1) : m.lb[j] > 0) return false;
  for (const row of m.rows) for (const [j, c] of row.entries) if (m.integer[j] && c !== 1 && c !== -1) return false;
  return true;
}

/** `cycles`, `embedding`: the theories' data (model.js cycleItems, embedItems); `boost`: [column, activity] initial activities. */
export function cdclStart(m, {deadline, phase = null, lazy = null, stats = null, cycles = null, embedding = null, boost = null} = {}) {
  if (!countModel(m)) return null;
  const sat = new Sat(), lit = new Int32Array(m.cost.length);
  for (let j = 0; j < m.cost.length; j++) if (m.integer[j]) { lit[j] = sat.newVar(); if (phase) sat.phase[lit[j]] = phase[j] > .5 ? 1 : 0; }
  for (let j = 0; j < m.cost.length; j++) if (m.integer[j] && m.lb[j] >= 1) sat.addClause([lit[j]]);
  for (const row of m.rows) {
    const lits = [];
    let shift = 0;
    for (const [j, c] of row.entries) { if (!m.integer[j]) continue; if (c > 0) lits.push(lit[j]); else { lits.push(-lit[j]); shift++; } }
    const lo = row.lo + shift, hi = row.hi + shift;
    if (lo > lits.length || hi < 0) return null;
    if (hi < lits.length) sat.addAtMost(lits, Math.floor(hi + 1e-9));
    if (lo > 0) sat.addAtLeast(lits, Math.ceil(lo - 1e-9));
    if (!sat.ok) return null;
  }
  const list = [];
  if (cycles) {
    const items = new Map();
    for (const [j, polarity, edges] of cycles) { const l = polarity ? lit[j] : -lit[j]; items.set(l, [...(items.get(l) || []), ...edges]); }
    list.push(new CycleTheory(items));
  }
  if (embedding) {
    const chords = new Map();
    for (const [j, face, pair] of embedding.chords) chords.set(lit[j], [face, pair]);
    list.push(new EmbedTheory(chords, embedding.embeds));
  }
  if (list.length) sat.theory = list.length > 1 ? new Theories(list) : list[0];
  if (boost) for (const [j, a] of boost) { sat.activity[lit[j]] = a; if (sat.heap.has(lit[j])) sat.heap.up(sat.heap.pos[lit[j]]); }
  const seen = new Set();
  for (let round = 0; ; round++) {
    const t0 = performance.now(), c0 = sat.conflicts, res = sat.solve({deadline});
    if (globalThis.EXP_DBG) console.error('cdcl solve', res, 'round', round, 'ms', Math.round(performance.now() - t0), 'conflicts', sat.conflicts - c0);
    if (res !== true) return null;
    const out = new Float64Array(m.cost.length);
    for (let j = 0; j < m.cost.length; j++) if (m.integer[j]) out[j] = sat.modelValue(lit[j]) ? 1 : 0;
    const rows = lazy ? lazy(out) : [];
    let added = 0;
    for (const [kind, terms, rhs] of rows) {
      if (stats) stats[kind] = (stats[kind] || 0) + 1;
      const key = `${kind}|${terms.map(t => t.join(':')).sort().join(',')}|${rhs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (terms.some(([j, c]) => !m.integer[j] || (c !== 1 && c !== -1))) return null;
      const lits = [];
      let shift = 0;
      for (const [j, c] of terms) { if (c > 0) lits.push(lit[j]); else { lits.push(-lit[j]); shift++; } }
      sat.addAtMost(lits, Math.floor(rhs + shift + 1e-9));
      added++;
    }
    if (!sat.ok) return null;
    if (!added) return {values: out, rounds: round + 1, lazyRows: seen.size};
  }
}
