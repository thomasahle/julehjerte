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

/** The mask with each pair of opposite sides read from deeper inside
 * (extendBorder) at the shallowest `depths` (mm, at most 8% of the width) at
 * which a band of `seenAt` mm (the exact search's tracer's) finds as many colour
 * changes on both sides, and some: a photograph's crop a little off the square
 * shows a corner's strip on one side only, or a lobe's colour along one. Null
 * when a pair has no such depths, or the reading changes more than `maxChange`
 * of the mask.
 */
export function pairedBorderReading(mask, n, width, {depths = [1, 1.5, 2, 3, 4, 5, 6, 7, 8], seenAt = 1, minimumStripWidth = 2.5, maxChange = 1} = {}) {
  const usable = depths.filter(d => d <= .08 * width);
  const read = usable.map(d => extendBorder(mask, n, width, d, minimumStripWidth).mask);
  const seen = read.map(m => extendBorder(m, n, width, seenAt, minimumStripWidth).metadata.transitionsAfter);
  const choice = [];
  for (const [a, b] of [[0, 2], [1, 3]]) {
    let best = null;
    usable.forEach((da, i) => usable.forEach((db, j) => {
      if (seen[i][a] && seen[i][a] === seen[j][b] && (!best || da + db < best.sum)) best = {i, j, sum: da + db};
    }));
    if (!best) return null;
    choice[a] = best.i; choice[b] = best.j;
  }
  // Each pixel in a band takes its nearest side's reading, sides measured by their own depths.
  const out = mask.slice(), depth = choice.map(i => usable[i] * n / width);
  let changed = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const relative = [y, n - 1 - x, n - 1 - y, x].map((d, side) => d / depth[side]), nearest = Math.min(...relative), side = relative.indexOf(nearest);
    if (nearest < 1) out[y * n + x] = read[choice[side]][y * n + x];
    changed += out[y * n + x] !== mask[y * n + x];
  }
  return changed <= maxChange * n * n ? out : null;
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
