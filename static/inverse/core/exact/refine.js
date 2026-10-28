/** The exact search's cuts on the picture's own edge. The search runs on the
 * outline raster.js traces, whose few curves keep it fast but run along the
 * pixels' staircase, 0.2-0.6% of a picture off its mask; a finer trace only
 * follows the staircase closer. A solution is instead redrawn on the same
 * outline with each edge moved onto the mask's sub-pixel edge: its polyline
 * cut into pixel steps and each point moved along its normal to where the
 * slightly blurred mask crosses one half. The structure stays as it was. */
import {Cubic} from '../bezier.js';
import {cumlen, pointAt, project, segmentNearest, subPolyline} from './polyline.js';
import {SIZE} from './structure.js';
import {act, inverse} from './symmetry.js';

/** Each edge of `outline` (exactOutline's) as a polyline on the edge of `mask`
 * (n x n, row 0 at the top): cut into steps of at most `step` pixels, each
 * point moved along its normal to where the mask blurred by `sigma` pixels
 * crosses one half, within `reach` pixels. The moves are averaged over
 * `smooth` neighbours either side, at most `most` pixels, and fade in over
 * `taper` pixels from an open edge's ends, which stay: a junction is the
 * structure's, and a sudden move beside it would bend the cut there. */
export function edgesOnMask(outline, mask, n, {sigma = .8, step = 1, reach = 1.5, most = .75, smooth = 2, taper = 4} = {}) {
  const field = blurred(mask, n, sigma), scale = n / SIZE;
  // Bilinear, cell centres at (i + .5, j + .5) in pixels; clamped at the square's sides.
  const value = (u, v) => {
    const x = Math.min(n - 1, Math.max(0, u - .5)), y = Math.min(n - 1, Math.max(0, v - .5));
    const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), fx = x - i, fy = y - j;
    return (field[j * n + i] * (1 - fx) + field[j * n + i + 1] * fx) * (1 - fy) + (field[(j + 1) * n + i] * (1 - fx) + field[(j + 1) * n + i + 1] * fx) * fy;
  };
  const toPixel = p => [p[0] * scale, (SIZE - p[1]) * scale], fromPixel = q => [q[0] / scale, SIZE - q[1] / scale];
  return outline.E.map((ed, e) => {
    const geo = outline.geo[e], L = outline.L[e], count = Math.max(1, Math.ceil(L * scale / step)), loop = Boolean(ed.loop);
    const pts = Array.from({length: count + 1}, (_, k) => toPixel(pointAt(ed.pts, geo, L * k / count)));
    const at = k => loop ? pts[((k % count) + count) % count] : pts[Math.min(count, Math.max(0, k))];
    // Each point's normal, and how far along it the mask's edge lies.
    const normals = pts.map((q, k) => {
      const prev = at(k - 1), next = at(k + 1), tx = next[0] - prev[0], ty = next[1] - prev[1], len = Math.hypot(tx, ty);
      return len ? [-ty / len, tx / len] : [0, 0];
    });
    const moves = pts.map((q, k) => {
      const [nx, ny] = normals[k];
      if (!nx && !ny) return 0;
      let best = null, last = value(q[0] - reach * nx, q[1] - reach * ny) - .5;
      const steps = Math.ceil(2 * reach / .1);
      for (let s = 1; s <= steps; s++) {
        const t = -reach + 2 * reach * s / steps, here = value(q[0] + t * nx, q[1] + t * ny) - .5;
        if ((last < 0) !== (here < 0)) {
          const t0 = t - 2 * reach / steps, cross = t0 + (t - t0) * last / (last - here);
          if (best === null || Math.abs(cross) < Math.abs(best)) best = cross;
        }
        last = here;
      }
      return best ?? 0;
    });
    const out = pts.map((q, k) => {
      let sum = 0, weight = 0;
      for (let d = -smooth; d <= smooth; d++) {
        const j = loop ? ((k + d) % count + count) % count : k + d;
        if (j < 0 || j > count) continue;
        sum += moves[j]; weight++;
      }
      const fromEnd = loop ? Infinity : Math.min(k, count - k) * L * scale / count, fade = Math.min(1, fromEnd / taper);
      const move = Math.max(-most, Math.min(most, sum / weight)) * fade * fade * (3 - 2 * fade);
      return fromPixel([q[0] + move * normals[k][0], q[1] + move * normals[k][1]]);
    });
    if (loop) out[count] = out[0];
    else { out[0] = ed.pts[0]; out[count] = ed.pts.at(-1); }
    return out;
  });
}

/** {line(e, s0, s1), point(e, s)}: arcs of `outline`'s edges drawn on `edges`
 * (one polyline per edge, edgesOnMask's), each point taken to the nearest of
 * its edge's new polyline; an open edge's ends to its ends. */
export function geometryOn(outline, edges) {
  const geo = edges.map(pts => cumlen(pts)), length = e => geo[e].at(-1);
  const arc = (e, s) => {
    if (!outline.E[e].loop && s <= 1e-12) return 0;
    if (!outline.E[e].loop && s >= outline.L[e] - 1e-12) return length(e);
    return project(edges[e], geo[e], pointAt(outline.E[e].pts, outline.geo[e], s)).arc;
  };
  const along = (e, a, b) => subPolyline(edges[e], geo[e], a, b);
  return {
    point: (e, s) => pointAt(edges[e], geo[e], arc(e, s)),
    line(e, s0, s1) {
      const a = arc(e, s0), b = arc(e, s1), L = length(e);
      if (!outline.E[e].loop) return along(e, Math.min(a, b), Math.max(a, b));
      if (s1 - s0 >= outline.L[e] - 1e-9) return [...along(e, a, L), ...along(e, 0, a).slice(1)];
      return a <= b ? along(e, a, b) : [...along(e, a, L), ...along(e, 0, b).slice(1)];
    }
  };
}

/** Points `q` as cubics within `tol`: least squares with the parameters
 * refined by Newton steps (bezier.js fitPoints), but an end whose unit tangent
 * is null free, both its control points sought, for a corner, where nothing
 * joins it smoothly. A tangent estimated from a corner's few pixels is off by
 * 8-16 degrees (Uret's band edges: then three cubics where one fits within 0.6
 * pixels). It must lie within `tol` of the points' polyline too, or a free end
 * can loop between them. Split at the middle, the chord over `reach` points
 * either side its tangent there, so that a run and its mirror image split
 * alike. */
function fitRun(q, tol, t0, t1, reach, depth = 0) {
  const n = q.length, a = q[0], b = q[n - 1];
  if (n < 4) return [Cubic.line(a, b)];
  const lengths = [0];
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
  const total = lengths[n - 1];
  let ts = lengths.map(x => x / total), c = null;
  for (let round = 0; round < 8; round++) {
    // B(t) = b0 a + b1 p1 + b2 p2 + b3 b, each of p1, p2 free (two unknowns) or along its tangent (one).
    const cols = (t0 ? 1 : 2) + (t1 ? 1 : 2), M = Array.from({length: cols}, () => new Float64Array(cols + 1));
    for (let i = 0; i < n; i++) {
      const t = ts[i], u = 1 - t, b0 = u * u * u, b1 = 3 * t * u * u, b2 = 3 * t * t * u, b3 = t * t * t;
      const base = [b0 * a[0] + b3 * b[0] + (t0 ? b1 * a[0] : 0) + (t1 ? b2 * b[0] : 0), b0 * a[1] + b3 * b[1] + (t0 ? b1 * a[1] : 0) + (t1 ? b2 * b[1] : 0)];
      const g = [...(t0 ? [[b1 * t0[0], b1 * t0[1]]] : [[b1, 0], [0, b1]]), ...(t1 ? [[-b2 * t1[0], -b2 * t1[1]]] : [[b2, 0], [0, b2]])];
      const r = [q[i][0] - base[0], q[i][1] - base[1]];
      for (let j = 0; j < cols; j++) {
        for (let k = 0; k < cols; k++) M[j][k] += g[j][0] * g[k][0] + g[j][1] * g[k][1];
        M[j][cols] += g[j][0] * r[0] + g[j][1] * r[1];
      }
    }
    const x = solve(M);
    const fallback = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3;
    let k = 0;
    const p1 = t0 ? (v => [a[0] + v * t0[0], a[1] + v * t0[1]])(x && x[k] > 0 && x[k] < 3 * total ? x[k++] : (k++, fallback)) : x ? [x[k++], x[k++]] : [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
    const p2 = t1 ? (v => [b[0] - v * t1[0], b[1] - v * t1[1]])(x && x[k] > 0 && x[k] < 3 * total ? x[k] : fallback) : x ? [x[k], x[k + 1]] : [b[0] - (b[0] - a[0]) / 3, b[1] - (b[1] - a[1]) / 3];
    c = new Cubic([a, p1, p2, b]);
    const next = ts.map((t, i) => {
      if (i === 0 || i === n - 1) return t;
      const p = c.point(t), d = c.derivative(t), dd = c.second(t), delta = [p[0] - q[i][0], p[1] - q[i][1]];
      const den = d[0] * d[0] + d[1] * d[1] + delta[0] * dd[0] + delta[1] * dd[1];
      return Math.abs(den) > 1e-12 ? Math.min(1, Math.max(0, t - (delta[0] * d[0] + delta[1] * d[1]) / den)) : t;
    });
    if (next.some((t, i) => i > 0 && t < next[i - 1])) break;
    ts = next;
  }
  const err = q.map((p, i) => { const r = c.point(ts[i]); return Math.hypot(r[0] - p[0], r[1] - p[1]); });
  // And between them: a cubic with a free end can loop where no point is.
  const stray = () => Math.max(...c.flatten(tol / 4).map(p => { let d = Infinity; for (let i = 1; i < n; i++) d = Math.min(d, segmentNearest(p, q[i - 1], q[i])[0]); return d; }));
  if (Math.max(...err) <= tol && stray() <= tol) return [c];
  if (depth >= 16) return q.slice(1).map((p, i) => Cubic.line(q[i], p));
  // An even run splits at a point between its two middle ones.
  let k = (n - 1) / 2, r = q;
  if (!Number.isInteger(k)) { k = n / 2; r = [...q.slice(0, k), [(q[k - 1][0] + q[k][0]) / 2, (q[k - 1][1] + q[k][1]) / 2], ...q.slice(k)]; }
  const h = Math.max(1, Math.min(reach, k)), tan = unitOf(r[k - h], r[k + h]);
  return [...fitRun(r.slice(0, k + 1), tol, t0, tan, reach, depth + 1), ...fitRun(r.slice(k), tol, tan, t1, reach, depth + 1)];
}

const unitOf = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]); return l > 1e-12 ? [d[0] / l, d[1] / l] : null; };

/** x of the augmented system M (rows [A | b]), or null when singular. */
function solve(M) {
  const n = M.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-14) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) if (r !== col) {
      const f = M[r][col] / M[col][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Each edge's points (edgesOnMask's: count + 1 at even arcs of the outline's
 * edge) as cubics within `tolerance` pixels (`n` across the square), split at
 * the outline's corners and at the `switches` (edge -> arcs), sharing one
 * tangent at every join but a corner, which the fit turns as it needs: the
 * visible cuts as a designer draws them, each run between switches whole
 * cubics; per edge a Chain, each of its `positions` (edge -> arcs) placed. Drawn as
 * the points' polyline, an edge is a node a pixel in the editor (Uret's inner
 * ring 338 cubics a cut; now one a run, 11.5 a cut, 0.23% off its mask
 * against the polyline's 0.0%). The mask's edge waves with its pixels'
 * staircase, by up to 0.6 pixels over a step: so the points are first
 * averaged along the edge over a Gaussian as wide as moves them at most
 * `bias` pixels where it curves (sigma^2 k / 2 at curvature k), up to
 * `widest` pixels (wider kept the waves of a gently sloping stretch's long
 * steps, which its curvature took for bends), a window never reaching past a
 * corner or an open edge's end, which stay. A tangent through a join is the
 * chord over `reach` pixels. Under the ties' symmetry `sym` (StructureSymmetry),
 * each orbit of edges is fitted once, on its points averaged with their images'
 * and split where any of them is, symmetrically where an edge is its own
 * image, and its other edges are drawn as that fit's images: fitted one by
 * one, a picture's two sheets no longer had the one template it was searched
 * for (5star-shot). */
export function smoothEdges(outline, edges, n, {switches = new Map(), positions = new Map(), sym = null, tolerance = .75, bias = .1, widest = 3, reach = 8} = {}) {
  const scale = n / SIZE, tol = tolerance / scale;
  const info = edges.map((raw, e) => {
    const count = raw.length - 1, loop = Boolean(outline.E[e].loop), L = outline.L[e];
    if (count < 1) return null;
    const spacing = L * scale / count, wrap = k => ((k % count) + count) % count;
    const get = k => loop ? raw[wrap(k)] : raw[Math.min(count, Math.max(0, k))];
    // A point's index (a loop's from 0 to count, one point), and the arc of an index.
    const index = s => loop ? wrap(Math.round(s * count / L)) : Math.min(count - 1, Math.max(1, Math.round(s * count / L)));
    const inside = s => loop || (s > 0 && s < L);
    const corners = outline.corners[e].filter(inside), ends = [...corners, ...(switches.get(e) ?? [])].filter(inside);
    // Each point's room: how many points it is from the nearest corner or end.
    const fixed = [...(loop ? [] : [0, count]), ...corners.map(index)];
    const room = k => fixed.length ? Math.min(...fixed.map(c => loop ? Math.min(wrap(k - c), wrap(c - k)) : Math.abs(k - c))) : Infinity;
    // Curvature from the turn between chords over 8 pixels either way.
    const h = Math.max(2, Math.round(8 / spacing));
    const pts = raw.map((p, k) => {
      const r0 = room(k);
      if (r0 < 1) return p;
      const hk = Math.min(h, r0), a = get(k - hk), c = get(k + hk), u = [p[0] - a[0], p[1] - a[1]], v = [c[0] - p[0], c[1] - p[1]];
      const turn = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])), curvature = turn / (2 * hk * spacing);
      const sigma = Math.min(widest, curvature > 1e-9 ? Math.sqrt(2 * bias / curvature) : widest) / spacing;
      const r = Math.min(Math.ceil(3 * sigma), r0);
      let x = 0, y = 0, sum = 0;
      for (let d = -r; d <= r; d++) {
        const q = get(k + d), w = Math.exp(-d * d / (2 * sigma * sigma));
        x += w * q[0]; y += w * q[1]; sum += w;
      }
      return [x / sum, y / sum];
    });
    if (loop) pts[count] = pts[0];
    // The point at arc s, between the averaged points.
    const at = s => { const x = loop ? ((s % L) + L) % L * count / L : Math.min(count, Math.max(0, s * count / L)), i = Math.min(count - 1, Math.floor(x)), f = x - i;
      return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])]; };
    return {raw, count, loop, L, spacing, wrap, index, corners, ends, pts, at};
  });
  // Under the ties: each edge as the image of its orbit's first edge r under
  // element `name`, its arc growing with r's (o = 1) or against it.
  const plan = new Map();
  if (sym) for (const orbit of sym.orbits()) for (const name of sym.names) {
    const r = orbit[0], [f, o] = sym.edge[name][r];
    if (!plan.has(f)) plan.set(f, {r, name, o});
  }
  // Arc s of edge r on its image f under `name`, and back: projected, as the
  // ties are (a traced curve's mirror halves differ in length).
  const there = (name, r, f, o, s) => name === 'identity' ? s : sym.arcImage(name, r, s)[1];
  const back = (name, r, f, o, s) => name === 'identity' ? s : sym.arcImage(inverse(name), f, s)[1];
  const fits = new Map();
  const fit = r => {
    const R = info[r], {count, loop, wrap} = R, images = sym ? sym.names.map(name => [name, ...sym.edge[name][r]]) : [['identity', r, 1]];
    // The points averaged with their images', brought back onto r.
    const data = images.length < 2 ? R.pts : R.pts.map((p, k) => {
      if (!loop && (k === 0 || k === count)) return p;
      let x = 0, y = 0;
      for (const [name, f, o] of images) {
        const q = act(inverse(name), info[f].at(there(name, r, f, o, R.L * k / count)));
        x += q[0]; y += q[1];
      }
      return [x / images.length, y / images.length];
    });
    if (loop) data[count] = data[0];
    // The splits at the very arcs of r's ends and its images' (fractional
    // points, a switch's join where its cut ends): one within two points of
    // another is that one.
    const x = s => loop ? (((s * count / R.L) % count) + count) % count : Math.min(count, Math.max(0, s * count / R.L));
    const marks = new Map(), gap = (j, k) => loop ? Math.min(((j - k) % count + count) % count, ((k - j) % count + count) % count) : Math.abs(j - k);
    const add = (k, corner) => {
      for (const [j, c] of marks) if (gap(j, k) <= 2) { marks.set(j, c || corner); return; }
      marks.set(k, corner);
    };
    for (const [name, f, o] of images) for (const s of info[f].ends) add(x(back(name, r, f, o, s)), info[f].corners.includes(s));
    // Where r is its own image, its splits move onto each other's images, and
    // onto the mirror's axis where they lie across it.
    for (const [name, f, o] of images) if (f === r && name !== 'identity') for (const k of [...marks.keys()]) {
      if (!marks.has(k)) continue;
      const corner = marks.get(k), image = x(there(name, r, r, o, R.L * k / count));
      if (gap(k, image) <= 2) {
        const middle = loop ? x(R.L * (k + (((image - k + count / 2) % count + count) % count - count / 2) / 2) / count) : (k + image) / 2;
        marks.delete(k); marks.set(middle, corner); continue;
      }
      if (marks.has(image)) { marks.set(image, marks.get(image) || corner); continue; }
      const near = [...marks.keys()].find(j => gap(j, image) <= 2);
      if (near !== undefined) { const c = marks.get(near); marks.delete(near); marks.set(image, c || corner); }
      else marks.set(image, corner);
    }
    const inner = [...marks.keys()].filter(k => loop || (k > .5 && k < count - .5)).sort((a, b) => a - b);
    const cornerAt = k => marks.get(loop ? (k >= count ? k - count : k) : k) === true || (!loop && (k === 0 || k === count));
    // Pieces between splits; a loop's from its first split round to it, one smooth one where it has none.
    const bounds = loop ? (inner.length ? [...inner, inner[0] + count] : [0, count]) : [0, ...inner, count];
    // The point at fractional index k, between the averaged points.
    const point = k => {
      const u = loop ? ((k % count) + count) % count : Math.min(count, Math.max(0, k)), i = Math.min(count - 1, Math.floor(u)), f = u - i;
      return f < 1e-12 ? data[i] : [data[i][0] + f * (data[i + 1][0] - data[i][0]), data[i][1] + f * (data[i + 1][1] - data[i][1])];
    };
    const step = Math.max(1, Math.round(reach / R.spacing)), out = [];
    for (let b = 1; b < bounds.length; b++) {
      const lo = bounds[b - 1], hi = bounds[b];
      if (hi - lo < 1e-9) continue;
      const run = [point(lo)];
      for (let k = Math.floor(lo + .25) + 1; k < hi - .25; k++) run.push(point(k));
      run.push(point(hi));
      // A smooth join's tangent: the chord through it, within the pieces either side.
      const through = (k, before, after) => unitOf(point(k - Math.min(step, before)), point(k + Math.min(step, after)));
      const t0 = cornerAt(lo) ? null : through(lo, b > 1 ? lo - bounds[b - 2] : loop ? lo + count - bounds.at(-2) : 0, hi - lo);
      const t1 = cornerAt(hi) ? null : through(hi, hi - lo, b + 1 < bounds.length ? bounds[b + 1] - hi : loop ? bounds[1] + count - hi : 0);
      out.push(...fitRun(run, tol, t0, t1, step));
    }
    return out.length ? out : null;
  };
  const chains = edges.map((raw, e) => {
    const it = info[e];
    if (!it) return null;
    const {r, name, o} = plan.get(e) ?? {r: e, name: 'identity', o: 1};
    if (!fits.has(r)) fits.set(r, info[r] ? fit(r) : null);
    if (!fits.get(r)) return null;
    let cubics = fits.get(r).map(c => new Cubic(c.p.map(p => act(name, p))));
    if (o === -1) cubics = cubics.reverse().map(c => c.reversed());
    if (it.loop) cubics = startingAt(cubics, raw[0]);
    else {
      // The chain's ends exactly the edge's (a node other edges share).
      cubics[0] = new Cubic([raw[0], ...cubics[0].p.slice(1)]);
      cubics[cubics.length - 1] = new Cubic([...cubics.at(-1).p.slice(0, 3), raw[it.count]]);
    }
    return new Chain(cubics, it.L, it.loop);
  });
  // The positions placed on the chains: a representative's at its nearest
  // point, a switch's or a corner's at the join there (else a cut ends a pixel
  // or two from it, a sliver the editor shows, or turns back past a corner),
  // and every image's at the image of its tied position's place, so that a
  // hidden cut ends alike on either side of a mirror.
  const nearest = (list, s, L, loop) => list.reduce((m, t) => { const d = Math.abs(t - s), g = loop ? Math.min(d, L - d) : d; return !m || g < m[0] ? [g, t] : m; }, null)?.[1];
  const own = (e, s, corner, p = info[e].at(s)) => {
    const it = info[e], ch = chains[e];
    if (!corner) return ch.locate(p, s);
    let best = [Infinity, -1];
    ch.cubics.forEach((c, i) => { const d = Math.hypot(c.p[0][0] - p[0], c.p[0][1] - p[1]); if (d < best[0]) best = [d, i]; });
    const end = ch.cubics.at(-1).p[3], toEnd = Math.hypot(end[0] - p[0], end[1] - p[1]);
    if (toEnd < best[0] || (it.loop && best[1] === 0 && s > it.L / 2)) best = [toEnd, ch.cubics.length];
    if (best[0] * scale <= 2.5) return best[1] < ch.cubics.length ? [best[1], 0] : ch.last;
    return ch.locate(p, s);
  };
  const done = new Set();
  for (const [e] of chains.entries()) {
    const {r} = plan.get(e) ?? {r: e};
    if (done.has(r) || !chains[r]) continue;
    done.add(r);
    const R = info[r], mine = positions.get(r) ?? [], images = sym ? sym.names.map(name => [name, ...sym.edge[name][r]]) : [];
    // A switch or a corner is a join of its chain (a switch merged into a corner two points on, that corner).
    const corner = s => R.ends.some(c => Math.abs(c - s) < 1e-9);
    for (const s of mine) {
      if (chains[r].at.has(s)) continue;
      const place = own(r, s, corner(s)), p = chains[r].point(place);
      chains[r].at.set(s, place);
      // Where r is its own image, its tied positions at the images of this one.
      for (const [name, f] of images) if (f === r && name !== 'identity') {
        const t = nearest(mine, there(name, r, r, 1, s), R.L, R.loop);
        if (t !== undefined && !chains[r].at.has(t)) chains[r].at.set(t, own(r, t, corner(s), act(name, p)));
      }
    }
    for (const [name, f, o] of images) if (f !== r && chains[f] && plan.get(f)?.name === name) for (const t of positions.get(f) ?? []) {
      const s = nearest(mine, back(name, r, f, o, t), R.L, R.loop);
      if (s !== undefined) chains[f].at.set(t, own(f, t, corner(s), act(name, chains[r].point(chains[r].at.get(s)))));
    }
  }
  return chains;
}

/** The cubics drawing one edge of arc length L (a loop's starting at its arc
 * 0), and `at`: arc -> [cubic, t] of the edge's placed positions. */
class Chain {
  constructor(cubics, L, loop) {
    this.cubics = cubics;
    this.L = L;
    this.loop = loop;
    this.at = new Map();
    this.dense = [];
    let arc = 0;
    cubics.forEach((c, i) => {
      const {points, ts} = c.flatten(.002, .02, true);
      points.forEach((p, k) => {
        if (k === 0 && this.dense.length) return;
        if (this.dense.length) arc += Math.hypot(p[0] - this.dense.at(-1).p[0], p[1] - this.dense.at(-1).p[1]);
        this.dense.push({p, i, t: ts[k], arc});
      });
    });
    this.total = arc;
  }

  get last() { return [this.cubics.length - 1, 1]; }

  point([i, t]) { const c = this.cubics[i]; return t <= 0 ? c.p[0] : t >= 1 ? c.p[3] : c.point(t); }

  /** [cubic, t] of the chain's point nearest p, looked for where the chain is
   * about as far along as arc s of its edge. */
  locate(p, s) {
    const D = this.dense, total = this.total, expect = s / this.L * total, window = Math.max(.2, .05 * total);
    const off = (lo, hi, x) => x < lo ? lo - x : x > hi ? x - hi : 0;
    let best = null;
    for (let k = 0; k + 1 < D.length; k++) {
      const lo = D[k].arc, hi = D[k + 1].arc;
      if ((this.loop ? Math.min(off(lo, hi, expect), off(lo, hi, expect - total), off(lo, hi, expect + total)) : off(lo, hi, expect)) > window) continue;
      const [d, f] = segmentNearest(p, D[k].p, D[k + 1].p);
      if (!best || d < best[0]) best = [d, k, f];
    }
    if (!best) return [0, 0];
    const [, k, f] = best, a = D[k], b = D[k + 1], ta = a.i === b.i ? a.t : 0, c = this.cubics[b.i];
    let t = Math.min(1, Math.max(0, ta + f * (b.t - ta)));
    // Newton steps onto the nearest point exactly: an image's place lands where its position's did.
    for (let step = 0; step < 6; step++) {
      const q = c.point(t), d = c.derivative(t), dd = c.second(t), delta = [q[0] - p[0], q[1] - p[1]];
      const slope = d[0] * d[0] + d[1] * d[1] + delta[0] * dd[0] + delta[1] * dd[1];
      if (Math.abs(slope) < 1e-14) break;
      t = Math.min(1, Math.max(0, t - (delta[0] * d[0] + delta[1] * d[1]) / slope));
    }
    return [b.i, t < 1e-9 ? 0 : t > 1 - 1e-9 ? 1 : t];
  }
}

/** A closed chain of cubics started at its point nearest `p`, the cubic there split. */
function startingAt(cubics, p) {
  let best = [Infinity, 0, 0];
  cubics.forEach((c, i) => {
    const {points, ts} = c.flatten(.002, .02, true);
    points.forEach((q, k) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best[0]) best = [d, i, ts[k]]; });
  });
  const [, i, t] = best;
  if (t < 1e-6) return [...cubics.slice(i), ...cubics.slice(0, i)];
  if (t > 1 - 1e-6) return [...cubics.slice(i + 1), ...cubics.slice(0, i + 1)];
  const [left, right] = cubics[i].split(t);
  return [right, ...cubics.slice(i + 1), ...cubics.slice(0, i), left];
}

/** geometryOn's {point, line} on `chains` (smoothEdges', null for an edge
 * drawn as its polyline of `polylines`, edgesOnMask's or the outline's own),
 * and curves(e, s0, s1): the cubics' control points from arc s0 to s1 of the
 * outline's edge e, or null on a polyline. A placed position is where its
 * chain has it; another arc the chain's point nearest the outline's. */
export function geometryOnCurves(outline, chains, polylines = outline.E.map(ed => ed.pts)) {
  // [cubic, t] of arc s (0 <= s <= L: a run never wraps a loop's start, its chain's).
  const locate = (e, s) => {
    const ch = chains[e], placed = ch.at.get(s);
    if (placed) return placed;
    if (s <= 1e-12) return [0, 0];
    if (s >= outline.L[e] - 1e-12) return ch.last;
    return ch.locate(outline.at(e, s), s);
  };
  const span = (chain, [i0, t0], [i1, t1]) => {
    const out = [];
    for (let i = i0; i <= i1; i++) {
      const lo = i === i0 ? t0 : 0, hi = i === i1 ? t1 : 1;
      if (hi - lo > 1e-9) out.push(lo === 0 && hi === 1 ? chain[i] : chain[i].subcurve(lo, hi));
    }
    return out;
  };
  // A run's cubics, or its two ends where it is too short to place on its
  // chain the right way round (a straight leg, none where they meet).
  const curves = (e, s0, s1) => {
    if (!chains[e]) return null;
    const ch = chains[e], a = locate(e, s0), b = locate(e, s1), pa = ch.point(a), pb = ch.point(b);
    const out = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? span(ch.cubics, a, b) : [];
    if (!out.length) return Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > 1e-9 ? [[pa, pb]] : [];
    // Ends exactly where the route ends and the next run starts.
    out[0] = new Cubic([pa, ...out[0].p.slice(1)]);
    out[out.length - 1] = new Cubic([...out.at(-1).p.slice(0, 3), pb]);
    return out.map(c => c.p);
  };
  const plain = geometryOn(outline, polylines);
  return {
    curves,
    point: (e, s) => chains[e] ? chains[e].point(locate(e, s)) : plain.point(e, s),
    line(e, s0, s1) {
      const parts = curves(e, s0, s1);
      if (!parts) return plain.line(e, s0, s1);
      const line = [chains[e].point(locate(e, s0))];
      for (const p of parts) line.push(...(p.length === 2 ? [p[1]] : new Cubic(p).flatten(.002).slice(1)));
      return line;
    }
  };
}

/** The mask blurred by a Gaussian of `sigma` pixels, as floats 0-1. */
function blurred(mask, n, sigma) {
  const r = Math.max(1, Math.ceil(3 * sigma)), kernel = [];
  for (let d = -r; d <= r; d++) kernel.push(Math.exp(-d * d / (2 * sigma * sigma)));
  const total = kernel.reduce((s, v) => s + v, 0), k = kernel.map(v => v / total);
  const pass = (src, dx, dy) => {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) {
        const u = Math.min(n - 1, Math.max(0, x + d * dx)), v = Math.min(n - 1, Math.max(0, y + d * dy));
        s += k[d + r] * src[v * n + u];
      }
      out[y * n + x] = s;
    }
    return out;
  };
  return pass(pass(mask, 1, 0), 0, 1);
}
