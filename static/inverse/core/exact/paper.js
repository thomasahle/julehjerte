/** Where the app's paper audit doubts a solution's paper, and the narrow paper
 * there as nogoods (the reference solver's paper_spots and
 * tight_nogoods(near=...)): a retry forbids only what the audit objects to. */
import {materialAudit, verifiedPaperSettings} from '../material.js';
import {PointGrid} from './polyline.js';
import {geometryNogoods} from './nogoods.js';

/** {A, B}: reference-frame points of each paper's detached paper and weak fold, or null. */
export function paperSpots(solution, cfg, {most = 400} = {}) {
  const checked = verifiedPaperSettings(solution, cfg), w = solution.graph.target.width;
  const audit = materialAudit(solution, checked, {includeMaps: true});
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
  return Object.keys(spots).length ? spots : null;
}

/** Nogoods for one solution's narrow paper near `spots` (all of it when null):
 * one paper's pieces within 3.3 mm outside one slit's local arc, and pieces
 * within 3.3 mm of that paper's own side borders, which pinch its outer strip. */
export function tightNogoods(model, val, spots, {gapMm = 3.3, reachMm = 5} = {}) {
  const {st, outline, cand} = model, R = outline.rules, gap = gapMm * R.mm, reach = reachMm * R.mm;
  const grids = spots ? Object.fromEntries(Object.entries(spots).map(([k, p]) => [k, new PointGrid(p, Math.max(reach, .05))])) : null;
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
  return out;
}
