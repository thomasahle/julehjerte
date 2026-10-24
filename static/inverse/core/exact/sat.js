/** A small CDCL SAT solver in MiniSat's design: two watched literals, VSIDS
 * with phase saving, first-UIP learning with clause minimisation, Luby
 * restarts and learnt-clause reduction. Incremental: clauses may be added
 * between solves, and a solve takes assumptions. Literals are nonzero
 * integers, DIMACS style (v true, -v false). */
const index = l => (l > 0 ? 2 * l : -2 * l + 1);

class VarHeap {
  constructor(activity) {
    this.activity = activity;
    this.heap = [];
    this.pos = [];
  }
  has(v) { return (this.pos[v] ?? -1) >= 0; }
  empty() { return !this.heap.length; }
  insert(v) {
    if (this.has(v)) return;
    this.pos[v] = this.heap.length;
    this.heap.push(v);
    this.up(this.heap.length - 1);
  }
  pop() {
    const top = this.heap[0], last = this.heap.pop();
    this.pos[top] = -1;
    if (this.heap.length) { this.heap[0] = last; this.pos[last] = 0; this.down(0); }
    return top;
  }
  up(i) {
    const h = this.heap, a = this.activity, v = h[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[h[p]] >= a[v]) break;
      h[i] = h[p]; this.pos[h[i]] = i; i = p;
    }
    h[i] = v; this.pos[v] = i;
  }
  down(i) {
    const h = this.heap, a = this.activity, v = h[i], n = h.length;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && a[h[c + 1]] > a[h[c]]) c++;
      if (a[h[c]] <= a[v]) break;
      h[i] = h[c]; this.pos[h[i]] = i; i = c;
    }
    h[i] = v; this.pos[v] = i;
  }
}

const luby = i => {  // 1 1 2 1 1 2 4 1 1 2 1 1 2 4 8 ...
  let size = 1, seq = 0;
  while (size < i + 1) { seq++; size = 2 * size + 1; }
  while (size - 1 !== i) { size = (size - 1) >> 1; seq--; i %= size; }
  return 2 ** seq;
};

export class Sat {
  constructor() {
    this.n = 0;
    this.assign = [0];  // per variable: 1 true, -1 false, 0 unassigned
    this.level = [0];
    this.reason = [-1];
    this.activity = [0];
    this.phase = [0];
    this.seen = [0];
    this.watches = [[], []];
    this.clauses = [];  // {lits: Int32Array, learnt, act, deleted}
    this.learnts = 0;
    this.trail = [];
    this.lim = [];
    this.qhead = 0;
    this.heap = new VarHeap(this.activity);
    this.varInc = 1;
    this.claInc = 1;
    this.ok = true;
    this.model = null;
    this.conflicts = 0;
  }

  newVar() {
    const v = ++this.n;
    this.assign.push(0); this.level.push(0); this.reason.push(-1); this.activity.push(0); this.phase.push(0); this.seen.push(0);
    this.watches.push([], []);
    this.heap.insert(v);
    return v;
  }

  value(l) { const a = this.assign[l > 0 ? l : -l]; return l > 0 ? a : -a; }
  /** A literal's value in the last model: true or false. */
  modelValue(l) { const a = this.model[l > 0 ? l : -l]; return (l > 0 ? a : -a) > 0; }
  get decisionLevel() { return this.lim.length; }

  /** Adds a clause; false once the clauses are unsatisfiable. */
  addClause(input) {
    if (!this.ok) return false;
    this.cancelUntil(0);
    const lits = [], seen = new Set();
    for (const l of input) {
      if (seen.has(-l) || this.value(l) === 1) return true;  // a tautology, or satisfied for good
      if (seen.has(l) || this.value(l) === -1) continue;
      seen.add(l);
      lits.push(l);
    }
    if (!lits.length) return (this.ok = false);
    if (lits.length === 1) {
      this.enqueue(lits[0], -1);
      if (this.propagate() >= 0) this.ok = false;
      return this.ok;
    }
    this.attach(Int32Array.from(lits), false);
    return true;
  }

  attach(lits, learnt) {
    const c = this.clauses.length;
    this.clauses.push({lits, learnt, act: 0, deleted: false});
    this.watches[index(lits[0])].push(c);
    this.watches[index(lits[1])].push(c);
    if (learnt) this.learnts++;
    return c;
  }

  enqueue(l, reason) {
    const v = l > 0 ? l : -l;
    this.assign[v] = l > 0 ? 1 : -1;
    this.level[v] = this.decisionLevel;
    this.reason[v] = reason;
    this.trail.push(l);
  }

  /** Unit propagation: the conflicting clause, or -1. */
  propagate() {
    const {clauses, watches} = this;
    while (this.qhead < this.trail.length) {
      const p = this.trail[this.qhead++], f = -p, ws = watches[index(f)];
      let i = 0, j = 0;
      while (i < ws.length) {
        const c = ws[i++], cl = clauses[c];
        if (cl.deleted) continue;
        const lits = cl.lits;
        if (lits[0] === f) { lits[0] = lits[1]; lits[1] = f; }
        if (this.value(lits[0]) === 1) { ws[j++] = c; continue; }
        let moved = false;
        for (let k = 2; k < lits.length; k++) {
          if (this.value(lits[k]) !== -1) {
            lits[1] = lits[k]; lits[k] = f;
            watches[index(lits[1])].push(c);
            moved = true;
            break;
          }
        }
        if (moved) continue;
        ws[j++] = c;
        if (this.value(lits[0]) === -1) {
          while (i < ws.length) ws[j++] = ws[i++];
          ws.length = j;
          this.qhead = this.trail.length;
          return c;
        }
        this.enqueue(lits[0], c);
      }
      ws.length = j;
    }
    return -1;
  }

  bumpVar(v) {
    if ((this.activity[v] += this.varInc) > 1e100) {
      for (let u = 1; u <= this.n; u++) this.activity[u] *= 1e-100;
      this.varInc *= 1e-100;
    }
    if (this.heap.has(v)) this.heap.up(this.heap.pos[v]);
  }

  bumpClause(cl) {
    if ((cl.act += this.claInc) > 1e20) {
      for (const c of this.clauses) if (c.learnt) c.act *= 1e-20;
      this.claInc *= 1e-20;
    }
  }

  /** First-UIP learning: [learnt clause, backjump level]. */
  analyze(confl) {
    const {seen, level, reason, trail} = this, learnt = [0];
    let pathC = 0, p = 0, i = trail.length - 1;
    do {
      const cl = this.clauses[confl];
      if (cl.learnt) this.bumpClause(cl);
      for (let k = p === 0 ? 0 : 1; k < cl.lits.length; k++) {
        const q = cl.lits[k], v = q > 0 ? q : -q;
        if (!seen[v] && level[v] > 0) {
          this.bumpVar(v);
          seen[v] = 1;
          if (level[v] >= this.decisionLevel) pathC++;
          else learnt.push(q);
        }
      }
      while (!seen[trail[i] > 0 ? trail[i] : -trail[i]]) i--;
      p = trail[i--];
      const v = p > 0 ? p : -p;
      confl = reason[v];
      seen[v] = 0;
      pathC--;
    } while (pathC > 0);
    learnt[0] = -p;
    // Minimisation: a literal implied by the others' negations goes.
    const out = [learnt[0]];
    for (let k = 1; k < learnt.length; k++) {
      const v = learnt[k] > 0 ? learnt[k] : -learnt[k], r = reason[v];
      if (r < 0) { out.push(learnt[k]); continue; }
      const lits = this.clauses[r].lits;
      let redundant = true;
      for (let m = 1; m < lits.length; m++) {
        const u = lits[m] > 0 ? lits[m] : -lits[m];
        if (!seen[u] && level[u] > 0) { redundant = false; break; }
      }
      if (!redundant) out.push(learnt[k]);
    }
    for (let k = 1; k < learnt.length; k++) seen[learnt[k] > 0 ? learnt[k] : -learnt[k]] = 0;
    let back = 0;
    if (out.length > 1) {
      let best = 1;
      for (let k = 2; k < out.length; k++) if (level[Math.abs(out[k])] > level[Math.abs(out[best])]) best = k;
      [out[1], out[best]] = [out[best], out[1]];
      back = level[Math.abs(out[1])];
    }
    return [out, back];
  }

  cancelUntil(lvl) {
    if (this.decisionLevel <= lvl) return;
    for (let c = this.trail.length - 1; c >= this.lim[lvl]; c--) {
      const l = this.trail[c], v = l > 0 ? l : -l;
      this.assign[v] = 0;
      this.reason[v] = -1;
      this.phase[v] = l > 0 ? 1 : 0;
      this.heap.insert(v);
    }
    this.trail.length = this.lim[lvl];
    this.lim.length = lvl;
    this.qhead = this.trail.length;
  }

  /** Half of the learnt clauses, the least active not locked as reasons, go. */
  reduce() {
    const learnt = [];
    this.clauses.forEach((cl, c) => {
      if (!cl.learnt || cl.deleted || cl.lits.length <= 2) return;
      const v = Math.abs(cl.lits[0]);
      if (this.reason[v] === c && this.value(cl.lits[0]) === 1) return;
      learnt.push(c);
    });
    learnt.sort((a, b) => this.clauses[a].act - this.clauses[b].act);
    for (const c of learnt.slice(0, learnt.length >> 1)) { this.clauses[c].deleted = true; this.learnts--; }
  }

  /** The assumptions that forced assumption p false (MiniSat's analyzeFinal), p included. */
  analyzeFinal(p) {
    const {seen, reason, trail} = this, core = [p], v0 = Math.abs(p);
    if (this.decisionLevel === 0) return core;
    seen[v0] = 1;
    for (let i = trail.length - 1; i >= this.lim[0]; i--) {
      const l = trail[i], v = Math.abs(l);
      if (!seen[v]) continue;
      if (reason[v] < 0) core.push(l);
      else for (const q of this.clauses[reason[v]].lits.subarray(1)) if (this.level[Math.abs(q)] > 0) seen[Math.abs(q)] = 1;
      seen[v] = 0;
    }
    seen[v0] = 0;
    return core;
  }

  /** true (a model in this.model), false (unsatisfiable under the
   * assumptions; this.core then holds the assumptions responsible), or null
   * when `deadline` (performance.now()) passes. */
  solve({assumptions = [], deadline = Infinity} = {}) {
    this.core = null;
    if (!this.ok) return false;
    this.cancelUntil(0);
    if (this.propagate() >= 0) return (this.ok = false);
    let restart = 0, budget = 100 * luby(restart), maxLearnts = Math.max(1000, this.clauses.length / 3);
    for (let tick = 0; ; tick++) {
      const confl = this.propagate();
      if (confl >= 0) {
        this.conflicts++;
        if (this.decisionLevel === 0) { this.ok = false; return false; }
        const [learnt, back] = this.analyze(confl);
        this.cancelUntil(back);
        if (learnt.length === 1) this.enqueue(learnt[0], -1);
        else { const c = this.attach(Int32Array.from(learnt), true); this.bumpClause(this.clauses[c]); this.enqueue(learnt[0], c); }
        this.varInc /= .95;
        this.claInc /= .999;
        if (--budget <= 0) { this.cancelUntil(0); budget = 100 * luby(++restart); }
        if ((this.conflicts & 63) === 0 && performance.now() > deadline) { this.cancelUntil(0); return null; }
        continue;
      }
      if ((tick & 1023) === 0 && performance.now() > deadline) { this.cancelUntil(0); return null; }
      if (this.learnts - this.trail.length >= maxLearnts) { this.reduce(); maxLearnts *= 1.1; }
      let next = 0;
      while (this.decisionLevel < assumptions.length) {
        const p = assumptions[this.decisionLevel];
        if (this.value(p) === 1) { this.lim.push(this.trail.length); continue; }
        if (this.value(p) === -1) { this.core = this.analyzeFinal(p); this.cancelUntil(0); return false; }
        next = p;
        break;
      }
      if (!next) {
        let v = 0;
        while (!this.heap.empty()) { const u = this.heap.pop(); if (this.assign[u] === 0) { v = u; break; } }
        if (!v) { this.model = Int8Array.from(this.assign); this.cancelUntil(0); return true; }
        next = this.phase[v] ? v : -v;
      }
      this.lim.push(this.trail.length);
      this.enqueue(next, -1);
    }
  }
}

/** A totalizer over `lits`: outputs[k] true whenever at least k + 1 of them
 * are, for k < `bound`; assuming -outputs[k] then allows at most k. */
export function totalizer(sat, lits, bound) {
  const build = xs => {
    if (xs.length === 1) return xs;
    const mid = xs.length >> 1, a = build(xs.slice(0, mid)), b = build(xs.slice(mid));
    const size = Math.min(bound, a.length + b.length), out = Array.from({length: size}, () => sat.newVar());
    for (let i = 0; i <= a.length; i++) for (let j = 0; j <= b.length; j++) {
      const k = i + j;
      if (k === 0 || k > size) continue;
      const clause = [out[k - 1]];
      if (i) clause.push(-a[i - 1]);
      if (j) clause.push(-b[j - 1]);
      sat.addClause(clause);
    }
    return out;
  };
  return lits.length ? build(lits) : [];
}
