// Synthetic training designs (2026-11-01; the gallery is test only): the site's generator with random motifs
// in every figure style, each at a random frame size (50-80), motif scale (45 to the style's largest) and,
// for the board styles, a random number of strips, so grids of 2 to 9 and circles of every size occur
// (davidsstjerne-circ is a star in a circle on 8 x 8); a quarter random words in random fonts and frames.
// Each a woven template by construction (cut.json + the mask it weaves). Names start s-.
//   node scripts/inverse/cuts/gen-synth.mjs OUTDIR COUNT SEED   (env HARD, CHECKERED, STYLES, EXCLUDE, INCLUDE, TEXT, ONE: below)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url))) + '/';
const [out, count = '50', seed = '1'] = process.argv.slice(2);
const dom = new JSDOM('');
Object.assign(globalThis, {DOMParser: dom.window.DOMParser, Element: dom.window.Element, Node: dom.window.Node, document: dom.window.document});
const server = await createServer({root, configFile: false, logLevel: 'error', appType: 'custom', server: {middlewareMode: true, hmr: false, ws: false, watch: null, preTransformRequests: false}, optimizeDeps: {noDiscovery: true, include: []}, resolve: {alias: {$lib: path.join(root, 'src/lib')}}, cacheDir: path.resolve(out, `.vite-gen-${process.pid}`)});
{ const dir = server.config.cacheDir, drop = () => process.getBuiltinModule('node:fs').rmSync(dir, {recursive: true, force: true}); process.on('exit', drop); for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => process.exit(143)); } // the per-run cache goes with the run
const load = p => server.ssrLoadModule(p);
const {generate} = await load('/src/lib/generator/generate.ts');
const {TEXT_TEMPLATES} = await load('/src/lib/generator/templates.ts');
const {defaults, frameGap, largestScale} = await load('/src/lib/generator/state.ts');
const {BOARD_STRIPS} = await load('/src/lib/generator/boardMotif.ts');
const {FIGURE_STYLES} = await load('/src/lib/generator/geometry.ts');
const {computeWeaveData} = await load('/src/lib/rendering/svgWeave.ts');
const {FontLibrary} = await load('/src/lib/generator/fontLibrary.ts');
const {staticFontFiles} = await load('/src/lib/server/staticFonts.ts');
const C = `${root}static/inverse/core`;
const {loadSolutionJSON} = await import(`${C}/graph.js`);
const {sampleWeave} = await import(`${C}/validate.js`);
const fonts = new FontLibrary(staticFontFiles), fontIds = ['nunito', 'breeserif', 'oswald', 'kalam', 'cinzel', 'righteous'];
const motifs = (await fs.readdir(`${root}static/generator/motifs`)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
const WORDS = ['ANNA', 'EMMA', 'OSCAR', 'Sofie', 'LOVE', 'BO', 'A', 'B', 'O', 'ÆØÅ', 'Åse', 'NOEL', 'SNE', 'HYGGE', 'KIM', 'ELLA', 'IDA', 'LEA', 'MIA', 'NOAH', 'KARL', 'TOVE', 'GRAN', 'STJERNE', 'HJERTE', 'ENGEL', 'NISSE', 'LYS', 'GAVE', 'Hej!', 'xo', 'ABC', 'Kys', 'MOSTER', 'ONKEL', 'AMY', 'Ole', 'Bo\nIda', 'TIL\nDIG'];
let a = +seed * 2654435761 >>> 0;
const random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = list => list[Math.floor(random() * list.length)];
const colors = {left: '#fffdf5', right: '#b72f2b'};
// theirs.mjs: each finger's cubic segments sampled into short straight cubics, clipped to the overlap square.
const cubic = (s, t) => { const u = 1 - t; return ['x', 'y'].map(k => u * u * u * s.p0[k] + 3 * u * u * t * s.p1[k] + 3 * u * t * t * s.p2[k] + t * t * t * s.p3[k]); };
function cutJSON(d) {
  const {overlap: {left, top, width, height}} = computeWeaveData(d.fingers, d.gridSize, d.weaveParity ?? 0);
  const curves = {}, fam = [[], []];
  let id = 0;
  for (const f of d.fingers) {
    const pts = [];
    for (const s of f.segments) for (let k = pts.length ? 1 : 0; k <= 24; k++) { const [x, y] = cubic(s, k / 24); pts.push([(x - left) / width * 100, (y - top) / height * 100]); }
    const inside = p => p[0] >= -1e-6 && p[0] <= 100 + 1e-6 && p[1] >= -1e-6 && p[1] <= 100 + 1e-6;
    let best = [], run = [];
    for (const p of pts) { if (inside(p)) run.push(p); else { if (run.length > best.length) best = run; run = []; } }
    if (run.length > best.length) best = run;
    if (best.length < 2) continue;
    const clamp = p => p.map(v => Math.min(100, Math.max(0, v)));
    const snap = p => { const q = clamp(p), dist = [q[0], 100 - q[0], q[1], 100 - q[1]], k = dist.indexOf(Math.min(...dist)); if (k === 0) q[0] = 0; if (k === 1) q[0] = 100; if (k === 2) q[1] = 0; if (k === 3) q[1] = 100; return q; };
    best[0] = snap(best[0]); best[best.length - 1] = snap(best.at(-1));
    if (best.every(p => Math.min(p[0], 100 - p[0], p[1], 100 - p[1]) < 1e-6)) continue;
    const s0 = best[0], s1 = best.at(-1), vertical = (s0[1] === 0 || s0[1] === 100) && (s1[1] === 0 || s1[1] === 100);
    if (vertical && s0[1] > s1[1] || !vertical && s0[0] > s1[0]) best.reverse();
    fam[vertical ? 0 : 1].push(best);
  }
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const near = (p, others) => others.some(o => o.some((q, i) => i && segDist(p, o[i - 1], q) < .15));
  const paths = fam.map((list, k) => list.map(best => {
    const out = [];
    for (let i = 1; i < best.length; i++) {
      const p = best[i - 1], q = best[i], c = String(id++), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      curves[c] = {control_points: [p, [p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3], [p[0] + 2 * (q[0] - p[0]) / 3, p[1] + 2 * (q[1] - p[1]) / 3], q], visible_boundary: !near(m, fam[1 - k])};
      out.push({curve: c, reverse: false});
    }
    return out;
  }));
  return {schema: 'heartcurves-2', units: 'mm', square_width_mm: 100, phase: 0, paper_colors: ['#bd1111', '#ffffff'], curves, A_overlap_paths: paths[0], B_overlap_paths: paths[1]};
}
let made = 0, tries = 0;
while (made < +count && tries < +count * 4) {
  tries++;
  let request, name;
  // HARD=1: the kinds the test pictures fail on, more often: dense boards and many small motifs (the upper half
  // of each style's strips), large motifs, and text hearts.
  const HARD = Boolean(process.env.HARD);
  // CHECKERED=1: words in the checkered text frame only (letters in checks; the frame the network misses most).
  const CHECKERED = Boolean(process.env.CHECKERED);
  // STYLES=a,b,...: figures only, in these styles (repeat one to weight it); EXCLUDE=m1,m2,...: motifs left out
  // (2026-11-06: the generator benchmark's eight, so its hearts stay unseen).
  const STYLES = process.env.STYLES ? process.env.STYLES.split(',') : null;
  if (STYLES || (!CHECKERED && random() < (HARD ? .6 : .75))) {
    const hardStyles = ['board', 'board', 'board', 'motifs', 'motifs', 'motifs', 'squares', 'squares', 'strips', 'strips', ...FIGURE_STYLES];
    // INCLUDE=m1,m2,...: only these motifs.
    const pool = (process.env.INCLUDE ? motifs.filter(m => process.env.INCLUDE.split(',').includes(m)) : motifs).filter(m => !(process.env.EXCLUDE ?? '').split(',').includes(m));
    const motif = pick(pool), style = STYLES ? pick(STYLES) : HARD ? pick(hardStyles) : pick(FIGURE_STYLES), {contours} = JSON.parse(await fs.readFile(`${root}static/generator/motifs/${motif}.json`, 'utf8'));
    const lo = HARD ? 70 : 45, frameSize = 50 + Math.floor(random() * 31), scale = (lo + Math.floor(random() * Math.max(1, largestScale(style) - lo + 1))) / 100;
    const range = BOARD_STRIPS[style], steps = range ? (range.max - range.min) / range.step + 1 : 0;
    const board = range ? (HARD ? range.max - range.step * Math.floor(random() * Math.ceil(steps / 2)) : range.min + range.step * Math.floor(random() * steps)) : undefined;
    request = {mode: 'figure', name: motif, contours, colors, frame: 'circle', style, frameSize, scale, ...(board ? {board} : {}), gap: frameGap({...defaults, mode: 'figure', style})};
    name = `s-fig-${motif}-${style}-f${frameSize}-s${Math.round(scale * 100)}${board ? `-b${board}` : ''}`;
  } else {
    // With CHECKERED, random letters (one to five, a second word now and then) in all nine shipped fonts:
    // the word list and six fonts give only some 240 designs, most already in the training data.
    const letters = 'ABCDEFGHIJKLMNOPRSTUVWXYÆØÅ', word = () => Array.from({length: 1 + Math.floor(random() * 5)}, () => pick([...letters])).join('');
    const text = process.env.TEXT || (CHECKERED ? (random() < .25 ? `${word()} ${word()}` : word()) : pick(WORDS));
    const fontId = pick(CHECKERED ? [...fontIds, 'alfaslabone', 'bungee', 'josefinsans'] : fontIds), tpl = pick(CHECKERED ? TEXT_TEMPLATES.filter(t => t.textFrame === 'checkered') : TEXT_TEMPLATES), font = await fonts.font(fontId, text);
    request = {mode: 'text', name: text, text, font, textFrame: tpl.textFrame, fittedCells: tpl.cells === 'letters', colors};
    name = `s-txt-${text.replace(/[^A-Za-z0-9]/g, '_')}-${fontId}-${tpl.id}`;
  }
  // ONE: one given figure request (JSON: motif, style, board, scale, frameSize), named ONE_NAME.
  if (process.env.ONE) { const o = JSON.parse(process.env.ONE), {contours} = JSON.parse(await fs.readFile(`${root}static/generator/motifs/${o.motif}.json`, 'utf8')); request = {mode: 'figure', name: o.motif, contours, colors, frame: 'circle', style: o.style, frameSize: o.frameSize ?? defaults.frameSize, scale: o.scale, ...(o.board ? {board: o.board} : {}), gap: frameGap({...defaults, mode: 'figure', style: o.style})}; name = process.env.ONE_NAME ?? 'one'; }
  try {
    const {design} = generate(request);
    const cut = cutJSON(design), sol = loadSolutionJSON(cut), woven = sampleWeave(sol, 400);
    await fs.writeFile(`${out}/${name}.cut.json`, JSON.stringify(cut));
    await fs.writeFile(`${out}/${name}.mask.json`, JSON.stringify({size: 400, data: Array.from(woven, v => (v ? 1 : 0))}));
    made++;
    if (made % 10 === 0) console.log(made, name);
  } catch { /* refused or unreadable: skipped */ }
}
console.log('made', made, 'of', tries);
await server.close();
dom.window.close();
