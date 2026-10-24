/** The topological search (the reference solver's sat_weave.TopologySAT and
 * solve): on the outline's structure alone, without geometry, which paper cuts
 * each piece of each edge, where the switches lie in order along it, and which
 * hidden segments pair them, as SAT. Paper A runs top to bottom and B left to
 * right, without cycles; a face's segments must not cross. The fewest segments
 * first, from the combinatorial lower bound up: a witness the exact model can
 * start from, whatever the picture's fitter made of it. */
import {Sat, totalizer} from './sat.js';
import {faceTokens, tokenKey} from './candidates.js';
import {pointKey} from './structure.js';
import {embeddable} from './model.js';
import {cheapBounds} from './bounds.js';

class OutOfTime extends Error {}

class TopologySAT {
  /** `capacity`: the most segments this model can hold; `slots` per edge (a number, or one per edge). */
  constructor(st, capacity, {deadline = Infinity, slots = 2 * capacity, maxChords = 100000} = {}) {
    this.st = st;
    this.capacity = capacity;
    this.deadline = deadline;
    const sat = this.sat = new Sat(), E = st.edges;
    this.q = E.map((_, e) => Array.isArray(slots) ? slots[e] : slots);
    this.faces = faceTokens(st, new Map(E.map((_, e) => [e, new Array(this.q[e]).fill(0)])));
    const estimate = this.faces.reduce((s, f) => { const n = f.flat().length; return s + n * (n - 1) / 2; }, 0);
    if (estimate > maxChords) throw new OutOfTime('too many candidate segments');
    const v = () => sat.newVar();
    this.lab = new Map(); this.active = new Map(); this.side = new Map(); this.arcs = []; this.chords = [];
    const ins = new Map(), outs = new Map(), push = (map, k, x) => { if (!map.has(k)) map.set(k, []); map.get(k).push(x); };
    const choose = (lits, gate = 0) => {  // exactly one when gate holds (or always), none otherwise
      this.atMostOne(lits);
      sat.addClause(gate ? [...lits, -gate] : lits);
      if (gate) for (const l of lits) sat.addClause([-l, gate]);
    };
    const directed = (p, p2, family, gate) => {
      const f = v(), b = v();
      choose([f, b], gate);
      for (const [lit, s0, s1] of [[f, p, p2], [b, p2, p]]) {
        push(outs, `${family}|${s0}`, lit);
        push(ins, `${family}|${s1}`, lit);
        this.arcs.push([family, s0, s1, lit]);
      }
    };
    const point = (e, i) => i === 0 ? `node:${pointKey(E[e].u)}` : i === this.q[e] + 1 ? `node:${pointKey(E[e].v)}` : `slot:${e}:${i}`;
    E.forEach((ed, e) => {
      for (let i = 0; i <= this.q[e]; i++) this.lab.set(`${e},${i}`, v());
      for (let j = 1; j <= this.q[e]; j++) {
        const a = this.lab.get(`${e},${j - 1}`), b = this.lab.get(`${e},${j}`), s = v();
        this.active.set(`${e},${j}`, s);
        for (const cl of [[a, b, -s], [-a, -b, -s], [a, -b, s], [-a, b, s]]) sat.addClause(cl);  // s = a XOR b
        const l = v(), r = v();
        this.side.set(`${e}:${j}:L`, l);
        this.side.set(`${e}:${j}:R`, r);
        choose([l, r], s);
        if (j > 1) sat.addClause([-s, this.active.get(`${e},${j - 1}`)]);  // switches take the first slots
      }
      if (ed.loop) {
        const a = this.lab.get(`${e},0`), b = this.lab.get(`${e},${this.q[e]}`);
        sat.addClause([-a, b]); sat.addClause([a, -b]);
      }
      for (let i = 0; i <= this.q[e]; i++) {
        const g = this.lab.get(`${e},${i}`);
        directed(point(e, i), point(e, i + 1), 'A', g);
        directed(point(e, i), point(e, i + 1), 'B', -g);
      }
    });
    const incidence = new Map();
    this.faces.forEach((cycles, fi) => {
      this.check();
      const flat = cycles.flat();
      for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
        const t1 = flat[i], t2 = flat[j];
        // Two consecutive switches of one edge: the piece between and the segment close a loop.
        if (t1[1] === t2[1] && Math.abs(t1[2] - t2[2]) === 1) continue;
        const x = v(), p = `slot:${t1[1]}:${t1[2]}`, p2 = `slot:${t2[1]}:${t2[2]}`;
        directed(p, p2, 'A', x);
        directed(p, p2, 'B', x);
        this.chords.push({face: fi, t1, t2, x});
        push(incidence, tokenKey(t1), x);
        push(incidence, tokenKey(t2), x);
      }
      for (const t of flat) choose(incidence.get(tokenKey(t)) || [], this.side.get(tokenKey(t)));
      // A segment between two switches with only plain nodes and no switch
      // between them along the face's boundary closes a loop with that run.
      st.faces[fi].runs.forEach((runs, ci) => {
        const items = [];  // slots in order, and true after a run ending at a node a paper cannot pass along the boundary
        for (const [, e, d] of runs) {
          for (let k = 1; k <= this.q[e]; k++) items.push(`${e},${d === 1 ? k : this.q[e] + 1 - k}`);
          const node = st.nodes.get(pointKey(d === 1 ? E[e].v : E[e].u));
          items.push(node?.typ === 'plain');
        }
        const n = items.length, at = new Map(items.map((x, i) => [x, i]).filter(([x]) => typeof x === 'string'));
        for (const c of this.chords) {
          if (c.face !== fi) continue;
          const i = at.get(`${c.t1[1]},${c.t1[2]}`), j = at.get(`${c.t2[1]},${c.t2[2]}`);
          if (i === undefined || j === undefined) continue;
          for (const [from, to] of [[i, j], [j, i]]) {
            const between = [];
            let open = true;
            for (let k = (from + 1) % n; k !== to; k = (k + 1) % n) {
              if (items[k] === false) { open = false; break; }
              if (typeof items[k] === 'string') between.push(this.active.get(items[k]));
            }
            if (open) sat.addClause([-c.x, ...between]);
          }
        }
        void ci;
      });
      // A face without holes: two segments whose ends alternate around it cross.
      if (cycles.length === 1) {
        const at = new Map(flat.map((t, i) => [tokenKey(t), i])), mine = this.chords.filter(c => c.face === fi);
        const span = mine.map(c => [at.get(tokenKey(c.t1)), at.get(tokenKey(c.t2))].sort((a, b) => a - b));
        if (mine.length * mine.length < 4e6) for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
          const [a, b] = span[i], [c, d] = span[j];
          if (a === c || a === d || b === c || b === d) continue;
          if ((a < c && c < b) !== (a < d && d < b)) sat.addClause([-mine[i].x, -mine[j].x]);
        }
      }
    });
    const points = new Set([...ins.keys(), ...outs.keys()].map(k => k.slice(2)));
    for (const p of points) {
      this.check();
      const node = p.startsWith('node:') ? st.nodes.get(p.slice(5)) : null;
      for (const family of ['A', 'B']) {
        const I = ins.get(`${family}|${p}`) || [], O = outs.get(`${family}|${p}`) || [];
        if (node?.typ === 'end') {
          const correct = family === ('TB'.includes(node.side) ? 'A' : 'B');
          for (const [lits, enabled] of [[I, correct && 'BR'.includes(node.side)], [O, correct && 'TL'.includes(node.side)]]) {
            if (enabled) choose(lits);
            else for (const l of lits) sat.addClause([-l]);
          }
        } else if (node?.typ === 'touch') {
          choose(I);
          choose(O);
        } else {
          const gate = v();  // the family passes here, or not at all
          choose(I, gate);
          choose(O, gate);
        }
      }
    }
    this.bound = totalizer(sat, [...this.active.values()], 2 * capacity + 1);
  }

  check() { if (performance.now() > this.deadline) throw new OutOfTime('deadline'); }

  /** Starts the search at a template's reading: each edge's papers, switches
   * (its first slots) and sides, and its segments, as the solver's phases. */
  hint({words, labels, pairs}) {
    const phase = (lit, on) => { this.sat.phase[lit] = on ? 1 : 0; };
    this.st.edges.forEach((_, e) => {
      const m = (words.get(e) || []).length;
      for (let i = 0; i <= this.q[e]; i++) phase(this.lab.get(`${e},${i}`), labels.get(`${e},${Math.min(i, m)}`));
      for (let j = 1; j <= this.q[e]; j++) {
        phase(this.active.get(`${e},${j}`), j <= m);
        for (const side of ['L', 'R']) phase(this.side.get(`${e}:${j}:${side}`), j <= m && words.get(e)[j - 1] === side);
      }
    });
    const wanted = new Set(pairs.map(([a, b]) => [tokenKey(a), tokenKey(b)].sort().join('|')));
    for (const c of this.chords) phase(c.x, wanted.has([tokenKey(c.t1), tokenKey(c.t2)].sort().join('|')));
  }

  atMostOne(lits) {
    const sat = this.sat;
    if (lits.length <= 5) {
      for (let i = 0; i < lits.length; i++) for (let j = i + 1; j < lits.length; j++) sat.addClause([-lits[i], -lits[j]]);
      return;
    }
    // Sequential counter: s[i] holds once one of lits[0..i] does.
    let prev = 0;
    lits.forEach((l, i) => {
      if (i === lits.length - 1) { if (prev) sat.addClause([-l, -prev]); return; }
      const s = sat.newVar();
      sat.addClause([-l, s]);
      if (prev) { sat.addClause([-prev, s]); sat.addClause([-l, -prev]); }
      prev = s;
    });
  }

  /** The lazy rules the last model breaks, as clauses: a paper's arcs closing
   * a cycle, and a face's segments that cannot all be drawn inside it. */
  cuts() {
    const on = l => this.sat.modelValue(l), cuts = [];
    for (const family of ['A', 'B']) {
      const next = new Map();
      for (const [f, a, b, lit] of this.arcs) if (f === family && on(lit)) next.set(a, [b, lit]);
      const done = new Set();
      for (const start of next.keys()) {
        const path = [], at = new Map();
        let p = start;
        while (next.has(p) && !done.has(p) && !at.has(p)) { at.set(p, path.length); path.push(next.get(p)[1]); p = next.get(p)[0]; }
        if (at.has(p)) cuts.push(path.slice(at.get(p)).map(l => -l));
        for (const q of at.keys()) done.add(q);
      }
    }
    const byFace = new Map();
    for (const c of this.chords) if (on(c.x)) { if (!byFace.has(c.face)) byFace.set(c.face, []); byFace.get(c.face).push(c); }
    for (const [fi, chords] of byFace) {
      const cycles = this.faces[fi].map(cycle => cycle.map(tokenKey)), pairs = cs => cs.map(c => [tokenKey(c.t1), tokenKey(c.t2)]);
      if (embeddable(cycles, pairs(chords))) continue;
      let bad = [...chords];
      for (const c of chords) { const trial = bad.filter(d => d !== c); if (!embeddable(cycles, pairs(trial))) bad = trial; }
      cuts.push(bad.map(c => -c.x));
    }
    return cuts;
  }

  witness() {
    const on = l => this.sat.modelValue(l), value = l => (on(l) ? 1 : 0), used = this.chords.filter(c => on(c.x));
    return {h: used.length, q: this.q, lab: new Map([...this.lab].map(([k, l]) => [k, value(l)])),
      side: new Map([...this.side].map(([k, l]) => [k, value(l)])), chords: used.map(c => ({face: c.face, t1: c.t1, t2: c.t2}))};
  }

  /** A witness under `assumptions` and the lazy rules, or null (this.sat.core then says why). */
  search(assumptions) {
    for (;;) {
      this.check();
      const r = this.sat.solve({assumptions, deadline: this.deadline});
      if (r === null) throw new OutOfTime('deadline');
      if (!r) return null;
      const cuts = this.cuts();
      if (!cuts.length) return this.witness();
      for (const cl of cuts) this.sat.addClause(cl);
    }
  }

  /** A witness with at most h segments (any, for h = Infinity), or null when there is none. */
  query(h = Infinity) {
    return this.search(2 * h < this.bound.length ? [-this.bound[2 * h]] : []);
  }

  /** A witness keeping as much of a template's reading as it can: its choices
   * held as assumptions; those in a conflict let go until the rules hold (a
   * repair where the template is broken). */
  repair(hint) {
    const {words, labels, pairs} = hint, held = [], edgeOf = new Map();
    const hold = (lit, on, edges) => { const l = on ? lit : -lit; held.push(l); edgeOf.set(Math.abs(l), edges); };
    this.st.edges.forEach((_, e) => {
      const m = (words.get(e) || []).length;
      if (m > this.q[e]) return;
      for (let i = 0; i <= this.q[e]; i++) hold(this.lab.get(`${e},${i}`), labels.get(`${e},${Math.min(i, m)}`), [e]);
      for (let j = 1; j <= this.q[e]; j++) {
        hold(this.active.get(`${e},${j}`), j <= m, [e]);
        if (j <= m) hold(this.side.get(`${e}:${j}:${words.get(e)[j - 1]}`), true, [e]);
      }
    });
    const wanted = new Set(pairs.map(([a, b]) => [tokenKey(a), tokenKey(b)].sort().join('|')));
    for (const c of this.chords) if (wanted.has([tokenKey(c.t1), tokenKey(c.t2)].sort().join('|'))) hold(c.x, true, [c.t1[1], c.t2[1]]);
    let active = held;
    for (;;) {
      const found = this.search(active);
      if (found) return {...found, released: held.length - active.length, held: held.length};
      const core = this.sat.core || [];
      if (!core.length || !active.length) return null;
      // Let go of the choice found false, only: a conflict's reasons run along
      // the papers' flows through most of the outline.
      active = active.filter(l => l !== core[0]);
    }
  }
}

/** A witness by `deadline`, as few segments as found: {witness, h, bound} or
 * {error}. A start for the exact model needs any witness, which then minimises
 * the count itself, so the model is kept small (sat_weave's compact search):
 * few switch slots per edge, more only when that is unsatisfiable; then fewer
 * segments while time allows (`tighten` of what is left). */
export function topologicalWitness(st, {deadline = Infinity, tighten = .5, hint = null} = {}) {
  const bounds = cheapBounds(st);
  if (bounds.impossible) return {error: 'The outline ends unevenly on opposite sides.'};
  const E = st.edges.length, t0 = performance.now();
  // With a template's reading, each edge gets its switches and two more.
  const most = hint ? Math.max(0, ...[...hint.words.values()].map(w => w.length)) : 0;
  for (const extra of [2, 4, 8, 16]) {
    const slots = hint ? st.edges.map((_, e) => (hint.words.get(e) || []).length + extra) : extra;
    try {
      const model = new TopologySAT(st, Math.min(64, Math.ceil((hint ? most + extra : extra) * E / 2)), {deadline, slots});
      if (hint) model.hint(hint);
      let best = hint ? model.repair(hint) : model.query();
      if (!best) continue;
      const until = performance.now() + tighten * Math.max(0, deadline - performance.now());
      model.deadline = Math.min(deadline, until);
      try {
        for (let h = best.h - 1; h >= bounds.lb; h--) {
          const fewer = model.query(h);
          if (!fewer) break;
          best = fewer;
          h = Math.min(h, best.h);
        }
      } catch (error) {
        if (!(error instanceof OutOfTime)) throw error;
      }
      return {witness: best, h: best.h, bound: bounds.lb, slots: extra, seconds: (performance.now() - t0) / 1000};
    } catch (error) {
      if (error instanceof OutOfTime) return {error: `The topological search ran out of time (${error.message}).`};
      throw error;
    }
  }
  return {error: 'No topological witness with up to 16 switches an edge.'};
}

/** The full witness of given switches and segments (a template's reading, or
 * the grid search's), the papers found by SAT under the same rules: each edge
 * gets exactly its switches, all of them used, and exactly these segments.
 * {witness} with lab, side, chords, or {error} when they admit no papers.
 * `labels` (as the reader's 'e,i' map), when given, are only a hint. */
export function completeWitness(st, {words, pairs, labels = null}, {deadline = Infinity} = {}) {
  try {
    const slots = st.edges.map((_, e) => (words.get(e) || []).length);
    const model = new TopologySAT(st, Math.max(1, pairs.length), {deadline, slots});
    if (labels) model.hint({words, labels, pairs});
    const held = [];
    st.edges.forEach((_, e) => (words.get(e) || []).forEach((side, j) => {
      held.push(model.active.get(`${e},${j + 1}`), model.side.get(`${e}:${j + 1}:${side}`));
    }));
    const wanted = new Set(pairs.map(([a, b]) => [tokenKey(a), tokenKey(b)].sort().join('|')));
    for (const c of model.chords) held.push(wanted.has([tokenKey(c.t1), tokenKey(c.t2)].sort().join('|')) ? c.x : -c.x);
    const witness = model.search(held);
    return witness ? {witness} : {error: 'These switches and segments admit no papers.'};
  } catch (error) {
    if (error instanceof OutOfTime) return {error: `Completing the witness ran out of time (${error.message}).`};
    throw error;
  }
}
