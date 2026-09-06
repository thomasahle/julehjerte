#!/usr/bin/env node
/**
 * Generate src/lib/data/heart-meta.json from the gallery SVGs.
 *
 * For every heart id in src/lib/data/hearts.json this reads static/hearts/<id>.svg
 * with the same parser the site uses (parseHeartFromSVG) and records the
 * metadata the detail page needs at prerender time: name, author, description,
 * date, grid size, difficulty, symmetry classification and which photo (if any)
 * exists in static/hearts/photos. The TypeScript modules are loaded through
 * Vite in SSR mode with jsdom providing DOMParser.
 *
 * Usage: node scripts/generate-heart-meta.mjs   (also run by `npm run prebuild`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heartsJsonPath = path.join(root, 'src/lib/data/hearts.json');
const outputPath = path.join(root, 'src/lib/data/heart-meta.json');
const svgDir = path.join(root, 'static/hearts');
const photoDir = path.join(root, 'static/hearts/photos');
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// Read image dimensions from the file header (PNG, JPEG, WebP) without extra deps.
function imageSize(file) {
  const buf = fs.readFileSync(file);
  // PNG: 8-byte signature, then IHDR chunk with width/height.
  if (buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk the marker segments until a SOFn frame header.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
    return null;
  }
  // WebP: RIFF container with a VP8 / VP8L / VP8X first chunk.
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
  }
  return null;
}

function findPhoto(id) {
  for (const ext of PHOTO_EXTENSIONS) {
    const file = path.join(photoDir, `${id}.${ext}`);
    if (!fs.existsSync(file)) continue;
    const size = imageSize(file);
    if (!size) {
      throw new Error(`Could not read image dimensions of ${path.relative(root, file)}`);
    }
    return { src: `/hearts/photos/${id}.${ext}`, ...size };
  }
  return null;
}

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

try {
  const { parseHeartFromSVG } = await server.ssrLoadModule('/src/lib/utils/heartDesign.ts');
  const { detectSymmetry, lobesShareTemplate } = await server.ssrLoadModule('/src/lib/utils/symmetry.ts');
  const { calculateDifficulty } = await server.ssrLoadModule('/src/lib/utils/difficulty.ts');

  const heartsData = JSON.parse(fs.readFileSync(heartsJsonPath, 'utf8'));
  const ids = heartsData.categories.flatMap((category) => category.hearts);

  // The parser logs a warning per skipped path; keep the build output readable.
  const originalWarn = console.warn;
  console.warn = () => {};

  const meta = {};
  try {
    for (const id of ids) {
      const svgPath = path.join(svgDir, `${id}.svg`);
      if (!fs.existsSync(svgPath)) {
        throw new Error(`hearts.json lists "${id}" but ${path.relative(root, svgPath)} does not exist`);
      }
      const design = parseHeartFromSVG(fs.readFileSync(svgPath, 'utf8'), `${id}.svg`);
      if (!design) {
        throw new Error(`Failed to parse ${path.relative(root, svgPath)}`);
      }
      const symmetry = detectSymmetry(design.fingers);
      meta[id] = {
        name: design.name,
        author: design.author || null,
        authorUrl: design.authorUrl ?? null,
        publisher: design.publisher ?? null,
        publisherUrl: design.publisherUrl ?? null,
        source: design.source ?? null,
        date: design.date ?? null,
        description: design.description ?? null,
        gridSize: design.gridSize,
        difficulty: calculateDifficulty(design).level,
        symmetry: {
          isClassic: symmetry.isClassic,
          curveSymmetry: symmetry.curveSymmetry,
          lobeSymmetry: symmetry.lobeSymmetry,
          mirrorSymmetry: symmetry.mirrorSymmetry,
          sharedTemplate: lobesShareTemplate(design.fingers, design.gridSize)
        },
        photo: findPhoto(id)
      };
    }
  } finally {
    console.warn = originalWarn;
  }

  const json = `${JSON.stringify(meta, null, 2)}\n`;
  const changed = !fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== json;
  if (changed) fs.writeFileSync(outputPath, json);
  const withPhoto = Object.values(meta).filter((m) => m.photo).length;
  console.log(
    `heart-meta: ${ids.length} hearts (${withPhoto} with photo) -> ${path.relative(root, outputPath)}${changed ? '' : ' (unchanged)'}`
  );
} finally {
  await server.close();
}
