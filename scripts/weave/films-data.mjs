/**
 * What is known about each heart's weaving film: scripts/weave/films.json, written by
 * films.mjs (which makes the films) and read by scripts/generate-heart-data.mjs (which tells
 * the heart pages which hearts have one).
 *
 * A film belongs to the cuts it was simulated from. `designHash` is taken over what the
 * simulator reads of a heart's SVG, so renaming a heart or rewriting its texts keeps the
 * film, and redrawing a cut makes it stale: the page then leaves the film out until
 * films.mjs has made it again.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FILMS_JSON = 'scripts/weave/films.json';
export const FILMS_DIR = 'static/weave';

/** The simulator and its settings: part of every design hash, so changing them makes every film stale. */
export const SIM_VERSION = '1';

/**
 * The outcomes a heart's page shows a film for. `clean`: paper never passed through paper.
 * `unclean`: the simulator got a strip through a loop only by letting it pass through paper
 * for a while (its "magic", `magic` strips over `magicFrames` frames; `patchFrames` more in which
 * only a patch of a strip, mostly the foot of a standing one, was in other paper), or some frames have
 * paper in paper (`bad`). The simulator counts neither as a failure and the film still shows
 * every step, so both are shown; take `unclean` out here to show only the clean ones.
 */
export const SHOWN = new Set(['clean', 'unclean']);

/** Hash of what the simulator reads of a heart's SVG: everything but its names, texts and credits. */
export function designHash(svgText) {
  const drawn = svgText
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '')
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, '')
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(`${SIM_VERSION}\n${drawn}`).digest('hex').slice(0, 16);
}

export function readFilms(root) {
  const file = path.join(root, FILMS_JSON);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

/** Sorted by id, one heart per line, so two nights' results merge and diff line by line. */
export function writeFilms(root, films) {
  const ids = Object.keys(films).sort();
  const lines = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(films[id])}`);
  fs.writeFileSync(path.join(root, FILMS_JSON), `{\n${lines.join(',\n')}\n}\n`);
}

/**
 * The film a heart's page may show: `{ v, bytes }`, or null with `why` when it has none.
 * Only a film of the heart as it is drawn now, with its recording in place.
 */
export function filmFor(root, films, id, svgText) {
  const entry = films[id];
  if (!entry) return { film: null, why: null };
  if (entry.design !== designHash(svgText)) return { film: null, why: 'the heart was redrawn since' };
  if (!SHOWN.has(entry.outcome)) return { film: null, why: null };
  const file = path.join(root, FILMS_DIR, `${id}.jhb`);
  if (!fs.existsSync(file)) return { film: null, why: 'its recording is missing' };
  if (fs.statSync(file).size !== entry.bytes) return { film: null, why: 'its recording is not the one listed' };
  return { film: { v: entry.v, bytes: entry.bytes }, why: null };
}

/** A recording's header (see pack.py). */
export function readRecordingHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    if (head.toString('latin1', 0, 4) !== 'JHB1') throw new Error(`${file} is not a recording`);
    const json = Buffer.alloc(head.readUInt32LE(4));
    fs.readSync(fd, json, 0, json.length, 8);
    return JSON.parse(json.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}
