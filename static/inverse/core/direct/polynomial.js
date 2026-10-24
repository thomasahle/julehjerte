/**
 * Adapter for the proof-based polynomial representability path.
 *
 * This accepts a noded visible-boundary graph or polygon contours and returns
 * a normal heartcurves-2 solution when the visible boundary already splits
 * into the two sheet path families. It never invokes the MILP router. General
 * accepted masks that need hidden W/K switches are returned as an explicit
 * unsupported result by the offline criterion module.
 */
import {Cubic} from '../bezier.js';
import {loadSolutionJSON, reindex} from '../graph.js';
import {constructVisibleSheetWitness} from '../alternating-weave-representability.js';

export function solvePolynomialVisible(input) {
  const witness = constructVisibleSheetWitness(input);
  if (!witness.accepted) return {accepted: false, witness};
  const solution = loadSolutionJSON(witness.template);
  solution.report = {
    algorithm: 'polynomial-visible-sheet',
    imported: false,
    milpUsed: false,
    cutCounts: witness.template.cutCounts,
    curveCounts: witness.template.curveCounts,
  };
  return {accepted: true, solution, witness};
}

export function solvePolynomialTarget(target, cfg) {
  const source = target.sourceImage;
  if (!source?.mask || !Number.isInteger(source.resolution)) {
    const error = new Error('The polynomial route requires a binary source mask.');
    error.report = {algorithm: 'polynomial-visible-sheet', accepted: false, milpUsed: false, reason: 'missing_source_mask'};
    throw error;
  }
  const result = solvePolynomialVisible({mask: source.mask, width: source.resolution});
  if (!result.accepted) {
    const error = new Error('The polynomial route cannot construct this mask without hidden-switch routing.');
    error.report = {algorithm: 'polynomial-visible-sheet', accepted: false, milpUsed: false, witness: result.witness};
    throw error;
  }
  const factor = cfg.width / result.solution.graph.target.width;
  for (const edge of result.solution.graph.edges) edge.curve = new Cubic(edge.curve.p.map(point => point.map(value => value * factor)));
  result.solution.graph.target = {
    ...result.solution.graph.target,
    width: cfg.width,
    phase: source.phase ?? result.solution.graph.target.phase,
    curves: result.solution.graph.edges.filter(edge => edge.visible).map(edge => edge.curve),
    sourceImage: source,
    metadata: {...target.metadata, input: 'polynomial visible-sheet fit', paperColors: cfg.paperColors},
  };
  reindex(result.solution.graph);
  result.solution.report = {...result.solution.report, sourceResolution: source.resolution, targetWidth: cfg.width};
  return result.solution;
}
