/** Diagnose paper-lattice sensitivity using already fitted crop perturbations.
 * This continuation experiment is not a fresh end-to-end speed benchmark.
 * It neither changes source pixels nor supplies a published cutting template.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves,fittingMargin} from '../../static/inverse/core/direct/refine.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const run=args.run||'tmp/heart-learning/foreground-locator-v1/new-perturbations';
const output=args.output||'tmp/heart-learning/near-miss-paper-v1';
const ids=(args.ids||'crop-x-plus-1,crop-y-plus-1').split(','),steps=Number(args.steps||160);
assert.ok(Number.isInteger(steps)&&steps>0&&steps<=1000);
await fs.mkdir(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const benchmarkBytes=await fs.readFile(run+'/results.json'),benchmark=JSON.parse(benchmarkBytes);
assert.equal(benchmark.targetMode,'photo');
const sourceHashes={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file='static/inverse/core/'+name;sourceHashes[file]=sha(await fs.readFile(file));
}
for(const file of ['scripts/inverse/near-miss-paper-study.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/hard-photo-data.mjs'])sourceHashes[file]=sha(await fs.readFile(file));
const report={run,benchmarkSha256:sha(benchmarkBytes),sourceHashes,steps,
  method:'Independent fixed-iteration continuations of frozen image-derived templates. Same source photograph, fixed crop, mask, probabilities and cut counts. Compare paper lattice resolutions and optimization image resolutions; independently render the resulting exported geometry.',rows:[]};
await loadNumericalKernel();
for(const variant of ids){
  const entry=benchmark.results.find(row=>row.id.endsWith('--'+variant));assert.ok(entry,variant);
  assert.ok(entry.variant.dx||entry.variant.dy,'Only unmodified source-photo crop translations are supported.');
  const previous=entry.runs.find(row=>row.preset==='automatic'),cfg=settings({...previous.settings,preferMatchingSheets:false});
  const photo=await readHardPhoto(entry),input=prepare({...photo,quad:entry.effectiveQuad},cfg).target,source=input.sourceImage;
  assert.equal(photo.fileSha256,entry.input.fileSha256);assert.equal(photo.rgbaSha256,entry.input.rgbaSha256);
  assert.equal(sha(source.mask),previous.fittingMaskSha256);
  assert.equal(sha(new Uint8Array(source.probability.buffer)),previous.fittingProbabilitySha256);
  const bytes=await fs.readFile(`${run}/${entry.id}/automatic/cut_geometry.json`),solution=loadSolutionJSON(bytes.toString()),phase=solution.graph.target.phase?-1:1;
  const paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(curve=>curve.p)));
  const baseline=await renderExportedWeave(bytes.toString(),source.resolution);
  for(const materialResolution of [360,700])for(const imageResolution of [256,source.resolution]){
    const started=performance.now(),graph=new CurveGraph(paths,cfg.width),options={...cfg,materialResolution};
    const objective=resizeObjective(source.probability,source.resolution,imageResolution);
    const result=refineCurves(graph,objective.probability,imageResolution,phase,options,{input,steps,rate:.008,selection:'mask'});
    const fitted=graph.solution(result.points,phase,input),geometry=validate(fitted,options,{checkImage:false});
    const paper=geometry.passed?materialAudit(fitted,options).summary:null;
    const replay=await renderExportedWeave(solutionJSON(fitted),source.resolution);
    const row={id:entry.id,materialResolution,imageResolution,steps:result.steps,counts:paths.map(f=>f.length),
      baselineError:mismatch(baseline.mask,source.mask),error:mismatch(replay.mask,source.mask),
      features:auditFeatureFidelity(source,replay.mask,options),geometry,paper,
      fittingMarginMm:fittingMargin(options,cfg.width),seconds:(performance.now()-started)/1000,history:result.history,
      maskSha256:sha(source.mask),probabilitySha256:sha(new Uint8Array(source.probability.buffer)),geometrySha256:sha(bytes),quad:entry.effectiveQuad};
    report.rows.push(row);
    const name=`${variant}-paper-${materialResolution}-image-${imageResolution}`;
    await fs.writeFile(`${output}/${name}.json`,JSON.stringify(solutionJSON(fitted)));
    await fs.writeFile(`${output}/${name}.png`,replay.png);
    await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify({id:row.id,materialResolution,imageResolution,error:row.error,geometry:geometry.passed,paper:paper?.status,features:row.features.passed,seconds:row.seconds}));
  }
}
