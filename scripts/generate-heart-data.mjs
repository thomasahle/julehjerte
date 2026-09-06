#!/usr/bin/env node
/**
 * Generate the build-time data for the gallery hearts from static/hearts/<id>.svg.
 *
 * For every heart id in src/lib/data/hearts.json this parses the SVG with the same
 * parser the site uses (parseHeartFromSVG) and writes:
 *
 *   src/lib/data/heart-designs.json  the parsed HeartDesign per heart (fingers in
 *                                    editor pixel coordinates, grid size, weave parity,
 *                                    metadata), so the gallery and detail pages render
 *                                    the hearts at prerender time without fetching or
 *                                    parsing SVG in the browser
 *   src/lib/data/heart-meta.json     name/author/description/date/grid size/difficulty/
 *                                    symmetry/photo per heart for head tags and headers
 *
 * Coordinates are rounded to 1/1000 px (invisible; the symmetry and overlap checks
 * use 3-5 px tolerances) so the JSON stays small and diffs stay readable. The
 * TypeScript modules are loaded through Vite in SSR mode with jsdom providing DOMParser.
 *
 * Usage: node scripts/generate-heart-data.mjs   (also run by `npm run prebuild`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heartsJsonPath = path.join(root, 'src/lib/data/hearts.json');
const metaPath = path.join(root, 'src/lib/data/heart-meta.json');
const designsPath = path.join(root, 'src/lib/data/heart-designs.json');
const svgDir = path.join(root, 'static/hearts');
const photoDir = path.join(root, 'static/hearts/photos');
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const COORD_DECIMALS = 3;

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

function roundCoord(value) {
  const rounded = Number(value.toFixed(COORD_DECIMALS));
  return Object.is(rounded, -0) ? 0 : rounded;
}

// The design as the site will see it: a plain JSON object with rounded coordinates
// and without undefined fields.
function roundDesign(design) {
  return JSON.parse(JSON.stringify(design, (key, value) => (typeof value === 'number' ? roundCoord(value) : value)));
}

// One heart per block and one bezier segment per line: readable diffs at a third of
// the size of JSON.stringify(designs, null, 2).
function formatDesigns(designs) {
  const lines = ['{'];
  const ids = Object.keys(designs);
  ids.forEach((id, i) => {
    const { fingers, ...rest } = designs[id];
    lines.push(`  ${JSON.stringify(id)}: {`);
    for (const [key, value] of Object.entries(rest)) {
      lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
    }
    lines.push('    "fingers": [');
    fingers.forEach((finger, j) => {
      const { segments, ...fingerRest } = finger;
      const head = Object.entries(fingerRest)
        .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
        .join(', ');
      lines.push(`      { ${head}, "segments": [`);
      segments.forEach((segment, k) => {
        lines.push(`        ${JSON.stringify(segment)}${k < segments.length - 1 ? ',' : ''}`);
      });
      lines.push(`      ] }${j < fingers.length - 1 ? ',' : ''}`);
    });
    lines.push('    ]');
    lines.push(`  }${i < ids.length - 1 ? ',' : ''}`);
  });
  lines.push('}');
  const json = `${lines.join('\n')}\n`;
  if (JSON.stringify(JSON.parse(json)) !== JSON.stringify(designs)) {
    throw new Error('formatDesigns produced JSON that does not match the designs');
  }
  return json;
}

function writeIfChanged(file, content) {
  const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content;
  if (changed) fs.writeFileSync(file, content);
  return changed;
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
  const designs = {};
  try {
    for (const id of ids) {
      const svgPath = path.join(svgDir, `${id}.svg`);
      if (!fs.existsSync(svgPath)) {
        throw new Error(`hearts.json lists "${id}" but ${path.relative(root, svgPath)} does not exist`);
      }
      const parsed = parseHeartFromSVG(fs.readFileSync(svgPath, 'utf8'), `${id}.svg`);
      if (!parsed) {
        throw new Error(`Failed to parse ${path.relative(root, svgPath)}`);
      }
      // Derive the metadata from the rounded design so both files agree.
      const design = roundDesign(parsed);
      designs[id] = design;
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

  const metaChanged = writeIfChanged(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  const designsChanged = writeIfChanged(designsPath, formatDesigns(designs));
  const withPhoto = Object.values(meta).filter((m) => m.photo).length;
  console.log(
    `heart-data: ${ids.length} hearts (${withPhoto} with photo) -> ` +
      `${path.relative(root, metaPath)}${metaChanged ? '' : ' (unchanged)'}, ` +
      `${path.relative(root, designsPath)}${designsChanged ? '' : ' (unchanged)'}`
  );
} finally {
  await server.close();
}
