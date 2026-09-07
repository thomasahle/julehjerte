/** Evaluate every entry from a recorded locator run; unresolved crops stay in the denominator.
 * INVERSE_LOCATOR_RUN=tmp/inverse-locator/<run>/results.json node scripts/inverse/locator-reconstruction-benchmark.mjs
 * A geometric pass is provisional when the photographed crop still needs human review.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepare, design } from '../../static/inverse/core/engine.js';
import { rectifyMotif } from '../../static/inverse/locator/locator.js';
import { pixelCentresToEdges } from '../../static/inverse/core/crop.js';
import { renderExportedWeave } from './export-renderer.mjs';

if (!process.env.INVERSE_LOCATOR_RUN) throw new Error('Set INVERSE_LOCATOR_RUN to a locator results.json file.');
const locator = JSON.parse(await fs.readFile(process.env.INVERSE_LOCATOR_RUN, 'utf8'));
const data = new Uint8ClampedArray(await fs.readFile(locator.source.rgbaFile));
const source = { width: locator.source.width, height: locator.source.height, data };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(data) !== locator.source.rgbaSha256) throw new Error('Source pixels no longer match the locator run.');
const runId = new Date().toISOString().replace(/[:.]/g, '-'), output = `tmp/inverse-locator/${runId}-reconstruction`;
await fs.mkdir(output, { recursive: true });
const sourceHashes = {};
for (const name of await fs.readdir('static/inverse/core')) sourceHashes[name] = hash(await fs.readFile(path.join('static/inverse/core', name)));
const results = [], timeLimit = Number(process.env.INVERSE_ROBUST_SECONDS || 5);
const criteria = { maximumIndependentImageError: 0.05, geometryAndPaperRequired: true, observedPixelsOnly: true, cropReviewRequired: true, physicalAssemblyTested: false };
const save = () => fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ runId, locatorRun: process.env.INVERSE_LOCATOR_RUN, sourceHashes, criteria, results }, null, 2));
for (const entry of locator.results) {
  const record = { id: entry.id, label: entry.label, clippedByFrame: entry.clippedByFrame, cropStatus: entry.proposal?.status, quad: entry.proposal?.quad, runs: [] };
  results.push(record);
  if (!record.quad) { record.status = 'crop_unresolved'; await save(); continue; }
  for (const preset of ['detailed', 'simplified']) {
    const settings = { width: 100, resolution: 400, borderRadius: 1, timeLimit, trials: 0, roundHidden: false, requireMaterialCore: true,
      ...(preset === 'detailed' ? { fitTolerance: 0.5, smoothRadius: 0, snapRadius: 0, maxSpan: 15 } : { fitTolerance: 1.5, smoothRadius: 0.6, snapRadius: 1.5, maxSpan: 30 }) };
    const run = { preset, settings }; record.runs.push(run);
    const start = performance.now();
    try {
      const input = { type: 'pixels', rgba: data, imageWidth: source.width, imageHeight: source.height, quad: pixelCentresToEdges(record.quad), cropProvenance: { locatorRun: process.env.INVERSE_LOCATOR_RUN, roi: entry.roi, status: record.cropStatus, humanReviewed: false } };
      const prepared = prepare(input, settings), n = prepared.preview.resolution;
      const { valid } = rectifyMotif(source, record.quad, { size: n });
      prepared.target.sourceImage.validMask = valid;
      run.preprocessing = prepared.preview.metadata;
      run.observedCropFraction = valid.reduce((a, b) => a + b, 0) / valid.length;
      const result = await design(prepared.target, settings);
      run.report = result.report;
      const rendered = await renderExportedWeave(result.files['cut_geometry.json'], n);
      let mismatches = 0, observed = 0;
      for (let i = 0; i < valid.length; i++) if (valid[i]) { observed++; mismatches += rendered.mask[i] !== prepared.preview.mask[i]; }
      run.independentImageError = { renderer: rendered.renderer, resolution: n, observedPixels: observed, mismatchPixels: mismatches, mismatchFraction: mismatches / observed, reference: 'Original classified crop before repairs; out-of-frame samples excluded' };
      run.passesNumericalCriteria = result.report.templateExportAllowed && mismatches / observed <= criteria.maximumIndependentImageError;
      run.status = run.passesNumericalCriteria ? 'provisional_pair' : 'criteria_failed';
      const directory = path.join(output, `${entry.id}-${preset}`); await fs.mkdir(directory);
      for (const [name, bytes] of Object.entries(result.files)) await fs.writeFile(path.join(directory, name), bytes);
      await fs.writeFile(path.join(directory, 'independent-weave.png'), rendered.png);
    } catch (error) { run.status = error.report?.termination || 'error'; run.message = error.message; run.report = error.report; }
    run.totalSeconds = (performance.now() - start) / 1000;
    console.log(entry.label, entry.id, preset, run.status, run.totalSeconds.toFixed(2), run.independentImageError?.mismatchFraction ?? run.message);
    await save();
  }
  record.status = record.runs.some(r => r.passesNumericalCriteria) ? 'provisional_pair' : 'reconstruction_failed';
  await save();
}
console.log(`Reconstruction evidence: ${output}`);
