#!/usr/bin/env node
/**
 * Read an SVG heart — a drawing from Inkscape or another editor, an exported file,
 * or a gallery file — with the same importer as the editor's "Importér SVG"
 * (parseHeartFromSVGWithReport in src/lib/utils/heartDesign.ts), print what it made
 * of it, and write either the HeartDesign JSON or, with --gallery, the gallery SVG.
 *
 * The importer reads <path>, <line> and <polyline> elements with every path command
 * (arcs included, absolute or relative) and their transforms; joins a cut split into
 * several subpaths; recognises a drawn outline of the overlap square, drops it and
 * uses it as the square (else the viewBox); scales the square to the editor's 0–100;
 * and assigns horizontal cuts to the left half and vertical ones to the right.
 *
 * Usage:
 *   node scripts/svg-to-heart.mjs drawing.svg                    summary + JSON on stdout
 *   node scripts/svg-to-heart.mjs drawing.svg --out heart.json   summary + JSON to a file
 *   node scripts/svg-to-heart.mjs drawing.svg --gallery kugle --name Kugle --author "Thomas Ahle"
 *       writes static/hearts/kugle.svg in the gallery format (as "Eksportér SVG" does),
 *       with the two empty <desc xml:lang> placeholders to fill in (docs/ADDING-A-HEART.md)
 *
 * Options:
 *   --out <file>        Write the HeartDesign JSON here instead of stdout
 *   --gallery <id>      Write static/hearts/<id>.svg instead of JSON
 *   --name <name>       Heart name (default: the SVG's <title>)
 *   --author <author>   Author (default: the SVG's author metadata)
 *   --date <YYYY-MM-DD> Date (default: the SVG's date, else today)
 *   --parity <0|1>      Weave parity (default: the SVG's data-weave-parity, else 0)
 *   --force             Overwrite an existing static/hearts/<id>.svg
 *   --strict            Exit with status 1 if the import has warnings
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  const doc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1];
  console.log(doc.replace(/^ \* ?/gm, '').trim());
  process.exit(argv.length === 0 ? 1 : 0);
}

const VALUE_FLAGS = new Set(['--out', '--gallery', '--name', '--author', '--date', '--parity']);
const BOOL_FLAGS = new Set(['--force', '--strict']);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) {
    if (argv[i + 1] === undefined) fail(`${a} needs a value`);
    flags[a] = argv[++i];
  } else if (BOOL_FLAGS.has(a)) flags[a] = true;
  else if (a.startsWith('--')) fail(`unknown option ${a} (see --help)`);
  else positional.push(a);
}
if (positional.length !== 1) fail('give exactly one input SVG (see --help)');

function fail(message) {
  console.error(`svg-to-heart: ${message}`);
  process.exit(1);
}

const inputPath = positional[0];
const galleryId = flags['--gallery'];
if (galleryId !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(galleryId)) {
  fail(`--gallery id "${galleryId}" must be lower-case ASCII letters and digits with hyphens`);
}
if (flags['--date'] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(flags['--date'])) fail('--date must be YYYY-MM-DD');
if (flags['--parity'] !== undefined && !/^[01]$/.test(flags['--parity'])) fail('--parity must be 0 or 1');

// The parser expects a browser DOM.
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, preTransformRequests: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { $lib: path.join(root, 'src/lib') } }
});

let exitCode = 0;
try {
  const { parseHeartFromSVGWithReport, serializeHeartDesign, serializeHeartToSVG } = await server.ssrLoadModule(
    '/src/lib/utils/heartDesign.ts'
  );
  const { importSummary } = await server.ssrLoadModule('/src/lib/utils/svgImportSummary.ts');

  const svgText = fs.readFileSync(inputPath, 'utf8');
  const originalWarn = console.warn;
  console.warn = () => {}; // the report below says the same, once
  let result;
  try {
    result = parseHeartFromSVGWithReport(svgText, `${galleryId ?? path.basename(inputPath, '.svg')}.svg`);
  } finally {
    console.warn = originalWarn;
  }
  const { design, report } = result;
  if (!design) fail(`${inputPath}: no horizontal or vertical cuts found`);

  const summary = importSummary(design, report, 'en');
  const square = { outline: 'the drawn outline', viewBox: 'the viewBox', none: 'the 0–100 coordinates' }[report.square];
  console.error(`${inputPath}: ${summary.text} (square taken from ${square})`);
  if (summary.warnings && flags['--strict']) exitCode = 1;

  if (flags['--name'] !== undefined) design.name = flags['--name'];
  if (flags['--author'] !== undefined) design.author = flags['--author'];
  if (flags['--date'] !== undefined) design.date = flags['--date'];
  if (flags['--parity'] !== undefined) design.weaveParity = Number(flags['--parity']);

  if (galleryId !== undefined) {
    if (!design.name || design.name === 'Untitled') fail('the SVG has no <title>; give the heart a --name');
    if (!design.author) fail('the SVG names no author; give an --author');
    design.id = galleryId;
    design.date ??= new Date().toISOString().slice(0, 10);
    const outPath = path.join(root, 'static/hearts', `${galleryId}.svg`);
    if (fs.existsSync(outPath) && !flags['--force']) fail(`${path.relative(root, outPath)} exists (use --force to replace it)`);
    // The gallery format: what "Eksportér SVG" writes, the two <desc xml:lang>
    // paragraphs empty for the author to fill in.
    fs.writeFileSync(outPath, serializeHeartToSVG({ ...design, descriptions: undefined }) + '\n');
    console.error(
      `Wrote ${path.relative(root, outPath)}. Next: write the two <desc xml:lang> paragraphs, ` +
        'add the id to hearts.jsonc and run npm run generate:heart-data (docs/ADDING-A-HEART.md).'
    );
  } else {
    const json = JSON.stringify(serializeHeartDesign(design), null, 2) + '\n';
    if (flags['--out']) {
      fs.writeFileSync(flags['--out'], json);
      console.error(`Wrote ${flags['--out']}`);
    } else {
      process.stdout.write(json);
    }
  }
} finally {
  await server.close();
}
process.exit(exitCode);
