/** Square symmetries and how they permute the exact structure (the reference
 * solver's sat_symmetry): which edge each element maps each edge onto, and so
 * the switch positions, tokens and label runs, for the model's ties.
 *
 * Frame: the reference square, 12 units, y up, centre (6, 6). An element that
 * swaps vertical and horizontal (a diagonal mirror or a quarter turn) swaps the
 * papers: an edge cut by paper A maps to an edge cut by paper B. In the app's
 * frame (y down) the reference's `transpose` is `antiTranspose` and vice versa.
 *
 * Hand-drawn outlines are symmetric only approximately, so edges and positions
 * match their nearest images within a tolerance. */
import {cumlen, pointAt, project} from './polyline.js';

// (a, b, c, d): p -> centre + [[a, b], [c, d]] (p - centre).
export const ELEMENTS = Object.freeze({identity: [1, 0, 0, 1], mirrorX: [-1, 0, 0, 1], mirrorY: [1, 0, 0, -1], rotate180: [-1, 0, 0, -1],
  transpose: [0, 1, 1, 0], antiTranspose: [0, -1, -1, 0], rotate90: [0, -1, 1, 0], rotate270: [0, 1, -1, 0]});
/** The reference frame's name of each of the app's (settings.js SYMMETRIES). */
export const FROM_APP = Object.freeze({mirrorX: 'mirrorX', mirrorY: 'mirrorY', rotate180: 'rotate180', transpose: 'antiTranspose', antiTranspose: 'transpose'});

export function act(name, p, size = 12) {
  const [a, b, c, d] = ELEMENTS[name], h = size / 2;
  return [h + a * (p[0] - h) + b * (p[1] - h), h + c * (p[0] - h) + d * (p[1] - h)];
}
/** Positions this close (reference units) are one in a symmetric grid's
 * closure under its stabilizer (positions.js). */
export const MERGED = .05;
export const swapsSheets = name => ELEMENTS[name][1] !== 0;
/** The element undoing `name`. */
export const inverse = name => Object.keys(ELEMENTS).find(h => { const p = act(h, act(name, [1, 2])); return Math.abs(p[0] - 1) < 1e-9 && Math.abs(p[1] - 2) < 1e-9; });
export const determinant = name => { const [a, b, c, d] = ELEMENTS[name]; return a * d - b * c; };

const nameOf = m => Object.keys(ELEMENTS).find(n => ELEMENTS[n].every((v, i) => v === m[i]));
const compose = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3]];

/** The group the named elements generate, identity first. */
export function group(names) {
  const out = ['identity'];
  for (let grown = true; grown;) {
    grown = false;
    for (const a of [...out, ...names]) for (const b of [...out, ...names]) {
      const c = nameOf(compose(ELEMENTS[a], ELEMENTS[b]));
      if (!out.includes(c)) { out.push(c); grown = true; }
    }
  }
  return out;
}

/** How a symmetry group permutes edges and arc lengths of the outline. Throws
 * when an element maps some edge onto no edge (beyond `tolerance`). */
export class StructureSymmetry {
  constructor(outline, names, {tolerance = .2} = {}) {
    this.outline = outline;
    this.names = [...names];
    this.tolerance = tolerance;
    const E = outline.E;
    this.edge = {};  // name -> [[image edge, orientation +1 / -1]] per edge
    for (const name of this.names) {
      const images = E.map((ed, e) => {
        const image = ed.pts.map(p => act(name, p)), cl = cumlen(image), L = cl.at(-1);
        // Interior samples: two edges can share both ends (a ring split at two touchings).
        const samples = Array.from({length: 9}, (_, t) => pointAt(image, cl, L * (t + 1) / 10));
        const near = new Set(outline.grid.within(samples[4], tolerance + outline.rules.step).map(i => outline.edge[i]));
        let best = [Infinity, -1];
        for (const f of near) {
          if (Boolean(E[f].loop) !== Boolean(ed.loop)) continue;
          const d = Math.max(...samples.map(q => project(E[f].pts, outline.geo[f], q).distance));
          if (d < best[0]) best = [d, f];
        }
        if (best[0] > tolerance) throw new Error(`${name} maps edge ${e} onto no edge (off by ${best[0].toFixed(3)}).`);
        const f = best[1];
        // Orientation: whether arc length grows along the image.
        const [s0, s1] = [.1, .2].map(t => this.project(f, act(name, outline.at(e, t * outline.L[e]))));
        let step = s1 - s0;
        if (ed.loop) { const Lf = outline.L[f]; step = ((step + Lf / 2) % Lf + Lf) % Lf - Lf / 2; }
        return [f, step > 0 ? 1 : -1];
      });
      if (new Set(images.map(([f]) => f)).size !== E.length) throw new Error(`${name} does not permute the edges.`);
      this.edge[name] = images;
    }
  }

  project(e, p) { return project(this.outline.E[e].pts, this.outline.geo[e], p).arc; }

  /** [image edge, arc length on it] of the point at arc s on edge e. */
  arcImage(name, e, s) {
    const f = this.edge[name][e][0];
    return [f, this.project(f, act(name, this.outline.at(e, s)))];
  }

  orbits() {
    const seen = new Set(), out = [];
    this.outline.E.forEach((_, e) => {
      if (seen.has(e)) return;
      const orbit = [...new Set(this.names.map(n => this.edge[n][e][0]))].sort((a, b) => a - b);
      orbit.forEach(f => seen.add(f));
      out.push(orbit);
    });
    return out;
  }

  /** name -> Map('e,j' -> [f, k]) for 1-based position indices. */
  positionMaps(positions) {
    const o = this.outline, out = {};
    for (const name of this.names) {
      const m = new Map();
      for (const [e, grid] of positions) grid.forEach((s, j) => {
        const [f, s2] = this.arcImage(name, e, s), theirs = positions.get(f) || [];
        const dist = t => o.along(f, t, s2);
        let k = -1;
        theirs.forEach((t, i) => { if (k < 0 || dist(t) < dist(theirs[k])) k = i; });
        if (k < 0) throw new Error(`${name} maps position ${j + 1} of edge ${e} onto an edge without positions.`);
        // Unambiguous: nearer than half the distance to the next position (a
        // hand-drawn outline's images land a few hundredths off), or within the
        // distance at which the grid's closure took an image as present
        // (positions.js) and nearer than the next: a traced outline's corners
        // can come out differently either way along an edge (outline.js
        // corners), leaving two positions a tenth apart where the image falls
        // between them (circle, lilje2, untied before). Two positions taking one
        // image still fail as no bijection.
        const second = Math.min(Infinity, ...theirs.filter((_, i) => i !== k).map(dist)), d = dist(theirs[k]);
        if (d > this.tolerance || (d > second / 2 && !(d < MERGED && d < second)))
          throw new Error(`${name} maps position ${j + 1} of edge ${e} onto no position.`);
        m.set(`${e},${j + 1}`, [f, k + 1]);
      });
      if (new Set([...m.values()].map(v => v.join(','))).size !== m.size) throw new Error(`${name} is not a bijection on the positions.`);
      out[name] = m;
    }
    return out;
  }

  /** Per non-identity element: how it maps tokens ('e:j:side' -> token) and,
   * with `sheets`, label runs ('e,i' -> 'f,k'), complemented in the model when
   * the element swaps the papers. Left stays left when the element's
   * determinant times the edge's orientation is +1. */
  ties(positions, sheets = false) {
    const maps = this.positionMaps(positions), out = [];
    for (const name of this.names) {
      if (name === 'identity') continue;
      const pmap = maps[name], emap = this.edge[name], det = determinant(name), tokens = new Map();
      for (const [ej, [f, k]] of pmap) {
        const [e, j] = ej.split(',').map(Number), keep = det * emap[e][1] === 1;
        for (const side of ['L', 'R']) tokens.set(`${e}:${j}:${side}`, ['s', f, k, keep ? side : side === 'L' ? 'R' : 'L']);
      }
      const runs = sheets ? runMap(this.outline, positions, pmap, emap) : null;
      if (sheets && swapsSheets(name) && [...runs].some(([run, image]) => run === image))
        throw new Error(`${name} maps a label run onto itself while swapping the papers.`);
      out.push({name, swaps: swapsSheets(name), tokens, runs});
    }
    return out;
  }
}

/** Label run 'e,i' -> its image run. Run i lies between positions i and i + 1
 * (0 and r + 1 the end nodes); on a closed curve run 0 is the arc through the
 * marker (run r is tied equal to it). */
function runMap(outline, positions, pmap, emap) {
  const out = new Map();
  outline.E.forEach((ed, e) => {
    const r = (positions.get(e) || []).length, [f, orientation] = emap[e];
    if (ed.loop) {
      for (let j = 1; j <= r; j++) {
        const a = pmap.get(`${e},${j}`)[1], b = pmap.get(`${e},${j % r + 1}`)[1];
        if (((b - a) % r + r) % r !== (orientation === 1 ? 1 % r : r - 1)) throw new Error(`Positions of loop ${e} are not mapped in order.`);
        const left = orientation === 1 ? a : b;
        out.set(`${e},${j < r ? j : 0}`, `${f},${left < r ? left : 0}`);
      }
    } else {
      const image = i => i === 0 ? (orientation === 1 ? 0 : r + 1) : i === r + 1 ? (orientation === 1 ? r + 1 : 0) : pmap.get(`${e},${i}`)[1];
      for (let i = 0; i <= r; i++) {
        if (Math.abs(image(i) - image(i + 1)) !== 1) throw new Error(`Positions of edge ${e} are not mapped in order.`);
        out.set(`${e},${i}`, `${f},${Math.min(image(i), image(i + 1))}`);
      }
    }
  });
  return out;
}
