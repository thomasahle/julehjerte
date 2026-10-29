#!/usr/bin/env node
/**
 * Give every gallery heart that was saved over from the editor back its names, texts
 * and credit, from the data the last `generate-heart-data` wrote (heart-meta.json and
 * heart-descriptions.json still hold the heart as it was). The cuts stay as they were
 * redrawn. What counts as such a file, and what comes back: src/lib/utils/resavedHeart.js.
 *
 * Run by generate-heart-data before it reads the SVGs, and in CI before the tests, so a
 * redrawn heart pushed as the editor saved it still deploys. The texts were written for
 * the heart as it was; generate-heart-data says when its strips, templates or difficulty
 * changed, so they can be read again.
 *
 * Usage: node scripts/restore-resaved-hearts.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../src/lib/utils/jsonc.js';
import { restoreResavedHeart } from '../src/lib/utils/resavedHeart.js';

/**
 * Rewrites the re-saved gallery SVGs under `root` and returns what it did, one line each.
 * @param {string} root
 * @returns {Array<{ id: string; file: string; message: string }>}
 */
export function restoreResavedHearts(root) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const meta = read('src/lib/data/heart-meta.json');
  const texts = read('src/lib/data/heart-descriptions.json');
  const ids = parseJsonc(fs.readFileSync(path.join(root, 'hearts.jsonc'), 'utf8')).categories.flatMap((c) => c.hearts);
  const done = [];
  for (const id of ids) {
    const file = path.join('static/hearts', `${id}.svg`);
    const full = path.join(root, file);
    if (!meta[id] || !fs.existsSync(full)) continue;
    const restored = restoreResavedHeart(fs.readFileSync(full, 'utf8'), meta[id], texts[id]);
    if (!restored) continue;
    fs.writeFileSync(full, restored.svg);
    const name = restored.keptName
      ? `kept its new name "${restored.keptName}" (set <title xml:lang> by hand if it needs one per language)`
      : `named "${meta[id].name}" again`;
    done.push({ id, file, message: `${file} was saved over from the editor: put back its texts and credit, ${name}` });
  }
  return done;
}

/**
 * Prints `message`, as an annotation on `file` when run in GitHub Actions.
 * @param {string} file
 * @param {string} message
 */
export function warn(file, message) {
  console.log(process.env.GITHUB_ACTIONS ? `::warning file=${file}::${message}` : `heart-data: ${message}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const done = restoreResavedHearts(root);
  for (const { file, message } of done) warn(file, message);
  if (!done.length) console.log('heart-data: no gallery heart was saved over from the editor');
}
