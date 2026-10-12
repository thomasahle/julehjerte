/** Experimental paper-color fields. Only photographed RGB and an initial
 * classification enter the model; material labels are reserved for evaluation.
 * This is not yet selected by the application's automatic preprocessing.
 */
function median(values) {
  values.sort((a, b) => a - b);
  const m = Math.floor(values.length / 2);
  return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
}

function smooth(values, n, sigma) {
  const radius = Math.floor(4 * sigma + .5), kernel = [];
  let sum = 0;
  for (let j = -radius; j <= radius; j++) { const v = Math.exp(-.5 * (j / sigma) ** 2); kernel.push(v); sum += v; }
  for (let j = 0; j < kernel.length; j++) kernel[j] /= sum;
  const vertical = new Float64Array(values.length), result = new Float64Array(values.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    for (let j = -radius; j <= radius; j++) v += kernel[j + radius] * values[Math.max(0, Math.min(n - 1, y + j)) * n + x];
    vertical[y * n + x] = v;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    for (let j = -radius; j <= radius; j++) v += kernel[j + radius] * vertical[y * n + Math.max(0, Math.min(n - 1, x + j))];
    result[y * n + x] = v;
  }
  return result;
}

function sample(values, n, x, y) {
  x = Math.max(0, Math.min(n - 1, x)); y = Math.max(0, Math.min(n - 1, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, n - 1), y1 = Math.min(y0 + 1, n - 1), dx = x - x0, dy = y - y0;
  return (1 - dy) * ((1 - dx) * values[y0 * n + x0] + dx * values[y0 * n + x1]) + dy * ((1 - dx) * values[y1 * n + x0] + dx * values[y1 * n + x1]);
}

export function spatialPaperColors(rgb, initial) {
  const n = Math.sqrt(initial?.length ?? 0);
  if (!Number.isInteger(n) || n < 16 || n > 600 || rgb?.length !== 3 * n * n) throw new Error('Spatial color fitting requires a square 16–600 pixel RGB image and mask.');
  if (Array.from(initial).some(v => v !== 0 && v !== 1) || Array.from(rgb).some(v => !Number.isFinite(v) || v < 0 || v > 255)) throw new Error('Invalid RGB values or binary initial mask.');
  const stride = Math.max(1, Math.ceil(n / 96)), offset = Math.floor(stride / 2), size = Math.ceil((n - offset) / stride), count = size * size;
  const channels = Array.from({ length: 3 }, () => new Float64Array(count)), core = new Uint8Array(count), labels = new Uint8Array(count);
  const metadata = { method: 'Spatial RGB paper-color fields', experimental: true, gridSize: size, stride, sampleInsetFraction: .07, sigmaFraction: 1 / 12, prior: .01, steps: [] };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, original = (offset + stride * y) * n + offset + stride * x;
    labels[i] = initial[original];
    core[i] = Number(x >= .07 * size && x < .93 * size && y >= .07 * size && y < .93 * size);
    for (let c = 0; c < 3; c++) channels[c][i] = rgb[3 * original + c] / 255;
  }
  const global = [0, 1].map(k => channels.map(channel => {
    const values = [];
    for (let i = 0; i < count; i++) if (core[i] && labels[i] === k) values.push(channel[i]);
    return values.length ? median(values) : NaN;
  }));
  if (global.flat().some(v => !Number.isFinite(v))) return { mask: Uint8Array.from(initial), metadata: { ...metadata, fallback: 'Empty initial color population' } };
  metadata.initialGlobalColors = global;
  let centers;
  for (let step = 0; step < 12; step++) {
    centers = [0, 1].map(k => {
      const selected = Uint8Array.from(labels, (label, i) => Number(label === k && core[i])), interior = new Float64Array(count);
      let population = 0;
      for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
        let inside = 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) inside &= selected[(y + dy) * size + x + dx];
        interior[y * size + x] = inside; population += inside;
      }
      // Use pure-looking interiors to estimate colors. Thin populations still
      // retain their observed samples; they are never deleted from the mask.
      const weights = population >= 8 ? interior : selected, mass = smooth(weights, size, size / 12);
      return channels.map((channel, c) => {
        const total = smooth(Float64Array.from(channel, (v, i) => v * weights[i]), size, size / 12);
        return Float64Array.from(total, (v, i) => (v + .01 * global[k][c]) / (mass[i] + .01));
      });
    });
    let changes = 0;
    for (let i = 0; i < count; i++) {
      const distance = [0, 1].map(k => channels.reduce((s, channel, c) => s + (channel[i] - centers[k][c][i]) ** 2, 0));
      const next = Number(distance[1] < distance[0]); changes += next !== labels[i]; labels[i] = next;
    }
    metadata.steps.push({ changedFraction: changes / count });
    if (!changes) break;
  }
  // Interpolate the smooth color fields, never the coarse binary mask. This
  // leaves the final boundary location at the original photograph resolution.
  const mask = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, u = (x - offset) / stride, v = (y - offset) / stride;
    const distances = [0, 1].map(k => centers[k].reduce((s, channel, c) => s + (rgb[3 * i + c] / 255 - sample(channel, size, u, v)) ** 2, 0));
    mask[i] = Number(distances[1] < distances[0]);
  }
  metadata.changedFraction = mask.reduce((s, v, i) => s + Number(v !== initial[i]), 0) / mask.length;
  return { mask, metadata };
}
