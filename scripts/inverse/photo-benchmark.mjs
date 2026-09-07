/** Reproducible, image-only photo attempts. These are not reference-cut recovery scores. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { prepare, design } from '../../static/inverse/core/engine.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalogue = JSON.parse(await fs.readFile(new URL('./photo-cases.json', import.meta.url), 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'tmp', 'inverse-photo-benchmark', runId);
await fs.mkdir(output, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceHashes = {};
for (const name of await fs.readdir(path.join(root, 'static/inverse/core'))) {
  sourceHashes[name] = hash(await fs.readFile(path.join(root, 'static/inverse/core', name)));
}
const timeLimit = Number(process.env.INVERSE_PHOTO_SECONDS || 5);
const presets = {
  detailed: { fitTolerance: 0.5, smoothRadius: 0, snapRadius: 0, maxSpan: 15 },
  simplified: { fitTolerance: 1.5, smoothRadius: 0.6, snapRadius: 1.5, maxSpan: 30 },
};
const results = [];
for (const entry of catalogue.cases) {
  const record = { ...entry, track: 'blind_raster', runs: {} };
  results.push(record);
  try {
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    record.inputSha256 = hash(bytes);
    await fs.writeFile(path.join(output, `${entry.id}.jpg`), bytes);
    const image = await loadImage(bytes);
    const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const center = [0, 1].map(k => entry.quad.reduce((sum, p) => sum + p[k], 0) / 4);
    record.effectiveQuad = entry.quad.map(p => p.map((v, k) => center[k] + (v - center[k]) * (1 - (entry.cropInsetFraction || 0))));
    const input = { type: 'pixels', rgba: context.getImageData(0, 0, image.width, image.height).data, imageWidth: image.width, imageHeight: image.height, quad: record.effectiveQuad };
    for (const [preset, preprocessing] of Object.entries(presets)) {
      const config = { width: 100, resolution: 400, borderRadius: 1, ...preprocessing, timeLimit, trials: 0, roundHidden: false, requireMaterialCore: true, seed: 1729 };
      const run = record.runs[preset] = { settings: config };
      const start = performance.now();
      try {
        const prepared = prepare(input, config);
        run.preprocessing = prepared.preview.metadata;
        await fs.writeFile(path.join(output, `${entry.id}-${preset}-target.svg`), prepared.preview.vector);
        const result = await design(prepared.target, config);
        run.status = result.report.templateExportAllowed ? 'checked_pair' : 'review_required';
        run.report = result.report;
        const folder = path.join(output, `${entry.id}-${preset}`);
        await fs.mkdir(folder);
        for (const [name, content] of Object.entries(result.files)) await fs.writeFile(path.join(folder, name), content);
      } catch (error) {
        run.status = error.report?.termination || 'error';
        run.message = error.message;
        run.report = error.report;
      }
      run.totalSeconds = (performance.now() - start) / 1000;
      console.log(entry.id, preset, run.preprocessing?.curves, run.status, run.totalSeconds.toFixed(2));
    }
  } catch (error) { record.inputError = error.message; }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ runId, sourceHashes, timeLimit, description: catalogue.description, results }, null, 2));
}
console.log(`Photo evidence: ${output}`);
