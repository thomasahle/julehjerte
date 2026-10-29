#!/usr/bin/env node
/**
 * Generate the build-time data for the gallery hearts from static/hearts/<id>.svg.
 *
 * For every heart id in hearts.jsonc (project root) this parses the SVG with the same
 * parser the site uses (parseHeartFromSVG) and writes:
 *
 *   src/lib/data/heart-designs.json  the parsed HeartDesign per heart (fingers in
 *                                    editor pixel coordinates, grid size, weave parity,
 *                                    metadata), so the gallery and detail pages render
 *                                    the hearts at prerender time without fetching or
 *                                    parsing SVG in the browser
 *   src/lib/data/heart-meta.json     name/names/author/description/date/grid size/
 *                                    difficulty/symmetry/photo per heart for head tags and
 *                                    headers. `names` is the name per site language from
 *                                    the SVG's <title xml:lang="da"> / <title xml:lang="en">,
 *                                    present only when the SVG has one; `name` (the plain
 *                                    <title>) is the fallback ($lib/utils/heartName)
 *   src/lib/data/heart-descriptions.json
 *                                    the two written paragraphs per heart, {id: {da, en}},
 *                                    from the SVG's <desc xml:lang="da"> / <desc
 *                                    xml:lang="en">. Loaded lazily by the detail page
 *                                    only ($lib/data/heartDescriptions); the generator
 *                                    fails if a gallery SVG lacks either language
 *   src/lib/data/heart-cards.json    the fields a gallery card needs in the browser,
 *                                    name (and names) and difficulty. A subset of heart-meta.json, so
 *                                    it cannot drift from it, but a twentieth of the size:
 *                                    the front page is the one page that downloads it, and
 *                                    it downloads nothing else about a heart (see
 *                                    $lib/front/galleryHearts)
 *   static/og/social/<lang>/*.png    1200x630 localized social cards for the homepage
 *                                    and each heart, using the site's landscape;
 *                                    gitignored and generated on every build
 *   static/og/<id>.png               Danish cards at the legacy URLs
 *   static/og-image.png              Danish homepage card at the legacy URL
 *   static/og/social/gallery.png     1200x630 front-page card: seven gallery hearts
 *                                    on the page background, small wordmark
 *   static/og/hearts/<id>.png        800x800 square picture of each heart in red and
 *                                    white, hanging in its ribbon on the sky colour:
 *                                    the image search results show (structured data,
 *                                    image sitemap, the heart page's thumbnail).
 *                                    Geometry in src/lib/heartImage.ts
 *   static/og/pins/<id>.png          1000x1500 Pinterest picture of each heart with
 *                                    its Danish name, for the /pinterest.xml feed
 *                                    (src/lib/pinImage.ts, docs/PINTEREST.md)
 *
 * Coordinates are rounded to 1/1000 px (invisible; the symmetry and overlap checks
 * use 3-5 px tolerances) so the JSON stays small and diffs stay readable. The
 * TypeScript modules are loaded through Vite in SSR mode with jsdom providing DOMParser.
 *
 * First, a gallery heart saved over from the editor gets back the names, texts and
 * credit an editor copy leaves out (scripts/restore-resaved-hearts.mjs). Then every
 * heart whose strips, shared template or difficulty changed since the data was last
 * written is named, as its texts tell of those.
 *
 * Usage: node scripts/generate-heart-data.mjs   (also run by `npm run prebuild`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import { Resvg } from '@resvg/resvg-js';
import { socialCardBuilder } from './social-cards.mjs';
import { parseJsonc } from '../src/lib/utils/jsonc.js';
import { restoreResavedHearts, warn } from './restore-resaved-hearts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const heartsJsonPath = path.join(root, 'hearts.jsonc');
const metaPath = path.join(root, 'src/lib/data/heart-meta.json');
const cardsPath = path.join(root, 'src/lib/data/heart-cards.json');
const descriptionsPath = path.join(root, 'src/lib/data/heart-descriptions.json');
const designsPath = path.join(root, 'src/lib/data/heart-designs.json');
const svgDir = path.join(root, 'static/hearts');
const photoDir = path.join(root, 'static/hearts/photos');
const ogDir = path.join(root, 'static/og');
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const COORD_DECIMALS = 3;

const OG_WIDTH = 1200;
const OG_COLORS = { left: '#ffffff', right: '#b91313' };
// The card text is set in a vendored font so the images are byte-identical on every
// machine and in CI, independent of system fonts. scripts/fonts/ holds a Latin subset of
// Liberation Sans (SIL OFL 1.1), renamed "Juleflet Sans" as the licence requires for
// modified versions; see scripts/fonts/README.md for how it was made.
const OG_FONT_FAMILY = 'Juleflet Sans';
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

function renderOgPng(svg, fontFiles) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: { loadSystemFonts: false, fontFiles, defaultFontFamily: OG_FONT_FAMILY },
    logLevel: 'off'
  });
  return resvg.render().asPng();
}

function renderPng(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false }, logLevel: 'off' })
    .render()
    .asPng();
}

/** A heart's square search picture: see src/lib/heartImage.ts. */
function squareHeartSvg(heart, image) {
  const { HEART_IMAGE_SIZE: size, HEART_IMAGE_BOX: box, HEART_IMAGE_RIBBON: ribbon, HEART_IMAGE_BACKGROUND: background, HEART_IMAGE_COLORS: colors } = image;
  const ribbonWidth = box.size * ribbon.width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${background}"/>` +
    `<rect x="${(size - ribbonWidth) / 2}" y="0" width="${ribbonWidth}" height="${box.top + box.size * ribbon.dip}" fill="${colors.right}"/>` +
    `<svg x="${box.left}" y="${box.top}" width="${box.size}" height="${box.size}" viewBox="${heart.viewBox}">${heart.markup}</svg>` +
    '</svg>';
}

/** The front page card's hearts, first row then second (social-cards.mjs `gallery`). */
const GALLERY_CARD_HEARTS = ['classic-3x3', 'stjerne', 'juletrae', 'amy-rosette', 'jul', 'snowflake', 'h4h2'];

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
  const heartImage = await server.ssrLoadModule('/src/lib/heartImage.ts');
  const pinImage = await server.ssrLoadModule('/src/lib/pinImage.ts');

  const heartsData = parseJsonc(fs.readFileSync(heartsJsonPath, 'utf8'));
  const ids = heartsData.categories.flatMap((category) => category.hearts);

  // A gallery heart saved over from the editor gets its names, texts and credit back
  // from the data below as it still is (scripts/restore-resaved-hearts.mjs), and that
  // data is what the texts were written for: the redrawn heart is held up to it.
  for (const { file, message } of restoreResavedHearts(root)) warn(file, message);
  const previous = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

  // The parser logs a warning per skipped path; keep the build output readable.
  const originalWarn = console.warn;
  console.warn = () => {};

  const meta = {};
  const designs = {};
  const descriptions = {};
  try {
    for (const id of ids) {
      const svgPath = path.join(svgDir, `${id}.svg`);
      if (!fs.existsSync(svgPath)) {
        throw new Error(`hearts.jsonc lists "${id}" but ${path.relative(root, svgPath)} does not exist`);
      }
      const parsed = parseHeartFromSVG(fs.readFileSync(svgPath, 'utf8'), `${id}.svg`);
      if (!parsed) {
        throw new Error(`Failed to parse ${path.relative(root, svgPath)}`);
      }
      // The written paragraphs go to heart-descriptions.json only, so the
      // designs and the metadata every page loads stay without the prose.
      const { descriptions: written, ...withoutDescriptions } = parsed;
      const missing = ['da', 'en'].filter((lang) => !written?.[lang]);
      if (missing.length) {
        throw new Error(
          `${path.relative(root, svgPath)} has no <desc xml:lang="${missing.join('"> or <desc xml:lang="')}"> ` +
            'text (see docs/ADDING-A-HEART.md)'
        );
      }
      descriptions[id] = { da: written.da, en: written.en };
      // Derive the metadata from the rounded design so both files agree.
      const design = roundDesign(withoutDescriptions);
      designs[id] = design;
      const symmetry = detectSymmetry(design.fingers);
      meta[id] = {
        name: design.name,
        ...(design.names ? { names: design.names } : {}),
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

  // The texts tell how many strips a heart has, whether one template covers both
  // halves and how hard it is (docs/ADDING-A-HEART.md); when a redrawn heart changes
  // any of these, they are to be read again.
  for (const id of ids) {
    const was = previous[id];
    if (!was) continue;
    const now = meta[id];
    const grid = (g) => `${g.x} × ${g.y}`;
    const changes = [
      grid(was.gridSize) !== grid(now.gridSize) && `strips ${grid(was.gridSize)} → ${grid(now.gridSize)}`,
      was.symmetry?.sharedTemplate !== now.symmetry.sharedTemplate &&
        (now.symmetry.sharedTemplate ? 'one template covers both halves now' : 'one template no longer covers both halves'),
      was.difficulty !== now.difficulty && `difficulty ${was.difficulty} → ${now.difficulty}`
    ].filter(Boolean);
    if (changes.length) {
      warn(`static/hearts/${id}.svg`, `${id} was redrawn (${changes.join('; ')}): read its texts again`);
    }
  }

  const cards = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        name: meta[id].name,
        ...(meta[id].names ? { names: meta[id].names } : {}),
        difficulty: meta[id].difficulty
      }
    ])
  );

  const metaChanged = writeIfChanged(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  const cardsChanged = writeIfChanged(cardsPath, `${JSON.stringify(cards, null, 2)}\n`);
  const designsChanged = writeIfChanged(designsPath, formatDesigns(designs));
  const descriptionsChanged = writeIfChanged(descriptionsPath, `${JSON.stringify(descriptions, null, 2)}\n`);
  const withPhoto = Object.values(meta).filter((m) => m.photo).length;
  console.log(
    `heart-data: ${ids.length} hearts (${withPhoto} with photo) -> ` +
      `${path.relative(root, metaPath)}${metaChanged ? '' : ' (unchanged)'}, ` +
      `${path.relative(root, cardsPath)}${cardsChanged ? '' : ' (unchanged)'}, ` +
      `${path.relative(root, designsPath)}${designsChanged ? '' : ' (unchanged)'}, ` +
      `${path.relative(root, descriptionsPath)}${descriptionsChanged ? '' : ' (unchanged)'}`
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
  const builder = socialCardBuilder(root);
  const heartImages = Object.fromEntries(ids.map((id) => [
    id, renderHeartSvgInline(designs[id], OG_COLORS, { idPrefix: `og-${id}` })
  ]));
  // Both languages get a public image URL. Keep the previous URLs working too.
  const socialDir = path.join(ogDir, 'social');
  fs.rmSync(socialDir, { recursive: true, force: true });
  for (const lang of ['da', 'en']) {
    const output = path.join(socialDir, lang);
    fs.mkdirSync(output, { recursive: true });
    const home = renderOgPng(builder.home(['stjerne', 'classic-3x3', 'h4h2'].map((id) => heartImages[id]), lang), fontFiles);
    fs.writeFileSync(path.join(output, 'home.png'), home);
    if (lang === 'da') fs.writeFileSync(path.join(root, 'static/og-image.png'), home);
    for (const id of ids) {
      const png = renderOgPng(builder.heart({ ...designs[id], id }, heartImages[id], lang), fontFiles);
      fs.writeFileSync(path.join(output, `${id}.png`), png);
      if (lang === 'da') fs.writeFileSync(path.join(ogDir, `${id}.png`), png);
    }
  }
  fs.writeFileSync(path.join(socialDir, 'gallery.png'), renderOgPng(builder.gallery(GALLERY_CARD_HEARTS.map((id) => {
    if (!heartImages[id]) throw new Error(`heart-data: the front page card's heart "${id}" is not in hearts.jsonc`);
    return heartImages[id];
  })), fontFiles));
  console.log(
    `heart-data: ${2 * (ids.length + 1) + 1} social cards plus legacy images -> ${path.relative(root, ogDir)}/ ` +
      `(${((performance.now() - started) / 1000).toFixed(1)}s)`
  );

  // The square search pictures, one per heart in both languages' pages. Drawn
  // with the site's colours, so their hearts are the default ones on the page.
  const squaresStarted = performance.now();
  const squaresDir = path.join(ogDir, 'hearts');
  fs.rmSync(squaresDir, { recursive: true, force: true });
  fs.mkdirSync(squaresDir, { recursive: true });
  let squareBytes = 0;
  for (const id of ids) {
    const heart = renderHeartSvgInline(designs[id], heartImage.HEART_IMAGE_COLORS, { idPrefix: `sq-${id}` });
    const png = renderPng(squareHeartSvg(heart, heartImage), heartImage.HEART_IMAGE_SIZE);
    squareBytes += png.length;
    fs.writeFileSync(path.join(root, 'static', heartImage.heartImagePath(id)), png);
  }
  console.log(
    `heart-data: ${ids.length} square heart images (${Math.round(squareBytes / ids.length / 1024)} KB each on average) -> ` +
      `${path.relative(root, squaresDir)}/ (${((performance.now() - squaresStarted) / 1000).toFixed(1)}s)`
  );

  // The Pinterest pictures, one per heart, named in Danish.
  const pinsStarted = performance.now();
  const pinsDir = path.join(ogDir, 'pins');
  fs.rmSync(pinsDir, { recursive: true, force: true });
  fs.mkdirSync(pinsDir, { recursive: true });
  let pinBytes = 0;
  const pinLayout = { width: pinImage.PIN_IMAGE_WIDTH, height: pinImage.PIN_IMAGE_HEIGHT, tagline: pinImage.PIN_IMAGE_TAGLINE };
  for (const id of ids) {
    const heart = renderHeartSvgInline(designs[id], heartImage.HEART_IMAGE_COLORS, { idPrefix: `pin-${id}` });
    const name = designs[id].names?.da || designs[id].name; // $lib/utils/heartName for 'da'
    const png = new Resvg(builder.pin(heart, name, pinLayout), {
      fitTo: { mode: 'width', value: pinImage.PIN_IMAGE_WIDTH },
      font: { loadSystemFonts: false, fontFiles, defaultFontFamily: OG_FONT_FAMILY },
      logLevel: 'off'
    }).render().asPng();
    pinBytes += png.length;
    fs.writeFileSync(path.join(root, 'static', pinImage.pinImagePath(id)), png);
  }
  console.log(
    `heart-data: ${ids.length} Pinterest images (${Math.round(pinBytes / ids.length / 1024)} KB each on average) -> ` +
      `${path.relative(root, pinsDir)}/ (${((performance.now() - pinsStarted) / 1000).toFixed(1)}s)`
  );
} finally {
  await server.close();
}
