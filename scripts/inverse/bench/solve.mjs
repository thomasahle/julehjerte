// One process of the Mal benchmark (run.mjs starts it on a chunk of masks; it was tmp/e2e/even/prodcheck3b.mjs):
// the page's production path in Node. Each mask is made symmetric as the page does (detectSymmetry, symmetrize)
// and prepared with Mal's settings; the cut-proposal network makes its maps through neural/cuts.js on the site's
// ONNX Runtime; the engine's design() runs with Mal's solve settings as the network's ladder alone (the page's
// ladder workers), today's exact search alone (its exact worker) or the smooth fitter alone. One JSON line per
// mask and mode on stdout.
//   [ENV] node scripts/inverse/bench/solve.mjs MASK.json...
// Environment, all optional:
//   LADDER_ONLY / TODAY_ONLY / FITTER_ONLY  one route (default: the ladder, then today's search)
//   CPU_CLOCK=1    every budget on this thread's CPU time (see below)
//   CORE=DIR       the engine to run (a copy of static/inverse/core), default static/inverse/core
//   MODEL_FILE=F   the network (float16 ONNX), default static/inverse/neural/cuts-*.onnx
//   MAPS_DIR=DIR   maps from DIR/<id>.pred.json (cuts/predict.py) instead of the network
//   BUDGET=S       the search's seconds (Mal's 1, 2 or 3 minutes: 60, 120, 180)
//   LADDER_PART=i/n  the ladder as the i-th of n side by side (engine.js ladderPart)
//   WHY=1          a failed search's report (600 characters) in the line
//   VITE_CACHE_DIR=DIR  this process's vite cache (run.mjs passes one and removes it)
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const env = process.env;
// CPU_CLOCK: the core's deadlines and HiGHS's time_limit both read performance.now(); counted in this thread's CPU
// time, a run's result does not hang on the machine's load (wall-clock A/Bs flip near the deadline). `wall` is
// still the wall clock.
if (env.CPU_CLOCK) { const zero = process.threadCpuUsage(); performance.now = () => { const u = process.threadCpuUsage(zero); return (u.user + u.system) / 1000; }; }
const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url))), C = path.resolve(env.CORE ?? `${ROOT}/static/inverse/core`);
const V = `${ROOT}/static/inverse/vendor/onnxruntime-1.19.2/`, NEURAL = `${ROOT}/static/inverse/neural`;
const route = env.FITTER_ONLY ? ['fitter'] : env.TODAY_ONLY ? ['today'] : env.LADDER_ONLY ? ['ladder'] : ['ladder', 'today'];
// Each process its own vite cache: two servers sharing one fail each other ('outdated optimized dep').
const server = await createServer({root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: {middlewareMode: true, hmr: false, ws: false}, appType: 'custom', logLevel: 'silent', cacheDir: env.VITE_CACHE_DIR ?? `${ROOT}/tmp/.vite-solve-${process.pid}`});
// The cache goes with the process. A SIGTERM is not enough to end it (the handler waits for the solver's long
// synchronous calls): run.mjs kills with SIGKILL and removes the cache itself.
{ const dir = server.config.cacheDir, drop = () => process.getBuiltinModule('node:fs').rmSync(dir, {recursive: true, force: true}); process.on('exit', drop); for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => process.exit(143)); }
const [mal, {DEFAULT_COLORS}, {detectSymmetry, transformsFor, symmetrize}] = await Promise.all(['/src/lib/inverse/engine.ts', '/src/lib/stores/colors.ts', '/src/lib/paint/symmetry.ts'].map(p => server.ssrLoadModule(p)));
const {prepare, restorePrepared, design} = await import(`${C}/engine.js`);
let predict = null;
if (route.includes('ladder') && !env.MAPS_DIR) {
  const {createCutPredictor} = await import(`${NEURAL}/cuts.js`);
  const wasm = await fs.readFile(`${V}ort-wasm-simd-threaded.wasm`), model = env.MODEL_FILE ?? `${NEURAL}/${(await fs.readdir(NEURAL)).find(f => /^cuts-.*\.onnx$/.test(f))}`;
  predict = createCutPredictor({loadRuntime: async () => { const m = await import(`${V}ort.module.mjs`), ort = m.ort ?? m.default ?? m; ort.env.wasm.wasmBinary = wasm; return {ort}; }, loadModel: () => fs.readFile(model)});
}
// SETTINGS: design settings over Mal's own, for a switch under trial (run.mjs --settings).
const budget = env.BUDGET ? {seconds: +env.BUDGET} : {}, trial = env.SETTINGS ? JSON.parse(env.SETTINGS) : {}, part = env.LADDER_PART ? {ladderPart: env.LADDER_PART.split('/').map(Number)} : {};
const count = issues => Object.entries(issues.reduce((m, i) => (m[i.type] = (m[i.type] ?? 0) + 1, m), {})).map(([k, n]) => `${k}:${n}`).join(' ');
// An exact answer: `checks` is the engine's verdict (templateChecksPassed: the export's rules with clearances up to
// 0.1 mm short, the paper, the picture); a near miss also says what it breaks (`near`, the clearance shortfalls in
// mm), how far it is from the mask, whether it keeps the picture's regions and how its paper fares.
function exact(answer) {
  const rep = answer.report, x = rep.solver?.exactOutline, issues = rep.validation?.issues ?? [], mismatch = +(rep.imageError?.mismatchFraction ?? 0).toFixed(4);
  return {exact: true, checks: rep.templateChecksPassed === true, off: +(rep.imageError?.mismatchFraction ?? -1).toFixed(4),
    ...(rep.templateChecksPassed ? {} : {near: count(issues), shortfalls: issues.filter(i => /clearance/.test(i.type)).map(i => +((i.required ?? rep.settings?.nominalWidth ?? 0) - (i.distanceUpper ?? i.distanceLower ?? i.distance ?? 0)).toFixed(3)).sort((a, b) => b - a).slice(0, 5), mismatch, features: rep.imageFidelity?.features?.passed, paper: rep.manufacturing?.status}),
    tracedBound: x?.tracedBound ?? null, outline: x?.outline ?? null, phase: x?.phase ?? null, fallback: ['even', 'unjoined', 'untied', 'subgroup'].filter(f => x?.[f]).join(',') || null,
    bound: x?.search?.bound ?? null, hidden: x?.search?.attempts?.at(-1)?.hidden ?? x?.search?.hidden, ladder: x?.ladder?.map(r => `K${r.k}${r.seed ? 's' + r.seed : ''}:${r.found ? 'OK' : '--'} ${r.seconds}s`).join(' '), passes: rep.validation?.passed, carry: x?.carry};
}
// The fitter's answer: `fitter` is its verdict (templateChecksPassed).
const fitted = ({report: rep}) => ({fitter: rep.templateChecksPassed === true, kinds: [...new Set((rep.validation?.issues ?? []).map(i => i.type))], off: rep.imageError?.mismatchFraction, mismatch: rep.imageError?.mismatchFraction, features: rep.imageFidelity?.features?.passed, paper: rep.manufacturing?.status});
for (const file of process.argv.slice(2)) {
  const id = path.basename(file), name = id.replace(/\.mask\.json$/, '');
  const m = JSON.parse(await fs.readFile(file, 'utf8')), mask = {size: m.size, data: Uint8Array.from(m.data)}, symmetry = detectSymmetry(mask);
  symmetrize(mask, transformsFor(symmetry));
  const target = restorePrepared(prepare(mal.maskToArtwork(mask), mal.maskPrepareSettings(DEFAULT_COLORS)).target);
  for (const mode of route) {
    let t = performance.now(), maps = null, predictMs;
    if (mode === 'ladder') { maps = env.MAPS_DIR ? JSON.parse(await fs.readFile(`${env.MAPS_DIR}/${name}.pred.json`, 'utf8')) : await predict(target.sourceImage); predictMs = Math.round(performance.now() - t); }
    t = performance.now();
    const wall0 = Date.now();
    let line;
    try {
      if (mode === 'fitter') line = fitted(await design(target, {...mal.solveSettings({colors: DEFAULT_COLORS, symmetry, method: 'smooth', ...budget}), ...trial}));
      else line = exact(await design(target, {...mal.solveSettings({colors: DEFAULT_COLORS, symmetry, ...budget}), exactRoute: 'exact', ...(mode === 'ladder' ? {cutMaps: maps, ladderOnly: true, ...part} : {}), ...trial}));
    } catch (error) {
      const x = error.report?.solver?.exactOutline ?? error.report?.exactOutline;
      line = mode === 'fitter' ? {fitter: false, error: String(error.message).slice(0, 50)} : {exact: false, error: String(error.message).slice(0, 50), tracedBound: x?.tracedBound, carry: x?.carry, ...(env.WHY ? {why: JSON.stringify(x ?? error.report ?? null).slice(0, 600)} : {})};
    }
    console.log(JSON.stringify({id, mode, withMaps: mode === 'ladder', ...(predictMs === undefined ? {} : {predictMs}), seconds: +((performance.now() - t) / 1000).toFixed(1), wall: +((Date.now() - wall0) / 1000).toFixed(1), ...line}));
  }
}
await server.close();
