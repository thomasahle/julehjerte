// The seven other symmetries of the square applied to a template (cut.json) and its picture: a symmetry
// that turns columns into rows (the diagonals, the quarter turns) swaps the papers, A running top to
// bottom. The picture is woven anew from the moved template, in the colour that matches the moved mask.
//   node scripts/inverse/cuts/dihedral.mjs OUTDIR CUT.json...   (each CUT.json beside its MASK.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const C = fileURLToPath(new URL('../../../static/inverse/core', import.meta.url));
const {loadSolutionJSON} = await import(`${C}/graph.js`);
const {sampleWeave} = await import(`${C}/validate.js`);
const [outDir, ...files] = process.argv.slice(2);
// [a, b, c, d]: (x, y) -> centre + (a x' + b y', c x' + d y'); swap when the matrix is off-diagonal.
const G = {mx: [-1, 0, 0, 1], my: [1, 0, 0, -1], r180: [-1, 0, 0, -1], tr: [0, 1, 1, 0], atr: [0, -1, -1, 0], r90: [0, -1, 1, 0], r270: [0, 1, -1, 0]};
const act = ([a, b, c, d], [x, y]) => [50 + a * (x - 50) + b * (y - 50), 50 + c * (x - 50) + d * (y - 50)];
for (const file of files) {
  const id = path.basename(file).replace(/\.cut\.json$/, ''), dir = path.dirname(file);
  const maskFile = `${dir}/${id}.mask.json`;
  const cut = JSON.parse(await fs.readFile(file, 'utf8')), mask = JSON.parse(await fs.readFile(maskFile, 'utf8')), N = mask.size;
  const out = [];
  for (const [name, g] of Object.entries(G)) {
    const swap = g[0] === 0;
    const curves = Object.fromEntries(Object.entries(cut.curves).map(([k, c]) => [k, {...c, control_points: c.control_points.map(p => act(g, p))}]));
    // Each slit from its start side (A: top, B: left), the slits in order across the square.
    const ends = slit => { const f = slit[0], l = slit.at(-1), cp = k => curves[k].control_points; return [f.reverse ? cp(f.curve)[3] : cp(f.curve)[0], l.reverse ? cp(l.curve)[0] : cp(l.curve)[3]]; };
    const canon = (paths, axis) => paths.map(slit => { const [p, q] = ends(slit); return p[axis] <= q[axis] ? slit : [...slit].reverse().map(it => ({...it, reverse: !it.reverse})); })
      .sort((u, v) => ends(u)[0][1 - axis] - ends(v)[0][1 - axis]);
    const moved = {...cut, curves, A_overlap_paths: canon(swap ? cut.B_overlap_paths : cut.A_overlap_paths, 1), B_overlap_paths: canon(swap ? cut.A_overlap_paths : cut.B_overlap_paths, 0)};
    let woven;
    try { woven = sampleWeave(loadSolutionJSON(moved), N); } catch { out.push(`${name}:error`); continue; }
    // The moved mask, pixel by pixel (pixel centres map onto pixel centres).
    let same = 0;
    const data = new Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const [sx, sy] = act([g[0], g[2], g[1], g[3]], [(x + .5) * 100 / N, (y + .5) * 100 / N]).map(v => Math.floor(v * N / 100));
      const m = mask.data[Math.min(N - 1, Math.max(0, sy)) * N + Math.min(N - 1, Math.max(0, sx))] ? 1 : 0, w = woven[y * N + x] ? 1 : 0;
      same += m === w;
      data[y * N + x] = w;
    }
    const flip = same < N * N / 2, agree = Math.max(same, N * N - same) / (N * N);
    if (agree < .98) { out.push(`${name}:disagrees ${agree.toFixed(3)}`); continue; }
    await fs.writeFile(`${outDir}/${id}-${name}.cut.json`, JSON.stringify(moved));
    await fs.writeFile(`${outDir}/${id}-${name}.mask.json`, JSON.stringify({size: N, data: flip ? data.map(v => 1 - v) : data}));
    out.push(`${name}:${agree.toFixed(3)}${flip ? ' inverted' : ''}`);
  }
  console.log(id, out.join(' '));
}
