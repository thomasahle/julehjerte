/** Seeded raster simulation. Geometry remains exact in canonical coordinates. */
import { createCanvas, loadImage } from 'canvas';
import { random } from './synthetic-geometry.mjs';

export function project(h, [x, y]) {
  const z = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z];
}
export function invert(h) {
  const [a, b, c, d, e, f, g, i, j] = h;
  const adj = [e * j - f * i, c * i - b * j, b * f - c * e, f * g - d * j, a * j - c * g, c * d - a * f, d * i - e * g, b * g - a * i, a * e - b * d];
  const det = a * adj[0] + b * adj[3] + c * adj[6];
  if (Math.abs(det) < 1e-12) throw new Error('Singular image transformation.');
  return adj.map(v => v / det);
}
export function multiply(a, b) {
  return Array.from({ length: 9 }, (_, i) => [0, 1, 2].reduce((s, k) => s + a[3 * Math.floor(i / 3) + k] * b[3 * k + i % 3], 0));
}
export function homography(from, to) {
  const rows = from.flatMap(([x, y], i) => {
    const [u, v] = to[i];
    return [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
  });
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    const divisor = rows[c][c];
    if (Math.abs(divisor) < 1e-12) throw new Error('Degenerate quadrilateral.');
    rows[c] = rows[c].map(v => v / divisor);
    for (let r = 0; r < 8; r++) if (r !== c) { const factor = rows[r][c]; rows[r] = rows[r].map((v, k) => v - factor * rows[c][k]); }
  }
  return [...rows.map(r => r[8]), 1];
}
export const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100]];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function sample(values, width, x, y, channels = 1, channel = 0) {
  x = clamp(x, 0, width - 1); y = clamp(y, 0, width - 1);
  const a = Math.floor(x), b = Math.floor(y), c = Math.min(a + 1, width - 1), d = Math.min(b + 1, width - 1), u = x - a, v = y - b;
  const get = (x, y) => values[(y * width + x) * channels + channel];
  return (1 - v) * ((1 - u) * get(a, b) + u * get(c, b)) + v * ((1 - u) * get(a, d) + u * get(c, d));
}
function material(point, coverage, n) {
  const [x, y] = point;
  if (x >= 0 && x <= 100 && y >= 0 && y <= 100) return { foreground: true, overlap: true, fractionA: sample(coverage, n, x * n / 100 - .5, y * n / 100 - .5) };
  if (y < 0 && (x - 50) ** 2 + y ** 2 <= 2500) return { foreground: true, overlap: false, fractionA: 1 };
  if (x < 0 && x ** 2 + (y - 50) ** 2 <= 2500) return { foreground: true, overlap: false, fractionA: 0 };
  return { foreground: false, overlap: false, fractionA: 0 };
}
function blur(pixels, n, sigma) {
  const radius = Math.ceil(3 * sigma), kernel = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-((i - radius) ** 2) / (2 * sigma ** 2))), sum = kernel.reduce((a, b) => a + b);
  const horizontal = new Float32Array(pixels.length), output = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let k = 0; k < 3; k++) {
    let v = 0; for (let j = -radius; j <= radius; j++) v += kernel[j + radius] * pixels[4 * (y * n + clamp(x + j, 0, n - 1)) + k];
    horizontal[4 * (y * n + x) + k] = v / sum;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    for (let k = 0; k < 3; k++) { let v = 0; for (let j = -radius; j <= radius; j++) v += kernel[j + radius] * horizontal[4 * (clamp(y + j, 0, n - 1) * n + x) + k]; output[4 * (y * n + x) + k] = v / sum; }
    output[4 * (y * n + x) + 3] = 255;
  }
  return output;
}
function canvasFrom(pixels, n) {
  const canvas = createCanvas(n, n), ctx = canvas.getContext('2d'), image = ctx.createImageData(n, n);
  image.data.set(pixels); ctx.putImageData(image, 0, 0); return canvas;
}
function grayPNG(values, n) {
  const pixels = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < values.length; i++) { pixels[4 * i] = pixels[4 * i + 1] = pixels[4 * i + 2] = Math.round(255 * values[i]); pixels[4 * i + 3] = 255; }
  return canvasFrom(pixels, n).toBuffer('image/png');
}

export async function syntheticPhoto({ coverage, canonicalResolution, graph, seed, resolution = 256 }) {
  const rng = random(seed), uniform = (a, b) => a + (b - a) * rng();
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
  const angle = uniform(-Math.PI, Math.PI), scale = resolution / uniform(220, 270), c = Math.cos(angle), s = Math.sin(angle), center = [resolution * uniform(.42, .58), resolution * uniform(.42, .58)];
  const quad = SQUARE.map(([x, y]) => [center[0] + scale * (c * (x - 25) - s * (y - 25)) + uniform(-.025, .025) * resolution, center[1] + scale * (s * (x - 25) + c * (y - 25)) + uniform(-.025, .025) * resolution]);
  const h = homography(SQUARE, quad), inverse = invert(h);
  const palettes = [[[176, 18, 28], [241, 237, 218]], [[198, 168, 56], [240, 236, 217]], [[30, 86, 51], [207, 35, 39]], [[31, 65, 115], [233, 236, 235]], [[93, 75, 121], [213, 174, 189]], [[200, 192, 177], [241, 236, 223]]];
  const palette = palettes[Math.floor(rng() * palettes.length)].map(color => color.map(v => clamp(v + uniform(-8, 8), 0, 255)));
  const light = [uniform(-.3, .3), uniform(-.3, .3)], exposure = uniform(.75, 1.15), vignette = uniform(0, .2), noiseSigma = uniform(.4, 2.5), texture = uniform(.4, 2);
  const background = [uniform(65, 165), uniform(65, 165), uniform(65, 165)], backgroundStyle = rng() < .5 ? 'wood-stripes' : 'soft-cloth';
  const pixels = new Uint8ClampedArray(4 * resolution ** 2), observedCoverage = new Float32Array(resolution ** 2), overlap = new Float32Array(resolution ** 2);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const index = y * resolution + x, canonical = project(inverse, [x + .5, y + .5]), m = material(canonical, coverage, canonicalResolution);
    // These supervision maps describe undegraded material coverage, not a color classifier's output.
    observedCoverage[index] = m.fractionA; overlap[index] = Number(m.overlap);
    const illumination = exposure * (1 + light[0] * (x / resolution - .5) + light[1] * (y / resolution - .5) - vignette * ((x / resolution - .5) ** 2 + (y / resolution - .5) ** 2));
    const grain = backgroundStyle === 'wood-stripes' ? 9 * Math.sin(y * .14 + 1.4 * Math.sin(x * .02)) : 4 * Math.sin(x * .21) * Math.sin(y * .23);
    const shadow = !m.foreground && material(project(inverse, [x - 3, y - 4]), coverage, canonicalResolution).foreground ? .78 : 1;
    for (let k = 0; k < 3; k++) {
      const base = m.foreground ? palette[0][k] * m.fractionA + palette[1][k] * (1 - m.fractionA) + gaussian() * texture : (background[k] + grain) * shadow;
      pixels[4 * index + k] = base * illumination + gaussian() * noiseSigma;
    }
    pixels[4 * index + 3] = 255;
  }
  const sigma = uniform(.35, 1.2), source = canvasFrom(blur(pixels, resolution, sigma), resolution);
  const downsample = uniform(.5, 1), lowSize = Math.max(16, Math.round(resolution * downsample)), low = createCanvas(lowSize, lowSize);
  low.getContext('2d').drawImage(source, 0, 0, lowSize, lowSize);
  const final = createCanvas(resolution, resolution); final.getContext('2d').drawImage(low, 0, 0, resolution, resolution);
  const jpegQuality = uniform(.58, .95), photo = final.toBuffer('image/jpeg', { quality: jpegQuality, chromaSubsampling: true });
  // Rectify the actually degraded JPEG with an imperfect crop proposal. This
  // makes the graph task include crop noise while retaining the correct label transform.
  const decoded = createCanvas(resolution, resolution), decodedContext = decoded.getContext('2d'); decodedContext.drawImage(await loadImage(photo), 0, 0);
  const photoPixels = decodedContext.getImageData(0, 0, resolution, resolution).data;
  const cropNoisePixels = uniform(.004, .025) * resolution, roughQuad = quad.map(p => p.map(v => v + gaussian() * cropNoisePixels));
  const cropToPhoto = homography(SQUARE.map(p => p.map(v => v * resolution / 100)), roughQuad), canonicalToCrop = multiply(invert(cropToPhoto), h);
  const cropPixels = new Uint8ClampedArray(pixels.length), cropCoverage = new Float32Array(resolution ** 2), cropValid = new Float32Array(resolution ** 2);
  const cropToCanonical = invert(canonicalToCrop);
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const i = y * resolution + x, point = [x + .5, y + .5], p = project(cropToPhoto, point), m = material(project(cropToCanonical, point), coverage, canonicalResolution);
    const visible = p[0] >= 0 && p[0] <= resolution && p[1] >= 0 && p[1] <= resolution;
    cropValid[i] = Number(visible && m.overlap); cropCoverage[i] = m.fractionA;
    for (let k = 0; k < 3; k++) cropPixels[4 * i + k] = visible ? sample(photoPixels, resolution, p[0] - .5, p[1] - .5, 4, k) : 127;
    cropPixels[4 * i + 3] = 255;
  }
  return {
    files: { 'photo.jpg': photo, 'crop.png': canvasFrom(cropPixels, resolution).toBuffer('image/png'), 'photo-paper-a.png': grayPNG(observedCoverage, resolution), 'photo-overlap-valid.png': grayPNG(overlap, resolution), 'crop-paper-a.png': grayPNG(cropCoverage, resolution), 'crop-overlap-valid.png': grayPNG(cropValid, resolution) },
    labels: {
      schema: 'woven-heart-synthetic-view-1', seed, resolution, canonicalToPhoto: h, canonicalToCrop, actualQuad: quad, proposedCropQuad: roughQuad,
      nodesPhoto: graph.nodes.map(p => project(h, p)), nodesCrop: graph.nodes.map(p => project(canonicalToCrop, p)),
      exactCurveProjection: 'Apply the homography to the canonical cubic at each parameter value. Projected control polygons are not ordinary polynomial cubics.',
      coverageSupervision: 'Fraction of paper A before blur/JPEG, bilinearly sampled from an independently rendered canonical mask. Use overlap-valid maps; backgrounds and lobes are outside the graph task.',
      perturbations: { angle, palette, light, exposure, vignette, noiseSigma, texture, background, backgroundStyle, blurSigmaPixels: sigma, lowResolution: lowSize, jpegQuality, cropNoisePixels },
      limitations: ['Procedural 2D planar photographs, not measured camera physics.', 'No paper thickness, actual occlusion, folds, specular foil or calibrated lens distortion.', 'Colors are empirically mixed in sRGB; target material coverage is saved separately.', 'Photometric views do not create new routing topologies.']
    }
  };
}
