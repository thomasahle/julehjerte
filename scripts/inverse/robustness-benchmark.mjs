/** Test border sensitivity and the user's manually cropped hard cases.
 * Input images remain local; every attempt and original crop is retained. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { prepare, design } from '../../static/inverse/core/engine.js';
import { rectify } from '../../static/inverse/core/input.js';
import { seededRandom } from '../../static/inverse/core/material.js';
import { renderExportedWeave } from './export-renderer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalogue = JSON.parse(await fs.readFile(process.env.INVERSE_ROBUST_CATALOGUE || new URL('./robustness-cases.json', import.meta.url), 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'tmp/inverse-robustness', runId);
await fs.mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = {};
for (const name of await fs.readdir(path.join(root, 'static/inverse/core'))) sourceHashes[name] = hash(await fs.readFile(path.join(root, 'static/inverse/core', name)));
const sourceCache = new Map(), timeLimit = Number(process.env.INVERSE_ROBUST_SECONDS || 5);
const cases = [];
for (const dx of [-2, 0, 2]) for (const dy of [-2, 0, 2]) cases.push({ id: `bell-translate-${dx}-${dy}`, group: 'bell', file: catalogue.bell.file, perturbation: { translationPixels: [dx, dy] }, quad: catalogue.bell.quad.map(([x, y]) => [x + dx, y + dy]) });
const random = seededRandom(1729);
for (let i = 0; i < 5; i++) cases.push({ id: `bell-corner-jitter-${i}`, group: 'bell', file: catalogue.bell.file, perturbation: { independentCornerJitterPixels: 2, seed: 1729, index: i }, quad: catalogue.bell.quad.map(p => p.map(v => v + 4 * random() - 2)) });
cases.push(...catalogue.collage.cases.map(c => ({ ...c, group: 'collage', file: catalogue.collage.file })));
const results = [], contact = createCanvas(5 * 210, Math.ceil(catalogue.collage.cases.length / 5) * 235), contactContext = contact.getContext('2d');
contactContext.fillStyle = '#eee'; contactContext.fillRect(0, 0, contact.width, contact.height);
contactContext.font = '14px sans-serif';
for (const entry of cases) {
  if (process.env.INVERSE_ROBUST_GROUP && entry.group !== process.env.INVERSE_ROBUST_GROUP) continue;
  const record = { ...entry, runs: {} }; results.push(record);
  try {
    if (!sourceCache.has(entry.file)) {
      const bytes = await fs.readFile(path.join(root, entry.file)), im = await loadImage(bytes);
      const canvas = createCanvas(im.width, im.height), ctx = canvas.getContext('2d'); ctx.drawImage(im, 0, 0);
      sourceCache.set(entry.file, { type: 'pixels', rgba: ctx.getImageData(0, 0, im.width, im.height).data, imageWidth: im.width, imageHeight: im.height, sha256: hash(bytes) });
      await fs.writeFile(path.join(output, path.basename(entry.file)), bytes);
    }
    const source = sourceCache.get(entry.file), input = { ...source, quad: entry.quad };
    record.inputSha256 = source.sha256;
    if (entry.quad.some(([x, y]) => x < 0 || y < 0 || x > source.imageWidth || y > source.imageHeight)) {
      const white = new Uint8ClampedArray(source.rgba.length).fill(255);
      const coverage = rectify(white, source.imageWidth, source.imageHeight, 400, entry.quad, '#000000');
      record.observedCropFraction = coverage.reduce((sum, v, i) => sum + Number(i % 3 === 0 && v === 255), 0) / (400 * 400);
    } else record.observedCropFraction = 1;
    const cropResolution = 400;
    const crop = createCanvas(cropResolution, cropResolution), cropContext = crop.getContext('2d'), pixels = cropContext.createImageData(cropResolution, cropResolution);
    const rgb = rectify(source.rgba, source.imageWidth, source.imageHeight, cropResolution, entry.quad);
    for (let i = 0; i < cropResolution * cropResolution; i++) { pixels.data.set(rgb.subarray(3 * i, 3 * i + 3), 4 * i); pixels.data[4 * i + 3] = 255; }
    cropContext.putImageData(pixels, 0, 0);
    await fs.writeFile(path.join(output, `${entry.id}-input.png`), crop.toBuffer('image/png'));
    if (entry.group === 'collage') {
      const i = catalogue.collage.cases.findIndex(c => c.id === entry.id), x = i % 5 * 210, y = Math.floor(i / 5) * 235;
      contactContext.drawImage(crop, x, y, 200, 200); contactContext.fillStyle = '#111'; contactContext.fillText(entry.id, x + 3, y + 220);
      await fs.writeFile(path.join(output, 'contact-sheet.png'), contact.toBuffer('image/png'));
    }
    for (const borderRadius of [0, 1]) {
      const label = borderRadius ? 'stabilized' : 'original';
      const cfg = { width: 100, resolution: 400, fitTolerance: 1.5, smoothRadius: 0.6, snapRadius: 1.5, maxSpan: 30, borderRadius, timeLimit, trials: 0, roundHidden: false, requireMaterialCore: true };
      const run = record.runs[label] = { settings: cfg }, start = performance.now();
      try {
        const prepared = prepare(input, cfg); run.preprocessing = prepared.preview.metadata;
        await fs.writeFile(path.join(output, `${entry.id}-${label}-target.svg`), prepared.preview.vector);
        const result = await design(prepared.target, cfg); run.report = result.report;
        run.status = result.report.templateExportAllowed ? 'checked_pair' : 'review_required';
        const directory = path.join(output, `${entry.id}-${label}`); await fs.mkdir(directory);
        for (const [name, bytes] of Object.entries(result.files)) await fs.writeFile(path.join(directory, name), bytes);
        const rendered = await renderExportedWeave(result.files['cut_geometry.json'], prepared.preview.resolution);
        let mismatchPixels = 0;
        for (let i = 0; i < rendered.mask.length; i++) mismatchPixels += rendered.mask[i] !== prepared.preview.mask[i];
        run.independentImageError = { renderer: rendered.renderer, resolution: prepared.preview.resolution, mismatchPixels, mismatchFraction: mismatchPixels / rendered.mask.length, reference: 'Original classified crop before any repair' };
        await fs.writeFile(path.join(directory, 'independent-weave.png'), rendered.png);
        await fs.writeFile(path.join(directory, 'independent-weave.svg'), rendered.svg);
      } catch (error) { run.status = error.report?.termination || 'error'; run.message = error.message; run.report ??= error.report; }
      run.totalSeconds = (performance.now() - start) / 1000;
      console.log(entry.id, label, run.preprocessing?.curves, run.status, run.totalSeconds.toFixed(2), run.independentImageError?.mismatchFraction ?? run.message ?? '');
    }
  } catch (error) { record.inputError = error.message; console.log(entry.id, error.message); }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ runId, sourceHashes, timeLimit, description: catalogue.description, results }, null, 2));
}
console.log(`Robustness evidence: ${output}`);
