/** Offline diagnostic, not a production count-search policy. Every start is
 * freshly derived from one frozen photograph/crop. Changing the DP resolution
 * changes row quantization and spline projection, not the final target.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {gridInitializer,borderGrid} from '../../static/inverse/core/direct/initialize.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {gridModel,gridMask,gridControls,gridPaths,fitGrid,mismatch} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {fittingMargin,refineCurves} from '../../static/inverse/core/direct/refine.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const output=args.output||'tmp/heart-learning/initializer-resolution-v1';
const resolutions=(args.resolutions||'88,92,94,96,98,100,104').split(',').map(Number);
const offset=(args.offset||'0,1').split(',').map(Number),counts=[3,3],phase=1,k=16,n=256;
assert.ok(resolutions.every(v=>Number.isInteger(v)&&v>=64&&v<=160));
assert.ok(offset.length===2&&offset.every(Number.isFinite));
await fs.mkdir(output,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
const quad=fixture.quad.map(p=>p.map((v,i)=>v+offset[i]));
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,preferMatchingSheets:false});
const input=prepare({...photo,quad},cfg).target,source=input.sourceImage,size=source.resolution;
const features=imageFeatures(source,cfg.width),missed=features.findIndex(f=>f.areaMm2<40&&f.centerMm[0]>50&&f.centerMm[1]>50);
assert.ok(missed>=0,'The frozen diagnostic opening must still be present');
const fullWeights=new Float64Array(size*size).fill(1/16);
for(const pixel of features[missed].pixels)fullWeights[pixel]=1;
const original=resizeObjective(source.probability,size,n),weighted=resizeObjective(source.probability,size,n,fullWeights);
const gridTarget=resizeObjective(source.probability,size,96).probability,evidence=borderEvidence(source.probability,size);
const audit=seed=>auditImageFeatures(source,gridMask(seed.model,size,phase,seed.floor),cfg.width,features);
const faithful=seed=>auditFeatureFidelity(source,gridMask(seed.model,size,phase,seed.floor),cfg,features).passed;
const sourceHashes={};
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){
  const file='static/inverse/core/'+name;sourceHashes[file]=sha(await fs.readFile(file));
}
for(const file of ['scripts/inverse/initializer-resolution-study.mjs','scripts/inverse/fixtures/photographic-near-miss-seed.json','scripts/inverse/export-renderer.mjs'])sourceHashes[file]=sha(await fs.readFile(file));
const rows=[],ledger={method:'Fresh fixed-count/phase diagnostic; only row-DP initialization resolution varies. All candidates use the same original probability/mask, 16 controls, 18 DP rounds, 150 near-miss/fine/clearance steps and 750 free-curve steps with no deadlines. This is not a full count search, production solve, 10-second benchmark or ground-truth reconstruction. No saved geometry is read. Standard cleanup and final sharing are not applied.',fixture,quad,offset,counts,phase,k,cfg,sourceHashes,maskSha256:sha(source.mask),probabilitySha256:sha(new Uint8Array(source.probability.buffer)),features:features.map(({pixels,...rest})=>({...rest,pixelCount:pixels.length})),rows};
await loadNumericalKernel();
const refloor=(seed,floor)=>{
  const {model}=seed,controls=gridControls(model,seed.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;
    for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((a,b)=>a+b,0);
    for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
};
for(const resolution of resolutions){
  const at=performance.now(),fitter=gridInitializer(source.probability,size,{weights:fullWeights});
  const raw=gridModel(counts,k);raw.z.fill(0);
  const choices=[{model:raw,phase,floor:.008,steps:0,kind:'raw-uniform'}];
  const starts=[{kind:'uniform',initial:null},{kind:'border',initial:borderGrid(counts,evidence,{k})?.z},{kind:'separable',initial:fitter.separable(counts,phase,{k}).z}];
  for(const {kind,initial} of starts.filter(s=>s.initial!==undefined))choices.push({...fitter.initialize(counts,phase,{resolution,k,initial,scoreResolution:96,rounds:18}),kind});
  for(const seed of choices){
    seed.weightedError=mismatch(gridMask(seed.model,n,phase,seed.floor),weighted.probability,weighted.weights);
    seed.error=mismatch(gridMask(seed.model,n,phase,seed.floor),original.probability);
    seed.audit=audit(seed);
  }
  choices.sort((a,b)=>a.weightedError-b.weightedError);
  const summary=seed=>({kind:seed.kind,error:seed.error,weightedError:seed.weightedError,featuresPassed:seed.audit.passed,retention:seed.audit.regions.map(r=>r.retainedFraction),steps:seed.steps});
  const row={resolution,choices:choices.map(summary)},cutoff=Math.min(.1,3*cfg.maxImageError);
  const eligible=seed=>seed.audit.passed&&seed.error<=Math.min(.12,4*cfg.maxImageError);
  // Respect the existing winning start before considering an eligible
  // runner-up at these same counts. All qualifying/rejected trials are saved.
  const initial=eligible(choices[0])?choices[0]:choices.slice(1).filter(eligible).sort((a,b)=>a.error-b.error)[0];
  if(!initial){row.status='no_colour_retaining_start';}
  else{
    row.selected=summary(initial);let seed=initial;
    if(seed.error>cutoff){
      seed=fitGrid(original.probability,n,counts,phase,{k,initial:seed.model.z,floor:seed.floor,optimizationTarget:gridTarget,steps:150,preferCheckpoint:r=>audit(r).passed});
      row.nearMiss={error:seed.error,featuresPassed:audit(seed).passed,steps:seed.steps};
    }
    if(seed.error>cutoff||!audit(seed).passed)row.status='coarse_cutoff';
    else{
      const fine=fitGrid(original.probability,n,counts,phase,{k,initial:seed.model.z,optimizationTarget:gridTarget,steps:150,preferCheckpoint:faithful});
      if(fine.error<seed.error)seed=fine;
      row.fine={error:seed.error,featuresPassed:faithful(seed)};
      const floor=fittingMargin(cfg,cfg.width)/cfg.width;
      const clear=fitGrid(original.probability,n,counts,phase,{k,initial:refloor(seed,floor),floor,clearance:floor+.0015,optimizationTarget:gridTarget,steps:150,preferCheckpoint:r=>audit(r).passed});
      row.clearance={error:clear.error,featuresPassed:audit(clear).passed};
      const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
      const fit=refineCurves(graph,original.probability,n,phase,cfg,{input,steps:750,rate:.05,preferCheckpoint:(_candidate,solution)=>auditFeatureFidelity(source,sampleWeave(solution,size),cfg,features).passed});
      const solution=graph.solution(fit.points,phase,input),encoded=solutionJSON(solution);
      const rendered=await renderExportedWeave(encoded,size),error=mismatch(rendered.mask,source.mask);
      const geometry=validate(solution,cfg,{checkImage:false}),paper=materialAudit(solution,cfg).summary,featureCheck=auditFeatureFidelity(source,rendered.mask,cfg,features);
      const fineSize=2*size,fineMask=Uint8Array.from({length:fineSize*fineSize},(_,i)=>source.mask[Math.floor(Math.floor(i/fineSize)/2)*size+Math.floor((i%fineSize)/2)]);
      const fineRender=await renderExportedWeave(encoded,fineSize),fineError=mismatch(fineRender.mask,fineMask),fineFeatures=auditFeatureFidelity({resolution:fineSize,mask:fineMask},fineRender.mask,cfg);
      row.fit={error,fineError,features:featureCheck,fineFeatures,geometry,paper,steps:fit.steps,edges:graph.edges.length,history:fit.history};
      row.status=error<=cfg.maxImageError&&fineError<=cfg.maxImageError&&featureCheck.passed&&fineFeatures.passed&&geometry.passed&&paper.status==='pass'?'pass':'rejected';
      await fs.writeFile(`${output}/dp-${resolution}.json`,JSON.stringify(encoded));
      await fs.writeFile(`${output}/dp-${resolution}.png`,rendered.png);
    }
  }
  row.seconds=(performance.now()-at)/1000;rows.push(row);
  await fs.writeFile(output+'/results.json',JSON.stringify(ledger,null,2));
  console.log(JSON.stringify({resolution,status:row.status,selected:row.selected,nearMiss:row.nearMiss,error:row.fit?.error,fineError:row.fit?.fineError,features:row.fit?.features.passed,paper:row.fit?.paper.status,seconds:row.seconds}));
}
