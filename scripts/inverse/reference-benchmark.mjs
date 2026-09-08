/** Blind raster reconstruction, followed by evaluation against published cuts.
 * Reference geometry never enters prepare/design. All failures remain in the ledger.
 */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from 'canvas';
import { referenceEnvironment, compareCutPaths, cutOverlay } from './reference.mjs';
import { renderExportedWeave } from './export-renderer.mjs';
import { prepare, design, inspectSaved } from '../../static/inverse/core/engine.js';
import { GENERAL_PRESET, MATCHING_GRID_PRESET } from '../../src/lib/inverse/presets.js';
const arg = name => process.argv.find(s => s.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const output = arg('output') || `tmp/inverse-reference/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const ids = arg('ids')?.split(',') || JSON.parse(await fs.readFile('src/lib/data/hearts.json')).categories.flatMap(c => c.hearts);
const seconds = Number(arg('seconds') || 5);
const profiles = { general: GENERAL_PRESET, 'matching-grid': MATCHING_GRID_PRESET };
const selectedProfiles = arg('profiles')?.split(',') || Object.keys(profiles);
const env = await referenceEnvironment(), results = [];
await fs.mkdir(output, { recursive: true });
const criteria = { imageMismatchFraction: .01, cutMeanMm: .25, cutMaximumUpperMm: 1, unmatchedSlits: 0 };
const save = async () => fs.writeFile(`${output}/results.json`, JSON.stringify({ output, ids, criteria, seconds, profiles, solverInput: 'Only RGBA pixels rendered from the published woven overlap; no curve ownership, saved solutions or reference connectors.', results }, null, 2));
try {
  for (const id of ids) {
    let reference;
    try { reference = await env.load(id, 600); }
    catch (e) { results.push({ id, status: 'reference_import_failed', error: e.message }); await save(); continue; }
    await fs.writeFile(`${output}/${id}-input.png`, reference.png);
    const variants = [{ name: 'clean', input: reference.input }];
    if (arg('perturb') === 'true') {
      const original = await loadImage(reference.png);
      for (const [name, size, dx, dy, quality] of [['shift-x-half',600,.5,0],['shift-y-half',600,0,.5],['shift-both-half',600,-.5,-.5],['resize-450',450,0,0],['resize-400',400,0,0],['jpeg-95',600,0,0,.95]]) {
        const canvas = createCanvas(size,size), c = canvas.getContext('2d');
        c.fillStyle = 'white'; c.fillRect(0,0,size,size); c.drawImage(original,dx,dy,size,size);
        if (quality) c.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality})),0,0);
        variants.push({ name, input: { type:'pixels', rgba:c.getImageData(0,0,size,size).data, imageWidth:size, imageHeight:size } });
      }
      for (const [name, amplitude] of [['noise-4',4],['noise-12',12]]) {
        let seed=1729; const rgba=new Uint8ClampedArray(reference.input.rgba);
        for(let i=0;i<rgba.length;i++) if(i%4!==3) { seed=(1664525*seed+1013904223)>>>0; rgba[i]+=amplitude*(2*seed/4294967296-1); }
        variants.push({name,input:{...reference.input,rgba}});
      }
    }
    for (const [variantIndex, variant] of variants.entries()) for (const profile of selectedProfiles) {
      const cfg = { ...profiles[profile], timeLimit: seconds, trials:0, roundHidden:false };
      const row = { id, variant:variant.name, profile, sourceSha256: reference.sourceSha256, pixelSha256:createHash('sha256').update(variant.input.rgba).digest('hex'), settings:cfg };
      const stem = `${output}/${id}-${variant.name}-${profile}`;
      if (variantIndex===0) {
        const audit=inspectSaved(JSON.stringify(reference.cuts),cfg);
        row.referenceAudit={pass:audit.report.templateChecksPassed,issues:audit.report.validation.issues,paper:audit.report.manufacturing.status};
        const alignment=await renderExportedWeave(reference.cuts,600);
        row.referenceRendererMismatchFraction=alignment.mask.reduce((s,c,i)=>s+Number(c!==Number(reference.input.rgba[4*i]<128)),0)/alignment.mask.length;
      }
      try {
        const {target}=prepare(variant.input,cfg);
        const result=await design(target,cfg);
        const exported=JSON.parse(result.files['cut_geometry.json']);
        const independent=await renderExportedWeave(exported,target.sourceImage.resolution);
        row.independentImageError=independent.mask.reduce((s,c,i)=>s+Number(c!==target.sourceImage.mask[i]),0)/independent.mask.length;
        row.paths=compareCutPaths(exported,reference.cuts);
        row.geometryPass=result.report.validation.passed; row.paper=result.report.manufacturing.status;
        row.exportAllowed=result.report.templateChecksPassed;
        row.pass=row.exportAllowed&&row.independentImageError<=criteria.imageMismatchFraction&&row.paths.unmatchedSlits===0&&row.paths.symmetricMeanMm<=criteria.cutMeanMm&&row.paths.sampledMaximumMm+row.paths.maximumSamplingErrorBoundMm<=criteria.cutMaximumUpperMm;
        row.status=row.pass?'reference_quality_pass':'reference_quality_failed';
        await fs.writeFile(`${stem}-cuts.json`,JSON.stringify(exported,null,2));
        await fs.writeFile(`${stem}-report.json`,JSON.stringify(result.report,null,2));
        await fs.writeFile(`${stem}-overlay.svg`,cutOverlay(exported,reference.cuts));
        await fs.writeFile(`${stem}-render.png`,independent.png);
      } catch(e) { row.status='reconstruction_failed'; row.error=e.message; row.solver=e.report||null; }
      results.push(row); await save(); console.log(JSON.stringify({id,variant:variant.name,profile,status:row.status,error:row.error,imageError:row.independentImageError,cutMean:row.paths?.symmetricMeanMm,cutMax:row.paths?.sampledMaximumMm}));
    }
  }
} finally { await save(); await env.close(); }
console.log(output);
