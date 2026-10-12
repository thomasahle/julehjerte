/** Offline supervision from generated cuts. Never imported by the live fitter. */
import { createHash } from 'node:crypto';
import { Cubic } from '../../../static/inverse/core/bezier.js';
import { CurveGraph, renderCurves } from '../../../static/inverse/core/direct/curves.js';
import { solutionJSON } from '../../../static/inverse/core/graph.js';
import { validate } from '../../../static/inverse/core/validate.js';
import { materialAudit } from '../../../static/inverse/core/material.js';
import { settings } from '../../../static/inverse/core/settings.js';
import { renderExportedWeave } from '../export-renderer.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function geometryHash(cuts) {
  return sha256(JSON.stringify({ units: cuts.units, width: cuts.square_width_mm, curves: cuts.curves, A: cuts.A_overlap_paths, B: cuts.B_overlap_paths }));
}
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Keep the default recipes/order stable: existing dataset replays depend on it.
export const RECIPES = ['lattice', 'shared-lattice', 'channel', 'frame'];
export const OPTIONAL_RECIPES = ['corner-lattice'];
export const ALL_RECIPES = [...RECIPES, ...OPTIONAL_RECIPES];
export const FAMILY_SPLITS = Object.freeze({ 'procedural-lattice': 'train', 'procedural-channel': 'validation', 'procedural-frame': 'test' });
const lines = points => points.slice(1).map((p, i) => Cubic.line(points[i], p).p);
const transpose = path => path.map(c => c.map(([x, y]) => [y, x]));
const mirror = path => path.map(c => c.map(([x, y]) => [100 - x, y]));

/** Recipe variants stay together; recipe groups are not topology-disjoint families. */
export function proceduralDesign(seed, recipe = RECIPES[seed % RECIPES.length]) {
  if (!ALL_RECIPES.includes(recipe)) throw new Error('Unknown procedural recipe.');
  const rng = random(seed), between = (a, b) => a + (b - a) * rng();
  let paths, parameters;
  if (recipe === 'lattice' || recipe === 'shared-lattice' || recipe === 'corner-lattice') {
    const corners = recipe === 'corner-lattice', hasSharedCuts = recipe === 'shared-lattice' || corners;
    const counts = [1 + Math.floor(rng() * 7), 1 + Math.floor(rng() * 7)];
    const xs = Array.from({ length: counts[0] }, (_, i) => 100 * (i + 1) / (counts[0] + 1));
    const ys = Array.from({ length: counts[1] }, (_, i) => 100 * (i + 1) / (counts[1] + 1));
    const radius = Math.min(100 / (counts[0] + 1), 100 / (counts[1] + 1)) * between(.18, .3);
    const shared = ys.map(() => xs.map(() => hasSharedCuts && rng() < .55));
    if (hasSharedCuts) shared[Math.floor(rng() * ys.length)][Math.floor(rng() * xs.length)] = true;
    // A common mild displacement keeps nominal intersections at common anchors.
    // New corner fixtures stay straight so right angles remain exactly right.
    // The legacy branch retains precisely the previous RNG draws and operations.
    const amplitude = corners ? 0 : rng() < .35 ? 0 : between(.15, 1.2);
    const offsetFractions = corners ? shared.map(row => row.map(on => on ? [.15, .5, .7, 1, 1.25][Math.floor(rng() * 5)] : null)) : null;
    const warp = ([x, y]) => [x + amplitude * Math.sin(Math.PI * x / 100) * Math.sin(2 * Math.PI * y / 100), y + amplitude * Math.sin(Math.PI * y / 100) * Math.sin(2 * Math.PI * x / 100)];
    const makePath = (family, index) => {
      const fixed = (family ? ys : xs)[index], other = family ? xs : ys;
      const point = (along, cross = fixed) => family ? [along, cross] : [cross, along];
      const anchors = [point(0)];
      for (const [j, value] of other.entries()) {
        const x = family ? value : fixed, y = family ? fixed : value;
        if (shared[family ? index : j][family ? j : index]) {
          // radius / 3 is intentional: replacing it with multiplication changes
          // old floating-point controls and invalidates recorded dataset hashes.
          const offset = corners ? radius * offsetFractions[family ? index : j][family ? j : index] : radius / 3;
          anchors.push(point(value - radius), [x - offset, y - offset], [x + offset, y + offset], point(value + radius));
        } else anchors.push(point(value));
      }
      anchors.push(point(100));
      return lines(anchors).map(c => c.map(warp));
    };
    paths = counts.map((count, family) => Array.from({ length: count }, (_, i) => makePath(family, i)));
    parameters = { counts, radius, shared, amplitude, style: amplitude === 0 ? 'piecewise-straight' : 'warped-cubic-lattice' };
    if (corners) parameters.sharedOffsetFractions = offsetFractions;
  } else if (recipe === 'channel') {
    const a = between(22, 34), b = between(64, 78), bend = between(-4, 4);
    // Shared control polygon is referenced exactly by both sheets, even curved.
    const shared = [[a, a], [a + (b - a) / 3 + bend, a + (b - a) / 3 - bend], [b - (b - a) / 3 + bend, b - (b - a) / 3 - bend], [b, b]];
    paths = [
      [[Cubic.line([a, 0], [a, a]).p, shared, Cubic.line([b, b], [b, 100]).p]],
      [[Cubic.line([0, a], [a, a]).p, shared, Cubic.line([b, b], [100, b]).p]]
    ];
    parameters = { a, b, bend, counts: [1, 1], style: 'shared-cubic-channel' };
  } else {
    const a = between(15, 23), b = between(30, 39);
    const side = lines([[a, 0], [a, a], [b, b], [b, 100 - b], [a, 100 - a], [a, 100]]);
    paths = [[side, mirror(side)], [transpose(side), transpose(mirror(side))]];
    parameters = { a, b, counts: [2, 2], style: 'shared-diagonal-frame' };
  }
  const familyId = recipe.includes('lattice') ? 'procedural-lattice' : `procedural-${recipe}`;
  const graph = new CurveGraph(paths, 100), phase = rng() < .5 ? 1 : -1;
  const solution = graph.solution(graph.points, phase);
  const cuts = solutionJSON(solution);
  // Endpoint identities/edge incidence capture shared routing, not just slit counts.
  const topology = { paths: solution.paths, edges: solution.graph.edges.map(e => [e.u, e.v, e.visible]) };
  return { id: `${recipe}-${seed}`, seed, recipe, familyId, groupId: familyId, split: FAMILY_SPLITS[familyId], parameters, cuts, solution, graph, phase, geometrySha256: geometryHash(cuts), serializedDesignSha256: sha256(JSON.stringify(cuts)), topologySha256: sha256(JSON.stringify(topology)) };
}

export async function validateDesign(design, resolution = 256) {
  const cfg = settings({ width: 100, trials: 0 });
  const geometry = validate(design.solution, cfg);
  const paper = geometry.passed ? materialAudit(design.solution, cfg).summary : null;
  if (!geometry.passed || paper?.status !== 'pass') return { passed: false, geometry, paper, settings: cfg };
  const rendered = await renderExportedWeave(design.cuts, resolution);
  const sampled = renderCurves(design.graph, design.graph.points, design.phase, resolution, 128);
  const disagreement = sampled.reduce((sum, v, i) => sum + Number(v !== rendered.mask[i]), 0) / sampled.length;
  // Hard-threshold antialiasing differences are retained; never relabel failed pairs.
  return { passed: disagreement <= .005, geometry, paper, settings: cfg, independentRenderer: rendered.renderer, rendererDisagreement: disagreement, rendered };
}

export function graphLabels(design) {
  const memberships = design.solution.graph.edges.map(() => []);
  design.solution.paths.forEach((family, sheet) => family.forEach((slit, path) => slit.forEach(([edge, forward], order) => memberships[edge].push({ sheet, path, order, forward }))));
  return {
    schema: 'woven-heart-witness-graph-1', units: 'mm', width: 100, phase: design.cuts.phase,
    phaseConvention: 'heartcurves-2 phase. Even-odd left/top slit closures use background parity phase XOR (A slit count modulo 2) XOR (B slit count modulo 2).',
    paperAMaskValue: 1, canonicalPngPaperA: 'black', coveragePngPaperA: 'white (255)',
    canonicalPaperColors: design.cuts.paper_colors, actualViewColors: 'labels.json perturbations.palette[0] is paper A and palette[1] is paper B',
    nodes: design.solution.graph.points,
    edges: design.solution.graph.edges.map((edge, i) => ({ id: i, from: edge.u, to: edge.v, cubic: edge.curve.p, visible: edge.visible, shared: memberships[i].length === 2, memberships: memberships[i] })),
    paths: design.solution.paths,
    supervision: 'One independently validated witness; absent connections and alternative decompositions are not negative labels.'
  };
}
