/** A witness at the meeting bound by partial smoothings of the k x l grid (the
 * reference solver's pgrid.find_witness). With exactly k*l - t hidden segments
 * every A-arc meets every B-arc once, at a crossing: the arcs form a k x l grid
 * whose t kept crossings are Gamma's touchings and whose other crossings are
 * hidden segments, which Gamma sees as smoothings. So the bound holds iff Gamma
 * is a partial smoothing of the grid. Depth first over the crossings (kept, or
 * smoothed one of two ways), the curves built so far checked against Gamma's
 * strands (straight on at touchings) and faces; a complete candidate is matched
 * exactly as a plane graph, which gives the switch sides along every edge and
 * the pairs of switches. Not handled (null): reading K, unequal side ends,
 * closed strands through touchings, faces without anchored edges. */
import {pointInRing} from '../geometry.js';
import {SIZE, pointKey} from './structure.js';

export const ORDERS = ['ring', 'diagTL', 'diagBR', 'rows', 'cols', 'diagTR', 'diagBL'];
export const SLICES = [2, 60, 300, 1500];  // seconds per order, a round each
const NODE_LIMIT = 1e8;

// Arms counterclockwise: E N W S; the opposite arm is a ^ 2.
const E_ = 0, N_ = 1, W_ = 2, S_ = 3, DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], KEEP = 2;
// PAIR[choice][arm]: 0 joins N-W and S-E, 1 joins N-E and S-W, 2 keeps the crossing (N-S, E-W).
const PAIR = [[S_, W_, N_, E_], [N_, E_, S_, W_], [W_, S_, E_, N_]];
const JOINS = [[[N_, W_], [S_, E_]], [[N_, E_], [S_, W_]], [[N_, S_], [E_, W_]]];
const cross = (a, b) => DX[a] * DY[b] - DY[a] * DX[b];
const turnSide = (armIn, armOut) => cross(armIn ^ 2, armOut) < 0 ? 'L' : 'R';
const pyMod = (x, m) => { const r = x % m; return r !== 0 && (r < 0) !== (m < 0) ? r + m : r; };

class Unsupported extends Error {}
class OutOfTime extends Error {}

// ---------------------------------------------------------------- Gamma's side

function labels(st) {
  const ends = {T: [], B: [], L: [], R: []};
  for (const [v, nd] of st.nodes) if (nd.typ === 'end') ends[nd.side].push([v, nd.p]);
  const lab = new Map(), at = new Map(), name = (side, list) => list.forEach(([v, p], i) => { lab.set(v, side + i); at.set(side + i, p); });
  for (const s of 'TB') name(s, ends[s].sort(([, a], [, b]) => a[0] - b[0] || a[1] - b[1]));
  for (const s of 'LR') name(s, ends[s].sort(([, a], [, b]) => a[1] - b[1]));
  return {lab, at, k: ends.T.length, l: ends.L.length, kb: ends.B.length, lr: ends.R.length};
}

/** The four edge-ends (2e + 0 at u, 2e + 1 at v) at every touching, counterclockwise. */
function rotations(st) {
  const rot = new Map();
  for (const [v, nd] of st.nodes) {
    if (nd.typ !== 'touch') continue;
    rot.set(v, nd.ends.map(([e, k]) => {
      const pts = st.edges[e].pts, w = k === 0 ? pts[1] : pts.at(-2);
      return [Math.atan2(w[1] - nd.p[1], w[0] - nd.p[0]), e, k];
    }).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(([, e, k]) => 2 * e + k));
  }
  return rot;
}

/** Along every side end's strand (straight on at touchings): the touchings, the
 * far end's label and the edges as [e, forward]; and the closed strands. */
function gammaStrands(st, rot, lab, nodeAt, touchIndex) {
  const N = st.nodes, used = new Set();
  const follow = (e, k, stop = -1) => {
    const seq = [], edges = [];
    for (;;) {
      used.add(e);
      edges.push([e, k === 0]);
      const w = nodeAt[2 * e + 1 - k];
      if (N.get(w).typ !== 'touch') return {seq, edges, w};
      const r = rot.get(w), x = r[(r.indexOf(2 * e + 1 - k) + 2) % 4];
      seq.push(touchIndex.get(w));
      e = x >> 1; k = x & 1;
      if (x === stop) return {seq, edges, w: null};
    }
  };
  const seqs = new Map();
  for (const [v, nd] of N) {
    if (nd.typ !== 'end') continue;
    const [[e, k]] = nd.ends, s = follow(e, k);
    if (N.get(s.w).typ !== 'end') throw new Unsupported('A strand from a side end does not reach a side end.');
    seqs.set(lab.get(v), {seq: s.seq, to: lab.get(s.w), edges: s.edges});
  }
  const closed = [];
  st.edges.forEach((ed, e0) => {
    if (used.has(e0)) return;
    if (ed.loop && N.get(nodeAt[2 * e0]).typ === 'plain') { used.add(e0); closed.push([]); return; }
    closed.push(follow(e0, 0, 2 * e0).seq);
  });
  return {seqs, closed};
}

const faceAt = (st, p) => st.faces.findIndex(f => pointInRing(p, f.cyclepts[0]) && !f.cyclepts.slice(1).some(r => pointInRing(p, r)));

/** Gamma's faces as seen from the grid: the face of every boundary cell, which
 * faces share an edge, and which meet opposite each other at a touching. Null
 * when the boundary fits no grid. */
function faceData(st, at, k, l, rot, cellOf) {
  const eps = 1e-6, xs = s => [0, ...Array.from({length: k}, (_, i) => at.get(s + i)[0]), SIZE];
  const ys = s => [0, ...Array.from({length: l}, (_, j) => at.get(s + j)[1]), SIZE];
  const T = xs('T'), B = xs('B'), L = ys('L'), R = ys('R'), cell = new Map();
  const put = (c, fi) => {
    if (fi < 0) throw new Unsupported('A boundary cell lies outside every face.');
    if (cell.has(c) && cell.get(c) !== fi) return false;
    cell.set(c, fi);
    return true;
  };
  let ok = true;
  for (let x = 0; x <= k; x++) {
    ok = put(cellOf(x, l), faceAt(st, [(T[x] + T[x + 1]) / 2, SIZE - eps])) && ok;
    ok = put(cellOf(x, 0), faceAt(st, [(B[x] + B[x + 1]) / 2, eps])) && ok;
  }
  for (let y = 0; y <= l; y++) {
    ok = put(cellOf(0, y), faceAt(st, [eps, (L[y] + L[y + 1]) / 2])) && ok;
    ok = put(cellOf(k, y), faceAt(st, [SIZE - eps, (R[y] + R[y + 1]) / 2])) && ok;
  }
  const phase = new Set([...cell].map(([c, fi]) => !!st.faces[fi].black !== ((Math.floor(c / (l + 1)) + c % (l + 1)) % 2 === 1)));
  if (!ok || phase.size !== 1) return null;
  const adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  st.edges.forEach((_, e) => { const a = st.faceL.get(e), b = st.faceR.get(e); link(a, b); link(b, a); });
  const opp = new Set();
  for (const r of rot.values()) {
    const sec = r.map(x => (x & 1) === 0 ? st.faceL.get(x >> 1) : st.faceR.get(x >> 1));
    opp.add(Math.min(sec[0], sec[2]) + ',' + Math.max(sec[0], sec[2]));
    opp.add(Math.min(sec[1], sec[3]) + ',' + Math.max(sec[1], sec[3]));
  }
  return {cell, adj, opp};
}

/** Each crossing's options in a guessed order (only to order the search): the
 * grid lines straight between their side ends, and Gamma's faces just around
 * each crossing telling which diagonal pair of cells is joined. */
function geometricHints(st, at, k, l) {
  const touch = [...st.nodes.values()].filter(nd => nd.typ === 'touch').map(nd => nd.p), hints = new Array(k * l).fill(null);
  for (let i = 0; i < k; i++) {
    const [x1, y1] = at.get('T' + i), [x2, y2] = at.get('B' + i);
    for (let j = 0; j < l; j++) {
      const [x3, y3] = at.get('L' + j), [x4, y4] = at.get('R' + j);
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(den) < 1e-12) continue;
      const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
      const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
      const d = .3 * Math.min(SIZE / (k + 1), SIZE / (l + 1)), near = Math.min(1e9, ...touch.map(v => Math.hypot(v[0] - px, v[1] - py)));
      const fNE = faceAt(st, [px + d, py + d]), fSW = faceAt(st, [px - d, py - d]);
      const fNW = faceAt(st, [px - d, py + d]), fSE = faceAt(st, [px + d, py - d]), pref = [];
      if (near < d) pref.push(KEEP);
      if (fNE >= 0 && fNE === fSW && fNW !== fSE) pref.push(0);
      else if (fNW >= 0 && fNW === fSE && fNE !== fSW) pref.push(1);
      for (const o of [KEEP, 0, 1]) if (!pref.includes(o)) pref.push(o);
      hints[i * l + j] = pref;
    }
  }
  return hints;
}

/** The crossings (i * l + j) in the order the search takes them. */
export function crossingOrder(k, l, kind = 'ring') {
  const all = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < l; j++) all.push([i, j]);
  const id = ([i, j]) => i * l + j, by = key => all.map(c => [key(c), c]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]).map(([, c]) => id(c));
  if (kind === 'rows') { const out = []; for (let j = l - 1; j >= 0; j--) for (let i = 0; i < k; i++) out.push(i * l + j); return out; }
  if (kind === 'cols') { const out = []; for (let i = 0; i < k; i++) for (let j = l - 1; j >= 0; j--) out.push(i * l + j); return out; }
  if (kind.startsWith('diag')) {
    // Anti-diagonals from one corner of the grid: TL, TR, BR, BL.
    const corner = kind.slice(4) || 'TL';
    return by(([i, j]) => {
      const x = ['TL', 'BL'].includes(corner) ? i : k - 1 - i, y = ['TL', 'TR'].includes(corner) ? l - 1 - j : j;
      return [x + y, x];
    });
  }
  // Rings from the boundary inwards, each clockwise from the top-left corner.
  const cx = (k - 1) / 2, cy = (l - 1) / 2, start = Math.atan2(l - 1 - cy, -cx);
  return by(([i, j]) => [Math.min(i, j, k - 1 - i, l - 1 - j), pyMod(start - Math.atan2(j - cy, i - cx), 2 * Math.PI)]);
}

// ---------------------------------------------------------------- the search

/** Everything the searches share: Gamma's strands and faces, and the grid's
 * ports and cells. False when no partial smoothing can exist; a witness when
 * the grid has no crossings. */
function prepare(st) {
  if (st.readingK) throw new Unsupported('Reading K.');
  const {lab, at, k, l, kb, lr} = labels(st);
  if (kb !== k || lr !== l) throw new Unsupported('Unequal numbers of side ends.');
  const rot = rotations(st), t = rot.size;
  if (t > k * l) return false;
  const nodeAt = st.edges.flatMap(ed => [pointKey(ed.u), pointKey(ed.v)]), touchIndex = new Map([...rot.keys()].map((v, i) => [v, i]));
  const {seqs, closed} = gammaStrands(st, rot, lab, nodeAt, touchIndex);
  if (closed.some(c => c.length)) throw new Unsupported('A closed strand through touchings.');
  const nClosed = closed.length;
  if (k === 0 || l === 0) {
    // No crossings: Gamma must be the straight strands themselves.
    const straight = [...Array(k).keys()].every(i => seqs.get('T' + i)?.to === 'B' + i) && [...Array(l).keys()].every(j => seqs.get('L' + j)?.to === 'R' + j);
    return straight && t === 0 && nClosed === 0 ? {witness: {sides: new Map(st.edges.map((_, e) => [e, []])), pairs: []}} : false;
  }
  // Cells x * (l + 1) + y; ports: vertical (i, j) at i * (l + 1) + j, horizontal (i, j) after them.
  const cellOf = (x, y) => x * (l + 1) + y, V = (i, j) => i * (l + 1) + j, H = (i, j) => k * (l + 1) + i * l + j;
  const nP = k * (l + 1) + (k + 1) * l, nC = k * l;
  const PORT = new Int32Array(4 * nC), NEXT = new Int32Array(4 * nC), OUT = new Array(4 * nC).fill(null);
  for (let i = 0; i < k; i++) for (let j = 0; j < l; j++) {
    const c = i * l + j;
    PORT[4 * c + E_] = H(i + 1, j); PORT[4 * c + N_] = V(i, j + 1); PORT[4 * c + W_] = H(i, j); PORT[4 * c + S_] = V(i, j);
    for (let a = 0; a < 4; a++) {
      const ni = i + DX[a], nj = j + DY[a];
      if (ni >= 0 && ni < k && nj >= 0 && nj < l) NEXT[4 * c + a] = ni * l + nj;
      else { NEXT[4 * c + a] = -1; OUT[4 * c + a] = [`R${j}`, `T${i}`, `L${j}`, `B${i}`][a]; }
    }
  }
  // Path items: a segment is port * 4 + heading, a kept crossing ~c. The cells left and right of each segment.
  const LEFT = new Int32Array(4 * nP).fill(-1), RIGHT = new Int32Array(4 * nP).fill(-1), BLABEL = new Array(nP).fill(null);
  for (let i = 0; i < k; i++) for (let j = 0; j <= l; j++) {
    const p = V(i, j), west = cellOf(i, j), east = cellOf(i + 1, j);
    LEFT[4 * p + N_] = west; RIGHT[4 * p + N_] = east; LEFT[4 * p + S_] = east; RIGHT[4 * p + S_] = west;
    if (j === 0) BLABEL[p] = 'B' + i;
    if (j === l) BLABEL[p] = 'T' + i;
  }
  for (let i = 0; i <= k; i++) for (let j = 0; j < l; j++) {
    const p = H(i, j), south = cellOf(i, j), north = cellOf(i, j + 1);
    LEFT[4 * p + E_] = north; RIGHT[4 * p + E_] = south; LEFT[4 * p + W_] = south; RIGHT[4 * p + W_] = north;
    if (i === 0) BLABEL[p] = 'L' + j;
    if (i === k) BLABEL[p] = 'R' + j;
  }
  const ENTER = new Map(), LABEL_PORT = new Map();  // label -> [crossing, arm entered by]; label -> port
  for (let i = 0; i < k; i++) {
    ENTER.set('T' + i, [i * l + l - 1, N_]); LABEL_PORT.set('T' + i, V(i, l));
    ENTER.set('B' + i, [i * l, S_]); LABEL_PORT.set('B' + i, V(i, 0));
  }
  for (let j = 0; j < l; j++) {
    ENTER.set('L' + j, [j, W_]); LABEL_PORT.set('L' + j, H(0, j));
    ENTER.set('R' + j, [(k - 1) * l + j, E_]); LABEL_PORT.set('R' + j, H(k, j));
  }
  const fd = faceData(st, at, k, l, rot, cellOf);
  if (!fd) return false;  // the boundary itself is inconsistent with any grid
  const fL = st.edges.map((_, e) => st.faceL.get(e)), fR = st.edges.map((_, e) => st.faceR.get(e));
  // Gamma's closed curves: how many each face holds, the faces inside them, and the inside of a face's only one.
  const loopCap = new Map(), loopInside = new Set(), singleInside = new Map();
  const holds = (fi, e) => st.faces[fi].runs.slice(1).some(cyc => cyc.some(r => r[0] === 'edge' && r[1] === e));
  st.edges.forEach((ed, e) => {
    if (!ed.loop || st.nodes.get(nodeAt[2 * e]).typ !== 'plain') return;
    let fo = -1, fin = -1;
    for (const fi of [fL[e], fR[e]]) {
      if (holds(fi, e)) { loopCap.set(fi, (loopCap.get(fi) || 0) + 1); fo = fi; } else { loopInside.add(fi); fin = fi; }
    }
    if (fo >= 0) singleInside.set(fo, fin);
  });
  return {st, lab, k, l, t, rot, nodeAt, touchIndex, seqs, nClosed, fd, hints: geometricHints(st, at, k, l), fL, fR, loopCap, loopInside,
    singleInside, holds, cellOf, nC, PORT, NEXT, OUT, LEFT, RIGHT, BLABEL, ENTER, LABEL_PORT};
}

const flip = path => {
  const n = path.length, out = new Array(n);
  for (let i = 0; i < n; i++) { const x = path[n - 1 - i]; out[i] = x >= 0 ? x ^ 2 : x; }
  return out;
};

/** The depth-first search with one order of the crossings: run() gives the
 * first witness, or null when there is none; OutOfTime past `until` or the
 * node limit. One mutable state with undo logs, where the reference copies it
 * at every node; a class, so the optimized code serves every order's run. */
class Search {
  constructor(ctx, kind, until) {
    const {k, l, t, nC, fd} = ctx, nCells = (k + 1) * (l + 1);
    Object.assign(this, {ctx, until, l, t, fd, seqs: ctx.seqs, nClosed: ctx.nClosed, hints: ctx.hints, fL: ctx.fL, fR: ctx.fR,
      PORT: ctx.PORT, LEFT: ctx.LEFT, RIGHT: ctx.RIGHT, BLABEL: ctx.BLABEL, count: 0, free: 0});  // free: strands with both ends open
    this.order = crossingOrder(k, l, kind);
    this.frontS = new Array(ctx.BLABEL.length).fill(null);  // per port: its open strand and end
    this.frontW = new Int8Array(ctx.BLABEL.length);
    this.choice = new Int8Array(nC).fill(-1);
    this.ident = new Int32Array(nC).fill(-1);  // crossing -> touching
    this.rev = new Int32Array(t).fill(-1);     // touching -> crossing
    // Cells: union-find by size with undo (log entries: a root joined, or ~root given a face).
    this.cpar = new Int32Array(nCells).map((_, x) => x);
    this.csize = new Int32Array(nCells).fill(1);
    this.cface = new Int32Array(nCells).fill(-1);
    for (const [c, fi] of fd.cell) this.cface[c] = fi;
  }

  croot(x) { const cpar = this.cpar; while (cpar[x] !== x) x = cpar[x]; return x; }
  cmerge(a, b, clog) {
    let ra = this.croot(a), rb = this.croot(b);
    const cface = this.cface, csize = this.csize;
    if (ra === rb) return true;
    if (cface[ra] >= 0 && cface[rb] >= 0 && cface[ra] !== cface[rb]) return false;
    if (csize[ra] > csize[rb]) [ra, rb] = [rb, ra];
    this.cpar[ra] = rb;
    csize[rb] += csize[ra];
    clog.push(ra);
    if (cface[rb] < 0 && cface[ra] >= 0) { cface[rb] = cface[ra]; clog.push(~rb); }
    return true;
  }
  cundo(clog) {
    while (clog.length) {
      const x = clog.pop();
      if (x < 0) this.cface[~x] = -1;
      else { this.csize[this.cpar[x]] -= this.csize[x]; this.cpar[x] = x; }
    }
  }
  cassign(cell, face, clog) {
    const r = this.croot(cell);
    if (this.cface[r] < 0) { this.cface[r] = face; clog.push(~r); return true; }
    return this.cface[r] === face;
  }

  /** A closed curve of the smoothing: the face outside it must hold a closed
   * curve of Gamma still unplaced, the face inside it must be the inside of one. */
  loopOk(path, placed, clog) {
    const {loopCap, loopInside, singleInside} = this.ctx, segs = path.filter(x => x >= 0);
    let tot = 0;
    for (let n = 0; n < segs.length; n++) tot += Math.sign(cross(segs[n] & 3, segs[(n + 1) % segs.length] & 3));
    const [inside, outside] = tot > 0 ? [this.LEFT[segs[0]], this.RIGHT[segs[0]]] : [this.RIGHT[segs[0]], this.LEFT[segs[0]]];
    const fo = this.cface[this.croot(outside)], fi = this.cface[this.croot(inside)];
    if (fi >= 0 && !loopInside.has(fi)) return false;
    if (fo >= 0) {
      const cap = loopCap.get(fo) || 0, n = (placed.get(fo) || 0) + 1;
      if (n > cap) return false;
      placed.set(fo, n);
      // A face holding a single closed curve of Gamma: the inside is that curve's inside.
      if (cap === 1 && singleInside.has(fo) && !this.cassign(inside, singleInside.get(fo), clog)) return false;
    }
    return true;
  }
  /** The cells along a strand from a side end lie in the faces of Gamma beside the matching edges. */
  strandFaces(s, clog) {
    const {LEFT, RIGHT, fL, fR} = this;
    for (let end = 0; end < 2; end++) {
      const label = end ? s.b : s.a;
      if (typeof label !== 'string') continue;
      const ge = this.seqs.get(label).edges, path = s.path, n = path.length;
      let r = 0;
      for (let m = 0; m < n; m++) {
        // From the b end: the path backwards, each segment the other way.
        const it = end ? (path[n - 1 - m] >= 0 ? path[n - 1 - m] ^ 2 : path[n - 1 - m]) : path[m];
        if (it < 0) { r++; continue; }
        if (r >= ge.length) return false;
        const [e, fwd] = ge[r];
        if (!this.cassign(LEFT[it], fwd ? fL[e] : fR[e], clog) || !this.cassign(RIGHT[it], fwd ? fR[e] : fL[e], clog)) return false;
      }
    }
    return true;
  }
  /** The cells beside one edge of Gamma lie in one face: along every run of a
   * curve between kept crossings, unite the cells on its left, and on its right. */
  sideUnify(path, clog) {
    const {LEFT, RIGHT} = this;
    let lrep = -1, rrep = -1;
    for (const it of path) {
      if (it < 0) { lrep = rrep = -1; continue; }
      if (lrep < 0) { lrep = LEFT[it]; rrep = RIGHT[it]; continue; }
      if (!this.cmerge(lrep, LEFT[it], clog) || !this.cmerge(rrep, RIGHT[it], clog)) return false;
    }
    return true;
  }
  /** Around crossing c: side neighbours' faces share an edge of Gamma; at a kept
   * crossing, diagonal neighbours' faces meet at a touching. */
  cellChecks(c, ch) {
    const l = this.l, i = Math.floor(c / l), j = c % l, {adj, opp} = this.fd, f = (x, y) => this.cface[this.croot(x * (l + 1) + y)];
    const NW = f(i, j + 1), NE = f(i + 1, j + 1), SW = f(i, j), SE = f(i + 1, j);
    const side = (a, b) => a < 0 || b < 0 || adj.get(a)?.has(b), diag = (a, b) => a < 0 || b < 0 || opp.has(Math.min(a, b) + ',' + Math.max(a, b));
    return side(NW, NE) && side(NE, SE) && side(SE, SW) && side(SW, NW) && (ch !== KEEP || (diag(NE, SW) && diag(NW, SE)));
  }
  /** Identifications of kept crossings with touchings along a strand from each
   * of its side ends; with both ends on the sides, Gamma's pairing. */
  check(s, log) {
    const {ident, rev} = this, seq = s.seq, n = seq.length;
    for (let end = 0; end < 2; end++) {
      const label = end ? s.b : s.a;
      if (typeof label !== 'string') continue;
      const g = this.seqs.get(label).seq;
      if (n > g.length) return false;
      for (let r = 0; r < n; r++) {
        const c = end ? seq[n - 1 - r] : seq[r], v = g[r];
        if (ident[c] < 0) {
          if (rev[v] >= 0) return false;
          ident[c] = v; rev[v] = c; log.push(c);
        } else if (ident[c] !== v) return false;
      }
    }
    if (typeof s.a === 'string' && typeof s.b === 'string' && (this.seqs.get(s.a).to !== s.b || n !== this.seqs.get(s.a).seq.length)) return false;
    return true;
  }
  undo(log) { while (log.length) { const c = log.pop(); this.rev[this.ident[c]] = -1; this.ident[c] = -1; } }

  /** Crossing c with option ch: the undo logs and new counts, or null with
   * nothing left changed. Strands {a, b, seq, path} have side labels (strings)
   * or open ports as ends; the front holds each open port's strand and end. */
  apply(c, ch, nclosed, placed) {
    const {PORT, BLABEL, l, frontS, frontW} = this, made = [], gone = [], closedPaths = [], clog = [], log = [], flog = [];
    let nc = nclosed, pl2 = placed, free = 0, ok = true;
    const open = s => typeof s.a === 'number' && typeof s.b === 'number';
    const setFront = (p, s, w) => { flog.push(p, frontS[p], frontW[p]); frontS[p] = s; frontW[p] = w; };
    const drop = s => { gone.push(s); if (open(s)) free--; };
    // One half: [strand, its far end, kept crossings and path towards c].
    const half = arm => {
      const p = PORT[4 * c + arm], X = BLABEL[p], into = 4 * p + (arm ^ 2), s = frontS[p];
      if (X !== null) return [null, X, [], [into]];
      if (s === null) return [null, p, [], [into]];
      const w = frontW[p];
      setFront(p, null, 0);
      return w === 0 ? [s, s.b, s.seq.slice().reverse(), flip(s.path)] : [s, s.a, s.seq, s.path];
    };
    for (const [arm1, arm2] of JOINS[ch]) {
      const [s1, far1, q1, pa1] = half(arm1), [s2, far2, q2, pa2] = half(arm2);
      if (s1 !== null && s1 === s2) {
        if (pl2 === placed) pl2 = new Map(placed);
        if (nc + 1 > this.nClosed || q1.length || ch === KEEP || !this.loopOk(pa1, pl2, clog)) { ok = false; break; }
        nc++;
        closedPaths.push(pa1);
        drop(s1);
        continue;
      }
      if (s1 !== null) drop(s1);
      if (s2 !== null) drop(s2);
      const q2r = q2.slice().reverse();
      const ns = {a: far1, b: far2, seq: ch === KEEP ? [...q1, c, ...q2r] : [...q1, ...q2r], path: [...pa1, ...(ch === KEEP ? [~c] : []), ...flip(pa2)]};
      made.push(ns);
      if (open(ns)) free++;
      if (typeof far1 === 'number') setFront(far1, ns, 0);
      if (typeof far2 === 'number') setFront(far2, ns, 1);
    }
    const live = made.filter(s => !gone.includes(s));
    if (ok) for (const s of live) if (!this.check(s, log)) { ok = false; break; }
    if (ok) {
      const i = Math.floor(c / l), j = c % l, cell = (x, y) => x * (l + 1) + y;
      if (ch === 0) ok = this.cmerge(cell(i + 1, j + 1), cell(i, j), clog);
      else if (ch === 1) ok = this.cmerge(cell(i, j + 1), cell(i + 1, j), clog);
      if (ok) for (const s of live) if (!(this.sideUnify(s.path, clog) && this.strandFaces(s, clog))) { ok = false; break; }
      if (ok) for (const pth of closedPaths) if (!this.sideUnify([...pth, pth[0]], clog)) { ok = false; break; }
      ok = ok && this.cellChecks(c, ch);
    }
    this.free += free;
    const r = {nc, pl2, log, clog, flog, free};
    if (!ok) { this.revert(r); return null; }
    return r;
  }
  revert({log, clog, flog, free}) {
    this.cundo(clog);
    this.undo(log);
    for (let n = flog.length - 3; n >= 0; n -= 3) { this.frontS[flog[n]] = flog[n + 1]; this.frontW[flog[n]] = flog[n + 2]; }
    this.free -= free;
  }
  /** The options left at c (keep while touchings remain, smooth while crossings
   * outnumber them), in the hint's order. */
  options(c, kept, remaining) {
    const keep = kept < this.t, smooth = this.t - kept < remaining;
    return (this.hints[c] || [KEEP, 0, 1]).filter(o => o === KEEP ? keep : smooth);
  }
  loopsPossible(nclosed, remaining) {
    return nclosed >= this.nClosed || nclosed + this.free + Math.floor(remaining / 2) >= this.nClosed;
  }
  rec(pos, kept, nclosed, placed) {
    if (++this.count > NODE_LIMIT || performance.now() > this.until) throw new OutOfTime();
    const order = this.order;
    if (pos === order.length) return kept === this.t && nclosed === this.nClosed ? witness(this.ctx, this.choice, order) : null;
    const remaining = order.length - pos;
    if (!this.loopsPossible(nclosed, remaining)) return null;
    const c = order[pos];
    for (const ch of this.options(c, kept, remaining)) {
      const r = this.apply(c, ch, nclosed, placed);
      if (!r) continue;
      this.choice[c] = ch;
      const w = this.rec(pos + 1, kept + (ch === KEEP), r.nc, r.pl2);
      if (w) return w;
      this.choice[c] = -1;
      this.revert(r);
    }
    return null;
  }
  run() { return this.rec(0, 0, 0, new Map()); }
}

// ---------------------------------------------------------------- exact check and witness

/** Exact isotopy check of a complete partial smoothing against Gamma, matching
 * the plane graphs from the side ends: {sides, pairs}, or null. */
function witness(ctx, choice, order) {
  const {st, lab, t, rot, nodeAt, PORT, NEXT, OUT, ENTER, LABEL_PORT} = ctx, N = st.nodes, nE = st.edges.length;
  // A curve of the smoothing from a side (a label) or out of a kept crossing (4c + arm) to the next kept crossing or side.
  const walkFrom = start => {
    const turns = [], segs = [];
    let c, a;
    if (typeof start === 'string') {
      [c, a] = ENTER.get(start);
      segs.push(4 * LABEL_PORT.get(start) + (a ^ 2));
    } else {
      segs.push(4 * PORT[start] + (start & 3));
      if (NEXT[start] < 0) return {turns, segs, lab: OUT[start]};
      c = NEXT[start]; a = (start & 3) ^ 2;
    }
    for (;;) {
      if (choice[c] === KEEP) return {turns, segs, x: c, arm: a};
      const b = PAIR[choice[c]][a];
      turns.push([c, a, b]);
      segs.push(4 * PORT[4 * c + b] + b);
      if (NEXT[4 * c + b] < 0) return {turns, segs, lab: OUT[4 * c + b]};
      [c, a] = [NEXT[4 * c + b], b ^ 2];
    }
  };
  const nmap = new Map(), cmap = new Map(), offset = new Map(), walks = new Array(nE).fill(null), seenEnd = new Set(), queue = [];
  for (const [v, nd] of N) if (nd.typ === 'end') queue.push([2 * nd.ends[0][0] + nd.ends[0][1], lab.get(v)]);
  while (queue.length) {
    const [ek, start] = queue.pop();
    if (seenEnd.has(ek)) continue;
    seenEnd.add(ek);
    const arr = walkFrom(start), e = ek >> 1, there = ek ^ 1, w = nodeAt[there], typ = N.get(w).typ;
    if (typ === 'end') {
      if (arr.lab !== lab.get(w)) return null;
    } else if (typ === 'touch') {
      if (arr.lab !== undefined) return null;
      const cx = arr.x;
      if ((nmap.has(w) && nmap.get(w) !== cx) || (cmap.has(cx) && cmap.get(cx) !== w)) return null;
      const r = rot.get(w), off = (arr.arm - r.indexOf(there) + 4) % 4;
      if (offset.has(w) && offset.get(w) !== off) return null;
      if (!nmap.has(w)) {
        nmap.set(w, cx); cmap.set(cx, w); offset.set(w, off);
        for (let d = 0; d < 4; d++) if (r[d] !== there) queue.push([r[d], 4 * cx + (d + off) % 4]);
      }
    } else return null;
    seenEnd.add(there);
    if (walks[e]) return null;
    walks[e] = (ek & 1) === 0 ? {turns: arr.turns, segs: arr.segs}
      : {turns: arr.turns.slice().reverse().map(([c, a, b]) => [c, b, a]), segs: arr.segs.slice().reverse().map(x => x ^ 2)};
  }
  // Every touching and every kept crossing matched.
  const smoothed = order.filter(c => choice[c] !== KEEP);
  if (nmap.size !== t || cmap.size !== order.length - smoothed.length) return null;
  const loopsG = st.edges.map((ed, e) => ed.loop && N.get(nodeAt[2 * e]).typ === 'plain' ? e : -1).filter(e => e >= 0);
  if (st.edges.some((_, e) => !walks[e] && !loopsG.includes(e))) return null;
  // Closed curves of the smoothing: turns not yet used.
  const used = new Set();
  for (const wk of walks) if (wk) for (const [c, a, b] of wk.turns) used.add(4 * c + a).add(4 * c + b);
  const gridLoops = [];
  for (const c of smoothed) for (const arm of [N_, E_, S_, W_]) {
    if (used.has(4 * c + arm)) continue;
    const turns = [], segs = [];
    let cc = c, a = arm;
    for (;;) {
      const b = PAIR[choice[cc]][a];
      turns.push([cc, a, b]);
      segs.push(4 * PORT[4 * cc + b] + b);
      used.add(4 * cc + a).add(4 * cc + b);
      const c2 = NEXT[4 * cc + b];
      if (c2 < 0 || choice[c2] === KEEP) return null;
      [cc, a] = [c2, b ^ 2];
      if (cc === c && a === arm) break;
    }
    gridLoops.push({turns, segs});
  }
  if (gridLoops.length !== loopsG.length) return null;
  if (loopsG.length && !matchLoops(ctx, loopsG, gridLoops, walks, choice, order)) return null;
  const sides = new Map(), where = new Map();
  for (let e = 0; e < nE; e++) {
    const list = [];
    sides.set(e, list);
    (walks[e]?.turns || []).forEach(([c, a, b], n) => {
      const sd = turnSide(a, b);
      list.push(sd);
      if (!where.has(c)) where.set(c, []);
      where.get(c).push(['s', e, n + 1, sd]);
    });
  }
  const pairs = [];
  for (const toks of where.values()) {
    if (toks.length !== 2) return null;
    pairs.push([toks[0], toks[1]]);
  }
  return pairs.length === smoothed.length ? {sides, pairs} : null;
}

/** Closed curves without touchings: Gamma's matched with the smoothing's, as
 * nesting forests whose roots lie in corresponding faces of the anchored part;
 * fills walks[e] for every closed curve e of Gamma. */
function matchLoops(ctx, loopsG, gridLoops, walks, choice, order) {
  const {st, l, fL, fR, holds, cellOf, LEFT, RIGHT} = ctx, F = st.faces;
  const parent = new Int32Array((ctx.k + 1) * (l + 1)).map((_, i) => i);
  const find = x => { while (parent[x] !== x) x = parent[x]; return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const c of order) {
    const i = Math.floor(c / l), j = c % l;
    if (choice[c] === 0) union(cellOf(i + 1, j + 1), cellOf(i, j));
    else if (choice[c] === 1) union(cellOf(i, j + 1), cellOf(i + 1, j));
  }
  const loopset = new Set(loopsG), push = (m, key, x) => { if (!m.has(key)) m.set(key, []); m.get(key).push(x); };
  const gridFaceOf = fi => {
    for (const r of F[fi].runs[0]) {
      if (r[0] !== 'edge' || loopset.has(r[1]) || !walks[r[1]]?.segs.length) continue;
      const s0 = walks[r[1]].segs[0];
      return find(r[2] === 1 ? LEFT[s0] : RIGHT[s0]);
    }
    return -1;
  };
  // Gamma: the parent of a closed curve is the closed curve whose inside holds it, else the face it lies in.
  const gpar = new Map(), gkids = new Map();
  for (const e of loopsG) {
    const fi = [fL[e], fR[e]].find(f => holds(f, e));
    if (fi === undefined) return false;
    const outer = F[fi].runs[0].filter(r => r[0] === 'edge').map(r => r[1]);
    if (outer.length && outer.every(x => loopset.has(x))) { gpar.set(e, ['loop', outer[0]]); push(gkids, outer[0], e); }
    else {
      const gf = gridFaceOf(fi);
      if (gf < 0) throw new Unsupported('A face without anchored edges.');
      gpar.set(e, ['face', gf]);
    }
  }
  // The smoothing: inside and outside cells of every closed curve.
  const gl = gridLoops.map(({turns, segs}) => {
    let tot = 0;
    for (const [, a, b] of turns) tot += cross(a ^ 2, b) > 0 ? 1 : -1;
    const ccw = tot > 0, left = find(LEFT[segs[0]]), right = find(RIGHT[segs[0]]);
    return ccw ? {ccw, inside: left, outside: right} : {ccw, inside: right, outside: left};
  });
  const insideOf = new Map(gl.map((g, n) => [g.inside, n])), spar = new Map(), skids = new Map();
  gl.forEach((g, n) => {
    if (insideOf.has(g.outside)) { spar.set(n, ['loop', insideOf.get(g.outside)]); push(skids, insideOf.get(g.outside), n); }
    else spar.set(n, ['face', g.outside]);
  });
  const memo = [new Map(), new Map()], kids = [gkids, skids];
  const code = (side, x) => {
    if (!memo[side].has(x)) memo[side].set(x, '(' + (kids[side].get(x) || []).map(y => code(side, y)).sort().join('') + ')');
    return memo[side].get(x);
  };
  const roots = [new Map(), new Map()];
  [gpar, spar].forEach((par, side) => { for (const [x, p] of par) if (p[0] === 'face') push(roots[side], p[1], x); });
  if (roots[0].size !== roots[1].size || [...roots[0].keys()].some(f => !roots[1].has(f))) return false;
  const pairs = [], cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const match = (ge, sn) => {
    const a = [...ge].sort((x, y) => cmp(code(0, x), code(0, y))), b = [...sn].sort((x, y) => cmp(code(1, x), code(1, y)));
    if (a.length !== b.length || a.some((x, i) => code(0, x) !== code(1, b[i]))) return false;
    for (let i = 0; i < a.length; i++) {
      pairs.push([a[i], b[i]]);
      if (!match(gkids.get(a[i]) || [], skids.get(b[i]) || [])) return false;
    }
    return true;
  };
  for (const [f, list] of roots[0]) if (!match(list, roots[1].get(f))) return false;
  for (const [e, n] of pairs) {
    const pts = st.edges[e].pts, {turns, segs} = gridLoops[n];
    let area = 0;
    for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    walks[e] = {turns: (area > 0) !== gl[n].ccw ? turns.slice().reverse().map(([c, a, b]) => [c, b, a]) : turns, segs};
  }
  return pairs.length === loopsG.length;
}

/** A witness at the meeting bound k*l - t by `deadline` (a performance.now()
 * time; a minute by default, as the reference): {sides, pairs} with sides a Map
 * edge -> its switches' sides in order ('L' | 'R') and pairs the hidden segments
 * as [['s', e, k, side], ['s', f, m, side]] (switch ranks from 1); false when
 * there is none (the minimum exceeds the bound); null when undecided (out of
 * time, or the outline is outside this method). The search runs as a portfolio
 * over orders of the crossings: a short slice for every order (enough for
 * almost every outline), then long slices, each cut to the time left;
 * `orders` (some of ORDERS) narrows it. */
export function gridWitness(st, {deadline = performance.now() + 60000, orders = ORDERS} = {}) {
  if (deadline - performance.now() <= 0) return null;
  let ctx;
  try {
    ctx = prepare(st);
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
  if (!ctx || ctx.witness) return ctx && ctx.witness;
  for (const slice of SLICES) for (const kind of orders) {
    const now = performance.now(), left = deadline - now;
    if (left <= 0) return null;
    try {
      return new Search(ctx, kind, now + Math.min(1000 * slice, left)).run() || false;
    } catch (error) {
      if (error instanceof OutOfTime) continue;
      if (error instanceof Unsupported) return null;
      throw error;
    }
  }
  return null;
}
