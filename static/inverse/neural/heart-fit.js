/** The woven square of a photographed heart, from the paper network's
 * probability alone: the heart's silhouette (the square and its two round
 * lobes, which may run on straight for a while first) fitted under an affine
 * map. Only the picture's own pixels count, so a heart the photograph cuts off,
 * turns or hangs from a handle is still found; the corners come back in the
 * engine's order, the cleft between the lobes first, then clockwise. */

/** Whether canonical (u, v) is on the heart: the square [0, 1]², a lobe on
 * each of its edges at the cleft (0, 0), each a strip `e` long and a half
 * disc. */
function inside(u, v, e) {
  if (u >= 0 && v >= 0) return u <= 1 && v <= 1;
  if (v < 0 && u >= 0 && u <= 1) return v >= -e || (u - .5) ** 2 + (v + e) ** 2 <= .25;
  if (u < 0 && v >= 0 && v <= 1) return u >= -e || (u + e) ** 2 + (v - .5) ** 2 <= .25;
  return false;
}

/** p = [cx, cy, s, angle, aspect, shear, e]: the affine map (u, v) -> image
 * point sending the square's centre to (cx, cy), and the lobes' straight run. */
function affine([cx, cy, s, angle, aspect, shear]) {
  const c = Math.cos(angle), n = Math.sin(angle);
  // A = R(angle) · [[s·aspect, s·shear], [0, s / aspect]]
  const a = c * s * aspect, b = c * s * shear - n * s / aspect, d = n * s * aspect, f = n * s * shear + c * s / aspect;
  return {a, b, d, f, tx: cx - .5 * (a + b), ty: cy - .5 * (d + f)};
}

/** Soft intersection over union of the model with the probability, over the
 * grid's pixels (all in the picture). */
function score(p, grid) {
  const {a, b, d, f, tx, ty} = affine(p), det = a * f - b * d;
  if (!(Math.abs(det) > 1e-9) || !(p[6] >= 0 && p[6] <= 1.2) || !(p[4] > .4 && p[4] < 2.5) || Math.abs(p[5]) > 1) return -1;
  const ia = f / det, ib = -b / det, id = -d / det, ifx = a / det;
  let both = 0, union = 0;
  const {xs, ys, prob, n} = grid;
  for (let j = 0; j < n; j++) {
    const y = ys[j] - ty;
    for (let i = 0; i < n; i++) {
      const x = xs[i] - tx, u = ia * x + ib * y, v = id * x + ifx * y, q = prob[j * n + i];
      if (inside(u, v, p[6])) { both += q; union += 1; } else union += q;
    }
  }
  return union ? both / union : 0;
}

/** The probability on an n x n grid over the window, with pixel centres in image coordinates. */
function gridOf(probability, resolution, window, n) {
  const [x0, y0, x1, y1] = window, prob = new Float32Array(n * n), k = resolution / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let sum = 0, count = 0;
    const ya = Math.floor(j * k), yb = Math.max(ya + 1, Math.floor((j + 1) * k)), xa = Math.floor(i * k), xb = Math.max(xa + 1, Math.floor((i + 1) * k));
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { sum += probability[y * resolution + x]; count++; }
    prob[j * n + i] = sum / count;
  }
  return {n, prob, xs: Float64Array.from({length: n}, (_, i) => x0 + (i + .5) * (x1 - x0) / n), ys: Float64Array.from({length: n}, (_, j) => y0 + (j + .5) * (y1 - y0) / n)};
}

/** Pattern search from p: each parameter in turn, steps halved when nothing improves. */
function polish(p, grid, steps, rounds) {
  let best = score(p, grid);
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let k = 0; k < p.length; k++) for (const sign of [1, -1]) {
      const q = p.slice(); q[k] += sign * steps[k];
      const value = score(q, grid);
      if (value > best + 1e-6) { p = q; best = value; moved = true; }
    }
    if (!moved) { steps = steps.map(s => s / 2); if (Math.max(...steps.map((s, k) => s / [1, 1, 1, .1, .05, .05, .05][k])) < .02) break; }
  }
  return {p, value: best};
}

/** The paper's largest piece with its holes filled, as 0/1: the heart, not
 * the sweets around it, nor the dark motif inside it the network was unsure of. */
function largestFilled(probability, n, threshold) {
  const on = Uint8Array.from(probability, p => p >= threshold), label = new Int32Array(n * n).fill(-1), sizes = [];
  const flood = (seed, value, id) => {
    const stack = [seed]; label[seed] = id; let size = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % n, y = (p - x) / n; size++;
      for (const q of [x > 0 ? p - 1 : -1, x < n - 1 ? p + 1 : -1, y > 0 ? p - n : -1, y < n - 1 ? p + n : -1])
        if (q >= 0 && label[q] < 0 && on[q] === value) { label[q] = id; stack.push(q); }
    }
    return size;
  };
  for (let i = 0; i < n * n; i++) if (on[i] && label[i] < 0) sizes.push(flood(i, 1, sizes.length));
  if (!sizes.length) return new Float32Array(n * n);
  const keep = sizes.indexOf(Math.max(...sizes)), out = Float32Array.from(label, l => l === keep ? 1 : 0);
  // Background pieces enclosed by the heart are holes.
  const seen = label.map(l => l === keep ? 1 : 0);
  for (let i = 0; i < n * n; i++) {
    if (seen[i]) continue;
    const stack = [i], piece = []; seen[i] = 1; let edge = false;
    while (stack.length) {
      const p = stack.pop(), x = p % n, y = (p - x) / n; piece.push(p);
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < n - 1 ? p + 1 : -1, y > 0 ? p - n : -1, y < n - 1 ? p + n : -1])
        if (q >= 0 && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    if (!edge) for (const p of piece) out[p] = 1;
  }
  return out;
}

/** Inside a selection `roi` ([x0, y0, x1, y1] image pixels) of an RGBA
 * `input`, how far each place is from the background, as a probability like
 * the paper network's (`resolution`² over the selection): the background is
 * the colours holding at least `share` of the selection's outer `band` (pieces
 * of this heart and its neighbours there hold less), and a place is heart
 * beyond three times the background's own spread there (at least 20 in RGB).
 * For papers the network and the colour locator do not see: printed patterns
 * on a plain table or wall. */
export function backgroundBody(input, roi, {resolution: n = 160, band = .07, clusters = 4, share = .3} = {}) {
  const {imageWidth: W, imageHeight: H, rgba} = input, [x0, y0, x1, y1] = roi;
  const col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
      const x = Math.min(W - 1, Math.floor(x0 + (i + dx) * (x1 - x0) / n)), y = Math.min(H - 1, Math.floor(y0 + (j + dy) * (y1 - y0) / n)), p = 4 * (y * W + x);
      r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2];
    }
    col.set([r / 4, g / 4, b / 4], 3 * (j * n + i));
  }
  const m = Math.max(1, Math.round(band * n)), border = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (i < m || j < m || i >= n - m || j >= n - m) border.push(j * n + i);
  const dist = (c, q) => Math.hypot(c[0] - col[3 * q], c[1] - col[3 * q + 1], c[2] - col[3 * q + 2]);
  const seed = c => border[Math.floor((c + .5) * border.length / clusters)];
  let centres = Array.from({length: clusters}, (_, c) => Array.from(col.subarray(3 * seed(c), 3 * seed(c) + 3))), counts = [];
  for (let round = 0; round < 15; round++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const q of border) {
      let best = 0;
      centres.forEach((c, t) => { if (dist(c, q) < dist(centres[best], q)) best = t; });
      for (let k = 0; k < 3; k++) sum[best][k] += col[3 * q + k];
      sum[best][3]++;
    }
    centres = sum.map((s, t) => s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[t]);
    counts = sum.map(s => s[3]);
  }
  const background = centres.filter((_, t) => counts[t] >= share * border.length);
  if (!background.length) return null;
  const d = new Float32Array(n * n);
  for (let q = 0; q < n * n; q++) d[q] = Math.min(...background.map(c => dist(c, q)));
  const own = border.map(q => d[q]).filter(v => v < 60).sort((a, b) => a - b);
  const limit = Math.max(20, 3 * (own[Math.floor(.9 * own.length)] ?? 10)), ramp = limit / 3;
  return {probability: Float32Array.from(d, v => Math.min(1, Math.max(0, .5 + (v - limit) / (2 * ramp)))), resolution: n, window: [x0, y0, x1, y1]};
}

/** {quad, iou, lobes, visible} or null: the silhouette fitted to
 * `probability` (`resolution`² values over `window` = [x0, y0, x1, y1] in
 * image pixels), null when less than `minVisible` of it is in the window. */
export function fitHeartSilhouette(body, {threshold = null, minVisible = .6} = {}) {
  // The network is surest of the lobes and often lukewarm (0.3–0.6) about the
  // woven square itself, which a split at one half then leaves out: the fit
  // at a half and at a quarter, whichever covers its paper better.
  if (threshold === null) {
    // A quarter also takes in more of what is not paper (a dress, branches, a
    // shadow), so that fit must lie wholly in the picture and cover it closely.
    const half = fitAt(body, .5, minVisible), quarter = fitAt(body, .25, .95);
    const fits = [half, quarter && quarter.iou >= .915 ? quarter : null].filter(Boolean);
    return fits.sort((a, b) => b.iou - a.iou)[0] ?? null;
  }
  return fitAt(body, threshold, minVisible);
}

function fitAt({probability, resolution, window}, threshold, minVisible) {
  probability = largestFilled(probability, resolution, threshold);
  const coarse = gridOf(probability, resolution, window, 80);
  // Where the paper is: its centroid, extent and area (in image pixels).
  let mass = 0, mx = 0, my = 0;
  for (let j = 0; j < coarse.n; j++) for (let i = 0; i < coarse.n; i++) {
    const q = coarse.prob[j * coarse.n + i] >= .5 ? 1 : 0;
    mass += q; mx += q * coarse.xs[i]; my += q * coarse.ys[j];
  }
  if (mass < 20) return null;
  mx /= mass; my /= mass;
  const cell = (window[2] - window[0]) * (window[3] - window[1]) / coarse.n ** 2, s0 = Math.sqrt(mass * cell / (1 + Math.PI / 4));
  // Every turn, two lobe lengths: a short search each, the best polished on a finer grid.
  const starts = [];
  for (let k = 0; k < 24; k++) for (const e of [0, .35]) {
    const angle = k * Math.PI / 12, start = [mx, my, s0, angle, 1, 0, e];
    // The silhouette's centroid lies 0.22 sides from the square's centre
    // toward the cleft, along the diagonal A·(1, 1).
    const shift = .222 * s0 / Math.SQRT2, c = Math.cos(angle), n = Math.sin(angle);
    start[0] += shift * (c - n); start[1] += shift * (n + c);
    starts.push(polish(start, coarse, [s0 * .08, s0 * .08, s0 * .08, .06, .05, .05, .1], 12));
  }
  starts.sort((x, y) => y.value - x.value);
  const fine = gridOf(probability, resolution, window, 160);
  let best = null;
  for (const {p} of starts.slice(0, 3)) {
    const result = polish(p, fine, [s0 * .03, s0 * .03, s0 * .03, .02, .02, .02, .05], 40);
    if (!best || result.value > best.value) best = result;
  }
  const {a, b, d, f, tx, ty} = affine(best.p), at = (u, v) => [tx + a * u + b * v, ty + d * u + f * v];
  // Most of the heart must be in the picture: paper filling the whole frame
  // fits any heart around the frame.
  let within = 0;
  const {xs, ys, n} = fine, cellArea = (window[2] - window[0]) * (window[3] - window[1]) / n ** 2, det = a * f - b * d;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = xs[i] - tx, y = ys[j] - ty;
    if (inside((f * x - b * y) / det, (-d * x + a * y) / det, best.p[6])) within++;
  }
  const visible = within * cellArea / (Math.abs(det) * (1 + 2 * best.p[6] + Math.PI / 4));
  if (visible < minVisible) return null;
  // The cleft first, then clockwise on the image (y down).
  const cleft = at(0, 0), sides = [at(1, 0), at(0, 1)], tip = at(1, 1);
  const turn = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const [first, last] = turn(cleft, sides[0], tip) > 0 ? sides : [sides[1], sides[0]];
  return {quad: [cleft, first, tip, last], iou: best.value, lobes: best.p[6], visible};
}

/** The homography taking the unit square's (0,0), (1,0), (1,1), (0,1) to `quad`. */
function homography(quad) {
  const a = [], b = [];
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
    const [x, y] = quad[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x], [0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(x, y);
  });
  const n = 8, m = a.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
    if (Math.abs(m[p][k]) < 1e-12) return null;
    [m[k], m[p]] = [m[p], m[k]];
    for (let j = k + 1; j <= n; j++) m[k][j] /= m[k][k];
    for (let i = 0; i < n; i++) if (i !== k) for (let j = k + 1; j <= n; j++) m[i][j] -= m[i][k] * m[k][j];
  }
  const h = m.map(r => r[n]);
  return (u, v) => { const d = h[6] * u + h[7] * v + 1; return [(h[0] * u + h[1] * v + h[2]) / d, (h[3] * u + h[4] * v + h[5]) / d]; };
}

/** Points of the heart's outline in square units with their outward normals:
 * the two lower edges, each lobe's straight run `e` and half circle. The
 * cleft's notch is left out (a hanging loop or a handle sits there). */
function outlineSamples(e, count = 64) {
  const out = [], line = (p, q, normal, k) => { for (let i = 0; i < k; i++) { const t = (i + .5) / k; out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), ...normal]); } };
  line([1, .08], [1, .96], [1, 0], count / 2); line([.08, 1], [.96, 1], [0, 1], count / 2);
  if (e > .02) { line([1, -e], [1, 0], [1, 0], Math.ceil(count * e / 2)); line([-e, 1], [0, 1], [0, 1], Math.ceil(count * e / 2)); }
  for (let i = 0; i < count; i++) {
    // The right lobe's arc from (1, -e) over to (0, -e), leaving its last fifth by the cleft.
    const a = Math.PI * (i + .5) / count * .82, c = Math.cos(a), s = Math.sin(a);
    out.push([.5 + .5 * c, -e - .5 * s, c, -s], [-e - .5 * s, .5 + .5 * c, -s, c]);
  }
  return out;
}

/** The crop `quad` (cleft, right, tip, left) moved onto the heart's outline in
 * the photograph: at each outline point the strongest colour edge across it,
 * then the corners and the lobes' straight run by robust Gauss–Newton, a few
 * rounds. {quad, rms, inliers, edges, moved} (`edges`: the share of each
 * edge's points within 1.5 px — right and left lower, right and left upper,
 * the lobes' arcs; moved in square sides), or null when too few edges were
 * found. */
export function refineHeartOutline(input, quad, {lobes = null, ...options} = {}) {
  // The square's straight edges alone; and with the lobes' half circles too,
  // which pin a square whose upper cells mostly match their lobe, wherever
  // the lobes really are half circles of its side (a drawn heart): that fit
  // wins when its arcs hold.
  const lines = refineFrom(input, quad, {...options, lobes: lobes ?? 0, arcs: false});
  if (options.arcs === false) return lines;
  const round = refineFrom(input, quad, {...options, lobes: lobes ?? 0, arcs: true});
  return round && round.edges[4] >= .7 && round.edges[0] >= .5 && round.edges[1] >= .5 ? round : lines;
}

function refineFrom({rgba, imageWidth: W, imageHeight: H}, quad, {lobes = 0, rounds = 12, reach = .03, arcs = false} = {}) {
  const side = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
  if (!(side > 20)) return null;
  // Quads are in pixel-edge coordinates (pixel i spans [i, i + 1]); a pixel's
  // colour sits at its centre.
  const colour = (ex, ey) => {
    const x = ex - .5, y = ey - .5;
    if (!(x >= 0 && y >= 0 && x < W - 1 && y < H - 1)) return null;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, out = [0, 0, 0];
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const k = 4 * ((y0 + dy) * W + x0 + dx);
      for (let c = 0; c < 3; c++) out[c] += w * rgba[k + c];
    }
    return out;
  };
  // The background: the median colour along the picture's border. The
  // outline's edge has it outside, which tells a faint edge there (a white
  // lobe on white paper) from a stronger one between cells just inside.
  const rim = [];
  for (let i = 0; i < 400; i++) { const t = i / 400; for (const [x, y] of [[t * (W - 1), 0], [t * (W - 1), H - 1], [0, t * (H - 1)], [W - 1, t * (H - 1)]]) rim.push(colour(Math.min(x, W - 1.01) + .5, Math.min(y, H - 1.01) + .5)); }
  const background = [0, 1, 2].map(c => rim.filter(Boolean).map(x => x[c]).sort((a, b) => a - b)[rim.length >> 1] ?? 0);
  const bgDistance = c => Math.hypot(c[0] - background[0], c[1] - background[1], c[2] - background[2]);
  let params = [...quad.flat(), lobes], last = null;
  for (let round = 0; round < rounds; round++) {
    const radius = Math.max(2, side * reach * (round < 4 ? 1 : .5)), step = .5;
    const map = p => { const h = homography([[p[0], p[1]], [p[2], p[3]], [p[4], p[5]], [p[6], p[7]]]); return h; };
    const h = map(params);
    if (!h) return null;
    // The square's four straight edges decide it: its lower edges on the
    // outline, its upper ones where a lobe meets cells of the other paper.
    // Hand-cut lobes are seldom true half circles of its side, so with `arcs`
    // off they only help find nothing.
    const samples = outlineSamples(Math.max(0, params[8])).filter(([u, v]) => arcs || (u >= 0 && v >= 0));
    // The square's upper edges, where a lobe meets cells of the other paper:
    // there the outside reference is that lobe's own colour, read at its middle.
    const lobeColour = (cu, cv) => {
      const got = [];
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const q = h(cu + .05 * i, cv + .05 * j), c = colour(q[0], q[1]); if (c) got.push(c); }
      return got.length > 12 ? [0, 1, 2].map(c => got.map(x => x[c]).sort((a, b) => a - b)[got.length >> 1]) : null;
    };
    const lobeRefs = [lobeColour(.5, -Math.max(0, params[8]) - .25), lobeColour(-Math.max(0, params[8]) - .25, .5)];
    for (let i = 0; i < 24; i++) {
      const t = .06 + .88 * (i + .5) / 24;
      if (lobeRefs[0]) samples.push([t, 0, 0, -1, 0]);
      if (lobeRefs[1]) samples.push([0, t, -1, 0, 1]);
    }
    // Each sample: its image point, image normal, and the edge's signed offset along it.
    const found = [];
    for (const [u, v, nu, nv, lobe] of samples) {
      const reference = lobe === undefined ? background : lobeRefs[lobe], away = c => Math.hypot(c[0] - reference[0], c[1] - reference[1], c[2] - reference[2]);
      const p = h(u, v), q = h(u + .01 * nu, v + .01 * nv), len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!(len > 0)) continue;
      const n = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      let best = 0, at = null, prev = colour(p[0] - (radius + step) * n[0], p[1] - (radius + step) * n[1]);
      const grads = [], cols = [];
      for (let t = -radius; t <= radius; t += step) {
        const c = colour(p[0] + t * n[0], p[1] + t * n[1]);
        grads.push(c && prev ? Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]) : 0); cols.push(c); prev = c;
      }
      // Each step scored by its strength, kept only when the colour two pixels
      // out is the background's and two pixels in is not.
      const two = Math.round(2 / step);
      grads.forEach((g, i) => {
        const outside = cols[Math.min(cols.length - 1, i + two)], inside = cols[Math.max(0, i - 1 - two)];
        if (!outside || !inside) return;
        const score = g * Math.exp(-away(outside) / 40) * Math.min(1, away(inside) / 25);
        if (score > best) { best = score; at = i; }
      });
      if (best < 6 || at === null) continue;
      // Sub-sample peak: a parabola through the strongest step and its neighbours.
      const peak = grads[at], g0 = grads[at - 1] ?? peak, g2 = grads[at + 1] ?? peak, curve = g0 - 2 * peak + g2, shift = curve < 0 ? Math.max(-.5, Math.min(.5, .5 * (g0 - g2) / curve)) : 0;
      found.push({u, v, n, offset: -radius + (at + shift) * step - step / 2, strength: best, edge: u === 1 ? 0 : v === 1 ? 1 : v === 0 ? 2 : u === 0 ? 3 : 4});
    }
    if (found.length < samples.length * .4) return null;
    // Robust Gauss–Newton on the offsets: numeric derivatives of each sample's
    // image point along its normal, Huber weights at one pixel.
    const J = found.map(() => new Float64Array(9)), r = found.map(f => f.offset);
    const base = found.map(f => h(f.u, f.v));
    for (let k = 0; k < 9; k++) {
      const p2 = params.slice(), d = k < 8 ? .5 : .002; p2[k] += d;
      const h2 = map(p2);
      if (!h2) continue;
      found.forEach((f, i) => {
        // The lobes' straight run moves a lobe's samples along -v (right) or -u (left).
        const pt = k < 8 ? h2(f.u, f.v) : f.v < 0 && f.u > 0 ? h(f.u, f.v - d) : f.u < 0 && f.v > 0 ? h(f.u - d, f.v) : base[i];
        J[i][k] = ((pt[0] - base[i][0]) * f.n[0] + (pt[1] - base[i][1]) * f.n[1]) / d;
      });
    }
    const w = r.map(x => Math.min(1, 1 / Math.max(1e-9, Math.abs(x)))), A = Array.from({length: 9}, () => new Float64Array(9)), g = new Float64Array(9);
    found.forEach((_, i) => { for (let a = 0; a < 9; a++) { g[a] += w[i] * J[i][a] * r[i]; for (let b = 0; b < 9; b++) A[a][b] += w[i] * J[i][a] * J[i][b]; } });
    for (let a = 0; a < 9; a++) A[a][a] += 1e-3 * (A[a][a] + 1);
    const delta = solve(A, g);
    if (!delta) return null;
    params = params.map((x, k) => x + delta[k]);
    params[8] = Math.min(1, Math.max(0, params[8]));
    const inliers = r.filter(x => Math.abs(x) <= 1.5), per = [0, 0, 0, 0, 0], total = [0, 0, 0, 0, 0];
    for (const [u, v] of samples) total[u === 1 ? 0 : v === 1 ? 1 : v === 0 ? 2 : u === 0 ? 3 : 4]++;
    found.forEach((f, i) => { if (Math.abs(r[i]) <= 1.5) per[f.edge]++; });
    last = {rms: Math.sqrt(inliers.reduce((s, x) => s + x * x, 0) / Math.max(1, inliers.length)), inliers: inliers.length / samples.length, edges: per.map((k, e) => total[e] ? k / total[e] : 0), step: Math.max(...delta.slice(0, 8).map(Math.abs))};
    if (round >= 4 && last.step < .05) break;
  }
  const out = [[params[0], params[1]], [params[2], params[3]], [params[4], params[5]], [params[6], params[7]]];
  const moved = Math.max(...out.map((p, k) => Math.hypot(p[0] - quad[k][0], p[1] - quad[k][1]))) / side;
  return {quad: out, lobes: params[8], rms: last.rms, inliers: last.inliers, edges: last.edges, moved};
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solve(A, b) {
  const n = b.length, m = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
    if (Math.abs(m[p][k]) < 1e-12) return null;
    [m[k], m[p]] = [m[p], m[k]];
    for (let i = k + 1; i < n; i++) { const f = m[i][k] / m[k][k]; for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = m[i][n]; for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j]; x[i] = s / m[i][i]; }
  return x;
}
