/**
 * Smaller copies of the site's photographs, for the sizes they are shown at.
 *
 * The photos of finished hearts (static/hearts/photos) and the scans on the Om page
 * (static/about/history) are kept as they were given, up to 1200 px wide and up to 1 MB. A
 * page shows them far smaller: 64 px as a thumbnail, a few hundred as the picture. This
 * writes each one again as a JPEG at the widths below (only those narrower than the
 * original) to static/small/<same path>-<width>.jpg, and lists them in
 * src/lib/data/small-images.json, from which the pages build a `srcset`
 * ($lib/smallImages). The original stays the `src`, and what a link to the picture opens.
 *
 * static/small is not in git: like static/og it is made by `npm run generate:heart-data`
 * (so before every build), or by running this file alone. A copy newer than its original is
 * left as it is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';

const WIDTHS = [160, 480, 720, 960];
const QUALITY = 0.8;
const FOLDERS = ['hearts/photos', 'about/history'];
const SOURCE = /\.(jpe?g|png)$/i;
// Pictures made for one small place already.
const SKIP = /-small\.\w+$/;

/** `image` drawn `width` px wide. Halved in steps first: one large step leaves jagged edges. */
function scaled(image, width) {
  let source = image;
  let w = image.width;
  let h = image.height;
  const draw = (toW, toH) => {
    const canvas = createCanvas(toW, toH);
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    // JPEG has no transparency: anything see-through becomes white.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, toW, toH);
    context.drawImage(source, 0, 0, toW, toH);
    source = canvas;
    w = toW;
    h = toH;
  };
  while (w / 2 >= width) draw(Math.round(w / 2), Math.round(h / 2));
  draw(width, Math.round((image.height * width) / image.width));
  return source;
}

/** Make the copies and the list. Returns how many pictures have copies and how many files were written. */
export async function makeSmallImages(root) {
  const list = {};
  let written = 0;
  for (const folder of FOLDERS) {
    const from = path.join(root, 'static', folder);
    const to = path.join(root, 'static/small', folder);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(to, { recursive: true });
    const wanted = new Set();
    for (const name of fs.readdirSync(from).sort()) {
      if (!SOURCE.test(name) || SKIP.test(name)) continue;
      const file = path.join(from, name);
      const image = await loadImage(file);
      const stem = name.replace(/\.\w+$/, '');
      const copies = [];
      for (const width of WIDTHS) {
        if (width >= image.width) continue;
        const copy = `${stem}-${width}.jpg`;
        const target = path.join(to, copy);
        wanted.add(copy);
        if (!fs.existsSync(target) || fs.statSync(target).mtimeMs < fs.statSync(file).mtimeMs) {
          fs.writeFileSync(target, scaled(image, width).toBuffer('image/jpeg', { quality: QUALITY, progressive: true }));
          written++;
        }
        copies.push([width, `/small/${folder}/${copy}`]);
      }
      if (copies.length) list[`/${folder}/${name}`] = copies;
    }
    // Copies of pictures that are gone, or are no longer made at that width.
    for (const name of fs.readdirSync(to)) if (!wanted.has(name)) fs.unlinkSync(path.join(to, name));
  }
  const listPath = path.join(root, 'src/lib/data/small-images.json');
  const text = `${JSON.stringify(list, null, 2)}\n`;
  if (!fs.existsSync(listPath) || fs.readFileSync(listPath, 'utf8') !== text) fs.writeFileSync(listPath, text);
  return { pictures: Object.keys(list).length, written };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { pictures, written } = await makeSmallImages(root);
  console.log(`small-images: ${pictures} pictures, ${written} files written`);
}
