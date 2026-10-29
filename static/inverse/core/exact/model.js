/** The positional MILP of the exact-outline search (the reference solver's
 * sat_length.LengthModel with sat_exact.ExactModel's rules), on the app's
 * LinearModel and HiGHS WebAssembly.
 *
 * Variables: which paper cuts each run of each edge (lab), which positions
 * switch (sw) and to which side (side), which candidate hidden segments are used
 * (x), and per paper the directions it takes along runs and segments (arcs).
 * The rules are rows (or rows with a penalised slack, for a start that breaks
 * them), checked again exactly on each solution and added lazily, as are cuts
 * of a detached loop or a slit joining the wrong borders. */
import {LinearModel, solverRuntime} from '../solver.js';
import {pointKey} from './structure.js';
import {tokenKey} from './candidates.js';
import {geometryNogoods, nogoodKey} from './nogoods.js';

/** HiGHS presolve rules left out (its presolve_rule_off bits): dependent free
 * columns (11), parallel rows and columns (13), sparsify (14), probing (15) and
 * enumeration (16). On some models presolve spent 41 s in them, beyond its own
 * time limit, which it checks only between passes (amy-weave-1: 44 s, now
 * 2 s); on the others they took seconds and changed no template. */
const SLOW_PRESOLVE_RULES = (1 << 11) | (1 << 13) | (1 << 14) | (1 << 15) | (1 << 16);

/** Whether a face's hidden segments can be drawn without crossing (sat_weave.embeddable). */
export function embeddable(cycles, pairs) {
  let rings = cycles.map(c => [...c]);
  const owner = new Map();
  rings.forEach((ring, i) => ring.forEach(t => owner.set(t, i)));
  const rest = [...pairs];
  for (;;) {
    const at = rest.findIndex(([a, b]) => owner.get(a) !== owner.get(b));
    if (at < 0) break;
    const [a, b] = rest[at], i = owner.get(a), j = owner.get(b), x = rings[i], y = rings[j];
    const ai = x.indexOf(a), bi = y.indexOf(b);
    rings[i] = [...x.slice(ai + 1), ...x.slice(0, ai + 1), ...y.slice(bi + 1), ...y.slice(0, bi + 1)];
    rings[j] = [];
    for (const t of rings[i]) owner.set(t, i);
    rest.splice(at, 1);
  }
  const position = new Map();
  for (const ring of rings) ring.forEach((t, i) => position.set(t, i));
  for (let u = 0; u < rest.length; u++) for (let v = u + 1; v < rest.length; v++) {
    const [a, b] = rest[u], [c, d] = rest[v];
    if (owner.get(a) !== owner.get(c)) continue;
    const [lo, hi] = [position.get(a), position.get(b)].sort((p, q) => p - q);
    if ((lo < position.get(c) && position.get(c) < hi) !== (lo < position.get(d) && position.get(d) < hi)) return false;
  }
  return true;
}

/** A greedy clique cover of the graph with edges `edges` ([a, b] pairs of
 * keys): maximal cliques, each started from a pair no clique covers yet,
 * grown by the vertex covering most new pairs. */
export function cliqueCover(edges) {
  const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const [a, b] of edges) { link(a, b); link(b, a); }
  const covered = new Set(), key = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`, out = [];
  for (const u of [...adj.keys()].sort((a, b) => adj.get(b).size - adj.get(a).size)) {
    for (const v of adj.get(u)) {
      if (covered.has(key(u, v))) continue;
      const clique = [u, v];
      let open = [...adj.get(u)].filter(w => w !== v && adj.get(v).has(w));
      while (open.length) {
        let best = open[0], score = -1;
        for (const w of open) { const s = clique.reduce((n, c) => n + !covered.has(key(c, w)), 0); if (s > score) { best = w; score = s; } }
        clique.push(best);
        open = open.filter(w => w !== best && adj.get(best).has(w));
      }
      for (let i = 0; i < clique.length; i++) for (let j = i + 1; j < clique.length; j++) covered.add(key(clique[i], clique[j]));
      out.push(clique);
    }
  }
  return out;
}

/** The share of the length stage a solution keeping every rule may stand
 * unimproved before it stops (the count stage's is a quarter). */
const LENGTH_PATIENCE = .1;

export class ExactModel {
  constructor({st, outline, cand, h = 0, statics = [], soft = new Set(), penalty = 1000, fallback = new Map(), paper = [], paperPenalty = 50, ties = []}) {
    this.st = st;
    this.outline = outline;
    this.cand = cand;
    this.penalty = penalty;
    this.paperPenalty = paperPenalty;
    const m = this.m = new LinearModel(), E = st.edges, positions = cand.positions;
    const q = this.q = E.map((_, e) => (positions.get(e) || []).length);
    const bin = (cost = 0) => m.variable({cost, binary: true});
    const lab = this.lab = new Map(), sw = this.sw = new Map(), side = this.side = new Map();
    // Where each kind of row starts, for broken(): which rules a start breaks.
    const sections = this.sections = [], section = name => sections.push([name, m.rows.length]);
    section('switches');
    E.forEach((ed, e) => { for (let i = 0; i <= q[e]; i++) lab.set(`${e},${i}`, bin()); });
    E.forEach((ed, e) => {
      for (let j = 1; j <= q[e]; j++) {
        const a = lab.get(`${e},${j - 1}`), b = lab.get(`${e},${j}`), s = bin();
        sw.set(`${e},${j}`, s);
        m.row([[s, 1], [a, -1], [b, 1]], 0, Infinity);  // s = a XOR b
        m.row([[s, 1], [a, 1], [b, -1]], 0, Infinity);
        m.row([[s, 1], [a, -1], [b, -1]], -Infinity, 0);
        m.row([[s, 1], [a, 1], [b, 1]], -Infinity, 2);
        const l = bin(), r = bin();
        side.set(`${e}:${j}:L`, l);
        side.set(`${e}:${j}:R`, r);
        m.row([[l, 1], [r, 1], [s, -1]], 0, 0);
      }
      if (ed.loop) m.row([[lab.get(`${e},0`), 1], [lab.get(`${e},${q[e]}`), -1]], 0, 0);
    });
    section('arcs');
    // Directed paper flows: sources on the top / left border, sinks opposite.
    const ins = new Map(), outs = new Map(), arcs = [], push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
    const directed = (p, p2, family, gate, sign = 1) => {
      const f = bin(), b = bin();
      if (sign === 1) m.row([[f, 1], [b, 1], [gate, -1]], 0, 0);
      else m.row([[f, 1], [b, 1], [gate, 1]], 1, 1);  // f + b = 1 - gate
      for (const [v, s0, s1] of [[f, p, p2], [b, p2, p]]) {
        push(outs, `${family}|${s0}`, v);
        push(ins, `${family}|${s1}`, v);
        arcs.push([family, s0, s1, v]);
      }
      return [f, b];
    };
    this.point = (e, i) => i === 0 ? `node:${pointKey(E[e].u)}` : i === q[e] + 1 ? `node:${pointKey(E[e].v)}` : `slot:${e}:${i}`;
    this.segArcs = new Map();
    E.forEach((_, e) => {
      for (let i = 0; i <= q[e]; i++) {
        const g = lab.get(`${e},${i}`), p = this.point(e, i), p2 = this.point(e, i + 1);
        this.segArcs.set(`${e},${i}`, [...directed(p, p2, 'A', g), ...directed(p, p2, 'B', g, -1)]);
      }
    });
    section('segments');
    // Hidden segments: the candidates, and uncuttable ones a start needs (penalised).
    this.chordArcs = new Map();
    const x = this.x = new Map(), incident = new Map(), keys = [...cand.cost.keys(), ...[...fallback.keys()].filter(k => !cand.cost.has(k))];
    this.invalid = new Set(fallback.keys());
    this.costOf = new Map();
    for (const key of keys) {
      const c = cand.cost.has(key) ? cand.cost.get(key) : penalty + fallback.get(key), v = bin(c);
      x.set(key, v);
      this.costOf.set(key, c);
      const [, t1, t2] = cand.pair.get(key);
      push(incident, tokenKey(t1), v);
      push(incident, tokenKey(t2), v);
      if (t1[1] === t2[1]) {
        // Two switches of one edge joined need a switch between them, or the run
        // between closes a loop with the segment (a closed curve has two such runs).
        const e = t1[1], [lo, hi] = [t1[2], t2[2]].sort((a, b) => a - b), runs = [[]];
        for (let j = lo + 1; j < hi; j++) runs[0].push(j);
        if (E[e].loop) runs.push(Array.from({length: q[e]}, (_, k) => k + 1).filter(j => j < lo || j > hi));
        for (const run of runs) m.row([[v, 1], ...run.map(j => [sw.get(`${e},${j}`), -1])], -Infinity, 0);
      }
      const p = `slot:${t1[1]}:${t1[2]}`, p2 = `slot:${t2[1]}:${t2[2]}`;
      this.chordArcs.set(key, [...directed(p, p2, 'A', v), ...directed(p, p2, 'B', v)]);
    }
    section('tokens');
    for (const t of cand.faceOf.keys()) m.row([...(incident.get(t) || []).map(v => [v, 1]), [side.get(t), -1]], 0, 0);
    section('count');
    this.countRow = m.rows.length;
    this.h = h;
    m.row([...x.values()].map(v => [v, 1]), h, Infinity);
    section('flows');
    const nodes = st.nodes, points = new Set([...ins.keys(), ...outs.keys()].map(k => k.slice(2)));
    for (const p of points) {
      const node = p.startsWith('node:') ? nodes.get(p.slice(5)) : null;
      for (const family of ['A', 'B']) {
        const I = (ins.get(`${family}|${p}`) || []).map(v => [v, 1]), O = (outs.get(`${family}|${p}`) || []).map(v => [v, 1]);
        if (node && node.typ === 'end') {
          const correct = family === ('TB'.includes(node.side) ? 'A' : 'B'), sink = 'BR'.includes(node.side);
          m.row(I, +(correct && sink), +(correct && sink));
          m.row(O, +(correct && !sink), +(correct && !sink));
        } else if (node && node.typ === 'touch') {
          m.row(I, 1, 1);
          m.row(O, 1, 1);
        } else {
          m.row([...I, ...O.map(([v]) => [v, -1])], 0, 0);
          m.row(I, -Infinity, 1);
        }
      }
    }
    this.arcs = arcs;
    this.entering = new Map();
    for (const [family, s0, s1, v] of arcs) push(this.entering, `${family}|${s1}`, [s0, v]);
    this.connected = new Set();
    section('crossings');
    // Segments joining one boundary cycle of a face at interleaved points cross,
    // in any face (each cuts the face in two, the other's ends one on either
    // side): exclusive. (Between cycles, which ways they wind decides:
    // violations() finds those lazily.)
    const byFace = new Map();
    for (const key of x.keys()) push(byFace, cand.pair.get(key)[0], key);
    for (const [fi, all] of byFace) for (const cycle of cand.faces[fi]) {
      const ring = new Map(cycle.map((t, i) => [tokenKey(t), i])), at = new Map();
      const fkeys = all.filter(key => { const [, a, b] = cand.pair.get(key); return ring.has(tokenKey(a)) && ring.has(tokenKey(b)); });
      for (const key of fkeys) { const [, a, b] = cand.pair.get(key); push(at, tokenKey(a), key); push(at, tokenKey(b), key); }
      for (const key of fkeys) {
        const [, a, b] = cand.pair.get(key), [lo, hi] = [ring.get(tokenKey(a)), ring.get(tokenKey(b))].sort((u, w) => u - w);
        const inside = new Set([...ring].filter(([, i]) => lo < i && i < hi).map(([t]) => t));
        const near = 2 * inside.size <= ring.size - 2 ? inside : new Set([...ring.keys()].filter(t => !inside.has(t) && t !== tokenKey(a) && t !== tokenKey(b)));
        for (const t of near) {
          const crossing = (at.get(t) || []).filter(c => {
            const [, c1, c2] = cand.pair.get(c), k1 = tokenKey(c1), k2 = tokenKey(c2);
            return inside.has(k1) !== inside.has(k2) && ![k1, k2].includes(tokenKey(a)) && ![k1, k2].includes(tokenKey(b));
          });
          if (crossing.length) m.row([[x.get(key), 1], ...crossing.map(c => [x.get(c), 1])], -Infinity, 1);
        }
      }
    }
    section('annulus');
    // A face with one hole: segments between its two boundary cycles embed
    // exactly when they keep their order around the hole. Unrolled (an inner
    // position, plus the inner cycle's length once the order wraps), they grow
    // along the outer cycle and span less than one turn: a position per outer
    // token, a wrap bit, two rows per segment. (Lazily, starcircle's ring took
    // a run per obstruction of three.)
    this.annuli = [];
    for (const [fi, all] of byFace) {
      const cycles = cand.faces[fi].map(c => c.map(tokenKey));
      if (cycles.length !== 2 || cycles.some(c => c.length < 3)) continue;
      const rings = cycles.map(c => new Map(c.map((t, i) => [t, i]))), n = cycles[0].length, len = cycles[1].length;
      const between = [];
      for (const key of all) {
        const [, a, b] = cand.pair.get(key);
        let [ka, kb] = [tokenKey(a), tokenKey(b)];
        if (rings[1].has(ka)) [ka, kb] = [kb, ka];
        if (rings[0].has(ka) && rings[1].has(kb)) between.push([key, rings[0].get(ka), rings[1].get(kb)]);
      }
      if (between.length < 3) continue;
      // Which way the inner cycle runs against the outer, as embeddable() reads them.
      const same = embeddable(cycles, [0, 1, 2].map(i => [cycles[0][i], cycles[1][i]]));
      const U = cycles[0].map(() => m.variable({cost: 0, lo: 0, hi: 2 * len})), wrap = new Map(), M = 3 * len, segments = [];
      for (let j = 1; j < n; j++) m.row([[U[j], 1], [U[j - 1], -1]], 0, Infinity);
      m.row([[U[n - 1], 1], [U[0], -1]], -Infinity, len - 1);
      for (const [key, j, i] of between) {
        const at = same ? i : (len - i) % len, v = x.get(key);
        if (!wrap.has(j)) wrap.set(j, bin());
        const w = wrap.get(j);
        m.row([[U[j], 1], [w, -len], [v, M]], -Infinity, at + M);
        m.row([[U[j], 1], [w, -len], [v, -M]], at - M, Infinity);
        segments.push([key, j, at]);
      }
      this.annuli.push({U, wrap, len, segments});
    }
    section('ties');
    // Symmetry ties (StructureSymmetry.ties): equal labels, complementary where
    // the element swaps the papers; equal switch sides; every segment used
    // exactly when its image is, and one without an image never.
    for (const tie of ties) {
      for (const [run, image] of tie.runs || []) if (image !== run)
        m.row([[lab.get(run), 1], [lab.get(image), tie.swaps ? 1 : -1]], tie.swaps ? 1 : 0, tie.swaps ? 1 : 0);
      for (const [t, image] of tie.tokens) {
        const k = `${image[1]}:${image[2]}:${image[3]}`;
        if (k !== t && side.has(t) && side.has(k)) m.row([[side.get(t), 1], [side.get(k), -1]], 0, 0);
      }
      for (const [key, v] of x) {
        const image = cand.imageKey(tie, key);
        if (image === key) continue;
        if (image && x.has(image)) m.row([[v, 1], [x.get(image), -1]], 0, 0);
        else m.row([[v, 1]], 0, 0);
      }
    }
    section('statics');
    // The static rules; those a start breaks are soft (a slack at `penalty`).
    this.slacks = [];
    this.slackRows = [];
    this.softKeys = soft;
    const pairs = [];
    for (const n of statics) {
      const row = this.rowOf(n);
      if (!row) continue;
      let [terms, rhs] = row;
      if (row[0].length === 2 && n.length === 2 && !soft.has(nogoodKey(n))) { pairs.push(terms); continue; }
      if (soft.has(nogoodKey(n))) {
        const slack = m.variable({cost: penalty, lo: 0, hi: terms.length});
        this.slacks.push(slack);
        this.slackRows.push([slack, terms, rhs]);
        terms = [...terms, [slack, -1]];
      }
      m.row(terms, -Infinity, rhs);
    }
    // Two literals never both: one row per clique of these conflicts, each
    // pair in one at least. The same integral solutions, a tighter relaxation,
    // and far fewer rows (starcircle: 11757 pairs of close hidden segments).
    for (const clique of cliqueCover(pairs.map(terms => terms.map(([v, c]) => `${v}:${c}`)))) {
      const terms = clique.map(l => l.split(':').map(Number));
      m.row(terms, -Infinity, 1 - terms.filter(([, c]) => c < 0).length);
    }
    this.paperSlacks = [];
    for (const n of paper) {
      const row = this.rowOf(n);
      if (!row) continue;
      const slack = m.variable({cost: paperPenalty, lo: 0, hi: row[0].length});
      this.paperSlacks.push(slack);
      this.slackRows.push([slack, row[0], row[1]]);
      m.row([...row[0], [slack, -1]], -Infinity, row[1]);
    }
    this.seen = new Set();
    this.cuts = {embedding: 0, geometry: 0};
  }

  /** [terms, rhs] of the row sum <= rhs a nogood stands for, or null if it never holds. */
  rowOf(nogood) {
    const terms = new Map(), seen = new Map();
    let rhs = -1;
    for (const [kind, ref, value] of nogood) {
      if (kind === 'x' && !this.x.has(ref)) {
        if (value) return null;  // an absent segment is never used
        continue;
      }
      const v = kind === 'lab' ? this.lab.get(ref.join(',')) : kind === 'x' ? this.x.get(ref) : this.sw.get(ref.join(','));
      if (v === undefined) return null;
      if (seen.has(v) && seen.get(v) !== value) return null;  // a literal and its negation
      seen.set(v, value);
      terms.set(v, (terms.get(v) || 0) + (value ? 1 : -1));
      rhs += value ? 1 : 0;
    }
    return [[...terms].filter(([, c]) => c), rhs];
  }

  /** The columns of every segment joining the tokens segment `key` joins. */
  joining(key) {
    if (!this.byTokens) {
      this.byTokens = new Map();
      for (const [k, v] of this.x) {
        const [fi, a, b] = this.cand.pair.get(k), id = `${fi}|${[tokenKey(a), tokenKey(b)].sort().join('|')}`;
        if (!this.byTokens.has(id)) this.byTokens.set(id, []);
        this.byTokens.get(id).push(v);
      }
    }
    const [fi, a, b] = this.cand.pair.get(key);
    return this.byTokens.get(`${fi}|${[tokenKey(a), tokenKey(b)].sort().join('|')}`);
  }

  /** Rows making each paper enter the edges `edges` (none at a border) from
   * outside wherever it cuts them: a detached loop there and every loop like it
   * at once (sat_length.LengthModel.connectivity_rows). Empty once made. */
  connectivityRows(edges) {
    const E = this.st.edges, nodes = this.st.nodes, key = [...edges].sort((a, b) => a - b).join(',');
    if (this.connected.has(key) || [...edges].some(e => [E[e].u, E[e].v].some(p => nodes.get(pointKey(p))?.typ === 'end'))) return [];
    this.connected.add(key);
    const inside = new Set([...edges].flatMap(e => Array.from({length: this.q[e] + 2}, (_, i) => this.point(e, i)))), rows = [];
    for (const [family, member] of [['A', 1], ['B', 0]]) {
      const enter = [...inside].flatMap(p => (this.entering.get(`${family}|${p}`) || []).filter(([s0]) => !inside.has(s0)).map(([, v]) => [v, -1]));
      // enter >= lab (A), enter >= 1 - lab (B), as rows sum <= rhs
      for (const e of edges) for (let i = 0; i <= this.q[e]; i++) rows.push(['connect', [...enter, [this.lab.get(`${e},${i}`), member ? 1 : -1]], member ? 0 : -1]);
    }
    return rows;
  }

  /** Rows for what an integral solution gets wrong: hidden segments a face with
   * holes cannot hold, and the exact slit check's close pieces. */
  violations(val) {
    const this_ = this, out = [], used = [...this.x].filter(([, v]) => val[v] > .5).map(([k]) => k);
    // Each paper's slits: from every border end along its pieces and the used
    // segments; one ending on the wrong border, and any piece not reached (a
    // detached loop), cut (sat_length.LengthModel.violations).
    const E = this.st.edges, nodes = this.st.nodes, endOf = p => p.startsWith('node:') && nodes.get(p.slice(5))?.typ === 'end';
    for (const member of [1, 0]) {
      const links = new Map(), link = (p, item, q) => { if (!links.has(p)) links.set(p, []); links.get(p).push([item, q]); };
      E.forEach((_, e) => {
        for (let i = 0; i <= this.q[e]; i++) if ((val[this.lab.get(`${e},${i}`)] > .5 ? 1 : 0) === member) {
          const item = `seg:${e},${i}`, p = this.point(e, i), q = this.point(e, i + 1);
          link(p, item, q); link(q, item, p);
        }
      });
      for (const key of used) {
        const [, a, b] = this.cand.pair.get(key), p = `slot:${a[1]}:${a[2]}`, q = `slot:${b[1]}:${b[2]}`;
        link(p, `x:${key}`, q); link(q, `x:${key}`, p);
      }
      const cut = items => {
        const terms = [];
        let rhs = items.length - 1;
        for (const item of items) {
          if (item.startsWith('x:')) terms.push([this.x.get(item.slice(2)), 1]);
          else if (member) terms.push([this.lab.get(item.slice(4)), 1]);
          else { terms.push([this.lab.get(item.slice(4)), -1]); rhs -= 1; }  // B cuts the piece when its label is 0
        }
        return [terms, rhs];
      };
      const done = new Set();
      for (const p0 of [...links.keys()].filter(endOf)) {
        if (links.get(p0).some(([item]) => done.has(item))) continue;
        const items = [];
        let prev = null, p = p0;
        for (;;) {
          const step = links.get(p).find(([item]) => item !== prev && !done.has(item));
          if (!step) break;
          [prev, p] = step;
          done.add(prev);
          items.push(prev);
          if (endOf(p)) break;
        }
        const sides = new Set([nodes.get(p0.slice(5)).side, endOf(p) ? nodes.get(p.slice(5)).side : null]);
        const fine = (sides.has('T') && sides.has('B')) || (sides.has('L') && sides.has('R'));
        if (!fine) out.push(['path', ...cut(items)]);
      }
      const all = new Set([...links.values()].flatMap(list => list.map(([item]) => item)));
      for (const item0 of all) {
        if (done.has(item0)) continue;
        const items = [], stack = [item0];
        while (stack.length) {
          const item = stack.pop();
          if (done.has(item)) continue;
          done.add(item);
          items.push(item);
          for (const [p] of ends(item)) for (const [other] of links.get(p) || []) if (!done.has(other)) stack.push(other);
        }
        const touched = new Set(items.map(item => item.startsWith('x:') ? this.cand.pair.get(item.slice(2)).slice(1).map(t => t[1]) : [+item.slice(4).split(',')[0]]).flat());
        const rows = this.connectivityRows(touched);
        out.push(...(rows.length ? rows : [['cycle', ...cut(items)]]));
      }
      function ends(item) {
        if (item.startsWith('x:')) { const [, a, b] = this_.cand.pair.get(item.slice(2)); return [[`slot:${a[1]}:${a[2]}`], [`slot:${b[1]}:${b[2]}`]]; }
        const [e, i] = item.slice(4).split(',').map(Number);
        return [[this_.point(e, i)], [this_.point(e, i + 1)]];
      }
    }
    if (out.length) return out;
    const byFace = new Map();
    for (const key of used) { const fi = this.cand.pair.get(key)[0]; if (!byFace.has(fi)) byFace.set(fi, []); byFace.get(fi).push(key); }
    for (const [fi, mine] of byFace) {
      const cycles = this.cand.faces[fi].map(c => c.map(tokenKey)), pairs = k => k.map(c => { const [, a, b] = this.cand.pair.get(c); return [tokenKey(a), tokenKey(b)]; });
      if (embeddable(cycles, pairs(mine))) continue;
      let bad = [...mine];
      for (const c of mine) { const trial = bad.filter(d => d !== c); if (!embeddable(cycles, pairs(trial))) bad = trial; }
      // Whether segments embed depends only on the tokens they join, and a
      // token has one segment at most: the row takes every route between them.
      out.push(['embedding', bad.flatMap(c => this.joining(c).map(v => [v, 1])), bad.length - 1]);
    }
    if (out.length) return out;
    const labels = new Map([...this.lab].map(([k, v]) => [k, val[v] > .5 ? 1 : 0]));
    const switches = new Set([...this.sw].filter(([, v]) => val[v] > .5).map(([k]) => k));
    for (const n of geometryNogoods(this.st, this.outline, this.cand, labels, used, switches)) {
      if (this.softKeys.has(nogoodKey(n))) continue;
      const row = this.rowOf(n);
      if (row) out.push(['geometry', ...row]);
    }
    return out;
  }

  /** Every variable's value for a witness on these positions (labels 'e,i' -> 1
   * for paper A, the used segments' keys): directions and flows from tracing
   * each paper's slits, slacks as the soft rules need. */
  startValues(labels, used) {
    const val = new Float64Array(this.m.cost.length), usedSet = new Set(used);
    for (const [k, v] of this.lab) val[v] = labels.get(k) ? 1 : 0;
    for (const [k, v] of this.sw) {
      const [e, j] = k.split(',').map(Number);
      val[v] = (labels.get(`${e},${j - 1}`) ? 1 : 0) !== (labels.get(`${e},${j}`) ? 1 : 0) ? 1 : 0;
    }
    for (const key of used) for (const t of this.cand.pair.get(key).slice(1)) val[this.side.get(tokenKey(t))] = 1;
    for (const [k, v] of this.x) val[v] = usedSet.has(k) ? 1 : 0;
    // Each paper's slits from its sources: the arcs it takes.
    const links = new Map(), link = (fam, at, entry) => { const k = `${fam}|${at}`; if (!links.has(k)) links.set(k, []); links.get(k).push(entry); };
    this.st.edges.forEach((_, e) => {
      for (let i = 0; i <= this.q[e]; i++) {
        const fam = labels.get(`${e},${i}`) ? 'A' : 'B', [af, ab, bf, bb] = this.segArcs.get(`${e},${i}`), p = this.point(e, i), p2 = this.point(e, i + 1);
        const [fwd, back] = fam === 'A' ? [af, ab] : [bf, bb];
        link(fam, p, {piece: `run:${e}:${i}`, to: p2, arc: fwd});
        link(fam, p2, {piece: `run:${e}:${i}`, to: p, arc: back});
      }
    });
    for (const key of used) {
      const [, a, b] = this.cand.pair.get(key), p = `slot:${a[1]}:${a[2]}`, p2 = `slot:${b[1]}:${b[2]}`, [af, ab, bf, bb] = this.chordArcs.get(key);
      link('A', p, {piece: `hid:${key}`, to: p2, arc: af}); link('A', p2, {piece: `hid:${key}`, to: p, arc: ab});
      link('B', p, {piece: `hid:${key}`, to: p2, arc: bf}); link('B', p2, {piece: `hid:${key}`, to: p, arc: bb});
    }
    for (const [fam, side] of [['A', 'T'], ['B', 'L']]) {
      for (const [key, n] of this.st.nodes) {
        if (n.typ !== 'end' || n.side !== side) continue;
        let cur = `node:${key}`, prev = null;
        const path = [];
        for (let guard = 0; guard < 100000; guard++) {
          const step = (links.get(`${fam}|${cur}`) || []).filter(x => x.piece !== prev);
          if (!step.length) break;
          prev = step[0].piece;
          cur = step[0].to;
          path.push(step[0].arc);
          if (cur.startsWith('node:') && this.st.nodes.get(cur.slice(5)).typ === 'end') break;
        }
        for (const arc of path) val[arc] = 1;
      }
    }
    for (const {U, wrap, len, segments} of this.annuli) {
      // Along the outer cycle, a used segment wraps once its inner position falls behind.
      let last = null, wrapped = 0;
      const value = new Map();
      for (const [key, j, at] of segments.filter(([key]) => usedSet.has(key)).sort((a, b) => a[1] - b[1])) {
        if (last !== null && at + len * wrapped <= last) wrapped = 1;
        last = at + len * wrapped;
        value.set(j, last);
        val[wrap.get(j)] = wrapped;
      }
      let u = value.size ? value.values().next().value : 0;
      U.forEach((col, j) => { if (value.has(j)) u = value.get(j); val[col] = u; });
    }
    for (const [slack, terms, rhs] of this.slackRows) val[slack] = Math.max(0, terms.reduce((s, [v, c]) => s + c * val[v], 0) - rhs);
    return val;
  }

  penaltyOf(val) {
    return this.slacks.reduce((s, v) => s + val[v], 0) + [...this.invalid].reduce((s, k) => s + (this.x.has(k) ? val[this.x.get(k)] : 0), 0);
  }

  /** Labels and used segments of a solution vector. */
  read(val) {
    return {labels: new Map([...this.lab].map(([k, v]) => [k, val[v] > .5 ? 1 : 0])), used: [...this.x].filter(([, v]) => val[v] > .5).map(([k]) => k)};
  }

  /** The rows `values` breaks, counted by kind: {kind: count}. */
  broken(values, eps = 1e-6) {
    const out = {}, bounds = [...this.sections.map(([, r]) => r), Infinity];
    this.m.rows.forEach((row, r) => {
      const act = row.entries.reduce((s, [j, c]) => s + c * values[j], 0);
      if (act < row.lo - eps || act > row.hi + eps) {
        const k = this.sections[bounds.findIndex((b, i) => r >= b && r < bounds[i + 1])]?.[0] ?? 'lazy';
        out[k] = (out[k] || 0) + 1;
      }
    });
    return out;
  }

  /** Minimise: violations and hidden segments first (with a length tie-break
   * under one), then the length at that count. Lazy rows each round.
   * `onSolution` sees each improving solution that keeps every rule. */
  async solve({start = null, deadline = performance.now() + 30000, gap = .02, onProgress = () => {}, audit = null, onSolution = null} = {}) {
    const highs = await solverRuntime(), m = this.m, chords = new Set(this.x.values());
    const invalid = new Set([...this.invalid].filter(k => this.x.has(k)).map(k => this.x.get(k)));
    const slacks = new Set(this.slacks), paperSlacks = new Set(this.paperSlacks);
    const lengths = m.cost.map((c, j) => chords.has(j) ? c - (invalid.has(j) ? this.penalty : 0) : 0);
    const hard = m.cost.map((c, j) => invalid.has(j) ? this.penalty : slacks.has(j) ? c : 0);
    const scale = 1 / (1 + lengths.reduce((s, c) => s + c, 0));
    const mixed = m.cost.map((_, j) => hard[j] + (chords.has(j) ? 1 : 0) + scale * lengths[j]);
    const stageLengths = m.cost.map((_, j) => hard[j] + lengths[j] + (paperSlacks.has(j) ? this.paperPenalty : 0));
    const native = highs.createModel(m.data());
    try {
      return await this.run(highs, native, {start, deadline, gap, onProgress, chords, mixed, stageLengths, audit, onSolution});
    } finally {
      native.dispose();
    }
  }

  async run(highs, native, {start, deadline, gap, onProgress, chords, mixed, stageLengths, audit, onSolution}) {
    const this_ = this, m = this.m, report = {rounds: 0, cuts: this.cuts, columns: m.cost.length, rows: m.rows.length};
    let best = null;
    const setCosts = costs => costs.forEach((c, j) => native.changeColCost(j, c));
    // New lazily checked rules as rows with a slack at the penalty (elastic):
    // a solution breaking them stays feasible, at a cost. How many were new.
    // The paper audit's rows ('paper') are softer: worth two segments in the
    // count stage, the paper penalty in the length stage, and no broken rule.
    let current = null;
    const elastic = rows => {
      let added = 0;
      for (const [kind, terms, rhs] of rows) {
        const k = `${kind}|${terms.map(t => t.join(':')).sort().join(',')}|${rhs}`;
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        const paper = kind === 'paper', costs = paper ? [2, this.paperPenalty] : [this.penalty, this.penalty];
        const slack = m.variable({cost: costs[1], lo: 0, hi: Infinity});
        native.addCol(current === mixed ? costs[0] : costs[1], 0, Infinity, {indices: new Int32Array(0), values: new Float64Array(0)});
        const row = [...terms, [slack, -1]];
        m.row(row, -Infinity, rhs);
        native.addRow(-Infinity, rhs, {indices: Int32Array.from(row.map(([v]) => v)), values: Float64Array.from(row.map(([, c]) => c))});
        (paper ? this.paperSlacks : this.slacks).push(slack);
        this.slackRows.push([slack, terms, rhs]);
        mixed.push(costs[0]);
        stageLengths.push(costs[1]);
        this.cuts[kind] = (this.cuts[kind] || 0) + 1;
        added++;
      }
      return added;
    };
    // A solution over all columns, its slacks set to what it breaks.
    const fill = values => {
      const out = new Float64Array(m.cost.length);
      out.set(values.subarray ? values.subarray(0, Math.min(values.length, out.length)) : values.slice(0, out.length));
      for (const [slack, terms, rhs] of this.slackRows) out[slack] = Math.max(0, terms.reduce((sum, [v, c]) => sum + c * out[v], 0) - rhs);
      return out;
    };
    const stage = async (costs, until, relGap, enough, absGap = null, patience = 0) => {
      current = costs;
      setCosts(costs);
      native.options.set({output_flag: false, presolve_rule_off: SLOW_PRESOLVE_RULES, mip_rel_gap: relGap, ...(absGap !== null ? {mip_abs_gap: absGap} : {})});
      let bound = -Infinity, status = 'time limit';
      for (let round = 0; round < 200; round++) {
        const left = (until - performance.now()) / 1000;
        if (left <= .2) { status = 'deadline'; break; }
        native.options.set({time_limit: left});
        native.raw.zeroAllClocks();
        if (best) native.setSolution({colValue: Float64Array.from(best.values)});
        else if (start) native.setSolution({colValue: start});
        // Every improving solution's broken lazy rules, not only the last's:
        // each run then brings several (one at a time, starcircle took a run
        // of 7 s per row).
        // With `patience`, a run whose solution keeping every rule has not
        // improved for that long stops (the count stage, which rarely proves
        // its count on a traced outline, leaves the rest to the length).
        const found = [], began = performance.now();
        let clean = null;
        const callbacks = {[highs.constants.callbackType.mipImprovingSolution](event) {
          const values = event.data.mip_solution;
          if (values?.length !== m.cost.length) return;
          const rows = this_.violations(Array.from(values));
          found.push(...rows);
          if (rows.length || this_.penaltyOf(values) > 1e-6) return;
          clean = performance.now();
          onSolution?.(Array.from(values));
        }};
        if (patience) callbacks[highs.constants.callbackType.mipInterrupt] = event => {
          const now = performance.now();
          if (clean !== null && now - clean > Math.max(patience * (until - began), .5 * (clean - began))) event.interrupt();
        };
        const t = performance.now(), result = native.run(callbacks);
        report.rounds++;
        const db = native.info.get('mip_dual_bound');
        if (Number.isFinite(db)) bound = Math.max(bound, db);
        if (native.info.get('primal_solution_status') !== highs.constants.solutionStatus.feasible) {
          status = result.modelStatus === highs.constants.modelStatus.infeasible ? 'infeasible' : 'no solution';
          break;
        }
        let values = Array.from(native.getSolution().colValue);
        // The lazily checked rules it breaks join elastically: it stays a
        // solution, at their penalty, and the best so far whenever it is.
        const last = this.violations(values);
        let rows = elastic([...last, ...found]);
        // Then the paper audit, on a solution keeping every rule.
        if (!rows && audit && !(this.penaltyOf(values) > 1e-6)) rows = elastic(await audit(values));
        if (rows) {
          values = Array.from(fill(values));
          if (best) best = {values: Array.from(fill(best.values)), objective: costs.reduce((s, c, j) => s + c * fill(best.values)[j], 0)};
          const objective = costs.reduce((s, c, j) => s + c * values[j], 0);
          if (!best || objective < best.objective - 1e-9) best = {values, objective};
          onProgress({round, cuts: rows});
          continue;
        }
        const objective = costs.reduce((s, c, j) => s + c * values[j], 0);
        if (!best || objective <= best.objective + 1e-9) best = {values, objective};
        const optimal = result.modelStatus === highs.constants.modelStatus.optimal;
        status = optimal ? 'within gap' : result.modelStatus === highs.constants.modelStatus.interrupted ? 'patience' : 'time limit';
        if (status === 'patience') break;
        if (optimal || (enough && enough(objective, bound))) { status = 'within gap'; break; }
      }
      return {status, bound};
    };
    const now = performance.now(), total = deadline - now;
    const countOf = values => Math.round([...chords].reduce((s, j) => s + values[j], 0));
    // A start keeping every row is HiGHS's incumbent. The lazily checked rules
    // it breaks become rows with a slack at the penalty, as the static rules it
    // breaks are (elastic): it stays an incumbent, and the stages work them off.
    // (Hard, they would cost HiGHS the incumbent: a start from a topological
    // witness, its switches spread evenly, breaks dozens.)
    report.startFeasible = Boolean(start) && !Object.keys(this.broken(start)).length;
    if (report.startFeasible) {
      const added = elastic(this.violations(Array.from(start)));
      if (added) { start = fill(start); report.startElastic = added; }
    }
    // The count stage is done once its bound reaches the best's whole part
    // (violations and segments): with the start's length tie-break as the
    // absolute gap, HiGHS stops there rather than proving the tie-break.
    const startObjective = start ? mixed.reduce((sum, c, j) => sum + c * start[j], 0) : null;
    const absGap = startObjective !== null ? Math.max(1e-9, startObjective - Math.floor(startObjective + 1e-9) - 1e-7) : null;
    // A start that breaks rows (its papers pair the wrong border ends, say) is
    // first repaired: its segments kept, the papers and their flows found anew.
    if (start && !report.startFeasible) {
      const keep = [...chords].filter(j => start[j] > .5);
      keep.forEach(j => native.changeColBounds(j, 1, 1));
      report.repairStatus = (await stage(mixed, now + .3 * total, 1e-4, () => true)).status;
      keep.forEach(j => native.changeColBounds(j, 0, 1));
    }
    // At the count's lower bound, a witness (or even a broken start) proves the
    // count: the length stage searches at it, a far tighter problem than the
    // count stage's; a broken start's count gets a third of the time, then the count stage.
    // ... unless it breaks rules (penalised): a valid drawing may need more
    // segments than the topology does, which only the count stage can trade.
    const witness = best ? best.values : start, trusted = Boolean(best) || report.startFeasible;
    report.startPenalty = start ? this.penaltyOf(Array.from(start)) : null;
    let hidden;
    if (witness && countOf(witness) <= this.h && (best || !(report.startPenalty > 1e-6))) {
      report.countStatus = trusted ? 'at bound' : 'at bound, from a broken start';
      hidden = Math.max(this.h, countOf(witness));
    } else {
      const count = await stage(mixed, now + .7 * total, 1e-4, (obj, low) => low >= Math.floor(obj + 1e-9) - 1e-6, absGap, .25);
      report.countStatus = count.status;
      if (!best) return {report: {...report, status: 'no witness'}};
      hidden = countOf(best.values);
    }
    if (best) best = {values: best.values, objective: stageLengths.reduce((s, c, j) => s + c * best.values[j], 0)};
    native.changeRowBounds(this.countRow, hidden, hidden);
    // The length stage stops once its drawing has not got shorter for a tenth
    // of the stage (kogle: a template found at 8 s, polished for 11 s more to
    // the same length).
    let length = await stage(stageLengths, trusted ? deadline : performance.now() + (deadline - performance.now()) / 3, gap, null, 0, LENGTH_PATIENCE);
    if (best && !trusted && deadline - performance.now() > 200) length = await stage(stageLengths, deadline, gap, null, 0, LENGTH_PATIENCE);
    // A count taken from the start, which then has no solution: the count stage after all.
    if (!best && report.countStatus.startsWith('at bound')) {
      native.changeRowBounds(this.countRow, this.h, Infinity);
      const count = await stage(mixed, performance.now() + .7 * (deadline - performance.now()), 1e-4, (obj, low) => low >= Math.floor(obj + 1e-9) - 1e-6, absGap);
      report.countStatus = `at bound, then ${count.status}`;
      if (!best) return {report: {...report, status: 'no witness'}};
      hidden = countOf(best.values);
      best = {values: best.values, objective: stageLengths.reduce((s, c, j) => s + c * best.values[j], 0)};
      native.changeRowBounds(this.countRow, hidden, hidden);
      length = await stage(stageLengths, deadline, gap, null, 0);
    }
    report.lengthStatus = length.status;
    if (!best) return {report: {...report, status: 'no witness'}};
    report.hidden = hidden;
    report.cost = best.objective;
    report.penalty = this.penaltyOf(best.values);
    if (Number.isFinite(length.bound)) report.gap = Math.max(0, (best.objective - length.bound) / Math.max(1e-12, best.objective));
    return {values: best.values, report: {...report, status: report.penalty > 1e-6 ? 'rules violated' : 'found'}};
  }
}
