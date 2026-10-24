// Mal's picture import end to end, headless, as docs/inverse/MAL-PICTURES.md
// measures it: the template reader first (a confident read is the answer), else
// the worker's neural crop (detectPhotoCrops), `prepare` with the quad and the
// import settings, the 400 x 400 mask (maskFromPrepared), the page's symmetry
// detection and fold, `prepareMask` + `design` with Mal's solve settings, and
// Mal's converter. The woven heart is scored against the mask as the page does
// (and against `truth` when a case has one). Statuses: template, pass,
// fidelity (cut and shown, with the page's note that details are missing),
// fail, no_crop, *_error. E2E_ROOT=<another checkout> measures that one.
//   node scripts/inverse/mal-pictures-benchmark.mjs LIST.json OUT_DIR [--exact=off|compete] [--ids=a,b] [--shard=k/n] [--stage=mask] [--save-masks]
// LIST.json: [{id, file, roi?, quad?, truth?}] (truth: a {size: 400, data} mask of the true design). One JSON line per case on stdout and in OUT_DIR/results.jsonl.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {createCanvas, loadImage} from 'canvas';

const [listFile, out, ...flags] = process.argv.slice(2);
const flag = name => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3);
const exactMode = flag('exact') ?? 'raster', stageOnly = flag('stage'), saveMasks = flags.includes('--save-masks'), ids = flag('ids')?.split(','), [shard, shards] = (flag('shard') ?? '0/1').split('/').map(Number);
const ROOT = process.env.E2E_ROOT ?? path.resolve(new URL('../..', import.meta.url).pathname);
const server = await createServer({root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: {middlewareMode: true, hmr: false}, appType: 'custom', logLevel: 'error'});
const load = p => server.ssrLoadModule(p);
const [{maskFromPrepared}, {detectSymmetry, transformsFor, symmetrize}, {cloneMask, maskMismatch}, mal, {DEFAULT_COLORS, DEFAULT_COLORS_HEX}, {convertValidatedCutGeometry}, {rasterizeDesign}] = await Promise.all([
  load('/src/lib/paint/importImage.ts'), load('/src/lib/paint/symmetry.ts'), load('/src/lib/paint/mask.ts'), load('/src/lib/inverse/engine.ts'),
  load('/src/lib/stores/colors.ts'), load('/src/lib/inverse/toHeartDesign.ts'), load('/src/lib/paint/rasterize.ts')]);
const {readTemplateImage} = await load('/src/lib/paint/templateImage.ts').catch(() => ({}));
const {prepare, design, restorePrepared} = await import(`${ROOT}/static/inverse/core/engine.js`);
const {AUTOMATIC_PRESET} = await import(`${ROOT}/static/inverse/core/presets.js`);
const {rectifyMotif} = await import(`${ROOT}/static/inverse/locator/locator.js`);
const {createBodyPredictor} = await import(`${ROOT}/static/inverse/neural/runtime.js`);
const {detectPhotoCrops} = await import(`${ROOT}/static/inverse/neural/photo-crop.js`);
const R = `${ROOT}/static/inverse`;
const predictBody = createBodyPredictor({loadRuntime: () => import(`${R}/vendor/onnxruntime-1.19.2/ort.module.mjs`), loadModel: () => fs.readFile(`${R}/neural/body-1033a25b.onnx`)});

const colors = DEFAULT_COLORS, pair = mal.paperPair(colors);
// prepareImage's settings (src/lib/inverse/engine.ts), auto colour mode.
const importSettings = {...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, resolution: 400, paperColors: pair, mode: 'auto', swatches: pair, invert: false, photoImport: true};
await fs.mkdir(out, {recursive: true});
const list = JSON.parse(await fs.readFile(listFile, 'utf8')).filter((c, k) => (!ids || ids.includes(c.id)) && k % shards === shard);
const S = 220;
for (const c of list) {
  const row = {id: c.id, stage: 'decode'}, t0 = performance.now(), panel = createCanvas(4 * S, S), pc = panel.getContext('2d');
  pc.fillStyle = '#ddd'; pc.fillRect(0, 0, panel.width, panel.height);
  const paint = (mask, column, colorsOf = v => v ? [185, 20, 35] : [255, 255, 255]) => {
    const n = mask.size, img = createCanvas(n, n), ctx = img.getContext('2d'), px = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) px.data.set([...(mask.validMask && !mask.validMask[i] ? [130, 130, 130] : colorsOf(mask.data[i])), 255], 4 * i);
    ctx.putImageData(px, 0, 0); pc.drawImage(img, column * S, 0, S, S);
  };
  try {
    const img = await loadImage(c.file);
    if (img.width * img.height > 24e6) throw new Error('pixelsTooLarge');
    const src = createCanvas(img.width, img.height), sc = src.getContext('2d');
    sc.drawImage(img, 0, 0);
    const input = {type: 'pixels', imageWidth: img.width, imageHeight: img.height, rgba: new Uint8ClampedArray(sc.getImageData(0, 0, img.width, img.height).data)};
    const k = Math.min(S / img.width, S / img.height), dx = (S - img.width * k) / 2, dy = (S - img.height * k) / 2;
    pc.drawImage(img, dx, dy, img.width * k, img.height * k);
    // Mal reads a picture as a template first (templateRead.ts).
    if (readTemplateImage && !c.quad) {
      const t = performance.now(), read = readTemplateImage({width: img.width, height: img.height, data: input.rgba});
      row.templateSeconds = +((performance.now() - t) / 1000).toFixed(2);
      if (read && read.confidence >= .5) {
        const woven = rasterizeDesign(read.design, 400);
        paint(woven, 3);
        row.template = {confidence: +read.confidence.toFixed(2), layout: read.layout, cuts: ['left', 'right'].map(l => read.design.fingers.filter(f => f.lobe === l && !f.id.includes('-edge-')).length)};
        row.status = 'template';
        throw null;
      }
    }
    row.stage = 'crop';
    let quad = c.quad;
    if (!quad) {
      const t = performance.now(), crops = await detectPhotoCrops(c.roi ? {...input, roi: c.roi} : input, {predictBody, roi: c.roi});
      row.cropSeconds = +((performance.now() - t) / 1000).toFixed(1);
      row.crop = {status: crops.status, count: crops.candidates.length, method: crops.candidates[0]?.provenance?.method};
      quad = crops.candidates[0]?.quad;
    }
    if (!quad) { row.status = 'no_crop'; throw null; }
    pc.strokeStyle = '#ff00a8'; pc.lineWidth = 2; pc.beginPath(); quad.forEach(([x, y], i) => i ? pc.lineTo(dx + k * x, dy + k * y) : pc.moveTo(dx + k * x, dy + k * y)); pc.closePath(); pc.stroke();
    const crop = rectifyMotif({width: img.width, height: img.height, data: input.rgba}, quad.map(p => p.map(v => v - .5)), {size: S});
    const cp = pc.createImageData(S, S); cp.data.set(crop.data); pc.putImageData(cp, S, 0);
    row.stage = 'prepare';
    const prepared = prepare({...input, quad}, importSettings);
    const mask = maskFromPrepared({mask: prepared.target.sourceImage.mask, resolution: prepared.target.sourceImage.resolution, validMask: prepared.target.sourceImage.validMask});
    // The page: rows from the import's mask, folded before the search.
    const symmetry = detectSymmetry(mask);
    symmetrize(mask, transformsFor(symmetry));
    row.symmetry = `${symmetry.curve}/${symmetry.lobe}/${symmetry.lobes}`;
    paint(mask, 2);
    if (stageOnly === 'mask' || saveMasks) await fs.writeFile(path.join(out, `${c.id}.mask.json`), JSON.stringify({size: mask.size, data: Array.from(mask.data), ...(mask.validMask ? {validMask: Array.from(mask.validMask)} : {}), symmetry}));
    if (stageOnly === 'mask') { row.status = 'mask'; throw null; }
    // A case with its true design: how far the import's mask is from it.
    const truth = c.truth ? JSON.parse(await fs.readFile(c.truth, 'utf8')) : null;
    if (truth) row.importVsTruth = +maskMismatch(mask.data, Uint8Array.from(truth.data)).toFixed(5);
    row.stage = 'solve';
    const target = cloneMask(mask), t = performance.now();
    const preparedMask = prepare(mal.maskToArtwork(target), mal.maskPrepareSettings(colors));
    const settings = {...mal.solveSettings({colors, symmetry}), ...(exactMode === 'off' ? {exactOutline: false} : exactMode === 'compete' ? {exactCompete: true} : {})};
    const answer = await design(restorePrepared(structuredClone(preparedMask.target)), settings);
    row.solveSeconds = +((performance.now() - t) / 1000).toFixed(1);
    const rep = answer.report;
    row.passes = Boolean(rep.templateChecksPassed);
    // Which checks: a template failing only image fidelity is still cut and shown, with a note.
    row.checks = {geometry: rep.validation?.passed !== false, paper: rep.manufacturing?.status, fidelity: rep.imageFidelity?.passed !== false, features: rep.imageFidelity?.features?.passed !== false};
    row.issues = [...new Set((rep.issues || []).map(i => i.type || i.kind || String(i)).slice(0, 20))];
    const ex = rep.solver?.exactOutline;
    if (ex) row.exact = {chosen: ex.chosen, error: ex.error, start: ex.start, attempts: (ex.search?.attempts || []).map(a => [a.hidden, a.countStatus, a.lengthStatus, a.status]),
      // Hidden cut (mm, as the weave shows it) of the fitter's template and the exact search's.
      hidden: [ex.fitter?.hidden, ex.exactOutline?.hidden].map(v => v === undefined ? null : Math.round(v)), refined: ex.refined?.taken ?? null};
    row.stage = 'convert';
    const converted = convertValidatedCutGeometry(answer.files['cut_geometry.json'], {name: 'e2e', colors: DEFAULT_COLORS_HEX, enforce: symmetry, reference: {mask: target}});
    const woven = rasterizeDesign(converted.design, target.size);
    row.mismatch = +maskMismatch(woven.data, target.data, target.validMask).toFixed(5);
    row.cuts = converted.design.fingers.filter(f => f.id.includes('-cut-')).length;
    if (truth) row.wovenVsTruth = +maskMismatch(woven.data, Uint8Array.from(truth.data)).toFixed(5);
    paint({...woven, validMask: target.validMask}, 3);
    row.status = row.passes ? 'pass' : row.checks.geometry && row.checks.paper === 'pass' ? 'fidelity' : 'fail';
  } catch (error) {
    if (error) { row.status = `${row.stage}_error`; row.error = String(error?.message ?? error).slice(0, 300); }
  }
  delete row.stage;
  row.seconds = +((performance.now() - t0) / 1000).toFixed(1);
  await fs.writeFile(path.join(out, `${c.id}.png`), panel.toBuffer('image/png'));
  const line = JSON.stringify(row);
  await fs.appendFile(path.join(out, 'results.jsonl'), line + '\n');
  console.log(line);
}
await server.close();
