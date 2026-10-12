/** Freeze production preprocessing for a synthetic learning ablation. No solver or reference graph enters classification. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { rectify, quantize, preprocessMask } from '../../../static/inverse/core/input.js';
import { GENERAL_PRESET } from '../../../static/inverse/core/presets.js';
import { settings } from '../../../static/inverse/core/settings.js';

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')));
for (const key of Object.keys(args)) if (!['dataset', 'output', 'resolution'].includes(key)) throw new Error(`Unknown option ${key}`);
const dataset = path.resolve(args.dataset || 'tmp/heart-training-synthetic/batch-v1'), output = path.resolve(args.output || 'tmp/heart-learning/prepared-v1');
const resolution = Number(args.resolution || 384), hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (!Number.isInteger(resolution) || resolution < 64 || resolution > 512) throw new Error('Use resolution 64..512.');
const source = await fs.readFile(path.join(dataset, 'manifest.json')), manifest = JSON.parse(source);
if (manifest.status !== 'complete' || manifest.sourceProvenance.externalAssets.length || manifest.splitPolicy.existingPhotoQAIncluded || manifest.splitPolicy.existingHunodanQAIncluded || manifest.splitPolicy.existingGalleryIncluded) throw new Error('Require a complete purely procedural dataset.');
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
const configuration = { ...settings(GENERAL_PRESET), ...GENERAL_PRESET, resolution };
const result = { schema: 'heart-learning-preprocessing-1', dataset, datasetManifestSha256: hash(source), resolution, configuration, rows: [], status: 'preparing', sourceHashes: {} };
for (const file of ['scripts/inverse/learning/prepare.mjs', ...['input', 'bezier', 'border', 'junctions', 'polygonal', 'geometry', 'unmix', 'presets', 'settings'].map(name => `static/inverse/core/${name}.js`)]) result.sourceHashes[file] = hash(await fs.readFile(file));
function png(values, channels) {
  const c = createCanvas(resolution, resolution), ctx = c.getContext('2d'), image = ctx.createImageData(resolution, resolution);
  for (let i = 0; i < resolution ** 2; i++) { for (let k = 0; k < 3; k++) image.data[4 * i + k] = channels === 3 ? values[3 * i + k] : values[i] * 255; image.data[4 * i + 3] = 255; }
  ctx.putImageData(image, 0, 0); return c.toBuffer('image/png');
}
const save = () => fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
await save();
for (const view of manifest.views) {
  const started = performance.now(), input = await fs.readFile(path.join(dataset, view.assets['crop.png'].path));
  if (hash(input) !== view.assets['crop.png'].sha256) throw new Error(`Changed input ${view.id}`);
  const image = await loadImage(input), c = createCanvas(image.width, image.height), ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
  const rgb = rectify(ctx.getImageData(0, 0, image.width, image.height).data, image.width, image.height, resolution), classified = quantize(rgb);
  const classifiedSeconds = (performance.now() - started) / 1000;
  const row = { id: view.id, designId: view.designId, split: view.split, inputSha256: hash(input), classification: classified.metadata, classifiedSeconds };
  const traceStarted = performance.now(); let curves = [], traceError = null;
  try { curves = preprocessMask(classified.mask, resolution, configuration, classified.metadata).curves.map(c => c.p); }
  catch (error) { traceError = error.message; }
  row.traceSeconds = (performance.now() - traceStarted) / 1000;
  row.traceError = traceError;
  await fs.mkdir(path.join(output, view.id));
  row.assets = {};
  for (const [name, bytes] of Object.entries({ 'rgb.png': png(rgb, 3), 'mask.png': png(classified.mask, 1), 'trace.json': JSON.stringify({ width: 100, curves, error: traceError }) })) {
    const relative = `${view.id}/${name}`; await fs.writeFile(path.join(output, relative), bytes); row.assets[name] = { path: relative, sha256: hash(bytes) };
  }
  result.rows.push(row);
  if (result.rows.length % 16 === 0) { await save(); process.stdout.write(`${result.rows.length}/${manifest.views.length}\n`); }
}
result.status = 'complete'; await save();
process.stdout.write(JSON.stringify({ views: result.rows.length, failures: result.rows.filter(r => r.traceError).length }) + '\n');
