/** Run the real automatic fitter on controlled synthetic photo interventions. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { prepare, design } from '../../../static/inverse/core/engine.js';
import { AUTOMATIC_PRESET } from '../../../static/inverse/core/presets.js';
import { renderExportedWeave } from '../export-renderer.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(s => s.replace(/^--/, '').split('=')));
if (!args.probe || !args.output || Object.keys(args).some(k => !['probe', 'output', 'seconds'].includes(k))) throw new Error('Use --probe=directory --output=new-directory [--seconds=10].');
const probe = path.resolve(args.probe), output = path.resolve(args.output), seconds = Number(args.seconds || 10);
if (!Number.isFinite(seconds) || seconds < .1 || seconds > 180) throw new Error('Use a solver budget of .1..180 seconds.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const input = await fs.readFile(path.join(probe, 'manifest.json')), source = JSON.parse(input);
if (source.status !== 'complete') throw new Error('Require a complete intervention probe.');
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.mkdir(output);
const report = { schema: 'heart-intervention-solves-1', status: 'running', probe, probeManifestSha256: hash(input),
  scope: 'Selected synthetic failure diagnosis, not an unbiased real-photo or full-corpus benchmark. Source cuts and labels are used only for external scoring.',
  configuration: { ...AUTOMATIC_PRESET, timeLimit: seconds, trials: 0 }, sourceHashes: {}, rows: [] };
for (const file of ['scripts/inverse/learning/probe-solve.mjs', 'scripts/inverse/export-renderer.mjs', ...(await fs.readdir('static/inverse/core', { recursive: true })).filter(p => p.endsWith('.js')).map(p => `static/inverse/core/${p}`)]) report.sourceHashes[file] = hash(await fs.readFile(file));
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function checked(asset) {
  const file = path.resolve(probe, asset.path);
  if (!file.startsWith(probe + path.sep)) throw new Error('Probe asset escapes root.');
  const bytes = await fs.readFile(file);
  if (hash(bytes) !== asset.sha256) throw new Error('Changed probe asset.');
  return bytes;
}
async function decode(bytes) {
  const image = await loadImage(bytes), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0); return { width: image.width, height: image.height, rgba: ctx.getImageData(0, 0, image.width, image.height).data };
}
function png(mask, n) {
  const canvas = createCanvas(n, n), ctx = canvas.getContext('2d'), data = ctx.createImageData(n, n);
  for (let i = 0; i < mask.length; i++) { data.data.set([255*mask[i], 255*mask[i], 255*mask[i], 255], 4*i); }
  ctx.putImageData(data, 0, 0); return canvas.toBuffer('image/png');
}
function disagreement(mask, truth, valid) {
  let count = 0, wrong = 0;
  for (let i = 0; i < mask.length; i++) if (valid[4*i] > 127) { count++; wrong += mask[i] !== Number(truth[4*i] > 127); }
  if (!count) throw new Error('No observed reference pixels.');
  return { mismatchFraction: Math.min(wrong, count-wrong)/count, inverted: wrong > count/2, pixels: count };
}
await save();
try {
  for (const sourceRow of source.rows) {
    const row = { id: sourceRow.id, sourceViewId: sourceRow.sourceViewId, variant: sourceRow.variant, assets: {} };
    report.rows.push(row);
    if (!/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new Error('Invalid probe id.');
    const folder = path.join(output, row.id); await fs.mkdir(folder);
    const store = async (name, bytes) => { const relative = `${row.id}/${name}`; await fs.writeFile(path.join(output, relative), bytes); row.assets[name] = { path: relative, sha256: hash(bytes) }; };
    const photo = await decode(await checked(sourceRow.assets['crop.png']));
    const truth = await decode(await checked(sourceRow.assets['crop-paper-a.png']));
    const valid = await decode(await checked(sourceRow.assets['crop-overlap-valid.png']));
    if (photo.width !== photo.height || [truth, valid].some(p => p.width !== photo.width || p.height !== photo.height)) throw new Error('Probe dimensions differ.');
    const cfg = { ...report.configuration, resolution: photo.width }, started = performance.now();
    try {
      const prepared = prepare({ type: 'pixels', rgba: photo.rgba, imageWidth: photo.width, imageHeight: photo.height }, cfg);
      row.prepareSeconds = (performance.now()-started)/1000;
      row.classifiedReference = disagreement(prepared.preview.mask, truth.rgba, valid.rgba);
      await store('mask.png', png(prepared.preview.mask, photo.width));
      await store('trace.json', JSON.stringify({ width: prepared.target.width, curves: prepared.target.boundarySeed?.curves.map(c => c.p) || [], metadata: prepared.preview.metadata }));
      const solveStart = performance.now(), result = await design(prepared.target, cfg);
      row.solveSeconds = (performance.now()-solveStart)/1000;
      row.status = result.report.templateChecksPassed ? 'checked-pair' : 'review-required';
      row.report = result.report;
      const cuts = result.files['cut_geometry.json'];
      if (!cuts) throw new Error('No exported cutting pair.');
      await store('cut_geometry.json', cuts);
      const renderStart = performance.now(), rendered = await renderExportedWeave(cuts, photo.width);
      row.independentRendererSeconds = (performance.now()-renderStart)/1000;
      row.exportedReference = disagreement(rendered.mask, truth.rgba, valid.rgba);
      row.independentVsInternalMismatch = rendered.mask.reduce((s, x, i) => s+Number(x !== result.comparison.wovenMask[i]), 0)/rendered.mask.length;
      await store('woven.png', rendered.png);
    } catch (error) { row.status = 'failed'; row.error = error.message; row.solver = error.report; }
    row.totalSeconds = (performance.now()-started)/1000;
    await save(); console.log(row.id, row.status, row.totalSeconds.toFixed(3), row.exportedReference?.mismatchFraction);
  }
  report.status = 'complete'; await save();
} catch (error) { report.status = 'failed'; report.error = error.message; await save(); throw error; }
