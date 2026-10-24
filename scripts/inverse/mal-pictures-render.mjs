// The site's own gallery (static/hearts/*.svg) as pictures a visitor might import: each heart's
// weave (rasterizeDesign) drawn as Mal draws a mask (drawHeart), clean and as a snapshot
// (turned, noisy, JPEG); the weave is the truth, and the true crop quad is kept.
//   node scripts/inverse/mal-pictures-render.mjs OUT_DIR   (then: mal-pictures-benchmark.mjs OUT_DIR/cases.json RUN_DIR)
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {createCanvas} from 'canvas';
import {JSDOM} from 'jsdom';
const [out] = process.argv.slice(2), ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
globalThis.DOMParser = new JSDOM().window.DOMParser;
globalThis.document = {createElement: () => createCanvas(1, 1)};
const server = await createServer({root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: {middlewareMode: true, hmr: false}, appType: 'custom', logLevel: 'error'});
const load = p => server.ssrLoadModule(p);
const [{drawHeart, heartLayout}, {toScreen}, {DEFAULT_COLORS}, {parseHeartFromSVG}, {rasterizeDesign}] = await Promise.all([
  load('/src/lib/paint/drawHeart.ts'), load('/src/lib/paint/heartLayout.ts'), load('/src/lib/stores/colors.ts'), load('/src/lib/utils/heartDesign.ts'), load('/src/lib/paint/rasterize.ts')]);
await fs.mkdir(out, {recursive: true});
const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => { const p = toScreen(heartLayout(800), u, v); return [p.x, p.y]; });
let seed = 7;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647, cases = [];
const warn = console.warn; console.warn = () => {};
for (const file of (await fs.readdir(`${ROOT}/static/hearts`)).filter(f => f.endsWith('.svg')).sort()) {
  const id = file.slice(0, -4), design = parseHeartFromSVG(await fs.readFile(`${ROOT}/static/hearts/${file}`, 'utf8'), file);
  if (!design) { warn('unparsed', file); continue; }
  const mask = rasterizeDesign(design, 400);
  await fs.writeFile(path.join(out, `${id}.truth.json`), JSON.stringify({size: 400, data: Array.from(mask.data)}));
  const heart = createCanvas(800, 800); drawHeart(heart.getContext('2d'), mask, DEFAULT_COLORS, 800);
  const clean = createCanvas(900, 800), cx = clean.getContext('2d');
  cx.fillStyle = '#f4f2ec'; cx.fillRect(0, 0, 900, 800); cx.drawImage(heart, 50, 0);
  await fs.writeFile(path.join(out, `${id}.png`), clean.toBuffer('image/png'));
  cases.push({id, file: path.join(out, `${id}.png`), truth: path.join(out, `${id}.truth.json`), track: 'clean', trueQuad: corners.map(([x, y]) => [x + 50, y])});
  const angle = (random() - .5) * .3, shot = createCanvas(1000, 900), sx = shot.getContext('2d');
  sx.fillStyle = '#e9e4d8'; sx.fillRect(0, 0, 1000, 900);
  sx.save(); sx.translate(500, 450); sx.rotate(angle); sx.drawImage(heart, -400, -400); sx.restore();
  const px = sx.getImageData(0, 0, 1000, 900);
  for (let i = 0; i < px.data.length; i += 4) { const n = (random() - .5) * 18; px.data[i] = Math.min(255, px.data[i] * .97 + 6 + n); px.data[i + 1] = Math.min(255, px.data[i + 1] * .94 + n); px.data[i + 2] = Math.min(255, px.data[i + 2] * .88 + n); }
  sx.putImageData(px, 0, 0);
  await fs.writeFile(path.join(out, `${id}-shot.jpg`), shot.toBuffer('image/jpeg', {quality: .72}));
  cases.push({id: `${id}-shot`, file: path.join(out, `${id}-shot.jpg`), truth: path.join(out, `${id}.truth.json`), track: 'shot',
    trueQuad: corners.map(([x, y]) => [500 + Math.cos(angle) * (x - 400) - Math.sin(angle) * (y - 400), 450 + Math.sin(angle) * (x - 400) + Math.cos(angle) * (y - 400)])});
}
console.warn = warn;
await fs.writeFile(path.join(out, 'cases.json'), JSON.stringify(cases));
console.log(cases.length, 'cases');
await server.close();
