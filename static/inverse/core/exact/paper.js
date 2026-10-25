/** Where the app's paper audit doubts a solution's paper, and the narrow paper
 * there as nogoods (the reference solver's paper_spots and
 * tight_nogoods(near=...)): a retry forbids only what the audit objects to. */
import {materialAudit, verifiedPaperSettings} from '../material.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {PointGrid} from './polyline.js';
import {geometryNogoods} from './nogoods.js';

/** A lattice too coarse to decide the paper, checked again at 700 and then
 * 1000 cells, and the resolution kept in the solution's report for the
 * export (as the fitter's candidates are, direct/candidate-verification.js). */
export function verifyPaper(solution, cfg) {
  for (const resolution of [700, 1000]) {
    const checked = verifiedPaperSettings(solution, cfg);
    if (resolution <= checked.materialResolution) continue;
    if (materialAudit(solution, checked).status !== 'uncertain') return;
    const finer = materialAudit(solution, {...cfg, materialResolution: resolution});
    solution.report = {...solution.report, paperVerification: {requestedResolution: cfg.materialResolution, resolution, status: finer.status}};
    if (finer.status !== 'uncertain') return;
  }
}

/** {A, B}: reference-frame points of each paper's detached paper and weak fold,
 * or null when its paper passes. With `final`, judged as the export judges it
 * (finalMaterialAudit, the lattice and the polygon offsets): failing only the
 * offsets, it is {} (no spot known: all of its paper is doubted). */
export function paperSpots(solution, cfg, {most = 400, final = false} = {}) {
  if (final) verifyPaper(solution, cfg);
  const checked = verifiedPaperSettings(solution, cfg), w = solution.graph.target.width;
  const audit = (final ? finalMaterialAudit : materialAudit)(solution, checked, {includeMaps: true});
  if (audit.status === 'pass') return null;
  // Unfolded sheet k: (u, v), v in [0, 2w], the fold at v = w; B transposed.
  const toReference = (k, u, v) => {
    const vf = v <= w ? v : 2 * w - v, [x, y] = k === 0 ? [u, vf] : [vf, u];
    return [12 * x / w, 12 - 12 * y / w];
  };
  const spots = {};
  for (const f of audit.families || []) {
    const [nx, ny] = f.resolution, h = f.gridSpacing, map = f.map, pts = [];
    if (!map) continue;
    for (let i = 0; i < map.length; i++) if (map[i] === 3) pts.push(toReference(f.family, (i % nx + .5) * h, f.originY + (Math.floor(i / nx) + .5) * h));
    for (const {interval: [a, b], certainCoreLength} of f.foldIntervals || []) {
      if (certainCoreLength >= h / 2) continue;
      const n = Math.max(2, Math.ceil((b - a) / h));
      for (let k = 0; k < n; k++) pts.push(toReference(f.family, a + (b - a) * k / (n - 1), w));
    }
    const step = Math.ceil(pts.length / most);
    if (pts.length) spots['AB'[f.family]] = pts.filter((_, i) => i % step === 0);
  }
  return Object.keys(spots).length || final ? spots : null;
}

/** Nogoods for one solution's narrow paper near `spots` (all of it when null or {}):
 * one paper's pieces within 3.3 mm outside one slit's local arc, and pieces
 * within 3.3 mm of that paper's own side borders, which pinch its outer strip. */
export function tightNogoods(model, val, spots, {gapMm = 3.3, reachMm = 5} = {}) {
  const {st, outline, cand} = model, R = outline.rules, gap = gapMm * R.mm, reach = reachMm * R.mm;
  const grids = spots && Object.keys(spots).length ? Object.fromEntries(Object.entries(spots).map(([k, p]) => [k, new PointGrid(p, Math.max(reach, .05))])) : null;
  const close = (fam, ...points) => !grids || (grids[fam] && points.some(p => grids[fam].nearest(p, reach)[1] >= 0));
  const {labels, used} = model.read(val), switches = new Set([...model.sw].filter(([, v]) => val[v] > .5).map(([k]) => k));
  const out = geometryNogoods(st, outline, cand, labels, used, switches, {gap, keep: (fam, p, q) => close(fam, p, q)});
  // Pinched outer strips: a paper's piece near its own side border, by the doubted paper.
  for (const [k, v] of model.lab) {
    const [e, i] = k.split(',').map(Number), fam = val[v] > .5 ? 'A' : 'B', axis = fam === 'A' ? 0 : 1;
    const grid = cand.positions.get(e) || [], s0 = i ? grid[i - 1] : 0, s1 = i < grid.length ? grid[i] : outline.L[e];
    for (const s of [s0 + (s1 - s0) * .25, (s0 + s1) / 2, s0 + (s1 - s0) * .75]) {
      const p = outline.at(e, s);
      if (Math.min(p[axis], 12 - p[axis]) < gap && Math.min(p[1 - axis], 12 - p[1 - axis]) >= gap && close(fam, p)) {
        out.push([['lab', [e, i], fam === 'A' ? 1 : 0]]);
        break;
      }
    }
  }
  // Nothing tight by the doubted paper (paper cut off whole rather than
  // pinched, david4): this solution's own hidden segments by it, or else its
  // papers there, are not to come back together.
  if (!out.length && grids) {
    const by = p => Object.values(grids).some(g => g.nearest(p, reach)[1] >= 0), local = [];
    for (const key of used) if (cand.route.get(key)?.some(by)) local.push(['x', key, 1]);
    if (!local.length) for (const [k, v] of model.lab) {
      const [e, i] = k.split(',').map(Number), grid = cand.positions.get(e) || [], s0 = i ? grid[i - 1] : 0, s1 = i < grid.length ? grid[i] : outline.L[e];
      if (by(outline.at(e, (s0 + s1) / 2))) local.push(['lab', [e, i], val[v] > .5 ? 1 : 0]);
    }
    if (local.length) out.push(local);
  }
  return out;
}
