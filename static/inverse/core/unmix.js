/** Empirical sRGB paper mixture, ported from heart_recrop_study/code/unmix.py.
 * Scalar illumination is fitted separately from red/white coverage. This is
 * an image estimate; it is not a calibrated camera or a ground-truth mask.
 */
export function unmixRGB(rgb, red, white) {
  if (!rgb.length || rgb.length % 3 || red?.length !== 3 || white?.length !== 3) throw new Error('Expected RGB pixels and two three-channel paper colours.');
  if (![...red, ...white].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Paper colours must be finite and nonnegative.');
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const rr = dot(red, red), ww = dot(white, white), rw = dot(red, white), det = rr * ww - rw * rw;
  const largest = (rr + ww + Math.hypot(rr - ww, 2 * rw)) / 2;
  if (!(det > largest * largest / 1e10)) throw new Error('These paper colours cannot be separated from changes in lighting. Try two colour groups.');
  const n = rgb.length / 3, probability = new Float64Array(n), illumination = new Float64Array(n), residual = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let ir = 0, iw = 0;
    for (let k = 0; k < 3; k++) {
      const value = rgb[3 * i + k];
      if (!Number.isFinite(value) || value < 0) throw new Error('Image colours must be finite and nonnegative.');
      ir += value * red[k]; iw += value * white[k];
    }
    let u = (ir * ww - iw * rw) / det, v = (iw * rr - ir * rw) / det;
    // The NNLS optimum is either the interior solution or a paper-colour ray.
    if (u < 0) { u = 0; v = iw / ww; }
    if (v < 0) { v = 0; u = ir / rr; }
    illumination[i] = u + v;
    probability[i] = Math.max(0, Math.min(1, u / Math.max(u + v, 1e-8)));
    let error = 0;
    for (let k = 0; k < 3; k++) error += (u * red[k] + v * white[k] - rgb[3 * i + k]) ** 2;
    residual[i] = Math.sqrt(error);
  }
  return { probability, illumination, residual };
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction, i = Math.floor(position), t = position - i;
  return sorted[i] * (1 - t) + sorted[Math.min(i + 1, sorted.length - 1)] * t;
}

/** Estimate the two palettes from high-confidence interior samples, as in the
 * supplied experiment. Chroma chooses samples only; NNLS classifies all pixels.
 */
export function redWhiteMixture(rgb) {
  const n = rgb.length / 3, side = Math.sqrt(n);
  if (!Number.isInteger(side) || side < 8) throw new Error('A square photograph is required for paper-colour estimation.');
  const inset = Math.max(1, Math.floor(side * 12 / 256)), core = [], chroma = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    chroma[i] = (rgb[3 * i] - rgb[3 * i + 1]) / (rgb[3 * i] + rgb[3 * i + 1] + .03 * 255);
    const x = i % side, y = Math.floor(i / side);
    if (x >= inset && y >= inset && x < side - inset && y < side - inset) core.push(i);
  }
  const sorted = core.map(i => chroma[i]).sort((a, b) => a - b);
  let centers = [.2, .8].map(q => quantile(sorted, q));
  for (let round = 0; round < 15; round++) {
    const sums = [0, 0], counts = [0, 0];
    for (const i of core) { const k = Math.abs(chroma[i] - centers[0]) <= Math.abs(chroma[i] - centers[1]) ? 0 : 1; sums[k] += chroma[i]; counts[k]++; }
    if (counts.some(v => !v)) throw new Error('Could not find both red and white paper. Try two colour groups.');
    centers = sums.map((v, k) => v / counts[k]);
  }
  centers.sort((a, b) => a - b);
  const [low, high] = centers;
  if (high - low < .08) throw new Error('Could not distinguish red and white paper. Try two colour groups.');
  const samples = [core.filter(i => (chroma[i] - low) / (high - low) > .92), core.filter(i => (chroma[i] - low) / (high - low) < .08)];
  if (samples.some(s => s.length < Math.max(8, core.length * .01))) throw new Error('Too few clear paper-colour samples. Adjust the crop or try two colour groups.');
  const palettes = samples.map(indices => [0, 1, 2].map(k => quantile(indices.map(i => rgb[3 * i + k]).sort((a, b) => a - b), .5) / 255));
  const result = unmixRGB(Float64Array.from(rgb, v => v / 255), ...palettes);
  // Match the experiment's stored float32 probabilities and strict > 0.5 cut.
  const probability = Float32Array.from(result.probability), mask = Uint8Array.from(probability, p => Number(p > .5));
  return { mask, probability, metadata: {
    model: 'Nonnegative sRGB paper mixture with scalar illumination', paperPalettesSRGB: palettes,
    sampleCounts: samples.map(s => s.length), sampleInsetFraction: inset / side,
    rmsColorResidual: Math.sqrt(result.residual.reduce((s, v) => s + v * v, 0) / n),
    redFraction: mask.reduce((s, v) => s + v, 0) / n,
  } };
}
