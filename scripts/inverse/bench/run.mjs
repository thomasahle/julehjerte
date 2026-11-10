// The Mal solver benchmark in one command: the production engine in Node (solve.mjs) on a set of painted masks,
// as the page runs it, then a table of the results (passes by family, median seconds, why the rest fail). One
// process per chunk of masks (HiGHS's wasm memory only grows), one at a time and niced; every budget on the CPU
// clock unless --wall; a run resumes where the same --out stopped. README.md beside this file: the sets, the
// modes, what counts as a pass, the pitfalls.
//   node scripts/inverse/bench/run.mjs [--set generator|test|LIST] [MASK.json...] [--mode ladder|today|fitter|both|all]
//     [--ladders 2] [--core DIR] [--model FILE] [--maps DIR] [--budget S] [--why] [--wall] [--match REGEX]
//     [--data DIR] [--out DIR] [--chunk 10] [--timeout 900] [--min-free-gb 15] [--templates FILE] [--list]
//   node scripts/inverse/bench/run.mjs --summary DIR [--list] [--templates FILE]
//   node scripts/inverse/bench/run.mjs --compare A B      (run dirs or jsonl files, old tmp/e2e runs too)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../..');
const text = {type: 'string'}, flag = {type: 'boolean'};
const {values: o, positionals} = parseArgs({allowPositionals: true, options: {
  set: text, mode: {...text, default: 'ladder'}, ladders: {...text, default: '2'}, core: text, model: text, maps: text, budget: text,
  why: flag, wall: flag, match: text, data: text, out: text, chunk: {...text, default: '10'}, timeout: {...text, default: '900'},
  'min-free-gb': {...text, default: '15'}, templates: text, list: flag, summary: text, compare: flag}});
const fail = message => { console.error(message); process.exit(2); };
// The masks live outside git (README.md: where they came from); the lists name them relative to this root.
const DATA = path.resolve(o.data ?? process.env.MAL_BENCH_DATA ?? `${ROOT}/tmp/e2e`);
const SETS = {generator: `${HERE}/sets/generator.txt`, test: `${HERE}/sets/test.txt`};
const MODES = {ladder: ['ladder'], today: ['today'], fitter: ['fitter'], both: ['ladder', 'today'], all: ['ladder', 'today', 'fitter']};
const listed = file => fs.readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
// An entry: absolute, or under the data root, the current directory or the repository (old lists say tmp/e2e/...).
const locate = f => [f, path.resolve(DATA, f), path.resolve(f), path.resolve(ROOT, f)].find(p => path.isAbsolute(p) && fs.existsSync(p)) ?? path.resolve(DATA, f);
const bare = id => id.replace(/\.mask\.json$/, '');
const KNOWN = new Map(Object.values(SETS).flatMap(listed).map(f => [bare(path.basename(f)), f]));
const STYLES = 'rays|wedges|fitted|board|sunburst|layers|corners|motifs|strips';
// The family: the figure frame or the text frame (was tmp/e2e/bench/fam.py), else where the test picture is from.
function family(id, file = KNOWN.get(id) ?? '') {
  const fig = id.match(new RegExp(`^b-fig-.+?-(${STYLES})(-b\\d+)?$`)), dir = path.dirname(file);
  if (fig) return `fig-${fig[1]}`;
  if (id.startsWith('b-txt-')) return `txt-${id.replace(/^b-txt-.+?-(nunito|oswald|kalam|righteous)-/, '')}`;
  return dir.endsWith('jf-maskmode') ? 'library' : dir.endsWith('gallery/masks') ? 'gallery' : dir.endsWith('web44-masks') ? 'photos' : 'other';
}
const hashOf = file => createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);

// What counts as a pass: the engine's own verdict, which is what the page takes as a template (templateChecksPassed:
// the export's rules with clearances up to 0.1 mm short, the paper, the picture within the export's 3%): the solve
// line has no `near` (solve.mjs adds it to every answer that fails the verdict), the regions kept, the rules
// passed. tmp/e2e/bench/summary.py's ok() read `near` as a string and so also passed near misses with no rule
// broken but an uncertain or failing paper, or the picture too far off (4 of the 170, 1 of the 127 in off2).
const modeOf = r => r.mode ?? ('fitter' in r ? 'fitter' : r.withMaps === false ? 'today' : 'ladder');
const passed = r => Boolean(r) && (modeOf(r) === 'fitter' ? r.fitter === true : Boolean(r.exact && r.passes && r.features !== false && !('near' in r)));
function reason(r) {
  if (passed(r)) return 'pass';
  if (r.error === 'timeout' || /^crashed/.test(r.error ?? '')) return r.error.split(' ')[0];
  if (modeOf(r) === 'fitter' ? r.error : !r.exact) return /no template/.test(r.error ?? '') ? 'no template' : 'error';
  if (r.near || r.kinds?.length) return 'rules';
  if (r.features === false) return 'regions';
  if (r.paper && r.paper !== 'pass') return 'paper';
  return (r.mismatch ?? 0) > .03 ? 'picture' : 'other';
}
// A run's lines by heart and mode: every *.jsonl in DIR (or one file); old runs' p0.jsonl, ladder.jsonl,
// today.jsonl and fitter files read alike (a line without `mode` is the fitter's if it has `fitter`, else
// today's search when it ran without maps, else the ladder).
function load(where) {
  const files = fs.statSync(where).isDirectory() ? fs.readdirSync(where).filter(f => f.endsWith('.jsonl')).map(f => path.join(where, f)) : [where];
  const runs = new Map();
  for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l.startsWith('{')) continue;
    const r = JSON.parse(l), id = bare(r.id), v = runs.get(id) ?? runs.set(id, {}).get(id);
    (v[modeOf(r)] ??= []).push(r);
  }
  return runs;
}
// A heart's result in one mode: its fastest passing line (of any ladder part), else its nearest miss.
const best = lines => lines?.filter(passed).sort((a, b) => a.seconds - b.seconds)[0] ?? lines?.find(r => r.exact) ?? lines?.[0];
const median = xs => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const modesIn = (...runs) => ['ladder', 'today', 'fitter'].filter(m => runs.every(run => [...run.values()].some(v => v[m])));

function summary(dir) {
  const runs = load(dir), info = fs.existsSync(`${dir}/run.json`) ? JSON.parse(fs.readFileSync(`${dir}/run.json`, 'utf8')) : null, modes = modesIn(runs), out = [];
  // Which hearts have a template the export takes (check-templates.mjs `exports`): the generator's own.
  const tf = o.templates ?? `${HERE}/sets/generator-templates.jsonl`, solvable = fs.existsSync(tf) ? new Map(listed(tf).map(l => JSON.parse(l)).map(t => [t.id, t.exports === true])) : null;
  const known = solvable && [...runs.keys()].some(id => solvable.has(id));
  // Twins (one mask under two names) count once, as the first name.
  const pictures = new Map();
  for (const [id, v] of runs) {
    const r = Object.values(v)[0][0], f = KNOWN.get(id) && locate(KNOWN.get(id)), key = r.mask ?? (f && fs.existsSync(f) ? hashOf(f) : id);
    (pictures.get(key) ?? pictures.set(key, []).get(key)).push(id);
  }
  if (info) out.push(`${dir}: ${info.set ?? 'masks'}, mode ${info.mode}${info.mode !== 'today' && info.mode !== 'fitter' ? `, ${info.ladders} ladder${info.ladders > 1 ? 's' : ''}` : ''}, ${info.clock} clock, ${info.commit ?? '?'}${info.dirty ? ' (changed)' : ''}${info.core ? `, core ${info.core}` : ''}${info.model ? `, model ${info.model}` : ''}${info.budget ? `, budget ${info.budget} s` : ''}`);
  else out.push(dir);
  const twins = [...pictures.values()].filter(ids => ids.length > 1);
  out.push(`${runs.size} hearts, ${pictures.size} pictures${twins.length ? ` (${twins.length} twins counted once)` : ''}; modes ${modes.join(', ')}`);
  const rows = new Map(), fails = Object.fromEntries(modes.map(m => [m, {}])), total = {n: 0, any: 0, solvable: 0, missed: 0, s: []}, notes = [];
  for (const ids of pictures.values()) {
    const id = ids.sort()[0], v = runs.get(id), fam = Object.values(v)[0][0].family ?? family(id), res = Object.fromEntries(modes.map(m => [m, best(v[m])])), ok = modes.filter(m => passed(res[m]));
    const row = rows.get(fam) ?? rows.set(fam, {n: 0, any: 0, solvable: 0, missed: 0, s: []}).get(fam);
    for (const c of [row, total]) {
      c.n++; c.any += ok.length > 0;
      for (const m of ok) c[m] = (c[m] ?? 0) + 1;
      if (ok.length) c.s.push(Math.min(...ok.map(m => res[m].seconds)));
      if (known) { c.solvable += solvable.get(id) === true; c.missed += solvable.get(id) === true && !ok.length; }
    }
    if (!ok.length) for (const m of modes) if (res[m]) (fails[m][reason(res[m])] ??= []).push(id);
    const verdicts = ids.map(i => modes.map(m => passed(best(runs.get(i)[m]))).join());
    if (new Set(verdicts).size > 1) notes.push(`twins disagree: ${ids.join(' / ')}`);
  }
  const cols = [...modes, ...(modes.length > 1 ? ['any'] : []), ...(known ? ['solvable', 'missed'] : [])];
  const line = (name, c) => `  ${name.padEnd(20)}${String(c.n).padStart(4)}${cols.map(k => String(c[k] ?? 0).padStart(Math.max(7, k.length + 2))).join('')}${(c.s.length ? median(c.s).toFixed(1) : '-').padStart(10)}`;
  out.push(`  ${'family'.padEnd(20)}${'n'.padStart(4)}${cols.map(k => k.padStart(Math.max(7, k.length + 2))).join('')}${'median s'.padStart(10)}`);
  for (const name of [...rows.keys()].sort()) out.push(line(name, rows.get(name)));
  out.push(line('all', total));
  out.push(`  (median s: ${info?.clock === 'wall' ? 'wall' : 'CPU'} seconds to the first passing template, over the pictures that get one${info?.mode === 'all' ? '; fitter: run only where neither exact route passes' : ''}${known ? '; solvable: the generator\'s own template exports' : ''})`, ...notes);
  for (const m of modes) {
    const why = Object.entries(fails[m]).sort((a, b) => b[1].length - a[1].length);
    if (why.length) out.push(`why ${m} fails where nothing passes: ${why.map(([k, ids]) => `${k} ${ids.length}`).join(', ')}`);
    if (o.list) for (const [k, ids] of why) out.push(`  ${m} ${k}: ${ids.join(' ')}`);
  }
  if (known && o.list) out.push(`solvable and missed: ${[...pictures.values()].map(ids => ids.sort()[0]).filter(id => solvable.get(id) === true && !modes.some(m => passed(best(runs.get(id)[m])))).join(' ')}`);
  return out.join('\n');
}

function compare(a, b) {
  const A = load(a), B = load(b), ids = [...A.keys()].filter(i => B.has(i)).sort(), modes = modesIn(A, B), out = [];
  const first = v => modes.map(m => best(v[m])).filter(passed).sort((x, y) => x.seconds - y.seconds)[0];
  const how = r => r ? `${passed(r) ? `outline ${r.outline ?? '-'} ${r.phase ?? ''}`.trim() : reason(r)}, ${r.seconds} s${r.off >= 0 ? `, off ${r.off}` : ''}` : 'not run';
  out.push(`A ${a}\nB ${b}\n${ids.length} hearts in both; modes ${modes.join(', ')}`);
  if (modes.length > 1) for (const m of modes) out.push(`  ${m}: A ${ids.filter(i => passed(best(A.get(i)[m]))).length}  B ${ids.filter(i => passed(best(B.get(i)[m]))).length}`);
  const pa = new Set(ids.filter(i => first(A.get(i)))), pb = new Set(ids.filter(i => first(B.get(i))));
  out.push(`${modes.length > 1 ? 'any mode' : modes[0]}: A ${pa.size}  B ${pb.size}  gained ${[...pb].filter(i => !pa.has(i)).length}  lost ${[...pa].filter(i => !pb.has(i)).length}`);
  for (const i of ids) {
    if (pb.has(i) && !pa.has(i)) out.push(`  GAINED ${i.padEnd(42)} B: ${how(first(B.get(i)))}`);
    if (pa.has(i) && !pb.has(i)) out.push(`  LOST   ${i.padEnd(42)} A: ${how(first(A.get(i)))}; B: ${how(best(B.get(i)[modes[0]]))}`);
  }
  const both = ids.filter(i => pa.has(i) && pb.has(i)), fa = both.map(i => first(A.get(i))), fb = both.map(i => first(B.get(i)));
  if (both.length) out.push(`both pass ${both.length}: median s ${median(fa.map(r => r.seconds)).toFixed(1)} -> ${median(fb.map(r => r.seconds)).toFixed(1)}`);
  // How far each template is from its mask (`off`, the mismatch share), where both runs logged it (since 2026-11-08).
  const k = both.map((_, j) => j).filter(j => fa[j].off >= 0 && fb[j].off >= 0);
  if (k.length) {
    const worse = k.filter(j => fb[j].off > fa[j].off + .003).map(j => both[j]), better = k.filter(j => fb[j].off < fa[j].off - .003).map(j => both[j]);
    out.push(`  median off ${median(k.map(j => fa[j].off)).toFixed(4)} -> ${median(k.map(j => fb[j].off)).toFixed(4)} on ${k.length}; more than 0.3 points worse ${worse.length}${worse.length ? ` (${worse.join(' ')})` : ''}, better ${better.length}${better.length ? ` (${better.join(' ')})` : ''}`);
  }
  return out.join('\n');
}

async function bench() {
  const modes = MODES[o.mode] ?? fail(`--mode: one of ${Object.keys(MODES).join(', ')}`), ladders = +o.ladders, chunk = +o.chunk, timeout = +o.timeout, minFree = +o['min-free-gb'];
  if (!(ladders >= 1 && Number.isInteger(ladders))) fail('--ladders: 1, 2 or 3 (the page runs 3 at 12 threads and 8 GB, 2 at 8 threads and 4 GB, else 1)');
  let files = [...(o.set ? listed(SETS[o.set] ?? o.set).map(locate) : []), ...positionals.map(f => path.resolve(f))];
  if (o.match) files = files.filter(f => new RegExp(o.match).test(path.basename(f)));
  if (!files.length) fail('no masks: --set generator|test|LIST or MASK.json files');
  const missing = files.filter(f => !fs.existsSync(f));
  if (missing.length) fail(`${missing.length} of ${files.length} masks not found (${missing.slice(0, 2).join(', ')}): --data DIR names the directory the lists are relative to (now ${DATA})`);
  const core = o.core && path.resolve([o.core, `${o.core}/static/inverse/core`].find(d => fs.existsSync(`${d}/engine.js`)) ?? fail(`--core: no engine.js in ${o.core} or its static/inverse/core`));
  if (o.model && !fs.existsSync(o.model)) fail(`--model: ${o.model} not found`);
  const now = new Date(), stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const out = path.resolve(o.out ?? `${ROOT}/tmp/mal-bench/${o.set ? path.basename(o.set, '.txt') : 'masks'}-${o.mode}-${stamp}`);
  fs.mkdirSync(out, {recursive: true});
  const git = (...args) => { try { return execFileSync('git', ['-C', ROOT, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { return null; } };
  const rel = p => p && path.relative(ROOT, p);
  const info = {set: o.set ?? null, masks: files.length, mode: o.mode, ladders, clock: o.wall ? 'wall' : 'cpu', core: rel(core) ?? null, model: rel(o.model && path.resolve(o.model)) ?? null, maps: rel(o.maps && path.resolve(o.maps)) ?? null, budget: o.budget ? +o.budget : null, why: Boolean(o.why)};
  const before = fs.existsSync(`${out}/run.json`) ? JSON.parse(fs.readFileSync(`${out}/run.json`, 'utf8')) : null;
  const differ = before && Object.keys(info).filter(k => k !== 'masks' && JSON.stringify(before[k]) !== JSON.stringify(info[k]));
  if (differ?.length) fail(`${out} holds a run with other settings (${differ.join(', ')}): choose another --out`);
  fs.writeFileSync(`${out}/run.json`, JSON.stringify({...info, commit: git('rev-parse', '--short', 'HEAD'), dirty: Boolean(git('status', '--porcelain', '--', 'static/inverse', 'src/lib')), node: process.version, started: before?.started ?? now.toISOString()}, null, 2) + '\n');
  // solve.mjs's settings come from the flags only, never from the shell's environment.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['LADDER_ONLY', 'TODAY_ONLY', 'FITTER_ONLY', 'CPU_CLOCK', 'CORE', 'MODEL_FILE', 'MAPS_DIR', 'BUDGET', 'LADDER_PART', 'WHY', 'VITE_CACHE_DIR'].includes(k)));
  const env = {...inherited, ...(o.wall ? {} : {CPU_CLOCK: '1'}), ...(core ? {CORE: core} : {}), ...(o.model ? {MODEL_FILE: path.resolve(o.model)} : {}), ...(o.maps ? {MAPS_DIR: path.resolve(o.maps)} : {}), ...(o.budget ? {BUDGET: o.budget} : {}), ...(o.why ? {WHY: '1'} : {})};
  const log = fs.createWriteStream(`${out}/log.txt`, {flags: 'a'}), cache = `${out}/.vite-cache`, freeGB = () => { const s = fs.statfsSync(out); return s.bavail * s.bsize / 2 ** 30; };
  const linesOf = file => fs.existsSync(file) ? listed(file).filter(l => l.startsWith('{')).map(l => JSON.parse(l)) : [];
  let current = null;
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { current?.kill('SIGKILL'); fs.rmSync(cache, {recursive: true, force: true}); process.exit(130); });
  console.log(`${files.length} masks, mode ${o.mode}${modes.includes('ladder') ? `, ${ladders} ladder${ladders > 1 ? 's' : ''}` : ''}, ${info.clock} clock -> ${out}`);
  // One solve.mjs process on some masks, its lines appended to `jsonl`; which masks got one, and why it ended early.
  async function child(masks, extra, jsonl, tag) {
    fs.rmSync(cache, {recursive: true, force: true});
    const proc = current = spawn(process.execPath, [`${HERE}/solve.mjs`, ...masks], {cwd: ROOT, env: {...env, ...extra, VITE_CACHE_DIR: cache}, stdio: ['ignore', 'pipe', 'pipe']});
    try { os.setPriority(proc.pid, 10); } catch { /* left at the normal priority */ }
    const got = new Set();
    let death = null, timer = null;
    // Each mask its --timeout (wall seconds) from the last line; SIGKILL, since a SIGTERM waits for the solver.
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { death = 'timeout'; proc.kill('SIGKILL'); }, timeout * 1000); };
    const disk = setInterval(() => { if (freeGB() < minFree) { death = 'disk'; proc.kill('SIGKILL'); } }, 60e3);
    arm();
    proc.stderr.pipe(log, {end: false});
    const rl = readline.createInterface({input: proc.stdout});
    rl.on('line', l => {
      if (!l.startsWith('{')) { log.write(l + '\n'); return; }
      const r = JSON.parse(l), file = masks.find(f => path.basename(f) === r.id), where = path.relative(DATA, file);
      const line = {id: r.id, mode: r.mode, ...(tag.part ? {part: tag.part} : {}), ...r, family: family(bare(r.id), where), mask: hashOf(file), file: where.startsWith('..') ? file : where};
      fs.appendFileSync(jsonl, JSON.stringify(line) + '\n');
      got.add(r.id); arm();
      console.log(`${tag.name.padEnd(11)} ${bare(r.id).padEnd(44)} ${reason(line).padEnd(11)} ${String(r.seconds).padStart(6)} s`);
    });
    const [[code, signal]] = await Promise.all([new Promise(resolve => proc.on('close', (...a) => resolve(a))), new Promise(resolve => rl.on('close', resolve))]);
    clearTimeout(timer); clearInterval(disk); current = null;
    fs.rmSync(cache, {recursive: true, force: true});
    return {got, death: death ?? (code || signal ? `crashed (${signal ?? `exit ${code}`})` : null)};
  }
  // One route on some masks, resumed: a mask the process died or hung on gets an error line, the rest of its chunk again.
  async function pass(masks, name, extra, tag) {
    const jsonl = `${out}/${name}`, done = new Set(linesOf(jsonl).map(r => r.id));
    let todo = masks.filter(f => !done.has(path.basename(f)));
    if (done.size) console.log(`${name}: ${done.size} done before, ${todo.length} to run`);
    while (todo.length) {
      if (freeGB() < minFree) fail(`stopped: under ${minFree} GB free on the disk (rerun the same command to resume)`);
      const batch = todo.slice(0, chunk), {got, death} = await child(batch, extra, jsonl, tag);
      if (death === 'disk') fail(`stopped: under ${minFree} GB free on the disk (rerun the same command to resume)`);
      const left = batch.filter(f => !got.has(path.basename(f)));
      if (left.length) {
        const id = path.basename(left[0]), line = {id, mode: tag.mode, ...(tag.part ? {part: tag.part} : {}), ...(tag.mode === 'fitter' ? {fitter: false} : {exact: false}), error: death ?? 'no line', family: family(bare(id), path.relative(DATA, left[0]))};
        fs.appendFileSync(jsonl, JSON.stringify(line) + '\n');
        console.log(`${tag.name.padEnd(11)} ${bare(id).padEnd(44)} ${line.error}`);
      }
      todo = [...left.slice(1), ...todo.slice(chunk)];
    }
    return linesOf(jsonl);
  }
  const results = [];
  for (const mode of modes) {
    if (mode === 'ladder') for (let k = 0; k < ladders; k++) {
      // Parts after the first only where the first did not pass on the traced outline's first phase: there the page
      // takes the first part's template at once (worker-controller.js ladderGroup).
      const quick = new Set(k ? results.filter(r => r.part === `0/${ladders}` && passed(r) && r.outline === 0 && r.phase === 'first').map(r => r.id) : []);
      results.push(...await pass(files.filter(f => !quick.has(path.basename(f))), `ladder-p${k}.jsonl`, {LADDER_ONLY: '1', ...(ladders > 1 ? {LADDER_PART: `${k}/${ladders}`} : {})}, {mode, part: `${k}/${ladders}`, name: `ladder ${k}/${ladders}`}));
    }
    // With --mode all, the fitter only where neither exact route passes: the page's fitted answer stands in there.
    const exact = new Set(results.filter(passed).map(r => r.id)), masks = mode === 'fitter' && o.mode === 'all' ? files.filter(f => !exact.has(path.basename(f))) : files;
    if (mode !== 'ladder') results.push(...await pass(masks, `${mode}.jsonl`, {[`${mode.toUpperCase()}_ONLY`]: '1'}, {mode, name: mode}));
  }
  log.end();
  const table = summary(out);
  fs.writeFileSync(`${out}/summary.txt`, table + '\n');
  console.log(`\n${table}`);
}

if (o.summary) console.log(summary(path.resolve(o.summary)));
else if (o.compare) console.log(positionals.length === 2 ? compare(...positionals.map(p => path.resolve(p))) : fail('--compare A B: two run dirs or jsonl files'));
else await bench();
