/** Evaluation-side reference importer and renderer. Never pass its cuts to a blind solver. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import { Resvg } from '@resvg/resvg-js';
import { createCanvas, loadImage } from 'canvas';
import { Cubic, pathPolyline, distance, segmentDistance } from '../../static/inverse/core/bezier.js';

export async function referenceEnvironment() {
  const root = process.cwd(), dom = new JSDOM('');
  globalThis.DOMParser = dom.window.DOMParser; globalThis.Element = dom.window.Element; globalThis.Node = dom.window.Node;
  const server = await createServer({ root, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false, watch: null, preTransformRequests: false }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { $lib: path.join(root, 'src/lib') } } });
  const { parseHeartFromSVG } = await server.ssrLoadModule('/src/lib/utils/heartDesign.ts');
  const { computeWeaveData } = await server.ssrLoadModule('/src/lib/rendering/svgWeave.ts');
  return {
    async load(id, resolution = 600) {
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid reference identifier.');
      const source = await fs.readFile(`static/hearts/${id}.svg`, 'utf8'), design = parseHeartFromSVG(source, `${id}.svg`);
      if (!design) throw new Error(`Reference importer rejected ${id}.`);
      const weave = computeWeaveData(design.fingers, design.gridSize, design.weaveParity), { left, top, width, height } = weave.overlap;
      if (Math.abs(width - height) > 0.01) throw new Error('Rectangular reference requires a separately labelled aspect-ratio experiment.');
      const strips = [...weave.rightOnTopStrips, ...weave.leftOnTopStrips].map(s => s.pathData).join(' ');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${resolution}" height="${resolution}" viewBox="${left} ${top} ${width} ${height}"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="white"/><path d="${strips}" fill="black" fill-rule="evenodd"/></svg>`;
      const png = new Resvg(svg).render().asPng(), canvas = createCanvas(resolution, resolution), context = canvas.getContext('2d');
      context.drawImage(await loadImage(png), 0, 0);
      const rgba = context.getImageData(0, 0, resolution, resolution).data;
      const curves = {}, families = [[], []];
      for (const finger of design.fingers) {
        const family = finger.lobe === 'right' ? 0 : 1;
        let cs = finger.segments.map(s => ['p0', 'p1', 'p2', 'p3'].map(k => [(s[k].x - left) * 100 / width, (s[k].y - top) * 100 / height]));
        const sideAxis = family === 0 ? 0 : 1;
        if ([0, 100].some(side => cs.every(c => c.every(p => Math.abs(p[sideAxis] - side) < 1e-5)))) continue;
        const directionAxis = 1 - sideAxis;
        if (cs[0][0][directionAxis] > cs.at(-1)[3][directionAxis]) cs = cs.reverse().map(c => c.reverse());
        const cut = cs.map(control_points => { const id = String(Object.keys(curves).length); curves[id] = { control_points, visible_boundary: true }; return { curve: id, reverse: false }; });
        families[family].push(cut);
      }
      for (let k = 0; k < 2; k++) families[k].sort((a, b) => curves[a[0].curve].control_points[0][k === 0 ? 0 : 1] - curves[b[0].curve].control_points[0][k === 0 ? 0 : 1]);
      const cuts = { schema: 'heartcurves-2', units: 'mm', square_width_mm: 100, phase: design.weaveParity, paper_colors: ['#b91313', '#ffffff'], curves, A_overlap_paths: families[0], B_overlap_paths: families[1] };
      return { id, source, sourceSha256: createHash('sha256').update(source).digest('hex'), design, overlap: weave.overlap, svg, png, input: { type: 'pixels', rgba, imageWidth: resolution, imageHeight: resolution }, cuts };
    },
    async close() { await server.close(); dom.window.close(); }
  };
}
function polylines(data, family, tolerance) {
  if (!(data.square_width_mm > 0)) throw new Error('Reference comparison requires a positive square width.');
  const scale = 100 / data.square_width_mm;
  return data[family === 0 ? 'A_overlap_paths' : 'B_overlap_paths'].map(path => pathPolyline(path.map(ref => {
    const p = data.curves[ref.curve].control_points.map(p => p.map(v => v * scale));
    return new Cubic(ref.reverse ? p.slice().reverse() : p);
  }), tolerance)).map(p => p[0][family === 0 ? 1 : 0] > p.at(-1)[family === 0 ? 1 : 0] ? p.reverse() : p).sort((a, b) => a[0][family === 0 ? 0 : 1] - b[0][family === 0 ? 0 : 1]);
}
function uniformSamples(poly, step) {
  const lengths = poly.slice(1).map((p, i) => distance(poly[i], p)), total = lengths.reduce((a, b) => a + b, 0), count = Math.max(1, Math.ceil(total / step));
  const samples = []; let j = 0, start = 0;
  for (let i = 0; i <= count; i++) {
    const s = total * i / count;
    while (j < lengths.length - 1 && start + lengths[j] < s) start += lengths[j++];
    const t = lengths[j] ? (s - start) / lengths[j] : 0;
    samples.push(poly[j].map((v, k) => v + t * (poly[j + 1][k] - v)));
  }
  return { samples, length: total };
}
export function compareCutPaths(generated, reference, { step = 0.1, chordTolerance = 0.005 } = {}) {
  if (!(step > 0 && chordTolerance > 0)) throw new Error('Comparison tolerances must be positive.');
  const families = [], allDistances = [];
  for (let k = 0; k < 2; k++) {
    const actual = polylines(generated, k, chordTolerance), expected = polylines(reference, k, chordTolerance), slits = [];
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
      const a = uniformSamples(actual[i], step), b = uniformSamples(expected[i], step), values = [];
      for (const [sample, poly] of [[a.samples, expected[i]], [b.samples, actual[i]]]) for (const p of sample) values.push(Math.min(...poly.slice(1).map((q, j) => segmentDistance(p, poly[j], q))));
      allDistances.push(...values);
      slits.push({ index: i, symmetricMeanMm: values.reduce((s, x) => s + x, 0) / values.length, symmetricRmsMm: Math.sqrt(values.reduce((s, x) => s + x * x, 0) / values.length), sampledMaximumMm: Math.max(...values), endpointMaximumMm: Math.max(distance(actual[i][0], expected[i][0]), distance(actual[i].at(-1), expected[i].at(-1))), generatedLengthMm: a.length, referenceLengthMm: b.length });
    }
    families.push({ family: k === 0 ? 'right/A' : 'left/B', generatedSlits: actual.length, referenceSlits: expected.length, unmatchedSlits: Math.abs(actual.length - expected.length), slits });
  }
  return { coordinateSystem: '100 mm square overlap; fixed family assignment and endpoint order; no fitted transform', sampleStepMm: step, chordToleranceMm: chordTolerance, maximumSamplingErrorBoundMm: step / 2 + 2 * chordTolerance, unmatchedSlits: families.reduce((s, f) => s + f.unmatchedSlits, 0), symmetricRmsMm: allDistances.length ? Math.sqrt(allDistances.reduce((s, x) => s + x * x, 0) / allDistances.length) : null, symmetricMeanMm: allDistances.length ? allDistances.reduce((a, b) => a + b, 0) / allDistances.length : null, sampledMaximumMm: allDistances.length ? allDistances.reduce((a, b) => Math.max(a, b), 0) : null, families };
}
export function cutOverlay(generated, reference) {
  const panels = [0, 1].map(k => {
    const paths = (d, colour) => polylines(d, k, 0.01).map(p => `<polyline fill="none" stroke="${colour}" stroke-width="0.35" points="${p.map(p => p.join(',')).join(' ')}"/>`).join('');
    return `<g transform="translate(${k * 115 + 5},18)"><rect width="100" height="100" fill="white" stroke="#bbb"/>${paths(reference, '#1975cf')}${paths(generated, '#d42040')}<text y="-5" font-size="4">${k === 0 ? 'Right / A' : 'Left / B'}</text></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 130" width="1150" height="650">${panels.join('')}<text x="5" y="127" font-size="4">Blue: published cuts · Red: generated cuts · fixed 100 mm overlap coordinates</text></svg>`;
}
