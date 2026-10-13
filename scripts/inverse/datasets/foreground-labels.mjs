/** Physical paper occupancy for complete synthetic photographs. This label
 * includes both lobes and both paper colours, before blur, glare and shadows.
 * It is independent of any classifier, crop proposal or inferred cut graph.
 */
import { createCanvas, loadImage } from 'canvas';
import { invert, project } from './synthetic-photo.mjs';

export function photoForeground(labels) {
  const { resolution: n, canonicalToPhoto: h } = labels || {};
  if (labels?.schema !== 'woven-heart-synthetic-view-1' || !Number.isInteger(n) || n < 16 || n > 4096 || !Array.isArray(h) || h.length !== 9 || !Array.from(h).every(Number.isFinite)) throw new Error('Expected supported synthetic photo labels, resolution and finite camera transform.');
  const inverse = invert(h), mask = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [u, v] = project(inverse, [x + .5, y + .5]);
    mask[y * n + x] = Number(
      u >= 0 && u <= 100 && v >= 0 && v <= 100 ||
      v < 0 && (u - 50) ** 2 + v ** 2 <= 2500 ||
      u < 0 && u ** 2 + (v - 50) ** 2 <= 2500
    );
  }
  return mask;
}

export function foregroundPNG(mask, n) {
  if (mask.length !== n * n || mask.some(v => v !== 0 && v !== 1)) throw new Error('Expected a square binary foreground mask.');
  const canvas = createCanvas(n, n), ctx = canvas.getContext('2d'), image = ctx.createImageData(n, n);
  for (let i = 0; i < mask.length; i++) image.data.set([255 * mask[i], 255 * mask[i], 255 * mask[i], 255], 4 * i);
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}

export async function verifyForegroundPNG(bytes, labels) {
  const image = await loadImage(bytes), n = labels.resolution;
  if (image.width !== n || image.height !== n) throw new Error('Foreground dimensions disagree with camera labels.');
  const ctx = createCanvas(n, n).getContext('2d'); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, n, n).data, mask = photoForeground(labels);
  for (let i = 0; i < mask.length; i++) {
    const value = 255 * mask[i];
    if (pixels[4 * i] !== value || pixels[4 * i + 1] !== value || pixels[4 * i + 2] !== value || pixels[4 * i + 3] !== 255) throw new Error('Foreground pixels disagree with physical paper geometry.');
  }
  return { foregroundPixels: mask.reduce((sum, v) => sum + v, 0), pixels: mask.length };
}
