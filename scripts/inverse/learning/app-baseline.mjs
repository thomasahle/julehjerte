/** Replay the automatic app's boundary initializer on frozen learning masks. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { prepareBoundary } from '../../../static/inverse/core/direct/topology.js';
import { AUTOMATIC_PRESET } from '../../../static/inverse/core/presets.js';
import { settings } from '../../../static/inverse/core/settings.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function appBoundary(mask, resolution, classification = {}) {
  const cfg = settings({ ...AUTOMATIC_PRESET, resolution });
  const input = { width: cfg.width, curves: [],
    sourceImage: { mask, probability: Float32Array.from(mask), resolution },
    metadata: { preprocessing: classification } };
  return prepareBoundary(input, cfg);
}

export function evaluationViews(dataset) {
  const train = dataset.baseDesigns.filter(d => d.split === 'train')
    .sort((a, b) => a.geometrySha256 < b.geometrySha256 ? -1 : a.geometrySha256 > b.geometrySha256 ? 1 : 0);
  const development = new Set(train.filter((_, i) => i % 5 === 0).map(d => d.id));
  const splits = new Map(dataset.baseDesigns.map(d => [d.id,
    d.split === 'train' ? development.has(d.id) ? 'development' : 'train' : `recipe-${d.split}`]));
  return new Map(dataset.views.filter(v => splits.get(v.designId) !== 'train').map(v => [v.id, splits.get(v.designId)]));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')));
  if (!args.output || Object.keys(args).some(k => !['prepared', 'output'].includes(k))) throw new Error('Use --prepared=directory --output=new-directory.');
  const prepared = path.resolve(args.prepared || 'tmp/heart-learning/prepared-v1'), output = path.resolve(args.output);
  const input = await fs.readFile(path.join(prepared, 'manifest.json')), source = JSON.parse(input);
  const datasetBytes = await fs.readFile(path.join(source.dataset, 'manifest.json')), dataset = JSON.parse(datasetBytes);
  if (source.status !== 'complete' || hash(datasetBytes) !== source.datasetManifestSha256) throw new Error('Incomplete or changed frozen inputs.');
  const selected = evaluationViews(dataset);
  const ids = source.rows.map(r => r.id), viewIds = new Set(dataset.views.map(v => v.id));
  if (new Set(ids).size !== ids.length || ids.length !== viewIds.size || ids.some(id => !viewIds.has(id))) throw new Error('Frozen preprocessing omits or duplicates views.');
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
  const report = { schema: 'heart-app-boundary-baseline-1', status: 'preparing', prepared,
    preparedManifestSha256: hash(input), datasetManifestSha256: hash(datasetBytes),
    configuration: { ...AUTOMATIC_PRESET, resolution: source.resolution },
    method: 'The current automatic app prepareBoundary initializer at the frozen study resolution; no solver, reference curves or palette enter this replay.',
    sourceHashes: {}, rows: [] };
  for (const file of ['scripts/inverse/learning/app-baseline.mjs', ...(await fs.readdir('static/inverse/core', { recursive: true })).filter(p => p.endsWith('.js')).map(p => `static/inverse/core/${p}`)]) {
    report.sourceHashes[file] = hash(await fs.readFile(file));
  }
  const save = () => fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    for (const row of source.rows.filter(r => selected.has(r.id))) {
      const asset = row.assets['mask.png'], file = path.resolve(prepared, asset.path);
      if (!file.startsWith(prepared + path.sep)) throw new Error('Mask path escapes prepared directory.');
      const bytes = await fs.readFile(file);
      if (hash(bytes) !== asset.sha256) throw new Error(`Changed mask ${row.id}`);
      const image = await loadImage(bytes), n = source.resolution;
      if (image.width !== n || image.height !== n) throw new Error(`Changed dimensions ${row.id}`);
      const canvas = createCanvas(n, n), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, n, n).data;
      const mask = Uint8Array.from({ length: n*n }, (_, i) => {
        if (![0, 255].includes(pixels[4*i]) || pixels[4*i+1] !== pixels[4*i] || pixels[4*i+2] !== pixels[4*i]) throw new Error('Expected frozen binary mask.');
        return pixels[4*i]/255;
      });
      const started = performance.now(); let target = null, error = null;
      try { target = appBoundary(mask, n, row.classification); } catch (e) { error = e.message; }
      const trace = JSON.stringify({ width: 100, curves: target?.curves.map(c => c.p) || [], metadata: target?.metadata, error });
      const name = `${row.id}.json`; await fs.writeFile(path.join(output, name), trace);
      report.rows.push({ id: row.id, designId: row.designId, split: selected.get(row.id), inputMaskSha256: asset.sha256,
        traceSeconds: (performance.now() - started)/1000, traceError: error, trace: { path: name, sha256: hash(trace) } });
      if (report.rows.length % 16 === 0) { await save(); console.log(report.rows.length, '/', selected.size); }
    }
    report.status = 'complete'; await save();
    console.log(JSON.stringify({ views: report.rows.length, failures: report.rows.filter(r => r.traceError).length }));
  } catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
