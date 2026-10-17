import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';
/** Image-only workflow benchmark. All proposals remain reviewable, including failures. */
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createCanvas} from 'canvas';
import {detectHeartCrops as currentDetector} from '../../static/inverse/core/crop.js';
import {prepare, design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {rectifyMotif} from '../../static/inverse/locator/locator.js';
import {renderExportedWeave} from './export-renderer.mjs';

const arg = name => process.argv.find(s => s.startsWith(`--${name}=`))?.slice(name.length + 3);
const stage = arg('stage') || 'prepare', seconds = Number(arg('seconds') || 10);
const corpus=arg('corpus')||'web';
if(!['web','hunodan'].includes(corpus))throw new Error('Use --corpus=web|hunodan');
const {catalogue,readPhoto,sha256,manifestURL}=await import(corpus==='hunodan'?'./hunodan-photo-data.mjs':'./web-photo-data.mjs');
if (!['prepare', 'solve'].includes(stage) || !(seconds >= 1 && seconds <= 180)) throw new Error('Use --stage=prepare|solve and --seconds=1..180');
const data = await catalogue(), ids = arg('ids')?.split(',');
if (ids?.some(id => !data.cases.some(c => c.id === id))) throw new Error('Unknown case ID');
// Explicit diagnostic crops isolate fitting from detection; never mix their
// scores into the default automatic-crop track without labelling them.
const cropFile=arg('crop-overrides'),cropBytes=cropFile?await fs.readFile(cropFile):null,crops=cropBytes?JSON.parse(cropBytes):{};
for(const [id,quad]of Object.entries(crops)){
  if(!data.cases.some(c=>c.id===id)||!Array.isArray(quad)||quad.length!==4||!quad.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new Error(`Invalid diagnostic crop: ${id}`);
}
const output = arg('output') || `tmp/inverse-web-photos/${new Date().toISOString().replace(/[:.]/g, '-')}`;
await fs.mkdir(output, {recursive: true});
let detectHeartCrops=currentDetector,locatorReference=null;
if(arg('locator-reference')){
 const commit=execFileSync('git',['rev-parse','--verify','--end-of-options',arg('locator-reference')+'^{commit}'],{encoding:'utf8'}).trim();
 await fs.mkdir('tmp',{recursive:true});
 const directory=await fs.mkdtemp('tmp/locator-reference-'),sourceHashes={};
 const files=execFileSync('git',['ls-tree','-r','--name-only',commit,'--','static/inverse/core/crop.js','static/inverse/locator'],{encoding:'utf8'}).trim().split('\n');
 for(const file of files){
  const bytes=execFileSync('git',['show',`${commit}:${file}`],{maxBuffer:16*1024*1024});
  await fs.mkdir(`${directory}/${file.slice(0,file.lastIndexOf('/'))}`,{recursive:true});await fs.writeFile(`${directory}/${file}`,bytes);sourceHashes[file]=sha256(bytes);
 }
 const module=await fs.realpath(`${directory}/static/inverse/core/crop.js`);
 ({detectHeartCrops}=await import(pathToFileURL(module).href));locatorReference={commit,directory,sourceHashes};
}

const cfg = {...AUTOMATIC_PRESET, width: 100, timeLimit: seconds, trials: 0};
const ledger = {
  createdAt: new Date().toISOString(), gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  manifestSha256: sha256(await fs.readFile(manifestURL)), stage, corpus, cfg, locatorReference,
  methodology: cropFile?'Original source pixels, with explicitly labelled manual diagnostic crop overrides. Corners remain fixed during fitting; no template geometry enters the solver. Crop scores have different classified targets and are not directly interchangeable.':'Original source pixels and a pre-annotated rough ROI only. First automatic crop is fixed before preparation/fitting. No corrected corners or template geometry. Proposal presence and mask agreement do not establish correct cropping or ground-truth recovery.',
  ...(cropFile?{cropOverrides:{file:cropFile,sha256:sha256(cropBytes),quads:crops}}:{}),
  results: [],
};
// A commit alone does not identify an experiment run against uncommitted fixes.
// Record the actual detector, fitter and harness bytes used by this process.
const sourceFiles=execFileSync('git',['ls-files','--','static/inverse/core','static/inverse/locator','scripts/inverse/web-photo-benchmark.mjs','scripts/inverse/web-photo-data.mjs','scripts/inverse/hunodan-photo-data.mjs','scripts/inverse/export-renderer.mjs'],{encoding:'utf8'}).trim().split('\n');
ledger.sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,sha256(await fs.readFile(file))])));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save = async () => {
  const counts = {};
  for (const row of ledger.results) counts[row.status] = (counts[row.status] || 0) + 1;
  ledger.counts = counts;
  await fs.writeFile(`${output}/results.json`, JSON.stringify(ledger, null, 2));
  const rows = ledger.results.map(row => `<article><h2>${escape(row.id)}</h2><p>${escape(row.track)} · ${escape(row.detection?.cropMode || "automatic")} · ${escape(row.status)} · ${row.totalSeconds.toFixed(2)} s${row.independentError ? ` · ${(100 * row.independentError.mismatchFraction).toFixed(2)}% mask disagreement` : ''}</p><p>${escape(row.message || row.detection?.reason || '')}</p><img loading="lazy" src="${row.id}.png" alt="${escape(row.id)}: source selection, selected crop, classified mask, exported weave and difference"><p><a href="${escape(row.sourcePage)}">Source and published templates</a></p></article>`).join('\n');
  await fs.writeFile(`${output}/report.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Web-heart photograph benchmark</title><style>body{font:16px system-ui;margin:2rem;max-width:1250px}article{border-top:1px solid #bbb;padding:1rem 0}img{max-width:100%;height:auto}h2{font-size:1.1rem}</style><h1>Web-heart photograph benchmark</h1><p>${escape(ledger.methodology)}</p><p>Columns: original photograph with rough selection (blue) and proposed square (magenta), rectified photograph, estimated two-colour mask${stage === 'solve' ? ', independently rendered exported weave, disagreement on observed pixels (magenta/cyan)' : ''}. Grey pixels have no source observations. Proposals require visual review. Printed-paper decorations can invalidate the two-colour assumption.</p><p>${escape(JSON.stringify(counts))}</p>${rows}</html>`);
};

for (const entry of data.cases.filter(c => !ids || ids.includes(c.id))) {
  const photo = data.photos.find(p => p.id === entry.photo);
  const row = {id: entry.id, photo: photo.id, sourceSha256: photo.sha256, ...(photo.photoROI?{sourcePhotoROI:photo.photoROI}:{}), sourcePage: photo.sourcePage, family: photo.family, motif: entry.motif, track: entry.track, regularity: entry.regularity, roi: entry.roi, tags: photo.tags, groundTruthEvaluated: false, cropVisuallyVerified: false, status: 'input_error'};
  ledger.results.push(row);
  const started = performance.now(), panel = createCanvas(stage === 'solve' ? 1200 : 720, 240), pc = panel.getContext('2d');
  pc.fillStyle = '#ddd'; pc.fillRect(0, 0, panel.width, panel.height);
  let currentStage = 'input';
  try {
    const input = await readPhoto(photo), source = createCanvas(input.imageWidth, input.imageHeight), sc = source.getContext('2d');
    const pixels = sc.createImageData(input.imageWidth, input.imageHeight); pixels.data.set(input.rgba); sc.putImageData(pixels, 0, 0);
    const scale = Math.min(240 / source.width, 240 / source.height), dx = (240 - source.width * scale) / 2, dy = (240 - source.height * scale) / 2;
    pc.drawImage(source, dx, dy, source.width * scale, source.height * scale);
    const line = (points, color) => {pc.strokeStyle = color; pc.lineWidth = 2; pc.beginPath(); points.forEach(([x,y],i) => i ? pc.lineTo(dx + scale*x,dy + scale*y) : pc.moveTo(dx + scale*x,dy + scale*y)); pc.closePath(); pc.stroke();};
    if (entry.roi) {const [x0,y0,x1,y1] = entry.roi; line([[x0,y0],[x1,y0],[x1,y1],[x0,y1]], '#008aff');}
    currentStage = 'detection';
    const detectionStart = performance.now(), detected = detectHeartCrops(input, {roi: entry.roi || undefined});
    row.detectionSeconds = (performance.now() - detectionStart) / 1000;
    const automatic=detected.candidates[0],candidate=crops[entry.id]?{quad:crops[entry.id],needsReview:true}:automatic;
    row.detection = {status: detected.status, reason: detected.reason, count: detected.candidates.length, quad: candidate?.quad, needsReview: candidate?.needsReview, warnings: candidate?.warnings, locatorVersion: automatic?.locator.version,
      ...(crops[entry.id]?{cropMode:'manual_diagnostic',automaticQuad:automatic?.quad}:{cropMode:'automatic'})};
    if (!candidate) {row.status = 'no_crop';}
    else {
      line(candidate.quad, '#ff00a8');
      const crop = rectifyMotif({width: source.width, height: source.height, data: input.rgba}, candidate.quad.map(p => p.map(v => v - .5)), {size: 240});
      const cropPixels = pc.createImageData(240,240); cropPixels.data.set(crop.data); pc.putImageData(cropPixels,240,0);
      currentStage = 'preparation';
      const preparationStart = performance.now(), prepared = prepare({...input, quad: candidate.quad}, cfg);
      row.preparationSeconds = (performance.now() - preparationStart) / 1000;
      row.preparation = prepared.preview.metadata;
      const target = prepared.target.sourceImage, n = target.resolution;
      const paintMask = (mask, column, difference = false) => {
        const image = createCanvas(n,n), ctx = image.getContext('2d'), pixels = ctx.createImageData(n,n);
        for (let i = 0; i < n*n; i++) {
          const valid = !target.validMask || target.validMask[i];
          const color = !valid ? [130,130,130] : difference ? (mask[i] !== target.mask[i] ? (target.mask[i] ? [225,0,150] : [0,170,220]) : [245,245,245]) : (mask[i] ? [185,20,35] : [255,255,255]);
          pixels.data.set([...color,255],4*i);
        }
        ctx.putImageData(pixels,0,0); pc.drawImage(image,column*240,0,240,240);
      };
      paintMask(target.mask,2);
      row.observedFraction = target.validMask ? Array.from(target.validMask).filter(Boolean).length / (n*n) : 1;
      row.status = 'prepared_proposal';
      if (stage === 'solve') {
        currentStage = 'solving';
        const solveStart = performance.now(), answer = await design(prepared.target, cfg);
        row.solveAndValidationSeconds = (performance.now() - solveStart) / 1000;
        row.report = answer.report;
        const directory = `${output}/${entry.id}`; await fs.mkdir(directory, {recursive: true});
        for (const [file, content] of benchmarkArtifactEntries(answer.files)) await fs.writeFile(`${directory}/${file}`, content);
        currentStage = 'independent_rendering';
        const woven = await renderExportedWeave(answer.files['cut_geometry.json'], n);
        let observed = 0, mismatch = 0;
        for (let i=0; i<n*n; i++) if (!target.validMask || target.validMask[i]) {observed++; mismatch += Number(woven.mask[i] !== target.mask[i]);}
        row.independentError = {mismatchFraction: mismatch / observed, mismatchPixels: mismatch, observedPixels: observed, renderer: woven.renderer};
        paintMask(woven.mask,3); paintMask(woven.mask,4,true);
        row.status = answer.report.templateChecksPassed ? 'candidate_checks_passed' : 'candidate_needs_review';
      }
    }
  } catch (error) {row.status = `${currentStage}_error`; row.message = error.message; row.failureReport = error.report;}
  row.totalSeconds = (performance.now() - started) / 1000;
  await fs.writeFile(`${output}/${row.id}.png`, panel.toBuffer('image/png'));
  await save();
  console.log(JSON.stringify({id:row.id,status:row.status,seconds:row.totalSeconds,maskError:row.independentError?.mismatchFraction}));
}
console.log(`Report: ${output}/report.html`);
