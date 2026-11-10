// The generator benchmark's hearts (2026-11-05; was tmp/e2e/bench/gen-bench.mjs): what the generator's presets
// make, each with the generator's own template (cut.json), so a template keeping the rules may exist
// (check-templates.mjs says whether it does): every figure frame offered (templates.ts OFFERED_STYLES) with 8
// motifs from the picker's groups at the defaults (frame 70, motif 70); every number of strips of the board
// frames with 3 motifs; every text frame with 6 words in the default font, and JUL in 3 more. Masks as the page
// makes them (rasterizeDesign). Writes OUTDIR/<id>.mask.json, <id>.cut.json and list.txt.
//   [E2E_ROOT=<another checkout>] node scripts/inverse/bench/generator-set.mjs OUTDIR
// The set in sets/generator.txt was made at 20e1ea97: the generator has changed since, so a checkout of that
// commit (E2E_ROOT, with node_modules) remakes it; this checkout makes today's generator's hearts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const root = path.resolve(process.env.E2E_ROOT ?? fileURLToPath(new URL('../../..', import.meta.url))) + '/';
const [out] = process.argv.slice(2);
if (!out) { console.error('usage: node scripts/inverse/bench/generator-set.mjs OUTDIR'); process.exit(2); }
await fs.mkdir(out, {recursive: true});
const dom = new JSDOM('');
Object.assign(globalThis, {DOMParser: dom.window.DOMParser, Element: dom.window.Element, Node: dom.window.Node, document: dom.window.document});
const server = await createServer({root, configFile: false, logLevel: 'error', appType: 'custom', server: {middlewareMode: true, hmr: false, ws: false, watch: null, preTransformRequests: false}, optimizeDeps: {noDiscovery: true, include: []}, resolve: {alias: {$lib: path.join(root, 'src/lib')}}, cacheDir: path.resolve(out, `.vite-gen-${process.pid}`)});
{ const dir = server.config.cacheDir, drop = () => process.getBuiltinModule('node:fs').rmSync(dir, {recursive: true, force: true}); process.on('exit', drop); for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => process.exit(143)); } // the per-run cache goes with the run
const load = p => server.ssrLoadModule(p);
const {generate} = await load('/src/lib/generator/generate.ts');
const {TEXT_TEMPLATES, OFFERED_STYLES} = await load('/src/lib/generator/templates.ts');
const {defaults, frameGap} = await load('/src/lib/generator/state.ts');
const {BOARD_STRIPS} = await load('/src/lib/generator/boardMotif.ts');
const {computeWeaveData} = await load('/src/lib/rendering/svgWeave.ts');
const {FontLibrary} = await load('/src/lib/generator/fontLibrary.ts');
const {staticFontFiles} = await load('/src/lib/server/staticFonts.ts');
const {rasterizeDesign} = await load('/src/lib/paint/rasterize.ts');
const fonts = new FontLibrary(staticFontFiles);
const colors = {left: '#fffdf5', right: '#b72f2b'};
const cubic = (s, t) => { const u = 1 - t; return ['x', 'y'].map(k => u * u * u * s.p0[k] + 3 * u * u * t * s.p1[k] + 3 * u * t * t * s.p2[k] + t * t * t * s.p3[k]); };
// The generator's design as our cut.json (the overlap square, 100 mm; a stretch both papers cut is hidden): its
// cubics kept whole where they lie inside the overlap square (their control points inside), the others sampled
// into 24 straight pieces and clipped (cuts/gen-synth.mjs samples them all: over the loader's 4000 curves for
// many small motifs).
function cutJSON(d) {
  const {overlap: {left, top, width, height}} = computeWeaveData(d.fingers, d.gridSize, d.weaveParity ?? 0);
  const to = ({x, y}) => [(x - left) / width * 100, (y - top) / height * 100];
  const inside = p => p[0] >= -1e-6 && p[0] <= 100 + 1e-6 && p[1] >= -1e-6 && p[1] <= 100 + 1e-6;
  const curves = {}, fam = [[], []];
  let id = 0;
  for (const f of d.fingers) {
    // Points with the segment and parameter they come from.
    const pts = [];
    f.segments.forEach((s, j) => { for (let k = pts.length ? 1 : 0; k <= 24; k++) { const [x, y] = cubic(s, k / 24); pts.push({p: [(x - left) / width * 100, (y - top) / height * 100], j, k}); } });
    let best = [], run = [];
    for (const q of pts) { if (inside(q.p)) run.push(q); else { if (run.length > best.length) best = run; run = []; } }
    if (run.length > best.length) best = run;
    if (best.length < 2) continue;
    const clamp = p => p.map(v => Math.min(100, Math.max(0, v)));
    const snap = p => { const q = clamp(p), dist = [q[0], 100 - q[0], q[1], 100 - q[1]], k = dist.indexOf(Math.min(...dist)); if (k === 0) q[0] = 0; if (k === 1) q[0] = 100; if (k === 2) q[1] = 0; if (k === 3) q[1] = 100; return q; };
    if (best.every(q => Math.min(q.p[0], 100 - q.p[0], q.p[1], 100 - q.p[1]) < 1e-6)) continue;
    // Pieces: a whole cubic where the run holds all of it, else straight pieces between samples.
    const pieces = [];
    for (let i = 1; i < best.length; i++) {
      const a = best[i - 1], b = best[i], seg = f.segments[b.j];
      const whole = b.k === 24 && i >= 24 && best[i - 24].j === b.j && best[i - 24].k === 0 || b.k === 24 && i >= 24 && best[i - 24].k === 24 && best[i - 24].j === b.j - 1;
      if (whole && [seg.p0, seg.p1, seg.p2, seg.p3].map(to).every(inside)) { pieces.splice(pieces.length - 23, 23); pieces.push([seg.p0, seg.p1, seg.p2, seg.p3].map(to)); }
      else pieces.push([a.p, [a.p[0] + (b.p[0] - a.p[0]) / 3, a.p[1] + (b.p[1] - a.p[1]) / 3], [a.p[0] + 2 * (b.p[0] - a.p[0]) / 3, a.p[1] + 2 * (b.p[1] - a.p[1]) / 3], b.p]);
    }
    pieces[0][0] = snap(pieces[0][0]); pieces.at(-1)[3] = snap(pieces.at(-1)[3]);
    const s0 = pieces[0][0], s1 = pieces.at(-1)[3], vertical = (s0[1] === 0 || s0[1] === 100) && (s1[1] === 0 || s1[1] === 100);
    if (vertical && s0[1] > s1[1] || !vertical && s0[0] > s1[0]) { pieces.reverse(); pieces.forEach(c => c.reverse()); }
    fam[vertical ? 0 : 1].push(pieces);
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const at = (c, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]); };
  // Each family's pieces as polylines (8 samples a piece) for the shared-cut test.
  const lines = fam.map(list => list.map(pieces => pieces.flatMap((c, i) => Array.from({length: i ? 8 : 9}, (_, k) => at(c, (k + (i ? 1 : 0)) / 8)))));
  const near = (p, others) => others.some(o => o.some((q, i) => i && segDist(p, o[i - 1], q) < .15));
  const paths = fam.map((list, k) => list.map(pieces => pieces.map(c => { const n = String(id++); curves[n] = {control_points: c, visible_boundary: !near(at(c, .5), lines[1 - k])}; return {curve: n, reverse: false}; })));
  return {schema: 'heartcurves-2', units: 'mm', square_width_mm: 100, phase: 0, paper_colors: ['#bd1111', '#ffffff'], curves, A_overlap_paths: paths[0], B_overlap_paths: paths[1]};
}
const MOTIFS = ['star', 'tree', 'heart', 'nisse', 'mc-snowflake', 'pin-reindeer', 'pin-elephant', 'flower'], BOARD_MOTIFS = ['star', 'heart', 'tree'];
const WORDS_BENCH = ['JUL', 'GOD JUL', 'NOEL', 'ANNA', '2026', 'ÆØÅ'], FONTS_BENCH = ['oswald', 'kalam', 'righteous'];
const requests = [];
const figure = (motif, style, board) => ({kind: 'figure', motif, style, board, name: `b-fig-${motif}-${style}${board ? `-b${board}` : ''}`});
for (const style of OFFERED_STYLES) for (const motif of MOTIFS) requests.push(figure(motif, style));
for (const style of OFFERED_STYLES) { const range = BOARD_STRIPS[style]; if (range) for (let board = range.min; board <= range.max; board += range.step) for (const motif of BOARD_MOTIFS) requests.push(figure(motif, style, board)); }
const text = (word, fontId, tpl) => ({kind: 'text', word, fontId, tpl, name: `b-txt-${word.replace(/[^A-Za-z0-9]/g, '_')}-${fontId}-${tpl.id}`});
for (const tpl of TEXT_TEMPLATES) { for (const word of WORDS_BENCH) requests.push(text(word, 'nunito', tpl)); for (const fontId of FONTS_BENCH) requests.push(text('JUL', fontId, tpl)); }
const seen = new Set(), list = [];
for (const r of requests) {
  if (seen.has(r.name)) continue;
  seen.add(r.name);
  let request;
  if (r.kind === 'figure') {
    const {contours} = JSON.parse(await fs.readFile(`${root}static/generator/motifs/${r.motif}.json`, 'utf8'));
    request = {mode: 'figure', name: r.motif, contours, colors, frame: 'circle', style: r.style, frameSize: defaults.frameSize, scale: defaults.scale / 100, gap: frameGap({...defaults, mode: 'figure', style: r.style}), ...(r.board ? {board: r.board} : {})};
  } else request = {mode: 'text', name: r.word, text: r.word, font: await fonts.font(r.fontId, r.word), textFrame: r.tpl.textFrame, fittedCells: r.tpl.cells === 'letters', colors};
  try {
    const {design} = generate(request), raster = rasterizeDesign(design, 400);
    await fs.writeFile(`${out}/${r.name}.cut.json`, JSON.stringify(cutJSON(design)));
    await fs.writeFile(`${out}/${r.name}.mask.json`, JSON.stringify({size: raster.size, data: Array.from(raster.data)}));
    list.push(`${out}/${r.name}.mask.json`);
  } catch (error) { console.log('refused', r.name, String(error.message || error).slice(0, 120)); }
}
await fs.writeFile(`${out}/list.txt`, list.join('\n') + '\n');
console.log('made', list.length, 'of', seen.size);
await server.close();
dom.window.close();
