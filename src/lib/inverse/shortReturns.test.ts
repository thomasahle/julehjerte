import { expect, it } from 'vitest';
import { loadSolutionJSON, solutionJSON } from '$inverse/core/graph.js';
import { sampleWeave } from '$inverse/core/validate.js';
import { settings } from '$inverse/core/settings.js';
import { finalizeShortReturns } from '$inverse/core/direct/short-returns.js';
import { finish } from '$inverse/core/engine.js';
import { convertValidatedCutGeometry, type CutGeometry } from './toHeartDesign';
import geometry from '../../../scripts/inverse/fixtures/editor-anchor-return.json';
import source from '../../../scripts/inverse/fixtures/anchor-upload-mask.json';

it('repairs the real anchor return without increasing source error, and opens in Draw', () => {
  const seed = loadSolutionJSON({ ...geometry, schema: 'heartcurves-2', units: 'mm' });
  const mask = new Uint8Array(source.resolution ** 2);
  for (const [start, length] of source.maskRuns) mask.fill(1, start, start! + length!);
  Object.assign(seed.graph.target, { sourceImage: { mask, resolution: source.resolution } });
  const before = JSON.stringify(solutionJSON(seed));
  const cfg = settings({ algorithm: 'auto', preferMatchingSheets: false, maxTurn: 175, localNeighborhoodFactor: 8 });
  const result = finalizeShortReturns(seed, cfg);
  expect(result.report.shortReturnRepair).toMatchObject({ applied: true });
  const error = (s: typeof seed) => sampleWeave(s, source.resolution).reduce((sum, v, i) => sum + Number(v !== mask[i]), 0);
  expect(error(result)).toBeLessThan(error(seed));
  expect(JSON.stringify(solutionJSON(seed))).toBe(before);
  const exported = solutionJSON(result) as CutGeometry;
  const common = new Set(exported.A_overlap_paths[2]!.map(r => r.curve));
  expect(exported.B_overlap_paths[1]!.some(r => common.has(r.curve))).toBe(true);
  // Cleanup now checks the complete return rule too. Final export may receive
  // an already valid fit; require the same certified result in either case.
  const final = finish(result, cfg, () => {}, { refine: false });
  expect(final.report.validation).toMatchObject({ passed: true, finalGeometry: true });
  expect(final.report.templateChecksPassed, JSON.stringify(final.report.manufacturing)).toBe(true);
  expect(error(loadSolutionJSON(final.files['cut_geometry.json']!))).toBeLessThanOrEqual(error(result));
  const converted = convertValidatedCutGeometry(final.files['cut_geometry.json']!, { name: 'Anchor', reference: { mask: { size: source.resolution, data: mask } } });
  expect(converted.editorValidation?.passed).toBe(true);
}, 10_000);
