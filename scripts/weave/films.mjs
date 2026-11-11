#!/usr/bin/env node
/**
 * Make the weaving films: for each gallery heart, simulate the weaving (unweave.py) and pack
 * it for the page (pack.py) as static/weave/<id>.jhb, and note the outcome in
 * scripts/weave/films.json. Run offline; a heart takes minutes of one core. The pages show
 * the films this leaves (scripts/generate-heart-data.mjs, filmFor).
 *
 *   node scripts/weave/films.mjs                 every heart in hearts.jsonc without an up-to-date film
 *   node scripts/weave/films.mjs nemt-hjerte …   these hearts
 *   --force       also hearts whose outcome is already noted for the cuts as they are
 *   --dry         only read each design and lay out its finished weave (seconds a heart):
 *                 says which hearts the simulator supports, changes nothing
 *   --jobs N      hearts simulated at a time (default 1); each is one single-threaded process
 *   --until HH:MM stop starting hearts at that time of day and stop the ones still running
 *   --keep        keep each heart's working files (tmp/weave/<id>/: the raw run, its log)
 *   --list        print what films.json holds and what is stale; do nothing
 *
 * WEAVE_PYTHON names the Python that has scripts/weave/requirements.txt installed
 * (default python3). Stops before starting a heart when less than 15 GB of disk is free.
 *
 * An interrupted heart starts over next time: the simulator can resume from its checkpoints,
 * but then its count of trouble (strips passed through paper, frames with paper in paper)
 * covers only the resumed part, and films.json is where that count is kept.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../../src/lib/utils/jsonc.js';
import { FILMS_DIR, designHash, readFilms, readRecordingHeader, writeFilms } from './films-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const PYTHON = process.env.WEAVE_PYTHON || 'python3';
// The simulator's settings for the site's films (README.md): mesh triangles of at most 0.03 of a
// strip width squared, 5 solver rounds a frame; every 2nd frame is kept, 7.5 a second.
const SIM_ARGS = ['--area', '0.03', '--iters', '5'];
const PACK_EVERY = '2';
const MIN_FREE_GB = 15;

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return false;
  args.splice(at, 1);
  return true;
};
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0) return null;
  return args.splice(at, 2)[1];
};
const force = flag('--force');
const dry = flag('--dry');
const keep = flag('--keep');
const list = flag('--list');
const jobs = Number(option('--jobs') ?? 1);
const until = option('--until');
const unknown = args.find((a) => a.startsWith('--'));
if (unknown || !(jobs >= 1)) {
  console.error(`films: unknown option ${unknown ?? '--jobs'}`);
  process.exit(2);
}

const allIds = parseJsonc(fs.readFileSync(path.join(root, 'hearts.jsonc'), 'utf8')).categories.flatMap(
  (category) => category.hearts
);
const ids = args.length ? args : allIds;
const strangers = ids.filter((id) => !allIds.includes(id));
if (strangers.length) {
  console.error(`films: not in hearts.jsonc: ${strangers.join(', ')}`);
  process.exit(2);
}

const svgOf = (id) => path.join(root, 'static/hearts', `${id}.svg`);
const films = readFilms(root);
const hashes = Object.fromEntries(ids.map((id) => [id, designHash(fs.readFileSync(svgOf(id), 'utf8'))]));

if (list) {
  for (const id of allIds) {
    const entry = films[id];
    const now = designHash(fs.readFileSync(svgOf(id), 'utf8'));
    const state = !entry ? 'no film' : entry.design !== now ? `${entry.outcome}, STALE` : entry.outcome;
    console.log(`${id.padEnd(28)} ${state}${entry?.reason ? `: ${entry.reason}` : ''}`);
  }
  process.exit(0);
}

/** The time of day `until` names, as the next moment it comes. */
function deadline() {
  if (!until) return Infinity;
  const [h, m] = until.split(':').map(Number);
  const at = new Date();
  at.setHours(h, m ?? 0, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  return at.getTime();
}
const stopAt = deadline();

function freeGb() {
  const out = spawnSync('df', ['-k', root], { encoding: 'utf8' }).stdout.trim().split('\n').pop();
  return Number(out.split(/\s+/)[3]) / 1024 / 1024;
}

// One core a heart: the solves are small and banded, and threads only fight when hearts run side by side.
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', VECLIB_MAXIMUM_THREADS: '1', MKL_NUM_THREADS: '1' };
const running = new Set();

function run(command, argv, logFile) {
  return new Promise((resolve) => {
    const out = fs.openSync(logFile, 'w');
    const child = spawn(command, argv, { cwd: here, env, stdio: ['ignore', out, out] });
    running.add(child);
    child.on('close', (code, signal) => {
      running.delete(child);
      fs.closeSync(out);
      resolve({ code, signal });
    });
    child.on('error', () => {});
  });
}

const notSupported = (log) => log.match(/NOT SUPPORTED YET: (.*)/)?.[1] ?? null;
const lastLine = (log) => log.trim().split('\n').pop()?.slice(0, 300) ?? '';

async function probe(id) {
  const work = path.join(root, 'tmp/weave', id);
  fs.mkdirSync(work, { recursive: true });
  const logFile = path.join(work, 'dry.log');
  const { code } = await run(PYTHON, ['unweave.py', svgOf(id), path.join(work, 'dry.npz'), ...SIM_ARGS, '--dry'], logFile);
  const log = fs.readFileSync(logFile, 'utf8');
  const reason = notSupported(log);
  console.log(`${id.padEnd(28)} ${code === 0 ? 'supported' : reason ? `not supported: ${reason}` : `failed: ${lastLine(log)}`}`);
  if (!keep) fs.rmSync(work, { recursive: true, force: true });
  return code === 0;
}

async function make(id) {
  const started = Date.now();
  const work = path.join(root, 'tmp/weave', id);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const npz = path.join(work, 'run.npz');
  const logFile = path.join(work, 'run.log');
  const note = (entry) => {
    films[id] = { design: hashes[id], ...entry, made: new Date().toISOString().slice(0, 10) };
    writeFilms(root, films);
    const mins = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`${new Date().toTimeString().slice(0, 5)} ${id.padEnd(28)} ${entry.outcome}${entry.reason ? `: ${entry.reason}` : ''} (${mins} min)`);
  };

  const sim = await run(PYTHON, ['unweave.py', svgOf(id), npz, ...SIM_ARGS], logFile);
  if (stopping) return;
  const log = fs.readFileSync(logFile, 'utf8');
  if (sim.code !== 0) {
    fs.rmSync(path.join(root, FILMS_DIR, `${id}.jhb`), { force: true });
    const reason = notSupported(log);
    // A heart that could be read and laid out but broke on the way keeps its files to look at.
    if (reason) fs.rmSync(work, { recursive: true, force: true });
    return note(reason ? { outcome: 'unsupported', reason } : { outcome: 'failed', reason: lastLine(log) });
  }

  const recording = path.join(root, FILMS_DIR, `${id}.jhb`);
  const fresh = path.join(work, `${id}.jhb`);
  const packLog = path.join(work, 'pack.log');
  const pack = await run(PYTHON, ['pack.py', npz, fresh, PACK_EVERY, '--log', logFile], packLog);
  if (stopping) return;
  if (pack.code !== 0) return note({ outcome: 'failed', reason: `pack.py: ${lastLine(fs.readFileSync(packLog, 'utf8'))}` });

  const header = readRecordingHeader(fresh);
  const stats = header.stats ?? {};
  if (!Number.isInteger(stats.crossings)) return note({ outcome: 'failed', reason: 'the run left no summary' });
  // Clean: no strip was passed through paper to get it through, and no frame has paper in paper.
  const outcome = stats.magic === 0 && stats.bad === 0 ? 'clean' : 'unclean';
  const bytes = fs.statSync(fresh).size;
  const v = createHash('sha256').update(fs.readFileSync(fresh)).digest('hex').slice(0, 10);
  fs.copyFileSync(fresh, recording);
  if (!keep) fs.rmSync(work, { recursive: true, force: true });
  note({
    outcome,
    v,
    bytes,
    seconds: Math.round(header.span),
    crossings: stats.crossings,
    stretch: stats.stretch,
    magic: stats.magic,
    magicFrames: stats.magicFrames,
    bad: stats.bad,
    retries: stats.retries ?? 0,
    simSeconds: stats.seconds
  });
}

const todo = dry ? ids : ids.filter((id) => force || films[id]?.design !== hashes[id]);
console.log(`films: ${todo.length} of ${ids.length} hearts to ${dry ? 'check' : 'make'}, ${jobs} at a time${until ? `, until ${until}` : ''}`);

let stopping = false;
function stop(why) {
  if (stopping) return;
  stopping = true;
  console.log(`films: stopping (${why})`);
  for (const child of running) child.kill('SIGKILL');
}
process.on('SIGINT', () => stop('interrupted'));
process.on('SIGTERM', () => stop('terminated'));
const timer = Number.isFinite(stopAt) ? setTimeout(() => stop(`it is ${until}`), stopAt - Date.now()) : null;

const queue = [...todo];
let supported = 0;
async function worker() {
  while (queue.length && !stopping) {
    if (!dry && freeGb() < MIN_FREE_GB) return stop(`less than ${MIN_FREE_GB} GB of disk free`);
    const id = queue.shift();
    if (dry) supported += (await probe(id)) ? 1 : 0;
    else await make(id);
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, todo.length)) }, worker));
if (timer) clearTimeout(timer);

if (dry) {
  console.log(`films: ${supported} of ${todo.length} supported`);
} else {
  const count = (outcome) => ids.filter((id) => films[id]?.design === hashes[id] && films[id].outcome === outcome).length;
  console.log(
    `films: ${count('clean')} clean, ${count('unclean')} unclean, ${count('unsupported')} unsupported, ${count('failed')} failed, ` +
      `${ids.filter((id) => films[id]?.design !== hashes[id]).length} not made; run "npm run generate:heart-data" to tell the pages`
  );
}
