/** Infer crop-edge colours from several parallel profiles inside the image.
 * This is a bounded edit to the classified artwork, not a relaxation of cut checks.
 */
export function borderTransitions(mask, n) {
  const counts = [0, 0, 0, 0]; // top, right, bottom, left
  for (let t = 1; t < n; t++) {
    counts[0] += mask[t] !== mask[t - 1];
    counts[1] += mask[t * n + n - 1] !== mask[(t - 1) * n + n - 1];
    counts[2] += mask[(n - 1) * n + t] !== mask[(n - 1) * n + t - 1];
    counts[3] += mask[t * n] !== mask[(t - 1) * n];
  }
  return counts;
}

export function stabilizeBorder(mask, n, width, radius = 1, minimumStripWidth = 2.5) {
  if (!Number.isInteger(n) || n < 4 || mask.length !== n * n) throw new Error('Square mask required.');
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(radius) || radius < 0 || radius > 3) {
    throw new Error('Border stabilization needs a positive width and a radius between 0 and 3 mm.');
  }
  return extendBorder(mask, n, width, radius, minimumStripWidth);
}

function extendBorder(mask, n, width, radius, minimumStripWidth) {
  // Round down: never edit a wider band than the requested physical distance.
  const depth = Math.min(Math.floor(n / 4), Math.floor(radius * n / width));
  const out = mask.slice();
  // Ignore colour runs narrower than half a manufacturable strip. A few noisy
  // samples along an edge must not become a new pair of slit endpoints.
  const noisePixels = Math.min(depth, Math.floor(Math.max(0, minimumStripWidth) * n / width / 2));
  let profilePixelsChanged = 0;
  const before = borderTransitions(mask, n);
  if (depth) {
    const profiles = Array.from({ length: 4 }, () => new Uint8Array(n));
    for (let t = 0; t < n; t++) for (let side = 0; side < 4; side++) {
      // Read corner colours inside both edges; boundary tips often include
      // a sliver of the background or of the neighbouring lobe.
      const along = Math.max(depth, Math.min(n - 1 - depth, t));
      const at = k => {
        const x = side === 0 || side === 2 ? along : side === 1 ? n - 1 - k : k;
        const y = side === 1 || side === 3 ? along : side === 0 ? k : n - 1 - k;
        return mask[y * n + x];
      };
      let sum = 0;
      for (let k = depth; k <= 2 * depth; k++) sum += at(k);
      const total = depth + 1;
      // Resolve ties from the central profile, so swapping colours commutes.
      profiles[side][t] = sum * 2 === total ? at(Math.floor(1.5 * depth)) : Number(sum * 2 > total);
    }
    if (noisePixels) for (const profile of profiles) {
      const original = profile.slice();
      for (let t = 0; t < n; t++) {
        let count = 0;
        for (let j = -noisePixels; j <= noisePixels; j++) count += original[Math.max(0, Math.min(n - 1, t + j))];
        profile[t] = Number(count > noisePixels);
        profilePixelsChanged += profile[t] !== original[t];
      }
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const distances = [y, n - 1 - x, n - 1 - y, x];
      const nearest = Math.min(...distances);
      if (nearest >= depth) continue;
      const side = distances.indexOf(nearest);
      out[y * n + x] = profiles[side][side % 2 ? y : x];
    }
  }
  let changes = 0;
  for (let i = 0; i < out.length; i++) changes += out[i] !== mask[i];
  return {
    mask: out,
    metadata: {
      radiusMm: radius, depthPixels: depth, profileNoiseRadiusMm: noisePixels * width / n, profilePixelsChanged, editedBandWidthMm: depth * width / n,
      changedPixels: changes, changeFraction: changes / out.length,
      transitionsBefore: before, transitionsAfter: borderTransitions(out, n),
      method: 'Majority across and along inward edge profiles; suppress sub-strip noise before bounded border extension.',
    },
  };
}

/** The mask with no colour boundary running within `depth` mm of a side
 * without reaching it: the strip outside the outermost cut of a family is
 * then at least that wide (validate.js outer_side_clearance), which no choice
 * of cuts can mend on the picture as painted (balls: its circles 2.14 mm from
 * the paper's edge, against 2.5). Along each side, each run of rays (pixel
 * rows across the band) where the band's colour differs from the side's own
 * either takes the side's colour to `depth` (the shape is pulled back) or the
 * colour at `depth` out to the side (it is carried out to the side),
 * whichever changes fewer pixels. Boundaries that end on the side are left as
 * they are. Visible cuts thereby leave the painted
 * outline (the user's decision, 2026-11-02), by at most `depth`.
 */
export function outerStripBand(mask, n, width, depth) {
  const d = Math.min(Math.floor(n / 4), Math.ceil(depth * n / width)), out = mask.slice();
  // Side 0 top, 1 right, 2 bottom, 3 left: pixel k deep on ray t.
  const index = (side, t, k) => side === 0 ? k * n + t : side === 1 ? t * n + n - 1 - k : side === 2 ? (n - 1 - k) * n + t : t * n + k;
  for (let side = 0; side < 4; side++) {
    const differs = t => { for (let k = 1; k < d; k++) if (out[index(side, t, k)] !== out[index(side, t, 0)]) return true; return false; };
    for (let t = 0; t < n;) {
      if (!differs(t)) { t++; continue; }
      let u = t;
      while (u < n && differs(u)) u++;
      // A boundary that reaches the side within the run, or at its ends, is a
      // cut ending there, at an angle: left as it is.
      const own = out[index(side, t, 0)];
      let ends = false;
      for (let r = Math.max(0, t - 1); r <= Math.min(n - 1, u); r++) if (out[index(side, r, 0)] !== own) { ends = true; break; }
      if (ends) { t = u; continue; }
      let pulled = 0, carried = 0;
      for (let r = t; r < u; r++) for (let k = 0; k < d; k++) {
        const v = out[index(side, r, k)];
        pulled += v !== out[index(side, r, 0)];
        carried += v !== out[index(side, r, d)];
      }
      for (let r = t; r < u; r++) {
        const v = out[index(side, r, pulled <= carried ? 0 : d)];
        for (let k = 0; k < d; k++) out[index(side, r, k)] = v;
      }
      t = u;
    }
  }
  let changed = 0;
  for (let i = 0; i < out.length; i++) changed += out[i] !== mask[i];
  return {mask: out, changeFraction: changed / out.length};
}

/** The mask with each pair of opposite sides read from deeper inside
 * (extendBorder) at the shallowest `depths` (mm, at most 8% of the width) at
 * which a band of `seenAt` mm (the exact search's tracer's) finds as many colour
 * changes on both sides of each pair, and some: a photograph's crop a little
 * off the square shows a corner's strip on one side only, or a lobe's colour
 * along one. Each pair's depths are chosen on its own, so the sides read
 * together are checked again (their bands meet at the corners), shallowest
 * first, up to `tries` of them. Null when none ends evenly within `maxChange`
 * of the mask.
 */
export function pairedBorderReading(mask, n, width, {depths = [1, 1.5, 2, 3, 4, 5, 6, 7, 8], seenAt = 1, minimumStripWidth = 2.5, maxChange = 1, tries = 24} = {}) {
  const usable = depths.filter(d => d <= .08 * width), seenOf = m => extendBorder(m, n, width, seenAt, minimumStripWidth).metadata.transitionsAfter;
  const read = usable.map(d => extendBorder(mask, n, width, d, minimumStripWidth).mask), seen = read.map(seenOf);
  // Each pair's depths with as many changes on both sides, shallowest first.
  const options = [[0, 2], [1, 3]].map(([a, b]) => {
    const list = [];
    usable.forEach((da, i) => usable.forEach((db, j) => { if (seen[i][a] && seen[i][a] === seen[j][b]) list.push({i, j, sum: da + db}); }));
    return list.sort((p, q) => p.sum - q.sum);
  });
  if (options.some(list => !list.length)) return null;
  const pairs = options[0].flatMap(v => options[1].map(h => ({v, h, sum: v.sum + h.sum}))).sort((p, q) => p.sum - q.sum).slice(0, tries);
  for (const {v, h} of pairs) {
    // Each pixel in a band takes its nearest side's reading, sides measured by their own depths.
    const choice = [v.i, h.i, v.j, h.j], depth = choice.map(i => usable[i] * n / width), out = mask.slice();
    let changed = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const relative = [y, n - 1 - x, n - 1 - y, x].map((d, side) => d / depth[side]), nearest = Math.min(...relative), side = relative.indexOf(nearest);
      if (nearest < 1) out[y * n + x] = read[choice[side]][y * n + x];
      changed += out[y * n + x] !== mask[y * n + x];
    }
    if (changed > maxChange * n * n) continue;
    const ends = seenOf(out);
    if (ends[0] && ends[1] && ends[0] === ends[2] && ends[1] === ends[3]) return out;
  }
  return null;
}

/** Additional routing seeds when one pair of opposite edges disagrees.
 * Change one edge at a time, read no deeper than 16% of the square and edit
 * no wider than 8%. These are initialization masks, never image references.
 * The other three sides retain the ordinary 3 mm border interpretation.
 */
export function oppositeBorderSeeds(mask, n, width, minimumStripWidth = 2.5) {
  const radius = 3, baseline = stabilizeBorder(mask, n, width, radius, minimumStripWidth);
  const before = baseline.metadata.transitionsAfter, sides = [];
  for (const [a, b] of [[0, 2], [1, 3]]) if (before[a] !== before[b]) sides.push(a, b);
  // With both pairs inconsistent, a single-edge extension cannot repair the
  // endpoint model. Leave that case to the independent-grid fitter.
  if (sides.length !== 2) return [];
  const candidates = [];
  for (let percent = Math.floor(100 * radius / width) + 1; percent <= 8; percent++) {
    const inset = percent * width / 100, extended = extendBorder(mask, n, width, inset, minimumStripWidth).mask;
    for (const changedSide of sides) {
      const radii = [radius, radius, radius, radius]; radii[changedSide] = inset;
      const out = mask.slice();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const distances = [y, n - 1 - x, n - 1 - y, x], relative = distances.map((d, side) => d * width / (radii[side] * n));
        const nearest = Math.min(...relative), side = relative.indexOf(nearest);
        if (nearest < 1) out[y * n + x] = (side === changedSide ? extended : baseline.mask)[y * n + x];
      }
      const after = borderTransitions(out, n);
      if (!after[0] || !after[1] || after[0] !== after[2] || after[1] !== after[3]) continue;
      let changes = 0; for (let i = 0; i < out.length; i++) changes += out[i] !== mask[i];
      candidates.push({ mask: out, metadata: { radiiMm: radii, changedSide, transitionsBefore: before, transitionsAfter: after,
        changedPixels: changes, changeFraction: changes / out.length, initializationOnly: true } });
    }
  }
  return candidates;
}
