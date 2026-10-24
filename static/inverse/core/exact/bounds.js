/** Combinatorial lower bounds on the hidden segments of a structure (the
 * reference solver's sat_weave.cheap_bounds and detached_bound), and the
 * spikes' bound: each spike needs a switch, so ceil(spikes / 2) segments. */
import {pointKey} from './structure.js';
import {spikes} from './nogoods.js';

function detachedBound(st) {
  const floating = new Set(st.anchored.map((a, i) => a ? -1 : i).filter(i => i >= 0));
  if (!floating.size) return 0;
  const graph = new Map(), link = (a, b) => { if (!graph.has(a)) graph.set(a, new Set()); graph.get(a).add(b); };
  for (const face of st.faces) {
    const parts = new Set(face.runs.flat().map(run => st.ecomp.get(run[1])));
    const vertices = [...new Set([...parts].map(v => floating.has(v) ? v : -1))].sort((a, b) => a - b);
    for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++) { link(vertices[i], vertices[j]); link(vertices[j], vertices[i]); }
  }
  let bridges = 0;
  for (const a of [...graph.keys()].sort((x, y) => x - y)) for (const b of [...graph.get(a)].filter(v => a < v).sort((x, y) => x - y)) {
    const seen = new Set([a]), todo = [a];
    while (todo.length) {
      const v = todo.pop();
      for (const w of graph.get(v) || []) {
        if ((v === a && w === b) || (v === b && w === a) || seen.has(w)) continue;
        seen.add(w);
        todo.push(w);
      }
    }
    if (!seen.has(b)) bridges++;
  }
  return Math.max(floating.size + 1, 2 * bridges);
}

/** {lb, k, ell, meet, parity, detached, spikes}: lb hidden segments at least. */
export function cheapBounds(st, outline) {
  const nodes = [...st.nodes.values()], counts = {T: 0, B: 0, L: 0, R: 0};
  for (const n of nodes) if (n.typ === 'end') counts[n.side]++;
  if (counts.T !== counts.B || counts.L !== counts.R) return {impossible: true, lb: 0};
  const k = counts.T, ell = counts.L, touchings = nodes.filter(n => n.typ === 'touch').length;
  let switches = 0;
  for (const e of st.edges) {
    const a = st.nodes.get(pointKey(e.u)), b = st.nodes.get(pointKey(e.v));
    if (e.loop || a.typ !== 'end' || b.typ !== 'end') continue;
    if ('TB'.includes(a.side) !== 'TB'.includes(b.side)) switches += 1;
    else if (a.side === b.side) switches += 2;
  }
  const meet = Math.max(0, k * ell - touchings), parity = Math.floor((switches + 1) / 2), detached = detachedBound(st);
  const spiky = outline ? Math.ceil(spikes(outline).length / 2) : 0;
  return {impossible: false, lb: Math.max(meet, parity, detached, spiky), k, ell, meet, parity, detached, spikes: spiky};
}
