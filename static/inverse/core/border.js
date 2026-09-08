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
