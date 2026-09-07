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
 *   static/og/<id>.png               1200x630 Open Graph image per heart (the coloured
 *                                    preview with the name on the site background),
 *                                    rendered with @resvg/resvg-js; gitignored, built on
 *                                    every build
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
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heartsJsonPath = path.join(root, 'src/lib/data/hearts.json');
const metaPath = path.join(root, 'src/lib/data/heart-meta.json');
const designsPath = path.join(root, 'src/lib/data/heart-designs.json');
const svgDir = path.join(root, 'static/hearts');
const photoDir = path.join(root, 'static/hearts/photos');
const ogDir = path.join(root, 'static/og');
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const COORD_DECIMALS = 3;

// Open Graph card: the site's body background (src/routes/+layout.svelte) and the
// default heart colours (src/lib/stores/colors.ts).
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_BACKGROUND = '#f9f9f3';
const OG_COLORS = { left: '#ffffff', right: 'rgb(185, 19, 19)' };
// The card text is set in a vendored font so the images are byte-identical on every
// machine and in CI, independent of system fonts. scripts/fonts/ holds a Latin subset of
// Liberation Sans (SIL OFL 1.1), renamed "Juleflet Sans" as the licence requires for
// modified versions; see scripts/fonts/README.md for how it was made.
const OG_FONT_FAMILY = 'Juleflet Sans';
const OG_FONT = `'${OG_FONT_FAMILY}', sans-serif`;
const OG_FONT_FILES = ['JulefletSans-Regular.ttf', 'JulefletSans-Bold.ttf'].map((file) =>
  path.join(root, 'scripts/fonts', file)
);

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

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The heart on the left, name and author on the right.
function buildOgSvg(design, heart) {
  const heartSize = 540;
  const heartX = 60;
  const heartY = (OG_HEIGHT - heartSize) / 2;
  const [minX, minY, viewWidth, viewHeight] = heart.viewBox.split(' ').map(Number);
  const scale = heartSize / Math.max(viewWidth, viewHeight);
  const textX = heartX + heartSize + 70;
  const maxTextWidth = OG_WIDTH - textX - 50;
  // Fit long names by shrinking the font; glyph widths are approximate (fonts vary).
  const nameSize = Math.max(40, Math.min(76, Math.floor(maxTextWidth / (0.6 * design.name.length))));
  const author = design.author ? `af ${design.author}` : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">`,
    `<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_BACKGROUND}"/>`,
    `<g transform="translate(${heartX - minX * scale} ${heartY - minY * scale}) scale(${scale})">${heart.markup}</g>`,
    `<text x="${textX}" y="290" font-family="${OG_FONT}" font-size="${nameSize}" font-weight="700" fill="#111">${escapeXml(design.name)}</text>`,
    author
      ? `<text x="${textX}" y="340" font-family="${OG_FONT}" font-size="30" fill="#555">${escapeXml(author)}</text>`
      : '',
    `<text x="${textX}" y="410" font-family="${OG_FONT}" font-size="30" font-weight="600" fill="#4a7c8a">juleflet.dk</text>`,
    '</svg>'
  ].join('');
}

function renderOgPng(svg, fontFiles) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: OG_FONT_FAMILY },
    logLevel: 'off'
  });
  return resvg.render().asPng();
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
  const { renderHeartSvgInline } = await server.ssrLoadModule('/src/lib/rendering/heartSvg.ts');

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

  // Open Graph images. Not committed (static/og is gitignored); stale files from
  // renamed hearts are removed so the build output only carries listed hearts.
  const started = performance.now();
  const fontFiles = OG_FONT_FILES;
  const missingFont = fontFiles.find((file) => !fs.existsSync(file));
  if (missingFont) throw new Error(`heart-data: vendored font missing: ${path.relative(root, missingFont)}`);
  fs.mkdirSync(ogDir, { recursive: true });
  for (const file of fs.readdirSync(ogDir)) {
    if (file.endsWith('.png') && !ids.includes(file.slice(0, -4))) fs.unlinkSync(path.join(ogDir, file));
  }
  for (const id of ids) {
    const heart = renderHeartSvgInline(designs[id], OG_COLORS, { idPrefix: `og-${id}` });
    fs.writeFileSync(path.join(ogDir, `${id}.png`), renderOgPng(buildOgSvg(designs[id], heart), fontFiles));
  }
  console.log(
    `heart-data: ${ids.length} Open Graph images -> ${path.relative(root, ogDir)}/ ` +
      `(${((performance.now() - started) / 1000).toFixed(1)}s)`
  );
} finally {
  await server.close();
}
