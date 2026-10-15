/** Offline experiment: use a predicted body only to suggest a rough selection.
 * The photographic locator still determines corners and paper colours.
 */
export function foregroundRoi(probability, {
  resolution, window, width, height, threshold = 0.5, padding = 0.1, minPixels = 16,
}) {
  if (!Number.isInteger(resolution) || resolution < 2 || probability.length !== resolution ** 2
    || !probability.every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    || !Array.isArray(window) || window.length !== 4 || !window.every(Number.isFinite)
    || window[2] <= window[0] || window[3] <= window[1]
    || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
    || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1
    || !Number.isFinite(padding) || padding < 0 || padding > 1
    || !Number.isInteger(minPixels) || minPixels < 1) {
    throw new Error('Invalid foreground ROI input.');
  }
  const dx = (window[2] - window[0]) / resolution;
  const dy = (window[3] - window[1]) / resolution;
  const selected = new Uint8Array(probability.length);
  let totalForegroundPixels = 0;
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const sx = window[0] + (x + 0.5) * dx, sy = window[1] + (y + 0.5) * dy;
    const i = y * resolution + x;
    // Ignore predicted foreground in the network's letterbox padding.
    if (sx >= 0 && sx < width && sy >= 0 && sy < height && probability[i] >= threshold) {
      selected[i] = 1;
      totalForegroundPixels++;
    }
  }
  const queue = new Int32Array(selected.length);
  let largest = null, componentCount = 0;
  for (let seed = 0; seed < selected.length; seed++) {
    if (!selected[seed]) continue;
    selected[seed] = 0;
    queue[0] = seed;
    let head = 0, tail = 1, xmin = resolution, ymin = resolution, xmax = 0, ymax = 0;
    while (head < tail) {
      const i = queue[head++], x = i % resolution, y = Math.floor(i / resolution);
      xmin = Math.min(xmin, x); ymin = Math.min(ymin, y);
      xmax = Math.max(xmax, x + 1); ymax = Math.max(ymax, y + 1);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(resolution - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(resolution - 1, x + 1); nx++) {
          const j = ny * resolution + nx;
          if (selected[j]) { selected[j] = 0; queue[tail++] = j; }
        }
      }
    }
    componentCount++;
    if (!largest || tail > largest.pixels) largest = { pixels: tail, bounds: [xmin, ymin, xmax, ymax] };
  }
  const evidence = { threshold, padding, minPixels, componentCount, totalForegroundPixels };
  if (!largest || largest.pixels < minPixels) return { ...evidence, roi: null, reason: 'No substantial predicted body component.' };
  const [x0, y0, x1, y1] = largest.bounds;
  const bounds = [Math.max(0, window[0] + x0 * dx), Math.max(0, window[1] + y0 * dy),
    Math.min(width, window[0] + x1 * dx), Math.min(height, window[1] + y1 * dy)];
  const px = (bounds[2] - bounds[0]) * padding, py = (bounds[3] - bounds[1]) * padding;
  const roi = [Math.max(0, bounds[0] - px), Math.max(0, bounds[1] - py),
    Math.min(width, bounds[2] + px), Math.min(height, bounds[3] + py)];
  return { ...evidence, roi, componentBounds: bounds, componentPixels: largest.pixels,
    method: 'Largest eight-connected predicted body component; padded axis-aligned selection only.' };
}
